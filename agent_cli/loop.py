from __future__ import annotations

import asyncio
import json
import os
import signal
import time
import subprocess
import uuid
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple
import re

from agents import RunContextWrapper

from .permissions import AppContext, SAFE_TOOLS
from .prompt_loader import (
    load_system_prompt,
    load_system_prompt_blocks,
    load_compaction_prompt,
    load_base_prompts,
    select_base_prompt,
    load_mcp_cli_block,
    load_plan_mode_prompt,
    load_attribution_header,
)
from .tool_specs import build_openai_tools, stringify_tool_result
from .tools import RAW_TOOL_MAP


DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.2")
SYSTEM_REMINDER_RE = re.compile(r"^<system-reminder>\\n?([\\s\\S]*?)\\n?</system-reminder>$")
SYSTEM_REMINDER_STRIP_RE = re.compile(r"<system-reminder>[\\s\\S]*?</system-reminder>")
_TRANSCRIPT_META_CACHE: Dict[str, Dict[str, Any]] = {}
_SUBAGENT_TOOL_MAP_CACHE: Dict[str, Dict[str, Dict[str, Any]]] = {}


@dataclass
class LoopConfig:
    backend: str = "openai"
    model: str = DEFAULT_MODEL
    fallback_model: Optional[str] = None
    temperature: Optional[float] = None
    max_context_chars: int = 200_000
    auto_compact_chars: int = 180_000
    micro_compact_keep_last_tools: int = 3
    micro_tool_result_chars: int = 4000
    enable_streaming: bool = False
    enable_compaction: bool = True
    tool_log_path: Optional[str] = None
    tool_log_max_chars: int = 10_000
    trace_log_path: Optional[str] = None
    trace_log_max_chars: int = 10_000
    custom_system_prompt: Optional[str] = None
    append_system_prompt: Optional[str] = None
    non_interactive: bool = False
    claude_sdk_preset: Optional[str] = None
    claude_sdk_tools_preset: Optional[str] = None
    claude_sdk_cli_path: Optional[str] = None
    claude_sdk_settings: Optional[str] = None
    claude_sdk_stream: bool = False
    claude_sdk_compat: bool = False
    claude_sdk_hooks: bool = False
    claude_sdk_permission_callback: bool = False
    claude_sdk_auto_continue: bool = False
    strip_system_reminders_in_tool_results: bool = False
    attribution_header: Optional[str] = None
    mcp_clients: Optional[List[Dict[str, Any]]] = None
    mcp_instructions: Optional[str] = None


@dataclass
class LoopState:
    messages: List[Dict[str, Any]] = field(default_factory=list)
    pending_steering: List[Dict[str, Any]] = field(default_factory=list)
    compaction_turns: int = 0


def _is_litellm_model(model: Optional[str]) -> bool:
    return bool(model) and model.lower().startswith("litellm/")


def _litellm_model_name(model: str) -> str:
    return model.split("/", 1)[1] if "/" in model else model


def _needs_openai_client(config: LoopConfig) -> bool:
    candidates = [config.model, config.fallback_model]
    return any(model and not _is_litellm_model(model) for model in candidates)


def _estimate_chars(messages: Iterable[Dict[str, Any]]) -> int:
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            for part in content:
                total += len(str(part))
        else:
            total += len(str(content))
    return total


def _auto_allow_list(context: AppContext) -> str:
    perms = context.permissions
    if perms.mode == "allow" or perms.auto_approve:
        return "all tools"
    if perms.mode == "deny":
        return "none"
    return ", ".join(sorted(SAFE_TOOLS))


def _model_display_name(model_id: str) -> str:
    if not model_id:
        return "unknown"
    lowered = model_id.lower()
    if "claude-opus-4-5" in lowered:
        return "Opus 4.5"
    if "claude-sonnet-4-5" in lowered:
        return "Sonnet 4.5"
    if "claude-haiku" in lowered:
        return "Haiku"
    return model_id


def _ensure_prompt_model_env(model_id: Optional[str]) -> None:
    if not model_id:
        return
    display = _model_display_name(model_id)
    os.environ.setdefault("MODEL_ID", model_id)
    os.environ.setdefault("MODEL_DISPLAY_NAME", display)
    os.environ.setdefault("CLAUDE_MODEL_ID", model_id)
    os.environ.setdefault("CLAUDE_MODEL_DISPLAY_NAME", display)


def _ensure_scratchpad_path(context: AppContext) -> Optional[str]:
    existing = context.system_context.get("scratchpad_path")
    if isinstance(existing, str) and existing.strip():
        return existing.strip()
    root_slug = str(context.root_dir.resolve()).replace("/", "-").replace("_", "-")
    scratchpad = Path("/private/tmp/claude") / root_slug / str(uuid.uuid4()) / "scratchpad"
    try:
        scratchpad.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    context.system_context["scratchpad_path"] = str(scratchpad)
    return str(scratchpad)


def _build_git_status_block(root_dir: Path) -> Optional[str]:
    if not (root_dir / ".git").exists():
        return None

    def _run_git(args: List[str]) -> str:
        try:
            result = subprocess.run(
                ["git", "--no-optional-locks", *args],
                cwd=root_dir,
                capture_output=True,
                text=True,
                timeout=5,
            )
        except Exception:
            return ""
        if result.returncode != 0:
            return ""
        return (result.stdout or "").strip()

    branch = _run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    main_branch = ""
    raw_default = _run_git(["symbolic-ref", "refs/remotes/origin/HEAD"])
    if raw_default:
        main_branch = raw_default.rsplit("/", 1)[-1]
    status = _run_git(["status", "--porcelain", "-uall"])
    if not status:
        status = "(clean)"
    commits = _run_git(["log", "-5", "--oneline"])
    block = (
        "gitStatus: This is the git status at the start of the conversation. "
        "Note that this status is a snapshot in time, and will not update during the conversation.\n"
        f"Current branch: {branch}\n\n"
        f"Main branch (you will usually use this for PRs): {main_branch}\n\n"
        "Status:\n"
        f"{status}\n\n"
        "Recent commits:\n"
        f"{commits}"
    )
    return block.strip()


def _map_permission_mode_to_claude(mode: str, auto_approve: bool) -> str:
    if mode == "allow":
        return "bypassPermissions"
    if mode == "plan":
        return "plan"
    if mode == "deny":
        return "plan"
    if auto_approve:
        return "acceptEdits"
    return "default"


def _format_system_context_block(system_context: Dict[str, str]) -> str:
    if not system_context:
        return ""
    filtered = {k: v for k, v in system_context.items() if k != "scratchpad_path"}
    if not filtered:
        return ""
    return "\n".join(f"{key}: {value}" for key, value in filtered.items()).strip()


def _append_system_context(system_prompt: str, system_context: Dict[str, str]) -> str:
    if not system_context:
        return system_prompt
    context_block = _format_system_context_block(system_context)
    if not context_block:
        return system_prompt
    return "\n\n".join([system_prompt, context_block])


def _append_system_context_blocks(
    parts: List[str],
    system_context: Dict[str, str],
) -> List[str]:
    context_block = _format_system_context_block(system_context)
    if not context_block:
        return parts
    return [p for p in parts if p] + [context_block]


def _apply_claude_sdk_structured_system_prompt(
    options: Any,
    system_blocks: List[str],
    config: LoopConfig,
) -> bool:
    if not system_blocks:
        return False
    system_payload = [{"type": "text", "text": block} for block in system_blocks if block]
    if not system_payload:
        return False
    extra_body = {"system": system_payload}
    existing_raw = None
    if hasattr(options, "env") and isinstance(options.env, dict):
        existing_raw = options.env.get("CLAUDE_CODE_EXTRA_BODY")
    if not existing_raw:
        existing_raw = os.environ.get("CLAUDE_CODE_EXTRA_BODY")
    if existing_raw:
        try:
            parsed = json.loads(existing_raw)
        except Exception as exc:
            _append_trace_log(
                config,
                {
                    "type": "warning",
                    "timestamp": time.time(),
                    "backend": "claude-sdk",
                    "message": f"Invalid CLAUDE_CODE_EXTRA_BODY JSON; leaving it unchanged: {exc}",
                },
            )
            return False
        if not isinstance(parsed, dict):
            _append_trace_log(
                config,
                {
                    "type": "warning",
                    "timestamp": time.time(),
                    "backend": "claude-sdk",
                    "message": "CLAUDE_CODE_EXTRA_BODY is not a JSON object; leaving it unchanged.",
                },
            )
            return False
        parsed.update(extra_body)
        extra_body = parsed
    if not hasattr(options, "env") or options.env is None:
        options.env = {}
    options.env["CLAUDE_CODE_EXTRA_BODY"] = json.dumps(extra_body)
    return True


def _wrap_user_context(messages: List[Dict[str, Any]], user_context: Dict[str, str]) -> List[Dict[str, Any]]:
    if not user_context:
        return messages
    entries = "\n".join(f"# {key}\n{value}" for key, value in user_context.items())
    reminder = (
        "<system-reminder>\n"
        "As you answer the user's questions, you can use the following context:\n"
        f"{entries}\n\n"
        "IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.\n"
        "</system-reminder>"
    )
    return [{"role": "user", "content": reminder, "isMeta": True}] + messages


def _user_context_reminder(user_context: Dict[str, str]) -> str:
    if not user_context:
        return ""
    entries = "\n".join(f"# {key}\n{value}" for key, value in user_context.items())
    if not entries:
        return ""
    return (
        "<system-reminder>\n"
        "As you answer the user's questions, you can use the following context:\n"
        f"{entries}\n\n"
        "IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.\n"
        "</system-reminder>"
    )


def _build_user_prompt_parts(
    user_input: str, context: AppContext, include_reminders: bool
) -> List[str]:
    parts: List[str] = []
    if include_reminders and (context.permissions.mode or "").lower() == "plan":
        plan_text = _plan_mode_prompt(context.root_dir)
        if plan_text:
            parts.append(_wrap_system_reminder(plan_text))
    if include_reminders:
        reminder = _user_context_reminder(context.user_context)
        if reminder:
            parts.append(reminder)
    parts.append(user_input)
    return [part for part in parts if part]


def _build_user_prompt(user_input: str, context: AppContext, include_reminders: bool) -> str:
    return "\n\n".join(_build_user_prompt_parts(user_input, context, include_reminders))


def _wrap_system_reminder(text: str) -> str:
    return (
        "<system-reminder>\n"
        f"{text}\n"
        "</system-reminder>"
    )


def _build_claude_sdk_user_blocks(
    user_input: str,
    context: AppContext,
    include_reminders: bool,
    pending_interruption: Optional[str],
) -> Tuple[List[Dict[str, Any]], str]:
    parts = _build_user_prompt_parts(user_input, context, include_reminders)
    if pending_interruption:
        truncated = pending_interruption
        if len(truncated) > 8000:
            truncated = truncated[:8000].rstrip() + "\n...[truncated]"
        resume_note = _wrap_system_reminder(
            "Previous response was interrupted by the user. Continue from where it left off.\n"
            "Do NOT repeat the partial response. Resume immediately after it.\n\n"
            f"PARTIAL RESPONSE:\n{truncated}"
        )
        parts = [resume_note] + parts
    prompt_text = "\n\n".join(parts)
    content_blocks = [{"type": "text", "text": part} for part in parts]
    return content_blocks, prompt_text


async def _claude_sdk_prompt_stream(
    content_blocks: List[Dict[str, Any]],
) -> Any:
    yield {
        "type": "user",
        "message": {"role": "user", "content": content_blocks},
        "parent_tool_use_id": None,
    }


def _plan_file_path() -> Path:
    config_dir = Path(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude")).expanduser()
    plans_dir = config_dir / "plans"
    return plans_dir


def _plan_file_id() -> str:
    plan_id = os.environ.get("CLAUDE_PLAN_ID", "").strip()
    if plan_id:
        return plan_id
    return "plan"


def _plan_mode_prompt(root_dir: Path) -> str:
    plan_file = _plan_file_path() / f"{_plan_file_id()}.md"
    plan_exists = plan_file.exists()
    return load_plan_mode_prompt(str(plan_file), plan_exists)


def _inject_plan_mode(messages: List[Dict[str, Any]], root_dir: Path, mode: str) -> List[Dict[str, Any]]:
    if (mode or "").lower() != "plan":
        return messages
    plan_text = _plan_mode_prompt(root_dir)
    if not plan_text:
        return messages
    reminder = _wrap_system_reminder(plan_text)
    return [{"role": "user", "content": reminder, "isMeta": True}] + messages


def _build_system_prompt_blocks(context: AppContext, config: LoopConfig) -> List[str]:
    _ensure_prompt_model_env(config.model)
    scratchpad_path = _ensure_scratchpad_path(context)
    if scratchpad_path:
        os.environ.setdefault("CLAUDE_SCRATCHPAD_PATH", scratchpad_path)
    base_prompts = load_base_prompts()
    base_prompt = select_base_prompt(
        base_prompts,
        config.non_interactive,
        bool(config.append_system_prompt),
    )
    attribution = (config.attribution_header or "").strip() or load_attribution_header()
    default_blocks = load_system_prompt_blocks(
        context.root_dir,
        _auto_allow_list(context),
        include_base=False,
        mcp_clients=config.mcp_clients,
        mcp_instructions=config.mcp_instructions,
    )
    git_status = _build_git_status_block(context.root_dir)
    if git_status:
        default_blocks.append(git_status)
    custom = config.custom_system_prompt.strip() if config.custom_system_prompt else ""
    append = config.append_system_prompt.strip() if config.append_system_prompt else ""
    system_blocks = [custom] if custom else list(default_blocks)
    if append:
        system_blocks.append(append)
    mcp_cli = load_mcp_cli_block()
    parts = [p for p in [attribution, base_prompt, *system_blocks, mcp_cli] if p]
    normalized: List[str] = []
    for i, part in enumerate(parts):
        if i == 0 or part.startswith("gitStatus:") or part.startswith("\n"):
            normalized.append(part)
        else:
            normalized.append("\n" + part)
    return normalized


def _build_system_prompt(context: AppContext, config: LoopConfig) -> str:
    parts = _build_system_prompt_blocks(context, config)
    return "\n\n".join([p.strip() for p in parts if p and p.strip()]).strip()


def _micro_compact(state: LoopState, config: LoopConfig) -> Optional[Dict[str, Any]]:
    if _estimate_chars(state.messages) <= config.max_context_chars:
        return None
    tool_messages = [m for m in state.messages if m.get("role") == "tool"]
    if not tool_messages:
        return None
    keep = set(tool_messages[-config.micro_compact_keep_last_tools :])
    replaced = 0
    for msg in state.messages:
        if msg.get("role") != "tool":
            continue
        if msg in keep:
            content = msg.get("content", "")
            if isinstance(content, str) and len(content) > config.micro_tool_result_chars:
                msg["content"] = content[: config.micro_tool_result_chars] + "...[truncated]"
            continue
        msg["content"] = "[tool result omitted due to micro-compaction]"
        replaced += 1
    if replaced:
        return {"systemMessage": f"Micro-compaction replaced {replaced} tool results."}
    return None


def _should_auto_compact(state: LoopState, config: LoopConfig) -> bool:
    if not config.enable_compaction:
        return False
    return _estimate_chars(state.messages) >= config.auto_compact_chars


def _compaction_prompts() -> Tuple[str, str]:
    system_prompt, user_prompt = load_compaction_prompt()
    if not user_prompt:
        user_prompt = "Summarize the conversation so far.\n\nConversation transcript:\n"
    return system_prompt, user_prompt


def _render_transcript(messages: Iterable[Dict[str, Any]]) -> str:
    parts = []
    for msg in messages:
        role = msg.get("role")
        if role == "tool":
            tool_id = msg.get("tool_call_id", "")
            content = msg.get("content", "")
            parts.append(f"[tool:{tool_id}] {content}")
        else:
            content = msg.get("content", "")
            parts.append(f"[{role}] {content}")
    return "\n".join(parts)


async def _compact(state: LoopState, client: Any, config: LoopConfig) -> None:
    system_prompt, user_prompt = _compaction_prompts()
    transcript = _render_transcript(state.messages)
    prompt = user_prompt + "\n" + transcript
    response = await _model_call(
        client,
        config,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        tools=None,
    )
    message = _get_message(response)
    summary = _message_content(message)
    _append_trace_log(
        config,
        {
            "type": "compaction",
            "timestamp": time.time(),
            "summary": _truncate_nested(summary, config.trace_log_max_chars),
        },
    )
    state.messages = [
        {"role": "system", "content": "[COMPACTED CONTEXT]"},
        {"role": "assistant", "content": summary},
    ]
    state.compaction_turns += 1


def _get_message(response: Any) -> Any:
    if response is None:
        return None
    choices = getattr(response, "choices", None)
    if choices is None and isinstance(response, dict):
        choices = response.get("choices")
    if not choices:
        return None
    first = choices[0]
    if isinstance(first, dict):
        return first.get("message") or first.get("delta")
    return getattr(first, "message", None) or getattr(first, "delta", None)


def _message_content(message: Any) -> str:
    if message is None:
        return ""
    if isinstance(message, dict):
        return message.get("content") or ""
    return getattr(message, "content", "") or ""


def _assistant_blocks_text(blocks: Any) -> str:
    if not blocks:
        return ""
    parts: List[str] = []
    for block in blocks:
        text = ""
        if isinstance(block, dict):
            if block.get("type") == "text":
                text = str(block.get("text") or "")
        else:
            text = getattr(block, "text", "") or ""
        if text:
            parts.append(text)
    return "".join(parts)


def _extract_stream_text(event: Any) -> str:
    if not isinstance(event, dict):
        return ""
    delta = event.get("delta")
    if isinstance(delta, dict):
        if "text" in delta and isinstance(delta["text"], str):
            return delta["text"]
        inner_delta = delta.get("delta")
        if isinstance(inner_delta, dict) and isinstance(inner_delta.get("text"), str):
            return inner_delta["text"]
    if isinstance(event.get("text"), str):
        return event["text"]
    return ""


def _tool_target(tool_name: str, tool_input: Dict[str, Any]) -> str:
    if not isinstance(tool_input, dict):
        return tool_name
    for key in ("path", "file_path", "filepath", "filename", "directory", "dir", "pattern", "glob"):
        value = tool_input.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list) and value:
            return ", ".join(str(item) for item in value)
    command = tool_input.get("command") or tool_input.get("cmd")
    if isinstance(command, str) and command.strip():
        return command.strip()
    return tool_name


def _hook_value(obj: Any, key: str) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _infer_agent_id_from_path(path_value: Any) -> Optional[str]:
    if not isinstance(path_value, str) or not path_value:
        return None
    name = Path(path_value).name
    if name.startswith("agent-") and name.endswith(".jsonl"):
        return name[len("agent-") : -len(".jsonl")]
    return None


def _infer_subagent_label(prompt: str) -> Optional[str]:
    if not isinstance(prompt, str):
        return None
    text = prompt.strip()
    if not text:
        return None
    first = text.split()[0].strip(":,-")
    if not first:
        return None
    if len(first) > 24:
        return None
    if not re.match(r"^[A-Za-z][A-Za-z0-9_-]*$", first):
        return None
    return first


def _load_subagent_meta_from_transcript(path_value: Any, max_chars: int) -> Dict[str, Any]:
    if not isinstance(path_value, str) or not path_value:
        return {}
    if path_value in _TRANSCRIPT_META_CACHE:
        return _TRANSCRIPT_META_CACHE[path_value]
    meta: Dict[str, Any] = {}
    try:
        path = Path(path_value).expanduser()
        if not path.exists():
            _TRANSCRIPT_META_CACHE[path_value] = meta
            return meta
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if obj.get("type") != "user":
                    continue
                message = obj.get("message", {}) if isinstance(obj.get("message"), dict) else {}
                content = message.get("content")
                prompt = ""
                if isinstance(content, str):
                    prompt = content.strip()
                elif isinstance(content, list):
                    parts: List[str] = []
                    for part in content:
                        if isinstance(part, str):
                            parts.append(part)
                        elif isinstance(part, dict) and isinstance(part.get("text"), str):
                            parts.append(part.get("text"))
                    prompt = "\n".join(p.strip() for p in parts if p.strip())
                if prompt:
                    meta["subagent_prompt"] = _truncate_log_value(prompt, max_chars)
                    label = _infer_subagent_label(prompt)
                    if label:
                        meta["subagent_type"] = label
                break
    except Exception:
        pass
    _TRANSCRIPT_META_CACHE[path_value] = meta
    return meta


def _augment_hook_meta_from_transcript(meta: Dict[str, Any], max_chars: int) -> Dict[str, Any]:
    transcript_path = meta.get("agent_transcript_path") or meta.get("transcript_path")
    if not isinstance(transcript_path, str) or not transcript_path:
        return meta
    tool_use_id = meta.get("tool_use_id") or meta.get("tool_call_id")
    agent_id = _infer_agent_id_from_path(transcript_path)
    if agent_id and "agent_id" not in meta:
        meta["agent_id"] = agent_id
    if tool_use_id and "subagents" not in transcript_path:
        subagent_meta = _resolve_subagent_meta_from_tool_use(
            transcript_path,
            str(tool_use_id),
            max_chars,
        )
        for key, value in subagent_meta.items():
            if key not in meta and value is not None:
                meta[key] = value

    if "subagents" not in transcript_path and not agent_id:
        return meta
    transcript_meta = _load_subagent_meta_from_transcript(transcript_path, max_chars)
    for key, value in transcript_meta.items():
        if key not in meta and value is not None:
            meta[key] = value
    return meta


def _build_subagent_tool_map(subagents_dir: Path, max_chars: int) -> Dict[str, Dict[str, Any]]:
    tool_map: Dict[str, Dict[str, Any]] = {}
    if not subagents_dir.exists():
        return tool_map

    for entry in sorted(subagents_dir.glob("agent-*.jsonl")):
        agent_id = _infer_agent_id_from_path(str(entry)) or ""
        subagent_meta = _load_subagent_meta_from_transcript(str(entry), max_chars)
        subagent_meta = {**subagent_meta, "agent_id": agent_id, "agent_transcript_path": str(entry)}
        try:
            with entry.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    msg = obj.get("message")
                    if not isinstance(msg, dict):
                        continue
                    content = msg.get("content")
                    if not isinstance(content, list):
                        continue
                    for part in content:
                        if not isinstance(part, dict):
                            continue
                        if part.get("type") != "tool_use":
                            continue
                        tool_id = part.get("id")
                        if isinstance(tool_id, str) and tool_id:
                            tool_map.setdefault(tool_id, dict(subagent_meta))
        except Exception:
            continue
    return tool_map


def _resolve_subagent_meta_from_tool_use(
    transcript_path: str,
    tool_use_id: str,
    max_chars: int,
) -> Dict[str, Any]:
    if not tool_use_id:
        return {}
    transcript = Path(transcript_path).expanduser()
    session_root = transcript.with_suffix("")
    if not session_root.exists():
        session_root = transcript.parent
    subagents_dir = session_root / "subagents"
    cache_key = str(session_root)
    tool_map = _SUBAGENT_TOOL_MAP_CACHE.get(cache_key)
    if tool_map is None or tool_use_id not in tool_map:
        tool_map = _build_subagent_tool_map(subagents_dir, max_chars)
        _SUBAGENT_TOOL_MAP_CACHE[cache_key] = tool_map
    return tool_map.get(tool_use_id, {})


def _extract_hook_meta(hook_input: Any) -> Dict[str, Any]:
    if hook_input is None:
        return {}
    meta: Dict[str, Any] = {}
    for key in (
        "session_id",
        "transcript_path",
        "cwd",
        "permission_mode",
        "hook_event_name",
        "agent_id",
        "agent_transcript_path",
        "tool_call_id",
        "tool_use_id",
        "parent_tool_use_id",
    ):
        value = _hook_value(hook_input, key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        meta[key] = value

    if "agent_id" not in meta:
        inferred = _infer_agent_id_from_path(meta.get("agent_transcript_path"))
        if not inferred:
            inferred = _infer_agent_id_from_path(meta.get("transcript_path"))
        if inferred:
            meta["agent_id"] = inferred

    if "cwd" in meta and "tool_cwd" not in meta:
        meta["tool_cwd"] = meta["cwd"]
    return meta


def _extract_system_reminder(text: str) -> Optional[str]:
    if not isinstance(text, str):
        return None
    match = SYSTEM_REMINDER_RE.match(text.strip())
    if match and match.group(1) is not None:
        return match.group(1).strip()
    return None


def _strip_system_reminders(text: str) -> str:
    if not isinstance(text, str):
        return text
    return SYSTEM_REMINDER_STRIP_RE.sub("", text).strip()


def _should_auto_continue(text: str) -> bool:
    if not text:
        return False
    lowered = text.lower()
    phrases = (
        "should i proceed",
        "shall i proceed",
        "would you like me to proceed",
        "do you want me to proceed",
        "may i proceed",
        "can i proceed",
        "should i begin",
        "ready to start",
        "should i start",
        "should i continue",
        "would you like me to continue",
        "do you want me to continue",
        "plan mode",
        "approve",
        "approval",
    )
    if any(phrase in lowered for phrase in phrases):
        return True
    if lowered.strip().endswith("?") and "proceed" in lowered:
        return True
    return False


def _serialize_message_for_log(message: Any) -> Any:
    if message is None:
        return None
    if isinstance(message, dict):
        return message
    data: Dict[str, Any] = {}
    for attr in ("role", "content", "name", "function_call"):
        value = getattr(message, attr, None)
        if value is not None:
            data[attr] = value
    tool_calls = getattr(message, "tool_calls", None)
    if tool_calls is not None:
        serialized_calls = []
        for call in tool_calls:
            if isinstance(call, dict):
                serialized_calls.append(call)
                continue
            func = getattr(call, "function", None)
            serialized_calls.append(
                {
                    "id": getattr(call, "id", None),
                    "function": {
                        "name": getattr(func, "name", None) if func else None,
                        "arguments": getattr(func, "arguments", None) if func else None,
                    },
                }
            )
        data["tool_calls"] = serialized_calls
    return data


def _parse_tool_calls(message: Any) -> List[Dict[str, Any]]:
    if message is None:
        return []
    if isinstance(message, dict):
        tool_calls = message.get("tool_calls")
    else:
        tool_calls = getattr(message, "tool_calls", None)
    if not tool_calls:
        return []
    calls = []
    for call in tool_calls:
        if isinstance(call, dict):
            call_id = call.get("id") or ""
            function = call.get("function") or {}
            name = function.get("name") or ""
            raw_args = function.get("arguments") or "{}"
        else:
            call_id = call.id
            name = call.function.name
            raw_args = call.function.arguments or "{}"
        if isinstance(raw_args, (dict, list)):
            args = raw_args
            raw_args = json.dumps(raw_args)
        else:
            try:
                args = json.loads(raw_args)
            except Exception:
                args = {}
        calls.append(
            {
                "id": call_id,
                "name": name,
                "args": args,
                "raw_arguments": raw_args,
            }
        )
    return calls


def _truncate_log_value(value: str, max_chars: int) -> str:
    if max_chars <= 0:
        return value
    if len(value) <= max_chars:
        return value
    return value[:max_chars] + "...[truncated]"


def _append_tool_log(config: LoopConfig, entry: Dict[str, Any]) -> None:
    if not config.tool_log_path:
        return
    try:
        path = Path(config.tool_log_path).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        # Best-effort logging; never break the loop.
        return


def _log_system_reminder(
    config: LoopConfig,
    reminder: str,
    source: str,
    tool_name: Optional[str] = None,
    tool_call_id: Optional[str] = None,
) -> None:
    if not reminder:
        return
    payload = {
        "type": "system_reminder",
        "timestamp": time.time(),
        "source": source,
        "tool": tool_name,
        "tool_call_id": tool_call_id,
        "content": _truncate_log_value(reminder, config.trace_log_max_chars),
    }
    _append_trace_log(config, payload)
    _append_tool_log(config, payload)


def _truncate_nested(value: Any, max_chars: int) -> Any:
    if isinstance(value, str):
        return _truncate_log_value(value, max_chars)
    if isinstance(value, list):
        return [_truncate_nested(item, max_chars) for item in value]
    if isinstance(value, dict):
        return {key: _truncate_nested(val, max_chars) for key, val in value.items()}
    return value


def _append_trace_log(config: LoopConfig, entry: Dict[str, Any]) -> None:
    if not config.trace_log_path:
        return
    try:
        path = Path(config.trace_log_path).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        return


async def _run_tool(
    ctx: AppContext,
    name: str,
    args: Dict[str, Any],
) -> Any:
    func = RAW_TOOL_MAP.get(name)
    if func is None:
        return {"error": f"Unknown tool: {name}"}
    wrapper = RunContextWrapper(ctx)
    try:
        result = func(wrapper, **args)
        if asyncio.iscoroutine(result):
            result = await result
        return result
    except Exception as exc:
        return {"error": f"{name} failed: {exc}"}


def _tool_groups(calls: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    parallel_safe = {"Read", "Grep", "Glob", "LS"}
    groups: List[List[Dict[str, Any]]] = []
    current: List[Dict[str, Any]] = []
    for call in calls:
        if call["name"] in parallel_safe:
            current.append(call)
        else:
            if current:
                groups.append(current)
                current = []
            groups.append([call])
    if current:
        groups.append(current)
    return groups


async def _execute_tools(
    ctx: AppContext,
    config: LoopConfig,
    calls: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for group in _tool_groups(calls):
        if len(group) == 1:
            call = group[0]
            _append_tool_log(
                config,
                {
                    "type": "tool_call",
                    "tool": call["name"],
                    "tool_call_id": call["id"],
                    "args": call.get("args", {}),
                    "raw_arguments": call.get("raw_arguments"),
                    "timestamp": time.time(),
                },
            )
            _append_trace_log(
                config,
                {
                    "type": "tool_call",
                    "tool": call["name"],
                    "tool_call_id": call["id"],
                    "timestamp": time.time(),
                    "args": _truncate_nested(call.get("args", {}), config.trace_log_max_chars),
                },
            )
            start = time.time()
            result = await _run_tool(ctx, call["name"], call["args"])
            duration_ms = int((time.time() - start) * 1000)
            result_text = stringify_tool_result(result)
            reminder = _extract_system_reminder(result_text)
            stripped_result = _strip_system_reminders(result_text)
            if reminder:
                _log_system_reminder(
                    config,
                    reminder,
                    source="tool_result",
                    tool_name=call["name"],
                    tool_call_id=call["id"],
                )
            _append_tool_log(
                config,
                {
                    "type": "tool_result",
                    "tool": call["name"],
                    "tool_call_id": call["id"],
                    "args": call.get("args", {}),
                    "raw_arguments": call.get("raw_arguments"),
                    "duration_ms": duration_ms,
                    "result": _truncate_log_value(result_text, config.tool_log_max_chars),
                    "result_stripped": _truncate_log_value(stripped_result, config.tool_log_max_chars)
                    if stripped_result != result_text
                    else None,
                    "timestamp": time.time(),
                },
            )
            _append_trace_log(
                config,
                {
                    "type": "tool_result",
                    "tool": call["name"],
                    "tool_call_id": call["id"],
                    "timestamp": time.time(),
                    "args": _truncate_nested(call.get("args", {}), config.trace_log_max_chars),
                    "result": _truncate_log_value(result_text, config.trace_log_max_chars),
                    "result_stripped": _truncate_log_value(stripped_result, config.trace_log_max_chars)
                    if stripped_result != result_text
                    else None,
                },
            )
            content_for_model = (
                stripped_result
                if config.strip_system_reminders_in_tool_results and stripped_result != result_text
                else result_text
            )
            results.append(
                {
                    "tool_call_id": call["id"],
                    "content": content_for_model,
                }
            )
        else:
            starts = {call["id"]: time.time() for call in group}
            for call in group:
                _append_tool_log(
                    config,
                    {
                        "type": "tool_call",
                        "tool": call["name"],
                        "tool_call_id": call["id"],
                        "args": call.get("args", {}),
                        "raw_arguments": call.get("raw_arguments"),
                        "timestamp": time.time(),
                    },
                )
                _append_trace_log(
                    config,
                    {
                        "type": "tool_call",
                        "tool": call["name"],
                        "tool_call_id": call["id"],
                        "timestamp": time.time(),
                        "args": _truncate_nested(call.get("args", {}), config.trace_log_max_chars),
                    },
                )
            tasks = [
                _run_tool(ctx, call["name"], call["args"])
                for call in group
            ]
            group_results = await asyncio.gather(*tasks)
            for call, result in zip(group, group_results):
                duration_ms = int((time.time() - starts[call["id"]]) * 1000)
                result_text = stringify_tool_result(result)
                reminder = _extract_system_reminder(result_text)
                stripped_result = _strip_system_reminders(result_text)
                if reminder:
                    _log_system_reminder(
                        config,
                        reminder,
                        source="tool_result",
                        tool_name=call["name"],
                        tool_call_id=call["id"],
                    )
                _append_tool_log(
                    config,
                    {
                        "type": "tool_result",
                        "tool": call["name"],
                        "tool_call_id": call["id"],
                        "args": call.get("args", {}),
                        "raw_arguments": call.get("raw_arguments"),
                        "duration_ms": duration_ms,
                        "result": _truncate_log_value(result_text, config.tool_log_max_chars),
                        "result_stripped": _truncate_log_value(stripped_result, config.tool_log_max_chars)
                        if stripped_result != result_text
                        else None,
                        "timestamp": time.time(),
                    },
                )
                _append_trace_log(
                    config,
                    {
                        "type": "tool_result",
                        "tool": call["name"],
                        "tool_call_id": call["id"],
                        "timestamp": time.time(),
                        "args": _truncate_nested(call.get("args", {}), config.trace_log_max_chars),
                        "result": _truncate_log_value(result_text, config.trace_log_max_chars),
                        "result_stripped": _truncate_log_value(stripped_result, config.trace_log_max_chars)
                        if stripped_result != result_text
                        else None,
                    },
                )
                content_for_model = (
                    stripped_result
                    if config.strip_system_reminders_in_tool_results and stripped_result != result_text
                    else result_text
                )
                results.append(
                    {
                        "tool_call_id": call["id"],
                        "content": content_for_model,
                    }
                )
    return results


def _call_openai(
    client: Any,
    model: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]],
) -> Any:
    if client is None:
        raise RuntimeError("OpenAI client unavailable; set OPENAI_API_KEY or use litellm/ models.")
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
    }
    if tools is not None:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    return client.chat.completions.create(**payload)


def _stream_openai_message(
    client: Any,
    model: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    if client is None:
        raise RuntimeError("OpenAI client unavailable; set OPENAI_API_KEY or use litellm/ models.")
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    if tools is not None:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    stream = client.chat.completions.create(**payload)
    content_parts: List[str] = []
    tool_calls: Dict[int, Dict[str, Any]] = {}
    for chunk in stream:
        try:
            choice = chunk.choices[0]
        except Exception:
            continue
        delta = getattr(choice, "delta", None) or {}
        text = getattr(delta, "content", None) if not isinstance(delta, dict) else delta.get("content")
        if text:
            content_parts.append(text)
            print(text, end="", flush=True)
        delta_tool_calls = getattr(delta, "tool_calls", None) if not isinstance(delta, dict) else delta.get("tool_calls")
        if delta_tool_calls:
            for call in delta_tool_calls:
                if isinstance(call, dict):
                    idx = call.get("index", 0)
                    entry = tool_calls.setdefault(idx, {"id": "", "function": {"name": None, "arguments": ""}})
                    if call.get("id"):
                        entry["id"] = call["id"]
                    func = call.get("function") or {}
                    if func.get("name"):
                        entry["function"]["name"] = func["name"]
                    if func.get("arguments"):
                        entry["function"]["arguments"] += func["arguments"]
                else:
                    idx = getattr(call, "index", 0)
                    entry = tool_calls.setdefault(idx, {"id": "", "function": {"name": None, "arguments": ""}})
                    call_id = getattr(call, "id", None)
                    if call_id:
                        entry["id"] = call_id
                    func = getattr(call, "function", None)
                    if func is not None:
                        name = getattr(func, "name", None)
                        if name:
                            entry["function"]["name"] = name
                        args = getattr(func, "arguments", None)
                        if args:
                            entry["function"]["arguments"] += args
    ordered_calls = [tool_calls[idx] for idx in sorted(tool_calls.keys())]
    return {
        "role": "assistant",
        "content": "".join(content_parts),
        "tool_calls": ordered_calls if ordered_calls else None,
    }


def _call_litellm(
    model: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]],
) -> Any:
    try:
        import litellm
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(f"litellm package required for {model}: {exc}") from exc
    payload: Dict[str, Any] = {
        "model": _litellm_model_name(model),
        "messages": messages,
    }
    if tools is not None:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    api_key = os.environ.get("LITELLM_API_KEY")
    if api_key:
        payload["api_key"] = api_key
    api_base = os.environ.get("LITELLM_API_BASE") or os.environ.get("LITELLM_BASE_URL")
    if api_base:
        payload["api_base"] = api_base
    return litellm.completion(**payload)


async def _model_call(
    client: Any,
    config: LoopConfig,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]],
) -> Any:
    def _dispatch(model: str) -> Any:
        if _is_litellm_model(model):
            return _call_litellm(model, messages, tools)
        return _call_openai(client, model, messages, tools)

    try:
        return _dispatch(config.model)
    except Exception:
        if config.fallback_model:
            return _dispatch(config.fallback_model)
        raise


async def _run_openai_loop(context: AppContext, config: LoopConfig) -> None:
    try:
        from openai import OpenAI
    except Exception as exc:
        raise RuntimeError(f"openai package required: {exc}") from exc

    client = OpenAI() if _needs_openai_client(config) else None
    tools = build_openai_tools()
    system_blocks = _build_system_prompt_blocks(context, config)
    system_blocks = _append_system_context_blocks(system_blocks, context.system_context)
    system_prompt = "\n\n".join([p.strip() for p in system_blocks if p and p.strip()]).strip()
    structured_system = bool(system_blocks)
    system_message: Dict[str, Any]
    if structured_system:
        system_message = {
            "role": "system",
            "content": [{"type": "text", "text": block} for block in system_blocks if block],
        }
    else:
        system_message = {"role": "system", "content": system_prompt}
    _append_trace_log(
        config,
        {
            "type": "system_prompt",
            "timestamp": time.time(),
            "backend": "openai-or-litellm",
            "model": config.model,
            "fallback_model": config.fallback_model,
            "content": _truncate_log_value(system_prompt, config.trace_log_max_chars),
            "blocks": _truncate_nested(system_blocks, config.trace_log_max_chars),
            "structured": structured_system,
        },
    )
    state = LoopState()

    while True:
        try:
            user_input = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user_input:
            continue
        if user_input in {"/quit", "/exit"}:
            break

        _append_trace_log(
            config,
            {
                "type": "user_input",
                "timestamp": time.time(),
                "backend": "openai-or-litellm",
                "content": _truncate_log_value(user_input, config.trace_log_max_chars),
            },
        )
        state.messages.append({"role": "user", "content": user_input})

        # Normalize + micro-compaction
        compaction_info = _micro_compact(state, config)
        if compaction_info and compaction_info.get("systemMessage"):
            state.messages.append({"role": "system", "content": compaction_info["systemMessage"]})

        # Auto-compaction
        if _should_auto_compact(state, config):
            await _compact(state, client, config)

        # Loop until no tool calls
        while True:
            wrapped_messages = _inject_plan_mode(
                list(state.messages),
                context.root_dir,
                context.permissions.mode,
            )
            wrapped_messages = _wrap_user_context(wrapped_messages, context.user_context)
            call_messages = [system_message] + wrapped_messages
            _append_trace_log(
                config,
                {
                    "type": "model_request",
                    "timestamp": time.time(),
                    "model": config.model,
                    "fallback_model": config.fallback_model,
                    "messages": _truncate_nested(call_messages, config.trace_log_max_chars),
                    "tools": _truncate_nested(tools, config.trace_log_max_chars),
                },
            )
            streamed_openai = False
            try:
                if _is_litellm_model(config.model):
                    response = await _model_call(client, config, call_messages, tools)
                    message = _get_message(response)
                else:
                    message = _stream_openai_message(client, config.model, call_messages, tools)
                    streamed_openai = True
            except Exception:
                if structured_system:
                    flat_messages = [{"role": "system", "content": system_prompt}] + wrapped_messages
                    _append_trace_log(
                        config,
                        {
                            "type": "system_prompt_fallback",
                            "timestamp": time.time(),
                            "backend": "openai-or-litellm",
                            "reason": "structured_system_failed",
                        },
                    )
                    try:
                        if _is_litellm_model(config.model):
                            response = await _model_call(client, config, flat_messages, tools)
                            message = _get_message(response)
                        else:
                            message = _stream_openai_message(client, config.model, flat_messages, tools)
                            streamed_openai = True
                    except Exception:
                        if config.fallback_model:
                            response = await _model_call(client, config, flat_messages, tools)
                            message = _get_message(response)
                        else:
                            raise
                elif config.fallback_model:
                    response = await _model_call(client, config, call_messages, tools)
                    message = _get_message(response)
                else:
                    raise
            tool_calls = _parse_tool_calls(message)
            _append_trace_log(
                config,
                {
                    "type": "model_response",
                    "timestamp": time.time(),
                    "model": config.model,
                    "message": _truncate_nested(
                        _serialize_message_for_log(message), config.trace_log_max_chars
                    ),
                    "tool_calls": _truncate_nested(tool_calls, config.trace_log_max_chars),
                },
            )
            serialized_calls = None
            if tool_calls:
                serialized_calls = [
                    {
                        "id": call["id"],
                        "type": "function",
                        "function": {
                            "name": call["name"],
                            "arguments": call.get("raw_arguments") or json.dumps(call["args"]),
                        },
                    }
                    for call in tool_calls
                ]
            state.messages.append(
                {
                    "role": "assistant",
                    "content": _message_content(message),
                    "tool_calls": serialized_calls,
                }
            )
            if not tool_calls:
                content = _message_content(message)
                if content:
                    _append_trace_log(
                        config,
                        {
                            "type": "assistant_output",
                            "timestamp": time.time(),
                            "backend": "openai-or-litellm",
                            "content": _truncate_log_value(content, config.trace_log_max_chars),
                        },
                    )
                    if not streamed_openai:
                        print(content)
                    else:
                        print()
                break

            tool_results = await _execute_tools(context, config, tool_calls)
            for result in tool_results:
                state.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": result["tool_call_id"],
                        "content": result["content"],
                    }
                )


def _build_claude_sdk_options(context: AppContext, config: LoopConfig) -> Any:
    try:
        from claude_agent_sdk.types import ClaudeAgentOptions
    except Exception as exc:
        raise RuntimeError(f"claude-agent-sdk package required: {exc}") from exc

    options = ClaudeAgentOptions()
    options.model = config.model or None
    options.fallback_model = config.fallback_model or None
    options.cwd = str(context.root_dir)
    # Ensure Claude Code trusts the sandbox root and loads normal settings
    options.add_dirs = [str(context.root_dir)]
    options.setting_sources = ["user", "project", "local"]
    if config.claude_sdk_cli_path:
        options.cli_path = str(Path(config.claude_sdk_cli_path).expanduser())
    if config.claude_sdk_settings:
        options.settings = config.claude_sdk_settings
    options.permission_mode = _map_permission_mode_to_claude(
        context.permissions.mode,
        context.permissions.auto_approve,
    )
    options.include_partial_messages = bool(config.claude_sdk_stream)

    tools_preset = config.claude_sdk_tools_preset
    if not tools_preset and config.claude_sdk_preset:
        tools_preset = config.claude_sdk_preset

    if config.claude_sdk_preset:
        options.system_prompt = {"type": "preset", "preset": config.claude_sdk_preset}
        if tools_preset:
            options.tools = {"type": "preset", "preset": tools_preset}
    else:
        system_blocks = _build_system_prompt_blocks(context, config)
        system_blocks = _append_system_context_blocks(system_blocks, context.system_context)
        system_prompt = "\n\n".join([p.strip() for p in system_blocks if p and p.strip()]).strip()
        options.system_prompt = system_prompt
        _apply_claude_sdk_structured_system_prompt(options, system_blocks, config)
        if tools_preset:
            options.tools = {"type": "preset", "preset": tools_preset}
    return options


async def _run_claude_sdk_loop(context: AppContext, config: LoopConfig) -> None:
    try:
        from claude_agent_sdk.client import ClaudeSDKClient
        from claude_agent_sdk import types
    except Exception as exc:
        raise RuntimeError(f"claude-agent-sdk package required: {exc}") from exc
    try:
        import importlib.metadata as _metadata
        anyio_version = _metadata.version("anyio")
        major = int(anyio_version.split(".")[0])
        if major < 4:
            raise RuntimeError(
                f"claude-sdk backend requires anyio>=4 (found {anyio_version}). "
                "Please upgrade anyio or reinstall requirements."
            )
    except Exception as exc:
        if isinstance(exc, RuntimeError):
            raise
        # If anyio is missing or version parsing fails, let the SDK raise its own error.
        pass

    use_preset = bool(config.claude_sdk_preset)
    options = _build_claude_sdk_options(context, config)
    compat = config.claude_sdk_compat
    hooks_enabled = config.claude_sdk_hooks or compat
    permission_callback_enabled = config.claude_sdk_permission_callback or compat
    auto_continue = config.claude_sdk_auto_continue

    if permission_callback_enabled:
        from claude_agent_sdk.types import PermissionResultAllow, PermissionResultDeny

        async def _can_use_tool(tool_name: str, tool_input: Dict[str, Any], _ctx: Any) -> Any:
            target = _tool_target(tool_name, tool_input or {})
            allowed = context.permissions.check(tool_name, target)
            if allowed:
                return PermissionResultAllow()
            return PermissionResultDeny(message=f"Denied {tool_name} on {target}", interrupt=False)

        options.can_use_tool = _can_use_tool

    if hooks_enabled:
        from claude_agent_sdk.types import HookMatcher

        async def _log_pre_tool_use(hook_input: Any, _output: Any, _ctx: Any) -> Dict[str, Any]:
            tool_name = _hook_value(hook_input, "tool_name")
            tool_input = _hook_value(hook_input, "tool_input")
            hook_meta = _extract_hook_meta(hook_input)
            hook_meta = _augment_hook_meta_from_transcript(hook_meta, config.trace_log_max_chars)
            reminder = None
            if isinstance(tool_input, str):
                reminder = _extract_system_reminder(tool_input)
                if reminder:
                    _log_system_reminder(
                        config,
                        reminder,
                        source="tool_input",
                        tool_name=tool_name,
                    )
            _append_trace_log(
                config,
                {
                    "type": "tool_call",
                    "timestamp": time.time(),
                    "backend": "claude-sdk",
                    "tool": tool_name,
                    "args": _truncate_nested(tool_input, config.trace_log_max_chars),
                    **hook_meta,
                },
            )
            _append_tool_log(
                config,
                {
                    "type": "tool_call",
                    "tool": tool_name,
                    "args": _truncate_nested(tool_input, config.tool_log_max_chars),
                    "timestamp": time.time(),
                    **hook_meta,
                },
            )
            return {}

        async def _log_post_tool_use(hook_input: Any, _output: Any, _ctx: Any) -> Dict[str, Any]:
            tool_name = _hook_value(hook_input, "tool_name")
            tool_input = _hook_value(hook_input, "tool_input")
            tool_response = _hook_value(hook_input, "tool_response")
            hook_meta = _extract_hook_meta(hook_input)
            hook_meta = _augment_hook_meta_from_transcript(hook_meta, config.trace_log_max_chars)
            reminder = None
            stripped_result = None
            if isinstance(tool_response, str):
                reminder = _extract_system_reminder(tool_response)
                stripped_result = _strip_system_reminders(tool_response)
                if reminder:
                    _log_system_reminder(
                        config,
                        reminder,
                        source="tool_result",
                        tool_name=tool_name,
                    )
            _append_trace_log(
                config,
                {
                    "type": "tool_result",
                    "timestamp": time.time(),
                    "backend": "claude-sdk",
                    "tool": tool_name,
                    "args": _truncate_nested(tool_input, config.trace_log_max_chars),
                    "result": _truncate_nested(tool_response, config.trace_log_max_chars),
                    "result_stripped": _truncate_log_value(stripped_result, config.trace_log_max_chars)
                    if isinstance(stripped_result, str) and stripped_result != tool_response
                    else None,
                    **hook_meta,
                },
            )
            _append_tool_log(
                config,
                {
                    "type": "tool_result",
                    "tool": tool_name,
                    "args": _truncate_nested(tool_input, config.tool_log_max_chars),
                    "result": _truncate_nested(tool_response, config.tool_log_max_chars),
                    "result_stripped": _truncate_log_value(stripped_result, config.tool_log_max_chars)
                    if isinstance(stripped_result, str) and stripped_result != tool_response
                    else None,
                    "timestamp": time.time(),
                    **hook_meta,
                },
            )
            return {}

        async def _log_subagent_stop(hook_input: Any, _output: Any, _ctx: Any) -> Dict[str, Any]:
            hook_meta = _extract_hook_meta(hook_input)
            hook_meta = _augment_hook_meta_from_transcript(hook_meta, config.trace_log_max_chars)
            _append_trace_log(
                config,
                {
                    "type": "subagent_stop",
                    "timestamp": time.time(),
                    "backend": "claude-sdk",
                    **hook_meta,
                },
            )
            _append_tool_log(
                config,
                {
                    "type": "subagent_stop",
                    "timestamp": time.time(),
                    **hook_meta,
                },
            )
            return {}

        options.hooks = {
            "PreToolUse": [HookMatcher(matcher=None, hooks=[_log_pre_tool_use])],
            "PostToolUse": [HookMatcher(matcher=None, hooks=[_log_post_tool_use])],
            "SubagentStop": [HookMatcher(matcher=None, hooks=[_log_subagent_stop])],
        }
    if use_preset and (config.custom_system_prompt or config.append_system_prompt):
        _append_trace_log(
            config,
            {
                "type": "warning",
                "timestamp": time.time(),
                "backend": "claude-sdk",
                "message": "System prompt overrides ignored because claude-sdk preset is active.",
            },
        )

    structured_blocks = None
    if not use_preset:
        raw_extra = None
        if hasattr(options, "env") and isinstance(options.env, dict):
            raw_extra = options.env.get("CLAUDE_CODE_EXTRA_BODY")
        if raw_extra:
            try:
                parsed = json.loads(raw_extra)
                if isinstance(parsed, dict):
                    system_payload = parsed.get("system")
                    if isinstance(system_payload, list):
                        extracted = []
                        for item in system_payload:
                            if (
                                isinstance(item, dict)
                                and item.get("type") == "text"
                                and isinstance(item.get("text"), str)
                            ):
                                extracted.append(item["text"])
                        if extracted:
                            structured_blocks = extracted
            except Exception:
                structured_blocks = None
    system_prompt_label = (
        f"preset:{config.claude_sdk_preset}"
        if use_preset
        else "\n\n".join(structured_blocks or [])
        if structured_blocks
        else str(options.system_prompt or "")
    )
    _append_trace_log(
        config,
        {
            "type": "system_prompt",
            "timestamp": time.time(),
            "backend": "claude-sdk",
            "model": config.model,
            "fallback_model": config.fallback_model,
            "content": _truncate_log_value(system_prompt_label, config.trace_log_max_chars),
            "blocks": _truncate_nested(structured_blocks, config.trace_log_max_chars)
            if structured_blocks
            else None,
            "structured": bool(structured_blocks),
        },
    )

    interrupt_event = asyncio.Event()
    interrupt_state = {"inflight": False}
    loop = asyncio.get_running_loop()
    previous_handler = None

    def _handle_sigint() -> None:
        if interrupt_state["inflight"]:
            interrupt_event.set()

    try:
        loop.add_signal_handler(signal.SIGINT, _handle_sigint)
    except (NotImplementedError, RuntimeError):
        try:
            previous_handler = signal.getsignal(signal.SIGINT)
            signal.signal(signal.SIGINT, lambda *_args: _handle_sigint())
        except Exception:
            previous_handler = None

    pending_interruption: Optional[str] = None
    async with ClaudeSDKClient(options) as client:
        while True:
            try:
                user_input = input("> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if not user_input:
                continue
            if user_input in {"/quit", "/exit"}:
                break

            content_blocks, prompt = _build_claude_sdk_user_blocks(
                user_input,
                context,
                include_reminders=not use_preset,
                pending_interruption=pending_interruption,
            )
            pending_interruption = None
            _append_trace_log(
                config,
                {
                    "type": "user_input",
                    "timestamp": time.time(),
                    "backend": "claude-sdk",
                    "content": _truncate_log_value(user_input, config.trace_log_max_chars),
                    "expanded_prompt": _truncate_log_value(prompt, config.trace_log_max_chars)
                    if prompt != user_input
                    else None,
                },
            )
            followup_prompt = prompt
            for _attempt in range(2 if auto_continue else 1):
                if followup_prompt == prompt:
                    await client.query(_claude_sdk_prompt_stream(content_blocks))
                else:
                    followup_blocks, followup_text = _build_claude_sdk_user_blocks(
                        followup_prompt,
                        context,
                        include_reminders=False,
                        pending_interruption=None,
                    )
                    followup_prompt = followup_text
                    await client.query(_claude_sdk_prompt_stream(followup_blocks))

                output_parts: List[str] = []
                streamed_text = ""
                streamed_any = False
                content = ""
                last_session_id: Optional[str] = None
                interrupted = False
                interrupt_state["inflight"] = True
                interrupt_event.clear()

                async def _consume_response() -> None:
                    nonlocal last_session_id, streamed_any, streamed_text, output_parts
                    async for msg in client.receive_response():
                        if isinstance(msg, types.StreamEvent):
                            last_session_id = msg.session_id or last_session_id
                            delta_text = _extract_stream_text(msg.event)
                            if delta_text:
                                streamed_any = True
                                streamed_text += delta_text
                                print(delta_text, end="", flush=True)
                        elif isinstance(msg, types.AssistantMessage):
                            if not streamed_any:
                                text = _assistant_blocks_text(msg.content)
                                if text:
                                    output_parts.append(text)
                        if isinstance(msg, types.ResultMessage):
                            last_session_id = msg.session_id or last_session_id
                            _append_trace_log(
                                config,
                                {
                                    "type": "result",
                                    "timestamp": time.time(),
                                    "backend": "claude-sdk",
                                    "session_id": msg.session_id,
                                    "is_error": msg.is_error,
                                    "usage": _truncate_nested(msg.usage, config.trace_log_max_chars),
                                    "total_cost_usd": msg.total_cost_usd,
                                },
                            )

                receive_task = asyncio.create_task(_consume_response())
                interrupt_task = asyncio.create_task(interrupt_event.wait())
                try:
                    done, pending = await asyncio.wait(
                        {receive_task, interrupt_task},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if interrupt_task in done:
                        interrupted = True
                        try:
                            await client.interrupt()
                        except Exception as exc:
                            _append_trace_log(
                                config,
                                {
                                    "type": "warning",
                                    "timestamp": time.time(),
                                    "backend": "claude-sdk",
                                    "message": f"Claude SDK interrupt error: {exc}",
                                },
                            )
                        receive_task.cancel()
                        await asyncio.gather(receive_task, return_exceptions=True)
                        _append_trace_log(
                            config,
                            {
                                "type": "interrupted",
                                "timestamp": time.time(),
                                "backend": "claude-sdk",
                                "session_id": last_session_id,
                            },
                        )
                        if streamed_any:
                            print()
                    else:
                        interrupt_task.cancel()
                        await asyncio.gather(interrupt_task, return_exceptions=True)
                except Exception as exc:
                    _append_trace_log(
                        config,
                        {
                            "type": "warning",
                            "timestamp": time.time(),
                            "backend": "claude-sdk",
                            "message": f"Claude SDK receive error: {exc}",
                        },
                    )
                finally:
                    interrupt_state["inflight"] = False

                content = streamed_text.strip() if streamed_any else "".join(output_parts).strip()
                if interrupted:
                    if content:
                        pending_interruption = content
                    break
                should_follow = auto_continue and _attempt == 0 and _should_auto_continue(content)
                if should_follow:
                    _append_trace_log(
                        config,
                        {
                            "type": "auto_continue",
                            "timestamp": time.time(),
                            "backend": "claude-sdk",
                            "content": _truncate_log_value(content, config.trace_log_max_chars),
                        },
                    )
                    followup_prompt = "Proceed. Start implementing now without further questions."
                    continue

                if content:
                    if streamed_any:
                        print()
                    _append_trace_log(
                        config,
                        {
                            "type": "assistant_output",
                            "timestamp": time.time(),
                            "backend": "claude-sdk",
                            "content": _truncate_log_value(content, config.trace_log_max_chars),
                            "session_id": last_session_id,
                        },
                    )
                    if not streamed_any:
                        print(content)
                break
    if previous_handler is not None:
        try:
            signal.signal(signal.SIGINT, previous_handler)
        except Exception:
            pass
    else:
        try:
            loop.remove_signal_handler(signal.SIGINT)
        except Exception:
            pass


async def run_cli_loop(context: AppContext, config: LoopConfig) -> None:
    def _attach_loggers(ctx: AppContext) -> None:
        ctx.trace_log_max_chars = config.trace_log_max_chars
        ctx.tool_log_max_chars = config.tool_log_max_chars

        def _trace_logger(entry: Dict[str, Any]) -> None:
            _append_trace_log(config, _truncate_nested(entry, config.trace_log_max_chars))

        def _tool_logger(entry: Dict[str, Any]) -> None:
            _append_tool_log(config, _truncate_nested(entry, config.tool_log_max_chars))

        ctx.trace_logger = _trace_logger
        ctx.tool_logger = _tool_logger

    _attach_loggers(context)
    if config.backend == "claude-sdk":
        await _run_claude_sdk_loop(context, config)
        return
    await _run_openai_loop(context, config)

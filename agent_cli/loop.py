from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from agents import RunContextWrapper

from .permissions import AppContext
from .prompt_loader import load_system_prompt, load_compaction_prompt
from .tool_specs import build_openai_tools, stringify_tool_result
from .tools import RAW_TOOL_MAP


DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.2")


@dataclass
class LoopConfig:
    model: str = DEFAULT_MODEL
    fallback_model: Optional[str] = None
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
            start = time.time()
            result = await _run_tool(ctx, call["name"], call["args"])
            duration_ms = int((time.time() - start) * 1000)
            result_text = stringify_tool_result(result)
            _append_tool_log(
                config,
                {
                    "type": "tool_call",
                    "tool": call["name"],
                    "tool_call_id": call["id"],
                    "args": call["args"],
                    "raw_arguments": call.get("raw_arguments"),
                    "duration_ms": duration_ms,
                    "result": _truncate_log_value(result_text, config.tool_log_max_chars),
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
                },
            )
            results.append(
                {
                    "tool_call_id": call["id"],
                    "content": result_text,
                }
            )
        else:
            starts = {call["id"]: time.time() for call in group}
            tasks = [
                _run_tool(ctx, call["name"], call["args"])
                for call in group
            ]
            group_results = await asyncio.gather(*tasks)
            for call, result in zip(group, group_results):
                duration_ms = int((time.time() - starts[call["id"]]) * 1000)
                result_text = stringify_tool_result(result)
                _append_tool_log(
                    config,
                    {
                        "type": "tool_call",
                        "tool": call["name"],
                        "tool_call_id": call["id"],
                        "args": call["args"],
                        "raw_arguments": call.get("raw_arguments"),
                        "duration_ms": duration_ms,
                        "result": _truncate_log_value(result_text, config.tool_log_max_chars),
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
                    },
                )
                results.append(
                    {
                        "tool_call_id": call["id"],
                        "content": result_text,
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


async def run_cli_loop(context: AppContext, config: LoopConfig) -> None:
    try:
        from openai import OpenAI
    except Exception as exc:
        raise RuntimeError(f"openai package required: {exc}") from exc

    client = OpenAI() if _needs_openai_client(config) else None
    tools = build_openai_tools()
    system_prompt = load_system_prompt()
    _append_trace_log(
        config,
        {
            "type": "system_prompt",
            "timestamp": time.time(),
            "backend": "openai-or-litellm",
            "model": config.model,
            "fallback_model": config.fallback_model,
            "content": _truncate_log_value(system_prompt, config.trace_log_max_chars),
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
            call_messages = [{"role": "system", "content": system_prompt}] + list(state.messages)
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
            response = await _model_call(client, config, call_messages, tools)
            message = _get_message(response)
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
                    print(content)
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

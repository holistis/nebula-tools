from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from agents import RunContextWrapper

from .permissions import AppContext
from .prompt_loader import load_system_prompt, load_compaction_prompt
from .tool_specs import build_openai_tools, stringify_tool_result
from .tools import RAW_TOOL_MAP


DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")


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


@dataclass
class LoopState:
    messages: List[Dict[str, Any]] = field(default_factory=list)
    pending_steering: List[Dict[str, Any]] = field(default_factory=list)
    compaction_turns: int = 0


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


def _compact(state: LoopState, client: Any, config: LoopConfig) -> None:
    system_prompt, user_prompt = _compaction_prompts()
    transcript = _render_transcript(state.messages)
    prompt = user_prompt + "\n" + transcript
    response = client.chat.completions.create(
        model=config.model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
    )
    summary = response.choices[0].message.content or ""
    state.messages = [
        {"role": "system", "content": "[COMPACTED CONTEXT]"},
        {"role": "assistant", "content": summary},
    ]
    state.compaction_turns += 1


def _parse_tool_calls(message: Any) -> List[Dict[str, Any]]:
    tool_calls = getattr(message, "tool_calls", None)
    if not tool_calls:
        return []
    calls = []
    for call in tool_calls:
        name = call.function.name
        raw_args = call.function.arguments or "{}"
        try:
            args = json.loads(raw_args)
        except Exception:
            args = {}
        calls.append(
            {
                "id": call.id,
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
                results.append(
                    {
                        "tool_call_id": call["id"],
                        "content": result_text,
                    }
                )
    return results


async def _model_call(
    client: Any,
    config: LoopConfig,
    messages: List[Dict[str, Any]],
    tools: List[Dict[str, Any]],
) -> Any:
    try:
        return client.chat.completions.create(
            model=config.model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )
    except Exception:
        if config.fallback_model:
            return client.chat.completions.create(
                model=config.fallback_model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
            )
        raise


async def run_cli_loop(context: AppContext, config: LoopConfig) -> None:
    try:
        from openai import OpenAI
    except Exception as exc:
        raise RuntimeError(f"openai package required: {exc}") from exc

    client = OpenAI()
    tools = build_openai_tools()
    system_prompt = load_system_prompt()
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

        state.messages.append({"role": "user", "content": user_input})

        # Normalize + micro-compaction
        compaction_info = _micro_compact(state, config)
        if compaction_info and compaction_info.get("systemMessage"):
            state.messages.append({"role": "system", "content": compaction_info["systemMessage"]})

        # Auto-compaction
        if _should_auto_compact(state, config):
            _compact(state, client, config)

        # Loop until no tool calls
        while True:
            call_messages = [{"role": "system", "content": system_prompt}] + list(state.messages)
            response = await _model_call(client, config, call_messages, tools)
            message = response.choices[0].message
            tool_calls = _parse_tool_calls(message)
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
                    "content": message.content or "",
                    "tool_calls": serialized_calls,
                }
            )
            if not tool_calls:
                if message.content:
                    print(message.content)
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

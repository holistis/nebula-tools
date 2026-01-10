from __future__ import annotations

import argparse
import asyncio
import os
import json
from pathlib import Path

from .permissions import AppContext, PermissionState
from .loop import LoopConfig, run_cli_loop


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Nebula CLI Agent (minimal Claude-style loop)")
    parser.add_argument("--root", default=".", help="Sandbox root directory for file tools")
    parser.add_argument(
        "--backend",
        default=os.environ.get("AGENT_BACKEND") or os.environ.get("AGENT_CLI_BACKEND", "openai"),
        choices=["openai", "claude-sdk"],
        help="Backend to use (openai/litellm or claude-agent-sdk)",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("OPENAI_MODEL", "gpt-5.2"),
        help="Model name (use litellm/<provider>/<model> for LiteLLM)",
    )
    parser.add_argument(
        "--fallback-model",
        default=os.environ.get("OPENAI_FALLBACK_MODEL", "gpt-5-mini"),
        help="Fallback model name",
    )
    parser.add_argument(
        "--permission-mode",
        default="ask",
        choices=["ask", "allow", "deny", "plan"],
        help="Tool permission mode",
    )
    parser.add_argument(
        "--auto-approve",
        action="store_true",
        help="Auto-approve tool calls in ask mode",
    )
    parser.add_argument(
        "--tool-log",
        default=None,
        help="Path to write JSONL tool call logs",
    )
    parser.add_argument(
        "--tool-log-max-chars",
        type=int,
        default=10_000,
        help="Max characters per tool log field (0 disables truncation)",
    )
    parser.add_argument(
        "--trace-log",
        default=None,
        help="Path to write JSONL trace logs (prompts, messages, tool results)",
    )
    parser.add_argument(
        "--trace-log-max-chars",
        type=int,
        default=10_000,
        help="Max characters per trace log field (0 disables truncation)",
    )
    parser.add_argument(
        "--system-prompt",
        default=os.environ.get("CLAUDE_SYSTEM_PROMPT"),
        help="Custom system prompt string or path to a file",
    )
    parser.add_argument(
        "--append-system-prompt",
        default=os.environ.get("CLAUDE_APPEND_SYSTEM_PROMPT"),
        help="Additional system prompt content (string or file path) to append",
    )
    parser.add_argument(
        "--attribution-header",
        default=os.environ.get("CLAUDE_ATTRIBUTION_HEADER"),
        help="Attribution header string or file path (optional)",
    )
    parser.add_argument(
        "--mcp-clients",
        default=os.environ.get("CLAUDE_MCP_CLIENTS"),
        help="JSON string or file path describing MCP clients (optional)",
    )
    parser.add_argument(
        "--mcp-clients-file",
        default=os.environ.get("CLAUDE_MCP_CLIENTS_FILE"),
        help="JSON file path describing MCP clients (optional)",
    )
    parser.add_argument(
        "--claude-sdk-preset",
        default=os.environ.get("CLAUDE_SDK_PRESET"),
        help="Claude Agent SDK system prompt preset (e.g., claude_code). When set, local prompts are ignored.",
    )
    parser.add_argument(
        "--claude-sdk-tools-preset",
        default=os.environ.get("CLAUDE_SDK_TOOLS_PRESET"),
        help="Claude Agent SDK tools preset (e.g., claude_code)",
    )
    parser.add_argument(
        "--claude-sdk-cli-path",
        default=os.environ.get("CLAUDE_SDK_CLI_PATH") or os.environ.get("CLAUDE_CODE_CLI_PATH"),
        help="Path to the Claude Code CLI binary for claude-sdk backend",
    )
    parser.add_argument(
        "--claude-sdk-settings",
        default=os.environ.get("CLAUDE_SDK_SETTINGS"),
        help="Path to Claude Code settings JSON for claude-sdk backend",
    )
    parser.add_argument(
        "--claude-sdk-compat",
        action="store_true",
        help="Enable Claude-SDK compatibility features (hooks + permission callback)",
    )
    parser.add_argument(
        "--claude-sdk-stream",
        action="store_true",
        help="Stream partial Claude SDK output to the console",
    )
    parser.add_argument(
        "--claude-sdk-hooks",
        action="store_true",
        help="Log Claude SDK tool activity via hooks",
    )
    parser.add_argument(
        "--claude-sdk-permission-callback",
        action="store_true",
        help="Use local permission checks for Claude SDK tool calls",
    )
    parser.add_argument(
        "--claude-sdk-auto-continue",
        action="store_true",
        help="Auto-send approval if Claude SDK asks to proceed",
    )
    parser.add_argument(
        "--strip-system-reminders",
        action="store_true",
        help="Strip <system-reminder> tags from tool results before sending to the model",
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Use non-interactive base prompt selection",
    )
    return parser.parse_args()


def _load_prompt_value(value: str | None) -> str | None:
    if not value:
        return None
    path = Path(value).expanduser()
    if path.exists() and path.is_file():
        return path.read_text(encoding="utf-8", errors="replace").strip()
    return value.strip()


def _load_json_value(value: str | None) -> object | None:
    if not value:
        return None
    text = _load_prompt_value(value)
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        raise ValueError(f"Invalid JSON for '{value}'")


async def main() -> None:
    args = parse_args()
    root = Path(args.root).resolve()
    perms = PermissionState(mode=args.permission_mode, auto_approve=args.auto_approve)
    context = AppContext(root_dir=root, permissions=perms)
    non_interactive_env = os.environ.get("CLAUDE_NON_INTERACTIVE", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    custom_prompt = _load_prompt_value(args.system_prompt)
    append_prompt = _load_prompt_value(args.append_system_prompt)
    attribution_header = _load_prompt_value(args.attribution_header)
    mcp_clients_source = args.mcp_clients_file or args.mcp_clients
    mcp_clients_text = _load_prompt_value(mcp_clients_source)
    if mcp_clients_text:
        os.environ["CLAUDE_MCP_CLIENTS"] = mcp_clients_text
    mcp_clients_raw = _load_json_value(mcp_clients_source)
    mcp_clients = mcp_clients_raw if isinstance(mcp_clients_raw, list) else None
    config = LoopConfig(
        backend=args.backend,
        model=args.model,
        fallback_model=args.fallback_model,
        tool_log_path=args.tool_log,
        tool_log_max_chars=args.tool_log_max_chars,
        trace_log_path=args.trace_log,
        trace_log_max_chars=args.trace_log_max_chars,
        custom_system_prompt=custom_prompt,
        append_system_prompt=append_prompt,
        attribution_header=attribution_header,
        mcp_clients=mcp_clients,
        non_interactive=args.non_interactive or non_interactive_env,
        claude_sdk_preset=args.claude_sdk_preset,
        claude_sdk_tools_preset=args.claude_sdk_tools_preset,
        claude_sdk_cli_path=args.claude_sdk_cli_path,
        claude_sdk_settings=args.claude_sdk_settings,
        claude_sdk_stream=args.claude_sdk_stream
        or os.environ.get("CLAUDE_SDK_STREAM", "").strip().lower() in {"1", "true", "yes"},
        claude_sdk_compat=args.claude_sdk_compat
        or os.environ.get("CLAUDE_SDK_COMPAT", "").strip().lower() in {"1", "true", "yes"},
        claude_sdk_hooks=args.claude_sdk_hooks
        or os.environ.get("CLAUDE_SDK_HOOKS", "").strip().lower() in {"1", "true", "yes"},
        claude_sdk_permission_callback=args.claude_sdk_permission_callback
        or os.environ.get("CLAUDE_SDK_PERMISSION_CALLBACK", "").strip().lower()
        in {"1", "true", "yes"},
        claude_sdk_auto_continue=args.claude_sdk_auto_continue
        or os.environ.get("CLAUDE_SDK_AUTO_CONTINUE", "").strip().lower() in {"1", "true", "yes"},
        strip_system_reminders_in_tool_results=args.strip_system_reminders
        or os.environ.get("CLAUDE_STRIP_SYSTEM_REMINDERS", "").strip().lower()
        in {"1", "true", "yes"},
    )
    await run_cli_loop(context, config)


if __name__ == "__main__":
    asyncio.run(main())

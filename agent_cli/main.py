from __future__ import annotations

import argparse
import asyncio
import os
import json
from pathlib import Path

from .permissions import AppContext, PermissionState
from .config_loader import load_policy_config
from .loop import LoopConfig, run_cli_loop
from .policy import DefaultPolicy


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Nebula CLI Agent (minimal Claude-style loop)")
    parser.add_argument("--root", default=".", help="Sandbox root directory for file tools")
    parser.add_argument(
        "--backend",
        default=os.environ.get("AGENT_BACKEND") or os.environ.get("AGENT_CLI_BACKEND", "openai"),
        choices=["openai", "claude-sdk", "codex-mcp"],
        help="Backend to use (openai/litellm, claude-agent-sdk, or codex-mcp)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Model name (use litellm/<provider>/<model> for LiteLLM)",
    )
    parser.add_argument(
        "--fallback-model",
        default=os.environ.get("OPENAI_FALLBACK_MODEL", "gpt-5-mini"),
        help="Fallback model name",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=None,
        help="Sampling temperature (optional)",
    )
    parser.add_argument(
        "--agent-config",
        default=os.environ.get("AGENT_CONFIG") or os.environ.get("AGENT_CLI_CONFIG"),
        help="Path to agent config YAML (optional)",
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
        "--codex-reasoning-effort",
        default=os.environ.get("CODEX_REASONING_EFFORT"),
        help="Reasoning effort for codex-mcp (minimal/low/medium/high/xhigh)",
    )
    parser.add_argument(
        "--codex-prompt-mode",
        default=os.environ.get("CODEX_PROMPT_MODE"),
        choices=["developer", "override"],
        help="Codex prompt mode: developer (use developer_instructions) or override (use base_instructions)",
    )
    parser.add_argument(
        "--codex-cli-path",
        default=os.environ.get("CODEX_CLI_PATH"),
        help="Path to the Codex CLI binary for codex-mcp backend",
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
        "--claude-sdk-max-thinking-tokens",
        type=int,
        default=None,
        help="Max thinking tokens for Claude SDK (optional)",
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


def _load_agent_cli_config(path: Path) -> dict:
    if not path.exists():
        return {}
    if not path.is_file():
        raise ValueError(f"Agent CLI config is not a file: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except Exception as exc:
        raise ValueError(f"Invalid JSON in agent CLI config: {path}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"Agent CLI config must be a JSON object: {path}")
    return payload


def _load_agent_cli_configs() -> tuple[dict, dict]:
    user_path = Path("~/.agent_cli.json").expanduser()
    project_path = Path.cwd() / ".agent_cli.json"
    return _load_agent_cli_config(user_path), _load_agent_cli_config(project_path)


def _looks_like_mcp_server_map(payload: object) -> bool:
    if not isinstance(payload, dict) or not payload:
        return False
    for value in payload.values():
        if not isinstance(value, dict):
            return False
        if any(key in value for key in ("command", "url", "type", "instance")):
            return True
    return False


def _normalize_mcp_payload(payload: object) -> object | None:
    if payload is None:
        return None
    if isinstance(payload, str):
        return _load_json_value(payload)
    if isinstance(payload, dict) and "mcp" in payload:
        nested = payload.get("mcp")
        if nested is not None:
            return _normalize_mcp_payload(nested)
    return payload


def _parse_mcp_payload(payload: object) -> tuple[list[dict] | None, dict | None]:
    payload = _normalize_mcp_payload(payload)
    if payload is None:
        return None, None
    if isinstance(payload, dict):
        mcp_servers = None
        servers = (
            payload.get("mcpServers")
            or payload.get("mcp_servers")
            or payload.get("servers")
        )
        if isinstance(servers, dict):
            mcp_servers = servers
        elif _looks_like_mcp_server_map(payload):
            mcp_servers = payload
        mcp_clients = None
        clients = payload.get("clients") or payload.get("mcpClients")
        if isinstance(clients, list):
            mcp_clients = clients
        return mcp_clients, mcp_servers
    if isinstance(payload, list):
        return payload, None
    return None, None


def _merge_mcp_clients(base: list[dict] | None, extra: list[dict] | None) -> list[dict] | None:
    if base and extra:
        return [*base, *extra]
    return base or extra


def _merge_mcp_servers(base: dict | None, extra: dict | None) -> dict | None:
    if base and extra:
        merged = dict(base)
        merged.update(extra)
        return merged
    return base or extra


async def main() -> None:
    args = parse_args()
    resolved_model = args.model or os.environ.get("OPENAI_MODEL")
    if not resolved_model:
        resolved_model = (
            "claude-opus-4-5-20251101"
            if args.backend == "claude-sdk"
            else "gpt-5.2-codex"
            if args.backend == "codex-mcp"
            else "gpt-5.2"
        )
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
    user_config, project_config = _load_agent_cli_configs()
    user_mcp_clients, user_mcp_servers = _parse_mcp_payload(user_config.get("mcp"))
    project_mcp_clients, project_mcp_servers = _parse_mcp_payload(project_config.get("mcp"))
    default_mcp_clients = _merge_mcp_clients(user_mcp_clients, project_mcp_clients)
    default_mcp_servers = _merge_mcp_servers(user_mcp_servers, project_mcp_servers)
    mcp_clients_source = args.mcp_clients_file or args.mcp_clients
    mcp_clients_text = _load_prompt_value(mcp_clients_source)
    if mcp_clients_text:
        os.environ["CLAUDE_MCP_CLIENTS"] = mcp_clients_text
    mcp_clients_raw = _load_json_value(mcp_clients_source)
    mcp_clients = default_mcp_clients
    mcp_servers = default_mcp_servers
    if mcp_clients_raw is not None:
        mcp_clients, mcp_servers = _parse_mcp_payload(mcp_clients_raw)
    policy_path = Path(args.agent_config).expanduser() if args.agent_config else None
    policy_config = load_policy_config(policy_path)
    policy = DefaultPolicy(policy_config)

    codex_reasoning_effort = args.codex_reasoning_effort
    if args.backend == "codex-mcp" and not codex_reasoning_effort:
        codex_reasoning_effort = "xhigh"
    codex_prompt_mode = args.codex_prompt_mode
    if args.backend == "codex-mcp" and not codex_prompt_mode:
        codex_prompt_mode = "developer"

    config = LoopConfig(
        backend=args.backend,
        model=resolved_model,
        fallback_model=args.fallback_model,
        temperature=args.temperature,
        max_context_chars=policy_config.max_context_chars,
        auto_compact_chars=policy_config.auto_compact_chars,
        micro_compact_keep_last_tools=policy_config.micro_compact_keep_last_tools,
        micro_tool_result_chars=policy_config.micro_tool_result_chars,
        enable_compaction=policy_config.enable_compaction,
        tool_log_path=args.tool_log,
        tool_log_max_chars=args.tool_log_max_chars,
        trace_log_path=args.trace_log,
        trace_log_max_chars=args.trace_log_max_chars,
        custom_system_prompt=custom_prompt,
        append_system_prompt=append_prompt,
        attribution_header=attribution_header,
        mcp_clients=mcp_clients,
        mcp_servers=mcp_servers,
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
        claude_sdk_max_thinking_tokens=(
            args.claude_sdk_max_thinking_tokens
            if args.claude_sdk_max_thinking_tokens is not None
            else (
                int(os.environ.get("CLAUDE_SDK_MAX_THINKING_TOKENS", "0") or 0)
                or None
            )
        ),
        strip_system_reminders_in_tool_results=args.strip_system_reminders
        or os.environ.get("CLAUDE_STRIP_SYSTEM_REMINDERS", "").strip().lower()
        in {"1", "true", "yes"},
        codex_cli_path=args.codex_cli_path,
        codex_reasoning_effort=codex_reasoning_effort,
        codex_prompt_mode=codex_prompt_mode,
    )
    try:
        await run_cli_loop(context, config)
    except (asyncio.CancelledError, KeyboardInterrupt):
        return


if __name__ == "__main__":
    asyncio.run(main())

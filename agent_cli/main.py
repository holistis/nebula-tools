from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from .permissions import AppContext, PermissionState
from .loop import LoopConfig, run_cli_loop


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Nebula CLI Agent (minimal Claude-style loop)")
    parser.add_argument("--root", default=".", help="Sandbox root directory for file tools")
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
        choices=["ask", "allow", "deny"],
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
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    root = Path(args.root).resolve()
    perms = PermissionState(mode=args.permission_mode, auto_approve=args.auto_approve)
    context = AppContext(root_dir=root, permissions=perms)
    config = LoopConfig(
        model=args.model,
        fallback_model=args.fallback_model,
        tool_log_path=args.tool_log,
        tool_log_max_chars=args.tool_log_max_chars,
        trace_log_path=args.trace_log,
        trace_log_max_chars=args.trace_log_max_chars,
    )
    await run_cli_loop(context, config)


if __name__ == "__main__":
    asyncio.run(main())

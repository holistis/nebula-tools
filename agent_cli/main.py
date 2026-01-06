from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from .permissions import AppContext, PermissionState
from .loop import LoopConfig, run_cli_loop


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Nebula CLI Agent (minimal Claude-style loop)")
    parser.add_argument("--root", default=".", help="Sandbox root directory for file tools")
    parser.add_argument("--model", default="gpt-4.1-mini", help="Model name")
    parser.add_argument("--fallback-model", default=None, help="Fallback model name")
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
    )
    await run_cli_loop(context, config)


if __name__ == "__main__":
    asyncio.run(main())

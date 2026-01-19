#!/usr/bin/env python3
"""Baseline harness for agent-cli parity tests.

Usage examples:
  python tests/baseline_harness.py --backend claude-sdk --model claude-opus-4-5-20251101 --temperature 0 --record
  python tests/baseline_harness.py --backend openai --model gpt-5.2 --temperature 0 --record
  python tests/baseline_harness.py --backend claude-sdk --compare
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "baseline_project"
PROMPT_PATH = ROOT / "tests" / "fixtures" / "baseline_prompt.txt"
BASELINE_DIR = ROOT / "tests" / "fixtures" / "baseline_runs"

DYNAMIC_KEYS = {
    "timestamp",
    "duration_ms",
    "session_id",
    "total_cost_usd",
    "usage",
    "uuid",
}

DROP_KEYS = {
    "tool_call_id",
    "tool_use_id",
    "toolUseId",
}


def _normalize_value(value: Any, root_path: str) -> Any:
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, val in value.items():
            if key in DYNAMIC_KEYS:
                continue
            if key in DROP_KEYS:
                continue
            if key == "id" and isinstance(val, str) and val.startswith("call_"):
                normalized[key] = "<CALL_ID>"
                continue
            normalized[key] = _normalize_value(val, root_path)
        return normalized
    if isinstance(value, list):
        return [_normalize_value(item, root_path) for item in value]
    if isinstance(value, str):
        return value.replace(root_path, "<ROOT>")
    return value


def _normalize_entry(entry: dict[str, Any], root_path: str, backend: str) -> dict[str, Any]:
    """Normalize a trace/tool entry while preserving structural intent."""
    normalized = _normalize_value(entry, root_path)
    entry_type = normalized.get("type")
    if entry_type == "assistant_output":
        # Content can be non-deterministic even at temperature 0.
        normalized.pop("content", None)
    if entry_type in {"tool_call", "tool_result"}:
        tool_name = normalized.get("tool")
        if backend == "openai" or tool_name in {"TodoWrite", "AskUserQuestion"}:
            normalized.pop("args", None)
            normalized.pop("raw_arguments", None)
            normalized.pop("result", None)
            normalized.pop("result_stripped", None)
    if entry_type == "model_response":
        message = normalized.get("message")
        if isinstance(message, dict):
            tool_calls = message.get("tool_calls")
            if isinstance(tool_calls, list):
                for call in tool_calls:
                    if not isinstance(call, dict):
                        continue
                    func = call.get("function")
                    if isinstance(func, dict):
                        if backend == "openai" or func.get("name") in {"TodoWrite", "AskUserQuestion"}:
                            func["arguments"] = "<omitted>"
    return normalized


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    if not path.exists():
        return entries
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        entries.append(json.loads(line))
    return entries


def _write_jsonl(path: Path, entries: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for entry in entries:
            handle.write(json.dumps(entry, ensure_ascii=True))
            handle.write("\n")


def _run_agent_cli(root_dir: Path, prompt: str, args: list[str]) -> subprocess.CompletedProcess[str]:
    cmd = [sys.executable, "-m", "agent_cli.main"] + args
    proc = subprocess.run(
        cmd,
        input=f"{prompt}\n/exit\n",
        text=True,
        capture_output=True,
        cwd=str(ROOT),
    )
    return proc


def _compare_jsonl(current: list[dict[str, Any]], baseline: list[dict[str, Any]]) -> bool:
    return current == baseline


def main() -> None:
    parser = argparse.ArgumentParser(description="Run baseline parity harness for agent-cli")
    parser.add_argument("--backend", choices=["openai", "claude-sdk"], default="claude-sdk")
    parser.add_argument("--model", default=None)
    parser.add_argument("--temperature", type=float, default=None)
    parser.add_argument("--record", action="store_true", help="Record baseline output")
    parser.add_argument("--compare", action="store_true", help="Compare against recorded baseline")
    parser.add_argument("--claude-preset", default="claude_code")
    parser.add_argument("--claude-tools-preset", default="claude_code")
    args = parser.parse_args()

    if not args.record and not args.compare:
        args.record = True

    prompt = PROMPT_PATH.read_text(encoding="utf-8")

    with tempfile.TemporaryDirectory(prefix="agent-cli-baseline-") as tmpdir:
        root_dir = Path(tmpdir) / "project"
        shutil.copytree(FIXTURE_DIR, root_dir)

        tool_log = Path(tmpdir) / "tool.jsonl"
        trace_log = Path(tmpdir) / "trace.jsonl"

        cmd_args = [
            "--root",
            str(root_dir),
            "--backend",
            args.backend,
            "--permission-mode",
            "allow",
            "--non-interactive",
            "--tool-log",
            str(tool_log),
            "--trace-log",
            str(trace_log),
        ]

        if args.model:
            cmd_args += ["--model", args.model]
        if args.temperature is not None:
            cmd_args += ["--temperature", str(args.temperature)]
        if args.backend == "claude-sdk" and args.claude_preset:
            cmd_args += ["--claude-sdk-preset", args.claude_preset]
            if args.claude_tools_preset:
                cmd_args += ["--claude-sdk-tools-preset", args.claude_tools_preset]

        result = _run_agent_cli(root_dir, prompt, cmd_args)
        if result.returncode != 0:
            raise SystemExit(
                f"agent-cli failed (code {result.returncode}):\nSTDERR:\n{result.stderr}\nSTDOUT:\n{result.stdout}"
            )

        raw_tool_entries = _load_jsonl(tool_log)
        raw_trace_entries = _load_jsonl(trace_log)

        root_token = str(root_dir)
        norm_tool_entries = [_normalize_value(entry, root_token) for entry in raw_tool_entries]
        norm_trace_entries = [_normalize_entry(entry, root_token, args.backend) for entry in raw_trace_entries]

        backend_dir = BASELINE_DIR / args.backend
        tool_out = backend_dir / "tool.jsonl"
        trace_out = backend_dir / "trace.jsonl"

        if args.record:
            _write_jsonl(tool_out, norm_tool_entries)
            _write_jsonl(trace_out, norm_trace_entries)
            print(f"Recorded baseline to {backend_dir}")

        if args.compare:
            baseline_tool = [_normalize_value(entry, "<ROOT>") for entry in _load_jsonl(tool_out)]
            baseline_trace = [_normalize_entry(entry, "<ROOT>", args.backend) for entry in _load_jsonl(trace_out)]
            if args.backend == "openai":
                def _tool_names(entries: list[dict[str, Any]]) -> set[str]:
                    return {e.get("tool", "") for e in entries if e.get("type") == "tool_call"}
                current_tools = _tool_names(norm_tool_entries)
                required_tools = {"LS", "Glob", "Read", "Grep", "TodoWrite"}
                tool_ok = required_tools.issubset(current_tools)
                trace_ok = True
            else:
                tool_ok = _compare_jsonl(norm_tool_entries, baseline_tool)
                trace_ok = _compare_jsonl(norm_trace_entries, baseline_trace)
            if tool_ok and trace_ok:
                print("Baseline comparison: OK")
            else:
                print("Baseline comparison: FAILED")
                print(f"Tool match: {tool_ok}, Trace match: {trace_ok}")
                raise SystemExit(2)


if __name__ == "__main__":
    main()

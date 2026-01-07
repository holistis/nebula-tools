#!/usr/bin/env python3
"""
Pretty-print a trace_log.jsonl file into a readable Markdown report.

Usage:
  python trace_log_pretty.py --input trace_log.jsonl --output trace_log.md
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def _truncate(value: str, max_chars: int) -> str:
    if max_chars <= 0 or len(value) <= max_chars:
        return value
    return value[:max_chars] + "...[truncated]"


def _format_timestamp(ts: Any) -> str:
    try:
        ts_float = float(ts)
        dt = datetime.fromtimestamp(ts_float, tz=timezone.utc)
        return dt.isoformat()
    except Exception:
        return str(ts)


def _format_value(value: Any, max_chars: int) -> str:
    if isinstance(value, str):
        return _truncate(value, max_chars)
    try:
        pretty = json.dumps(value, indent=2, ensure_ascii=False)
        return _truncate(pretty, max_chars)
    except Exception:
        return _truncate(str(value), max_chars)


def load_entries(path: Path) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            entries.append(
                {
                    "type": "parse_error",
                    "line": line_no,
                    "raw": line,
                }
            )
    return entries


def build_markdown(entries: List[Dict[str, Any]], max_chars: int) -> str:
    counts: Dict[str, int] = {}
    for entry in entries:
        key = entry.get("type", "unknown")
        counts[key] = counts.get(key, 0) + 1

    lines: List[str] = []
    lines.append("# Trace Log Report")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    if counts:
        for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
            lines.append(f"- **{key}**: {count}")
    else:
        lines.append("- No entries found.")
    lines.append("")
    lines.append("## Timeline")
    lines.append("")

    for idx, entry in enumerate(entries, 1):
        entry_type = entry.get("type", "unknown")
        timestamp = _format_timestamp(entry.get("timestamp", ""))
        header = f"### {idx}. {entry_type}"
        lines.append(header)
        if timestamp:
            lines.append("")
            lines.append(f"timestamp: {timestamp}")

        # Show all other fields
        for key, value in entry.items():
            if key in {"type", "timestamp"}:
                continue
            lines.append("")
            lines.append(f"**{key}**")
            lines.append("")
            lines.append("```")
            lines.append(_format_value(value, max_chars))
            lines.append("```")

        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Pretty-print trace_log.jsonl into Markdown.")
    parser.add_argument("--input", required=True, help="Path to trace_log.jsonl")
    parser.add_argument("--output", default=None, help="Write markdown to this path (default: stdout)")
    parser.add_argument("--max-chars", type=int, default=4000, help="Max chars per field block")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser()
    entries = load_entries(input_path)
    report = build_markdown(entries, args.max_chars)

    if args.output:
        output_path = Path(args.output).expanduser()
        output_path.write_text(report, encoding="utf-8")
    else:
        print(report, end="")


if __name__ == "__main__":
    main()

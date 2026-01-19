from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Optional

from .policy import PolicyConfig


def _coerce_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except Exception:
        return fallback


def _coerce_bool(value: Any, fallback: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes"}:
            return True
        if lowered in {"0", "false", "no"}:
            return False
    return fallback


def _load_yaml(path: Path) -> Dict[str, Any]:
    try:
        import yaml  # type: ignore
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(f"yaml package required to load {path}: {exc}") from exc
    raw = path.read_text(encoding="utf-8")
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict):
        raise ValueError("config root must be a mapping")
    return data


def load_policy_config(config_path: Optional[Path]) -> PolicyConfig:
    if not config_path:
        return PolicyConfig()
    if not config_path.exists():
        return PolicyConfig()
    data = _load_yaml(config_path)
    loop_cfg = data.get("loop", {}) if isinstance(data, dict) else {}
    if not isinstance(loop_cfg, dict):
        loop_cfg = {}
    cfg = PolicyConfig()
    cfg.max_context_chars = _coerce_int(loop_cfg.get("max_context_chars"), cfg.max_context_chars)
    cfg.auto_compact_chars = _coerce_int(loop_cfg.get("auto_compact_chars"), cfg.auto_compact_chars)
    cfg.micro_compact_keep_last_tools = _coerce_int(loop_cfg.get("micro_compact_keep_last_tools"), cfg.micro_compact_keep_last_tools)
    cfg.micro_tool_result_chars = _coerce_int(loop_cfg.get("micro_tool_result_chars"), cfg.micro_tool_result_chars)
    cfg.enable_compaction = _coerce_bool(loop_cfg.get("enable_compaction"), cfg.enable_compaction)
    return cfg


def policy_config_to_dict(config: PolicyConfig) -> Dict[str, Any]:
    return asdict(config)

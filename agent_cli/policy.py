from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .permissions import AppContext


@dataclass
class PolicyConfig:
    """Configurable policy settings (defaults mirror current behavior)."""
    max_context_chars: int = 200_000
    auto_compact_chars: int = 180_000
    micro_compact_keep_last_tools: int = 3
    micro_tool_result_chars: int = 4000
    enable_compaction: bool = True


class Policy:
    """Policy interface for agent loop decisions."""

    def __init__(self, config: PolicyConfig) -> None:
        self.config = config

    def build_system_prompt(self, context: AppContext, system_prompt: str) -> str:
        return system_prompt

    def build_user_prompt(self, context: AppContext, user_prompt: str) -> str:
        return user_prompt

    def should_micro_compact(self, total_chars: int) -> bool:
        return total_chars > self.config.max_context_chars

    def should_auto_compact(self, total_chars: int) -> bool:
        return total_chars >= self.config.auto_compact_chars

    def allow_compaction(self) -> bool:
        return bool(self.config.enable_compaction)

    def before_tool(self, tool_name: str, tool_args: Dict[str, Any]) -> None:
        return None

    def after_tool(self, tool_name: str, tool_result: Any) -> None:
        return None

    def should_stop(self, *, has_tool_calls: bool) -> bool:
        return not has_tool_calls


class DefaultPolicy(Policy):
    """Default policy that preserves existing behavior."""

    def __init__(self, config: PolicyConfig) -> None:
        super().__init__(config)

from __future__ import annotations

import os
import re
from pathlib import Path
from datetime import datetime
import platform


def _read_prompt_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _find_prompt_dir() -> Path:
    env = os.environ.get("CLAUDE_PROMPT_DIR")
    if env:
        p = Path(env).expanduser().resolve()
        if p.exists():
            return p
    # local prompts packaged with agent_cli
    local = Path(__file__).resolve().parent / "prompts"
    if local.exists():
        return local
    # fallback to claude_agentic_logic if present
    fallback = Path("/Users/S190483/claude_agentic_logic/prompts")
    if fallback.exists():
        return fallback
    raise FileNotFoundError("No prompt directory found")


def _extract_between(text: str, start: str, end: str) -> str:
    s = text.find(start)
    if s == -1:
        return ""
    s = s + len(start)
    e = text.find(end, s)
    if e == -1:
        return text[s:].strip()
    return text[s:e].strip()


def _extract_block(text: str, start: str, end_markers: list[str]) -> str:
    s = text.find(start)
    if s == -1:
        return ""
    s = s + len(start)
    tail = text[s:]
    end_positions = [tail.find(m) for m in end_markers if tail.find(m) != -1]
    if not end_positions:
        return tail.strip()
    e = min(end_positions)
    return tail[:e].strip()


def _apply_core_conditionals(
    core: str,
    output_style_configured: bool = False,
    todo_write_available: bool = True,
    ask_user_available: bool = True,
    keep_coding_instructions: bool = True,
) -> str:
    # Resolve the {either "..."} template fragments.
    def _either_repl(match: re.Match) -> str:
        left = match.group(1)
        right = match.group(2)
        return right if output_style_configured else left

    core = re.sub(r'\{either "([^"]+)" or "([^"]+)"\}', _either_repl, core)

    # Filter conditional blocks indicated by "[# ...]" headers.
    lines = core.splitlines()
    out: list[str] = []
    include = True
    for raw in lines:
        line = raw.strip()
        header = None
        if line.startswith("[#") and line.endswith("]"):
            header = line[2:-1].strip().lower()
        if header is not None:
            if "tone and style" in header:
                include = not output_style_configured
            elif "task management" in header:
                include = todo_write_available
            elif "asking questions" in header:
                include = ask_user_available
            elif "doing tasks" in header:
                include = keep_coding_instructions
            else:
                include = True
            continue
        if include:
            out.append(raw)
    return "\n".join(out).strip()


def load_system_prompt() -> str:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "system_prompt.md"
    content = _read_prompt_file(path)

    # base prompts
    base_section = _extract_block(
        content,
        "Base system prompt strings",
        ["Core system prompt template"],
    )
    base_prompts = re.findall(r'^"(.+?)"$', base_section, flags=re.MULTILINE)
    base_prompt = ""
    if base_prompts:
        override = os.environ.get("CLAUDE_BASE_PROMPT")
        if override:
            base_prompt = override.strip()
        else:
            idx_raw = os.environ.get("CLAUDE_BASE_PROMPT_INDEX")
            if idx_raw and idx_raw.isdigit():
                idx = int(idx_raw)
                if 0 <= idx < len(base_prompts):
                    base_prompt = base_prompts[idx]
            if not base_prompt:
                base_prompt = base_prompts[0]

    core = _extract_between(
        content,
        "Core system prompt template (Xy; conditional segments marked):",
        "Additional system-prompt blocks appended",
    )
    if core:
        todo_enabled = os.environ.get("CLAUDE_TODO_AVAILABLE", "1").strip() != "0"
        ask_enabled = os.environ.get("CLAUDE_ASK_USER_AVAILABLE", "1").strip() != "0"
        core = _apply_core_conditionals(
            core,
            output_style_configured=False,
            todo_write_available=todo_enabled,
            ask_user_available=ask_enabled,
            keep_coding_instructions=True,
        )

    # security policy block duplicated (FA0)
    security_lines = []
    for line in core.splitlines():
        if line.startswith("IMPORTANT:"):
            security_lines.append(line)
        elif security_lines:
            break
    security_block = "\n".join(security_lines).strip()

    code_refs = _extract_between(
        content,
        "Code References block:",
        "Environment prompt (fA0):",
    )

    env_block = _extract_block(
        content,
        "Environment prompt (fA0):",
        ["Notes block", "Scratchpad block", "Reasoning effort block", "MCP Server Instructions block"],
    )

    notes_block = _extract_block(
        content,
        "Notes block (FgT) appended after env:",
        ["Scratchpad block", "Reasoning effort block", "MCP Server Instructions block"],
    )

    # Render env placeholders
    cwd = str(Path.cwd())
    is_git = "Yes" if (Path.cwd() / ".git").exists() else "No"
    os_version = platform.uname().system + " " + platform.uname().release
    today = datetime.now().strftime("%Y-%m-%d")
    model_display = os.environ.get("MODEL_DISPLAY_NAME") or os.environ.get("OPENAI_MODEL") or "unknown"
    model_id = os.environ.get("OPENAI_MODEL") or model_display
    raw_fast_model = os.environ.get("OPENAI_FAST_MODEL", "").strip()
    fast_model_id = raw_fast_model or "unspecified"
    fast_model_configured = "Yes" if raw_fast_model else "No"

    env_block = env_block.replace("{cwd}", cwd)
    env_block = env_block.replace("{Yes/No}", is_git)
    env_block = env_block.replace("{platform}", platform.system().lower())
    env_block = env_block.replace("{uname -sr}", os_version)
    env_block = env_block.replace("{date}", today)
    env_block = env_block.replace("{model_display_name}", model_display)
    env_block = env_block.replace("{model_id}", model_id)
    env_block = env_block.replace("{fast_model_id}", fast_model_id)
    env_block = env_block.replace("{fast_model_configured}", fast_model_configured)

    additional_dirs = os.environ.get("CLAUDE_ADDITIONAL_WORKDIRS", "").strip()
    if additional_dirs:
        env_block = env_block.replace("{comma-separated}", additional_dirs)
    else:
        env_block = re.sub(
            r"^Additional working directories:.*\n?",
            "",
            env_block,
            flags=re.MULTILINE,
        )

    parts = []
    if base_prompt:
        parts.append(base_prompt)
    if core:
        parts.append(core)
    if security_block:
        parts.append(security_block)
    if code_refs:
        parts.append(code_refs)
    if env_block:
        parts.append(env_block)
    if notes_block:
        parts.append("Notes:\n" + notes_block if not notes_block.startswith("Notes:") else notes_block)

    return "\n\n".join([p.strip() for p in parts if p.strip()])


def load_tool_prompts() -> dict[str, str]:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "tool_prompts.md"
    content = _read_prompt_file(path)

    sections = {}
    pattern = re.compile(r"^(.+?) tool prompt(?:\s*\([^)]*\))?:\s*$", re.MULTILINE)
    matches = list(pattern.finditer(content))
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        body = content[start:end].strip()
        sections[name] = body
    return sections


def load_subagent_prompts() -> dict[str, str]:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "subagent_prompts.md"
    if not path.exists():
        return {}
    content = _read_prompt_file(path)
    sections: dict[str, str] = {}
    pattern = re.compile(r'^(.*?) agent \\(agentType: "([^"]+)"\\):\\s*$', re.MULTILINE)
    matches = list(pattern.finditer(content))
    for i, m in enumerate(matches):
        agent_type = m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        body = content[start:end].strip()
        sections[agent_type] = body
    return sections


def load_compaction_prompt() -> tuple[str, str]:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "compaction_prompt.md"
    if not path.exists():
        return ("You are a helpful AI assistant tasked with summarizing conversations.", "")
    content = _read_prompt_file(path)
    system_line = ""
    user_prompt = ""
    lines = content.splitlines()
    mode = None
    for line in lines:
        if line.strip().lower().startswith("system prompt"):
            mode = "system"
            continue
        if line.strip().lower().startswith("user prompt"):
            mode = "user"
            continue
        if mode == "system":
            if line.strip().startswith("\"") and line.strip().endswith("\""):
                system_line = line.strip().strip("\"")
            elif line.strip():
                system_line = line.strip()
        elif mode == "user":
            user_prompt += line + "\n"
    return (system_line or "You are a helpful AI assistant tasked with summarizing conversations.", user_prompt.strip())

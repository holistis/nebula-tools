from __future__ import annotations

import os
import re
import json
from typing import Any
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


def _normalize_markers(text: str) -> str:
    # Replace common non-ASCII dashes with ASCII hyphen for stable parsing.
    return text.replace("‑", "-").replace("–", "-").replace("—", "-")


def _read_text_or_file(value: str) -> str:
    if not value:
        return ""
    candidate = Path(value).expanduser()
    if candidate.exists() and candidate.is_file():
        return candidate.read_text(encoding="utf-8", errors="replace").strip()
    return value.strip()


def _read_text_env(name: str) -> str:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return ""
    return _read_text_or_file(raw)


def _read_json_env(name: str) -> Any:
    raw = _read_text_env(name)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _strip_html_comments(text: str) -> str:
    return re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)


def _normalize_trailing_newlines(value: str) -> str:
    if value.endswith("\n"):
        return value.rstrip("\n") + "\n"
    return value


def _extract_between(text: str, start: str, end: str) -> str:
    clean = _strip_html_comments(text)
    norm = _normalize_markers(clean)
    norm_start = _normalize_markers(start)
    norm_end = _normalize_markers(end)
    s = norm.find(norm_start)
    if s == -1:
        return ""
    s = s + len(norm_start)
    e = norm.find(norm_end, s)
    if e == -1:
        return _normalize_trailing_newlines(clean[s:].strip(" \t"))
    return _normalize_trailing_newlines(clean[s:e].strip(" \t"))


def _extract_between_markers(text: str, start_marker: str, end_marker: str) -> str:
    norm = _normalize_markers(text)
    start = _normalize_markers(start_marker)
    end = _normalize_markers(end_marker)
    s = norm.find(start)
    if s == -1:
        return ""
    s = s + len(start)
    line_end = text.find("\n", s)
    if line_end != -1:
        s = line_end + 1
    e = norm.find(end, s)
    if e == -1:
        return ""
    return _normalize_trailing_newlines(text[s:e].strip(" \t"))


def _extract_block(text: str, start: str, end_markers: list[str]) -> str:
    clean = _strip_html_comments(text)
    norm = _normalize_markers(clean)
    norm_start = _normalize_markers(start)
    s = norm.find(norm_start)
    if s == -1:
        return ""
    s = s + len(norm_start)
    tail = clean[s:]
    norm_tail = norm[s:]
    end_positions = [
        norm_tail.find(_normalize_markers(m))
        for m in end_markers
        if norm_tail.find(_normalize_markers(m)) != -1
    ]
    if not end_positions:
        return _normalize_trailing_newlines(tail.strip(" \t"))
    e = min(end_positions)
    return _normalize_trailing_newlines(tail[:e].strip(" \t"))


def _load_mcp_clients_from_env() -> list[dict]:
    raw = os.environ.get("CLAUDE_MCP_CLIENTS", "").strip()
    if not raw:
        raw = os.environ.get("CLAUDE_MCP_CLIENTS_FILE", "").strip()
    if not raw:
        return []
    try:
        payload = _read_text_or_file(raw)
        data = json.loads(payload)
    except Exception:
        return []
    if isinstance(data, dict):
        data = data.get("clients") or data.get("mcpClients") or [data]
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _client_is_connected(client: dict) -> bool:
    status = client.get("type") or client.get("status")
    if isinstance(status, str):
        return status.strip().lower() == "connected"
    if "connected" in client:
        return bool(client.get("connected"))
    return True


def _client_instructions(client: dict) -> str:
    if isinstance(client.get("instructions"), str):
        return client.get("instructions", "").strip()
    for key in ("serverInfo", "server", "config"):
        data = client.get(key)
        if isinstance(data, dict) and isinstance(data.get("instructions"), str):
            return data.get("instructions", "").strip()
    return ""


def _client_name(client: dict) -> str:
    for key in ("name", "id"):
        value = client.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    for key in ("serverInfo", "server", "config"):
        data = client.get(key)
        if isinstance(data, dict):
            value = data.get("name")
            if isinstance(value, str) and value.strip():
                return value.strip()
    return "MCP Server"


def _format_mcp_instructions(clients: list[dict]) -> str:
    entries = []
    for client in clients:
        if not _client_is_connected(client):
            continue
        instructions = _client_instructions(client)
        if not instructions:
            continue
        name = _client_name(client)
        entries.append(f"## {name}\n\n{instructions}")
    return "\n\n".join(entries).strip()


def load_claude_code_guide_config() -> dict:
    config = {}
    raw = _read_json_env("CLAUDE_CODE_GUIDE_CONFIG")
    if isinstance(raw, dict):
        config.update(raw)

    def _load_list(name: str) -> list:
        value = _read_json_env(name)
        return value if isinstance(value, list) else []

    def _load_dict(name: str) -> dict:
        value = _read_json_env(name)
        return value if isinstance(value, dict) else {}

    if not config:
        config["custom_skills"] = _load_list("CLAUDE_CUSTOM_SKILLS")
        config["custom_agents"] = _load_list("CLAUDE_CUSTOM_AGENTS")
        config["plugin_skills"] = _load_list("CLAUDE_PLUGIN_SKILLS")
        config["user_settings"] = _load_dict("CLAUDE_USER_SETTINGS_JSON")

    return config


def render_claude_code_guide_prompt(prompt: str) -> str:
    marker = "\n---\n\n# User's Current Configuration"
    if marker not in prompt:
        return prompt.strip()
    base, _ = prompt.split(marker, 1)
    base = base.strip()

    config = load_claude_code_guide_config()
    custom_skills = config.get("custom_skills") or config.get("skills") or []
    custom_agents = config.get("custom_agents") or config.get("agents") or []
    plugin_skills = config.get("plugin_skills") or []
    user_settings = config.get("user_settings") or config.get("settings") or {}

    mcp_servers = config.get("mcp_servers")
    if not mcp_servers:
        clients = _load_mcp_clients_from_env()
        mcp_servers = [
            _client_name(client)
            for client in clients
            if _client_is_connected(client)
        ]

    sections: list[str] = []

    if custom_skills:
        items = []
        for item in custom_skills:
            if isinstance(item, dict):
                name = item.get("name") or item.get("command") or item.get("id")
                desc = item.get("description") or item.get("desc") or ""
            else:
                name = str(item)
                desc = ""
            if name:
                line = f"- /{name}"
                if desc:
                    line += f": {desc}"
                items.append(line)
        if items:
            sections.append("**Available custom skills in this project:**\n" + "\n".join(items))

    if custom_agents:
        items = []
        for item in custom_agents:
            if isinstance(item, dict):
                name = item.get("agentType") or item.get("name") or item.get("id")
                desc = item.get("whenToUse") or item.get("description") or ""
            else:
                name = str(item)
                desc = ""
            if name:
                line = f"- {name}"
                if desc:
                    line += f": {desc}"
                items.append(line)
        if items:
            sections.append("**Available custom agents configured:**\n" + "\n".join(items))

    if mcp_servers:
        items = []
        for item in mcp_servers:
            if isinstance(item, dict):
                name = item.get("name") or item.get("id")
            else:
                name = str(item)
            if name:
                items.append(f"- {name}")
        if items:
            sections.append("**Configured MCP servers:**\n" + "\n".join(items))

    if plugin_skills:
        items = []
        for item in plugin_skills:
            if isinstance(item, dict):
                name = item.get("name") or item.get("command") or item.get("id")
                desc = item.get("description") or item.get("desc") or ""
            else:
                name = str(item)
                desc = ""
            if name:
                line = f"- /{name}"
                if desc:
                    line += f": {desc}"
                items.append(line)
        if items:
            sections.append("**Available plugin skills:**\n" + "\n".join(items))

    if user_settings:
        try:
            payload = json.dumps(user_settings, indent=2, sort_keys=True)
        except Exception:
            payload = str(user_settings)
        sections.append("**User's settings.json:**\n```json\n" + payload + "\n```")

    if not sections:
        return base

    block = "\n\n".join(sections)
    return (
        base
        + "\n\n---\n\n# User's Current Configuration\n\n"
        + "The user has the following custom setup in their environment:\n\n"
        + block
        + "\n\nWhen answering questions, consider these configured features and proactively suggest them when relevant."
    ).strip()


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
    had_trailing_newline = core.endswith("\n")
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
    result = "\n".join(out).strip(" \t")
    if had_trailing_newline and not result.endswith("\n"):
        result += "\n"
    return _normalize_trailing_newlines(result)


def load_base_prompts() -> list[str]:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "system_prompt.md"
    content = _read_prompt_file(path)
    base_section = _extract_between_markers(
        content,
        "<!-- BEGIN_BASE_PROMPTS",
        "<!-- END_BASE_PROMPTS",
    )
    if not base_section:
        base_section = _extract_block(
            content,
            "Base system prompt strings",
            ["Core system prompt template"],
        )
    # Drop the descriptive header line if present.
    lines = [line for line in base_section.splitlines() if line.strip()]
    if lines and lines[0].strip().lower().startswith("base system prompt strings"):
        base_section = "\n".join(lines[1:])
    base_prompts = re.findall(r'^"(.+?)"$', base_section, flags=re.MULTILINE)
    return base_prompts


def select_base_prompt(
    base_prompts: list[str],
    is_non_interactive: bool,
    has_append_system_prompt: bool,
) -> str:
    override = os.environ.get("CLAUDE_BASE_PROMPT")
    if override:
        return override.strip()
    idx_raw = os.environ.get("CLAUDE_BASE_PROMPT_INDEX")
    if idx_raw and idx_raw.isdigit():
        idx = int(idx_raw)
        if 0 <= idx < len(base_prompts):
            return base_prompts[idx]
    if is_non_interactive:
        if has_append_system_prompt and len(base_prompts) > 1:
            return base_prompts[1]
        if len(base_prompts) > 2:
            return base_prompts[2]
    return base_prompts[0] if base_prompts else ""


def load_attribution_header() -> str:
    return _read_text_env("CLAUDE_ATTRIBUTION_HEADER")


def load_system_prompt(
    root_dir: Path | None = None,
    tool_list: str | None = None,
    include_base: bool = True,
    mcp_clients: list[dict] | None = None,
    mcp_instructions: str | None = None,
) -> str:
    parts = load_system_prompt_blocks(
        root_dir=root_dir,
        tool_list=tool_list,
        include_base=include_base,
        mcp_clients=mcp_clients,
        mcp_instructions=mcp_instructions,
    )
    return "\n\n".join([p.strip() for p in parts if p.strip()]).strip()


def load_system_prompt_blocks(
    root_dir: Path | None = None,
    tool_list: str | None = None,
    include_base: bool = True,
    mcp_clients: list[dict] | None = None,
    mcp_instructions: str | None = None,
) -> list[str]:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "system_prompt.md"
    content = _read_prompt_file(path)

    # base prompts
    base_prompts = load_base_prompts()
    base_prompt = base_prompts[0] if base_prompts else ""

    core = _extract_between_markers(
        content,
        "<!-- BEGIN_CORE_PROMPT",
        "<!-- END_CORE_PROMPT",
    )
    if core:
        core_lines = core.splitlines()
        if core_lines and core_lines[0].strip().lower().startswith("core system prompt template"):
            core = "\n".join(core_lines[1:])
    if not core:
        core = _extract_between(
            content,
            "Core system prompt template (Xy; conditional segments marked):",
            "Additional system-prompt blocks appended",
        )
    if core:
        todo_enabled = os.environ.get("CLAUDE_TODO_AVAILABLE", "1").strip() != "0"
        ask_enabled = os.environ.get("CLAUDE_ASK_USER_AVAILABLE", "1").strip() != "0"
        output_style_configured = os.environ.get("CLAUDE_OUTPUT_STYLE", "").strip().lower() not in {
            "",
            "default",
        }
        core = _apply_core_conditionals(
            core,
            output_style_configured=output_style_configured,
            todo_write_available=todo_enabled,
            ask_user_available=ask_enabled,
            keep_coding_instructions=True,
        )
        if core and not core.endswith("\n"):
            core += "\n"

    # security policy block duplicated (FA0)
    security_block = ""
    for line in core.splitlines():
        if line.startswith("IMPORTANT:"):
            security_block = line.strip() + "\n"
            break

    todo_reminder = ""
    todo_match = re.search(
        r'"(IMPORTANT: Always use the TodoWrite tool[^"]+)"',
        _normalize_markers(content),
    )
    if todo_match:
        todo_reminder = todo_match.group(1).strip()

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

    scratchpad_block = _extract_block(
        content,
        "Scratchpad block (wK1; only if enabled):",
        ["Reasoning effort block", "MCP Server Instructions block", "MCP CLI block"],
    )

    reasoning_block = _extract_block(
        content,
        "Reasoning effort block (NK1; only if configured):",
        ["MCP Server Instructions block", "MCP CLI block"],
    )

    mcp_block = _extract_block(
        content,
        "MCP Server Instructions block (FK1; only if connected servers provide instructions):",
        ["MCP CLI block"],
    )

    mcp_cli_block = _extract_block(
        content,
        "MCP CLI block (zA0; appended at top-level system prompt if mcp-cli available):",
        [],
    )

    # Render env placeholders
    root = root_dir or Path.cwd()
    cwd = str(root)
    is_git = "Yes" if (root / ".git").exists() else "No"
    os_version = platform.uname().system + " " + platform.uname().release
    today = datetime.now().strftime("%Y-%m-%d")
    model_display = (
        os.environ.get("MODEL_DISPLAY_NAME")
        or os.environ.get("CLAUDE_MODEL_DISPLAY_NAME")
        or os.environ.get("OPENAI_MODEL")
        or "unknown"
    )
    model_id = (
        os.environ.get("MODEL_ID")
        or os.environ.get("CLAUDE_MODEL_ID")
        or os.environ.get("OPENAI_MODEL")
        or model_display
    )
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

    parts: list[str] = []
    if include_base and base_prompt:
        parts.append(base_prompt)
    if core:
        parts.append(core)
    if security_block:
        parts.append(security_block)
    if todo_reminder and todo_enabled:
        parts.append(todo_reminder)
    if code_refs:
        parts.append(code_refs)
    if env_block:
        parts.append(env_block)

    output_style = os.environ.get("CLAUDE_OUTPUT_STYLE", "").strip()
    if output_style and output_style.lower() != "default":
        parts.append(output_style)

    resolved_instructions = mcp_instructions or _read_text_env("CLAUDE_MCP_INSTRUCTIONS")
    if not resolved_instructions:
        clients = mcp_clients or _load_mcp_clients_from_env()
        resolved_instructions = _format_mcp_instructions(clients)
    if resolved_instructions and mcp_block:
        mcp_payload = mcp_block.replace(
            "## {server name}\n{server instructions}",
            resolved_instructions,
        )
        parts.append(mcp_payload)

    scratchpad_path = os.environ.get("CLAUDE_SCRATCHPAD_PATH", "").strip()
    if scratchpad_path and scratchpad_block:
        parts.append(scratchpad_block.replace("{scratchpad_path}", scratchpad_path))

    reasoning_effort = os.environ.get("CLAUDE_REASONING_EFFORT", "").strip().lower()
    if reasoning_effort and reasoning_block:
        mapped = {
            "low": "45",
            "medium": "75",
            "high": "99",
        }.get(reasoning_effort, reasoning_effort)
        parts.append(
            reasoning_block.replace("{low|medium|high -> 45/75/99}", mapped)
        )
    if tool_list:
        parts = [
            p.replace("{tool list}", tool_list) if p else p
            for p in parts
        ]
    else:
        parts = [
            re.sub(r"^.*\{tool list\}.*\n?", "", p, flags=re.MULTILINE)
            if p else p
            for p in parts
        ]
    cleaned: list[str] = []
    for part in parts:
        if not part or not part.strip():
            continue
        cleaned.append(part.strip(" \t"))
    return cleaned


def load_notes_block() -> str:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "system_prompt.md"
    content = _read_prompt_file(path)
    notes_block = _extract_block(
        content,
        "Notes block (FgT) appended after env:",
        ["Scratchpad block", "Reasoning effort block", "MCP Server Instructions block"],
    )
    if not notes_block:
        return ""
    if not notes_block.startswith("Notes:"):
        notes_block = "Notes:\n" + notes_block
    return notes_block.strip()


def load_mcp_cli_block() -> str:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "system_prompt.md"
    content = _read_prompt_file(path)
    block = _extract_block(
        content,
        "MCP CLI block (zA0; appended at top-level system prompt if mcp-cli available):",
        [],
    )
    if not block:
        return ""
    mcp_cli_available = os.environ.get("CLAUDE_MCP_CLI_AVAILABLE", "").strip() in {"1", "true", "yes"}
    if not mcp_cli_available:
        return ""
    mcp_cli_tools = os.environ.get("CLAUDE_MCP_CLI_TOOLS", "").strip()
    if mcp_cli_tools:
        return block.replace("{server/tool list}", mcp_cli_tools)
    return block.strip()


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
        body = _strip_html_comments(content[start:end]).strip()
        sections[name] = body
    return sections


def load_subagent_prompts() -> dict[str, str]:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "subagent_prompts.md"
    if not path.exists():
        return {}
    content = _read_prompt_file(path)
    sections: dict[str, str] = {}
    pattern = re.compile(r'^(.*?) agent \(agentType: "([^"]+)"\):\s*$', re.MULTILINE)
    matches = list(pattern.finditer(content))
    for i, m in enumerate(matches):
        agent_type = m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        body = _strip_html_comments(content[start:end]).strip()
        sections[agent_type] = body
    return sections


def load_subagent_metadata() -> dict[str, dict]:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "subagent_metadata.json"
    if not path.exists():
        return {}
    try:
        payload = json.loads(_read_prompt_file(path))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def load_plan_mode_prompt(plan_file_path: str, plan_exists: bool) -> str:
    prompt_dir = _find_prompt_dir()
    path = prompt_dir / "plan_mode.md"
    if not path.exists():
        return ""
    content = _read_prompt_file(path)
    lines: list[str] = []
    for raw in content.splitlines():
        line = raw.strip()
        if line.startswith("{If plan exists}"):
            if plan_exists:
                lines.append(raw.replace("{If plan exists}", "").strip())
            continue
        if line.startswith("{If not}"):
            if not plan_exists:
                lines.append(raw.replace("{If not}", "").strip())
            continue
        lines.append(raw)
    text = "\n".join(lines).strip()
    return text.replace("{planFilePath}", plan_file_path)


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

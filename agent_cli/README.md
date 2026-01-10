# Nebula CLI Agent (minimal Claude-style loop)

This is a minimal, CLI-only agent that reproduces the core behavior of the default Claude Code loop (tool-call loop, micro/auto compaction, fallback), without MCP or hooks. It uses the OpenAI SDK for model calls and local filesystem tools implemented in Python.

## Requirements
- Python 3.10+
- OpenAI API key in `OPENAI_API_KEY` (for OpenAI-hosted models)
- For LiteLLM models, set provider-specific env vars (for example `ANTHROPIC_API_KEY`) or `LITELLM_API_KEY`
- For `claude-sdk` backend: Claude Code CLI installed and accessible, plus `claude-agent-sdk`

## Setup
```bash
cd /Users/S190483/Downloads/nebula-tools
python -m venv .venv
source .venv/bin/activate
pip install -r agent_cli/requirements.txt
```

## Run
```bash
python -m agent_cli.main --root . --model gpt-5.2
```

LiteLLM example:
```bash
python -m agent_cli.main --root . --model litellm/anthropic/claude-3-5-sonnet
```

Claude Agent SDK (Claude Code CLI) example:
```bash
python -m agent_cli.main --backend claude-sdk --claude-sdk-preset claude_code --model claude-sonnet-4-5
```

Options:
- `--root`: sandbox root directory for file operations (default: current directory)
- `--backend`: `openai|claude-sdk` (default: `openai`)
- `--model`: model name (default: `gpt-5.2`)
- `--permission-mode`: `ask|allow|deny|plan` (default: `ask`)
- `--auto-approve`: auto-approve tool calls in ask mode
- `--fallback-model`: fallback model name (default: `gpt-5-mini`)
- `--tool-log`: write JSONL tool call logs to the given path (optional)
- `--tool-log-max-chars`: max characters per tool log field (0 disables truncation)
- `--trace-log`: write JSONL trace logs (prompts/messages/tool results) to the given path (optional)
- `--trace-log-max-chars`: max characters per trace log field (0 disables truncation)
- `--system-prompt`: custom system prompt string or file path (optional)
- `--append-system-prompt`: append system prompt string or file path (optional)
- `--attribution-header`: attribution header string or file path (optional)
- `--mcp-clients`: JSON string or file path for MCP client list (optional)
- `--mcp-clients-file`: JSON file path for MCP client list (optional)
- `--claude-sdk-preset`: Claude Agent SDK system prompt preset (e.g., `claude_code`). When set, local prompts are ignored.
- `--claude-sdk-tools-preset`: Claude Agent SDK tools preset (e.g., `claude_code`)
- `--claude-sdk-cli-path`: path to the Claude Code CLI binary (optional)
- `--claude-sdk-settings`: path to Claude Code settings JSON (optional)
- `--claude-sdk-stream`: stream partial Claude SDK output to console (optional)
- `--claude-sdk-compat`: enable Claude-SDK compatibility features (hooks + permission callback)
- `--claude-sdk-hooks`: log Claude SDK tool activity via hooks
- `--claude-sdk-permission-callback`: use local permission checks for Claude SDK tool calls
- `--claude-sdk-auto-continue`: auto-send approval if Claude SDK asks to proceed
- `--strip-system-reminders`: strip <system-reminder> tags from tool results before sending to the model
- `--non-interactive`: use non-interactive base prompt selection
```

## Notes
- No MCP servers or hooks are used.
- Tools implemented: Read, Write, Edit, Grep, Glob, LS, Bash, Task, TaskOutput, AskUserQuestion, TodoWrite.
- Permission gating is handled inside tools (simple CLI prompt).
- System prompt is loaded from `agent_cli/prompts/system_prompt.md` by default.
- Compaction prompt is loaded from `agent_cli/prompts/compaction_prompt.md`.
- Override prompt directory with `CLAUDE_PROMPT_DIR`.
- To use LiteLLM, prefix the model with `litellm/` and set `LITELLM_API_KEY` (optional) or provider-specific env vars. `LITELLM_API_BASE`/`LITELLM_BASE_URL` are passed through if set.
- Trace logs include the system prompt, user inputs, model requests, model responses, and tool results. They may contain sensitive content (including secrets typed into the session).
- Tool results containing `<system-reminder>` blocks are parsed for logging (reminders are logged separately; stripped results are recorded for diagnostics).
- Optional env: `AGENT_BACKEND`, `CLAUDE_SDK_PRESET`, `CLAUDE_SDK_TOOLS_PRESET`, `CLAUDE_SDK_CLI_PATH`, `CLAUDE_SDK_SETTINGS`, `CLAUDE_SDK_COMPAT`, `CLAUDE_SDK_STREAM`, `CLAUDE_SDK_HOOKS`, `CLAUDE_SDK_PERMISSION_CALLBACK`, `CLAUDE_SDK_AUTO_CONTINUE`, `CLAUDE_STRIP_SYSTEM_REMINDERS`, `CLAUDE_BASE_PROMPT_INDEX` (0-2) or `CLAUDE_BASE_PROMPT`, `CLAUDE_ADDITIONAL_WORKDIRS`, `CLAUDE_TODO_AVAILABLE`, `CLAUDE_ASK_USER_AVAILABLE`, `OPENAI_FAST_MODEL` (hint for lightweight subagent model selection), `CLAUDE_SYSTEM_PROMPT`, `CLAUDE_APPEND_SYSTEM_PROMPT`, `CLAUDE_NON_INTERACTIVE`, `CLAUDE_ATTRIBUTION_HEADER` (string or file path), `CLAUDE_MCP_CLIENTS` (JSON string or file path), `CLAUDE_MCP_CLIENTS_FILE` (JSON file path).
- `CLAUDE_CODE_GUIDE_CONFIG` supports JSON (string or file) with keys: custom_skills, custom_agents, plugin_skills, user_settings, mcp_servers.
- `CLAUDE_MCP_CLIENTS` expects a JSON array of objects with at least `name` and `instructions` (and `type: \"connected\"` if you want to mirror FK1 filtering).
- Optional blocks: `CLAUDE_OUTPUT_STYLE`, `CLAUDE_MCP_INSTRUCTIONS` (string or file path), `CLAUDE_SCRATCHPAD_PATH`, `CLAUDE_REASONING_EFFORT`, `CLAUDE_MCP_CLI_AVAILABLE` + `CLAUDE_MCP_CLI_TOOLS`.
- Subagent prompts used by Task are loaded from `agent_cli/prompts/subagent_prompts.md`.
- Built-in subagent types: `general-purpose`, `Explore`, `Plan`, `statusline-setup`, `claude-code-guide`.

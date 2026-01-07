# Nebula CLI Agent (minimal Claude-style loop)

This is a minimal, CLI-only agent that reproduces the core behavior of the default Claude Code loop (tool-call loop, micro/auto compaction, fallback), without MCP or hooks. It uses the OpenAI SDK for model calls and local filesystem tools implemented in Python.

## Requirements
- Python 3.10+
- OpenAI API key in `OPENAI_API_KEY` (for OpenAI-hosted models)
- For LiteLLM models, set provider-specific env vars (for example `ANTHROPIC_API_KEY`) or `LITELLM_API_KEY`

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

Options:
- `--root`: sandbox root directory for file operations (default: current directory)
- `--model`: model name (default: `gpt-5.2`)
- `--permission-mode`: `ask|allow|deny` (default: `ask`)
- `--auto-approve`: auto-approve tool calls in ask mode
- `--fallback-model`: fallback model name (default: `gpt-5-mini`)
- `--tool-log`: write JSONL tool call logs to the given path (optional)
- `--tool-log-max-chars`: max characters per tool log field (0 disables truncation)
- `--trace-log`: write JSONL trace logs (prompts/messages/tool results) to the given path (optional)
- `--trace-log-max-chars`: max characters per trace log field (0 disables truncation)
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
- Optional env: `CLAUDE_BASE_PROMPT_INDEX` (0-2) or `CLAUDE_BASE_PROMPT`, `CLAUDE_ADDITIONAL_WORKDIRS`, `CLAUDE_TODO_AVAILABLE`, `CLAUDE_ASK_USER_AVAILABLE`, `OPENAI_FAST_MODEL` (hint for lightweight subagent model selection).
- Subagent prompts used by Task are loaded from `agent_cli/prompts/subagent_prompts.md`.

# Nebula CLI Agent (minimal Claude-style loop)

This is a minimal, CLI-only agent that reproduces the core behavior of the default Claude Code loop (tool-call loop, micro/auto compaction, fallback), without MCP or hooks. It uses the OpenAI SDK for model calls and local filesystem tools implemented in Python.

## Requirements
- Python 3.10+
- OpenAI API key in `OPENAI_API_KEY`

## Setup
```bash
cd /Users/S190483/Downloads/nebula-tools
python -m venv .venv
source .venv/bin/activate
pip install -r agent_cli/requirements.txt
```

## Run
```bash
python -m agent_cli.main --root . --model gpt-4.1-mini
```

Options:
- `--root`: sandbox root directory for file operations (default: current directory)
- `--model`: model name (default: `gpt-4.1-mini`)
- `--permission-mode`: `ask|allow|deny` (default: `ask`)
- `--auto-approve`: auto-approve tool calls in ask mode
- `--fallback-model`: fallback model name (optional)
- `--tool-log`: write JSONL tool call logs to the given path (optional)

## Notes
- No MCP servers or hooks are used.
- Tools implemented: Read, Write, Edit, Grep, Glob, LS, Bash, Task, TaskOutput, AskUserQuestion, TodoWrite.
- Permission gating is handled inside tools (simple CLI prompt).
- System prompt is loaded from `agent_cli/prompts/system_prompt.md` by default.
- Compaction prompt is loaded from `agent_cli/prompts/compaction_prompt.md`.
- Override prompt directory with `CLAUDE_PROMPT_DIR`.
- Optional env: `CLAUDE_BASE_PROMPT_INDEX` (0-2) or `CLAUDE_BASE_PROMPT`, `CLAUDE_ADDITIONAL_WORKDIRS`, `CLAUDE_TODO_AVAILABLE`, `CLAUDE_ASK_USER_AVAILABLE`, `OPENAI_FAST_MODEL` (hint for lightweight subagent model selection).
- Subagent prompts used by Task are loaded from `agent_cli/prompts/subagent_prompts.md`.

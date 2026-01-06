from __future__ import annotations

import json
from typing import Any, Dict, List

from .prompt_loader import load_tool_prompts


TOOL_PROMPTS = load_tool_prompts()
TOOL_PROMPT_ALIASES = {
    "Task": "Task (agent)",
}


def _desc(name: str, fallback: str) -> str:
    key = TOOL_PROMPT_ALIASES.get(name, name)
    return TOOL_PROMPTS.get(key, "").strip() or fallback


def _schema(props: Dict[str, Any], required: List[str], description: str | None = None) -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": props,
        "required": required,
        "additionalProperties": False,
        **({"description": description} if description else {}),
    }


def _prop(type_name: str, description: str, **extra: Any) -> Dict[str, Any]:
    data = {"type": type_name, "description": description}
    data.update(extra)
    return data


TOOL_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "Read": _schema(
        {
            "file_path": _prop("string", "Absolute path to the file to read."),
            "offset": _prop("integer", "0-based line offset to start reading from.", default=0),
            "limit": _prop("integer", "Maximum number of lines to return.", default=2000),
        },
        ["file_path"],
        description="Read a file from disk with optional line slicing.",
    ),
    "Write": _schema(
        {
            "file_path": _prop("string", "Absolute path to write. Existing files require a prior Read."),
            "content": _prop("string", "Full file contents to write."),
        },
        ["file_path", "content"],
        description="Write a file to disk (overwrites if it exists).",
    ),
    "Edit": _schema(
        {
            "file_path": _prop("string", "Absolute path to the file to edit."),
            "old_string": _prop("string", "Exact text to replace (must exist)."),
            "new_string": _prop("string", "Replacement text."),
            "replace_all": _prop("boolean", "Replace all occurrences if true.", default=False),
        },
        ["file_path", "old_string", "new_string"],
        description="Replace a string in a file (single or all occurrences).",
    ),
    "Grep": _schema(
        {
            "pattern": _prop("string", "Ripgrep regex pattern to search for."),
            "path": _prop("string", "Base directory or file to search (defaults to sandbox root)."),
            "glob": _prop("string", "Glob filter (e.g., '**/*.py')."),
            "output_mode": _prop(
                "string",
                "Output style: content, files_with_matches, or count.",
                enum=["content", "files_with_matches", "count"],
            ),
            "type": _prop("string", "Ripgrep file type filter (e.g., 'js', 'py')."),
            "multiline": _prop("boolean", "Enable multi-line matching.", default=False),
        },
        ["pattern"],
        description="Search file contents using ripgrep.",
    ),
    "Glob": _schema(
        {
            "pattern": _prop("string", "Glob pattern to match (relative to base path)."),
            "path": _prop("string", "Base directory to search (defaults to sandbox root)."),
        },
        ["pattern"],
        description="Find files by glob pattern.",
    ),
    "LS": _schema(
        {
            "path": _prop("string", "Directory to list (defaults to sandbox root)."),
        },
        [],
        description="List directory entries.",
    ),
    "Bash": _schema(
        {
            "command": _prop("string", "Shell command to execute."),
            "timeout": _prop("integer", "Timeout in milliseconds.", default=30000),
            "description": _prop("string", "Short description for logging."),
            "run_in_background": _prop("boolean", "Run asynchronously and return a task id.", default=False),
            "dangerouslyDisableSandbox": _prop(
                "boolean",
                "Request sandbox bypass (only when required or explicitly asked).",
                default=False,
            ),
        },
        ["command"],
        description="Run a shell command.",
    ),
    "Task": _schema(
        {
            "description": _prop("string", "Short (3-5 words) summary of the agent task."),
            "prompt": _prop("string", "Detailed instructions for the subagent."),
            "subagent_type": _prop("string", "Agent type to launch (e.g., Explore, Plan)."),
            "model": _prop("string", "Optional model override for the subagent."),
            "resume": _prop("string", "Resume a previous agent id."),
            "run_in_background": _prop("boolean", "Run asynchronously.", default=False),
        },
        ["description", "prompt", "subagent_type"],
        description="Launch a subagent for complex or parallelizable work.",
    ),
    "TaskOutput": _schema(
        {
            "task_id": _prop("string", "Task id from Task or background Bash."),
            "block": _prop("boolean", "Wait for completion if true.", default=True),
            "timeout": _prop("integer", "Timeout in milliseconds.", default=30000),
        },
        ["task_id"],
        description="Retrieve output from a running or completed task.",
    ),
    "AskUserQuestion": _schema(
        {
            "questions": {
                "type": "array",
                "description": "Question list to present to the user.",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": _prop("string", "The question text shown to the user."),
                        "header": _prop("string", "Short header label for the question."),
                        "options": {
                            "type": "array",
                            "description": "Optional multiple-choice options.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": _prop("string", "Short option label."),
                                    "description": _prop("string", "Option description."),
                                },
                                "required": ["label", "description"],
                                "additionalProperties": False,
                            },
                        },
                        "multiSelect": _prop("boolean", "Allow selecting multiple options.", default=False),
                    },
                    "required": ["question", "header", "options", "multiSelect"],
                    "additionalProperties": False,
                },
            },
            "answers": {
                "type": "array",
                "description": "Optional prefilled answers (question/answer pairs).",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": _prop("string", "Question text to answer."),
                        "answer": _prop("string", "Answer value."),
                    },
                    "required": ["question", "answer"],
                    "additionalProperties": False,
                },
            },
        },
        ["questions"],
        description="Ask the user clarifying questions and capture responses.",
    ),
    "TodoWrite": _schema(
        {
            "todos": {
                "type": "array",
                "description": "Structured todo list items.",
                "items": {
                    "type": "object",
                    "properties": {
                        "content": _prop("string", "Todo item description."),
                        "status": _prop("string", "Todo status (pending/in_progress/completed)."),
                        "activeForm": _prop("string", "Verb phrase describing the task in progress."),
                    },
                    "required": ["content", "status", "activeForm"],
                    "additionalProperties": False,
                },
            }
        },
        ["todos"],
        description="Create or update the session todo list.",
    ),
}


def build_openai_tools() -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = []
    for name, schema in TOOL_SCHEMAS.items():
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": _desc(name, f"{name} tool"),
                    "parameters": schema,
                },
            }
        )
    return tools


def stringify_tool_result(result: Any) -> str:
    if isinstance(result, str):
        return result
    try:
        return json.dumps(result)
    except Exception:
        return str(result)

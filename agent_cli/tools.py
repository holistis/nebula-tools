from __future__ import annotations

import asyncio
import glob as globlib
import inspect
import os
import re
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List, Dict, Any

from agents import function_tool, RunContextWrapper, Agent

from .permissions import AppContext
from .prompt_loader import load_tool_prompts, load_subagent_prompts

MAX_LINE_LENGTH = 2000
DEFAULT_LIMIT = 2000

TOOL_PROMPTS = load_tool_prompts()
SUBAGENT_PROMPTS = load_subagent_prompts()


@dataclass
class _ResolvedPath:
    path: Optional[Path]
    error: Optional[str]


@dataclass
class _BackgroundProcess:
    proc: subprocess.Popen
    start_time: float
    command: str


def _resolve_absolute(ctx: RunContextWrapper[AppContext], file_path: str) -> _ResolvedPath:
    raw = Path(file_path).expanduser()
    if not raw.is_absolute():
        return _ResolvedPath(None, "file_path must be an absolute path")
    try:
        resolved = ctx.context.resolve_path(str(raw))
    except PermissionError as exc:
        return _ResolvedPath(None, str(exc))
    return _ResolvedPath(resolved, None)


def _truncate_line(line: str) -> str:
    if len(line) <= MAX_LINE_LENGTH:
        return line
    return line[:MAX_LINE_LENGTH] + "..."


def _format_with_line_numbers(lines: List[str], start_line: int) -> str:
    out = []
    for idx, line in enumerate(lines):
        line_no = start_line + idx
        out.append(f"{line_no:6}\t{_truncate_line(line)}")
    return "\n".join(out)


# Raw tool implementations (undecorated)

def _read_file(
    ctx: RunContextWrapper[AppContext],
    file_path: str,
    offset: int = 0,
    limit: int = DEFAULT_LIMIT,
) -> str:
    resolved = _resolve_absolute(ctx, file_path)
    if resolved.error:
        return f"Error: {resolved.error}"
    path = resolved.path
    if path is None:
        return "Error: Invalid path"
    target = ctx.context.target_label(path)
    if not ctx.context.permissions.check("Read", target):
        return f"Permission denied for Read: {target}"
    if not path.exists():
        return f"File not found: {target}"
    if path.is_dir():
        return f"Path is a directory: {target}"
    data = path.read_text(encoding="utf-8", errors="replace")
    lines = data.splitlines()
    offset = max(offset, 0)
    limit = max(limit, 0)
    slice_lines = lines[offset : offset + limit]
    ctx.context.note_read(path)
    return _format_with_line_numbers(slice_lines, offset + 1)


def _write_file(
    ctx: RunContextWrapper[AppContext],
    file_path: str,
    content: str,
) -> Dict[str, Any]:
    if ctx.context.read_only:
        return {"error": "Write is disabled in read-only mode"}
    resolved = _resolve_absolute(ctx, file_path)
    if resolved.error:
        return {"error": resolved.error}
    path = resolved.path
    if path is None:
        return {"error": "Invalid path"}
    target = ctx.context.target_label(path)
    if not ctx.context.permissions.check("Write", target):
        return {"error": f"Permission denied for Write: {target}"}
    path.parent.mkdir(parents=True, exist_ok=True)
    existed = path.exists()
    if existed and not ctx.context.has_read(path):
        return {"error": "Write requires prior Read of existing file"}
    path.write_text(content, encoding="utf-8")
    return {"status": "updated" if existed else "created", "file": str(path)}


def _edit_file(
    ctx: RunContextWrapper[AppContext],
    file_path: str,
    old_string: str,
    new_string: str,
    replace_all: bool = False,
) -> Dict[str, Any]:
    if ctx.context.read_only:
        return {"error": "Edit is disabled in read-only mode"}
    resolved = _resolve_absolute(ctx, file_path)
    if resolved.error:
        return {"error": resolved.error}
    path = resolved.path
    if path is None:
        return {"error": "Invalid path"}
    target = ctx.context.target_label(path)
    if not ctx.context.permissions.check("Edit", target):
        return {"error": f"Permission denied for Edit: {target}"}
    if not path.exists():
        return {"error": f"File not found: {target}"}
    if not ctx.context.has_read(path):
        return {"error": "Edit requires prior Read of file"}
    data = path.read_text(encoding="utf-8", errors="replace")
    count = data.count(old_string)
    if count == 0:
        return {"error": "old_string not found"}
    if not replace_all and count > 1:
        return {"error": "old_string is not unique; set replace_all=true"}
    if replace_all:
        new_data = data.replace(old_string, new_string)
    else:
        new_data = data.replace(old_string, new_string, 1)
    path.write_text(new_data, encoding="utf-8")
    return {"status": "ok", "replacements": count if replace_all else 1}


def _glob_files(
    ctx: RunContextWrapper[AppContext],
    pattern: str,
    path: Optional[str] = None,
) -> List[str]:
    try:
        base = ctx.context.resolve_path(path or str(ctx.context.root_dir))
    except PermissionError as exc:
        return [f"Error: {exc}"]
    target = ctx.context.target_label(base)
    if not ctx.context.permissions.check("Glob", target):
        return [f"Permission denied for Glob in {target}"]
    full_pattern = str(base / pattern)
    paths = [Path(p).resolve() for p in globlib.glob(full_pattern, recursive=True)]
    unique = {str(p): p for p in paths}.values()
    def _mtime(p: Path) -> float:
        try:
            return p.stat().st_mtime
        except Exception:
            return 0.0
    ordered = sorted(unique, key=lambda p: (_mtime(p), str(p)), reverse=True)
    return [str(p) for p in ordered]


def _grep_files(
    ctx: RunContextWrapper[AppContext],
    pattern: str,
    path: Optional[str] = None,
    glob: Optional[str] = None,
    type: Optional[str] = None,
    multiline: bool = False,
    output_mode: str = "files_with_matches",
) -> Dict[str, Any]:
    try:
        base = ctx.context.resolve_path(path or str(ctx.context.root_dir))
    except PermissionError as exc:
        return {"error": str(exc)}
    target = ctx.context.target_label(base)
    if not ctx.context.permissions.check("Grep", target):
        return {"error": f"Permission denied for Grep in {target}"}
    rg_path = shutil.which("rg")
    if rg_path:
        cmd = [rg_path, "--color=never", "--no-messages"]
        if output_mode == "files_with_matches":
            cmd.append("-l")
        elif output_mode == "count":
            cmd.append("-c")
        else:
            cmd.append("-n")
        if multiline:
            cmd.append("-U")
        if glob:
            cmd.extend(["--glob", glob])
        if type:
            cmd.extend(["-t", type])
        cmd.extend([pattern, str(base)])
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(ctx.context.root_dir),
                capture_output=True,
                text=True,
            )
        except Exception as exc:
            return {"error": f"rg failed: {exc}"}
        if proc.returncode not in (0, 1):
            return {"error": proc.stderr.strip() or "rg failed"}
        lines = [line for line in proc.stdout.splitlines() if line.strip()]
        if output_mode == "files_with_matches":
            matches = []
            for line in lines:
                p = Path(line)
                if not p.is_absolute():
                    p = (ctx.context.root_dir / p).resolve()
                matches.append(str(p))
            return {"matches": matches}
        if output_mode == "count":
            counts: Dict[str, int] = {}
            for line in lines:
                if ":" in line:
                    file_part, count_part = line.split(":", 1)
                    try:
                        count_val = int(count_part.strip())
                    except ValueError:
                        continue
                    p = Path(file_part)
                    if not p.is_absolute():
                        p = (ctx.context.root_dir / p).resolve()
                    counts[str(p)] = count_val
            return {"counts": counts}
        matches: Dict[str, List[str]] = {}
        for line in lines:
            parts = line.split(":", 2)
            if len(parts) < 3:
                continue
            file_part, line_no, content = parts
            p = Path(file_part)
            if not p.is_absolute():
                p = (ctx.context.root_dir / p).resolve()
            key = str(p)
            matches.setdefault(key, []).append(f"{line_no}:{_truncate_line(content)}")
        output = []
        for file_path, lines_out in matches.items():
            output.append(file_path + "\n" + "\n".join(lines_out))
        return {"matches": output}

    regex_flags = re.DOTALL if multiline else 0
    regex = re.compile(pattern, regex_flags)

    files: List[Path] = []
    if base.is_file():
        files = [base]
    else:
        if type and not glob:
            glob = f"**/*.{type}"
        if glob:
            for p in base.rglob(glob):
                if p.is_file():
                    files.append(p)
        else:
            for p in base.rglob("*"):
                if p.is_file():
                    files.append(p)

    matches: List[str] = []
    counts: Dict[str, int] = {}
    for f in files:
        try:
            data = f.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        found = False
        out_lines: List[str] = []
        if multiline:
            if regex.search(data):
                found = True
                if output_mode == "content":
                    out_lines.append("0:multiline match")
        else:
            for idx, line in enumerate(data.splitlines(), start=1):
                if regex.search(line):
                    found = True
                    if output_mode == "content":
                        out_lines.append(f"{idx}:{_truncate_line(line)}")
        if found:
            counts[str(f)] = counts.get(str(f), 0) + (len(out_lines) if output_mode == "content" else 1)
            if output_mode == "files_with_matches":
                matches.append(str(f))
            elif output_mode == "content":
                matches.append(str(f) + "\n" + "\n".join(out_lines))
    if output_mode == "count":
        return {"counts": counts}
    return {"matches": matches}


def _list_directory(
    ctx: RunContextWrapper[AppContext],
    path: Optional[str] = None,
) -> List[str]:
    try:
        base = ctx.context.resolve_path(path or str(ctx.context.root_dir))
    except PermissionError as exc:
        return [f"Error: {exc}"]
    target = ctx.context.target_label(base)
    if not ctx.context.permissions.check("LS", target):
        return [f"Permission denied for LS in {target}"]
    if not base.exists() or not base.is_dir():
        return [f"Not a directory: {target}"]
    return sorted([p.name for p in base.iterdir()])


def _run_shell(
    ctx: RunContextWrapper[AppContext],
    command: str,
    timeout: int = 30000,
    description: Optional[str] = None,
    run_in_background: bool = False,
    dangerouslyDisableSandbox: bool = False,
) -> Dict[str, Any]:
    _ = description
    _ = dangerouslyDisableSandbox
    if ctx.context.read_only and not _is_read_only_command(command):
        return {"error": "Bash is restricted in read-only mode"}
    if not ctx.context.permissions.check("Bash", command.strip()):
        return {"error": "Permission denied for Bash"}
    start = time.time()
    if run_in_background:
        try:
            proc = subprocess.Popen(
                command,
                shell=True,
                cwd=str(ctx.context.root_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except Exception as exc:
            return {"error": f"Failed to start process: {exc}"}
        task_id = str(uuid.uuid4())
        ctx.context.tasks[task_id] = _BackgroundProcess(proc=proc, start_time=start, command=command)
        return {
            "stdout": "",
            "stderr": "",
            "returncode": None,
            "duration_ms": 0,
            "backgroundTaskId": task_id,
        }
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=str(ctx.context.root_dir),
            capture_output=True,
            text=True,
            timeout=timeout / 1000.0,
        )
        return {
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "returncode": proc.returncode,
            "duration_ms": int((time.time() - start) * 1000),
        }
    except subprocess.TimeoutExpired as e:
        return {
            "error": "Command timed out",
            "stdout": e.stdout,
            "stderr": e.stderr,
        }


def _is_read_only_command(command: str) -> bool:
    cmd = command.strip().lower()
    if not cmd:
        return False
    safe_prefixes = (
        "ls",
        "pwd",
        "whoami",
        "cat",
        "head",
        "tail",
        "rg",
        "grep",
        "find",
    )
    safe_git = (
        "git status",
        "git log",
        "git diff",
        "git show",
    )
    return cmd.startswith(safe_prefixes) or cmd.startswith(safe_git)


def _subagent_prompt(agent_type: str) -> str:
    return SUBAGENT_PROMPTS.get(agent_type, "").strip()


def _subagent_model(model: Optional[str]) -> str:
    if model:
        return model
    return os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")


def _build_subagent(agent_type: str, model: Optional[str]) -> Agent[AppContext]:
    instructions = _subagent_prompt(agent_type)
    if not instructions:
        instructions = f"You are a Claude Code subagent of type {agent_type}."
    return Agent(
        name=f"Subagent-{agent_type}",
        instructions=instructions,
        model=_subagent_model(model),
        tools=TOOLS,
    )


async def _run_subagent(agent: Agent[AppContext], prompt: str, context: AppContext) -> Any:
    try:
        from agents import Runner
    except Exception as exc:
        return f"Runner unavailable: {exc}"
    runner: Any
    try:
        runner = Runner()
    except Exception:
        runner = Runner
    run_fn = getattr(runner, "run", runner)
    try:
        sig = inspect.signature(run_fn)
    except Exception:
        sig = None
    kwargs: Dict[str, Any] = {}
    if sig and "context" in sig.parameters:
        kwargs["context"] = context
    if sig and "input" in sig.parameters:
        result = run_fn(agent, input=prompt, **kwargs)
    else:
        result = run_fn(agent, prompt, **kwargs)
    if asyncio.iscoroutine(result):
        return await result
    return result


def _result_text(result: Any) -> str:
    if isinstance(result, str):
        return result
    for attr in ("final_output", "output_text", "output", "text"):
        if hasattr(result, attr):
            value = getattr(result, attr)
            if isinstance(value, str):
                return value
    return str(result)


async def _task_tool(
    ctx: RunContextWrapper[AppContext],
    description: str,
    prompt: str,
    subagent_type: str,
    model: Optional[str] = None,
    resume: Optional[str] = None,
    run_in_background: bool = False,
) -> Dict[str, Any]:
    agent = _build_subagent(subagent_type, model)
    read_only = subagent_type in {"Explore", "Plan"}
    sub_context = AppContext(
        root_dir=ctx.context.root_dir,
        permissions=ctx.context.permissions,
        read_only=read_only,
        tasks=ctx.context.tasks,
        todos=ctx.context.todos,
    )

    agent_id = resume or str(uuid.uuid4())

    async def _run() -> Dict[str, Any]:
        start = time.time()
        result = await _run_subagent(agent, prompt, sub_context)
        text = _result_text(result)
        duration_ms = int((time.time() - start) * 1000)
        return {
            "status": "completed",
            "agentId": agent_id,
            "prompt": prompt,
            "content": [{"type": "text", "text": text}],
            "totalToolUseCount": 0,
            "totalDurationMs": duration_ms,
            "totalTokens": 0,
            "usage": {},
        }

    if run_in_background:
        task_id = str(uuid.uuid4())
        ctx.context.tasks[task_id] = asyncio.create_task(_run())
        return {
            "status": "async_launched",
            "agentId": task_id,
            "description": description,
            "prompt": prompt,
        }
    return await _run()


async def _task_output(
    ctx: RunContextWrapper[AppContext],
    task_id: str,
    block: bool = True,
    timeout: int = 30000,
) -> Dict[str, Any]:
    task = ctx.context.tasks.get(task_id)
    if task is None:
        return {"retrieval_status": "not_ready", "task": None}
    if isinstance(task, _BackgroundProcess):
        proc = task.proc
        if not block and proc.poll() is None:
            return {"retrieval_status": "not_ready", "task": None}
        try:
            stdout, stderr = proc.communicate(timeout=timeout / 1000.0 if block else 0)
        except subprocess.TimeoutExpired:
            return {"retrieval_status": "timeout", "task": None}
        duration_ms = int((time.time() - task.start_time) * 1000)
        result = {
            "stdout": stdout,
            "stderr": stderr,
            "returncode": proc.returncode,
            "duration_ms": duration_ms,
        }
        ctx.context.tasks.pop(task_id, None)
        return {"retrieval_status": "success", "task": result}
    if not block:
        if task.done():
            result = task.result()
            ctx.context.tasks.pop(task_id, None)
            return {"retrieval_status": "success", "task": result}
        return {"retrieval_status": "not_ready", "task": None}
    try:
        result = await asyncio.wait_for(task, timeout=timeout / 1000.0)
    except asyncio.TimeoutError:
        return {"retrieval_status": "timeout", "task": None}
    ctx.context.tasks.pop(task_id, None)
    return {"retrieval_status": "success", "task": result}


def _ask_user_question(
    ctx: RunContextWrapper[AppContext],
    questions: List[Dict[str, Any]],
    answers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    if answers:
        return {"questions": questions, "answers": answers}
    resolved: Dict[str, str] = {}
    for q in questions:
        header = q.get("header", "Q")
        prompt = q.get("question", "")
        options = q.get("options", [])
        multi = bool(q.get("multiSelect"))
        print(f"{header}: {prompt}")
        for idx, opt in enumerate(options, start=1):
            label = opt.get("label", "")
            desc = opt.get("description", "")
            print(f"  {idx}. {label} - {desc}".strip())
        raw = input("Select option number(s) or enter text: ").strip()
        if raw.isdigit() and options:
            choice = options[int(raw) - 1].get("label", "")
            resolved[prompt] = choice
        elif "," in raw and multi and options:
            picks = []
            for part in raw.split(","):
                part = part.strip()
                if part.isdigit():
                    idx = int(part) - 1
                    if 0 <= idx < len(options):
                        picks.append(options[idx].get("label", ""))
            resolved[prompt] = ", ".join([p for p in picks if p])
        else:
            resolved[prompt] = raw
    return {"questions": questions, "answers": resolved}


def _todo_write(
    ctx: RunContextWrapper[AppContext],
    todos: List[Dict[str, str]],
) -> Dict[str, Any]:
    old = list(ctx.context.todos)
    ctx.context.todos = list(todos)
    return {"oldTodos": old, "newTodos": ctx.context.todos}


# Attach verbatim prompt text as docstrings and wrap with function_tool

def _set_doc(func, prompt_name: str) -> None:
    prompt = TOOL_PROMPTS.get(prompt_name, "")
    if prompt:
        func.__doc__ = prompt


_set_doc(_read_file, "Read")
_set_doc(_write_file, "Write")
_set_doc(_edit_file, "Edit")
_set_doc(_grep_files, "Grep")
_set_doc(_glob_files, "Glob")
_set_doc(_run_shell, "Bash")
_set_doc(_list_directory, "LS")
_set_doc(_task_tool, "Task (agent)")
_set_doc(_task_output, "TaskOutput")
_set_doc(_ask_user_question, "AskUserQuestion")
_set_doc(_todo_write, "TodoWrite")

def _wrap_tool(func, tool_name: str):
    params = {}
    try:
        params = inspect.signature(function_tool).parameters
    except Exception:
        try:
            params = function_tool.__signature__.parameters  # type: ignore[attr-defined]
        except Exception:
            params = {}
    kwargs = {}
    if "strict_mode" in params:
        # Avoid strict schema failures for Dict-typed params in tools.
        kwargs["strict_mode"] = False
    if "name_override" in params:
        return function_tool(name_override=tool_name, **kwargs)(func)
    if "name" in params:
        return function_tool(name=tool_name, **kwargs)(func)
    func.__name__ = tool_name
    return function_tool(func)


read_file = _wrap_tool(_read_file, "Read")
write_file = _wrap_tool(_write_file, "Write")
edit_file = _wrap_tool(_edit_file, "Edit")
glob_files = _wrap_tool(_glob_files, "Glob")
grep_files = _wrap_tool(_grep_files, "Grep")
list_directory = _wrap_tool(_list_directory, "LS")
run_shell = _wrap_tool(_run_shell, "Bash")
task_tool = _wrap_tool(_task_tool, "Task")
task_output = _wrap_tool(_task_output, "TaskOutput")
ask_user_question = _wrap_tool(_ask_user_question, "AskUserQuestion")
todo_write = _wrap_tool(_todo_write, "TodoWrite")

TOOLS = [
    read_file,
    write_file,
    edit_file,
    glob_files,
    grep_files,
    list_directory,
    run_shell,
    task_tool,
    task_output,
    ask_user_question,
    todo_write,
]

RAW_TOOL_MAP = {
    "Read": _read_file,
    "Write": _write_file,
    "Edit": _edit_file,
    "Glob": _glob_files,
    "Grep": _grep_files,
    "LS": _list_directory,
    "Bash": _run_shell,
    "Task": _task_tool,
    "TaskOutput": _task_output,
    "AskUserQuestion": _ask_user_question,
    "TodoWrite": _todo_write,
}

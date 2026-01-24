from __future__ import annotations

from contextlib import AsyncExitStack
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Callable
import re

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult, ListToolsResult
import mcp.types as mcp_types


@dataclass
class McpToolDef:
    server: str
    tool: str
    description: str
    input_schema: Dict[str, Any]
    public_name: str

    @property
    def name(self) -> str:
        return self.public_name


class McpManager:
    def __init__(self, servers: Dict[str, Any], log_fn: Optional[Callable[[Dict[str, Any]], None]] = None):
        self._servers = servers
        self._log_fn = log_fn
        self._sessions: Dict[str, ClientSession] = {}
        self._exit_stacks: Dict[str, AsyncExitStack] = {}
        self._tool_defs: List[McpToolDef] = []
        self._tool_map: Dict[str, Tuple[str, str]] = {}
        self._instructions: Dict[str, str] = {}
        self._meta_tool_map: Dict[str, Tuple[str, str]] = {}
        self._prompts: Dict[str, List[Dict[str, Any]]] = {}
        self._resources: Dict[str, List[Dict[str, Any]]] = {}
        self._meta_tools: Dict[str, Dict[str, str]] = {}
        self._used_names: set[str] = set()
        self._refreshing: set[str] = set()

    @property
    def tool_defs(self) -> List[McpToolDef]:
        return list(self._tool_defs)

    def build_instructions_block(self) -> str:
        entries: List[str] = []
        for server in sorted(self._servers.keys()):
            sections: List[str] = []
            instructions = self._instructions.get(server, "").strip()
            if instructions:
                sections.append(instructions)

            prompt_list = self._prompts.get(server) or []
            prompt_tool = self._meta_tools.get(server, {}).get("get_prompt")
            if prompt_list:
                lines = ["### Available MCP prompts"]
                if prompt_tool:
                    lines.append(f"Use `{prompt_tool}` to fetch a prompt by name.")
                for item in prompt_list[:50]:
                    name = item.get("name") or "prompt"
                    desc = item.get("description") or ""
                    args = item.get("arguments") or []
                    arg_list = ", ".join(
                        str(a.get("name")) for a in args if isinstance(a, dict) and a.get("name")
                    )
                    suffix = f" (args: {arg_list})" if arg_list else ""
                    lines.append(f"- {name}{suffix}{(': ' + desc) if desc else ''}")
                if len(prompt_list) > 50:
                    lines.append(f"- …and {len(prompt_list) - 50} more")
                sections.append("\n".join(lines))

            resource_list = self._resources.get(server) or []
            resource_tool = self._meta_tools.get(server, {}).get("read_resource")
            if resource_list:
                lines = ["### Available MCP resources"]
                if resource_tool:
                    lines.append(f"Use `{resource_tool}` to read a resource by URI.")
                for item in resource_list[:50]:
                    uri = item.get("uri") or ""
                    desc = item.get("description") or ""
                    mime = item.get("mimeType") or ""
                    meta = []
                    if mime:
                        meta.append(mime)
                    if item.get("size"):
                        meta.append(f"{item.get('size')} bytes")
                    meta_text = f" ({', '.join(meta)})" if meta else ""
                    lines.append(f"- {uri}{meta_text}{(': ' + desc) if desc else ''}")
                if len(resource_list) > 50:
                    lines.append(f"- …and {len(resource_list) - 50} more")
                sections.append("\n".join(lines))

            if sections:
                entries.append(f"## {server}\n\n" + "\n\n".join(sections))
        return "\n\n".join(entries).strip()

    async def connect_all(self) -> List[str]:
        errors: List[str] = []
        for name, cfg in self._servers.items():
            try:
                session, stack, instructions = await self._connect_one(name, cfg)
                self._sessions[name] = session
                self._exit_stacks[name] = stack
                if instructions:
                    self._instructions[name] = instructions
                await self._discover_tools(name, session)
                await self._discover_prompts(name, session)
                await self._discover_resources(name, session)
                self._register_meta_tools(name)
            except Exception as exc:
                errors.append(f"{name}: {exc}")
        return errors

    async def close(self) -> None:
        for stack in self._exit_stacks.values():
            try:
                await stack.aclose()
            except Exception:
                pass
        self._sessions.clear()
        self._exit_stacks.clear()

    async def call_tool(self, tool_name: str, args: Dict[str, Any]) -> Any:
        meta = self._meta_tool_map.get(tool_name)
        if meta:
            server, kind = meta
            session = self._sessions.get(server)
            if not session:
                return {"error": f"MCP server not connected: {server}"}
            if kind == "list_prompts":
                return {"prompts": self._prompts.get(server, [])}
            if kind == "list_resources":
                return {"resources": self._resources.get(server, [])}
            if kind == "get_prompt":
                name = (args or {}).get("name")
                if not name:
                    return {"error": "Missing prompt name"}
                arguments = (args or {}).get("arguments") or None
                result = await session.get_prompt(str(name), arguments)
                payload = []
                for msg in result.messages or []:
                    try:
                        content = msg.content
                        if hasattr(content, "model_dump"):
                            content = content.model_dump()
                    except Exception:
                        content = str(msg.content)
                    payload.append({"role": msg.role, "content": content})
                return {"description": result.description, "messages": payload}
            if kind == "read_resource":
                uri = (args or {}).get("uri")
                if not uri:
                    return {"error": "Missing resource uri"}
                result = await session.read_resource(uri)
                contents = []
                for item in result.contents or []:
                    try:
                        contents.append(item.model_dump())
                    except Exception:
                        contents.append(str(item))
                return {"contents": contents}
        mapping = self._tool_map.get(tool_name)
        if not mapping:
            return {"error": f"Unknown MCP tool: {tool_name}"}
        server, tool = mapping
        session = self._sessions.get(server)
        if not session:
            return {"error": f"MCP server not connected: {server}"}
        result: CallToolResult = await session.call_tool(tool, args or {})
        if result.structuredContent is not None:
            return result.structuredContent
        content_blocks = []
        for block in result.content or []:
            try:
                content_blocks.append(block.model_dump())
            except Exception:
                content_blocks.append(str(block))
        payload: Dict[str, Any] = {"content": content_blocks}
        if result.isError:
            payload["is_error"] = True
        return payload

    def openai_tools(self) -> List[Dict[str, Any]]:
        tools: List[Dict[str, Any]] = []
        for tool_def in self._tool_defs:
            schema = tool_def.input_schema or {
                "type": "object",
                "properties": {},
                "additionalProperties": True,
            }
            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": tool_def.name,
                        "description": f"[MCP:{tool_def.server}] {tool_def.description}".strip(),
                        "parameters": schema,
                    },
                }
            )
        return tools

    def _sanitize_name(self, value: str) -> str:
        raw = value.strip()
        if re.fullmatch(r"[A-Za-z0-9_-]+", raw):
            return raw
        safe = re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_")
        return safe or "tool"

    def _unique_name(self, base: str, existing: set[str], max_len: int = 64) -> str:
        base = base[:max_len]
        candidate = base
        counter = 1
        while candidate in existing:
            counter += 1
            suffix = f"_{counter}"
            head = base[: max_len - len(suffix)]
            candidate = f"{head}{suffix}"
        existing.add(candidate)
        return candidate

    async def _connect_one(
        self, name: str, cfg: Dict[str, Any]
    ) -> Tuple[ClientSession, AsyncExitStack, Optional[str]]:
        server_type = str(cfg.get("type") or "stdio").lower()
        stack = AsyncExitStack()
        if server_type == "stdio":
            params = StdioServerParameters(
                command=str(cfg.get("command")),
                args=list(cfg.get("args") or []),
                env=cfg.get("env"),
                cwd=cfg.get("cwd"),
            )
            read_stream, write_stream = await stack.enter_async_context(stdio_client(params))
        elif server_type == "sse":
            read_stream, write_stream = await stack.enter_async_context(
                sse_client(
                    url=str(cfg.get("url")),
                    headers=cfg.get("headers"),
                    timeout=float(cfg.get("timeout") or 5),
                    sse_read_timeout=float(cfg.get("sse_read_timeout") or 300),
                )
            )
        elif server_type == "http":
            read_stream, write_stream, _ = await stack.enter_async_context(
                streamable_http_client(url=str(cfg.get("url")))
            )
        else:
            await stack.aclose()
            raise ValueError(f"Unsupported MCP server type: {server_type}")

        session = await stack.enter_async_context(
            ClientSession(read_stream, write_stream, message_handler=lambda msg, server=name: self._handle_message(server, msg))
        )
        init = await session.initialize()
        instructions = getattr(init, "instructions", None)
        return session, stack, instructions

    async def _handle_message(self, server: str, msg: Any) -> None:
        if isinstance(msg, mcp_types.ServerNotification):
            if isinstance(msg.root, mcp_types.ToolListChangedNotification):
                await self.refresh_server(server)

    async def refresh_server(self, server: str) -> None:
        if server in self._refreshing:
            return
        session = self._sessions.get(server)
        if not session:
            return
        self._refreshing.add(server)
        try:
            self._remove_server_entries(server)
            await self._discover_tools(server, session)
            await self._discover_prompts(server, session)
            await self._discover_resources(server, session)
            self._register_meta_tools(server)
            counts = self._counts_for_server(server)
            self._emit(
                "mcp_refresh",
                f"MCP refreshed: {server} ({counts['tools']} tools, {counts['prompts']} prompts, {counts['resources']} resources)",
                {"server": server, **counts},
            )
        finally:
            self._refreshing.discard(server)

    def _remove_server_entries(self, server: str) -> None:
        tool_names = [name for name, (srv, _) in self._tool_map.items() if srv == server]
        meta_names = [name for name, (srv, _) in self._meta_tool_map.items() if srv == server]
        if tool_names:
            self._tool_defs = [t for t in self._tool_defs if t.name not in tool_names]
            for name in tool_names:
                self._tool_map.pop(name, None)
        if meta_names:
            self._tool_defs = [t for t in self._tool_defs if t.name not in meta_names]
            for name in meta_names:
                self._meta_tool_map.pop(name, None)
        self._used_names = {t.name for t in self._tool_defs}

    def _counts_for_server(self, server: str) -> Dict[str, int]:
        tools = sum(1 for _, (srv, _) in self._tool_map.items() if srv == server)
        meta = sum(1 for _, (srv, _) in self._meta_tool_map.items() if srv == server)
        prompts = len(self._prompts.get(server, []) or [])
        resources = len(self._resources.get(server, []) or [])
        return {"tools": tools, "meta_tools": meta, "prompts": prompts, "resources": resources}

    def _emit(self, event_type: str, message: str, extra: Optional[Dict[str, Any]] = None) -> None:
        if not self._log_fn:
            return
        payload = {"type": event_type, "timestamp": time.time(), "message": message}
        if extra:
            payload.update(extra)
        self._log_fn(payload)

    async def _discover_tools(self, server: str, session: ClientSession) -> None:
        result: ListToolsResult = await session.list_tools()
        tools = list(result.tools or [])
        next_cursor = getattr(result, "nextCursor", None)
        while next_cursor:
            result = await session.list_tools(cursor=str(next_cursor))
            tools.extend(result.tools or [])
            next_cursor = getattr(result, "nextCursor", None)
        existing_names = self._used_names
        server_prefix = self._sanitize_name(server)
        for tool in tools:
            name = getattr(tool, "name", "")
            if not name:
                continue
            description = getattr(tool, "description", "") or ""
            input_schema = getattr(tool, "inputSchema", None) or getattr(tool, "input_schema", None) or {}
            tool_suffix = self._sanitize_name(str(name))
            base_public = f"mcp__{server_prefix}__{tool_suffix}"
            public_name = self._unique_name(base_public, existing_names)
            tool_def = McpToolDef(
                server=server,
                tool=str(name),
                description=str(description),
                input_schema=input_schema,
                public_name=public_name,
            )
            self._tool_defs.append(tool_def)
            self._tool_map[tool_def.name] = (server, tool_def.tool)
            self._used_names.add(tool_def.name)

    async def _discover_prompts(self, server: str, session: ClientSession) -> None:
        prompts: List[Dict[str, Any]] = []
        try:
            result = await session.list_prompts()
            prompts.extend([p.model_dump() for p in result.prompts or []])
            next_cursor = getattr(result, "nextCursor", None)
            while next_cursor:
                result = await session.list_prompts(cursor=str(next_cursor))
                prompts.extend([p.model_dump() for p in result.prompts or []])
                next_cursor = getattr(result, "nextCursor", None)
        except Exception:
            prompts = []
        self._prompts[server] = prompts

    async def _discover_resources(self, server: str, session: ClientSession) -> None:
        resources: List[Dict[str, Any]] = []
        try:
            result = await session.list_resources()
            resources.extend([r.model_dump() for r in result.resources or []])
            next_cursor = getattr(result, "nextCursor", None)
            while next_cursor:
                result = await session.list_resources(cursor=str(next_cursor))
                resources.extend([r.model_dump() for r in result.resources or []])
                next_cursor = getattr(result, "nextCursor", None)
        except Exception:
            resources = []
        self._resources[server] = resources

    def _register_meta_tools(self, server: str) -> None:
        server_prefix = self._sanitize_name(server)
        meta_names: Dict[str, str] = {}

        def register(kind: str, description: str, schema: Dict[str, Any]) -> None:
            base = f"mcp__{server_prefix}__{kind}"
            public_name = self._unique_name(base, self._used_names)
            tool_def = McpToolDef(
                server=server,
                tool=kind,
                description=description,
                input_schema=schema,
                public_name=public_name,
            )
            self._tool_defs.append(tool_def)
            self._meta_tool_map[public_name] = (server, kind)
            meta_names[kind] = public_name

        if self._prompts.get(server):
            register(
                "get_prompt",
                "Fetch an MCP prompt by name.",
                {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Prompt name"},
                        "arguments": {
                            "type": "object",
                            "description": "Prompt arguments (string values)",
                            "additionalProperties": True,
                        },
                    },
                    "required": ["name"],
                    "additionalProperties": False,
                },
            )
            register(
                "list_prompts",
                "List available MCP prompts.",
                {"type": "object", "properties": {}, "additionalProperties": False},
            )

        if self._resources.get(server):
            register(
                "read_resource",
                "Read an MCP resource by URI.",
                {
                    "type": "object",
                    "properties": {
                        "uri": {"type": "string", "description": "Resource URI"},
                    },
                    "required": ["uri"],
                    "additionalProperties": False,
                },
            )
            register(
                "list_resources",
                "List available MCP resources.",
                {"type": "object", "properties": {}, "additionalProperties": False},
            )

        if meta_names:
            self._meta_tools[server] = meta_names

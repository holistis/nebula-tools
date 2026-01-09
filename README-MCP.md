# Nebula Notebook MCP Server

The Nebula MCP server allows Claude Code to interact with Jupyter-style notebooks programmatically through the Model Context Protocol.

## Quick Start

### 1. Make sure Nebula Notebook backend is running

```bash
# Start the Nebula backend server (default: http://localhost:8000)
cd /path/to/nebula-notebook
npm run server
```

### 2. Configure Claude Code

Add to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "nebula-notebook": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Downloads/nebula-tools/bin/nebula-mcp.js"],
      "env": {
        "NEBULA_URL": "http://localhost:4000"
      }
    }
  }
}
```

**Important Configuration Notes:**
- ✅ Environment variable **must** be `NEBULA_URL` (not NEBULA_API_URL)
- ✅ Set to the URL where your Nebula server is running (frontend or backend)
- ✅ Default is `http://localhost:3000` if not specified (frontend dev server with proxy)
- ✅ For SSH-forwarded servers, use `http://localhost:FORWARDED_PORT`
- ✅ For direct backend access, use `http://localhost:8000` (or your backend port)

### 3. Restart Claude Code

After editing the config:
```bash
# In Claude Code terminal
/exit
# Then restart Claude Code
```

## Multi-Instance Support

The MCP server now supports connecting to multiple Nebula instances in the same session! This is useful for:
- Working with notebooks on different servers (local + remote)
- SSH tunnels to multiple remote machines
- Development and production environments simultaneously

### How it works

1. **Default URL**: Set via `NEBULA_URL` environment variable (or defaults to `http://localhost:3000`)
2. **Per-session URL**: Optionally specify `base_url` when starting an agent session
3. **Automatic routing**: All subsequent operations on that notebook use the session's URL

### Example: Working with multiple instances

```typescript
// Start session on default instance (localhost:4000)
start_agent_session(path="/local/notebook.ipynb")
insert_cell(path="/local/notebook.ipynb", ...)  // → goes to localhost:4000

// Start session on SSH-tunneled remote instance
start_agent_session(
  path="/remote/notebook.ipynb",
  base_url="http://localhost:8001"  // SSH tunnel
)
insert_cell(path="/remote/notebook.ipynb", ...)  // → goes to localhost:8001

// Both sessions are active simultaneously!
execute_cell(path="/local/notebook.ipynb", ...)   // → localhost:4000
execute_cell(path="/remote/notebook.ipynb", ...)  // → localhost:8001

// Clean up
end_agent_session(path="/local/notebook.ipynb")   // Clears URL mapping
end_agent_session(path="/remote/notebook.ipynb")  // Clears URL mapping
```

### Session-based URL management

- Each notebook path maps to one URL
- URL is set when `start_agent_session` is called
- All operations use that URL until `end_agent_session` is called
- If no session exists, operations use the default URL
- Multiple concurrent sessions on different URLs are supported

## Available MCP Tools

Once connected, Claude Code can use these tools:

### Notebook Operations
- `read_notebook` - Read all cells from a notebook
- `read_cell` - Read a specific cell by index or ID
- `read_output` - Read cell execution outputs
- `insert_cell` - Insert a new cell
- `update_cell` - Update cell content or type
- `delete_cell` - Delete a cell
- `clear_notebook` - Clear all cells from a notebook
- `move_cell` - Move a cell to a different position
- `duplicate_cell` - Duplicate a cell
- `search_cells` - Search for cells by content
- `update_metadata` - Update cell metadata
- `start_agent_session` - Start an agent session (locks notebook, optional base_url for multi-instance)
- `end_agent_session` - End an agent session (unlocks notebook, clears URL mapping)

### Kernel Operations
- `list_kernels` - List available kernel specs
- `kernel_start` - Start a new kernel session
- `kernel_stop` - Stop a kernel session
- `kernel_restart` - Restart a kernel
- `kernel_interrupt` - Interrupt a running kernel

### Execution
- `execute_cell` - Execute a cell and get results

## Usage Examples

### Example 1: Create a notebook and run analysis

```
User: "Create a notebook at /tmp/analysis.ipynb with a cell that imports pandas and numpy"

Claude uses:
1. clear_notebook(path="/tmp/analysis.ipynb")
2. insert_cell(path="/tmp/analysis.ipynb", content="import pandas as pd\nimport numpy as np", cell_type="code")
3. execute_cell(path="/tmp/analysis.ipynb", cell_index=0)
4. read_output(path="/tmp/analysis.ipynb", cell_index=0)
```

### Example 2: Read and analyze existing notebook

```
User: "What's in my notebook at /tmp/data.ipynb?"

Claude uses:
1. read_notebook(path="/tmp/data.ipynb", format="brief")
2. read_cell(path="/tmp/data.ipynb", cell_index=0)
```

### Example 3: Interactive multi-step workflow

```
User: "Analyze stock data for AAPL - fetch it, plot it, and calculate moving averages"

Claude uses:
1. clear_notebook(path="/tmp/stock-analysis.ipynb")
2. kernel_start(file_path="/tmp/stock-analysis.ipynb")
3. insert_cell(...) - Add import cell
4. execute_cell(...) - Run imports
5. insert_cell(...) - Add data fetch cell
6. execute_cell(...) - Fetch data
7. read_output(...) - Check if data loaded
8. insert_cell(...) - Add plotting cell
9. execute_cell(...) - Generate plot
... and so on
```

## Tool Usage in Claude Code

Claude Code will automatically use tools with the prefix:

```
mcp__nebula-notebook__TOOL_NAME
```

For example:
- `mcp__nebula-notebook__read_notebook`
- `mcp__nebula-notebook__execute_cell`
- `mcp__nebula-notebook__insert_cell`

## Troubleshooting

### MCP server not connecting

Check:
1. Is Nebula backend running? `curl http://localhost:4000/api/health`
2. Is `NEBULA_URL` set correctly in `~/.claude.json`?
3. Did you restart Claude Code after config changes?
4. Check MCP server logs in Claude Code (usually visible in stderr)

### "No such tool available" error

- The MCP server may not be configured or running
- Check that the server name matches: `nebula-notebook`
- Restart Claude Code after config changes

### "Request failed: fetch failed" error

- The MCP server can't reach the Nebula backend
- Verify `NEBULA_URL` points to the correct server
- Check if the backend is actually running
- For SSH tunnels, ensure port forwarding is active

### Tools work but responses are slow

- Increase timeout if using remote/forwarded connections
- Check network latency to the backend
- Consider running backend locally instead of over SSH

## Publishing the MCP Server

See [MCP_DISTRIBUTION.md](./MCP_DISTRIBUTION.md) for instructions on publishing to npm and Smithery.

## Development

### Testing locally

```bash
# Build the MCP server
npm run build

# Test manually via stdio
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | NEBULA_URL=http://localhost:4000 node bin/nebula-mcp.js

# Test tool listing
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | NEBULA_URL=http://localhost:4000 node bin/nebula-mcp.js
```

### Adding new tools

1. Add tool definition to `src/tools/notebook.ts`, `kernel.ts`, or `execution.ts`
2. Export from the appropriate tools array
3. Rebuild: `npm run build`
4. Restart Claude Code to pick up new tools

## Architecture

```
Claude Code
    ↓ (JSON-RPC over stdio)
nebula-mcp.js (MCP Server)
    ↓ (HTTP/WebSocket)
Nebula Backend (FastAPI)
    ↓
Jupyter Kernels
```

The MCP server is a thin wrapper that:
1. Implements Model Context Protocol (JSON-RPC 2.0 over stdio)
2. Translates tool calls to Nebula API requests
3. Formats responses for Claude Code display
4. Handles WebSocket connections for streaming execution

## License

MIT

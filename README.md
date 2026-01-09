# Nebula Tools

Shared tools for Nebula Notebook and Nexus Agentic IDE.

## Overview

Nebula Tools provides programmatic access to Nebula Notebook's functionality, enabling AI agents and automation tools to manipulate Jupyter notebooks.

### Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│   AI Agent      │────►│ NebulaClient │────►│  Nebula Backend     │
│ (MCP/Claude/    │     │ (TypeScript) │     │  (Operation Router) │
│  Cursor/CLI)    │     └──────────────┘     └──────────┬──────────┘
└─────────────────┘                                     │
                                           ┌────────────┴────────────┐
                                           │                         │
                                    ┌──────▼──────┐         ┌────────▼───────┐
                                    │   UI Mode   │         │ Headless Mode  │
                                    │ (WebSocket) │         │ (File-based)   │
                                    └─────────────┘         └────────────────┘
```

**Key insight**: The client doesn't need to know which mode is active. The Operation Router transparently handles both cases.

## Quick Start

1. **Clone and build**:
   ```bash
   git clone https://github.com/jzthree/nebula-tools.git
   cd nebula-tools
   npm install
   npm run build
   ```

2. **Start Nebula Notebook** (in a separate terminal):
   ```bash
   cd ../nebula-notebook
   npm run start
   ```

3. **Configure your AI client** (see setup sections below)

## Setup Instructions

### Claude Code (CLI)

Claude Code uses `~/.claude.json` for MCP server configuration.

**Option 1: Using the CLI (Recommended)**

```bash
# Replace /path/to/nebula-tools with your actual path
claude mcp add --scope user --transport stdio \
  -e NEBULA_URL=http://localhost:3000 \
  nebula-notebook -- node /path/to/nebula-tools/bin/nebula-mcp.js
```

**Notes**:
- `--scope user`: Makes the server available globally across all projects
- `--transport stdio`: Required for Node.js-based MCP servers
- The `--` separates options from the command
- Replace `/path/to/nebula-tools` with your actual absolute path

**Option 2: Manual Configuration**

Edit `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "nebula-notebook": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/path/to/nebula-tools/bin/nebula-mcp.js"],
      "env": {
        "NEBULA_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Verify**: In your next Claude Code session, you should see tools like `mcp__nebula-notebook__read_notebook`, `mcp__nebula-notebook__execute_cell`, etc.

### Claude Desktop

1. **Add to Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

   ```json
   {
     "mcpServers": {
       "nebula-notebook": {
         "command": "node",
         "args": ["/Users/YOUR_USERNAME/path/to/nebula-tools/bin/nebula-mcp.js"],
         "env": {
           "NEBULA_URL": "http://localhost:3000"
         }
       }
     }
   }
   ```

2. **Restart Claude Desktop**

3. **Verify**: Look for the MCP connection indicator in the UI

### ChatGPT Desktop (MacOS)

ChatGPT Desktop supports MCP servers on MacOS.

1. **Add to ChatGPT config** (`~/Library/Application Support/ChatGPT/config.json`):

   ```json
   {
     "mcpServers": {
       "nebula-notebook": {
         "command": "node",
         "args": ["/Users/YOUR_USERNAME/path/to/nebula-tools/bin/nebula-mcp.js"],
         "env": {
           "NEBULA_URL": "http://localhost:3000"
         }
       }
     }
   }
   ```

2. **Restart ChatGPT Desktop**

3. **Enable MCP**: In ChatGPT settings, ensure MCP servers are enabled

4. **Verify**: Check that Nebula tools are available in the tool picker

### Cursor IDE

1. **Add to Cursor MCP config** (location varies by OS):
   - **MacOS**: `~/Library/Application Support/Cursor/mcp.json`
   - **Linux**: `~/.config/Cursor/mcp.json`
   - **Windows**: `%APPDATA%\Cursor\mcp.json`

   ```json
   {
     "mcpServers": {
       "nebula-notebook": {
         "command": "node",
         "args": ["/Users/YOUR_USERNAME/path/to/nebula-tools/bin/nebula-mcp.js"],
         "env": {
           "NEBULA_URL": "http://localhost:3000"
         }
       }
     }
   }
   ```

2. **Restart Cursor**

3. **Verify**: MCP tools should appear in Cursor's AI chat interface

## Available Tools

### Kernel Management

| Tool | Description | Destructive |
|------|-------------|-------------|
| `list_kernels` | List available kernel specifications | No |
| `list_sessions` | List active kernel sessions | No |
| `kernel_start` | Start a new kernel session | Yes |
| `kernel_stop` | Stop a kernel session | Yes |
| `kernel_restart` | Restart a kernel session | Yes |
| `kernel_interrupt` | Interrupt running execution | Yes |

### Notebook Operations

| Tool | Description | Destructive |
|------|-------------|-------------|
| `read_notebook` | Read all cells from a notebook | No |
| `read_cell` | Read a specific cell by index | No |
| `insert_cell` | Insert a new cell | Yes |
| `delete_cell` | Delete a cell | Yes |
| `clear_notebook` | Delete all cells | Yes |
| `search_cells` | Search notebook cells by keyword | No |

### Code Execution

| Tool | Description | Destructive |
|------|-------------|-------------|
| `execute_cell` | Execute a notebook cell by index | Yes |
| `execute_code` | Execute arbitrary code in a kernel | Yes |

### File Operations

| Tool | Description | Destructive |
|------|-------------|-------------|
| `list_files` | List files and directories | No |
| `read_file` | Read file contents | No |
| `write_file` | Write content to a file | Yes |

### Agent Session Management

| Tool | Description | Destructive |
|------|-------------|-------------|
| `start_agent_session` | Lock notebook for agent use | Yes |
| `end_agent_session` | Unlock notebook | No |

## Programmatic Usage

```typescript
import { NebulaClient } from 'nebula-tools';

const client = new NebulaClient({
  baseUrl: 'http://localhost:3000'
});

// Best practice: Use sessions for agent work
await client.startAgentSession('/path/to/notebook.ipynb', 'my-agent');

try {
  // Insert a cell
  const insertResult = await client.insertCellOp('/path/to/notebook.ipynb', 0, {
    id: 'imports',
    type: 'code',
    content: 'import numpy as np\nimport matplotlib.pyplot as plt'
  });

  // Start kernel and execute
  const kernel = await client.startKernel('python3', '/path/to/notebook.ipynb');
  const execResult = await client.executeCell(
    '/path/to/notebook.ipynb',
    kernel.data!.sessionId,
    { cellIndex: 0 }
  );

  console.log('Outputs:', execResult.data?.outputs);
} finally {
  // Always end session
  await client.endAgentSession('/path/to/notebook.ipynb');
}
```

## Agent Sessions

Agent sessions provide UI feedback and prevent concurrent access:

```typescript
// When session is active:
// - UI shows purple "Agent" badge
// - Toast notifications for operations
// - Session duration tracked

await client.startAgentSession(path, 'physics-demo');
// ... operations ...
await client.endAgentSession(path);
// Returns: { sessionDuration: 15000 } // ms
```

In headless mode (no UI open), session operations are no-ops that always succeed.

## Error Handling

All methods return `ToolResult<T>`:

```typescript
interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Usage
const result = await client.insertCellOp(path, 0, cell);
if (!result.success) {
  console.error('Failed:', result.error);
  return;
}
console.log('Cell ID:', result.data.cellId);
```

### ID Conflict Resolution

When inserting a cell with a duplicate ID, the system auto-fixes:

```typescript
const result = await client.insertCellOp(path, 0, {
  id: 'cell-1',  // Already exists
  type: 'code',
  content: '# Hello'
});

// Result
{
  success: true,
  cellId: 'cell-1-2',     // Auto-generated unique ID
  idModified: true,
  requestedId: 'cell-1'   // Original request
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEBULA_URL` | Nebula server URL | `http://localhost:3000` |

**Notes**:
- Default dev setup uses port 3000
- For SSH tunnels or custom ports, update `NEBULA_URL` (e.g., `http://localhost:8080`)

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Run demo (creates physics notebook)
node demo-physics-tools.js
```

## Demo Script

The `demo-physics-tools.js` script demonstrates the full workflow:

```bash
# With Nebula running on localhost:3000 (default)
node demo-physics-tools.js
```

This creates a double pendulum chaos simulation notebook at `/tmp/double-pendulum-chaos.ipynb`, demonstrating:
- Session management
- Cell insertion
- Code execution with streaming
- Output capture

## Troubleshooting

### MCP Server Not Connecting

1. **Check Nebula is running**:
   ```bash
   curl http://localhost:3000/api/health
   ```
   Expected: `{"status":"ok"}`

2. **Verify the build exists**:
   ```bash
   ls -la /path/to/nebula-tools/dist/mcp/index.js
   ls -la /path/to/nebula-tools/bin/nebula-mcp.js
   ```

3. **Check MCP server logs**:
   - **Claude Desktop**: `~/Library/Logs/Claude/mcp*.log`
   - **Claude Code**: Check `~/.claude.json` config and run with `VERBOSE=1` for debug output

4. **Test the MCP server directly**:
   ```bash
   cd /path/to/nebula-tools
   NEBULA_URL=http://localhost:3000 node bin/nebula-mcp.js
   ```
   Should start without errors and accept stdin/stdout communication

### Port Configuration

Make sure you're using the correct port:
```json
"env": {
  "NEBULA_URL": "http://localhost:3000"
}
```

Default is port 3000. If you're using a custom port or SSH tunnel, update `NEBULA_URL` accordingly.

### Path Issues

- Use **absolute paths** in config files (no `~` or relative paths)
- On MacOS, replace `/Users/YOUR_USERNAME` with your actual username
- Verify the path exists: `ls -la /Users/username/path/to/nebula-tools/bin/nebula-mcp.js`

### Permission Issues

Ensure the script is executable:
```bash
chmod +x /path/to/nebula-tools/bin/nebula-mcp.js
```

## Documentation

- [Agentic Architecture](../nebula-notebook/docs/AGENTIC_ARCHITECTURE.md) - Full system design
- [API Reference](../nebula-notebook/docs/API.md) - REST API documentation
- [WebSocket Protocol](../nebula-notebook/docs/WEBSOCKET_PROTOCOL.md) - Execution streaming

## License

MIT

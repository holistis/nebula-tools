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

## Installation

```bash
npm install
npm run build
```

## MCP Server (Claude Desktop / Cursor)

The Nebula MCP Server exposes notebook functionality to AI clients via the Model Context Protocol.

### Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "nebula": {
      "command": "node",
      "args": ["/path/to/nebula-tools/dist/mcp/index.js"],
      "env": {
        "NEBULA_URL": "http://localhost:8000"
      }
    }
  }
}
```

Or using npx:

```json
{
  "mcpServers": {
    "nebula": {
      "command": "npx",
      "args": ["nebula-mcp"],
      "env": {
        "NEBULA_URL": "http://localhost:8000"
      }
    }
  }
}
```

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
  baseUrl: 'http://localhost:8000'
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
| `NEBULA_URL` | Nebula backend URL | `http://localhost:8000` |

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
# With Nebula running on localhost:8000
node demo-physics-tools.js
```

This creates a double pendulum chaos simulation notebook at `/tmp/double-pendulum-chaos.ipynb`, demonstrating:
- Session management
- Cell insertion
- Code execution with streaming
- Output capture

## Documentation

- [Agentic Architecture](../nebula-notebook/docs/AGENTIC_ARCHITECTURE.md) - Full system design
- [API Reference](../nebula-notebook/docs/API.md) - REST API documentation
- [WebSocket Protocol](../nebula-notebook/docs/WEBSOCKET_PROTOCOL.md) - Execution streaming

## License

MIT

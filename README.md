# Nebula Tools

Shared tools for Nebula Notebook and Nexus Agentic IDE.

## MCP Server

The Nebula MCP Server exposes Nebula Notebook's functionality to AI clients via the Model Context Protocol.

### Installation

```bash
npm install
npm run build
```

### Usage with Claude Desktop

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

Or if using npx:

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

### Available Tools

#### Kernel Management
| Tool | Description |
|------|-------------|
| `list_kernels` | List available kernel specifications |
| `list_sessions` | List active kernel sessions |
| `kernel_start` | Start a new kernel session |
| `kernel_stop` | Stop a kernel session |
| `kernel_restart` | Restart a kernel session |
| `kernel_interrupt` | Interrupt running execution |

#### Notebook Operations
| Tool | Description |
|------|-------------|
| `read_notebook` | Read all cells from a notebook |
| `read_cell` | Read a specific cell by index |
| `notebook_write_cell` | Insert or update a cell |
| `notebook_delete_cell` | Delete a cell |
| `search_cells` | Search notebook cells by keyword |

#### Code Execution
| Tool | Description |
|------|-------------|
| `execute_cell` | Execute a notebook cell by index |
| `execute_code` | Execute arbitrary code in a kernel |

#### File Operations
| Tool | Description |
|------|-------------|
| `list_files` | List files and directories |
| `read_file` | Read file contents |
| `write_file` | Write content to a file |

### Environment Variables

- `NEBULA_URL` - Nebula backend URL (default: `http://localhost:8000`)

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test
```

## License

MIT

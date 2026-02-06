# Switching Between Nebula Servers

This guide shows how to switch between different Nebula instances using the `connect_server` tool.

## Use Cases

- **Local + Remote**: Work with local notebooks, then switch to a remote server via SSH tunnel
- **Dev + Prod**: Test on development instance, then run on production
- **Multiple Environments**: Switch between different Nebula installations

## How It Works

The MCP server maintains **one active connection** at a time. All operations use the current connection until you switch to a different server.

## Example Workflow

### 1. Connect to a local server

```python
# MCP server starts disconnected. Always connect explicitly.
connect_server(base_url="http://localhost:3000")

# Work with local notebooks
start_agent_session(path="/home/user/local-analysis.ipynb")
insert_cell(path="/home/user/local-analysis.ipynb",
            cell_id="cell1",
            content="import pandas as pd")
execute_cell(path="/home/user/local-analysis.ipynb",
             session_id="kernel-123",
             cell_id="cell1")
end_agent_session(path="/home/user/local-analysis.ipynb")
```

### 2. Switch to remote server via SSH tunnel

```python
# Switch connection to remote server
connect_server(base_url="http://localhost:8001")

# Now all operations go to the remote server
start_agent_session(path="/data/remote-notebook.ipynb")
insert_cell(path="/data/remote-notebook.ipynb",
            cell_id="cell1",
            content="import numpy as np")
execute_cell(path="/data/remote-notebook.ipynb",
             session_id="kernel-456",
             cell_id="cell1")
end_agent_session(path="/data/remote-notebook.ipynb")
```

### 3. Switch back to default

```python
# Reconnect to local server (explicit)
connect_server(base_url="http://localhost:3000")

# Back to local server
start_agent_session(path="/home/user/another-notebook.ipynb")
insert_cell(path="/home/user/another-notebook.ipynb", ...)
```

## SSH Tunnel Setup

To work with a remote Nebula server:

```bash
# Forward remote Nebula to local port 8001
ssh -L 8001:localhost:3000 user@remote-host

# In another terminal, use the MCP server
# It can now connect to localhost:8001 which forwards to the remote server
```

## Key Points

✅ **Simple**: One connection at a time - no complex routing
✅ **Explicit**: `connect_server` makes the switch clear
✅ **Flexible**: Easy to switch back and forth
✅ **Clean**: No per-notebook URL tracking

## Comparison with Multi-Instance

**Current approach (simpler):**
- One active connection
- Explicit switching with `connect_server`
- Works sequentially with different servers

**Multi-instance approach (more complex):**
- Multiple connections simultaneously
- Per-notebook URL mapping
- Can work with multiple servers at once

We chose the simpler approach for cleaner code and easier debugging. If you need true multi-instance support, you can run multiple MCP server instances.

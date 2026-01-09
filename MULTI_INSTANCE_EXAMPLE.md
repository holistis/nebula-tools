# Multi-Instance Example

This example demonstrates using the Nebula MCP server with multiple Nebula instances simultaneously.

## Scenario

You have:
- Local Nebula instance running on `http://localhost:3000` (default)
- Remote Nebula instance accessible via SSH tunnel on `http://localhost:8001`

## Usage

### 1. Default instance (no base_url specified)

```python
# Uses default URL from NEBULA_URL env var (localhost:3000 by default)
start_agent_session(path="/home/user/local-notebook.ipynb")

# All operations go to localhost:3000
insert_cell(path="/home/user/local-notebook.ipynb",
            cell_id="cell1",
            content="import pandas as pd")

execute_cell(path="/home/user/local-notebook.ipynb",
             session_id="kernel-123",
             cell_id="cell1")

end_agent_session(path="/home/user/local-notebook.ipynb")
```

### 2. Remote instance (with base_url)

```python
# Specify different URL for this session
start_agent_session(
    path="/remote/data/analysis.ipynb",
    base_url="http://localhost:8001"  # SSH tunnel to remote server
)

# Operations go to localhost:8001
insert_cell(path="/remote/data/analysis.ipynb",
            cell_id="cell1",
            content="import numpy as np")

execute_cell(path="/remote/data/analysis.ipynb",
             session_id="kernel-456",
             cell_id="cell1")

end_agent_session(path="/remote/data/analysis.ipynb")
```

### 3. Multiple concurrent sessions

```python
# Start both sessions
start_agent_session(path="/local/notebook1.ipynb")  # → localhost:3000
start_agent_session(path="/remote/notebook2.ipynb",
                   base_url="http://localhost:8001")  # → localhost:8001

# Work with both simultaneously
insert_cell(path="/local/notebook1.ipynb", ...)    # → localhost:3000
insert_cell(path="/remote/notebook2.ipynb", ...)   # → localhost:8001

execute_cell(path="/local/notebook1.ipynb", ...)   # → localhost:3000
execute_cell(path="/remote/notebook2.ipynb", ...)  # → localhost:8001

# Clean up
end_agent_session(path="/local/notebook1.ipynb")
end_agent_session(path="/remote/notebook2.ipynb")
```

## How it works internally

1. **Session registration**: When `start_agent_session` is called with `base_url`, the server stores the mapping: `notebook_path → base_url`

2. **Client caching**: The server maintains a cache of NebulaClient instances per URL to avoid recreating connections

3. **Automatic routing**: All subsequent operations look up the notebook path to find the correct client

4. **Cleanup**: When `end_agent_session` is called, the URL mapping is cleared

## Benefits

- **No token waste**: URL specified once per session, not on every operation
- **Flexible**: Work with multiple instances without reconfiguration
- **Concurrent**: Handle notebooks on different servers simultaneously
- **Backward compatible**: If no `base_url` specified, uses default URL

## Common use cases

1. **SSH tunnels**: Forward multiple remote Nebula instances to different local ports
2. **Dev/Prod**: Work with development and production notebooks in the same session
3. **Multi-region**: Access notebooks across different data centers
4. **Local testing**: Test against multiple Nebula versions running on different ports

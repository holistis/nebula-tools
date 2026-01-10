# Development Guide

## Recent Changes and Architecture

### Agent Session Tracking (nebula-notebook)

**Problem:** When the UI disconnected mid-agent-session, operations would silently fall back to headless mode, causing the agent state and UI state to diverge.

**Solution:** Added agent session tracking to `OperationRouter`:

```python
class OperationRouter:
    def __init__(self):
        # Track active agent sessions - prevents headless fallback
        self._agent_sessions: set[str] = set()

    def start_agent_session(self, notebook_path: str):
        """Mark notebook as being in agent session"""
        normalized_path = str(Path(notebook_path).resolve())
        self._agent_sessions.add(normalized_path)

    async def apply_operation(self, operation):
        # Fail if agent session active but UI disconnected
        if normalized_path in self._agent_sessions:
            return {
                'success': False,
                'error': 'Agent session active but UI disconnected. Cannot fall back to headless mode.'
            }
```

**Files:**
- `server/operation_router.py` - Agent session tracking
- `server/headless_handler.py` - Notifies router on start/end session
- `server/main.py` - Wires router to headless handler

### Claude SDK Backend Support (agent_cli)

The agent CLI now supports two backends:

1. **OpenAI/LiteLLM** (default) - Uses OpenAI API or LiteLLM for model calls
2. **Claude SDK** - Uses official Claude Agent SDK with preset support

**Key Features:**
- Permission mode mapping (local → Claude SDK)
- Hooks integration for tool logging
- System reminder extraction and optional stripping
- Auto-continue feature (detects "Should I proceed?" prompts)
- Custom system prompts or preset-based prompts

**Configuration:**
```bash
# OpenAI backend (default)
python -m agent_cli.main --backend openai --model gpt-4o

# Claude SDK backend with preset
python -m agent_cli.main --backend claude-sdk \
  --claude-sdk-preset claude_code \
  --claude-sdk-cli-path ~/.claude/bin/claude

# Claude SDK with custom prompts
python -m agent_cli.main --backend claude-sdk \
  --system-prompt "Custom prompt" \
  --claude-sdk-stream
```

### System Reminder Handling

Tool results can contain `<system-reminder>` tags that provide context without being part of the core result:

```python
# Tool result with reminder
result = """<system-reminder>
This file was recently modified by another process.
</system-reminder>
File content here..."""

# Extraction and stripping
reminder = _extract_system_reminder(result)  # Extracts reminder content
stripped = _strip_system_reminders(result)   # Removes tags
```

**Configuration:**
- `--strip-system-reminders` - Strip tags before sending to model
- System reminders are always logged separately for analysis

## Testing Recommendations

### Agent CLI Testing

**High Priority:**
1. System reminder extraction/stripping edge cases
2. Auto-continue pattern matching (verify not too broad)
3. Permission mode mapping correctness
4. Prompt template conditional sections

**Test Files to Create:**
- `agent_cli/tests/test_system_reminders.py`
- `agent_cli/tests/test_auto_continue.py`
- `agent_cli/tests/test_permission_mapping.py`
- `agent_cli/tests/test_prompt_conditionals.py`

**Example Test:**
```python
# test_system_reminders.py
def test_extract_system_reminder_multiline():
    text = """<system-reminder>
    Line 1
    Line 2
    </system-reminder>"""
    result = _extract_system_reminder(text.strip())
    assert result == "Line 1\nLine 2"

def test_strip_preserves_surrounding_text():
    text = "Before <system-reminder>hidden</system-reminder> After"
    result = _strip_system_reminders(text)
    assert result == "Before  After"
```

### Nebula Notebook Testing

**Agent Session Tracking:**
```python
# Test that operations fail gracefully when UI disconnects
async def test_agent_session_blocks_headless_fallback():
    router = OperationRouter()
    router.start_agent_session("/test/notebook.ipynb")

    # UI not connected, but session active
    result = await router.apply_operation({
        'type': 'insertCell',
        'notebookPath': '/test/notebook.ipynb',
        'cell': {...}
    })

    assert result['success'] is False
    assert 'UI disconnected' in result['error']
```

## Code Quality Notes

### Auto-Continue Pattern Matching

**Current Implementation:**
```python
def _should_auto_continue(text: str) -> bool:
    phrases = ("should i proceed", "plan mode", "approve", ...)
    if any(phrase in lowered for phrase in phrases):
        return True
```

**Concern:** "plan mode" phrase is too broad - could match unrelated text like "This demonstrates plan mode usage..."

**Recommendation:** Add context requirements:
```python
def _should_auto_continue(text: str) -> bool:
    lowered = text.lower().strip()

    # Must be a question or end with approval keywords
    if not (lowered.endswith("?") or lowered.endswith("approval")):
        return False

    # Then check for proceed patterns
    if "proceed" in lowered or "continue" in lowered:
        return True

    # More specific plan mode check
    if "plan mode" in lowered and "?" in lowered:
        return True

    return False
```

## MCP Server Configuration

**Environment Variables:**
- `NEBULA_URL` - Backend URL (default: http://localhost:3000)
- Use frontend dev server (port 3000) which proxies `/api/*` to backend (port 8000)
- For SSH tunnels, use the forwarded port (e.g., http://localhost:4000)

**Configuration File:** `~/.claude.json`
```json
{
  "projects": {
    "/path/to/project": {
      "mcpServers": {
        "nebula-notebook": {
          "command": "nebula-mcp",
          "env": {
            "NEBULA_URL": "http://localhost:4000"
          }
        }
      }
    }
  }
}
```

## Logging and Debugging

### Agent CLI Logging

**Tool Log** (`--tool-log path.jsonl`):
- Tool calls with arguments
- Tool results (original and stripped)
- Duration in milliseconds
- System reminders extracted from tools

**Trace Log** (`--trace-log path.jsonl`):
- System prompt content
- User input
- Model requests and responses
- Tool execution
- Compaction events
- Auto-continue triggers

**Example:**
```bash
python -m agent_cli.main \
  --tool-log /tmp/tools.jsonl \
  --trace-log /tmp/trace.jsonl \
  --tool-log-max-chars 5000
```

### MCP Server Logging

The MCP server logs to stderr:
```
[Nebula MCP] Default URL: http://localhost:3000
[Nebula MCP] Executing tool: insert_cell
[Nebula MCP] Tool insert_cell completed successfully
```

**Viewing Logs:**
- Claude Code: Check `~/.claude/logs/mcp-*.log`
- Direct: Run with `NODE_DEBUG=nebula nebula-mcp`

## Future Improvements

### Agent CLI
1. Refine auto-continue pattern matching (see notes above)
2. Add comprehensive test suite for new features
3. Add integration tests for Claude SDK backend
4. Consider adding usage examples to README

### Nebula Notebook
1. Add health check endpoint to MCP server
2. Auto-retry on network failures with exponential backoff
3. Configurable timeouts in MCP config
4. Support for multiple simultaneous notebooks in agent sessions
5. MCP server metrics/analytics

### Documentation
1. Add troubleshooting guide for common issues
2. Create video walkthrough of MCP integration
3. Document performance characteristics of bulk operations
4. Add architecture diagrams for operation routing

## Contributing

When adding new features:
1. Follow TDD (test-driven development)
2. Add logging at key decision points
3. Update relevant documentation
4. Consider backward compatibility
5. Add type hints for Python code
6. Use proper error handling (never silently fail)

## Security Considerations

All new code has been reviewed for security:
- ✅ Proper input validation (file paths, JSON parsing)
- ✅ No code execution from untrusted sources
- ✅ Permission system properly integrated
- ✅ Environment variable usage is safe
- ✅ No SQL injection or XSS vulnerabilities

When adding new features, always consider:
- Input validation and sanitization
- Permission checks for destructive operations
- Error messages (don't leak sensitive info)
- Path traversal prevention
- Rate limiting for external API calls

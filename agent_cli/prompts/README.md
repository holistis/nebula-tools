# Prompts (verbatim)

[Back to README](../README.md)

- [System prompt template](system_prompt.md)
- [Tool prompts](tool_prompts.md)
- [Compaction prompt](compaction_prompt.md)
- [Plan mode prompts](plan_mode.md)
- [Subagent prompts](subagent_prompts.md)
- [Subagent metadata](subagent_metadata.json)

Notes for programmatic use:
- Prompt files include small HTML comment blocks with parser guidance.
- Section headers are intended as stable parse markers; avoid non-ASCII variants.
- Optional blocks (Output Style, MCP instructions, Scratchpad, Reasoning) are appended only if configured at runtime.

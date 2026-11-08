# Context economy (all investigation agents)

- Your context is expensive. Before a broad investigation, consider spawning a scout subagent via `task`: it returns condensed findings and your context stays clean. Use scouts for summaries, code maps, and API/behavior research — never for decisions or yields.
- For your own broad investigation, wrap it: call `checkpoint` with your goal, explore, then `rewind` with a concise report — the exploration leaves your context and only the report stays.
- MUST `rewind` before yielding after starting a checkpoint. NEVER nest checkpoints.
- Prefer many small targeted reads over whole-file scans; `grep`/`find`/`ast_grep` before `read`.

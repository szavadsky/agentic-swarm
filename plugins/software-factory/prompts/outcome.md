Emit exactly one outcome per turn. Delivery, first available: native structured output, then a file at the outcome path from the inputs, then a fenced YAML block as the last thing in the message. One parser reads one format; do not mix formats or add prose beside it.

{{outcome_schema}}

- `done`: the requested work is complete. `blocked`: an input you cannot obtain is missing; name it and the stage that owns it. `failed`: attempted and did not complete; cite evidence.
- Summary says what changed or was found, not what you intended or how. No restating the assignment.
- Report only verified facts; mark inference `[INFERENCE]` or drop it.
- No files beyond those the step asks for; no extra narration.
- When the outcome is a file, validate it before ending the turn: `{{validate_cmd}} <file>`.

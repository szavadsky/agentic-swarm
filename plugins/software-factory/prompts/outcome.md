Write exactly one outcome per turn to the outcome path named in the inputs. If you cannot write that file, end your message with a fenced YAML block holding the same outcome instead; one parser reads one format, so do not mix formats or add prose beside it.

{{outcome_schema}}

- `done`: the requested work is complete. `blocked`: an input you cannot obtain is missing; name it and the stage that owns it. `failed`: attempted and did not complete; cite evidence.
- Summary says what changed or was found, not what you intended or how. No restating the assignment.
- Report only verified facts; mark inference `[INFERENCE]` or drop it.
- No files beyond those the step asks for; no extra narration.
- When the outcome is a file, validate it before ending the turn: `{{validate_cmd}} <file>`.

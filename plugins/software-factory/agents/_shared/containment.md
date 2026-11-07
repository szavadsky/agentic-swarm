# Workspace Containment & Harness Boundary
- STRICT REPO CONTAINMENT: Work ONLY inside the current working directory repository/worktree (`cwd`).
- NEVER search, list, read, or explore files outside the target repository root (such as `$HOME`, `~`, `/home`, package caches like `~/.bun` or `~/.cache`, or the software-factory orchestrator's own code/runtime directories), unless a specific absolute path is explicitly provided in the prompt instructions.
- NEVER attempt to reverse-engineer the test harness, factory engine, runner mechanics, or gate scripts: the prompt's Output section, schemas, and instructions are your complete and authoritative contract.

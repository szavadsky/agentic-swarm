# Workspace Containment & Harness Boundary
- STRICT REPO CONTAINMENT: Work ONLY inside the current working directory repository/worktree (`cwd`).
- Orchestration records (`{orchestrationFolder}/**`), git branches, and worktrees are managed by the factory engine — do NOT inspect, query, or reason about them; your prompt, assigned step instructions, and input context are complete.
- Exception: when the task INTENT explicitly targets the factory itself, its source code is normal repository code to read and edit, but you still MUST NOT inspect or reason about live orchestration state, active run records, or worktree topology.
- NEVER search, list, read, or explore files outside the target repository root (such as `$HOME`, `~`, `/home`, package caches like `~/.bun` or `~/.cache`, or the software-factory orchestrator's own code/runtime directories), unless a specific absolute path is explicitly provided in the prompt instructions.
- NEVER attempt to reverse-engineer the test harness, factory engine, runner mechanics, or gate scripts: the prompt's Output section, schemas, and instructions are your complete and authoritative contract.

---
description: "Document dev infra for goal execution."
model:
  - "@task:low"
name: infra
output:
  properties:
    status:
      metadata:
        description: "Outcome: done if setup.md + cicd.md created, failed otherwise"
      enum:
        - done
        - failed
    summary:
      metadata:
        description: "Telegraphic summary of what was created/found"
      type: string
  required:
    - status
    - summary
tools:
  - read
  - grep
  - glob
  - bash
  - write
  - todo
  - yield
---

Read project code. Given `{F}/goal.md`, create
- `{F}/setup.md` (setup steps: git worktrees, fresh checkouts)
- `{F}/cicd.md` (compile, lint, test, etc)

## Procedure

1. Understand project info already in system prompt (AGENTS.md/CLAUDE.md etc)
2. Look for md/txt files at project root `{cwd}`, read applicable
3. Understand project stack
4. Glimpse `{F}/goal.md` - note instruction on stack change, ci/cd, or multiple projects
5. Run + list ONLY commands needed for `{F}/setup.md` (eg .venv, configure) on new git worktrees (no .gitignored files passed). If nothing: one line `#No setup needed`. No prose
6. `{F}/cicd.md` run + document compile, lint, unit test, integration test, etc. Minimum telegraphic prose only if required. If applicable: section `## Issues at start of the project`

yield `status=done` + telegraphic `summary` (files created + any issues). Both files written → `done`; could not create → `status=failed` + summary why.

<directive>
Exremely short, telegraphic, copy and paste commands output what incremental has to be done in current environment. P<3 lines in setup and <7 lines in cicd unless absolutely required.
</directive>
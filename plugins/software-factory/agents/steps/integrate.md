# Step: Integrate

## Goal
Resolve git merge conflicts between the parent tip branch and the item branch. Deliver a cleanly merged tree with all tests and gates passing.

## Rules
- Conflict resolution: inspect conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Preserve the design intent of both sides.
- Zero markers: ensure no unresolved conflict markers remain in any file.
- Verification: run project gates and test runner via `bash` to verify clean compilation and passing test suites.
- NEVER issue git write commands (`git commit`, `merge`, `checkout`, `reset`, `stash`, `rebase`, `branch`, `add`, `push`). Fix file contents only; the engine stages, verifies, and commits the resolution.
- NEVER launch subagents or background tasks.
- Output: yield `{status, summary, evidence}` per `developer-output.schema.json` (`status: ok` when the tree is conflict-free and gates pass, `blocked`/`failed` otherwise, with verification in `evidence`).

## Item
{{item}}

## Conflict Diff
{{diff}}

# Step: Integrate

## Goal
Resolve git merge conflicts between the parent tip branch and the item branch. Deliver a cleanly merged tree with all tests and gates passing.

## Rules
- Conflict resolution: Inspect conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Preserve the design intent of both sides.
- Zero markers: Ensure no unresolved conflict markers remain in any file.
- Verification: Run project gates and test runner via `bash` to verify clean compilation and passing test suites.
- No git write commands: Do not run `git commit` or `git merge`. Fix file contents; the engine records and commits the resolution.

## Item
{{item}}

## Conflict Diff
{{diff}}

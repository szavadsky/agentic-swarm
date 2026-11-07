# Step: Develop

## Goal
Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.

## Rules
- Target green: Every test selector and case identified in `target` MUST pass cleanly.
- Quality gates: Run project gates via `bash`; all gates MUST succeed with exit code 0.
- Sizing budget: Keep changes minimal. Production code diff MUST not exceed `storyMaxProdLines` (default 300 lines).
- Evidence mandatory: Yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification). Output format matches `developer-output.schema.json`: `{status, summary, target?, evidence, concerns}`.
- Clean code per engineering philosophy:
{{> _shared/philosophy}}

## Assignment
{{assignment}}

## Target
{{target}}

## Context & Citations
{{citations}}

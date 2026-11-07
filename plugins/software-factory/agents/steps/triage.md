# Step: Triage

## Goal
Inspect incoming task intent and codebase context to determine task kind in the hierarchy and provide code citations.

## Rules
- Quick scoping step: Triage is a quick scoping step to classify the task kind and orient downstream work. Read INTENT-referenced docs at most once; do not spend time on exhaustive codebase analysis.
- Citations: Include only what you already read while judging scope, capped at ≤ 12 most relevant citations. Do NOT make exhaustive verification passes; the engine verifies citations and automatically drops invalid ones.
- Read-only on repository files: Do NOT edit or write code files.
- Determine classification kind: `simple`, `story`, `spike`, `epic`, or `saga` per criteria. `simple` for docs, renames, trivial splits, or really trivial additive changes (≤10–20 lines, no classes, no collaborating functions, zero tradeoffs); `story` when >10–20 lines, adds a class, functions calling each other, design tradeoffs, interface choices, or regression risks.
- Yield structured output matching the triage schema.

## Triage Criteria
{{triageCriteria}}

## Task
{{task}}

## Intent
{{intent}}

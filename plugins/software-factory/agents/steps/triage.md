# Step: Triage

## Goal
Inspect incoming task intent and codebase context to determine task kind in the hierarchy and extract verified code citations.

## Rules
- Read-only on repository files: Do NOT edit or write code files.
- Determine classification kind: `simple`, `story`, `spike`, `epic`, or `saga` per criteria. `simple` for docs, renames, trivial splits, or really trivial additive changes (≤10–20 lines, no classes, no collaborating functions, zero tradeoffs); `story` when >10–20 lines, adds a class, functions calling each other, design tradeoffs, interface choices, or regression risks.
- Extract verified citations: Every citation in `citations` MUST reference existing files, valid line numbers, and exact symbol/heading anchors.
- Yield structured output matching the triage schema.

## Triage Criteria
{{triageCriteria}}

## Task
{{task}}

## Intent
{{intent}}

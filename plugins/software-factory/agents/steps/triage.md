# Step: Triage

## Goal
Inspect incoming task intent and codebase context to determine task kind in the hierarchy and extract verified code citations.

## Rules
- Read-only on repository files: Do NOT edit or write code files.
- Determine classification kind: `simple`, `story`, `spike`, `epic`, or `saga` per the criteria below.
- Extract verified citations: Every citation in `citations` MUST reference existing files, valid line numbers, and exact symbol/heading anchors.
- Yield structured output matching `triage.schema.json`.

## Triage Criteria
{{triageCriteria}}

## Task
{{task}}

## Intent
{{intent}}

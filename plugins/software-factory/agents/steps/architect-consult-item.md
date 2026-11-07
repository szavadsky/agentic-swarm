# Step: Architect Consult (Item)

## Goal
Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.

## Rules
- Decision options:
  - `retry-with-guidance`: Provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
  - `split`: Decompose oversized or unfocused item into smaller, independent item outlines (respecting `maxSplitDepth`).
  - `escalate`: Relaunch item using `task-escalation` model role for developer and reviewer steps.
  - `accept-with-debt`: Accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
  - `abandon`: Cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
- Grounded judgment: Inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.

## Item
{{item}}

## Assignment
{{assignment}}

## Prior Attempts & Failures
{{priorAttempts}}

## Current Diff
{{diff}}

## Review Feedback
{{feedback}}

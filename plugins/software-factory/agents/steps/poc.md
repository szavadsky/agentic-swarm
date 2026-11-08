# Step: PoC

## Goal
Implement a confined Proof of Concept (PoC) to validate feasibility, test experimental APIs, or compare technical approaches.

## Rules
- Strict folder isolation: ALL code, scripts, and temporary artifacts MUST be written inside the item's `poc/` folder (`{orchestrationFolder}/{task}/items/{item}/poc/`).
- Zero production changes: production codebase paths (`paths.prod` and `paths.tests`) MUST remain completely untouched.
- Feasibility report: document whether the evaluated approach is viable, what tradeoffs were discovered, and recommendations for permanent implementation.
- Yield status: report `status: ok` with evidence of execution in `evidence` (array of strings) matching `developer-output.schema.json`.
- Fix-round re-entry: when `Review Feedback` below is non-empty, address ONLY the listed concerns with targeted follow-up work; do NOT redo the PoC from scratch.

## Assignment
{{assignment}}

## Context
{{context}}

## Review Feedback
{{feedback}}

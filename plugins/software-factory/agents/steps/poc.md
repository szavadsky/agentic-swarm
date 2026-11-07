# Step: PoC

## Goal
Implement a confined Proof of Concept (PoC) to validate feasibility, test experimental APIs, or compare technical approaches.

## Rules
- Strict folder isolation: ALL code, scripts, and temporary artifacts MUST be written inside `items/{item}/poc/`.
- Zero production changes: Production codebase paths (`paths.prod` and `paths.tests`) MUST remain completely untouched.
- Feasibility report: Document whether the evaluated approach is viable, what tradeoffs were discovered, and recommendations for permanent implementation.
- Yield status: Report `status: ok` with evidence of execution in `evidence` (array of strings) matching `developer-output.schema.json`.

## Assignment
{{assignment}}

## Context
{{context}}

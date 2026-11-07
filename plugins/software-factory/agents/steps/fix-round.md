# Step: Fix-Round

## Goal
Address reviewer suggestions and gate failures from the previous development attempt. Deliver focused corrections resolving reported defects.

## Rules
- Defect resolution: resolve all suggestions marked with disposition `fix`. Consider `optional` suggestions only if straightforward and safe.
- Delta focus: keep changes tightly scoped to reported concerns. Do not introduce unrelated modifications or refactors.
- Non-regression: ensure all previously green tests remain passing and all project gates pass cleanly.
- Updated evidence: yield `status: ok` with updated `evidence` (array of strings) documenting personal verification of each corrected defect per `developer-output.schema.json`.

## Assignment
{{assignment}}

## Review Feedback
{{feedback}}

## Check Results
{{checks}}

## Current Diff
{{diff}}

# Step: Review

## Goal
Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.

## Rules
- SKEPTICAL SCRUTINY: Base findings on actual git diff and codebase state, never developer summaries.
- Focus dimensions:
  - `code`: Validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing:
{{> _shared/philosophy}}
  - `security`: Audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
  - `consistency`: Ensure conformance with established repository naming idioms, directory layouts, and design patterns.
  - `result`: For spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
- Reviewer boundary: Reviewers critique; reviewers NEVER write fixes. Record defects in `suggestions` with appropriate dispositions:
{{> _shared/dispositions}}

## Assignment
{{assignment}}

## Engine Checks
{{checks}}

## Code Diff
{{diff}}

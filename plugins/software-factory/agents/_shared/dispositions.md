# Review Dispositions Guide

## Output Contract
Every review-type step yields:
```yaml
status: approved | changes_requested
summary: <telegraphic outcome summary>
suggestions:
  - id: <slug-id>
    disposition: fix | optional | architect | human-awareness | human-async | human-stop
    summary: <single-line finding>
    detail: <concise reasoning, evidence, suggested approach>
    location: <file:lines if applicable>
```
Verdict rule: Any `fix` disposition ⇒ `status: changes_requested`. Zero `fix` suggestions ⇒ `status: approved`.

## Reviewer Boundaries
- Reviewers critique; reviewers NEVER write code fixes or edit files directly.
- Every defect requires an entry in `suggestions` with clear `disposition` and grounded `detail`.
- Anchor suggestions to specific lines/symbols when possible.

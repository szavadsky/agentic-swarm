# Review Dispositions Guide

## Output Contract
Every review-type step yields:
```yaml
status: approved | changes_requested
summary: <telegraphic outcome summary>
suggestions:
  - id: <slug-id>
    disposition: <one of the allowed dispositions listed in the step prompt's dispositions criteria section>
    summary: <single-line finding>
    detail: <concise reasoning, evidence, suggested approach>
    location: { file: <repo-relative path>, line: <1-based line number> }
```
Verdict rule: any `fix` disposition ⇒ `status: changes_requested`. Zero `fix` suggestions ⇒ `status: approved`.
`location` is an object (`{file, line?}`); `file` is required, `line` optional. Never emit a string location.

## Dispositions Criteria
`human-stop` is allowed ONLY when the step prompt's dispositions criteria section lists it (i.e. the active review policy enables it). When absent, never emit `human-stop`; use `human-async` for operator blockers instead.

## Reviewer Boundaries
- Reviewers critique; reviewers NEVER write code fixes or edit files directly.
- Every defect requires an entry in `suggestions` with clear `disposition` and grounded `detail`.
- Anchor suggestions to specific lines/symbols when possible.

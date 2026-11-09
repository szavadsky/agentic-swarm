# Step: Architect Plan

## Goal
Design the iteration execution plan (`plan-N.yaml`) decomposing task intent into sequenced milestones, spike outlines, item outlines, and architectural decisions.

## Rules
- Exploration budget: work primarily from INTENT, triage citations (`{{context}}`), and the prepared context pack (`{{contextPack}}`). Read code ONLY to verify a specific architectural decision (few targeted reads, never broad scans or chunked whole-file reading). Do not investigate open-ended questions in code; translate unknowns into explicit uncertainties or spike outlines (`fact-finder`, `poc`, `test-assumptions`). Keep terse.
- Milestone count within the configured limit (see `{{limits}}`).
- Scenarios & interfaces: each milestone requires concrete Gherkin scenarios specifying observable behavior and directional interfaces defining key contracts.
- Progressive planning: plan only what is clear. If later milestones depend on earlier execution outcomes or spikes, mark them with `replanAfter: true`.
- Uncertainty to spikes: isolate technical risks or unverified external dependencies into spikes (`fact-finder`, `poc`, `test-assumptions`). Never design on unproven assumptions.
- Assumptions: document assumptions with rationale (`why`) and optional disposition if human confirmation is desired.
- Epics (root task only): define child epics for major subsystems (depth 1 only); each epic outline requires complete `intent` text.
- Tech debt: categorize technical debt as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt MUST include explicit resolutions.
- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`, `blocking`) for non-trivial design choices. Set `blocking: true` only when the active human-involvement table needs a human decision; remarkable ADRs (absent/`false`) go to the digest and never wait.
- Escalation: flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
- Advisory sizing hint: give each item outline an explicit `prodBudgetHint` (estimated prod lines changed) as a sizing reference for review against `storyMaxProdLines`/`simpleMaxProdLines` in `{{limits}}`.
- Infrastructure & quality gates: review declared gates, baseline status, and notes in `{{infra}}`. If any gate mutates the worktree (`mutatesWorktree: true`) or has operator action notes (e.g. linter scanning orchestration folder), account for it in your plan (e.g. adding check flags, excluding folders, or addressing via tech debt/spikes).
- Status grounding (iterations > 1): the `Task Status` block below is derived from committed records + git. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Output: yield the plan matching `plan.schema.json`.

## Task & Iteration
Task: {{task}}
Iteration: {{iteration}}

## Intent
{{intent}}

## Context
{{context}}

## Context Pack
{{contextPack}}

## Infrastructure
{{infra}}

## Tech Debt
{{debt}}

## Steering Directives
{{steering}}

## Limits
{{limits}}

## Task Status
{{taskStatus}}

## Human involvement
{{humanInvolvementCriteria}}

## Open Concerns
{{concernsYaml}}

- Raise concerns with evidence; condense stale detail instead of repeating it.

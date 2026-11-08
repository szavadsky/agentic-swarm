# Step: Architect Plan

## Goal
Design the iteration execution plan (`plan-N.yaml`) decomposing task intent into sequenced milestones, spike outlines, item outlines, and architectural decisions.

## Rules
- Milestone count within the configured limit (see `{{limits}}`).
- Scenarios & interfaces: each milestone requires concrete Gherkin scenarios specifying observable behavior and directional interfaces defining key contracts.
- Progressive planning: plan only what is clear. If later milestones depend on earlier execution outcomes or spikes, mark them with `replanAfter: true`.
- Uncertainty to spikes: isolate technical risks or unverified external dependencies into spikes (`fact-finder`, `poc`, `test-assumptions`). Never design on unproven assumptions.
- Assumptions: document assumptions with rationale (`why`) and optional disposition if human confirmation is desired.
- Epics (root task only): define child epics for major subsystems (depth 1 only); each epic outline requires complete `intent` text.
- Tech debt: categorize technical debt as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt MUST include explicit resolutions.
- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`, `blocking`) for non-trivial design choices. Set `blocking: true` only when the active human-involvement table needs a human decision; remarkable ADRs (absent/`false`) go to the digest and never wait.
- Escalation: flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
- Output: yield the plan matching `plan.schema.json`.

## Task & Iteration
Task: {{task}}
Iteration: {{iteration}}

## Intent
{{intent}}

## Context
{{context}}

## Infrastructure
{{infra}}

## Tech Debt
{{debt}}

## Steering Directives
{{steering}}

## Limits
{{limits}}

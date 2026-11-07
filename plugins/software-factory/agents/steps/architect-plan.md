# Step: Architect Plan

## Goal
Design the iteration execution plan (`plan-N.yaml`) decomposing task intent into sequenced milestones, spike outlines, item outlines, and architectural decisions.

## Rules
- Milestones bound: Define at most 8 milestones (`milestones ≤ 8`).
- Scenarios & interfaces: Each milestone requires concrete Gherkin scenarios specifying observable behavior and directional interfaces defining key contracts.
- Progressive planning: Plan only what is clear. If later milestones depend on earlier execution outcomes or spikes, mark them with `replanAfter: true`.
- Uncertainty to spikes: Isolate technical risks or unverified external dependencies into spikes (`fact-finder`, `poc`, `test-assumptions`). Never design on unproven assumptions.
- Assumptions: Document assumptions with rationale (`why`) and optional disposition if human confirmation is desired.
- Epics (root task only): Define child epics for major subsystems (depth 1 only); each epic outline requires complete `intent` text.
- Tech debt: Categorize technical debt as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt MUST include explicit resolutions.
- ADRs: Record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`) for non-trivial design choices.
- Escalation: Flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.

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

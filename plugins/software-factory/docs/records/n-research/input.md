# Step: Research

## Goal
Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.

## Rules
- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.

## Assignment
{
  "slug": "spike-saga-commit",
  "kind": "fact-finder",
  "title": "Spike: saga propagation, commit, derive boundary",
  "assignment": "Read-only fact-finder verifying epic propagation timing, taskWt serialization/restart, and pure-derive vs act-phase boundary (adr-concern-store-taskwt, adr-routing-derived-state). Verify: runChildTask parent-copy timing after child completion before cleanup/merge, parent buildArchitectHydration extension seam for concernsYaml, taskWt runExclusive serialization under 4 parallel items, writeYamlAtomic + immediate taskWt commit idempotency on retry/restart, collectRoutedBlockers owner in derive/task.ts. Produce items/{item}/findings.md + structured findings; no prod code. Gates concerns-store, routing-blocker-derive, saga-propagate.",
  "outlineRef": "spike-saga-commit",
  "milestone": "m1-contracts-aggregate",
  "wave": 1,
  "scenarioRefs": [
    "m1-contracts-aggregate:s2",
    "m3-routing:s2",
    "m4-funnel-surface:s5"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485",
    "plugins/software-factory/src/core/derive/task.ts:167-205"
  ]
}

## Task Intent
# concerns-funnel

Implement spec item 18 of `docs/factory.v2.md` in `plugins/software-factory`
(read it in full; it is the acceptance definition):
- structured `concerns[]` and remarkable decisions/tradeoffs in agent outputs;
- engine aggregation under the task folder (`concerns/`, stable fingerprint ids, dedup, status, source record);
- triage by the step's reviewer (workhorse class; architect output → plan-reviewer) with the review disposition
  vocabulary plus `dismiss` (logged with reason, kept);
- routing: blockers block dependent items + architect consult; `architect` → next architect turn;
  `human-*` → steer mailbox per policy; tech debt → plan tech-debt list;
- funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text
  than the code summarized; saga architect reviews epic-level items and steers or propagates;
- blocking vs non-blocking ADRs; remarkable items reported in a mailbox digest, never waiting;
- human-involvement mode presets `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect
  prompt fragments), shipped as commented default config examples; selectable per task;
- surfaced in wave/plan close-ups, `factory status`, state.yaml counts.
Update `plugins/software-factory/docs/ARCHITECTURE.md` (incl. the §1 row for item 18), README and config commentary.
Keep prompts terse (debloated). Behavior tests only. Expected scope: a couple of iterations at most.


## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/flows/iteration.ts:439-485",
  "plugins/software-factory/src/core/derive/task.ts:167-205"
]

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)

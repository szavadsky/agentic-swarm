# Step: Research

## Goal
Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.

## Rules
- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.

## Assignment
{
  "slug": "epic-shift-report-collection",
  "kind": "fact-finder",
  "title": "Consolidate epic shift reports into handoff record",
  "assignment": "Root-owned fan-in (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). M2 replanAfter:true is enforceable gate: engine schedules only in post-replan wave after M2 epic close-ups exist. Read three epic close-up reports; extract each epic's shift-report section (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; consolidate into one handoff record with exactly 3 epic sections. If any close-up missing, stay pending (fails open, never fabricates). Output feeds golden-regen-hatch exclusively. Verify handoff has exactly 3 sections, each either shift report or explicit no-shift declaration. Covers ADR-011 shift-handoff contract and M2->M3 gate.",
  "outlineRef": "epic-shift-report-collection",
  "milestone": "M3",
  "wave": 3,
  "deps": [
    "epic-kickoff-gate"
  ],
  "scenarioRefs": [
    "M3: Golden integrity preserved"
  ],
  "citations": [
    "lint.baseline:1-1",
    "AGENTS.md:87-93",
    "CodingRules.md:90-107"
  ]
}

## Task Intent
# modernize

Modernize the project while preserving every material lint/check behavior.
- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
- Remove redundant tests.
- Replace the embedding/rerank based justification/comment check
  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.


## Context & Citations
[
  "lint.baseline:1-1",
  "AGENTS.md:87-93",
  "CodingRules.md:90-107"
]

## Review Feedback


## Open Concerns
- id: c-3e935debcb
  kind: risk
  severity: low
  summary: PoC lock is POSIX-only fcntl.flock
  affects:
    - cache-design-spike
    - decision-cache-impl
- id: c-5463b26c4b
  kind: assumption
  severity: medium
  summary: Production call site passes a constant rule symbol, collapsing the cache rule component
  affects:
    - cache-design-spike
    - decision-cache-impl


- Review the concerns above before starting; they constrain this step but are not part of the assignment.
- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)
- concerns (array of object, optional): Structured concerns raised while investigating
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)

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
  "slug": "secrets-triage-spike",
  "kind": "fact-finder",
  "title": "Triage detect-secrets factory-journal flags",
  "assignment": "GOAL: Triage detect-secrets flags on clean checkout to define M1 lint-green for that tool (U4, TD2-B3). No repo edits; report only. STEPS: On clean checkout run declared lint gate and detect-secrets scan; capture every flagged file plus sha256 plus baseline entry. Verdict: environmental (only tracked factory runtime journals) vs real secret. If environmental: specify exact exclusion mechanism (engine config vs gate command flag) plus evidence hashes, and record operator and engine exclusion request as human-async; M1 dev acceptance does not wait on it. If real: specify redact and rotate follow-up. VERIFY: Report lists all flagged files with hashes, verdict with evidence, and exact next action; zero file writes. Feeds M1 acceptance.",
  "outlineRef": "secrets-triage-spike",
  "milestone": "M1",
  "wave": 2,
  "scenarioRefs": [
    "M1-1"
  ],
  "citations": [
    ".gitignore:243-244",
    "lint.baseline:1-1",
    "AGENTS.md:121-139"
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
  ".gitignore:243-244",
  "lint.baseline:1-1",
  "AGENTS.md:121-139"
]

## Review Feedback

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)

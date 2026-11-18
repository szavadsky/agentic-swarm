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
  "slug": "model-candidate-matrix",
  "kind": "fact-finder",
  "title": "Decision-model candidate matrix",
  "assignment": "GOAL: Evidence matrix for decision-model candidates to feed eval-poc, cache spike, and runtime pinning (U1). No repo edits; report only. STEPS: Build table for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m plus MiniLM baseline with columns: license, params and weights bytes, runtime stack, py3.14 CPU wheels for linux/mac/win, custom-code and vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino plus bekko-unclear-license for human review per assumption. Record model-id and rev format for cache spike. Output structured findings consumable by eval-poc without re-research. VERIFY: Every candidate has explicit include or exclude with reason; Fastino gating and Apache-first posture explicit; no file writes.",
  "outlineRef": "model-candidate-matrix",
  "milestone": "M3",
  "wave": 1,
  "scenarioRefs": [
    "M3-1"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:1-12",
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "src/python_setup_lint/checkers/_semantic.py:93-122",
    "pyproject.toml:28-31",
    "docs/semantic-justification.md:5-14",
    "AGENTS.md:79-85"
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
  "src/python_setup_lint/checkers/_semantic.py:1-12",
  "src/python_setup_lint/checkers/_semantic.py:37-52",
  "src/python_setup_lint/checkers/_semantic.py:93-122",
  "pyproject.toml:28-31",
  "docs/semantic-justification.md:5-14",
  "AGENTS.md:79-85"
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

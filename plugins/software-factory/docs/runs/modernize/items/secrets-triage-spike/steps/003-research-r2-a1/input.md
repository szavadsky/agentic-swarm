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

Human answer to question "Add .factory/tasks/*/journal.ndjson and .factory/tasks/*/runs/ to .gitignore with git rm --cached, or seed the should_exclude_file filter at init/backfill. Also correct stale claims: infra.yaml:43-51 note that detect-secrets passes, and gates-baseline.yaml:135 [detect-secrets] PASSED [7.7s] captured 2026-11-07T19:11:42Z (predates flagged journal line 81 ts 2026-11-08T02:00:28Z). M1 dev acceptance does not wait on this.":
Answers to secrets-triage-spike questions: (1) q-secrets-triage-spike-engine-untrack-runtime-journals: do NOT untrack journals — journal.ndjson and runs/ are audit records and must stay committed. Instead seed the should_exclude_file filter at factory init/backfill so fresh checkouts exclude .factory/ from secret scanning by default. Also fix the two stale claims (infra.yaml note that detect-secrets passes; gates-baseline [detect-secrets] PASSED line) to reflect that the baseline predates the flagged journal lines. File the filter-seeding as a harness follow-up item. (2) q-secrets-triage-spike-operator-secrets-baseline-exclusion: YES, add the ^\.factory/ pattern to .secrets.baseline filters_used after line 40 in the python-setup repo (task-branch commit), keeping the awareness residual-risk caveat (write-time redaction + periodic unfiltered audits). M1 acceptance cites the mechanism + pinned HEAD, not the finding count.


Human answer to question "Insert {"path": "detect_secrets.filters.regex.should_exclude_file", "pattern": ["^\\.factory/"]} into .secrets.baseline filters_used after line 40. Evidence: HEAD a7fad649, journal.ndjson sha256 1894aacd89836a36ea24de00c485db10a5a1a042dcfe5cdf351c07e645b471e3, output.yaml sha256 744664c850a9f535cdba123f3c05622c9bac44e98c0c94413130d6151e63d509, 8/8 line hashes verified, 7/7 hex hits verified as git commits via cat-file, keyword hashed_secret 43e65bf1414867b0fe6ada36116e53fc1521ec7c verified as sha1 of 358-char prose. Reviewer independently replicated: filtered baseline makes full git-ls-files scan exit 0 while planted control secret still exits 1. M1 dev acceptance does not wait on this.":
Answers to secrets-triage-spike questions: (1) q-secrets-triage-spike-engine-untrack-runtime-journals: do NOT untrack journals — journal.ndjson and runs/ are audit records and must stay committed. Instead seed the should_exclude_file filter at factory init/backfill so fresh checkouts exclude .factory/ from secret scanning by default. Also fix the two stale claims (infra.yaml note that detect-secrets passes; gates-baseline [detect-secrets] PASSED line) to reflect that the baseline predates the flagged journal lines. File the filter-seeding as a harness follow-up item. (2) q-secrets-triage-spike-operator-secrets-baseline-exclusion: YES, add the ^\.factory/ pattern to .secrets.baseline filters_used after line 40 in the python-setup repo (task-branch commit), keeping the awareness residual-risk caveat (write-time redaction + periodic unfiltered audits). M1 acceptance cites the mechanism + pinned HEAD, not the finding count.



- [OPTIONAL] Scope the --baseline masking claim to detect-secrets-scoped runs: `uv run lint ... --baseline lint.baseline` exits 0 while printing [detect-secrets] FAILED only when no record-tool violations exist (e.g. `--tools detect-secrets --baseline lint.baseline`). A full-gate --baseline run on the current checkout exits nonzero because ruff SIM102 and pylint R0914 yield records vs baseline [] (baseline.py:262-282), so _handle_baseline keeps overall_rc nonzero (_cli_helpers.py:41-53). Mechanism and warning are correct; suggest adding the `--tools detect-secrets` qualifier to findings 5.3 and recommendations.

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)

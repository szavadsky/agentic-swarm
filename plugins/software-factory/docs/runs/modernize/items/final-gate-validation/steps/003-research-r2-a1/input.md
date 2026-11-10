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
  "slug": "final-gate-validation",
  "kind": "fact-finder",
  "title": "Final gate table and docs reconciliation check",
  "assignment": "Root-owned final validation (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). Record final gate table: format exit 0; lint per-tool results on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); pytest -q green (pass/skip/deselect counts); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without via ensure_precommit_or_skip); golden byte-identical or regen-with-reviewed-diff per hatch report; lint.baseline []; docs reconciliation with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts to 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits. Covers M3 close-out, TD3-A1/TD3-I2.",
  "outlineRef": "final-gate-validation",
  "milestone": "M3",
  "wave": 5,
  "deps": [
    "golden-regen-hatch"
  ],
  "scenarioRefs": [
    "M3: Iteration closes with evidence"
  ],
  "citations": [
    "docs/semantic-justification.md:5-14",
    "docs/semantic-justification.md:34-45",
    "AGENTS.md:79-85",
    "AGENTS.md:87-93",
    "lint.baseline:1-1",
    ".gitignore:243-244"
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
  "docs/semantic-justification.md:5-14",
  "docs/semantic-justification.md:34-45",
  "AGENTS.md:79-85",
  "AGENTS.md:87-93",
  "lint.baseline:1-1",
  ".gitignore:243-244"
]

## Review Feedback
- [FIX] Findings claim 0 W9704 but golden holds 18 unjustified-suppression: Factually wrong in summary/findings/contextPack: golden has 18 rule=unjustified-suppression (6 each pylint/pylint-tests/pylint-pyi at lines 83,118,125,132,139,146,426,461,468,475,482,489,664,699,706,713,720,727); W9704 symbol maps to unjustified-suppression at suppression_justification_checker.py:34-36. Byte-identical GREEN verdict still holds, but evidence misleads semantic/docs follow-ups. Fix-round: correct 0 to 18 with no repo writes; also fix traceback frame _parse_file to __init__ (line 97 correct). (tests/data/golden/minimal_sample_project_findings.json)

- [OPTIONAL] Constant rule symbols collapse cache-key rule component: Verified at HEAD: 3 call sites pass rule=unjustified-suppression and 2 pass rule=bare-except-comment; _semantic.py includes rule then truncates SHA-256 to 64 bits. In-process only today. Downstream cache-design debt, not this read-only gate.
- [OPTIONAL] Tracked 1.72GiB safetensors; detect-secrets relies on prefix filter: Verified: 9 safetensors 1844653898B, largest 789581344B; RLIMIT_AS 2048MB; MemoryError reproduced via ./.factory bypass at config.py:97; HEAD git-ls-files scan exit 0 via ^\.factory/ filter from ancestor 882fac0. GREEN stands; residual infra fragility, no baseline edit.
- [OPTIONAL] Golden-regen-hatch report absent from HEAD: Verified absent (only ADR-011:68 names item; side-branch 10fa9d0 not ancestor). Byte-identity independently proven: 158 findings, hashes c2b8dc3a/1d239741 match, multiset+byte-replay pass, unchanged since 1a811af. No regen needed; track hatch artifact downstream.
- [OPTIONAL] No production lock; PoC fcntl concern deferred: Verified: no fcntl/flock in src/; _semantic.py is in-process memo only, tracked cache unimplemented. POSIX-only question belongs to cache-design-spike/decision-cache-impl, not documented as delivered.
- [OPTIONAL] Legacy hatch fail-open; this gate is no-regen byte-identity only: Valid scope guard: legacy 0/3 handoff must not be read as all-no-shift; consume as no-authorized-regen plus hash equality. V2 consumes behavior-item declarations downstream.
- [OPTIONAL] UNIFIED ownership map unavailable; ADR-011 labels provisional: Valid: map lives in orchestration records research must not inspect; ADR-011 five-owner labels used with explicit confirm-downstream caveat. Downstream test-debloat must confirm each row.
- [OPTIONAL] Keep test_testing_fakes.py; testing.py is shipped API: Verified: testing.py ships FakeRunCmd/make_lint_result/test_checked_main/precommit validators. Debloat must not remove as test-infra-only.
- [OPTIONAL] Rcfile parity unguarded after consistency-test deletion: Verified: 644774e deleted sole DESIGN/STUB-CHECKER parity test; no surviving guard; watchdog SKIPPED. Downstream config-parity/debloat debt.

## Open Concerns
- id: rm-af822ddbc6
  kind: remarkable
  summary: Accept the modify/delete resolution for tests/runner/test_pyright_noise_filter.py and tests/runner/test_self_lint_clean.py (deletion wins).
- id: rm-4cf584f209
  kind: remarkable
  summary: Derive expected docs counts from a real nested `pytest --collect-only` run and from `dispatch.TOOLS` at test time
- id: rm-68620e2e61
  kind: remarkable
  summary: Retarget the semantic-owned test block to TestAnyElementCodeEcho:366-392


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

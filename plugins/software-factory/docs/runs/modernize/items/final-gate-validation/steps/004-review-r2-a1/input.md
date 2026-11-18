# Step: Review

## Goal
Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.

## Rules
- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

## Dispositions Criteria
Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async, dismiss.
Use ONLY these dispositions; any other disposition value fails validation.
# Review Suggestion Dispositions

Criteria for assigning disposition to review findings:

| Disposition | When to Assign | Engine Action |
|---|---|---|
| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
| `dismiss` | Stale, invalid, or already-addressed concern; triager-only, requires a reason in `detail`. Concern record is kept on disk. | Closes the concern as `dismissed` with the reason; nothing is routed. |

## Rules
- Defect requiring code change MUST be `fix`.
- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
- Do NOT use `human-async` when repo context or architecture docs provide the answer.
- `dismiss` is triager-only, requires a reason, and keeps the concern on disk.

## Open Concerns
- id: c-000a3a71f2
  kind: blocker
  severity: high
  summary: Docs reconciliation is entirely red at HEAD (9 must-contain cells)
  affects:
    - ADR owner
    - M3 close-out
    - release owner
    - runner docs owner
    - semantic docs owner
- id: c-0ec5bec736
  kind: risk
  severity: low
  summary: detect-secrets scan --baseline rewrites the tracked baseline in place during lint
  affects:
    - pre-commit staging
    - read-only lint contract
- id: c-4ed4051afc
  kind: risk
  severity: medium
  summary: detect-secrets relies on the baseline `^\.factory/` filter for 1.84GB of tracked safetensors
  affects:
    - CI
    - consumer repos
    - lint gate
- id: c-88df8a41a4
  kind: tech-debt
  severity: low
  summary: AGENTS.md unit-test counts are stale in addition to the integration row
  affects:
    - docs reconciliation
- id: c-a5b3f16f80
  kind: tech-debt
  severity: medium
  summary: ADR-016 and ADR-009 contain HEAD-contradicted claims without staleness notes
  affects:
    - ADR reconciliation
    - downstream semantic work
- id: c-f9635058d1
  kind: assumption
  severity: low
  summary: The 7-passed+2-skipped integration split is environment-dependent
  affects:
    - AGENTS.md counts
    - CI environments
- id: rm-af822ddbc6
  kind: remarkable
  summary: Accept the modify/delete resolution for tests/runner/test_pyright_noise_filter.py and tests/runner/test_self_lint_clean.py (deletion wins).
- id: rm-4cf584f209
  kind: remarkable
  summary: Derive expected docs counts from a real nested `pytest --collect-only` run and from `dispatch.TOOLS` at test time
- id: rm-68620e2e61
  kind: remarkable
  summary: Retarget the semantic-owned test block to TestAnyElementCodeEcho:366-392
- id: rm-960f2c7947
  kind: remarkable
  summary: Reclassify realized semantic reservations (_decision_backend.py/.pyi + test_decision_backend.py) to semantic and amend counts to 65/91/15/7/16


- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
- Raise concerns with evidence when review uncovers new cross-cutting issues.

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

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/concerns/c-000a3a71f2.yaml b/.factory/tasks/modernize/concerns/c-000a3a71f2.yaml
deleted file mode 100644
index cf524a1..0000000
--- a/.factory/tasks/modernize/concerns/c-000a3a71f2.yaml
+++ /dev/null
@@ -1,29 +0,0 @@
-id: c-000a3a71f2
-kind: blocker
-summary: Docs reconciliation is entirely red at HEAD (9 must-contain cells)
-detail: "All required strings are absent: semantic-justification.md
-  (DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1 all 0),
-  custom-checks.md DecisionBackend 0, troubleshooting.md DECISION_MODEL/RERANKER
-  0, AGENTS.md pipeline DecisionBackend 0, CHANGELOG [semantic]/no-go 0 and no
-  v1.2.10 entry, AGENTS.md 7-pass row and missing ruff-format row, README v1.2.5
-  pin, ADR-016/ADR-009 stale claims. Code/test gates are green, so M3 close-out
-  cannot claim docs reconciliation without routing these back."
-location:
-  file: docs/semantic-justification.md
-  line: 3
-affects:
-  - ADR owner
-  - M3 close-out
-  - release owner
-  - runner docs owner
-  - semantic docs owner
-severity: high
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/c-06946fc950.yaml b/.factory/tasks/modernize/concerns/c-06946fc950.yaml
index 62c7fa6..26dedf0 100644
--- a/.factory/tasks/modernize/concerns/c-06946fc950.yaml
+++ b/.factory/tasks/modernize/concerns/c-06946fc950.yaml
@@ -12,7 +12,7 @@ affects:
   - coding-rules-audit
   - test-debloat-audit
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -20,5 +20,4 @@ source:
   item: coding-rules-audit
   lastSeen: 2026-11-09T23:33:30.977Z
 createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-10T01:22:03.274Z
-disposition: optional
+updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/c-0ec5bec736.yaml b/.factory/tasks/modernize/concerns/c-0ec5bec736.yaml
deleted file mode 100644
index 3eefced..0000000
--- a/.factory/tasks/modernize/concerns/c-0ec5bec736.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
-id: c-0ec5bec736
-kind: risk
-summary: detect-secrets scan --baseline rewrites the tracked baseline in place
-  during lint
-detail: dispatch.py:181-189 runs `detect-secrets scan --baseline
-  .secrets.baseline`; the tool updates that file (adds generated_at, reorders
-  keys) and the follow-up python normalizes it back. Normalization reproduces
-  HEAD bytes exactly (sha256 412cab2d…), but an interrupted run leaves
-  `.secrets.baseline` dirty. A live-worktree probe showed the transient
-  modification; it was restored to HEAD bytes and git status is clean.
-location:
-  file: src/python_setup_lint/runner/dispatch.py
-  line: 181
-affects:
-  - pre-commit staging
-  - read-only lint contract
-severity: low
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml b/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
deleted file mode 100644
index 31884cc..0000000
--- a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
-id: c-1882d3f0f7
-kind: assumption
-summary: Production call sites pass constant rule symbols, collapsing the
-  cache-key rule component
-detail: 'Confirmed at HEAD: suppression_justification_checker.py:152,372,383
-  pass rule="unjustified-suppression" and bare_except_comment_checker.py:103,116
-  pass rule="bare-except-comment". _semantic.py:48-58 includes rule in the
-  SHA-256 key, so it is constant per checker; the key also truncates to 64 bits
-  at _semantic.py:59. Impact is in-process only today (no tracked cache), but
-  the tracked-cache design must not assume distinct rule values.'
-location:
-  file: src/python_setup_lint/checkers/conformance/suppression_justification_checker.py
-  line: 152
-affects:
-  - cache-design-spike
-  - decision-cache-impl
-severity: medium
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-3ae71408be.yaml b/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
index 702853f..593fdbe 100644
--- a/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
+++ b/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
@@ -12,7 +12,7 @@ affects:
   - coding-rules-audit
   - runner
 severity: low
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -20,5 +20,4 @@ source:
   item: coding-rules-audit
   lastSeen: 2026-11-09T23:33:30.977Z
 createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-10T01:22:03.274Z
-disposition: optional
+updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/c-3e5007b429.yaml b/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
index 59862f8..27d6f8e 100644
--- a/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
+++ b/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
@@ -12,7 +12,7 @@ affects:
   - tests/runner/test_pyright_noise_filter.py
   - tests/runner/test_self_lint_clean.py
 severity: low
-status: routed
+status: open
 source:
   record: 005-integrate-r1-a1
   agent: developer
@@ -20,5 +20,4 @@ source:
   item: consolidate-integration-helpers-v3
   lastSeen: 2026-11-09T23:49:50.606Z
 createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-10T01:22:03.274Z
-disposition: optional
+updatedAt: 2026-11-09T23:49:50.606Z
diff --git a/.factory/tasks/modernize/concerns/c-3e935debcb.yaml b/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
index 43a1bad..18ab7da 100644
--- a/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
+++ b/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
@@ -13,7 +13,7 @@ affects:
   - cache-design-spike
   - decision-cache-impl
 severity: low
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -21,5 +21,4 @@ source:
   item: cache-design-spike
   lastSeen: 2026-11-09T23:18:39.934Z
 createdAt: 2026-11-09T23:18:39.934Z
-updatedAt: 2026-11-10T01:14:34.111Z
-disposition: optional
+updatedAt: 2026-11-09T23:18:39.934Z
diff --git a/.factory/tasks/modernize/concerns/c-4ed4051afc.yaml b/.factory/tasks/modernize/concerns/c-4ed4051afc.yaml
deleted file mode 100644
index bd46bbc..0000000
--- a/.factory/tasks/modernize/concerns/c-4ed4051afc.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
-id: c-4ed4051afc
-kind: risk
-summary: detect-secrets relies on the baseline `^\.factory/` filter for 1.84GB
-  of tracked safetensors
-detail: 9 tracked safetensors total 1,844,653,898 B (largest 789,581,344 B).
-  HEAD scan exits 0 only because .secrets.baseline:41-46 excludes them; the
-  bootstrap path (dispatch.py:190-198) would eagerly parse unknown extensions
-  via IniFileParser.__init__ (detect_secrets/transformers/config.py:97) and hit
-  the 2048MB RLIMIT_AS (runner/types.py:22, output.py:171-181) with MemoryError.
-  This is residual infra fragility, not a gate failure.
-location:
-  file: .secrets.baseline
-  line: 44
-affects:
-  - CI
-  - consumer repos
-  - lint gate
-severity: medium
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml b/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml
deleted file mode 100644
index 1d029af..0000000
--- a/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-4fe00e3cba
-kind: assumption
-summary: coding-rules-audit UNIFIED ownership map was unavailable in the
-  prompt/inter-dep
-detail: ADR-013 states the map lives in orchestration records, which this agent
-  must not inspect. Owners were aligned to ADR-011's visible five-owner taxonomy
-  (runner/checkers/setup-testing/semantic/root); downstream implementation must
-  confirm each row against the UNIFIED map rather than treating these labels as
-  authoritative.
-affects:
-  - test-debloat-audit
-  - test-debloat-impl
-severity: medium
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml b/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
index 3f5d4ba..da0aae8 100644
--- a/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
+++ b/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
@@ -14,7 +14,7 @@ affects:
   - cache-design-spike
   - decision-cache-impl
 severity: medium
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -22,5 +22,4 @@ source:
   item: cache-design-spike
   lastSeen: 2026-11-09T23:18:39.934Z
 createdAt: 2026-11-09T23:18:39.934Z
-updatedAt: 2026-11-10T01:14:34.111Z
-disposition: optional
+updatedAt: 2026-11-09T23:18:39.934Z
diff --git a/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml b/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
deleted file mode 100644
index df635cd..0000000
--- a/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
-id: c-5a67b09b19
-kind: risk
-summary: 1.72 GiB of .factory model artifacts are tracked; detect-secrets safety
-  depends on a prefix-anchored baseline filter
-detail: git ls-files includes 9 .safetensors totalling 1,844,653,898 bytes
-  (largest 789,581,344 B) under .factory/. The runner caps detect-secrets at
-  RLIMIT_AS 2048 MB; scanning one model file reproduces MemoryError in
-  detect_secrets/transformers/config.py:97. The committed `.secrets.baseline`
-  filter ^\\.factory/ is the only thing preventing the failure, and it can be
-  bypassed by a path that does not start with `.factory/` (e.g.
-  `./.factory/...`).
-location:
-  file: .secrets.baseline
-  line: 42
-affects:
-  - final-gate-validation
-severity: medium
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml b/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml
deleted file mode 100644
index 638e0bd..0000000
--- a/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-5e0d0157c2
-kind: assumption
-summary: test_testing_fakes.py must not be removed as test-infra-only coverage
-detail: src/python_setup_lint/testing.py is shipped product API (FakeRunCmd,
-  make_lint_result, test_checked_main, precommit validators), not test-only
-  infrastructure. The debloat plan should keep test_testing_fakes.py; removing
-  it would drop shipped-API coverage.
-location:
-  file: src/python_setup_lint/testing.py
-  line: 45
-affects:
-  - setup-testing
-  - test-debloat-audit
-severity: low
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml b/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
index a6d7d07..3f3b87d 100644
--- a/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
+++ b/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
@@ -14,7 +14,7 @@ affects:
   - decision-cache-impl
   - model-eval-poc
 severity: medium
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -22,5 +22,4 @@ source:
   item: cache-design-spike
   lastSeen: 2026-11-09T23:18:39.934Z
 createdAt: 2026-11-09T23:18:39.934Z
-updatedAt: 2026-11-10T01:14:34.111Z
-disposition: optional
+updatedAt: 2026-11-09T23:18:39.934Z
diff --git a/.factory/tasks/modernize/concerns/c-698cedaf11.yaml b/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
index 5a6086f..9e537bd 100644
--- a/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
+++ b/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
@@ -13,7 +13,7 @@ affects:
   - tests/conftest.py
   - tests/integration.py
 severity: medium
-status: routed
+status: open
 source:
   record: 005-integrate-r1-a1
   agent: developer
@@ -21,5 +21,4 @@ source:
   item: consolidate-integration-helpers-v3
   lastSeen: 2026-11-09T23:49:50.606Z
 createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-10T01:22:03.274Z
-disposition: optional
+updatedAt: 2026-11-09T23:49:50.606Z
diff --git a/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml b/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
index 6b71e92..ea960d2 100644
--- a/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
+++ b/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
@@ -16,7 +16,7 @@ affects:
   - epic-checkers-modernize
   - epic-semantic-infrastructure
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -24,5 +24,4 @@ source:
   item: epic-kickoff-gate
   lastSeen: 2026-11-10T00:08:48.409Z
 createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T01:56:20.258Z
-disposition: optional
+updatedAt: 2026-11-10T00:08:48.409Z
diff --git a/.factory/tasks/modernize/concerns/c-7010722c77.yaml b/.factory/tasks/modernize/concerns/c-7010722c77.yaml
deleted file mode 100644
index c8ce8a5..0000000
--- a/.factory/tasks/modernize/concerns/c-7010722c77.yaml
+++ /dev/null
@@ -1,25 +0,0 @@
-id: c-7010722c77
-kind: tech-debt
-summary: Shipped rcfile parity is unguarded after test_config_consistency.py deletion
-detail: 644774e deleted the only test enforcing DESIGN/STUB-CHECKER consistency
-  across config/.pylintrc, config/.pylintrc-tests and config/.pylintrc-pyi. No
-  surviving parity test exists; the semantic jobs watchdog that touches rcfiles
-  is SKIPPED. Removing further config re-checks would deepen this debt.
-location:
-  file: tests/runner/test_config_consistency.py
-  line: 1
-affects:
-  - config-parity
-  - test-debloat-audit
-  - test-debloat-impl
-severity: medium
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-81b8a319de.yaml b/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
index ec16141..3643670 100644
--- a/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
+++ b/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
@@ -16,7 +16,7 @@ affects:
   - epic-shift-report-collection
   - final-gate-validation
 severity: high
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -24,5 +24,4 @@ source:
   item: epic-kickoff-gate
   lastSeen: 2026-11-10T00:08:48.409Z
 createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T01:56:20.258Z
-disposition: human-awareness
+updatedAt: 2026-11-10T00:08:48.409Z
diff --git a/.factory/tasks/modernize/concerns/c-88df8a41a4.yaml b/.factory/tasks/modernize/concerns/c-88df8a41a4.yaml
deleted file mode 100644
index 0530b83..0000000
--- a/.factory/tasks/modernize/concerns/c-88df8a41a4.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
-id: c-88df8a41a4
-kind: tech-debt
-summary: AGENTS.md unit-test counts are stale in addition to the integration row
-detail: AGENTS.md:10 says 1290 pass / 4 skip / 15 deselected; the observed run
-  is 1357 passed / 0 skipped / 7 deselected. The assignment only names the
-  9-collected contract, but both Quick Commands rows will mislead after the docs
-  pass.
-location:
-  file: AGENTS.md
-  line: 10
-affects:
-  - docs reconciliation
-severity: low
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml b/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
index cba84a6..3a50471 100644
--- a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
+++ b/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
@@ -15,7 +15,7 @@ affects:
   - docs-adr-reconciliation-v2
   - epic-shift-report-collection
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -23,5 +23,4 @@ source:
   item: epic-shift-report-collection
   lastSeen: 2026-11-10T00:14:51.554Z
 createdAt: 2026-11-10T00:14:51.554Z
-updatedAt: 2026-11-10T01:56:20.258Z
-disposition: optional
+updatedAt: 2026-11-10T00:14:51.554Z
diff --git a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml b/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
index f876d4c..b09bf91 100644
--- a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
+++ b/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
@@ -15,7 +15,7 @@ affects:
   - decision-cache-impl
   - semantic-docs
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -23,5 +23,4 @@ source:
   item: coding-rules-audit
   lastSeen: 2026-11-09T23:33:30.977Z
 createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-10T01:22:03.274Z
-disposition: optional
+updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml b/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
index a03b7a4..bc6476f 100644
--- a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
+++ b/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
@@ -15,7 +15,7 @@ affects:
   - golden-regen-hatch
   - golden-regen-hatch-v2
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -23,5 +23,4 @@ source:
   item: epic-shift-report-collection
   lastSeen: 2026-11-10T00:14:51.554Z
 createdAt: 2026-11-10T00:14:51.554Z
-updatedAt: 2026-11-10T01:56:20.258Z
-disposition: optional
+updatedAt: 2026-11-10T00:14:51.554Z
diff --git a/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml b/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml
deleted file mode 100644
index 05c44ff..0000000
--- a/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-97e30bc22b
-kind: risk
-summary: Benchmark test has zero assertions and cannot gate regressions
-detail: tests/runner/test_bench_runner_overhead.py contains no assert statement;
-  it computes PASS/FAIL only into a tmp_path artifact and prints. It is marked
-  slow but provides no enforcement.
-location:
-  file: tests/runner/test_bench_runner_overhead.py
-  line: 118
-affects:
-  - benchmark-policy
-  - test-debloat-audit
-severity: low
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-a5b3f16f80.yaml b/.factory/tasks/modernize/concerns/c-a5b3f16f80.yaml
deleted file mode 100644
index d6a1f10..0000000
--- a/.factory/tasks/modernize/concerns/c-a5b3f16f80.yaml
+++ /dev/null
@@ -1,25 +0,0 @@
-id: c-a5b3f16f80
-kind: tech-debt
-summary: ADR-016 and ADR-009 contain HEAD-contradicted claims without staleness notes
-detail: ADR-016:3 says no DecisionBackend/cache/FakeBackend exists and
-  [semantic] is sentence-transformers; DecisionBackend/FakeBackend are defined
-  at _decision_backend.py:17,23 and the extra is empty at pyproject.toml:29-30.
-  ADR-009:31 claims tracked-cache infrastructure delivered; no
-  .python-setup-decisions.json implementation exists and _semantic.py:15-21 is
-  an in-process memo only.
-location:
-  file: docs/adr/ADR-016.md
-  line: 3
-affects:
-  - ADR reconciliation
-  - downstream semantic work
-severity: medium
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml b/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml
deleted file mode 100644
index 7d20467..0000000
--- a/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-a6bc23b516
-kind: risk
-summary: Real-pipeline smoke test runs 14 real tools in the default suite (not slow)
-detail: tests/runner/test_real_pipeline_smoke.py is with_real_api but lacks
-  @pytest.mark.slow, so `uv run pytest -q` (addopts -m 'not slow') spawns 14
-  real tools. It is a strict subset of integration.py's golden run.
-location:
-  file: tests/runner/test_real_pipeline_smoke.py
-  line: 16
-affects:
-  - test-debloat-audit
-  - test-harness
-severity: low
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-a816c72150.yaml b/.factory/tasks/modernize/concerns/c-a816c72150.yaml
deleted file mode 100644
index f995f76..0000000
--- a/.factory/tasks/modernize/concerns/c-a816c72150.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
-id: c-a816c72150
-kind: risk
-summary: golden-regen-hatch report is absent from HEAD
-detail: No branch, commit, or report for golden-regen-hatch exists (`git branch
-  -a`, `git log --all --grep`); only ADR-011:68 names the item. Golden
-  byte-identity is independently proven by test_setup_new_and_lint (multiset +
-  byte-identical replay), so no regen is needed, but the dependency artifact
-  required by the assignment is not present and must be supplied or explicitly
-  attested before close-out.
-location:
-  file: docs/adr/ADR-011.md
-  line: 68
-affects:
-  - final-gate-validation
-  - golden-regen-hatch
-severity: medium
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml b/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml
deleted file mode 100644
index 2d05a53..0000000
--- a/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-ab2f531c0f
-kind: question
-summary: Removing test_runner_private_imports.py broadens the never-linting definition
-detail: The prune precedent 644774e kept this guard after trimming it. Removing
-  it now assumes public-API lint guards are also out of scope; this needs an
-  explicit policy call rather than a mechanical deletion.
-location:
-  file: tests/runner/test_runner_private_imports.py
-  line: 16
-affects:
-  - policy
-  - test-debloat-audit
-severity: low
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml b/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
index 0734ed3..71c5675 100644
--- a/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
+++ b/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
@@ -16,7 +16,7 @@ affects:
   - epic-runner-modernize
   - epic-semantic-infrastructure
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -24,5 +24,4 @@ source:
   item: epic-kickoff-gate
   lastSeen: 2026-11-10T00:08:48.409Z
 createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T01:56:20.258Z
-disposition: architect
+updatedAt: 2026-11-10T00:08:48.409Z
diff --git a/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml b/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
deleted file mode 100644
index 1a34738..0000000
--- a/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
+++ /dev/null
@@ -1,31 +0,0 @@
-id: c-b0cfd8817b
-kind: risk
-summary: Legacy golden-regen-hatch ran with a fail-open 0/3 handoff; this
-  attestation is a no-regen byte-identity proof, not an all-no-shift declaration
-detail: The consolidated handoff record (commit 3d2d219) produced 0 of 3
-  required epic sections and explicitly says it must not be consumed as a
-  handoff. Existing open concern c-96c102b8ae warns that a missing handoff must
-  not be read as all-no-shift. This step therefore performed no regeneration and
-  makes no shift/no-shift claim; it only attests that the committed golden is
-  byte-identical to fresh SEMANTIC=0 collections. Downstream
-  final-gate-validation should consume it as 'no authorized regen + hash
-  equality'; the I5 replacement path is golden-regen-hatch-v2 consuming
-  behavior-item declarations.
-location:
-  file: .factory/tasks/modernize/items/golden-regen-hatch/assignment.yaml
-  line: 4
-affects:
-  - final-gate-validation
-  - golden-regen-hatch
-  - golden-regen-hatch-v2
-severity: medium
-status: routed
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: golden-regen-hatch
-  lastSeen: 2026-11-10T00:36:23.179Z
-createdAt: 2026-11-10T00:36:23.179Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml b/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
deleted file mode 100644
index f7caf0d..0000000
--- a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
+++ /dev/null
@@ -1,25 +0,0 @@
-id: c-b18093e36e
-kind: assumption
-summary: PoC lock is POSIX-only fcntl.flock; no production lock code exists at HEAD
-detail: "`git grep fcntl|flock -- ':!.factory'` is empty in tracked source;
-  `_semantic.py` has only an in-process memo and the tracked cache is
-  unimplemented. The POSIX-only-lock concern is therefore deferred to
-  cache-design-spike/decision-cache-impl and must not be documented as a
-  delivered cross-platform mechanism."
-location:
-  file: src/python_setup_lint/checkers/_semantic.py
-  line: 15
-affects:
-  - cache-design-spike
-  - decision-cache-impl
-severity: low
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml b/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
index d7daa2d..5787fee 100644
--- a/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
+++ b/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
@@ -14,7 +14,7 @@ location:
 affects:
   - AGENTS.md
 severity: low
-status: routed
+status: open
 source:
   record: 005-integrate-r1-a1
   agent: developer
@@ -22,5 +22,4 @@ source:
   item: consolidate-integration-helpers-v3
   lastSeen: 2026-11-09T23:49:50.606Z
 createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-10T01:22:03.274Z
-disposition: optional
+updatedAt: 2026-11-09T23:49:50.606Z
diff --git a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml b/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
index 3814e71..d901eb8 100644
--- a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
+++ b/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
@@ -17,7 +17,7 @@ affects:
   - final-gate-validation
   - golden-regen-hatch
 severity: high
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -25,5 +25,4 @@ source:
   item: epic-shift-report-collection
   lastSeen: 2026-11-10T00:14:51.554Z
 createdAt: 2026-11-10T00:14:51.554Z
-updatedAt: 2026-11-10T01:56:20.258Z
-disposition: architect
+updatedAt: 2026-11-10T00:14:51.554Z
diff --git a/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml b/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
index cc2c54e..eb9b091 100644
--- a/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
+++ b/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
@@ -13,7 +13,7 @@ affects:
   - cache-design-spike
   - decision-cache-impl
 severity: low
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -21,5 +21,4 @@ source:
   item: cache-design-spike
   lastSeen: 2026-11-09T23:18:39.934Z
 createdAt: 2026-11-09T23:18:39.934Z
-updatedAt: 2026-11-10T01:14:34.111Z
-disposition: optional
+updatedAt: 2026-11-09T23:18:39.934Z
diff --git a/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml b/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
index f5af836..2f3cb64 100644
--- a/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
+++ b/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
@@ -11,7 +11,7 @@ location:
 affects:
   - coding-rules-audit
 severity: low
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -19,5 +19,4 @@ source:
   item: coding-rules-audit
   lastSeen: 2026-11-09T23:33:30.977Z
 createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-10T01:22:03.274Z
-disposition: optional
+updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml b/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml
deleted file mode 100644
index e6710b8..0000000
--- a/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-dfdb0b2ad3
-kind: risk
-summary: Fixture data test file is collected and leaks a temp directory
-detail: tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir
-  is collected in the default suite (verified with pytest --collect-only) and
-  calls tempfile.mkdtemp without cleanup. tests/data should be excluded from
-  collection.
-location:
-  file: tests/data/minimal_sample_project/tests/test_tempfile.py
-  line: 10
-affects:
-  - test-debloat-audit
-  - test-harness
-severity: medium
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml b/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
index b4602e4..35f277b 100644
--- a/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
+++ b/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
@@ -13,7 +13,7 @@ affects:
   - epic-runner-modernize
   - epic-semantic-infrastructure
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -21,5 +21,4 @@ source:
   item: epic-kickoff-gate
   lastSeen: 2026-11-10T00:08:48.409Z
 createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T01:56:20.258Z
-disposition: optional
+updatedAt: 2026-11-10T00:08:48.409Z
diff --git a/.factory/tasks/modernize/concerns/c-f46047e94d.yaml b/.factory/tasks/modernize/concerns/c-f46047e94d.yaml
deleted file mode 100644
index c553c85..0000000
--- a/.factory/tasks/modernize/concerns/c-f46047e94d.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-f46047e94d
-kind: tech-debt
-summary: Marker taxonomy is effectively unenforced
-detail: 24 modules (20 non-skipped) have no category marker and
-  implementation_detail is used 0 times despite extensive private-helper tests.
-  This makes marker-based selection (unit vs real API vs implementation detail)
-  unreliable.
-location:
-  file: pyproject.toml
-  line: 49
-affects:
-  - test-debloat-audit
-  - test-harness
-severity: medium
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml b/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml
deleted file mode 100644
index 11fa1c4..0000000
--- a/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-f5b16a86e4
-kind: tech-debt
-summary: Assignment citation for semantic_check.py is stale/out of range
-detail: tests/checkers/test_semantic_check.py is 133 lines at HEAD, so the cited
-  :159-257 cannot exist. Downstream semantic items should re-cite against HEAD
-  to avoid planning on a stale branch state.
-location:
-  file: tests/checkers/test_semantic_check.py
-  line: 133
-affects:
-  - semantic items
-  - test-debloat-audit
-severity: low
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
diff --git a/.factory/tasks/modernize/concerns/c-f9635058d1.yaml b/.factory/tasks/modernize/concerns/c-f9635058d1.yaml
deleted file mode 100644
index 82ad2f7..0000000
--- a/.factory/tasks/modernize/concerns/c-f9635058d1.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-f9635058d1
-kind: assumption
-summary: The 7-passed+2-skipped integration split is environment-dependent
-detail: tests/conftest.py:29-34 forcibly prepends .venv/bin to PATH, so this
-  worktree always exposes pre-commit and the skip path cannot be observed here;
-  the split materializes only where pre-commit is not installed. Mechanism is
-  pinned by tests/_project_helpers.py:185-191 and call sites
-  tests/integration.py:205,257.
-location:
-  file: tests/conftest.py
-  line: 29
-affects:
-  - AGENTS.md counts
-  - CI environments
-severity: low
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml b/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
deleted file mode 100644
index 7094f49..0000000
--- a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
+++ /dev/null
@@ -1,28 +0,0 @@
-id: c-fd163ed069
-kind: blocker
-summary: Docs reconciliation is red on every must-contain group at HEAD ba7c267
-detail: "All required strings are absent: semantic-justification.md
-  (DecisionBackend/.python-setup-decisions.json/ADR-009/prompt-v1),
-  custom-checks.md (DecisionBackend), troubleshooting.md
-  (DECISION_MODEL/RERANKER), AGENTS.md pipeline (DecisionBackend), CHANGELOG
-  ([semantic]/no-go/v1.2.10), README (v1.2.10), and the ADR index/staleness
-  notes. The docs still describe the retired reranker pipeline and ~/.cache
-  model download. Close-out cannot be green until these are routed and fixed per
-  ADR-011 ownership."
-location:
-  file: docs/semantic-justification.md
-  line: 9
-affects:
-  - docs-counts-sync
-  - final-gate-validation
-severity: high
-status: routed
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: architect
diff --git a/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml b/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
index f4def4c..39d2d25 100644
--- a/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
+++ b/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
@@ -13,7 +13,7 @@ affects:
   - pylint-pyi
   - stub-cleanup
 severity: high
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -21,5 +21,4 @@ source:
   item: coding-rules-audit
   lastSeen: 2026-11-09T23:33:30.977Z
 createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-10T01:22:03.274Z
-disposition: optional
+updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/rm-00a177b6ba.yaml b/.factory/tasks/modernize/concerns/rm-00a177b6ba.yaml
index 4a7bf63..d808038 100644
--- a/.factory/tasks/modernize/concerns/rm-00a177b6ba.yaml
+++ b/.factory/tasks/modernize/concerns/rm-00a177b6ba.yaml
@@ -11,7 +11,7 @@ why: "This is both secrets-clean and collision-safe: commit hashes in
   only by a hash still get distinct keys. Trade-off: the key is not recomputable
   from the stored fields, so schema validation checks the encoding rather than
   re-deriving it."
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -19,5 +19,4 @@ source:
   item: cache-design-spike
   lastSeen: 2026-11-09T23:18:39.934Z
 createdAt: 2026-11-09T23:18:39.934Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:18:39.934Z
diff --git a/.factory/tasks/modernize/concerns/rm-0237e4a7c9.yaml b/.factory/tasks/modernize/concerns/rm-0237e4a7c9.yaml
index eb45517..080fa00 100644
--- a/.factory/tasks/modernize/concerns/rm-0237e4a7c9.yaml
+++ b/.factory/tasks/modernize/concerns/rm-0237e4a7c9.yaml
@@ -8,7 +8,7 @@ alternatives:
 why: The item's consolidation intent is a single owner for shared fixtures; the
   parent independently added consumer-project/golden helpers. The symlink guards
   prevent `install`-created symlinks from writing through to shipped configs.
-status: routed
+status: open
 source:
   record: 004-integrate-r1-a1
   agent: developer
@@ -16,5 +16,4 @@ source:
   item: consolidate-integration-helpers-v2
   lastSeen: 2026-11-09T22:46:16.556Z
 createdAt: 2026-11-09T22:46:16.556Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T22:46:16.556Z
diff --git a/.factory/tasks/modernize/concerns/rm-057ed6485e.yaml b/.factory/tasks/modernize/concerns/rm-057ed6485e.yaml
index 862c7e2..2110d7d 100644
--- a/.factory/tasks/modernize/concerns/rm-057ed6485e.yaml
+++ b/.factory/tasks/modernize/concerns/rm-057ed6485e.yaml
@@ -6,7 +6,7 @@ alternatives:
   - Infer fixes from raw output text comparison
 why: Gate Diff is the authoritative signal; raw text differs run to run by
   timing/ordering/truncation and must not be compared
-status: routed
+status: open
 source:
   record: 149-wave-close-up-5-6-a1
   agent: wave-close-up
@@ -14,5 +14,4 @@ source:
   iteration: 5
   lastSeen: 2026-11-09T22:19:17.543Z
 createdAt: 2026-11-09T22:19:17.543Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
+updatedAt: 2026-11-09T22:19:17.543Z
diff --git a/.factory/tasks/modernize/concerns/rm-0d23481a16.yaml b/.factory/tasks/modernize/concerns/rm-0d23481a16.yaml
deleted file mode 100644
index ad1722a..0000000
--- a/.factory/tasks/modernize/concerns/rm-0d23481a16.yaml
+++ /dev/null
@@ -1,21 +0,0 @@
-id: rm-0d23481a16
-chosen: No-op attestation with hash equality and zero golden writes
-alternatives:
-  - Run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 and review the resulting no-op diff
-  - Treat the 0-section handoff as all-no-shift and declare a no-op shift-wise
-  - Report blocked with no attestation, leaving final-gate-validation without
-    hatch evidence
-why: "The only handoff record is fail-open at 0/3 sections: it contains neither
-  a reviewed shift report nor three explicit no-shift declarations. The
-  assignment forbids blind regen, and independent double-collection
-  byte-identity proves the committed 158-finding golden is already correct at
-  HEAD."
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: golden-regen-hatch
-  lastSeen: 2026-11-10T00:36:23.179Z
-createdAt: 2026-11-10T00:36:23.179Z
-updatedAt: 2026-11-10T00:36:23.179Z
diff --git a/.factory/tasks/modernize/concerns/rm-0e2de85be6.yaml b/.factory/tasks/modernize/concerns/rm-0e2de85be6.yaml
index 4d9aed2..f084048 100644
--- a/.factory/tasks/modernize/concerns/rm-0e2de85be6.yaml
+++ b/.factory/tasks/modernize/concerns/rm-0e2de85be6.yaml
@@ -12,7 +12,7 @@ why: "Raw hex violates ADR-010's no-bare-hex>=20 rule and HexHighEntropyString;
   bits, keeps every detector-visible token short and non-hex-contiguous, and the
   25k probe is collision-free. Cost: opaque 62-char keys that cannot be reviewed
   by eye."
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -20,5 +20,4 @@ source:
   item: cache-design-spike
   lastSeen: 2026-11-09T23:18:39.934Z
 createdAt: 2026-11-09T23:18:39.934Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:18:39.934Z
diff --git a/.factory/tasks/modernize/concerns/rm-119c40e036.yaml b/.factory/tasks/modernize/concerns/rm-119c40e036.yaml
deleted file mode 100644
index 56203da..0000000
--- a/.factory/tasks/modernize/concerns/rm-119c40e036.yaml
+++ /dev/null
@@ -1,16 +0,0 @@
-id: rm-119c40e036
-chosen: Delete the zero-assert benchmark instead of fixing its threshold
-alternatives:
-  - Add an assert and keep it slow
-  - Convert to a documented script outside pytest
-why: It cannot fail, duplicates startup-overhead checks, and is slow-only; no
-  lint/check behavior is lost.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/rm-15d135d3c0.yaml b/.factory/tasks/modernize/concerns/rm-15d135d3c0.yaml
deleted file mode 100644
index 3f41da7..0000000
--- a/.factory/tasks/modernize/concerns/rm-15d135d3c0.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-id: rm-15d135d3c0
-chosen: Route docs red cells back instead of editing them in the gate
-alternatives:
-  - Patch docs in the gate item
-  - Add baseline entries for missing docs
-why: The gate is read-only and the red cells are owned by semantic, runner,
-  release and ADR items; baseline edits are explicitly forbidden and cannot
-  substitute for the missing strings.
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml b/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml
deleted file mode 100644
index 995c732..0000000
--- a/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-id: rm-1cd7ffbd0b
-chosen: Merge the stub family rather than delete it
-alternatives:
-  - Delete redundant pure-helper tests only
-  - Keep 7 modules and only dedupe factories
-why: E97B1-B4/W97B5 fired-message invariants are material checker behavior;
-  duplication is in pure helpers, exports and fixture wiring, not in the
-  invariants themselves.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/rm-1ded0c796b.yaml b/.factory/tasks/modernize/concerns/rm-1ded0c796b.yaml
index 34a658d..86a7f0c 100644
--- a/.factory/tasks/modernize/concerns/rm-1ded0c796b.yaml
+++ b/.factory/tasks/modernize/concerns/rm-1ded0c796b.yaml
@@ -7,7 +7,7 @@ alternatives:
 why: Per close-up rules, raw output text differs run to run; only
   baseline-vs-now verdicts are authoritative, and both red-baseline gates now
   pass with no regressions
-status: routed
+status: open
 source:
   record: 138-wave-close-up-5-4-a1
   agent: wave-close-up
@@ -15,5 +15,4 @@ source:
   iteration: 5
   lastSeen: 2026-11-09T21:50:23.652Z
 createdAt: 2026-11-09T21:50:23.652Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
+updatedAt: 2026-11-09T21:50:23.652Z
diff --git a/.factory/tasks/modernize/concerns/rm-48c8d8400a.yaml b/.factory/tasks/modernize/concerns/rm-48c8d8400a.yaml
index 427c35c..16656ca 100644
--- a/.factory/tasks/modernize/concerns/rm-48c8d8400a.yaml
+++ b/.factory/tasks/modernize/concerns/rm-48c8d8400a.yaml
@@ -6,7 +6,7 @@ alternatives:
   - End-iteration with 0 merges despite green gates
 why: Fits 50-item cap, unblocks wave gate without losing M3 legacy scope, keeps
   v2 cache/model/pyi/docs chain intact while gates stay green
-status: routed
+status: open
 source:
   record: 145-architect-wave-report-5-5-a1
   agent: architect
@@ -14,5 +14,4 @@ source:
   iteration: 5
   lastSeen: 2026-11-09T22:07:17.379Z
 createdAt: 2026-11-09T22:07:17.379Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
+updatedAt: 2026-11-09T22:07:17.379Z
diff --git a/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml b/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml
index a5978dc..fe1f2ec 100644
--- a/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml
+++ b/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml
@@ -7,7 +7,7 @@ why: The only tests/data exclusion is config/rumdl.toml:3, consistent with ruff,
   pylint, and pyright config excludes; dispatch.py:300 only contains a
   path-scanning comment. Recording a false runner-side TD-11 would misassign
   work to runner.
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -15,5 +15,4 @@ source:
   item: coding-rules-audit
   lastSeen: 2026-11-09T23:33:30.977Z
 createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/rm-5357235190.yaml b/.factory/tasks/modernize/concerns/rm-5357235190.yaml
deleted file mode 100644
index c0da412..0000000
--- a/.factory/tasks/modernize/concerns/rm-5357235190.yaml
+++ /dev/null
@@ -1,18 +0,0 @@
-id: rm-5357235190
-chosen: Use the integration test's two fresh-copy collections as the double-run proof
-alternatives:
-  - Invoke write_golden_files twice into the working tree and compare file hashes
-  - Compare only the committed artifacts' hashes without re-collecting findings
-why: tests/integration.py::test_setup_new_and_lint already compares two
-  independent collect_findings runs byte-for-byte against both the golden and
-  its tool counts (SHA-256 based), so the double-run requirement is exercised
-  without touching the regen path or working tree.
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: golden-regen-hatch
-  lastSeen: 2026-11-10T00:36:23.179Z
-createdAt: 2026-11-10T00:36:23.179Z
-updatedAt: 2026-11-10T00:36:23.179Z
diff --git a/.factory/tasks/modernize/concerns/rm-557aad3315.yaml b/.factory/tasks/modernize/concerns/rm-557aad3315.yaml
deleted file mode 100644
index 62b3a0a..0000000
--- a/.factory/tasks/modernize/concerns/rm-557aad3315.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-id: rm-557aad3315
-chosen: Consolidate checker unittest helpers into a tests/checkers harness
-  instead of changing the shipped testing.py surface
-alternatives:
-  - Extend python_setup_lint.testing with more helpers
-  - Leave 13/10/8 aliases in place
-why: Keeps the shipped public API stable and localizes test-only aliases;
-  shipped helpers can still be imported directly.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/rm-5bf2ade0ce.yaml b/.factory/tasks/modernize/concerns/rm-5bf2ade0ce.yaml
index a8c81b3..22d30fc 100644
--- a/.factory/tasks/modernize/concerns/rm-5bf2ade0ce.yaml
+++ b/.factory/tasks/modernize/concerns/rm-5bf2ade0ce.yaml
@@ -6,7 +6,7 @@ alternatives:
 why: Fits 50-item cap (prior 52/51 discards), unblocks wave gate, preserves M3
   helper scope via fresh-HEAD v2, keeps v2 cache/model/pyi/docs chain intact
   while gates green
-status: routed
+status: open
 source:
   record: 150-architect-wave-report-5-6-a1
   agent: architect
@@ -14,5 +14,4 @@ source:
   iteration: 5
   lastSeen: 2026-11-09T22:22:55.095Z
 createdAt: 2026-11-09T22:22:55.095Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
+updatedAt: 2026-11-09T22:22:55.095Z
diff --git a/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml b/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml
index 7989fe9..0c2e5ff 100644
--- a/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml
+++ b/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml
@@ -17,7 +17,7 @@ why: "The parent-side module is a strict superset of the item-side
   collect_sample_findings / make_clean_consumer_project / SAMPLE_PROJECT.
   Hand-merging both vocabularies would reintroduce duplicate scaffolding helpers
   (_write_file vs write_project_file), defeating the item's single-source goal."
-status: routed
+status: open
 source:
   record: 005-integrate-r1-a1
   agent: developer
@@ -25,5 +25,4 @@ source:
   item: consolidate-integration-helpers-v3
   lastSeen: 2026-11-09T23:49:50.606Z
 createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:49:50.606Z
diff --git a/.factory/tasks/modernize/concerns/rm-6396a0993e.yaml b/.factory/tasks/modernize/concerns/rm-6396a0993e.yaml
index ba34204..06da125 100644
--- a/.factory/tasks/modernize/concerns/rm-6396a0993e.yaml
+++ b/.factory/tasks/modernize/concerns/rm-6396a0993e.yaml
@@ -5,7 +5,7 @@ alternatives:
   - Abort task despite green gates and clean tree
 why: Cap overflow and stale bases are iteration-scoped; only a new iteration
   resets both while preserving green HEAD and v2 plan
-status: routed
+status: open
 source:
   record: 154-consult-empty-waves-5-1-a1
   agent: architect
@@ -13,5 +13,4 @@ source:
   iteration: 5
   lastSeen: 2026-11-09T22:49:32.521Z
 createdAt: 2026-11-09T22:49:32.521Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T22:49:32.521Z
diff --git a/.factory/tasks/modernize/concerns/rm-644c24995b.yaml b/.factory/tasks/modernize/concerns/rm-644c24995b.yaml
index 0372d83..e2e1cd2 100644
--- a/.factory/tasks/modernize/concerns/rm-644c24995b.yaml
+++ b/.factory/tasks/modernize/concerns/rm-644c24995b.yaml
@@ -9,7 +9,7 @@ why: No ADR defines a TTL, and a default would silently discard still-valid
   decisions in rarely refreshed projects. Empty-file, missing-file, stale-model
   and stale-prompt pruning already bound growth; the optional mechanism is
   proven with a 30-day horizon.
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -17,5 +17,4 @@ source:
   item: cache-design-spike
   lastSeen: 2026-11-09T23:18:39.934Z
 createdAt: 2026-11-09T23:18:39.934Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:18:39.934Z
diff --git a/.factory/tasks/modernize/concerns/rm-6ca1423f41.yaml b/.factory/tasks/modernize/concerns/rm-6ca1423f41.yaml
deleted file mode 100644
index 62a0647..0000000
--- a/.factory/tasks/modernize/concerns/rm-6ca1423f41.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: rm-6ca1423f41
-chosen: Treat detect-secrets as GREEN at HEAD via the already-committed
-  `^\\.factory/` baseline filter, without editing any baseline and without
-  changing the 2048 MB tool cap.
-alternatives:
-  - Stop tracking the .factory model artifacts (removes 1.72 GiB but changes the
-    checkout)
-  - Add a ToolSpec path/exclude for detect-secrets (currently ignored at
-    dispatch.py:179)
-  - Raise the per-tool memory limit above 2048 MB (weakens the OOM guard)
-why: The exact git-ls-files scan exits 0 in 8s and lint reports PASSED; the
-  filter was committed by ancestor 882fac0. The MemoryError is reproducible only
-  when a path alias bypasses the prefix regex under RLIMIT_AS 2 GB, which proves
-  the mechanism without requiring a fix at HEAD.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T00:27:58.391Z
diff --git a/.factory/tasks/modernize/concerns/rm-6e63c3be9e.yaml b/.factory/tasks/modernize/concerns/rm-6e63c3be9e.yaml
index 7e6402d..8ac8d5f 100644
--- a/.factory/tasks/modernize/concerns/rm-6e63c3be9e.yaml
+++ b/.factory/tasks/modernize/concerns/rm-6e63c3be9e.yaml
@@ -10,7 +10,7 @@ why: After the parent-side refactor every consumer imports shipped_config_paths
   import shipped_config_paths as shipped_config_paths` line in conftest is a
   dead fallback shim; the project philosophy calls for pruning fallback shims,
   and the module imports cleanly without it.
-status: routed
+status: open
 source:
   record: 005-integrate-r1-a1
   agent: developer
@@ -18,5 +18,4 @@ source:
   item: consolidate-integration-helpers-v3
   lastSeen: 2026-11-09T23:49:50.606Z
 createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:49:50.606Z
diff --git a/.factory/tasks/modernize/concerns/rm-717ccdc143.yaml b/.factory/tasks/modernize/concerns/rm-717ccdc143.yaml
index 6d57fc4..822a967 100644
--- a/.factory/tasks/modernize/concerns/rm-717ccdc143.yaml
+++ b/.factory/tasks/modernize/concerns/rm-717ccdc143.yaml
@@ -7,7 +7,7 @@ alternatives:
   - Drop ruff format from TOOLS
 why: Matches operator action request in infra notes; allows future gate
   simplification while keeping current split gates green
-status: routed
+status: open
 source:
   record: 129-wave-close-up-5-3-a1
   agent: wave-close-up
@@ -15,5 +15,4 @@ source:
   iteration: 5
   lastSeen: 2026-11-09T21:35:07.950Z
 createdAt: 2026-11-09T21:35:07.950Z
-updatedAt: 2026-11-10T02:32:36.259Z
-disposition: optional
+updatedAt: 2026-11-09T21:35:07.950Z
diff --git a/.factory/tasks/modernize/concerns/rm-7cbd7c98ef.yaml b/.factory/tasks/modernize/concerns/rm-7cbd7c98ef.yaml
deleted file mode 100644
index 4f16868..0000000
--- a/.factory/tasks/modernize/concerns/rm-7cbd7c98ef.yaml
+++ /dev/null
@@ -1,20 +0,0 @@
-id: rm-7cbd7c98ef
-chosen: Accept the integration golden byte-identity assertion as the golden gate
-  evidence and record the missing golden-regen-hatch report as a medium risk
-  rather than regenerating the golden.
-alternatives:
-  - Block close-out until the golden-regen-hatch item produces its report
-  - Regenerate via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 and review the diff
-  - Pin only the golden file hash without the replay assertion
-why: test_setup_new_and_lint asserts both multiset equality and a byte-identical
-  replay on a fresh copy; golden has been unchanged since 1a811af; regeneration
-  would be an unreviewed diff with no behavior change to justify it.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T00:27:58.391Z
diff --git a/.factory/tasks/modernize/concerns/rm-8142698729.yaml b/.factory/tasks/modernize/concerns/rm-8142698729.yaml
deleted file mode 100644
index fdfbeb0..0000000
--- a/.factory/tasks/modernize/concerns/rm-8142698729.yaml
+++ /dev/null
@@ -1,21 +0,0 @@
-id: rm-8142698729
-chosen: Format tests/test_docs_counts_sync.py with config/ruff.toml (line-length
-  130) even though the assignment said no test-file changes.
-alternatives:
-  - Leave the test file untouched and accept a red lint gate (violates gate
-    requirement)
-  - Add the file to lint.baseline/exclusions (hides a real formatting
-    regression, out of scope)
-why: "The test-first file was wrapped for ruff's default 88-column width, so the
-  project lint gate failed (`ruff format` exit 1: would reformat).
-  Project-config formatting is semantics-preserving and is the only way to make
-  the mandatory lint gate exit 0 without altering the baseline."
-status: open
-source:
-  record: 002-develop-r1-a1
-  agent: developer
-  step: develop
-  item: docs-counts-sync
-  lastSeen: 2026-11-10T01:33:58.765Z
-createdAt: 2026-11-10T01:33:58.765Z
-updatedAt: 2026-11-10T01:33:58.765Z
diff --git a/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml b/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml
index cf4c954..8cc4139 100644
--- a/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml
+++ b/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml
@@ -8,7 +8,7 @@ alternatives:
 why: The fix is one mechanical stub-surface cleanup per owner, and per-owner
   totals make the inter-dep ownership map actionable; individual rows would
   obscure that PYI-4 is a prerequisite and that 127 imports block deletion.
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -16,5 +16,4 @@ source:
   item: coding-rules-audit
   lastSeen: 2026-11-09T23:33:30.977Z
 createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/rm-963829d74d.yaml b/.factory/tasks/modernize/concerns/rm-963829d74d.yaml
index 5c7d606..fc98547 100644
--- a/.factory/tasks/modernize/concerns/rm-963829d74d.yaml
+++ b/.factory/tasks/modernize/concerns/rm-963829d74d.yaml
@@ -6,7 +6,7 @@ why: The parent tip intentionally removed it in the never-test-linting-prune
   item; its own docstring (13 tools) was already stale. Preserving the parent's
   deletion honors that policy decision; the item's only change to it was an
   import path.
-status: routed
+status: open
 source:
   record: 004-integrate-r1-a1
   agent: developer
@@ -14,5 +14,4 @@ source:
   item: consolidate-integration-helpers-v2
   lastSeen: 2026-11-09T22:46:16.556Z
 createdAt: 2026-11-09T22:46:16.556Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T22:46:16.556Z
diff --git a/.factory/tasks/modernize/concerns/rm-9b3f69811e.yaml b/.factory/tasks/modernize/concerns/rm-9b3f69811e.yaml
index e04976b..84bd7b4 100644
--- a/.factory/tasks/modernize/concerns/rm-9b3f69811e.yaml
+++ b/.factory/tasks/modernize/concerns/rm-9b3f69811e.yaml
@@ -7,7 +7,7 @@ alternatives:
 why: "Both assertions cover complementary guarantees:
   snapshot/oracle/tool-minimum conformance and determinism/ordering stability
   across fresh runs."
-status: routed
+status: open
 source:
   record: 004-integrate-r1-a1
   agent: developer
@@ -15,5 +15,4 @@ source:
   item: consolidate-integration-helpers-v2
   lastSeen: 2026-11-09T22:46:16.556Z
 createdAt: 2026-11-09T22:46:16.556Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T22:46:16.556Z
diff --git a/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml b/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml
deleted file mode 100644
index e25117a..0000000
--- a/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-id: rm-9f9b452910
-chosen: Infer owners from ADR-011's visible five-owner taxonomy and flag the gap
-alternatives:
-  - Block the audit until the map is provided
-  - Invent new owner labels
-  - Treat every module as root-owned
-why: The UNIFIED map from coding-rules-audit was not injected and the
-  alternative (inspecting orchestration records) violates containment.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml b/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml
deleted file mode 100644
index 65daa54..0000000
--- a/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml
+++ /dev/null
@@ -1,18 +0,0 @@
-id: rm-b42ae1f186
-chosen: Use integration.py + 158-finding golden as canonical end-to-end coverage
-  and remove the real smoke test
-alternatives:
-  - Keep smoke as a fast real check
-  - Mark smoke slow and keep it
-why: The smoke test asserts only tool-name presence on a synthetic project, a
-  strict subset of the golden run, and unnecessarily spawns 14 real tools in the
-  default suite.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/rm-bc510f4b77.yaml b/.factory/tasks/modernize/concerns/rm-bc510f4b77.yaml
index 282e9ae..ee11f28 100644
--- a/.factory/tasks/modernize/concerns/rm-bc510f4b77.yaml
+++ b/.factory/tasks/modernize/concerns/rm-bc510f4b77.yaml
@@ -8,7 +8,7 @@ alternatives:
 why: Preserves the read-only repository invariant while still proving 14/14
   tools pass and that the debt is suppressed; bare `uv run lint` would autofix
   tracked files and invalidate the audit state.
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -16,5 +16,4 @@ source:
   item: coding-rules-audit
   lastSeen: 2026-11-09T23:33:30.977Z
 createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml b/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml
deleted file mode 100644
index 89d46ee..0000000
--- a/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml
+++ /dev/null
@@ -1,18 +0,0 @@
-id: rm-d0030d6966
-chosen: Keep tests for shipped python_setup_lint.testing and treat it as product
-  coverage
-alternatives:
-  - Remove it as test-infra self-test
-  - Move testing.py out of the shipped package
-why: src/python_setup_lint/testing.py exposes FakeRunCmd, make_lint_result,
-  test_checked_main and precommit validators to consumers; deleting
-  test_testing_fakes.py would drop shipped-API coverage.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/rm-d1f2b9dda9.yaml b/.factory/tasks/modernize/concerns/rm-d1f2b9dda9.yaml
index ee4f7cd..bd1fe00 100644
--- a/.factory/tasks/modernize/concerns/rm-d1f2b9dda9.yaml
+++ b/.factory/tasks/modernize/concerns/rm-d1f2b9dda9.yaml
@@ -11,7 +11,7 @@ why: Reconciles the writer-first verdict (sequential pylint, jobs==1, no write
   surface during lint) with ADR-010's mandate for crash-safe explicit refresh.
   Contention fails without writing, atomic failure preserves the old cache, and
   CI/jobs guards fire before any write.
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -19,5 +19,4 @@ source:
   item: cache-design-spike
   lastSeen: 2026-11-09T23:18:39.934Z
 createdAt: 2026-11-09T23:18:39.934Z
-updatedAt: 2026-11-10T02:58:56.108Z
-disposition: optional
+updatedAt: 2026-11-09T23:18:39.934Z
diff --git a/.factory/tasks/modernize/concerns/rm-dbdaa80f31.yaml b/.factory/tasks/modernize/concerns/rm-dbdaa80f31.yaml
deleted file mode 100644
index f0a47fa..0000000
--- a/.factory/tasks/modernize/concerns/rm-dbdaa80f31.yaml
+++ /dev/null
@@ -1,18 +0,0 @@
-id: rm-dbdaa80f31
-chosen: Retain the byte-identical golden verdict; no regeneration
-alternatives:
-  - Regenerate golden with a reviewed diff
-  - Treat the missing hatch report as a blocker
-why: 158 findings, hashes c2b8dc3a…/1d239741…, integration
-  assert_golden_byte_identical passed, last change 1a811af, and the hatch report
-  is absent at HEAD — there is no evidence of an authorized behavior shift
-  requiring a regen.
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/rm-ed45faf9fd.yaml b/.factory/tasks/modernize/concerns/rm-ed45faf9fd.yaml
deleted file mode 100644
index 1692beb..0000000
--- a/.factory/tasks/modernize/concerns/rm-ed45faf9fd.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-id: rm-ed45faf9fd
-chosen: Validate lint as a 13-tool pass plus a HEAD-baseline detect-secrets run
-alternatives:
-  - Run full `uv run lint` in the dirty worktree
-  - Run lint in a separate clean checkout
-why: The live full lint transiently rewrites the tracked .secrets.baseline and
-  the repository carries 1.84GB of tracked model artifacts; the scoped run
-  proves every tool green while avoiding both hazards.
-status: open
-source:
-  record: 003-research-r2-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T03:19:38.948Z
-createdAt: 2026-11-10T03:19:38.948Z
-updatedAt: 2026-11-10T03:19:38.948Z
diff --git a/.factory/tasks/modernize/concerns/rm-faffbf9aa0.yaml b/.factory/tasks/modernize/concerns/rm-faffbf9aa0.yaml
deleted file mode 100644
index 07b5f78..0000000
--- a/.factory/tasks/modernize/concerns/rm-faffbf9aa0.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-id: rm-faffbf9aa0
-chosen: Leave src/python_setup_lint/runner/cli.py unchanged.
-alternatives:
-  - Touch the line anyway to satisfy the stale assignment wording (no behavioral
-    or textual change)
-why: The post-dependency tree already contains `all 14 tools` at cli.py:348, and
-  the target test verifies the help output contains `all 14 tools`; an edit
-  would be a no-op.
-status: open
-source:
-  record: 002-develop-r1-a1
-  agent: developer
-  step: develop
-  item: docs-counts-sync
-  lastSeen: 2026-11-10T01:33:58.765Z
-createdAt: 2026-11-10T01:33:58.765Z
-updatedAt: 2026-11-10T01:33:58.765Z
diff --git a/.factory/tasks/modernize/decisions/031-item-epic-kickoff-gate-1.yaml b/.factory/tasks/modernize/decisions/031-item-epic-kickoff-gate-1.yaml
deleted file mode 100644
index f478516..0000000
--- a/.factory/tasks/modernize/decisions/031-item-epic-kickoff-gate-1.yaml
+++ /dev/null
@@ -1,13 +0,0 @@
-id: decision-epic-kickoff-gate-1794275862004
-context: item
-item: epic-kickoff-gate
-afterRecord: 001-research-r1-a1
-decision: abandon
-timestamp: 2026-11-10T01:57:42.004Z
-rationale: "I3 epics never spawned (closeup-3: M2 zero delivery,
-  epic-kickoff-gate pending); ADR-013 records root-serialized delivery replaced
-  epic decomposition for I4; ADR-023 extends it to I5. A live spawn gate has
-  nothing to spawn, handoff needs I6 replan. Report-only, zero repo writes."
-text: "No replan needed: ADR-023 governs I5 delivery; I6 replans M2/M3 without
-  epics."
-reason: superseded
diff --git a/.factory/tasks/modernize/items/cache-design-spike/merge-attempts.yaml b/.factory/tasks/modernize/items/cache-design-spike/merge-attempts.yaml
deleted file mode 100644
index d33f6c6..0000000
--- a/.factory/tasks/modernize/items/cache-design-spike/merge-attempts.yaml
+++ /dev/null
@@ -1,2 +0,0 @@
-attempts:
-  "3": 1
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/merge-attempts.yaml b/.factory/tasks/modernize/items/coding-rules-audit/merge-attempts.yaml
deleted file mode 100644
index 2aa1a07..0000000
--- a/.factory/tasks/modernize/items/coding-rules-audit/merge-attempts.yaml
+++ /dev/null
@@ -1,2 +0,0 @@
-attempts:
-  "4": 1
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md
deleted file mode 100644
index 60d4e92..0000000
--- a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md
+++ /dev/null
@@ -1,111 +0,0 @@
-# Step: Research
-
-## Goal
-Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
-
-## Rules
-- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
-- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
-- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
-- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
-- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
-- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
-
-## Assignment
-{
-  "slug": "coding-rules-audit",
-  "kind": "fact-finder",
-  "title": "Inventory CodingRules violations",
-  "assignment": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS at final state (post-golden/assumptions/consolidate; read beartype discovery report from third-party item). No repo writes; output is structured item-report tables (durable in orchestration records, no committed file). Semantic exclusions marked SKIPPED (audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output rows {module,section,evidence file:line,category,est LoC delta,owner,fix} + UNIFIED disjoint-ownership map (this audit is SINGLE owner; test-debloat-audit consumes via inter-dep). Deps: read golden + helper final state; beartype report informs owner/fix.",
-  "outlineRef": "coding-rules-audit",
-  "milestone": "M3",
-  "wave": 4,
-  "deps": [
-    "golden-findings-snapshot",
-    "third-party-assumption-tests",
-    "consolidate-integration-helpers"
-  ],
-  "scenarioRefs": [
-    "M3: Coding-rules debt inventoried",
-    "M3: Ownership map is complete and disjoint"
-  ],
-  "citations": [
-    "CodingRules.md:90-107",
-    "CodingRules.md:139-159",
-    "src/python_setup_lint/checkers/_semantic.py:1-12",
-    "src/python_setup_lint/checkers/_semantic.py:37-52",
-    "src/python_setup_lint/checkers/_base.py:142-158",
-    "src/python_setup_lint/runner/baseline.py:22-42",
-    "lint.baseline:1-1"
-  ]
-}
-
-## Task Intent
-# modernize
-
-Modernize the project while preserving every material lint/check behavior.
-- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
-- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
-- Remove redundant tests.
-- Replace the embedding/rerank based justification/comment check
-  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
-  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
-  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
-
-
-## Context & Citations
-[
-  "CodingRules.md:90-107",
-  "CodingRules.md:139-159",
-  "src/python_setup_lint/checkers/_semantic.py:1-12",
-  "src/python_setup_lint/checkers/_semantic.py:37-52",
-  "src/python_setup_lint/checkers/_base.py:142-158",
-  "src/python_setup_lint/runner/baseline.py:22-42",
-  "lint.baseline:1-1"
-]
-
-## Review Feedback
-
-
-## Open Concerns
-- id: c-3e935debcb
-  kind: risk
-  severity: low
-  summary: PoC lock is POSIX-only fcntl.flock
-  affects:
-    - cache-design-spike
-    - decision-cache-impl
-- id: c-5463b26c4b
-  kind: assumption
-  severity: medium
-  summary: Production call site passes a constant rule symbol, collapsing the cache rule component
-  affects:
-    - cache-design-spike
-    - decision-cache-impl
-
-
-- Review the concerns above before starting; they constrain this step but are not part of the assignment.
-- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
-
-## Output
-
-Yield a structured JSON object matching this schema:
-- status (string, required, enum: ["ok","inconclusive"])
-- summary (string, required)
-- findings (string, required)
-- contextPack (string, optional)
-- sources (array of string, optional)
-- recommendations (array of string, optional)
-- concerns (array of object, optional): Structured concerns raised while investigating
-  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
-  - summary (string, required)
-  - detail (string, optional)
-  - severity (string, optional, enum: ["low","medium","high"])
-  - location (object, optional)
-    - file (string, required)
-    - line (integer, optional)
-  - affects (array of string, optional)
-- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
-  - chosen (string, required)
-  - why (string, required)
-  - alternatives (array of string, required)
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml
deleted file mode 100644
index f64c9e6..0000000
--- a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-seq: 1
-name: research
-attempt: 1
-fixRound: 1
-agent: fact-finder
-role: workhorse
-models:
-  - opencode-go/deepseek-v4.1-flash
-  - opencode-go/muse-spark-1.3-contributor
-timeoutSec: 3600
-status: ok
-startedAt: 2026-11-09T23:19:09.190Z
-session: 01a1c29b-c07f-7662-b7bd-0475e001272c
-endedAt: 2026-11-09T23:33:31.117Z
-usage:
-  inputTokens: 187879
-  outputTokens: 83867
-  costUsd: 0.104406
-traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-19-09-695Z_01a1c29b-c07f-7662-b7bd-0475e001272c.jsonl
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml
deleted file mode 100644
index 76751d9..0000000
--- a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml
+++ /dev/null
@@ -1,366 +0,0 @@
-status: ok
-summary: "Read-only CodingRules/AGENTS audit of src/** and scripts/** at final
-  M3 state (HEAD f41160d). 42 inventory rows plus a verified 194-file disjoint
-  ownership map (runner 65, checkers 91, setup-testing 15, semantic 7, root 16).
-  The lint gate is green only because the debt is suppressed or unenforced:
-  `PYTHON_SETUP_LINT_NO_AUTOFIX=1 uv run lint` passed all 14 tools (78.16s), and
-  `lint.baseline` is still `[]`. Dominant debts: 203 private stub declarations
-  outside TYPE_CHECKING (runner 95, checkers 63, setup-testing 45) while W9707
-  is blind because `PyiUnderscoreChecker` reads `node.file`; 127 cross-module
-  private imports in production code; 28 missing-beartype suppressions
-  classified as 16 unnecessary, 7 runtime-import-fixable, 3 genuine StubChecker
-  cycles (2 semantic ones excluded); a production-dead
-  `runner/_baseline_helpers.py` (82 lines plus 31-line stub) still pinned only
-  by tests; the `peek_fallback_tools` export chain; duplicated symlink logic in
-  `scripts/create_root_symlinks.py` versus `setup.py`; 42 silent-except W9740
-  suppressions; astroid-3 fallbacks despite astroid 4.0.4; 55 over-long source
-  lines; and stale AGENTS/docs counts and semantic architecture. Semantic paths
-  `_semantic.py/.pyi`, `_decision_backend.py/.pyi`,
-  `_base.py::check_if_meaningful` and `_OPTIONAL_IMPORT_PATTERNS` are marked
-  SKIPPED as required; `_decision_cache.py/.pyi` is absent and reserved to
-  semantic."
-findings: |
-  # CodingRules / AGENTS audit — final M3 state (HEAD f41160d)
-
-  ## 0. Verification basis and scope
-
-  - HEAD `f41160d`; `git status --short` and `git diff --stat` were empty before and after every probe. No tracked file was written; `lint.baseline:1` is `[]`.
-  - `PYTHON_SETUP_LINT_NO_AUTOFIX=1 uv run lint` -> exit 0, all 14 tools PASSED in 78.16s (tach, ruff format, ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi, pylint tests, detect-secrets). The green gate is not evidence of compliance: the rows below are suppressed, exempted, or unenforced.
-  - `uv run pytest -q` -> 1357 passed, 7 deselected, 0 skipped, 4 warnings in 32.83s. `uv run pytest tests/integration.py --collect-only -q` -> 9 tests collected. AGENTS.md:10-11 still states 1290 pass, 4 skip, 15 deselected and integration 7 pass / ~30s.
-  - Beartype discovery report read from `.factory/tasks/modernize/items/third-party-assumption-tests/steps/001-develop-a1/output.yaml:55-68`: with beartype 0.22.9 and `from __future__ import annotations`, a TYPE_CHECKING-only forward ref does not fail at decoration time but raises `beartype.roar.BeartypeCallHintForwardRefException` at call time. This classification is used in the BEA rows.
-  - Golden/helper final state read as dependency input: `tests/_golden.py` 446 lines, `tests/_project_helpers.py` 204 lines, `tests/integration.py` 498 lines. Tests are not audit targets; they are covered only by the ownership map.
-  - Pinned runtime versions: astroid 4.0.4, pylint 4.0.6, beartype 0.22.9 (`pyproject.toml:11-13`; `uv.lock:50-55`).
-
-  ### 0.1 SKIPPED semantic exclusions (not audited)
-
-  | Path / symbol | Evidence | Reason |
-  |---|---|---|
-  | `checkers/_semantic.py` + `_semantic.pyi` | `src/python_setup_lint/checkers/_semantic.py:1-60`; `_semantic.pyi:1-12` | Whole-file semantic owner. |
-  | `checkers/_decision_backend.py` + `_decision_backend.pyi` | `_decision_backend.py:1-54`; `_decision_backend.pyi:1-25` | New decision backend; its 2 missing-beartype suppressions, `FakeBackend`, and stub surface are excluded. |
-  | `checkers/_decision_cache.py` + `_decision_cache.pyi` | absent; `Path.exists()` false for both | Reserved for semantic cache implementation. |
-  | `_base.py::check_if_meaningful` + stub section | `_base.py:160-252`; `_base.pyi:74-99` | Replacement target; checkers owner must not refactor it. |
-  | `no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS` | `conformance/no_try_import_checker.py:13` | Must track the new optional decision-model dependency. |
-
-  ## 1. .pyi fidelity and private symbols
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | PYI-1 | runner/*.pyi | CodingRules 57 | 95 private declarations outside TYPE_CHECKING in runner stubs: `extra_tools.pyi:42-81` 19, `parsers.pyi:25-54` 14, `cmd_build.pyi:15-53` 13, `output.pyi:11-87` 9, `_record_parsers.pyi:8-15` 8, `_config.pyi:8-24` 7, `_autofix.pyi:12-26` 7, `_baseline_helpers.pyi:8-30` 6, `baseline.pyi:13-42` 3, `_record_types.pyi:23` 1 | private symbols in public stub | -80 | runner | Delete stub-only private declarations; make the 54 cross-module-used ones public (see IMP-1). |
-  | PYI-2 | checkers/**/*.pyi | CodingRules 57 | 63 private declarations (42 top-level plus 21 class members): `stub/coverage.pyi:27-97` 13, `stub/fidelity/annotation.pyi:16-68` 9, `stub/fidelity/signature.pyi:19-69` 6, `stub/fidelity/kind.pyi:18-49` 5, `_base.pyi:18-35` 5, `stub/import_contract.pyi:29-38` 3, `stub/fidelity/_ast_helpers.pyi:48` 1, plus private methods in `conformance/*.pyi` | private symbols in public stub | -50 | checkers | Same fix; keep only public members; make `_msgs`, `_matches_path`, `_get_except_str` public or move behind a public helper module. |
-  | PYI-3 | setup-testing stubs | CodingRules 57 | 45 private declarations: `setup.pyi:15-56` 23, `_setup_pyproject.pyi:8-43` 9, `_setup_precommit.pyi:12-24` 8, `testing.pyi:29-65` 3, `_setup_update.pyi:8-15` 2 | private symbols in public stub | -35 | setup-testing | Delete pure-internal declarations; rename shared setup steps used by `setup.py` public. |
-  | PYI-4 | conformance/pyi_underscore_checker.py | CodingRules 57 | `:38-41` sets `_is_pyi` from `node.file.endswith('.pyi')`; `pylint --rcfile=config/.pylintrc-pyi --disable=all --enable=pyi-underscore-symbol src/python_setup_lint/runner/extra_tools.pyi` emits zero messages despite 19 private symbols in that stub; all 203 stub private symbols are therefore invisible | .pyi enforcement gap | +8 | checkers | Use the explicit linted path (`linter.current_file` or checker arg), not `node.file`; add a regression test that lints a real .pyi and expects W9707. Do this before bulk stub cleanup. |
-  | PYI-5 | four __init__.pyi files | CodingRules 37 | `checkers/__init__.pyi` 5 lines, `checkers/stub/__init__.pyi` 11, `checkers/stub/fidelity/__init__.pyi` 16, `runner/__init__.pyi` 63; none has `__getattr__` or runtime logic; root `__init__.pyi` is justified by `__init__.py:10-23` version and structlog configuration | unnecessary .pyi for __init__ | -95 | checkers 32; runner 63 | Delete the four stubs; keep explicit re-exports typed in `__init__.py`. |
-  | PYI-6 | runner, setup-testing, root, checkers .pyi | CodingRules 72 | 16 public generic-return functions lack a `Returns:` clause: `runner/dispatch.pyi:67,68,76,84,85` 5; `runner/cli.pyi:8,50` 2; `runner/baseline.pyi:10` 1; `setup.pyi:42,67,77,80` 4; `__main__.pyi:8` 1; `checkers/_base.pyi:71` 1; `_decision_backend.pyi:9,14` 2 SKIPPED | .pyi docstring gap | +30 | runner 8; setup-testing 4; root 1; checkers 1; semantic 2 SKIP | Add Returns clauses; `peek_fallback_tools` clause disappears with WRAP-1. |
-  | PYI-7 | conformance stubs | CodingRules 57 | Public methods present in .py but absent from .pyi: `pyi_underscore_checker.py:52 visit_asyncfunctiondef`, `:68 visit_annassign`, `:76 visit_assign`; `unnamed_tuple_dict_checker.py:33 visit_assign`. `GenericLintTool` overrides (`dispatch.py:377,395,401`) inherit their declarations from `dispatch.pyi:68,84,85`, so they are not gaps. | stub fidelity gap | +4 | checkers | Add the four public visitor methods to the stubs (or mark them private if they are not part of the surface). |
-  | PYI-8 | checkers/__init__.py | CodingRules 61-68 | `checkers/__init__.py:1-14` is only an Apache license header; no module docstring; no other src/scripts file carries that header | missing __init__ docs | -12 | checkers | Replace the header with a purpose/quick-start module docstring. |
-  | PYI-9 | checkers/stub/fidelity/__init__.py | CodingRules 30-33 | `:31-32` still documents the old `checkers.stub_fidelity` path; `:42-88` re-exports `_FidelityState`, `_compare_*`, `_is_classvar`, `_emit_*`, `_extract_param_descriptors`; `__all__` at `:68-88` lists them; `stub/checker.pyi:16` imports `_FidelityState` with `type: ignore[attr-defined]` | private re-exports through package init | -35 | checkers | Have tests import from defining submodules; remove private re-exports and the stale path text. |
-  | PYI-10 | runner/cli.py, dispatch.pyi | CodingRules 30-33 | `cli.py:43-48` `__all__` exports `_apply_autofix_conflict_aware` and `_autofix_target_paths`; `dispatch.pyi:124` still declares private `_strategy_for`; `cli.py:29` and `_autofix.py:13` carry stale 'private symbol removed from .pyi per M3(b)' comments | private symbols in public surface | -1 | runner | Remove private names from `__all__`; rename `_strategy_for` public or remove it from the stub; delete the stale comments. |
-
-  ## 2. @beartype and structural suppressions
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | BEA-1 | checkers | CodingRules 16 | 16 `missing-beartype` suppressions on symbols whose annotations `typing.get_type_hints` resolves: `_base.py:118,124,135,139`; `asyncio_timeout_checker.py:99`; `generic_key_dict_checker.py:166`; `missing_error_chain_checker.py:68`; `no_try_import_checker.py:81`; `pyi_underscore_checker.py:112`; `redundant_type_guard_checker.py:145`; `structlog_checker.py:149`; `tmp_path_checker.py:96`; `trivial_wrapper_checker.py:257`; `unnamed_tuple_dict_checker.py:118`; `stub/checker.py:376`; `suppression_justification_checker.py:93` | unnecessary beartype suppression | 0 | checkers | Add `@beartype` and delete each disable; verified resolvable by runtime `get_type_hints`. |
-  | BEA-2 | conformance checkers | CodingRules 16 | 6 register functions suppress `missing-beartype` but PyLinter is TYPE_CHECKING-only: `bare_except_comment_checker.py:127`, `beartype_checker.py:75`, `missing_return_annotation_checker.py:49`, `silent_except_checker.py:76`, `suppression_justification_checker.py:391`, `stub/docstring_checker.py:236`; `get_type_hints` raises NameError PyLinter | TYPE_CHECKING-only beartype block | 0 | checkers | Move `from pylint.lint import PyLinter` to runtime as 10 other checkers already do; add `@beartype`; delete the disables. |
-  | BEA-3 | _setup_update.py | CodingRules 16 | `:85 update()` suppresses `missing-beartype,docstring-in-impl`; `Path` is imported only under `TYPE_CHECKING` at `:7-8`; `get_type_hints` raises NameError Path; the function also carries a usage docstring in .py | TYPE_CHECKING-only beartype block plus .py docstring | 0 | setup-testing | Import Path at runtime, add `@beartype`, move usage docs to `_setup_update.pyi`, delete both disables. |
-  | BEA-4 | stub fidelity helpers | CodingRules 16 | 3 genuine cycles: `stub/coverage.py:229-230 emit_coverage_violations(checker: StubChecker)`, `stub/fidelity/orchestrator.py:29 emit_fidelity_violations`, `stub/import_contract.py:77 emit_import_contract_violations`; StubChecker is TYPE_CHECKING-only and cannot be resolved | real circular TYPE_CHECKING block | +12 | checkers | Break the cycle with a Protocol or a StubChecker method; then decorate and remove the disables. |
-  | BEA-5 | scripts/create_root_symlinks.py | CodingRules 16; AGENTS 16-32 | `:40 main()` has no `@beartype`; explicit `pylint --rcfile=config/.pylintrc scripts/create_root_symlinks.py` reports 2 W9740 at `:76` and `:85` but never W9701, because `source-roots=src` and the full pipeline does not lint scripts (`runner/types.py:62-63` default_py_dirs is `[src]`) | scripts escape conformance scope | +2 | setup-testing | Add `@beartype`; include scripts/ in pylint scope or add a scripts rcfile with source-roots including scripts. |
-  | SUP-1 | checkers, runner stubs | CodingRules 30-33 | 5 `type: ignore[attr-defined]` comments all say 'private symbol removed from .pyi per M3(b); runtime import still works': `stub/checker.pyi:16`, `stub/fidelity/__init__.py:42`, `stub/fidelity/kind.py:8`, `runner/_autofix.py:13`, `runner/cli.py:29` | structural private-import suppression | 0 | checkers 3; runner 2 | Make the used symbols public in the .pyi, or stop importing them across modules; remove the ignores. |
-  | SUP-2 | conformance checkers | CodingRules 90-107 | 4 class declarations suppress the same structural conflict: `beartype_checker.py:21`, `missing_return_annotation_checker.py:18`, `structlog_checker.py:20`, `suppression_justification_checker.py:31`; each says SourceRootMixin.options conflicts with BaseChecker.options | duplicated structural suppression | +8 | checkers | Give the mixin a non-conflicting options contract (shared base/composition) and remove the 4 identical type ignores. |
-  | SUP-3 | setup-testing modules | CodingRules 49-50 | Suppression reasons are on preceding lines, not trailing: `testing.py:143` `# noqa: S603`, `:145` `# noqa: S607`, `setup.py:122` `# noqa: S603`; `testing.py:73,101` `# pylint: disable=generic-key-dict` also relies on a preceding comment | unjustified-suppression formatting | 0 | setup-testing | Move the adjacent rationale to a trailing comment or delete the suppression. |
-
-  ## 3. Trivial wrappers, duplicated logic, legacy stubs
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | DUP-1 | scripts/create_root_symlinks.py + setup.py | CodingRules 90-107 | Script `_CONFIG_FILES:24-36` and `main:40-90` duplicate `setup.py:41-53 _BUNDLED_CONFIGS` and `:223-275 _step_config_symlinks`; the lists already drift: script has 9 entries and omits `tach.toml`; script also lacks `_SKIP_SYMLINK_IF_EXISTS` and the copy2 fallback | duplicated logic | -35 | setup-testing | Extract one symlink-or-copy helper and one config-file manifest used by both. |
-  | DUP-2 | config manifests | CodingRules 90-107 | Three manifests with different shapes: `scripts/create_root_symlinks.py:27-37` 9 file names; `setup.py:41-53` 10 file names; `runner/_config.py:8-20` 11 tool-label keys / 10 unique files | triplicated configuration data | -10 | setup-testing 1; runner 1 | Single manifest with tool-label-to-file mapping; derive setup and script lists from it. |
-  | WRAP-1 | runner/baseline.py + runner/__init__.py | CodingRules 90-107 | `baseline.py:20-28` comment says the shim is debt owned by dispatch-split; `baseline.py:26 peek_fallback_tools()` returns `frozenset()`; declared at `baseline.pyi:10`; exported at `runner/__init__.py:17,22,62` and `runner/__init__.pyi:17,20,60`; allowlisted at `trivial_wrapper_checker.py:33` | legacy trivial stub | -8 | runner | Remove the function, both stub declarations, both package exports/docs, and the allowlist entry. |
-  | WRAP-2 | conformance/trivial_wrapper_checker.py | CodingRules 93 | `_EXEMPT_NAMES:24-40` contains three dead names (`_legacy_to_records`, `_legacy_current_output`, `_legacy_saved_output`) plus hidden single-use predicates `_has_import` (`no_try_import_checker.py:77`), `_is_suppression_line` (`suppression_justification_checker.py:213`), `_is_test_file` and `_is_opted_out` (`stub/coverage.py:47-52`); `statistics_flags` adapters are also exempt | rule-exemption drift | -3 | checkers | Delete dead names; inline the single-use predicates or document each remaining exemption. |
-  | DEAD-1 | runner/_baseline_helpers.py + .pyi | CodingRules 90-107 | `_baseline_helpers.py:1-82` is unused by src/; only `tests/runner/test_baseline_diff.py:13` imports `_compare_sorted`; the module's two-pointer diff duplicates `baseline.py:63-98 _compare_violation_lists` and its record conversion duplicates `_capture_one`; `.pyi:1-31` declares 6 private names; `_compare_sorted` is no longer re-exported by baseline.py | dead legacy module | -113 | runner | Delete the module and stub; test-debloat removes or repoints `TestCompareSorted` and the 50k benchmark in `tests/runner/test_baseline_diff.py:30-185`. |
-  | DEAD-2 | runner/parsers.py | CodingRules 30-33 | `:7-15` imports 7 private `_parse_*` functions from `_record_parsers`; they are used only by the dispatch tables at `:222-260`; `parsers.pyi` omits them | private cross-module parser surface | -2 | runner | Move the dispatch tables into `_record_parsers` or expose a public parser registry. |
-  | LEG-1 | runner/baseline.py | CodingRules 90-107 | `_FALLBACK_TOOLS` no longer exists (grep returns no definition); the legacy fallback set was removed | legacy stub resolved | 0 | runner | No action; keep it deleted. |
-
-  ## 4. Redundant fallbacks (astroid 3.x)
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | AST-1 | conformance/suppression_justification_checker.py | CodingRules 106-107 | `:247-273 _add_doc_node_spans` documents astroid 4.x `.doc_node` and keeps an astroid-3 `body[0]` Expr(Const) fallback; pyproject pins astroid>=4.0.4 and the assumptions suite pins 4.0.4 | redundant astroid-3 fallback | -18 | checkers | Delete the 3.x body fallback; use `ast_node.doc_node` directly and let the 4.x contract be tested by tests/assumptions/test_astroid_contracts.py. |
-  | AST-2 | conformance/suppression_justification_checker.py | CodingRules 106-107; 215-221 | Broad defensive catches hide structural errors: `:51` and `:56` around stream read, `:146` around source-line extraction, `:263` around `.body`, `:297` around `nodes_of_class`; all carry W9740 without checking the specific failure contract | over-broad fallback | -4 | checkers | Narrow to the documented astroid exceptions and log at debug with structured fields. |
-  | AST-3 | checkers/stub/normalizer.py | CodingRules 217-221 | `:88-95` parses a string annotation and catches `Exception: pass` with both `# noqa: S110` and `# pylint: disable=W9740`; malformed annotations are expected control flow, but the broad catch also swallows programming errors | broad silent except | +3 | checkers | Catch `astroid.AstroidError`/`ValueError` and log a debug event with the annotation; keep the repr fallback. |
-
-  ## 5. Over-long comments
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | CMT-1 | runner/_tool_specs.py | CodingRules 92; 139-159 | 55 source lines exceed 160 characters (12 >200, 2 >300). Top trailing-comment offenders: `_tool_specs.py:59` 689 chars (ty scope rationale ending in `# pylint: disable=unjustified-suppression`), `:56` 284 chars (RLIMIT_AS rationale), `bare_except_comment_checker.py:65` 226, `_base.py:139` 220, `suppression_justification_checker.py:295` 218 and `:297` 215, `redundant_type_guard_checker.py:133` 212; `_setup_precommit.py:54-55` are 680/240-char template strings, not comments | over-long comments and self-suppression | 0 | runner 2; checkers 5 | Move the ty/memory rationale to design/0002 or docs/overlays.md and cite it; remove the self-suppression; split long suppression reasons into a preceding comment plus a short trailing tag. |
-  | CMT-2 | src/** | CodingRules 92 | 20 runtime imports are annotated as 'TYPE_CHECKING-only import' although they execute at runtime: `asyncio_timeout_checker.py:6`, `generic_key_dict_checker.py:8`, `missing_error_chain_checker.py:6`, `no_try_import_checker.py:6`, `pyi_underscore_checker.py:6`, `redundant_type_guard_checker.py:6`, `structlog_checker.py:9`, `tmp_path_checker.py:6`, `trivial_wrapper_checker.py:6`, `unnamed_tuple_dict_checker.py:6`, `stub/checker.py:9`, `stub/coverage.py:4`, `stub/docstring_checker.py:7`, `stub/normalizer.py:4`, `_autofix.py:6,7,15`, `_cli_complexity.py:3`, `_cli_helpers.py:5`, `testing.py:12` | misleading comments | 0 | runner 6; checkers 13; setup-testing 1 | Delete or correct every comment; these imports are runtime imports. |
-
-  ## 6. 500-line / R0912 / R0915 proximity
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | CPX-1 | runner/dispatch.py, runner/cli.py | CodingRules 139-159 | `dispatch.py` is 449 lines (89.8% of max-module-lines=500) and `cli.py` 413 (82.6%); dispatch no longer has a C0302 disable (prior state was 542 lines with a module-level disable), so the split is effective but the margin is 51 lines | C0302 proximity | 0 | runner | Keep new code out; next extraction candidate is strategy helpers before adding C0302 debt. |
-  | CPX-2 | setup.py | CodingRules 139-159 | `setup.py` is 413 lines (82.6%); `checkers/conformance/suppression_justification_checker.py` 393 (78.6%) and `checkers/stub/checker.py` 379 (75.8%) are the next closest | C0302 proximity | 0 | setup-testing 1; checkers 2 | Watch; no suppression exists today, do not add one. |
-  | CPX-3 | runner/baseline.py | CodingRules 139-159 | `:217 _diff_baseline` carries the only complexity suppression in src: `# pylint: disable=too-many-locals`; `max-locals=20` in `config/.pylintrc:24`; function spans `:217-288` | masked R0914 | +8 | runner | Split crash/add/remove/write paths into helpers; remove the disable. |
-  | CPX-4 | setup.py, runner/parsers.py, conformance/trivial_wrapper_checker.py | CodingRules 139-159 | R0912 proximity at max-branches=16: `setup.py:223 _step_config_symlinks` 12 branches, `parsers.py:140 _parse_tach_json` 12, `trivial_wrapper_checker.py:49 _check_function` 13; no function reaches the 14-branch probe and no R0912/R0915 suppression exists | R0912 proximity | 0 | setup-testing 1; runner 1; checkers 1 | Split `_check_function` first (13/16); review the two 12-branch functions before extending them. |
-
-  ## 7. structlog and error rules
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | LOG-1 | root, checkers, runner | CodingRules 161-166 | Four independent structlog configuration sites: `__init__.py:10-23` (full processor chain), `checkers/_base.py:22-24` (filtering wrapper), `runner/cli.py:39-41` (same filtering wrapper), `runner/dispatch.py:224` (duplicated filtering config inside the pylint `--init-hook` string) | duplicated logging setup | -5 | root 1; checkers 1; runner 2 | Centralize in one shared logging module; keep the subprocess init-hook only where process isolation requires it. |
-  | ERR-1 | src/** | CodingRules 217-221 | 42 `# pylint: disable=W9740` silent-except suppressions across 16 files: `setup.py` 6, `suppression_justification_checker.py` 5, `parsers.py` 3, `output.py` 3, `cmd_build.py` 3, `baseline.py` 3, `_config.py` 3, `_autofix.py` 3, `_record_parsers.py` 2, `stub/normalizer.py` 2, `stub/coverage.py` 2, `bare_except_comment_checker.py` 2, `_base.py` 2, `extra_tools.py` 1, `_setup_update.py` 1, `_setup_precommit.py` 1; representative: `_config.py:55`, `parsers.py:34,87,144`, `_autofix.py:33,47,90`, `setup.py:108,131,133,248,255,267` | silent-except policy debt | +40 | root policy; file owners apply | Every caught path needs a structured debug/error event or a single documented best-effort helper; do not merely suppress W9740. |
-
-  ## 8. TD-11 rumdl tests/data exclude
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | TD11-1 | config/rumdl.toml | TD-11 | No runner-side rumdl exclude exists (`dispatch.py:300` only has a path-scanning comment); the exclusion is config-level at `config/rumdl.toml:3` beside ruff `config/ruff.toml:3`, pylint `config/.pylintrc:3`, and pyright `config/pyrightconfig.json:16`. Prior concern was a runner hack; current state is consistent config policy | TD-11 resolved | 0 | root | No action; keep tests/data a config-level planted-fixture exclusion. |
-
-  ## 9. Docs, tool scope, and suppression formatting
-
-  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-  |---|---|---|---|---|---|---|---|
-  | DOC-1 | AGENTS.md | AGENTS 5-12 | `:10` says 1290 pass, 4 skip, 15 deselected; measured 1357 passed, 0 skipped, 7 deselected in 32.83s. `:11` says integration 7 pass / ~30s; measured collection is 9 tests (prior run 106.61s) | stale docs counts | +2 | root | Update both rows after the final merge; state actual collection count and measured duration. |
-  | DOC-2 | AGENTS.md | AGENTS 16-32 | `:29` says pylint whole repo; `runner/types.py:62-63` defaults `default_py_dirs` to `[src]`, tests use `.pylintrc-tests`, and scripts are unlinted; explicit `pylint --rcfile=config/.pylintrc scripts/create_root_symlinks.py` reports W9740 at `:76,85` that the full pipeline never sees | inaccurate tool scope | +1 | root | Say src/ for main pylint, tests/ for pylint tests, and scripts/ currently unlinted, or add scripts/ to scope. |
-  | DOC-3 | AGENTS.md, docs/semantic-justification.md | AGENTS 79-85; task intent | `AGENTS.md:82` still shows `_semantic.py → cross-encoder reranker`; `:85` says lazy-loaded reranker configurable via `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-26,51-53` documents sentence-transformers/cross-encoder/0.5; current `checkers/_decision_backend.py:1-54` is the CPU decision backend and `pyproject.toml:31-33` semantic extra is empty; `_decision_cache.py` is absent | obsolete architecture docs | +10 | root with semantic | Semantic epic drafts replacement; root updates AGENTS.md, docs/semantic-justification.md, and pyproject optional deps. Do not document the cache before `_decision_cache.py` exists. |
-  | DOC-4 | AGENTS.md | AGENTS 121-139 | AGENTS documents `uv run pre-commit install` and active hooks, but `git ls-files .pre-commit-config.yaml` returns 0 files; only `_setup_precommit.py:88-122` writes it during install | missing pre-commit config | +1 | root | Commit a self-repo config or mark the section consumer-only. |
-  | DOC-5 | setup.py, _setup_update.py, conformance checkers | CodingRules 61-72 | Usage docstrings in .py: `setup.py:77-81 all_ok`, `:323-327 install`, `:399-403 main`; `_setup_update.py:88-92 update`. Docstring-in-impl suppressions: `setup.py:76,318,398`, `_setup_update.py:85`, plus stale one-liner suppressions at `asyncio_timeout_checker.py:43,99` and `generic_key_dict_checker.py:166` | docstrings in implementation | -22 | setup-testing 4; checkers 3 | Move usage docs to the .pyi, delete the .py docstrings and all 7 disables. |
-
-  ## 10. Unified disjoint file-ownership map (single authoritative audit owner)
-
-  Universe = all 194 git-tracked files under `src/`, `scripts/`, `tests/` minus `tests/data/`. Reproduce with `git ls-files`; group counts below sum to 194 with no duplicate paths. This map is the inter-dep contract for `test-debloat-audit`; consume it unchanged.
-
-  | Owner | Paths covered | Count | Symbol exclusions |
-  |---|---|---|---|
-  | runner | `src/python_setup_lint/runner/**` (36 files) + `tests/runner/**` except `test_setup.py` and `test_setup_install.py` (28) + `tests/fixtures/dogfood-extra/pyproject.toml` (1) | 65 | none |
-  | checkers | `src/python_setup_lint/checkers/**` minus `_semantic.py`, `_semantic.pyi`, `_decision_backend.py`, `_decision_backend.pyi` (59) + `tests/checkers/**` minus `test_semantic_check.py`, `test_semantic_threshold.py`, `test_decision_backend.py` (32) | 91 | `_base.py:160-252 check_if_meaningful` and `_base.pyi:74-99` (semantic); `conformance/no_try_import_checker.py:13 _OPTIONAL_IMPORT_PATTERNS` (semantic) |
-  | setup-testing | `scripts/create_root_symlinks.py`; `src/python_setup_lint/_setup_precommit.py(.pyi)`, `_setup_pyproject.py(.pyi)`, `_setup_update.py(.pyi)`, `setup.py(.pyi)`, `testing.py(.pyi)` (10 src files); `tests/runner/test_setup.py`, `tests/runner/test_setup_install.py`, `tests/test_setup_config_symlinks.py`, `tests/test_setup_precommit.py` (4) | 15 | none |
-  | semantic | `src/python_setup_lint/checkers/_semantic.py`, `_semantic.pyi`, `_decision_backend.py`, `_decision_backend.pyi`; `tests/checkers/test_semantic_check.py`, `test_semantic_threshold.py`, `test_decision_backend.py` | 7 | whole semantic scope; `_decision_cache.py` and `_decision_cache.pyi` reserved but absent |
-  | root | `src/python_setup_lint/__init__.py(.pyi)`, `__main__.py(.pyi)`, `py.typed` (5); `tests/__init__.py`, `_golden.py`, `_project_helpers.py`, `conftest.py`, `integration.py`, `test_golden.py`, `assumptions/__init__.py`, `assumptions/test_astroid_contracts.py`, `assumptions/test_beartype_contracts.py`, `assumptions/test_pylint_cache_semantics.py`, `assumptions/test_pylint_contracts.py` (11) | 16 | none |
-  | root-owned group (listed once, not in the 194) | `tests/data/**`, `config/**`, `docs/**`, `design/**` | group | n/a |
-
-  Stub rule applied: every `.pyi` has the same owner as its paired `.py`; `dispatch.pyi` is runner, `_base.pyi` is checkers, `setup.pyi` is setup-testing, `_semantic.pyi` and `_decision_backend.pyi` are semantic. Root project files outside the declared universe (`pyproject.toml`, `AGENTS.md`, `CodingRules.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `lint.baseline`, `tach.toml`, `uv.lock`, `.secrets.baseline`) are root-owned.
-
-  ### 10.1 Verification of the map
-
-  - 194 = 65 runner + 91 checkers + 15 setup-testing + 7 semantic + 16 root; every path matched exactly one owner rule.
-  - Symbol exclusions reference existing code: `_base.py:160-252`, `_base.pyi:74-99`, `no_try_import_checker.py:13`, `_semantic.py/.pyi`, `_decision_backend.py/.pyi`.
-  - Reservations: `src/python_setup_lint/checkers/_decision_cache.py` and `.pyi` are the only reserved paths and are absent (`Path.exists()` false for both). No other new path is reserved.
-  - Tests private-import count is 271 (test-only); those are test-debloat remit, not src/scripts audit rows. `tests/runner/test_baseline_diff.py` is the only consumer of the dead `_baseline_helpers` module (DEAD-1).
-
-  ## 11. Non-findings and resolved items
-
-  - No `.py`/`.pyi` pairing gap: 51 non-`__init__` src modules each have a stub; 6 `__init__.py` files exist, 5 have stubs, only root is justified; `scripts/` is rule-exempt.
-  - No `_FALLBACK_TOOLS` definition remains; `_compare_sorted` is no longer re-exported by `baseline.py` (the dead module remains, see DEAD-1).
-  - No C0302 suppression remains; `dispatch.py` went 542 -> 449 lines without the module-level disable.
-  - No duplicate-code messages; no unsuppressed R0912/R0915/R0914 hits; the only complexity suppression is CPX-3.
-  - No product-code `logging.getLogger` call (only the checker's message text at `structlog_checker.py:24`); no f-string log calls; missing-error-chain checker passes. User-facing CLI output uses `print`, which is treated as CLI presentation, not logging.
-  - `mypy.stubtest`, pyright verify types, and pylint-pyi all pass; PYI-4 explains why pylint-pyi green is not evidence that .pyi rules hold. The only stub-fidelity gaps found by direct AST comparison are the four public methods in PYI-7; module-level public symbols are complete.
-  - TD-11 is resolved in runner code (config-level exclusion only); see TD11-1.
-  - `lint.baseline` remains `[]` (`lint.baseline:1`). Do not baseline any row above; the empty baseline is the fitness gate.
-
-  ## 12. Handoff notes
-
-  - Fix PYI-4 before any bulk stub deletion; otherwise 203 private stub symbols stay unguarded.
-  - PYI-1..3 cannot be done by deletion alone: 127 production private imports (runner 54, checkers 57, setup-testing 16) depend on those names; make cross-module helpers public (Symbol Convention, CodingRules 30-33) or move them behind public facades, then delete the private stub declarations.
-  - DEAD-1 needs test-debloat coordination: `tests/runner/test_baseline_diff.py:30-185` pins `_compare_sorted`; `tests/_golden.py` and `tests/_project_helpers.py` are golden/helper-owned and must not be reassigned.
-  - Beartype report drives BEA-2/BEA-3: TYPE_CHECKING-only refs fail only at call time, so runtime imports are required; BEA-4 needs a Protocol or StubChecker method, not a mere import move.
-  - Keep `lint.baseline` empty. Re-measure AGENTS counts only after the final merge.
-contextPack: "HEAD f41160d; clean tree; lint 14/14 PASSED in 78.16s with
-  PYTHON_SETUP_LINT_NO_AUTOFIX=1; pytest 1357 passed / 7 deselected / 0 skipped
-  in 32.83s; integration collects 9; lint.baseline []. 42 audit rows. 194-file
-  map: runner 65, checkers 91, setup-testing 15, semantic 7, root 16. Top debts:
-  203 private stub declarations outside TYPE_CHECKING (runner 95, checkers 63,
-  setup-testing 45), W9707 blind because PyiUnderscoreChecker uses node.file;
-  127 production private imports; 28 missing-beartype suppressions (16
-  resolvable, 7 runtime-import-fixable, 3 real StubChecker cycles; 2 semantic
-  skipped); dead runner/_baseline_helpers.py (82+31 lines) pinned only by tests;
-  peek_fallback_tools export chain; duplicated symlink/config manifests; 42
-  W9740 silent excepts; astroid-3 fallbacks despite astroid 4.0.4; 55 over-long
-  source lines; stale AGENTS/docs counts and cross-encoder docs. Semantic
-  SKIPPED: _semantic.py/.pyi, _decision_backend.py/.pyi,
-  _base.py::check_if_meaningful (+stub), _OPTIONAL_IMPORT_PATTERNS. Reserved
-  absent paths: _decision_cache.py/.pyi. Open concerns c-3e935debcb (POSIX-only
-  flock) and c-5463b26c4b (constant rule symbol) remain semantic cache
-  constraints."
-sources:
-  - CodingRules.md:16
-  - CodingRules.md:30-41
-  - CodingRules.md:57
-  - CodingRules.md:61-72
-  - CodingRules.md:90-107
-  - CodingRules.md:139-159
-  - CodingRules.md:161-166
-  - CodingRules.md:215-222
-  - AGENTS.md:5-12
-  - AGENTS.md:16-32
-  - AGENTS.md:79-85
-  - AGENTS.md:121-139
-  - lint.baseline:1
-  - src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py:38-41
-  - src/python_setup_lint/checkers/_base.py:160-252
-  - src/python_setup_lint/checkers/_base.pyi:74-99
-  - src/python_setup_lint/checkers/conformance/no_try_import_checker.py:13
-  - src/python_setup_lint/runner/baseline.py:20-28
-  - src/python_setup_lint/runner/baseline.pyi:9-10
-  - src/python_setup_lint/runner/__init__.py:17,22,62
-  - src/python_setup_lint/runner/__init__.pyi:17,20,60
-  - src/python_setup_lint/runner/_baseline_helpers.py:1-82
-  - src/python_setup_lint/runner/_baseline_helpers.pyi:1-31
-  - src/python_setup_lint/runner/parsers.py:7-15,222-260
-  - src/python_setup_lint/runner/dispatch.py:449
-  - src/python_setup_lint/runner/dispatch.pyi:124
-  - src/python_setup_lint/runner/cli.py:43-48
-  - src/python_setup_lint/runner/cli.py:29
-  - src/python_setup_lint/runner/_autofix.py:13
-  - src/python_setup_lint/checkers/stub/fidelity/__init__.py:31-88
-  - src/python_setup_lint/checkers/stub/checker.pyi:16
-  - src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:247-297
-  - src/python_setup_lint/checkers/stub/normalizer.py:88-95
-  - src/python_setup_lint/runner/_tool_specs.py:56,59
-  - src/python_setup_lint/runner/baseline.py:217
-  - src/python_setup_lint/setup.py:41-53,223-275,399-403
-  - scripts/create_root_symlinks.py:27-37,40-90
-  - config/.pylintrc:2,22-27
-  - config/rumdl.toml:3
-  - config/rumdl.toml:3
-  - docs/semantic-justification.md:3-26,51-53
-  - src/python_setup_lint/checkers/_decision_backend.py:1-54
-  - src/python_setup_lint/checkers/_decision_backend.pyi:1-25
-  - tests/_golden.py:446
-  - tests/_project_helpers.py:204
-  - tests/integration.py:498
-  - .factory/tasks/modernize/items/third-party-assumption-tests/steps/001-develop-a1/output.yaml:55-68
-recommendations:
-  - "Fix PYI-4 first: make PyiUnderscoreChecker use the explicit linted .pyi
-    path and add a real-.pyi W9707 regression test, then bulk-clean private stub
-    symbols by owner."
-  - Before deleting PYI-1..3 declarations, resolve the 127 cross-module private
-    imports (runner 54, checkers 57, setup-testing 16) by making shared helpers
-    public or moving them behind public facades; do not delete symbols still
-    imported at runtime.
-  - Delete the dead `runner/_baseline_helpers.py` plus `.pyi` (DEAD-1) and
-    coordinate with test-debloat to remove or repoint `TestCompareSorted` and
-    the 50k benchmark in `tests/runner/test_baseline_diff.py`.
-  - "Apply the beartype report: add @beartype and delete the 16 resolvable
-    suppressions; runtime-import PyLinter for 6 registers and Path for
-    `_setup_update.update`; break the 3 StubChecker cycles with a Protocol or
-    method; add @beartype to `scripts/create_root_symlinks.py::main` and lint
-    scripts/."
-  - Remove the `peek_fallback_tools` function/stub/export/doc/allowlist chain
-    (WRAP-1) and shrink the trivial-wrapper allowlist, including the three dead
-    `_legacy_*` names (WRAP-2).
-  - Deduplicate the symlink logic and the three config manifests shared by
-    `scripts/create_root_symlinks.py`, `setup.py`, and `runner/_config.py`
-    (DUP-1/DUP-2).
-  - Delete the astroid-3 docstring fallback and narrow the broad
-    AttributeError/Exception catches (AST-1..3); convert the 42 W9740 silent
-    paths to structured debug/error events or a documented best-effort helper
-    (ERR-1).
-  - Update AGENTS.md counts/tool scope, docs/semantic-justification.md, and
-    pre-commit documentation after the final merge; keep `lint.baseline` empty
-    rather than baselining any row.
-  - Reserve `checkers/_decision_cache.py` and `.pyi` for semantic only; the
-    cache item must address the open POSIX-only flock concern (c-3e935debcb) and
-    the constant-rule-symbol cache-key concern (c-5463b26c4b) before docs
-    describe a git-stored cache.
-concerns:
-  - kind: tech-debt
-    summary: W9707 .pyi enforcement is blind, so 203 private stub declarations are
-      unguarded
-    detail: PyiUnderscoreChecker sets _is_pyi from node.file; pylint maps a .pyi
-      path to the .py module file, so no W9707 fires even though extra_tools.pyi
-      alone has 19 private symbols. Fix PYI-4 before bulk stub cleanup or the
-      cleanup has no regression guard.
-    severity: high
-    location:
-      file: src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py
-      line: 40
-    affects:
-      - coding-rules-audit
-      - stub-cleanup
-      - pylint-pyi
-  - kind: tech-debt
-    summary: Production-dead _baseline_helpers module is pinned only by tests
-    detail: runner/_baseline_helpers.py (82 lines) and its 31-line stub are unused
-      by src; tests/runner/test_baseline_diff.py:13 imports _compare_sorted.
-      Deleting it requires test-debloat coordination, otherwise the tests keep
-      dead code alive.
-    severity: medium
-    location:
-      file: src/python_setup_lint/runner/_baseline_helpers.py
-      line: 1
-    affects:
-      - coding-rules-audit
-      - test-debloat-audit
-  - kind: tech-debt
-    summary: peek_fallback_tools debt comment names a completed owner
-    detail: baseline.py:18-22 says the shim is debt owned by dispatch-split, but the
-      dispatch split is complete (dispatch.py is 449 lines, no C0302 disable).
-      The comment risks leaving an orphaned export chain; the audit assigns it
-      to runner.
-    severity: low
-    location:
-      file: src/python_setup_lint/runner/baseline.py
-      line: 18
-    affects:
-      - coding-rules-audit
-      - runner
-  - kind: risk
-    summary: Semantic docs still describe the removed cross-encoder while the
-      decision cache does not exist
-    detail: AGENTS.md:82-85 and docs/semantic-justification.md:3-26,51-53 document
-      sentence-transformers/cross-encoder/reranker, but the tree contains
-      _decision_backend.py and no _decision_cache.py. Docs must not claim a
-      git-stored cache before the semantic cache item lands; this is root-owned
-      documentation updated with the semantic epic.
-    severity: medium
-    location:
-      file: docs/semantic-justification.md
-      line: 3
-    affects:
-      - coding-rules-audit
-      - semantic-docs
-      - decision-cache-impl
-  - kind: assumption
-    summary: LoC deltas are gross estimates; public renames offset stub deletion
-    detail: Private stub declarations that are imported cross-module cannot simply
-      be deleted; they must be renamed public, so the net reduction is lower
-      than the gross -165 LoC estimated for PYI-1..3. Use the rows as
-      prioritization, not as a precise budget.
-    severity: low
-    location:
-      file: src/python_setup_lint/checkers/_base.pyi
-      line: 18
-    affects:
-      - coding-rules-audit
-remarkable:
-  - chosen: Group the 203 private stub declarations into three per-owner rows plus
-      the W9707 enforcement row, rather than 203 individual rows
-    why: The fix is one mechanical stub-surface cleanup per owner, and per-owner
-      totals make the inter-dep ownership map actionable; individual rows would
-      obscure that PYI-4 is a prerequisite and that 127 imports block deletion.
-    alternatives:
-      - One row per declaration (precise but noisy and duplicates the same fix)
-      - Report only aggregate counts without per-owner evidence (loses the map
-        contract)
-  - chosen: Run the lint gate with PYTHON_SETUP_LINT_NO_AUTOFIX=1 and rely on direct
-      AST/pylint probes for the audit
-    why: Preserves the read-only repository invariant while still proving 14/14
-      tools pass and that the debt is suppressed; bare `uv run lint` would
-      autofix tracked files and invalidate the audit state.
-    alternatives:
-      - Run bare `uv run lint` and revert autofixes (risk of partial writes)
-      - Skip lint entirely and cite only prior audit results (weaker final-state
-        evidence)
-  - chosen: Treat TD-11 as resolved at the config layer rather than as a runner hack
-    why: The only tests/data exclusion is config/rumdl.toml:3, consistent with ruff,
-      pylint, and pyright config excludes; dispatch.py:300 only contains a
-      path-scanning comment. Recording a false runner-side TD-11 would misassign
-      work to runner.
-    alternatives:
-      - Invent a runner-side fix row (would duplicate the config exclusion)
-      - Leave TD-11 unmentioned (fails the assignment's explicit inventory
-        request)
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/input.md b/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/input.md
deleted file mode 100644
index 0ca4b0a..0000000
--- a/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/input.md
+++ /dev/null
@@ -1,2584 +0,0 @@
-# Step: Review
-
-## Goal
-Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.
-
-## Rules
-- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
-- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
-  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
-  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
-  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
-  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
-- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
-
-## Dispositions Criteria
-Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async, dismiss.
-Use ONLY these dispositions; any other disposition value fails validation.
-# Review Suggestion Dispositions
-
-Criteria for assigning disposition to review findings:
-
-| Disposition | When to Assign | Engine Action |
-|---|---|---|
-| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
-| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
-| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
-| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
-| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
-| `dismiss` | Stale, invalid, or already-addressed concern; triager-only, requires a reason in `detail`. Concern record is kept on disk. | Closes the concern as `dismissed` with the reason; nothing is routed. |
-
-## Rules
-- Defect requiring code change MUST be `fix`.
-- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
-- Do NOT use `human-async` when repo context or architecture docs provide the answer.
-- `dismiss` is triager-only, requires a reason, and keeps the concern on disk.
-
-## Open Concerns
-- id: c-06946fc950
-  kind: tech-debt
-  severity: medium
-  summary: Production-dead _baseline_helpers module is pinned only by tests
-  affects:
-    - coding-rules-audit
-    - test-debloat-audit
-- id: c-3ae71408be
-  kind: tech-debt
-  severity: low
-  summary: peek_fallback_tools debt comment names a completed owner
-  affects:
-    - coding-rules-audit
-    - runner
-- id: c-8e15ccd01e
-  kind: risk
-  severity: medium
-  summary: Semantic docs still describe the removed cross-encoder while the decision cache does not exist
-  affects:
-    - coding-rules-audit
-    - decision-cache-impl
-    - semantic-docs
-- id: c-dfa834a16b
-  kind: assumption
-  severity: low
-  summary: LoC deltas are gross estimates; public renames offset stub deletion
-  affects:
-    - coding-rules-audit
-- id: c-ff4279a5ad
-  kind: tech-debt
-  severity: high
-  summary: W9707 .pyi enforcement is blind, so 203 private stub declarations are unguarded
-  affects:
-    - coding-rules-audit
-    - pylint-pyi
-    - stub-cleanup
-- id: c-3e5007b429
-  kind: assumption
-  severity: low
-  summary: Accepted deletion of the two slow self-lint guard tests instead of resurrecting them with item-side import fixes.
-  affects:
-    - tests/runner/test_pyright_noise_filter.py
-    - tests/runner/test_self_lint_clean.py
-- id: c-698cedaf11
-  kind: risk
-  severity: medium
-  summary: Merge result is byte-identical to the parent tip for every non-.factory path, so the item branch contributes no code deltas of its own.
-  affects:
-    - tests/_project_helpers.py
-    - tests/conftest.py
-    - tests/integration.py
-- id: c-b8537d4f8c
-  kind: tech-debt
-  severity: low
-  summary: "Stale doc references: _project_helpers docstring still names 'the self-lint guards' (now pruned) and AGENTS.md test counts are outdated."
-  affects:
-    - AGENTS.md
-
-
-- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
-- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
-- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
-- Raise concerns with evidence when review uncovers new cross-cutting issues.
-
-## Assignment
-{
-  "slug": "coding-rules-audit",
-  "kind": "fact-finder",
-  "title": "Inventory CodingRules violations",
-  "assignment": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS at final state (post-golden/assumptions/consolidate; read beartype discovery report from third-party item). No repo writes; output is structured item-report tables (durable in orchestration records, no committed file). Semantic exclusions marked SKIPPED (audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output rows {module,section,evidence file:line,category,est LoC delta,owner,fix} + UNIFIED disjoint-ownership map (this audit is SINGLE owner; test-debloat-audit consumes via inter-dep). Deps: read golden + helper final state; beartype report informs owner/fix.",
-  "outlineRef": "coding-rules-audit",
-  "milestone": "M3",
-  "wave": 4,
-  "deps": [
-    "golden-findings-snapshot",
-    "third-party-assumption-tests",
-    "consolidate-integration-helpers"
-  ],
-  "scenarioRefs": [
-    "M3: Coding-rules debt inventoried",
-    "M3: Ownership map is complete and disjoint"
-  ],
-  "citations": [
-    "CodingRules.md:90-107",
-    "CodingRules.md:139-159",
-    "src/python_setup_lint/checkers/_semantic.py:1-12",
-    "src/python_setup_lint/checkers/_semantic.py:37-52",
-    "src/python_setup_lint/checkers/_base.py:142-158",
-    "src/python_setup_lint/runner/baseline.py:22-42",
-    "lint.baseline:1-1"
-  ]
-}
-
-## Engine Checks
-
-
-## Code Diff
-diff --git a/.factory/tasks/modernize/concerns/c-06946fc950.yaml b/.factory/tasks/modernize/concerns/c-06946fc950.yaml
-deleted file mode 100644
-index 26dedf0..0000000
---- a/.factory/tasks/modernize/concerns/c-06946fc950.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-06946fc950
--kind: tech-debt
--summary: Production-dead _baseline_helpers module is pinned only by tests
--detail: runner/_baseline_helpers.py (82 lines) and its 31-line stub are unused
--  by src; tests/runner/test_baseline_diff.py:13 imports _compare_sorted.
--  Deleting it requires test-debloat coordination, otherwise the tests keep dead
--  code alive.
--location:
--  file: src/python_setup_lint/runner/_baseline_helpers.py
--  line: 1
--affects:
--  - coding-rules-audit
--  - test-debloat-audit
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: coding-rules-audit
--  lastSeen: 2026-11-09T23:33:30.977Z
--createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml b/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
-deleted file mode 100644
-index ede7641..0000000
---- a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
-+++ /dev/null
-@@ -1,26 +0,0 @@
--id: c-1882d3f0f7
--kind: assumption
--summary: Production call sites pass constant rule symbols, collapsing the
--  cache-key rule component
--detail: 'Confirmed at HEAD: suppression_justification_checker.py:152,372,383
--  pass rule="unjustified-suppression" and bare_except_comment_checker.py:103,116
--  pass rule="bare-except-comment". _semantic.py:48-58 includes rule in the
--  SHA-256 key, so it is constant per checker; the key also truncates to 64 bits
--  at _semantic.py:59. Impact is in-process only today (no tracked cache), but
--  the tracked-cache design must not assume distinct rule values.'
--location:
--  file: src/python_setup_lint/checkers/conformance/suppression_justification_checker.py
--  line: 152
--affects:
--  - cache-design-spike
--  - decision-cache-impl
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: final-gate-validation
--  lastSeen: 2026-11-10T00:27:58.391Z
--createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-3ae71408be.yaml b/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
-deleted file mode 100644
-index 593fdbe..0000000
---- a/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-3ae71408be
--kind: tech-debt
--summary: peek_fallback_tools debt comment names a completed owner
--detail: baseline.py:18-22 says the shim is debt owned by dispatch-split, but the
--  dispatch split is complete (dispatch.py is 449 lines, no C0302 disable). The
--  comment risks leaving an orphaned export chain; the audit assigns it to
--  runner.
--location:
--  file: src/python_setup_lint/runner/baseline.py
--  line: 18
--affects:
--  - coding-rules-audit
--  - runner
--severity: low
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: coding-rules-audit
--  lastSeen: 2026-11-09T23:33:30.977Z
--createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/c-3e5007b429.yaml b/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
-deleted file mode 100644
-index 27d6f8e..0000000
---- a/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-3e5007b429
--kind: assumption
--summary: Accepted deletion of the two slow self-lint guard tests instead of
--  resurrecting them with item-side import fixes.
--detail: tests/runner/test_pyright_noise_filter.py and
--  tests/runner/test_self_lint_clean.py were deleted on the parent tip (commit
--  644774e 'never-test-linting-prune'); the item branch only touched one import
--  line in one of them. Deletion was chosen over re-adding, matching the
--  established prune direction, but it does drop the `pytest -m slow` guards for
--  runner output noise/self-lint.
--affects:
--  - tests/runner/test_pyright_noise_filter.py
--  - tests/runner/test_self_lint_clean.py
--severity: low
--status: open
--source:
--  record: 005-integrate-r1-a1
--  agent: developer
--  step: integrate
--  item: consolidate-integration-helpers-v3
--  lastSeen: 2026-11-09T23:49:50.606Z
--createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/c-3e935debcb.yaml b/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
-index 43a1bad..18ab7da 100644
---- a/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
-+++ b/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
-@@ -13,7 +13,7 @@ affects:
-   - cache-design-spike
-   - decision-cache-impl
- severity: low
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -21,5 +21,4 @@ source:
-   item: cache-design-spike
-   lastSeen: 2026-11-09T23:18:39.934Z
- createdAt: 2026-11-09T23:18:39.934Z
--updatedAt: 2026-11-10T01:14:34.111Z
--disposition: optional
-+updatedAt: 2026-11-09T23:18:39.934Z
-diff --git a/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml b/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml
-deleted file mode 100644
-index 7bac93c..0000000
---- a/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml
-+++ /dev/null
-@@ -1,22 +0,0 @@
--id: c-4fe00e3cba
--kind: assumption
--summary: coding-rules-audit UNIFIED ownership map was unavailable in the
--  prompt/inter-dep
--detail: ADR-013 states the map lives in orchestration records, which this agent
--  must not inspect. Owners were aligned to ADR-011's visible five-owner taxonomy
--  (runner/checkers/setup-testing/semantic/root); downstream implementation must
--  confirm each row against the UNIFIED map rather than treating these labels as
--  authoritative.
--affects:
--  - test-debloat-audit
--  - test-debloat-impl
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml b/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
-index 3f5d4ba..da0aae8 100644
---- a/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
-+++ b/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
-@@ -14,7 +14,7 @@ affects:
-   - cache-design-spike
-   - decision-cache-impl
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -22,5 +22,4 @@ source:
-   item: cache-design-spike
-   lastSeen: 2026-11-09T23:18:39.934Z
- createdAt: 2026-11-09T23:18:39.934Z
--updatedAt: 2026-11-10T01:14:34.111Z
--disposition: optional
-+updatedAt: 2026-11-09T23:18:39.934Z
-diff --git a/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml b/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
-deleted file mode 100644
-index c1d306c..0000000
---- a/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
-+++ /dev/null
-@@ -1,26 +0,0 @@
--id: c-5a67b09b19
--kind: risk
--summary: 1.72 GiB of .factory model artifacts are tracked; detect-secrets safety
--  depends on a prefix-anchored baseline filter
--detail: git ls-files includes 9 .safetensors totalling 1,844,653,898 bytes
--  (largest 789,581,344 B) under .factory/. The runner caps detect-secrets at
--  RLIMIT_AS 2048 MB; scanning one model file reproduces MemoryError in
--  detect_secrets/transformers/config.py:97. The committed `.secrets.baseline`
--  filter ^\\.factory/ is the only thing preventing the failure, and it can be
--  bypassed by a path that does not start with `.factory/` (e.g.
--  `./.factory/...`).
--location:
--  file: .secrets.baseline
--  line: 42
--affects:
--  - final-gate-validation
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: final-gate-validation
--  lastSeen: 2026-11-10T00:27:58.391Z
--createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml b/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml
-deleted file mode 100644
-index 5c4c7bc..0000000
---- a/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-5e0d0157c2
--kind: assumption
--summary: test_testing_fakes.py must not be removed as test-infra-only coverage
--detail: src/python_setup_lint/testing.py is shipped product API (FakeRunCmd,
--  make_lint_result, test_checked_main, precommit validators), not test-only
--  infrastructure. The debloat plan should keep test_testing_fakes.py; removing
--  it would drop shipped-API coverage.
--location:
--  file: src/python_setup_lint/testing.py
--  line: 45
--affects:
--  - setup-testing
--  - test-debloat-audit
--severity: low
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml b/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
-index a6d7d07..3f3b87d 100644
---- a/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
-+++ b/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
-@@ -14,7 +14,7 @@ affects:
-   - decision-cache-impl
-   - model-eval-poc
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -22,5 +22,4 @@ source:
-   item: cache-design-spike
-   lastSeen: 2026-11-09T23:18:39.934Z
- createdAt: 2026-11-09T23:18:39.934Z
--updatedAt: 2026-11-10T01:14:34.111Z
--disposition: optional
-+updatedAt: 2026-11-09T23:18:39.934Z
-diff --git a/.factory/tasks/modernize/concerns/c-698cedaf11.yaml b/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
-deleted file mode 100644
-index 9e537bd..0000000
---- a/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
-+++ /dev/null
-@@ -1,24 +0,0 @@
--id: c-698cedaf11
--kind: risk
--summary: Merge result is byte-identical to the parent tip for every non-.factory
--  path, so the item branch contributes no code deltas of its own.
--detail: "The item's helper consolidation was independently (and more completely)
--  landed on topic/modernize via consolidate-integration-helpers-i2 /
--  golden-contract-hardening. A superset union therefore equals the parent tree:
--  our T4-conflict helper moves, integration.py rewiring and conftest re-export
--  are all redundant in the merged tree. If the factory expects item-specific
--  test deltas to be visible in the merge commit, they are not."
--affects:
--  - tests/_project_helpers.py
--  - tests/conftest.py
--  - tests/integration.py
--severity: medium
--status: open
--source:
--  record: 005-integrate-r1-a1
--  agent: developer
--  step: integrate
--  item: consolidate-integration-helpers-v3
--  lastSeen: 2026-11-09T23:49:50.606Z
--createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml b/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
-deleted file mode 100644
-index ea960d2..0000000
---- a/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
-+++ /dev/null
-@@ -1,27 +0,0 @@
--id: c-6f47dfe905
--kind: tech-debt
--summary: ADR-011 names a test class that no longer exists and carries stale line
--  references
--detail: docs/adr/ADR-011.md:48-49 assigns the semantic block to
--  TestSuppressionRerankerPipeline, but grep finds no such class at HEAD; the
--  semantic-owned block is TestAnyElementCodeEcho at
--  tests/checkers/test_suppression_justification_checker.py:366-392. The same
--  ADR/map stale-line pattern affects _base.py:238 (now :244-246) and :143-238
--  (now :160-252).
--location:
--  file: docs/adr/ADR-011.md
--  line: 48
--affects:
--  - adr-formalization
--  - epic-checkers-modernize
--  - epic-semantic-infrastructure
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-kickoff-gate
--  lastSeen: 2026-11-10T00:08:48.409Z
--createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/c-7010722c77.yaml b/.factory/tasks/modernize/concerns/c-7010722c77.yaml
-deleted file mode 100644
-index 3a9f479..0000000
---- a/.factory/tasks/modernize/concerns/c-7010722c77.yaml
-+++ /dev/null
-@@ -1,24 +0,0 @@
--id: c-7010722c77
--kind: tech-debt
--summary: Shipped rcfile parity is unguarded after test_config_consistency.py deletion
--detail: 644774e deleted the only test enforcing DESIGN/STUB-CHECKER consistency
--  across config/.pylintrc, config/.pylintrc-tests and config/.pylintrc-pyi. No
--  surviving parity test exists; the semantic jobs watchdog that touches rcfiles
--  is SKIPPED. Removing further config re-checks would deepen this debt.
--location:
--  file: tests/runner/test_config_consistency.py
--  line: 1
--affects:
--  - config-parity
--  - test-debloat-audit
--  - test-debloat-impl
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-81b8a319de.yaml b/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
-deleted file mode 100644
-index 3643670..0000000
---- a/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
-+++ /dev/null
-@@ -1,27 +0,0 @@
--id: c-81b8a319de
--kind: blocker
--summary: Validated-map dependency was abandoned; no map-* report or drift list
--  existed to consume
--detail: ownership-map-revalidation exhausted its consult budget and was
--  abandoned. This gate had to reconstruct the map core and drift list at HEAD
--  1039df9 itself, so revision map-1039df9 is a gate-recorded amendment, not a
--  consumed validated-map artifact. Downstream consumers must cite this gate
--  report as the authority.
--location:
--  file: .factory/tasks/modernize/decisions/013-item-ownership-map-revalidation-abandon.yaml
--  line: 1
--affects:
--  - TD3-B2
--  - epic-kickoff-gate
--  - epic-shift-report-collection
--  - final-gate-validation
--severity: high
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-kickoff-gate
--  lastSeen: 2026-11-10T00:08:48.409Z
--createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml b/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
-deleted file mode 100644
-index 3a50471..0000000
---- a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
-+++ /dev/null
-@@ -1,26 +0,0 @@
--id: c-8d4b35b36c
--kind: tech-debt
--summary: ADR-011 shift-handoff contract remains 'Accepted' after epic
--  decomposition was abandoned
--detail: ADR-011 status is still 'Accepted' (docs/adr/ADR-011.md:5) and the ADR
--  index lists it as Accepted (docs/adr/README.md:30), while ADR-013:1-3 and
--  ADR-023:1-3 supersede epic decomposition and state there is no epic
--  close-up/handoff bottleneck. The stale accepted contract is why this stranded
--  item keeps being re-queued.
--location:
--  file: docs/adr/ADR-011.md
--  line: 5
--affects:
--  - docs-adr-reconciliation
--  - docs-adr-reconciliation-v2
--  - epic-shift-report-collection
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml b/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
-deleted file mode 100644
-index b09bf91..0000000
---- a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
-+++ /dev/null
-@@ -1,26 +0,0 @@
--id: c-8e15ccd01e
--kind: risk
--summary: Semantic docs still describe the removed cross-encoder while the
--  decision cache does not exist
--detail: AGENTS.md:82-85 and docs/semantic-justification.md:3-26,51-53 document
--  sentence-transformers/cross-encoder/reranker, but the tree contains
--  _decision_backend.py and no _decision_cache.py. Docs must not claim a
--  git-stored cache before the semantic cache item lands; this is root-owned
--  documentation updated with the semantic epic.
--location:
--  file: docs/semantic-justification.md
--  line: 3
--affects:
--  - coding-rules-audit
--  - decision-cache-impl
--  - semantic-docs
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: coding-rules-audit
--  lastSeen: 2026-11-09T23:33:30.977Z
--createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml b/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
-deleted file mode 100644
-index bc6476f..0000000
---- a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
-+++ /dev/null
-@@ -1,26 +0,0 @@
--id: c-96c102b8ae
--kind: risk
--summary: Legacy golden-regen-hatch could misread a missing handoff as all-no-shift
--detail: The legacy hatch is allowed a no-op only 'If all three handoff sections
--  declare no-shift' (items/golden-regen-hatch/assignment.yaml:4-12). With zero
--  sections neither shift nor no-shift is established. Running it on this
--  findings file as a handoff would violate the reviewed-shift precondition; the
--  I5 plan replaces it with golden-regen-hatch-v2 consuming behavior-item
--  declarations (plan-5.3:882-898).
--location:
--  file: .factory/tasks/modernize/items/golden-regen-hatch/assignment.yaml
--  line: 4
--affects:
--  - final-gate-validation
--  - golden-regen-hatch
--  - golden-regen-hatch-v2
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml b/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml
-deleted file mode 100644
-index 0f1e7e3..0000000
---- a/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml
-+++ /dev/null
-@@ -1,22 +0,0 @@
--id: c-97e30bc22b
--kind: risk
--summary: Benchmark test has zero assertions and cannot gate regressions
--detail: tests/runner/test_bench_runner_overhead.py contains no assert statement;
--  it computes PASS/FAIL only into a tmp_path artifact and prints. It is marked
--  slow but provides no enforcement.
--location:
--  file: tests/runner/test_bench_runner_overhead.py
--  line: 118
--affects:
--  - benchmark-policy
--  - test-debloat-audit
--severity: low
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml b/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml
-deleted file mode 100644
-index 434819b..0000000
---- a/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml
-+++ /dev/null
-@@ -1,22 +0,0 @@
--id: c-a6bc23b516
--kind: risk
--summary: Real-pipeline smoke test runs 14 real tools in the default suite (not slow)
--detail: tests/runner/test_real_pipeline_smoke.py is with_real_api but lacks
--  @pytest.mark.slow, so `uv run pytest -q` (addopts -m 'not slow') spawns 14
--  real tools. It is a strict subset of integration.py's golden run.
--location:
--  file: tests/runner/test_real_pipeline_smoke.py
--  line: 16
--affects:
--  - test-debloat-audit
--  - test-harness
--severity: low
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-a816c72150.yaml b/.factory/tasks/modernize/concerns/c-a816c72150.yaml
-deleted file mode 100644
-index 71ad7bc..0000000
---- a/.factory/tasks/modernize/concerns/c-a816c72150.yaml
-+++ /dev/null
-@@ -1,25 +0,0 @@
--id: c-a816c72150
--kind: risk
--summary: golden-regen-hatch report is absent from HEAD
--detail: No branch, commit, or report for golden-regen-hatch exists (`git branch
--  -a`, `git log --all --grep`); only ADR-011:68 names the item. Golden
--  byte-identity is independently proven by test_setup_new_and_lint (multiset +
--  byte-identical replay), so no regen is needed, but the dependency artifact
--  required by the assignment is not present and must be supplied or explicitly
--  attested before close-out.
--location:
--  file: docs/adr/ADR-011.md
--  line: 68
--affects:
--  - final-gate-validation
--  - golden-regen-hatch
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: final-gate-validation
--  lastSeen: 2026-11-10T00:27:58.391Z
--createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml b/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml
-deleted file mode 100644
-index fd2a12c..0000000
---- a/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml
-+++ /dev/null
-@@ -1,22 +0,0 @@
--id: c-ab2f531c0f
--kind: question
--summary: Removing test_runner_private_imports.py broadens the never-linting definition
--detail: The prune precedent 644774e kept this guard after trimming it. Removing
--  it now assumes public-API lint guards are also out of scope; this needs an
--  explicit policy call rather than a mechanical deletion.
--location:
--  file: tests/runner/test_runner_private_imports.py
--  line: 16
--affects:
--  - policy
--  - test-debloat-audit
--severity: low
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml b/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
-deleted file mode 100644
-index 71c5675..0000000
---- a/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
-+++ /dev/null
-@@ -1,27 +0,0 @@
--id: c-acdaf1b5b0
--kind: question
--summary: ADR-013 stub says root-serialized delivery replaced epic decomposition
--  for iteration 4
--detail: docs/adr/ADR-013.md:1-3 claims epics were replaced by root-serialized
--  delivery; if that stub is accepted, the per-epic tables are ownership evidence
--  rather than a live spawn gate. The stub is not a full
--  Context/Decision/Consequences ADR at HEAD, so this gate keeps the ADR-011
--  spawn contract and records the conflict for root reconciliation.
--location:
--  file: docs/adr/ADR-013.md
--  line: 1
--affects:
--  - epic-checkers-modernize
--  - epic-kickoff-gate
--  - epic-runner-modernize
--  - epic-semantic-infrastructure
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-kickoff-gate
--  lastSeen: 2026-11-10T00:08:48.409Z
--createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml b/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
-deleted file mode 100644
-index bb153b8..0000000
---- a/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
-+++ /dev/null
-@@ -1,30 +0,0 @@
--id: c-b0cfd8817b
--kind: risk
--summary: Legacy golden-regen-hatch ran with a fail-open 0/3 handoff; this
--  attestation is a no-regen byte-identity proof, not an all-no-shift declaration
--detail: The consolidated handoff record (commit 3d2d219) produced 0 of 3
--  required epic sections and explicitly says it must not be consumed as a
--  handoff. Existing open concern c-96c102b8ae warns that a missing handoff must
--  not be read as all-no-shift. This step therefore performed no regeneration and
--  makes no shift/no-shift claim; it only attests that the committed golden is
--  byte-identical to fresh SEMANTIC=0 collections. Downstream
--  final-gate-validation should consume it as 'no authorized regen + hash
--  equality'; the I5 replacement path is golden-regen-hatch-v2 consuming
--  behavior-item declarations.
--location:
--  file: .factory/tasks/modernize/items/golden-regen-hatch/assignment.yaml
--  line: 4
--affects:
--  - final-gate-validation
--  - golden-regen-hatch
--  - golden-regen-hatch-v2
--severity: medium
--status: open
--source:
--  record: 001-develop-r1-a1
--  agent: developer
--  step: develop
--  item: golden-regen-hatch
--  lastSeen: 2026-11-10T00:36:23.179Z
--createdAt: 2026-11-10T00:36:23.179Z
--updatedAt: 2026-11-10T00:36:23.179Z
-diff --git a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml b/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
-deleted file mode 100644
-index 5466663..0000000
---- a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
-+++ /dev/null
-@@ -1,24 +0,0 @@
--id: c-b18093e36e
--kind: assumption
--summary: PoC lock is POSIX-only fcntl.flock; no production lock code exists at HEAD
--detail: "`git grep fcntl|flock -- ':!.factory'` is empty in tracked source;
--  `_semantic.py` has only an in-process memo and the tracked cache is
--  unimplemented. The POSIX-only-lock concern is therefore deferred to
--  cache-design-spike/decision-cache-impl and must not be documented as a
--  delivered cross-platform mechanism."
--location:
--  file: src/python_setup_lint/checkers/_semantic.py
--  line: 15
--affects:
--  - cache-design-spike
--  - decision-cache-impl
--severity: low
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: final-gate-validation
--  lastSeen: 2026-11-10T00:27:58.391Z
--createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml b/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
-deleted file mode 100644
-index 5787fee..0000000
---- a/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
-+++ /dev/null
-@@ -1,25 +0,0 @@
--id: c-b8537d4f8c
--kind: tech-debt
--summary: "Stale doc references: _project_helpers docstring still names 'the
--  self-lint guards' (now pruned) and AGENTS.md test counts are outdated."
--detail: tests/_project_helpers.py:1-6 mentions self-lint guards that no longer
--  exist. AGENTS.md:10-11 claims '1290 pass, 4 skip, 15 deselected' and '7 pass'
--  for integration, while the merged tree yields 1357 passed / 0 skip / 7
--  deselected and 9 integration tests. Both pre-date this merge (inherited from
--  the parent tip) and are outside the item's declared scope, so they were left
--  untouched.
--location:
--  file: tests/_project_helpers.py
--  line: 4
--affects:
--  - AGENTS.md
--severity: low
--status: open
--source:
--  record: 005-integrate-r1-a1
--  agent: developer
--  step: integrate
--  item: consolidate-integration-helpers-v3
--  lastSeen: 2026-11-09T23:49:50.606Z
--createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml b/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
-deleted file mode 100644
-index d901eb8..0000000
---- a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
-+++ /dev/null
-@@ -1,28 +0,0 @@
--id: c-c6f2d80623
--kind: blocker
--summary: "Legacy epic handoff item is unsatisfiable in I5: 0/3 epic close-ups
--  exist and the M2 replanAfter gate is absent"
--detail: "The three iteration-3 epics were never spawned (closeup-3: M2 zero
--  delivery; 086/087 close-ups: 'M2 epic work ... entirely outstanding'), and
--  iterations 4-5 abandoned epic decomposition (ADR-013:1-3; ADR-023:1-3;
--  plan-5.3:1013-1017). The item was resumed as a stranded record with state
--  'blocked' (state.yaml:257-263) even though plan-5.3 declares 'No replanAfter
--  gates' (:1277). Retries cannot produce the required artifacts; only a replan
--  can retire or re-scope it."
--location:
--  file: .factory/tasks/modernize/items/epic-shift-report-collection/assignment.yaml
--  line: 4
--affects:
--  - epic-shift-report-collection
--  - final-gate-validation
--  - golden-regen-hatch
--severity: high
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml b/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
-index cc2c54e..eb9b091 100644
---- a/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
-+++ b/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
-@@ -13,7 +13,7 @@ affects:
-   - cache-design-spike
-   - decision-cache-impl
- severity: low
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -21,5 +21,4 @@ source:
-   item: cache-design-spike
-   lastSeen: 2026-11-09T23:18:39.934Z
- createdAt: 2026-11-09T23:18:39.934Z
--updatedAt: 2026-11-10T01:14:34.111Z
--disposition: optional
-+updatedAt: 2026-11-09T23:18:39.934Z
-diff --git a/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml b/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
-deleted file mode 100644
-index 2f3cb64..0000000
---- a/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
-+++ /dev/null
-@@ -1,22 +0,0 @@
--id: c-dfa834a16b
--kind: assumption
--summary: LoC deltas are gross estimates; public renames offset stub deletion
--detail: Private stub declarations that are imported cross-module cannot simply
--  be deleted; they must be renamed public, so the net reduction is lower than
--  the gross -165 LoC estimated for PYI-1..3. Use the rows as prioritization, not
--  as a precise budget.
--location:
--  file: src/python_setup_lint/checkers/_base.pyi
--  line: 18
--affects:
--  - coding-rules-audit
--severity: low
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: coding-rules-audit
--  lastSeen: 2026-11-09T23:33:30.977Z
--createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml b/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml
-deleted file mode 100644
-index 3f43e2c..0000000
---- a/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-dfdb0b2ad3
--kind: risk
--summary: Fixture data test file is collected and leaks a temp directory
--detail: tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir
--  is collected in the default suite (verified with pytest --collect-only) and
--  calls tempfile.mkdtemp without cleanup. tests/data should be excluded from
--  collection.
--location:
--  file: tests/data/minimal_sample_project/tests/test_tempfile.py
--  line: 10
--affects:
--  - test-debloat-audit
--  - test-harness
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml b/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
-deleted file mode 100644
-index 35f277b..0000000
---- a/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
-+++ /dev/null
-@@ -1,24 +0,0 @@
--id: c-e5a3dfe193
--kind: risk
--summary: Checkers owner count exceeds the ADR-011 ±5 drift budget by 3
--detail: Amended counts are 65/91/15/7/16 (sum 194); checkers +8 vs the 83
--  baseline, outside the +5 budget. The delta is fully enumerated (8 new
--  tests/checkers/_factories_*.py) and resolved by amendment A1, but any
--  validator applying 67/83/15/4/15 literally will fail this gate.
--location:
--  file: .factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml
--  line: 82
--affects:
--  - epic-checkers-modernize
--  - epic-runner-modernize
--  - epic-semantic-infrastructure
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-kickoff-gate
--  lastSeen: 2026-11-10T00:08:48.409Z
--createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/c-f46047e94d.yaml b/.factory/tasks/modernize/concerns/c-f46047e94d.yaml
-deleted file mode 100644
-index 6152c34..0000000
---- a/.factory/tasks/modernize/concerns/c-f46047e94d.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-f46047e94d
--kind: tech-debt
--summary: Marker taxonomy is effectively unenforced
--detail: 24 modules (20 non-skipped) have no category marker and
--  implementation_detail is used 0 times despite extensive private-helper tests.
--  This makes marker-based selection (unit vs real API vs implementation detail)
--  unreliable.
--location:
--  file: pyproject.toml
--  line: 49
--affects:
--  - test-debloat-audit
--  - test-harness
--severity: medium
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml b/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml
-deleted file mode 100644
-index 3866a1b..0000000
---- a/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml
-+++ /dev/null
-@@ -1,22 +0,0 @@
--id: c-f5b16a86e4
--kind: tech-debt
--summary: Assignment citation for semantic_check.py is stale/out of range
--detail: tests/checkers/test_semantic_check.py is 133 lines at HEAD, so the cited
--  :159-257 cannot exist. Downstream semantic items should re-cite against HEAD
--  to avoid planning on a stale branch state.
--location:
--  file: tests/checkers/test_semantic_check.py
--  line: 133
--affects:
--  - semantic items
--  - test-debloat-audit
--severity: low
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml b/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
-deleted file mode 100644
-index e7b72e4..0000000
---- a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
-+++ /dev/null
-@@ -1,27 +0,0 @@
--id: c-fd163ed069
--kind: blocker
--summary: Docs reconciliation is red on every must-contain group at HEAD ba7c267
--detail: "All required strings are absent: semantic-justification.md
--  (DecisionBackend/.python-setup-decisions.json/ADR-009/prompt-v1),
--  custom-checks.md (DecisionBackend), troubleshooting.md
--  (DECISION_MODEL/RERANKER), AGENTS.md pipeline (DecisionBackend), CHANGELOG
--  ([semantic]/no-go/v1.2.10), README (v1.2.10), and the ADR index/staleness
--  notes. The docs still describe the retired reranker pipeline and ~/.cache
--  model download. Close-out cannot be green until these are routed and fixed per
--  ADR-011 ownership."
--location:
--  file: docs/semantic-justification.md
--  line: 9
--affects:
--  - docs-counts-sync
--  - final-gate-validation
--severity: high
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: final-gate-validation
--  lastSeen: 2026-11-10T00:27:58.391Z
--createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml b/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
-deleted file mode 100644
-index 39d2d25..0000000
---- a/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
-+++ /dev/null
-@@ -1,24 +0,0 @@
--id: c-ff4279a5ad
--kind: tech-debt
--summary: W9707 .pyi enforcement is blind, so 203 private stub declarations are unguarded
--detail: PyiUnderscoreChecker sets _is_pyi from node.file; pylint maps a .pyi
--  path to the .py module file, so no W9707 fires even though extra_tools.pyi
--  alone has 19 private symbols. Fix PYI-4 before bulk stub cleanup or the
--  cleanup has no regression guard.
--location:
--  file: src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py
--  line: 40
--affects:
--  - coding-rules-audit
--  - pylint-pyi
--  - stub-cleanup
--severity: high
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: coding-rules-audit
--  lastSeen: 2026-11-09T23:33:30.977Z
--createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/rm-0d23481a16.yaml b/.factory/tasks/modernize/concerns/rm-0d23481a16.yaml
-deleted file mode 100644
-index ad1722a..0000000
---- a/.factory/tasks/modernize/concerns/rm-0d23481a16.yaml
-+++ /dev/null
-@@ -1,21 +0,0 @@
--id: rm-0d23481a16
--chosen: No-op attestation with hash equality and zero golden writes
--alternatives:
--  - Run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 and review the resulting no-op diff
--  - Treat the 0-section handoff as all-no-shift and declare a no-op shift-wise
--  - Report blocked with no attestation, leaving final-gate-validation without
--    hatch evidence
--why: "The only handoff record is fail-open at 0/3 sections: it contains neither
--  a reviewed shift report nor three explicit no-shift declarations. The
--  assignment forbids blind regen, and independent double-collection
--  byte-identity proves the committed 158-finding golden is already correct at
--  HEAD."
--status: open
--source:
--  record: 001-develop-r1-a1
--  agent: developer
--  step: develop
--  item: golden-regen-hatch
--  lastSeen: 2026-11-10T00:36:23.179Z
--createdAt: 2026-11-10T00:36:23.179Z
--updatedAt: 2026-11-10T00:36:23.179Z
-diff --git a/.factory/tasks/modernize/concerns/rm-119c40e036.yaml b/.factory/tasks/modernize/concerns/rm-119c40e036.yaml
-deleted file mode 100644
-index 56203da..0000000
---- a/.factory/tasks/modernize/concerns/rm-119c40e036.yaml
-+++ /dev/null
-@@ -1,16 +0,0 @@
--id: rm-119c40e036
--chosen: Delete the zero-assert benchmark instead of fixing its threshold
--alternatives:
--  - Add an assert and keep it slow
--  - Convert to a documented script outside pytest
--why: It cannot fail, duplicates startup-overhead checks, and is slow-only; no
--  lint/check behavior is lost.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml b/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml
-deleted file mode 100644
-index 995c732..0000000
---- a/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml
-+++ /dev/null
-@@ -1,17 +0,0 @@
--id: rm-1cd7ffbd0b
--chosen: Merge the stub family rather than delete it
--alternatives:
--  - Delete redundant pure-helper tests only
--  - Keep 7 modules and only dedupe factories
--why: E97B1-B4/W97B5 fired-message invariants are material checker behavior;
--  duplication is in pure helpers, exports and fixture wiring, not in the
--  invariants themselves.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml b/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml
-deleted file mode 100644
-index fe1f2ec..0000000
---- a/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml
-+++ /dev/null
-@@ -1,18 +0,0 @@
--id: rm-49477e3be0
--chosen: Treat TD-11 as resolved at the config layer rather than as a runner hack
--alternatives:
--  - Invent a runner-side fix row (would duplicate the config exclusion)
--  - Leave TD-11 unmentioned (fails the assignment's explicit inventory request)
--why: The only tests/data exclusion is config/rumdl.toml:3, consistent with ruff,
--  pylint, and pyright config excludes; dispatch.py:300 only contains a
--  path-scanning comment. Recording a false runner-side TD-11 would misassign
--  work to runner.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: coding-rules-audit
--  lastSeen: 2026-11-09T23:33:30.977Z
--createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/rm-4cf584f209.yaml b/.factory/tasks/modernize/concerns/rm-4cf584f209.yaml
-deleted file mode 100644
-index dffdcc5..0000000
---- a/.factory/tasks/modernize/concerns/rm-4cf584f209.yaml
-+++ /dev/null
-@@ -1,20 +0,0 @@
--id: rm-4cf584f209
--chosen: Derive expected docs counts from a real nested `pytest --collect-only`
--  run and from `dispatch.TOOLS` at test time
--alternatives:
--  - Hardcode expected 1360/9/14 in the test (stale immediately on any test
--    addition)
--  - Skip test-first for this docs-only item and rely on review (violates the
--    step contract; no durable guard)
--why: The acceptance criterion is that docs match the runtime tree; a hardcoded
--  1360/9/14 would silently drift the moment a test is added, while runtime
--  derivation makes drift a test failure
--status: open
--source:
--  record: 001-test-first-r1-a1
--  agent: developer
--  step: test-first
--  item: docs-counts-sync
--  lastSeen: 2026-11-09T23:58:53.045Z
--createdAt: 2026-11-09T23:58:53.045Z
--updatedAt: 2026-11-09T23:58:53.045Z
-diff --git a/.factory/tasks/modernize/concerns/rm-5357235190.yaml b/.factory/tasks/modernize/concerns/rm-5357235190.yaml
-deleted file mode 100644
-index c0da412..0000000
---- a/.factory/tasks/modernize/concerns/rm-5357235190.yaml
-+++ /dev/null
-@@ -1,18 +0,0 @@
--id: rm-5357235190
--chosen: Use the integration test's two fresh-copy collections as the double-run proof
--alternatives:
--  - Invoke write_golden_files twice into the working tree and compare file hashes
--  - Compare only the committed artifacts' hashes without re-collecting findings
--why: tests/integration.py::test_setup_new_and_lint already compares two
--  independent collect_findings runs byte-for-byte against both the golden and
--  its tool counts (SHA-256 based), so the double-run requirement is exercised
--  without touching the regen path or working tree.
--status: open
--source:
--  record: 001-develop-r1-a1
--  agent: developer
--  step: develop
--  item: golden-regen-hatch
--  lastSeen: 2026-11-10T00:36:23.179Z
--createdAt: 2026-11-10T00:36:23.179Z
--updatedAt: 2026-11-10T00:36:23.179Z
-diff --git a/.factory/tasks/modernize/concerns/rm-557aad3315.yaml b/.factory/tasks/modernize/concerns/rm-557aad3315.yaml
-deleted file mode 100644
-index 62b3a0a..0000000
---- a/.factory/tasks/modernize/concerns/rm-557aad3315.yaml
-+++ /dev/null
-@@ -1,17 +0,0 @@
--id: rm-557aad3315
--chosen: Consolidate checker unittest helpers into a tests/checkers harness
--  instead of changing the shipped testing.py surface
--alternatives:
--  - Extend python_setup_lint.testing with more helpers
--  - Leave 13/10/8 aliases in place
--why: Keeps the shipped public API stable and localizes test-only aliases;
--  shipped helpers can still be imported directly.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml b/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml
-deleted file mode 100644
-index 0c2e5ff..0000000
---- a/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml
-+++ /dev/null
-@@ -1,28 +0,0 @@
--id: rm-5f84f18bbd
--chosen: Resolve all six content conflicts by taking the parent tip's
--  (topic/modernize) version of the shared test helpers, integration.py and the
--  autofix tests.
--alternatives:
--  - Union-merge both helper sets, keeping _write_file and make_consumer_project
--    alongside the parent's write_project_file and make_clean_consumer_project
--  - Keep the item-side files wholesale (as the previous merge commit b67837d
--    did) and drop the parent's collect_sample_findings/write_project_file
--    additions
--  - Rewrite the six files by hand to a third, mixed shape
--why: "The parent-side module is a strict superset of the item-side
--  consolidation: it keeps every helper the item introduced (git_init_bare,
--  stage_file, commit_all, shipped_config_paths, make_runner_config,
--  build_pylint_overlay_config, ensure_precommit_or_skip,
--  install_twice_assert_idempotent) and adds write_project_file /
--  collect_sample_findings / make_clean_consumer_project / SAMPLE_PROJECT.
--  Hand-merging both vocabularies would reintroduce duplicate scaffolding helpers
--  (_write_file vs write_project_file), defeating the item's single-source goal."
--status: open
--source:
--  record: 005-integrate-r1-a1
--  agent: developer
--  step: integrate
--  item: consolidate-integration-helpers-v3
--  lastSeen: 2026-11-09T23:49:50.606Z
--createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/rm-68620e2e61.yaml b/.factory/tasks/modernize/concerns/rm-68620e2e61.yaml
-deleted file mode 100644
-index 7cbde68..0000000
---- a/.factory/tasks/modernize/concerns/rm-68620e2e61.yaml
-+++ /dev/null
-@@ -1,19 +0,0 @@
--id: rm-68620e2e61
--chosen: Retarget the semantic-owned test block to TestAnyElementCodeEcho:366-392
--alternatives:
--  - Declare an unresolved ownership dispute over the absent class
--  - Give the whole test file to checkers
--  - Give the whole test file to semantic
--why: The ADR/map-named TestSuppressionRerankerPipeline is absent at HEAD, while
--  TestAnyElementCodeEcho directly tests the semantic-owned rule-echo behavior.
--  Retargeting preserves the single-writer partition without leaving a dangling
--  symbol.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-kickoff-gate
--  lastSeen: 2026-11-10T00:08:48.409Z
--createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/rm-6ca1423f41.yaml b/.factory/tasks/modernize/concerns/rm-6ca1423f41.yaml
-deleted file mode 100644
-index 62a0647..0000000
---- a/.factory/tasks/modernize/concerns/rm-6ca1423f41.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: rm-6ca1423f41
--chosen: Treat detect-secrets as GREEN at HEAD via the already-committed
--  `^\\.factory/` baseline filter, without editing any baseline and without
--  changing the 2048 MB tool cap.
--alternatives:
--  - Stop tracking the .factory model artifacts (removes 1.72 GiB but changes the
--    checkout)
--  - Add a ToolSpec path/exclude for detect-secrets (currently ignored at
--    dispatch.py:179)
--  - Raise the per-tool memory limit above 2048 MB (weakens the OOM guard)
--why: The exact git-ls-files scan exits 0 in 8s and lint reports PASSED; the
--  filter was committed by ancestor 882fac0. The MemoryError is reproducible only
--  when a path alias bypasses the prefix regex under RLIMIT_AS 2 GB, which proves
--  the mechanism without requiring a fix at HEAD.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: final-gate-validation
--  lastSeen: 2026-11-10T00:27:58.391Z
--createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/rm-6e63c3be9e.yaml b/.factory/tasks/modernize/concerns/rm-6e63c3be9e.yaml
-deleted file mode 100644
-index 8ac8d5f..0000000
---- a/.factory/tasks/modernize/concerns/rm-6e63c3be9e.yaml
-+++ /dev/null
-@@ -1,21 +0,0 @@
--id: rm-6e63c3be9e
--chosen: Leave the tests/conftest.py backwards-compat re-export of
--  shipped_config_paths removed.
--alternatives:
--  - Keep the re-export as a union of both sides to preserve the item's
--    compatibility shim
--  - Keep it but add an explicit deprecation comment
--why: After the parent-side refactor every consumer imports shipped_config_paths
--  from tests._project_helpers directly, so the `from tests._project_helpers
--  import shipped_config_paths as shipped_config_paths` line in conftest is a
--  dead fallback shim; the project philosophy calls for pruning fallback shims,
--  and the module imports cleanly without it.
--status: open
--source:
--  record: 005-integrate-r1-a1
--  agent: developer
--  step: integrate
--  item: consolidate-integration-helpers-v3
--  lastSeen: 2026-11-09T23:49:50.606Z
--createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/rm-7cbd7c98ef.yaml b/.factory/tasks/modernize/concerns/rm-7cbd7c98ef.yaml
-deleted file mode 100644
-index 4f16868..0000000
---- a/.factory/tasks/modernize/concerns/rm-7cbd7c98ef.yaml
-+++ /dev/null
-@@ -1,20 +0,0 @@
--id: rm-7cbd7c98ef
--chosen: Accept the integration golden byte-identity assertion as the golden gate
--  evidence and record the missing golden-regen-hatch report as a medium risk
--  rather than regenerating the golden.
--alternatives:
--  - Block close-out until the golden-regen-hatch item produces its report
--  - Regenerate via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 and review the diff
--  - Pin only the golden file hash without the replay assertion
--why: test_setup_new_and_lint asserts both multiset equality and a byte-identical
--  replay on a fresh copy; golden has been unchanged since 1a811af; regeneration
--  would be an unreviewed diff with no behavior change to justify it.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: final-gate-validation
--  lastSeen: 2026-11-10T00:27:58.391Z
--createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml b/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml
-deleted file mode 100644
-index 8cc4139..0000000
---- a/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml
-+++ /dev/null
-@@ -1,19 +0,0 @@
--id: rm-8744aaa293
--chosen: Group the 203 private stub declarations into three per-owner rows plus
--  the W9707 enforcement row, rather than 203 individual rows
--alternatives:
--  - One row per declaration (precise but noisy and duplicates the same fix)
--  - Report only aggregate counts without per-owner evidence (loses the map
--    contract)
--why: The fix is one mechanical stub-surface cleanup per owner, and per-owner
--  totals make the inter-dep ownership map actionable; individual rows would
--  obscure that PYI-4 is a prerequisite and that 127 imports block deletion.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: coding-rules-audit
--  lastSeen: 2026-11-09T23:33:30.977Z
--createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/rm-960f2c7947.yaml b/.factory/tasks/modernize/concerns/rm-960f2c7947.yaml
-deleted file mode 100644
-index f278d31..0000000
---- a/.factory/tasks/modernize/concerns/rm-960f2c7947.yaml
-+++ /dev/null
-@@ -1,20 +0,0 @@
--id: rm-960f2c7947
--chosen: Reclassify realized semantic reservations (_decision_backend.py/.pyi +
--  test_decision_backend.py) to semantic and amend counts to 65/91/15/7/16
--alternatives:
--  - Keep literal 65/94/15/4/16 and leave backend files checkers-owned
--  - Assign the 8 new factory files to root to stay within ±5
--  - Treat the count breach as unresolved and block the gate
--why: The literal path rule would assign the newly realized reservation files to
--  checkers, contradicting ADR-011's planned-path read-only rule and creating a
--  real ownership collision. Reclassification keeps one writer per path and gives
--  an exact sum-194 recount.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-kickoff-gate
--  lastSeen: 2026-11-10T00:08:48.409Z
--createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml b/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml
-deleted file mode 100644
-index e25117a..0000000
---- a/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml
-+++ /dev/null
-@@ -1,17 +0,0 @@
--id: rm-9f9b452910
--chosen: Infer owners from ADR-011's visible five-owner taxonomy and flag the gap
--alternatives:
--  - Block the audit until the map is provided
--  - Invent new owner labels
--  - Treat every module as root-owned
--why: The UNIFIED map from coding-rules-audit was not injected and the
--  alternative (inspecting orchestration records) violates containment.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-a302818175.yaml b/.factory/tasks/modernize/concerns/rm-a302818175.yaml
-deleted file mode 100644
-index 628edd8..0000000
---- a/.factory/tasks/modernize/concerns/rm-a302818175.yaml
-+++ /dev/null
-@@ -1,21 +0,0 @@
--id: rm-a302818175
--chosen: Recommend the iteration-5 ADR-023 item-level path
--  (golden-regen-hatch-v2) rather than reviving epics to satisfy the legacy
--  contract
--alternatives:
--  - Reintroduce runner/checkers/semantic epics in I6 solely to produce close-ups
--  - Keep the legacy item pending indefinitely and let it block legacy
--    golden-regen-hatch
--why: The I5 plan explicitly ships no child epics and the v2 hatch depends only
--  on behavior items (plan-5.3:1013-1017, 1271-1284, 882-898). Reviving epics
--  would reintroduce the empty-wave/bottleneck failure ADR-013 and ADR-023
--  removed.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml b/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml
-deleted file mode 100644
-index fac171d..0000000
---- a/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml
-+++ /dev/null
-@@ -1,21 +0,0 @@
--id: rm-a310a057fe
--chosen: "Honor fail-open: report 0/3 close-ups and keep the item blocked/pending
--  rather than synthesizing a handoff"
--alternatives:
--  - Reconstruct three pseudo-close-ups from I4/I5 item-level shift declarations
--  - Treat plan-level closeup-3/closeup-4 as the three epic close-ups
--  - Emit three root-authored no-shift declarations in place of missing epic
--    close-ups
--why: ADR-011:64-69 and assignment.yaml:10-12 require all three epic close-ups
--  and forbid fabrication. Item-level shift declarations exist but are
--  single-owner item reports, not epic close-ups, so relabeling them would poison
--  the golden-regen-hatch precondition.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/rm-af822ddbc6.yaml b/.factory/tasks/modernize/concerns/rm-af822ddbc6.yaml
-deleted file mode 100644
-index 1a1fcc4..0000000
---- a/.factory/tasks/modernize/concerns/rm-af822ddbc6.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: rm-af822ddbc6
--chosen: Accept the modify/delete resolution for
--  tests/runner/test_pyright_noise_filter.py and
--  tests/runner/test_self_lint_clean.py (deletion wins).
--alternatives:
--  - Restore both files from the item side with imports retargeted to
--    tests._project_helpers
--  - Restore only test_pyright_noise_filter.py, whose modification was the
--    one-line import change
--why: The deletion is deliberate on the parent side (commit 644774e,
--  'never-test-linting-prune'), the item side only retargeted an import in one of
--  them, and neither file is referenced by any remaining code or config.
--  Resurrecting them would re-introduce tests the parent branch explicitly
--  pruned.
--status: open
--source:
--  record: 005-integrate-r1-a1
--  agent: developer
--  step: integrate
--  item: consolidate-integration-helpers-v3
--  lastSeen: 2026-11-09T23:49:50.606Z
--createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml b/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml
-deleted file mode 100644
-index 65daa54..0000000
---- a/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml
-+++ /dev/null
-@@ -1,18 +0,0 @@
--id: rm-b42ae1f186
--chosen: Use integration.py + 158-finding golden as canonical end-to-end coverage
--  and remove the real smoke test
--alternatives:
--  - Keep smoke as a fast real check
--  - Mark smoke slow and keep it
--why: The smoke test asserts only tool-name presence on a synthetic project, a
--  strict subset of the golden run, and unnecessarily spawns 14 real tools in the
--  default suite.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-bc510f4b77.yaml b/.factory/tasks/modernize/concerns/rm-bc510f4b77.yaml
-deleted file mode 100644
-index ee11f28..0000000
---- a/.factory/tasks/modernize/concerns/rm-bc510f4b77.yaml
-+++ /dev/null
-@@ -1,19 +0,0 @@
--id: rm-bc510f4b77
--chosen: Run the lint gate with PYTHON_SETUP_LINT_NO_AUTOFIX=1 and rely on direct
--  AST/pylint probes for the audit
--alternatives:
--  - Run bare `uv run lint` and revert autofixes (risk of partial writes)
--  - Skip lint entirely and cite only prior audit results (weaker final-state
--    evidence)
--why: Preserves the read-only repository invariant while still proving 14/14
--  tools pass and that the debt is suppressed; bare `uv run lint` would autofix
--  tracked files and invalidate the audit state.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: coding-rules-audit
--  lastSeen: 2026-11-09T23:33:30.977Z
--createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml b/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml
-deleted file mode 100644
-index 89d46ee..0000000
---- a/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml
-+++ /dev/null
-@@ -1,18 +0,0 @@
--id: rm-d0030d6966
--chosen: Keep tests for shipped python_setup_lint.testing and treat it as product
--  coverage
--alternatives:
--  - Remove it as test-infra self-test
--  - Move testing.py out of the shipped package
--why: src/python_setup_lint/testing.py exposes FakeRunCmd, make_lint_result,
--  test_checked_main and precommit validators to consumers; deleting
--  test_testing_fakes.py would drop shipped-API coverage.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-e754ab79c7.yaml b/.factory/tasks/modernize/concerns/rm-e754ab79c7.yaml
-deleted file mode 100644
-index eabb7cd..0000000
---- a/.factory/tasks/modernize/concerns/rm-e754ab79c7.yaml
-+++ /dev/null
-@@ -1,19 +0,0 @@
--id: rm-e754ab79c7
--chosen: Reconstruct the validated map at HEAD 1039df9 rather than yield inconclusive
--alternatives:
--  - Yield inconclusive and block all epic waves
--  - Consume the stale 5e466ac audit map unchanged
--  - Spawn epics with no validated ownership map
--why: The dependency was abandoned after retries, but the assignment still
--  requires a revision, counts, drift list, ownership tables, and zero unresolved
--  disputes. Reconstruction with explicit amendment A0 unblocks the spawn gate
--  while preserving the evidence trail.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-kickoff-gate
--  lastSeen: 2026-11-10T00:08:48.409Z
--createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md
-new file mode 100644
-index 0000000..60d4e92
---- /dev/null
-+++ b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md
-@@ -0,0 +1,111 @@
-+# Step: Research
-+
-+## Goal
-+Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
-+
-+## Rules
-+- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
-+- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
-+- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
-+- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
-+- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
-+- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
-+
-+## Assignment
-+{
-+  "slug": "coding-rules-audit",
-+  "kind": "fact-finder",
-+  "title": "Inventory CodingRules violations",
-+  "assignment": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS at final state (post-golden/assumptions/consolidate; read beartype discovery report from third-party item). No repo writes; output is structured item-report tables (durable in orchestration records, no committed file). Semantic exclusions marked SKIPPED (audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output rows {module,section,evidence file:line,category,est LoC delta,owner,fix} + UNIFIED disjoint-ownership map (this audit is SINGLE owner; test-debloat-audit consumes via inter-dep). Deps: read golden + helper final state; beartype report informs owner/fix.",
-+  "outlineRef": "coding-rules-audit",
-+  "milestone": "M3",
-+  "wave": 4,
-+  "deps": [
-+    "golden-findings-snapshot",
-+    "third-party-assumption-tests",
-+    "consolidate-integration-helpers"
-+  ],
-+  "scenarioRefs": [
-+    "M3: Coding-rules debt inventoried",
-+    "M3: Ownership map is complete and disjoint"
-+  ],
-+  "citations": [
-+    "CodingRules.md:90-107",
-+    "CodingRules.md:139-159",
-+    "src/python_setup_lint/checkers/_semantic.py:1-12",
-+    "src/python_setup_lint/checkers/_semantic.py:37-52",
-+    "src/python_setup_lint/checkers/_base.py:142-158",
-+    "src/python_setup_lint/runner/baseline.py:22-42",
-+    "lint.baseline:1-1"
-+  ]
-+}
-+
-+## Task Intent
-+# modernize
-+
-+Modernize the project while preserving every material lint/check behavior.
-+- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
-+- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
-+- Remove redundant tests.
-+- Replace the embedding/rerank based justification/comment check
-+  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
-+  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
-+  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
-+
-+
-+## Context & Citations
-+[
-+  "CodingRules.md:90-107",
-+  "CodingRules.md:139-159",
-+  "src/python_setup_lint/checkers/_semantic.py:1-12",
-+  "src/python_setup_lint/checkers/_semantic.py:37-52",
-+  "src/python_setup_lint/checkers/_base.py:142-158",
-+  "src/python_setup_lint/runner/baseline.py:22-42",
-+  "lint.baseline:1-1"
-+]
-+
-+## Review Feedback
-+
-+
-+## Open Concerns
-+- id: c-3e935debcb
-+  kind: risk
-+  severity: low
-+  summary: PoC lock is POSIX-only fcntl.flock
-+  affects:
-+    - cache-design-spike
-+    - decision-cache-impl
-+- id: c-5463b26c4b
-+  kind: assumption
-+  severity: medium
-+  summary: Production call site passes a constant rule symbol, collapsing the cache rule component
-+  affects:
-+    - cache-design-spike
-+    - decision-cache-impl
-+
-+
-+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
-+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
-+
-+## Output
-+
-+Yield a structured JSON object matching this schema:
-+- status (string, required, enum: ["ok","inconclusive"])
-+- summary (string, required)
-+- findings (string, required)
-+- contextPack (string, optional)
-+- sources (array of string, optional)
-+- recommendations (array of string, optional)
-+- concerns (array of object, optional): Structured concerns raised while investigating
-+  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
-+  - summary (string, required)
-+  - detail (string, optional)
-+  - severity (string, optional, enum: ["low","medium","high"])
-+  - location (object, optional)
-+    - file (string, required)
-+    - line (integer, optional)
-+  - affects (array of string, optional)
-+- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
-+  - chosen (string, required)
-+  - why (string, required)
-+  - alternatives (array of string, required)
-diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml
-new file mode 100644
-index 0000000..f64c9e6
---- /dev/null
-+++ b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml
-@@ -0,0 +1,19 @@
-+seq: 1
-+name: research
-+attempt: 1
-+fixRound: 1
-+agent: fact-finder
-+role: workhorse
-+models:
-+  - opencode-go/deepseek-v4.1-flash
-+  - opencode-go/muse-spark-1.3-contributor
-+timeoutSec: 3600
-+status: ok
-+startedAt: 2026-11-09T23:19:09.190Z
-+session: 01a1c29b-c07f-7662-b7bd-0475e001272c
-+endedAt: 2026-11-09T23:33:31.117Z
-+usage:
-+  inputTokens: 187879
-+  outputTokens: 83867
-+  costUsd: 0.104406
-+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-19-09-695Z_01a1c29b-c07f-7662-b7bd-0475e001272c.jsonl
-diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml
-new file mode 100644
-index 0000000..76751d9
---- /dev/null
-+++ b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml
-@@ -0,0 +1,366 @@
-+status: ok
-+summary: "Read-only CodingRules/AGENTS audit of src/** and scripts/** at final
-+  M3 state (HEAD f41160d). 42 inventory rows plus a verified 194-file disjoint
-+  ownership map (runner 65, checkers 91, setup-testing 15, semantic 7, root 16).
-+  The lint gate is green only because the debt is suppressed or unenforced:
-+  `PYTHON_SETUP_LINT_NO_AUTOFIX=1 uv run lint` passed all 14 tools (78.16s), and
-+  `lint.baseline` is still `[]`. Dominant debts: 203 private stub declarations
-+  outside TYPE_CHECKING (runner 95, checkers 63, setup-testing 45) while W9707
-+  is blind because `PyiUnderscoreChecker` reads `node.file`; 127 cross-module
-+  private imports in production code; 28 missing-beartype suppressions
-+  classified as 16 unnecessary, 7 runtime-import-fixable, 3 genuine StubChecker
-+  cycles (2 semantic ones excluded); a production-dead
-+  `runner/_baseline_helpers.py` (82 lines plus 31-line stub) still pinned only
-+  by tests; the `peek_fallback_tools` export chain; duplicated symlink logic in
-+  `scripts/create_root_symlinks.py` versus `setup.py`; 42 silent-except W9740
-+  suppressions; astroid-3 fallbacks despite astroid 4.0.4; 55 over-long source
-+  lines; and stale AGENTS/docs counts and semantic architecture. Semantic paths
-+  `_semantic.py/.pyi`, `_decision_backend.py/.pyi`,
-+  `_base.py::check_if_meaningful` and `_OPTIONAL_IMPORT_PATTERNS` are marked
-+  SKIPPED as required; `_decision_cache.py/.pyi` is absent and reserved to
-+  semantic."
-+findings: |
-+  # CodingRules / AGENTS audit — final M3 state (HEAD f41160d)
-+
-+  ## 0. Verification basis and scope
-+
-+  - HEAD `f41160d`; `git status --short` and `git diff --stat` were empty before and after every probe. No tracked file was written; `lint.baseline:1` is `[]`.
-+  - `PYTHON_SETUP_LINT_NO_AUTOFIX=1 uv run lint` -> exit 0, all 14 tools PASSED in 78.16s (tach, ruff format, ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi, pylint tests, detect-secrets). The green gate is not evidence of compliance: the rows below are suppressed, exempted, or unenforced.
-+  - `uv run pytest -q` -> 1357 passed, 7 deselected, 0 skipped, 4 warnings in 32.83s. `uv run pytest tests/integration.py --collect-only -q` -> 9 tests collected. AGENTS.md:10-11 still states 1290 pass, 4 skip, 15 deselected and integration 7 pass / ~30s.
-+  - Beartype discovery report read from `.factory/tasks/modernize/items/third-party-assumption-tests/steps/001-develop-a1/output.yaml:55-68`: with beartype 0.22.9 and `from __future__ import annotations`, a TYPE_CHECKING-only forward ref does not fail at decoration time but raises `beartype.roar.BeartypeCallHintForwardRefException` at call time. This classification is used in the BEA rows.
-+  - Golden/helper final state read as dependency input: `tests/_golden.py` 446 lines, `tests/_project_helpers.py` 204 lines, `tests/integration.py` 498 lines. Tests are not audit targets; they are covered only by the ownership map.
-+  - Pinned runtime versions: astroid 4.0.4, pylint 4.0.6, beartype 0.22.9 (`pyproject.toml:11-13`; `uv.lock:50-55`).
-+
-+  ### 0.1 SKIPPED semantic exclusions (not audited)
-+
-+  | Path / symbol | Evidence | Reason |
-+  |---|---|---|
-+  | `checkers/_semantic.py` + `_semantic.pyi` | `src/python_setup_lint/checkers/_semantic.py:1-60`; `_semantic.pyi:1-12` | Whole-file semantic owner. |
-+  | `checkers/_decision_backend.py` + `_decision_backend.pyi` | `_decision_backend.py:1-54`; `_decision_backend.pyi:1-25` | New decision backend; its 2 missing-beartype suppressions, `FakeBackend`, and stub surface are excluded. |
-+  | `checkers/_decision_cache.py` + `_decision_cache.pyi` | absent; `Path.exists()` false for both | Reserved for semantic cache implementation. |
-+  | `_base.py::check_if_meaningful` + stub section | `_base.py:160-252`; `_base.pyi:74-99` | Replacement target; checkers owner must not refactor it. |
-+  | `no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS` | `conformance/no_try_import_checker.py:13` | Must track the new optional decision-model dependency. |
-+
-+  ## 1. .pyi fidelity and private symbols
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | PYI-1 | runner/*.pyi | CodingRules 57 | 95 private declarations outside TYPE_CHECKING in runner stubs: `extra_tools.pyi:42-81` 19, `parsers.pyi:25-54` 14, `cmd_build.pyi:15-53` 13, `output.pyi:11-87` 9, `_record_parsers.pyi:8-15` 8, `_config.pyi:8-24` 7, `_autofix.pyi:12-26` 7, `_baseline_helpers.pyi:8-30` 6, `baseline.pyi:13-42` 3, `_record_types.pyi:23` 1 | private symbols in public stub | -80 | runner | Delete stub-only private declarations; make the 54 cross-module-used ones public (see IMP-1). |
-+  | PYI-2 | checkers/**/*.pyi | CodingRules 57 | 63 private declarations (42 top-level plus 21 class members): `stub/coverage.pyi:27-97` 13, `stub/fidelity/annotation.pyi:16-68` 9, `stub/fidelity/signature.pyi:19-69` 6, `stub/fidelity/kind.pyi:18-49` 5, `_base.pyi:18-35` 5, `stub/import_contract.pyi:29-38` 3, `stub/fidelity/_ast_helpers.pyi:48` 1, plus private methods in `conformance/*.pyi` | private symbols in public stub | -50 | checkers | Same fix; keep only public members; make `_msgs`, `_matches_path`, `_get_except_str` public or move behind a public helper module. |
-+  | PYI-3 | setup-testing stubs | CodingRules 57 | 45 private declarations: `setup.pyi:15-56` 23, `_setup_pyproject.pyi:8-43` 9, `_setup_precommit.pyi:12-24` 8, `testing.pyi:29-65` 3, `_setup_update.pyi:8-15` 2 | private symbols in public stub | -35 | setup-testing | Delete pure-internal declarations; rename shared setup steps used by `setup.py` public. |
-+  | PYI-4 | conformance/pyi_underscore_checker.py | CodingRules 57 | `:38-41` sets `_is_pyi` from `node.file.endswith('.pyi')`; `pylint --rcfile=config/.pylintrc-pyi --disable=all --enable=pyi-underscore-symbol src/python_setup_lint/runner/extra_tools.pyi` emits zero messages despite 19 private symbols in that stub; all 203 stub private symbols are therefore invisible | .pyi enforcement gap | +8 | checkers | Use the explicit linted path (`linter.current_file` or checker arg), not `node.file`; add a regression test that lints a real .pyi and expects W9707. Do this before bulk stub cleanup. |
-+  | PYI-5 | four __init__.pyi files | CodingRules 37 | `checkers/__init__.pyi` 5 lines, `checkers/stub/__init__.pyi` 11, `checkers/stub/fidelity/__init__.pyi` 16, `runner/__init__.pyi` 63; none has `__getattr__` or runtime logic; root `__init__.pyi` is justified by `__init__.py:10-23` version and structlog configuration | unnecessary .pyi for __init__ | -95 | checkers 32; runner 63 | Delete the four stubs; keep explicit re-exports typed in `__init__.py`. |
-+  | PYI-6 | runner, setup-testing, root, checkers .pyi | CodingRules 72 | 16 public generic-return functions lack a `Returns:` clause: `runner/dispatch.pyi:67,68,76,84,85` 5; `runner/cli.pyi:8,50` 2; `runner/baseline.pyi:10` 1; `setup.pyi:42,67,77,80` 4; `__main__.pyi:8` 1; `checkers/_base.pyi:71` 1; `_decision_backend.pyi:9,14` 2 SKIPPED | .pyi docstring gap | +30 | runner 8; setup-testing 4; root 1; checkers 1; semantic 2 SKIP | Add Returns clauses; `peek_fallback_tools` clause disappears with WRAP-1. |
-+  | PYI-7 | conformance stubs | CodingRules 57 | Public methods present in .py but absent from .pyi: `pyi_underscore_checker.py:52 visit_asyncfunctiondef`, `:68 visit_annassign`, `:76 visit_assign`; `unnamed_tuple_dict_checker.py:33 visit_assign`. `GenericLintTool` overrides (`dispatch.py:377,395,401`) inherit their declarations from `dispatch.pyi:68,84,85`, so they are not gaps. | stub fidelity gap | +4 | checkers | Add the four public visitor methods to the stubs (or mark them private if they are not part of the surface). |
-+  | PYI-8 | checkers/__init__.py | CodingRules 61-68 | `checkers/__init__.py:1-14` is only an Apache license header; no module docstring; no other src/scripts file carries that header | missing __init__ docs | -12 | checkers | Replace the header with a purpose/quick-start module docstring. |
-+  | PYI-9 | checkers/stub/fidelity/__init__.py | CodingRules 30-33 | `:31-32` still documents the old `checkers.stub_fidelity` path; `:42-88` re-exports `_FidelityState`, `_compare_*`, `_is_classvar`, `_emit_*`, `_extract_param_descriptors`; `__all__` at `:68-88` lists them; `stub/checker.pyi:16` imports `_FidelityState` with `type: ignore[attr-defined]` | private re-exports through package init | -35 | checkers | Have tests import from defining submodules; remove private re-exports and the stale path text. |
-+  | PYI-10 | runner/cli.py, dispatch.pyi | CodingRules 30-33 | `cli.py:43-48` `__all__` exports `_apply_autofix_conflict_aware` and `_autofix_target_paths`; `dispatch.pyi:124` still declares private `_strategy_for`; `cli.py:29` and `_autofix.py:13` carry stale 'private symbol removed from .pyi per M3(b)' comments | private symbols in public surface | -1 | runner | Remove private names from `__all__`; rename `_strategy_for` public or remove it from the stub; delete the stale comments. |
-+
-+  ## 2. @beartype and structural suppressions
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | BEA-1 | checkers | CodingRules 16 | 16 `missing-beartype` suppressions on symbols whose annotations `typing.get_type_hints` resolves: `_base.py:118,124,135,139`; `asyncio_timeout_checker.py:99`; `generic_key_dict_checker.py:166`; `missing_error_chain_checker.py:68`; `no_try_import_checker.py:81`; `pyi_underscore_checker.py:112`; `redundant_type_guard_checker.py:145`; `structlog_checker.py:149`; `tmp_path_checker.py:96`; `trivial_wrapper_checker.py:257`; `unnamed_tuple_dict_checker.py:118`; `stub/checker.py:376`; `suppression_justification_checker.py:93` | unnecessary beartype suppression | 0 | checkers | Add `@beartype` and delete each disable; verified resolvable by runtime `get_type_hints`. |
-+  | BEA-2 | conformance checkers | CodingRules 16 | 6 register functions suppress `missing-beartype` but PyLinter is TYPE_CHECKING-only: `bare_except_comment_checker.py:127`, `beartype_checker.py:75`, `missing_return_annotation_checker.py:49`, `silent_except_checker.py:76`, `suppression_justification_checker.py:391`, `stub/docstring_checker.py:236`; `get_type_hints` raises NameError PyLinter | TYPE_CHECKING-only beartype block | 0 | checkers | Move `from pylint.lint import PyLinter` to runtime as 10 other checkers already do; add `@beartype`; delete the disables. |
-+  | BEA-3 | _setup_update.py | CodingRules 16 | `:85 update()` suppresses `missing-beartype,docstring-in-impl`; `Path` is imported only under `TYPE_CHECKING` at `:7-8`; `get_type_hints` raises NameError Path; the function also carries a usage docstring in .py | TYPE_CHECKING-only beartype block plus .py docstring | 0 | setup-testing | Import Path at runtime, add `@beartype`, move usage docs to `_setup_update.pyi`, delete both disables. |
-+  | BEA-4 | stub fidelity helpers | CodingRules 16 | 3 genuine cycles: `stub/coverage.py:229-230 emit_coverage_violations(checker: StubChecker)`, `stub/fidelity/orchestrator.py:29 emit_fidelity_violations`, `stub/import_contract.py:77 emit_import_contract_violations`; StubChecker is TYPE_CHECKING-only and cannot be resolved | real circular TYPE_CHECKING block | +12 | checkers | Break the cycle with a Protocol or a StubChecker method; then decorate and remove the disables. |
-+  | BEA-5 | scripts/create_root_symlinks.py | CodingRules 16; AGENTS 16-32 | `:40 main()` has no `@beartype`; explicit `pylint --rcfile=config/.pylintrc scripts/create_root_symlinks.py` reports 2 W9740 at `:76` and `:85` but never W9701, because `source-roots=src` and the full pipeline does not lint scripts (`runner/types.py:62-63` default_py_dirs is `[src]`) | scripts escape conformance scope | +2 | setup-testing | Add `@beartype`; include scripts/ in pylint scope or add a scripts rcfile with source-roots including scripts. |
-+  | SUP-1 | checkers, runner stubs | CodingRules 30-33 | 5 `type: ignore[attr-defined]` comments all say 'private symbol removed from .pyi per M3(b); runtime import still works': `stub/checker.pyi:16`, `stub/fidelity/__init__.py:42`, `stub/fidelity/kind.py:8`, `runner/_autofix.py:13`, `runner/cli.py:29` | structural private-import suppression | 0 | checkers 3; runner 2 | Make the used symbols public in the .pyi, or stop importing them across modules; remove the ignores. |
-+  | SUP-2 | conformance checkers | CodingRules 90-107 | 4 class declarations suppress the same structural conflict: `beartype_checker.py:21`, `missing_return_annotation_checker.py:18`, `structlog_checker.py:20`, `suppression_justification_checker.py:31`; each says SourceRootMixin.options conflicts with BaseChecker.options | duplicated structural suppression | +8 | checkers | Give the mixin a non-conflicting options contract (shared base/composition) and remove the 4 identical type ignores. |
-+  | SUP-3 | setup-testing modules | CodingRules 49-50 | Suppression reasons are on preceding lines, not trailing: `testing.py:143` `# noqa: S603`, `:145` `# noqa: S607`, `setup.py:122` `# noqa: S603`; `testing.py:73,101` `# pylint: disable=generic-key-dict` also relies on a preceding comment | unjustified-suppression formatting | 0 | setup-testing | Move the adjacent rationale to a trailing comment or delete the suppression. |
-+
-+  ## 3. Trivial wrappers, duplicated logic, legacy stubs
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | DUP-1 | scripts/create_root_symlinks.py + setup.py | CodingRules 90-107 | Script `_CONFIG_FILES:24-36` and `main:40-90` duplicate `setup.py:41-53 _BUNDLED_CONFIGS` and `:223-275 _step_config_symlinks`; the lists already drift: script has 9 entries and omits `tach.toml`; script also lacks `_SKIP_SYMLINK_IF_EXISTS` and the copy2 fallback | duplicated logic | -35 | setup-testing | Extract one symlink-or-copy helper and one config-file manifest used by both. |
-+  | DUP-2 | config manifests | CodingRules 90-107 | Three manifests with different shapes: `scripts/create_root_symlinks.py:27-37` 9 file names; `setup.py:41-53` 10 file names; `runner/_config.py:8-20` 11 tool-label keys / 10 unique files | triplicated configuration data | -10 | setup-testing 1; runner 1 | Single manifest with tool-label-to-file mapping; derive setup and script lists from it. |
-+  | WRAP-1 | runner/baseline.py + runner/__init__.py | CodingRules 90-107 | `baseline.py:20-28` comment says the shim is debt owned by dispatch-split; `baseline.py:26 peek_fallback_tools()` returns `frozenset()`; declared at `baseline.pyi:10`; exported at `runner/__init__.py:17,22,62` and `runner/__init__.pyi:17,20,60`; allowlisted at `trivial_wrapper_checker.py:33` | legacy trivial stub | -8 | runner | Remove the function, both stub declarations, both package exports/docs, and the allowlist entry. |
-+  | WRAP-2 | conformance/trivial_wrapper_checker.py | CodingRules 93 | `_EXEMPT_NAMES:24-40` contains three dead names (`_legacy_to_records`, `_legacy_current_output`, `_legacy_saved_output`) plus hidden single-use predicates `_has_import` (`no_try_import_checker.py:77`), `_is_suppression_line` (`suppression_justification_checker.py:213`), `_is_test_file` and `_is_opted_out` (`stub/coverage.py:47-52`); `statistics_flags` adapters are also exempt | rule-exemption drift | -3 | checkers | Delete dead names; inline the single-use predicates or document each remaining exemption. |
-+  | DEAD-1 | runner/_baseline_helpers.py + .pyi | CodingRules 90-107 | `_baseline_helpers.py:1-82` is unused by src/; only `tests/runner/test_baseline_diff.py:13` imports `_compare_sorted`; the module's two-pointer diff duplicates `baseline.py:63-98 _compare_violation_lists` and its record conversion duplicates `_capture_one`; `.pyi:1-31` declares 6 private names; `_compare_sorted` is no longer re-exported by baseline.py | dead legacy module | -113 | runner | Delete the module and stub; test-debloat removes or repoints `TestCompareSorted` and the 50k benchmark in `tests/runner/test_baseline_diff.py:30-185`. |
-+  | DEAD-2 | runner/parsers.py | CodingRules 30-33 | `:7-15` imports 7 private `_parse_*` functions from `_record_parsers`; they are used only by the dispatch tables at `:222-260`; `parsers.pyi` omits them | private cross-module parser surface | -2 | runner | Move the dispatch tables into `_record_parsers` or expose a public parser registry. |
-+  | LEG-1 | runner/baseline.py | CodingRules 90-107 | `_FALLBACK_TOOLS` no longer exists (grep returns no definition); the legacy fallback set was removed | legacy stub resolved | 0 | runner | No action; keep it deleted. |
-+
-+  ## 4. Redundant fallbacks (astroid 3.x)
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | AST-1 | conformance/suppression_justification_checker.py | CodingRules 106-107 | `:247-273 _add_doc_node_spans` documents astroid 4.x `.doc_node` and keeps an astroid-3 `body[0]` Expr(Const) fallback; pyproject pins astroid>=4.0.4 and the assumptions suite pins 4.0.4 | redundant astroid-3 fallback | -18 | checkers | Delete the 3.x body fallback; use `ast_node.doc_node` directly and let the 4.x contract be tested by tests/assumptions/test_astroid_contracts.py. |
-+  | AST-2 | conformance/suppression_justification_checker.py | CodingRules 106-107; 215-221 | Broad defensive catches hide structural errors: `:51` and `:56` around stream read, `:146` around source-line extraction, `:263` around `.body`, `:297` around `nodes_of_class`; all carry W9740 without checking the specific failure contract | over-broad fallback | -4 | checkers | Narrow to the documented astroid exceptions and log at debug with structured fields. |
-+  | AST-3 | checkers/stub/normalizer.py | CodingRules 217-221 | `:88-95` parses a string annotation and catches `Exception: pass` with both `# noqa: S110` and `# pylint: disable=W9740`; malformed annotations are expected control flow, but the broad catch also swallows programming errors | broad silent except | +3 | checkers | Catch `astroid.AstroidError`/`ValueError` and log a debug event with the annotation; keep the repr fallback. |
-+
-+  ## 5. Over-long comments
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | CMT-1 | runner/_tool_specs.py | CodingRules 92; 139-159 | 55 source lines exceed 160 characters (12 >200, 2 >300). Top trailing-comment offenders: `_tool_specs.py:59` 689 chars (ty scope rationale ending in `# pylint: disable=unjustified-suppression`), `:56` 284 chars (RLIMIT_AS rationale), `bare_except_comment_checker.py:65` 226, `_base.py:139` 220, `suppression_justification_checker.py:295` 218 and `:297` 215, `redundant_type_guard_checker.py:133` 212; `_setup_precommit.py:54-55` are 680/240-char template strings, not comments | over-long comments and self-suppression | 0 | runner 2; checkers 5 | Move the ty/memory rationale to design/0002 or docs/overlays.md and cite it; remove the self-suppression; split long suppression reasons into a preceding comment plus a short trailing tag. |
-+  | CMT-2 | src/** | CodingRules 92 | 20 runtime imports are annotated as 'TYPE_CHECKING-only import' although they execute at runtime: `asyncio_timeout_checker.py:6`, `generic_key_dict_checker.py:8`, `missing_error_chain_checker.py:6`, `no_try_import_checker.py:6`, `pyi_underscore_checker.py:6`, `redundant_type_guard_checker.py:6`, `structlog_checker.py:9`, `tmp_path_checker.py:6`, `trivial_wrapper_checker.py:6`, `unnamed_tuple_dict_checker.py:6`, `stub/checker.py:9`, `stub/coverage.py:4`, `stub/docstring_checker.py:7`, `stub/normalizer.py:4`, `_autofix.py:6,7,15`, `_cli_complexity.py:3`, `_cli_helpers.py:5`, `testing.py:12` | misleading comments | 0 | runner 6; checkers 13; setup-testing 1 | Delete or correct every comment; these imports are runtime imports. |
-+
-+  ## 6. 500-line / R0912 / R0915 proximity
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | CPX-1 | runner/dispatch.py, runner/cli.py | CodingRules 139-159 | `dispatch.py` is 449 lines (89.8% of max-module-lines=500) and `cli.py` 413 (82.6%); dispatch no longer has a C0302 disable (prior state was 542 lines with a module-level disable), so the split is effective but the margin is 51 lines | C0302 proximity | 0 | runner | Keep new code out; next extraction candidate is strategy helpers before adding C0302 debt. |
-+  | CPX-2 | setup.py | CodingRules 139-159 | `setup.py` is 413 lines (82.6%); `checkers/conformance/suppression_justification_checker.py` 393 (78.6%) and `checkers/stub/checker.py` 379 (75.8%) are the next closest | C0302 proximity | 0 | setup-testing 1; checkers 2 | Watch; no suppression exists today, do not add one. |
-+  | CPX-3 | runner/baseline.py | CodingRules 139-159 | `:217 _diff_baseline` carries the only complexity suppression in src: `# pylint: disable=too-many-locals`; `max-locals=20` in `config/.pylintrc:24`; function spans `:217-288` | masked R0914 | +8 | runner | Split crash/add/remove/write paths into helpers; remove the disable. |
-+  | CPX-4 | setup.py, runner/parsers.py, conformance/trivial_wrapper_checker.py | CodingRules 139-159 | R0912 proximity at max-branches=16: `setup.py:223 _step_config_symlinks` 12 branches, `parsers.py:140 _parse_tach_json` 12, `trivial_wrapper_checker.py:49 _check_function` 13; no function reaches the 14-branch probe and no R0912/R0915 suppression exists | R0912 proximity | 0 | setup-testing 1; runner 1; checkers 1 | Split `_check_function` first (13/16); review the two 12-branch functions before extending them. |
-+
-+  ## 7. structlog and error rules
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | LOG-1 | root, checkers, runner | CodingRules 161-166 | Four independent structlog configuration sites: `__init__.py:10-23` (full processor chain), `checkers/_base.py:22-24` (filtering wrapper), `runner/cli.py:39-41` (same filtering wrapper), `runner/dispatch.py:224` (duplicated filtering config inside the pylint `--init-hook` string) | duplicated logging setup | -5 | root 1; checkers 1; runner 2 | Centralize in one shared logging module; keep the subprocess init-hook only where process isolation requires it. |
-+  | ERR-1 | src/** | CodingRules 217-221 | 42 `# pylint: disable=W9740` silent-except suppressions across 16 files: `setup.py` 6, `suppression_justification_checker.py` 5, `parsers.py` 3, `output.py` 3, `cmd_build.py` 3, `baseline.py` 3, `_config.py` 3, `_autofix.py` 3, `_record_parsers.py` 2, `stub/normalizer.py` 2, `stub/coverage.py` 2, `bare_except_comment_checker.py` 2, `_base.py` 2, `extra_tools.py` 1, `_setup_update.py` 1, `_setup_precommit.py` 1; representative: `_config.py:55`, `parsers.py:34,87,144`, `_autofix.py:33,47,90`, `setup.py:108,131,133,248,255,267` | silent-except policy debt | +40 | root policy; file owners apply | Every caught path needs a structured debug/error event or a single documented best-effort helper; do not merely suppress W9740. |
-+
-+  ## 8. TD-11 rumdl tests/data exclude
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | TD11-1 | config/rumdl.toml | TD-11 | No runner-side rumdl exclude exists (`dispatch.py:300` only has a path-scanning comment); the exclusion is config-level at `config/rumdl.toml:3` beside ruff `config/ruff.toml:3`, pylint `config/.pylintrc:3`, and pyright `config/pyrightconfig.json:16`. Prior concern was a runner hack; current state is consistent config policy | TD-11 resolved | 0 | root | No action; keep tests/data a config-level planted-fixture exclusion. |
-+
-+  ## 9. Docs, tool scope, and suppression formatting
-+
-+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
-+  |---|---|---|---|---|---|---|---|
-+  | DOC-1 | AGENTS.md | AGENTS 5-12 | `:10` says 1290 pass, 4 skip, 15 deselected; measured 1357 passed, 0 skipped, 7 deselected in 32.83s. `:11` says integration 7 pass / ~30s; measured collection is 9 tests (prior run 106.61s) | stale docs counts | +2 | root | Update both rows after the final merge; state actual collection count and measured duration. |
-+  | DOC-2 | AGENTS.md | AGENTS 16-32 | `:29` says pylint whole repo; `runner/types.py:62-63` defaults `default_py_dirs` to `[src]`, tests use `.pylintrc-tests`, and scripts are unlinted; explicit `pylint --rcfile=config/.pylintrc scripts/create_root_symlinks.py` reports W9740 at `:76,85` that the full pipeline never sees | inaccurate tool scope | +1 | root | Say src/ for main pylint, tests/ for pylint tests, and scripts/ currently unlinted, or add scripts/ to scope. |
-+  | DOC-3 | AGENTS.md, docs/semantic-justification.md | AGENTS 79-85; task intent | `AGENTS.md:82` still shows `_semantic.py → cross-encoder reranker`; `:85` says lazy-loaded reranker configurable via `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-26,51-53` documents sentence-transformers/cross-encoder/0.5; current `checkers/_decision_backend.py:1-54` is the CPU decision backend and `pyproject.toml:31-33` semantic extra is empty; `_decision_cache.py` is absent | obsolete architecture docs | +10 | root with semantic | Semantic epic drafts replacement; root updates AGENTS.md, docs/semantic-justification.md, and pyproject optional deps. Do not document the cache before `_decision_cache.py` exists. |
-+  | DOC-4 | AGENTS.md | AGENTS 121-139 | AGENTS documents `uv run pre-commit install` and active hooks, but `git ls-files .pre-commit-config.yaml` returns 0 files; only `_setup_precommit.py:88-122` writes it during install | missing pre-commit config | +1 | root | Commit a self-repo config or mark the section consumer-only. |
-+  | DOC-5 | setup.py, _setup_update.py, conformance checkers | CodingRules 61-72 | Usage docstrings in .py: `setup.py:77-81 all_ok`, `:323-327 install`, `:399-403 main`; `_setup_update.py:88-92 update`. Docstring-in-impl suppressions: `setup.py:76,318,398`, `_setup_update.py:85`, plus stale one-liner suppressions at `asyncio_timeout_checker.py:43,99` and `generic_key_dict_checker.py:166` | docstrings in implementation | -22 | setup-testing 4; checkers 3 | Move usage docs to the .pyi, delete the .py docstrings and all 7 disables. |
-+
-+  ## 10. Unified disjoint file-ownership map (single authoritative audit owner)
-+
-+  Universe = all 194 git-tracked files under `src/`, `scripts/`, `tests/` minus `tests/data/`. Reproduce with `git ls-files`; group counts below sum to 194 with no duplicate paths. This map is the inter-dep contract for `test-debloat-audit`; consume it unchanged.
-+
-+  | Owner | Paths covered | Count | Symbol exclusions |
-+  |---|---|---|---|
-+  | runner | `src/python_setup_lint/runner/**` (36 files) + `tests/runner/**` except `test_setup.py` and `test_setup_install.py` (28) + `tests/fixtures/dogfood-extra/pyproject.toml` (1) | 65 | none |
-+  | checkers | `src/python_setup_lint/checkers/**` minus `_semantic.py`, `_semantic.pyi`, `_decision_backend.py`, `_decision_backend.pyi` (59) + `tests/checkers/**` minus `test_semantic_check.py`, `test_semantic_threshold.py`, `test_decision_backend.py` (32) | 91 | `_base.py:160-252 check_if_meaningful` and `_base.pyi:74-99` (semantic); `conformance/no_try_import_checker.py:13 _OPTIONAL_IMPORT_PATTERNS` (semantic) |
-+  | setup-testing | `scripts/create_root_symlinks.py`; `src/python_setup_lint/_setup_precommit.py(.pyi)`, `_setup_pyproject.py(.pyi)`, `_setup_update.py(.pyi)`, `setup.py(.pyi)`, `testing.py(.pyi)` (10 src files); `tests/runner/test_setup.py`, `tests/runner/test_setup_install.py`, `tests/test_setup_config_symlinks.py`, `tests/test_setup_precommit.py` (4) | 15 | none |
-+  | semantic | `src/python_setup_lint/checkers/_semantic.py`, `_semantic.pyi`, `_decision_backend.py`, `_decision_backend.pyi`; `tests/checkers/test_semantic_check.py`, `test_semantic_threshold.py`, `test_decision_backend.py` | 7 | whole semantic scope; `_decision_cache.py` and `_decision_cache.pyi` reserved but absent |
-+  | root | `src/python_setup_lint/__init__.py(.pyi)`, `__main__.py(.pyi)`, `py.typed` (5); `tests/__init__.py`, `_golden.py`, `_project_helpers.py`, `conftest.py`, `integration.py`, `test_golden.py`, `assumptions/__init__.py`, `assumptions/test_astroid_contracts.py`, `assumptions/test_beartype_contracts.py`, `assumptions/test_pylint_cache_semantics.py`, `assumptions/test_pylint_contracts.py` (11) | 16 | none |
-+  | root-owned group (listed once, not in the 194) | `tests/data/**`, `config/**`, `docs/**`, `design/**` | group | n/a |
-+
-+  Stub rule applied: every `.pyi` has the same owner as its paired `.py`; `dispatch.pyi` is runner, `_base.pyi` is checkers, `setup.pyi` is setup-testing, `_semantic.pyi` and `_decision_backend.pyi` are semantic. Root project files outside the declared universe (`pyproject.toml`, `AGENTS.md`, `CodingRules.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `lint.baseline`, `tach.toml`, `uv.lock`, `.secrets.baseline`) are root-owned.
-+
-+  ### 10.1 Verification of the map
-+
-+  - 194 = 65 runner + 91 checkers + 15 setup-testing + 7 semantic + 16 root; every path matched exactly one owner rule.
-+  - Symbol exclusions reference existing code: `_base.py:160-252`, `_base.pyi:74-99`, `no_try_import_checker.py:13`, `_semantic.py/.pyi`, `_decision_backend.py/.pyi`.
-+  - Reservations: `src/python_setup_lint/checkers/_decision_cache.py` and `.pyi` are the only reserved paths and are absent (`Path.exists()` false for both). No other new path is reserved.
-+  - Tests private-import count is 271 (test-only); those are test-debloat remit, not src/scripts audit rows. `tests/runner/test_baseline_diff.py` is the only consumer of the dead `_baseline_helpers` module (DEAD-1).
-+
-+  ## 11. Non-findings and resolved items
-+
-+  - No `.py`/`.pyi` pairing gap: 51 non-`__init__` src modules each have a stub; 6 `__init__.py` files exist, 5 have stubs, only root is justified; `scripts/` is rule-exempt.
-+  - No `_FALLBACK_TOOLS` definition remains; `_compare_sorted` is no longer re-exported by `baseline.py` (the dead module remains, see DEAD-1).
-+  - No C0302 suppression remains; `dispatch.py` went 542 -> 449 lines without the module-level disable.
-+  - No duplicate-code messages; no unsuppressed R0912/R0915/R0914 hits; the only complexity suppression is CPX-3.
-+  - No product-code `logging.getLogger` call (only the checker's message text at `structlog_checker.py:24`); no f-string log calls; missing-error-chain checker passes. User-facing CLI output uses `print`, which is treated as CLI presentation, not logging.
-+  - `mypy.stubtest`, pyright verify types, and pylint-pyi all pass; PYI-4 explains why pylint-pyi green is not evidence that .pyi rules hold. The only stub-fidelity gaps found by direct AST comparison are the four public methods in PYI-7; module-level public symbols are complete.
-+  - TD-11 is resolved in runner code (config-level exclusion only); see TD11-1.
-+  - `lint.baseline` remains `[]` (`lint.baseline:1`). Do not baseline any row above; the empty baseline is the fitness gate.
-+
-+  ## 12. Handoff notes
-+
-+  - Fix PYI-4 before any bulk stub deletion; otherwise 203 private stub symbols stay unguarded.
-+  - PYI-1..3 cannot be done by deletion alone: 127 production private imports (runner 54, checkers 57, setup-testing 16) depend on those names; make cross-module helpers public (Symbol Convention, CodingRules 30-33) or move them behind public facades, then delete the private stub declarations.
-+  - DEAD-1 needs test-debloat coordination: `tests/runner/test_baseline_diff.py:30-185` pins `_compare_sorted`; `tests/_golden.py` and `tests/_project_helpers.py` are golden/helper-owned and must not be reassigned.
-+  - Beartype report drives BEA-2/BEA-3: TYPE_CHECKING-only refs fail only at call time, so runtime imports are required; BEA-4 needs a Protocol or StubChecker method, not a mere import move.
-+  - Keep `lint.baseline` empty. Re-measure AGENTS counts only after the final merge.
-+contextPack: "HEAD f41160d; clean tree; lint 14/14 PASSED in 78.16s with
-+  PYTHON_SETUP_LINT_NO_AUTOFIX=1; pytest 1357 passed / 7 deselected / 0 skipped
-+  in 32.83s; integration collects 9; lint.baseline []. 42 audit rows. 194-file
-+  map: runner 65, checkers 91, setup-testing 15, semantic 7, root 16. Top debts:
-+  203 private stub declarations outside TYPE_CHECKING (runner 95, checkers 63,
-+  setup-testing 45), W9707 blind because PyiUnderscoreChecker uses node.file;
-+  127 production private imports; 28 missing-beartype suppressions (16
-+  resolvable, 7 runtime-import-fixable, 3 real StubChecker cycles; 2 semantic
-+  skipped); dead runner/_baseline_helpers.py (82+31 lines) pinned only by tests;
-+  peek_fallback_tools export chain; duplicated symlink/config manifests; 42
-+  W9740 silent excepts; astroid-3 fallbacks despite astroid 4.0.4; 55 over-long
-+  source lines; stale AGENTS/docs counts and cross-encoder docs. Semantic
-+  SKIPPED: _semantic.py/.pyi, _decision_backend.py/.pyi,
-+  _base.py::check_if_meaningful (+stub), _OPTIONAL_IMPORT_PATTERNS. Reserved
-+  absent paths: _decision_cache.py/.pyi. Open concerns c-3e935debcb (POSIX-only
-+  flock) and c-5463b26c4b (constant rule symbol) remain semantic cache
-+  constraints."
-+sources:
-+  - CodingRules.md:16
-+  - CodingRules.md:30-41
-+  - CodingRules.md:57
-+  - CodingRules.md:61-72
-+  - CodingRules.md:90-107
-+  - CodingRules.md:139-159
-+  - CodingRules.md:161-166
-+  - CodingRules.md:215-222
-+  - AGENTS.md:5-12
-+  - AGENTS.md:16-32
-+  - AGENTS.md:79-85
-+  - AGENTS.md:121-139
-+  - lint.baseline:1
-+  - src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py:38-41
-+  - src/python_setup_lint/checkers/_base.py:160-252
-+  - src/python_setup_lint/checkers/_base.pyi:74-99
-+  - src/python_setup_lint/checkers/conformance/no_try_import_checker.py:13
-+  - src/python_setup_lint/runner/baseline.py:20-28
-+  - src/python_setup_lint/runner/baseline.pyi:9-10
-+  - src/python_setup_lint/runner/__init__.py:17,22,62
-+  - src/python_setup_lint/runner/__init__.pyi:17,20,60
-+  - src/python_setup_lint/runner/_baseline_helpers.py:1-82
-+  - src/python_setup_lint/runner/_baseline_helpers.pyi:1-31
-+  - src/python_setup_lint/runner/parsers.py:7-15,222-260
-+  - src/python_setup_lint/runner/dispatch.py:449
-+  - src/python_setup_lint/runner/dispatch.pyi:124
-+  - src/python_setup_lint/runner/cli.py:43-48
-+  - src/python_setup_lint/runner/cli.py:29
-+  - src/python_setup_lint/runner/_autofix.py:13
-+  - src/python_setup_lint/checkers/stub/fidelity/__init__.py:31-88
-+  - src/python_setup_lint/checkers/stub/checker.pyi:16
-+  - src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:247-297
-+  - src/python_setup_lint/checkers/stub/normalizer.py:88-95
-+  - src/python_setup_lint/runner/_tool_specs.py:56,59
-+  - src/python_setup_lint/runner/baseline.py:217
-+  - src/python_setup_lint/setup.py:41-53,223-275,399-403
-+  - scripts/create_root_symlinks.py:27-37,40-90
-+  - config/.pylintrc:2,22-27
-+  - config/rumdl.toml:3
-+  - config/rumdl.toml:3
-+  - docs/semantic-justification.md:3-26,51-53
-+  - src/python_setup_lint/checkers/_decision_backend.py:1-54
-+  - src/python_setup_lint/checkers/_decision_backend.pyi:1-25
-+  - tests/_golden.py:446
-+  - tests/_project_helpers.py:204
-+  - tests/integration.py:498
-+  - .factory/tasks/modernize/items/third-party-assumption-tests/steps/001-develop-a1/output.yaml:55-68
-+recommendations:
-+  - "Fix PYI-4 first: make PyiUnderscoreChecker use the explicit linted .pyi
-+    path and add a real-.pyi W9707 regression test, then bulk-clean private stub
-+    symbols by owner."
-+  - Before deleting PYI-1..3 declarations, resolve the 127 cross-module private
-+    imports (runner 54, checkers 57, setup-testing 16) by making shared helpers
-+    public or moving them behind public facades; do not delete symbols still
-+    imported at runtime.
-+  - Delete the dead `runner/_baseline_helpers.py` plus `.pyi` (DEAD-1) and
-+    coordinate with test-debloat to remove or repoint `TestCompareSorted` and
-+    the 50k benchmark in `tests/runner/test_baseline_diff.py`.
-+  - "Apply the beartype report: add @beartype and delete the 16 resolvable
-+    suppressions; runtime-import PyLinter for 6 registers and Path for
-+    `_setup_update.update`; break the 3 StubChecker cycles with a Protocol or
-+    method; add @beartype to `scripts/create_root_symlinks.py::main` and lint
-+    scripts/."
-+  - Remove the `peek_fallback_tools` function/stub/export/doc/allowlist chain
-+    (WRAP-1) and shrink the trivial-wrapper allowlist, including the three dead
-+    `_legacy_*` names (WRAP-2).
-+  - Deduplicate the symlink logic and the three config manifests shared by
-+    `scripts/create_root_symlinks.py`, `setup.py`, and `runner/_config.py`
-+    (DUP-1/DUP-2).
-+  - Delete the astroid-3 docstring fallback and narrow the broad
-+    AttributeError/Exception catches (AST-1..3); convert the 42 W9740 silent
-+    paths to structured debug/error events or a documented best-effort helper
-+    (ERR-1).
-+  - Update AGENTS.md counts/tool scope, docs/semantic-justification.md, and
-+    pre-commit documentation after the final merge; keep `lint.baseline` empty
-+    rather than baselining any row.
-+  - Reserve `checkers/_decision_cache.py` and `.pyi` for semantic only; the
-+    cache item must address the open POSIX-only flock concern (c-3e935debcb) and
-+    the constant-rule-symbol cache-key concern (c-5463b26c4b) before docs
-+    describe a git-stored cache.
-+concerns:
-+  - kind: tech-debt
-+    summary: W9707 .pyi enforcement is blind, so 203 private stub declarations are
-+      unguarded
-+    detail: PyiUnderscoreChecker sets _is_pyi from node.file; pylint maps a .pyi
-+      path to the .py module file, so no W9707 fires even though extra_tools.pyi
-+      alone has 19 private symbols. Fix PYI-4 before bulk stub cleanup or the
-+      cleanup has no regression guard.
-+    severity: high
-+    location:
-+      file: src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py
-+      line: 40
-+    affects:
-+      - coding-rules-audit
-+      - stub-cleanup
-+      - pylint-pyi
-+  - kind: tech-debt
-+    summary: Production-dead _baseline_helpers module is pinned only by tests
-+    detail: runner/_baseline_helpers.py (82 lines) and its 31-line stub are unused
-+      by src; tests/runner/test_baseline_diff.py:13 imports _compare_sorted.
-+      Deleting it requires test-debloat coordination, otherwise the tests keep
-+      dead code alive.
-+    severity: medium
-+    location:
-+      file: src/python_setup_lint/runner/_baseline_helpers.py
-+      line: 1
-+    affects:
-+      - coding-rules-audit
-+      - test-debloat-audit
-+  - kind: tech-debt
-+    summary: peek_fallback_tools debt comment names a completed owner
-+    detail: baseline.py:18-22 says the shim is debt owned by dispatch-split, but the
-+      dispatch split is complete (dispatch.py is 449 lines, no C0302 disable).
-+      The comment risks leaving an orphaned export chain; the audit assigns it
-+      to runner.
-+    severity: low
-+    location:
-+      file: src/python_setup_lint/runner/baseline.py
-+      line: 18
-+    affects:
-+      - coding-rules-audit
-+      - runner
-+  - kind: risk
-+    summary: Semantic docs still describe the removed cross-encoder while the
-+      decision cache does not exist
-+    detail: AGENTS.md:82-85 and docs/semantic-justification.md:3-26,51-53 document
-+      sentence-transformers/cross-encoder/reranker, but the tree contains
-+      _decision_backend.py and no _decision_cache.py. Docs must not claim a
-+      git-stored cache before the semantic cache item lands; this is root-owned
-+      documentation updated with the semantic epic.
-+    severity: medium
-+    location:
-+      file: docs/semantic-justification.md
-+      line: 3
-+    affects:
-+      - coding-rules-audit
-+      - semantic-docs
-+      - decision-cache-impl
-+  - kind: assumption
-+    summary: LoC deltas are gross estimates; public renames offset stub deletion
-+    detail: Private stub declarations that are imported cross-module cannot simply
-+      be deleted; they must be renamed public, so the net reduction is lower
-+      than the gross -165 LoC estimated for PYI-1..3. Use the rows as
-+      prioritization, not as a precise budget.
-+    severity: low
-+    location:
-+      file: src/python_setup_lint/checkers/_base.pyi
-+      line: 18
-+    affects:
-+      - coding-rules-audit
-+remarkable:
-+  - chosen: Group the 203 private stub declarations into three per-owner rows plus
-+      the W9707 enforcement row, rather than 203 individual rows
-+    why: The fix is one mechanical stub-surface cleanup per owner, and per-owner
-+      totals make the inter-dep ownership map actionable; individual rows would
-+      obscure that PYI-4 is a prerequisite and that 127 imports block deletion.
-+    alternatives:
-+      - One row per declaration (precise but noisy and duplicates the same fix)
-+      - Report only aggregate counts without per-owner evidence (loses the map
-+        contract)
-+  - chosen: Run the lint gate with PYTHON_SETUP_LINT_NO_AUTOFIX=1 and rely on direct
-+      AST/pylint probes for the audit
-+    why: Preserves the read-only repository invariant while still proving 14/14
-+      tools pass and that the debt is suppressed; bare `uv run lint` would
-+      autofix tracked files and invalidate the audit state.
-+    alternatives:
-+      - Run bare `uv run lint` and revert autofixes (risk of partial writes)
-+      - Skip lint entirely and cite only prior audit results (weaker final-state
-+        evidence)
-+  - chosen: Treat TD-11 as resolved at the config layer rather than as a runner hack
-+    why: The only tests/data exclusion is config/rumdl.toml:3, consistent with ruff,
-+      pylint, and pyright config excludes; dispatch.py:300 only contains a
-+      path-scanning comment. Recording a false runner-side TD-11 would misassign
-+      work to runner.
-+    alternatives:
-+      - Invent a runner-side fix row (would duplicate the config exclusion)
-+      - Leave TD-11 unmentioned (fails the assignment's explicit inventory
-+        request)
-diff --git a/.factory/tasks/modernize/items/consolidate-integration-helpers-v3/merge-attempts.yaml b/.factory/tasks/modernize/items/consolidate-integration-helpers-v3/merge-attempts.yaml
-deleted file mode 100644
-index f67fb6b..0000000
---- a/.factory/tasks/modernize/items/consolidate-integration-helpers-v3/merge-attempts.yaml
-+++ /dev/null
-@@ -1,2 +0,0 @@
--attempts:
--  "11": 1
-diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
-index c98a972..f3e8b43 100644
---- a/.factory/tasks/modernize/journal.ndjson
-+++ b/.factory/tasks/modernize/journal.ndjson
-@@ -2212,53 +2212,3 @@
- {"type":"step_timeout_armed","task":"modernize","item":"cache-design-spike","step":"develop","timeoutSec":5400,"ts":"2026-11-09T22:54:38.930Z"}
- {"type":"step_transcript_size_warning","task":"modernize","item":"cache-design-spike","step":"develop","attempt":1,"sizeBytes":16893418,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T22-54-39-286Z_01a1c285-50b6-742b-bd37-9d3702343a29.jsonl","ts":"2026-11-09T23:18:39.881Z"}
- {"type":"step_tool_call_warning","task":"modernize","item":"cache-design-spike","step":"develop","attempt":1,"toolCalls":125,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T22-54-39-286Z_01a1c285-50b6-742b-bd37-9d3702343a29.jsonl","ts":"2026-11-09T23:18:39.882Z"}
--{"type":"step_finished","task":"modernize","item":"cache-design-spike","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c285-50b6-742b-bd37-9d3702343a29","usage":{"inputTokens":176978,"outputTokens":87972,"costUsd":0.105401},"ts":"2026-11-09T23:18:40.212Z"}
--{"type":"step_started","task":"modernize","item":"coding-rules-audit","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--coding-rules-audit/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1","ts":"2026-11-09T23:19:09.259Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"coding-rules-audit","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:19:09.264Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"coding-rules-audit","step":"research","attempt":1,"sizeBytes":19744278,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-19-09-695Z_01a1c29b-c07f-7662-b7bd-0475e001272c.jsonl","ts":"2026-11-09T23:33:30.946Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"coding-rules-audit","step":"research","attempt":1,"toolCalls":112,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-19-09-695Z_01a1c29b-c07f-7662-b7bd-0475e001272c.jsonl","ts":"2026-11-09T23:33:30.947Z"}
--{"type":"step_finished","task":"modernize","item":"coding-rules-audit","step":"research","attempt":1,"status":"ok","sessionId":"01a1c29b-c07f-7662-b7bd-0475e001272c","usage":{"inputTokens":187879,"outputTokens":83867,"costUsd":0.104406},"ts":"2026-11-09T23:33:31.175Z"}
--{"type":"item_merge_started","item":"consolidate-integration-helpers-v3","branch":"topic/modernize--consolidate-integration-helpers-v3","wave":11,"mergeAttempt":1,"ts":"2026-11-09T23:33:34.826Z"}
--{"type":"item_merge_phase","item":"consolidate-integration-helpers-v3","phase":"merge-parent-into-child","ts":"2026-11-09T23:33:34.830Z"}
--{"type":"merge_conflict","item":"consolidate-integration-helpers-v3","conflicts":["tests/_project_helpers.py","tests/integration.py","tests/runner/_autofix_helpers.py","tests/runner/test_autofix_conflict.py","tests/runner/test_autofix_conflict_apply.py","tests/runner/test_autofix_conflict_integration.py","tests/runner/test_pyright_noise_filter.py","tests/runner/test_self_lint_clean.py"],"ts":"2026-11-09T23:34:30.219Z"}
--{"type":"step_started","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--consolidate-integration-helpers-v3/.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/005-integrate-r1-a1","ts":"2026-11-09T23:34:30.539Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","timeoutSec":5400,"ts":"2026-11-09T23:34:30.544Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"sizeBytes":7227980,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-34-30-965Z_01a1c2a9-cf35-77dd-bcde-b7d07dddc697","ts":"2026-11-09T23:41:30.442Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"toolCalls":73,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-34-30-965Z_01a1c2a9-cf35-77dd-bcde-b7d07dddc697","ts":"2026-11-09T23:41:30.444Z"}
--{"type":"harness_model_fallback","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-09T23:41:34.586Z"}
--{"type":"harness_model_fallback","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-09T23:41:36.950Z"}
--{"type":"step_output_repaired","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"method":"relaunch","ts":"2026-11-09T23:49:50.600Z"}
--{"type":"step_finished","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"status":"ok","sessionId":"01a1c2a9-cf35-77dd-bcde-b7d07dddc697","usage":{"inputTokens":121859,"outputTokens":52850,"costUsd":0.066984},"ts":"2026-11-09T23:49:50.760Z"}
--{"type":"item_merge_failed","item":"consolidate-integration-helpers-v3","error":"Cannot conclude merge: conflict markers or unmerged files remain in tests/runner/test_pyright_noise_filter.py, tests/runner/test_self_lint_clean.py","mergeAttempt":1,"ts":"2026-11-09T23:49:50.813Z"}
--{"type":"step_started","task":"modernize","item":"docs-counts-sync","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--docs-counts-sync/.factory/tasks/modernize/items/docs-counts-sync/steps/001-test-first-r1-a1","ts":"2026-11-09T23:50:10.097Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"docs-counts-sync","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T23:50:10.103Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"docs-counts-sync","step":"test-first","attempt":1,"sizeBytes":14110437,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-50-10-404Z_01a1c2b8-24e4-714a-b392-1a3440f53cc1.jsonl","ts":"2026-11-09T23:58:46.505Z"}
--{"type":"step_finished","task":"modernize","item":"docs-counts-sync","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c2b8-24e4-714a-b392-1a3440f53cc1","usage":{"inputTokens":70279,"outputTokens":32429,"costUsd":0.033694},"ts":"2026-11-09T23:58:53.278Z"}
--{"type":"step_started","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-kickoff-gate/.factory/tasks/modernize/items/epic-kickoff-gate/steps/001-research-r1-a1","ts":"2026-11-09T23:59:23.326Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"epic-kickoff-gate","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:59:23.331Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"sizeBytes":15060344,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-59-23-689Z_01a1c2c0-9629-723b-9b20-769bd656e054.jsonl","ts":"2026-11-10T00:08:48.380Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"toolCalls":95,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-59-23-689Z_01a1c2c0-9629-723b-9b20-769bd656e054.jsonl","ts":"2026-11-10T00:08:48.382Z"}
--{"type":"step_finished","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2c0-9629-723b-9b20-769bd656e054","usage":{"inputTokens":121841,"outputTokens":49513,"costUsd":0.057369},"ts":"2026-11-10T00:08:48.680Z"}
--{"type":"step_started","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-shift-report-collection/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1","ts":"2026-11-10T00:09:19.937Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"epic-shift-report-collection","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:09:19.943Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"sizeBytes":22559494,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"toolCalls":65,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
--{"type":"step_finished","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2c9-b140-700c-9319-d3dbbbaad9b1","usage":{"inputTokens":88261,"outputTokens":36328,"costUsd":0.040594},"ts":"2026-11-10T00:14:51.724Z"}
--{"type":"step_started","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--final-gate-validation/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1","ts":"2026-11-10T00:15:14.068Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"final-gate-validation","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:15:14.073Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"sizeBytes":10860719,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-15-14-412Z_01a1c2cf-17ec-7158-a980-3643bf095788","ts":"2026-11-10T00:27:58.370Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"toolCalls":71,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-15-14-412Z_01a1c2cf-17ec-7158-a980-3643bf095788","ts":"2026-11-10T00:27:58.371Z"}
--{"type":"step_finished","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2cf-17ec-7158-a980-3643bf095788","usage":{"inputTokens":95165,"outputTokens":54227,"costUsd":0.052455},"ts":"2026-11-10T00:27:58.660Z"}
--{"type":"step_started","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-regen-hatch/.factory/tasks/modernize/items/golden-regen-hatch/steps/001-develop-r1-a1","ts":"2026-11-10T00:28:18.414Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"golden-regen-hatch","step":"develop","timeoutSec":5400,"ts":"2026-11-10T00:28:18.418Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"sizeBytes":5855128,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-28-18-722Z_01a1c2db-0fa2-75f0-aecb-0c9ff070f6d3.jsonl","ts":"2026-11-10T00:33:46.603Z"}
--{"type":"step_finished","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c2db-0fa2-75f0-aecb-0c9ff070f6d3","usage":{"inputTokens":50219,"outputTokens":22890,"costUsd":0.025239},"ts":"2026-11-10T00:36:23.368Z"}
--{"type":"step_started","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--test-debloat-audit/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1","ts":"2026-11-10T00:36:47.782Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"test-debloat-audit","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:36:47.787Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"sizeBytes":24748144,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl","ts":"2026-11-10T00:53:21.439Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"toolCalls":113,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl","ts":"2026-11-10T00:53:21.439Z"}
--{"type":"step_finished","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2e2-d5a8-7324-8be8-2ee2ad29c577","usage":{"inputTokens":684503,"outputTokens":103456,"costUsd":0.179749},"ts":"2026-11-10T00:53:21.978Z"}
--{"type":"plan_closeup_refused","iteration":5,"stragglers":["cache-design-spike","coding-rules-audit","consolidate-integration-helpers-v3","docs-counts-sync","epic-kickoff-gate","epic-shift-report-collection","final-gate-validation","golden-regen-hatch","test-debloat-audit"],"statuses":{"cache-design-spike":"running","coding-rules-audit":"running","consolidate-integration-helpers-v3":"running","docs-counts-sync":"running","epic-kickoff-gate":"running","epic-shift-report-collection":"running","final-gate-validation":"running","golden-regen-hatch":"running","test-debloat-audit":"running"},"redrive":1,"ts":"2026-11-10T00:53:26.301Z"}
--{"type":"step_started","task":"modernize","item":"cache-design-spike","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--cache-design-spike/.factory/tasks/modernize/items/cache-design-spike/steps/002-review-r1-a1","ts":"2026-11-10T00:53:26.643Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"cache-design-spike","step":"review","timeoutSec":3600,"ts":"2026-11-10T00:53:26.649Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"cache-design-spike","step":"review","attempt":1,"sizeBytes":5434036,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-53-26-962Z_01a1c2f2-1332-755e-a9bc-6cbeac5678c6","ts":"2026-11-10T01:14:34.075Z"}
-diff --git a/.factory/tasks/modernize/state.yaml b/.factory/tasks/modernize/state.yaml
-index f002168..6195c45 100644
---- a/.factory/tasks/modernize/state.yaml
-+++ b/.factory/tasks/modernize/state.yaml
-@@ -2,7 +2,7 @@ task: modernize
- kind: saga
- status: active
- iteration: 5
--currentWave: 2
-+currentWave: 4
- items:
-   adr-formalization:
-     kind: no-behavior
-@@ -165,12 +165,11 @@ items:
-     mergedAt: 2026-11-09T00:11:56-05:00
-   epic-kickoff-gate:
-     kind: fact-finder
--    status: running
-+    status: blocked
-     branch: topic/modernize--epic-kickoff-gate
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.057369
--    currentStep: research
-+    spendUsd: 0
-   golden-contract-hardening:
-     kind: test-only
-     status: merged
-@@ -217,12 +216,11 @@ items:
-     mergedAt: 2026-11-09T13:56:23-05:00
-   cache-design-spike:
-     kind: poc
--    status: running
-+    status: blocked
-     branch: topic/modernize--cache-design-spike
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.105401
--    currentStep: develop
-+    spendUsd: 0
-   checkers-legacy-dead-cleanup:
-     kind: no-behavior
-     status: blocked
-@@ -257,12 +255,11 @@ items:
-     mergedAt: 2026-11-08T10:47:48-05:00
-   epic-shift-report-collection:
-     kind: fact-finder
--    status: running
-+    status: blocked
-     branch: topic/modernize--epic-shift-report-collection
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.040594
--    currentStep: research
-+    spendUsd: 0
-   remaining-lint-violations-fix:
-     kind: no-behavior
-     status: merged
-@@ -301,12 +298,11 @@ items:
-     mergedAt: 2026-11-09T01:20:54-05:00
-   coding-rules-audit:
-     kind: fact-finder
--    status: running
-+    status: pending
-     branch: topic/modernize--coding-rules-audit
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.104406
--    currentStep: research
-+    spendUsd: 0
-   decision-cache-impl:
-     kind: dev
-     status: failed
-@@ -317,12 +313,11 @@ items:
-     currentStep: qa
-   golden-regen-hatch:
-     kind: test-only
--    status: running
-+    status: blocked
-     branch: topic/modernize--golden-regen-hatch
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.025239
--    currentStep: develop
-+    spendUsd: 0
-   never-test-linting-prune:
-     kind: test-only
-     status: merged
-@@ -343,12 +338,11 @@ items:
-     mergedAt: 2026-11-08T12:55:17-05:00
-   final-gate-validation:
-     kind: fact-finder
--    status: running
-+    status: blocked
-     branch: topic/modernize--final-gate-validation
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.052455
--    currentStep: research
-+    spendUsd: 0
-   semantic-tests-rewrite:
-     kind: test-only
-     status: blocked
-@@ -358,12 +352,11 @@ items:
-     spendUsd: 0
-   test-debloat-audit:
-     kind: fact-finder
--    status: running
-+    status: pending
-     branch: topic/modernize--test-debloat-audit
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.179749
--    currentStep: research
-+    spendUsd: 0
-   docs-reconciliation:
-     kind: no-behavior
-     status: blocked
-@@ -413,22 +406,21 @@ items:
-     spendUsd: 0
-   consolidate-integration-helpers-v3:
-     kind: test-only
--    status: running
-+    status: ready
-     branch: topic/modernize--consolidate-integration-helpers-v3
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.259824
--    currentStep: integrate
-+    spendUsd: 0.19283999999999998
-+    currentStep: review
-   docs-counts-sync:
-     kind: dev
--    status: running
-+    status: pending
-     branch: topic/modernize--docs-counts-sync
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.033694
--    currentStep: test-first
-+    spendUsd: 0
- concerns:
--  open: 34
-+  open: 0
-   dismissed: 0
-   routed: 1
-   resolved: 2
-@@ -690,14 +682,14 @@ debt:
-     obscure"
-   - '[consolidate-integration-helpers-v3] make_consumer_project hardcodes
-     "consumer" dirname for hooks test'
--budgetSpentUsd: 12.835531685999996
-+budgetSpentUsd: 12.169640685999996
- spendByRole:
-   workhorse:
--    costUsd: 6.112707685999999
--    inputTokens: 12342006
--    outputTokens: 4463702
-+    costUsd: 5.446816686
-+    inputTokens: 10745022
-+    outputTokens: 3940170
-   alt-workhorse:
--    costUsd: 1.5378180000000008
-+    costUsd: 1.5378180000000001
-     inputTokens: 7319130
-     outputTokens: 2605987
-   architect:
-@@ -809,6 +801,10 @@ spendByItem:
-     costUsd: 0.13088
-     inputTokens: 218824
-     outputTokens: 95126
-+  consolidate-integration-helpers-v3:
-+    costUsd: 0.19283999999999998
-+    inputTokens: 341355
-+    outputTokens: 174695
-   stale-disables-portability-cleanup:
-     costUsd: 0.025615000000000002
-     inputTokens: 54537
-@@ -817,10 +813,10 @@ spendByItem:
-     costUsd: 0.09088800000000001
-     inputTokens: 274090
-     outputTokens: 70148
--  never-test-linting-prune:
--    costUsd: 0.055946
--    inputTokens: 148483
--    outputTokens: 85833
-+  decision-cache-impl:
-+    costUsd: 0.393308
-+    inputTokens: 802730
-+    outputTokens: 337356
-   runner-dispatch-split:
-     costUsd: 0.128832
-     inputTokens: 294444
-@@ -829,54 +825,10 @@ spendByItem:
-     costUsd: 0.041291
-     inputTokens: 95491
-     outputTokens: 43569
--  secrets-triage-spike:
--    costUsd: 0.19651400000000002
--    inputTokens: 713974
--    outputTokens: 167344
--  final-gate-validation:
--    costUsd: 0.052455
--    inputTokens: 95165
--    outputTokens: 54227
--  consolidate-integration-helpers-v3:
--    costUsd: 0.259824
--    inputTokens: 463214
--    outputTokens: 227545
--  epic-kickoff-gate:
--    costUsd: 0.057369
--    inputTokens: 121841
--    outputTokens: 49513
--  cache-design-spike:
--    costUsd: 0.105401
--    inputTokens: 176978
--    outputTokens: 87972
--  coding-rules-audit:
--    costUsd: 0.104406
--    inputTokens: 187879
--    outputTokens: 83867
--  epic-shift-report-collection:
--    costUsd: 0.040594
--    inputTokens: 88261
--    outputTokens: 36328
--  decision-cache-impl:
--    costUsd: 0.393308
--    inputTokens: 802730
--    outputTokens: 337356
-   consolidate-integration-helpers-v2:
-     costUsd: 0.258951
-     inputTokens: 549144
-     outputTokens: 175859
--  test-debloat-audit:
--    costUsd: 0.179749
--    inputTokens: 684503
--    outputTokens: 103456
--  docs-counts-sync:
--    costUsd: 0.033694
--    inputTokens: 70279
--    outputTokens: 32429
--  golden-regen-hatch:
--    costUsd: 0.025239
--    inputTokens: 50219
--    outputTokens: 22890
-   pylint-cache-assumptions:
-     costUsd: 0.23190968599999998
-     inputTokens: 455233
-@@ -889,4 +841,12 @@ spendByItem:
-     costUsd: 6.273198999999999
-     inputTokens: 24056719
-     outputTokens: 2199382
--lastUpdated: 2026-11-10T00:53:25.706Z
-+  never-test-linting-prune:
-+    costUsd: 0.055946
-+    inputTokens: 148483
-+    outputTokens: 85833
-+  secrets-triage-spike:
-+    costUsd: 0.19651400000000002
-+    inputTokens: 713974
-+    outputTokens: 167344
-+lastUpdated: 2026-11-09T22:54:21.229Z
-
-## Human involvement
-# Human involvement criteria
-
-Mode selects which ADR and concern decisions need a human decision. Everything
-else is either autonomous or digest-only; never block on items the table marks
-remarkable.
-
-## Blocking table (ADRs and concerns)
-
-| Mode | Blocking (needs human decision) | Remarkable (digest only) |
-| --- | --- | --- |
-| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
-| principal | stack/layer, external interfaces, config shapes | internal choices |
-| detailed | external-interface changes and major internal interfaces | minor internals |
-
-## autonomous
-
-Block only explicit high-severity ADRs/concerns that remain after all unblocked
-work is finished. Do not stop for internal choices; record them as remarkable.
-
-## Output
-
-Yield a structured JSON object matching this schema:
-- status (string, required, enum: ["approved","changes_requested"])
-- summary (string, required)
-- suggestions (array of object, required)
-  - id (string, required)
-  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async","dismiss"])
-  - summary (string, required)
-  - detail (string, optional)
-  - location (object, optional)
-    - file (string, required)
-    - line (integer, optional)
-- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
-  - chosen (string, required)
-  - why (string, required)
-  - alternatives (array of string, required)
-- newConcerns (array of object, optional): New concerns discovered during review
-  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
-  - summary (string, required)
-  - detail (string, optional)
-  - severity (string, optional, enum: ["low","medium","high"])
-  - location (object, optional)
-    - file (string, required)
-    - line (integer, optional)
-  - affects (array of string, optional)
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/meta.yaml b/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/meta.yaml
deleted file mode 100644
index 256653c..0000000
--- a/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/meta.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-seq: 2
-name: review
-attempt: 1
-fixRound: 1
-agent: reviewer
-role: alt-workhorse
-models:
-  - opencode-go/muse-spark-1.3-contributor
-  - opencode-go/deepseek-v4.1-flash
-timeoutSec: 3600
-status: ok
-startedAt: 2026-11-10T01:14:39.019Z
-session: 01a1c305-7da8-7280-a9ac-0ada4ed755d8
-endedAt: 2026-11-10T01:22:03.394Z
-usage:
-  inputTokens: 62055
-  outputTokens: 28124
-  costUsd: 0.012651
-traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T01-14-39-400Z_01a1c305-7da8-7280-a9ac-0ada4ed755d8.jsonl
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/output.yaml b/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/output.yaml
deleted file mode 100644
index 9551cf6..0000000
--- a/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1/output.yaml
+++ /dev/null
@@ -1,81 +0,0 @@
-status: approved
-summary: "Audit verified: 42 rows, 194-file disjoint map, SKIPPED honored,
-  read-only kept; 8 concerns optional, 1 minor cross-ref polish"
-suggestions:
-  - detail: Verified src-unused, only tests/runner/test_baseline_diff.py imports
-      _compare_sorted; duplicates baseline._compare_violation_lists; delete
-      needs test-debloat coordination; route to runner/test-debloat impl.
-    disposition: optional
-    id: c-06946fc950
-    location:
-      file: src/python_setup_lint/runner/_baseline_helpers.py
-      line: 1
-    summary: Dead _baseline_helpers pinned only by tests
-  - detail: baseline.py shim returns frozenset plus stub/package/allowlist chain
-      verified; dispatch 449 lines with no C0302 so split complete; route to
-      runner cleanup.
-    disposition: optional
-    id: c-3ae71408be
-    location:
-      file: src/python_setup_lint/runner/baseline.py
-      line: 20
-    summary: peek_fallback_tools shim names completed owner
-  - detail: AGENTS cross-encoder/reranker plus semantic-justification.md vs
-      _decision_backend present and _decision_cache absent verified;
-      root+semantic docs update after cache lands; do not claim git cache early.
-    disposition: optional
-    id: c-8e15ccd01e
-    location:
-      file: docs/semantic-justification.md
-      line: 3
-    summary: Semantic docs describe removed cross-encoder, cache absent
-  - detail: 127 cross-module private imports block pure deletion; PYI-1..3 gross
-      -165 LoC is prioritization not budget; methodology note, no audit rework.
-    disposition: optional
-    id: c-dfa834a16b
-    location:
-      file: src/python_setup_lint/checkers/_base.pyi
-      line: 18
-    summary: LoC deltas gross; renames offset stub deletion
-  - detail: Uses node.file while pylint maps .pyi to .py; zero W9707 on
-      extra_tools.pyi despite 19 privates verified; fix PYI-4 enforcement plus
-      real-.pyi regression test before bulk stub cleanup.
-    disposition: optional
-    id: c-ff4279a5ad
-    location:
-      file: src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py
-      line: 40
-    summary: W9707 blind; 203 private stubs unguarded
-  - detail: Parent-tip never-test-linting prune wins over item-side import retarget;
-      drops pytest -m slow noise/self-lint guards; test-consolidation scope, not
-      coding-rules-audit rework.
-    disposition: optional
-    id: c-3e5007b429
-    location:
-      file: tests/runner/test_pyright_noise_filter.py
-      line: 1
-    summary: Accepted deletion of two slow self-lint guard tests
-  - detail: Helper consolidation superset already on parent via i2/golden-hardening;
-      T4 moves and integration rewiring redundant in merged tree;
-      integration-helpers merge record, not audit scope.
-    disposition: optional
-    id: c-698cedaf11
-    location:
-      file: tests/_project_helpers.py
-      line: 1
-    summary: Merge byte-identical to parent tip, no item deltas
-  - detail: Docstring names pruned self-lint guards; AGENTS 1290/4/15 and 7-pass vs
-      measured 1357/0/7 and 9-collected; overlaps audit DOC-1; root docs update
-      after final merge.
-    disposition: optional
-    id: c-b8537d4f8c
-    location:
-      file: tests/_project_helpers.py
-      line: 4
-    summary: Stale helpers docstring plus AGENTS counts
-  - detail: PYI-1 fix says '(see IMP-1)' but no IMP-1 row exists; 127-import data
-      lives in handoff notes section 12; retarget ref to section 12 or add IMP-1
-      row if fix round occurs; no information loss.
-    disposition: optional
-    id: pyi1-dangling-imp1-ref
-    summary: PYI-1 cites missing IMP-1 row
diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/merge-attempts.yaml b/.factory/tasks/modernize/items/epic-shift-report-collection/merge-attempts.yaml
deleted file mode 100644
index d33f6c6..0000000
--- a/.factory/tasks/modernize/items/epic-shift-report-collection/merge-attempts.yaml
+++ /dev/null
@@ -1,2 +0,0 @@
-attempts:
-  "3": 1
diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/output.yaml
deleted file mode 100644
index 0990071..0000000
--- a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/output.yaml
+++ /dev/null
@@ -1,363 +0,0 @@
-status: inconclusive
-summary: Verified 0 of 3 required epic close-up reports exist
-  (epic-runner-modernize, epic-checkers-modernize,
-  epic-semantic-infrastructure). Iteration 3's M2 epics were never spawned ('M2
-  epic work (runner/checkers/semantic) entirely outstanding', M2 zero delivery);
-  iterations 4-5 abandoned epic decomposition (ADR-013, ADR-023), and the I5
-  plan explicitly declares no child epics and no replanAfter gates. The legacy
-  item was resumed as a stranded iteration-3 record, but its precondition never
-  held. Per the assignment and ADR-011, the handoff record is not producible and
-  the item must stay pending/blocked; no epic sections are fabricated. The I5
-  replacement path is item-level shift declarations consumed by
-  golden-regen-hatch-v2.
-findings: >
-  # Epic shift-report fan-in — fail-open verification
-
-
-  ## Verdict
-
-
-  **0 of 3 required epic close-up reports exist. The handoff record is NOT
-  producible.**
-
-
-  Per the assignment (`epic-shift-report-collection/assignment.yaml:10-12`) and
-  ADR-011 (`docs/adr/ADR-011.md:64-69`), the item must stay pending/blocked when
-  any close-up is missing, and must never fabricate sections. The legacy item
-  was resumed into iteration 5 as a stranded iteration-3 artifact, but the three
-  epics it depends on were never spawned and iteration 5 explicitly ships no
-  epics and no replanAfter gates.
-
-
-  ```
-
-  handoff.required_sections              = 3
-
-  handoff.sections_produced              = 0
-
-  handoff.sections_with_shift_report     = 0
-
-  handoff.sections_with_no_shift_decl    = 0
-
-  handoff.verification                   = FAIL (0 != 3)
-
-  fail_open                              = true
-
-  ```
-
-
-  ## 1. Contract requirements
-
-
-  - `docs/adr/ADR-011.md:62-69` — each epic emits a shift-report section or
-  explicit no-shift declaration in its close-up report; M2 `replanAfter: true`
-  schedules no M3 item until the replan after the M2 epic close-ups;
-  `epic-shift-report-collection` stays pending unless all three close-ups exist
-  and consolidates the handoff record consumed by `golden-regen-hatch`.
-
-  - `.factory/tasks/modernize/plan/plan-3.yaml:92` — M2 carries `replanAfter:
-  true`.
-
-  - `.factory/tasks/modernize/plan/plan-3.yaml:261-277` — item outline: exactly
-  3 epic sections; fail-open (never fabricates).
-
-  - The three epics named by plan-3: `epic-runner-modernize`
-  (`plan-3.yaml:444`), `epic-checkers-modernize` (`plan-3.yaml:530`),
-  `epic-semantic-infrastructure` (`plan-3.yaml:637`).
-
-  - Required per-epic shift payload: `{justification-class description,
-  added/removed finding keys, CHANGELOG snippet, evidence file:line}` —
-  `plan-3.yaml:419-422` (runner), `:504-507` (checkers), `:567-570` (semantic).
-
-
-  ## 2. Existence matrix
-
-
-  | # | Required epic | Expected source | Found | Extractable shift fields |
-
-  |---|---|---|---|---|
-
-  | 1 | epic-runner-modernize | epic close-up report with shift section |
-  **MISSING** | none |
-
-  | 2 | epic-checkers-modernize | epic close-up report with shift section |
-  **MISSING** | none |
-
-  | 3 | epic-semantic-infrastructure | epic close-up report with shift section |
-  **MISSING** | none |
-
-
-  Evidence of absence:
-
-
-  - Only two `epic-*` item directories exist under
-  `.factory/tasks/modernize/items/`: `epic-kickoff-gate` and
-  `epic-shift-report-collection`. No `epic-runner-modernize`,
-  `epic-checkers-modernize`, or `epic-semantic-infrastructure` directory exists.
-
-  - No run output declares an epic item (`grep -rl '^item: epic-'
-  .factory/tasks/modernize/runs/*/output.yaml` returns nothing). Close-up run
-  names are only `wave-close-up-*`, `plan-close-up-*`, and
-  `architect-closeup-*`.
-
-  - No file under `.factory/tasks/modernize/items/*/steps/*/output.yaml` or
-  `findings.md` contains a shift-report block with `justification-class` /
-  `added/removed` / `finding keys`; the only hits are unrelated test assertions
-  (e.g.
-  `items/golden-snapshot-wiring/steps/001-test-first-r1-a1/output.yaml:17`).
-
-  - Iteration-3 close-up is explicit:
-  `runs/086-plan-close-up-3-a1/output.yaml:53-54` — "M2 epic work
-  (runner/checkers/semantic) entirely outstanding; M3 golden/docs/gate close-out
-  blocked on it"; `runs/087-architect-closeup-3-a1/output.yaml:38-39` repeats
-  it; `closeup-3.yaml:7-8` records "M2 ZERO DELIVERY". Iteration 1 also recorded
-  the semantic epic as unstarted (`closeup-1.yaml:8`).
-
-  - Iteration 4 abandoned epics: `docs/adr/ADR-013.md:1-3` ("I3 planned 3 epics
-  ... kickoff pending, M2 zero delivery ... abandoned epics for root items").
-
-  - Iteration 5 ships no epics: `docs/adr/ADR-023.md:1-3`;
-  `plan-5.3.yaml:1013-1017` — "No child epics in I5; all work as 18 root items";
-  `plan-5.3.yaml:1271-1284` — "I5 ships no child epics ... No replanAfter gates
-  ... no epic close-up/handoff bottleneck; M5 hatch consumes item shift
-  declarations directly".
-
-  - The current plan's 28 item outlines contain no `epic-*` slug; the current
-  hatch replacement depends only on behavior items (`plan-5.3.yaml:882-898`).
-
-  - Plan-level M2 close-ups are not epic close-ups: `closeup-4.yaml:3-6` records
-  M1/M2 verified via root items after epic abandonment.
-
-
-  ## 3. Handoff verification
-
-
-  - Required: exactly 3 epic sections, each either a shift report or an explicit
-  no-shift declaration (`assignment.yaml:10-13`; `plan-3.yaml:269-273`).
-
-  - Produced: **0 sections**. Verification fails (0 != 3).
-
-  - No justification-class description, added/removed finding keys, CHANGELOG
-  snippet, or evidence `file:line` could be extracted from any epic close-up.
-  Authoring them at root would violate "never fabricates" (`assignment.yaml:11`)
-  and ADR-011 (`docs/adr/ADR-011.md:67-68`).
-
-  - `CHANGELOG.md:1-18` contains no epic shift/regen entry; there is no epic
-  close-up from which to quote one.
-
-  - Tracked repository contains only the contract references, not a handoff
-  record: `grep -rn -i 'shift report|no-shift'` over the repo (excluding
-  `.factory`/`.git`) hits only `docs/adr/ADR-011.md:16,64-69`.
-
-
-  ## 4. Why the item is running despite the gate
-
-
-  - The item is a stranded iteration-3 artifact: `state.yaml:257-263` records
-  `status: blocked`, `attempts: 1`, `fixRounds: 1`; it was re-queued as a
-  stranded item
-  (`items/secrets-triage-spike/steps/004-review-r1-a1/input.md:6665`).
-
-  - Its stated M2 `replanAfter` gate exists only in plan-3 (`plan-3.yaml:92`);
-  iteration 5 declares the opposite: "No replanAfter gates"
-  (`plan-5.3.yaml:1277`). The item was therefore not unlocked by the gate — its
-  precondition was already unsatisfiable.
-
-  - Milestone metadata is stale: the item says `milestone: M3`
-  (`assignment.yaml:16`), which is plan-3's M3; iteration 5's M3 is "Git-stored
-  decision cache with cleanup" (`plan-5.3.yaml:115-116`).
-
-  - The dependency `epic-kickoff-gate` is itself blocked (`state.yaml:166-172`)
-  and carries open blocker `concerns/c-81b8a319de.yaml:1-18` (abandoned
-  validated-map dependency; this item is listed as affected at `:16`).
-
-  - Step metadata marks this as fix round 1, but `Review Feedback` is empty and
-  no prior `findings.md` exists in item history (commit `1449ca8^` has no such
-  file), so there is no earlier shift-report evidence to resume from.
-
-
-  ## 5. Downstream impact
-
-
-  - Legacy `golden-regen-hatch` depends on this item
-  (`items/golden-regen-hatch/assignment.yaml:18-20`) and is blocked
-  (`state.yaml:316-322`). It must not run: there is no reviewed shift report in
-  a handoff record. A 0-section handoff is **not** "all three sections declare
-  no-shift"; the no-op attestation path requires three explicit declarations
-  (`items/golden-regen-hatch/assignment.yaml:4-12`; `plan-3.yaml:271-273`).
-
-  - The iteration-5 replacement `golden-regen-hatch-v2` consumes behavior-item
-  shift declarations directly and does not depend on this item
-  (`plan-5.3.yaml:882-898`; `plan-5.3.yaml:1282-1283`).
-
-  - Existing item-level shift evidence is real but is **not** a substitute for
-  the three epic close-ups:
-    - `items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml:92-96` — 3 added W9704 findings (unjustified suppression at `tests/data/minimal_sample_project/src/minimal_sample/mod.py:42` for pylint, pylint-pyi, pylint tests), shift reported, golden not regenerated.
-    - `items/runner-dispatch-split/steps/001-develop-r1-a1/output.yaml:46-48` — golden hash-equal, no shift.
-    - `items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml:27-29` — golden byte-identical, no shift.
-
-  ## 6. Verification method (falsification attempts)
-
-
-  - `find .factory/tasks/modernize/items -maxdepth 1 -type d -name 'epic-*'` →
-  only `epic-kickoff-gate`, `epic-shift-report-collection`.
-
-  - `grep -rl '^item: epic-' .factory/tasks/modernize/runs/*/output.yaml` → no
-  matches.
-
-  - `grep -rn -i 'justification-class|added/removed|finding keys'` across all
-  item step outputs/findings → no shift-report sections.
-
-  - `grep -rn -i 'shift'` across wave/plan/architect close-up outputs → no
-  matches.
-
-  - Parsed `plan-5.yaml`, `plan-5.1.yaml`, `plan-5.2.yaml`, `plan-5.3.yaml` item
-  outlines → zero `epic-*` slugs in every iteration-5 plan revision.
-
-  - Read ADR-011, ADR-013, ADR-023 and iterations 1/3/4 close-ups to confirm the
-  epics never spawned and were explicitly abandoned.
-
-
-  ## 7. Open concerns reviewed
-
-
-  - `c-3e935debcb` (POSIX-only `fcntl.flock` PoC lock) and `c-5463b26c4b`
-  (constant rule symbol collapsing the cache rule component) target
-  `cache-design-spike` / `decision-cache-impl`; they do not affect this fan-in
-  and do not change the verdict.
-contextPack: >-
-  Goal: consolidate 3 epic shift reports into one handoff for
-  golden-regen-hatch.
-
-  Result: 0/3 close-ups exist -> handoff NOT produced; fail-open triggered; item
-  must stay blocked/pending.
-
-  Required artifacts: epic-runner-modernize, epic-checkers-modernize,
-  epic-semantic-infrastructure close-ups, each with {justification-class,
-  added/removed finding keys, CHANGELOG snippet, file:line} or explicit
-  no-shift.
-
-  Key evidence: ADR-011:62-69 (contract); plan-3:92 (M2 replanAfter gate),
-  plan-3:444/530/637 (epic slugs); closeup-3.yaml:7-8 (M2 zero delivery);
-  086-plan-close-up-3-a1/output.yaml:53-54 +
-  087-architect-closeup-3-a1/output.yaml:38-39 (epics entirely outstanding);
-  ADR-013:1-3 + ADR-023:1-3 + plan-5.3:1013-1017,1271-1284 (epics abandoned; no
-  replanAfter gates; hatch consumes item declarations); state.yaml:257-263 (item
-  blocked), :316-322 (legacy hatch blocked).
-
-  Do not consume this findings file as a handoff record. Current replacement:
-  plan-5.3 golden-regen-hatch-v2 deps on behavior items (plan-5.3:882-898).
-sources:
-  - docs/adr/ADR-011.md:5,16,62-69
-  - docs/adr/ADR-013.md:1-3
-  - docs/adr/ADR-023.md:1-3
-  - docs/adr/README.md:30
-  - .factory/tasks/modernize/plan/plan-3.yaml:92,109,261-277,419-422,444,504-507,530,567-570,637
-  - .factory/tasks/modernize/plan/plan-5.3.yaml:1013-1017,1262-1284,882-898,115-116
-  - .factory/tasks/modernize/closeup-1.yaml:8
-  - .factory/tasks/modernize/closeup-3.yaml:1-18
-  - .factory/tasks/modernize/closeup-4.yaml:1-19
-  - .factory/tasks/modernize/runs/086-plan-close-up-3-a1/output.yaml:53-54
-  - .factory/tasks/modernize/runs/087-architect-closeup-3-a1/output.yaml:38-39
-  - .factory/tasks/modernize/items/epic-shift-report-collection/assignment.yaml:1-25
-  - .factory/tasks/modernize/items/golden-regen-hatch/assignment.yaml:17-23
-  - .factory/tasks/modernize/state.yaml:166-172,257-263,316-322
-  - .factory/tasks/modernize/concerns/c-81b8a319de.yaml:1-18
-  - .factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml:92-96
-  - .factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/output.yaml:46-48
-  - .factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml:27-29
-  - CHANGELOG.md:1-18
-recommendations:
-  - "Keep epic-shift-report-collection blocked/pending and do not produce a
-    handoff record: 0/3 epic close-ups exist, so any 3-section handoff would be
-    fabricated."
-  - "Do not execute legacy golden-regen-hatch. Route golden handling through the
-    iteration-5 path: golden-regen-hatch-v2 consumes behavior-item shift
-    declarations directly (plan-5.3:882-898) and does not depend on this item."
-  - In the next replan, retire or supersede the stranded
-    epic-shift-report-collection and legacy golden-regen-hatch items under
-    ADR-023/ADR-013; otherwise they remain a permanent blocked bottleneck (the
-    exact failure ADR-013 removed).
-  - Update ADR-011 status/README to mark the epic decomposition and
-    shift-handoff section superseded by ADR-013/ADR-023, so future runs do not
-    re-queue the unsatisfiable item (docs/adr/ADR-011.md:5;
-    docs/adr/README.md:30).
-  - If the 3-epic handoff is still required, re-plan and spawn the
-    runner/checkers/semantic epics and have each emit its close-up; do not
-    reconstruct epic sections from I4/I5 root-item reports.
-concerns:
-  - kind: blocker
-    summary: "Legacy epic handoff item is unsatisfiable in I5: 0/3 epic close-ups
-      exist and the M2 replanAfter gate is absent"
-    detail: "The three iteration-3 epics were never spawned (closeup-3: M2 zero
-      delivery; 086/087 close-ups: 'M2 epic work ... entirely outstanding'), and
-      iterations 4-5 abandoned epic decomposition (ADR-013:1-3; ADR-023:1-3;
-      plan-5.3:1013-1017). The item was resumed as a stranded record with state
-      'blocked' (state.yaml:257-263) even though plan-5.3 declares 'No
-      replanAfter gates' (:1277). Retries cannot produce the required artifacts;
-      only a replan can retire or re-scope it."
-    severity: high
-    location:
-      file: .factory/tasks/modernize/items/epic-shift-report-collection/assignment.yaml
-      line: 4
-    affects:
-      - epic-shift-report-collection
-      - golden-regen-hatch
-      - final-gate-validation
-  - kind: risk
-    summary: Legacy golden-regen-hatch could misread a missing handoff as all-no-shift
-    detail: The legacy hatch is allowed a no-op only 'If all three handoff sections
-      declare no-shift' (items/golden-regen-hatch/assignment.yaml:4-12). With
-      zero sections neither shift nor no-shift is established. Running it on
-      this findings file as a handoff would violate the reviewed-shift
-      precondition; the I5 plan replaces it with golden-regen-hatch-v2 consuming
-      behavior-item declarations (plan-5.3:882-898).
-    severity: medium
-    location:
-      file: .factory/tasks/modernize/items/golden-regen-hatch/assignment.yaml
-      line: 4
-    affects:
-      - golden-regen-hatch
-      - golden-regen-hatch-v2
-      - final-gate-validation
-  - kind: tech-debt
-    summary: ADR-011 shift-handoff contract remains 'Accepted' after epic
-      decomposition was abandoned
-    detail: ADR-011 status is still 'Accepted' (docs/adr/ADR-011.md:5) and the ADR
-      index lists it as Accepted (docs/adr/README.md:30), while ADR-013:1-3 and
-      ADR-023:1-3 supersede epic decomposition and state there is no epic
-      close-up/handoff bottleneck. The stale accepted contract is why this
-      stranded item keeps being re-queued.
-    severity: medium
-    location:
-      file: docs/adr/ADR-011.md
-      line: 5
-    affects:
-      - epic-shift-report-collection
-      - docs-adr-reconciliation
-      - docs-adr-reconciliation-v2
-remarkable:
-  - chosen: "Honor fail-open: report 0/3 close-ups and keep the item blocked/pending
-      rather than synthesizing a handoff"
-    why: ADR-011:64-69 and assignment.yaml:10-12 require all three epic close-ups
-      and forbid fabrication. Item-level shift declarations exist but are
-      single-owner item reports, not epic close-ups, so relabeling them would
-      poison the golden-regen-hatch precondition.
-    alternatives:
-      - Reconstruct three pseudo-close-ups from I4/I5 item-level shift
-        declarations
-      - Treat plan-level closeup-3/closeup-4 as the three epic close-ups
-      - Emit three root-authored no-shift declarations in place of missing epic
-        close-ups
-  - chosen: Recommend the iteration-5 ADR-023 item-level path
-      (golden-regen-hatch-v2) rather than reviving epics to satisfy the legacy
-      contract
-    why: The I5 plan explicitly ships no child epics and the v2 hatch depends only
-      on behavior items (plan-5.3:1013-1017, 1271-1284, 882-898). Reviving epics
-      would reintroduce the empty-wave/bottleneck failure ADR-013 and ADR-023
-      removed.
-    alternatives:
-      - Reintroduce runner/checkers/semantic epics in I6 solely to produce
-        close-ups
-      - Keep the legacy item pending indefinitely and let it block legacy
-        golden-regen-hatch
diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/output.yaml b/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/output.yaml
deleted file mode 100644
index 72cfa86..0000000
--- a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/output.yaml
+++ /dev/null
@@ -1,3 +0,0 @@
-status: approved
-summary: Fail-open 0/3 verified; no fabrication; zero repo writes
-suggestions: []
diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md
similarity index 68%
rename from .factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/input.md
rename to .factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md
index d788b12..6979bc8 100644
--- a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/input.md
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md
@@ -13,23 +13,26 @@ Conduct technical spike research to eliminate architecture unknowns, investigate
 
 ## Assignment
 {
-  "slug": "epic-shift-report-collection",
+  "slug": "final-gate-validation",
   "kind": "fact-finder",
-  "title": "Consolidate epic shift reports into handoff record",
-  "assignment": "Root-owned fan-in (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). M2 replanAfter:true is enforceable gate: engine schedules only in post-replan wave after M2 epic close-ups exist. Read three epic close-up reports; extract each epic's shift-report section (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; consolidate into one handoff record with exactly 3 epic sections. If any close-up missing, stay pending (fails open, never fabricates). Output feeds golden-regen-hatch exclusively. Verify handoff has exactly 3 sections, each either shift report or explicit no-shift declaration. Covers ADR-011 shift-handoff contract and M2->M3 gate.",
-  "outlineRef": "epic-shift-report-collection",
+  "title": "Final gate table and docs reconciliation check",
+  "assignment": "Root-owned final validation (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). Record final gate table: format exit 0; lint per-tool results on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); pytest -q green (pass/skip/deselect counts); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without via ensure_precommit_or_skip); golden byte-identical or regen-with-reviewed-diff per hatch report; lint.baseline []; docs reconciliation with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts to 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits. Covers M3 close-out, TD3-A1/TD3-I2.",
+  "outlineRef": "final-gate-validation",
   "milestone": "M3",
-  "wave": 3,
+  "wave": 5,
   "deps": [
-    "epic-kickoff-gate"
+    "golden-regen-hatch"
   ],
   "scenarioRefs": [
-    "M3: Golden integrity preserved"
+    "M3: Iteration closes with evidence"
   ],
   "citations": [
-    "lint.baseline:1-1",
+    "docs/semantic-justification.md:5-14",
+    "docs/semantic-justification.md:34-45",
+    "AGENTS.md:79-85",
     "AGENTS.md:87-93",
-    "CodingRules.md:90-107"
+    "lint.baseline:1-1",
+    ".gitignore:243-244"
   ]
 }
 
@@ -48,9 +51,12 @@ Modernize the project while preserving every material lint/check behavior.
 
 ## Context & Citations
 [
-  "lint.baseline:1-1",
+  "docs/semantic-justification.md:5-14",
+  "docs/semantic-justification.md:34-45",
+  "AGENTS.md:79-85",
   "AGENTS.md:87-93",
-  "CodingRules.md:90-107"
+  "lint.baseline:1-1",
+  ".gitignore:243-244"
 ]
 
 ## Review Feedback
diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml
similarity index 50%
rename from .factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/meta.yaml
rename to .factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml
index b57c12b..d7411b4 100644
--- a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/meta.yaml
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml
@@ -9,11 +9,11 @@ models:
   - opencode-go/muse-spark-1.3-contributor
 timeoutSec: 3600
 status: ok
-startedAt: 2026-11-10T00:09:19.348Z
-session: 01a1c2c9-b140-700c-9319-d3dbbbaad9b1
-endedAt: 2026-11-10T00:14:51.676Z
+startedAt: 2026-11-10T00:15:13.726Z
+session: 01a1c2cf-17ec-7158-a980-3643bf095788
+endedAt: 2026-11-10T00:27:58.604Z
 usage:
-  inputTokens: 88261
-  outputTokens: 36328
-  costUsd: 0.040594
-traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl
+  inputTokens: 95165
+  outputTokens: 54227
+  costUsd: 0.052455
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-15-14-412Z_01a1c2cf-17ec-7158-a980-3643bf095788
diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..4c125be
--- /dev/null
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,355 @@
+status: ok
+summary: "Final gate table recorded at HEAD
+  ba7c2677a1f20e6dcafeba0198da2120c2b677b1 (clean tree, zero repo writes). All
+  runtime gates are GREEN: ruff format --check exit 0 (191 files), 14/14 lint
+  tools PASSED (exit 0, ~60s), detect-secrets PASSED at HEAD with the
+  MemoryError mechanism pinned to the runner's 2048 MB RLIMIT_AS plus 1.72 GiB
+  of tracked .factory safetensors, pytest 1357 passed/7 deselected/0 skipped,
+  integration 9 collected -> 9 passed (with pre-commit) and 7 passed + 2 skipped
+  (without, via ensure_precommit_or_skip), golden byte-identical (158 findings,
+  0 W9704), lint.baseline []. Docs reconciliation is RED on every must-contain
+  check (semantic-justification.md, custom-checks.md, troubleshooting.md,
+  AGENTS.md pipeline, CHANGELOG [semantic]/no-go/version, README pin, ADR
+  index/staleness), and the golden-regen-hatch report is absent. Red cells are
+  routed per ADR-011: runner-owned AGENTS Quick Commands/Tool Scope,
+  semantic-owned AGENTS pipeline subsection, root-owned repo-root
+  docs/CHANGELOG/README/ADRs; no baseline edits."
+findings: |-
+  # Final gate table — HEAD ba7c2677a1f20e6dcafeba0198da2120c2b677b1 (`topic/modernize--final-gate-validation`)
+
+  Probes were read-only. `git status --porcelain` was empty before and after every probe; `.secrets.baseline` sha256 was unchanged after `uv run lint`; `lint.baseline` remains `[]` (`lint.baseline:1`).
+
+  ## Runtime gates (all GREEN)
+
+  | Gate | Result | Evidence |
+  |---|---|---|
+  | Format | **GREEN, exit 0** | `uv run ruff format --check --config config/ruff.toml src/ tests/` -> `191 files already formatted`, exit 0. Lint section `[ruff format] PASSED [0.0s]`. Check-only is enforced by `_RuffFormatLintTool.build_command` (`src/python_setup_lint/runner/dispatch.py:312-338`); scope is `src/`, `tests/` (`src/python_setup_lint/runner/_tool_specs.py:12-18`). |
+  | Lint per-tool | **GREEN, 14/14 PASSED, exit 0** | `uv run lint`: tach 0.3s, ruff format 0.0s, ruff check 0.1s, rumdl 0.1s, mypy 5.4s, yamllint 0.2s, ty 0.2s, mypy.stubtest 7.5s, pyright check 4.3s, pyright verify types 1.0s, pylint 10.7s, pylint-pyi 9.5s, pylint tests 14.4s, detect-secrets 6.0s. `LINT_EXIT=0`; tree clean afterwards. |
+  | detect-secrets MemoryError | **GREEN at HEAD, mechanism pinned** | See below. |
+  | pytest -q | **GREEN** | `1357 passed, 7 deselected, 4 warnings in 32.69s`, exit 0. **0 skipped.** Deselection: `addopts = "-m 'not slow'"` (`pyproject.toml:47-48`). |
+  | Integration with pre-commit pinned | **GREEN** | 9 collected, **9 passed** in 69.64s, exit 0. pre-commit 4.6.0 is a dev dependency (`pyproject.toml:67`). |
+  | Integration without pre-commit | **GREEN/expected** | 9 collected, **7 passed, 2 skipped** in 56.76s, exit 0. Skips are `test_dry_run_hooks` and `test_pre_commit_dry_run`, both guarded by `ensure_precommit_or_skip` (`tests/_project_helpers.py:185-191`; call sites `tests/integration.py:205,257`). Reproduced by uninstalling pre-commit from `.venv` plus `uv run --no-sync pytest tests/integration.py -v`; pre-commit 4.6.0 restored with `uv sync`. |
+  | Golden | **GREEN byte-identical; no regen; hatch report absent** | See below. |
+  | lint.baseline | **GREEN** | File is exactly `[]` (`lint.baseline:1`); never edited. |
+
+  ## detect-secrets MemoryError — mechanism, HEAD, and reproduction
+
+  - **Command path:** `_DetectSecretsLintTool.build_command` returns `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline && python3 -c "...json.dump..."` (`src/python_setup_lint/runner/dispatch.py:181-188`). `_path`/`_exclude` are explicitly ignored (`dispatch.py:179`), so detect-secrets necessarily scans **all** tracked files; lint scoping cannot reduce its inputs.
+  - **Per-tool memory cap:** default `memory_limit_mb=2048` (`src/python_setup_lint/runner/types.py:22`; `src/python_setup_lint/runner/output.py:159`) is applied as `resource.setrlimit(RLIMIT_AS, 2048 MB)` in the subprocess preexec (`output.py:173-174`).
+  - **Tracked corpus at HEAD:** 1,500 tracked files, 1,234 under `.factory/`; 9 tracked `.safetensors` total **1,844,653,898 bytes (1.72 GiB)**; largest single file **789,581,344 bytes** (`.factory/tasks/modernize/items/model-eval-poc/poc/cache/models/glide/model-00001-of-00001.safetensors`).
+  - **Reproduction (read-only):** `bash -c 'ulimit -v 2000000; exec .venv/bin/detect-secrets-hook --baseline .secrets.baseline ./.factory/.../glide/model-00001-of-00001.safetensors'` -> traceback ending `File "detect_secrets/transformers/config.py", line 97, in _parse_file; content = file.read()` -> **MemoryError**, exit 1. The `./` path prefix bypasses the `^\.factory/` regex, proving the filter is a prefix match on the literal filename.
+  - **Actual HEAD command:** `git ls-files -z | xargs -0 .venv/bin/detect-secrets-hook --baseline .secrets.baseline` -> exit 0 in 8.0s; `uv run lint` -> `[detect-secrets] PASSED [6.0s]`.
+  - **Mitigation at HEAD:** `.secrets.baseline:42-45` contains `detect_secrets.filters.regex.should_exclude_file` with pattern `^\.factory/`, added by commit **882fac0** (`factory(secrets-baseline-exclusion): develop a1 [ok]`, 2026-11-08). `git merge-base --is-ancestor 882fac0 HEAD` exits 0, so the fix is present at ba7c267. No new baseline edit is needed.
+  - **Residual risk:** the 1.72 GiB model cache remains tracked; the exclusion is filename-prefix based, so a path alias that does not start with `.factory/` (e.g. `./.factory/...`) re-triggers MemoryError under the 2 GB cap. This is a scope/infra hazard, not a current lint failure.
+
+  ## Golden gate
+
+  - Golden: `tests/data/golden/minimal_sample_project_findings.json` = **158 findings**, **0 W9704**; sha256 `c2b8dc3a9ed42832e6906379d0e1a2f8e3823816b33145d786b08efb23799f96`. Counts file sha256 `1d239741f47669aa7d49ea786d57eea6435ebb8662cd3505fbafb8f33d048363`.
+  - `test_setup_new_and_lint` sets `SEMANTIC_ENV=0` (`tests/integration.py:112`), asserts multiset equality with the golden (`integration.py:115`) and asserts a fresh-copy replay serializes **byte-identically** (`integration.py:120-122`; helper `tests/_golden.py:392-410`). It passed in both integration runs. Regen is CI-refused (`tests/_golden.py:382`) and opt-in via `PYTHON_SETUP_LINT_UPDATE_GOLDEN` (`_golden.py:53`).
+  - Golden last changed by `1a811af` (2026-11-08 00:51), i.e. no drift since wiring. **No `golden-regen-hatch` branch, commit, or report exists at HEAD** (`git branch -a` and `git log --all --grep` show none; only `docs/adr/ADR-011.md:68` names the item). The byte-identity evidence is independent of that missing artifact.
+
+  ## Docs reconciliation matrix (all must-contain checks RED at HEAD)
+
+  | File | Required string(s) | Found | State / stale evidence |
+  |---|---|---|---|
+  | `docs/semantic-justification.md` | `DecisionBackend`, `.python-setup-decisions.json`, `ADR-009`, `prompt-v1` | 0 / 0 / 0 / 0 | **RED.** Still reranker-first (`:9-14`), env-gated `sentence-transformers` (`:18`), model/result cache under `~/.cache/python-setup/semantic/` (`:34-45`). |
+  | `docs/custom-checks.md` | `DecisionBackend` | 0 | **RED.** `check_if_meaningful` described as heuristic + semantic reranker, threshold 0.5, `PYTHON_SETUP_LINT_RERANKER_MODEL` (`:97`, `:104`). |
+  | `docs/troubleshooting.md` | `DECISION_MODEL`, `RERANKER` deprecated | 0 / 0 | **RED.** Stale `<h2>Sentence-transformer download failure -> heuristic fallback</h2>` section (`:97-112`) and stale integration count `<code># Expected: 7 pass, ~39s</code>` (`:150`). |
+  | `AGENTS.md` pipeline subsection | `DecisionBackend` | 0 | **RED.** `:79-85` contains 2x `cross-encoder reranker`; no DecisionBackend. |
+  | `AGENTS.md` counts | 9-collected contract + current unit counts | `9 collected` 0 | **RED.** `:10` says `1290 pass, 4 skip, 15 deselected, ~53s` (actual 1357 passed, 0 skipped, 7 deselected, ~33s); `:11` says `Integration tests (7 pass, ~30s)` (actual 9 collected/9 passed, ~57-70s). Testing Strategy `:87-93` is generic. |
+  | `AGENTS.md` Tool Scope | `ruff format` row | 0 | **RED.** Tool Scope table `:16-32` has 13 tool rows and no `ruff format` row; ADR-011:31-32 explicitly requires adding it. Expected scope `src/`, `tests/` per `_tool_specs.py:17`. |
+  | `CHANGELOG.md` | `[semantic]`, `no-go`, version `v1.2.10` | 0 / 0 / 0 | **RED.** Top entry is `## v1.2.9 (2026-07-05)` (`CHANGELOG.md:3`) while `pyproject.toml:3` is `version = "1.2.10"`. Only a historical reranker line at `CHANGELOG.md:113`. |
+  | `README.md` | pin `v1.2.10` | 0 | **RED.** Update-workflow pin is `...@v1.2.5` (`README.md:72`) and `:29` still advertises `python-setup[semantic]` as sentence-transformer scoring, but `[project.optional-dependencies].semantic = []` (`pyproject.toml:28-30`) and `uv.lock` has no torch/transformers/sentence-transformers edge. |
+  | `docs/adr/README.md` | ADR index through ADR-024 | `ADR-013` 0, `ADR-014` 0, `ADR-024` 0 | **RED.** Index table `:20-31` stops at ADR-012; ADR-013..016 and ADR-019..024 are omitted (ADR-017/018 intentionally never merged per ADR-019:3). |
+  | ADR staleness | status notes for stale records | — | **RED.** `ADR-009:31` claims iteration-3 delivered `Heuristic-first DecisionBackend plus tracked-cache infrastructure`; backend exists but the tracked cache does not. `ADR-010:26-36` freezes the `.python-setup-decisions.json` contract, unimplemented at HEAD. `ADR-014:1-3` claims current code is semantic-first with heuristic fallback; actual is heuristic-first veto (`src/python_setup_lint/checkers/_base.py:248-252`). `ADR-016:3` claims no DecisionBackend/cache/FakeBackend, `[semantic]` still sentence-transformers, tests reranker-coupled; all three are false at HEAD (`checkers/_decision_backend.py`, `pyproject.toml:28-30`, `tests/checkers/test_decision_backend.py`). `ADR-015:1-3`, `ADR-024:1-3` remain open deferrals. |
+
+  ## Tracked-cache / TD3 state
+
+  - `git grep "python-setup-decisions" -- ':!.factory'` finds only `docs/adr/ADR-010.md:26`. `_semantic.py:15-25,47-64` is an **in-process memo only** (SHA-256[:8] key, no disk). No `fcntl`/`flock` anywhere in `src/`; the only tracked TD3 reference is `ADR-010:11` (TD3-I1). TD3-A1/TD3-I2 are not defined in tracked repo files.
+  - `_semantic.py:48-58` includes `rule` in the cache key, but production call sites pass constants: `rule="unjustified-suppression"` (`checkers/conformance/suppression_justification_checker.py:152,372,383`) and `rule="bare-except-comment"` (`checkers/conformance/bare_except_comment_checker.py:103,116`). The rule component is therefore constant per checker (open concern c-5463b26c4b confirmed at HEAD). Key bytes are also truncated to 64 bits (`_semantic.py:59`).
+  - `ADR-009:31`'s tracked-cache deliverable is absent, so the M3 intent line "keep a git-stored cache with cleanup" is not evidenced at HEAD; `.gitignore:243-244` still names the retired `.cache/python-setup/semantic/` path (ADR-011:58-59 says leave it untouched until the tracked cache lands).
+
+  ## Red-cell routing (per ADR-011 single-writer map)
+
+  | Red cell | Owner | Route |
+  |---|---|---|
+  | `AGENTS.md` Quick Commands `:9-12` and Tool Scope `:16-32` (counts + `ruff format` row) | Runner epic (`ADR-011:31-32`) | Epic follow-up item for the runner-owned AGENTS rows; do not edit in the root item. |
+  | `AGENTS.md` `### Semantic justification pipeline` `:79-85` | Semantic epic (`ADR-011:33`) | Epic follow-up item; replace cross-encoder reranker text with DecisionBackend/heuristic-first veto. |
+  | `docs/semantic-justification.md`, `docs/custom-checks.md`, `docs/troubleshooting.md` semantic sections | Repo-root docs (root-owned, `ADR-011:54-58`) | New root item or this root item's develop step: rewrite with the four must-contain strings, `DECISION_MODEL`, and `RERANKER deprecated`; replace the `:150` 7-pass count with the 9-collected contract. |
+  | `CHANGELOG.md`, `README.md`, `docs/adr/**` | Root-owned repo-root files (`ADR-011:54-58`) | New root item or this root item's develop step: add v1.2.10 `[semantic]` + `no-go` entry; bump README pin to v1.2.10 and drop the stale `[semantic]` claim; index ADR-013..024 and add staleness notes to ADR-009/010/014/015/016. |
+  | `lint.baseline`, `.secrets.baseline` | — | **No edits.** `lint.baseline` stays `[]`; `.secrets.baseline` already contains the required `^\\.factory/` filter from 882fac0. Never route a red cell through a baseline edit. |
+
+  ## Reproduction commands
+
+  ```bash
+  uv run ruff format --check --config config/ruff.toml src/ tests/
+  uv run lint
+  uv run pytest -q
+  uv run pytest tests/integration.py -v
+  uv pip uninstall pre-commit && uv run --no-sync pytest tests/integration.py -v && uv sync
+  git ls-files -z | xargs -0 .venv/bin/detect-secrets-hook --baseline .secrets.baseline
+  bash -c 'ulimit -v 2000000; .venv/bin/detect-secrets-hook --baseline .secrets.baseline ./.factory/tasks/modernize/items/model-eval-poc/poc/cache/models/glide/model-00001-of-00001.safetensors'
+  ```
+
+  ## Verdict
+
+  Runtime/behavior gates: **all green**. Docs/ADR reconciliation: **all red** (10/10 must-contain groups), and the `golden-regen-hatch` report is absent (byte-identity independently proven). M3 close-out is blocked only on the docs red cells and the missing hatch attestation; no code/behavior regression was found at ba7c267.
+contextPack: >-
+  # Handoff: final-gate-validation (HEAD ba7c267, clean tree, zero writes)
+
+
+  ## Green runtime gate table
+
+  - format: `ruff format --check --config config/ruff.toml src/ tests/` -> 191
+  files, exit 0.
+
+  - lint: 14/14 PASSED, exit 0, ~60s (per-tool: tach .3, rfmt 0, rcheck .1,
+  rumdl .1, mypy 5.4, yamllint .2, ty .2, stubtest 7.5, pyright 4.3, pyright
+  verify 1.0, pylint 10.7, pylint-pyi 9.5, pylint tests 14.4, detect-secrets
+  6.0).
+
+  - pytest: 1357 passed, 7 deselected, 0 skipped, 32.69s, exit 0.
+
+  - integration with pre-commit 4.6.0: 9 collected, 9 passed, 69.64s.
+
+  - integration without pre-commit: 9 collected, 7 passed, 2 skipped, 56.76s
+  (ensure_precommit_or_skip).
+
+  - golden: 158 findings, 0 W9704, byte-identical replay, no regen; hatch report
+  missing.
+
+  - lint.baseline: `[]`.
+
+  - detect-secrets: PASSED; mechanism = runner RLIMIT_AS 2048 MB + 1.72 GiB
+  tracked `.factory` safetensors, excluded by `.secrets.baseline` regex
+  `^\\.factory/` (commit 882fac0, ancestor).
+
+
+  ## Exact must-change strings (all currently 0 occurrences)
+
+  - docs/semantic-justification.md: DecisionBackend,
+  .python-setup-decisions.json, ADR-009, prompt-v1.
+
+  - docs/custom-checks.md: DecisionBackend.
+
+  - docs/troubleshooting.md: DECISION_MODEL, RERANKER deprecated (and change:150
+  7-pass count).
+
+  - AGENTS.md pipeline subsection: DecisionBackend.
+
+  - AGENTS.md counts: 9-collected contract; unit row 1357 pass/7 deselected/0
+  skip.
+
+  - AGENTS.md Tool Scope: add `ruff format | src/, tests/` row.
+
+  - CHANGELOG.md: v1.2.10 entry with `[semantic]` and `no-go`.
+
+  - README.md: v1.2.10 pin (currently v1.2.5 at :72); remove stale `[semantic]`
+  sentence-transformer claim at :29.
+
+  - docs/adr/README.md: index ADR-013..016, 019..024; add staleness notes to
+  ADR-009:31, ADR-010, ADR-014, ADR-015, ADR-016.
+
+
+  ## Routing
+
+  - Runner epic owns AGENTS Quick Commands :9-12 + Tool Scope :16-32
+  (ADR-011:31-32).
+
+  - Semantic epic owns AGENTS pipeline subsection :79-85 (ADR-011:33).
+
+  - Root owns repo-root docs/CHANGELOG/README/ADRs (ADR-011:54-58).
+
+  - Do not edit lint.baseline or .secrets.baseline; do not add baseline entries.
+
+
+  ## Post-develop re-verify
+
+  Run the four gate commands plus the two integration variants; confirm `git
+  status --porcelain` empty and `.secrets.baseline`/`lint.baseline` unchanged.
+sources:
+  - AGENTS.md:9-12
+  - AGENTS.md:16-32
+  - AGENTS.md:79-85
+  - AGENTS.md:87-93
+  - docs/semantic-justification.md:5-14
+  - docs/semantic-justification.md:18
+  - docs/semantic-justification.md:34-45
+  - docs/custom-checks.md:97
+  - docs/custom-checks.md:104
+  - docs/troubleshooting.md:97-112
+  - docs/troubleshooting.md:150
+  - CHANGELOG.md:3
+  - CHANGELOG.md:113
+  - README.md:29
+  - README.md:72
+  - pyproject.toml:3
+  - pyproject.toml:28-30
+  - pyproject.toml:47-48
+  - pyproject.toml:67
+  - docs/adr/README.md:20-31
+  - docs/adr/ADR-009.md:31
+  - docs/adr/ADR-010.md:26-36
+  - docs/adr/ADR-011.md:31-33
+  - docs/adr/ADR-011.md:54-59
+  - docs/adr/ADR-011.md:68
+  - docs/adr/ADR-014.md:1-3
+  - docs/adr/ADR-015.md:1-3
+  - docs/adr/ADR-016.md:1-3
+  - docs/adr/ADR-024.md:1-3
+  - lint.baseline:1
+  - .gitignore:243-244
+  - .secrets.baseline:42-45
+  - src/python_setup_lint/runner/dispatch.py:168-198
+  - src/python_setup_lint/runner/dispatch.py:312-338
+  - src/python_setup_lint/runner/_tool_specs.py:12-18
+  - src/python_setup_lint/runner/_tool_specs.py:96-99
+  - src/python_setup_lint/runner/types.py:22
+  - src/python_setup_lint/runner/output.py:159-174
+  - src/python_setup_lint/checkers/_base.py:160-252
+  - src/python_setup_lint/checkers/_semantic.py:15-64
+  - src/python_setup_lint/checkers/_decision_backend.py:10-20,50-59
+  - src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152,372,383
+  - src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py:103,116
+  - tests/integration.py:60-122
+  - tests/integration.py:205,257
+  - tests/_project_helpers.py:185-191
+  - tests/_golden.py:53-54,382,392-410
+  - tests/data/golden/minimal_sample_project_findings.json
+  - tests/data/golden/minimal_sample_project_tool_counts.json
+  - commit 882fac0 (secrets-baseline-exclusion)
+  - HEAD ba7c2677a1f20e6dcafeba0198da2120c2b677b1
+recommendations:
+  - In the develop step for this root item, rewrite
+    docs/semantic-justification.md so it literally contains DecisionBackend,
+    .python-setup-decisions.json, ADR-009, and prompt-v1; describe the
+    heuristic-first veto + optional DecisionBackend (threshold 0.5), the ADR-009
+    no-go gate, and the ADR-010 tracked-cache contract as frozen/unimplemented
+    rather than delivered.
+  - Rewrite docs/troubleshooting.md's sentence-transformer section to document
+    PYTHON_SETUP_LINT_DECISION_MODEL (warn-only, no production backend) and
+    PYTHON_SETUP_LINT_RERANKER_MODEL deprecation; update docs/custom-checks.md's
+    check_if_meaningful text to DecisionBackend; change the integration
+    expectation at troubleshooting.md:150 to the 9-collected contract.
+  - Add a CHANGELOG v1.2.10 entry tagged [semantic] that records the
+    no-go/deferred model decision, and bump the README update-workflow pin from
+    v1.2.5 to v1.2.10 while dropping the stale python-setup[semantic]
+    sentence-transformer claim.
+  - Index ADR-013..016 and ADR-019..024 in docs/adr/README.md and add explicit
+    staleness notes to ADR-009:31 (tracked-cache half not delivered), ADR-014
+    (heuristic-first implemented), ADR-015/ADR-024 (open deferrals), and ADR-016
+    (all three HEAD claims false).
+  - "Route the AGENTS.md split by owner: runner epic for Quick Commands counts
+    (1357 pass/7 deselected/0 skip; 9 collected/9 passed, ~70s, 7+2 without
+    pre-commit) and the ruff format Tool Scope row; semantic epic for the
+    DecisionBackend pipeline subsection."
+  - "Do not touch lint.baseline or .secrets.baseline: lint.baseline must stay []
+    and the ^\\\\.factory/ secrets filter is already committed at 882fac0; if a
+    hatch attestation is required, record the byte-identical golden hash
+    c2b8dc3a9ed42832e6906379d0e1a2f8e3823816b33145d786b08efb23799f96 with an
+    explicit no-regen statement."
+concerns:
+  - kind: blocker
+    summary: Docs reconciliation is red on every must-contain group at HEAD ba7c267
+    detail: "All required strings are absent: semantic-justification.md
+      (DecisionBackend/.python-setup-decisions.json/ADR-009/prompt-v1),
+      custom-checks.md (DecisionBackend), troubleshooting.md
+      (DECISION_MODEL/RERANKER), AGENTS.md pipeline (DecisionBackend), CHANGELOG
+      ([semantic]/no-go/v1.2.10), README (v1.2.10), and the ADR index/staleness
+      notes. The docs still describe the retired reranker pipeline and ~/.cache
+      model download. Close-out cannot be green until these are routed and fixed
+      per ADR-011 ownership."
+    severity: high
+    location:
+      file: docs/semantic-justification.md
+      line: 9
+    affects:
+      - final-gate-validation
+      - docs-counts-sync
+  - kind: risk
+    summary: golden-regen-hatch report is absent from HEAD
+    detail: No branch, commit, or report for golden-regen-hatch exists (`git branch
+      -a`, `git log --all --grep`); only ADR-011:68 names the item. Golden
+      byte-identity is independently proven by test_setup_new_and_lint (multiset
+      + byte-identical replay), so no regen is needed, but the dependency
+      artifact required by the assignment is not present and must be supplied or
+      explicitly attested before close-out.
+    severity: medium
+    location:
+      file: docs/adr/ADR-011.md
+      line: 68
+    affects:
+      - final-gate-validation
+      - golden-regen-hatch
+  - kind: risk
+    summary: 1.72 GiB of .factory model artifacts are tracked; detect-secrets safety
+      depends on a prefix-anchored baseline filter
+    detail: git ls-files includes 9 .safetensors totalling 1,844,653,898 bytes
+      (largest 789,581,344 B) under .factory/. The runner caps detect-secrets at
+      RLIMIT_AS 2048 MB; scanning one model file reproduces MemoryError in
+      detect_secrets/transformers/config.py:97. The committed
+      `.secrets.baseline` filter ^\\.factory/ is the only thing preventing the
+      failure, and it can be bypassed by a path that does not start with
+      `.factory/` (e.g. `./.factory/...`).
+    severity: medium
+    location:
+      file: .secrets.baseline
+      line: 42
+    affects:
+      - final-gate-validation
+  - kind: assumption
+    summary: PoC lock is POSIX-only fcntl.flock; no production lock code exists at HEAD
+    detail: "`git grep fcntl|flock -- ':!.factory'` is empty in tracked source;
+      `_semantic.py` has only an in-process memo and the tracked cache is
+      unimplemented. The POSIX-only-lock concern is therefore deferred to
+      cache-design-spike/decision-cache-impl and must not be documented as a
+      delivered cross-platform mechanism."
+    severity: low
+    location:
+      file: src/python_setup_lint/checkers/_semantic.py
+      line: 15
+    affects:
+      - cache-design-spike
+      - decision-cache-impl
+  - kind: assumption
+    summary: Production call sites pass constant rule symbols, collapsing the
+      cache-key rule component
+    detail: 'Confirmed at HEAD: suppression_justification_checker.py:152,372,383
+      pass rule="unjustified-suppression" and
+      bare_except_comment_checker.py:103,116 pass rule="bare-except-comment".
+      _semantic.py:48-58 includes rule in the SHA-256 key, so it is constant per
+      checker; the key also truncates to 64 bits at _semantic.py:59. Impact is
+      in-process only today (no tracked cache), but the tracked-cache design
+      must not assume distinct rule values.'
+    severity: medium
+    location:
+      file: src/python_setup_lint/checkers/conformance/suppression_justification_checker.py
+      line: 152
+    affects:
+      - cache-design-spike
+      - decision-cache-impl
+remarkable:
+  - chosen: Treat detect-secrets as GREEN at HEAD via the already-committed
+      `^\\.factory/` baseline filter, without editing any baseline and without
+      changing the 2048 MB tool cap.
+    why: The exact git-ls-files scan exits 0 in 8s and lint reports PASSED; the
+      filter was committed by ancestor 882fac0. The MemoryError is reproducible
+      only when a path alias bypasses the prefix regex under RLIMIT_AS 2 GB,
+      which proves the mechanism without requiring a fix at HEAD.
+    alternatives:
+      - Stop tracking the .factory model artifacts (removes 1.72 GiB but changes
+        the checkout)
+      - Add a ToolSpec path/exclude for detect-secrets (currently ignored at
+        dispatch.py:179)
+      - Raise the per-tool memory limit above 2048 MB (weakens the OOM guard)
+  - chosen: Accept the integration golden byte-identity assertion as the golden gate
+      evidence and record the missing golden-regen-hatch report as a medium risk
+      rather than regenerating the golden.
+    why: test_setup_new_and_lint asserts both multiset equality and a byte-identical
+      replay on a fresh copy; golden has been unchanged since 1a811af;
+      regeneration would be an unreviewed diff with no behavior change to
+      justify it.
+    alternatives:
+      - Block close-out until the golden-regen-hatch item produces its report
+      - Regenerate via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 and review the diff
+      - Pin only the golden file hash without the replay assertion
diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/input.md b/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/input.md
similarity index 84%
rename from .factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/input.md
rename to .factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/input.md
index bf84ef7..e44f4d6 100644
--- a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/input.md
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/input.md
@@ -108,23 +108,26 @@ Criteria for assigning disposition to review findings:
 
 ## Assignment
 {
-  "slug": "epic-shift-report-collection",
+  "slug": "final-gate-validation",
   "kind": "fact-finder",
-  "title": "Consolidate epic shift reports into handoff record",
-  "assignment": "Root-owned fan-in (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). M2 replanAfter:true is enforceable gate: engine schedules only in post-replan wave after M2 epic close-ups exist. Read three epic close-up reports; extract each epic's shift-report section (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; consolidate into one handoff record with exactly 3 epic sections. If any close-up missing, stay pending (fails open, never fabricates). Output feeds golden-regen-hatch exclusively. Verify handoff has exactly 3 sections, each either shift report or explicit no-shift declaration. Covers ADR-011 shift-handoff contract and M2->M3 gate.",
-  "outlineRef": "epic-shift-report-collection",
+  "title": "Final gate table and docs reconciliation check",
+  "assignment": "Root-owned final validation (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). Record final gate table: format exit 0; lint per-tool results on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); pytest -q green (pass/skip/deselect counts); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without via ensure_precommit_or_skip); golden byte-identical or regen-with-reviewed-diff per hatch report; lint.baseline []; docs reconciliation with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts to 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits. Covers M3 close-out, TD3-A1/TD3-I2.",
+  "outlineRef": "final-gate-validation",
   "milestone": "M3",
-  "wave": 3,
+  "wave": 5,
   "deps": [
-    "epic-kickoff-gate"
+    "golden-regen-hatch"
   ],
   "scenarioRefs": [
-    "M3: Golden integrity preserved"
+    "M3: Iteration closes with evidence"
   ],
   "citations": [
-    "lint.baseline:1-1",
+    "docs/semantic-justification.md:5-14",
+    "docs/semantic-justification.md:34-45",
+    "AGENTS.md:79-85",
     "AGENTS.md:87-93",
-    "CodingRules.md:90-107"
+    "lint.baseline:1-1",
+    ".gitignore:243-244"
   ]
 }
 
@@ -464,38 +467,25 @@ index ec16141..3643670 100644
 -disposition: human-awareness
 +updatedAt: 2026-11-10T00:08:48.409Z
 diff --git a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml b/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
-deleted file mode 100644
-index cba84a6..0000000
+index cba84a6..3a50471 100644
 --- a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
-+++ /dev/null
-@@ -1,27 +0,0 @@
--id: c-8d4b35b36c
--kind: tech-debt
--summary: ADR-011 shift-handoff contract remains 'Accepted' after epic
--  decomposition was abandoned
--detail: ADR-011 status is still 'Accepted' (docs/adr/ADR-011.md:5) and the ADR
--  index lists it as Accepted (docs/adr/README.md:30), while ADR-013:1-3 and
--  ADR-023:1-3 supersede epic decomposition and state there is no epic
--  close-up/handoff bottleneck. The stale accepted contract is why this stranded
--  item keeps being re-queued.
--location:
--  file: docs/adr/ADR-011.md
--  line: 5
--affects:
--  - docs-adr-reconciliation
--  - docs-adr-reconciliation-v2
--  - epic-shift-report-collection
--severity: medium
++++ b/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
+@@ -15,7 +15,7 @@ affects:
+   - docs-adr-reconciliation-v2
+   - epic-shift-report-collection
+ severity: medium
 -status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
++status: open
+ source:
+   record: 001-research-r1-a1
+   agent: fact-finder
+@@ -23,5 +23,4 @@ source:
+   item: epic-shift-report-collection
+   lastSeen: 2026-11-10T00:14:51.554Z
+ createdAt: 2026-11-10T00:14:51.554Z
 -updatedAt: 2026-11-10T01:56:20.258Z
 -disposition: optional
++updatedAt: 2026-11-10T00:14:51.554Z
 diff --git a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml b/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
 index f876d4c..b09bf91 100644
 --- a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
@@ -517,38 +507,25 @@ index f876d4c..b09bf91 100644
 -disposition: optional
 +updatedAt: 2026-11-09T23:33:30.977Z
 diff --git a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml b/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
-deleted file mode 100644
-index a03b7a4..0000000
+index a03b7a4..bc6476f 100644
 --- a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
-+++ /dev/null
-@@ -1,27 +0,0 @@
--id: c-96c102b8ae
--kind: risk
--summary: Legacy golden-regen-hatch could misread a missing handoff as all-no-shift
--detail: The legacy hatch is allowed a no-op only 'If all three handoff sections
--  declare no-shift' (items/golden-regen-hatch/assignment.yaml:4-12). With zero
--  sections neither shift nor no-shift is established. Running it on this
--  findings file as a handoff would violate the reviewed-shift precondition; the
--  I5 plan replaces it with golden-regen-hatch-v2 consuming behavior-item
--  declarations (plan-5.3:882-898).
--location:
--  file: .factory/tasks/modernize/items/golden-regen-hatch/assignment.yaml
--  line: 4
--affects:
--  - final-gate-validation
--  - golden-regen-hatch
--  - golden-regen-hatch-v2
--severity: medium
++++ b/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
+@@ -15,7 +15,7 @@ affects:
+   - golden-regen-hatch
+   - golden-regen-hatch-v2
+ severity: medium
 -status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
++status: open
+ source:
+   record: 001-research-r1-a1
+   agent: fact-finder
+@@ -23,5 +23,4 @@ source:
+   item: epic-shift-report-collection
+   lastSeen: 2026-11-10T00:14:51.554Z
+ createdAt: 2026-11-10T00:14:51.554Z
 -updatedAt: 2026-11-10T01:56:20.258Z
 -disposition: optional
++updatedAt: 2026-11-10T00:14:51.554Z
 diff --git a/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml b/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml
 deleted file mode 100644
 index 0f1e7e3..0000000
@@ -771,40 +748,25 @@ index d7daa2d..5787fee 100644
 -disposition: optional
 +updatedAt: 2026-11-09T23:49:50.606Z
 diff --git a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml b/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
-deleted file mode 100644
-index 3814e71..0000000
+index 3814e71..d901eb8 100644
 --- a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
-+++ /dev/null
-@@ -1,29 +0,0 @@
--id: c-c6f2d80623
--kind: blocker
--summary: "Legacy epic handoff item is unsatisfiable in I5: 0/3 epic close-ups
--  exist and the M2 replanAfter gate is absent"
--detail: "The three iteration-3 epics were never spawned (closeup-3: M2 zero
--  delivery; 086/087 close-ups: 'M2 epic work ... entirely outstanding'), and
--  iterations 4-5 abandoned epic decomposition (ADR-013:1-3; ADR-023:1-3;
--  plan-5.3:1013-1017). The item was resumed as a stranded record with state
--  'blocked' (state.yaml:257-263) even though plan-5.3 declares 'No replanAfter
--  gates' (:1277). Retries cannot produce the required artifacts; only a replan
--  can retire or re-scope it."
--location:
--  file: .factory/tasks/modernize/items/epic-shift-report-collection/assignment.yaml
--  line: 4
--affects:
--  - epic-shift-report-collection
--  - final-gate-validation
--  - golden-regen-hatch
--severity: high
++++ b/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
+@@ -17,7 +17,7 @@ affects:
+   - final-gate-validation
+   - golden-regen-hatch
+ severity: high
 -status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
++status: open
+ source:
+   record: 001-research-r1-a1
+   agent: fact-finder
+@@ -25,5 +25,4 @@ source:
+   item: epic-shift-report-collection
+   lastSeen: 2026-11-10T00:14:51.554Z
+ createdAt: 2026-11-10T00:14:51.554Z
 -updatedAt: 2026-11-10T01:56:20.258Z
 -disposition: architect
++updatedAt: 2026-11-10T00:14:51.554Z
 diff --git a/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml b/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
 index cc2c54e..eb9b091 100644
 --- a/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
@@ -1228,60 +1190,6 @@ index e25117a..0000000
 -  lastSeen: 2026-11-10T00:53:21.467Z
 -createdAt: 2026-11-10T00:53:21.467Z
 -updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-a302818175.yaml b/.factory/tasks/modernize/concerns/rm-a302818175.yaml
-deleted file mode 100644
-index 628edd8..0000000
---- a/.factory/tasks/modernize/concerns/rm-a302818175.yaml
-+++ /dev/null
-@@ -1,21 +0,0 @@
--id: rm-a302818175
--chosen: Recommend the iteration-5 ADR-023 item-level path
--  (golden-regen-hatch-v2) rather than reviving epics to satisfy the legacy
--  contract
--alternatives:
--  - Reintroduce runner/checkers/semantic epics in I6 solely to produce close-ups
--  - Keep the legacy item pending indefinitely and let it block legacy
--    golden-regen-hatch
--why: The I5 plan explicitly ships no child epics and the v2 hatch depends only
--  on behavior items (plan-5.3:1013-1017, 1271-1284, 882-898). Reviving epics
--  would reintroduce the empty-wave/bottleneck failure ADR-013 and ADR-023
--  removed.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml b/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml
-deleted file mode 100644
-index fac171d..0000000
---- a/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml
-+++ /dev/null
-@@ -1,21 +0,0 @@
--id: rm-a310a057fe
--chosen: "Honor fail-open: report 0/3 close-ups and keep the item blocked/pending
--  rather than synthesizing a handoff"
--alternatives:
--  - Reconstruct three pseudo-close-ups from I4/I5 item-level shift declarations
--  - Treat plan-level closeup-3/closeup-4 as the three epic close-ups
--  - Emit three root-authored no-shift declarations in place of missing epic
--    close-ups
--why: ADR-011:64-69 and assignment.yaml:10-12 require all three epic close-ups
--  and forbid fabrication. Item-level shift declarations exist but are
--  single-owner item reports, not epic close-ups, so relabeling them would poison
--  the golden-regen-hatch precondition.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: epic-shift-report-collection
--  lastSeen: 2026-11-10T00:14:51.554Z
--createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T00:14:51.554Z
 diff --git a/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml b/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml
 deleted file mode 100644
 index 65daa54..0000000
@@ -1372,12 +1280,12 @@ index f478516..0000000
 -text: "No replan needed: ADR-023 governs I5 delivery; I6 replans M2/M3 without
 -  epics."
 -reason: superseded
-diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/input.md
+diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md
 new file mode 100644
-index 0000000..d788b12
+index 0000000..6979bc8
 --- /dev/null
-+++ b/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/input.md
-@@ -0,0 +1,100 @@
++++ b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md
+@@ -0,0 +1,106 @@
 +# Step: Research
 +
 +## Goal
@@ -1393,23 +1301,26 @@ index 0000000..d788b12
 +
 +## Assignment
 +{
-+  "slug": "epic-shift-report-collection",
++  "slug": "final-gate-validation",
 +  "kind": "fact-finder",
-+  "title": "Consolidate epic shift reports into handoff record",
-+  "assignment": "Root-owned fan-in (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). M2 replanAfter:true is enforceable gate: engine schedules only in post-replan wave after M2 epic close-ups exist. Read three epic close-up reports; extract each epic's shift-report section (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; consolidate into one handoff record with exactly 3 epic sections. If any close-up missing, stay pending (fails open, never fabricates). Output feeds golden-regen-hatch exclusively. Verify handoff has exactly 3 sections, each either shift report or explicit no-shift declaration. Covers ADR-011 shift-handoff contract and M2->M3 gate.",
-+  "outlineRef": "epic-shift-report-collection",
++  "title": "Final gate table and docs reconciliation check",
++  "assignment": "Root-owned final validation (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). Record final gate table: format exit 0; lint per-tool results on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); pytest -q green (pass/skip/deselect counts); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without via ensure_precommit_or_skip); golden byte-identical or regen-with-reviewed-diff per hatch report; lint.baseline []; docs reconciliation with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts to 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits. Covers M3 close-out, TD3-A1/TD3-I2.",
++  "outlineRef": "final-gate-validation",
 +  "milestone": "M3",
-+  "wave": 3,
++  "wave": 5,
 +  "deps": [
-+    "epic-kickoff-gate"
++    "golden-regen-hatch"
 +  ],
 +  "scenarioRefs": [
-+    "M3: Golden integrity preserved"
++    "M3: Iteration closes with evidence"
 +  ],
 +  "citations": [
-+    "lint.baseline:1-1",
++    "docs/semantic-justification.md:5-14",
++    "docs/semantic-justification.md:34-45",
++    "AGENTS.md:79-85",
 +    "AGENTS.md:87-93",
-+    "CodingRules.md:90-107"
++    "lint.baseline:1-1",
++    ".gitignore:243-244"
 +  ]
 +}
 +
@@ -1428,9 +1339,12 @@ index 0000000..d788b12
 +
 +## Context & Citations
 +[
-+  "lint.baseline:1-1",
++  "docs/semantic-justification.md:5-14",
++  "docs/semantic-justification.md:34-45",
++  "AGENTS.md:79-85",
 +  "AGENTS.md:87-93",
-+  "CodingRules.md:90-107"
++  "lint.baseline:1-1",
++  ".gitignore:243-244"
 +]
 +
 +## Review Feedback
@@ -1478,11 +1392,11 @@ index 0000000..d788b12
 +  - chosen (string, required)
 +  - why (string, required)
 +  - alternatives (array of string, required)
-diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/meta.yaml
+diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml
 new file mode 100644
-index 0000000..b57c12b
+index 0000000..d7411b4
 --- /dev/null
-+++ b/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/meta.yaml
++++ b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml
 @@ -0,0 +1,19 @@
 +seq: 1
 +name: research
@@ -1495,396 +1409,383 @@ index 0000000..b57c12b
 +  - opencode-go/muse-spark-1.3-contributor
 +timeoutSec: 3600
 +status: ok
-+startedAt: 2026-11-10T00:09:19.348Z
-+session: 01a1c2c9-b140-700c-9319-d3dbbbaad9b1
-+endedAt: 2026-11-10T00:14:51.676Z
++startedAt: 2026-11-10T00:15:13.726Z
++session: 01a1c2cf-17ec-7158-a980-3643bf095788
++endedAt: 2026-11-10T00:27:58.604Z
 +usage:
-+  inputTokens: 88261
-+  outputTokens: 36328
-+  costUsd: 0.040594
-+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl
-diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/output.yaml
++  inputTokens: 95165
++  outputTokens: 54227
++  costUsd: 0.052455
++traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-15-14-412Z_01a1c2cf-17ec-7158-a980-3643bf095788
+diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/output.yaml
 new file mode 100644
-index 0000000..0990071
+index 0000000..4c125be
 --- /dev/null
-+++ b/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1/output.yaml
-@@ -0,0 +1,363 @@
-+status: inconclusive
-+summary: Verified 0 of 3 required epic close-up reports exist
-+  (epic-runner-modernize, epic-checkers-modernize,
-+  epic-semantic-infrastructure). Iteration 3's M2 epics were never spawned ('M2
-+  epic work (runner/checkers/semantic) entirely outstanding', M2 zero delivery);
-+  iterations 4-5 abandoned epic decomposition (ADR-013, ADR-023), and the I5
-+  plan explicitly declares no child epics and no replanAfter gates. The legacy
-+  item was resumed as a stranded iteration-3 record, but its precondition never
-+  held. Per the assignment and ADR-011, the handoff record is not producible and
-+  the item must stay pending/blocked; no epic sections are fabricated. The I5
-+  replacement path is item-level shift declarations consumed by
-+  golden-regen-hatch-v2.
-+findings: >
-+  # Epic shift-report fan-in — fail-open verification
-+
-+
-+  ## Verdict
-+
-+
-+  **0 of 3 required epic close-up reports exist. The handoff record is NOT
-+  producible.**
-+
-+
-+  Per the assignment (`epic-shift-report-collection/assignment.yaml:10-12`) and
-+  ADR-011 (`docs/adr/ADR-011.md:64-69`), the item must stay pending/blocked when
-+  any close-up is missing, and must never fabricate sections. The legacy item
-+  was resumed into iteration 5 as a stranded iteration-3 artifact, but the three
-+  epics it depends on were never spawned and iteration 5 explicitly ships no
-+  epics and no replanAfter gates.
-+
-+
-+  ```
-+
-+  handoff.required_sections              = 3
-+
-+  handoff.sections_produced              = 0
-+
-+  handoff.sections_with_shift_report     = 0
-+
-+  handoff.sections_with_no_shift_decl    = 0
-+
-+  handoff.verification                   = FAIL (0 != 3)
-+
-+  fail_open                              = true
-+
++++ b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/output.yaml
+@@ -0,0 +1,355 @@
++status: ok
++summary: "Final gate table recorded at HEAD
++  ba7c2677a1f20e6dcafeba0198da2120c2b677b1 (clean tree, zero repo writes). All
++  runtime gates are GREEN: ruff format --check exit 0 (191 files), 14/14 lint
++  tools PASSED (exit 0, ~60s), detect-secrets PASSED at HEAD with the
++  MemoryError mechanism pinned to the runner's 2048 MB RLIMIT_AS plus 1.72 GiB
++  of tracked .factory safetensors, pytest 1357 passed/7 deselected/0 skipped,
++  integration 9 collected -> 9 passed (with pre-commit) and 7 passed + 2 skipped
++  (without, via ensure_precommit_or_skip), golden byte-identical (158 findings,
++  0 W9704), lint.baseline []. Docs reconciliation is RED on every must-contain
++  check (semantic-justification.md, custom-checks.md, troubleshooting.md,
++  AGENTS.md pipeline, CHANGELOG [semantic]/no-go/version, README pin, ADR
++  index/staleness), and the golden-regen-hatch report is absent. Red cells are
++  routed per ADR-011: runner-owned AGENTS Quick Commands/Tool Scope,
++  semantic-owned AGENTS pipeline subsection, root-owned repo-root
++  docs/CHANGELOG/README/ADRs; no baseline edits."
++findings: |-
++  # Final gate table — HEAD ba7c2677a1f20e6dcafeba0198da2120c2b677b1 (`topic/modernize--final-gate-validation`)
++
++  Probes were read-only. `git status --porcelain` was empty before and after every probe; `.secrets.baseline` sha256 was unchanged after `uv run lint`; `lint.baseline` remains `[]` (`lint.baseline:1`).
++
++  ## Runtime gates (all GREEN)
++
++  | Gate | Result | Evidence |
++  |---|---|---|
++  | Format | **GREEN, exit 0** | `uv run ruff format --check --config config/ruff.toml src/ tests/` -> `191 files already formatted`, exit 0. Lint section `[ruff format] PASSED [0.0s]`. Check-only is enforced by `_RuffFormatLintTool.build_command` (`src/python_setup_lint/runner/dispatch.py:312-338`); scope is `src/`, `tests/` (`src/python_setup_lint/runner/_tool_specs.py:12-18`). |
++  | Lint per-tool | **GREEN, 14/14 PASSED, exit 0** | `uv run lint`: tach 0.3s, ruff format 0.0s, ruff check 0.1s, rumdl 0.1s, mypy 5.4s, yamllint 0.2s, ty 0.2s, mypy.stubtest 7.5s, pyright check 4.3s, pyright verify types 1.0s, pylint 10.7s, pylint-pyi 9.5s, pylint tests 14.4s, detect-secrets 6.0s. `LINT_EXIT=0`; tree clean afterwards. |
++  | detect-secrets MemoryError | **GREEN at HEAD, mechanism pinned** | See below. |
++  | pytest -q | **GREEN** | `1357 passed, 7 deselected, 4 warnings in 32.69s`, exit 0. **0 skipped.** Deselection: `addopts = "-m 'not slow'"` (`pyproject.toml:47-48`). |
++  | Integration with pre-commit pinned | **GREEN** | 9 collected, **9 passed** in 69.64s, exit 0. pre-commit 4.6.0 is a dev dependency (`pyproject.toml:67`). |
++  | Integration without pre-commit | **GREEN/expected** | 9 collected, **7 passed, 2 skipped** in 56.76s, exit 0. Skips are `test_dry_run_hooks` and `test_pre_commit_dry_run`, both guarded by `ensure_precommit_or_skip` (`tests/_project_helpers.py:185-191`; call sites `tests/integration.py:205,257`). Reproduced by uninstalling pre-commit from `.venv` plus `uv run --no-sync pytest tests/integration.py -v`; pre-commit 4.6.0 restored with `uv sync`. |
++  | Golden | **GREEN byte-identical; no regen; hatch report absent** | See below. |
++  | lint.baseline | **GREEN** | File is exactly `[]` (`lint.baseline:1`); never edited. |
++
++  ## detect-secrets MemoryError — mechanism, HEAD, and reproduction
++
++  - **Command path:** `_DetectSecretsLintTool.build_command` returns `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline && python3 -c "...json.dump..."` (`src/python_setup_lint/runner/dispatch.py:181-188`). `_path`/`_exclude` are explicitly ignored (`dispatch.py:179`), so detect-secrets necessarily scans **all** tracked files; lint scoping cannot reduce its inputs.
++  - **Per-tool memory cap:** default `memory_limit_mb=2048` (`src/python_setup_lint/runner/types.py:22`; `src/python_setup_lint/runner/output.py:159`) is applied as `resource.setrlimit(RLIMIT_AS, 2048 MB)` in the subprocess preexec (`output.py:173-174`).
++  - **Tracked corpus at HEAD:** 1,500 tracked files, 1,234 under `.factory/`; 9 tracked `.safetensors` total **1,844,653,898 bytes (1.72 GiB)**; largest single file **789,581,344 bytes** (`.factory/tasks/modernize/items/model-eval-poc/poc/cache/models/glide/model-00001-of-00001.safetensors`).
++  - **Reproduction (read-only):** `bash -c 'ulimit -v 2000000; exec .venv/bin/detect-secrets-hook --baseline .secrets.baseline ./.factory/.../glide/model-00001-of-00001.safetensors'` -> traceback ending `File "detect_secrets/transformers/config.py", line 97, in _parse_file; content = file.read()` -> **MemoryError**, exit 1. The `./` path prefix bypasses the `^\.factory/` regex, proving the filter is a prefix match on the literal filename.
++  - **Actual HEAD command:** `git ls-files -z | xargs -0 .venv/bin/detect-secrets-hook --baseline .secrets.baseline` -> exit 0 in 8.0s; `uv run lint` -> `[detect-secrets] PASSED [6.0s]`.
++  - **Mitigation at HEAD:** `.secrets.baseline:42-45` contains `detect_secrets.filters.regex.should_exclude_file` with pattern `^\.factory/`, added by commit **882fac0** (`factory(secrets-baseline-exclusion): develop a1 [ok]`, 2026-11-08). `git merge-base --is-ancestor 882fac0 HEAD` exits 0, so the fix is present at ba7c267. No new baseline edit is needed.
++  - **Residual risk:** the 1.72 GiB model cache remains tracked; the exclusion is filename-prefix based, so a path alias that does not start with `.factory/` (e.g. `./.factory/...`) re-triggers MemoryError under the 2 GB cap. This is a scope/infra hazard, not a current lint failure.
++
++  ## Golden gate
++
++  - Golden: `tests/data/golden/minimal_sample_project_findings.json` = **158 findings**, **0 W9704**; sha256 `c2b8dc3a9ed42832e6906379d0e1a2f8e3823816b33145d786b08efb23799f96`. Counts file sha256 `1d239741f47669aa7d49ea786d57eea6435ebb8662cd3505fbafb8f33d048363`.
++  - `test_setup_new_and_lint` sets `SEMANTIC_ENV=0` (`tests/integration.py:112`), asserts multiset equality with the golden (`integration.py:115`) and asserts a fresh-copy replay serializes **byte-identically** (`integration.py:120-122`; helper `tests/_golden.py:392-410`). It passed in both integration runs. Regen is CI-refused (`tests/_golden.py:382`) and opt-in via `PYTHON_SETUP_LINT_UPDATE_GOLDEN` (`_golden.py:53`).
++  - Golden last changed by `1a811af` (2026-11-08 00:51), i.e. no drift since wiring. **No `golden-regen-hatch` branch, commit, or report exists at HEAD** (`git branch -a` and `git log --all --grep` show none; only `docs/adr/ADR-011.md:68` names the item). The byte-identity evidence is independent of that missing artifact.
++
++  ## Docs reconciliation matrix (all must-contain checks RED at HEAD)
++
++  | File | Required string(s) | Found | State / stale evidence |
++  |---|---|---|---|
++  | `docs/semantic-justification.md` | `DecisionBackend`, `.python-setup-decisions.json`, `ADR-009`, `prompt-v1` | 0 / 0 / 0 / 0 | **RED.** Still reranker-first (`:9-14`), env-gated `sentence-transformers` (`:18`), model/result cache under `~/.cache/python-setup/semantic/` (`:34-45`). |
++  | `docs/custom-checks.md` | `DecisionBackend` | 0 | **RED.** `check_if_meaningful` described as heuristic + semantic reranker, threshold 0.5, `PYTHON_SETUP_LINT_RERANKER_MODEL` (`:97`, `:104`). |
++  | `docs/troubleshooting.md` | `DECISION_MODEL`, `RERANKER` deprecated | 0 / 0 | **RED.** Stale `<h2>Sentence-transformer download failure -> heuristic fallback</h2>` section (`:97-112`) and stale integration count `<code># Expected: 7 pass, ~39s</code>` (`:150`). |
++  | `AGENTS.md` pipeline subsection | `DecisionBackend` | 0 | **RED.** `:79-85` contains 2x `cross-encoder reranker`; no DecisionBackend. |
++  | `AGENTS.md` counts | 9-collected contract + current unit counts | `9 collected` 0 | **RED.** `:10` says `1290 pass, 4 skip, 15 deselected, ~53s` (actual 1357 passed, 0 skipped, 7 deselected, ~33s); `:11` says `Integration tests (7 pass, ~30s)` (actual 9 collected/9 passed, ~57-70s). Testing Strategy `:87-93` is generic. |
++  | `AGENTS.md` Tool Scope | `ruff format` row | 0 | **RED.** Tool Scope table `:16-32` has 13 tool rows and no `ruff format` row; ADR-011:31-32 explicitly requires adding it. Expected scope `src/`, `tests/` per `_tool_specs.py:17`. |
++  | `CHANGELOG.md` | `[semantic]`, `no-go`, version `v1.2.10` | 0 / 0 / 0 | **RED.** Top entry is `## v1.2.9 (2026-07-05)` (`CHANGELOG.md:3`) while `pyproject.toml:3` is `version = "1.2.10"`. Only a historical reranker line at `CHANGELOG.md:113`. |
++  | `README.md` | pin `v1.2.10` | 0 | **RED.** Update-workflow pin is `...@v1.2.5` (`README.md:72`) and `:29` still advertises `python-setup[semantic]` as sentence-transformer scoring, but `[project.optional-dependencies].semantic = []` (`pyproject.toml:28-30`) and `uv.lock` has no torch/transformers/sentence-transformers edge. |
++  | `docs/adr/README.md` | ADR index through ADR-024 | `ADR-013` 0, `ADR-014` 0, `ADR-024` 0 | **RED.** Index table `:20-31` stops at ADR-012; ADR-013..016 and ADR-019..024 are omitted (ADR-017/018 intentionally never merged per ADR-019:3). |
++  | ADR staleness | status notes for stale records | — | **RED.** `ADR-009:31` claims iteration-3 delivered `Heuristic-first DecisionBackend plus tracked-cache infrastructure`; backend exists but the tracked cache does not. `ADR-010:26-36` freezes the `.python-setup-decisions.json` contract, unimplemented at HEAD. `ADR-014:1-3` claims current code is semantic-first with heuristic fallback; actual is heuristic-first veto (`src/python_setup_lint/checkers/_base.py:248-252`). `ADR-016:3` claims no DecisionBackend/cache/FakeBackend, `[semantic]` still sentence-transformers, tests reranker-coupled; all three are false at HEAD (`checkers/_decision_backend.py`, `pyproject.toml:28-30`, `tests/checkers/test_decision_backend.py`). `ADR-015:1-3`, `ADR-024:1-3` remain open deferrals. |
++
++  ## Tracked-cache / TD3 state
++
++  - `git grep "python-setup-decisions" -- ':!.factory'` finds only `docs/adr/ADR-010.md:26`. `_semantic.py:15-25,47-64` is an **in-process memo only** (SHA-256[:8] key, no disk). No `fcntl`/`flock` anywhere in `src/`; the only tracked TD3 reference is `ADR-010:11` (TD3-I1). TD3-A1/TD3-I2 are not defined in tracked repo files.
++  - `_semantic.py:48-58` includes `rule` in the cache key, but production call sites pass constants: `rule="unjustified-suppression"` (`checkers/conformance/suppression_justification_checker.py:152,372,383`) and `rule="bare-except-comment"` (`checkers/conformance/bare_except_comment_checker.py:103,116`). The rule component is therefore constant per checker (open concern c-5463b26c4b confirmed at HEAD). Key bytes are also truncated to 64 bits (`_semantic.py:59`).
++  - `ADR-009:31`'s tracked-cache deliverable is absent, so the M3 intent line "keep a git-stored cache with cleanup" is not evidenced at HEAD; `.gitignore:243-244` still names the retired `.cache/python-setup/semantic/` path (ADR-011:58-59 says leave it untouched until the tracked cache lands).
++
++  ## Red-cell routing (per ADR-011 single-writer map)
++
++  | Red cell | Owner | Route |
++  |---|---|---|
++  | `AGENTS.md` Quick Commands `:9-12` and Tool Scope `:16-32` (counts + `ruff format` row) | Runner epic (`ADR-011:31-32`) | Epic follow-up item for the runner-owned AGENTS rows; do not edit in the root item. |
++  | `AGENTS.md` `### Semantic justification pipeline` `:79-85` | Semantic epic (`ADR-011:33`) | Epic follow-up item; replace cross-encoder reranker text with DecisionBackend/heuristic-first veto. |
++  | `docs/semantic-justification.md`, `docs/custom-checks.md`, `docs/troubleshooting.md` semantic sections | Repo-root docs (root-owned, `ADR-011:54-58`) | New root item or this root item's develop step: rewrite with the four must-contain strings, `DECISION_MODEL`, and `RERANKER deprecated`; replace the `:150` 7-pass count with the 9-collected contract. |
++  | `CHANGELOG.md`, `README.md`, `docs/adr/**` | Root-owned repo-root files (`ADR-011:54-58`) | New root item or this root item's develop step: add v1.2.10 `[semantic]` + `no-go` entry; bump README pin to v1.2.10 and drop the stale `[semantic]` claim; index ADR-013..024 and add staleness notes to ADR-009/010/014/015/016. |
++  | `lint.baseline`, `.secrets.baseline` | — | **No edits.** `lint.baseline` stays `[]`; `.secrets.baseline` already contains the required `^\\.factory/` filter from 882fac0. Never route a red cell through a baseline edit. |
++
++  ## Reproduction commands
++
++  ```bash
++  uv run ruff format --check --config config/ruff.toml src/ tests/
++  uv run lint
++  uv run pytest -q
++  uv run pytest tests/integration.py -v
++  uv pip uninstall pre-commit && uv run --no-sync pytest tests/integration.py -v && uv sync
++  git ls-files -z | xargs -0 .venv/bin/detect-secrets-hook --baseline .secrets.baseline
++  bash -c 'ulimit -v 2000000; .venv/bin/detect-secrets-hook --baseline .secrets.baseline ./.factory/tasks/modernize/items/model-eval-poc/poc/cache/models/glide/model-00001-of-00001.safetensors'
 +  ```
 +
++  ## Verdict
 +
-+  ## 1. Contract requirements
-+
-+
-+  - `docs/adr/ADR-011.md:62-69` — each epic emits a shift-report section or
-+  explicit no-shift declaration in its close-up report; M2 `replanAfter: true`
-+  schedules no M3 item until the replan after the M2 epic close-ups;
-+  `epic-shift-report-collection` stays pending unless all three close-ups exist
-+  and consolidates the handoff record consumed by `golden-regen-hatch`.
-+
-+  - `.factory/tasks/modernize/plan/plan-3.yaml:92` — M2 carries `replanAfter:
-+  true`.
-+
-+  - `.factory/tasks/modernize/plan/plan-3.yaml:261-277` — item outline: exactly
-+  3 epic sections; fail-open (never fabricates).
-+
-+  - The three epics named by plan-3: `epic-runner-modernize`
-+  (`plan-3.yaml:444`), `epic-checkers-modernize` (`plan-3.yaml:530`),
-+  `epic-semantic-infrastructure` (`plan-3.yaml:637`).
-+
-+  - Required per-epic shift payload: `{justification-class description,
-+  added/removed finding keys, CHANGELOG snippet, evidence file:line}` —
-+  `plan-3.yaml:419-422` (runner), `:504-507` (checkers), `:567-570` (semantic).
-+
-+
-+  ## 2. Existence matrix
-+
-+
-+  | # | Required epic | Expected source | Found | Extractable shift fields |
-+
-+  |---|---|---|---|---|
-+
-+  | 1 | epic-runner-modernize | epic close-up report with shift section |
-+  **MISSING** | none |
-+
-+  | 2 | epic-checkers-modernize | epic close-up report with shift section |
-+  **MISSING** | none |
-+
-+  | 3 | epic-semantic-infrastructure | epic close-up report with shift section |
-+  **MISSING** | none |
-+
-+
-+  Evidence of absence:
-+
-+
-+  - Only two `epic-*` item directories exist under
-+  `.factory/tasks/modernize/items/`: `epic-kickoff-gate` and
-+  `epic-shift-report-collection`. No `epic-runner-modernize`,
-+  `epic-checkers-modernize`, or `epic-semantic-infrastructure` directory exists.
-+
-+  - No run output declares an epic item (`grep -rl '^item: epic-'
-+  .factory/tasks/modernize/runs/*/output.yaml` returns nothing). Close-up run
-+  names are only `wave-close-up-*`, `plan-close-up-*`, and
-+  `architect-closeup-*`.
-+
-+  - No file under `.factory/tasks/modernize/items/*/steps/*/output.yaml` or
-+  `findings.md` contains a shift-report block with `justification-class` /
-+  `added/removed` / `finding keys`; the only hits are unrelated test assertions
-+  (e.g.
-+  `items/golden-snapshot-wiring/steps/001-test-first-r1-a1/output.yaml:17`).
-+
-+  - Iteration-3 close-up is explicit:
-+  `runs/086-plan-close-up-3-a1/output.yaml:53-54` — "M2 epic work
-+  (runner/checkers/semantic) entirely outstanding; M3 golden/docs/gate close-out
-+  blocked on it"; `runs/087-architect-closeup-3-a1/output.yaml:38-39` repeats
-+  it; `closeup-3.yaml:7-8` records "M2 ZERO DELIVERY". Iteration 1 also recorded
-+  the semantic epic as unstarted (`closeup-1.yaml:8`).
-+
-+  - Iteration 4 abandoned epics: `docs/adr/ADR-013.md:1-3` ("I3 planned 3 epics
-+  ... kickoff pending, M2 zero delivery ... abandoned epics for root items").
-+
-+  - Iteration 5 ships no epics: `docs/adr/ADR-023.md:1-3`;
-+  `plan-5.3.yaml:1013-1017` — "No child epics in I5; all work as 18 root items";
-+  `plan-5.3.yaml:1271-1284` — "I5 ships no child epics ... No replanAfter gates
-+  ... no epic close-up/handoff bottleneck; M5 hatch consumes item shift
-+  declarations directly".
-+
-+  - The current plan's 28 item outlines contain no `epic-*` slug; the current
-+  hatch replacement depends only on behavior items (`plan-5.3.yaml:882-898`).
-+
-+  - Plan-level M2 close-ups are not epic close-ups: `closeup-4.yaml:3-6` records
-+  M1/M2 verified via root items after epic abandonment.
-+
-+
-+  ## 3. Handoff verification
-+
-+
-+  - Required: exactly 3 epic sections, each either a shift report or an explicit
-+  no-shift declaration (`assignment.yaml:10-13`; `plan-3.yaml:269-273`).
-+
-+  - Produced: **0 sections**. Verification fails (0 != 3).
-+
-+  - No justification-class description, added/removed finding keys, CHANGELOG
-+  snippet, or evidence `file:line` could be extracted from any epic close-up.
-+  Authoring them at root would violate "never fabricates" (`assignment.yaml:11`)
-+  and ADR-011 (`docs/adr/ADR-011.md:67-68`).
-+
-+  - `CHANGELOG.md:1-18` contains no epic shift/regen entry; there is no epic
-+  close-up from which to quote one.
++  Runtime/behavior gates: **all green**. Docs/ADR reconciliation: **all red** (10/10 must-contain groups), and the `golden-regen-hatch` report is absent (byte-identity independently proven). M3 close-out is blocked only on the docs red cells and the missing hatch attestation; no code/behavior regression was found at ba7c267.
++contextPack: >-
++  # Handoff: final-gate-validation (HEAD ba7c267, clean tree, zero writes)
 +
-+  - Tracked repository contains only the contract references, not a handoff
-+  record: `grep -rn -i 'shift report|no-shift'` over the repo (excluding
-+  `.factory`/`.git`) hits only `docs/adr/ADR-011.md:16,64-69`.
 +
++  ## Green runtime gate table
 +
-+  ## 4. Why the item is running despite the gate
++  - format: `ruff format --check --config config/ruff.toml src/ tests/` -> 191
++  files, exit 0.
 +
++  - lint: 14/14 PASSED, exit 0, ~60s (per-tool: tach .3, rfmt 0, rcheck .1,
++  rumdl .1, mypy 5.4, yamllint .2, ty .2, stubtest 7.5, pyright 4.3, pyright
++  verify 1.0, pylint 10.7, pylint-pyi 9.5, pylint tests 14.4, detect-secrets
++  6.0).
 +
-+  - The item is a stranded iteration-3 artifact: `state.yaml:257-263` records
-+  `status: blocked`, `attempts: 1`, `fixRounds: 1`; it was re-queued as a
-+  stranded item
-+  (`items/secrets-triage-spike/steps/004-review-r1-a1/input.md:6665`).
++  - pytest: 1357 passed, 7 deselected, 0 skipped, 32.69s, exit 0.
 +
-+  - Its stated M2 `replanAfter` gate exists only in plan-3 (`plan-3.yaml:92`);
-+  iteration 5 declares the opposite: "No replanAfter gates"
-+  (`plan-5.3.yaml:1277`). The item was therefore not unlocked by the gate — its
-+  precondition was already unsatisfiable.
++  - integration with pre-commit 4.6.0: 9 collected, 9 passed, 69.64s.
 +
-+  - Milestone metadata is stale: the item says `milestone: M3`
-+  (`assignment.yaml:16`), which is plan-3's M3; iteration 5's M3 is "Git-stored
-+  decision cache with cleanup" (`plan-5.3.yaml:115-116`).
++  - integration without pre-commit: 9 collected, 7 passed, 2 skipped, 56.76s
++  (ensure_precommit_or_skip).
 +
-+  - The dependency `epic-kickoff-gate` is itself blocked (`state.yaml:166-172`)
-+  and carries open blocker `concerns/c-81b8a319de.yaml:1-18` (abandoned
-+  validated-map dependency; this item is listed as affected at `:16`).
++  - golden: 158 findings, 0 W9704, byte-identical replay, no regen; hatch report
++  missing.
 +
-+  - Step metadata marks this as fix round 1, but `Review Feedback` is empty and
-+  no prior `findings.md` exists in item history (commit `1449ca8^` has no such
-+  file), so there is no earlier shift-report evidence to resume from.
++  - lint.baseline: `[]`.
 +
++  - detect-secrets: PASSED; mechanism = runner RLIMIT_AS 2048 MB + 1.72 GiB
++  tracked `.factory` safetensors, excluded by `.secrets.baseline` regex
++  `^\\.factory/` (commit 882fac0, ancestor).
 +
-+  ## 5. Downstream impact
 +
++  ## Exact must-change strings (all currently 0 occurrences)
 +
-+  - Legacy `golden-regen-hatch` depends on this item
-+  (`items/golden-regen-hatch/assignment.yaml:18-20`) and is blocked
-+  (`state.yaml:316-322`). It must not run: there is no reviewed shift report in
-+  a handoff record. A 0-section handoff is **not** "all three sections declare
-+  no-shift"; the no-op attestation path requires three explicit declarations
-+  (`items/golden-regen-hatch/assignment.yaml:4-12`; `plan-3.yaml:271-273`).
++  - docs/semantic-justification.md: DecisionBackend,
++  .python-setup-decisions.json, ADR-009, prompt-v1.
 +
-+  - The iteration-5 replacement `golden-regen-hatch-v2` consumes behavior-item
-+  shift declarations directly and does not depend on this item
-+  (`plan-5.3.yaml:882-898`; `plan-5.3.yaml:1282-1283`).
++  - docs/custom-checks.md: DecisionBackend.
 +
-+  - Existing item-level shift evidence is real but is **not** a substitute for
-+  the three epic close-ups:
-+    - `items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml:92-96` — 3 added W9704 findings (unjustified suppression at `tests/data/minimal_sample_project/src/minimal_sample/mod.py:42` for pylint, pylint-pyi, pylint tests), shift reported, golden not regenerated.
-+    - `items/runner-dispatch-split/steps/001-develop-r1-a1/output.yaml:46-48` — golden hash-equal, no shift.
-+    - `items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml:27-29` — golden byte-identical, no shift.
++  - docs/troubleshooting.md: DECISION_MODEL, RERANKER deprecated (and change:150
++  7-pass count).
 +
-+  ## 6. Verification method (falsification attempts)
++  - AGENTS.md pipeline subsection: DecisionBackend.
 +
++  - AGENTS.md counts: 9-collected contract; unit row 1357 pass/7 deselected/0
++  skip.
 +
-+  - `find .factory/tasks/modernize/items -maxdepth 1 -type d -name 'epic-*'` →
-+  only `epic-kickoff-gate`, `epic-shift-report-collection`.
++  - AGENTS.md Tool Scope: add `ruff format | src/, tests/` row.
 +
-+  - `grep -rl '^item: epic-' .factory/tasks/modernize/runs/*/output.yaml` → no
-+  matches.
++  - CHANGELOG.md: v1.2.10 entry with `[semantic]` and `no-go`.
 +
-+  - `grep -rn -i 'justification-class|added/removed|finding keys'` across all
-+  item step outputs/findings → no shift-report sections.
++  - README.md: v1.2.10 pin (currently v1.2.5 at :72); remove stale `[semantic]`
++  sentence-transformer claim at :29.
 +
-+  - `grep -rn -i 'shift'` across wave/plan/architect close-up outputs → no
-+  matches.
++  - docs/adr/README.md: index ADR-013..016, 019..024; add staleness notes to
++  ADR-009:31, ADR-010, ADR-014, ADR-015, ADR-016.
 +
-+  - Parsed `plan-5.yaml`, `plan-5.1.yaml`, `plan-5.2.yaml`, `plan-5.3.yaml` item
-+  outlines → zero `epic-*` slugs in every iteration-5 plan revision.
 +
-+  - Read ADR-011, ADR-013, ADR-023 and iterations 1/3/4 close-ups to confirm the
-+  epics never spawned and were explicitly abandoned.
++  ## Routing
 +
++  - Runner epic owns AGENTS Quick Commands :9-12 + Tool Scope :16-32
++  (ADR-011:31-32).
 +
-+  ## 7. Open concerns reviewed
++  - Semantic epic owns AGENTS pipeline subsection :79-85 (ADR-011:33).
 +
++  - Root owns repo-root docs/CHANGELOG/README/ADRs (ADR-011:54-58).
 +
-+  - `c-3e935debcb` (POSIX-only `fcntl.flock` PoC lock) and `c-5463b26c4b`
-+  (constant rule symbol collapsing the cache rule component) target
-+  `cache-design-spike` / `decision-cache-impl`; they do not affect this fan-in
-+  and do not change the verdict.
-+contextPack: >-
-+  Goal: consolidate 3 epic shift reports into one handoff for
-+  golden-regen-hatch.
++  - Do not edit lint.baseline or .secrets.baseline; do not add baseline entries.
 +
-+  Result: 0/3 close-ups exist -> handoff NOT produced; fail-open triggered; item
-+  must stay blocked/pending.
 +
-+  Required artifacts: epic-runner-modernize, epic-checkers-modernize,
-+  epic-semantic-infrastructure close-ups, each with {justification-class,
-+  added/removed finding keys, CHANGELOG snippet, file:line} or explicit
-+  no-shift.
++  ## Post-develop re-verify
 +
-+  Key evidence: ADR-011:62-69 (contract); plan-3:92 (M2 replanAfter gate),
-+  plan-3:444/530/637 (epic slugs); closeup-3.yaml:7-8 (M2 zero delivery);
-+  086-plan-close-up-3-a1/output.yaml:53-54 +
-+  087-architect-closeup-3-a1/output.yaml:38-39 (epics entirely outstanding);
-+  ADR-013:1-3 + ADR-023:1-3 + plan-5.3:1013-1017,1271-1284 (epics abandoned; no
-+  replanAfter gates; hatch consumes item declarations); state.yaml:257-263 (item
-+  blocked), :316-322 (legacy hatch blocked).
-+
-+  Do not consume this findings file as a handoff record. Current replacement:
-+  plan-5.3 golden-regen-hatch-v2 deps on behavior items (plan-5.3:882-898).
++  Run the four gate commands plus the two integration variants; confirm `git
++  status --porcelain` empty and `.secrets.baseline`/`lint.baseline` unchanged.
 +sources:
-+  - docs/adr/ADR-011.md:5,16,62-69
-+  - docs/adr/ADR-013.md:1-3
-+  - docs/adr/ADR-023.md:1-3
-+  - docs/adr/README.md:30
-+  - .factory/tasks/modernize/plan/plan-3.yaml:92,109,261-277,419-422,444,504-507,530,567-570,637
-+  - .factory/tasks/modernize/plan/plan-5.3.yaml:1013-1017,1262-1284,882-898,115-116
-+  - .factory/tasks/modernize/closeup-1.yaml:8
-+  - .factory/tasks/modernize/closeup-3.yaml:1-18
-+  - .factory/tasks/modernize/closeup-4.yaml:1-19
-+  - .factory/tasks/modernize/runs/086-plan-close-up-3-a1/output.yaml:53-54
-+  - .factory/tasks/modernize/runs/087-architect-closeup-3-a1/output.yaml:38-39
-+  - .factory/tasks/modernize/items/epic-shift-report-collection/assignment.yaml:1-25
-+  - .factory/tasks/modernize/items/golden-regen-hatch/assignment.yaml:17-23
-+  - .factory/tasks/modernize/state.yaml:166-172,257-263,316-322
-+  - .factory/tasks/modernize/concerns/c-81b8a319de.yaml:1-18
-+  - .factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml:92-96
-+  - .factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/output.yaml:46-48
-+  - .factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml:27-29
-+  - CHANGELOG.md:1-18
++  - AGENTS.md:9-12
++  - AGENTS.md:16-32
++  - AGENTS.md:79-85
++  - AGENTS.md:87-93
++  - docs/semantic-justification.md:5-14
++  - docs/semantic-justification.md:18
++  - docs/semantic-justification.md:34-45
++  - docs/custom-checks.md:97
++  - docs/custom-checks.md:104
++  - docs/troubleshooting.md:97-112
++  - docs/troubleshooting.md:150
++  - CHANGELOG.md:3
++  - CHANGELOG.md:113
++  - README.md:29
++  - README.md:72
++  - pyproject.toml:3
++  - pyproject.toml:28-30
++  - pyproject.toml:47-48
++  - pyproject.toml:67
++  - docs/adr/README.md:20-31
++  - docs/adr/ADR-009.md:31
++  - docs/adr/ADR-010.md:26-36
++  - docs/adr/ADR-011.md:31-33
++  - docs/adr/ADR-011.md:54-59
++  - docs/adr/ADR-011.md:68
++  - docs/adr/ADR-014.md:1-3
++  - docs/adr/ADR-015.md:1-3
++  - docs/adr/ADR-016.md:1-3
++  - docs/adr/ADR-024.md:1-3
++  - lint.baseline:1
++  - .gitignore:243-244
++  - .secrets.baseline:42-45
++  - src/python_setup_lint/runner/dispatch.py:168-198
++  - src/python_setup_lint/runner/dispatch.py:312-338
++  - src/python_setup_lint/runner/_tool_specs.py:12-18
++  - src/python_setup_lint/runner/_tool_specs.py:96-99
++  - src/python_setup_lint/runner/types.py:22
++  - src/python_setup_lint/runner/output.py:159-174
++  - src/python_setup_lint/checkers/_base.py:160-252
++  - src/python_setup_lint/checkers/_semantic.py:15-64
++  - src/python_setup_lint/checkers/_decision_backend.py:10-20,50-59
++  - src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152,372,383
++  - src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py:103,116
++  - tests/integration.py:60-122
++  - tests/integration.py:205,257
++  - tests/_project_helpers.py:185-191
++  - tests/_golden.py:53-54,382,392-410
++  - tests/data/golden/minimal_sample_project_findings.json
++  - tests/data/golden/minimal_sample_project_tool_counts.json
++  - commit 882fac0 (secrets-baseline-exclusion)
++  - HEAD ba7c2677a1f20e6dcafeba0198da2120c2b677b1
 +recommendations:
-+  - "Keep epic-shift-report-collection blocked/pending and do not produce a
-+    handoff record: 0/3 epic close-ups exist, so any 3-section handoff would be
-+    fabricated."
-+  - "Do not execute legacy golden-regen-hatch. Route golden handling through the
-+    iteration-5 path: golden-regen-hatch-v2 consumes behavior-item shift
-+    declarations directly (plan-5.3:882-898) and does not depend on this item."
-+  - In the next replan, retire or supersede the stranded
-+    epic-shift-report-collection and legacy golden-regen-hatch items under
-+    ADR-023/ADR-013; otherwise they remain a permanent blocked bottleneck (the
-+    exact failure ADR-013 removed).
-+  - Update ADR-011 status/README to mark the epic decomposition and
-+    shift-handoff section superseded by ADR-013/ADR-023, so future runs do not
-+    re-queue the unsatisfiable item (docs/adr/ADR-011.md:5;
-+    docs/adr/README.md:30).
-+  - If the 3-epic handoff is still required, re-plan and spawn the
-+    runner/checkers/semantic epics and have each emit its close-up; do not
-+    reconstruct epic sections from I4/I5 root-item reports.
++  - In the develop step for this root item, rewrite
++    docs/semantic-justification.md so it literally contains DecisionBackend,
++    .python-setup-decisions.json, ADR-009, and prompt-v1; describe the
++    heuristic-first veto + optional DecisionBackend (threshold 0.5), the ADR-009
++    no-go gate, and the ADR-010 tracked-cache contract as frozen/unimplemented
++    rather than delivered.
++  - Rewrite docs/troubleshooting.md's sentence-transformer section to document
++    PYTHON_SETUP_LINT_DECISION_MODEL (warn-only, no production backend) and
++    PYTHON_SETUP_LINT_RERANKER_MODEL deprecation; update docs/custom-checks.md's
++    check_if_meaningful text to DecisionBackend; change the integration
++    expectation at troubleshooting.md:150 to the 9-collected contract.
++  - Add a CHANGELOG v1.2.10 entry tagged [semantic] that records the
++    no-go/deferred model decision, and bump the README update-workflow pin from
++    v1.2.5 to v1.2.10 while dropping the stale python-setup[semantic]
++    sentence-transformer claim.
++  - Index ADR-013..016 and ADR-019..024 in docs/adr/README.md and add explicit
++    staleness notes to ADR-009:31 (tracked-cache half not delivered), ADR-014
++    (heuristic-first implemented), ADR-015/ADR-024 (open deferrals), and ADR-016
++    (all three HEAD claims false).
++  - "Route the AGENTS.md split by owner: runner epic for Quick Commands counts
++    (1357 pass/7 deselected/0 skip; 9 collected/9 passed, ~70s, 7+2 without
++    pre-commit) and the ruff format Tool Scope row; semantic epic for the
++    DecisionBackend pipeline subsection."
++  - "Do not touch lint.baseline or .secrets.baseline: lint.baseline must stay []
++    and the ^\\\\.factory/ secrets filter is already committed at 882fac0; if a
++    hatch attestation is required, record the byte-identical golden hash
++    c2b8dc3a9ed42832e6906379d0e1a2f8e3823816b33145d786b08efb23799f96 with an
++    explicit no-regen statement."
 +concerns:
 +  - kind: blocker
-+    summary: "Legacy epic handoff item is unsatisfiable in I5: 0/3 epic close-ups
-+      exist and the M2 replanAfter gate is absent"
-+    detail: "The three iteration-3 epics were never spawned (closeup-3: M2 zero
-+      delivery; 086/087 close-ups: 'M2 epic work ... entirely outstanding'), and
-+      iterations 4-5 abandoned epic decomposition (ADR-013:1-3; ADR-023:1-3;
-+      plan-5.3:1013-1017). The item was resumed as a stranded record with state
-+      'blocked' (state.yaml:257-263) even though plan-5.3 declares 'No
-+      replanAfter gates' (:1277). Retries cannot produce the required artifacts;
-+      only a replan can retire or re-scope it."
++    summary: Docs reconciliation is red on every must-contain group at HEAD ba7c267
++    detail: "All required strings are absent: semantic-justification.md
++      (DecisionBackend/.python-setup-decisions.json/ADR-009/prompt-v1),
++      custom-checks.md (DecisionBackend), troubleshooting.md
++      (DECISION_MODEL/RERANKER), AGENTS.md pipeline (DecisionBackend), CHANGELOG
++      ([semantic]/no-go/v1.2.10), README (v1.2.10), and the ADR index/staleness
++      notes. The docs still describe the retired reranker pipeline and ~/.cache
++      model download. Close-out cannot be green until these are routed and fixed
++      per ADR-011 ownership."
 +    severity: high
 +    location:
-+      file: .factory/tasks/modernize/items/epic-shift-report-collection/assignment.yaml
-+      line: 4
++      file: docs/semantic-justification.md
++      line: 9
 +    affects:
-+      - epic-shift-report-collection
-+      - golden-regen-hatch
 +      - final-gate-validation
++      - docs-counts-sync
 +  - kind: risk
-+    summary: Legacy golden-regen-hatch could misread a missing handoff as all-no-shift
-+    detail: The legacy hatch is allowed a no-op only 'If all three handoff sections
-+      declare no-shift' (items/golden-regen-hatch/assignment.yaml:4-12). With
-+      zero sections neither shift nor no-shift is established. Running it on
-+      this findings file as a handoff would violate the reviewed-shift
-+      precondition; the I5 plan replaces it with golden-regen-hatch-v2 consuming
-+      behavior-item declarations (plan-5.3:882-898).
++    summary: golden-regen-hatch report is absent from HEAD
++    detail: No branch, commit, or report for golden-regen-hatch exists (`git branch
++      -a`, `git log --all --grep`); only ADR-011:68 names the item. Golden
++      byte-identity is independently proven by test_setup_new_and_lint (multiset
++      + byte-identical replay), so no regen is needed, but the dependency
++      artifact required by the assignment is not present and must be supplied or
++      explicitly attested before close-out.
 +    severity: medium
 +    location:
-+      file: .factory/tasks/modernize/items/golden-regen-hatch/assignment.yaml
-+      line: 4
++      file: docs/adr/ADR-011.md
++      line: 68
 +    affects:
++      - final-gate-validation
 +      - golden-regen-hatch
-+      - golden-regen-hatch-v2
++  - kind: risk
++    summary: 1.72 GiB of .factory model artifacts are tracked; detect-secrets safety
++      depends on a prefix-anchored baseline filter
++    detail: git ls-files includes 9 .safetensors totalling 1,844,653,898 bytes
++      (largest 789,581,344 B) under .factory/. The runner caps detect-secrets at
++      RLIMIT_AS 2048 MB; scanning one model file reproduces MemoryError in
++      detect_secrets/transformers/config.py:97. The committed
++      `.secrets.baseline` filter ^\\.factory/ is the only thing preventing the
++      failure, and it can be bypassed by a path that does not start with
++      `.factory/` (e.g. `./.factory/...`).
++    severity: medium
++    location:
++      file: .secrets.baseline
++      line: 42
++    affects:
 +      - final-gate-validation
-+  - kind: tech-debt
-+    summary: ADR-011 shift-handoff contract remains 'Accepted' after epic
-+      decomposition was abandoned
-+    detail: ADR-011 status is still 'Accepted' (docs/adr/ADR-011.md:5) and the ADR
-+      index lists it as Accepted (docs/adr/README.md:30), while ADR-013:1-3 and
-+      ADR-023:1-3 supersede epic decomposition and state there is no epic
-+      close-up/handoff bottleneck. The stale accepted contract is why this
-+      stranded item keeps being re-queued.
++  - kind: assumption
++    summary: PoC lock is POSIX-only fcntl.flock; no production lock code exists at HEAD
++    detail: "`git grep fcntl|flock -- ':!.factory'` is empty in tracked source;
++      `_semantic.py` has only an in-process memo and the tracked cache is
++      unimplemented. The POSIX-only-lock concern is therefore deferred to
++      cache-design-spike/decision-cache-impl and must not be documented as a
++      delivered cross-platform mechanism."
++    severity: low
++    location:
++      file: src/python_setup_lint/checkers/_semantic.py
++      line: 15
++    affects:
++      - cache-design-spike
++      - decision-cache-impl
++  - kind: assumption
++    summary: Production call sites pass constant rule symbols, collapsing the
++      cache-key rule component
++    detail: 'Confirmed at HEAD: suppression_justification_checker.py:152,372,383
++      pass rule="unjustified-suppression" and
++      bare_except_comment_checker.py:103,116 pass rule="bare-except-comment".
++      _semantic.py:48-58 includes rule in the SHA-256 key, so it is constant per
++      checker; the key also truncates to 64 bits at _semantic.py:59. Impact is
++      in-process only today (no tracked cache), but the tracked-cache design
++      must not assume distinct rule values.'
 +    severity: medium
 +    location:
-+      file: docs/adr/ADR-011.md
-+      line: 5
++      file: src/python_setup_lint/checkers/conformance/suppression_justification_checker.py
++      line: 152
 +    affects:
-+      - epic-shift-report-collection
-+      - docs-adr-reconciliation
-+      - docs-adr-reconciliation-v2
++      - cache-design-spike
++      - decision-cache-impl
 +remarkable:
-+  - chosen: "Honor fail-open: report 0/3 close-ups and keep the item blocked/pending
-+      rather than synthesizing a handoff"
-+    why: ADR-011:64-69 and assignment.yaml:10-12 require all three epic close-ups
-+      and forbid fabrication. Item-level shift declarations exist but are
-+      single-owner item reports, not epic close-ups, so relabeling them would
-+      poison the golden-regen-hatch precondition.
++  - chosen: Treat detect-secrets as GREEN at HEAD via the already-committed
++      `^\\.factory/` baseline filter, without editing any baseline and without
++      changing the 2048 MB tool cap.
++    why: The exact git-ls-files scan exits 0 in 8s and lint reports PASSED; the
++      filter was committed by ancestor 882fac0. The MemoryError is reproducible
++      only when a path alias bypasses the prefix regex under RLIMIT_AS 2 GB,
++      which proves the mechanism without requiring a fix at HEAD.
 +    alternatives:
-+      - Reconstruct three pseudo-close-ups from I4/I5 item-level shift
-+        declarations
-+      - Treat plan-level closeup-3/closeup-4 as the three epic close-ups
-+      - Emit three root-authored no-shift declarations in place of missing epic
-+        close-ups
-+  - chosen: Recommend the iteration-5 ADR-023 item-level path
-+      (golden-regen-hatch-v2) rather than reviving epics to satisfy the legacy
-+      contract
-+    why: The I5 plan explicitly ships no child epics and the v2 hatch depends only
-+      on behavior items (plan-5.3:1013-1017, 1271-1284, 882-898). Reviving epics
-+      would reintroduce the empty-wave/bottleneck failure ADR-013 and ADR-023
-+      removed.
++      - Stop tracking the .factory model artifacts (removes 1.72 GiB but changes
++        the checkout)
++      - Add a ToolSpec path/exclude for detect-secrets (currently ignored at
++        dispatch.py:179)
++      - Raise the per-tool memory limit above 2048 MB (weakens the OOM guard)
++  - chosen: Accept the integration golden byte-identity assertion as the golden gate
++      evidence and record the missing golden-regen-hatch report as a medium risk
++      rather than regenerating the golden.
++    why: test_setup_new_and_lint asserts both multiset equality and a byte-identical
++      replay on a fresh copy; golden has been unchanged since 1a811af;
++      regeneration would be an unreviewed diff with no behavior change to
++      justify it.
 +    alternatives:
-+      - Reintroduce runner/checkers/semantic epics in I6 solely to produce
-+        close-ups
-+      - Keep the legacy item pending indefinitely and let it block legacy
-+        golden-regen-hatch
++      - Block close-out until the golden-regen-hatch item produces its report
++      - Regenerate via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 and review the diff
++      - Pin only the golden file hash without the replay assertion
 diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
-index 2615929..3591d6a 100644
+index 2615929..a1792be 100644
 --- a/.factory/tasks/modernize/journal.ndjson
 +++ b/.factory/tasks/modernize/journal.ndjson
-@@ -2238,43 +2238,3 @@
- {"type":"step_timeout_armed","task":"modernize","item":"epic-kickoff-gate","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:59:23.331Z"}
- {"type":"step_transcript_size_warning","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"sizeBytes":15060344,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-59-23-689Z_01a1c2c0-9629-723b-9b20-769bd656e054.jsonl","ts":"2026-11-10T00:08:48.380Z"}
- {"type":"step_tool_call_warning","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"toolCalls":95,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-59-23-689Z_01a1c2c0-9629-723b-9b20-769bd656e054.jsonl","ts":"2026-11-10T00:08:48.382Z"}
--{"type":"step_finished","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2c0-9629-723b-9b20-769bd656e054","usage":{"inputTokens":121841,"outputTokens":49513,"costUsd":0.057369},"ts":"2026-11-10T00:08:48.680Z"}
--{"type":"step_started","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-shift-report-collection/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1","ts":"2026-11-10T00:09:19.937Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"epic-shift-report-collection","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:09:19.943Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"sizeBytes":22559494,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"toolCalls":65,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
+@@ -2243,38 +2243,3 @@
+ {"type":"step_timeout_armed","task":"modernize","item":"epic-shift-report-collection","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:09:19.943Z"}
+ {"type":"step_transcript_size_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"sizeBytes":22559494,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
+ {"type":"step_tool_call_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"toolCalls":65,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
 -{"type":"step_finished","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2c9-b140-700c-9319-d3dbbbaad9b1","usage":{"inputTokens":88261,"outputTokens":36328,"costUsd":0.040594},"ts":"2026-11-10T00:14:51.724Z"}
 -{"type":"step_started","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--final-gate-validation/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1","ts":"2026-11-10T00:15:14.068Z"}
 -{"type":"step_timeout_armed","task":"modernize","item":"final-gate-validation","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:15:14.073Z"}
@@ -3097,34 +2998,26 @@ index 04afd52..0000000
 -text: "No replan needed: ADR-023 governs I5 delivery; I6 replans M2/M3 without
 -  epics."
 diff --git a/.factory/tasks/modernize/state.yaml b/.factory/tasks/modernize/state.yaml
-index 022c7ef..1a3cfd5 100644
+index 022c7ef..1d8ebf6 100644
 --- a/.factory/tasks/modernize/state.yaml
 +++ b/.factory/tasks/modernize/state.yaml
-@@ -2,7 +2,7 @@ task: modernize
- kind: saga
- status: active
- iteration: 5
--currentWave: 2
-+currentWave: 3
- items:
-   adr-formalization:
-     kind: no-behavior
-@@ -165,12 +165,11 @@ items:
+@@ -165,12 +165,12 @@ items:
      mergedAt: 2026-11-09T00:11:56-05:00
    epic-kickoff-gate:
      kind: fact-finder
 -    status: ready
-+    status: blocked
++    status: running
      branch: topic/modernize--epic-kickoff-gate
      attempts: 1
      fixRounds: 1
 -    spendUsd: 0.073828
 -    currentStep: review
-+    spendUsd: 0
++    spendUsd: 0.057369
++    currentStep: research
    golden-contract-hardening:
      kind: test-only
      status: merged
-@@ -217,12 +216,12 @@ items:
+@@ -217,12 +217,12 @@ items:
      mergedAt: 2026-11-09T13:56:23-05:00
    cache-design-spike:
      kind: poc
@@ -3140,12 +3033,12 @@ index 022c7ef..1a3cfd5 100644
    checkers-legacy-dead-cleanup:
      kind: no-behavior
      status: blocked
-@@ -257,12 +256,11 @@ items:
+@@ -257,12 +257,11 @@ items:
      mergedAt: 2026-11-08T10:47:48-05:00
    epic-shift-report-collection:
      kind: fact-finder
 -    status: running
-+    status: blocked
++    status: pending
      branch: topic/modernize--epic-shift-report-collection
      attempts: 1
      fixRounds: 1
@@ -3155,7 +3048,7 @@ index 022c7ef..1a3cfd5 100644
    remaining-lint-violations-fix:
      kind: no-behavior
      status: merged
-@@ -301,12 +299,12 @@ items:
+@@ -301,12 +300,12 @@ items:
      mergedAt: 2026-11-09T01:20:54-05:00
    coding-rules-audit:
      kind: fact-finder
@@ -3171,12 +3064,12 @@ index 022c7ef..1a3cfd5 100644
    decision-cache-impl:
      kind: dev
      status: failed
-@@ -317,12 +315,11 @@ items:
+@@ -317,12 +316,11 @@ items:
      currentStep: qa
    golden-regen-hatch:
      kind: test-only
 -    status: running
-+    status: blocked
++    status: pending
      branch: topic/modernize--golden-regen-hatch
      attempts: 1
      fixRounds: 1
@@ -3186,12 +3079,12 @@ index 022c7ef..1a3cfd5 100644
    never-test-linting-prune:
      kind: test-only
      status: merged
-@@ -343,12 +340,11 @@ items:
+@@ -343,12 +341,11 @@ items:
      mergedAt: 2026-11-08T12:55:17-05:00
    final-gate-validation:
      kind: fact-finder
 -    status: running
-+    status: blocked
++    status: pending
      branch: topic/modernize--final-gate-validation
      attempts: 1
      fixRounds: 1
@@ -3201,7 +3094,7 @@ index 022c7ef..1a3cfd5 100644
    semantic-tests-rewrite:
      kind: test-only
      status: blocked
-@@ -358,12 +354,11 @@ items:
+@@ -358,12 +355,11 @@ items:
      spendUsd: 0
    test-debloat-audit:
      kind: fact-finder
@@ -3216,7 +3109,7 @@ index 022c7ef..1a3cfd5 100644
    docs-reconciliation:
      kind: no-behavior
      status: blocked
-@@ -425,12 +420,12 @@ items:
+@@ -425,12 +421,12 @@ items:
      branch: topic/modernize--docs-counts-sync
      attempts: 1
      fixRounds: 1
@@ -3226,14 +3119,14 @@ index 022c7ef..1a3cfd5 100644
 +    currentStep: test-first
  concerns:
 -  open: 15
-+  open: 12
++  open: 16
    dismissed: 0
 -  routed: 20
 +  routed: 1
    resolved: 2
  debt:
    - No compliant model proven (215/0 unevaluable, single-author labels, Fastino
-@@ -471,40 +466,6 @@ debt:
+@@ -471,40 +467,6 @@ debt:
      determinism; oracle + per-tool coverage + tool-qualified brush-off/carry
      lookups prove sensitivity. QA rejected 2/2 solely on red-test; all other
      checks passed. No src follow-up required."
@@ -3274,7 +3167,7 @@ index 022c7ef..1a3cfd5 100644
    - "[adr-formalization] ADR-012 examples could include conformance/ path prefix"
    - "[adr-formalization] H1 heading prefix inconsistent between new and legacy
      ADRs"
-@@ -635,11 +596,6 @@ debt:
+@@ -635,11 +597,6 @@ debt:
      decision-model warnings"
    - "[decision-backend-impl] Expand nested ternary in normalize_suppressed_codes"
    - "[decision-backend-impl] Add minimal docstrings to decision-backend stub"
@@ -3286,7 +3179,7 @@ index 022c7ef..1a3cfd5 100644
    - "[golden-contract-hardening] Add runs guard and messages to byte-identical
      hash asserts"
    - "[golden-contract-hardening] Consider SHA-256 comparison for counts payloads
-@@ -668,15 +624,6 @@ debt:
+@@ -668,15 +625,6 @@ debt:
      excludes it (6/336)"
    - "[secrets-triage-spike] Scope the --baseline masking claim to
      detect-secrets-scoped runs"
@@ -3302,7 +3195,7 @@ index 022c7ef..1a3cfd5 100644
    - "[coding-rules-audit-i2] Reconcile beartype taxonomy: true total is 26
      sites, A22 undercounts by 2"
    - "[coding-rules-audit-i2] A33 counts drift: measured 45 W9740 in src+scripts,
-@@ -700,16 +647,6 @@ debt:
+@@ -700,16 +648,6 @@ debt:
    - "[runner-dispatch-split] dispatch.py at 449/500 leaves 51 lines headroom"
    - "[stale-disables-portability-cleanup] Slow downstream test still uses fixed
      Path.home()/.tmp scratch dir"
@@ -3319,20 +3212,20 @@ index 022c7ef..1a3cfd5 100644
    - "[decision-cache-impl] decisions/ lacks __init__.py while checkers/ and
      runner/ have one"
    - "[never-test-linting-prune] Stale docstring references deleted live test
-@@ -748,16 +685,16 @@ debt:
+@@ -748,16 +686,16 @@ debt:
      obscure"
    - '[consolidate-integration-helpers-v3] make_consumer_project hardcodes
      "consumer" dirname for hooks test'
 -budgetSpentUsd: 12.886620685999995
-+budgetSpentUsd: 12.480125685999996
++budgetSpentUsd: 12.537494685999997
  spendByRole:
    workhorse:
 -    costUsd: 6.130492685999999
 -    inputTokens: 12388371
 -    outputTokens: 4477517
-+    costUsd: 5.757301685999999
-+    inputTokens: 11302017
-+    outputTokens: 4197288
++    costUsd: 5.8146706859999995
++    inputTokens: 11423858
++    outputTokens: 4246801
    alt-workhorse:
 -    costUsd: 1.5711220000000006
 -    inputTokens: 7463008
@@ -3343,7 +3236,7 @@ index 022c7ef..1a3cfd5 100644
    architect:
      costUsd: 5.057522999999998
      inputTokens: 20158964
-@@ -891,30 +828,18 @@ spendByItem:
+@@ -891,30 +829,22 @@ spendByItem:
      costUsd: 0.19651400000000002
      inputTokens: 713974
      outputTokens: 167344
@@ -3355,10 +3248,13 @@ index 022c7ef..1a3cfd5 100644
      costUsd: 0.259824
      inputTokens: 463214
      outputTokens: 227545
--  epic-kickoff-gate:
+   epic-kickoff-gate:
 -    costUsd: 0.073828
 -    inputTokens: 188519
 -    outputTokens: 87729
++    costUsd: 0.057369
++    inputTokens: 121841
++    outputTokens: 49513
    cache-design-spike:
 -    costUsd: 0.109595
 -    inputTokens: 192123
@@ -3380,7 +3276,7 @@ index 022c7ef..1a3cfd5 100644
    decision-cache-impl:
      costUsd: 0.393308
      inputTokens: 802730
-@@ -923,18 +848,10 @@ spendByItem:
+@@ -923,18 +853,10 @@ spendByItem:
      costUsd: 0.258951
      inputTokens: 549144
      outputTokens: 175859
@@ -3402,12 +3298,12 @@ index 022c7ef..1a3cfd5 100644
    pylint-cache-assumptions:
      costUsd: 0.23190968599999998
      inputTokens: 455233
-@@ -947,4 +864,4 @@ spendByItem:
+@@ -947,4 +869,4 @@ spendByItem:
      costUsd: 6.273198999999999
      inputTokens: 24056719
      outputTokens: 2199382
 -lastUpdated: 2026-11-10T01:56:24.655Z
-+lastUpdated: 2026-11-09T23:58:57.375Z
++lastUpdated: 2026-11-10T00:08:53.351Z
 diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-c-81b8a319de.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-c-81b8a319de.yaml
 deleted file mode 100644
 index 821c823..0000000
diff --git a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/meta.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/meta.yaml
similarity index 50%
rename from .factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/meta.yaml
rename to .factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/meta.yaml
index f7cdd39..43993a3 100644
--- a/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1/meta.yaml
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/meta.yaml
@@ -9,11 +9,11 @@ models:
   - opencode-go/deepseek-v4.1-flash
 timeoutSec: 3600
 status: ok
-startedAt: 2026-11-10T01:57:47.340Z
-session: 01a1c32c-fc3a-739a-bdf5-12561aba5a62
-endedAt: 2026-11-10T02:01:25.222Z
+startedAt: 2026-11-10T02:01:30.182Z
+session: 01a1c330-62ff-70fa-b95e-f3ae4acfa416
+endedAt: 2026-11-10T02:23:05.887Z
 usage:
-  inputTokens: 72270
-  outputTokens: 7195
-  costUsd: 0.008666
-traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T01-57-47-706Z_01a1c32c-fc3a-739a-bdf5-12561aba5a62.jsonl
+  inputTokens: 79826
+  outputTokens: 38243
+  costUsd: 0.01706
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T02-01-30-623Z_01a1c330-62ff-70fa-b95e-f3ae4acfa416.jsonl
diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/output.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/output.yaml
new file mode 100644
index 0000000..5238697
--- /dev/null
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1/output.yaml
@@ -0,0 +1,101 @@
+status: changes_requested
+summary: "Gate greens reproduced; docs-red valid; 1 findings defect: golden
+  W9704 claimed 0, actual 18"
+suggestions:
+  - id: c-1882d3f0f7
+    disposition: optional
+    summary: Constant rule symbols collapse cache-key rule component
+    detail: "Verified at HEAD: 3 call sites pass rule=unjustified-suppression and 2
+      pass rule=bare-except-comment; _semantic.py includes rule then truncates
+      SHA-256 to 64 bits. In-process only today. Downstream cache-design debt,
+      not this read-only gate."
+    location:
+      file: src/python_setup_lint/checkers/conformance/suppression_justification_checker.py
+      line: 152
+  - id: c-5a67b09b19
+    disposition: optional
+    summary: Tracked 1.72GiB safetensors; detect-secrets relies on prefix filter
+    detail: "Verified: 9 safetensors 1844653898B, largest 789581344B; RLIMIT_AS
+      2048MB; MemoryError reproduced via ./.factory bypass at config.py:97; HEAD
+      git-ls-files scan exit 0 via ^\\.factory/ filter from ancestor 882fac0.
+      GREEN stands; residual infra fragility, no baseline edit."
+    location:
+      file: .secrets.baseline
+      line: 42
+  - id: c-a816c72150
+    disposition: optional
+    summary: Golden-regen-hatch report absent from HEAD
+    detail: "Verified absent (only ADR-011:68 names item; side-branch 10fa9d0 not
+      ancestor). Byte-identity independently proven: 158 findings, hashes
+      c2b8dc3a/1d239741 match, multiset+byte-replay pass, unchanged since
+      1a811af. No regen needed; track hatch artifact downstream."
+    location:
+      file: docs/adr/ADR-011.md
+      line: 68
+  - id: c-b18093e36e
+    disposition: optional
+    summary: No production lock; PoC fcntl concern deferred
+    detail: "Verified: no fcntl/flock in src/; _semantic.py is in-process memo only,
+      tracked cache unimplemented. POSIX-only question belongs to
+      cache-design-spike/decision-cache-impl, not documented as delivered."
+    location:
+      file: src/python_setup_lint/checkers/_semantic.py
+      line: 15
+  - id: c-fd163ed069
+    disposition: architect
+    summary: Docs red on all must-contain groups; needs new-item routing
+    detail: "Verified RED: 0 hits for
+      DecisionBackend/.python-setup-decisions.json/ADR-009/prompt-v1/DECISION_M\
+      ODEL/RERANKER; stale reranker/7-pass/v1.2.5/v1.2.9 texts present; ADR
+      index stops at 012. Research routing matches ADR-011 single-writer map
+      with no baseline edits. Scheduling the new root/epic follow-up items
+      exceeds read-only research scope."
+    location:
+      file: docs/semantic-justification.md
+      line: 9
+  - id: c-b0cfd8817b
+    disposition: optional
+    summary: Legacy hatch fail-open; this gate is no-regen byte-identity only
+    detail: "Valid scope guard: legacy 0/3 handoff must not be read as all-no-shift;
+      consume as no-authorized-regen plus hash equality. V2 consumes
+      behavior-item declarations downstream."
+    location:
+      file: tests/data/golden/minimal_sample_project_findings.json
+  - id: c-4fe00e3cba
+    disposition: optional
+    summary: UNIFIED ownership map unavailable; ADR-011 labels provisional
+    detail: "Valid: map lives in orchestration records research must not inspect;
+      ADR-011 five-owner labels used with explicit confirm-downstream caveat.
+      Downstream test-debloat must confirm each row."
+  - id: c-5e0d0157c2
+    disposition: optional
+    summary: Keep test_testing_fakes.py; testing.py is shipped API
+    detail: "Verified: testing.py ships
+      FakeRunCmd/make_lint_result/test_checked_main/precommit validators.
+      Debloat must not remove as test-infra-only."
+    location:
+      file: src/python_setup_lint/testing.py
+      line: 45
+  - id: c-7010722c77
+    disposition: optional
+    summary: Rcfile parity unguarded after consistency-test deletion
+    detail: "Verified: 644774e deleted sole DESIGN/STUB-CHECKER parity test; no
+      surviving guard; watchdog SKIPPED. Downstream config-parity/debloat debt."
+    location:
+      file: tests/runner/test_config_consistency.py
+      line: 1
+  - id: golden-w9704-count-error
+    disposition: fix
+    summary: Findings claim 0 W9704 but golden holds 18 unjustified-suppression
+    detail: "Factually wrong in summary/findings/contextPack: golden has 18
+      rule=unjustified-suppression (6 each pylint/pylint-tests/pylint-pyi at
+      lines
+      83,118,125,132,139,146,426,461,468,475,482,489,664,699,706,713,720,727);
+      W9704 symbol maps to unjustified-suppression at
+      suppression_justification_checker.py:34-36. Byte-identical GREEN verdict
+      still holds, but evidence misleads semantic/docs follow-ups. Fix-round:
+      correct 0 to 18 with no repo writes; also fix traceback frame _parse_file
+      to __init__ (line 97 correct)."
+    location:
+      file: tests/data/golden/minimal_sample_project_findings.json
+      line: 83
diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/input.md b/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/input.md
new file mode 100644
index 0000000..13be364
--- /dev/null
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/input.md
@@ -0,0 +1,110 @@
+# Step: Research
+
+## Goal
+Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
+
+## Rules
+- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
+- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
+- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
+- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
+- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
+- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
+
+## Assignment
+{
+  "slug": "final-gate-validation",
+  "kind": "fact-finder",
+  "title": "Final gate table and docs reconciliation check",
+  "assignment": "Root-owned final validation (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). Record final gate table: format exit 0; lint per-tool results on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); pytest -q green (pass/skip/deselect counts); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without via ensure_precommit_or_skip); golden byte-identical or regen-with-reviewed-diff per hatch report; lint.baseline []; docs reconciliation with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts to 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits. Covers M3 close-out, TD3-A1/TD3-I2.",
+  "outlineRef": "final-gate-validation",
+  "milestone": "M3",
+  "wave": 5,
+  "deps": [
+    "golden-regen-hatch"
+  ],
+  "scenarioRefs": [
+    "M3: Iteration closes with evidence"
+  ],
+  "citations": [
+    "docs/semantic-justification.md:5-14",
+    "docs/semantic-justification.md:34-45",
+    "AGENTS.md:79-85",
+    "AGENTS.md:87-93",
+    "lint.baseline:1-1",
+    ".gitignore:243-244"
+  ]
+}
+
+## Task Intent
+# modernize
+
+Modernize the project while preserving every material lint/check behavior.
+- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
+- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
+- Remove redundant tests.
+- Replace the embedding/rerank based justification/comment check
+  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
+  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
+  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
+
+
+## Context & Citations
+[
+  "docs/semantic-justification.md:5-14",
+  "docs/semantic-justification.md:34-45",
+  "AGENTS.md:79-85",
+  "AGENTS.md:87-93",
+  "lint.baseline:1-1",
+  ".gitignore:243-244"
+]
+
+## Review Feedback
+- [FIX] Findings claim 0 W9704 but golden holds 18 unjustified-suppression: Factually wrong in summary/findings/contextPack: golden has 18 rule=unjustified-suppression (6 each pylint/pylint-tests/pylint-pyi at lines 83,118,125,132,139,146,426,461,468,475,482,489,664,699,706,713,720,727); W9704 symbol maps to unjustified-suppression at suppression_justification_checker.py:34-36. Byte-identical GREEN verdict still holds, but evidence misleads semantic/docs follow-ups. Fix-round: correct 0 to 18 with no repo writes; also fix traceback frame _parse_file to __init__ (line 97 correct). (tests/data/golden/minimal_sample_project_findings.json)
+
+- [OPTIONAL] Constant rule symbols collapse cache-key rule component: Verified at HEAD: 3 call sites pass rule=unjustified-suppression and 2 pass rule=bare-except-comment; _semantic.py includes rule then truncates SHA-256 to 64 bits. In-process only today. Downstream cache-design debt, not this read-only gate.
+- [OPTIONAL] Tracked 1.72GiB safetensors; detect-secrets relies on prefix filter: Verified: 9 safetensors 1844653898B, largest 789581344B; RLIMIT_AS 2048MB; MemoryError reproduced via ./.factory bypass at config.py:97; HEAD git-ls-files scan exit 0 via ^\.factory/ filter from ancestor 882fac0. GREEN stands; residual infra fragility, no baseline edit.
+- [OPTIONAL] Golden-regen-hatch report absent from HEAD: Verified absent (only ADR-011:68 names item; side-branch 10fa9d0 not ancestor). Byte-identity independently proven: 158 findings, hashes c2b8dc3a/1d239741 match, multiset+byte-replay pass, unchanged since 1a811af. No regen needed; track hatch artifact downstream.
+- [OPTIONAL] No production lock; PoC fcntl concern deferred: Verified: no fcntl/flock in src/; _semantic.py is in-process memo only, tracked cache unimplemented. POSIX-only question belongs to cache-design-spike/decision-cache-impl, not documented as delivered.
+- [OPTIONAL] Legacy hatch fail-open; this gate is no-regen byte-identity only: Valid scope guard: legacy 0/3 handoff must not be read as all-no-shift; consume as no-authorized-regen plus hash equality. V2 consumes behavior-item declarations downstream.
+- [OPTIONAL] UNIFIED ownership map unavailable; ADR-011 labels provisional: Valid: map lives in orchestration records research must not inspect; ADR-011 five-owner labels used with explicit confirm-downstream caveat. Downstream test-debloat must confirm each row.
+- [OPTIONAL] Keep test_testing_fakes.py; testing.py is shipped API: Verified: testing.py ships FakeRunCmd/make_lint_result/test_checked_main/precommit validators. Debloat must not remove as test-infra-only.
+- [OPTIONAL] Rcfile parity unguarded after consistency-test deletion: Verified: 644774e deleted sole DESIGN/STUB-CHECKER parity test; no surviving guard; watchdog SKIPPED. Downstream config-parity/debloat debt.
+
+## Open Concerns
+- id: rm-af822ddbc6
+  kind: remarkable
+  summary: Accept the modify/delete resolution for tests/runner/test_pyright_noise_filter.py and tests/runner/test_self_lint_clean.py (deletion wins).
+- id: rm-4cf584f209
+  kind: remarkable
+  summary: Derive expected docs counts from a real nested `pytest --collect-only` run and from `dispatch.TOOLS` at test time
+- id: rm-68620e2e61
+  kind: remarkable
+  summary: Retarget the semantic-owned test block to TestAnyElementCodeEcho:366-392
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","inconclusive"])
+- summary (string, required)
+- findings (string, required)
+- contextPack (string, optional)
+- sources (array of string, optional)
+- recommendations (array of string, optional)
+- concerns (array of object, optional): Structured concerns raised while investigating
+  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
+  - summary (string, required)
+  - detail (string, optional)
+  - severity (string, optional, enum: ["low","medium","high"])
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
+  - affects (array of string, optional)
+- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
+  - chosen (string, required)
+  - why (string, required)
+  - alternatives (array of string, required)
diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/meta.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/meta.yaml
new file mode 100644
index 0000000..9b0cb5f
--- /dev/null
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
+name: research
+attempt: 1
+fixRound: 2
+agent: fact-finder
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 3600
+status: ok
+startedAt: 2026-11-10T03:08:45.641Z
+session: 01a1c36d-f617-7640-8382-a66611ba3c58
+endedAt: 2026-11-10T03:19:39.179Z
+usage:
+  inputTokens: 85333
+  outputTokens: 44042
+  costUsd: 0.043576
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T03-08-45-975Z_01a1c36d-f617-7640-8382-a66611ba3c58
diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/output.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/output.yaml
new file mode 100644
index 0000000..46137a0
--- /dev/null
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1/output.yaml
@@ -0,0 +1,266 @@
+status: ok
+summary: "Final gate validated at HEAD 2004b1dd (worktree clean): format exit 0,
+  all 14 lint tools green (13 PASSED + detect-secrets exit 0 at HEAD via the
+  baseline ^\\.factory/ filter), pytest -q 1357 passed / 7 deselected / 0
+  skipped, integration 9 collected / 9 passed / 0 failed with pre-commit 4.6.0
+  (7+2 skip mechanism when absent), golden byte-identical (158 findings; hashes
+  c2b8dc3a…/1d239741…; no regen), lint.baseline []. Docs reconciliation is RED
+  at HEAD on all 9 must-contain cells
+  (semantic-justification/custom-checks/troubleshooting/AGENTS
+  pipeline/CHANGELOG [semantic]+no-go/AGENTS counts+ruff-format row/CHANGELOG
+  version/README pin/ADR staleness), so those route back to owning items, never
+  baseline edits. Fix-round corrections applied: golden holds 18 W9704-symbol
+  findings (rule=unjustified-suppression; 6 pylint + 6 pylint tests + 6
+  pylint-pyi), not 0; the detect-secrets MemoryError frame is
+  IniFileParser.__init__ at config.py:97 (not _parse_file)."
+findings: |-
+  # Final gate validation — M3 close-out
+
+  HEAD `2004b1dd02fb5ec7810a1eee8c3b3dda5f55edcd`; worktree `git status --porcelain` empty; `lint.baseline` = `[]` (2 bytes, sha256 4f53cda1…).
+
+  ## Fix-round corrections (review feedback)
+
+  1. **W9704 count is 18, not 0.** The golden has **no** literal `"rule": "W9704"` (0 matches). W9704's symbol is `unjustified-suppression` (`src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:34-36`). Exact multiset in `tests/data/golden/minimal_sample_project_findings.json`: `pylint` 6, `pylint tests` 6, `pylint-pyi` 6 = 18. JSON lines: 83,118,125,132,139,146 (pylint); 426,461,468,475,482,489 (pylint tests); 664,699,706,713,720,727 (pylint-pyi). Source lines in `src/minimal_sample/mod.py`: 9,41,49,63,63,63 per tool. Total golden findings 158 (matches `minimal_sample_project_tool_counts.json`). The earlier '0 W9704' claim was a field-name error (looked for rule literal `W9704` instead of symbol `unjustified-suppression`); the byte-identical GREEN verdict is unchanged.
+  2. **MemoryError frame is `IniFileParser.__init__`, not `_parse_file`.** `.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py:90-97` defines `__init__`; line 97 is `content = file.read()` (the raiser). It is reached through `_parse_file` (`config.py:43-49`) from `EagerConfigFileTransformer.parse_file` (`config.py:29-40`).
+
+  ## Gate table (green)
+
+  | Cell | Evidence | Result |
+  |---|---|---|
+  | Format | `uv run ruff format --check --config config/ruff.toml src tests` → exit 0, '191 files already formatted'; runner `[ruff format] PASSED [0.0s]`. Scope/config: `src/python_setup_lint/runner/_tool_specs.py:11-18`, `config/ruff.toml:1-3`. (Bare `ruff format --check .` is not the contract: pyproject has no `[tool.ruff]`, so it defaults to 88 cols and would reformat 147 files.) | GREEN |
+  | Lint 14 tools | `uv run lint --tools '<13 tools>'` exit 0, all PASSED: tach check 0.3s, ruff format 0.0s, ruff check 0.1s, rumdl check 0.1s, mypy 5.6s, mypy.stubtest 6.8s, pyright check 3.9s, pyright verify types 0.9s, pylint 8.7s, pylint-pyi 8.7s, pylint tests 14.4s, ty check 0.2s, yamllint 0.2s. detect-secrets run separately against HEAD baseline: exit 0, 2.28s. Mechanism: `_DetectSecretsLintTool.build_command` runs `git ls-files -z | xargs -0 detect-secrets scan --baseline .secrets.baseline` (`src/python_setup_lint/runner/dispatch.py:181-189`); HEAD baseline carries `detect_secrets.filters.regex.should_exclude_file` pattern `^\\.factory/` (`.secrets.baseline:41-46`), so the 9 tracked `*.safetensors` (1,844,653,898 B total; largest 789,581,344 B) are skipped. Without that filter the bootstrap path (`dispatch.py:190-198`) feeds unknown extensions to the eager transformer (`determine_file_type` → `FileType.OTHER`, `detect_secrets/util/filetype.py:20-58`; eager selection `audit/common.py:113-118`) and `file.read()` at `config.py:97` exceeds the runner's 2048 MB `RLIMIT_AS` (`src/python_setup_lint/runner/types.py:22`, `output.py:171-181`) → MemoryError. | GREEN |
+  | Unit pytest | `uv run pytest -q` → **1357 passed, 7 deselected, 0 skipped**, 4 warnings, 24.37s. (`addopts = -m 'not slow'`, `pyproject.toml:48`; 7 deselected are the slow set.) | GREEN |
+  | Integration | `--collect-only -q` → **9 tests collected**. `uv run pytest tests/integration.py -q` → **9 passed, 0 failed**, 63.96s, with pre-commit 4.6.0 available in `.venv/bin`. Without the binary, `ensure_precommit_or_skip` (`tests/_project_helpers.py:185-191`) skips the two pre-commit-dependent tests (`tests/integration.py:205,257`) → 7 passed + 2 skipped. This split is environment-dependent because `tests/conftest.py:29-34` forcibly prepends `.venv/bin` to PATH, so the venv here always exposes pre-commit. | GREEN |
+  | Golden byte-identity | 158 findings; sha256 `minimal_sample_project_findings.json` = c2b8dc3a9ed42832e6906379d0e1a2f8e3823816b33145d786b08efb23799f96, `minimal_sample_project_tool_counts.json` = 1d239741f47669aa7d49ea786d57eea6435ebb8662cd3505fbafb8f33d048363. `assert_golden_byte_identical` (`tests/_golden.py:392`) executed by `tests/integration.py:122` passed. Last golden change: commit `1a811af`. No regen, no reviewed diff needed. `golden-regen-hatch` report is not present at HEAD (only `docs/adr/ADR-011.md:68` names the item), so consume the result as 'no authorized regen + hash equality'; behavior-shift declarations belong to the downstream hatch consumer. | GREEN (byte-identical) |
+  | lint.baseline | `[]`, 2 bytes, sha256 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945. No baseline edits. | GREEN |
+
+  ## Docs reconciliation (all RED at HEAD)
+
+  Must-contain probe results (grep -cF, exact strings):
+
+  | File | Expected string(s) | Found | Result / evidence |
+  |---|---|---|---|
+  | `docs/semantic-justification.md` | `DecisionBackend`, `.python-setup-decisions.json`, `ADR-009`, `prompt-v1` | 0 / 0 / 0 / 0 | RED. File still describes sentence-transformers/reranker pipeline and `~/.cache/python-setup/semantic/results.json` (lines 3, 9-14, 18, 26, 36, 43, 51-54). |
+  | `docs/custom-checks.md` | `DecisionBackend` | 0 | RED. Line 97 still documents reranker-first `check_if_meaningful` and `PYTHON_SETUP_LINT_RERANKER_MODEL`. |
+  | `docs/troubleshooting.md` | `DECISION_MODEL` + `RERANKER` deprecated | 0 / 0 | RED. Lines 97-109 still document sentence-transformer download/model cache; line 150 says 'Expected: 7 pass, ~39s'. |
+  | `AGENTS.md` semantic pipeline | `DecisionBackend` | 0 | RED. Lines 82 and 85 still say 'cross-encoder reranker' / `PYTHON_SETUP_LINT_RERANKER_MODEL`. |
+  | `CHANGELOG.md` | `[semantic]`, `no-go` | 0 / 0 | RED. Top entry is `## v1.2.9 (2026-07-05)`; no modernization entry. |
+  | `AGENTS.md` counts | 9-collected contract | absent | RED. Line 11 says 'Integration tests (7 pass, ~30s)' vs observed 9 collected/9 passed. Adjacent line 10 is also stale: '1290 pass, 4 skip, 15 deselected' vs observed 1357 passed, 0 skipped, 7 deselected. |
+  | `AGENTS.md` Tool Scope | `ruff format` row | absent | RED. Table lines 18-32 lists `ruff check` (line 21) but no `ruff format` row; expected scope `src/`, `tests/` per `_tool_specs.py:11-18`. |
+  | `CHANGELOG.md` version | matches `pyproject.toml` | mismatch | RED. `pyproject.toml:3` = `1.2.10`; CHANGELOG top = `v1.2.9` (`CHANGELOG.md:3`). |
+  | `README.md` pin | current release pin | mismatch | RED. `README.md:72` pins `@v1.2.5` while version is `1.2.10`; `README.md:29` still advertises sentence-transformer-powered `[semantic]`. |
+  | ADR staleness notes | stale/current annotations | missing | RED. `docs/adr/ADR-016.md:3` claims 'At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers' — false: `_decision_backend.py:17,23` defines DecisionBackend/FakeBackend and `pyproject.toml:29-30` has empty `semantic = []`. `docs/adr/ADR-009.md:31` claims 'tracked-cache infrastructure' delivered — no `.python-setup-decisions.json` implementation exists in `src/`, `tests/`, `pyproject.toml` or `.gitignore`; `_semantic.py:15-21` is an in-process memo only. `docs/adr/ADR-011.md:60-62` (no hatch entry) is consistent; `docs/adr/ADR-020.md:3` remains accurate (PROMPT_VERSION only test-imported at `tests/checkers/test_decision_backend.py:24,88`; production backend loader is PYTEST-gated at `_decision_backend.py:37-46`). |
+
+  ## Red-cell routing
+
+  - `docs/semantic-justification.md`, `docs/custom-checks.md`, `docs/troubleshooting.md`, `AGENTS.md` semantic subsection → semantic-owned docs follow-up item(s).
+  - `AGENTS.md` Quick Commands counts and Tool Scope `ruff format` row → runner-owned AGENTS item (root-owned file).
+  - `CHANGELOG.md` ([semantic], no-go, version) and `README.md` pin/description → root-owned release/docs item(s).
+  - ADR-009 / ADR-016 staleness notes → ADR owner follow-up (adr-formalization scope).
+  - Never edit `lint.baseline`; all red cells are documentation/ownership items, not baseline entries.
+
+  ## Process note
+
+  `detect-secrets scan --baseline <file>` rewrites the baseline path in place (adds `generated_at`, reorders keys); the runner's follow-up python normalizes it back to sorted JSON, and that normalization reproduces HEAD bytes exactly (sha256 412cab2d…, no trailing-newline change). A probe against the live worktree therefore left `.secrets.baseline` transiently modified; it was restored to HEAD bytes and the worktree verified clean. Gate runs should use a temp baseline copy or a clean checkout.
+contextPack: >-
+  # Final gate (M3 close-out, TD3-A1/TD3-I2) — HEAD 2004b1dd, worktree clean
+
+
+  GREEN: format exit 0 (scoped rc, 191 files); lint 14/14 (13 PASSED;
+  detect-secrets exit 0 at HEAD via baseline `^\.factory/` filter; eager config
+  transformer at detect_secrets/transformers/config.py:97 + 2048MB RLIMIT_AS
+  would MemoryError without the filter); pytest -q 1357 passed / 7 deselected /
+  0 skipped; integration 9 collected / 9 passed / 0 failed (7+2 skip split when
+  pre-commit absent, tests/_project_helpers.py:185-191); golden byte-identical
+  158 findings, hashes c2b8dc3a… / 1d239741…, last change 1a811af, no regen;
+  lint.baseline `[]`.
+
+
+  RED (docs, route out): semantic-justification.md lacks
+  DecisionBackend/.python-setup-decisions.json/ADR-009/prompt-v1;
+  custom-checks.md lacks DecisionBackend; troubleshooting.md lacks
+  DECISION_MODEL/RERANKER deprecation; AGENTS.md pipeline lacks DecisionBackend;
+  CHANGELOG lacks [semantic]/no-go and v1.2.10 entry (pyproject=1.2.10 vs
+  changelog 1.2.9); AGENTS.md integration row says 7 pass vs 9 and unit row
+  1290/4/15 vs 1357/0/7, Tool Scope lacks ruff-format row; README pins v1.2.5 vs
+  1.2.10; ADR-016:3 and ADR-009:31 are stale (DecisionBackend/FakeBackend exist;
+  no tracked cache implementation).
+
+
+  CORRECTIONS: W9704-symbol findings in golden = 18 (6 pylint + 6 pylint tests +
+  6 pylint-pyi; rule=unjustified-suppression; checker lines 34-36), not 0.
+  MemoryError frame = IniFileParser.__init__ (config.py:97), not _parse_file.
+
+
+  Routing: semantic-owned docs, runner-owned AGENTS rows, root-owned
+  CHANGELOG/README, ADR owner; never baseline edits.
+sources:
+  - tests/data/golden/minimal_sample_project_findings.json:83,118,125,132,139,146,426,461,468,475,482,489,664,699,706,713,720,727
+  - src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:31-41
+  - .venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py:29-49,86-97
+  - .venv/lib/python3.14/site-packages/detect_secrets/util/filetype.py:20-58
+  - .venv/lib/python3.14/site-packages/detect_secrets/audit/common.py:113-118
+  - src/python_setup_lint/runner/dispatch.py:168-198
+  - src/python_setup_lint/runner/types.py:22
+  - src/python_setup_lint/runner/output.py:171-181
+  - .secrets.baseline:41-46
+  - src/python_setup_lint/runner/_tool_specs.py:11-18
+  - config/ruff.toml:1-3
+  - tests/integration.py:54,117-122,205,257,331-357
+  - tests/_golden.py:392
+  - tests/_project_helpers.py:185-191
+  - tests/conftest.py:29-34
+  - docs/adr/ADR-009.md:31
+  - docs/adr/ADR-011.md:60-68
+  - docs/adr/ADR-016.md:3
+  - docs/adr/ADR-020.md:3
+  - docs/semantic-justification.md:3,9-14,18,26,36,43,51-54
+  - docs/custom-checks.md:97
+  - docs/troubleshooting.md:97-109,150
+  - AGENTS.md:10-11,18-32,79-85
+  - CHANGELOG.md:3
+  - README.md:29,72
+  - pyproject.toml:3,29-30
+recommendations:
+  - Route the nine red docs cells to their owning items (semantic-owned docs,
+    runner-owned AGENTS rows, root-owned CHANGELOG/README, ADR owner); do not
+    patch docs inside this read-only gate and never add baseline entries.
+  - When closing M3, consume the golden result as 'no authorized regen + hash
+    equality' (158 findings, c2b8dc3a…/1d239741…); track the missing
+    golden-regen-hatch report artifact as a downstream deliverable rather than
+    regenerating.
+  - Make the detect-secrets step write to a temp baseline and atomically replace
+    only when bytes differ, so an interrupted lint cannot leave
+    `.secrets.baseline` dirty; alternatively move the tracked model cache out of
+    `git ls-files` or add a config-level exclude independent of the baseline
+    file.
+  - Refresh AGENTS.md counts from a real run (unit 1357/0/7; integration 9 pass)
+    and add the `ruff format | src/, tests/` Tool Scope row together with the
+    semantic-pipeline DecisionBackend rewrite.
+  - Add explicit staleness/current annotations to ADR-009 and ADR-016
+    (DecisionBackend/FakeBackend exist; `[semantic]` is empty; tracked cache is
+    not implemented) and align ADR-020 wording with the PYTEST-gated loader.
+  - Bump CHANGELOG to the pyproject version (1.2.10) with `[semantic]` and the
+    ADR-009 no-go deferral recorded, and update the README pin/semantic
+    description to match.
+concerns:
+  - kind: blocker
+    summary: Docs reconciliation is entirely red at HEAD (9 must-contain cells)
+    detail: "All required strings are absent: semantic-justification.md
+      (DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1 all 0),
+      custom-checks.md DecisionBackend 0, troubleshooting.md
+      DECISION_MODEL/RERANKER 0, AGENTS.md pipeline DecisionBackend 0, CHANGELOG
+      [semantic]/no-go 0 and no v1.2.10 entry, AGENTS.md 7-pass row and missing
+      ruff-format row, README v1.2.5 pin, ADR-016/ADR-009 stale claims.
+      Code/test gates are green, so M3 close-out cannot claim docs
+      reconciliation without routing these back."
+    severity: high
+    location:
+      file: docs/semantic-justification.md
+      line: 3
+    affects:
+      - M3 close-out
+      - semantic docs owner
+      - runner docs owner
+      - release owner
+      - ADR owner
+  - kind: risk
+    summary: detect-secrets relies on the baseline `^\.factory/` filter for 1.84GB
+      of tracked safetensors
+    detail: 9 tracked safetensors total 1,844,653,898 B (largest 789,581,344 B).
+      HEAD scan exits 0 only because .secrets.baseline:41-46 excludes them; the
+      bootstrap path (dispatch.py:190-198) would eagerly parse unknown
+      extensions via IniFileParser.__init__
+      (detect_secrets/transformers/config.py:97) and hit the 2048MB RLIMIT_AS
+      (runner/types.py:22, output.py:171-181) with MemoryError. This is residual
+      infra fragility, not a gate failure.
+    severity: medium
+    location:
+      file: .secrets.baseline
+      line: 44
+    affects:
+      - lint gate
+      - CI
+      - consumer repos
+  - kind: risk
+    summary: detect-secrets scan --baseline rewrites the tracked baseline in place
+      during lint
+    detail: dispatch.py:181-189 runs `detect-secrets scan --baseline
+      .secrets.baseline`; the tool updates that file (adds generated_at,
+      reorders keys) and the follow-up python normalizes it back. Normalization
+      reproduces HEAD bytes exactly (sha256 412cab2d…), but an interrupted run
+      leaves `.secrets.baseline` dirty. A live-worktree probe showed the
+      transient modification; it was restored to HEAD bytes and git status is
+      clean.
+    severity: low
+    location:
+      file: src/python_setup_lint/runner/dispatch.py
+      line: 181
+    affects:
+      - read-only lint contract
+      - pre-commit staging
+  - kind: tech-debt
+    summary: ADR-016 and ADR-009 contain HEAD-contradicted claims without staleness
+      notes
+    detail: ADR-016:3 says no DecisionBackend/cache/FakeBackend exists and
+      [semantic] is sentence-transformers; DecisionBackend/FakeBackend are
+      defined at _decision_backend.py:17,23 and the extra is empty at
+      pyproject.toml:29-30. ADR-009:31 claims tracked-cache infrastructure
+      delivered; no .python-setup-decisions.json implementation exists and
+      _semantic.py:15-21 is an in-process memo only.
+    severity: medium
+    location:
+      file: docs/adr/ADR-016.md
+      line: 3
+    affects:
+      - ADR reconciliation
+      - downstream semantic work
+  - kind: assumption
+    summary: The 7-passed+2-skipped integration split is environment-dependent
+    detail: tests/conftest.py:29-34 forcibly prepends .venv/bin to PATH, so this
+      worktree always exposes pre-commit and the skip path cannot be observed
+      here; the split materializes only where pre-commit is not installed.
+      Mechanism is pinned by tests/_project_helpers.py:185-191 and call sites
+      tests/integration.py:205,257.
+    severity: low
+    location:
+      file: tests/conftest.py
+      line: 29
+    affects:
+      - AGENTS.md counts
+      - CI environments
+  - kind: tech-debt
+    summary: AGENTS.md unit-test counts are stale in addition to the integration row
+    detail: AGENTS.md:10 says 1290 pass / 4 skip / 15 deselected; the observed run
+      is 1357 passed / 0 skipped / 7 deselected. The assignment only names the
+      9-collected contract, but both Quick Commands rows will mislead after the
+      docs pass.
+    severity: low
+    location:
+      file: AGENTS.md
+      line: 10
+    affects:
+      - docs reconciliation
+remarkable:
+  - chosen: Retain the byte-identical golden verdict; no regeneration
+    why: 158 findings, hashes c2b8dc3a…/1d239741…, integration
+      assert_golden_byte_identical passed, last change 1a811af, and the hatch
+      report is absent at HEAD — there is no evidence of an authorized behavior
+      shift requiring a regen.
+    alternatives:
+      - Regenerate golden with a reviewed diff
+      - Treat the missing hatch report as a blocker
+  - chosen: Validate lint as a 13-tool pass plus a HEAD-baseline detect-secrets run
+    why: The live full lint transiently rewrites the tracked .secrets.baseline and
+      the repository carries 1.84GB of tracked model artifacts; the scoped run
+      proves every tool green while avoiding both hazards.
+    alternatives:
+      - Run full `uv run lint` in the dirty worktree
+      - Run lint in a separate clean checkout
+  - chosen: Route docs red cells back instead of editing them in the gate
+    why: The gate is read-only and the red cells are owned by semantic, runner,
+      release and ADR items; baseline edits are explicitly forbidden and cannot
+      substitute for the missing strings.
+    alternatives:
+      - Patch docs in the gate item
+      - Add baseline entries for missing docs
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md
deleted file mode 100644
index da37aa6..0000000
--- a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md
+++ /dev/null
@@ -1,110 +0,0 @@
-# Step: Research
-
-## Goal
-Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
-
-## Rules
-- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
-- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
-- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
-- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
-- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
-- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
-
-## Assignment
-{
-  "slug": "test-debloat-audit",
-  "kind": "fact-finder",
-  "title": "Inventory redundant and lint-testing tests",
-  "assignment": "Read-only audit of tests/** (no repo writes; structured item-report tables). Depends on coding-rules-audit: read its UNIFIED ownership map via inter-dep and align owner column (do not redefine owners). Semantic exclusions marked SKIPPED: tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl golden-covered); CodingRules-Tests violations (first-party mocking, naming incl task-ID test_t5_*/test_t9_7_*/test_t11_*/test_t1b_*/test_t3_*, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks per broadened never-linting definition); slow/benchmark. Output rows {module,behaviors,duplicate-of,recommendation keep|merge|rewrite|remove,surviving coverage,reason,owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit: test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay+config tests — surviving test or blocking-debt flag).",
-  "outlineRef": "test-debloat-audit",
-  "milestone": "M3",
-  "wave": 5,
-  "deps": [
-    "golden-findings-snapshot",
-    "third-party-assumption-tests",
-    "consolidate-integration-helpers",
-    "coding-rules-audit"
-  ],
-  "scenarioRefs": [
-    "M3: Test redundancy inventoried",
-    "M3: Ownership map is complete and disjoint"
-  ],
-  "citations": [
-    "AGENTS.md:87-93",
-    "CodingRules.md:230-306",
-    "tests/checkers/test_semantic_check.py:1-7",
-    "tests/checkers/test_semantic_check.py:159-257",
-    "tests/checkers/test_semantic_threshold.py:19-25",
-    "pyproject.toml:49-55"
-  ]
-}
-
-## Task Intent
-# modernize
-
-Modernize the project while preserving every material lint/check behavior.
-- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
-- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
-- Remove redundant tests.
-- Replace the embedding/rerank based justification/comment check
-  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
-  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
-  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
-
-
-## Context & Citations
-[
-  "AGENTS.md:87-93",
-  "CodingRules.md:230-306",
-  "tests/checkers/test_semantic_check.py:1-7",
-  "tests/checkers/test_semantic_check.py:159-257",
-  "tests/checkers/test_semantic_threshold.py:19-25",
-  "pyproject.toml:49-55"
-]
-
-## Review Feedback
-
-
-## Open Concerns
-- id: c-3e935debcb
-  kind: risk
-  severity: low
-  summary: PoC lock is POSIX-only fcntl.flock
-  affects:
-    - cache-design-spike
-    - decision-cache-impl
-- id: c-5463b26c4b
-  kind: assumption
-  severity: medium
-  summary: Production call site passes a constant rule symbol, collapsing the cache rule component
-  affects:
-    - cache-design-spike
-    - decision-cache-impl
-
-
-- Review the concerns above before starting; they constrain this step but are not part of the assignment.
-- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
-
-## Output
-
-Yield a structured JSON object matching this schema:
-- status (string, required, enum: ["ok","inconclusive"])
-- summary (string, required)
-- findings (string, required)
-- contextPack (string, optional)
-- sources (array of string, optional)
-- recommendations (array of string, optional)
-- concerns (array of object, optional): Structured concerns raised while investigating
-  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
-  - summary (string, required)
-  - detail (string, optional)
-  - severity (string, optional, enum: ["low","medium","high"])
-  - location (object, optional)
-    - file (string, required)
-    - line (integer, optional)
-  - affects (array of string, optional)
-- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
-  - chosen (string, required)
-  - why (string, required)
-  - alternatives (array of string, required)
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml
deleted file mode 100644
index 5fa6a74..0000000
--- a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-seq: 1
-name: research
-attempt: 1
-fixRound: 1
-agent: fact-finder
-role: workhorse
-models:
-  - opencode-go/deepseek-v4.1-flash
-  - opencode-go/muse-spark-1.3-contributor
-timeoutSec: 3600
-status: ok
-startedAt: 2026-11-10T00:36:47.541Z
-session: 01a1c2e2-d5a8-7324-8be8-2ee2ad29c577
-endedAt: 2026-11-10T00:53:21.909Z
-usage:
-  inputTokens: 684503
-  outputTokens: 103456
-  costUsd: 0.179749
-traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml
deleted file mode 100644
index 7e90cf3..0000000
--- a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml
+++ /dev/null
@@ -1,467 +0,0 @@
-status: ok
-summary: "Read-only audit of tests/** at HEAD e2ffb19: 78 Python modules, 18,124
-  LoC, 793 test functions expanding to 1,357 default-suite cases (7 slow
-  deselected). Inventoried all 56 test modules plus 19 support/factory modules
-  by owner (checkers/runner/setup-testing/root; 5 semantic modules SKIPPED),
-  mapped duplication clusters, CodingRules-Tests violations, never-linting
-  removal candidates, slow/benchmarks, and the CLI/baseline/autofix/config
-  pinning limbs. Identified ~2.5-3.1k LoC (~14-17%) of removable/mergeable test
-  mass with surviving coverage named per row."
-findings: |-
-  # Test debloat audit — HEAD e2ffb19
-
-  Read-only; no repo writes. Verification: `uv run pytest --collect-only -q` → 1,364 collected, 7 deselected; `git log --oneline -1` → e2ffb19. Citations are `path:line` at HEAD unless prefixed `644774e^:`.
-
-  ## 0. Scope, ownership basis and caveat
-
-  - Scope: every `tests/**/*.py` module, including factories/helpers and fixture data. `tests/data/**` counted only as fixtures.
-  - **Ownership map gap:** the assignment says to consume coding-rules-audit's UNIFIED map via inter-dep, but no inter-dep section was present in the prompt and ADR-013 states the map lives in orchestration records (which this agent must not inspect). Owners below are therefore aligned to the only repo-visible five-owner taxonomy, ADR-011 (`docs/adr/ADR-011.md:9`): `checkers`, `runner`, `setup-testing`, `root`, `semantic`. No owner is redefined; each module gets exactly one owner. Row-owner alignment must be confirmed against the UNIFIED map before implementation.
-  - Semantic exclusions applied: `tests/checkers/test_semantic_check.py`, `tests/checkers/test_semantic_threshold.py`, `tests/checkers/test_decision_backend.py`, `tests/assumptions/test_pylint_cache_semantics.py`, `tests/assumptions/test_beartype_contracts.py` = SKIPPED. `TestSuppressionRerankerPipeline` and `tests/checkers/conftest.py` do not exist at HEAD (verified by grep/ls).
-  - Stale citation: `tests/checkers/test_semantic_check.py` is 133 lines at HEAD; the assignment's `:159-257` is out of range (trimmed since the citation was captured).
-
-  ## 1. Headline metrics
-
-  | Metric | Value |
-  |---|---|
-  | Python modules / LoC (excl. `tests/data`) | 78 / 18,124 |
-  | Test functions | 793 (784 in `test_*.py` + 9 in `integration.py`) |
-  | Collected cases (default `pytest -q`) | 1,364 collected, 7 slow deselected, 1,357 run |
-  | Golden snapshot | 158 findings / 14 tool-count keys (`tests/data/golden/*.json`) |
-  | CodingRules naming compliance | 486/793 fully `given+then`; 296 neither; 11 partial → 307 nonconforming (38.7%) |
-  | Category markers | 24 modules (20 non-skipped) with no category marker; `implementation_detail` used 0× |
-  | Slow tests | 7 tests / 6 modules (`-m 'not slow'`, `pyproject.toml:48`) |
-  | First-party monkeypatch sites | 35 `_run_cmd` sites in 12 files + `_run_uv` at `tests/_project_helpers.py:200` + runner internals at `tests/test_golden.py:208-215` |
-  | Duplicate helper defs | `_make_tc` 13, `_walk_and_release` 10, `_msg_ids` 8; `_UvCallRecorder` 2; `extra_block` 2; `_semantic_disabled` 2 |
-  | `list[Any]` / `dict[str, Any]` | 47 / 57 = 104 occurrences |
-
-  ### Per-subsystem LoC (sums to 18,124)
-
-  | Owner | Modules | LoC | Composition |
-  |---|---|---|---|
-  | checkers | 24 (22 checker tests + astroid/pylint assumption contracts) | 6,233 | 4,720 test LoC + 1,513 factories |
-  | runner | 19 | 7,416 | 5,916 test LoC + 1,500 factories/helpers |
-  | setup-testing | 6 | 1,676 | all test LoC |
-  | root | 5 (integration, test_golden + 3 shared support) | 1,745 | 912 test LoC + 833 support |
-  | semantic (SKIPPED) | 5 | 1,054 | all test LoC |
-
-  ## 2. Per-module inventory and recommendation (owner in group heading)
-
-  Legend: `dup-of` names the absorbing module/cluster; `surviving coverage` names the test that must remain after removal/merge. LoC/test counts are `LoC/functions`.
-
-  ### Owner: checkers
-
-  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
-  |---|---|---|---|---|---|---|
-  | test_asyncio_timeout_checker.py (124/4) | W9716 await without enclosing timeout; mixed/nested-function scope | none | keep | self | Unique checker behavior; no overlap | checkers |
-  | test_bare_except_comment_checker.py (187/11) | W9738 bare/`except Exception` without justification; comment/reraise/named-except skips | helper cluster | keep | self after helper move | Local `_make_tc`/`_walk_and_release` duplicate shipped `src/python_setup_lint/testing.py:18-42` | checkers |
-  | test_beartype_checker.py (102/5) | missing-beartype public functions; private/decorated/`no_type_check` skips; source-root filter | none | keep | self | Unique checker behavior | checkers |
-  | test_generic_key_dict_checker.py (116/2) | `dict[str, domain]` flagging | none | keep | self | Unique checker behavior | checkers |
-  | test_missing_error_chain_checker.py (192/12) | W9739 raise-in-except without `from`; chained/bare/outside-except skips | none | keep | self | Unique checker behavior | checkers |
-  | test_missing_return_annotation_checker.py (169/4) | missing-return-annotation on `_`-prefixed functions; source-root filter | none | keep | self | Unique checker behavior | checkers |
-  | test_no_try_import_checker.py (68/4) | W9706 try-import pattern detection | none | rewrite | self minus migration pin | `test_sentence_transformers_is_no_longer_an_optional_import_pattern` (`:27-33`) pins a deleted dependency → repo-state/migration test, not behavior | checkers |
-  | test_pyi_underscore_checker.py (121/9) | private symbols in `.pyi`; public/TYPE_CHECKING/dunder skips | none | keep | self | Unique checker behavior | checkers |
-  | test_redundant_type_guard_checker.py (240/18) | W9729 redundant `isinstance`; union/tuple/class-scope skips | none | keep | self | Unique checker behavior; trim only if C0302 pressure | checkers |
-  | test_silent_except_checker.py (221/14) | W9740 silent except; logging/raise skips | none | keep | self | Unique checker behavior | checkers |
-  | test_structlog_checker.py (141/14) | W9710 use-structlog; W9711 structured logging; source-root/proxy skips | none | keep | self | Unique checker behavior | checkers |
-  | test_stub_checker.py (456/23) | StubChecker lifecycle, stub resolution layouts, import contracts, classification, star/ClassVar/normalizer helpers | stub family core | merge | self as core + callable/class/coverage/docstring/normalizer/invariant rows | 7 stub modules / 1,742 LoC + 8 factories / 1,513 LoC; lifecycle/private-helper tests interleaved; in-file fixture `:23` | checkers |
-  | test_stub_checker_callable.py (276/12) | param descriptors, annotation extraction/comparison, E97B3 subprocess | stub family; pure helpers duplicate `test_stub_fidelity_invariants.py:323-383` | merge | test_stub_checker.py + E97B3 invariants (`test_stub_fidelity_invariants.py:139-198`) | Same checker and fixtures; no unique public surface beyond E97B3 | checkers |
-  | test_stub_checker_class.py (155/9) | `_normalize_bases`, `_is_public_method`, ctx, E97B1/B2 | stub family; pure helpers duplicate fidelity rows | merge | test_stub_checker.py + E97B1/B2 invariants | Same checker/fixtures | checkers |
-  | test_stub_coverage.py (191/11) | `matches_path`, test-file/opt-out/main-block checks, stub resolution/index/emit | stub family | merge | test_stub_checker.py | Helper-only coverage for the same StubChecker pipeline | checkers |
-  | test_stub_docstring_checker.py (145/8) | W9700 docstring-in-impl; W9705 generic-return `Returns:` | stub family | merge | test_stub_checker.py | Same checker family; no separate public API | checkers |
-  | test_stub_fidelity_invariants.py (428/35) | E97B1/B2/B3/B4/W97B5 fired invariants; ClassVar skip; public surface; pure comparisons; ctx | callable/class/normalizer + export surface | rewrite | keep `:60-275` invariant rows; drop `TestPublicSymbolSurface` `:277-321`, `TestComparePureHelpersDirect` `:323-383`, `TestCtxConstruction` `:385-427` | Fired-message invariants are valuable; pure-helper/export duplicates assert implementation shape, not behavior | checkers |
-  | test_stub_normalizer.py (91/4) | AnnotationNormalizer normalize/AST string/rewrites/comma split | stub family | merge | test_stub_checker.py | Pure helper of StubChecker | checkers |
-  | test_suppression_justification_checker.py (392/43) | W9704/W9738 suppression/Any justification; data-string exclusions; multi-line Any; code-echo rejection | helper/fixture cluster | keep | self | Core behavior of the semantic-replacement path; largest checker contract (43 tests); in-file `_msg_ids`/`_semantic_disabled` | checkers |
-  | test_tmp_path_checker.py (219/27) | W9702 tempfile in tests; non-test/non-tempfile/context-manager skips; path patterns | none | rewrite | keep `:1-160` detection/skip rows | `TestImportVariants` `:169-186` and edge rows deliberately pin "checker currently does NOT catch" gaps; `_matches_path` private cases are implementation detail | checkers |
-  | test_trivial_wrapper_checker.py (259/19) | W9728 trivial wrapper; overload/abstract/self/recursive/signature skips | none | keep | self | Unique checker behavior | checkers |
-  | test_unnamed_tuple_dict_checker.py (99/2) | bare tuple literals as dict values | none | keep | self | Unique checker behavior | checkers |
-  | assumptions/test_astroid_contracts.py (153/4) | astroid stream/doc_node/nodes_of_class/span contracts | none | keep | self | Required third-party assumption pinning (intent: assumptions first) | checkers |
-  | assumptions/test_pylint_contracts.py (175/3) | pylint register/release_messages/message-def tuple contracts | none | keep | self | Required third-party assumption pinning | checkers |
-
-  ### Owner: runner
-
-  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
-  |---|---|---|---|---|---|---|
-  | test_autofix_conflict.py (449/20) | git changed-set snapshots, E999 canary parsing, target paths, env opt-out, observability, Windows drive-letter paths | none | keep + absorb apply | self | Core autofix limb; real branch logic | runner |
-  | test_autofix_conflict_apply.py (318/8) | conflict-aware apply: no-conflict/staged-only/unstaged-only/staged+unstaged skip/E999 revert/untracked revert | test_autofix_conflict.py | merge | test_autofix_conflict.py | Same function under test; separate module adds no new behavior | runner |
-  | test_autofix_conflict_integration.py (251/6) | `run_lint(fix=True)` dispatch (`:41-118`); real-git integration (`:121-251`) | run_lint orchestration + conflict/apply | rewrite | keep real-git class `:121-251`; drop fake dispatch class | Fake dispatch duplicates run_lint routing; module was already trimmed 148 lines in 644774e | runner |
-  | test_baseline_diff.py (484/8) | compare_sorted, drift-resistant diff, error paths, flat records, multi-saved dedupe, 50k perf (`:170` slow) | canonical baseline | keep | self | Core baseline limb | runner |
-  | test_baseline_diff_parsers.py (485/9) | record parsers, capture schema v2/on-disk, capture_one edges, mixed schema, parser edges | baseline_diff + parsers_hypothesis + t3 | merge | test_baseline_diff.py + test_parsers_hypothesis.py | Record rows duplicate hypothesis parser tests; capture rows duplicate `test_lint_runner_integration.py:48-230` | runner |
-  | test_bench_runner_overhead.py (241/1, slow) | per-tool time/memory + runner overhead artifact | none | remove | none | **Zero `assert` statements** (grep) — computes PASS/FAIL only into artifact text; cannot gate regressions | runner |
-  | test_extra_tools.py (346/21) | extra-tool load/validate R4, merge semantics, build_command | fixture cluster | rewrite | self after fixture dedupe | `_isolate_registries` `:43` duplicates `tests/conftest.py:132`; `_isolate` `:218` is a no-op autouse fixture | runner |
-  | test_extra_tools_downstream.py (209/3, slow) | extras e2e, stats observability, startup perf | extra_tools + integration | rewrite | keep `:44-110`, `:160-209`; drop perf `:112-158` | Perf threshold duplicates startup memoization checks; e2e subset remains | runner |
-  | test_lint_runner.py (480/41) | ToolSpec table, strategy commands, path helpers, detect-secrets bootstrap, tach/pylintrc repo checks, skip lines, print, pyright summary | registry oracle + repo-state | rewrite | keep all but `TestTachConfig:310-328` + `TestPylintrcNoMaxComplexity:333-344` | Repo geography/config re-checks per broadened never-linting; 39 other tests are real behavior | runner |
-  | test_lint_runner_integration.py (414/19) | baseline capture/diff matrix/overwrite, run_lint orchestration, CLI/exit, run_cmd | canonical baseline/CLI | keep | self | Surviving CLI/exit + baseline pinning limb | runner |
-  | test_lint_runner_stats.py (382/29) | stats parse/aggregate, group/sort, T8 fail-fast, registry mirror, GenericLintTool, strategy fallback | registry oracle | rewrite | keep stats/group/GenericLintTool; drop `TestLintToolRegistry:225-260`; rename `test_t8_*:184-211` | Registry mirror duplicates `test_lint_runner.py:49-76`; task-ID test names violate naming | runner |
-  | test_parsers_hypothesis.py (432/66) | hypothesis invariants for all 14 parsers | none | keep | self | Only property-based layer; required by CodingRules `:276-286` | runner |
-  | test_real_pipeline_smoke.py (42/1, with_real_api) | spawns all 14 real tools; asserts tool names in output | integration.py + golden | remove | integration.py:57-125 + golden 158 findings | Strict subset of the golden e2e; not marked slow, so it spawns 14 real tools in the default suite | runner |
-  | test_runner_format_contract.py (157/12) | ruff format check/mutate modes, config discovery, registry constants, golden tool counts | registry + golden | rewrite | keep `:43-79`, `:131-149`; drop `TestRegistryConstants:80-128`, `TestGoldenToolCounts:151-157` | Registry/golden-count mirrors are source re-checks, not behavior | runner |
-  | test_runner_private_imports.py (20/1) | `runner.__all__` contains no private names | none | remove | none | Package-surface lint guard; prune precedent 644774e trimmed it 83→20 and deleted self-lint guards | runner |
-  | test_t1b_self_discovery.py (169/13) | default config paths, infer package name, yamllint config flag | none | rewrite | self as `test_runner_config_discovery.py` | Legit product behavior; only task-ID module name is defective | runner |
-  | test_t3_coverage.py (390/33) | parser completeness/edges, aggregate stats, observability, table edges | parsers_hypothesis + baseline parsers + stats | merge | test_parsers_hypothesis.py + test_lint_runner_stats.py | `TestParserCompleteness:32-65` mirrors the registry; edge rows duplicate parser tables; keep stats observability only | runner |
-  | test_t5_compose_ruff.py (366/21) | override fields, compose ruff, pyproject cache, run_lint wiring | test_t9_7 | merge/rename | `test_compose_configs.py` | Same config-composition limb as pyright; task-ID name | runner |
-  | test_t9_7_compose_pyright.py (281/15) | compose pyright fast paths/copy, run_lint wiring | test_t5 | merge/rename | `test_compose_configs.py` | Same limb; task-ID name | runner |
-
-  ### Owner: setup-testing
-
-  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
-  |---|---|---|---|---|---|---|
-  | test_setup.py (385/31) | atomic write, checksums, checker discovery, TOML helpers, state/update/CLI/templates/uv, module-size gates, drift | setup cluster | rewrite | keep all but `TestModuleSizeGates:326-345` | Source LOC + `.pyi` gates = repo-self-lint; remainder is product behavior | setup-testing |
-  | test_setup_install.py (373/7) | fresh/idempotent install, existing files, missing pyproject, step errors, install→lint downstream | setup + integration | rewrite | keep `:1-314`; fix/trim `TestDownstreamIntegration:315-373` | Downstream writes to `Path.home()/.tmp/t15-downstream` (`:319`) instead of `tmp_path`, runs real git/uv; `_UvCallRecorder` duplicates test_setup.py:39 | setup-testing |
-  | test_t11_health_checks.py (383/17) | `test_checked_main` argv; precommit config/shape validators; installed template | integration dry-run | rewrite | self as `test_testing_health_checks.py`; keep unit validators | Task-ID module name; installed-template slow case overlaps `integration.py::test_dry_run_hooks` | setup-testing |
-  | test_testing_fakes.py (197/9) | shipped testing fakes: `make_lint_result`, `FakeRunCmd` dict/list dispatch, capture, no-subprocess smoke | none | keep | self | `src/python_setup_lint/testing.py` is **shipped product API** (`FakeRunCmd`, `test_checked_main`, precommit validators), not test-only infra | setup-testing |
-  | test_setup_config_symlinks.py (162/7) | symlink/copy fallback, matching-content skip, tach skip, bundled configs | setup cluster | keep | self | Product setup behavior; bundled-config case is a packaging check | setup-testing |
-  | test_setup_precommit.py (176/7) | ruff version resolution/fallbacks, existing config skip, template format | setup cluster | keep | self | Product setup behavior | setup-testing |
-
-  ### Owner: root
-
-  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
-  |---|---|---|---|---|---|---|
-  | integration.py (498/9) | full pipeline golden 158, config overlay, resetup idempotence, dry-run hooks, install→lint, baseline relative paths, tool parity, rumdl guard | canonical | keep | self | AGENTS.md:87-93 fit-for-purpose gate; not slow | root |
-  | test_golden.py (414/30) | synthetic golden helpers: serialize/diff/coverage/update/env | tests/_golden.py | rewrite | keep pure serialize/diff/oracle-coverage contracts; drop `_stub_collect_pipeline` `:197-235` and redundant env/isolation | Tests test infrastructure (legitimate) but first-party monkeypatches runner internals; trim over-tested private helpers | root |
-
-  ### SKIPPED — semantic (epic-created)
-
-  | module | behaviors | disposition |
-  |---|---|---|
-  | test_semantic_check.py (133/9) | `_semantic` backend/score/cache/absence of sentence-transformers | SKIP (semantic) |
-  | test_semantic_threshold.py (164/1) | 115-row heuristic outcome table | SKIP (semantic) |
-  | test_decision_backend.py (337/25) | DecisionBackend protocol/loader/veto/heuristic; packaging pins | SKIP (semantic decision) |
-  | assumptions/test_pylint_cache_semantics.py (355/16) | in-process memo, path-free API, pylint jobs single-writer, concurrency | SKIP (semantic cache) |
-  | assumptions/test_beartype_contracts.py (65/1) | TYPE_CHECKING-only forward refs | SKIP (runtime) |
-
-  ## 3. Support/factory modules and consolidation
-
-  | module(s) | LoC | findings / recommendation |
-  |---|---|---|
-  | tests/checkers/_factories*.py (8 files) | 1,513 | `_make_tc`-based walk helpers duplicated across test files; `list[Any]` at `_factories_stub.py:269,394,442`, `_factories_stub_class.py:151`, `_factories_stub_docstring.py:154`. Split by checker family is fine; consolidate walk/emit helpers into one `_checker_harness.py` and drop per-test aliases. |
-  | tests/runner/_factories*.py + `_autofix_helpers.py` (6 files) | 1,500 | `_factories_tables.py` (394) is a C0302-driven split of `_factories.py`; `extra_block` duplicated at `_factories.py:174` and `_factories_extras.py:45`; `_factories_baseline.py` (279) holds the diff matrix and 17 `dict[str, Any]` helpers. Merge `extra_block`; keep tables; move diff matrix into `test_baseline_diff.py` or a single table module. |
-  | tests/conftest.py | 169 | Keep; `isolated_runner_registries:132` is the canonical registry snapshot. |
-  | tests/_golden.py | 446 | Keep; golden snapshot infrastructure used by `integration.py`. |
-  | tests/_project_helpers.py | 204 | Keep, but rewrite `install_twice_assert_idempotent:200` (monkeypatches first-party `setup._run_uv`); prefer a stub `uv` on PATH or an injected boundary. |
-  | Dead helpers | — | Truly unreferenced: `_factories.py:167 assert_violation_contains_any`, `_factories.py:200 assert_r4_reason`, `_factories_baseline.py:26 baseline_entry_for_tool` (and its only callee `find_tool_entry:19` becomes dead). Remove. |
-
-  ## 4. Duplication clusters (measured)
-
-  | cluster | measured at HEAD | action |
-  |---|---|---|
-  | Checker unittest harness | `_make_tc` 13 defs, `_walk_and_release` 10, `_msg_ids` 8 across 13/10/8 files; shipped equivalents at `src/python_setup_lint/testing.py:18-42` | one `tests/checkers/_checker_harness.py` (or import shipped helpers directly); delete aliases |
-  | Registry oracle | `test_lint_runner.py:49-76` (TestToolSpec), `test_lint_runner_stats.py:225-260` (TestLintToolRegistry), `test_runner_format_contract.py:80-128` (TestRegistryConstants), `test_t3_coverage.py:32-65` (TestParserCompleteness), `_factories.EXPECTED_BUILTIN_TOOL_NAMES` | keep **one** oracle (TestToolSpec + `EXPECTED_BUILTIN_TOOL_NAMES`); remove mirrors |
-  | Baseline | `test_baseline_diff.py` 484, `test_baseline_diff_parsers.py` 485, `test_lint_runner_integration.py:48-230`, `integration.py:295-330` | merge parsers into baseline/hypothesis; keep core + integration |
-  | Parser contracts | `test_parsers_hypothesis.py` 432/66, `test_t3_coverage.py` 390/33, `test_baseline_diff_parsers.py` 485/9 | hypothesis layer stays; merge edge tables into it; delete per-tool echo rows |
-  | Autofix | 3 modules / 1,018 LoC | merge apply + real-git into `test_autofix_conflict.py`; drop fake dispatch |
-  | Stub family | 7 test modules / 1,742 LoC + 8 factories / 1,513 LoC | merge to `test_stub_checker.py` + one invariants module; keep E97B1-B4/W97B5 fired rows |
-  | Setup uv recorder | `_UvCallRecorder` at `test_setup.py:39`, `test_setup_install.py:36` | one conftest fixture/helper |
-  | Semantic test doubles | `_RecordingBackend` at decision:44, semantic_check:25, cache_semantics:80 | all SKIPPED; no action now |
-  | Extra fixtures | `extra_block` x2; `_isolate_registries` `test_extra_tools.py:43` vs conftest:132; `_isolate:218` no-op | delete in-file copies; use conftest |
-  | Semantic env fixture | `_semantic_disabled` at bare_except:38 and suppression:24 | one conftest autouse fixture |
-  | Golden | integration golden 158 + `test_real_pipeline_smoke` 42 + `TestGoldenToolCounts` | golden/integration is canonical; remove smoke + counts mirror |
-  | Setup downstream | `integration.py::test_install_then_lint_clean_project`, `test_setup_install.py::TestDownstreamIntegration:315-373`, `test_t11:369-383` | keep integration + one slow template check; rewrite/fix the `$HOME` test |
-
-  ## 5. CodingRules-Tests violations
-
-  Rule lines: `CodingRules.md:240-254` (mocking), `:256-274` (categories/markers), `:276-286` (quality/hypothesis/golden/factories), `:288-295` (naming), `:297-306` (fixture scope/conftest). Markers declared at `pyproject.toml:49-55`.
-
-  | rule | evidence | affected modules |
-  |---|---|---|
-  | Mock only true external boundaries; never mock first-party | 35 `monkeypatch.setattr(..., _run_cmd)` sites in 12 files (`test_autofix_conflict*`, `test_t5`, `test_t9_7`, `test_lint_runner*`, `test_t3`, `test_extra_tools_downstream`, `test_testing_fakes`, `test_runner_format_contract`, `_factories.py`); `python_setup_lint.setup._run_uv` at `_project_helpers.py:200`; runner internals at `test_golden.py:208-215` | runner suite, test_golden, _project_helpers |
-  | Names `test_<method>_given_<condition>_then_<expected>` | 307/793 lack both (296 neither, 11 partial); task-ID modules `test_t1b`/`test_t3`/`test_t5`/`test_t9_7`/`test_t11` = 1,589 LoC / 99 tests; `test_t8_*` names at `test_lint_runner_stats.py:184,200,211` | 5 runner modules + stats |
-  | Category markers (`no_external_api` / `with_real_api` / `implementation_detail` / `slow`) | 24 modules (20 non-skipped) carry no category mark; `implementation_detail` used 0× despite many private-helper tests; only `test_real_pipeline_smoke` uses `with_real_api` and it is not slow | checker tests (14), integration, autofix integration, t1b/t3, setup symlinks/precommit, test_golden |
-  | No shared fixtures in test files; conftest scope | `_restore_structlog_wrapper` `test_stub_checker.py:23`; `_isolate_registries` `test_extra_tools.py:43`; `_isolate` `:218`; `_isolate_golden_env` `test_golden.py:38`; plus 2 skipped semantic fixtures; no `tests/checkers/conftest.py` | checkers, runner, root |
-  | Reuse test code across success/failure paths; factories for complex objects | duplicate clusters in §4; `_factories.py` `list[Any]`/`dict[str, Any]` 104 occurrences (47 list, 57 dict); exact list[Any] sites `_factories_stub.py:269,394,442`, `_factories_stub_class.py:151`, `_factories_stub_docstring.py:154`; `_factories_baseline.py` 17 dict[str, Any] | checkers/runner factories |
-  | Isolation: independent, no shared mutable state; use tmp_path | `test_setup_install.py:319` writes to `Path.home()/.tmp/t15-downstream` and runs real git/uv; `tests/data/minimal_sample_project/tests/test_tempfile.py` is **collected as a test** (1 case) and leaks `mkdtemp` | setup-testing, fixture data |
-  | Far/repo-state cases | tach.toml `.pylintrc` checks, source LOC gates, registry mirrors, golden tool counts, sentence-transformers migration pin, Windows drive-letter paths (`test_autofix_conflict.py:400-449`), import-variant gap pins (`test_tmp_path_checker.py:169-186`), 50k perf | runner/setup/checkers |
-
-  ## 6. Repo-self-lint removal candidates (broadened never-linting definition)
-
-  Precedent 644774e deleted `test_self_lint_clean.py` (59), `test_config_consistency.py` (86), `test_pyright_noise_filter.py` (113), `test_t9_7_compose_pyright_live.py` (197), trimmed `test_runner_private_imports.py` 83→20 and `test_autofix_conflict_integration.py` -148. HEAD retains these analogues:
-
-  | candidate | evidence | surviving coverage | verdict |
-  |---|---|---|---|
-  | `test_runner_private_imports.py` (20/1) | `:16-20` asserts `runner.__all__` has no `_` names | none | remove (broadened definition); if public-API policy requires it, keep with an explicit rationale |
-  | `test_lint_runner.py::TestTachConfig` | `:310-328` asserts repo `tach.toml` exists/declares source roots | integration sample runs `tach check` | remove |
-  | `test_lint_runner.py::TestPylintrcNoMaxComplexity` | `:333-344` reads shipped `.pylintrc` | integration/golden pylint run exercises shipped rcfile | remove |
-  | `test_setup.py::TestModuleSizeGates` | `:326-345` `inspect.getsource` LOC ceilings + `.pyi` declaration count | none (structural) | remove |
-  | `test_runner_format_contract.py::TestRegistryConstants` + `TestGoldenToolCounts` | `:80-128`, `:151-157` mirror `EXPECTED_*` and golden 14-key file | `test_lint_runner.py::TestToolSpec` + golden | remove |
-  | `test_lint_runner_stats.py::TestLintToolRegistry` | `:225-260` mirrors STRATEGIES/LINT_TOOLS | `test_lint_runner.py:49-76` | remove |
-  | `test_t3_coverage.py::TestParserCompleteness` | `:32-65` asserts every tool has a parser | union of parser tests/golden | remove |
-  | `test_no_try_import_checker.py:27-39` | deleted sentence-transformers dependency pins | W9706 pattern tests | remove |
-  | `test_setup_config_symlinks.py::test_works_with_real_bundled_configs` | real bundled config files | setup install tests + golden | keep (packaging behavior) or remove if strict |
-  | `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` | already absent at HEAD (644774e) | — | no action; but see blocking debt §7 |
-
-  ## 7. Slow / benchmark inventory
-
-  | module | slow marker | notes |
-  |---|---|---|
-  | test_baseline_diff.py | class `:170` (2 tests) | 50k-line perf ceilings; class-level slow works |
-  | test_bench_runner_overhead.py | `:118` (1) | zero asserts; writes `tmp_path/bench-runner-overhead.md`; cannot fail |
-  | test_extra_tools_downstream.py | `:111` (1) | startup overhead <10%; non-gating perf |
-  | test_lint_runner_integration.py | `:404` (1) | RLIMIT_AS OOM; legitimately slow |
-  | test_setup_install.py | `:315` (1) | real install/git/uv, `$HOME` temp |
-  | test_t11_health_checks.py | class `:369` (1) | real `pre-commit validate-config` |
-  | test_real_pipeline_smoke.py | none (module `with_real_api`) | spawns 14 real tools in default suite; should be slow or removed |
-
-  Default-suite collection: 1,364 collected / 7 deselected. Fixture leak: `tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir` is collected (1 case) — should be `collect_ignore`d or excluded by `norecursedirs`.
-
-  ## 8. Per-limb pinning inventory
-
-  | limb | current pinning | surviving test after debloat | blocking debt |
-  |---|---|---|---|
-  | **CLI / exit** | No `test_cli_*` file (naming debt). `test_lint_runner_integration.py:282-307` (argparse flags + `--help`/unknown SystemExit), `:309-369` (`run_lint` exit nonzero, baseline roundtrip); `test_lint_runner_stats.py:120-135` (group/sort forwarding), `:378-383` (invalid group); `test_setup.py:243-293` (setup install/update/bad subcommand) | `test_lint_runner_integration.py::TestMainCLI` + `TestRunLintIntegration` + `test_lint_runner_stats` group tests | none; optional rename to `test_cli_*` when normalizing names |
-  | **Baseline** | `test_baseline_diff.py` (core), `test_baseline_diff_parsers.py` (parsers/capture), `test_lint_runner_integration.py:48-230` (capture/diff/overwrite), `integration.py:295-330` (relative paths) | `test_baseline_diff.py` + `test_lint_runner_integration.py` + `integration.py:295-330` | none; merge parsers |
-  | **Autofix** | `test_autofix_conflict.py` (449), `test_autofix_conflict_apply.py` (318), `test_autofix_conflict_integration.py:41-251` | conflict/apply merged + real-git class `:121-251` | none |
-  | **Configs / scopes** | `integration.py:147-182` overlay, `:390-420` rumdl guard; `test_t5_compose_ruff.py`; `test_t9_7_compose_pyright.py`; `test_t1b_self_discovery.py`; `test_extra_tools.py` | merged `test_compose_configs.py` + t1b + extra_tools + integration overlay/rumdl | **BLOCKING DEBT:** shipped rcfile parity (`config/.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi` DESIGN/STUB-CHECKER sections) lost when `test_config_consistency.py` was deleted in 644774e; no surviving parity test. `test_pylint_cache_semantics.py::TestPylintRcfileJobsWatchdog` is semantic-skipped. |
-
-  ## 9. Estimated debloat
-
-  | cluster | LoC estimate |
-  |---|---|
-  | Remove whole modules (bench 241 + real smoke 42 + private imports 20) | 303 |
-  | Stub family merge (7 test modules 1,742 + factories 1,513) | 700-900 |
-  | Parser/baseline triplication consolidation | 500-650 |
-  | Autofix module merge | 200-280 |
-  | Checker harness/helper dedupe (13+10+8 aliases, fixtures) | 150-220 |
-  | Golden synthetic trim (`test_golden.py`) | 150-220 |
-  | Registry / repo-state / config re-check removals | 120-180 |
-  | Ruff+pyright compose merge | 150-220 |
-  | Perf/bench/downstream trims | 100-150 |
-  | Fixture/recorder/dedupe | 60-100 |
-  | **Total** | **≈2.3-3.0k LoC (13-17%)** |
-
-  Surviving contract floor: golden 158 findings + `integration.py` 9 tests + checker rule tests + assumption tests + baseline/CLI/autofix/config limb tests named above.
-contextPack: >-
-  # Test debloat audit — handoff facts
-
-  - HEAD e2ffb19; tests/** = 18,124 LoC / 78 modules / 793 test functions /
-  1,357 default cases.
-
-  - Owners (ADR-011 five-owner taxonomy, UNIFIED map unavailable): checkers 24
-  modules/6,233 LoC; runner 19/7,416; setup-testing 6/1,676; root 5/1,745;
-  semantic-skipped 5/1,054.
-
-  - Top debloat targets: stub family (7 tests/1,742 + 8 factories/1,513),
-  parser/baseline triplication (~1,400), autofix 3 modules/1,018, golden
-  synthetic 414, registry mirrors (~5 places), repo-state checks
-  (tach/.pylintrc/LOC gates/sentence-transformers pin), bench with zero asserts,
-  real smoke not slow.
-
-  - Keep: integration.py (golden 158, not slow), checker behavior tests,
-  astroid/pylint assumption contracts, shipped `python_setup_lint.testing` fakes
-  tests, baseline_diff, TestMainCLI/exit, autofix apply/real-git, compose
-  configs, extra tools.
-
-  - Blocking debt: rcfile parity unguarded since test_config_consistency.py
-  deletion (644774e). Fixture test data/minimal.../test_tempfile.py is collected
-  and leaks mkdtemp; setup downstream writes $HOME/.tmp.
-
-  - Semantic files SKIPPED; test_semantic_check.py is 133 lines (citation
-  :159-257 stale).
-sources:
-  - tests/** (78 modules at HEAD e2ffb19)
-  - src/python_setup_lint/testing.py:18-42
-  - tests/data/golden/minimal_sample_project_findings.json (158 findings)
-  - tests/data/golden/minimal_sample_project_tool_counts.json (14 keys)
-  - CodingRules.md:230-306
-  - AGENTS.md:87-93
-  - pyproject.toml:48-55
-  - docs/adr/ADR-011.md:9
-  - docs/adr/ADR-013.md:3
-  - docs/adr/ADR-022.md:3
-  - git show 644774e (deleted test_self_lint_clean.py,
-    test_config_consistency.py, test_pyright_noise_filter.py,
-    test_t9_7_compose_pyright_live.py; trimmed test_runner_private_imports.py
-    83->20)
-recommendations:
-  - Confirm the owner column against coding-rules-audit's UNIFIED map before
-    implementing; this audit used ADR-011's five-owner taxonomy because the map
-    was not present in the prompt/inter-dep.
-  - "Delete zero-value modules first: test_bench_runner_overhead.py (zero
-    asserts), test_real_pipeline_smoke.py (golden/integration subset, not slow),
-    test_runner_private_imports.py (API lint guard), and the repo-state classes
-    TestTachConfig/TestPylintrcNoMaxComplexity/TestModuleSizeGates/TestRegistry\
-    Constants/TestGoldenToolCounts/TestLintToolRegistry/TestParserCompleteness."
-  - Consolidate the stub family into test_stub_checker.py plus one fired-message
-    invariants module; delete pure-helper/export-surface duplicates and shrink
-    the 8 factory files.
-  - Merge autofix apply + real-git integration into test_autofix_conflict.py;
-    keep the staged/unstaged skip and E999 revert branches.
-  - Merge test_baseline_diff_parsers.py into test_baseline_diff.py +
-    test_parsers_hypothesis.py; merge test_t3 parser edges into the hypothesis
-    table and keep only stats/observability tests.
-  - Replace 13/10/8 local _make_tc/_walk_and_release/_msg_ids aliases with one
-    tests/checkers harness (shipped helpers already exist in
-    src/python_setup_lint/testing.py).
-  - "Rewrite first-party mocking: add an explicit run_cmd injection seam to
-    run_lint/_run_tool_pipeline or route tests through FakeRunCmd; stop
-    monkeypatching _run_cmd across 12 files and setup._run_uv at
-    tests/_project_helpers.py:200."
-  - "Fix isolation defects: use tmp_path in
-    test_setup_install.py::TestDownstreamIntegration (currently
-    $HOME/.tmp/t15-downstream), and exclude tests/data from collection (add
-    collect_ignore/norecursedirs) so the planted test_tempfile.py is not run."
-  - Add missing category markers and use implementation_detail for
-    private-helper tests; rename the five task-ID modules and reject new
-    test_t*/test_t8_* names.
-  - Before removing repo-state/config checks, add a single shipped-rcfile parity
-    test (DESIGN/STUB-CHECKER sections across config/.pylintrc, .pylintrc-tests,
-    .pylintrc-pyi); this closes the blocking debt left by 644774e.
-concerns:
-  - kind: assumption
-    summary: coding-rules-audit UNIFIED ownership map was unavailable in the
-      prompt/inter-dep
-    detail: ADR-013 states the map lives in orchestration records, which this agent
-      must not inspect. Owners were aligned to ADR-011's visible five-owner
-      taxonomy (runner/checkers/setup-testing/semantic/root); downstream
-      implementation must confirm each row against the UNIFIED map rather than
-      treating these labels as authoritative.
-    severity: medium
-    affects:
-      - test-debloat-audit
-      - test-debloat-impl
-  - kind: tech-debt
-    summary: Shipped rcfile parity is unguarded after test_config_consistency.py
-      deletion
-    detail: 644774e deleted the only test enforcing DESIGN/STUB-CHECKER consistency
-      across config/.pylintrc, config/.pylintrc-tests and config/.pylintrc-pyi.
-      No surviving parity test exists; the semantic jobs watchdog that touches
-      rcfiles is SKIPPED. Removing further config re-checks would deepen this
-      debt.
-    severity: medium
-    location:
-      file: tests/runner/test_config_consistency.py
-      line: 1
-    affects:
-      - test-debloat-audit
-      - config-parity
-      - test-debloat-impl
-  - kind: risk
-    summary: Fixture data test file is collected and leaks a temp directory
-    detail: tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir
-      is collected in the default suite (verified with pytest --collect-only)
-      and calls tempfile.mkdtemp without cleanup. tests/data should be excluded
-      from collection.
-    severity: medium
-    location:
-      file: tests/data/minimal_sample_project/tests/test_tempfile.py
-      line: 10
-    affects:
-      - test-debloat-audit
-      - test-harness
-  - kind: risk
-    summary: Benchmark test has zero assertions and cannot gate regressions
-    detail: tests/runner/test_bench_runner_overhead.py contains no assert statement;
-      it computes PASS/FAIL only into a tmp_path artifact and prints. It is
-      marked slow but provides no enforcement.
-    severity: low
-    location:
-      file: tests/runner/test_bench_runner_overhead.py
-      line: 118
-    affects:
-      - test-debloat-audit
-      - benchmark-policy
-  - kind: tech-debt
-    summary: Marker taxonomy is effectively unenforced
-    detail: 24 modules (20 non-skipped) have no category marker and
-      implementation_detail is used 0 times despite extensive private-helper
-      tests. This makes marker-based selection (unit vs real API vs
-      implementation detail) unreliable.
-    severity: medium
-    location:
-      file: pyproject.toml
-      line: 49
-    affects:
-      - test-debloat-audit
-      - test-harness
-  - kind: assumption
-    summary: test_testing_fakes.py must not be removed as test-infra-only coverage
-    detail: src/python_setup_lint/testing.py is shipped product API (FakeRunCmd,
-      make_lint_result, test_checked_main, precommit validators), not test-only
-      infrastructure. The debloat plan should keep test_testing_fakes.py;
-      removing it would drop shipped-API coverage.
-    severity: low
-    location:
-      file: src/python_setup_lint/testing.py
-      line: 45
-    affects:
-      - test-debloat-audit
-      - setup-testing
-  - kind: risk
-    summary: Real-pipeline smoke test runs 14 real tools in the default suite (not slow)
-    detail: tests/runner/test_real_pipeline_smoke.py is with_real_api but lacks
-      @pytest.mark.slow, so `uv run pytest -q` (addopts -m 'not slow') spawns 14
-      real tools. It is a strict subset of integration.py's golden run.
-    severity: low
-    location:
-      file: tests/runner/test_real_pipeline_smoke.py
-      line: 16
-    affects:
-      - test-debloat-audit
-      - test-harness
-  - kind: question
-    summary: Removing test_runner_private_imports.py broadens the never-linting
-      definition
-    detail: The prune precedent 644774e kept this guard after trimming it. Removing
-      it now assumes public-API lint guards are also out of scope; this needs an
-      explicit policy call rather than a mechanical deletion.
-    severity: low
-    location:
-      file: tests/runner/test_runner_private_imports.py
-      line: 16
-    affects:
-      - test-debloat-audit
-      - policy
-  - kind: tech-debt
-    summary: Assignment citation for semantic_check.py is stale/out of range
-    detail: tests/checkers/test_semantic_check.py is 133 lines at HEAD, so the cited
-      :159-257 cannot exist. Downstream semantic items should re-cite against
-      HEAD to avoid planning on a stale branch state.
-    severity: low
-    location:
-      file: tests/checkers/test_semantic_check.py
-      line: 133
-    affects:
-      - test-debloat-audit
-      - semantic items
-remarkable:
-  - chosen: Infer owners from ADR-011's visible five-owner taxonomy and flag the gap
-    why: The UNIFIED map from coding-rules-audit was not injected and the
-      alternative (inspecting orchestration records) violates containment.
-    alternatives:
-      - Block the audit until the map is provided
-      - Invent new owner labels
-      - Treat every module as root-owned
-  - chosen: Keep tests for shipped python_setup_lint.testing and treat it as product
-      coverage
-    why: src/python_setup_lint/testing.py exposes FakeRunCmd, make_lint_result,
-      test_checked_main and precommit validators to consumers; deleting
-      test_testing_fakes.py would drop shipped-API coverage.
-    alternatives:
-      - Remove it as test-infra self-test
-      - Move testing.py out of the shipped package
-  - chosen: Delete the zero-assert benchmark instead of fixing its threshold
-    why: It cannot fail, duplicates startup-overhead checks, and is slow-only; no
-      lint/check behavior is lost.
-    alternatives:
-      - Add an assert and keep it slow
-      - Convert to a documented script outside pytest
-  - chosen: Merge the stub family rather than delete it
-    why: E97B1-B4/W97B5 fired-message invariants are material checker behavior;
-      duplication is in pure helpers, exports and fixture wiring, not in the
-      invariants themselves.
-    alternatives:
-      - Delete redundant pure-helper tests only
-      - Keep 7 modules and only dedupe factories
-  - chosen: Use integration.py + 158-finding golden as canonical end-to-end coverage
-      and remove the real smoke test
-    why: The smoke test asserts only tool-name presence on a synthetic project, a
-      strict subset of the golden run, and unnecessarily spawns 14 real tools in
-      the default suite.
-    alternatives:
-      - Keep smoke as a fast real check
-      - Mark smoke slow and keep it
-  - chosen: Consolidate checker unittest helpers into a tests/checkers harness
-      instead of changing the shipped testing.py surface
-    why: Keeps the shipped public API stable and localizes test-only aliases;
-      shipped helpers can still be imported directly.
-    alternatives:
-      - Extend python_setup_lint.testing with more helpers
-      - Leave 13/10/8 aliases in place
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/input.md b/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/input.md
deleted file mode 100644
index 092628a..0000000
--- a/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/input.md
+++ /dev/null
@@ -1,3459 +0,0 @@
-# Step: Review
-
-## Goal
-Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.
-
-## Rules
-- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
-- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
-  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
-  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
-  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
-  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
-- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
-
-## Dispositions Criteria
-Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async, dismiss.
-Use ONLY these dispositions; any other disposition value fails validation.
-# Review Suggestion Dispositions
-
-Criteria for assigning disposition to review findings:
-
-| Disposition | When to Assign | Engine Action |
-|---|---|---|
-| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
-| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
-| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
-| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
-| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
-| `dismiss` | Stale, invalid, or already-addressed concern; triager-only, requires a reason in `detail`. Concern record is kept on disk. | Closes the concern as `dismissed` with the reason; nothing is routed. |
-
-## Rules
-- Defect requiring code change MUST be `fix`.
-- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
-- Do NOT use `human-async` when repo context or architecture docs provide the answer.
-- `dismiss` is triager-only, requires a reason, and keeps the concern on disk.
-
-## Open Concerns
-- id: rm-0237e4a7c9
-  kind: remarkable
-  summary: Merged `_project_helpers.py` as the union of both sides and kept its symlink-unlink guards
-- id: rm-963829d74d
-  kind: remarkable
-  summary: Deleted `tests/runner/test_self_lint_clean.py` (modify/delete conflict)
-- id: rm-9b3f69811e
-  kind: remarkable
-  summary: Combined the item's `assert_golden_snapshot` with the parent's fresh-copy byte-identical replay in test_setup_new_and_lint
-- id: rm-6396a0993e
-  kind: remarkable
-  summary: End I5 with debt and restart v2 chain in I6 with fresh budget/bases
-- id: rm-00a177b6ba
-  kind: remarkable
-  summary: Derive keys from the unredacted normalized justification while redacting bare hex runs in the stored display text
-- id: rm-0e2de85be6
-  kind: remarkable
-  summary: Store `dk1.` + dot-separated lowercase base32 of the full SHA-256 (8-char groups) as the cache key
-- id: rm-644c24995b
-  kind: remarkable
-  summary: Age pruning is opt-in (`--max-age-days`), disabled by default
-- id: rm-d1f2b9dda9
-  kind: remarkable
-  summary: Normal lint stays strictly read-only; the explicit refresh writer uses flock + merge + atomic os.replace and enforces effective jobs==1
-- id: rm-49477e3be0
-  kind: remarkable
-  summary: Treat TD-11 as resolved at the config layer rather than as a runner hack
-- id: rm-8744aaa293
-  kind: remarkable
-  summary: Group the 203 private stub declarations into three per-owner rows plus the W9707 enforcement row, rather than 203 individual rows
-- id: rm-bc510f4b77
-  kind: remarkable
-  summary: Run the lint gate with PYTHON_SETUP_LINT_NO_AUTOFIX=1 and rely on direct AST/pylint probes for the audit
-- id: rm-5f84f18bbd
-  kind: remarkable
-  summary: Resolve all six content conflicts by taking the parent tip's (topic/modernize) version of the shared test helpers, integration.py and the autofix tests.
-- id: rm-6e63c3be9e
-  kind: remarkable
-  summary: Leave the tests/conftest.py backwards-compat re-export of shipped_config_paths removed.
-
-
-- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
-- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
-- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
-- Raise concerns with evidence when review uncovers new cross-cutting issues.
-
-## Assignment
-{
-  "slug": "test-debloat-audit",
-  "kind": "fact-finder",
-  "title": "Inventory redundant and lint-testing tests",
-  "assignment": "Read-only audit of tests/** (no repo writes; structured item-report tables). Depends on coding-rules-audit: read its UNIFIED ownership map via inter-dep and align owner column (do not redefine owners). Semantic exclusions marked SKIPPED: tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl golden-covered); CodingRules-Tests violations (first-party mocking, naming incl task-ID test_t5_*/test_t9_7_*/test_t11_*/test_t1b_*/test_t3_*, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks per broadened never-linting definition); slow/benchmark. Output rows {module,behaviors,duplicate-of,recommendation keep|merge|rewrite|remove,surviving coverage,reason,owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit: test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay+config tests — surviving test or blocking-debt flag).",
-  "outlineRef": "test-debloat-audit",
-  "milestone": "M3",
-  "wave": 5,
-  "deps": [
-    "golden-findings-snapshot",
-    "third-party-assumption-tests",
-    "consolidate-integration-helpers",
-    "coding-rules-audit"
-  ],
-  "scenarioRefs": [
-    "M3: Test redundancy inventoried",
-    "M3: Ownership map is complete and disjoint"
-  ],
-  "citations": [
-    "AGENTS.md:87-93",
-    "CodingRules.md:230-306",
-    "tests/checkers/test_semantic_check.py:1-7",
-    "tests/checkers/test_semantic_check.py:159-257",
-    "tests/checkers/test_semantic_threshold.py:19-25",
-    "pyproject.toml:49-55"
-  ]
-}
-
-## Engine Checks
-
-
-## Code Diff
-diff --git a/.factory/tasks/modernize/concerns/c-06946fc950.yaml b/.factory/tasks/modernize/concerns/c-06946fc950.yaml
-index 62c7fa6..26dedf0 100644
---- a/.factory/tasks/modernize/concerns/c-06946fc950.yaml
-+++ b/.factory/tasks/modernize/concerns/c-06946fc950.yaml
-@@ -12,7 +12,7 @@ affects:
-   - coding-rules-audit
-   - test-debloat-audit
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -20,5 +20,4 @@ source:
-   item: coding-rules-audit
-   lastSeen: 2026-11-09T23:33:30.977Z
- createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-10T01:22:03.274Z
--disposition: optional
-+updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml b/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
-index 31884cc..ede7641 100644
---- a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
-+++ b/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
-@@ -15,7 +15,7 @@ affects:
-   - cache-design-spike
-   - decision-cache-impl
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -23,5 +23,4 @@ source:
-   item: final-gate-validation
-   lastSeen: 2026-11-10T00:27:58.391Z
- createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: optional
-+updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-3ae71408be.yaml b/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
-index 702853f..593fdbe 100644
---- a/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
-+++ b/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
-@@ -12,7 +12,7 @@ affects:
-   - coding-rules-audit
-   - runner
- severity: low
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -20,5 +20,4 @@ source:
-   item: coding-rules-audit
-   lastSeen: 2026-11-09T23:33:30.977Z
- createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-10T01:22:03.274Z
--disposition: optional
-+updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/c-3e5007b429.yaml b/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
-index 59862f8..27d6f8e 100644
---- a/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
-+++ b/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
-@@ -12,7 +12,7 @@ affects:
-   - tests/runner/test_pyright_noise_filter.py
-   - tests/runner/test_self_lint_clean.py
- severity: low
--status: routed
-+status: open
- source:
-   record: 005-integrate-r1-a1
-   agent: developer
-@@ -20,5 +20,4 @@ source:
-   item: consolidate-integration-helpers-v3
-   lastSeen: 2026-11-09T23:49:50.606Z
- createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-10T01:22:03.274Z
--disposition: optional
-+updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/c-3e935debcb.yaml b/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
-index 43a1bad..18ab7da 100644
---- a/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
-+++ b/.factory/tasks/modernize/concerns/c-3e935debcb.yaml
-@@ -13,7 +13,7 @@ affects:
-   - cache-design-spike
-   - decision-cache-impl
- severity: low
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -21,5 +21,4 @@ source:
-   item: cache-design-spike
-   lastSeen: 2026-11-09T23:18:39.934Z
- createdAt: 2026-11-09T23:18:39.934Z
--updatedAt: 2026-11-10T01:14:34.111Z
--disposition: optional
-+updatedAt: 2026-11-09T23:18:39.934Z
-diff --git a/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml b/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml
-deleted file mode 100644
-index 1d029af..0000000
---- a/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-4fe00e3cba
--kind: assumption
--summary: coding-rules-audit UNIFIED ownership map was unavailable in the
--  prompt/inter-dep
--detail: ADR-013 states the map lives in orchestration records, which this agent
--  must not inspect. Owners were aligned to ADR-011's visible five-owner taxonomy
--  (runner/checkers/setup-testing/semantic/root); downstream implementation must
--  confirm each row against the UNIFIED map rather than treating these labels as
--  authoritative.
--affects:
--  - test-debloat-audit
--  - test-debloat-impl
--severity: medium
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml b/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
-index 3f5d4ba..da0aae8 100644
---- a/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
-+++ b/.factory/tasks/modernize/concerns/c-5463b26c4b.yaml
-@@ -14,7 +14,7 @@ affects:
-   - cache-design-spike
-   - decision-cache-impl
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -22,5 +22,4 @@ source:
-   item: cache-design-spike
-   lastSeen: 2026-11-09T23:18:39.934Z
- createdAt: 2026-11-09T23:18:39.934Z
--updatedAt: 2026-11-10T01:14:34.111Z
--disposition: optional
-+updatedAt: 2026-11-09T23:18:39.934Z
-diff --git a/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml b/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
-index df635cd..c1d306c 100644
---- a/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
-+++ b/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
-@@ -15,7 +15,7 @@ location:
- affects:
-   - final-gate-validation
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -23,5 +23,4 @@ source:
-   item: final-gate-validation
-   lastSeen: 2026-11-10T00:27:58.391Z
- createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: optional
-+updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml b/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml
-deleted file mode 100644
-index 638e0bd..0000000
---- a/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml
-+++ /dev/null
-@@ -1,24 +0,0 @@
--id: c-5e0d0157c2
--kind: assumption
--summary: test_testing_fakes.py must not be removed as test-infra-only coverage
--detail: src/python_setup_lint/testing.py is shipped product API (FakeRunCmd,
--  make_lint_result, test_checked_main, precommit validators), not test-only
--  infrastructure. The debloat plan should keep test_testing_fakes.py; removing
--  it would drop shipped-API coverage.
--location:
--  file: src/python_setup_lint/testing.py
--  line: 45
--affects:
--  - setup-testing
--  - test-debloat-audit
--severity: low
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml b/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
-index a6d7d07..3f3b87d 100644
---- a/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
-+++ b/.factory/tasks/modernize/concerns/c-6472bddc0b.yaml
-@@ -14,7 +14,7 @@ affects:
-   - decision-cache-impl
-   - model-eval-poc
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -22,5 +22,4 @@ source:
-   item: cache-design-spike
-   lastSeen: 2026-11-09T23:18:39.934Z
- createdAt: 2026-11-09T23:18:39.934Z
--updatedAt: 2026-11-10T01:14:34.111Z
--disposition: optional
-+updatedAt: 2026-11-09T23:18:39.934Z
-diff --git a/.factory/tasks/modernize/concerns/c-698cedaf11.yaml b/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
-index 5a6086f..9e537bd 100644
---- a/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
-+++ b/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
-@@ -13,7 +13,7 @@ affects:
-   - tests/conftest.py
-   - tests/integration.py
- severity: medium
--status: routed
-+status: open
- source:
-   record: 005-integrate-r1-a1
-   agent: developer
-@@ -21,5 +21,4 @@ source:
-   item: consolidate-integration-helpers-v3
-   lastSeen: 2026-11-09T23:49:50.606Z
- createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-10T01:22:03.274Z
--disposition: optional
-+updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml b/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
-index 6b71e92..ea960d2 100644
---- a/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
-+++ b/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
-@@ -16,7 +16,7 @@ affects:
-   - epic-checkers-modernize
-   - epic-semantic-infrastructure
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -24,5 +24,4 @@ source:
-   item: epic-kickoff-gate
-   lastSeen: 2026-11-10T00:08:48.409Z
- createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T01:56:20.258Z
--disposition: optional
-+updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/c-7010722c77.yaml b/.factory/tasks/modernize/concerns/c-7010722c77.yaml
-deleted file mode 100644
-index c8ce8a5..0000000
---- a/.factory/tasks/modernize/concerns/c-7010722c77.yaml
-+++ /dev/null
-@@ -1,25 +0,0 @@
--id: c-7010722c77
--kind: tech-debt
--summary: Shipped rcfile parity is unguarded after test_config_consistency.py deletion
--detail: 644774e deleted the only test enforcing DESIGN/STUB-CHECKER consistency
--  across config/.pylintrc, config/.pylintrc-tests and config/.pylintrc-pyi. No
--  surviving parity test exists; the semantic jobs watchdog that touches rcfiles
--  is SKIPPED. Removing further config re-checks would deepen this debt.
--location:
--  file: tests/runner/test_config_consistency.py
--  line: 1
--affects:
--  - config-parity
--  - test-debloat-audit
--  - test-debloat-impl
--severity: medium
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-81b8a319de.yaml b/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
-index ec16141..3643670 100644
---- a/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
-+++ b/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
-@@ -16,7 +16,7 @@ affects:
-   - epic-shift-report-collection
-   - final-gate-validation
- severity: high
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -24,5 +24,4 @@ source:
-   item: epic-kickoff-gate
-   lastSeen: 2026-11-10T00:08:48.409Z
- createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T01:56:20.258Z
--disposition: human-awareness
-+updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml b/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
-index cba84a6..3a50471 100644
---- a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
-+++ b/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
-@@ -15,7 +15,7 @@ affects:
-   - docs-adr-reconciliation-v2
-   - epic-shift-report-collection
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -23,5 +23,4 @@ source:
-   item: epic-shift-report-collection
-   lastSeen: 2026-11-10T00:14:51.554Z
- createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T01:56:20.258Z
--disposition: optional
-+updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml b/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
-index f876d4c..b09bf91 100644
---- a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
-+++ b/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
-@@ -15,7 +15,7 @@ affects:
-   - decision-cache-impl
-   - semantic-docs
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -23,5 +23,4 @@ source:
-   item: coding-rules-audit
-   lastSeen: 2026-11-09T23:33:30.977Z
- createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-10T01:22:03.274Z
--disposition: optional
-+updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml b/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
-index a03b7a4..bc6476f 100644
---- a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
-+++ b/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
-@@ -15,7 +15,7 @@ affects:
-   - golden-regen-hatch
-   - golden-regen-hatch-v2
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -23,5 +23,4 @@ source:
-   item: epic-shift-report-collection
-   lastSeen: 2026-11-10T00:14:51.554Z
- createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T01:56:20.258Z
--disposition: optional
-+updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml b/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml
-deleted file mode 100644
-index 05c44ff..0000000
---- a/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-97e30bc22b
--kind: risk
--summary: Benchmark test has zero assertions and cannot gate regressions
--detail: tests/runner/test_bench_runner_overhead.py contains no assert statement;
--  it computes PASS/FAIL only into a tmp_path artifact and prints. It is marked
--  slow but provides no enforcement.
--location:
--  file: tests/runner/test_bench_runner_overhead.py
--  line: 118
--affects:
--  - benchmark-policy
--  - test-debloat-audit
--severity: low
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml b/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml
-deleted file mode 100644
-index 7d20467..0000000
---- a/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-a6bc23b516
--kind: risk
--summary: Real-pipeline smoke test runs 14 real tools in the default suite (not slow)
--detail: tests/runner/test_real_pipeline_smoke.py is with_real_api but lacks
--  @pytest.mark.slow, so `uv run pytest -q` (addopts -m 'not slow') spawns 14
--  real tools. It is a strict subset of integration.py's golden run.
--location:
--  file: tests/runner/test_real_pipeline_smoke.py
--  line: 16
--affects:
--  - test-debloat-audit
--  - test-harness
--severity: low
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-a816c72150.yaml b/.factory/tasks/modernize/concerns/c-a816c72150.yaml
-index f995f76..71ad7bc 100644
---- a/.factory/tasks/modernize/concerns/c-a816c72150.yaml
-+++ b/.factory/tasks/modernize/concerns/c-a816c72150.yaml
-@@ -14,7 +14,7 @@ affects:
-   - final-gate-validation
-   - golden-regen-hatch
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -22,5 +22,4 @@ source:
-   item: final-gate-validation
-   lastSeen: 2026-11-10T00:27:58.391Z
- createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: optional
-+updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml b/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml
-deleted file mode 100644
-index 2d05a53..0000000
---- a/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-ab2f531c0f
--kind: question
--summary: Removing test_runner_private_imports.py broadens the never-linting definition
--detail: The prune precedent 644774e kept this guard after trimming it. Removing
--  it now assumes public-API lint guards are also out of scope; this needs an
--  explicit policy call rather than a mechanical deletion.
--location:
--  file: tests/runner/test_runner_private_imports.py
--  line: 16
--affects:
--  - policy
--  - test-debloat-audit
--severity: low
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml b/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
-index 0734ed3..71c5675 100644
---- a/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
-+++ b/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
-@@ -16,7 +16,7 @@ affects:
-   - epic-runner-modernize
-   - epic-semantic-infrastructure
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -24,5 +24,4 @@ source:
-   item: epic-kickoff-gate
-   lastSeen: 2026-11-10T00:08:48.409Z
- createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T01:56:20.258Z
--disposition: architect
-+updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml b/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
-index 1a34738..bb153b8 100644
---- a/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
-+++ b/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
-@@ -19,7 +19,7 @@ affects:
-   - golden-regen-hatch
-   - golden-regen-hatch-v2
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -27,5 +27,4 @@ source:
-   item: golden-regen-hatch
-   lastSeen: 2026-11-10T00:36:23.179Z
- createdAt: 2026-11-10T00:36:23.179Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: optional
-+updatedAt: 2026-11-10T00:36:23.179Z
-diff --git a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml b/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
-index f7caf0d..5466663 100644
---- a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
-+++ b/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
-@@ -13,7 +13,7 @@ affects:
-   - cache-design-spike
-   - decision-cache-impl
- severity: low
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -21,5 +21,4 @@ source:
-   item: final-gate-validation
-   lastSeen: 2026-11-10T00:27:58.391Z
- createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: optional
-+updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml b/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
-index d7daa2d..5787fee 100644
---- a/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
-+++ b/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
-@@ -14,7 +14,7 @@ location:
- affects:
-   - AGENTS.md
- severity: low
--status: routed
-+status: open
- source:
-   record: 005-integrate-r1-a1
-   agent: developer
-@@ -22,5 +22,4 @@ source:
-   item: consolidate-integration-helpers-v3
-   lastSeen: 2026-11-09T23:49:50.606Z
- createdAt: 2026-11-09T23:49:50.606Z
--updatedAt: 2026-11-10T01:22:03.274Z
--disposition: optional
-+updatedAt: 2026-11-09T23:49:50.606Z
-diff --git a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml b/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
-index 3814e71..d901eb8 100644
---- a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
-+++ b/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
-@@ -17,7 +17,7 @@ affects:
-   - final-gate-validation
-   - golden-regen-hatch
- severity: high
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -25,5 +25,4 @@ source:
-   item: epic-shift-report-collection
-   lastSeen: 2026-11-10T00:14:51.554Z
- createdAt: 2026-11-10T00:14:51.554Z
--updatedAt: 2026-11-10T01:56:20.258Z
--disposition: architect
-+updatedAt: 2026-11-10T00:14:51.554Z
-diff --git a/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml b/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
-index cc2c54e..eb9b091 100644
---- a/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
-+++ b/.factory/tasks/modernize/concerns/c-d7252b7ac2.yaml
-@@ -13,7 +13,7 @@ affects:
-   - cache-design-spike
-   - decision-cache-impl
- severity: low
--status: routed
-+status: open
- source:
-   record: 001-develop-r1-a1
-   agent: developer
-@@ -21,5 +21,4 @@ source:
-   item: cache-design-spike
-   lastSeen: 2026-11-09T23:18:39.934Z
- createdAt: 2026-11-09T23:18:39.934Z
--updatedAt: 2026-11-10T01:14:34.111Z
--disposition: optional
-+updatedAt: 2026-11-09T23:18:39.934Z
-diff --git a/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml b/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
-index f5af836..2f3cb64 100644
---- a/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
-+++ b/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
-@@ -11,7 +11,7 @@ location:
- affects:
-   - coding-rules-audit
- severity: low
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -19,5 +19,4 @@ source:
-   item: coding-rules-audit
-   lastSeen: 2026-11-09T23:33:30.977Z
- createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-10T01:22:03.274Z
--disposition: optional
-+updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml b/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml
-deleted file mode 100644
-index e6710b8..0000000
---- a/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml
-+++ /dev/null
-@@ -1,24 +0,0 @@
--id: c-dfdb0b2ad3
--kind: risk
--summary: Fixture data test file is collected and leaks a temp directory
--detail: tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir
--  is collected in the default suite (verified with pytest --collect-only) and
--  calls tempfile.mkdtemp without cleanup. tests/data should be excluded from
--  collection.
--location:
--  file: tests/data/minimal_sample_project/tests/test_tempfile.py
--  line: 10
--affects:
--  - test-debloat-audit
--  - test-harness
--severity: medium
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml b/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
-index b4602e4..35f277b 100644
---- a/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
-+++ b/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
-@@ -13,7 +13,7 @@ affects:
-   - epic-runner-modernize
-   - epic-semantic-infrastructure
- severity: medium
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -21,5 +21,4 @@ source:
-   item: epic-kickoff-gate
-   lastSeen: 2026-11-10T00:08:48.409Z
- createdAt: 2026-11-10T00:08:48.409Z
--updatedAt: 2026-11-10T01:56:20.258Z
--disposition: optional
-+updatedAt: 2026-11-10T00:08:48.409Z
-diff --git a/.factory/tasks/modernize/concerns/c-f46047e94d.yaml b/.factory/tasks/modernize/concerns/c-f46047e94d.yaml
-deleted file mode 100644
-index c553c85..0000000
---- a/.factory/tasks/modernize/concerns/c-f46047e94d.yaml
-+++ /dev/null
-@@ -1,24 +0,0 @@
--id: c-f46047e94d
--kind: tech-debt
--summary: Marker taxonomy is effectively unenforced
--detail: 24 modules (20 non-skipped) have no category marker and
--  implementation_detail is used 0 times despite extensive private-helper tests.
--  This makes marker-based selection (unit vs real API vs implementation detail)
--  unreliable.
--location:
--  file: pyproject.toml
--  line: 49
--affects:
--  - test-debloat-audit
--  - test-harness
--severity: medium
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml b/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml
-deleted file mode 100644
-index 11fa1c4..0000000
---- a/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml
-+++ /dev/null
-@@ -1,23 +0,0 @@
--id: c-f5b16a86e4
--kind: tech-debt
--summary: Assignment citation for semantic_check.py is stale/out of range
--detail: tests/checkers/test_semantic_check.py is 133 lines at HEAD, so the cited
--  :159-257 cannot exist. Downstream semantic items should re-cite against HEAD
--  to avoid planning on a stale branch state.
--location:
--  file: tests/checkers/test_semantic_check.py
--  line: 133
--affects:
--  - semantic items
--  - test-debloat-audit
--severity: low
--status: routed
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-diff --git a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml b/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
-index 7094f49..e7b72e4 100644
---- a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
-+++ b/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
-@@ -16,7 +16,7 @@ affects:
-   - docs-counts-sync
-   - final-gate-validation
- severity: high
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -24,5 +24,4 @@ source:
-   item: final-gate-validation
-   lastSeen: 2026-11-10T00:27:58.391Z
- createdAt: 2026-11-10T00:27:58.391Z
--updatedAt: 2026-11-10T02:23:05.623Z
--disposition: architect
-+updatedAt: 2026-11-10T00:27:58.391Z
-diff --git a/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml b/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
-index f4def4c..39d2d25 100644
---- a/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
-+++ b/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
-@@ -13,7 +13,7 @@ affects:
-   - pylint-pyi
-   - stub-cleanup
- severity: high
--status: routed
-+status: open
- source:
-   record: 001-research-r1-a1
-   agent: fact-finder
-@@ -21,5 +21,4 @@ source:
-   item: coding-rules-audit
-   lastSeen: 2026-11-09T23:33:30.977Z
- createdAt: 2026-11-09T23:33:30.977Z
--updatedAt: 2026-11-10T01:22:03.274Z
--disposition: optional
-+updatedAt: 2026-11-09T23:33:30.977Z
-diff --git a/.factory/tasks/modernize/concerns/rm-057ed6485e.yaml b/.factory/tasks/modernize/concerns/rm-057ed6485e.yaml
-index 862c7e2..2110d7d 100644
---- a/.factory/tasks/modernize/concerns/rm-057ed6485e.yaml
-+++ b/.factory/tasks/modernize/concerns/rm-057ed6485e.yaml
-@@ -6,7 +6,7 @@ alternatives:
-   - Infer fixes from raw output text comparison
- why: Gate Diff is the authoritative signal; raw text differs run to run by
-   timing/ordering/truncation and must not be compared
--status: routed
-+status: open
- source:
-   record: 149-wave-close-up-5-6-a1
-   agent: wave-close-up
-@@ -14,5 +14,4 @@ source:
-   iteration: 5
-   lastSeen: 2026-11-09T22:19:17.543Z
- createdAt: 2026-11-09T22:19:17.543Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-+updatedAt: 2026-11-09T22:19:17.543Z
-diff --git a/.factory/tasks/modernize/concerns/rm-119c40e036.yaml b/.factory/tasks/modernize/concerns/rm-119c40e036.yaml
-deleted file mode 100644
-index 56203da..0000000
---- a/.factory/tasks/modernize/concerns/rm-119c40e036.yaml
-+++ /dev/null
-@@ -1,16 +0,0 @@
--id: rm-119c40e036
--chosen: Delete the zero-assert benchmark instead of fixing its threshold
--alternatives:
--  - Add an assert and keep it slow
--  - Convert to a documented script outside pytest
--why: It cannot fail, duplicates startup-overhead checks, and is slow-only; no
--  lint/check behavior is lost.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml b/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml
-deleted file mode 100644
-index 995c732..0000000
---- a/.factory/tasks/modernize/concerns/rm-1cd7ffbd0b.yaml
-+++ /dev/null
-@@ -1,17 +0,0 @@
--id: rm-1cd7ffbd0b
--chosen: Merge the stub family rather than delete it
--alternatives:
--  - Delete redundant pure-helper tests only
--  - Keep 7 modules and only dedupe factories
--why: E97B1-B4/W97B5 fired-message invariants are material checker behavior;
--  duplication is in pure helpers, exports and fixture wiring, not in the
--  invariants themselves.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-1ded0c796b.yaml b/.factory/tasks/modernize/concerns/rm-1ded0c796b.yaml
-index 34a658d..86a7f0c 100644
---- a/.factory/tasks/modernize/concerns/rm-1ded0c796b.yaml
-+++ b/.factory/tasks/modernize/concerns/rm-1ded0c796b.yaml
-@@ -7,7 +7,7 @@ alternatives:
- why: Per close-up rules, raw output text differs run to run; only
-   baseline-vs-now verdicts are authoritative, and both red-baseline gates now
-   pass with no regressions
--status: routed
-+status: open
- source:
-   record: 138-wave-close-up-5-4-a1
-   agent: wave-close-up
-@@ -15,5 +15,4 @@ source:
-   iteration: 5
-   lastSeen: 2026-11-09T21:50:23.652Z
- createdAt: 2026-11-09T21:50:23.652Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-+updatedAt: 2026-11-09T21:50:23.652Z
-diff --git a/.factory/tasks/modernize/concerns/rm-48c8d8400a.yaml b/.factory/tasks/modernize/concerns/rm-48c8d8400a.yaml
-index 427c35c..16656ca 100644
---- a/.factory/tasks/modernize/concerns/rm-48c8d8400a.yaml
-+++ b/.factory/tasks/modernize/concerns/rm-48c8d8400a.yaml
-@@ -6,7 +6,7 @@ alternatives:
-   - End-iteration with 0 merges despite green gates
- why: Fits 50-item cap, unblocks wave gate without losing M3 legacy scope, keeps
-   v2 cache/model/pyi/docs chain intact while gates stay green
--status: routed
-+status: open
- source:
-   record: 145-architect-wave-report-5-5-a1
-   agent: architect
-@@ -14,5 +14,4 @@ source:
-   iteration: 5
-   lastSeen: 2026-11-09T22:07:17.379Z
- createdAt: 2026-11-09T22:07:17.379Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-+updatedAt: 2026-11-09T22:07:17.379Z
-diff --git a/.factory/tasks/modernize/concerns/rm-557aad3315.yaml b/.factory/tasks/modernize/concerns/rm-557aad3315.yaml
-deleted file mode 100644
-index 62b3a0a..0000000
---- a/.factory/tasks/modernize/concerns/rm-557aad3315.yaml
-+++ /dev/null
-@@ -1,17 +0,0 @@
--id: rm-557aad3315
--chosen: Consolidate checker unittest helpers into a tests/checkers harness
--  instead of changing the shipped testing.py surface
--alternatives:
--  - Extend python_setup_lint.testing with more helpers
--  - Leave 13/10/8 aliases in place
--why: Keeps the shipped public API stable and localizes test-only aliases;
--  shipped helpers can still be imported directly.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-5bf2ade0ce.yaml b/.factory/tasks/modernize/concerns/rm-5bf2ade0ce.yaml
-index a8c81b3..22d30fc 100644
---- a/.factory/tasks/modernize/concerns/rm-5bf2ade0ce.yaml
-+++ b/.factory/tasks/modernize/concerns/rm-5bf2ade0ce.yaml
-@@ -6,7 +6,7 @@ alternatives:
- why: Fits 50-item cap (prior 52/51 discards), unblocks wave gate, preserves M3
-   helper scope via fresh-HEAD v2, keeps v2 cache/model/pyi/docs chain intact
-   while gates green
--status: routed
-+status: open
- source:
-   record: 150-architect-wave-report-5-6-a1
-   agent: architect
-@@ -14,5 +14,4 @@ source:
-   iteration: 5
-   lastSeen: 2026-11-09T22:22:55.095Z
- createdAt: 2026-11-09T22:22:55.095Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-+updatedAt: 2026-11-09T22:22:55.095Z
-diff --git a/.factory/tasks/modernize/concerns/rm-717ccdc143.yaml b/.factory/tasks/modernize/concerns/rm-717ccdc143.yaml
-index 6d57fc4..822a967 100644
---- a/.factory/tasks/modernize/concerns/rm-717ccdc143.yaml
-+++ b/.factory/tasks/modernize/concerns/rm-717ccdc143.yaml
-@@ -7,7 +7,7 @@ alternatives:
-   - Drop ruff format from TOOLS
- why: Matches operator action request in infra notes; allows future gate
-   simplification while keeping current split gates green
--status: routed
-+status: open
- source:
-   record: 129-wave-close-up-5-3-a1
-   agent: wave-close-up
-@@ -15,5 +15,4 @@ source:
-   iteration: 5
-   lastSeen: 2026-11-09T21:35:07.950Z
- createdAt: 2026-11-09T21:35:07.950Z
--updatedAt: 2026-11-10T02:32:36.259Z
--disposition: optional
-+updatedAt: 2026-11-09T21:35:07.950Z
-diff --git a/.factory/tasks/modernize/concerns/rm-8142698729.yaml b/.factory/tasks/modernize/concerns/rm-8142698729.yaml
-deleted file mode 100644
-index fdfbeb0..0000000
---- a/.factory/tasks/modernize/concerns/rm-8142698729.yaml
-+++ /dev/null
-@@ -1,21 +0,0 @@
--id: rm-8142698729
--chosen: Format tests/test_docs_counts_sync.py with config/ruff.toml (line-length
--  130) even though the assignment said no test-file changes.
--alternatives:
--  - Leave the test file untouched and accept a red lint gate (violates gate
--    requirement)
--  - Add the file to lint.baseline/exclusions (hides a real formatting
--    regression, out of scope)
--why: "The test-first file was wrapped for ruff's default 88-column width, so the
--  project lint gate failed (`ruff format` exit 1: would reformat).
--  Project-config formatting is semantics-preserving and is the only way to make
--  the mandatory lint gate exit 0 without altering the baseline."
--status: open
--source:
--  record: 002-develop-r1-a1
--  agent: developer
--  step: develop
--  item: docs-counts-sync
--  lastSeen: 2026-11-10T01:33:58.765Z
--createdAt: 2026-11-10T01:33:58.765Z
--updatedAt: 2026-11-10T01:33:58.765Z
-diff --git a/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml b/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml
-deleted file mode 100644
-index e25117a..0000000
---- a/.factory/tasks/modernize/concerns/rm-9f9b452910.yaml
-+++ /dev/null
-@@ -1,17 +0,0 @@
--id: rm-9f9b452910
--chosen: Infer owners from ADR-011's visible five-owner taxonomy and flag the gap
--alternatives:
--  - Block the audit until the map is provided
--  - Invent new owner labels
--  - Treat every module as root-owned
--why: The UNIFIED map from coding-rules-audit was not injected and the
--  alternative (inspecting orchestration records) violates containment.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml b/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml
-deleted file mode 100644
-index 65daa54..0000000
---- a/.factory/tasks/modernize/concerns/rm-b42ae1f186.yaml
-+++ /dev/null
-@@ -1,18 +0,0 @@
--id: rm-b42ae1f186
--chosen: Use integration.py + 158-finding golden as canonical end-to-end coverage
--  and remove the real smoke test
--alternatives:
--  - Keep smoke as a fast real check
--  - Mark smoke slow and keep it
--why: The smoke test asserts only tool-name presence on a synthetic project, a
--  strict subset of the golden run, and unnecessarily spawns 14 real tools in the
--  default suite.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml b/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml
-deleted file mode 100644
-index 89d46ee..0000000
---- a/.factory/tasks/modernize/concerns/rm-d0030d6966.yaml
-+++ /dev/null
-@@ -1,18 +0,0 @@
--id: rm-d0030d6966
--chosen: Keep tests for shipped python_setup_lint.testing and treat it as product
--  coverage
--alternatives:
--  - Remove it as test-infra self-test
--  - Move testing.py out of the shipped package
--why: src/python_setup_lint/testing.py exposes FakeRunCmd, make_lint_result,
--  test_checked_main and precommit validators to consumers; deleting
--  test_testing_fakes.py would drop shipped-API coverage.
--status: open
--source:
--  record: 001-research-r1-a1
--  agent: fact-finder
--  step: research
--  item: test-debloat-audit
--  lastSeen: 2026-11-10T00:53:21.467Z
--createdAt: 2026-11-10T00:53:21.467Z
--updatedAt: 2026-11-10T00:53:21.467Z
-diff --git a/.factory/tasks/modernize/concerns/rm-faffbf9aa0.yaml b/.factory/tasks/modernize/concerns/rm-faffbf9aa0.yaml
-deleted file mode 100644
-index 07b5f78..0000000
---- a/.factory/tasks/modernize/concerns/rm-faffbf9aa0.yaml
-+++ /dev/null
-@@ -1,17 +0,0 @@
--id: rm-faffbf9aa0
--chosen: Leave src/python_setup_lint/runner/cli.py unchanged.
--alternatives:
--  - Touch the line anyway to satisfy the stale assignment wording (no behavioral
--    or textual change)
--why: The post-dependency tree already contains `all 14 tools` at cli.py:348, and
--  the target test verifies the help output contains `all 14 tools`; an edit
--  would be a no-op.
--status: open
--source:
--  record: 002-develop-r1-a1
--  agent: developer
--  step: develop
--  item: docs-counts-sync
--  lastSeen: 2026-11-10T01:33:58.765Z
--createdAt: 2026-11-10T01:33:58.765Z
--updatedAt: 2026-11-10T01:33:58.765Z
-diff --git a/.factory/tasks/modernize/decisions/031-item-epic-kickoff-gate-1.yaml b/.factory/tasks/modernize/decisions/031-item-epic-kickoff-gate-1.yaml
-deleted file mode 100644
-index f478516..0000000
---- a/.factory/tasks/modernize/decisions/031-item-epic-kickoff-gate-1.yaml
-+++ /dev/null
-@@ -1,13 +0,0 @@
--id: decision-epic-kickoff-gate-1794275862004
--context: item
--item: epic-kickoff-gate
--afterRecord: 001-research-r1-a1
--decision: abandon
--timestamp: 2026-11-10T01:57:42.004Z
--rationale: "I3 epics never spawned (closeup-3: M2 zero delivery,
--  epic-kickoff-gate pending); ADR-013 records root-serialized delivery replaced
--  epic decomposition for I4; ADR-023 extends it to I5. A live spawn gate has
--  nothing to spawn, handoff needs I6 replan. Report-only, zero repo writes."
--text: "No replan needed: ADR-023 governs I5 delivery; I6 replans M2/M3 without
--  epics."
--reason: superseded
-diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md
-new file mode 100644
-index 0000000..da37aa6
---- /dev/null
-+++ b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md
-@@ -0,0 +1,110 @@
-+# Step: Research
-+
-+## Goal
-+Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
-+
-+## Rules
-+- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
-+- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
-+- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
-+- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
-+- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
-+- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
-+
-+## Assignment
-+{
-+  "slug": "test-debloat-audit",
-+  "kind": "fact-finder",
-+  "title": "Inventory redundant and lint-testing tests",
-+  "assignment": "Read-only audit of tests/** (no repo writes; structured item-report tables). Depends on coding-rules-audit: read its UNIFIED ownership map via inter-dep and align owner column (do not redefine owners). Semantic exclusions marked SKIPPED: tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl golden-covered); CodingRules-Tests violations (first-party mocking, naming incl task-ID test_t5_*/test_t9_7_*/test_t11_*/test_t1b_*/test_t3_*, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks per broadened never-linting definition); slow/benchmark. Output rows {module,behaviors,duplicate-of,recommendation keep|merge|rewrite|remove,surviving coverage,reason,owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit: test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay+config tests — surviving test or blocking-debt flag).",
-+  "outlineRef": "test-debloat-audit",
-+  "milestone": "M3",
-+  "wave": 5,
-+  "deps": [
-+    "golden-findings-snapshot",
-+    "third-party-assumption-tests",
-+    "consolidate-integration-helpers",
-+    "coding-rules-audit"
-+  ],
-+  "scenarioRefs": [
-+    "M3: Test redundancy inventoried",
-+    "M3: Ownership map is complete and disjoint"
-+  ],
-+  "citations": [
-+    "AGENTS.md:87-93",
-+    "CodingRules.md:230-306",
-+    "tests/checkers/test_semantic_check.py:1-7",
-+    "tests/checkers/test_semantic_check.py:159-257",
-+    "tests/checkers/test_semantic_threshold.py:19-25",
-+    "pyproject.toml:49-55"
-+  ]
-+}
-+
-+## Task Intent
-+# modernize
-+
-+Modernize the project while preserving every material lint/check behavior.
-+- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
-+- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
-+- Remove redundant tests.
-+- Replace the embedding/rerank based justification/comment check
-+  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
-+  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
-+  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
-+
-+
-+## Context & Citations
-+[
-+  "AGENTS.md:87-93",
-+  "CodingRules.md:230-306",
-+  "tests/checkers/test_semantic_check.py:1-7",
-+  "tests/checkers/test_semantic_check.py:159-257",
-+  "tests/checkers/test_semantic_threshold.py:19-25",
-+  "pyproject.toml:49-55"
-+]
-+
-+## Review Feedback
-+
-+
-+## Open Concerns
-+- id: c-3e935debcb
-+  kind: risk
-+  severity: low
-+  summary: PoC lock is POSIX-only fcntl.flock
-+  affects:
-+    - cache-design-spike
-+    - decision-cache-impl
-+- id: c-5463b26c4b
-+  kind: assumption
-+  severity: medium
-+  summary: Production call site passes a constant rule symbol, collapsing the cache rule component
-+  affects:
-+    - cache-design-spike
-+    - decision-cache-impl
-+
-+
-+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
-+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
-+
-+## Output
-+
-+Yield a structured JSON object matching this schema:
-+- status (string, required, enum: ["ok","inconclusive"])
-+- summary (string, required)
-+- findings (string, required)
-+- contextPack (string, optional)
-+- sources (array of string, optional)
-+- recommendations (array of string, optional)
-+- concerns (array of object, optional): Structured concerns raised while investigating
-+  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
-+  - summary (string, required)
-+  - detail (string, optional)
-+  - severity (string, optional, enum: ["low","medium","high"])
-+  - location (object, optional)
-+    - file (string, required)
-+    - line (integer, optional)
-+  - affects (array of string, optional)
-+- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
-+  - chosen (string, required)
-+  - why (string, required)
-+  - alternatives (array of string, required)
-diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml
-new file mode 100644
-index 0000000..5fa6a74
---- /dev/null
-+++ b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml
-@@ -0,0 +1,19 @@
-+seq: 1
-+name: research
-+attempt: 1
-+fixRound: 1
-+agent: fact-finder
-+role: workhorse
-+models:
-+  - opencode-go/deepseek-v4.1-flash
-+  - opencode-go/muse-spark-1.3-contributor
-+timeoutSec: 3600
-+status: ok
-+startedAt: 2026-11-10T00:36:47.541Z
-+session: 01a1c2e2-d5a8-7324-8be8-2ee2ad29c577
-+endedAt: 2026-11-10T00:53:21.909Z
-+usage:
-+  inputTokens: 684503
-+  outputTokens: 103456
-+  costUsd: 0.179749
-+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl
-diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml
-new file mode 100644
-index 0000000..7e90cf3
---- /dev/null
-+++ b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml
-@@ -0,0 +1,467 @@
-+status: ok
-+summary: "Read-only audit of tests/** at HEAD e2ffb19: 78 Python modules, 18,124
-+  LoC, 793 test functions expanding to 1,357 default-suite cases (7 slow
-+  deselected). Inventoried all 56 test modules plus 19 support/factory modules
-+  by owner (checkers/runner/setup-testing/root; 5 semantic modules SKIPPED),
-+  mapped duplication clusters, CodingRules-Tests violations, never-linting
-+  removal candidates, slow/benchmarks, and the CLI/baseline/autofix/config
-+  pinning limbs. Identified ~2.5-3.1k LoC (~14-17%) of removable/mergeable test
-+  mass with surviving coverage named per row."
-+findings: |-
-+  # Test debloat audit — HEAD e2ffb19
-+
-+  Read-only; no repo writes. Verification: `uv run pytest --collect-only -q` → 1,364 collected, 7 deselected; `git log --oneline -1` → e2ffb19. Citations are `path:line` at HEAD unless prefixed `644774e^:`.
-+
-+  ## 0. Scope, ownership basis and caveat
-+
-+  - Scope: every `tests/**/*.py` module, including factories/helpers and fixture data. `tests/data/**` counted only as fixtures.
-+  - **Ownership map gap:** the assignment says to consume coding-rules-audit's UNIFIED map via inter-dep, but no inter-dep section was present in the prompt and ADR-013 states the map lives in orchestration records (which this agent must not inspect). Owners below are therefore aligned to the only repo-visible five-owner taxonomy, ADR-011 (`docs/adr/ADR-011.md:9`): `checkers`, `runner`, `setup-testing`, `root`, `semantic`. No owner is redefined; each module gets exactly one owner. Row-owner alignment must be confirmed against the UNIFIED map before implementation.
-+  - Semantic exclusions applied: `tests/checkers/test_semantic_check.py`, `tests/checkers/test_semantic_threshold.py`, `tests/checkers/test_decision_backend.py`, `tests/assumptions/test_pylint_cache_semantics.py`, `tests/assumptions/test_beartype_contracts.py` = SKIPPED. `TestSuppressionRerankerPipeline` and `tests/checkers/conftest.py` do not exist at HEAD (verified by grep/ls).
-+  - Stale citation: `tests/checkers/test_semantic_check.py` is 133 lines at HEAD; the assignment's `:159-257` is out of range (trimmed since the citation was captured).
-+
-+  ## 1. Headline metrics
-+
-+  | Metric | Value |
-+  |---|---|
-+  | Python modules / LoC (excl. `tests/data`) | 78 / 18,124 |
-+  | Test functions | 793 (784 in `test_*.py` + 9 in `integration.py`) |
-+  | Collected cases (default `pytest -q`) | 1,364 collected, 7 slow deselected, 1,357 run |
-+  | Golden snapshot | 158 findings / 14 tool-count keys (`tests/data/golden/*.json`) |
-+  | CodingRules naming compliance | 486/793 fully `given+then`; 296 neither; 11 partial → 307 nonconforming (38.7%) |
-+  | Category markers | 24 modules (20 non-skipped) with no category marker; `implementation_detail` used 0× |
-+  | Slow tests | 7 tests / 6 modules (`-m 'not slow'`, `pyproject.toml:48`) |
-+  | First-party monkeypatch sites | 35 `_run_cmd` sites in 12 files + `_run_uv` at `tests/_project_helpers.py:200` + runner internals at `tests/test_golden.py:208-215` |
-+  | Duplicate helper defs | `_make_tc` 13, `_walk_and_release` 10, `_msg_ids` 8; `_UvCallRecorder` 2; `extra_block` 2; `_semantic_disabled` 2 |
-+  | `list[Any]` / `dict[str, Any]` | 47 / 57 = 104 occurrences |
-+
-+  ### Per-subsystem LoC (sums to 18,124)
-+
-+  | Owner | Modules | LoC | Composition |
-+  |---|---|---|---|
-+  | checkers | 24 (22 checker tests + astroid/pylint assumption contracts) | 6,233 | 4,720 test LoC + 1,513 factories |
-+  | runner | 19 | 7,416 | 5,916 test LoC + 1,500 factories/helpers |
-+  | setup-testing | 6 | 1,676 | all test LoC |
-+  | root | 5 (integration, test_golden + 3 shared support) | 1,745 | 912 test LoC + 833 support |
-+  | semantic (SKIPPED) | 5 | 1,054 | all test LoC |
-+
-+  ## 2. Per-module inventory and recommendation (owner in group heading)
-+
-+  Legend: `dup-of` names the absorbing module/cluster; `surviving coverage` names the test that must remain after removal/merge. LoC/test counts are `LoC/functions`.
-+
-+  ### Owner: checkers
-+
-+  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
-+  |---|---|---|---|---|---|---|
-+  | test_asyncio_timeout_checker.py (124/4) | W9716 await without enclosing timeout; mixed/nested-function scope | none | keep | self | Unique checker behavior; no overlap | checkers |
-+  | test_bare_except_comment_checker.py (187/11) | W9738 bare/`except Exception` without justification; comment/reraise/named-except skips | helper cluster | keep | self after helper move | Local `_make_tc`/`_walk_and_release` duplicate shipped `src/python_setup_lint/testing.py:18-42` | checkers |
-+  | test_beartype_checker.py (102/5) | missing-beartype public functions; private/decorated/`no_type_check` skips; source-root filter | none | keep | self | Unique checker behavior | checkers |
-+  | test_generic_key_dict_checker.py (116/2) | `dict[str, domain]` flagging | none | keep | self | Unique checker behavior | checkers |
-+  | test_missing_error_chain_checker.py (192/12) | W9739 raise-in-except without `from`; chained/bare/outside-except skips | none | keep | self | Unique checker behavior | checkers |
-+  | test_missing_return_annotation_checker.py (169/4) | missing-return-annotation on `_`-prefixed functions; source-root filter | none | keep | self | Unique checker behavior | checkers |
-+  | test_no_try_import_checker.py (68/4) | W9706 try-import pattern detection | none | rewrite | self minus migration pin | `test_sentence_transformers_is_no_longer_an_optional_import_pattern` (`:27-33`) pins a deleted dependency → repo-state/migration test, not behavior | checkers |
-+  | test_pyi_underscore_checker.py (121/9) | private symbols in `.pyi`; public/TYPE_CHECKING/dunder skips | none | keep | self | Unique checker behavior | checkers |
-+  | test_redundant_type_guard_checker.py (240/18) | W9729 redundant `isinstance`; union/tuple/class-scope skips | none | keep | self | Unique checker behavior; trim only if C0302 pressure | checkers |
-+  | test_silent_except_checker.py (221/14) | W9740 silent except; logging/raise skips | none | keep | self | Unique checker behavior | checkers |
-+  | test_structlog_checker.py (141/14) | W9710 use-structlog; W9711 structured logging; source-root/proxy skips | none | keep | self | Unique checker behavior | checkers |
-+  | test_stub_checker.py (456/23) | StubChecker lifecycle, stub resolution layouts, import contracts, classification, star/ClassVar/normalizer helpers | stub family core | merge | self as core + callable/class/coverage/docstring/normalizer/invariant rows | 7 stub modules / 1,742 LoC + 8 factories / 1,513 LoC; lifecycle/private-helper tests interleaved; in-file fixture `:23` | checkers |
-+  | test_stub_checker_callable.py (276/12) | param descriptors, annotation extraction/comparison, E97B3 subprocess | stub family; pure helpers duplicate `test_stub_fidelity_invariants.py:323-383` | merge | test_stub_checker.py + E97B3 invariants (`test_stub_fidelity_invariants.py:139-198`) | Same checker and fixtures; no unique public surface beyond E97B3 | checkers |
-+  | test_stub_checker_class.py (155/9) | `_normalize_bases`, `_is_public_method`, ctx, E97B1/B2 | stub family; pure helpers duplicate fidelity rows | merge | test_stub_checker.py + E97B1/B2 invariants | Same checker/fixtures | checkers |
-+  | test_stub_coverage.py (191/11) | `matches_path`, test-file/opt-out/main-block checks, stub resolution/index/emit | stub family | merge | test_stub_checker.py | Helper-only coverage for the same StubChecker pipeline | checkers |
-+  | test_stub_docstring_checker.py (145/8) | W9700 docstring-in-impl; W9705 generic-return `Returns:` | stub family | merge | test_stub_checker.py | Same checker family; no separate public API | checkers |
-+  | test_stub_fidelity_invariants.py (428/35) | E97B1/B2/B3/B4/W97B5 fired invariants; ClassVar skip; public surface; pure comparisons; ctx | callable/class/normalizer + export surface | rewrite | keep `:60-275` invariant rows; drop `TestPublicSymbolSurface` `:277-321`, `TestComparePureHelpersDirect` `:323-383`, `TestCtxConstruction` `:385-427` | Fired-message invariants are valuable; pure-helper/export duplicates assert implementation shape, not behavior | checkers |
-+  | test_stub_normalizer.py (91/4) | AnnotationNormalizer normalize/AST string/rewrites/comma split | stub family | merge | test_stub_checker.py | Pure helper of StubChecker | checkers |
-+  | test_suppression_justification_checker.py (392/43) | W9704/W9738 suppression/Any justification; data-string exclusions; multi-line Any; code-echo rejection | helper/fixture cluster | keep | self | Core behavior of the semantic-replacement path; largest checker contract (43 tests); in-file `_msg_ids`/`_semantic_disabled` | checkers |
-+  | test_tmp_path_checker.py (219/27) | W9702 tempfile in tests; non-test/non-tempfile/context-manager skips; path patterns | none | rewrite | keep `:1-160` detection/skip rows | `TestImportVariants` `:169-186` and edge rows deliberately pin "checker currently does NOT catch" gaps; `_matches_path` private cases are implementation detail | checkers |
-+  | test_trivial_wrapper_checker.py (259/19) | W9728 trivial wrapper; overload/abstract/self/recursive/signature skips | none | keep | self | Unique checker behavior | checkers |
-+  | test_unnamed_tuple_dict_checker.py (99/2) | bare tuple literals as dict values | none | keep | self | Unique checker behavior | checkers |
-+  | assumptions/test_astroid_contracts.py (153/4) | astroid stream/doc_node/nodes_of_class/span contracts | none | keep | self | Required third-party assumption pinning (intent: assumptions first) | checkers |
-+  | assumptions/test_pylint_contracts.py (175/3) | pylint register/release_messages/message-def tuple contracts | none | keep | self | Required third-party assumption pinning | checkers |
-+
-+  ### Owner: runner
-+
-+  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
-+  |---|---|---|---|---|---|---|
-+  | test_autofix_conflict.py (449/20) | git changed-set snapshots, E999 canary parsing, target paths, env opt-out, observability, Windows drive-letter paths | none | keep + absorb apply | self | Core autofix limb; real branch logic | runner |
-+  | test_autofix_conflict_apply.py (318/8) | conflict-aware apply: no-conflict/staged-only/unstaged-only/staged+unstaged skip/E999 revert/untracked revert | test_autofix_conflict.py | merge | test_autofix_conflict.py | Same function under test; separate module adds no new behavior | runner |
-+  | test_autofix_conflict_integration.py (251/6) | `run_lint(fix=True)` dispatch (`:41-118`); real-git integration (`:121-251`) | run_lint orchestration + conflict/apply | rewrite | keep real-git class `:121-251`; drop fake dispatch class | Fake dispatch duplicates run_lint routing; module was already trimmed 148 lines in 644774e | runner |
-+  | test_baseline_diff.py (484/8) | compare_sorted, drift-resistant diff, error paths, flat records, multi-saved dedupe, 50k perf (`:170` slow) | canonical baseline | keep | self | Core baseline limb | runner |
-+  | test_baseline_diff_parsers.py (485/9) | record parsers, capture schema v2/on-disk, capture_one edges, mixed schema, parser edges | baseline_diff + parsers_hypothesis + t3 | merge | test_baseline_diff.py + test_parsers_hypothesis.py | Record rows duplicate hypothesis parser tests; capture rows duplicate `test_lint_runner_integration.py:48-230` | runner |
-+  | test_bench_runner_overhead.py (241/1, slow) | per-tool time/memory + runner overhead artifact | none | remove | none | **Zero `assert` statements** (grep) — computes PASS/FAIL only into artifact text; cannot gate regressions | runner |
-+  | test_extra_tools.py (346/21) | extra-tool load/validate R4, merge semantics, build_command | fixture cluster | rewrite | self after fixture dedupe | `_isolate_registries` `:43` duplicates `tests/conftest.py:132`; `_isolate` `:218` is a no-op autouse fixture | runner |
-+  | test_extra_tools_downstream.py (209/3, slow) | extras e2e, stats observability, startup perf | extra_tools + integration | rewrite | keep `:44-110`, `:160-209`; drop perf `:112-158` | Perf threshold duplicates startup memoization checks; e2e subset remains | runner |
-+  | test_lint_runner.py (480/41) | ToolSpec table, strategy commands, path helpers, detect-secrets bootstrap, tach/pylintrc repo checks, skip lines, print, pyright summary | registry oracle + repo-state | rewrite | keep all but `TestTachConfig:310-328` + `TestPylintrcNoMaxComplexity:333-344` | Repo geography/config re-checks per broadened never-linting; 39 other tests are real behavior | runner |
-+  | test_lint_runner_integration.py (414/19) | baseline capture/diff matrix/overwrite, run_lint orchestration, CLI/exit, run_cmd | canonical baseline/CLI | keep | self | Surviving CLI/exit + baseline pinning limb | runner |
-+  | test_lint_runner_stats.py (382/29) | stats parse/aggregate, group/sort, T8 fail-fast, registry mirror, GenericLintTool, strategy fallback | registry oracle | rewrite | keep stats/group/GenericLintTool; drop `TestLintToolRegistry:225-260`; rename `test_t8_*:184-211` | Registry mirror duplicates `test_lint_runner.py:49-76`; task-ID test names violate naming | runner |
-+  | test_parsers_hypothesis.py (432/66) | hypothesis invariants for all 14 parsers | none | keep | self | Only property-based layer; required by CodingRules `:276-286` | runner |
-+  | test_real_pipeline_smoke.py (42/1, with_real_api) | spawns all 14 real tools; asserts tool names in output | integration.py + golden | remove | integration.py:57-125 + golden 158 findings | Strict subset of the golden e2e; not marked slow, so it spawns 14 real tools in the default suite | runner |
-+  | test_runner_format_contract.py (157/12) | ruff format check/mutate modes, config discovery, registry constants, golden tool counts | registry + golden | rewrite | keep `:43-79`, `:131-149`; drop `TestRegistryConstants:80-128`, `TestGoldenToolCounts:151-157` | Registry/golden-count mirrors are source re-checks, not behavior | runner |
-+  | test_runner_private_imports.py (20/1) | `runner.__all__` contains no private names | none | remove | none | Package-surface lint guard; prune precedent 644774e trimmed it 83→20 and deleted self-lint guards | runner |
-+  | test_t1b_self_discovery.py (169/13) | default config paths, infer package name, yamllint config flag | none | rewrite | self as `test_runner_config_discovery.py` | Legit product behavior; only task-ID module name is defective | runner |
-+  | test_t3_coverage.py (390/33) | parser completeness/edges, aggregate stats, observability, table edges | parsers_hypothesis + baseline parsers + stats | merge | test_parsers_hypothesis.py + test_lint_runner_stats.py | `TestParserCompleteness:32-65` mirrors the registry; edge rows duplicate parser tables; keep stats observability only | runner |
-+  | test_t5_compose_ruff.py (366/21) | override fields, compose ruff, pyproject cache, run_lint wiring | test_t9_7 | merge/rename | `test_compose_configs.py` | Same config-composition limb as pyright; task-ID name | runner |
-+  | test_t9_7_compose_pyright.py (281/15) | compose pyright fast paths/copy, run_lint wiring | test_t5 | merge/rename | `test_compose_configs.py` | Same limb; task-ID name | runner |
-+
-+  ### Owner: setup-testing
-+
-+  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
-+  |---|---|---|---|---|---|---|
-+  | test_setup.py (385/31) | atomic write, checksums, checker discovery, TOML helpers, state/update/CLI/templates/uv, module-size gates, drift | setup cluster | rewrite | keep all but `TestModuleSizeGates:326-345` | Source LOC + `.pyi` gates = repo-self-lint; remainder is product behavior | setup-testing |
-+  | test_setup_install.py (373/7) | fresh/idempotent install, existing files, missing pyproject, step errors, install→lint downstream | setup + integration | rewrite | keep `:1-314`; fix/trim `TestDownstreamIntegration:315-373` | Downstream writes to `Path.home()/.tmp/t15-downstream` (`:319`) instead of `tmp_path`, runs real git/uv; `_UvCallRecorder` duplicates test_setup.py:39 | setup-testing |
-+  | test_t11_health_checks.py (383/17) | `test_checked_main` argv; precommit config/shape validators; installed template | integration dry-run | rewrite | self as `test_testing_health_checks.py`; keep unit validators | Task-ID module name; installed-template slow case overlaps `integration.py::test_dry_run_hooks` | setup-testing |
-+  | test_testing_fakes.py (197/9) | shipped testing fakes: `make_lint_result`, `FakeRunCmd` dict/list dispatch, capture, no-subprocess smoke | none | keep | self | `src/python_setup_lint/testing.py` is **shipped product API** (`FakeRunCmd`, `test_checked_main`, precommit validators), not test-only infra | setup-testing |
-+  | test_setup_config_symlinks.py (162/7) | symlink/copy fallback, matching-content skip, tach skip, bundled configs | setup cluster | keep | self | Product setup behavior; bundled-config case is a packaging check | setup-testing |
-+  | test_setup_precommit.py (176/7) | ruff version resolution/fallbacks, existing config skip, template format | setup cluster | keep | self | Product setup behavior | setup-testing |
-+
-+  ### Owner: root
-+
-+  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
-+  |---|---|---|---|---|---|---|
-+  | integration.py (498/9) | full pipeline golden 158, config overlay, resetup idempotence, dry-run hooks, install→lint, baseline relative paths, tool parity, rumdl guard | canonical | keep | self | AGENTS.md:87-93 fit-for-purpose gate; not slow | root |
-+  | test_golden.py (414/30) | synthetic golden helpers: serialize/diff/coverage/update/env | tests/_golden.py | rewrite | keep pure serialize/diff/oracle-coverage contracts; drop `_stub_collect_pipeline` `:197-235` and redundant env/isolation | Tests test infrastructure (legitimate) but first-party monkeypatches runner internals; trim over-tested private helpers | root |
-+
-+  ### SKIPPED — semantic (epic-created)
-+
-+  | module | behaviors | disposition |
-+  |---|---|---|
-+  | test_semantic_check.py (133/9) | `_semantic` backend/score/cache/absence of sentence-transformers | SKIP (semantic) |
-+  | test_semantic_threshold.py (164/1) | 115-row heuristic outcome table | SKIP (semantic) |
-+  | test_decision_backend.py (337/25) | DecisionBackend protocol/loader/veto/heuristic; packaging pins | SKIP (semantic decision) |
-+  | assumptions/test_pylint_cache_semantics.py (355/16) | in-process memo, path-free API, pylint jobs single-writer, concurrency | SKIP (semantic cache) |
-+  | assumptions/test_beartype_contracts.py (65/1) | TYPE_CHECKING-only forward refs | SKIP (runtime) |
-+
-+  ## 3. Support/factory modules and consolidation
-+
-+  | module(s) | LoC | findings / recommendation |
-+  |---|---|---|
-+  | tests/checkers/_factories*.py (8 files) | 1,513 | `_make_tc`-based walk helpers duplicated across test files; `list[Any]` at `_factories_stub.py:269,394,442`, `_factories_stub_class.py:151`, `_factories_stub_docstring.py:154`. Split by checker family is fine; consolidate walk/emit helpers into one `_checker_harness.py` and drop per-test aliases. |
-+  | tests/runner/_factories*.py + `_autofix_helpers.py` (6 files) | 1,500 | `_factories_tables.py` (394) is a C0302-driven split of `_factories.py`; `extra_block` duplicated at `_factories.py:174` and `_factories_extras.py:45`; `_factories_baseline.py` (279) holds the diff matrix and 17 `dict[str, Any]` helpers. Merge `extra_block`; keep tables; move diff matrix into `test_baseline_diff.py` or a single table module. |
-+  | tests/conftest.py | 169 | Keep; `isolated_runner_registries:132` is the canonical registry snapshot. |
-+  | tests/_golden.py | 446 | Keep; golden snapshot infrastructure used by `integration.py`. |
-+  | tests/_project_helpers.py | 204 | Keep, but rewrite `install_twice_assert_idempotent:200` (monkeypatches first-party `setup._run_uv`); prefer a stub `uv` on PATH or an injected boundary. |
-+  | Dead helpers | — | Truly unreferenced: `_factories.py:167 assert_violation_contains_any`, `_factories.py:200 assert_r4_reason`, `_factories_baseline.py:26 baseline_entry_for_tool` (and its only callee `find_tool_entry:19` becomes dead). Remove. |
-+
-+  ## 4. Duplication clusters (measured)
-+
-+  | cluster | measured at HEAD | action |
-+  |---|---|---|
-+  | Checker unittest harness | `_make_tc` 13 defs, `_walk_and_release` 10, `_msg_ids` 8 across 13/10/8 files; shipped equivalents at `src/python_setup_lint/testing.py:18-42` | one `tests/checkers/_checker_harness.py` (or import shipped helpers directly); delete aliases |
-+  | Registry oracle | `test_lint_runner.py:49-76` (TestToolSpec), `test_lint_runner_stats.py:225-260` (TestLintToolRegistry), `test_runner_format_contract.py:80-128` (TestRegistryConstants), `test_t3_coverage.py:32-65` (TestParserCompleteness), `_factories.EXPECTED_BUILTIN_TOOL_NAMES` | keep **one** oracle (TestToolSpec + `EXPECTED_BUILTIN_TOOL_NAMES`); remove mirrors |
-+  | Baseline | `test_baseline_diff.py` 484, `test_baseline_diff_parsers.py` 485, `test_lint_runner_integration.py:48-230`, `integration.py:295-330` | merge parsers into baseline/hypothesis; keep core + integration |
-+  | Parser contracts | `test_parsers_hypothesis.py` 432/66, `test_t3_coverage.py` 390/33, `test_baseline_diff_parsers.py` 485/9 | hypothesis layer stays; merge edge tables into it; delete per-tool echo rows |
-+  | Autofix | 3 modules / 1,018 LoC | merge apply + real-git into `test_autofix_conflict.py`; drop fake dispatch |
-+  | Stub family | 7 test modules / 1,742 LoC + 8 factories / 1,513 LoC | merge to `test_stub_checker.py` + one invariants module; keep E97B1-B4/W97B5 fired rows |
-+  | Setup uv recorder | `_UvCallRecorder` at `test_setup.py:39`, `test_setup_install.py:36` | one conftest fixture/helper |
-+  | Semantic test doubles | `_RecordingBackend` at decision:44, semantic_check:25, cache_semantics:80 | all SKIPPED; no action now |
-+  | Extra fixtures | `extra_block` x2; `_isolate_registries` `test_extra_tools.py:43` vs conftest:132; `_isolate:218` no-op | delete in-file copies; use conftest |
-+  | Semantic env fixture | `_semantic_disabled` at bare_except:38 and suppression:24 | one conftest autouse fixture |
-+  | Golden | integration golden 158 + `test_real_pipeline_smoke` 42 + `TestGoldenToolCounts` | golden/integration is canonical; remove smoke + counts mirror |
-+  | Setup downstream | `integration.py::test_install_then_lint_clean_project`, `test_setup_install.py::TestDownstreamIntegration:315-373`, `test_t11:369-383` | keep integration + one slow template check; rewrite/fix the `$HOME` test |
-+
-+  ## 5. CodingRules-Tests violations
-+
-+  Rule lines: `CodingRules.md:240-254` (mocking), `:256-274` (categories/markers), `:276-286` (quality/hypothesis/golden/factories), `:288-295` (naming), `:297-306` (fixture scope/conftest). Markers declared at `pyproject.toml:49-55`.
-+
-+  | rule | evidence | affected modules |
-+  |---|---|---|
-+  | Mock only true external boundaries; never mock first-party | 35 `monkeypatch.setattr(..., _run_cmd)` sites in 12 files (`test_autofix_conflict*`, `test_t5`, `test_t9_7`, `test_lint_runner*`, `test_t3`, `test_extra_tools_downstream`, `test_testing_fakes`, `test_runner_format_contract`, `_factories.py`); `python_setup_lint.setup._run_uv` at `_project_helpers.py:200`; runner internals at `test_golden.py:208-215` | runner suite, test_golden, _project_helpers |
-+  | Names `test_<method>_given_<condition>_then_<expected>` | 307/793 lack both (296 neither, 11 partial); task-ID modules `test_t1b`/`test_t3`/`test_t5`/`test_t9_7`/`test_t11` = 1,589 LoC / 99 tests; `test_t8_*` names at `test_lint_runner_stats.py:184,200,211` | 5 runner modules + stats |
-+  | Category markers (`no_external_api` / `with_real_api` / `implementation_detail` / `slow`) | 24 modules (20 non-skipped) carry no category mark; `implementation_detail` used 0× despite many private-helper tests; only `test_real_pipeline_smoke` uses `with_real_api` and it is not slow | checker tests (14), integration, autofix integration, t1b/t3, setup symlinks/precommit, test_golden |
-+  | No shared fixtures in test files; conftest scope | `_restore_structlog_wrapper` `test_stub_checker.py:23`; `_isolate_registries` `test_extra_tools.py:43`; `_isolate` `:218`; `_isolate_golden_env` `test_golden.py:38`; plus 2 skipped semantic fixtures; no `tests/checkers/conftest.py` | checkers, runner, root |
-+  | Reuse test code across success/failure paths; factories for complex objects | duplicate clusters in §4; `_factories.py` `list[Any]`/`dict[str, Any]` 104 occurrences (47 list, 57 dict); exact list[Any] sites `_factories_stub.py:269,394,442`, `_factories_stub_class.py:151`, `_factories_stub_docstring.py:154`; `_factories_baseline.py` 17 dict[str, Any] | checkers/runner factories |
-+  | Isolation: independent, no shared mutable state; use tmp_path | `test_setup_install.py:319` writes to `Path.home()/.tmp/t15-downstream` and runs real git/uv; `tests/data/minimal_sample_project/tests/test_tempfile.py` is **collected as a test** (1 case) and leaks `mkdtemp` | setup-testing, fixture data |
-+  | Far/repo-state cases | tach.toml `.pylintrc` checks, source LOC gates, registry mirrors, golden tool counts, sentence-transformers migration pin, Windows drive-letter paths (`test_autofix_conflict.py:400-449`), import-variant gap pins (`test_tmp_path_checker.py:169-186`), 50k perf | runner/setup/checkers |
-+
-+  ## 6. Repo-self-lint removal candidates (broadened never-linting definition)
-+
-+  Precedent 644774e deleted `test_self_lint_clean.py` (59), `test_config_consistency.py` (86), `test_pyright_noise_filter.py` (113), `test_t9_7_compose_pyright_live.py` (197), trimmed `test_runner_private_imports.py` 83→20 and `test_autofix_conflict_integration.py` -148. HEAD retains these analogues:
-+
-+  | candidate | evidence | surviving coverage | verdict |
-+  |---|---|---|---|
-+  | `test_runner_private_imports.py` (20/1) | `:16-20` asserts `runner.__all__` has no `_` names | none | remove (broadened definition); if public-API policy requires it, keep with an explicit rationale |
-+  | `test_lint_runner.py::TestTachConfig` | `:310-328` asserts repo `tach.toml` exists/declares source roots | integration sample runs `tach check` | remove |
-+  | `test_lint_runner.py::TestPylintrcNoMaxComplexity` | `:333-344` reads shipped `.pylintrc` | integration/golden pylint run exercises shipped rcfile | remove |
-+  | `test_setup.py::TestModuleSizeGates` | `:326-345` `inspect.getsource` LOC ceilings + `.pyi` declaration count | none (structural) | remove |
-+  | `test_runner_format_contract.py::TestRegistryConstants` + `TestGoldenToolCounts` | `:80-128`, `:151-157` mirror `EXPECTED_*` and golden 14-key file | `test_lint_runner.py::TestToolSpec` + golden | remove |
-+  | `test_lint_runner_stats.py::TestLintToolRegistry` | `:225-260` mirrors STRATEGIES/LINT_TOOLS | `test_lint_runner.py:49-76` | remove |
-+  | `test_t3_coverage.py::TestParserCompleteness` | `:32-65` asserts every tool has a parser | union of parser tests/golden | remove |
-+  | `test_no_try_import_checker.py:27-39` | deleted sentence-transformers dependency pins | W9706 pattern tests | remove |
-+  | `test_setup_config_symlinks.py::test_works_with_real_bundled_configs` | real bundled config files | setup install tests + golden | keep (packaging behavior) or remove if strict |
-+  | `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` | already absent at HEAD (644774e) | — | no action; but see blocking debt §7 |
-+
-+  ## 7. Slow / benchmark inventory
-+
-+  | module | slow marker | notes |
-+  |---|---|---|
-+  | test_baseline_diff.py | class `:170` (2 tests) | 50k-line perf ceilings; class-level slow works |
-+  | test_bench_runner_overhead.py | `:118` (1) | zero asserts; writes `tmp_path/bench-runner-overhead.md`; cannot fail |
-+  | test_extra_tools_downstream.py | `:111` (1) | startup overhead <10%; non-gating perf |
-+  | test_lint_runner_integration.py | `:404` (1) | RLIMIT_AS OOM; legitimately slow |
-+  | test_setup_install.py | `:315` (1) | real install/git/uv, `$HOME` temp |
-+  | test_t11_health_checks.py | class `:369` (1) | real `pre-commit validate-config` |
-+  | test_real_pipeline_smoke.py | none (module `with_real_api`) | spawns 14 real tools in default suite; should be slow or removed |
-+
-+  Default-suite collection: 1,364 collected / 7 deselected. Fixture leak: `tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir` is collected (1 case) — should be `collect_ignore`d or excluded by `norecursedirs`.
-+
-+  ## 8. Per-limb pinning inventory
-+
-+  | limb | current pinning | surviving test after debloat | blocking debt |
-+  |---|---|---|---|
-+  | **CLI / exit** | No `test_cli_*` file (naming debt). `test_lint_runner_integration.py:282-307` (argparse flags + `--help`/unknown SystemExit), `:309-369` (`run_lint` exit nonzero, baseline roundtrip); `test_lint_runner_stats.py:120-135` (group/sort forwarding), `:378-383` (invalid group); `test_setup.py:243-293` (setup install/update/bad subcommand) | `test_lint_runner_integration.py::TestMainCLI` + `TestRunLintIntegration` + `test_lint_runner_stats` group tests | none; optional rename to `test_cli_*` when normalizing names |
-+  | **Baseline** | `test_baseline_diff.py` (core), `test_baseline_diff_parsers.py` (parsers/capture), `test_lint_runner_integration.py:48-230` (capture/diff/overwrite), `integration.py:295-330` (relative paths) | `test_baseline_diff.py` + `test_lint_runner_integration.py` + `integration.py:295-330` | none; merge parsers |
-+  | **Autofix** | `test_autofix_conflict.py` (449), `test_autofix_conflict_apply.py` (318), `test_autofix_conflict_integration.py:41-251` | conflict/apply merged + real-git class `:121-251` | none |
-+  | **Configs / scopes** | `integration.py:147-182` overlay, `:390-420` rumdl guard; `test_t5_compose_ruff.py`; `test_t9_7_compose_pyright.py`; `test_t1b_self_discovery.py`; `test_extra_tools.py` | merged `test_compose_configs.py` + t1b + extra_tools + integration overlay/rumdl | **BLOCKING DEBT:** shipped rcfile parity (`config/.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi` DESIGN/STUB-CHECKER sections) lost when `test_config_consistency.py` was deleted in 644774e; no surviving parity test. `test_pylint_cache_semantics.py::TestPylintRcfileJobsWatchdog` is semantic-skipped. |
-+
-+  ## 9. Estimated debloat
-+
-+  | cluster | LoC estimate |
-+  |---|---|
-+  | Remove whole modules (bench 241 + real smoke 42 + private imports 20) | 303 |
-+  | Stub family merge (7 test modules 1,742 + factories 1,513) | 700-900 |
-+  | Parser/baseline triplication consolidation | 500-650 |
-+  | Autofix module merge | 200-280 |
-+  | Checker harness/helper dedupe (13+10+8 aliases, fixtures) | 150-220 |
-+  | Golden synthetic trim (`test_golden.py`) | 150-220 |
-+  | Registry / repo-state / config re-check removals | 120-180 |
-+  | Ruff+pyright compose merge | 150-220 |
-+  | Perf/bench/downstream trims | 100-150 |
-+  | Fixture/recorder/dedupe | 60-100 |
-+  | **Total** | **≈2.3-3.0k LoC (13-17%)** |
-+
-+  Surviving contract floor: golden 158 findings + `integration.py` 9 tests + checker rule tests + assumption tests + baseline/CLI/autofix/config limb tests named above.
-+contextPack: >-
-+  # Test debloat audit — handoff facts
-+
-+  - HEAD e2ffb19; tests/** = 18,124 LoC / 78 modules / 793 test functions /
-+  1,357 default cases.
-+
-+  - Owners (ADR-011 five-owner taxonomy, UNIFIED map unavailable): checkers 24
-+  modules/6,233 LoC; runner 19/7,416; setup-testing 6/1,676; root 5/1,745;
-+  semantic-skipped 5/1,054.
-+
-+  - Top debloat targets: stub family (7 tests/1,742 + 8 factories/1,513),
-+  parser/baseline triplication (~1,400), autofix 3 modules/1,018, golden
-+  synthetic 414, registry mirrors (~5 places), repo-state checks
-+  (tach/.pylintrc/LOC gates/sentence-transformers pin), bench with zero asserts,
-+  real smoke not slow.
-+
-+  - Keep: integration.py (golden 158, not slow), checker behavior tests,
-+  astroid/pylint assumption contracts, shipped `python_setup_lint.testing` fakes
-+  tests, baseline_diff, TestMainCLI/exit, autofix apply/real-git, compose
-+  configs, extra tools.
-+
-+  - Blocking debt: rcfile parity unguarded since test_config_consistency.py
-+  deletion (644774e). Fixture test data/minimal.../test_tempfile.py is collected
-+  and leaks mkdtemp; setup downstream writes $HOME/.tmp.
-+
-+  - Semantic files SKIPPED; test_semantic_check.py is 133 lines (citation
-+  :159-257 stale).
-+sources:
-+  - tests/** (78 modules at HEAD e2ffb19)
-+  - src/python_setup_lint/testing.py:18-42
-+  - tests/data/golden/minimal_sample_project_findings.json (158 findings)
-+  - tests/data/golden/minimal_sample_project_tool_counts.json (14 keys)
-+  - CodingRules.md:230-306
-+  - AGENTS.md:87-93
-+  - pyproject.toml:48-55
-+  - docs/adr/ADR-011.md:9
-+  - docs/adr/ADR-013.md:3
-+  - docs/adr/ADR-022.md:3
-+  - git show 644774e (deleted test_self_lint_clean.py,
-+    test_config_consistency.py, test_pyright_noise_filter.py,
-+    test_t9_7_compose_pyright_live.py; trimmed test_runner_private_imports.py
-+    83->20)
-+recommendations:
-+  - Confirm the owner column against coding-rules-audit's UNIFIED map before
-+    implementing; this audit used ADR-011's five-owner taxonomy because the map
-+    was not present in the prompt/inter-dep.
-+  - "Delete zero-value modules first: test_bench_runner_overhead.py (zero
-+    asserts), test_real_pipeline_smoke.py (golden/integration subset, not slow),
-+    test_runner_private_imports.py (API lint guard), and the repo-state classes
-+    TestTachConfig/TestPylintrcNoMaxComplexity/TestModuleSizeGates/TestRegistry\
-+    Constants/TestGoldenToolCounts/TestLintToolRegistry/TestParserCompleteness."
-+  - Consolidate the stub family into test_stub_checker.py plus one fired-message
-+    invariants module; delete pure-helper/export-surface duplicates and shrink
-+    the 8 factory files.
-+  - Merge autofix apply + real-git integration into test_autofix_conflict.py;
-+    keep the staged/unstaged skip and E999 revert branches.
-+  - Merge test_baseline_diff_parsers.py into test_baseline_diff.py +
-+    test_parsers_hypothesis.py; merge test_t3 parser edges into the hypothesis
-+    table and keep only stats/observability tests.
-+  - Replace 13/10/8 local _make_tc/_walk_and_release/_msg_ids aliases with one
-+    tests/checkers harness (shipped helpers already exist in
-+    src/python_setup_lint/testing.py).
-+  - "Rewrite first-party mocking: add an explicit run_cmd injection seam to
-+    run_lint/_run_tool_pipeline or route tests through FakeRunCmd; stop
-+    monkeypatching _run_cmd across 12 files and setup._run_uv at
-+    tests/_project_helpers.py:200."
-+  - "Fix isolation defects: use tmp_path in
-+    test_setup_install.py::TestDownstreamIntegration (currently
-+    $HOME/.tmp/t15-downstream), and exclude tests/data from collection (add
-+    collect_ignore/norecursedirs) so the planted test_tempfile.py is not run."
-+  - Add missing category markers and use implementation_detail for
-+    private-helper tests; rename the five task-ID modules and reject new
-+    test_t*/test_t8_* names.
-+  - Before removing repo-state/config checks, add a single shipped-rcfile parity
-+    test (DESIGN/STUB-CHECKER sections across config/.pylintrc, .pylintrc-tests,
-+    .pylintrc-pyi); this closes the blocking debt left by 644774e.
-+concerns:
-+  - kind: assumption
-+    summary: coding-rules-audit UNIFIED ownership map was unavailable in the
-+      prompt/inter-dep
-+    detail: ADR-013 states the map lives in orchestration records, which this agent
-+      must not inspect. Owners were aligned to ADR-011's visible five-owner
-+      taxonomy (runner/checkers/setup-testing/semantic/root); downstream
-+      implementation must confirm each row against the UNIFIED map rather than
-+      treating these labels as authoritative.
-+    severity: medium
-+    affects:
-+      - test-debloat-audit
-+      - test-debloat-impl
-+  - kind: tech-debt
-+    summary: Shipped rcfile parity is unguarded after test_config_consistency.py
-+      deletion
-+    detail: 644774e deleted the only test enforcing DESIGN/STUB-CHECKER consistency
-+      across config/.pylintrc, config/.pylintrc-tests and config/.pylintrc-pyi.
-+      No surviving parity test exists; the semantic jobs watchdog that touches
-+      rcfiles is SKIPPED. Removing further config re-checks would deepen this
-+      debt.
-+    severity: medium
-+    location:
-+      file: tests/runner/test_config_consistency.py
-+      line: 1
-+    affects:
-+      - test-debloat-audit
-+      - config-parity
-+      - test-debloat-impl
-+  - kind: risk
-+    summary: Fixture data test file is collected and leaks a temp directory
-+    detail: tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir
-+      is collected in the default suite (verified with pytest --collect-only)
-+      and calls tempfile.mkdtemp without cleanup. tests/data should be excluded
-+      from collection.
-+    severity: medium
-+    location:
-+      file: tests/data/minimal_sample_project/tests/test_tempfile.py
-+      line: 10
-+    affects:
-+      - test-debloat-audit
-+      - test-harness
-+  - kind: risk
-+    summary: Benchmark test has zero assertions and cannot gate regressions
-+    detail: tests/runner/test_bench_runner_overhead.py contains no assert statement;
-+      it computes PASS/FAIL only into a tmp_path artifact and prints. It is
-+      marked slow but provides no enforcement.
-+    severity: low
-+    location:
-+      file: tests/runner/test_bench_runner_overhead.py
-+      line: 118
-+    affects:
-+      - test-debloat-audit
-+      - benchmark-policy
-+  - kind: tech-debt
-+    summary: Marker taxonomy is effectively unenforced
-+    detail: 24 modules (20 non-skipped) have no category marker and
-+      implementation_detail is used 0 times despite extensive private-helper
-+      tests. This makes marker-based selection (unit vs real API vs
-+      implementation detail) unreliable.
-+    severity: medium
-+    location:
-+      file: pyproject.toml
-+      line: 49
-+    affects:
-+      - test-debloat-audit
-+      - test-harness
-+  - kind: assumption
-+    summary: test_testing_fakes.py must not be removed as test-infra-only coverage
-+    detail: src/python_setup_lint/testing.py is shipped product API (FakeRunCmd,
-+      make_lint_result, test_checked_main, precommit validators), not test-only
-+      infrastructure. The debloat plan should keep test_testing_fakes.py;
-+      removing it would drop shipped-API coverage.
-+    severity: low
-+    location:
-+      file: src/python_setup_lint/testing.py
-+      line: 45
-+    affects:
-+      - test-debloat-audit
-+      - setup-testing
-+  - kind: risk
-+    summary: Real-pipeline smoke test runs 14 real tools in the default suite (not slow)
-+    detail: tests/runner/test_real_pipeline_smoke.py is with_real_api but lacks
-+      @pytest.mark.slow, so `uv run pytest -q` (addopts -m 'not slow') spawns 14
-+      real tools. It is a strict subset of integration.py's golden run.
-+    severity: low
-+    location:
-+      file: tests/runner/test_real_pipeline_smoke.py
-+      line: 16
-+    affects:
-+      - test-debloat-audit
-+      - test-harness
-+  - kind: question
-+    summary: Removing test_runner_private_imports.py broadens the never-linting
-+      definition
-+    detail: The prune precedent 644774e kept this guard after trimming it. Removing
-+      it now assumes public-API lint guards are also out of scope; this needs an
-+      explicit policy call rather than a mechanical deletion.
-+    severity: low
-+    location:
-+      file: tests/runner/test_runner_private_imports.py
-+      line: 16
-+    affects:
-+      - test-debloat-audit
-+      - policy
-+  - kind: tech-debt
-+    summary: Assignment citation for semantic_check.py is stale/out of range
-+    detail: tests/checkers/test_semantic_check.py is 133 lines at HEAD, so the cited
-+      :159-257 cannot exist. Downstream semantic items should re-cite against
-+      HEAD to avoid planning on a stale branch state.
-+    severity: low
-+    location:
-+      file: tests/checkers/test_semantic_check.py
-+      line: 133
-+    affects:
-+      - test-debloat-audit
-+      - semantic items
-+remarkable:
-+  - chosen: Infer owners from ADR-011's visible five-owner taxonomy and flag the gap
-+    why: The UNIFIED map from coding-rules-audit was not injected and the
-+      alternative (inspecting orchestration records) violates containment.
-+    alternatives:
-+      - Block the audit until the map is provided
-+      - Invent new owner labels
-+      - Treat every module as root-owned
-+  - chosen: Keep tests for shipped python_setup_lint.testing and treat it as product
-+      coverage
-+    why: src/python_setup_lint/testing.py exposes FakeRunCmd, make_lint_result,
-+      test_checked_main and precommit validators to consumers; deleting
-+      test_testing_fakes.py would drop shipped-API coverage.
-+    alternatives:
-+      - Remove it as test-infra self-test
-+      - Move testing.py out of the shipped package
-+  - chosen: Delete the zero-assert benchmark instead of fixing its threshold
-+    why: It cannot fail, duplicates startup-overhead checks, and is slow-only; no
-+      lint/check behavior is lost.
-+    alternatives:
-+      - Add an assert and keep it slow
-+      - Convert to a documented script outside pytest
-+  - chosen: Merge the stub family rather than delete it
-+    why: E97B1-B4/W97B5 fired-message invariants are material checker behavior;
-+      duplication is in pure helpers, exports and fixture wiring, not in the
-+      invariants themselves.
-+    alternatives:
-+      - Delete redundant pure-helper tests only
-+      - Keep 7 modules and only dedupe factories
-+  - chosen: Use integration.py + 158-finding golden as canonical end-to-end coverage
-+      and remove the real smoke test
-+    why: The smoke test asserts only tool-name presence on a synthetic project, a
-+      strict subset of the golden run, and unnecessarily spawns 14 real tools in
-+      the default suite.
-+    alternatives:
-+      - Keep smoke as a fast real check
-+      - Mark smoke slow and keep it
-+  - chosen: Consolidate checker unittest helpers into a tests/checkers harness
-+      instead of changing the shipped testing.py surface
-+    why: Keeps the shipped public API stable and localizes test-only aliases;
-+      shipped helpers can still be imported directly.
-+    alternatives:
-+      - Extend python_setup_lint.testing with more helpers
-+      - Leave 13/10/8 aliases in place
-diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
-index dd41b60..de18d16 100644
---- a/.factory/tasks/modernize/journal.ndjson
-+++ b/.factory/tasks/modernize/journal.ndjson
-@@ -2252,41 +2252,3 @@
- {"type":"step_started","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-regen-hatch/.factory/tasks/modernize/items/golden-regen-hatch/steps/001-develop-r1-a1","ts":"2026-11-10T00:28:18.414Z"}
- {"type":"step_timeout_armed","task":"modernize","item":"golden-regen-hatch","step":"develop","timeoutSec":5400,"ts":"2026-11-10T00:28:18.418Z"}
- {"type":"step_transcript_size_warning","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"sizeBytes":5855128,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-28-18-722Z_01a1c2db-0fa2-75f0-aecb-0c9ff070f6d3.jsonl","ts":"2026-11-10T00:33:46.603Z"}
--{"type":"step_finished","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c2db-0fa2-75f0-aecb-0c9ff070f6d3","usage":{"inputTokens":50219,"outputTokens":22890,"costUsd":0.025239},"ts":"2026-11-10T00:36:23.368Z"}
--{"type":"step_started","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--test-debloat-audit/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1","ts":"2026-11-10T00:36:47.782Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"test-debloat-audit","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:36:47.787Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"sizeBytes":24748144,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl","ts":"2026-11-10T00:53:21.439Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"toolCalls":113,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl","ts":"2026-11-10T00:53:21.439Z"}
--{"type":"step_finished","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2e2-d5a8-7324-8be8-2ee2ad29c577","usage":{"inputTokens":684503,"outputTokens":103456,"costUsd":0.179749},"ts":"2026-11-10T00:53:21.978Z"}
--{"type":"plan_closeup_refused","iteration":5,"stragglers":["cache-design-spike","coding-rules-audit","consolidate-integration-helpers-v3","docs-counts-sync","epic-kickoff-gate","epic-shift-report-collection","final-gate-validation","golden-regen-hatch","test-debloat-audit"],"statuses":{"cache-design-spike":"running","coding-rules-audit":"running","consolidate-integration-helpers-v3":"running","docs-counts-sync":"running","epic-kickoff-gate":"running","epic-shift-report-collection":"running","final-gate-validation":"running","golden-regen-hatch":"running","test-debloat-audit":"running"},"redrive":1,"ts":"2026-11-10T00:53:26.301Z"}
--{"type":"step_started","task":"modernize","item":"cache-design-spike","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--cache-design-spike/.factory/tasks/modernize/items/cache-design-spike/steps/002-review-r1-a1","ts":"2026-11-10T00:53:26.643Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"cache-design-spike","step":"review","timeoutSec":3600,"ts":"2026-11-10T00:53:26.649Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"cache-design-spike","step":"review","attempt":1,"sizeBytes":5434036,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-53-26-962Z_01a1c2f2-1332-755e-a9bc-6cbeac5678c6","ts":"2026-11-10T01:14:34.075Z"}
--{"type":"step_finished","task":"modernize","item":"cache-design-spike","step":"review","attempt":1,"status":"ok","sessionId":"01a1c2f2-1332-755e-a9bc-6cbeac5678c6","usage":{"inputTokens":15145,"outputTokens":11192,"costUsd":0.004194},"ts":"2026-11-10T01:14:34.273Z"}
--{"type":"step_started","task":"modernize","item":"coding-rules-audit","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--coding-rules-audit/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1","ts":"2026-11-10T01:14:39.074Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"coding-rules-audit","step":"review","timeoutSec":3600,"ts":"2026-11-10T01:14:39.079Z"}
--{"type":"step_finished","task":"modernize","item":"coding-rules-audit","step":"review","attempt":1,"status":"ok","sessionId":"01a1c305-7da8-7280-a9ac-0ada4ed755d8","usage":{"inputTokens":62055,"outputTokens":28124,"costUsd":0.012651},"ts":"2026-11-10T01:22:03.446Z"}
--{"type":"step_started","task":"modernize","item":"docs-counts-sync","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--docs-counts-sync/.factory/tasks/modernize/items/docs-counts-sync/steps/002-develop-r1-a1","ts":"2026-11-10T01:22:07.514Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"docs-counts-sync","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:22:07.518Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"docs-counts-sync","step":"develop","attempt":1,"sizeBytes":8217325,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T01-22-07-906Z_01a1c30c-55a2-726c-9af7-57506393d238.jsonl","ts":"2026-11-10T01:31:09.061Z"}
--{"type":"step_finished","task":"modernize","item":"docs-counts-sync","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c30c-55a2-726c-9af7-57506393d238","usage":{"inputTokens":46365,"outputTokens":13815,"costUsd":0.017785},"ts":"2026-11-10T01:33:58.882Z"}
--{"type":"step_started","task":"modernize","item":"epic-kickoff-gate","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-kickoff-gate/.factory/tasks/modernize/items/epic-kickoff-gate/steps/002-review-r1-a1","ts":"2026-11-10T01:34:03.084Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"epic-kickoff-gate","step":"review","timeoutSec":3600,"ts":"2026-11-10T01:34:03.089Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"epic-kickoff-gate","step":"review","attempt":1,"sizeBytes":15215198,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T01-34-03-449Z_01a1c317-40b9-7045-891b-557abeb53206.jsonl","ts":"2026-11-10T01:56:20.219Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"epic-kickoff-gate","step":"review","attempt":1,"toolCalls":84,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T01-34-03-449Z_01a1c317-40b9-7045-891b-557abeb53206.jsonl","ts":"2026-11-10T01:56:20.220Z"}
--{"type":"step_finished","task":"modernize","item":"epic-kickoff-gate","step":"review","attempt":1,"status":"ok","sessionId":"01a1c317-40b9-7045-891b-557abeb53206","usage":{"inputTokens":66678,"outputTokens":38216,"costUsd":0.016459},"ts":"2026-11-10T01:56:20.508Z"}
--{"type":"step_started","task":"modernize","step":"consult-epic-kickoff-gate-1","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1","ts":"2026-11-10T01:56:24.881Z"}
--{"type":"step_timeout_armed","task":"modernize","step":"consult-epic-kickoff-gate-1","timeoutSec":7200,"ts":"2026-11-10T01:56:24.886Z"}
--{"type":"step_transcript_size_warning","task":"modernize","step":"consult-epic-kickoff-gate-1","attempt":1,"sizeBytes":29485392,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T00-51-56-494Z_01a1b8a3-f9ce-7511-963e-37a3531a2d3a.jsonl","ts":"2026-11-10T01:57:41.997Z"}
--{"type":"step_finished","task":"modernize","step":"consult-epic-kickoff-gate-1","attempt":1,"status":"ok","sessionId":"01a1b8a3-f9ce-7511-963e-37a3531a2d3a","usage":{"inputTokens":745626,"outputTokens":2121,"costUsd":0.076477},"ts":"2026-11-10T01:57:42.064Z"}
--{"type":"decision_made","context":"item","item":"epic-kickoff-gate","decision":"abandon","decisionPath":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize/.factory/tasks/modernize/decisions/031-item-epic-kickoff-gate-1.yaml","ts":"2026-11-10T01:57:42.065Z"}
--{"type":"step_started","task":"modernize","item":"epic-shift-report-collection","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-shift-report-collection/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1","ts":"2026-11-10T01:57:47.397Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"epic-shift-report-collection","step":"review","timeoutSec":3600,"ts":"2026-11-10T01:57:47.403Z"}
--{"type":"step_finished","task":"modernize","item":"epic-shift-report-collection","step":"review","attempt":1,"status":"ok","sessionId":"01a1c32c-fc3a-739a-bdf5-12561aba5a62","usage":{"inputTokens":72270,"outputTokens":7195,"costUsd":0.008666},"ts":"2026-11-10T02:01:25.289Z"}
--{"type":"step_started","task":"modernize","item":"final-gate-validation","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--final-gate-validation/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1","ts":"2026-11-10T02:01:30.243Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"final-gate-validation","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:01:30.249Z"}
--{"type":"step_transcript_size_warning","task":"modernize","item":"final-gate-validation","step":"review","attempt":1,"sizeBytes":7789487,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T02-01-30-623Z_01a1c330-62ff-70fa-b95e-f3ae4acfa416.jsonl","ts":"2026-11-10T02:23:05.566Z"}
--{"type":"step_tool_call_warning","task":"modernize","item":"final-gate-validation","step":"review","attempt":1,"toolCalls":61,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T02-01-30-623Z_01a1c330-62ff-70fa-b95e-f3ae4acfa416.jsonl","ts":"2026-11-10T02:23:05.567Z"}
--{"type":"step_finished","task":"modernize","item":"final-gate-validation","step":"review","attempt":1,"status":"ok","sessionId":"01a1c330-62ff-70fa-b95e-f3ae4acfa416","usage":{"inputTokens":79826,"outputTokens":38243,"costUsd":0.01706},"ts":"2026-11-10T02:23:05.999Z"}
--{"type":"step_started","task":"modernize","item":"golden-regen-hatch","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-regen-hatch/.factory/tasks/modernize/items/golden-regen-hatch/steps/002-review-r1-a1","ts":"2026-11-10T02:23:12.674Z"}
--{"type":"step_timeout_armed","task":"modernize","item":"golden-regen-hatch","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:23:12.681Z"}
-diff --git a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/input.md b/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/input.md
-deleted file mode 100644
-index c838e62..0000000
---- a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/input.md
-+++ /dev/null
-@@ -1,1132 +0,0 @@
--# Step: Architect Consult (Item)
--
--## Goal
--Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
--
--## Rules
--- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `modernize` (iteration 5 starting state)
--
--**Repository**: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT (`pyproject.toml:19-20`). Worktree `topic/modernize`, HEAD `0944670`.
--
--**Gates verified in this worktree on 2026-11-09** (read-only execution):
--
--| Gate | Result | Evidence |
--|---|---|---|
--| `uv run pytest -q` | 1357 passed, 7 deselected, 4 warnings, 26.6 s | default collection does **not** include `tests/integration.py` (filename is not `test_*.py`) |
--| `uv run pytest tests/integration.py -v` | 9 passed, 56.6 s | run explicitly per AGENTS/README |
--| `uv run lint` | exit 0, all 14 tools PASSED, 57.7 s | `lint.baseline` is `[]` (`lint.baseline:1`) |
--
--**Intent status at a glance**
--
--| Intent clause | State at HEAD | Primary evidence |
--|---|---|---|
--| Enforce `CodingRules.md` / `AGENTS.md` | Mostly done; lint gates green, but docs/ADR drift and some dead placeholders remain | `lint.baseline:1`; `AGENTS.md:9-11`, `AGENTS.md:79-85`; `docs/adr/ADR-016.md:1-5` |
--| Debloat code and tests; keep test intent | Partially done (recent prune removed self-lint/config-consistency tests); concrete duplication and dead helpers remain | §4.4 below; `tests/checkers/test_tmp_path_checker.py:19-32`; `tests/runner/_factories.py:167,200`; `tests/runner/test_real_pipeline_smoke.py:1-42` |
--| Replace embedding/rerank justification check with a CPU-friendly small decision model | **Half done**: reranker is gone and the veto backend protocol exists, but no production model is wired and no optional dependency ships | `src/python_setup_lint/checkers/_semantic.py:1-65`; `src/python_setup_lint/checkers/_decision_backend.py:37-59`; `pyproject.toml:28-30`; `tests/checkers/test_semantic_check.py:119-123` |
--| Keep a git-stored cache with cleanup | **Not implemented**: only a process-local memo exists; no `.python-setup-decisions.json`, refresh path, or pruning | `src/python_setup_lint/checkers/_semantic.py:15-25,47-64`; `tests/assumptions/test_pylint_cache_semantics.py:8-12`; `docs/adr/ADR-010.md:26-36` |
--| Preserve every material lint/check behavior | Green at HEAD; golden pins 158 findings including 18 W9704, but semantic is disabled during golden capture | `tests/data/golden/minimal_sample_project_findings.json`; `tests/integration.py:110-129`; `tests/_golden.py:54` |
--
-----
--
--## 1. Module Map
--
--### 1.1 Semantic justification subsystem (primary intent area)
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `src/python_setup_lint/checkers/_decision_backend.py` | `DecisionBackend` protocol, `FakeBackend`, test-only dotted-path loader, `get_backend()`, pinned threshold/prompt constants, warn-once state | `:10-13`, `:16-30`, `:37-59` |
--| `src/python_setup_lint/checkers/_decision_backend.pyi` | Public stub: `DECISION_THRESHOLD`, `PROMPT_VERSION`, protocol, `FakeBackend`, `get_backend` | `:1-20` |
--| `src/python_setup_lint/checkers/_semantic.py` | Thin adapter: resolves backend, computes SHA-256 cache key, applies `>= DECISION_THRESHOLD`, owns in-memory memo | `:1-65` |
--| `src/python_setup_lint/checkers/_semantic.pyi` | Stub documenting the adapter contract | `:1-23` |
--| `src/python_setup_lint/checkers/_base.py` | `normalize_suppressed_codes`, heuristic-first `check_if_meaningful`, env gate, lazy `_semantic` import | `:145-156`, `:159-252` |
--| `src/python_setup_lint/checkers/conformance/suppression_justification_checker.py` | W9704 `unjustified-suppression`: scans suppression comments and `Any` annotations, calls `check_if_meaningful` | `:33-41`, `:63-91`, `:136-162`, `:330-388` |
--| `src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py` | W9738 `bare-except-comment`, second consumer of `check_if_meaningful` | `:14`, `:103-118` |
--| `docs/semantic-justification.md` | Current *stale* narrative of the reranker pipeline and caches | `:1-62` |
--| `docs/custom-checks.md` | Checker-authoring guide; semantic helper description stale | `:97`, `:104` |
--
--### 1.2 Checker subsystem
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `src/python_setup_lint/checkers/conformance/` | Conformance checkers: beartype, no-try-import, tmp-path, structlog, suppression justification, bare-except, missing error-chain, silent-except, generic-key-dict, unnamed-tuple-dict, trivial-wrapper, redundant-type-guard, pyi-underscore, missing-return-annotation, asyncio-timeout | directory listing |
--| `src/python_setup_lint/checkers/stub/` | Stub fidelity/coverage/docstring checkers and annotation normalizer | `checker.py`, `coverage.py`, `docstring_checker.py`, `normalizer.py`, `fidelity/*` |
--| `config/.pylintrc` | Source-code rcfile; enables custom rules and `max-module-lines=500`, `max-statements=65`, `max-branches=16` | `:2`, `:17`, `:19`, `:22-23` |
--| `config/.pylintrc-pyi` | Stub-file rcfile | `:12-13` |
--| `config/.pylintrc-tests` | Test-file ruleset (production-only rules disabled; W9704/W9702 still enabled) | `:20`, `:37`, `:39`, `:42-47` |
--
--### 1.3 Runner subsystem
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `src/python_setup_lint/runner/_tool_specs.py` | Single-source 14 built-in `ToolSpec` entries | `:9-100`, `:102` |
--| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry, command builders, autofix ordering, baseline fallback | `:62-359`, `:350-359` |
--| `src/python_setup_lint/runner/cli.py` | CLI, tool selection, skip reasons, serial pipeline, `run_lint` | `:110-201`, `:204-...`, argument parser `:280-366` |
--| `src/python_setup_lint/runner/baseline.py` | Baseline diff/merge and fallback inspection | module |
--| `src/python_setup_lint/runner/parsers.py`, `_record_parsers.py` | Output parsers (JSON, regex, record parsers) | modules |
--| `src/python_setup_lint/runner/_autofix.py` | Autofix conflict detection and staged/unstaged handling | module |
--| `src/python_setup_lint/runner/_config.py`, `cmd_build.py` | Config discovery and command composition | modules |
--| `src/python_setup_lint/runner/types.py` | `ToolSpec`, `LintResult`, `RunnerConfig`, `ViolationCount` | `:12-22`, `:25-59` |
--
--### 1.4 Setup / packaging / test helpers
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `src/python_setup_lint/setup.py` | `install()` / `main()`: dependency step, pylint plugin registration, config symlinks, state/checksums | `:41-56`, `:149-205`, `:223-290`, `:318-364` |
--| `src/python_setup_lint/_setup_pyproject.py` | TOML read/write, pylint load-plugins, dev-dependency detection (extras stripped) | `:19-97` |
--| `src/python_setup_lint/_setup_precommit.py` | Pre-commit config and AGENTS snippet generation/atomic writes | `:70-...` |
--| `src/python_setup_lint/_setup_update.py` | Drift detection + `uv add --refresh-package` update flow | `:11-...` |
--| `src/python_setup_lint/testing.py` | Shared `_make_tc` / `_walk_and_release`, lint-runner fakes, consumer health checks | `:18-38`, `:44-103`, `:115-196` |
--| `pyproject.toml` | Package metadata, empty `[semantic]` extra, pytest markers (`not slow` default) | `:1-4`, `:28-30`, `:47-54` |
--| `uv.lock` | Locked dependencies; root provides `semantic` extra, currently empty | `:573-623` |
--| `.gitignore` | Generated consumer artifacts; legacy semantic model cache ignored | `:222-244` |
--
--### 1.5 Documentation / decision register
--
--| Path | Responsibility | Key lines / state |
--|---|---|---|
--| `CodingRules.md` | Shipped coding rules: typing, `.pyi`, simplification, complexity, tests | `:1-75`, `:90-159`, `:230-307` |
--| `AGENTS.md` | Agent entry point: commands, tool scope, pipeline, test strategy | `:5-14`, `:16-32`, `:79-93` |
--| `docs/adr/README.md` | ADR index — **omits ADR-013…ADR-016** | `:16-31` |
--| `docs/adr/ADR-009.md` | Accepted no-go-gated deferral for the model | `:1-48` |
--| `docs/adr/ADR-010.md` | Frozen backend + tracked-cache contracts | `:1-52` |
--| `docs/adr/ADR-014.md` | Heuristic-first veto semantics (now implemented; text stale) | `:1-5` |
--| `docs/adr/ADR-015.md` | Pylint-pyi scope fix deferred to iteration 5 | `:1-3` |
--| `docs/adr/ADR-016.md` | Iteration-4 infrastructure-only scope — **claims no backend/cache/FakeBackend exists, contradicted by HEAD** | `:1-5` |
--| `design/0001`, `design/0002` | Config composers; ty src-only exception | files |
--| `README.md`, `docs/tutorials.md`, `docs/troubleshooting.md` | Consumer docs; semantic sections stale | `README.md:29,105`; `tutorials.md:12-16`; `troubleshooting.md:97-111,150` |
--
--### 1.6 Test subsystems
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `tests/checkers/` | Per-checker behavioral tests over real pylint `CheckerTestCase`; `_factories_*` data modules | 45 `.py` files incl. helpers |
--| `tests/runner/` | Runner unit/integration tests, autofix, parsers, setup, benchmarks | 30 `.py` files |
--| `tests/assumptions/` | Third-party contract pins (astroid, beartype, pylint, pylint cache semantics) | `test_pylint_cache_semantics.py:1-39` |
--| `tests/_golden.py` | Golden snapshot normalization/serialization/assertions + CI-guarded rewrite | `:1-11`, `:53-58`, `:374-392` |
--| `tests/test_golden.py` | Synthetic unit tests for golden helpers | `:1-6` |
--| `tests/integration.py` | Fit-for-purpose end-to-end gate on planted sample project | `:1-145` |
--| `tests/data/minimal_sample_project/` | Planted-violation fixture project (W9704 brush-off vs carry-from) | `src/minimal_sample/mod.py:41-56`, `violations.txt` |
--| `tests/data/golden/minimal_sample_project_findings.json` | 158 normalized findings; 18 `unjustified-suppression`, 2 `bare-except-comment` | golden file |
--
-----
--
--## 2. Key Interfaces & Signatures
--
--### 2.1 Decision backend (`src/python_setup_lint/checkers/_decision_backend.py`)
--
--```python
--DECISION_THRESHOLD: float = 0.5          # :10
--PROMPT_VERSION: str = "prompt-v1"        # :11
--
--@runtime_checkable
--class DecisionBackend(Protocol):          # :16-20
--    model_id: str
--    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
--
--class FakeBackend:                        # :23-30
--    model_id: str = "fake-backend rev test prompt-v1"
--    def __init__(self, score: float = 1.0) -> None: ...
--    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
--
--def get_backend() -> DecisionBackend | None: ...   # :49-59
--```
--
--Behavior of `get_backend()` at HEAD:
--
--- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored **only** when `PYTEST_CURRENT_TEST` is set, then imports an arbitrary `module:attribute` factory (`_decision_backend.py:37-46`).
--- `PYTHON_SETUP_LINT_RERANKER_MODEL` emits a one-time deprecation warning (`:51-53`).
--- `PYTHON_SETUP_LINT_DECISION_MODEL` is read but only emits a one-time `decision_model_unavailable` warning; it never constructs a backend (`:55-58`).
--- Production default is therefore always `None` → heuristic-only behavior.
--
--### 2.2 Semantic adapter (`src/python_setup_lint/checkers/_semantic.py`)
--
--```python
--_RESULT_CACHE: dict[int, bool] | None = None     # :16
--
--def _reset_cache() -> None: ...                  # :19-25 (test helper, not in .pyi)
--
--@beartype
--def semantic_check_if_meaningful(                # :28-65
--    text: str,
--    *,
--    rule: str | None = None,
--    code_context: str | None = None,
--    comment: str | None = None,
--    backend: DecisionBackend | None = None,
--) -> bool | None: ...
--```
--
--Contract: `primary = (comment or text).strip()`; empty → `False`; no backend → `None`; otherwise `decide(primary, rule, code_context) >= 0.5`; result memoized in `_RESULT_CACHE` keyed by the first 8 bytes of SHA-256 over `(primary, rule, code_context, model_id)` (`:37-64`).
--
--### 2.3 Heuristic-first gate (`src/python_setup_lint/checkers/_base.py`)
--
--```python
--def normalize_suppressed_codes(raw: str) -> str: ...   # :148-156
--
--def check_if_meaningful(                               # :159-252
--    text: str,
--    *,
--    rule: str | None = None,
--    code_context: str | None = None,
--    comment: str | None = None,
--    backend: DecisionBackend | None = None,
--) -> bool: ...
--```
--
--Order is strict:
--
--1. Normalize directive text and strip echoed codes (`:168`, `:145-156`).
--2. Reject `<5` chars, boilerplate tokens, multi-word brush-offs, and rule-symbol-only reasons (`:169-246`).
--3. If `PYTHON_SETUP_LINT_SEMANTIC != "1"` → return `True` (`:248-249`).
--4. Lazily import `_semantic` and return `semantic_check_if_meaningful(...) is not False` (`:250-252`).
--
--Consequence: the backend can **only veto** a heuristic-meaningful justification; it can never resurrect a heuristic rejection. `None` (no backend) maps to `True`.
--
--### 2.4 W9704 consumer (`suppression_justification_checker.py`)
--
--```python
--msgs = _msgs(W9704=MessageDef(
--    message="Suppression comment without technical justification: %s",
--    symbol="unjustified-suppression", ...))              # :33-41
--
--# module-level scan of raw source lines
--self._legacy_scan(node, lines)                            # :63-91
--
--# Any annotation path
--self._emit_if_unjustified(annotation, lineno)             # :136-162
--
--# trailing/preceding reason validation
--self._has_justification(lines, idx)                       # :330-388
--```
--
--Both paths call `check_if_meaningful(reason, comment=reason, rule="unjustified-suppression", code_context=<code before #>)` (`:152-155`, `:372-375`, `:383-386`). The checker knows the file path via `node.root().file` (`_base.py:68-75`) but does not pass it to the semantic API.
--
--### 2.5 Runner / test helpers
--
--- `ToolSpec` and `RunnerConfig` (`runner/types.py:12-22`, `:49-59`); `TOOLS` list (`runner/_tool_specs.py:9-100`); `run_lint(...)` (`runner/cli.py:204-...`).
--- `_make_tc(checker_class)` and `_walk_and_release(code, checker_class, *, file_path, module_name)` (`testing.py:18-38`) are the intended shared checker-test harness.
--- Golden contract: `Finding = {tool,file,line,col,rule}`, multiset diff, `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` opt-in, refused under `CI`/`GITHUB_ACTIONS` (`tests/_golden.py:1-11`, `:53-58`, `:374-392`).
--
-----
--
--## 3. Relevant Excerpts
--
--### 3.1 Full current semantic adapter
--
--`src/python_setup_lint/checkers/_semantic.py:15-65`:
--
--```python
--_RESULT_CACHE: dict[int, bool] | None = None
--
--def _reset_cache() -> None:
--    global _RESULT_CACHE
--    _RESULT_CACHE = None
--
--@beartype
--def semantic_check_if_meaningful(...) -> bool | None:
--    primary = (comment or text).strip()
--    global _RESULT_CACHE
--    if _RESULT_CACHE is None:
--        _RESULT_CACHE = {}
--    if not primary:
--        return False
--    resolved = backend if backend is not None else _decision_backend.get_backend()
--    if resolved is None:
--        return None
--    cache_key = hashlib.sha256("|".join(str(x) for x in (
--        primary, rule, code_context, resolved.model_id)).encode()).digest()
--    cache_key_int = int.from_bytes(cache_key[:8], "big")
--    if cache_key_int in _RESULT_CACHE:
--        return _RESULT_CACHE[cache_key_int]
--    result = resolved.decide(primary, rule, code_context) >= _decision_backend.DECISION_THRESHOLD
--    _RESULT_CACHE[cache_key_int] = result
--    return result
--```
--
--Observations for the architect:
--
--- The memo is process-local only; nothing is persisted.
--- The key truncates SHA-256 to 64 bits (`:59`) — the same truncation ADR-003 criticized in the retired on-disk cache (`docs/adr/ADR-003.md:7`).
--- `comment` is folded into `primary`, so the key does not separately include it; docs claim `(text, rule, code_context, comment, model)` (`docs/custom-checks.md:97`).
--- `code_context` participates in the key, so any source-line edit invalidates an entry even if the justification is unchanged.
--- `model_id` participates, so a model/prompt swap invalidates entries — but `PROMPT_VERSION` is not currently folded into `model_id` by production code.
--
--### 3.2 Heuristic gate and env behavior
--
--`src/python_setup_lint/checkers/_base.py:248-252`:
--
--```python
--if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") != "1":
--    return True
--from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
--
--return _semantic_check(primary, rule=rule, code_context=code_context, comment=primary, backend=backend) is not False
--```
--
--- Semantic is **on by default**; absence of a backend yields heuristic behavior because `_semantic` returns `None`.
--- The lazy import means `_semantic` is never imported when `PYTHON_SETUP_LINT_SEMANTIC=0` (`docs/semantic-justification.md:18`, verified by tests).
--- The same gate governs W9738 `bare-except-comment` (`bare_except_comment_checker.py:103-118`).
--
--### 3.3 W9704 justification resolution
--
--`suppression_justification_checker.py:350-388`:
--
--```python
--_suppression_patterns = (_PAT_PYLINT_DISABLE, _PAT_NOQA, _PAT_TYPE_IGNORE, _PAT_TY_IGNORE)
--for pat in _suppression_patterns:
--    for m in pat.finditer(line):
--        after = line[m.end():]
--        ...  # only search before the next suppression pattern
--        tm = _PAT_TRAILING_REASON.search(search_after)
--        if tm:
--            reason = tm.group(1)
--            if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
--                                   code_context=line.split("#", 1)[0].strip()):
--                return True
--
--if idx > 0:
--    pm = _PAT_PRECEDING_COMMENT.match(prev)
--    if pm:
--        reason = pm.group(1)
--        if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
--                               code_context=lines[idx].split("#", 1)[0].strip()):
--            return True
--return False
--```
--
--A tracked cache keyed by file path would need this caller to supply file identity; today it does not.
--
--### 3.4 Packaging and pytest configuration
--
--`pyproject.toml:28-30`:
--
--```toml
--[project.optional-dependencies]
--# Empty placeholder: no model dependency ships in iteration 4 (ADR-016).
--semantic = []
--```
--
--`pyproject.toml:47-54`:
--
--```toml
--[tool.pytest.ini_options]
--addopts = "-m 'not slow'"
--markers = [
--  "slow: ...full pipeline runs...",
--  "no_external_api: ...",
--  "with_real_api: ...",
--  "implementation_detail: ...",
--]
--```
--
--`uv.lock:623` likewise reports `provides-extras = ["semantic"]` with no dependencies.
--
--### 3.5 Cache-related ignore and secrets constraints
--
--- `.gitignore:243-244` still names the retired machine cache: `# NLP semantic model cache (sentence-transformers)` / `.cache/python-setup/semantic/`.
--- `.secrets.baseline` enables `HexHighEntropyString` with `limit: 3.0`, so a committed result cache must not contain raw long hex digests; ADR-010 already requires “no bare hex strings of length >= 20” (`docs/adr/ADR-010.md:26-28`).
--- ADR-011 says the tracked decisions file is consumer-runtime data, is committed, and gets **no** hatch/wheel entry (`docs/adr/ADR-011.md:54-60`).
--
--### 3.6 ADR state (decisions vs implementation)
--
--- `docs/adr/ADR-009.md:5` — accepted deferral; `:9-13` documents the 215-meaningful / 0-meaningless corpus no-go; `:23-27` requires a double-rated sample and a human Fastino license decision; `:35-37` requires a CPU benchmark and forbids claiming the swap complete.
--- `docs/adr/ADR-009.md:29-33` claims iteration 3 delivers “Heuristic-first `DecisionBackend` plus tracked-cache infrastructure” — the backend half exists; the tracked-cache half does not.
--- `docs/adr/ADR-010.md:23-36` freezes: backend protocol, `.python-setup-decisions.json` at the linted project root, sorted `indent=2`/`sort_keys` JSON array, no hex≥20, read-only lint with a hash-asserted zero-write check, explicit CI-guarded refresh (lockfile + merge + atomic replace), pruning of missing files/stale model IDs, and writer-first concurrency from the pylint verdict.
--- `docs/adr/ADR-010.md:38-41` and `_decision_backend.py:37-46` pin the dotted-path loader as test-only.
--- `docs/adr/ADR-014.md:1-5` claims current code is semantic-first with heuristic fallback; HEAD is heuristic-first (`_base.py:248-252`; `_decision_backend.py:16-20`), so the record is stale.
--- `docs/adr/ADR-016.md:1-5` claims “At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled.” All three claims are false at HEAD: `_decision_backend.py` exists, `pyproject.toml:28-30` is empty, and tests pin the absence of `sentence_transformers` (`tests/checkers/test_semantic_check.py:119-123`, `tests/checkers/test_decision_backend.py:329-337`).
--- `docs/adr/ADR-015.md:1-3` is an open iteration-5 deferral: `_PylintPyiLintTool` passes `.pyi` paths but pylint lints companion `.py` (42 of 43 `pylint-pyi` golden findings are on `.py` files); probe found 205 latent private stub symbols; fixing changes the golden.
--- `docs/adr/README.md:18-31` indexes only ADR-001…ADR-012; ADR-013…ADR-016 are absent.
--
-----
--
--## 4. Existing Tests & Conventions
--
--### 4.1 Layout and style
--
--- Unit tests: `tests/checkers/`, `tests/runner/`, `tests/test_golden.py`, `tests/test_setup_*`; 85 test modules, 794 test functions before parametrization, 19,627 lines total (`tests/`).
--- Naming convention `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`).
--- Markers: `slow` (excluded by default via `addopts = "-m 'not slow'"`), `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:47-54`).
--- Mocking policy: mock only external boundaries; first-party code always real (`CodingRules.md:240-252`). Checker tests therefore instantiate real `BaseChecker` subclasses through `CheckerTestCase`.
--- Shared fixtures live in `tests/conftest.py` (`:40-169`): `empty_project`, session-scoped `configured_project`, `runner_config_factory`, `isolated_runner_registries`, `sample_project`.
--- Test factories for complex checker inputs are split by domain to respect the 500-line C0302 limit (`tests/checkers/_factories.py:1-16`; `_factories_stub*.py`).
--
--### 4.2 Semantic/backend tests (current contract)
--
--| File | Coverage | Key lines |
--|---|---|---|
--| `tests/checkers/test_decision_backend.py` | Pinned constants, FakeBackend, loader gating, heuristic-first veto, normalization, packaging pins | `:1-6`, `:83-165`, `:181-264`, `:320-337` |
--| `tests/checkers/test_semantic_check.py` | Adapter signature, empty-primary, `None` mapping, 0.5 threshold matrix, memo per unique pair/model, no `sentence_transformers`, no disk cache | `:47-133` |
--| `tests/checkers/test_semantic_threshold.py` | 115-row heuristic table, semantic disabled | `:16-21`, `:147-164` |
--| `tests/assumptions/test_pylint_cache_semantics.py` | Read-only behavior, in-process memo, path-free semantic API, `jobs=1` single-writer verdict, sequential pylint invocation | `:1-39`, `:94-181`, `:225-355` |
--| `tests/checkers/test_suppression_justification_checker.py` | W9704 checker behavior; semantic disabled via fixture | `:19-30`, `:367-392` |
--| `tests/checkers/test_bare_except_comment_checker.py` | W9738 checker behavior; semantic disabled via fixture | `:18-43` |
--
--Important: no test exercises a real model. Every backend is a test double (`test_decision_backend.py:1-6`). The current test suite actively pins the **absence** of a model dependency (`test_semantic_extra_is_empty`, `test_uv_lock_has_no_sentence_transformers_edge` at `:323-337`; `test_no_try_import_checker.py:27-35`; `_OPTIONAL_IMPORT_PATTERNS` empty at `no_try_import_checker.py:10-13`). Any model wiring must update these pins deliberately.
--
--### 4.3 Behavior-preservation gates
--
--- Golden snapshot: 158 findings across all 14 tools; per-tool minimums; multiset comparison catches duplicates/moved lines/new false positives (`tests/_golden.py:1-11`; `tests/data/golden/minimal_sample_project_findings.json`).
--- 18 `unjustified-suppression` findings (6 each for `pylint`, `pylint-pyi`, `pylint tests`) and 2 `bare-except-comment` findings.
--- Golden capture runs with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so semantic-enabled behavior is **not** covered by the golden.
--- Integration also asserts brush-off W9704 at `mod.py:49` and no W9704 for carry-from at `mod.py:56` (`tests/integration.py:124-129`; fixture `tests/data/minimal_sample_project/src/minimal_sample/mod.py:49,56`).
--- `lint.baseline` is empty, so self-lint fails on any new violation (`lint.baseline:1`).
--
--### 4.4 Debloat evidence (measured at HEAD)
--
--**Duplicated checker-test harness:**
--
--- `_make_tc` local wrapper exists in 13 test files; `_walk_and_release` in 10; `_msg_ids` in 8. The shared implementations already exist in `testing.py:18-38`.
--- Examples: `tests/checkers/test_tmp_path_checker.py:19-32` (calls `tc.checker.open()`), `tests/checkers/test_missing_error_chain_checker.py:16-32` (does not call `open()`), `tests/checkers/test_suppression_justification_checker.py:19-20` (imports the shared helper but still defines `_msg_ids`).
--- The wrappers are not byte-identical: some call `checker.open()` (SourceRootMixin checkers) and some pass `module_name`. A shared helper needs an `open_checker`/`module_name` option rather than naive deletion.
--
--**Duplicated semantic test double:**
--
--- `_RecordingBackend` appears three times: `tests/checkers/test_decision_backend.py:44-55`, `tests/checkers/test_semantic_check.py:25-36`, `tests/assumptions/test_pylint_cache_semantics.py:80-91`.
--
--**Duplicated runner/setup helpers:**
--
--- `_UvCallRecorder` appears twice: `tests/runner/test_setup.py:39-60` and `tests/runner/test_setup_install.py:36-58`.
--- `extra_block` appears twice: `tests/runner/_factories.py:174-176` and `tests/runner/_factories_extras.py:45-47`.
--- `_semantic_disabled` fixture appears twice: `tests/checkers/test_bare_except_comment_checker.py:37-40` and `tests/checkers/test_suppression_justification_checker.py:23-26`.
--
--**Dead/vestigial test code:**
--
--- `assert_violation_contains_any` (`tests/runner/_factories.py:167-171`), `assert_r4_reason` (`:200-206`), and `baseline_entry_for_tool` (`tests/runner/_factories_baseline.py:26-28`) have no call sites.
--- `sample_project` fixture (`tests/conftest.py:166-169`) has no call sites.
--- `test_check_writes_no_disk_cache` monkeypatches `_CACHE_DIR`/`_RESULT_CACHE_FILE`, attributes that no longer exist, with `raising=False` (`tests/checkers/test_semantic_check.py:126-133`).
--- The `semantic_disk` fixture does the same for `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RESULT_CACHE` (`tests/assumptions/test_pylint_cache_semantics.py:94-106`). These assert the absence of a retired implementation rather than a live contract.
--- `tests/runner/test_real_pipeline_smoke.py:1-42` runs the full pipeline and asserts only an int return plus all 14 section markers; this overlaps `tests/integration.py:57-145` and the fake-driven all-tools assertion in `tests/runner/test_lint_runner_integration.py:230-248`.
--- Recent prune precedent: commit `644774e` deleted `test_config_consistency.py`, `test_self_lint_clean.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` and trimmed `test_autofix_conflict_integration.py` — the “never test linting” direction is already established.
--
--**Source-side dead/placeholder code:**
--
--- `PROMPT_VERSION` (`_decision_backend.py:11`) is unused in production; only tests assert it (`test_decision_backend.py:87-88`).
--- `PYTHON_SETUP_LINT_DECISION_MODEL` is read only to warn that no model exists (`_decision_backend.py:55-58`; test `:141-151`).
--- `_semantic.py` needs two `global` statements and a nullable memo solely for lazy initialization (`:16,24,39-41`); a module-level dict + `.clear()` would remove both.
--- `_base.check_if_meaningful` rebuilds the 46-token boilerplate set and 20-phrase set on every call (`:172-241`); module-level `frozenset`s would preserve behavior and cut per-call work.
--- `_PylintPyiLintTool` and `_PylintTestsLintTool` duplicate “explicit override then auto-discovery” rcfile resolution (`dispatch.py:249-277` vs `:280-309`), while `_PylintLintTool` uses `_resolve_pylintrc` (`:201-246`).
--- `src/python_setup_lint/checkers/__init__.py` has only the license header and no module docstring (unlike `runner/__init__.py` and `conformance/__init__.py`).
--- `docs/adr/ADR-016.md` and `ADR-014.md` are stale; the ADR index omits 013-016 (`docs/adr/README.md:18-31`).
--- `pyproject.toml:3` says 1.2.10 while `CHANGELOG.md:3` tops out at v1.2.9 (minor release-doc drift).
--
--### 4.5 Test-infrastructure conventions to extend first
--
--The intent says “test infra/assumptions first.” The existing template is `tests/assumptions/`:
--
--- Each module opens with the observed third-party version and the contract being pinned (`test_pylint_cache_semantics.py:1-39`, `test_astroid_contracts.py:1-7`, `test_beartype_contracts.py:1-11`, `test_pylint_contracts.py:1-6`).
--- `pytestmark = pytest.mark.no_external_api` on every assumption module.
--- Tests are behavioral and assert observed consequences, not implementation internals; failures are meant to trigger re-derivation before loosening.
--- For the cache writer, `TestPylintRcfileJobsWatchdog` and `TestPylintInvocationConcurrency` already pin `jobs=1`, sequential dispatch, and the absence of `concurrent`/`multiprocessing` imports in the runner (`:225-355`). This is the writer-first verdict ADR-010 requires.
--- For benchmarks, `tests/runner/test_bench_runner_overhead.py:1-14` shows the convention: `@pytest.mark.slow`, real subprocesses, measured wall time/RSS, artifact written under `tmp_path`.
--
-----
--
--## 5. Open Questions & Uncertainties
--
--### Q1. Which model satisfies the intent, and can the ADR-009 gate be closed now?
--
--- The intent names `fastino/GLiDE-0.4B` or smaller. External facts: GLiDE-0.4B is a 0.40B-parameter encoder, 0.81 GB bf16 weights, tested on an RTX PRO 6000, requires `torch==2.14.0` (CUDA 13.0 wheels) and `transformers==5.17.0`; its `glide/` inference package lives in the HF repo, not as a normal PyPI dependency ([model card](https://huggingface.co/fastino/GLiDE-0.4B)).
--- The GLiDE collection’s smallest member is 0.4B (others: 0.8B, 2B, 9B, 27B) ([collection](https://huggingface.co/collections/fastino/glide)), so “or smaller” requires a different model family.
--- License is the Fastino Community License: free use, but production commercial use by an entity with annual revenue > $10M requires a separate written agreement; any commercial use requires “Built with Fastino GLiDE” attribution; derivative works must be distributed under the same license ([LICENSE](https://huggingface.co/fastino/GLiDE-0.4B/blob/main/LICENSE)). The project itself is MIT (`pyproject.toml:19-20`).
--- ADR-009’s corpus gate remains untouched: 215 meaningful / 0 meaningless labels, all single-author (`docs/adr/ADR-009.md:9-13`). No corpus artifacts exist in the repository (only `tests/data/golden/` and `tests/data/minimal_sample_project/`).
--- No CPU benchmark exists; ADR-016 explicitly lists “no CPU bench” as open (`docs/adr/ADR-016.md:3`).
--- Decision framing: (a) spike GLiDE CPU latency and packaging, then implement an optional backend; (b) choose a smaller permissively licensed zero-shot/classifier model, which still needs evaluation data; or (c) keep heuristic-only behavior and record another explicit deferral. Option (c) conflicts with the literal intent unless the operator accepts the ADR-009 gate again.
--
--### Q2. How should a production backend be wired, and should it be default-on?
--
--- `get_backend()` currently has no production model path; it returns a test-only dotted-path backend or `None` (`_decision_backend.py:37-59`). ADR-010 says a compliant model “plugs in through `get_backend()` plus `DECISION_MODEL` with no pipeline refactor” (`docs/adr/ADR-010.md:47-48`), but no loader code exists for that env var.
--- `PYTHON_SETUP_LINT_DECISION_MODEL` is parsed but never used (`_decision_backend.py:55-58`), and `PROMPT_VERSION` is dead (`:11`).
--- The present veto semantics mean a backend can only make lint stricter (`_base.py:248-252`; tests `test_decision_backend.py:181-229`). Default-on would change W9704/W9738 outcomes for every consumer that installs the extra; default-off would preserve behavior but make the feature opt-in.
--- The architect must also decide failure semantics: missing extra, model download failure, OOM, CPU timeout, and malformed model output all currently collapse to `None` → heuristic pass. Is that acceptable for a tool advertised as validating suppressions?
--
--### Q3. Git-stored decision cache: schema, keying, and the path-free API tension
--
--ADR-010 freezes the contract (`docs/adr/ADR-010.md:26-36`) but the repository documents no schema or key encoding beyond “JSON array sorted, indent=2, sort_keys, no bare hex ≥20.” Open decisions:
--
--- **File identity vs path-free API**: pruning requires file paths in cache entries (ADR-010:33), but `semantic_check_if_meaningful` is deliberately path-free (`tests/assumptions/test_pylint_cache_semantics.py:171-181`) and its callers (`suppression_justification_checker.py:152-155,372-386`; `bare_except_comment_checker.py:103-118`) do not pass a path. Options: extend the checker→semantic call with a file path, add a separate cache API at the checker layer, or key by content and prune by scanning the repo. Each has test/behavior implications.
--- **Key composition**: current memo includes `(primary, rule, code_context, model_id)` and truncates to 64 bits (`_semantic.py:47-64`). A tracked cache should likely key on file path + normalized justification + rule + model/prompt version; whether `code_context` belongs in the key determines churn vs sensitivity.
--- **Score vs verdict**: storing a boolean loses the ability to re-threshold; storing a float lets `DECISION_THRESHOLD` changes apply without re-running the model, but requires calibrating model output to `[0,1]` (the protocol promises this, but does not enforce it; `_decision_backend.py:16-20`).
--- **Refresh command**: there is no CLI surface today (`runner/cli.py:280-366` lists all args; none refresh decisions). ADR-010 requires an explicit CI-guarded refresh path with lockfile + merge + atomic replace. The golden-update guard pattern (`tests/_golden.py:374-392`: refuse under `CI`/`GITHUB_ACTIONS`) is a reusable precedent.
--- **Read-only lint**: ordinary lint must not mutate the cache; a hash-before/hash-after test is required. Current tests only prove the retired path is absent (`test_pylint_cache_semantics.py:112-168`; `test_semantic_check.py:126-133`).
--- **Secrets scan**: `.secrets.baseline` enables `HexHighEntropyString` (limit 3.0), so long hex keys in a committed cache will fail `detect-secrets`. ADR-010’s “no bare hex strings” constraint is not just stylistic.
--- **Writer concurrency**: the verdict says no lock/merge is needed while pylint `jobs=1` (`test_pylint_cache_semantics.py:14-38`, `:225-355`); a consumer rcfile with `jobs>1` voids the claim. If refresh is a separate process rather than pylint, that assumption must be restated.
--- **Location**: `.python-setup-decisions.json` at the linted project root (ADR-010:26); `.gitignore` currently ignores only `.cache/python-setup/semantic/` (`.gitignore:243-244`), so a root decisions file would be committed and visible to `detect-secrets`/`git ls-files`.
--
--### Q4. How is semantic behavior pinned if a model ships?
--
--- Golden and integration capture with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so no current test pins model-enabled W9704/W9738 outcomes.
--- A model that changes verdicts could pass the entire suite while changing consumer lint behavior. Options: (a) add a deterministic fake-backend golden that exercises the full veto path with `PYTHON_SETUP_LINT_SEMANTIC=1`; (b) add an opt-in real-model golden/contract test marked `slow`/`with_real_api`; (c) keep the model opt-in and document that golden covers only heuristic behavior.
--
--### Q5. Documentation and ADR reconciliation scope
--
--The following are definitively stale at HEAD and should be part of the modernize work:
--
--- `docs/semantic-justification.md:1-62` — entire document describes cross-encoder/reranker, `sentence-transformers`, `PYTHON_SETUP_LINT_RERANKER_MODEL`, `~/.cache/.../results.json`.
--- `docs/custom-checks.md:97` and `:104` — reranker-first description and invalid cache-key tuple.
--- `README.md:29` — `python-setup[semantic]` described as “sentence-transformer-powered”.
--- `docs/troubleshooting.md:97-111` — cross-encoder download-failure section; `:150` says “Expected: 7 pass, ~39s” (actual 9 pass, ~57s).
--- `docs/tutorials.md:12-16` — “optional semantic justification rerunner”.
--- `AGENTS.md:79-85` — cross-encoder pipeline and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `:9-11` test counts stale (1290/4 skip/15 deselected/53 s vs 1357/7 deselected/26.6 s; integration 7 vs 9); Tool Scope table `:20-32` has 13 rows but there are 14 tools (missing `ruff format`; see `runner/_tool_specs.py:12-22`).
--- `docs/adr/ADR-016.md:1-5`, `ADR-014.md:1-5`, `ADR-009.md:29-33`, `ADR-002.md:3-6`, `ADR-011.md:44-49` — claims that no longer match HEAD (backend exists; tracked cache does not; `TestSuppressionRerankerPipeline` no longer exists).
--- `docs/adr/README.md:18-31` — missing ADR-013…ADR-016 entries.
--
--### Q6. Debloat acceptance criteria and “never test linting”
--
--- “Test infra/assumptions first” is already satisfied structurally by `tests/assumptions/`; continue that pattern for any new model/cache work.
--- “Never test linting” is not defined in the repo. The closest precedent is the recent prune of `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` (commit `644774e`). Remaining candidates: `tests/runner/test_real_pipeline_smoke.py` (overlaps integration + fake orchestration), and checker-test helper wrappers that only re-test the harness.
--- Test intent must be preserved: the 115-row heuristic table (`test_semantic_threshold.py:16-21,147-164`) and the W9704 checker behavior tests (`test_suppression_justification_checker.py:29-392`) are behavior contracts, not harness duplication. The duplicate `_RecordingBackend` / `_UvCallRecorder` / `_make_tc` layers are harness duplication.
--- No acceptance metric exists for line-count reduction; the only enforced metrics are `C0302 ≤500`, `R0912 ≤16`, `R0915 ≤65` and the empty baseline (`CodingRules.md:139-159`; `lint.baseline:1`).
--
--### Q7. Pylint-pyi scope (ADR-015)
--
--- ADR-015 explicitly defers the fix to iteration 5 (`docs/adr/ADR-015.md:1-3`). If iteration 5 is this iteration, the architect must either include it or update the ADR with a later target.
--- Current behavior: `_PylintPyiLintTool` discovers `.pyi` paths and passes them to pylint (`dispatch.py:249-277`); the golden contains 43 `pylint-pyi` findings, 42 on `.py` files (`tests/data/golden/minimal_sample_project_findings.json`). Changing this scope will change the golden and possibly `lint.baseline` behavior for consumers.
--
--### Q8. Packaging and test pins that will change with a model extra
--
--- `[semantic]` extra is empty (`pyproject.toml:28-30`; `uv.lock:623`).
--- Tests pin emptiness: `test_semantic_extra_is_empty` and `test_uv_lock_has_no_sentence_transformers_edge` (`tests/checkers/test_decision_backend.py:323-337`).
--- `_OPTIONAL_IMPORT_PATTERNS` is empty with the comment “The [semantic] extra is an empty placeholder” (`no_try_import_checker.py:10-13`), and `test_no_try_import_checker.py:27-35` pins that `sentence_transformers` is no longer optional and that a try/except import is now a violation.
--- If a model is loaded via `importlib` (as the current dotted loader does), the no-try-import rule is bypassed; if it is loaded via `try/except ImportError`, the patterns/test must be updated deliberately.
--- `uv.lock` regeneration for torch/transformers/glide will be large and platform-specific; `semantic` must remain optional so the base dev install stays light.
--
--### Q9. Cache/model test infrastructure to add before implementation
--
--Suggested assumption/contract tests, following `tests/assumptions/` style:
--
--1. Cache file round-trip: sorted `indent=2`/`sort_keys`, no hex ≥20, passes `detect-secrets` (ADR-010:26-28).
--2. Read-only lint: byte-hash the cache before/after an ordinary `run_lint`; assert unchanged (ADR-010:29-30).
--3. Refresh path: refused under `CI`/`GITHUB_ACTIONS`; atomic replace; single-writer behavior (reuse the golden guard pattern, `tests/_golden.py:374-392`).
--4. Prune: entries for missing files and stale `model_id`s disappear; live entries survive.
--5. Backend loading: production ignores `PYTHON_SETUP_LINT_DECISION_BACKEND`; missing optional dependency → `None` → heuristic behavior (`_decision_backend.py:37-46`).
--6. Model determinism: no sampling; batching must not change scores (GLiDE model card warns that concurrent micro-batching can shift probabilities; set `GLIDE_MAX_BATCH=1` when caching scores).
--7. CPU benchmark: `@pytest.mark.slow`, wall time/RSS per justification, following `test_bench_runner_overhead.py:1-14`.
--
-----
--
--## 6. High-signal summary for the architect
--
--1. The reranker removal is complete; the backend/cache *interfaces* are half-delivered. The next iteration’s semantic work is: production backend wiring + an actual CPU model (or an explicit deferral) + the tracked decision cache with refresh/prune.
--2. The biggest behavioral risk is enabling a model by default before semantic-on behavior is pinned; golden currently runs with semantic off.
--3. The biggest debloat wins are test-harness duplication (13 `_make_tc` copies, 10 `_walk_and_release` copies, 3 `_RecordingBackend` copies, 2 `_UvCallRecorder` copies, dead helpers, vestigial cache tests, redundant smoke test), not production code.
--4. Docs and ADRs are materially wrong about the semantic subsystem; ADR-016 actively contradicts HEAD and should be superseded/updated first.
--5. Any ADR-009 gate closure needs a corpus/license/CPU-benchmark decision that cannot be inferred from the repository today.`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
--- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
--  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
--  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
--  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
--  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
--  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
--- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
--
--## Item
--epic-kickoff-gate
--
--## Assignment
--{"slug":"epic-kickoff-gate","kind":"fact-finder","title":"Epic kickoff and ownership-dispute gate","assignment":"Root-owned coordination checkpoint (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes, zero git writes). Consume validated-map report (revision map-<HEAD short SHA> + drift list), pylint verdict readability, and merged .secrets.baseline exclusion. Record post-kickoff HEAD; per-epic ownership tables referencing revision; universe file count with 5-owner counts; drift-list row count with corrected file:line per row; AGENTS.md assignments by exact rows with engine wave order (runner-owned if assigned = ## Quick Commands :9-11 + ## Tool Scope adding ruff format row in earlier wave than semantic item; semantic-owned = ### Semantic justification pipeline only; checkers never touches AGENTS.md) plus read-only merge-base rule (semantic base must contain runner merge when runner assigned, else waits); shared-file single-writer table (checkers/_base.py=semantic only, _source_stream.py=checkers new file, no_try_import register line+patterns=semantic, test_suppression class block=semantic rest=checkers, trivial_wrapper peek line preconditioned on runner close-up); docs-row assignments from drift list per decision rule (defaults: runner counts/scope/version/pin, semantic pipeline, root ADR via adr-formalization). Resolve disputes by amended assignment before epic waves scale; gate report shows zero unresolved disputes (each resolved dispute cites amended assignment ref). Covers ADR-011 spawn gate, TD3-A1/TD3-B2.","outlineRef":"epic-kickoff-gate","milestone":"M1","wave":2,"deps":["ownership-map-revalidation","pylint-cache-semantics-closure","secrets-baseline-exclusion"],"scenarioRefs":["M1: Epic kickoff gated on validated artifacts"],"citations":["AGENTS.md:79-85","AGENTS.md:87-93","src/python_setup_lint/checkers/_base.py:142-158","CodingRules.md:90-107"]}
--
--## Prior Attempts & Failures
--Review requested architect input on review
--
--## Current Diff
--
--
--## Review Feedback
--- [ARCHITECT] ADR-011 live gate vs ADR-013 stub conflict: ADR-013:1-3 claims root-serialized delivery replaced epics for I4; if accepted, per-epic tables are ownership evidence not a live spawn gate. Gate correctly kept ADR-011 contract and recorded the conflict. Live-gate vs evidence-only resolution exceeds item scope.
--- [ARCHITECT] Legacy epic handoff unsatisfiable, needs replan: I3 epics never spawned, I4-5 abandoned decomposition per ADR-013/023; retries cannot produce 3 close-ups and plan-5.3 declares no replanAfter gates. Only a replan can retire or re-scope the stranded item; exceeds item scope.
--
--## Context Pack
--# Context Pack — `modernize` (iteration 5 starting state)
--
--**Repository**: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT (`pyproject.toml:19-20`). Worktree `topic/modernize`, HEAD `0944670`.
--
--**Gates verified in this worktree on 2026-11-09** (read-only execution):
--
--| Gate | Result | Evidence |
--|---|---|---|
--| `uv run pytest -q` | 1357 passed, 7 deselected, 4 warnings, 26.6 s | default collection does **not** include `tests/integration.py` (filename is not `test_*.py`) |
--| `uv run pytest tests/integration.py -v` | 9 passed, 56.6 s | run explicitly per AGENTS/README |
--| `uv run lint` | exit 0, all 14 tools PASSED, 57.7 s | `lint.baseline` is `[]` (`lint.baseline:1`) |
--
--**Intent status at a glance**
--
--| Intent clause | State at HEAD | Primary evidence |
--|---|---|---|
--| Enforce `CodingRules.md` / `AGENTS.md` | Mostly done; lint gates green, but docs/ADR drift and some dead placeholders remain | `lint.baseline:1`; `AGENTS.md:9-11`, `AGENTS.md:79-85`; `docs/adr/ADR-016.md:1-5` |
--| Debloat code and tests; keep test intent | Partially done (recent prune removed self-lint/config-consistency tests); concrete duplication and dead helpers remain | §4.4 below; `tests/checkers/test_tmp_path_checker.py:19-32`; `tests/runner/_factories.py:167,200`; `tests/runner/test_real_pipeline_smoke.py:1-42` |
--| Replace embedding/rerank justification check with a CPU-friendly small decision model | **Half done**: reranker is gone and the veto backend protocol exists, but no production model is wired and no optional dependency ships | `src/python_setup_lint/checkers/_semantic.py:1-65`; `src/python_setup_lint/checkers/_decision_backend.py:37-59`; `pyproject.toml:28-30`; `tests/checkers/test_semantic_check.py:119-123` |
--| Keep a git-stored cache with cleanup | **Not implemented**: only a process-local memo exists; no `.python-setup-decisions.json`, refresh path, or pruning | `src/python_setup_lint/checkers/_semantic.py:15-25,47-64`; `tests/assumptions/test_pylint_cache_semantics.py:8-12`; `docs/adr/ADR-010.md:26-36` |
--| Preserve every material lint/check behavior | Green at HEAD; golden pins 158 findings including 18 W9704, but semantic is disabled during golden capture | `tests/data/golden/minimal_sample_project_findings.json`; `tests/integration.py:110-129`; `tests/_golden.py:54` |
--
-----
--
--## 1. Module Map
--
--### 1.1 Semantic justification subsystem (primary intent area)
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `src/python_setup_lint/checkers/_decision_backend.py` | `DecisionBackend` protocol, `FakeBackend`, test-only dotted-path loader, `get_backend()`, pinned threshold/prompt constants, warn-once state | `:10-13`, `:16-30`, `:37-59` |
--| `src/python_setup_lint/checkers/_decision_backend.pyi` | Public stub: `DECISION_THRESHOLD`, `PROMPT_VERSION`, protocol, `FakeBackend`, `get_backend` | `:1-20` |
--| `src/python_setup_lint/checkers/_semantic.py` | Thin adapter: resolves backend, computes SHA-256 cache key, applies `>= DECISION_THRESHOLD`, owns in-memory memo | `:1-65` |
--| `src/python_setup_lint/checkers/_semantic.pyi` | Stub documenting the adapter contract | `:1-23` |
--| `src/python_setup_lint/checkers/_base.py` | `normalize_suppressed_codes`, heuristic-first `check_if_meaningful`, env gate, lazy `_semantic` import | `:145-156`, `:159-252` |
--| `src/python_setup_lint/checkers/conformance/suppression_justification_checker.py` | W9704 `unjustified-suppression`: scans suppression comments and `Any` annotations, calls `check_if_meaningful` | `:33-41`, `:63-91`, `:136-162`, `:330-388` |
--| `src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py` | W9738 `bare-except-comment`, second consumer of `check_if_meaningful` | `:14`, `:103-118` |
--| `docs/semantic-justification.md` | Current *stale* narrative of the reranker pipeline and caches | `:1-62` |
--| `docs/custom-checks.md` | Checker-authoring guide; semantic helper description stale | `:97`, `:104` |
--
--### 1.2 Checker subsystem
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `src/python_setup_lint/checkers/conformance/` | Conformance checkers: beartype, no-try-import, tmp-path, structlog, suppression justification, bare-except, missing error-chain, silent-except, generic-key-dict, unnamed-tuple-dict, trivial-wrapper, redundant-type-guard, pyi-underscore, missing-return-annotation, asyncio-timeout | directory listing |
--| `src/python_setup_lint/checkers/stub/` | Stub fidelity/coverage/docstring checkers and annotation normalizer | `checker.py`, `coverage.py`, `docstring_checker.py`, `normalizer.py`, `fidelity/*` |
--| `config/.pylintrc` | Source-code rcfile; enables custom rules and `max-module-lines=500`, `max-statements=65`, `max-branches=16` | `:2`, `:17`, `:19`, `:22-23` |
--| `config/.pylintrc-pyi` | Stub-file rcfile | `:12-13` |
--| `config/.pylintrc-tests` | Test-file ruleset (production-only rules disabled; W9704/W9702 still enabled) | `:20`, `:37`, `:39`, `:42-47` |
--
--### 1.3 Runner subsystem
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `src/python_setup_lint/runner/_tool_specs.py` | Single-source 14 built-in `ToolSpec` entries | `:9-100`, `:102` |
--| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry, command builders, autofix ordering, baseline fallback | `:62-359`, `:350-359` |
--| `src/python_setup_lint/runner/cli.py` | CLI, tool selection, skip reasons, serial pipeline, `run_lint` | `:110-201`, `:204-...`, argument parser `:280-366` |
--| `src/python_setup_lint/runner/baseline.py` | Baseline diff/merge and fallback inspection | module |
--| `src/python_setup_lint/runner/parsers.py`, `_record_parsers.py` | Output parsers (JSON, regex, record parsers) | modules |
--| `src/python_setup_lint/runner/_autofix.py` | Autofix conflict detection and staged/unstaged handling | module |
--| `src/python_setup_lint/runner/_config.py`, `cmd_build.py` | Config discovery and command composition | modules |
--| `src/python_setup_lint/runner/types.py` | `ToolSpec`, `LintResult`, `RunnerConfig`, `ViolationCount` | `:12-22`, `:25-59` |
--
--### 1.4 Setup / packaging / test helpers
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `src/python_setup_lint/setup.py` | `install()` / `main()`: dependency step, pylint plugin registration, config symlinks, state/checksums | `:41-56`, `:149-205`, `:223-290`, `:318-364` |
--| `src/python_setup_lint/_setup_pyproject.py` | TOML read/write, pylint load-plugins, dev-dependency detection (extras stripped) | `:19-97` |
--| `src/python_setup_lint/_setup_precommit.py` | Pre-commit config and AGENTS snippet generation/atomic writes | `:70-...` |
--| `src/python_setup_lint/_setup_update.py` | Drift detection + `uv add --refresh-package` update flow | `:11-...` |
--| `src/python_setup_lint/testing.py` | Shared `_make_tc` / `_walk_and_release`, lint-runner fakes, consumer health checks | `:18-38`, `:44-103`, `:115-196` |
--| `pyproject.toml` | Package metadata, empty `[semantic]` extra, pytest markers (`not slow` default) | `:1-4`, `:28-30`, `:47-54` |
--| `uv.lock` | Locked dependencies; root provides `semantic` extra, currently empty | `:573-623` |
--| `.gitignore` | Generated consumer artifacts; legacy semantic model cache ignored | `:222-244` |
--
--### 1.5 Documentation / decision register
--
--| Path | Responsibility | Key lines / state |
--|---|---|---|
--| `CodingRules.md` | Shipped coding rules: typing, `.pyi`, simplification, complexity, tests | `:1-75`, `:90-159`, `:230-307` |
--| `AGENTS.md` | Agent entry point: commands, tool scope, pipeline, test strategy | `:5-14`, `:16-32`, `:79-93` |
--| `docs/adr/README.md` | ADR index — **omits ADR-013…ADR-016** | `:16-31` |
--| `docs/adr/ADR-009.md` | Accepted no-go-gated deferral for the model | `:1-48` |
--| `docs/adr/ADR-010.md` | Frozen backend + tracked-cache contracts | `:1-52` |
--| `docs/adr/ADR-014.md` | Heuristic-first veto semantics (now implemented; text stale) | `:1-5` |
--| `docs/adr/ADR-015.md` | Pylint-pyi scope fix deferred to iteration 5 | `:1-3` |
--| `docs/adr/ADR-016.md` | Iteration-4 infrastructure-only scope — **claims no backend/cache/FakeBackend exists, contradicted by HEAD** | `:1-5` |
--| `design/0001`, `design/0002` | Config composers; ty src-only exception | files |
--| `README.md`, `docs/tutorials.md`, `docs/troubleshooting.md` | Consumer docs; semantic sections stale | `README.md:29,105`; `tutorials.md:12-16`; `troubleshooting.md:97-111,150` |
--
--### 1.6 Test subsystems
--
--| Path | Responsibility | Key lines |
--|---|---|---|
--| `tests/checkers/` | Per-checker behavioral tests over real pylint `CheckerTestCase`; `_factories_*` data modules | 45 `.py` files incl. helpers |
--| `tests/runner/` | Runner unit/integration tests, autofix, parsers, setup, benchmarks | 30 `.py` files |
--| `tests/assumptions/` | Third-party contract pins (astroid, beartype, pylint, pylint cache semantics) | `test_pylint_cache_semantics.py:1-39` |
--| `tests/_golden.py` | Golden snapshot normalization/serialization/assertions + CI-guarded rewrite | `:1-11`, `:53-58`, `:374-392` |
--| `tests/test_golden.py` | Synthetic unit tests for golden helpers | `:1-6` |
--| `tests/integration.py` | Fit-for-purpose end-to-end gate on planted sample project | `:1-145` |
--| `tests/data/minimal_sample_project/` | Planted-violation fixture project (W9704 brush-off vs carry-from) | `src/minimal_sample/mod.py:41-56`, `violations.txt` |
--| `tests/data/golden/minimal_sample_project_findings.json` | 158 normalized findings; 18 `unjustified-suppression`, 2 `bare-except-comment` | golden file |
--
-----
--
--## 2. Key Interfaces & Signatures
--
--### 2.1 Decision backend (`src/python_setup_lint/checkers/_decision_backend.py`)
--
--```python
--DECISION_THRESHOLD: float = 0.5          # :10
--PROMPT_VERSION: str = "prompt-v1"        # :11
--
--@runtime_checkable
--class DecisionBackend(Protocol):          # :16-20
--    model_id: str
--    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
--
--class FakeBackend:                        # :23-30
--    model_id: str = "fake-backend rev test prompt-v1"
--    def __init__(self, score: float = 1.0) -> None: ...
--    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
--
--def get_backend() -> DecisionBackend | None: ...   # :49-59
--```
--
--Behavior of `get_backend()` at HEAD:
--
--- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored **only** when `PYTEST_CURRENT_TEST` is set, then imports an arbitrary `module:attribute` factory (`_decision_backend.py:37-46`).
--- `PYTHON_SETUP_LINT_RERANKER_MODEL` emits a one-time deprecation warning (`:51-53`).
--- `PYTHON_SETUP_LINT_DECISION_MODEL` is read but only emits a one-time `decision_model_unavailable` warning; it never constructs a backend (`:55-58`).
--- Production default is therefore always `None` → heuristic-only behavior.
--
--### 2.2 Semantic adapter (`src/python_setup_lint/checkers/_semantic.py`)
--
--```python
--_RESULT_CACHE: dict[int, bool] | None = None     # :16
--
--def _reset_cache() -> None: ...                  # :19-25 (test helper, not in .pyi)
--
--@beartype
--def semantic_check_if_meaningful(                # :28-65
--    text: str,
--    *,
--    rule: str | None = None,
--    code_context: str | None = None,
--    comment: str | None = None,
--    backend: DecisionBackend | None = None,
--) -> bool | None: ...
--```
--
--Contract: `primary = (comment or text).strip()`; empty → `False`; no backend → `None`; otherwise `decide(primary, rule, code_context) >= 0.5`; result memoized in `_RESULT_CACHE` keyed by the first 8 bytes of SHA-256 over `(primary, rule, code_context, model_id)` (`:37-64`).
--
--### 2.3 Heuristic-first gate (`src/python_setup_lint/checkers/_base.py`)
--
--```python
--def normalize_suppressed_codes(raw: str) -> str: ...   # :148-156
--
--def check_if_meaningful(                               # :159-252
--    text: str,
--    *,
--    rule: str | None = None,
--    code_context: str | None = None,
--    comment: str | None = None,
--    backend: DecisionBackend | None = None,
--) -> bool: ...
--```
--
--Order is strict:
--
--1. Normalize directive text and strip echoed codes (`:168`, `:145-156`).
--2. Reject `<5` chars, boilerplate tokens, multi-word brush-offs, and rule-symbol-only reasons (`:169-246`).
--3. If `PYTHON_SETUP_LINT_SEMANTIC != "1"` → return `True` (`:248-249`).
--4. Lazily import `_semantic` and return `semantic_check_if_meaningful(...) is not False` (`:250-252`).
--
--Consequence: the backend can **only veto** a heuristic-meaningful justification; it can never resurrect a heuristic rejection. `None` (no backend) maps to `True`.
--
--### 2.4 W9704 consumer (`suppression_justification_checker.py`)
--
--```python
--msgs = _msgs(W9704=MessageDef(
--    message="Suppression comment without technical justification: %s",
--    symbol="unjustified-suppression", ...))              # :33-41
--
--# module-level scan of raw source lines
--self._legacy_scan(node, lines)                            # :63-91
--
--# Any annotation path
--self._emit_if_unjustified(annotation, lineno)             # :136-162
--
--# trailing/preceding reason validation
--self._has_justification(lines, idx)                       # :330-388
--```
--
--Both paths call `check_if_meaningful(reason, comment=reason, rule="unjustified-suppression", code_context=<code before #>)` (`:152-155`, `:372-375`, `:383-386`). The checker knows the file path via `node.root().file` (`_base.py:68-75`) but does not pass it to the semantic API.
--
--### 2.5 Runner / test helpers
--
--- `ToolSpec` and `RunnerConfig` (`runner/types.py:12-22`, `:49-59`); `TOOLS` list (`runner/_tool_specs.py:9-100`); `run_lint(...)` (`runner/cli.py:204-...`).
--- `_make_tc(checker_class)` and `_walk_and_release(code, checker_class, *, file_path, module_name)` (`testing.py:18-38`) are the intended shared checker-test harness.
--- Golden contract: `Finding = {tool,file,line,col,rule}`, multiset diff, `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` opt-in, refused under `CI`/`GITHUB_ACTIONS` (`tests/_golden.py:1-11`, `:53-58`, `:374-392`).
--
-----
--
--## 3. Relevant Excerpts
--
--### 3.1 Full current semantic adapter
--
--`src/python_setup_lint/checkers/_semantic.py:15-65`:
--
--```python
--_RESULT_CACHE: dict[int, bool] | None = None
--
--def _reset_cache() -> None:
--    global _RESULT_CACHE
--    _RESULT_CACHE = None
--
--@beartype
--def semantic_check_if_meaningful(...) -> bool | None:
--    primary = (comment or text).strip()
--    global _RESULT_CACHE
--    if _RESULT_CACHE is None:
--        _RESULT_CACHE = {}
--    if not primary:
--        return False
--    resolved = backend if backend is not None else _decision_backend.get_backend()
--    if resolved is None:
--        return None
--    cache_key = hashlib.sha256("|".join(str(x) for x in (
--        primary, rule, code_context, resolved.model_id)).encode()).digest()
--    cache_key_int = int.from_bytes(cache_key[:8], "big")
--    if cache_key_int in _RESULT_CACHE:
--        return _RESULT_CACHE[cache_key_int]
--    result = resolved.decide(primary, rule, code_context) >= _decision_backend.DECISION_THRESHOLD
--    _RESULT_CACHE[cache_key_int] = result
--    return result
--```
--
--Observations for the architect:
--
--- The memo is process-local only; nothing is persisted.
--- The key truncates SHA-256 to 64 bits (`:59`) — the same truncation ADR-003 criticized in the retired on-disk cache (`docs/adr/ADR-003.md:7`).
--- `comment` is folded into `primary`, so the key does not separately include it; docs claim `(text, rule, code_context, comment, model)` (`docs/custom-checks.md:97`).
--- `code_context` participates in the key, so any source-line edit invalidates an entry even if the justification is unchanged.
--- `model_id` participates, so a model/prompt swap invalidates entries — but `PROMPT_VERSION` is not currently folded into `model_id` by production code.
--
--### 3.2 Heuristic gate and env behavior
--
--`src/python_setup_lint/checkers/_base.py:248-252`:
--
--```python
--if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") != "1":
--    return True
--from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
--
--return _semantic_check(primary, rule=rule, code_context=code_context, comment=primary, backend=backend) is not False
--```
--
--- Semantic is **on by default**; absence of a backend yields heuristic behavior because `_semantic` returns `None`.
--- The lazy import means `_semantic` is never imported when `PYTHON_SETUP_LINT_SEMANTIC=0` (`docs/semantic-justification.md:18`, verified by tests).
--- The same gate governs W9738 `bare-except-comment` (`bare_except_comment_checker.py:103-118`).
--
--### 3.3 W9704 justification resolution
--
--`suppression_justification_checker.py:350-388`:
--
--```python
--_suppression_patterns = (_PAT_PYLINT_DISABLE, _PAT_NOQA, _PAT_TYPE_IGNORE, _PAT_TY_IGNORE)
--for pat in _suppression_patterns:
--    for m in pat.finditer(line):
--        after = line[m.end():]
--        ...  # only search before the next suppression pattern
--        tm = _PAT_TRAILING_REASON.search(search_after)
--        if tm:
--            reason = tm.group(1)
--            if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
--                                   code_context=line.split("#", 1)[0].strip()):
--                return True
--
--if idx > 0:
--    pm = _PAT_PRECEDING_COMMENT.match(prev)
--    if pm:
--        reason = pm.group(1)
--        if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
--                               code_context=lines[idx].split("#", 1)[0].strip()):
--            return True
--return False
--```
--
--A tracked cache keyed by file path would need this caller to supply file identity; today it does not.
--
--### 3.4 Packaging and pytest configuration
--
--`pyproject.toml:28-30`:
--
--```toml
--[project.optional-dependencies]
--# Empty placeholder: no model dependency ships in iteration 4 (ADR-016).
--semantic = []
--```
--
--`pyproject.toml:47-54`:
--
--```toml
--[tool.pytest.ini_options]
--addopts = "-m 'not slow'"
--markers = [
--  "slow: ...full pipeline runs...",
--  "no_external_api: ...",
--  "with_real_api: ...",
--  "implementation_detail: ...",
--]
--```
--
--`uv.lock:623` likewise reports `provides-extras = ["semantic"]` with no dependencies.
--
--### 3.5 Cache-related ignore and secrets constraints
--
--- `.gitignore:243-244` still names the retired machine cache: `# NLP semantic model cache (sentence-transformers)` / `.cache/python-setup/semantic/`.
--- `.secrets.baseline` enables `HexHighEntropyString` with `limit: 3.0`, so a committed result cache must not contain raw long hex digests; ADR-010 already requires “no bare hex strings of length >= 20” (`docs/adr/ADR-010.md:26-28`).
--- ADR-011 says the tracked decisions file is consumer-runtime data, is committed, and gets **no** hatch/wheel entry (`docs/adr/ADR-011.md:54-60`).
--
--### 3.6 ADR state (decisions vs implementation)
--
--- `docs/adr/ADR-009.md:5` — accepted deferral; `:9-13` documents the 215-meaningful / 0-meaningless corpus no-go; `:23-27` requires a double-rated sample and a human Fastino license decision; `:35-37` requires a CPU benchmark and forbids claiming the swap complete.
--- `docs/adr/ADR-009.md:29-33` claims iteration 3 delivers “Heuristic-first `DecisionBackend` plus tracked-cache infrastructure” — the backend half exists; the tracked-cache half does not.
--- `docs/adr/ADR-010.md:23-36` freezes: backend protocol, `.python-setup-decisions.json` at the linted project root, sorted `indent=2`/`sort_keys` JSON array, no hex≥20, read-only lint with a hash-asserted zero-write check, explicit CI-guarded refresh (lockfile + merge + atomic replace), pruning of missing files/stale model IDs, and writer-first concurrency from the pylint verdict.
--- `docs/adr/ADR-010.md:38-41` and `_decision_backend.py:37-46` pin the dotted-path loader as test-only.
--- `docs/adr/ADR-014.md:1-5` claims current code is semantic-first with heuristic fallback; HEAD is heuristic-first (`_base.py:248-252`; `_decision_backend.py:16-20`), so the record is stale.
--- `docs/adr/ADR-016.md:1-5` claims “At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled.” All three claims are false at HEAD: `_decision_backend.py` exists, `pyproject.toml:28-30` is empty, and tests pin the absence of `sentence_transformers` (`tests/checkers/test_semantic_check.py:119-123`, `tests/checkers/test_decision_backend.py:329-337`).
--- `docs/adr/ADR-015.md:1-3` is an open iteration-5 deferral: `_PylintPyiLintTool` passes `.pyi` paths but pylint lints companion `.py` (42 of 43 `pylint-pyi` golden findings are on `.py` files); probe found 205 latent private stub symbols; fixing changes the golden.
--- `docs/adr/README.md:18-31` indexes only ADR-001…ADR-012; ADR-013…ADR-016 are absent.
--
-----
--
--## 4. Existing Tests & Conventions
--
--### 4.1 Layout and style
--
--- Unit tests: `tests/checkers/`, `tests/runner/`, `tests/test_golden.py`, `tests/test_setup_*`; 85 test modules, 794 test functions before parametrization, 19,627 lines total (`tests/`).
--- Naming convention `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`).
--- Markers: `slow` (excluded by default via `addopts = "-m 'not slow'"`), `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:47-54`).
--- Mocking policy: mock only external boundaries; first-party code always real (`CodingRules.md:240-252`). Checker tests therefore instantiate real `BaseChecker` subclasses through `CheckerTestCase`.
--- Shared fixtures live in `tests/conftest.py` (`:40-169`): `empty_project`, session-scoped `configured_project`, `runner_config_factory`, `isolated_runner_registries`, `sample_project`.
--- Test factories for complex checker inputs are split by domain to respect the 500-line C0302 limit (`tests/checkers/_factories.py:1-16`; `_factories_stub*.py`).
--
--### 4.2 Semantic/backend tests (current contract)
--
--| File | Coverage | Key lines |
--|---|---|---|
--| `tests/checkers/test_decision_backend.py` | Pinned constants, FakeBackend, loader gating, heuristic-first veto, normalization, packaging pins | `:1-6`, `:83-165`, `:181-264`, `:320-337` |
--| `tests/checkers/test_semantic_check.py` | Adapter signature, empty-primary, `None` mapping, 0.5 threshold matrix, memo per unique pair/model, no `sentence_transformers`, no disk cache | `:47-133` |
--| `tests/checkers/test_semantic_threshold.py` | 115-row heuristic table, semantic disabled | `:16-21`, `:147-164` |
--| `tests/assumptions/test_pylint_cache_semantics.py` | Read-only behavior, in-process memo, path-free semantic API, `jobs=1` single-writer verdict, sequential pylint invocation | `:1-39`, `:94-181`, `:225-355` |
--| `tests/checkers/test_suppression_justification_checker.py` | W9704 checker behavior; semantic disabled via fixture | `:19-30`, `:367-392` |
--| `tests/checkers/test_bare_except_comment_checker.py` | W9738 checker behavior; semantic disabled via fixture | `:18-43` |
--
--Important: no test exercises a real model. Every backend is a test double (`test_decision_backend.py:1-6`). The current test suite actively pins the **absence** of a model dependency (`test_semantic_extra_is_empty`, `test_uv_lock_has_no_sentence_transformers_edge` at `:323-337`; `test_no_try_import_checker.py:27-35`; `_OPTIONAL_IMPORT_PATTERNS` empty at `no_try_import_checker.py:10-13`). Any model wiring must update these pins deliberately.
--
--### 4.3 Behavior-preservation gates
--
--- Golden snapshot: 158 findings across all 14 tools; per-tool minimums; multiset comparison catches duplicates/moved lines/new false positives (`tests/_golden.py:1-11`; `tests/data/golden/minimal_sample_project_findings.json`).
--- 18 `unjustified-suppression` findings (6 each for `pylint`, `pylint-pyi`, `pylint tests`) and 2 `bare-except-comment` findings.
--- Golden capture runs with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so semantic-enabled behavior is **not** covered by the golden.
--- Integration also asserts brush-off W9704 at `mod.py:49` and no W9704 for carry-from at `mod.py:56` (`tests/integration.py:124-129`; fixture `tests/data/minimal_sample_project/src/minimal_sample/mod.py:49,56`).
--- `lint.baseline` is empty, so self-lint fails on any new violation (`lint.baseline:1`).
--
--### 4.4 Debloat evidence (measured at HEAD)
--
--**Duplicated checker-test harness:**
--
--- `_make_tc` local wrapper exists in 13 test files; `_walk_and_release` in 10; `_msg_ids` in 8. The shared implementations already exist in `testing.py:18-38`.
--- Examples: `tests/checkers/test_tmp_path_checker.py:19-32` (calls `tc.checker.open()`), `tests/checkers/test_missing_error_chain_checker.py:16-32` (does not call `open()`), `tests/checkers/test_suppression_justification_checker.py:19-20` (imports the shared helper but still defines `_msg_ids`).
--- The wrappers are not byte-identical: some call `checker.open()` (SourceRootMixin checkers) and some pass `module_name`. A shared helper needs an `open_checker`/`module_name` option rather than naive deletion.
--
--**Duplicated semantic test double:**
--
--- `_RecordingBackend` appears three times: `tests/checkers/test_decision_backend.py:44-55`, `tests/checkers/test_semantic_check.py:25-36`, `tests/assumptions/test_pylint_cache_semantics.py:80-91`.
--
--**Duplicated runner/setup helpers:**
--
--- `_UvCallRecorder` appears twice: `tests/runner/test_setup.py:39-60` and `tests/runner/test_setup_install.py:36-58`.
--- `extra_block` appears twice: `tests/runner/_factories.py:174-176` and `tests/runner/_factories_extras.py:45-47`.
--- `_semantic_disabled` fixture appears twice: `tests/checkers/test_bare_except_comment_checker.py:37-40` and `tests/checkers/test_suppression_justification_checker.py:23-26`.
--
--**Dead/vestigial test code:**
--
--- `assert_violation_contains_any` (`tests/runner/_factories.py:167-171`), `assert_r4_reason` (`:200-206`), and `baseline_entry_for_tool` (`tests/runner/_factories_baseline.py:26-28`) have no call sites.
--- `sample_project` fixture (`tests/conftest.py:166-169`) has no call sites.
--- `test_check_writes_no_disk_cache` monkeypatches `_CACHE_DIR`/`_RESULT_CACHE_FILE`, attributes that no longer exist, with `raising=False` (`tests/checkers/test_semantic_check.py:126-133`).
--- The `semantic_disk` fixture does the same for `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RESULT_CACHE` (`tests/assumptions/test_pylint_cache_semantics.py:94-106`). These assert the absence of a retired implementation rather than a live contract.
--- `tests/runner/test_real_pipeline_smoke.py:1-42` runs the full pipeline and asserts only an int return plus all 14 section markers; this overlaps `tests/integration.py:57-145` and the fake-driven all-tools assertion in `tests/runner/test_lint_runner_integration.py:230-248`.
--- Recent prune precedent: commit `644774e` deleted `test_config_consistency.py`, `test_self_lint_clean.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` and trimmed `test_autofix_conflict_integration.py` — the “never test linting” direction is already established.
--
--**Source-side dead/placeholder code:**
--
--- `PROMPT_VERSION` (`_decision_backend.py:11`) is unused in production; only tests assert it (`test_decision_backend.py:87-88`).
--- `PYTHON_SETUP_LINT_DECISION_MODEL` is read only to warn that no model exists (`_decision_backend.py:55-58`; test `:141-151`).
--- `_semantic.py` needs two `global` statements and a nullable memo solely for lazy initialization (`:16,24,39-41`); a module-level dict + `.clear()` would remove both.
--- `_base.check_if_meaningful` rebuilds the 46-token boilerplate set and 20-phrase set on every call (`:172-241`); module-level `frozenset`s would preserve behavior and cut per-call work.
--- `_PylintPyiLintTool` and `_PylintTestsLintTool` duplicate “explicit override then auto-discovery” rcfile resolution (`dispatch.py:249-277` vs `:280-309`), while `_PylintLintTool` uses `_resolve_pylintrc` (`:201-246`).
--- `src/python_setup_lint/checkers/__init__.py` has only the license header and no module docstring (unlike `runner/__init__.py` and `conformance/__init__.py`).
--- `docs/adr/ADR-016.md` and `ADR-014.md` are stale; the ADR index omits 013-016 (`docs/adr/README.md:18-31`).
--- `pyproject.toml:3` says 1.2.10 while `CHANGELOG.md:3` tops out at v1.2.9 (minor release-doc drift).
--
--### 4.5 Test-infrastructure conventions to extend first
--
--The intent says “test infra/assumptions first.” The existing template is `tests/assumptions/`:
--
--- Each module opens with the observed third-party version and the contract being pinned (`test_pylint_cache_semantics.py:1-39`, `test_astroid_contracts.py:1-7`, `test_beartype_contracts.py:1-11`, `test_pylint_contracts.py:1-6`).
--- `pytestmark = pytest.mark.no_external_api` on every assumption module.
--- Tests are behavioral and assert observed consequences, not implementation internals; failures are meant to trigger re-derivation before loosening.
--- For the cache writer, `TestPylintRcfileJobsWatchdog` and `TestPylintInvocationConcurrency` already pin `jobs=1`, sequential dispatch, and the absence of `concurrent`/`multiprocessing` imports in the runner (`:225-355`). This is the writer-first verdict ADR-010 requires.
--- For benchmarks, `tests/runner/test_bench_runner_overhead.py:1-14` shows the convention: `@pytest.mark.slow`, real subprocesses, measured wall time/RSS, artifact written under `tmp_path`.
--
-----
--
--## 5. Open Questions & Uncertainties
--
--### Q1. Which model satisfies the intent, and can the ADR-009 gate be closed now?
--
--- The intent names `fastino/GLiDE-0.4B` or smaller. External facts: GLiDE-0.4B is a 0.40B-parameter encoder, 0.81 GB bf16 weights, tested on an RTX PRO 6000, requires `torch==2.14.0` (CUDA 13.0 wheels) and `transformers==5.17.0`; its `glide/` inference package lives in the HF repo, not as a normal PyPI dependency ([model card](https://huggingface.co/fastino/GLiDE-0.4B)).
--- The GLiDE collection’s smallest member is 0.4B (others: 0.8B, 2B, 9B, 27B) ([collection](https://huggingface.co/collections/fastino/glide)), so “or smaller” requires a different model family.
--- License is the Fastino Community License: free use, but production commercial use by an entity with annual revenue > $10M requires a separate written agreement; any commercial use requires “Built with Fastino GLiDE” attribution; derivative works must be distributed under the same license ([LICENSE](https://huggingface.co/fastino/GLiDE-0.4B/blob/main/LICENSE)). The project itself is MIT (`pyproject.toml:19-20`).
--- ADR-009’s corpus gate remains untouched: 215 meaningful / 0 meaningless labels, all single-author (`docs/adr/ADR-009.md:9-13`). No corpus artifacts exist in the repository (only `tests/data/golden/` and `tests/data/minimal_sample_project/`).
--- No CPU benchmark exists; ADR-016 explicitly lists “no CPU bench” as open (`docs/adr/ADR-016.md:3`).
--- Decision framing: (a) spike GLiDE CPU latency and packaging, then implement an optional backend; (b) choose a smaller permissively licensed zero-shot/classifier model, which still needs evaluation data; or (c) keep heuristic-only behavior and record another explicit deferral. Option (c) conflicts with the literal intent unless the operator accepts the ADR-009 gate again.
--
--### Q2. How should a production backend be wired, and should it be default-on?
--
--- `get_backend()` currently has no production model path; it returns a test-only dotted-path backend or `None` (`_decision_backend.py:37-59`). ADR-010 says a compliant model “plugs in through `get_backend()` plus `DECISION_MODEL` with no pipeline refactor” (`docs/adr/ADR-010.md:47-48`), but no loader code exists for that env var.
--- `PYTHON_SETUP_LINT_DECISION_MODEL` is parsed but never used (`_decision_backend.py:55-58`), and `PROMPT_VERSION` is dead (`:11`).
--- The present veto semantics mean a backend can only make lint stricter (`_base.py:248-252`; tests `test_decision_backend.py:181-229`). Default-on would change W9704/W9738 outcomes for every consumer that installs the extra; default-off would preserve behavior but make the feature opt-in.
--- The architect must also decide failure semantics: missing extra, model download failure, OOM, CPU timeout, and malformed model output all currently collapse to `None` → heuristic pass. Is that acceptable for a tool advertised as validating suppressions?
--
--### Q3. Git-stored decision cache: schema, keying, and the path-free API tension
--
--ADR-010 freezes the contract (`docs/adr/ADR-010.md:26-36`) but the repository documents no schema or key encoding beyond “JSON array sorted, indent=2, sort_keys, no bare hex ≥20.” Open decisions:
--
--- **File identity vs path-free API**: pruning requires file paths in cache entries (ADR-010:33), but `semantic_check_if_meaningful` is deliberately path-free (`tests/assumptions/test_pylint_cache_semantics.py:171-181`) and its callers (`suppression_justification_checker.py:152-155,372-386`; `bare_except_comment_checker.py:103-118`) do not pass a path. Options: extend the checker→semantic call with a file path, add a separate cache API at the checker layer, or key by content and prune by scanning the repo. Each has test/behavior implications.
--- **Key composition**: current memo includes `(primary, rule, code_context, model_id)` and truncates to 64 bits (`_semantic.py:47-64`). A tracked cache should likely key on file path + normalized justification + rule + model/prompt version; whether `code_context` belongs in the key determines churn vs sensitivity.
--- **Score vs verdict**: storing a boolean loses the ability to re-threshold; storing a float lets `DECISION_THRESHOLD` changes apply without re-running the model, but requires calibrating model output to `[0,1]` (the protocol promises this, but does not enforce it; `_decision_backend.py:16-20`).
--- **Refresh command**: there is no CLI surface today (`runner/cli.py:280-366` lists all args; none refresh decisions). ADR-010 requires an explicit CI-guarded refresh path with lockfile + merge + atomic replace. The golden-update guard pattern (`tests/_golden.py:374-392`: refuse under `CI`/`GITHUB_ACTIONS`) is a reusable precedent.
--- **Read-only lint**: ordinary lint must not mutate the cache; a hash-before/hash-after test is required. Current tests only prove the retired path is absent (`test_pylint_cache_semantics.py:112-168`; `test_semantic_check.py:126-133`).
--- **Secrets scan**: `.secrets.baseline` enables `HexHighEntropyString` (limit 3.0), so long hex keys in a committed cache will fail `detect-secrets`. ADR-010’s “no bare hex strings” constraint is not just stylistic.
--- **Writer concurrency**: the verdict says no lock/merge is needed while pylint `jobs=1` (`test_pylint_cache_semantics.py:14-38`, `:225-355`); a consumer rcfile with `jobs>1` voids the claim. If refresh is a separate process rather than pylint, that assumption must be restated.
--- **Location**: `.python-setup-decisions.json` at the linted project root (ADR-010:26); `.gitignore` currently ignores only `.cache/python-setup/semantic/` (`.gitignore:243-244`), so a root decisions file would be committed and visible to `detect-secrets`/`git ls-files`.
--
--### Q4. How is semantic behavior pinned if a model ships?
--
--- Golden and integration capture with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so no current test pins model-enabled W9704/W9738 outcomes.
--- A model that changes verdicts could pass the entire suite while changing consumer lint behavior. Options: (a) add a deterministic fake-backend golden that exercises the full veto path with `PYTHON_SETUP_LINT_SEMANTIC=1`; (b) add an opt-in real-model golden/contract test marked `slow`/`with_real_api`; (c) keep the model opt-in and document that golden covers only heuristic behavior.
--
--### Q5. Documentation and ADR reconciliation scope
--
--The following are definitively stale at HEAD and should be part of the modernize work:
--
--- `docs/semantic-justification.md:1-62` — entire document describes cross-encoder/reranker, `sentence-transformers`, `PYTHON_SETUP_LINT_RERANKER_MODEL`, `~/.cache/.../results.json`.
--- `docs/custom-checks.md:97` and `:104` — reranker-first description and invalid cache-key tuple.
--- `README.md:29` — `python-setup[semantic]` described as “sentence-transformer-powered”.
--- `docs/troubleshooting.md:97-111` — cross-encoder download-failure section; `:150` says “Expected: 7 pass, ~39s” (actual 9 pass, ~57s).
--- `docs/tutorials.md:12-16` — “optional semantic justification rerunner”.
--- `AGENTS.md:79-85` — cross-encoder pipeline and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `:9-11` test counts stale (1290/4 skip/15 deselected/53 s vs 1357/7 deselected/26.6 s; integration 7 vs 9); Tool Scope table `:20-32` has 13 rows but there are 14 tools (missing `ruff format`; see `runner/_tool_specs.py:12-22`).
--- `docs/adr/ADR-016.md:1-5`, `ADR-014.md:1-5`, `ADR-009.md:29-33`, `ADR-002.md:3-6`, `ADR-011.md:44-49` — claims that no longer match HEAD (backend exists; tracked cache does not; `TestSuppressionRerankerPipeline` no longer exists).
--- `docs/adr/README.md:18-31` — missing ADR-013…ADR-016 entries.
--
--### Q6. Debloat acceptance criteria and “never test linting”
--
--- “Test infra/assumptions first” is already satisfied structurally by `tests/assumptions/`; continue that pattern for any new model/cache work.
--- “Never test linting” is not defined in the repo. The closest precedent is the recent prune of `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` (commit `644774e`). Remaining candidates: `tests/runner/test_real_pipeline_smoke.py` (overlaps integration + fake orchestration), and checker-test helper wrappers that only re-test the harness.
--- Test intent must be preserved: the 115-row heuristic table (`test_semantic_threshold.py:16-21,147-164`) and the W9704 checker behavior tests (`test_suppression_justification_checker.py:29-392`) are behavior contracts, not harness duplication. The duplicate `_RecordingBackend` / `_UvCallRecorder` / `_make_tc` layers are harness duplication.
--- No acceptance metric exists for line-count reduction; the only enforced metrics are `C0302 ≤500`, `R0912 ≤16`, `R0915 ≤65` and the empty baseline (`CodingRules.md:139-159`; `lint.baseline:1`).
--
--### Q7. Pylint-pyi scope (ADR-015)
--
--- ADR-015 explicitly defers the fix to iteration 5 (`docs/adr/ADR-015.md:1-3`). If iteration 5 is this iteration, the architect must either include it or update the ADR with a later target.
--- Current behavior: `_PylintPyiLintTool` discovers `.pyi` paths and passes them to pylint (`dispatch.py:249-277`); the golden contains 43 `pylint-pyi` findings, 42 on `.py` files (`tests/data/golden/minimal_sample_project_findings.json`). Changing this scope will change the golden and possibly `lint.baseline` behavior for consumers.
--
--### Q8. Packaging and test pins that will change with a model extra
--
--- `[semantic]` extra is empty (`pyproject.toml:28-30`; `uv.lock:623`).
--- Tests pin emptiness: `test_semantic_extra_is_empty` and `test_uv_lock_has_no_sentence_transformers_edge` (`tests/checkers/test_decision_backend.py:323-337`).
--- `_OPTIONAL_IMPORT_PATTERNS` is empty with the comment “The [semantic] extra is an empty placeholder” (`no_try_import_checker.py:10-13`), and `test_no_try_import_checker.py:27-35` pins that `sentence_transformers` is no longer optional and that a try/except import is now a violation.
--- If a model is loaded via `importlib` (as the current dotted loader does), the no-try-import rule is bypassed; if it is loaded via `try/except ImportError`, the patterns/test must be updated deliberately.
--- `uv.lock` regeneration for torch/transformers/glide will be large and platform-specific; `semantic` must remain optional so the base dev install stays light.
--
--### Q9. Cache/model test infrastructure to add before implementation
--
--Suggested assumption/contract tests, following `tests/assumptions/` style:
--
--1. Cache file round-trip: sorted `indent=2`/`sort_keys`, no hex ≥20, passes `detect-secrets` (ADR-010:26-28).
--2. Read-only lint: byte-hash the cache before/after an ordinary `run_lint`; assert unchanged (ADR-010:29-30).
--3. Refresh path: refused under `CI`/`GITHUB_ACTIONS`; atomic replace; single-writer behavior (reuse the golden guard pattern, `tests/_golden.py:374-392`).
--4. Prune: entries for missing files and stale `model_id`s disappear; live entries survive.
--5. Backend loading: production ignores `PYTHON_SETUP_LINT_DECISION_BACKEND`; missing optional dependency → `None` → heuristic behavior (`_decision_backend.py:37-46`).
--6. Model determinism: no sampling; batching must not change scores (GLiDE model card warns that concurrent micro-batching can shift probabilities; set `GLIDE_MAX_BATCH=1` when caching scores).
--7. CPU benchmark: `@pytest.mark.slow`, wall time/RSS per justification, following `test_bench_runner_overhead.py:1-14`.
--
-----
--
--## 6. High-signal summary for the architect
--
--1. The reranker removal is complete; the backend/cache *interfaces* are half-delivered. The next iteration’s semantic work is: production backend wiring + an actual CPU model (or an explicit deferral) + the tracked decision cache with refresh/prune.
--2. The biggest behavioral risk is enabling a model by default before semantic-on behavior is pinned; golden currently runs with semantic off.
--3. The biggest debloat wins are test-harness duplication (13 `_make_tc` copies, 10 `_walk_and_release` copies, 3 `_RecordingBackend` copies, 2 `_UvCallRecorder` copies, dead helpers, vestigial cache tests, redundant smoke test), not production code.
--4. Docs and ADRs are materially wrong about the semantic subsystem; ADR-016 actively contradicts HEAD and should be superseded/updated first.
--5. Any ADR-009 gate closure needs a corpus/license/CPU-benchmark decision that cannot be inferred from the repository today.
--
--## Human involvement
--# Human involvement criteria
--
--Mode selects which ADR and concern decisions need a human decision. Everything
--else is either autonomous or digest-only; never block on items the table marks
--remarkable.
--
--## Blocking table (ADRs and concerns)
--
--| Mode | Blocking (needs human decision) | Remarkable (digest only) |
--| --- | --- | --- |
--| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
--| principal | stack/layer, external interfaces, config shapes | internal choices |
--| detailed | external-interface changes and major internal interfaces | minor internals |
--
--## autonomous
--
--Block only explicit high-severity ADRs/concerns that remain after all unblocked
--work is finished. Do not stop for internal choices; record them as remarkable.
--
--## Open Concerns
--- id: c-4743ca3658
--  kind: assumption
--  severity: low
--  summary: Index entries for the 13 conflicted paths remain unmerged because git write commands are forbidden in this step
--  status: routed
--  disposition: architect
--- id: c-3e935debcb
--  kind: risk
--  severity: low
--  summary: PoC lock is POSIX-only fcntl.flock
--  affects:
--    - cache-design-spike
--    - decision-cache-impl
--  status: routed
--  disposition: optional
--
--
--- Raise concerns with evidence; condense stale detail instead of repeating it.
--
--## Output
--
--Yield a structured JSON object matching this schema:
--- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
--- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
--- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
--- rationale (string, optional): Technical justification for this decision
--- text (string, optional): Concrete guidance or steering directives
--- persist (boolean, optional): Whether guidance persists across subsequent attempts
--- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
--- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
--- outline (object, optional): Item outline to schedule when decision is fix-item
--- debt (string, optional): Technical debt description when decision is accept-with-debt
--- reason (string, optional): Reason for abandonment or abort
--- question (string, optional): Specific question for human operator when decision is human-async or blocked
--- target (object, optional): Corrected developer target from a merge-verify consult, applied to the merge verification instead of the record's stale target (unknown-gate recovery). One of {gate: <infra gate id>}, {selectors: [<test ids>]}, or {command, customTarget: true}.
--  - gate (string, optional)
--  - selectors (array of string, optional)
--  - expectRed (array of string, optional)
--  - command (string, optional)
--  - customTarget (boolean, optional)
--- planDelta (string, optional): Plan delta or amendment directives when decision is amend
--- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
--- concerns (array of object, optional): Structured concerns raised by the architect
--  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
--  - summary (string, required)
--  - detail (string, optional)
--  - severity (string, optional, enum: ["low","medium","high"])
--  - location (object, optional)
--    - file (string, required)
--    - line (integer, optional)
--  - affects (array of string, optional)
--- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
--  - chosen (string, required)
--  - why (string, required)
--  - alternatives (array of string, required)
--- concernConfirms (array of object, optional): Architect confirmations for close-up concern resolutions
--  - id (string, required)
--  - note (string, optional)
--  - confirm (string, required, enum: ["accept","reject"])
--- concernResolution (object, optional): Direct concern resolution applied when the decision commits
--  - id (string, required)
--  - note (string, optional)
--  - action (string, required, enum: ["resolve","carry"])
-diff --git a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/meta.yaml b/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/meta.yaml
-deleted file mode 100644
-index 85e2d23..0000000
---- a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/meta.yaml
-+++ /dev/null
-@@ -1,17 +0,0 @@
--seq: 157
--name: consult-epic-kickoff-gate-1
--attempt: 1
--agent: architect
--role: architect
--models:
--  - opencode-go/muse-spark-1.3-contributor
--session: 01a1b8a3-f9ce-7511-963e-37a3531a2d3a
--timeoutSec: 7200
--status: ok
--startedAt: 2026-11-10T01:56:24.817Z
--endedAt: 2026-11-10T01:57:42.006Z
--usage:
--  inputTokens: 745626
--  outputTokens: 2121
--  costUsd: 0.076477
--traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T00-51-56-494Z_01a1b8a3-f9ce-7511-963e-37a3531a2d3a.jsonl
-diff --git a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/output.yaml b/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/output.yaml
-deleted file mode 100644
-index 04afd52..0000000
---- a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/output.yaml
-+++ /dev/null
-@@ -1,9 +0,0 @@
--context: item
--decision: abandon
--reason: superseded
--rationale: "I3 epics never spawned (closeup-3: M2 zero delivery,
--  epic-kickoff-gate pending); ADR-013 records root-serialized delivery replaced
--  epic decomposition for I4; ADR-023 extends it to I5. A live spawn gate has
--  nothing to spawn, handoff needs I6 replan. Report-only, zero repo writes."
--text: "No replan needed: ADR-023 governs I5 delivery; I6 replans M2/M3 without
--  epics."
-diff --git a/.factory/tasks/modernize/state.yaml b/.factory/tasks/modernize/state.yaml
-index 64b8b5b..f54a6ca 100644
---- a/.factory/tasks/modernize/state.yaml
-+++ b/.factory/tasks/modernize/state.yaml
-@@ -2,7 +2,7 @@ task: modernize
- kind: saga
- status: active
- iteration: 5
--currentWave: 3
-+currentWave: 2
- items:
-   adr-formalization:
-     kind: no-behavior
-@@ -165,12 +165,12 @@ items:
-     mergedAt: 2026-11-09T00:11:56-05:00
-   epic-kickoff-gate:
-     kind: fact-finder
--    status: failed
-+    status: running
-     branch: topic/modernize--epic-kickoff-gate
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.073828
--    currentStep: review
-+    spendUsd: 0.057369
-+    currentStep: research
-   golden-contract-hardening:
-     kind: test-only
-     status: merged
-@@ -217,12 +217,12 @@ items:
-     mergedAt: 2026-11-09T13:56:23-05:00
-   cache-design-spike:
-     kind: poc
--    status: ready
-+    status: running
-     branch: topic/modernize--cache-design-spike
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.109595
--    currentStep: review
-+    spendUsd: 0.105401
-+    currentStep: develop
-   checkers-legacy-dead-cleanup:
-     kind: no-behavior
-     status: blocked
-@@ -257,12 +257,12 @@ items:
-     mergedAt: 2026-11-08T10:47:48-05:00
-   epic-shift-report-collection:
-     kind: fact-finder
--    status: ready
-+    status: running
-     branch: topic/modernize--epic-shift-report-collection
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.04926
--    currentStep: review
-+    spendUsd: 0.040594
-+    currentStep: research
-   remaining-lint-violations-fix:
-     kind: no-behavior
-     status: merged
-@@ -301,12 +301,12 @@ items:
-     mergedAt: 2026-11-09T01:20:54-05:00
-   coding-rules-audit:
-     kind: fact-finder
--    status: ready
-+    status: running
-     branch: topic/modernize--coding-rules-audit
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.117057
--    currentStep: review
-+    spendUsd: 0.104406
-+    currentStep: research
-   decision-cache-impl:
-     kind: dev
-     status: failed
-@@ -317,12 +317,11 @@ items:
-     currentStep: qa
-   golden-regen-hatch:
-     kind: test-only
--    status: running
-+    status: pending
-     branch: topic/modernize--golden-regen-hatch
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.025239
--    currentStep: develop
-+    spendUsd: 0
-   never-test-linting-prune:
-     kind: test-only
-     status: merged
-@@ -346,9 +345,9 @@ items:
-     status: running
-     branch: topic/modernize--final-gate-validation
-     attempts: 1
--    fixRounds: 2
--    spendUsd: 0.069515
--    currentStep: review
-+    fixRounds: 1
-+    spendUsd: 0.052455
-+    currentStep: research
-   semantic-tests-rewrite:
-     kind: test-only
-     status: blocked
-@@ -358,12 +357,11 @@ items:
-     spendUsd: 0
-   test-debloat-audit:
-     kind: fact-finder
--    status: running
-+    status: pending
-     branch: topic/modernize--test-debloat-audit
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.179749
--    currentStep: research
-+    spendUsd: 0
-   docs-reconciliation:
-     kind: no-behavior
-     status: blocked
-@@ -425,12 +423,12 @@ items:
-     branch: topic/modernize--docs-counts-sync
-     attempts: 1
-     fixRounds: 1
--    spendUsd: 0.051479
--    currentStep: develop
-+    spendUsd: 0.033694
-+    currentStep: test-first
- concerns:
--  open: 6
-+  open: 24
-   dismissed: 0
--  routed: 29
-+  routed: 1
-   resolved: 2
- debt:
-   - No compliant model proven (215/0 unevaluable, single-author labels, Fastino
-@@ -471,56 +469,6 @@ debt:
-     determinism; oracle + per-tool coverage + tool-qualified brush-off/carry
-     lookups prove sensitivity. QA rejected 2/2 solely on red-test; all other
-     checks passed. No src follow-up required."
--  - "[cache-design-spike] PoC lock is POSIX-only fcntl.flock"
--  - "[cache-design-spike] Production call site passes a constant rule symbol,
--    collapsing the cache rule component"
--  - "[cache-design-spike] Tracked key excludes code_context, unlike the current
--    in-process semantic memo"
--  - "[cache-design-spike] Lockfile needs a gitignore entry and the retired
--    machine-cache entry should be replaced"
--  - "[coding-rules-audit] Production-dead _baseline_helpers module is pinned
--    only by tests"
--  - "[coding-rules-audit] peek_fallback_tools debt comment names a completed
--    owner"
--  - "[coding-rules-audit] Semantic docs still describe the removed cross-encoder
--    while the decision cache does not exist"
--  - "[coding-rules-audit] LoC deltas are gross estimates; public renames offset
--    stub deletion"
--  - "[coding-rules-audit] W9707 .pyi enforcement is blind, so 203 private stub
--    declarations are unguarded"
--  - "[consolidate-integration-helpers-v3] Accepted deletion of the two slow
--    self-lint guard tests instead of resurrecting them with item-side import
--    fixes."
--  - "[consolidate-integration-helpers-v3] Merge result is byte-identical to the
--    parent tip for every non-.factory path, so the item branch contributes no
--    code deltas of its own."
--  - "[consolidate-integration-helpers-v3] Stale doc references: _project_helpers
--    docstring still names 'the self-lint guards' (now pruned) and AGENTS.md test
--    counts are outdated."
--  - "[epic-kickoff-gate] ADR-011 names a test class that no longer exists and
--    carries stale line references"
--  - "[epic-kickoff-gate] Checkers owner count exceeds the ADR-011 ±5 drift
--    budget by 3"
--  - "[epic-shift-report-collection] ADR-011 shift-handoff contract remains
--    'Accepted' after epic decomposition was abandoned"
--  - "[epic-shift-report-collection] Legacy golden-regen-hatch could misread a
--    missing handoff as all-no-shift"
--  - "[final-gate-validation] Production call sites pass constant rule symbols,
--    collapsing the cache-key rule component"
--  - "[final-gate-validation] 1.72 GiB of .factory model artifacts are tracked;
--    detect-secrets safety depends on a prefix-anchored baseline filter"
--  - "[final-gate-validation] golden-regen-hatch report is absent from HEAD"
--  - "[final-gate-validation] PoC lock is POSIX-only fcntl.flock; no production
--    lock code exists at HEAD"
--  - "[golden-regen-hatch] Legacy golden-regen-hatch ran with a fail-open 0/3
--    handoff; this attestation is a no-regen byte-identity proof, not an
--    all-no-shift declaration"
--  - "[test-debloat-audit] coding-rules-audit UNIFIED ownership map was
--    unavailable in the prompt/inter-dep"
--  - "[test-debloat-audit] test_testing_fakes.py must not be removed as
--    test-infra-only coverage"
--  - "[test-debloat-audit] Shipped rcfile parity is unguarded after
--    test_config_consistency.py deletion"
-   - "[adr-formalization] ADR-012 examples could include conformance/ path prefix"
-   - "[adr-formalization] H1 heading prefix inconsistent between new and legacy
-     ADRs"
-@@ -651,11 +599,6 @@ debt:
-     decision-model warnings"
-   - "[decision-backend-impl] Expand nested ternary in normalize_suppressed_codes"
-   - "[decision-backend-impl] Add minimal docstrings to decision-backend stub"
--  - "[epic-kickoff-gate] ADR-011 stale test class and line refs"
--  - "[epic-kickoff-gate] Checkers +8 exceeds +-5 budget, enumerated and amended"
--  - "[epic-kickoff-gate] ADR-011 Accepted handoff contract stale"
--  - "[epic-kickoff-gate] Legacy hatch fail-open on missing handoff"
--  - "[epic-kickoff-gate] Drift row 21 cites regex def :27 as stream site"
-   - "[golden-contract-hardening] Add runs guard and messages to byte-identical
-     hash asserts"
-   - "[golden-contract-hardening] Consider SHA-256 comparison for counts payloads
-@@ -684,15 +627,6 @@ debt:
-     excludes it (6/336)"
-   - "[secrets-triage-spike] Scope the --baseline masking claim to
-     detect-secrets-scoped runs"
--  - "[cache-design-spike] Constant rule symbol collapses cache rule component"
--  - "[cache-design-spike] Tracked key excludes code_context"
--  - "[cache-design-spike] Lockfile gitignore plus retired cache entry"
--  - "[cache-design-spike] Heuristic docstring claims exactly as production"
--  - "[cache-design-spike] backend-failed marked contacted but skipped as
--    observation"
--  - "[cache-design-spike] Root escape guards triplicated"
--  - "[cache-design-spike] production_untouched fails post-commit on tracked out/"
--  - "[cache-design-spike] Docstrings say RefreshRefused vs RefreshRefusedError"
-   - "[coding-rules-audit-i2] Reconcile beartype taxonomy: true total is 26
-     sites, A22 undercounts by 2"
-   - "[coding-rules-audit-i2] A33 counts drift: measured 45 W9740 in src+scripts,
-@@ -716,16 +650,6 @@ debt:
-   - "[runner-dispatch-split] dispatch.py at 449/500 leaves 51 lines headroom"
-   - "[stale-disables-portability-cleanup] Slow downstream test still uses fixed
-     Path.home()/.tmp scratch dir"
--  - "[coding-rules-audit] Dead _baseline_helpers pinned only by tests"
--  - "[coding-rules-audit] peek_fallback_tools shim names completed owner"
--  - "[coding-rules-audit] Semantic docs describe removed cross-encoder, cache
--    absent"
--  - "[coding-rules-audit] LoC deltas gross; renames offset stub deletion"
--  - "[coding-rules-audit] W9707 blind; 203 private stubs unguarded"
--  - "[coding-rules-audit] Accepted deletion of two slow self-lint guard tests"
--  - "[coding-rules-audit] Merge byte-identical to parent tip, no item deltas"
--  - "[coding-rules-audit] Stale helpers docstring plus AGENTS counts"
--  - "[coding-rules-audit] PYI-1 cites missing IMP-1 row"
-   - "[decision-cache-impl] decisions/ lacks __init__.py while checkers/ and
-     runner/ have one"
-   - "[never-test-linting-prune] Stale docstring references deleted live test
-@@ -743,20 +667,6 @@ debt:
-     and conflates core"
-   - "[test-debloat-audit-i2] Sources typo: baseline-diff-edge cited under
-     tests/checkers/"
--  - "[final-gate-validation] Constant rule symbols collapse cache-key rule
--    component"
--  - "[final-gate-validation] Tracked 1.72GiB safetensors; detect-secrets relies
--    on prefix filter"
--  - "[final-gate-validation] Golden-regen-hatch report absent from HEAD"
--  - "[final-gate-validation] No production lock; PoC fcntl concern deferred"
--  - "[final-gate-validation] Legacy hatch fail-open; this gate is no-regen
--    byte-identity only"
--  - "[final-gate-validation] UNIFIED ownership map unavailable; ADR-011 labels
--    provisional"
--  - "[final-gate-validation] Keep test_testing_fakes.py; testing.py is shipped
--    API"
--  - "[final-gate-validation] Rcfile parity unguarded after consistency-test
--    deletion"
-   - "[golden-helpers-unit] tool_minimums imports TOOLS via package root, pulling
-     CLI structlog side effects"
-   - "[golden-helpers-unit] Public FindingKey alias missing from __all__"
-@@ -778,20 +688,20 @@ debt:
-     obscure"
-   - '[consolidate-integration-helpers-v3] make_consumer_project hardcodes
-     "consumer" dirname for hooks test'
--budgetSpentUsd: 12.988823685999996
-+budgetSpentUsd: 12.630543685999996
- spendByRole:
-   workhorse:
--    costUsd: 6.130492685999999
--    inputTokens: 12388371
--    outputTokens: 4477517
-+    costUsd: 5.907719685999999
-+    inputTokens: 11607284
-+    outputTokens: 4337356
-   alt-workhorse:
--    costUsd: 1.5968480000000007
--    inputTokens: 7615104
--    outputTokens: 2728957
-+    costUsd: 1.5378180000000008
-+    inputTokens: 7319130
-+    outputTokens: 2605987
-   architect:
--    costUsd: 5.133999999999998
--    inputTokens: 20904590
--    outputTokens: 684069
-+    costUsd: 5.057522999999998
-+    inputTokens: 20158964
-+    outputTokens: 681948
-   alt-architect:
-     costUsd: 0.127483
-     inputTokens: 457640
-@@ -922,29 +832,29 @@ spendByItem:
-     inputTokens: 713974
-     outputTokens: 167344
-   final-gate-validation:
--    costUsd: 0.069515
--    inputTokens: 174991
--    outputTokens: 92470
-+    costUsd: 0.052455
-+    inputTokens: 95165
-+    outputTokens: 54227
-   consolidate-integration-helpers-v3:
-     costUsd: 0.259824
-     inputTokens: 463214
-     outputTokens: 227545
-   epic-kickoff-gate:
--    costUsd: 0.073828
--    inputTokens: 188519
--    outputTokens: 87729
-+    costUsd: 0.057369
-+    inputTokens: 121841
-+    outputTokens: 49513
-   cache-design-spike:
--    costUsd: 0.109595
--    inputTokens: 192123
--    outputTokens: 99164
-+    costUsd: 0.105401
-+    inputTokens: 176978
-+    outputTokens: 87972
-   coding-rules-audit:
--    costUsd: 0.117057
--    inputTokens: 249934
--    outputTokens: 111991
-+    costUsd: 0.104406
-+    inputTokens: 187879
-+    outputTokens: 83867
-   epic-shift-report-collection:
--    costUsd: 0.04926
--    inputTokens: 160531
--    outputTokens: 43523
-+    costUsd: 0.040594
-+    inputTokens: 88261
-+    outputTokens: 36328
-   decision-cache-impl:
-     costUsd: 0.393308
-     inputTokens: 802730
-@@ -953,18 +863,10 @@ spendByItem:
-     costUsd: 0.258951
-     inputTokens: 549144
-     outputTokens: 175859
--  test-debloat-audit:
--    costUsd: 0.179749
--    inputTokens: 684503
--    outputTokens: 103456
-   docs-counts-sync:
--    costUsd: 0.051479
--    inputTokens: 116644
--    outputTokens: 46244
--  golden-regen-hatch:
--    costUsd: 0.025239
--    inputTokens: 50219
--    outputTokens: 22890
-+    costUsd: 0.033694
-+    inputTokens: 70279
-+    outputTokens: 32429
-   pylint-cache-assumptions:
-     costUsd: 0.23190968599999998
-     inputTokens: 455233
-@@ -974,7 +876,7 @@ spendByItem:
-     inputTokens: 1215172
-     outputTokens: 444746
-   (orchestration):
--    costUsd: 6.349675999999999
--    inputTokens: 24802345
--    outputTokens: 2201503
--lastUpdated: 2026-11-10T02:23:12.305Z
-+    costUsd: 6.273198999999999
-+    inputTokens: 24056719
-+    outputTokens: 2199382
-+lastUpdated: 2026-11-10T00:28:02.172Z
-diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-c-81b8a319de.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-c-81b8a319de.yaml
-deleted file mode 100644
-index 821c823..0000000
---- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-c-81b8a319de.yaml
-+++ /dev/null
-@@ -1,10 +0,0 @@
--id: q-concern-c-81b8a319de
--ref: epic-kickoff-gate
--disposition: human-awareness
--question: Decision 013 confirms abandonment; gate reconstruction under A0 with
--  explicit caveat is valid per amended assignment plus decision 009
--  mergeable-core rule. Downstream must cite this gate report as authority.
--  Operator should be aware authority shifted from validated-map artifact to gate
--  reconstruction.
--status: open
--createdAt: 2026-11-10T01:56:20.421Z
-
-## Human involvement
-# Human involvement criteria
-
-Mode selects which ADR and concern decisions need a human decision. Everything
-else is either autonomous or digest-only; never block on items the table marks
-remarkable.
-
-## Blocking table (ADRs and concerns)
-
-| Mode | Blocking (needs human decision) | Remarkable (digest only) |
-| --- | --- | --- |
-| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
-| principal | stack/layer, external interfaces, config shapes | internal choices |
-| detailed | external-interface changes and major internal interfaces | minor internals |
-
-## autonomous
-
-Block only explicit high-severity ADRs/concerns that remain after all unblocked
-work is finished. Do not stop for internal choices; record them as remarkable.
-
-## Output
-
-Yield a structured JSON object matching this schema:
-- status (string, required, enum: ["approved","changes_requested"])
-- summary (string, required)
-- suggestions (array of object, required)
-  - id (string, required)
-  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async","dismiss"])
-  - summary (string, required)
-  - detail (string, optional)
-  - location (object, optional)
-    - file (string, required)
-    - line (integer, optional)
-- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
-  - chosen (string, required)
-  - why (string, required)
-  - alternatives (array of string, required)
-- newConcerns (array of object, optional): New concerns discovered during review
-  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
-  - summary (string, required)
-  - detail (string, optional)
-  - severity (string, optional, enum: ["low","medium","high"])
-  - location (object, optional)
-    - file (string, required)
-    - line (integer, optional)
-  - affects (array of string, optional)
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/meta.yaml b/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/meta.yaml
deleted file mode 100644
index 6eb75e9..0000000
--- a/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/meta.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-seq: 2
-name: review
-attempt: 1
-fixRound: 1
-agent: reviewer
-role: alt-workhorse
-models:
-  - opencode-go/muse-spark-1.3-contributor
-  - opencode-go/deepseek-v4.1-flash
-timeoutSec: 3600
-status: ok
-startedAt: 2026-11-10T02:32:41.538Z
-session: 01a1c34c-f141-779a-b464-f036641ea190
-endedAt: 2026-11-10T02:58:56.272Z
-usage:
-  inputTokens: 108015
-  outputTokens: 64014
-  costUsd: 0.029593
-traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T02-32-42-049Z_01a1c34c-f141-779a-b464-f036641ea190.jsonl
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/output.yaml b/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/output.yaml
deleted file mode 100644
index 95559d9..0000000
--- a/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1/output.yaml
+++ /dev/null
@@ -1,94 +0,0 @@
-status: approved
-summary: "Approved: read-only audit verified accurate at HEAD; 13 unrelated
-  remarkable triaged optional; 2 cosmetic findings-text nits optional."
-suggestions:
-  - detail: Merge/integration tradeoff from consolidate-integration-helpers scope.
-      Valid record; no bearing on audit rows. Retained as digest.
-    disposition: optional
-    id: rm-0237e4a7c9
-    summary: Unrelated merge tradeoff; retain as digest
-  - detail: Consistent with audit §6 prune precedent (644774e deleted
-      self-lint/config-consistency guards). Audit correctly treats these as
-      already-absent at HEAD. No action.
-    disposition: optional
-    id: rm-963829d74d
-    summary: Consistent premise for audit §6; no action
-  - detail: Integration-helper merge decision; does not affect audit inventory or
-      pinning limbs. Retained as digest.
-    disposition: optional
-    id: rm-9b3f69811e
-    summary: Unrelated merge tradeoff; retain as digest
-  - detail: Iteration-management decision; orthogonal to audit substance. Retained
-      as digest.
-    disposition: optional
-    id: rm-6396a0993e
-    summary: Unrelated iteration decision; retain as digest
-  - detail: Cache-design-spike key-derivation decision. Audit SKIPs cache-semantics
-      modules, so no interaction with audit rows. Retained as digest.
-    disposition: optional
-    id: rm-00a177b6ba
-    summary: Unrelated cache decision; retain as digest
-  - detail: Cache key-format decision; outside audit scope (semantic/cache files
-      SKIPPED). Retained as digest.
-    disposition: optional
-    id: rm-0e2de85be6
-    summary: Unrelated cache decision; retain as digest
-  - detail: Cache pruning policy; outside audit scope. Retained as digest.
-    disposition: optional
-    id: rm-644c24995b
-    summary: Unrelated cache decision; retain as digest
-  - detail: Cache concurrency decision; outside audit scope. Retained as digest.
-    disposition: optional
-    id: rm-d1f2b9dda9
-    summary: Unrelated cache decision; retain as digest
-  - detail: Config-layer resolution decision from another item; no bearing on test
-      inventory. Retained as digest.
-    disposition: optional
-    id: rm-49477e3be0
-    summary: Unrelated item decision; retain as digest
-  - detail: Coding-rules-audit reporting decision; audit's stub-family rows stand on
-      their own measurements (verified exact). No conflict.
-    disposition: optional
-    id: rm-8744aaa293
-    summary: Unrelated reporting decision; no conflict
-  - detail: Lint-gate execution decision; audit was read-only and verified via
-      collect-only plus direct reads. No interaction.
-    disposition: optional
-    id: rm-bc510f4b77
-    summary: Unrelated gate decision; no interaction
-  - detail: Merge-conflict resolution from integration-helpers scope; tests/ content
-      verified unchanged vs audit base. Retained as digest.
-    disposition: optional
-    id: rm-5f84f18bbd
-    summary: Unrelated merge decision; retain as digest
-  - detail: Conftest re-export removal; audit's conftest row (keep, canonical
-      registry snapshot at :132) verified and unaffected. No conflict.
-    disposition: optional
-    id: rm-6e63c3be9e
-    summary: Consistent with conftest row; no action
-  - detail: TestImportVariants is at :154-171, not :169-186, so the 'keep :1-160'
-      range splits the class mid-body. In test_stub_fidelity_invariants.py the
-      drop range :385-427 endpoint bleeds past TestCtxConstruction (:385-414)
-      into TestEmitFidelityViolationsOrchestrator (:415-428), which has no
-      explicit disposition. Implementation reads files directly so impact is
-      low; correct the ranges before test-debloat-impl.
-    disposition: optional
-    id: audit-line-refs
-    location:
-      file: tests/checkers/test_tmp_path_checker.py
-      line: 154
-    summary: Minor line-range errors in two rewrite dispositions
-  - detail: "All headline LoC verified exact (78 mods/18,124; SKIPPED 1,054; dup
-      defs 13/10/8; bench zero asserts; smoke unmarked-slow). Only labels drift:
-      unmarked-marker count off by a few (definitional: SKIPPED inclusion,
-      slow-decorator-only modules); checkers factories '8 files' vs 9 on disk
-      (1,513 LoC includes base, correct); support '19 modules'/'833 LoC' vs
-      18/22 and 819 (delta is __init__.py files outside owner buckets; buckets
-      sum 18,110 + 14 = 18,124 exact); debloat summary range vs §9 range vs
-      component sum inconsistent; mocking 35 vs ~36 sites with bench-file
-      attribution. None affect verdicts or downstream rows."
-    disposition: optional
-    id: audit-count-labels
-    location:
-      file: tests/checkers/_factories.py
-    summary: Cosmetic count/label inconsistencies; LoC verified exact
diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
index 4b42f13..a1792be 100644
--- a/.factory/tasks/modernize/journal.ndjson
+++ b/.factory/tasks/modernize/journal.ndjson
@@ -2243,82 +2243,3 @@
 {"type":"step_timeout_armed","task":"modernize","item":"epic-shift-report-collection","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:09:19.943Z"}
 {"type":"step_transcript_size_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"sizeBytes":22559494,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
 {"type":"step_tool_call_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"toolCalls":65,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
-{"type":"step_finished","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2c9-b140-700c-9319-d3dbbbaad9b1","usage":{"inputTokens":88261,"outputTokens":36328,"costUsd":0.040594},"ts":"2026-11-10T00:14:51.724Z"}
-{"type":"step_started","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--final-gate-validation/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1","ts":"2026-11-10T00:15:14.068Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"final-gate-validation","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:15:14.073Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"sizeBytes":10860719,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-15-14-412Z_01a1c2cf-17ec-7158-a980-3643bf095788","ts":"2026-11-10T00:27:58.370Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"toolCalls":71,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-15-14-412Z_01a1c2cf-17ec-7158-a980-3643bf095788","ts":"2026-11-10T00:27:58.371Z"}
-{"type":"step_finished","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2cf-17ec-7158-a980-3643bf095788","usage":{"inputTokens":95165,"outputTokens":54227,"costUsd":0.052455},"ts":"2026-11-10T00:27:58.660Z"}
-{"type":"step_started","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-regen-hatch/.factory/tasks/modernize/items/golden-regen-hatch/steps/001-develop-r1-a1","ts":"2026-11-10T00:28:18.414Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"golden-regen-hatch","step":"develop","timeoutSec":5400,"ts":"2026-11-10T00:28:18.418Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"sizeBytes":5855128,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-28-18-722Z_01a1c2db-0fa2-75f0-aecb-0c9ff070f6d3.jsonl","ts":"2026-11-10T00:33:46.603Z"}
-{"type":"step_finished","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c2db-0fa2-75f0-aecb-0c9ff070f6d3","usage":{"inputTokens":50219,"outputTokens":22890,"costUsd":0.025239},"ts":"2026-11-10T00:36:23.368Z"}
-{"type":"step_started","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--test-debloat-audit/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1","ts":"2026-11-10T00:36:47.782Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"test-debloat-audit","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:36:47.787Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"sizeBytes":24748144,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl","ts":"2026-11-10T00:53:21.439Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"toolCalls":113,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl","ts":"2026-11-10T00:53:21.439Z"}
-{"type":"step_finished","task":"modernize","item":"test-debloat-audit","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2e2-d5a8-7324-8be8-2ee2ad29c577","usage":{"inputTokens":684503,"outputTokens":103456,"costUsd":0.179749},"ts":"2026-11-10T00:53:21.978Z"}
-{"type":"plan_closeup_refused","iteration":5,"stragglers":["cache-design-spike","coding-rules-audit","consolidate-integration-helpers-v3","docs-counts-sync","epic-kickoff-gate","epic-shift-report-collection","final-gate-validation","golden-regen-hatch","test-debloat-audit"],"statuses":{"cache-design-spike":"running","coding-rules-audit":"running","consolidate-integration-helpers-v3":"running","docs-counts-sync":"running","epic-kickoff-gate":"running","epic-shift-report-collection":"running","final-gate-validation":"running","golden-regen-hatch":"running","test-debloat-audit":"running"},"redrive":1,"ts":"2026-11-10T00:53:26.301Z"}
-{"type":"step_started","task":"modernize","item":"cache-design-spike","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--cache-design-spike/.factory/tasks/modernize/items/cache-design-spike/steps/002-review-r1-a1","ts":"2026-11-10T00:53:26.643Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"cache-design-spike","step":"review","timeoutSec":3600,"ts":"2026-11-10T00:53:26.649Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"cache-design-spike","step":"review","attempt":1,"sizeBytes":5434036,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-53-26-962Z_01a1c2f2-1332-755e-a9bc-6cbeac5678c6","ts":"2026-11-10T01:14:34.075Z"}
-{"type":"step_finished","task":"modernize","item":"cache-design-spike","step":"review","attempt":1,"status":"ok","sessionId":"01a1c2f2-1332-755e-a9bc-6cbeac5678c6","usage":{"inputTokens":15145,"outputTokens":11192,"costUsd":0.004194},"ts":"2026-11-10T01:14:34.273Z"}
-{"type":"step_started","task":"modernize","item":"coding-rules-audit","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--coding-rules-audit/.factory/tasks/modernize/items/coding-rules-audit/steps/002-review-r1-a1","ts":"2026-11-10T01:14:39.074Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"coding-rules-audit","step":"review","timeoutSec":3600,"ts":"2026-11-10T01:14:39.079Z"}
-{"type":"step_finished","task":"modernize","item":"coding-rules-audit","step":"review","attempt":1,"status":"ok","sessionId":"01a1c305-7da8-7280-a9ac-0ada4ed755d8","usage":{"inputTokens":62055,"outputTokens":28124,"costUsd":0.012651},"ts":"2026-11-10T01:22:03.446Z"}
-{"type":"step_started","task":"modernize","item":"docs-counts-sync","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--docs-counts-sync/.factory/tasks/modernize/items/docs-counts-sync/steps/002-develop-r1-a1","ts":"2026-11-10T01:22:07.514Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"docs-counts-sync","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:22:07.518Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"docs-counts-sync","step":"develop","attempt":1,"sizeBytes":8217325,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T01-22-07-906Z_01a1c30c-55a2-726c-9af7-57506393d238.jsonl","ts":"2026-11-10T01:31:09.061Z"}
-{"type":"step_finished","task":"modernize","item":"docs-counts-sync","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c30c-55a2-726c-9af7-57506393d238","usage":{"inputTokens":46365,"outputTokens":13815,"costUsd":0.017785},"ts":"2026-11-10T01:33:58.882Z"}
-{"type":"step_started","task":"modernize","item":"epic-kickoff-gate","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-kickoff-gate/.factory/tasks/modernize/items/epic-kickoff-gate/steps/002-review-r1-a1","ts":"2026-11-10T01:34:03.084Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"epic-kickoff-gate","step":"review","timeoutSec":3600,"ts":"2026-11-10T01:34:03.089Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"epic-kickoff-gate","step":"review","attempt":1,"sizeBytes":15215198,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T01-34-03-449Z_01a1c317-40b9-7045-891b-557abeb53206.jsonl","ts":"2026-11-10T01:56:20.219Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"epic-kickoff-gate","step":"review","attempt":1,"toolCalls":84,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T01-34-03-449Z_01a1c317-40b9-7045-891b-557abeb53206.jsonl","ts":"2026-11-10T01:56:20.220Z"}
-{"type":"step_finished","task":"modernize","item":"epic-kickoff-gate","step":"review","attempt":1,"status":"ok","sessionId":"01a1c317-40b9-7045-891b-557abeb53206","usage":{"inputTokens":66678,"outputTokens":38216,"costUsd":0.016459},"ts":"2026-11-10T01:56:20.508Z"}
-{"type":"step_started","task":"modernize","step":"consult-epic-kickoff-gate-1","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1","ts":"2026-11-10T01:56:24.881Z"}
-{"type":"step_timeout_armed","task":"modernize","step":"consult-epic-kickoff-gate-1","timeoutSec":7200,"ts":"2026-11-10T01:56:24.886Z"}
-{"type":"step_transcript_size_warning","task":"modernize","step":"consult-epic-kickoff-gate-1","attempt":1,"sizeBytes":29485392,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T00-51-56-494Z_01a1b8a3-f9ce-7511-963e-37a3531a2d3a.jsonl","ts":"2026-11-10T01:57:41.997Z"}
-{"type":"step_finished","task":"modernize","step":"consult-epic-kickoff-gate-1","attempt":1,"status":"ok","sessionId":"01a1b8a3-f9ce-7511-963e-37a3531a2d3a","usage":{"inputTokens":745626,"outputTokens":2121,"costUsd":0.076477},"ts":"2026-11-10T01:57:42.064Z"}
-{"type":"decision_made","context":"item","item":"epic-kickoff-gate","decision":"abandon","decisionPath":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize/.factory/tasks/modernize/decisions/031-item-epic-kickoff-gate-1.yaml","ts":"2026-11-10T01:57:42.065Z"}
-{"type":"step_started","task":"modernize","item":"epic-shift-report-collection","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-shift-report-collection/.factory/tasks/modernize/items/epic-shift-report-collection/steps/002-review-r1-a1","ts":"2026-11-10T01:57:47.397Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"epic-shift-report-collection","step":"review","timeoutSec":3600,"ts":"2026-11-10T01:57:47.403Z"}
-{"type":"step_finished","task":"modernize","item":"epic-shift-report-collection","step":"review","attempt":1,"status":"ok","sessionId":"01a1c32c-fc3a-739a-bdf5-12561aba5a62","usage":{"inputTokens":72270,"outputTokens":7195,"costUsd":0.008666},"ts":"2026-11-10T02:01:25.289Z"}
-{"type":"step_started","task":"modernize","item":"final-gate-validation","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--final-gate-validation/.factory/tasks/modernize/items/final-gate-validation/steps/002-review-r1-a1","ts":"2026-11-10T02:01:30.243Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"final-gate-validation","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:01:30.249Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"final-gate-validation","step":"review","attempt":1,"sizeBytes":7789487,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T02-01-30-623Z_01a1c330-62ff-70fa-b95e-f3ae4acfa416.jsonl","ts":"2026-11-10T02:23:05.566Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"final-gate-validation","step":"review","attempt":1,"toolCalls":61,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T02-01-30-623Z_01a1c330-62ff-70fa-b95e-f3ae4acfa416.jsonl","ts":"2026-11-10T02:23:05.567Z"}
-{"type":"step_finished","task":"modernize","item":"final-gate-validation","step":"review","attempt":1,"status":"ok","sessionId":"01a1c330-62ff-70fa-b95e-f3ae4acfa416","usage":{"inputTokens":79826,"outputTokens":38243,"costUsd":0.01706},"ts":"2026-11-10T02:23:05.999Z"}
-{"type":"step_started","task":"modernize","item":"golden-regen-hatch","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-regen-hatch/.factory/tasks/modernize/items/golden-regen-hatch/steps/002-review-r1-a1","ts":"2026-11-10T02:23:12.674Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"golden-regen-hatch","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:23:12.681Z"}
-{"type":"step_finished","task":"modernize","item":"golden-regen-hatch","step":"review","attempt":1,"status":"ok","sessionId":"01a1c344-42de-70f7-9874-be6f85ed0a30","usage":{"inputTokens":78115,"outputTokens":39147,"costUsd":0.017807},"ts":"2026-11-10T02:32:36.501Z"}
-{"type":"step_started","task":"modernize","item":"test-debloat-audit","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--test-debloat-audit/.factory/tasks/modernize/items/test-debloat-audit/steps/002-review-r1-a1","ts":"2026-11-10T02:32:41.601Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"test-debloat-audit","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:32:41.607Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"test-debloat-audit","step":"review","attempt":1,"sizeBytes":21722710,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T02-32-42-049Z_01a1c34c-f141-779a-b464-f036641ea190.jsonl","ts":"2026-11-10T02:58:56.073Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"test-debloat-audit","step":"review","attempt":1,"toolCalls":104,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T02-32-42-049Z_01a1c34c-f141-779a-b464-f036641ea190.jsonl","ts":"2026-11-10T02:58:56.074Z"}
-{"type":"step_finished","task":"modernize","item":"test-debloat-audit","step":"review","attempt":1,"status":"ok","sessionId":"01a1c34c-f141-779a-b464-f036641ea190","usage":{"inputTokens":108015,"outputTokens":64014,"costUsd":0.029593},"ts":"2026-11-10T02:58:56.326Z"}
-{"type":"plan_closeup_refused","iteration":5,"stragglers":["cache-design-spike","coding-rules-audit","consolidate-integration-helpers-v3","docs-counts-sync","epic-shift-report-collection","final-gate-validation","golden-regen-hatch","test-debloat-audit"],"statuses":{"cache-design-spike":"ready","coding-rules-audit":"ready","consolidate-integration-helpers-v3":"running","docs-counts-sync":"running","epic-shift-report-collection":"ready","final-gate-validation":"running","golden-regen-hatch":"ready","test-debloat-audit":"ready"},"redrive":2,"ts":"2026-11-10T02:59:01.539Z"}
-{"type":"item_merge_started","item":"cache-design-spike","branch":"topic/modernize--cache-design-spike","wave":3,"mergeAttempt":1,"ts":"2026-11-10T02:59:01.550Z"}
-{"type":"item_merge_phase","item":"cache-design-spike","phase":"merge-parent-into-child","ts":"2026-11-10T02:59:01.554Z"}
-{"type":"item_merge_phase","item":"cache-design-spike","phase":"verify-checks","ts":"2026-11-10T02:59:01.644Z"}
-{"type":"item_merge_verify_target","item":"cache-design-spike","wave":3,"targetSource":"record","target":{"command":"uv run python .factory/tasks/modernize/items/cache-design-spike/poc/run_proofs.py","customTarget":true},"ts":"2026-11-10T02:59:01.648Z"}
-{"type":"item_merge_failed","item":"cache-design-spike","check":"target-green","command":"uv run python .factory/tasks/modernize/items/cache-design-spike/poc/run_proofs.py","output":"PASS schema_deterministic_sorted_serialization (0.02s)\nPASS schema_validation_rejects_drift (0.00s)\nPASS encoding_secrets_clean_and_collision_safe (0.49s)\nPASS schema_passes_detect_secrets (0.97s)\nPASS proof_heuristic_reject_is_false_without_model_contact (0.01s)\nPASS proof_hit_equals_persisted_verdict (0.01s)\nPASS proof_miss_absent_returns_heuristic_true (0.00s)\nPASS proof_normal_lint_zero_writes (0.01s)\nPASS proof_refresh_merge_prune_atomic (0.02s)\nPASS proof_prune_age_policy (0.02s)\nPASS proof_lock_contention_fails_without_write (0.11s)\nPASS proof_ci_guard_refuses_before_write (0.17s)\nPASS proof_jobs_guard_consumes_writer_verdict (0.28s)\nPASS proof_decisions_path_isolation (0.19s)\nPASS proof_root_and_path_guards (0.08s)\nPASS proof_refresh_cli_end_to_end (0.27s)\nPASS proof_corrupt_cache_refused_not_clobbered (0.08s)\nFAIL production_untouched\n\n17/18 checks passed; verdict=blocked\nartifacts: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--cache-design-spike/.factory/tasks/modernize/items/cache-design-spike/poc/out/proofs.json, /home/slava/aiexp/python-setup.factory-wt/topic_modernize--cache-design-spike/.factory/tasks/modernize/items/cache-design-spike/poc/out/verdict.json","error":"Custom target command failed with exit code 1. Command: uv run python .factory/tasks/modernize/items/cache-design-spike/poc/run_proofs.py","ts":"2026-11-10T03:02:16.332Z"}
-{"type":"item_merge_failed","item":"cache-design-spike","error":"target-green failed on merge path for cache-design-spike: Custom target command failed with exit code 1. Command: uv run python .factory/tasks/modernize/items/cache-design-spike/poc/run_proofs.py Command: uv run python .factory/tasks/modernize/items/cache-design-spike/poc/run_proofs.py Output tail: f_root_and_path_guards (0.08s)\nPASS proof_refresh_cli_end_to_end (0.27s)\nPASS proof_corrupt_cache_refused_not_clobbered (0.08s)\nFAIL production_untouched\n\n17/18 checks passed; verdict=blocked\nartifacts: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--cache-design-spike/.factory/tasks/modernize/items/cache-design-spike/poc/out/proofs.json, /home/slava/aiexp/python-setup.factory-wt/topic_modernize--cache-design-spike/.factory/tasks/modernize/items/cache-design-spike/poc/out/verdict.json","mergeAttempt":1,"ts":"2026-11-10T03:02:16.333Z"}
-{"type":"item_merge_started","item":"coding-rules-audit","branch":"topic/modernize--coding-rules-audit","wave":4,"mergeAttempt":1,"ts":"2026-11-10T03:02:16.343Z"}
-{"type":"item_merge_phase","item":"coding-rules-audit","phase":"merge-parent-into-child","ts":"2026-11-10T03:02:16.347Z"}
-{"type":"item_merge_phase","item":"coding-rules-audit","phase":"verify-checks","ts":"2026-11-10T03:02:16.431Z"}
-{"type":"item_merge_verify_target","item":"coding-rules-audit","wave":4,"targetSource":"none","target":null,"ts":"2026-11-10T03:02:16.439Z"}
-{"type":"item_merge_phase","item":"coding-rules-audit","phase":"merge-child-into-parent","ts":"2026-11-10T03:04:59.579Z"}
-{"type":"item_merge_phase","item":"coding-rules-audit","phase":"remove-worktree","ts":"2026-11-10T03:04:59.650Z"}
-{"type":"item_merged","item":"coding-rules-audit","sha":"d33a62dbe20a1a0961d3d5bb7938dbd72f9cacfc","conflictResolved":false,"ts":"2026-11-10T03:05:00.339Z"}
-{"type":"step_started","task":"modernize","item":"docs-counts-sync","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--docs-counts-sync/.factory/tasks/modernize/items/docs-counts-sync/steps/003-qa-r1-a1","ts":"2026-11-10T03:05:00.768Z"}
-{"type":"item_merge_started","item":"epic-shift-report-collection","branch":"topic/modernize--epic-shift-report-collection","wave":3,"mergeAttempt":1,"ts":"2026-11-10T03:05:57.267Z"}
-{"type":"item_merge_phase","item":"epic-shift-report-collection","phase":"merge-parent-into-child","ts":"2026-11-10T03:05:57.270Z"}
-{"type":"item_merge_phase","item":"epic-shift-report-collection","phase":"verify-checks","ts":"2026-11-10T03:05:57.350Z"}
-{"type":"item_merge_verify_target","item":"epic-shift-report-collection","wave":3,"targetSource":"none","target":null,"ts":"2026-11-10T03:05:57.352Z"}
-{"type":"item_merge_phase","item":"epic-shift-report-collection","phase":"merge-child-into-parent","ts":"2026-11-10T03:08:44.816Z"}
-{"type":"item_merge_phase","item":"epic-shift-report-collection","phase":"remove-worktree","ts":"2026-11-10T03:08:44.883Z"}
-{"type":"item_merged","item":"epic-shift-report-collection","sha":"29a478601be2c5427f66efc194ca4d3b90b66455","conflictResolved":false,"ts":"2026-11-10T03:08:45.302Z"}
-{"type":"step_started","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--final-gate-validation/.factory/tasks/modernize/items/final-gate-validation/steps/003-research-r2-a1","ts":"2026-11-10T03:08:45.684Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"final-gate-validation","step":"research","timeoutSec":3600,"ts":"2026-11-10T03:08:45.689Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"sizeBytes":10620964,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T03-08-45-975Z_01a1c36d-f617-7640-8382-a66611ba3c58","ts":"2026-11-10T03:19:38.932Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"final-gate-validation","step":"research","attempt":1,"toolCalls":69,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T03-08-45-975Z_01a1c36d-f617-7640-8382-a66611ba3c58","ts":"2026-11-10T03:19:38.933Z"}
diff --git a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/input.md b/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/input.md
deleted file mode 100644
index c838e62..0000000
--- a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/input.md
+++ /dev/null
@@ -1,1132 +0,0 @@
-# Step: Architect Consult (Item)
-
-## Goal
-Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
-
-## Rules
-- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `modernize` (iteration 5 starting state)
-
-**Repository**: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT (`pyproject.toml:19-20`). Worktree `topic/modernize`, HEAD `0944670`.
-
-**Gates verified in this worktree on 2026-11-09** (read-only execution):
-
-| Gate | Result | Evidence |
-|---|---|---|
-| `uv run pytest -q` | 1357 passed, 7 deselected, 4 warnings, 26.6 s | default collection does **not** include `tests/integration.py` (filename is not `test_*.py`) |
-| `uv run pytest tests/integration.py -v` | 9 passed, 56.6 s | run explicitly per AGENTS/README |
-| `uv run lint` | exit 0, all 14 tools PASSED, 57.7 s | `lint.baseline` is `[]` (`lint.baseline:1`) |
-
-**Intent status at a glance**
-
-| Intent clause | State at HEAD | Primary evidence |
-|---|---|---|
-| Enforce `CodingRules.md` / `AGENTS.md` | Mostly done; lint gates green, but docs/ADR drift and some dead placeholders remain | `lint.baseline:1`; `AGENTS.md:9-11`, `AGENTS.md:79-85`; `docs/adr/ADR-016.md:1-5` |
-| Debloat code and tests; keep test intent | Partially done (recent prune removed self-lint/config-consistency tests); concrete duplication and dead helpers remain | §4.4 below; `tests/checkers/test_tmp_path_checker.py:19-32`; `tests/runner/_factories.py:167,200`; `tests/runner/test_real_pipeline_smoke.py:1-42` |
-| Replace embedding/rerank justification check with a CPU-friendly small decision model | **Half done**: reranker is gone and the veto backend protocol exists, but no production model is wired and no optional dependency ships | `src/python_setup_lint/checkers/_semantic.py:1-65`; `src/python_setup_lint/checkers/_decision_backend.py:37-59`; `pyproject.toml:28-30`; `tests/checkers/test_semantic_check.py:119-123` |
-| Keep a git-stored cache with cleanup | **Not implemented**: only a process-local memo exists; no `.python-setup-decisions.json`, refresh path, or pruning | `src/python_setup_lint/checkers/_semantic.py:15-25,47-64`; `tests/assumptions/test_pylint_cache_semantics.py:8-12`; `docs/adr/ADR-010.md:26-36` |
-| Preserve every material lint/check behavior | Green at HEAD; golden pins 158 findings including 18 W9704, but semantic is disabled during golden capture | `tests/data/golden/minimal_sample_project_findings.json`; `tests/integration.py:110-129`; `tests/_golden.py:54` |
-
----
-
-## 1. Module Map
-
-### 1.1 Semantic justification subsystem (primary intent area)
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `src/python_setup_lint/checkers/_decision_backend.py` | `DecisionBackend` protocol, `FakeBackend`, test-only dotted-path loader, `get_backend()`, pinned threshold/prompt constants, warn-once state | `:10-13`, `:16-30`, `:37-59` |
-| `src/python_setup_lint/checkers/_decision_backend.pyi` | Public stub: `DECISION_THRESHOLD`, `PROMPT_VERSION`, protocol, `FakeBackend`, `get_backend` | `:1-20` |
-| `src/python_setup_lint/checkers/_semantic.py` | Thin adapter: resolves backend, computes SHA-256 cache key, applies `>= DECISION_THRESHOLD`, owns in-memory memo | `:1-65` |
-| `src/python_setup_lint/checkers/_semantic.pyi` | Stub documenting the adapter contract | `:1-23` |
-| `src/python_setup_lint/checkers/_base.py` | `normalize_suppressed_codes`, heuristic-first `check_if_meaningful`, env gate, lazy `_semantic` import | `:145-156`, `:159-252` |
-| `src/python_setup_lint/checkers/conformance/suppression_justification_checker.py` | W9704 `unjustified-suppression`: scans suppression comments and `Any` annotations, calls `check_if_meaningful` | `:33-41`, `:63-91`, `:136-162`, `:330-388` |
-| `src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py` | W9738 `bare-except-comment`, second consumer of `check_if_meaningful` | `:14`, `:103-118` |
-| `docs/semantic-justification.md` | Current *stale* narrative of the reranker pipeline and caches | `:1-62` |
-| `docs/custom-checks.md` | Checker-authoring guide; semantic helper description stale | `:97`, `:104` |
-
-### 1.2 Checker subsystem
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `src/python_setup_lint/checkers/conformance/` | Conformance checkers: beartype, no-try-import, tmp-path, structlog, suppression justification, bare-except, missing error-chain, silent-except, generic-key-dict, unnamed-tuple-dict, trivial-wrapper, redundant-type-guard, pyi-underscore, missing-return-annotation, asyncio-timeout | directory listing |
-| `src/python_setup_lint/checkers/stub/` | Stub fidelity/coverage/docstring checkers and annotation normalizer | `checker.py`, `coverage.py`, `docstring_checker.py`, `normalizer.py`, `fidelity/*` |
-| `config/.pylintrc` | Source-code rcfile; enables custom rules and `max-module-lines=500`, `max-statements=65`, `max-branches=16` | `:2`, `:17`, `:19`, `:22-23` |
-| `config/.pylintrc-pyi` | Stub-file rcfile | `:12-13` |
-| `config/.pylintrc-tests` | Test-file ruleset (production-only rules disabled; W9704/W9702 still enabled) | `:20`, `:37`, `:39`, `:42-47` |
-
-### 1.3 Runner subsystem
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `src/python_setup_lint/runner/_tool_specs.py` | Single-source 14 built-in `ToolSpec` entries | `:9-100`, `:102` |
-| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry, command builders, autofix ordering, baseline fallback | `:62-359`, `:350-359` |
-| `src/python_setup_lint/runner/cli.py` | CLI, tool selection, skip reasons, serial pipeline, `run_lint` | `:110-201`, `:204-...`, argument parser `:280-366` |
-| `src/python_setup_lint/runner/baseline.py` | Baseline diff/merge and fallback inspection | module |
-| `src/python_setup_lint/runner/parsers.py`, `_record_parsers.py` | Output parsers (JSON, regex, record parsers) | modules |
-| `src/python_setup_lint/runner/_autofix.py` | Autofix conflict detection and staged/unstaged handling | module |
-| `src/python_setup_lint/runner/_config.py`, `cmd_build.py` | Config discovery and command composition | modules |
-| `src/python_setup_lint/runner/types.py` | `ToolSpec`, `LintResult`, `RunnerConfig`, `ViolationCount` | `:12-22`, `:25-59` |
-
-### 1.4 Setup / packaging / test helpers
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `src/python_setup_lint/setup.py` | `install()` / `main()`: dependency step, pylint plugin registration, config symlinks, state/checksums | `:41-56`, `:149-205`, `:223-290`, `:318-364` |
-| `src/python_setup_lint/_setup_pyproject.py` | TOML read/write, pylint load-plugins, dev-dependency detection (extras stripped) | `:19-97` |
-| `src/python_setup_lint/_setup_precommit.py` | Pre-commit config and AGENTS snippet generation/atomic writes | `:70-...` |
-| `src/python_setup_lint/_setup_update.py` | Drift detection + `uv add --refresh-package` update flow | `:11-...` |
-| `src/python_setup_lint/testing.py` | Shared `_make_tc` / `_walk_and_release`, lint-runner fakes, consumer health checks | `:18-38`, `:44-103`, `:115-196` |
-| `pyproject.toml` | Package metadata, empty `[semantic]` extra, pytest markers (`not slow` default) | `:1-4`, `:28-30`, `:47-54` |
-| `uv.lock` | Locked dependencies; root provides `semantic` extra, currently empty | `:573-623` |
-| `.gitignore` | Generated consumer artifacts; legacy semantic model cache ignored | `:222-244` |
-
-### 1.5 Documentation / decision register
-
-| Path | Responsibility | Key lines / state |
-|---|---|---|
-| `CodingRules.md` | Shipped coding rules: typing, `.pyi`, simplification, complexity, tests | `:1-75`, `:90-159`, `:230-307` |
-| `AGENTS.md` | Agent entry point: commands, tool scope, pipeline, test strategy | `:5-14`, `:16-32`, `:79-93` |
-| `docs/adr/README.md` | ADR index — **omits ADR-013…ADR-016** | `:16-31` |
-| `docs/adr/ADR-009.md` | Accepted no-go-gated deferral for the model | `:1-48` |
-| `docs/adr/ADR-010.md` | Frozen backend + tracked-cache contracts | `:1-52` |
-| `docs/adr/ADR-014.md` | Heuristic-first veto semantics (now implemented; text stale) | `:1-5` |
-| `docs/adr/ADR-015.md` | Pylint-pyi scope fix deferred to iteration 5 | `:1-3` |
-| `docs/adr/ADR-016.md` | Iteration-4 infrastructure-only scope — **claims no backend/cache/FakeBackend exists, contradicted by HEAD** | `:1-5` |
-| `design/0001`, `design/0002` | Config composers; ty src-only exception | files |
-| `README.md`, `docs/tutorials.md`, `docs/troubleshooting.md` | Consumer docs; semantic sections stale | `README.md:29,105`; `tutorials.md:12-16`; `troubleshooting.md:97-111,150` |
-
-### 1.6 Test subsystems
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `tests/checkers/` | Per-checker behavioral tests over real pylint `CheckerTestCase`; `_factories_*` data modules | 45 `.py` files incl. helpers |
-| `tests/runner/` | Runner unit/integration tests, autofix, parsers, setup, benchmarks | 30 `.py` files |
-| `tests/assumptions/` | Third-party contract pins (astroid, beartype, pylint, pylint cache semantics) | `test_pylint_cache_semantics.py:1-39` |
-| `tests/_golden.py` | Golden snapshot normalization/serialization/assertions + CI-guarded rewrite | `:1-11`, `:53-58`, `:374-392` |
-| `tests/test_golden.py` | Synthetic unit tests for golden helpers | `:1-6` |
-| `tests/integration.py` | Fit-for-purpose end-to-end gate on planted sample project | `:1-145` |
-| `tests/data/minimal_sample_project/` | Planted-violation fixture project (W9704 brush-off vs carry-from) | `src/minimal_sample/mod.py:41-56`, `violations.txt` |
-| `tests/data/golden/minimal_sample_project_findings.json` | 158 normalized findings; 18 `unjustified-suppression`, 2 `bare-except-comment` | golden file |
-
----
-
-## 2. Key Interfaces & Signatures
-
-### 2.1 Decision backend (`src/python_setup_lint/checkers/_decision_backend.py`)
-
-```python
-DECISION_THRESHOLD: float = 0.5          # :10
-PROMPT_VERSION: str = "prompt-v1"        # :11
-
-@runtime_checkable
-class DecisionBackend(Protocol):          # :16-20
-    model_id: str
-    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
-
-class FakeBackend:                        # :23-30
-    model_id: str = "fake-backend rev test prompt-v1"
-    def __init__(self, score: float = 1.0) -> None: ...
-    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
-
-def get_backend() -> DecisionBackend | None: ...   # :49-59
-```
-
-Behavior of `get_backend()` at HEAD:
-
-- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored **only** when `PYTEST_CURRENT_TEST` is set, then imports an arbitrary `module:attribute` factory (`_decision_backend.py:37-46`).
-- `PYTHON_SETUP_LINT_RERANKER_MODEL` emits a one-time deprecation warning (`:51-53`).
-- `PYTHON_SETUP_LINT_DECISION_MODEL` is read but only emits a one-time `decision_model_unavailable` warning; it never constructs a backend (`:55-58`).
-- Production default is therefore always `None` → heuristic-only behavior.
-
-### 2.2 Semantic adapter (`src/python_setup_lint/checkers/_semantic.py`)
-
-```python
-_RESULT_CACHE: dict[int, bool] | None = None     # :16
-
-def _reset_cache() -> None: ...                  # :19-25 (test helper, not in .pyi)
-
-@beartype
-def semantic_check_if_meaningful(                # :28-65
-    text: str,
-    *,
-    rule: str | None = None,
-    code_context: str | None = None,
-    comment: str | None = None,
-    backend: DecisionBackend | None = None,
-) -> bool | None: ...
-```
-
-Contract: `primary = (comment or text).strip()`; empty → `False`; no backend → `None`; otherwise `decide(primary, rule, code_context) >= 0.5`; result memoized in `_RESULT_CACHE` keyed by the first 8 bytes of SHA-256 over `(primary, rule, code_context, model_id)` (`:37-64`).
-
-### 2.3 Heuristic-first gate (`src/python_setup_lint/checkers/_base.py`)
-
-```python
-def normalize_suppressed_codes(raw: str) -> str: ...   # :148-156
-
-def check_if_meaningful(                               # :159-252
-    text: str,
-    *,
-    rule: str | None = None,
-    code_context: str | None = None,
-    comment: str | None = None,
-    backend: DecisionBackend | None = None,
-) -> bool: ...
-```
-
-Order is strict:
-
-1. Normalize directive text and strip echoed codes (`:168`, `:145-156`).
-2. Reject `<5` chars, boilerplate tokens, multi-word brush-offs, and rule-symbol-only reasons (`:169-246`).
-3. If `PYTHON_SETUP_LINT_SEMANTIC != "1"` → return `True` (`:248-249`).
-4. Lazily import `_semantic` and return `semantic_check_if_meaningful(...) is not False` (`:250-252`).
-
-Consequence: the backend can **only veto** a heuristic-meaningful justification; it can never resurrect a heuristic rejection. `None` (no backend) maps to `True`.
-
-### 2.4 W9704 consumer (`suppression_justification_checker.py`)
-
-```python
-msgs = _msgs(W9704=MessageDef(
-    message="Suppression comment without technical justification: %s",
-    symbol="unjustified-suppression", ...))              # :33-41
-
-# module-level scan of raw source lines
-self._legacy_scan(node, lines)                            # :63-91
-
-# Any annotation path
-self._emit_if_unjustified(annotation, lineno)             # :136-162
-
-# trailing/preceding reason validation
-self._has_justification(lines, idx)                       # :330-388
-```
-
-Both paths call `check_if_meaningful(reason, comment=reason, rule="unjustified-suppression", code_context=<code before #>)` (`:152-155`, `:372-375`, `:383-386`). The checker knows the file path via `node.root().file` (`_base.py:68-75`) but does not pass it to the semantic API.
-
-### 2.5 Runner / test helpers
-
-- `ToolSpec` and `RunnerConfig` (`runner/types.py:12-22`, `:49-59`); `TOOLS` list (`runner/_tool_specs.py:9-100`); `run_lint(...)` (`runner/cli.py:204-...`).
-- `_make_tc(checker_class)` and `_walk_and_release(code, checker_class, *, file_path, module_name)` (`testing.py:18-38`) are the intended shared checker-test harness.
-- Golden contract: `Finding = {tool,file,line,col,rule}`, multiset diff, `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` opt-in, refused under `CI`/`GITHUB_ACTIONS` (`tests/_golden.py:1-11`, `:53-58`, `:374-392`).
-
----
-
-## 3. Relevant Excerpts
-
-### 3.1 Full current semantic adapter
-
-`src/python_setup_lint/checkers/_semantic.py:15-65`:
-
-```python
-_RESULT_CACHE: dict[int, bool] | None = None
-
-def _reset_cache() -> None:
-    global _RESULT_CACHE
-    _RESULT_CACHE = None
-
-@beartype
-def semantic_check_if_meaningful(...) -> bool | None:
-    primary = (comment or text).strip()
-    global _RESULT_CACHE
-    if _RESULT_CACHE is None:
-        _RESULT_CACHE = {}
-    if not primary:
-        return False
-    resolved = backend if backend is not None else _decision_backend.get_backend()
-    if resolved is None:
-        return None
-    cache_key = hashlib.sha256("|".join(str(x) for x in (
-        primary, rule, code_context, resolved.model_id)).encode()).digest()
-    cache_key_int = int.from_bytes(cache_key[:8], "big")
-    if cache_key_int in _RESULT_CACHE:
-        return _RESULT_CACHE[cache_key_int]
-    result = resolved.decide(primary, rule, code_context) >= _decision_backend.DECISION_THRESHOLD
-    _RESULT_CACHE[cache_key_int] = result
-    return result
-```
-
-Observations for the architect:
-
-- The memo is process-local only; nothing is persisted.
-- The key truncates SHA-256 to 64 bits (`:59`) — the same truncation ADR-003 criticized in the retired on-disk cache (`docs/adr/ADR-003.md:7`).
-- `comment` is folded into `primary`, so the key does not separately include it; docs claim `(text, rule, code_context, comment, model)` (`docs/custom-checks.md:97`).
-- `code_context` participates in the key, so any source-line edit invalidates an entry even if the justification is unchanged.
-- `model_id` participates, so a model/prompt swap invalidates entries — but `PROMPT_VERSION` is not currently folded into `model_id` by production code.
-
-### 3.2 Heuristic gate and env behavior
-
-`src/python_setup_lint/checkers/_base.py:248-252`:
-
-```python
-if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") != "1":
-    return True
-from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
-
-return _semantic_check(primary, rule=rule, code_context=code_context, comment=primary, backend=backend) is not False
-```
-
-- Semantic is **on by default**; absence of a backend yields heuristic behavior because `_semantic` returns `None`.
-- The lazy import means `_semantic` is never imported when `PYTHON_SETUP_LINT_SEMANTIC=0` (`docs/semantic-justification.md:18`, verified by tests).
-- The same gate governs W9738 `bare-except-comment` (`bare_except_comment_checker.py:103-118`).
-
-### 3.3 W9704 justification resolution
-
-`suppression_justification_checker.py:350-388`:
-
-```python
-_suppression_patterns = (_PAT_PYLINT_DISABLE, _PAT_NOQA, _PAT_TYPE_IGNORE, _PAT_TY_IGNORE)
-for pat in _suppression_patterns:
-    for m in pat.finditer(line):
-        after = line[m.end():]
-        ...  # only search before the next suppression pattern
-        tm = _PAT_TRAILING_REASON.search(search_after)
-        if tm:
-            reason = tm.group(1)
-            if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
-                                   code_context=line.split("#", 1)[0].strip()):
-                return True
-
-if idx > 0:
-    pm = _PAT_PRECEDING_COMMENT.match(prev)
-    if pm:
-        reason = pm.group(1)
-        if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
-                               code_context=lines[idx].split("#", 1)[0].strip()):
-            return True
-return False
-```
-
-A tracked cache keyed by file path would need this caller to supply file identity; today it does not.
-
-### 3.4 Packaging and pytest configuration
-
-`pyproject.toml:28-30`:
-
-```toml
-[project.optional-dependencies]
-# Empty placeholder: no model dependency ships in iteration 4 (ADR-016).
-semantic = []
-```
-
-`pyproject.toml:47-54`:
-
-```toml
-[tool.pytest.ini_options]
-addopts = "-m 'not slow'"
-markers = [
-  "slow: ...full pipeline runs...",
-  "no_external_api: ...",
-  "with_real_api: ...",
-  "implementation_detail: ...",
-]
-```
-
-`uv.lock:623` likewise reports `provides-extras = ["semantic"]` with no dependencies.
-
-### 3.5 Cache-related ignore and secrets constraints
-
-- `.gitignore:243-244` still names the retired machine cache: `# NLP semantic model cache (sentence-transformers)` / `.cache/python-setup/semantic/`.
-- `.secrets.baseline` enables `HexHighEntropyString` with `limit: 3.0`, so a committed result cache must not contain raw long hex digests; ADR-010 already requires “no bare hex strings of length >= 20” (`docs/adr/ADR-010.md:26-28`).
-- ADR-011 says the tracked decisions file is consumer-runtime data, is committed, and gets **no** hatch/wheel entry (`docs/adr/ADR-011.md:54-60`).
-
-### 3.6 ADR state (decisions vs implementation)
-
-- `docs/adr/ADR-009.md:5` — accepted deferral; `:9-13` documents the 215-meaningful / 0-meaningless corpus no-go; `:23-27` requires a double-rated sample and a human Fastino license decision; `:35-37` requires a CPU benchmark and forbids claiming the swap complete.
-- `docs/adr/ADR-009.md:29-33` claims iteration 3 delivers “Heuristic-first `DecisionBackend` plus tracked-cache infrastructure” — the backend half exists; the tracked-cache half does not.
-- `docs/adr/ADR-010.md:23-36` freezes: backend protocol, `.python-setup-decisions.json` at the linted project root, sorted `indent=2`/`sort_keys` JSON array, no hex≥20, read-only lint with a hash-asserted zero-write check, explicit CI-guarded refresh (lockfile + merge + atomic replace), pruning of missing files/stale model IDs, and writer-first concurrency from the pylint verdict.
-- `docs/adr/ADR-010.md:38-41` and `_decision_backend.py:37-46` pin the dotted-path loader as test-only.
-- `docs/adr/ADR-014.md:1-5` claims current code is semantic-first with heuristic fallback; HEAD is heuristic-first (`_base.py:248-252`; `_decision_backend.py:16-20`), so the record is stale.
-- `docs/adr/ADR-016.md:1-5` claims “At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled.” All three claims are false at HEAD: `_decision_backend.py` exists, `pyproject.toml:28-30` is empty, and tests pin the absence of `sentence_transformers` (`tests/checkers/test_semantic_check.py:119-123`, `tests/checkers/test_decision_backend.py:329-337`).
-- `docs/adr/ADR-015.md:1-3` is an open iteration-5 deferral: `_PylintPyiLintTool` passes `.pyi` paths but pylint lints companion `.py` (42 of 43 `pylint-pyi` golden findings are on `.py` files); probe found 205 latent private stub symbols; fixing changes the golden.
-- `docs/adr/README.md:18-31` indexes only ADR-001…ADR-012; ADR-013…ADR-016 are absent.
-
----
-
-## 4. Existing Tests & Conventions
-
-### 4.1 Layout and style
-
-- Unit tests: `tests/checkers/`, `tests/runner/`, `tests/test_golden.py`, `tests/test_setup_*`; 85 test modules, 794 test functions before parametrization, 19,627 lines total (`tests/`).
-- Naming convention `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`).
-- Markers: `slow` (excluded by default via `addopts = "-m 'not slow'"`), `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:47-54`).
-- Mocking policy: mock only external boundaries; first-party code always real (`CodingRules.md:240-252`). Checker tests therefore instantiate real `BaseChecker` subclasses through `CheckerTestCase`.
-- Shared fixtures live in `tests/conftest.py` (`:40-169`): `empty_project`, session-scoped `configured_project`, `runner_config_factory`, `isolated_runner_registries`, `sample_project`.
-- Test factories for complex checker inputs are split by domain to respect the 500-line C0302 limit (`tests/checkers/_factories.py:1-16`; `_factories_stub*.py`).
-
-### 4.2 Semantic/backend tests (current contract)
-
-| File | Coverage | Key lines |
-|---|---|---|
-| `tests/checkers/test_decision_backend.py` | Pinned constants, FakeBackend, loader gating, heuristic-first veto, normalization, packaging pins | `:1-6`, `:83-165`, `:181-264`, `:320-337` |
-| `tests/checkers/test_semantic_check.py` | Adapter signature, empty-primary, `None` mapping, 0.5 threshold matrix, memo per unique pair/model, no `sentence_transformers`, no disk cache | `:47-133` |
-| `tests/checkers/test_semantic_threshold.py` | 115-row heuristic table, semantic disabled | `:16-21`, `:147-164` |
-| `tests/assumptions/test_pylint_cache_semantics.py` | Read-only behavior, in-process memo, path-free semantic API, `jobs=1` single-writer verdict, sequential pylint invocation | `:1-39`, `:94-181`, `:225-355` |
-| `tests/checkers/test_suppression_justification_checker.py` | W9704 checker behavior; semantic disabled via fixture | `:19-30`, `:367-392` |
-| `tests/checkers/test_bare_except_comment_checker.py` | W9738 checker behavior; semantic disabled via fixture | `:18-43` |
-
-Important: no test exercises a real model. Every backend is a test double (`test_decision_backend.py:1-6`). The current test suite actively pins the **absence** of a model dependency (`test_semantic_extra_is_empty`, `test_uv_lock_has_no_sentence_transformers_edge` at `:323-337`; `test_no_try_import_checker.py:27-35`; `_OPTIONAL_IMPORT_PATTERNS` empty at `no_try_import_checker.py:10-13`). Any model wiring must update these pins deliberately.
-
-### 4.3 Behavior-preservation gates
-
-- Golden snapshot: 158 findings across all 14 tools; per-tool minimums; multiset comparison catches duplicates/moved lines/new false positives (`tests/_golden.py:1-11`; `tests/data/golden/minimal_sample_project_findings.json`).
-- 18 `unjustified-suppression` findings (6 each for `pylint`, `pylint-pyi`, `pylint tests`) and 2 `bare-except-comment` findings.
-- Golden capture runs with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so semantic-enabled behavior is **not** covered by the golden.
-- Integration also asserts brush-off W9704 at `mod.py:49` and no W9704 for carry-from at `mod.py:56` (`tests/integration.py:124-129`; fixture `tests/data/minimal_sample_project/src/minimal_sample/mod.py:49,56`).
-- `lint.baseline` is empty, so self-lint fails on any new violation (`lint.baseline:1`).
-
-### 4.4 Debloat evidence (measured at HEAD)
-
-**Duplicated checker-test harness:**
-
-- `_make_tc` local wrapper exists in 13 test files; `_walk_and_release` in 10; `_msg_ids` in 8. The shared implementations already exist in `testing.py:18-38`.
-- Examples: `tests/checkers/test_tmp_path_checker.py:19-32` (calls `tc.checker.open()`), `tests/checkers/test_missing_error_chain_checker.py:16-32` (does not call `open()`), `tests/checkers/test_suppression_justification_checker.py:19-20` (imports the shared helper but still defines `_msg_ids`).
-- The wrappers are not byte-identical: some call `checker.open()` (SourceRootMixin checkers) and some pass `module_name`. A shared helper needs an `open_checker`/`module_name` option rather than naive deletion.
-
-**Duplicated semantic test double:**
-
-- `_RecordingBackend` appears three times: `tests/checkers/test_decision_backend.py:44-55`, `tests/checkers/test_semantic_check.py:25-36`, `tests/assumptions/test_pylint_cache_semantics.py:80-91`.
-
-**Duplicated runner/setup helpers:**
-
-- `_UvCallRecorder` appears twice: `tests/runner/test_setup.py:39-60` and `tests/runner/test_setup_install.py:36-58`.
-- `extra_block` appears twice: `tests/runner/_factories.py:174-176` and `tests/runner/_factories_extras.py:45-47`.
-- `_semantic_disabled` fixture appears twice: `tests/checkers/test_bare_except_comment_checker.py:37-40` and `tests/checkers/test_suppression_justification_checker.py:23-26`.
-
-**Dead/vestigial test code:**
-
-- `assert_violation_contains_any` (`tests/runner/_factories.py:167-171`), `assert_r4_reason` (`:200-206`), and `baseline_entry_for_tool` (`tests/runner/_factories_baseline.py:26-28`) have no call sites.
-- `sample_project` fixture (`tests/conftest.py:166-169`) has no call sites.
-- `test_check_writes_no_disk_cache` monkeypatches `_CACHE_DIR`/`_RESULT_CACHE_FILE`, attributes that no longer exist, with `raising=False` (`tests/checkers/test_semantic_check.py:126-133`).
-- The `semantic_disk` fixture does the same for `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RESULT_CACHE` (`tests/assumptions/test_pylint_cache_semantics.py:94-106`). These assert the absence of a retired implementation rather than a live contract.
-- `tests/runner/test_real_pipeline_smoke.py:1-42` runs the full pipeline and asserts only an int return plus all 14 section markers; this overlaps `tests/integration.py:57-145` and the fake-driven all-tools assertion in `tests/runner/test_lint_runner_integration.py:230-248`.
-- Recent prune precedent: commit `644774e` deleted `test_config_consistency.py`, `test_self_lint_clean.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` and trimmed `test_autofix_conflict_integration.py` — the “never test linting” direction is already established.
-
-**Source-side dead/placeholder code:**
-
-- `PROMPT_VERSION` (`_decision_backend.py:11`) is unused in production; only tests assert it (`test_decision_backend.py:87-88`).
-- `PYTHON_SETUP_LINT_DECISION_MODEL` is read only to warn that no model exists (`_decision_backend.py:55-58`; test `:141-151`).
-- `_semantic.py` needs two `global` statements and a nullable memo solely for lazy initialization (`:16,24,39-41`); a module-level dict + `.clear()` would remove both.
-- `_base.check_if_meaningful` rebuilds the 46-token boilerplate set and 20-phrase set on every call (`:172-241`); module-level `frozenset`s would preserve behavior and cut per-call work.
-- `_PylintPyiLintTool` and `_PylintTestsLintTool` duplicate “explicit override then auto-discovery” rcfile resolution (`dispatch.py:249-277` vs `:280-309`), while `_PylintLintTool` uses `_resolve_pylintrc` (`:201-246`).
-- `src/python_setup_lint/checkers/__init__.py` has only the license header and no module docstring (unlike `runner/__init__.py` and `conformance/__init__.py`).
-- `docs/adr/ADR-016.md` and `ADR-014.md` are stale; the ADR index omits 013-016 (`docs/adr/README.md:18-31`).
-- `pyproject.toml:3` says 1.2.10 while `CHANGELOG.md:3` tops out at v1.2.9 (minor release-doc drift).
-
-### 4.5 Test-infrastructure conventions to extend first
-
-The intent says “test infra/assumptions first.” The existing template is `tests/assumptions/`:
-
-- Each module opens with the observed third-party version and the contract being pinned (`test_pylint_cache_semantics.py:1-39`, `test_astroid_contracts.py:1-7`, `test_beartype_contracts.py:1-11`, `test_pylint_contracts.py:1-6`).
-- `pytestmark = pytest.mark.no_external_api` on every assumption module.
-- Tests are behavioral and assert observed consequences, not implementation internals; failures are meant to trigger re-derivation before loosening.
-- For the cache writer, `TestPylintRcfileJobsWatchdog` and `TestPylintInvocationConcurrency` already pin `jobs=1`, sequential dispatch, and the absence of `concurrent`/`multiprocessing` imports in the runner (`:225-355`). This is the writer-first verdict ADR-010 requires.
-- For benchmarks, `tests/runner/test_bench_runner_overhead.py:1-14` shows the convention: `@pytest.mark.slow`, real subprocesses, measured wall time/RSS, artifact written under `tmp_path`.
-
----
-
-## 5. Open Questions & Uncertainties
-
-### Q1. Which model satisfies the intent, and can the ADR-009 gate be closed now?
-
-- The intent names `fastino/GLiDE-0.4B` or smaller. External facts: GLiDE-0.4B is a 0.40B-parameter encoder, 0.81 GB bf16 weights, tested on an RTX PRO 6000, requires `torch==2.14.0` (CUDA 13.0 wheels) and `transformers==5.17.0`; its `glide/` inference package lives in the HF repo, not as a normal PyPI dependency ([model card](https://huggingface.co/fastino/GLiDE-0.4B)).
-- The GLiDE collection’s smallest member is 0.4B (others: 0.8B, 2B, 9B, 27B) ([collection](https://huggingface.co/collections/fastino/glide)), so “or smaller” requires a different model family.
-- License is the Fastino Community License: free use, but production commercial use by an entity with annual revenue > $10M requires a separate written agreement; any commercial use requires “Built with Fastino GLiDE” attribution; derivative works must be distributed under the same license ([LICENSE](https://huggingface.co/fastino/GLiDE-0.4B/blob/main/LICENSE)). The project itself is MIT (`pyproject.toml:19-20`).
-- ADR-009’s corpus gate remains untouched: 215 meaningful / 0 meaningless labels, all single-author (`docs/adr/ADR-009.md:9-13`). No corpus artifacts exist in the repository (only `tests/data/golden/` and `tests/data/minimal_sample_project/`).
-- No CPU benchmark exists; ADR-016 explicitly lists “no CPU bench” as open (`docs/adr/ADR-016.md:3`).
-- Decision framing: (a) spike GLiDE CPU latency and packaging, then implement an optional backend; (b) choose a smaller permissively licensed zero-shot/classifier model, which still needs evaluation data; or (c) keep heuristic-only behavior and record another explicit deferral. Option (c) conflicts with the literal intent unless the operator accepts the ADR-009 gate again.
-
-### Q2. How should a production backend be wired, and should it be default-on?
-
-- `get_backend()` currently has no production model path; it returns a test-only dotted-path backend or `None` (`_decision_backend.py:37-59`). ADR-010 says a compliant model “plugs in through `get_backend()` plus `DECISION_MODEL` with no pipeline refactor” (`docs/adr/ADR-010.md:47-48`), but no loader code exists for that env var.
-- `PYTHON_SETUP_LINT_DECISION_MODEL` is parsed but never used (`_decision_backend.py:55-58`), and `PROMPT_VERSION` is dead (`:11`).
-- The present veto semantics mean a backend can only make lint stricter (`_base.py:248-252`; tests `test_decision_backend.py:181-229`). Default-on would change W9704/W9738 outcomes for every consumer that installs the extra; default-off would preserve behavior but make the feature opt-in.
-- The architect must also decide failure semantics: missing extra, model download failure, OOM, CPU timeout, and malformed model output all currently collapse to `None` → heuristic pass. Is that acceptable for a tool advertised as validating suppressions?
-
-### Q3. Git-stored decision cache: schema, keying, and the path-free API tension
-
-ADR-010 freezes the contract (`docs/adr/ADR-010.md:26-36`) but the repository documents no schema or key encoding beyond “JSON array sorted, indent=2, sort_keys, no bare hex ≥20.” Open decisions:
-
-- **File identity vs path-free API**: pruning requires file paths in cache entries (ADR-010:33), but `semantic_check_if_meaningful` is deliberately path-free (`tests/assumptions/test_pylint_cache_semantics.py:171-181`) and its callers (`suppression_justification_checker.py:152-155,372-386`; `bare_except_comment_checker.py:103-118`) do not pass a path. Options: extend the checker→semantic call with a file path, add a separate cache API at the checker layer, or key by content and prune by scanning the repo. Each has test/behavior implications.
-- **Key composition**: current memo includes `(primary, rule, code_context, model_id)` and truncates to 64 bits (`_semantic.py:47-64`). A tracked cache should likely key on file path + normalized justification + rule + model/prompt version; whether `code_context` belongs in the key determines churn vs sensitivity.
-- **Score vs verdict**: storing a boolean loses the ability to re-threshold; storing a float lets `DECISION_THRESHOLD` changes apply without re-running the model, but requires calibrating model output to `[0,1]` (the protocol promises this, but does not enforce it; `_decision_backend.py:16-20`).
-- **Refresh command**: there is no CLI surface today (`runner/cli.py:280-366` lists all args; none refresh decisions). ADR-010 requires an explicit CI-guarded refresh path with lockfile + merge + atomic replace. The golden-update guard pattern (`tests/_golden.py:374-392`: refuse under `CI`/`GITHUB_ACTIONS`) is a reusable precedent.
-- **Read-only lint**: ordinary lint must not mutate the cache; a hash-before/hash-after test is required. Current tests only prove the retired path is absent (`test_pylint_cache_semantics.py:112-168`; `test_semantic_check.py:126-133`).
-- **Secrets scan**: `.secrets.baseline` enables `HexHighEntropyString` (limit 3.0), so long hex keys in a committed cache will fail `detect-secrets`. ADR-010’s “no bare hex strings” constraint is not just stylistic.
-- **Writer concurrency**: the verdict says no lock/merge is needed while pylint `jobs=1` (`test_pylint_cache_semantics.py:14-38`, `:225-355`); a consumer rcfile with `jobs>1` voids the claim. If refresh is a separate process rather than pylint, that assumption must be restated.
-- **Location**: `.python-setup-decisions.json` at the linted project root (ADR-010:26); `.gitignore` currently ignores only `.cache/python-setup/semantic/` (`.gitignore:243-244`), so a root decisions file would be committed and visible to `detect-secrets`/`git ls-files`.
-
-### Q4. How is semantic behavior pinned if a model ships?
-
-- Golden and integration capture with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so no current test pins model-enabled W9704/W9738 outcomes.
-- A model that changes verdicts could pass the entire suite while changing consumer lint behavior. Options: (a) add a deterministic fake-backend golden that exercises the full veto path with `PYTHON_SETUP_LINT_SEMANTIC=1`; (b) add an opt-in real-model golden/contract test marked `slow`/`with_real_api`; (c) keep the model opt-in and document that golden covers only heuristic behavior.
-
-### Q5. Documentation and ADR reconciliation scope
-
-The following are definitively stale at HEAD and should be part of the modernize work:
-
-- `docs/semantic-justification.md:1-62` — entire document describes cross-encoder/reranker, `sentence-transformers`, `PYTHON_SETUP_LINT_RERANKER_MODEL`, `~/.cache/.../results.json`.
-- `docs/custom-checks.md:97` and `:104` — reranker-first description and invalid cache-key tuple.
-- `README.md:29` — `python-setup[semantic]` described as “sentence-transformer-powered”.
-- `docs/troubleshooting.md:97-111` — cross-encoder download-failure section; `:150` says “Expected: 7 pass, ~39s” (actual 9 pass, ~57s).
-- `docs/tutorials.md:12-16` — “optional semantic justification rerunner”.
-- `AGENTS.md:79-85` — cross-encoder pipeline and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `:9-11` test counts stale (1290/4 skip/15 deselected/53 s vs 1357/7 deselected/26.6 s; integration 7 vs 9); Tool Scope table `:20-32` has 13 rows but there are 14 tools (missing `ruff format`; see `runner/_tool_specs.py:12-22`).
-- `docs/adr/ADR-016.md:1-5`, `ADR-014.md:1-5`, `ADR-009.md:29-33`, `ADR-002.md:3-6`, `ADR-011.md:44-49` — claims that no longer match HEAD (backend exists; tracked cache does not; `TestSuppressionRerankerPipeline` no longer exists).
-- `docs/adr/README.md:18-31` — missing ADR-013…ADR-016 entries.
-
-### Q6. Debloat acceptance criteria and “never test linting”
-
-- “Test infra/assumptions first” is already satisfied structurally by `tests/assumptions/`; continue that pattern for any new model/cache work.
-- “Never test linting” is not defined in the repo. The closest precedent is the recent prune of `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` (commit `644774e`). Remaining candidates: `tests/runner/test_real_pipeline_smoke.py` (overlaps integration + fake orchestration), and checker-test helper wrappers that only re-test the harness.
-- Test intent must be preserved: the 115-row heuristic table (`test_semantic_threshold.py:16-21,147-164`) and the W9704 checker behavior tests (`test_suppression_justification_checker.py:29-392`) are behavior contracts, not harness duplication. The duplicate `_RecordingBackend` / `_UvCallRecorder` / `_make_tc` layers are harness duplication.
-- No acceptance metric exists for line-count reduction; the only enforced metrics are `C0302 ≤500`, `R0912 ≤16`, `R0915 ≤65` and the empty baseline (`CodingRules.md:139-159`; `lint.baseline:1`).
-
-### Q7. Pylint-pyi scope (ADR-015)
-
-- ADR-015 explicitly defers the fix to iteration 5 (`docs/adr/ADR-015.md:1-3`). If iteration 5 is this iteration, the architect must either include it or update the ADR with a later target.
-- Current behavior: `_PylintPyiLintTool` discovers `.pyi` paths and passes them to pylint (`dispatch.py:249-277`); the golden contains 43 `pylint-pyi` findings, 42 on `.py` files (`tests/data/golden/minimal_sample_project_findings.json`). Changing this scope will change the golden and possibly `lint.baseline` behavior for consumers.
-
-### Q8. Packaging and test pins that will change with a model extra
-
-- `[semantic]` extra is empty (`pyproject.toml:28-30`; `uv.lock:623`).
-- Tests pin emptiness: `test_semantic_extra_is_empty` and `test_uv_lock_has_no_sentence_transformers_edge` (`tests/checkers/test_decision_backend.py:323-337`).
-- `_OPTIONAL_IMPORT_PATTERNS` is empty with the comment “The [semantic] extra is an empty placeholder” (`no_try_import_checker.py:10-13`), and `test_no_try_import_checker.py:27-35` pins that `sentence_transformers` is no longer optional and that a try/except import is now a violation.
-- If a model is loaded via `importlib` (as the current dotted loader does), the no-try-import rule is bypassed; if it is loaded via `try/except ImportError`, the patterns/test must be updated deliberately.
-- `uv.lock` regeneration for torch/transformers/glide will be large and platform-specific; `semantic` must remain optional so the base dev install stays light.
-
-### Q9. Cache/model test infrastructure to add before implementation
-
-Suggested assumption/contract tests, following `tests/assumptions/` style:
-
-1. Cache file round-trip: sorted `indent=2`/`sort_keys`, no hex ≥20, passes `detect-secrets` (ADR-010:26-28).
-2. Read-only lint: byte-hash the cache before/after an ordinary `run_lint`; assert unchanged (ADR-010:29-30).
-3. Refresh path: refused under `CI`/`GITHUB_ACTIONS`; atomic replace; single-writer behavior (reuse the golden guard pattern, `tests/_golden.py:374-392`).
-4. Prune: entries for missing files and stale `model_id`s disappear; live entries survive.
-5. Backend loading: production ignores `PYTHON_SETUP_LINT_DECISION_BACKEND`; missing optional dependency → `None` → heuristic behavior (`_decision_backend.py:37-46`).
-6. Model determinism: no sampling; batching must not change scores (GLiDE model card warns that concurrent micro-batching can shift probabilities; set `GLIDE_MAX_BATCH=1` when caching scores).
-7. CPU benchmark: `@pytest.mark.slow`, wall time/RSS per justification, following `test_bench_runner_overhead.py:1-14`.
-
----
-
-## 6. High-signal summary for the architect
-
-1. The reranker removal is complete; the backend/cache *interfaces* are half-delivered. The next iteration’s semantic work is: production backend wiring + an actual CPU model (or an explicit deferral) + the tracked decision cache with refresh/prune.
-2. The biggest behavioral risk is enabling a model by default before semantic-on behavior is pinned; golden currently runs with semantic off.
-3. The biggest debloat wins are test-harness duplication (13 `_make_tc` copies, 10 `_walk_and_release` copies, 3 `_RecordingBackend` copies, 2 `_UvCallRecorder` copies, dead helpers, vestigial cache tests, redundant smoke test), not production code.
-4. Docs and ADRs are materially wrong about the semantic subsystem; ADR-016 actively contradicts HEAD and should be superseded/updated first.
-5. Any ADR-009 gate closure needs a corpus/license/CPU-benchmark decision that cannot be inferred from the repository today.`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
-- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
-  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
-  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
-  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
-  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
-  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
-- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
-
-## Item
-epic-kickoff-gate
-
-## Assignment
-{"slug":"epic-kickoff-gate","kind":"fact-finder","title":"Epic kickoff and ownership-dispute gate","assignment":"Root-owned coordination checkpoint (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes, zero git writes). Consume validated-map report (revision map-<HEAD short SHA> + drift list), pylint verdict readability, and merged .secrets.baseline exclusion. Record post-kickoff HEAD; per-epic ownership tables referencing revision; universe file count with 5-owner counts; drift-list row count with corrected file:line per row; AGENTS.md assignments by exact rows with engine wave order (runner-owned if assigned = ## Quick Commands :9-11 + ## Tool Scope adding ruff format row in earlier wave than semantic item; semantic-owned = ### Semantic justification pipeline only; checkers never touches AGENTS.md) plus read-only merge-base rule (semantic base must contain runner merge when runner assigned, else waits); shared-file single-writer table (checkers/_base.py=semantic only, _source_stream.py=checkers new file, no_try_import register line+patterns=semantic, test_suppression class block=semantic rest=checkers, trivial_wrapper peek line preconditioned on runner close-up); docs-row assignments from drift list per decision rule (defaults: runner counts/scope/version/pin, semantic pipeline, root ADR via adr-formalization). Resolve disputes by amended assignment before epic waves scale; gate report shows zero unresolved disputes (each resolved dispute cites amended assignment ref). Covers ADR-011 spawn gate, TD3-A1/TD3-B2.","outlineRef":"epic-kickoff-gate","milestone":"M1","wave":2,"deps":["ownership-map-revalidation","pylint-cache-semantics-closure","secrets-baseline-exclusion"],"scenarioRefs":["M1: Epic kickoff gated on validated artifacts"],"citations":["AGENTS.md:79-85","AGENTS.md:87-93","src/python_setup_lint/checkers/_base.py:142-158","CodingRules.md:90-107"]}
-
-## Prior Attempts & Failures
-Review requested architect input on review
-
-## Current Diff
-
-
-## Review Feedback
-- [ARCHITECT] ADR-011 live gate vs ADR-013 stub conflict: ADR-013:1-3 claims root-serialized delivery replaced epics for I4; if accepted, per-epic tables are ownership evidence not a live spawn gate. Gate correctly kept ADR-011 contract and recorded the conflict. Live-gate vs evidence-only resolution exceeds item scope.
-- [ARCHITECT] Legacy epic handoff unsatisfiable, needs replan: I3 epics never spawned, I4-5 abandoned decomposition per ADR-013/023; retries cannot produce 3 close-ups and plan-5.3 declares no replanAfter gates. Only a replan can retire or re-scope the stranded item; exceeds item scope.
-
-## Context Pack
-# Context Pack — `modernize` (iteration 5 starting state)
-
-**Repository**: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT (`pyproject.toml:19-20`). Worktree `topic/modernize`, HEAD `0944670`.
-
-**Gates verified in this worktree on 2026-11-09** (read-only execution):
-
-| Gate | Result | Evidence |
-|---|---|---|
-| `uv run pytest -q` | 1357 passed, 7 deselected, 4 warnings, 26.6 s | default collection does **not** include `tests/integration.py` (filename is not `test_*.py`) |
-| `uv run pytest tests/integration.py -v` | 9 passed, 56.6 s | run explicitly per AGENTS/README |
-| `uv run lint` | exit 0, all 14 tools PASSED, 57.7 s | `lint.baseline` is `[]` (`lint.baseline:1`) |
-
-**Intent status at a glance**
-
-| Intent clause | State at HEAD | Primary evidence |
-|---|---|---|
-| Enforce `CodingRules.md` / `AGENTS.md` | Mostly done; lint gates green, but docs/ADR drift and some dead placeholders remain | `lint.baseline:1`; `AGENTS.md:9-11`, `AGENTS.md:79-85`; `docs/adr/ADR-016.md:1-5` |
-| Debloat code and tests; keep test intent | Partially done (recent prune removed self-lint/config-consistency tests); concrete duplication and dead helpers remain | §4.4 below; `tests/checkers/test_tmp_path_checker.py:19-32`; `tests/runner/_factories.py:167,200`; `tests/runner/test_real_pipeline_smoke.py:1-42` |
-| Replace embedding/rerank justification check with a CPU-friendly small decision model | **Half done**: reranker is gone and the veto backend protocol exists, but no production model is wired and no optional dependency ships | `src/python_setup_lint/checkers/_semantic.py:1-65`; `src/python_setup_lint/checkers/_decision_backend.py:37-59`; `pyproject.toml:28-30`; `tests/checkers/test_semantic_check.py:119-123` |
-| Keep a git-stored cache with cleanup | **Not implemented**: only a process-local memo exists; no `.python-setup-decisions.json`, refresh path, or pruning | `src/python_setup_lint/checkers/_semantic.py:15-25,47-64`; `tests/assumptions/test_pylint_cache_semantics.py:8-12`; `docs/adr/ADR-010.md:26-36` |
-| Preserve every material lint/check behavior | Green at HEAD; golden pins 158 findings including 18 W9704, but semantic is disabled during golden capture | `tests/data/golden/minimal_sample_project_findings.json`; `tests/integration.py:110-129`; `tests/_golden.py:54` |
-
----
-
-## 1. Module Map
-
-### 1.1 Semantic justification subsystem (primary intent area)
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `src/python_setup_lint/checkers/_decision_backend.py` | `DecisionBackend` protocol, `FakeBackend`, test-only dotted-path loader, `get_backend()`, pinned threshold/prompt constants, warn-once state | `:10-13`, `:16-30`, `:37-59` |
-| `src/python_setup_lint/checkers/_decision_backend.pyi` | Public stub: `DECISION_THRESHOLD`, `PROMPT_VERSION`, protocol, `FakeBackend`, `get_backend` | `:1-20` |
-| `src/python_setup_lint/checkers/_semantic.py` | Thin adapter: resolves backend, computes SHA-256 cache key, applies `>= DECISION_THRESHOLD`, owns in-memory memo | `:1-65` |
-| `src/python_setup_lint/checkers/_semantic.pyi` | Stub documenting the adapter contract | `:1-23` |
-| `src/python_setup_lint/checkers/_base.py` | `normalize_suppressed_codes`, heuristic-first `check_if_meaningful`, env gate, lazy `_semantic` import | `:145-156`, `:159-252` |
-| `src/python_setup_lint/checkers/conformance/suppression_justification_checker.py` | W9704 `unjustified-suppression`: scans suppression comments and `Any` annotations, calls `check_if_meaningful` | `:33-41`, `:63-91`, `:136-162`, `:330-388` |
-| `src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py` | W9738 `bare-except-comment`, second consumer of `check_if_meaningful` | `:14`, `:103-118` |
-| `docs/semantic-justification.md` | Current *stale* narrative of the reranker pipeline and caches | `:1-62` |
-| `docs/custom-checks.md` | Checker-authoring guide; semantic helper description stale | `:97`, `:104` |
-
-### 1.2 Checker subsystem
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `src/python_setup_lint/checkers/conformance/` | Conformance checkers: beartype, no-try-import, tmp-path, structlog, suppression justification, bare-except, missing error-chain, silent-except, generic-key-dict, unnamed-tuple-dict, trivial-wrapper, redundant-type-guard, pyi-underscore, missing-return-annotation, asyncio-timeout | directory listing |
-| `src/python_setup_lint/checkers/stub/` | Stub fidelity/coverage/docstring checkers and annotation normalizer | `checker.py`, `coverage.py`, `docstring_checker.py`, `normalizer.py`, `fidelity/*` |
-| `config/.pylintrc` | Source-code rcfile; enables custom rules and `max-module-lines=500`, `max-statements=65`, `max-branches=16` | `:2`, `:17`, `:19`, `:22-23` |
-| `config/.pylintrc-pyi` | Stub-file rcfile | `:12-13` |
-| `config/.pylintrc-tests` | Test-file ruleset (production-only rules disabled; W9704/W9702 still enabled) | `:20`, `:37`, `:39`, `:42-47` |
-
-### 1.3 Runner subsystem
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `src/python_setup_lint/runner/_tool_specs.py` | Single-source 14 built-in `ToolSpec` entries | `:9-100`, `:102` |
-| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry, command builders, autofix ordering, baseline fallback | `:62-359`, `:350-359` |
-| `src/python_setup_lint/runner/cli.py` | CLI, tool selection, skip reasons, serial pipeline, `run_lint` | `:110-201`, `:204-...`, argument parser `:280-366` |
-| `src/python_setup_lint/runner/baseline.py` | Baseline diff/merge and fallback inspection | module |
-| `src/python_setup_lint/runner/parsers.py`, `_record_parsers.py` | Output parsers (JSON, regex, record parsers) | modules |
-| `src/python_setup_lint/runner/_autofix.py` | Autofix conflict detection and staged/unstaged handling | module |
-| `src/python_setup_lint/runner/_config.py`, `cmd_build.py` | Config discovery and command composition | modules |
-| `src/python_setup_lint/runner/types.py` | `ToolSpec`, `LintResult`, `RunnerConfig`, `ViolationCount` | `:12-22`, `:25-59` |
-
-### 1.4 Setup / packaging / test helpers
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `src/python_setup_lint/setup.py` | `install()` / `main()`: dependency step, pylint plugin registration, config symlinks, state/checksums | `:41-56`, `:149-205`, `:223-290`, `:318-364` |
-| `src/python_setup_lint/_setup_pyproject.py` | TOML read/write, pylint load-plugins, dev-dependency detection (extras stripped) | `:19-97` |
-| `src/python_setup_lint/_setup_precommit.py` | Pre-commit config and AGENTS snippet generation/atomic writes | `:70-...` |
-| `src/python_setup_lint/_setup_update.py` | Drift detection + `uv add --refresh-package` update flow | `:11-...` |
-| `src/python_setup_lint/testing.py` | Shared `_make_tc` / `_walk_and_release`, lint-runner fakes, consumer health checks | `:18-38`, `:44-103`, `:115-196` |
-| `pyproject.toml` | Package metadata, empty `[semantic]` extra, pytest markers (`not slow` default) | `:1-4`, `:28-30`, `:47-54` |
-| `uv.lock` | Locked dependencies; root provides `semantic` extra, currently empty | `:573-623` |
-| `.gitignore` | Generated consumer artifacts; legacy semantic model cache ignored | `:222-244` |
-
-### 1.5 Documentation / decision register
-
-| Path | Responsibility | Key lines / state |
-|---|---|---|
-| `CodingRules.md` | Shipped coding rules: typing, `.pyi`, simplification, complexity, tests | `:1-75`, `:90-159`, `:230-307` |
-| `AGENTS.md` | Agent entry point: commands, tool scope, pipeline, test strategy | `:5-14`, `:16-32`, `:79-93` |
-| `docs/adr/README.md` | ADR index — **omits ADR-013…ADR-016** | `:16-31` |
-| `docs/adr/ADR-009.md` | Accepted no-go-gated deferral for the model | `:1-48` |
-| `docs/adr/ADR-010.md` | Frozen backend + tracked-cache contracts | `:1-52` |
-| `docs/adr/ADR-014.md` | Heuristic-first veto semantics (now implemented; text stale) | `:1-5` |
-| `docs/adr/ADR-015.md` | Pylint-pyi scope fix deferred to iteration 5 | `:1-3` |
-| `docs/adr/ADR-016.md` | Iteration-4 infrastructure-only scope — **claims no backend/cache/FakeBackend exists, contradicted by HEAD** | `:1-5` |
-| `design/0001`, `design/0002` | Config composers; ty src-only exception | files |
-| `README.md`, `docs/tutorials.md`, `docs/troubleshooting.md` | Consumer docs; semantic sections stale | `README.md:29,105`; `tutorials.md:12-16`; `troubleshooting.md:97-111,150` |
-
-### 1.6 Test subsystems
-
-| Path | Responsibility | Key lines |
-|---|---|---|
-| `tests/checkers/` | Per-checker behavioral tests over real pylint `CheckerTestCase`; `_factories_*` data modules | 45 `.py` files incl. helpers |
-| `tests/runner/` | Runner unit/integration tests, autofix, parsers, setup, benchmarks | 30 `.py` files |
-| `tests/assumptions/` | Third-party contract pins (astroid, beartype, pylint, pylint cache semantics) | `test_pylint_cache_semantics.py:1-39` |
-| `tests/_golden.py` | Golden snapshot normalization/serialization/assertions + CI-guarded rewrite | `:1-11`, `:53-58`, `:374-392` |
-| `tests/test_golden.py` | Synthetic unit tests for golden helpers | `:1-6` |
-| `tests/integration.py` | Fit-for-purpose end-to-end gate on planted sample project | `:1-145` |
-| `tests/data/minimal_sample_project/` | Planted-violation fixture project (W9704 brush-off vs carry-from) | `src/minimal_sample/mod.py:41-56`, `violations.txt` |
-| `tests/data/golden/minimal_sample_project_findings.json` | 158 normalized findings; 18 `unjustified-suppression`, 2 `bare-except-comment` | golden file |
-
----
-
-## 2. Key Interfaces & Signatures
-
-### 2.1 Decision backend (`src/python_setup_lint/checkers/_decision_backend.py`)
-
-```python
-DECISION_THRESHOLD: float = 0.5          # :10
-PROMPT_VERSION: str = "prompt-v1"        # :11
-
-@runtime_checkable
-class DecisionBackend(Protocol):          # :16-20
-    model_id: str
-    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
-
-class FakeBackend:                        # :23-30
-    model_id: str = "fake-backend rev test prompt-v1"
-    def __init__(self, score: float = 1.0) -> None: ...
-    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
-
-def get_backend() -> DecisionBackend | None: ...   # :49-59
-```
-
-Behavior of `get_backend()` at HEAD:
-
-- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored **only** when `PYTEST_CURRENT_TEST` is set, then imports an arbitrary `module:attribute` factory (`_decision_backend.py:37-46`).
-- `PYTHON_SETUP_LINT_RERANKER_MODEL` emits a one-time deprecation warning (`:51-53`).
-- `PYTHON_SETUP_LINT_DECISION_MODEL` is read but only emits a one-time `decision_model_unavailable` warning; it never constructs a backend (`:55-58`).
-- Production default is therefore always `None` → heuristic-only behavior.
-
-### 2.2 Semantic adapter (`src/python_setup_lint/checkers/_semantic.py`)
-
-```python
-_RESULT_CACHE: dict[int, bool] | None = None     # :16
-
-def _reset_cache() -> None: ...                  # :19-25 (test helper, not in .pyi)
-
-@beartype
-def semantic_check_if_meaningful(                # :28-65
-    text: str,
-    *,
-    rule: str | None = None,
-    code_context: str | None = None,
-    comment: str | None = None,
-    backend: DecisionBackend | None = None,
-) -> bool | None: ...
-```
-
-Contract: `primary = (comment or text).strip()`; empty → `False`; no backend → `None`; otherwise `decide(primary, rule, code_context) >= 0.5`; result memoized in `_RESULT_CACHE` keyed by the first 8 bytes of SHA-256 over `(primary, rule, code_context, model_id)` (`:37-64`).
-
-### 2.3 Heuristic-first gate (`src/python_setup_lint/checkers/_base.py`)
-
-```python
-def normalize_suppressed_codes(raw: str) -> str: ...   # :148-156
-
-def check_if_meaningful(                               # :159-252
-    text: str,
-    *,
-    rule: str | None = None,
-    code_context: str | None = None,
-    comment: str | None = None,
-    backend: DecisionBackend | None = None,
-) -> bool: ...
-```
-
-Order is strict:
-
-1. Normalize directive text and strip echoed codes (`:168`, `:145-156`).
-2. Reject `<5` chars, boilerplate tokens, multi-word brush-offs, and rule-symbol-only reasons (`:169-246`).
-3. If `PYTHON_SETUP_LINT_SEMANTIC != "1"` → return `True` (`:248-249`).
-4. Lazily import `_semantic` and return `semantic_check_if_meaningful(...) is not False` (`:250-252`).
-
-Consequence: the backend can **only veto** a heuristic-meaningful justification; it can never resurrect a heuristic rejection. `None` (no backend) maps to `True`.
-
-### 2.4 W9704 consumer (`suppression_justification_checker.py`)
-
-```python
-msgs = _msgs(W9704=MessageDef(
-    message="Suppression comment without technical justification: %s",
-    symbol="unjustified-suppression", ...))              # :33-41
-
-# module-level scan of raw source lines
-self._legacy_scan(node, lines)                            # :63-91
-
-# Any annotation path
-self._emit_if_unjustified(annotation, lineno)             # :136-162
-
-# trailing/preceding reason validation
-self._has_justification(lines, idx)                       # :330-388
-```
-
-Both paths call `check_if_meaningful(reason, comment=reason, rule="unjustified-suppression", code_context=<code before #>)` (`:152-155`, `:372-375`, `:383-386`). The checker knows the file path via `node.root().file` (`_base.py:68-75`) but does not pass it to the semantic API.
-
-### 2.5 Runner / test helpers
-
-- `ToolSpec` and `RunnerConfig` (`runner/types.py:12-22`, `:49-59`); `TOOLS` list (`runner/_tool_specs.py:9-100`); `run_lint(...)` (`runner/cli.py:204-...`).
-- `_make_tc(checker_class)` and `_walk_and_release(code, checker_class, *, file_path, module_name)` (`testing.py:18-38`) are the intended shared checker-test harness.
-- Golden contract: `Finding = {tool,file,line,col,rule}`, multiset diff, `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` opt-in, refused under `CI`/`GITHUB_ACTIONS` (`tests/_golden.py:1-11`, `:53-58`, `:374-392`).
-
----
-
-## 3. Relevant Excerpts
-
-### 3.1 Full current semantic adapter
-
-`src/python_setup_lint/checkers/_semantic.py:15-65`:
-
-```python
-_RESULT_CACHE: dict[int, bool] | None = None
-
-def _reset_cache() -> None:
-    global _RESULT_CACHE
-    _RESULT_CACHE = None
-
-@beartype
-def semantic_check_if_meaningful(...) -> bool | None:
-    primary = (comment or text).strip()
-    global _RESULT_CACHE
-    if _RESULT_CACHE is None:
-        _RESULT_CACHE = {}
-    if not primary:
-        return False
-    resolved = backend if backend is not None else _decision_backend.get_backend()
-    if resolved is None:
-        return None
-    cache_key = hashlib.sha256("|".join(str(x) for x in (
-        primary, rule, code_context, resolved.model_id)).encode()).digest()
-    cache_key_int = int.from_bytes(cache_key[:8], "big")
-    if cache_key_int in _RESULT_CACHE:
-        return _RESULT_CACHE[cache_key_int]
-    result = resolved.decide(primary, rule, code_context) >= _decision_backend.DECISION_THRESHOLD
-    _RESULT_CACHE[cache_key_int] = result
-    return result
-```
-
-Observations for the architect:
-
-- The memo is process-local only; nothing is persisted.
-- The key truncates SHA-256 to 64 bits (`:59`) — the same truncation ADR-003 criticized in the retired on-disk cache (`docs/adr/ADR-003.md:7`).
-- `comment` is folded into `primary`, so the key does not separately include it; docs claim `(text, rule, code_context, comment, model)` (`docs/custom-checks.md:97`).
-- `code_context` participates in the key, so any source-line edit invalidates an entry even if the justification is unchanged.
-- `model_id` participates, so a model/prompt swap invalidates entries — but `PROMPT_VERSION` is not currently folded into `model_id` by production code.
-
-### 3.2 Heuristic gate and env behavior
-
-`src/python_setup_lint/checkers/_base.py:248-252`:
-
-```python
-if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") != "1":
-    return True
-from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
-
-return _semantic_check(primary, rule=rule, code_context=code_context, comment=primary, backend=backend) is not False
-```
-
-- Semantic is **on by default**; absence of a backend yields heuristic behavior because `_semantic` returns `None`.
-- The lazy import means `_semantic` is never imported when `PYTHON_SETUP_LINT_SEMANTIC=0` (`docs/semantic-justification.md:18`, verified by tests).
-- The same gate governs W9738 `bare-except-comment` (`bare_except_comment_checker.py:103-118`).
-
-### 3.3 W9704 justification resolution
-
-`suppression_justification_checker.py:350-388`:
-
-```python
-_suppression_patterns = (_PAT_PYLINT_DISABLE, _PAT_NOQA, _PAT_TYPE_IGNORE, _PAT_TY_IGNORE)
-for pat in _suppression_patterns:
-    for m in pat.finditer(line):
-        after = line[m.end():]
-        ...  # only search before the next suppression pattern
-        tm = _PAT_TRAILING_REASON.search(search_after)
-        if tm:
-            reason = tm.group(1)
-            if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
-                                   code_context=line.split("#", 1)[0].strip()):
-                return True
-
-if idx > 0:
-    pm = _PAT_PRECEDING_COMMENT.match(prev)
-    if pm:
-        reason = pm.group(1)
-        if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
-                               code_context=lines[idx].split("#", 1)[0].strip()):
-            return True
-return False
-```
-
-A tracked cache keyed by file path would need this caller to supply file identity; today it does not.
-
-### 3.4 Packaging and pytest configuration
-
-`pyproject.toml:28-30`:
-
-```toml
-[project.optional-dependencies]
-# Empty placeholder: no model dependency ships in iteration 4 (ADR-016).
-semantic = []
-```
-
-`pyproject.toml:47-54`:
-
-```toml
-[tool.pytest.ini_options]
-addopts = "-m 'not slow'"
-markers = [
-  "slow: ...full pipeline runs...",
-  "no_external_api: ...",
-  "with_real_api: ...",
-  "implementation_detail: ...",
-]
-```
-
-`uv.lock:623` likewise reports `provides-extras = ["semantic"]` with no dependencies.
-
-### 3.5 Cache-related ignore and secrets constraints
-
-- `.gitignore:243-244` still names the retired machine cache: `# NLP semantic model cache (sentence-transformers)` / `.cache/python-setup/semantic/`.
-- `.secrets.baseline` enables `HexHighEntropyString` with `limit: 3.0`, so a committed result cache must not contain raw long hex digests; ADR-010 already requires “no bare hex strings of length >= 20” (`docs/adr/ADR-010.md:26-28`).
-- ADR-011 says the tracked decisions file is consumer-runtime data, is committed, and gets **no** hatch/wheel entry (`docs/adr/ADR-011.md:54-60`).
-
-### 3.6 ADR state (decisions vs implementation)
-
-- `docs/adr/ADR-009.md:5` — accepted deferral; `:9-13` documents the 215-meaningful / 0-meaningless corpus no-go; `:23-27` requires a double-rated sample and a human Fastino license decision; `:35-37` requires a CPU benchmark and forbids claiming the swap complete.
-- `docs/adr/ADR-009.md:29-33` claims iteration 3 delivers “Heuristic-first `DecisionBackend` plus tracked-cache infrastructure” — the backend half exists; the tracked-cache half does not.
-- `docs/adr/ADR-010.md:23-36` freezes: backend protocol, `.python-setup-decisions.json` at the linted project root, sorted `indent=2`/`sort_keys` JSON array, no hex≥20, read-only lint with a hash-asserted zero-write check, explicit CI-guarded refresh (lockfile + merge + atomic replace), pruning of missing files/stale model IDs, and writer-first concurrency from the pylint verdict.
-- `docs/adr/ADR-010.md:38-41` and `_decision_backend.py:37-46` pin the dotted-path loader as test-only.
-- `docs/adr/ADR-014.md:1-5` claims current code is semantic-first with heuristic fallback; HEAD is heuristic-first (`_base.py:248-252`; `_decision_backend.py:16-20`), so the record is stale.
-- `docs/adr/ADR-016.md:1-5` claims “At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled.” All three claims are false at HEAD: `_decision_backend.py` exists, `pyproject.toml:28-30` is empty, and tests pin the absence of `sentence_transformers` (`tests/checkers/test_semantic_check.py:119-123`, `tests/checkers/test_decision_backend.py:329-337`).
-- `docs/adr/ADR-015.md:1-3` is an open iteration-5 deferral: `_PylintPyiLintTool` passes `.pyi` paths but pylint lints companion `.py` (42 of 43 `pylint-pyi` golden findings are on `.py` files); probe found 205 latent private stub symbols; fixing changes the golden.
-- `docs/adr/README.md:18-31` indexes only ADR-001…ADR-012; ADR-013…ADR-016 are absent.
-
----
-
-## 4. Existing Tests & Conventions
-
-### 4.1 Layout and style
-
-- Unit tests: `tests/checkers/`, `tests/runner/`, `tests/test_golden.py`, `tests/test_setup_*`; 85 test modules, 794 test functions before parametrization, 19,627 lines total (`tests/`).
-- Naming convention `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`).
-- Markers: `slow` (excluded by default via `addopts = "-m 'not slow'"`), `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:47-54`).
-- Mocking policy: mock only external boundaries; first-party code always real (`CodingRules.md:240-252`). Checker tests therefore instantiate real `BaseChecker` subclasses through `CheckerTestCase`.
-- Shared fixtures live in `tests/conftest.py` (`:40-169`): `empty_project`, session-scoped `configured_project`, `runner_config_factory`, `isolated_runner_registries`, `sample_project`.
-- Test factories for complex checker inputs are split by domain to respect the 500-line C0302 limit (`tests/checkers/_factories.py:1-16`; `_factories_stub*.py`).
-
-### 4.2 Semantic/backend tests (current contract)
-
-| File | Coverage | Key lines |
-|---|---|---|
-| `tests/checkers/test_decision_backend.py` | Pinned constants, FakeBackend, loader gating, heuristic-first veto, normalization, packaging pins | `:1-6`, `:83-165`, `:181-264`, `:320-337` |
-| `tests/checkers/test_semantic_check.py` | Adapter signature, empty-primary, `None` mapping, 0.5 threshold matrix, memo per unique pair/model, no `sentence_transformers`, no disk cache | `:47-133` |
-| `tests/checkers/test_semantic_threshold.py` | 115-row heuristic table, semantic disabled | `:16-21`, `:147-164` |
-| `tests/assumptions/test_pylint_cache_semantics.py` | Read-only behavior, in-process memo, path-free semantic API, `jobs=1` single-writer verdict, sequential pylint invocation | `:1-39`, `:94-181`, `:225-355` |
-| `tests/checkers/test_suppression_justification_checker.py` | W9704 checker behavior; semantic disabled via fixture | `:19-30`, `:367-392` |
-| `tests/checkers/test_bare_except_comment_checker.py` | W9738 checker behavior; semantic disabled via fixture | `:18-43` |
-
-Important: no test exercises a real model. Every backend is a test double (`test_decision_backend.py:1-6`). The current test suite actively pins the **absence** of a model dependency (`test_semantic_extra_is_empty`, `test_uv_lock_has_no_sentence_transformers_edge` at `:323-337`; `test_no_try_import_checker.py:27-35`; `_OPTIONAL_IMPORT_PATTERNS` empty at `no_try_import_checker.py:10-13`). Any model wiring must update these pins deliberately.
-
-### 4.3 Behavior-preservation gates
-
-- Golden snapshot: 158 findings across all 14 tools; per-tool minimums; multiset comparison catches duplicates/moved lines/new false positives (`tests/_golden.py:1-11`; `tests/data/golden/minimal_sample_project_findings.json`).
-- 18 `unjustified-suppression` findings (6 each for `pylint`, `pylint-pyi`, `pylint tests`) and 2 `bare-except-comment` findings.
-- Golden capture runs with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so semantic-enabled behavior is **not** covered by the golden.
-- Integration also asserts brush-off W9704 at `mod.py:49` and no W9704 for carry-from at `mod.py:56` (`tests/integration.py:124-129`; fixture `tests/data/minimal_sample_project/src/minimal_sample/mod.py:49,56`).
-- `lint.baseline` is empty, so self-lint fails on any new violation (`lint.baseline:1`).
-
-### 4.4 Debloat evidence (measured at HEAD)
-
-**Duplicated checker-test harness:**
-
-- `_make_tc` local wrapper exists in 13 test files; `_walk_and_release` in 10; `_msg_ids` in 8. The shared implementations already exist in `testing.py:18-38`.
-- Examples: `tests/checkers/test_tmp_path_checker.py:19-32` (calls `tc.checker.open()`), `tests/checkers/test_missing_error_chain_checker.py:16-32` (does not call `open()`), `tests/checkers/test_suppression_justification_checker.py:19-20` (imports the shared helper but still defines `_msg_ids`).
-- The wrappers are not byte-identical: some call `checker.open()` (SourceRootMixin checkers) and some pass `module_name`. A shared helper needs an `open_checker`/`module_name` option rather than naive deletion.
-
-**Duplicated semantic test double:**
-
-- `_RecordingBackend` appears three times: `tests/checkers/test_decision_backend.py:44-55`, `tests/checkers/test_semantic_check.py:25-36`, `tests/assumptions/test_pylint_cache_semantics.py:80-91`.
-
-**Duplicated runner/setup helpers:**
-
-- `_UvCallRecorder` appears twice: `tests/runner/test_setup.py:39-60` and `tests/runner/test_setup_install.py:36-58`.
-- `extra_block` appears twice: `tests/runner/_factories.py:174-176` and `tests/runner/_factories_extras.py:45-47`.
-- `_semantic_disabled` fixture appears twice: `tests/checkers/test_bare_except_comment_checker.py:37-40` and `tests/checkers/test_suppression_justification_checker.py:23-26`.
-
-**Dead/vestigial test code:**
-
-- `assert_violation_contains_any` (`tests/runner/_factories.py:167-171`), `assert_r4_reason` (`:200-206`), and `baseline_entry_for_tool` (`tests/runner/_factories_baseline.py:26-28`) have no call sites.
-- `sample_project` fixture (`tests/conftest.py:166-169`) has no call sites.
-- `test_check_writes_no_disk_cache` monkeypatches `_CACHE_DIR`/`_RESULT_CACHE_FILE`, attributes that no longer exist, with `raising=False` (`tests/checkers/test_semantic_check.py:126-133`).
-- The `semantic_disk` fixture does the same for `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RESULT_CACHE` (`tests/assumptions/test_pylint_cache_semantics.py:94-106`). These assert the absence of a retired implementation rather than a live contract.
-- `tests/runner/test_real_pipeline_smoke.py:1-42` runs the full pipeline and asserts only an int return plus all 14 section markers; this overlaps `tests/integration.py:57-145` and the fake-driven all-tools assertion in `tests/runner/test_lint_runner_integration.py:230-248`.
-- Recent prune precedent: commit `644774e` deleted `test_config_consistency.py`, `test_self_lint_clean.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` and trimmed `test_autofix_conflict_integration.py` — the “never test linting” direction is already established.
-
-**Source-side dead/placeholder code:**
-
-- `PROMPT_VERSION` (`_decision_backend.py:11`) is unused in production; only tests assert it (`test_decision_backend.py:87-88`).
-- `PYTHON_SETUP_LINT_DECISION_MODEL` is read only to warn that no model exists (`_decision_backend.py:55-58`; test `:141-151`).
-- `_semantic.py` needs two `global` statements and a nullable memo solely for lazy initialization (`:16,24,39-41`); a module-level dict + `.clear()` would remove both.
-- `_base.check_if_meaningful` rebuilds the 46-token boilerplate set and 20-phrase set on every call (`:172-241`); module-level `frozenset`s would preserve behavior and cut per-call work.
-- `_PylintPyiLintTool` and `_PylintTestsLintTool` duplicate “explicit override then auto-discovery” rcfile resolution (`dispatch.py:249-277` vs `:280-309`), while `_PylintLintTool` uses `_resolve_pylintrc` (`:201-246`).
-- `src/python_setup_lint/checkers/__init__.py` has only the license header and no module docstring (unlike `runner/__init__.py` and `conformance/__init__.py`).
-- `docs/adr/ADR-016.md` and `ADR-014.md` are stale; the ADR index omits 013-016 (`docs/adr/README.md:18-31`).
-- `pyproject.toml:3` says 1.2.10 while `CHANGELOG.md:3` tops out at v1.2.9 (minor release-doc drift).
-
-### 4.5 Test-infrastructure conventions to extend first
-
-The intent says “test infra/assumptions first.” The existing template is `tests/assumptions/`:
-
-- Each module opens with the observed third-party version and the contract being pinned (`test_pylint_cache_semantics.py:1-39`, `test_astroid_contracts.py:1-7`, `test_beartype_contracts.py:1-11`, `test_pylint_contracts.py:1-6`).
-- `pytestmark = pytest.mark.no_external_api` on every assumption module.
-- Tests are behavioral and assert observed consequences, not implementation internals; failures are meant to trigger re-derivation before loosening.
-- For the cache writer, `TestPylintRcfileJobsWatchdog` and `TestPylintInvocationConcurrency` already pin `jobs=1`, sequential dispatch, and the absence of `concurrent`/`multiprocessing` imports in the runner (`:225-355`). This is the writer-first verdict ADR-010 requires.
-- For benchmarks, `tests/runner/test_bench_runner_overhead.py:1-14` shows the convention: `@pytest.mark.slow`, real subprocesses, measured wall time/RSS, artifact written under `tmp_path`.
-
----
-
-## 5. Open Questions & Uncertainties
-
-### Q1. Which model satisfies the intent, and can the ADR-009 gate be closed now?
-
-- The intent names `fastino/GLiDE-0.4B` or smaller. External facts: GLiDE-0.4B is a 0.40B-parameter encoder, 0.81 GB bf16 weights, tested on an RTX PRO 6000, requires `torch==2.14.0` (CUDA 13.0 wheels) and `transformers==5.17.0`; its `glide/` inference package lives in the HF repo, not as a normal PyPI dependency ([model card](https://huggingface.co/fastino/GLiDE-0.4B)).
-- The GLiDE collection’s smallest member is 0.4B (others: 0.8B, 2B, 9B, 27B) ([collection](https://huggingface.co/collections/fastino/glide)), so “or smaller” requires a different model family.
-- License is the Fastino Community License: free use, but production commercial use by an entity with annual revenue > $10M requires a separate written agreement; any commercial use requires “Built with Fastino GLiDE” attribution; derivative works must be distributed under the same license ([LICENSE](https://huggingface.co/fastino/GLiDE-0.4B/blob/main/LICENSE)). The project itself is MIT (`pyproject.toml:19-20`).
-- ADR-009’s corpus gate remains untouched: 215 meaningful / 0 meaningless labels, all single-author (`docs/adr/ADR-009.md:9-13`). No corpus artifacts exist in the repository (only `tests/data/golden/` and `tests/data/minimal_sample_project/`).
-- No CPU benchmark exists; ADR-016 explicitly lists “no CPU bench” as open (`docs/adr/ADR-016.md:3`).
-- Decision framing: (a) spike GLiDE CPU latency and packaging, then implement an optional backend; (b) choose a smaller permissively licensed zero-shot/classifier model, which still needs evaluation data; or (c) keep heuristic-only behavior and record another explicit deferral. Option (c) conflicts with the literal intent unless the operator accepts the ADR-009 gate again.
-
-### Q2. How should a production backend be wired, and should it be default-on?
-
-- `get_backend()` currently has no production model path; it returns a test-only dotted-path backend or `None` (`_decision_backend.py:37-59`). ADR-010 says a compliant model “plugs in through `get_backend()` plus `DECISION_MODEL` with no pipeline refactor” (`docs/adr/ADR-010.md:47-48`), but no loader code exists for that env var.
-- `PYTHON_SETUP_LINT_DECISION_MODEL` is parsed but never used (`_decision_backend.py:55-58`), and `PROMPT_VERSION` is dead (`:11`).
-- The present veto semantics mean a backend can only make lint stricter (`_base.py:248-252`; tests `test_decision_backend.py:181-229`). Default-on would change W9704/W9738 outcomes for every consumer that installs the extra; default-off would preserve behavior but make the feature opt-in.
-- The architect must also decide failure semantics: missing extra, model download failure, OOM, CPU timeout, and malformed model output all currently collapse to `None` → heuristic pass. Is that acceptable for a tool advertised as validating suppressions?
-
-### Q3. Git-stored decision cache: schema, keying, and the path-free API tension
-
-ADR-010 freezes the contract (`docs/adr/ADR-010.md:26-36`) but the repository documents no schema or key encoding beyond “JSON array sorted, indent=2, sort_keys, no bare hex ≥20.” Open decisions:
-
-- **File identity vs path-free API**: pruning requires file paths in cache entries (ADR-010:33), but `semantic_check_if_meaningful` is deliberately path-free (`tests/assumptions/test_pylint_cache_semantics.py:171-181`) and its callers (`suppression_justification_checker.py:152-155,372-386`; `bare_except_comment_checker.py:103-118`) do not pass a path. Options: extend the checker→semantic call with a file path, add a separate cache API at the checker layer, or key by content and prune by scanning the repo. Each has test/behavior implications.
-- **Key composition**: current memo includes `(primary, rule, code_context, model_id)` and truncates to 64 bits (`_semantic.py:47-64`). A tracked cache should likely key on file path + normalized justification + rule + model/prompt version; whether `code_context` belongs in the key determines churn vs sensitivity.
-- **Score vs verdict**: storing a boolean loses the ability to re-threshold; storing a float lets `DECISION_THRESHOLD` changes apply without re-running the model, but requires calibrating model output to `[0,1]` (the protocol promises this, but does not enforce it; `_decision_backend.py:16-20`).
-- **Refresh command**: there is no CLI surface today (`runner/cli.py:280-366` lists all args; none refresh decisions). ADR-010 requires an explicit CI-guarded refresh path with lockfile + merge + atomic replace. The golden-update guard pattern (`tests/_golden.py:374-392`: refuse under `CI`/`GITHUB_ACTIONS`) is a reusable precedent.
-- **Read-only lint**: ordinary lint must not mutate the cache; a hash-before/hash-after test is required. Current tests only prove the retired path is absent (`test_pylint_cache_semantics.py:112-168`; `test_semantic_check.py:126-133`).
-- **Secrets scan**: `.secrets.baseline` enables `HexHighEntropyString` (limit 3.0), so long hex keys in a committed cache will fail `detect-secrets`. ADR-010’s “no bare hex strings” constraint is not just stylistic.
-- **Writer concurrency**: the verdict says no lock/merge is needed while pylint `jobs=1` (`test_pylint_cache_semantics.py:14-38`, `:225-355`); a consumer rcfile with `jobs>1` voids the claim. If refresh is a separate process rather than pylint, that assumption must be restated.
-- **Location**: `.python-setup-decisions.json` at the linted project root (ADR-010:26); `.gitignore` currently ignores only `.cache/python-setup/semantic/` (`.gitignore:243-244`), so a root decisions file would be committed and visible to `detect-secrets`/`git ls-files`.
-
-### Q4. How is semantic behavior pinned if a model ships?
-
-- Golden and integration capture with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so no current test pins model-enabled W9704/W9738 outcomes.
-- A model that changes verdicts could pass the entire suite while changing consumer lint behavior. Options: (a) add a deterministic fake-backend golden that exercises the full veto path with `PYTHON_SETUP_LINT_SEMANTIC=1`; (b) add an opt-in real-model golden/contract test marked `slow`/`with_real_api`; (c) keep the model opt-in and document that golden covers only heuristic behavior.
-
-### Q5. Documentation and ADR reconciliation scope
-
-The following are definitively stale at HEAD and should be part of the modernize work:
-
-- `docs/semantic-justification.md:1-62` — entire document describes cross-encoder/reranker, `sentence-transformers`, `PYTHON_SETUP_LINT_RERANKER_MODEL`, `~/.cache/.../results.json`.
-- `docs/custom-checks.md:97` and `:104` — reranker-first description and invalid cache-key tuple.
-- `README.md:29` — `python-setup[semantic]` described as “sentence-transformer-powered”.
-- `docs/troubleshooting.md:97-111` — cross-encoder download-failure section; `:150` says “Expected: 7 pass, ~39s” (actual 9 pass, ~57s).
-- `docs/tutorials.md:12-16` — “optional semantic justification rerunner”.
-- `AGENTS.md:79-85` — cross-encoder pipeline and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `:9-11` test counts stale (1290/4 skip/15 deselected/53 s vs 1357/7 deselected/26.6 s; integration 7 vs 9); Tool Scope table `:20-32` has 13 rows but there are 14 tools (missing `ruff format`; see `runner/_tool_specs.py:12-22`).
-- `docs/adr/ADR-016.md:1-5`, `ADR-014.md:1-5`, `ADR-009.md:29-33`, `ADR-002.md:3-6`, `ADR-011.md:44-49` — claims that no longer match HEAD (backend exists; tracked cache does not; `TestSuppressionRerankerPipeline` no longer exists).
-- `docs/adr/README.md:18-31` — missing ADR-013…ADR-016 entries.
-
-### Q6. Debloat acceptance criteria and “never test linting”
-
-- “Test infra/assumptions first” is already satisfied structurally by `tests/assumptions/`; continue that pattern for any new model/cache work.
-- “Never test linting” is not defined in the repo. The closest precedent is the recent prune of `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` (commit `644774e`). Remaining candidates: `tests/runner/test_real_pipeline_smoke.py` (overlaps integration + fake orchestration), and checker-test helper wrappers that only re-test the harness.
-- Test intent must be preserved: the 115-row heuristic table (`test_semantic_threshold.py:16-21,147-164`) and the W9704 checker behavior tests (`test_suppression_justification_checker.py:29-392`) are behavior contracts, not harness duplication. The duplicate `_RecordingBackend` / `_UvCallRecorder` / `_make_tc` layers are harness duplication.
-- No acceptance metric exists for line-count reduction; the only enforced metrics are `C0302 ≤500`, `R0912 ≤16`, `R0915 ≤65` and the empty baseline (`CodingRules.md:139-159`; `lint.baseline:1`).
-
-### Q7. Pylint-pyi scope (ADR-015)
-
-- ADR-015 explicitly defers the fix to iteration 5 (`docs/adr/ADR-015.md:1-3`). If iteration 5 is this iteration, the architect must either include it or update the ADR with a later target.
-- Current behavior: `_PylintPyiLintTool` discovers `.pyi` paths and passes them to pylint (`dispatch.py:249-277`); the golden contains 43 `pylint-pyi` findings, 42 on `.py` files (`tests/data/golden/minimal_sample_project_findings.json`). Changing this scope will change the golden and possibly `lint.baseline` behavior for consumers.
-
-### Q8. Packaging and test pins that will change with a model extra
-
-- `[semantic]` extra is empty (`pyproject.toml:28-30`; `uv.lock:623`).
-- Tests pin emptiness: `test_semantic_extra_is_empty` and `test_uv_lock_has_no_sentence_transformers_edge` (`tests/checkers/test_decision_backend.py:323-337`).
-- `_OPTIONAL_IMPORT_PATTERNS` is empty with the comment “The [semantic] extra is an empty placeholder” (`no_try_import_checker.py:10-13`), and `test_no_try_import_checker.py:27-35` pins that `sentence_transformers` is no longer optional and that a try/except import is now a violation.
-- If a model is loaded via `importlib` (as the current dotted loader does), the no-try-import rule is bypassed; if it is loaded via `try/except ImportError`, the patterns/test must be updated deliberately.
-- `uv.lock` regeneration for torch/transformers/glide will be large and platform-specific; `semantic` must remain optional so the base dev install stays light.
-
-### Q9. Cache/model test infrastructure to add before implementation
-
-Suggested assumption/contract tests, following `tests/assumptions/` style:
-
-1. Cache file round-trip: sorted `indent=2`/`sort_keys`, no hex ≥20, passes `detect-secrets` (ADR-010:26-28).
-2. Read-only lint: byte-hash the cache before/after an ordinary `run_lint`; assert unchanged (ADR-010:29-30).
-3. Refresh path: refused under `CI`/`GITHUB_ACTIONS`; atomic replace; single-writer behavior (reuse the golden guard pattern, `tests/_golden.py:374-392`).
-4. Prune: entries for missing files and stale `model_id`s disappear; live entries survive.
-5. Backend loading: production ignores `PYTHON_SETUP_LINT_DECISION_BACKEND`; missing optional dependency → `None` → heuristic behavior (`_decision_backend.py:37-46`).
-6. Model determinism: no sampling; batching must not change scores (GLiDE model card warns that concurrent micro-batching can shift probabilities; set `GLIDE_MAX_BATCH=1` when caching scores).
-7. CPU benchmark: `@pytest.mark.slow`, wall time/RSS per justification, following `test_bench_runner_overhead.py:1-14`.
-
----
-
-## 6. High-signal summary for the architect
-
-1. The reranker removal is complete; the backend/cache *interfaces* are half-delivered. The next iteration’s semantic work is: production backend wiring + an actual CPU model (or an explicit deferral) + the tracked decision cache with refresh/prune.
-2. The biggest behavioral risk is enabling a model by default before semantic-on behavior is pinned; golden currently runs with semantic off.
-3. The biggest debloat wins are test-harness duplication (13 `_make_tc` copies, 10 `_walk_and_release` copies, 3 `_RecordingBackend` copies, 2 `_UvCallRecorder` copies, dead helpers, vestigial cache tests, redundant smoke test), not production code.
-4. Docs and ADRs are materially wrong about the semantic subsystem; ADR-016 actively contradicts HEAD and should be superseded/updated first.
-5. Any ADR-009 gate closure needs a corpus/license/CPU-benchmark decision that cannot be inferred from the repository today.
-
-## Human involvement
-# Human involvement criteria
-
-Mode selects which ADR and concern decisions need a human decision. Everything
-else is either autonomous or digest-only; never block on items the table marks
-remarkable.
-
-## Blocking table (ADRs and concerns)
-
-| Mode | Blocking (needs human decision) | Remarkable (digest only) |
-| --- | --- | --- |
-| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
-| principal | stack/layer, external interfaces, config shapes | internal choices |
-| detailed | external-interface changes and major internal interfaces | minor internals |
-
-## autonomous
-
-Block only explicit high-severity ADRs/concerns that remain after all unblocked
-work is finished. Do not stop for internal choices; record them as remarkable.
-
-## Open Concerns
-- id: c-4743ca3658
-  kind: assumption
-  severity: low
-  summary: Index entries for the 13 conflicted paths remain unmerged because git write commands are forbidden in this step
-  status: routed
-  disposition: architect
-- id: c-3e935debcb
-  kind: risk
-  severity: low
-  summary: PoC lock is POSIX-only fcntl.flock
-  affects:
-    - cache-design-spike
-    - decision-cache-impl
-  status: routed
-  disposition: optional
-
-
-- Raise concerns with evidence; condense stale detail instead of repeating it.
-
-## Output
-
-Yield a structured JSON object matching this schema:
-- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
-- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
-- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
-- rationale (string, optional): Technical justification for this decision
-- text (string, optional): Concrete guidance or steering directives
-- persist (boolean, optional): Whether guidance persists across subsequent attempts
-- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
-- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
-- outline (object, optional): Item outline to schedule when decision is fix-item
-- debt (string, optional): Technical debt description when decision is accept-with-debt
-- reason (string, optional): Reason for abandonment or abort
-- question (string, optional): Specific question for human operator when decision is human-async or blocked
-- target (object, optional): Corrected developer target from a merge-verify consult, applied to the merge verification instead of the record's stale target (unknown-gate recovery). One of {gate: <infra gate id>}, {selectors: [<test ids>]}, or {command, customTarget: true}.
-  - gate (string, optional)
-  - selectors (array of string, optional)
-  - expectRed (array of string, optional)
-  - command (string, optional)
-  - customTarget (boolean, optional)
-- planDelta (string, optional): Plan delta or amendment directives when decision is amend
-- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
-- concerns (array of object, optional): Structured concerns raised by the architect
-  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
-  - summary (string, required)
-  - detail (string, optional)
-  - severity (string, optional, enum: ["low","medium","high"])
-  - location (object, optional)
-    - file (string, required)
-    - line (integer, optional)
-  - affects (array of string, optional)
-- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
-  - chosen (string, required)
-  - why (string, required)
-  - alternatives (array of string, required)
-- concernConfirms (array of object, optional): Architect confirmations for close-up concern resolutions
-  - id (string, required)
-  - note (string, optional)
-  - confirm (string, required, enum: ["accept","reject"])
-- concernResolution (object, optional): Direct concern resolution applied when the decision commits
-  - id (string, required)
-  - note (string, optional)
-  - action (string, required, enum: ["resolve","carry"])
diff --git a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/meta.yaml b/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/meta.yaml
deleted file mode 100644
index 85e2d23..0000000
--- a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/meta.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-seq: 157
-name: consult-epic-kickoff-gate-1
-attempt: 1
-agent: architect
-role: architect
-models:
-  - opencode-go/muse-spark-1.3-contributor
-session: 01a1b8a3-f9ce-7511-963e-37a3531a2d3a
-timeoutSec: 7200
-status: ok
-startedAt: 2026-11-10T01:56:24.817Z
-endedAt: 2026-11-10T01:57:42.006Z
-usage:
-  inputTokens: 745626
-  outputTokens: 2121
-  costUsd: 0.076477
-traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T00-51-56-494Z_01a1b8a3-f9ce-7511-963e-37a3531a2d3a.jsonl
diff --git a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/output.yaml b/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/output.yaml
deleted file mode 100644
index 04afd52..0000000
--- a/.factory/tasks/modernize/runs/157-consult-epic-kickoff-gate-1-a1/output.yaml
+++ /dev/null
@@ -1,9 +0,0 @@
-context: item
-decision: abandon
-reason: superseded
-rationale: "I3 epics never spawned (closeup-3: M2 zero delivery,
-  epic-kickoff-gate pending); ADR-013 records root-serialized delivery replaced
-  epic decomposition for I4; ADR-023 extends it to I5. A live spawn gate has
-  nothing to spawn, handoff needs I6 replan. Report-only, zero repo writes."
-text: "No replan needed: ADR-023 governs I5 delivery; I6 replans M2/M3 without
-  epics."
diff --git a/.factory/tasks/modernize/state.yaml b/.factory/tasks/modernize/state.yaml
index af4401a..1d8ebf6 100644
--- a/.factory/tasks/modernize/state.yaml
+++ b/.factory/tasks/modernize/state.yaml
@@ -2,7 +2,7 @@ task: modernize
 kind: saga
 status: active
 iteration: 5
-currentWave: 3
+currentWave: 2
 items:
   adr-formalization:
     kind: no-behavior
@@ -165,12 +165,12 @@ items:
     mergedAt: 2026-11-09T00:11:56-05:00
   epic-kickoff-gate:
     kind: fact-finder
-    status: failed
+    status: running
     branch: topic/modernize--epic-kickoff-gate
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.073828
-    currentStep: review
+    spendUsd: 0.057369
+    currentStep: research
   golden-contract-hardening:
     kind: test-only
     status: merged
@@ -217,12 +217,12 @@ items:
     mergedAt: 2026-11-09T13:56:23-05:00
   cache-design-spike:
     kind: poc
-    status: ready
+    status: running
     branch: topic/modernize--cache-design-spike
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.109595
-    currentStep: review
+    spendUsd: 0.105401
+    currentStep: develop
   checkers-legacy-dead-cleanup:
     kind: no-behavior
     status: blocked
@@ -257,12 +257,11 @@ items:
     mergedAt: 2026-11-08T10:47:48-05:00
   epic-shift-report-collection:
     kind: fact-finder
-    status: ready
+    status: pending
     branch: topic/modernize--epic-shift-report-collection
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.04926
-    currentStep: review
+    spendUsd: 0
   remaining-lint-violations-fix:
     kind: no-behavior
     status: merged
@@ -301,13 +300,12 @@ items:
     mergedAt: 2026-11-09T01:20:54-05:00
   coding-rules-audit:
     kind: fact-finder
-    status: merged
+    status: running
     branch: topic/modernize--coding-rules-audit
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.117057
-    currentStep: review
-    mergedAt: 2026-11-09T22:02:16-05:00
+    spendUsd: 0.104406
+    currentStep: research
   decision-cache-impl:
     kind: dev
     status: failed
@@ -318,12 +316,11 @@ items:
     currentStep: qa
   golden-regen-hatch:
     kind: test-only
-    status: ready
+    status: pending
     branch: topic/modernize--golden-regen-hatch
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.043046
-    currentStep: review
+    spendUsd: 0
   never-test-linting-prune:
     kind: test-only
     status: merged
@@ -344,12 +341,11 @@ items:
     mergedAt: 2026-11-08T12:55:17-05:00
   final-gate-validation:
     kind: fact-finder
-    status: running
+    status: pending
     branch: topic/modernize--final-gate-validation
     attempts: 1
-    fixRounds: 2
-    spendUsd: 0.069515
-    currentStep: review
+    fixRounds: 1
+    spendUsd: 0
   semantic-tests-rewrite:
     kind: test-only
     status: blocked
@@ -359,12 +355,11 @@ items:
     spendUsd: 0
   test-debloat-audit:
     kind: fact-finder
-    status: ready
+    status: pending
     branch: topic/modernize--test-debloat-audit
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.209342
-    currentStep: review
+    spendUsd: 0
   docs-reconciliation:
     kind: no-behavior
     status: blocked
@@ -426,12 +421,12 @@ items:
     branch: topic/modernize--docs-counts-sync
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.051479
-    currentStep: qa
+    spendUsd: 0.033694
+    currentStep: test-first
 concerns:
-  open: 0
+  open: 16
   dismissed: 0
-  routed: 35
+  routed: 1
   resolved: 2
 debt:
   - No compliant model proven (215/0 unevaluable, single-author labels, Fastino
@@ -472,67 +467,6 @@ debt:
     determinism; oracle + per-tool coverage + tool-qualified brush-off/carry
     lookups prove sensitivity. QA rejected 2/2 solely on red-test; all other
     checks passed. No src follow-up required."
-  - "[cache-design-spike] PoC lock is POSIX-only fcntl.flock"
-  - "[cache-design-spike] Production call site passes a constant rule symbol,
-    collapsing the cache rule component"
-  - "[cache-design-spike] Tracked key excludes code_context, unlike the current
-    in-process semantic memo"
-  - "[cache-design-spike] Lockfile needs a gitignore entry and the retired
-    machine-cache entry should be replaced"
-  - "[coding-rules-audit] Production-dead _baseline_helpers module is pinned
-    only by tests"
-  - "[coding-rules-audit] peek_fallback_tools debt comment names a completed
-    owner"
-  - "[coding-rules-audit] Semantic docs still describe the removed cross-encoder
-    while the decision cache does not exist"
-  - "[coding-rules-audit] LoC deltas are gross estimates; public renames offset
-    stub deletion"
-  - "[coding-rules-audit] W9707 .pyi enforcement is blind, so 203 private stub
-    declarations are unguarded"
-  - "[consolidate-integration-helpers-v3] Accepted deletion of the two slow
-    self-lint guard tests instead of resurrecting them with item-side import
-    fixes."
-  - "[consolidate-integration-helpers-v3] Merge result is byte-identical to the
-    parent tip for every non-.factory path, so the item branch contributes no
-    code deltas of its own."
-  - "[consolidate-integration-helpers-v3] Stale doc references: _project_helpers
-    docstring still names 'the self-lint guards' (now pruned) and AGENTS.md test
-    counts are outdated."
-  - "[epic-kickoff-gate] ADR-011 names a test class that no longer exists and
-    carries stale line references"
-  - "[epic-kickoff-gate] Checkers owner count exceeds the ADR-011 ±5 drift
-    budget by 3"
-  - "[epic-shift-report-collection] ADR-011 shift-handoff contract remains
-    'Accepted' after epic decomposition was abandoned"
-  - "[epic-shift-report-collection] Legacy golden-regen-hatch could misread a
-    missing handoff as all-no-shift"
-  - "[final-gate-validation] Production call sites pass constant rule symbols,
-    collapsing the cache-key rule component"
-  - "[final-gate-validation] 1.72 GiB of .factory model artifacts are tracked;
-    detect-secrets safety depends on a prefix-anchored baseline filter"
-  - "[final-gate-validation] golden-regen-hatch report is absent from HEAD"
-  - "[final-gate-validation] PoC lock is POSIX-only fcntl.flock; no production
-    lock code exists at HEAD"
-  - "[golden-regen-hatch] Legacy golden-regen-hatch ran with a fail-open 0/3
-    handoff; this attestation is a no-regen byte-identity proof, not an
-    all-no-shift declaration"
-  - "[test-debloat-audit] coding-rules-audit UNIFIED ownership map was
-    unavailable in the prompt/inter-dep"
-  - "[test-debloat-audit] test_testing_fakes.py must not be removed as
-    test-infra-only coverage"
-  - "[test-debloat-audit] Shipped rcfile parity is unguarded after
-    test_config_consistency.py deletion"
-  - "[test-debloat-audit] Benchmark test has zero assertions and cannot gate
-    regressions"
-  - "[test-debloat-audit] Real-pipeline smoke test runs 14 real tools in the
-    default suite (not slow)"
-  - "[test-debloat-audit] Removing test_runner_private_imports.py broadens the
-    never-linting definition"
-  - "[test-debloat-audit] Fixture data test file is collected and leaks a temp
-    directory"
-  - "[test-debloat-audit] Marker taxonomy is effectively unenforced"
-  - "[test-debloat-audit] Assignment citation for semantic_check.py is stale/out
-    of range"
   - "[adr-formalization] ADR-012 examples could include conformance/ path prefix"
   - "[adr-formalization] H1 heading prefix inconsistent between new and legacy
     ADRs"
@@ -663,11 +597,6 @@ debt:
     decision-model warnings"
   - "[decision-backend-impl] Expand nested ternary in normalize_suppressed_codes"
   - "[decision-backend-impl] Add minimal docstrings to decision-backend stub"
-  - "[epic-kickoff-gate] ADR-011 stale test class and line refs"
-  - "[epic-kickoff-gate] Checkers +8 exceeds +-5 budget, enumerated and amended"
-  - "[epic-kickoff-gate] ADR-011 Accepted handoff contract stale"
-  - "[epic-kickoff-gate] Legacy hatch fail-open on missing handoff"
-  - "[epic-kickoff-gate] Drift row 21 cites regex def :27 as stream site"
   - "[golden-contract-hardening] Add runs guard and messages to byte-identical
     hash asserts"
   - "[golden-contract-hardening] Consider SHA-256 comparison for counts payloads
@@ -696,15 +625,6 @@ debt:
     excludes it (6/336)"
   - "[secrets-triage-spike] Scope the --baseline masking claim to
     detect-secrets-scoped runs"
-  - "[cache-design-spike] Constant rule symbol collapses cache rule component"
-  - "[cache-design-spike] Tracked key excludes code_context"
-  - "[cache-design-spike] Lockfile gitignore plus retired cache entry"
-  - "[cache-design-spike] Heuristic docstring claims exactly as production"
-  - "[cache-design-spike] backend-failed marked contacted but skipped as
-    observation"
-  - "[cache-design-spike] Root escape guards triplicated"
-  - "[cache-design-spike] production_untouched fails post-commit on tracked out/"
-  - "[cache-design-spike] Docstrings say RefreshRefused vs RefreshRefusedError"
   - "[coding-rules-audit-i2] Reconcile beartype taxonomy: true total is 26
     sites, A22 undercounts by 2"
   - "[coding-rules-audit-i2] A33 counts drift: measured 45 W9740 in src+scripts,
@@ -728,32 +648,8 @@ debt:
   - "[runner-dispatch-split] dispatch.py at 449/500 leaves 51 lines headroom"
   - "[stale-disables-portability-cleanup] Slow downstream test still uses fixed
     Path.home()/.tmp scratch dir"
-  - "[coding-rules-audit] Dead _baseline_helpers pinned only by tests"
-  - "[coding-rules-audit] peek_fallback_tools shim names completed owner"
-  - "[coding-rules-audit] Semantic docs describe removed cross-encoder, cache
-    absent"
-  - "[coding-rules-audit] LoC deltas gross; renames offset stub deletion"
-  - "[coding-rules-audit] W9707 blind; 203 private stubs unguarded"
-  - "[coding-rules-audit] Accepted deletion of two slow self-lint guard tests"
-  - "[coding-rules-audit] Merge byte-identical to parent tip, no item deltas"
-  - "[coding-rules-audit] Stale helpers docstring plus AGENTS counts"
-  - "[coding-rules-audit] PYI-1 cites missing IMP-1 row"
   - "[decision-cache-impl] decisions/ lacks __init__.py while checkers/ and
     runner/ have one"
-  - "[golden-regen-hatch] Benchmark test has zero assertions and cannot gate
-    regressions"
-  - "[golden-regen-hatch] Real-pipeline smoke runs 14 tools in default suite"
-  - "[golden-regen-hatch] Removing private-imports guard broadens never-linting
-    definition"
-  - "[golden-regen-hatch] Fixture data test collected and leaks temp dir"
-  - "[golden-regen-hatch] Marker taxonomy effectively unenforced"
-  - "[golden-regen-hatch] Semantic_check citation stale/out of range"
-  - "[golden-regen-hatch] Check-only ruff format ToolSpec with phase-1a-only
-    mutation"
-  - "[golden-regen-hatch] Judged gates from Gate Diff table; lint/test fixed"
-  - "[golden-regen-hatch] Prune 13 I4 pendings, add 2 gap outlines"
-  - "[golden-regen-hatch] Lint/test IMPROVED, no regressions"
-  - "[golden-regen-hatch] Prune pendings, add stream-helper-v2 deps"
   - "[never-test-linting-prune] Stale docstring references deleted live test
     file; owner cleanup deferred"
   - "[test-debloat-audit-i2] Clarify LoC counting method; wc -l differs slightly"
@@ -769,32 +665,6 @@ debt:
     and conflates core"
   - "[test-debloat-audit-i2] Sources typo: baseline-diff-edge cited under
     tests/checkers/"
-  - "[final-gate-validation] Constant rule symbols collapse cache-key rule
-    component"
-  - "[final-gate-validation] Tracked 1.72GiB safetensors; detect-secrets relies
-    on prefix filter"
-  - "[final-gate-validation] Golden-regen-hatch report absent from HEAD"
-  - "[final-gate-validation] No production lock; PoC fcntl concern deferred"
-  - "[final-gate-validation] Legacy hatch fail-open; this gate is no-regen
-    byte-identity only"
-  - "[final-gate-validation] UNIFIED ownership map unavailable; ADR-011 labels
-    provisional"
-  - "[final-gate-validation] Keep test_testing_fakes.py; testing.py is shipped
-    API"
-  - "[final-gate-validation] Rcfile parity unguarded after consistency-test
-    deletion"
-  - "[test-debloat-audit] Unrelated merge tradeoff; retain as digest"
-  - "[test-debloat-audit] Consistent premise for audit §6; no action"
-  - "[test-debloat-audit] Unrelated iteration decision; retain as digest"
-  - "[test-debloat-audit] Unrelated cache decision; retain as digest"
-  - "[test-debloat-audit] Unrelated item decision; retain as digest"
-  - "[test-debloat-audit] Unrelated reporting decision; no conflict"
-  - "[test-debloat-audit] Unrelated gate decision; no interaction"
-  - "[test-debloat-audit] Unrelated merge decision; retain as digest"
-  - "[test-debloat-audit] Consistent with conftest row; no action"
-  - "[test-debloat-audit] Minor line-range errors in two rewrite dispositions"
-  - "[test-debloat-audit] Cosmetic count/label inconsistencies; LoC verified
-    exact"
   - "[golden-helpers-unit] tool_minimums imports TOOLS via package root, pulling
     CLI structlog side effects"
   - "[golden-helpers-unit] Public FindingKey alias missing from __all__"
@@ -816,20 +686,20 @@ debt:
     obscure"
   - '[consolidate-integration-helpers-v3] make_consumer_project hardcodes
     "consumer" dirname for hooks test'
-budgetSpentUsd: 13.036223685999996
+budgetSpentUsd: 12.537494685999997
 spendByRole:
   workhorse:
-    costUsd: 6.130492685999999
-    inputTokens: 12388371
-    outputTokens: 4477517
+    costUsd: 5.8146706859999995
+    inputTokens: 11423858
+    outputTokens: 4246801
   alt-workhorse:
-    costUsd: 1.6442480000000004
-    inputTokens: 7801234
-    outputTokens: 2832118
+    costUsd: 1.5378180000000008
+    inputTokens: 7319130
+    outputTokens: 2605987
   architect:
-    costUsd: 5.133999999999998
-    inputTokens: 20904590
-    outputTokens: 684069
+    costUsd: 5.057522999999998
+    inputTokens: 20158964
+    outputTokens: 681948
   alt-architect:
     costUsd: 0.127483
     inputTokens: 457640
@@ -959,26 +829,22 @@ spendByItem:
     costUsd: 0.19651400000000002
     inputTokens: 713974
     outputTokens: 167344
-  final-gate-validation:
-    costUsd: 0.069515
-    inputTokens: 174991
-    outputTokens: 92470
   consolidate-integration-helpers-v3:
     costUsd: 0.259824
     inputTokens: 463214
     outputTokens: 227545
   epic-kickoff-gate:
-    costUsd: 0.073828
-    inputTokens: 188519
-    outputTokens: 87729
+    costUsd: 0.057369
+    inputTokens: 121841
+    outputTokens: 49513
   cache-design-spike:
-    costUsd: 0.109595
-    inputTokens: 192123
-    outputTokens: 99164
-  epic-shift-report-collection:
-    costUsd: 0.04926
-    inputTokens: 160531
-    outputTokens: 43523
+    costUsd: 0.105401
+    inputTokens: 176978
+    outputTokens: 87972
+  coding-rules-audit:
+    costUsd: 0.104406
+    inputTokens: 187879
+    outputTokens: 83867
   decision-cache-impl:
     costUsd: 0.393308
     inputTokens: 802730
@@ -987,18 +853,10 @@ spendByItem:
     costUsd: 0.258951
     inputTokens: 549144
     outputTokens: 175859
-  test-debloat-audit:
-    costUsd: 0.209342
-    inputTokens: 792518
-    outputTokens: 167470
   docs-counts-sync:
-    costUsd: 0.051479
-    inputTokens: 116644
-    outputTokens: 46244
-  golden-regen-hatch:
-    costUsd: 0.043046
-    inputTokens: 128334
-    outputTokens: 62037
+    costUsd: 0.033694
+    inputTokens: 70279
+    outputTokens: 32429
   pylint-cache-assumptions:
     costUsd: 0.23190968599999998
     inputTokens: 455233
@@ -1008,11 +866,7 @@ spendByItem:
     inputTokens: 1215172
     outputTokens: 444746
   (orchestration):
-    costUsd: 6.349675999999999
-    inputTokens: 24802345
-    outputTokens: 2201503
-  coding-rules-audit:
-    costUsd: 0.117057
-    inputTokens: 249934
-    outputTokens: 111991
-lastUpdated: 2026-11-10T03:05:57.248Z
+    costUsd: 6.273198999999999
+    inputTokens: 24056719
+    outputTokens: 2199382
+lastUpdated: 2026-11-10T00:08:53.351Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-c-81b8a319de.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-c-81b8a319de.yaml
deleted file mode 100644
index 821c823..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-c-81b8a319de.yaml
+++ /dev/null
@@ -1,10 +0,0 @@
-id: q-concern-c-81b8a319de
-ref: epic-kickoff-gate
-disposition: human-awareness
-question: Decision 013 confirms abandonment; gate reconstruction under A0 with
-  explicit caveat is valid per amended assignment plus decision 009
-  mergeable-core rule. Downstream must cite this gate report as authority.
-  Operator should be aware authority shifted from validated-map artifact to gate
-  reconstruction.
-status: open
-createdAt: 2026-11-10T01:56:20.421Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-00a177b6ba.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-00a177b6ba.yaml
deleted file mode 100644
index 7ab71da..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-00a177b6ba.yaml
+++ /dev/null
@@ -1,8 +0,0 @@
-id: q-concern-rm-00a177b6ba
-ref: test-debloat-audit
-disposition: human-awareness
-question: Cache-design-spike key-derivation decision. Audit SKIPs
-  cache-semantics modules, so no interaction with audit rows. Retained as
-  digest.
-status: open
-createdAt: 2026-11-10T02:58:56.261Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-0237e4a7c9.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-0237e4a7c9.yaml
deleted file mode 100644
index 7000c49..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-0237e4a7c9.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-0237e4a7c9
-ref: test-debloat-audit
-disposition: human-awareness
-question: Merge/integration tradeoff from consolidate-integration-helpers scope.
-  Valid record; no bearing on audit rows. Retained as digest.
-status: open
-createdAt: 2026-11-10T02:58:56.255Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-057ed6485e.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-057ed6485e.yaml
deleted file mode 100644
index 83964e5..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-057ed6485e.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-057ed6485e
-ref: golden-regen-hatch
-disposition: human-awareness
-question: "Gate accounting: lint/test IMPROVED per Gate Diff with no
-  regressions. Consistent with observed green gates and empty diff."
-status: open
-createdAt: 2026-11-10T02:32:36.424Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-0e2de85be6.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-0e2de85be6.yaml
deleted file mode 100644
index 807e797..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-0e2de85be6.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-0e2de85be6
-ref: test-debloat-audit
-disposition: human-awareness
-question: Cache key-format decision; outside audit scope (semantic/cache files
-  SKIPPED). Retained as digest.
-status: open
-createdAt: 2026-11-10T02:58:56.262Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-1ded0c796b.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-1ded0c796b.yaml
deleted file mode 100644
index 0418009..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-1ded0c796b.yaml
+++ /dev/null
@@ -1,8 +0,0 @@
-id: q-concern-rm-1ded0c796b
-ref: golden-regen-hatch
-disposition: human-awareness
-question: Process note on gate accounting (lint/test fail-to-pass,
-  format/integration green). No code impact; hatch gates verified green
-  independently.
-status: open
-createdAt: 2026-11-10T02:32:36.420Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-48c8d8400a.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-48c8d8400a.yaml
deleted file mode 100644
index 5d0799d..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-48c8d8400a.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-48c8d8400a
-ref: golden-regen-hatch
-disposition: human-awareness
-question: Planning note pruning superseded pendings and adding gap outlines. Out
-  of scope for no-op verification; retain for audit.
-status: open
-createdAt: 2026-11-10T02:32:36.422Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-49477e3be0.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-49477e3be0.yaml
deleted file mode 100644
index 76fb1ce..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-49477e3be0.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-49477e3be0
-ref: test-debloat-audit
-disposition: human-awareness
-question: Config-layer resolution decision from another item; no bearing on test
-  inventory. Retained as digest.
-status: open
-createdAt: 2026-11-10T02:58:56.266Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-5bf2ade0ce.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-5bf2ade0ce.yaml
deleted file mode 100644
index baaef23..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-5bf2ade0ce.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-5bf2ade0ce
-ref: golden-regen-hatch
-disposition: human-awareness
-question: Planning note on prune plus stream-helper-v2 deps. No code effect on
-  golden integrity; retain.
-status: open
-createdAt: 2026-11-10T02:32:36.426Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-5f84f18bbd.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-5f84f18bbd.yaml
deleted file mode 100644
index 6afe226..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-5f84f18bbd.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-5f84f18bbd
-ref: test-debloat-audit
-disposition: human-awareness
-question: Merge-conflict resolution from integration-helpers scope; tests/
-  content verified unchanged vs audit base. Retained as digest.
-status: open
-createdAt: 2026-11-10T02:58:56.269Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-6396a0993e.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-6396a0993e.yaml
deleted file mode 100644
index d9db5a7..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-6396a0993e.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-6396a0993e
-ref: test-debloat-audit
-disposition: human-awareness
-question: Iteration-management decision; orthogonal to audit substance. Retained
-  as digest.
-status: open
-createdAt: 2026-11-10T02:58:56.260Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-644c24995b.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-644c24995b.yaml
deleted file mode 100644
index c5d90ac..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-644c24995b.yaml
+++ /dev/null
@@ -1,6 +0,0 @@
-id: q-concern-rm-644c24995b
-ref: test-debloat-audit
-disposition: human-awareness
-question: Cache pruning policy; outside audit scope. Retained as digest.
-status: open
-createdAt: 2026-11-10T02:58:56.263Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-6e63c3be9e.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-6e63c3be9e.yaml
deleted file mode 100644
index fbdea7e..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-6e63c3be9e.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-6e63c3be9e
-ref: test-debloat-audit
-disposition: human-awareness
-question: Conftest re-export removal; audit's conftest row (keep, canonical
-  registry snapshot at :132) verified and unaffected. No conflict.
-status: open
-createdAt: 2026-11-10T02:58:56.271Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-717ccdc143.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-717ccdc143.yaml
deleted file mode 100644
index c3112ac..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-717ccdc143.yaml
+++ /dev/null
@@ -1,8 +0,0 @@
-id: q-concern-rm-717ccdc143
-ref: golden-regen-hatch
-disposition: human-awareness
-question: "Verified check-only: build_command appends --check, _build adds
-  --config. Consistent with no-op hatch (no golden shift, 158 findings SHA
-  c2b8dc3a/1d239741 match); retain as context."
-status: open
-createdAt: 2026-11-10T02:32:36.409Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-8744aaa293.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-8744aaa293.yaml
deleted file mode 100644
index 6ec902e..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-8744aaa293.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-8744aaa293
-ref: test-debloat-audit
-disposition: human-awareness
-question: Coding-rules-audit reporting decision; audit's stub-family rows stand
-  on their own measurements (verified exact). No conflict.
-status: open
-createdAt: 2026-11-10T02:58:56.267Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-963829d74d.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-963829d74d.yaml
deleted file mode 100644
index f889d47..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-963829d74d.yaml
+++ /dev/null
@@ -1,8 +0,0 @@
-id: q-concern-rm-963829d74d
-ref: test-debloat-audit
-disposition: human-awareness
-question: Consistent with audit §6 prune precedent (644774e deleted
-  self-lint/config-consistency guards). Audit correctly treats these as
-  already-absent at HEAD. No action.
-status: open
-createdAt: 2026-11-10T02:58:56.257Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-9b3f69811e.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-9b3f69811e.yaml
deleted file mode 100644
index 4805e52..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-9b3f69811e.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-9b3f69811e
-ref: test-debloat-audit
-disposition: human-awareness
-question: Integration-helper merge decision; does not affect audit inventory or
-  pinning limbs. Retained as digest.
-status: open
-createdAt: 2026-11-10T02:58:56.258Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-bc510f4b77.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-bc510f4b77.yaml
deleted file mode 100644
index 5847544..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-bc510f4b77.yaml
+++ /dev/null
@@ -1,7 +0,0 @@
-id: q-concern-rm-bc510f4b77
-ref: test-debloat-audit
-disposition: human-awareness
-question: Lint-gate execution decision; audit was read-only and verified via
-  collect-only plus direct reads. No interaction.
-status: open
-createdAt: 2026-11-10T02:58:56.268Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-d1f2b9dda9.yaml b/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-d1f2b9dda9.yaml
deleted file mode 100644
index 18b8298..0000000
--- a/.factory/tasks/modernize/steer/tousertoreview/q-concern-rm-d1f2b9dda9.yaml
+++ /dev/null
@@ -1,6 +0,0 @@
-id: q-concern-rm-d1f2b9dda9
-ref: test-debloat-audit
-disposition: human-awareness
-question: Cache concurrency decision; outside audit scope. Retained as digest.
-status: open
-createdAt: 2026-11-10T02:58:56.264Z

## Human involvement
# Human involvement criteria

Mode selects which ADR and concern decisions need a human decision. Everything
else is either autonomous or digest-only; never block on items the table marks
remarkable.

## Blocking table (ADRs and concerns)

| Mode | Blocking (needs human decision) | Remarkable (digest only) |
| --- | --- | --- |
| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
| principal | stack/layer, external interfaces, config shapes | internal choices |
| detailed | external-interface changes and major internal interfaces | minor internals |

## autonomous

Block only explicit high-severity ADRs/concerns that remain after all unblocked
work is finished. Do not stop for internal choices; record them as remarkable.

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["approved","changes_requested"])
- summary (string, required)
- suggestions (array of object, required)
  - id (string, required)
  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async","dismiss"])
  - summary (string, required)
  - detail (string, optional)
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)
- newConcerns (array of object, optional): New concerns discovered during review
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)

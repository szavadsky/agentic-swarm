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
- id: c-1882d3f0f7
  kind: assumption
  severity: medium
  summary: Production call sites pass constant rule symbols, collapsing the cache-key rule component
  affects:
    - cache-design-spike
    - decision-cache-impl
- id: c-5a67b09b19
  kind: risk
  severity: medium
  summary: 1.72 GiB of .factory model artifacts are tracked; detect-secrets safety depends on a prefix-anchored baseline filter
  affects:
    - final-gate-validation
- id: c-a816c72150
  kind: risk
  severity: medium
  summary: golden-regen-hatch report is absent from HEAD
  affects:
    - final-gate-validation
    - golden-regen-hatch
- id: c-b18093e36e
  kind: assumption
  severity: low
  summary: PoC lock is POSIX-only fcntl.flock; no production lock code exists at HEAD
  affects:
    - cache-design-spike
    - decision-cache-impl
- id: c-fd163ed069
  kind: blocker
  severity: high
  summary: Docs reconciliation is red on every must-contain group at HEAD ba7c267
  affects:
    - docs-counts-sync
    - final-gate-validation
- id: c-b0cfd8817b
  kind: risk
  severity: medium
  summary: Legacy golden-regen-hatch ran with a fail-open 0/3 handoff; this attestation is a no-regen byte-identity proof, not an all-no-shift declaration
  affects:
    - final-gate-validation
    - golden-regen-hatch
    - golden-regen-hatch-v2
- id: c-4fe00e3cba
  kind: assumption
  severity: medium
  summary: coding-rules-audit UNIFIED ownership map was unavailable in the prompt/inter-dep
  affects:
    - test-debloat-audit
    - test-debloat-impl
- id: c-5e0d0157c2
  kind: assumption
  severity: low
  summary: test_testing_fakes.py must not be removed as test-infra-only coverage
  affects:
    - setup-testing
    - test-debloat-audit
- id: c-7010722c77
  kind: tech-debt
  severity: medium
  summary: Shipped rcfile parity is unguarded after test_config_consistency.py deletion
  affects:
    - config-parity
    - test-debloat-audit
    - test-debloat-impl


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
diff --git a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml b/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
deleted file mode 100644
index ede7641..0000000
--- a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T00:27:58.391Z
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
diff --git a/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml b/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml
deleted file mode 100644
index 7bac93c..0000000
--- a/.factory/tasks/modernize/concerns/c-4fe00e3cba.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
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
index c1d306c..0000000
--- a/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T00:27:58.391Z
diff --git a/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml b/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml
deleted file mode 100644
index 5c4c7bc..0000000
--- a/.factory/tasks/modernize/concerns/c-5e0d0157c2.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
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
index 3a9f479..0000000
--- a/.factory/tasks/modernize/concerns/c-7010722c77.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
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
index 0f1e7e3..0000000
--- a/.factory/tasks/modernize/concerns/c-97e30bc22b.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml b/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml
deleted file mode 100644
index 434819b..0000000
--- a/.factory/tasks/modernize/concerns/c-a6bc23b516.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/c-a816c72150.yaml b/.factory/tasks/modernize/concerns/c-a816c72150.yaml
deleted file mode 100644
index 71ad7bc..0000000
--- a/.factory/tasks/modernize/concerns/c-a816c72150.yaml
+++ /dev/null
@@ -1,25 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T00:27:58.391Z
diff --git a/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml b/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml
deleted file mode 100644
index fd2a12c..0000000
--- a/.factory/tasks/modernize/concerns/c-ab2f531c0f.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
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
index bb153b8..0000000
--- a/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
+++ /dev/null
@@ -1,30 +0,0 @@
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
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: golden-regen-hatch
-  lastSeen: 2026-11-10T00:36:23.179Z
-createdAt: 2026-11-10T00:36:23.179Z
-updatedAt: 2026-11-10T00:36:23.179Z
diff --git a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml b/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
deleted file mode 100644
index 5466663..0000000
--- a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T00:27:58.391Z
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
index 3f43e2c..0000000
--- a/.factory/tasks/modernize/concerns/c-dfdb0b2ad3.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
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
index 6152c34..0000000
--- a/.factory/tasks/modernize/concerns/c-f46047e94d.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml b/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml
deleted file mode 100644
index 3866a1b..0000000
--- a/.factory/tasks/modernize/concerns/c-f5b16a86e4.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: test-debloat-audit
-  lastSeen: 2026-11-10T00:53:21.467Z
-createdAt: 2026-11-10T00:53:21.467Z
-updatedAt: 2026-11-10T00:53:21.467Z
diff --git a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml b/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
deleted file mode 100644
index e7b72e4..0000000
--- a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
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
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: final-gate-validation
-  lastSeen: 2026-11-10T00:27:58.391Z
-createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T00:27:58.391Z
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
diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..6979bc8
--- /dev/null
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/input.md
@@ -0,0 +1,106 @@
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
+
+
+## Open Concerns
+- id: c-3e935debcb
+  kind: risk
+  severity: low
+  summary: PoC lock is POSIX-only fcntl.flock
+  affects:
+    - cache-design-spike
+    - decision-cache-impl
+- id: c-5463b26c4b
+  kind: assumption
+  severity: medium
+  summary: Production call site passes a constant rule symbol, collapsing the cache rule component
+  affects:
+    - cache-design-spike
+    - decision-cache-impl
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
diff --git a/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..d7411b4
--- /dev/null
+++ b/.factory/tasks/modernize/items/final-gate-validation/steps/001-research-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
+name: research
+attempt: 1
+fixRound: 1
+agent: fact-finder
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 3600
+status: ok
+startedAt: 2026-11-10T00:15:13.726Z
+session: 01a1c2cf-17ec-7158-a980-3643bf095788
+endedAt: 2026-11-10T00:27:58.604Z
+usage:
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
diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
index 2615929..a1792be 100644
--- a/.factory/tasks/modernize/journal.ndjson
+++ b/.factory/tasks/modernize/journal.ndjson
@@ -2243,38 +2243,3 @@
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
index 022c7ef..1d8ebf6 100644
--- a/.factory/tasks/modernize/state.yaml
+++ b/.factory/tasks/modernize/state.yaml
@@ -165,12 +165,12 @@ items:
     mergedAt: 2026-11-09T00:11:56-05:00
   epic-kickoff-gate:
     kind: fact-finder
-    status: ready
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
-    status: running
+    status: pending
     branch: topic/modernize--epic-shift-report-collection
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.040594
-    currentStep: research
+    spendUsd: 0
   remaining-lint-violations-fix:
     kind: no-behavior
     status: merged
@@ -301,12 +300,12 @@ items:
     mergedAt: 2026-11-09T01:20:54-05:00
   coding-rules-audit:
     kind: fact-finder
-    status: ready
+    status: running
     branch: topic/modernize--coding-rules-audit
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.117057
-    currentStep: review
+    spendUsd: 0.104406
+    currentStep: research
   decision-cache-impl:
     kind: dev
     status: failed
@@ -317,12 +316,11 @@ items:
     currentStep: qa
   golden-regen-hatch:
     kind: test-only
-    status: running
+    status: pending
     branch: topic/modernize--golden-regen-hatch
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.025239
-    currentStep: develop
+    spendUsd: 0
   never-test-linting-prune:
     kind: test-only
     status: merged
@@ -343,12 +341,11 @@ items:
     mergedAt: 2026-11-08T12:55:17-05:00
   final-gate-validation:
     kind: fact-finder
-    status: running
+    status: pending
     branch: topic/modernize--final-gate-validation
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.052455
-    currentStep: research
+    spendUsd: 0
   semantic-tests-rewrite:
     kind: test-only
     status: blocked
@@ -358,12 +355,11 @@ items:
     spendUsd: 0
   test-debloat-audit:
     kind: fact-finder
-    status: running
+    status: pending
     branch: topic/modernize--test-debloat-audit
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.179749
-    currentStep: research
+    spendUsd: 0
   docs-reconciliation:
     kind: no-behavior
     status: blocked
@@ -425,12 +421,12 @@ items:
     branch: topic/modernize--docs-counts-sync
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.051479
-    currentStep: develop
+    spendUsd: 0.033694
+    currentStep: test-first
 concerns:
-  open: 15
+  open: 16
   dismissed: 0
-  routed: 20
+  routed: 1
   resolved: 2
 debt:
   - No compliant model proven (215/0 unevaluable, single-author labels, Fastino
@@ -471,40 +467,6 @@ debt:
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
   - "[adr-formalization] ADR-012 examples could include conformance/ path prefix"
   - "[adr-formalization] H1 heading prefix inconsistent between new and legacy
     ADRs"
@@ -635,11 +597,6 @@ debt:
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
@@ -668,15 +625,6 @@ debt:
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
@@ -700,16 +648,6 @@ debt:
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
   - "[never-test-linting-prune] Stale docstring references deleted live test
@@ -748,16 +686,16 @@ debt:
     obscure"
   - '[consolidate-integration-helpers-v3] make_consumer_project hardcodes
     "consumer" dirname for hooks test'
-budgetSpentUsd: 12.886620685999995
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
-    costUsd: 1.5711220000000006
-    inputTokens: 7463008
-    outputTokens: 2683519
+    costUsd: 1.5378180000000008
+    inputTokens: 7319130
+    outputTokens: 2605987
   architect:
     costUsd: 5.057522999999998
     inputTokens: 20158964
@@ -891,30 +829,22 @@ spendByItem:
     costUsd: 0.19651400000000002
     inputTokens: 713974
     outputTokens: 167344
-  final-gate-validation:
-    costUsd: 0.052455
-    inputTokens: 95165
-    outputTokens: 54227
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
+    costUsd: 0.105401
+    inputTokens: 176978
+    outputTokens: 87972
   coding-rules-audit:
-    costUsd: 0.117057
-    inputTokens: 249934
-    outputTokens: 111991
-  epic-shift-report-collection:
-    costUsd: 0.040594
-    inputTokens: 88261
-    outputTokens: 36328
+    costUsd: 0.104406
+    inputTokens: 187879
+    outputTokens: 83867
   decision-cache-impl:
     costUsd: 0.393308
     inputTokens: 802730
@@ -923,18 +853,10 @@ spendByItem:
     costUsd: 0.258951
     inputTokens: 549144
     outputTokens: 175859
-  test-debloat-audit:
-    costUsd: 0.179749
-    inputTokens: 684503
-    outputTokens: 103456
   docs-counts-sync:
-    costUsd: 0.051479
-    inputTokens: 116644
-    outputTokens: 46244
-  golden-regen-hatch:
-    costUsd: 0.025239
-    inputTokens: 50219
-    outputTokens: 22890
+    costUsd: 0.033694
+    inputTokens: 70279
+    outputTokens: 32429
   pylint-cache-assumptions:
     costUsd: 0.23190968599999998
     inputTokens: 455233
@@ -947,4 +869,4 @@ spendByItem:
     costUsd: 6.273198999999999
     inputTokens: 24056719
     outputTokens: 2199382
-lastUpdated: 2026-11-10T01:56:24.655Z
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

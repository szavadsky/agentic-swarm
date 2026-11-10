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
- id: rm-0237e4a7c9
  kind: remarkable
  summary: Merged `_project_helpers.py` as the union of both sides and kept its symlink-unlink guards
- id: rm-963829d74d
  kind: remarkable
  summary: Deleted `tests/runner/test_self_lint_clean.py` (modify/delete conflict)
- id: rm-9b3f69811e
  kind: remarkable
  summary: Combined the item's `assert_golden_snapshot` with the parent's fresh-copy byte-identical replay in test_setup_new_and_lint
- id: rm-6396a0993e
  kind: remarkable
  summary: End I5 with debt and restart v2 chain in I6 with fresh budget/bases
- id: rm-00a177b6ba
  kind: remarkable
  summary: Derive keys from the unredacted normalized justification while redacting bare hex runs in the stored display text
- id: rm-0e2de85be6
  kind: remarkable
  summary: Store `dk1.` + dot-separated lowercase base32 of the full SHA-256 (8-char groups) as the cache key
- id: rm-644c24995b
  kind: remarkable
  summary: Age pruning is opt-in (`--max-age-days`), disabled by default
- id: rm-d1f2b9dda9
  kind: remarkable
  summary: Normal lint stays strictly read-only; the explicit refresh writer uses flock + merge + atomic os.replace and enforces effective jobs==1
- id: rm-49477e3be0
  kind: remarkable
  summary: Treat TD-11 as resolved at the config layer rather than as a runner hack
- id: rm-8744aaa293
  kind: remarkable
  summary: Group the 203 private stub declarations into three per-owner rows plus the W9707 enforcement row, rather than 203 individual rows
- id: rm-bc510f4b77
  kind: remarkable
  summary: Run the lint gate with PYTHON_SETUP_LINT_NO_AUTOFIX=1 and rely on direct AST/pylint probes for the audit
- id: rm-5f84f18bbd
  kind: remarkable
  summary: Resolve all six content conflicts by taking the parent tip's (topic/modernize) version of the shared test helpers, integration.py and the autofix tests.
- id: rm-6e63c3be9e
  kind: remarkable
  summary: Leave the tests/conftest.py backwards-compat re-export of shipped_config_paths removed.


- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
- Raise concerns with evidence when review uncovers new cross-cutting issues.

## Assignment
{
  "slug": "test-debloat-audit",
  "kind": "fact-finder",
  "title": "Inventory redundant and lint-testing tests",
  "assignment": "Read-only audit of tests/** (no repo writes; structured item-report tables). Depends on coding-rules-audit: read its UNIFIED ownership map via inter-dep and align owner column (do not redefine owners). Semantic exclusions marked SKIPPED: tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl golden-covered); CodingRules-Tests violations (first-party mocking, naming incl task-ID test_t5_*/test_t9_7_*/test_t11_*/test_t1b_*/test_t3_*, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks per broadened never-linting definition); slow/benchmark. Output rows {module,behaviors,duplicate-of,recommendation keep|merge|rewrite|remove,surviving coverage,reason,owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit: test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay+config tests — surviving test or blocking-debt flag).",
  "outlineRef": "test-debloat-audit",
  "milestone": "M3",
  "wave": 5,
  "deps": [
    "golden-findings-snapshot",
    "third-party-assumption-tests",
    "consolidate-integration-helpers",
    "coding-rules-audit"
  ],
  "scenarioRefs": [
    "M3: Test redundancy inventoried",
    "M3: Ownership map is complete and disjoint"
  ],
  "citations": [
    "AGENTS.md:87-93",
    "CodingRules.md:230-306",
    "tests/checkers/test_semantic_check.py:1-7",
    "tests/checkers/test_semantic_check.py:159-257",
    "tests/checkers/test_semantic_threshold.py:19-25",
    "pyproject.toml:49-55"
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
index 31884cc..ede7641 100644
--- a/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
+++ b/.factory/tasks/modernize/concerns/c-1882d3f0f7.yaml
@@ -15,7 +15,7 @@ affects:
   - cache-design-spike
   - decision-cache-impl
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -23,5 +23,4 @@ source:
   item: final-gate-validation
   lastSeen: 2026-11-10T00:27:58.391Z
 createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
+updatedAt: 2026-11-10T00:27:58.391Z
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
index df635cd..c1d306c 100644
--- a/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
+++ b/.factory/tasks/modernize/concerns/c-5a67b09b19.yaml
@@ -15,7 +15,7 @@ location:
 affects:
   - final-gate-validation
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -23,5 +23,4 @@ source:
   item: final-gate-validation
   lastSeen: 2026-11-10T00:27:58.391Z
 createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
+updatedAt: 2026-11-10T00:27:58.391Z
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
index f995f76..71ad7bc 100644
--- a/.factory/tasks/modernize/concerns/c-a816c72150.yaml
+++ b/.factory/tasks/modernize/concerns/c-a816c72150.yaml
@@ -14,7 +14,7 @@ affects:
   - final-gate-validation
   - golden-regen-hatch
 severity: medium
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -22,5 +22,4 @@ source:
   item: final-gate-validation
   lastSeen: 2026-11-10T00:27:58.391Z
 createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
+updatedAt: 2026-11-10T00:27:58.391Z
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
index 1a34738..bb153b8 100644
--- a/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
+++ b/.factory/tasks/modernize/concerns/c-b0cfd8817b.yaml
@@ -19,7 +19,7 @@ affects:
   - golden-regen-hatch
   - golden-regen-hatch-v2
 severity: medium
-status: routed
+status: open
 source:
   record: 001-develop-r1-a1
   agent: developer
@@ -27,5 +27,4 @@ source:
   item: golden-regen-hatch
   lastSeen: 2026-11-10T00:36:23.179Z
 createdAt: 2026-11-10T00:36:23.179Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
+updatedAt: 2026-11-10T00:36:23.179Z
diff --git a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml b/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
index f7caf0d..5466663 100644
--- a/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
+++ b/.factory/tasks/modernize/concerns/c-b18093e36e.yaml
@@ -13,7 +13,7 @@ affects:
   - cache-design-spike
   - decision-cache-impl
 severity: low
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -21,5 +21,4 @@ source:
   item: final-gate-validation
   lastSeen: 2026-11-10T00:27:58.391Z
 createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: optional
+updatedAt: 2026-11-10T00:27:58.391Z
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
diff --git a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml b/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
index 7094f49..e7b72e4 100644
--- a/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
+++ b/.factory/tasks/modernize/concerns/c-fd163ed069.yaml
@@ -16,7 +16,7 @@ affects:
   - docs-counts-sync
   - final-gate-validation
 severity: high
-status: routed
+status: open
 source:
   record: 001-research-r1-a1
   agent: fact-finder
@@ -24,5 +24,4 @@ source:
   item: final-gate-validation
   lastSeen: 2026-11-10T00:27:58.391Z
 createdAt: 2026-11-10T00:27:58.391Z
-updatedAt: 2026-11-10T02:23:05.623Z
-disposition: architect
+updatedAt: 2026-11-10T00:27:58.391Z
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
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..da37aa6
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/input.md
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
+  "slug": "test-debloat-audit",
+  "kind": "fact-finder",
+  "title": "Inventory redundant and lint-testing tests",
+  "assignment": "Read-only audit of tests/** (no repo writes; structured item-report tables). Depends on coding-rules-audit: read its UNIFIED ownership map via inter-dep and align owner column (do not redefine owners). Semantic exclusions marked SKIPPED: tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl golden-covered); CodingRules-Tests violations (first-party mocking, naming incl task-ID test_t5_*/test_t9_7_*/test_t11_*/test_t1b_*/test_t3_*, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks per broadened never-linting definition); slow/benchmark. Output rows {module,behaviors,duplicate-of,recommendation keep|merge|rewrite|remove,surviving coverage,reason,owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit: test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay+config tests — surviving test or blocking-debt flag).",
+  "outlineRef": "test-debloat-audit",
+  "milestone": "M3",
+  "wave": 5,
+  "deps": [
+    "golden-findings-snapshot",
+    "third-party-assumption-tests",
+    "consolidate-integration-helpers",
+    "coding-rules-audit"
+  ],
+  "scenarioRefs": [
+    "M3: Test redundancy inventoried",
+    "M3: Ownership map is complete and disjoint"
+  ],
+  "citations": [
+    "AGENTS.md:87-93",
+    "CodingRules.md:230-306",
+    "tests/checkers/test_semantic_check.py:1-7",
+    "tests/checkers/test_semantic_check.py:159-257",
+    "tests/checkers/test_semantic_threshold.py:19-25",
+    "pyproject.toml:49-55"
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
+  "AGENTS.md:87-93",
+  "CodingRules.md:230-306",
+  "tests/checkers/test_semantic_check.py:1-7",
+  "tests/checkers/test_semantic_check.py:159-257",
+  "tests/checkers/test_semantic_threshold.py:19-25",
+  "pyproject.toml:49-55"
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
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..5fa6a74
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/meta.yaml
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
+startedAt: 2026-11-10T00:36:47.541Z
+session: 01a1c2e2-d5a8-7324-8be8-2ee2ad29c577
+endedAt: 2026-11-10T00:53:21.909Z
+usage:
+  inputTokens: 684503
+  outputTokens: 103456
+  costUsd: 0.179749
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-36-48-168Z_01a1c2e2-d5a8-7324-8be8-2ee2ad29c577.jsonl
diff --git a/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..7e90cf3
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,467 @@
+status: ok
+summary: "Read-only audit of tests/** at HEAD e2ffb19: 78 Python modules, 18,124
+  LoC, 793 test functions expanding to 1,357 default-suite cases (7 slow
+  deselected). Inventoried all 56 test modules plus 19 support/factory modules
+  by owner (checkers/runner/setup-testing/root; 5 semantic modules SKIPPED),
+  mapped duplication clusters, CodingRules-Tests violations, never-linting
+  removal candidates, slow/benchmarks, and the CLI/baseline/autofix/config
+  pinning limbs. Identified ~2.5-3.1k LoC (~14-17%) of removable/mergeable test
+  mass with surviving coverage named per row."
+findings: |-
+  # Test debloat audit — HEAD e2ffb19
+
+  Read-only; no repo writes. Verification: `uv run pytest --collect-only -q` → 1,364 collected, 7 deselected; `git log --oneline -1` → e2ffb19. Citations are `path:line` at HEAD unless prefixed `644774e^:`.
+
+  ## 0. Scope, ownership basis and caveat
+
+  - Scope: every `tests/**/*.py` module, including factories/helpers and fixture data. `tests/data/**` counted only as fixtures.
+  - **Ownership map gap:** the assignment says to consume coding-rules-audit's UNIFIED map via inter-dep, but no inter-dep section was present in the prompt and ADR-013 states the map lives in orchestration records (which this agent must not inspect). Owners below are therefore aligned to the only repo-visible five-owner taxonomy, ADR-011 (`docs/adr/ADR-011.md:9`): `checkers`, `runner`, `setup-testing`, `root`, `semantic`. No owner is redefined; each module gets exactly one owner. Row-owner alignment must be confirmed against the UNIFIED map before implementation.
+  - Semantic exclusions applied: `tests/checkers/test_semantic_check.py`, `tests/checkers/test_semantic_threshold.py`, `tests/checkers/test_decision_backend.py`, `tests/assumptions/test_pylint_cache_semantics.py`, `tests/assumptions/test_beartype_contracts.py` = SKIPPED. `TestSuppressionRerankerPipeline` and `tests/checkers/conftest.py` do not exist at HEAD (verified by grep/ls).
+  - Stale citation: `tests/checkers/test_semantic_check.py` is 133 lines at HEAD; the assignment's `:159-257` is out of range (trimmed since the citation was captured).
+
+  ## 1. Headline metrics
+
+  | Metric | Value |
+  |---|---|
+  | Python modules / LoC (excl. `tests/data`) | 78 / 18,124 |
+  | Test functions | 793 (784 in `test_*.py` + 9 in `integration.py`) |
+  | Collected cases (default `pytest -q`) | 1,364 collected, 7 slow deselected, 1,357 run |
+  | Golden snapshot | 158 findings / 14 tool-count keys (`tests/data/golden/*.json`) |
+  | CodingRules naming compliance | 486/793 fully `given+then`; 296 neither; 11 partial → 307 nonconforming (38.7%) |
+  | Category markers | 24 modules (20 non-skipped) with no category marker; `implementation_detail` used 0× |
+  | Slow tests | 7 tests / 6 modules (`-m 'not slow'`, `pyproject.toml:48`) |
+  | First-party monkeypatch sites | 35 `_run_cmd` sites in 12 files + `_run_uv` at `tests/_project_helpers.py:200` + runner internals at `tests/test_golden.py:208-215` |
+  | Duplicate helper defs | `_make_tc` 13, `_walk_and_release` 10, `_msg_ids` 8; `_UvCallRecorder` 2; `extra_block` 2; `_semantic_disabled` 2 |
+  | `list[Any]` / `dict[str, Any]` | 47 / 57 = 104 occurrences |
+
+  ### Per-subsystem LoC (sums to 18,124)
+
+  | Owner | Modules | LoC | Composition |
+  |---|---|---|---|
+  | checkers | 24 (22 checker tests + astroid/pylint assumption contracts) | 6,233 | 4,720 test LoC + 1,513 factories |
+  | runner | 19 | 7,416 | 5,916 test LoC + 1,500 factories/helpers |
+  | setup-testing | 6 | 1,676 | all test LoC |
+  | root | 5 (integration, test_golden + 3 shared support) | 1,745 | 912 test LoC + 833 support |
+  | semantic (SKIPPED) | 5 | 1,054 | all test LoC |
+
+  ## 2. Per-module inventory and recommendation (owner in group heading)
+
+  Legend: `dup-of` names the absorbing module/cluster; `surviving coverage` names the test that must remain after removal/merge. LoC/test counts are `LoC/functions`.
+
+  ### Owner: checkers
+
+  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
+  |---|---|---|---|---|---|---|
+  | test_asyncio_timeout_checker.py (124/4) | W9716 await without enclosing timeout; mixed/nested-function scope | none | keep | self | Unique checker behavior; no overlap | checkers |
+  | test_bare_except_comment_checker.py (187/11) | W9738 bare/`except Exception` without justification; comment/reraise/named-except skips | helper cluster | keep | self after helper move | Local `_make_tc`/`_walk_and_release` duplicate shipped `src/python_setup_lint/testing.py:18-42` | checkers |
+  | test_beartype_checker.py (102/5) | missing-beartype public functions; private/decorated/`no_type_check` skips; source-root filter | none | keep | self | Unique checker behavior | checkers |
+  | test_generic_key_dict_checker.py (116/2) | `dict[str, domain]` flagging | none | keep | self | Unique checker behavior | checkers |
+  | test_missing_error_chain_checker.py (192/12) | W9739 raise-in-except without `from`; chained/bare/outside-except skips | none | keep | self | Unique checker behavior | checkers |
+  | test_missing_return_annotation_checker.py (169/4) | missing-return-annotation on `_`-prefixed functions; source-root filter | none | keep | self | Unique checker behavior | checkers |
+  | test_no_try_import_checker.py (68/4) | W9706 try-import pattern detection | none | rewrite | self minus migration pin | `test_sentence_transformers_is_no_longer_an_optional_import_pattern` (`:27-33`) pins a deleted dependency → repo-state/migration test, not behavior | checkers |
+  | test_pyi_underscore_checker.py (121/9) | private symbols in `.pyi`; public/TYPE_CHECKING/dunder skips | none | keep | self | Unique checker behavior | checkers |
+  | test_redundant_type_guard_checker.py (240/18) | W9729 redundant `isinstance`; union/tuple/class-scope skips | none | keep | self | Unique checker behavior; trim only if C0302 pressure | checkers |
+  | test_silent_except_checker.py (221/14) | W9740 silent except; logging/raise skips | none | keep | self | Unique checker behavior | checkers |
+  | test_structlog_checker.py (141/14) | W9710 use-structlog; W9711 structured logging; source-root/proxy skips | none | keep | self | Unique checker behavior | checkers |
+  | test_stub_checker.py (456/23) | StubChecker lifecycle, stub resolution layouts, import contracts, classification, star/ClassVar/normalizer helpers | stub family core | merge | self as core + callable/class/coverage/docstring/normalizer/invariant rows | 7 stub modules / 1,742 LoC + 8 factories / 1,513 LoC; lifecycle/private-helper tests interleaved; in-file fixture `:23` | checkers |
+  | test_stub_checker_callable.py (276/12) | param descriptors, annotation extraction/comparison, E97B3 subprocess | stub family; pure helpers duplicate `test_stub_fidelity_invariants.py:323-383` | merge | test_stub_checker.py + E97B3 invariants (`test_stub_fidelity_invariants.py:139-198`) | Same checker and fixtures; no unique public surface beyond E97B3 | checkers |
+  | test_stub_checker_class.py (155/9) | `_normalize_bases`, `_is_public_method`, ctx, E97B1/B2 | stub family; pure helpers duplicate fidelity rows | merge | test_stub_checker.py + E97B1/B2 invariants | Same checker/fixtures | checkers |
+  | test_stub_coverage.py (191/11) | `matches_path`, test-file/opt-out/main-block checks, stub resolution/index/emit | stub family | merge | test_stub_checker.py | Helper-only coverage for the same StubChecker pipeline | checkers |
+  | test_stub_docstring_checker.py (145/8) | W9700 docstring-in-impl; W9705 generic-return `Returns:` | stub family | merge | test_stub_checker.py | Same checker family; no separate public API | checkers |
+  | test_stub_fidelity_invariants.py (428/35) | E97B1/B2/B3/B4/W97B5 fired invariants; ClassVar skip; public surface; pure comparisons; ctx | callable/class/normalizer + export surface | rewrite | keep `:60-275` invariant rows; drop `TestPublicSymbolSurface` `:277-321`, `TestComparePureHelpersDirect` `:323-383`, `TestCtxConstruction` `:385-427` | Fired-message invariants are valuable; pure-helper/export duplicates assert implementation shape, not behavior | checkers |
+  | test_stub_normalizer.py (91/4) | AnnotationNormalizer normalize/AST string/rewrites/comma split | stub family | merge | test_stub_checker.py | Pure helper of StubChecker | checkers |
+  | test_suppression_justification_checker.py (392/43) | W9704/W9738 suppression/Any justification; data-string exclusions; multi-line Any; code-echo rejection | helper/fixture cluster | keep | self | Core behavior of the semantic-replacement path; largest checker contract (43 tests); in-file `_msg_ids`/`_semantic_disabled` | checkers |
+  | test_tmp_path_checker.py (219/27) | W9702 tempfile in tests; non-test/non-tempfile/context-manager skips; path patterns | none | rewrite | keep `:1-160` detection/skip rows | `TestImportVariants` `:169-186` and edge rows deliberately pin "checker currently does NOT catch" gaps; `_matches_path` private cases are implementation detail | checkers |
+  | test_trivial_wrapper_checker.py (259/19) | W9728 trivial wrapper; overload/abstract/self/recursive/signature skips | none | keep | self | Unique checker behavior | checkers |
+  | test_unnamed_tuple_dict_checker.py (99/2) | bare tuple literals as dict values | none | keep | self | Unique checker behavior | checkers |
+  | assumptions/test_astroid_contracts.py (153/4) | astroid stream/doc_node/nodes_of_class/span contracts | none | keep | self | Required third-party assumption pinning (intent: assumptions first) | checkers |
+  | assumptions/test_pylint_contracts.py (175/3) | pylint register/release_messages/message-def tuple contracts | none | keep | self | Required third-party assumption pinning | checkers |
+
+  ### Owner: runner
+
+  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
+  |---|---|---|---|---|---|---|
+  | test_autofix_conflict.py (449/20) | git changed-set snapshots, E999 canary parsing, target paths, env opt-out, observability, Windows drive-letter paths | none | keep + absorb apply | self | Core autofix limb; real branch logic | runner |
+  | test_autofix_conflict_apply.py (318/8) | conflict-aware apply: no-conflict/staged-only/unstaged-only/staged+unstaged skip/E999 revert/untracked revert | test_autofix_conflict.py | merge | test_autofix_conflict.py | Same function under test; separate module adds no new behavior | runner |
+  | test_autofix_conflict_integration.py (251/6) | `run_lint(fix=True)` dispatch (`:41-118`); real-git integration (`:121-251`) | run_lint orchestration + conflict/apply | rewrite | keep real-git class `:121-251`; drop fake dispatch class | Fake dispatch duplicates run_lint routing; module was already trimmed 148 lines in 644774e | runner |
+  | test_baseline_diff.py (484/8) | compare_sorted, drift-resistant diff, error paths, flat records, multi-saved dedupe, 50k perf (`:170` slow) | canonical baseline | keep | self | Core baseline limb | runner |
+  | test_baseline_diff_parsers.py (485/9) | record parsers, capture schema v2/on-disk, capture_one edges, mixed schema, parser edges | baseline_diff + parsers_hypothesis + t3 | merge | test_baseline_diff.py + test_parsers_hypothesis.py | Record rows duplicate hypothesis parser tests; capture rows duplicate `test_lint_runner_integration.py:48-230` | runner |
+  | test_bench_runner_overhead.py (241/1, slow) | per-tool time/memory + runner overhead artifact | none | remove | none | **Zero `assert` statements** (grep) — computes PASS/FAIL only into artifact text; cannot gate regressions | runner |
+  | test_extra_tools.py (346/21) | extra-tool load/validate R4, merge semantics, build_command | fixture cluster | rewrite | self after fixture dedupe | `_isolate_registries` `:43` duplicates `tests/conftest.py:132`; `_isolate` `:218` is a no-op autouse fixture | runner |
+  | test_extra_tools_downstream.py (209/3, slow) | extras e2e, stats observability, startup perf | extra_tools + integration | rewrite | keep `:44-110`, `:160-209`; drop perf `:112-158` | Perf threshold duplicates startup memoization checks; e2e subset remains | runner |
+  | test_lint_runner.py (480/41) | ToolSpec table, strategy commands, path helpers, detect-secrets bootstrap, tach/pylintrc repo checks, skip lines, print, pyright summary | registry oracle + repo-state | rewrite | keep all but `TestTachConfig:310-328` + `TestPylintrcNoMaxComplexity:333-344` | Repo geography/config re-checks per broadened never-linting; 39 other tests are real behavior | runner |
+  | test_lint_runner_integration.py (414/19) | baseline capture/diff matrix/overwrite, run_lint orchestration, CLI/exit, run_cmd | canonical baseline/CLI | keep | self | Surviving CLI/exit + baseline pinning limb | runner |
+  | test_lint_runner_stats.py (382/29) | stats parse/aggregate, group/sort, T8 fail-fast, registry mirror, GenericLintTool, strategy fallback | registry oracle | rewrite | keep stats/group/GenericLintTool; drop `TestLintToolRegistry:225-260`; rename `test_t8_*:184-211` | Registry mirror duplicates `test_lint_runner.py:49-76`; task-ID test names violate naming | runner |
+  | test_parsers_hypothesis.py (432/66) | hypothesis invariants for all 14 parsers | none | keep | self | Only property-based layer; required by CodingRules `:276-286` | runner |
+  | test_real_pipeline_smoke.py (42/1, with_real_api) | spawns all 14 real tools; asserts tool names in output | integration.py + golden | remove | integration.py:57-125 + golden 158 findings | Strict subset of the golden e2e; not marked slow, so it spawns 14 real tools in the default suite | runner |
+  | test_runner_format_contract.py (157/12) | ruff format check/mutate modes, config discovery, registry constants, golden tool counts | registry + golden | rewrite | keep `:43-79`, `:131-149`; drop `TestRegistryConstants:80-128`, `TestGoldenToolCounts:151-157` | Registry/golden-count mirrors are source re-checks, not behavior | runner |
+  | test_runner_private_imports.py (20/1) | `runner.__all__` contains no private names | none | remove | none | Package-surface lint guard; prune precedent 644774e trimmed it 83→20 and deleted self-lint guards | runner |
+  | test_t1b_self_discovery.py (169/13) | default config paths, infer package name, yamllint config flag | none | rewrite | self as `test_runner_config_discovery.py` | Legit product behavior; only task-ID module name is defective | runner |
+  | test_t3_coverage.py (390/33) | parser completeness/edges, aggregate stats, observability, table edges | parsers_hypothesis + baseline parsers + stats | merge | test_parsers_hypothesis.py + test_lint_runner_stats.py | `TestParserCompleteness:32-65` mirrors the registry; edge rows duplicate parser tables; keep stats observability only | runner |
+  | test_t5_compose_ruff.py (366/21) | override fields, compose ruff, pyproject cache, run_lint wiring | test_t9_7 | merge/rename | `test_compose_configs.py` | Same config-composition limb as pyright; task-ID name | runner |
+  | test_t9_7_compose_pyright.py (281/15) | compose pyright fast paths/copy, run_lint wiring | test_t5 | merge/rename | `test_compose_configs.py` | Same limb; task-ID name | runner |
+
+  ### Owner: setup-testing
+
+  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
+  |---|---|---|---|---|---|---|
+  | test_setup.py (385/31) | atomic write, checksums, checker discovery, TOML helpers, state/update/CLI/templates/uv, module-size gates, drift | setup cluster | rewrite | keep all but `TestModuleSizeGates:326-345` | Source LOC + `.pyi` gates = repo-self-lint; remainder is product behavior | setup-testing |
+  | test_setup_install.py (373/7) | fresh/idempotent install, existing files, missing pyproject, step errors, install→lint downstream | setup + integration | rewrite | keep `:1-314`; fix/trim `TestDownstreamIntegration:315-373` | Downstream writes to `Path.home()/.tmp/t15-downstream` (`:319`) instead of `tmp_path`, runs real git/uv; `_UvCallRecorder` duplicates test_setup.py:39 | setup-testing |
+  | test_t11_health_checks.py (383/17) | `test_checked_main` argv; precommit config/shape validators; installed template | integration dry-run | rewrite | self as `test_testing_health_checks.py`; keep unit validators | Task-ID module name; installed-template slow case overlaps `integration.py::test_dry_run_hooks` | setup-testing |
+  | test_testing_fakes.py (197/9) | shipped testing fakes: `make_lint_result`, `FakeRunCmd` dict/list dispatch, capture, no-subprocess smoke | none | keep | self | `src/python_setup_lint/testing.py` is **shipped product API** (`FakeRunCmd`, `test_checked_main`, precommit validators), not test-only infra | setup-testing |
+  | test_setup_config_symlinks.py (162/7) | symlink/copy fallback, matching-content skip, tach skip, bundled configs | setup cluster | keep | self | Product setup behavior; bundled-config case is a packaging check | setup-testing |
+  | test_setup_precommit.py (176/7) | ruff version resolution/fallbacks, existing config skip, template format | setup cluster | keep | self | Product setup behavior | setup-testing |
+
+  ### Owner: root
+
+  | module | behaviors protected | dup-of | rec | surviving coverage | reason | owner |
+  |---|---|---|---|---|---|---|
+  | integration.py (498/9) | full pipeline golden 158, config overlay, resetup idempotence, dry-run hooks, install→lint, baseline relative paths, tool parity, rumdl guard | canonical | keep | self | AGENTS.md:87-93 fit-for-purpose gate; not slow | root |
+  | test_golden.py (414/30) | synthetic golden helpers: serialize/diff/coverage/update/env | tests/_golden.py | rewrite | keep pure serialize/diff/oracle-coverage contracts; drop `_stub_collect_pipeline` `:197-235` and redundant env/isolation | Tests test infrastructure (legitimate) but first-party monkeypatches runner internals; trim over-tested private helpers | root |
+
+  ### SKIPPED — semantic (epic-created)
+
+  | module | behaviors | disposition |
+  |---|---|---|
+  | test_semantic_check.py (133/9) | `_semantic` backend/score/cache/absence of sentence-transformers | SKIP (semantic) |
+  | test_semantic_threshold.py (164/1) | 115-row heuristic outcome table | SKIP (semantic) |
+  | test_decision_backend.py (337/25) | DecisionBackend protocol/loader/veto/heuristic; packaging pins | SKIP (semantic decision) |
+  | assumptions/test_pylint_cache_semantics.py (355/16) | in-process memo, path-free API, pylint jobs single-writer, concurrency | SKIP (semantic cache) |
+  | assumptions/test_beartype_contracts.py (65/1) | TYPE_CHECKING-only forward refs | SKIP (runtime) |
+
+  ## 3. Support/factory modules and consolidation
+
+  | module(s) | LoC | findings / recommendation |
+  |---|---|---|
+  | tests/checkers/_factories*.py (8 files) | 1,513 | `_make_tc`-based walk helpers duplicated across test files; `list[Any]` at `_factories_stub.py:269,394,442`, `_factories_stub_class.py:151`, `_factories_stub_docstring.py:154`. Split by checker family is fine; consolidate walk/emit helpers into one `_checker_harness.py` and drop per-test aliases. |
+  | tests/runner/_factories*.py + `_autofix_helpers.py` (6 files) | 1,500 | `_factories_tables.py` (394) is a C0302-driven split of `_factories.py`; `extra_block` duplicated at `_factories.py:174` and `_factories_extras.py:45`; `_factories_baseline.py` (279) holds the diff matrix and 17 `dict[str, Any]` helpers. Merge `extra_block`; keep tables; move diff matrix into `test_baseline_diff.py` or a single table module. |
+  | tests/conftest.py | 169 | Keep; `isolated_runner_registries:132` is the canonical registry snapshot. |
+  | tests/_golden.py | 446 | Keep; golden snapshot infrastructure used by `integration.py`. |
+  | tests/_project_helpers.py | 204 | Keep, but rewrite `install_twice_assert_idempotent:200` (monkeypatches first-party `setup._run_uv`); prefer a stub `uv` on PATH or an injected boundary. |
+  | Dead helpers | — | Truly unreferenced: `_factories.py:167 assert_violation_contains_any`, `_factories.py:200 assert_r4_reason`, `_factories_baseline.py:26 baseline_entry_for_tool` (and its only callee `find_tool_entry:19` becomes dead). Remove. |
+
+  ## 4. Duplication clusters (measured)
+
+  | cluster | measured at HEAD | action |
+  |---|---|---|
+  | Checker unittest harness | `_make_tc` 13 defs, `_walk_and_release` 10, `_msg_ids` 8 across 13/10/8 files; shipped equivalents at `src/python_setup_lint/testing.py:18-42` | one `tests/checkers/_checker_harness.py` (or import shipped helpers directly); delete aliases |
+  | Registry oracle | `test_lint_runner.py:49-76` (TestToolSpec), `test_lint_runner_stats.py:225-260` (TestLintToolRegistry), `test_runner_format_contract.py:80-128` (TestRegistryConstants), `test_t3_coverage.py:32-65` (TestParserCompleteness), `_factories.EXPECTED_BUILTIN_TOOL_NAMES` | keep **one** oracle (TestToolSpec + `EXPECTED_BUILTIN_TOOL_NAMES`); remove mirrors |
+  | Baseline | `test_baseline_diff.py` 484, `test_baseline_diff_parsers.py` 485, `test_lint_runner_integration.py:48-230`, `integration.py:295-330` | merge parsers into baseline/hypothesis; keep core + integration |
+  | Parser contracts | `test_parsers_hypothesis.py` 432/66, `test_t3_coverage.py` 390/33, `test_baseline_diff_parsers.py` 485/9 | hypothesis layer stays; merge edge tables into it; delete per-tool echo rows |
+  | Autofix | 3 modules / 1,018 LoC | merge apply + real-git into `test_autofix_conflict.py`; drop fake dispatch |
+  | Stub family | 7 test modules / 1,742 LoC + 8 factories / 1,513 LoC | merge to `test_stub_checker.py` + one invariants module; keep E97B1-B4/W97B5 fired rows |
+  | Setup uv recorder | `_UvCallRecorder` at `test_setup.py:39`, `test_setup_install.py:36` | one conftest fixture/helper |
+  | Semantic test doubles | `_RecordingBackend` at decision:44, semantic_check:25, cache_semantics:80 | all SKIPPED; no action now |
+  | Extra fixtures | `extra_block` x2; `_isolate_registries` `test_extra_tools.py:43` vs conftest:132; `_isolate:218` no-op | delete in-file copies; use conftest |
+  | Semantic env fixture | `_semantic_disabled` at bare_except:38 and suppression:24 | one conftest autouse fixture |
+  | Golden | integration golden 158 + `test_real_pipeline_smoke` 42 + `TestGoldenToolCounts` | golden/integration is canonical; remove smoke + counts mirror |
+  | Setup downstream | `integration.py::test_install_then_lint_clean_project`, `test_setup_install.py::TestDownstreamIntegration:315-373`, `test_t11:369-383` | keep integration + one slow template check; rewrite/fix the `$HOME` test |
+
+  ## 5. CodingRules-Tests violations
+
+  Rule lines: `CodingRules.md:240-254` (mocking), `:256-274` (categories/markers), `:276-286` (quality/hypothesis/golden/factories), `:288-295` (naming), `:297-306` (fixture scope/conftest). Markers declared at `pyproject.toml:49-55`.
+
+  | rule | evidence | affected modules |
+  |---|---|---|
+  | Mock only true external boundaries; never mock first-party | 35 `monkeypatch.setattr(..., _run_cmd)` sites in 12 files (`test_autofix_conflict*`, `test_t5`, `test_t9_7`, `test_lint_runner*`, `test_t3`, `test_extra_tools_downstream`, `test_testing_fakes`, `test_runner_format_contract`, `_factories.py`); `python_setup_lint.setup._run_uv` at `_project_helpers.py:200`; runner internals at `test_golden.py:208-215` | runner suite, test_golden, _project_helpers |
+  | Names `test_<method>_given_<condition>_then_<expected>` | 307/793 lack both (296 neither, 11 partial); task-ID modules `test_t1b`/`test_t3`/`test_t5`/`test_t9_7`/`test_t11` = 1,589 LoC / 99 tests; `test_t8_*` names at `test_lint_runner_stats.py:184,200,211` | 5 runner modules + stats |
+  | Category markers (`no_external_api` / `with_real_api` / `implementation_detail` / `slow`) | 24 modules (20 non-skipped) carry no category mark; `implementation_detail` used 0× despite many private-helper tests; only `test_real_pipeline_smoke` uses `with_real_api` and it is not slow | checker tests (14), integration, autofix integration, t1b/t3, setup symlinks/precommit, test_golden |
+  | No shared fixtures in test files; conftest scope | `_restore_structlog_wrapper` `test_stub_checker.py:23`; `_isolate_registries` `test_extra_tools.py:43`; `_isolate` `:218`; `_isolate_golden_env` `test_golden.py:38`; plus 2 skipped semantic fixtures; no `tests/checkers/conftest.py` | checkers, runner, root |
+  | Reuse test code across success/failure paths; factories for complex objects | duplicate clusters in §4; `_factories.py` `list[Any]`/`dict[str, Any]` 104 occurrences (47 list, 57 dict); exact list[Any] sites `_factories_stub.py:269,394,442`, `_factories_stub_class.py:151`, `_factories_stub_docstring.py:154`; `_factories_baseline.py` 17 dict[str, Any] | checkers/runner factories |
+  | Isolation: independent, no shared mutable state; use tmp_path | `test_setup_install.py:319` writes to `Path.home()/.tmp/t15-downstream` and runs real git/uv; `tests/data/minimal_sample_project/tests/test_tempfile.py` is **collected as a test** (1 case) and leaks `mkdtemp` | setup-testing, fixture data |
+  | Far/repo-state cases | tach.toml `.pylintrc` checks, source LOC gates, registry mirrors, golden tool counts, sentence-transformers migration pin, Windows drive-letter paths (`test_autofix_conflict.py:400-449`), import-variant gap pins (`test_tmp_path_checker.py:169-186`), 50k perf | runner/setup/checkers |
+
+  ## 6. Repo-self-lint removal candidates (broadened never-linting definition)
+
+  Precedent 644774e deleted `test_self_lint_clean.py` (59), `test_config_consistency.py` (86), `test_pyright_noise_filter.py` (113), `test_t9_7_compose_pyright_live.py` (197), trimmed `test_runner_private_imports.py` 83→20 and `test_autofix_conflict_integration.py` -148. HEAD retains these analogues:
+
+  | candidate | evidence | surviving coverage | verdict |
+  |---|---|---|---|
+  | `test_runner_private_imports.py` (20/1) | `:16-20` asserts `runner.__all__` has no `_` names | none | remove (broadened definition); if public-API policy requires it, keep with an explicit rationale |
+  | `test_lint_runner.py::TestTachConfig` | `:310-328` asserts repo `tach.toml` exists/declares source roots | integration sample runs `tach check` | remove |
+  | `test_lint_runner.py::TestPylintrcNoMaxComplexity` | `:333-344` reads shipped `.pylintrc` | integration/golden pylint run exercises shipped rcfile | remove |
+  | `test_setup.py::TestModuleSizeGates` | `:326-345` `inspect.getsource` LOC ceilings + `.pyi` declaration count | none (structural) | remove |
+  | `test_runner_format_contract.py::TestRegistryConstants` + `TestGoldenToolCounts` | `:80-128`, `:151-157` mirror `EXPECTED_*` and golden 14-key file | `test_lint_runner.py::TestToolSpec` + golden | remove |
+  | `test_lint_runner_stats.py::TestLintToolRegistry` | `:225-260` mirrors STRATEGIES/LINT_TOOLS | `test_lint_runner.py:49-76` | remove |
+  | `test_t3_coverage.py::TestParserCompleteness` | `:32-65` asserts every tool has a parser | union of parser tests/golden | remove |
+  | `test_no_try_import_checker.py:27-39` | deleted sentence-transformers dependency pins | W9706 pattern tests | remove |
+  | `test_setup_config_symlinks.py::test_works_with_real_bundled_configs` | real bundled config files | setup install tests + golden | keep (packaging behavior) or remove if strict |
+  | `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` | already absent at HEAD (644774e) | — | no action; but see blocking debt §7 |
+
+  ## 7. Slow / benchmark inventory
+
+  | module | slow marker | notes |
+  |---|---|---|
+  | test_baseline_diff.py | class `:170` (2 tests) | 50k-line perf ceilings; class-level slow works |
+  | test_bench_runner_overhead.py | `:118` (1) | zero asserts; writes `tmp_path/bench-runner-overhead.md`; cannot fail |
+  | test_extra_tools_downstream.py | `:111` (1) | startup overhead <10%; non-gating perf |
+  | test_lint_runner_integration.py | `:404` (1) | RLIMIT_AS OOM; legitimately slow |
+  | test_setup_install.py | `:315` (1) | real install/git/uv, `$HOME` temp |
+  | test_t11_health_checks.py | class `:369` (1) | real `pre-commit validate-config` |
+  | test_real_pipeline_smoke.py | none (module `with_real_api`) | spawns 14 real tools in default suite; should be slow or removed |
+
+  Default-suite collection: 1,364 collected / 7 deselected. Fixture leak: `tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir` is collected (1 case) — should be `collect_ignore`d or excluded by `norecursedirs`.
+
+  ## 8. Per-limb pinning inventory
+
+  | limb | current pinning | surviving test after debloat | blocking debt |
+  |---|---|---|---|
+  | **CLI / exit** | No `test_cli_*` file (naming debt). `test_lint_runner_integration.py:282-307` (argparse flags + `--help`/unknown SystemExit), `:309-369` (`run_lint` exit nonzero, baseline roundtrip); `test_lint_runner_stats.py:120-135` (group/sort forwarding), `:378-383` (invalid group); `test_setup.py:243-293` (setup install/update/bad subcommand) | `test_lint_runner_integration.py::TestMainCLI` + `TestRunLintIntegration` + `test_lint_runner_stats` group tests | none; optional rename to `test_cli_*` when normalizing names |
+  | **Baseline** | `test_baseline_diff.py` (core), `test_baseline_diff_parsers.py` (parsers/capture), `test_lint_runner_integration.py:48-230` (capture/diff/overwrite), `integration.py:295-330` (relative paths) | `test_baseline_diff.py` + `test_lint_runner_integration.py` + `integration.py:295-330` | none; merge parsers |
+  | **Autofix** | `test_autofix_conflict.py` (449), `test_autofix_conflict_apply.py` (318), `test_autofix_conflict_integration.py:41-251` | conflict/apply merged + real-git class `:121-251` | none |
+  | **Configs / scopes** | `integration.py:147-182` overlay, `:390-420` rumdl guard; `test_t5_compose_ruff.py`; `test_t9_7_compose_pyright.py`; `test_t1b_self_discovery.py`; `test_extra_tools.py` | merged `test_compose_configs.py` + t1b + extra_tools + integration overlay/rumdl | **BLOCKING DEBT:** shipped rcfile parity (`config/.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi` DESIGN/STUB-CHECKER sections) lost when `test_config_consistency.py` was deleted in 644774e; no surviving parity test. `test_pylint_cache_semantics.py::TestPylintRcfileJobsWatchdog` is semantic-skipped. |
+
+  ## 9. Estimated debloat
+
+  | cluster | LoC estimate |
+  |---|---|
+  | Remove whole modules (bench 241 + real smoke 42 + private imports 20) | 303 |
+  | Stub family merge (7 test modules 1,742 + factories 1,513) | 700-900 |
+  | Parser/baseline triplication consolidation | 500-650 |
+  | Autofix module merge | 200-280 |
+  | Checker harness/helper dedupe (13+10+8 aliases, fixtures) | 150-220 |
+  | Golden synthetic trim (`test_golden.py`) | 150-220 |
+  | Registry / repo-state / config re-check removals | 120-180 |
+  | Ruff+pyright compose merge | 150-220 |
+  | Perf/bench/downstream trims | 100-150 |
+  | Fixture/recorder/dedupe | 60-100 |
+  | **Total** | **≈2.3-3.0k LoC (13-17%)** |
+
+  Surviving contract floor: golden 158 findings + `integration.py` 9 tests + checker rule tests + assumption tests + baseline/CLI/autofix/config limb tests named above.
+contextPack: >-
+  # Test debloat audit — handoff facts
+
+  - HEAD e2ffb19; tests/** = 18,124 LoC / 78 modules / 793 test functions /
+  1,357 default cases.
+
+  - Owners (ADR-011 five-owner taxonomy, UNIFIED map unavailable): checkers 24
+  modules/6,233 LoC; runner 19/7,416; setup-testing 6/1,676; root 5/1,745;
+  semantic-skipped 5/1,054.
+
+  - Top debloat targets: stub family (7 tests/1,742 + 8 factories/1,513),
+  parser/baseline triplication (~1,400), autofix 3 modules/1,018, golden
+  synthetic 414, registry mirrors (~5 places), repo-state checks
+  (tach/.pylintrc/LOC gates/sentence-transformers pin), bench with zero asserts,
+  real smoke not slow.
+
+  - Keep: integration.py (golden 158, not slow), checker behavior tests,
+  astroid/pylint assumption contracts, shipped `python_setup_lint.testing` fakes
+  tests, baseline_diff, TestMainCLI/exit, autofix apply/real-git, compose
+  configs, extra tools.
+
+  - Blocking debt: rcfile parity unguarded since test_config_consistency.py
+  deletion (644774e). Fixture test data/minimal.../test_tempfile.py is collected
+  and leaks mkdtemp; setup downstream writes $HOME/.tmp.
+
+  - Semantic files SKIPPED; test_semantic_check.py is 133 lines (citation
+  :159-257 stale).
+sources:
+  - tests/** (78 modules at HEAD e2ffb19)
+  - src/python_setup_lint/testing.py:18-42
+  - tests/data/golden/minimal_sample_project_findings.json (158 findings)
+  - tests/data/golden/minimal_sample_project_tool_counts.json (14 keys)
+  - CodingRules.md:230-306
+  - AGENTS.md:87-93
+  - pyproject.toml:48-55
+  - docs/adr/ADR-011.md:9
+  - docs/adr/ADR-013.md:3
+  - docs/adr/ADR-022.md:3
+  - git show 644774e (deleted test_self_lint_clean.py,
+    test_config_consistency.py, test_pyright_noise_filter.py,
+    test_t9_7_compose_pyright_live.py; trimmed test_runner_private_imports.py
+    83->20)
+recommendations:
+  - Confirm the owner column against coding-rules-audit's UNIFIED map before
+    implementing; this audit used ADR-011's five-owner taxonomy because the map
+    was not present in the prompt/inter-dep.
+  - "Delete zero-value modules first: test_bench_runner_overhead.py (zero
+    asserts), test_real_pipeline_smoke.py (golden/integration subset, not slow),
+    test_runner_private_imports.py (API lint guard), and the repo-state classes
+    TestTachConfig/TestPylintrcNoMaxComplexity/TestModuleSizeGates/TestRegistry\
+    Constants/TestGoldenToolCounts/TestLintToolRegistry/TestParserCompleteness."
+  - Consolidate the stub family into test_stub_checker.py plus one fired-message
+    invariants module; delete pure-helper/export-surface duplicates and shrink
+    the 8 factory files.
+  - Merge autofix apply + real-git integration into test_autofix_conflict.py;
+    keep the staged/unstaged skip and E999 revert branches.
+  - Merge test_baseline_diff_parsers.py into test_baseline_diff.py +
+    test_parsers_hypothesis.py; merge test_t3 parser edges into the hypothesis
+    table and keep only stats/observability tests.
+  - Replace 13/10/8 local _make_tc/_walk_and_release/_msg_ids aliases with one
+    tests/checkers harness (shipped helpers already exist in
+    src/python_setup_lint/testing.py).
+  - "Rewrite first-party mocking: add an explicit run_cmd injection seam to
+    run_lint/_run_tool_pipeline or route tests through FakeRunCmd; stop
+    monkeypatching _run_cmd across 12 files and setup._run_uv at
+    tests/_project_helpers.py:200."
+  - "Fix isolation defects: use tmp_path in
+    test_setup_install.py::TestDownstreamIntegration (currently
+    $HOME/.tmp/t15-downstream), and exclude tests/data from collection (add
+    collect_ignore/norecursedirs) so the planted test_tempfile.py is not run."
+  - Add missing category markers and use implementation_detail for
+    private-helper tests; rename the five task-ID modules and reject new
+    test_t*/test_t8_* names.
+  - Before removing repo-state/config checks, add a single shipped-rcfile parity
+    test (DESIGN/STUB-CHECKER sections across config/.pylintrc, .pylintrc-tests,
+    .pylintrc-pyi); this closes the blocking debt left by 644774e.
+concerns:
+  - kind: assumption
+    summary: coding-rules-audit UNIFIED ownership map was unavailable in the
+      prompt/inter-dep
+    detail: ADR-013 states the map lives in orchestration records, which this agent
+      must not inspect. Owners were aligned to ADR-011's visible five-owner
+      taxonomy (runner/checkers/setup-testing/semantic/root); downstream
+      implementation must confirm each row against the UNIFIED map rather than
+      treating these labels as authoritative.
+    severity: medium
+    affects:
+      - test-debloat-audit
+      - test-debloat-impl
+  - kind: tech-debt
+    summary: Shipped rcfile parity is unguarded after test_config_consistency.py
+      deletion
+    detail: 644774e deleted the only test enforcing DESIGN/STUB-CHECKER consistency
+      across config/.pylintrc, config/.pylintrc-tests and config/.pylintrc-pyi.
+      No surviving parity test exists; the semantic jobs watchdog that touches
+      rcfiles is SKIPPED. Removing further config re-checks would deepen this
+      debt.
+    severity: medium
+    location:
+      file: tests/runner/test_config_consistency.py
+      line: 1
+    affects:
+      - test-debloat-audit
+      - config-parity
+      - test-debloat-impl
+  - kind: risk
+    summary: Fixture data test file is collected and leaks a temp directory
+    detail: tests/data/minimal_sample_project/tests/test_tempfile.py::test_create_temp_dir
+      is collected in the default suite (verified with pytest --collect-only)
+      and calls tempfile.mkdtemp without cleanup. tests/data should be excluded
+      from collection.
+    severity: medium
+    location:
+      file: tests/data/minimal_sample_project/tests/test_tempfile.py
+      line: 10
+    affects:
+      - test-debloat-audit
+      - test-harness
+  - kind: risk
+    summary: Benchmark test has zero assertions and cannot gate regressions
+    detail: tests/runner/test_bench_runner_overhead.py contains no assert statement;
+      it computes PASS/FAIL only into a tmp_path artifact and prints. It is
+      marked slow but provides no enforcement.
+    severity: low
+    location:
+      file: tests/runner/test_bench_runner_overhead.py
+      line: 118
+    affects:
+      - test-debloat-audit
+      - benchmark-policy
+  - kind: tech-debt
+    summary: Marker taxonomy is effectively unenforced
+    detail: 24 modules (20 non-skipped) have no category marker and
+      implementation_detail is used 0 times despite extensive private-helper
+      tests. This makes marker-based selection (unit vs real API vs
+      implementation detail) unreliable.
+    severity: medium
+    location:
+      file: pyproject.toml
+      line: 49
+    affects:
+      - test-debloat-audit
+      - test-harness
+  - kind: assumption
+    summary: test_testing_fakes.py must not be removed as test-infra-only coverage
+    detail: src/python_setup_lint/testing.py is shipped product API (FakeRunCmd,
+      make_lint_result, test_checked_main, precommit validators), not test-only
+      infrastructure. The debloat plan should keep test_testing_fakes.py;
+      removing it would drop shipped-API coverage.
+    severity: low
+    location:
+      file: src/python_setup_lint/testing.py
+      line: 45
+    affects:
+      - test-debloat-audit
+      - setup-testing
+  - kind: risk
+    summary: Real-pipeline smoke test runs 14 real tools in the default suite (not slow)
+    detail: tests/runner/test_real_pipeline_smoke.py is with_real_api but lacks
+      @pytest.mark.slow, so `uv run pytest -q` (addopts -m 'not slow') spawns 14
+      real tools. It is a strict subset of integration.py's golden run.
+    severity: low
+    location:
+      file: tests/runner/test_real_pipeline_smoke.py
+      line: 16
+    affects:
+      - test-debloat-audit
+      - test-harness
+  - kind: question
+    summary: Removing test_runner_private_imports.py broadens the never-linting
+      definition
+    detail: The prune precedent 644774e kept this guard after trimming it. Removing
+      it now assumes public-API lint guards are also out of scope; this needs an
+      explicit policy call rather than a mechanical deletion.
+    severity: low
+    location:
+      file: tests/runner/test_runner_private_imports.py
+      line: 16
+    affects:
+      - test-debloat-audit
+      - policy
+  - kind: tech-debt
+    summary: Assignment citation for semantic_check.py is stale/out of range
+    detail: tests/checkers/test_semantic_check.py is 133 lines at HEAD, so the cited
+      :159-257 cannot exist. Downstream semantic items should re-cite against
+      HEAD to avoid planning on a stale branch state.
+    severity: low
+    location:
+      file: tests/checkers/test_semantic_check.py
+      line: 133
+    affects:
+      - test-debloat-audit
+      - semantic items
+remarkable:
+  - chosen: Infer owners from ADR-011's visible five-owner taxonomy and flag the gap
+    why: The UNIFIED map from coding-rules-audit was not injected and the
+      alternative (inspecting orchestration records) violates containment.
+    alternatives:
+      - Block the audit until the map is provided
+      - Invent new owner labels
+      - Treat every module as root-owned
+  - chosen: Keep tests for shipped python_setup_lint.testing and treat it as product
+      coverage
+    why: src/python_setup_lint/testing.py exposes FakeRunCmd, make_lint_result,
+      test_checked_main and precommit validators to consumers; deleting
+      test_testing_fakes.py would drop shipped-API coverage.
+    alternatives:
+      - Remove it as test-infra self-test
+      - Move testing.py out of the shipped package
+  - chosen: Delete the zero-assert benchmark instead of fixing its threshold
+    why: It cannot fail, duplicates startup-overhead checks, and is slow-only; no
+      lint/check behavior is lost.
+    alternatives:
+      - Add an assert and keep it slow
+      - Convert to a documented script outside pytest
+  - chosen: Merge the stub family rather than delete it
+    why: E97B1-B4/W97B5 fired-message invariants are material checker behavior;
+      duplication is in pure helpers, exports and fixture wiring, not in the
+      invariants themselves.
+    alternatives:
+      - Delete redundant pure-helper tests only
+      - Keep 7 modules and only dedupe factories
+  - chosen: Use integration.py + 158-finding golden as canonical end-to-end coverage
+      and remove the real smoke test
+    why: The smoke test asserts only tool-name presence on a synthetic project, a
+      strict subset of the golden run, and unnecessarily spawns 14 real tools in
+      the default suite.
+    alternatives:
+      - Keep smoke as a fast real check
+      - Mark smoke slow and keep it
+  - chosen: Consolidate checker unittest helpers into a tests/checkers harness
+      instead of changing the shipped testing.py surface
+    why: Keeps the shipped public API stable and localizes test-only aliases;
+      shipped helpers can still be imported directly.
+    alternatives:
+      - Extend python_setup_lint.testing with more helpers
+      - Leave 13/10/8 aliases in place
diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
index dd41b60..de18d16 100644
--- a/.factory/tasks/modernize/journal.ndjson
+++ b/.factory/tasks/modernize/journal.ndjson
@@ -2252,41 +2252,3 @@
 {"type":"step_started","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-regen-hatch/.factory/tasks/modernize/items/golden-regen-hatch/steps/001-develop-r1-a1","ts":"2026-11-10T00:28:18.414Z"}
 {"type":"step_timeout_armed","task":"modernize","item":"golden-regen-hatch","step":"develop","timeoutSec":5400,"ts":"2026-11-10T00:28:18.418Z"}
 {"type":"step_transcript_size_warning","task":"modernize","item":"golden-regen-hatch","step":"develop","attempt":1,"sizeBytes":5855128,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-28-18-722Z_01a1c2db-0fa2-75f0-aecb-0c9ff070f6d3.jsonl","ts":"2026-11-10T00:33:46.603Z"}
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
index 64b8b5b..f54a6ca 100644
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
@@ -257,12 +257,12 @@ items:
     mergedAt: 2026-11-08T10:47:48-05:00
   epic-shift-report-collection:
     kind: fact-finder
-    status: ready
+    status: running
     branch: topic/modernize--epic-shift-report-collection
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.04926
-    currentStep: review
+    spendUsd: 0.040594
+    currentStep: research
   remaining-lint-violations-fix:
     kind: no-behavior
     status: merged
@@ -301,12 +301,12 @@ items:
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
@@ -317,12 +317,11 @@ items:
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
@@ -346,9 +345,9 @@ items:
     status: running
     branch: topic/modernize--final-gate-validation
     attempts: 1
-    fixRounds: 2
-    spendUsd: 0.069515
-    currentStep: review
+    fixRounds: 1
+    spendUsd: 0.052455
+    currentStep: research
   semantic-tests-rewrite:
     kind: test-only
     status: blocked
@@ -358,12 +357,11 @@ items:
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
@@ -425,12 +423,12 @@ items:
     branch: topic/modernize--docs-counts-sync
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.051479
-    currentStep: develop
+    spendUsd: 0.033694
+    currentStep: test-first
 concerns:
-  open: 6
+  open: 24
   dismissed: 0
-  routed: 29
+  routed: 1
   resolved: 2
 debt:
   - No compliant model proven (215/0 unevaluable, single-author labels, Fastino
@@ -471,56 +469,6 @@ debt:
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
   - "[adr-formalization] ADR-012 examples could include conformance/ path prefix"
   - "[adr-formalization] H1 heading prefix inconsistent between new and legacy
     ADRs"
@@ -651,11 +599,6 @@ debt:
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
@@ -684,15 +627,6 @@ debt:
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
@@ -716,16 +650,6 @@ debt:
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
@@ -743,20 +667,6 @@ debt:
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
   - "[golden-helpers-unit] tool_minimums imports TOOLS via package root, pulling
     CLI structlog side effects"
   - "[golden-helpers-unit] Public FindingKey alias missing from __all__"
@@ -778,20 +688,20 @@ debt:
     obscure"
   - '[consolidate-integration-helpers-v3] make_consumer_project hardcodes
     "consumer" dirname for hooks test'
-budgetSpentUsd: 12.988823685999996
+budgetSpentUsd: 12.630543685999996
 spendByRole:
   workhorse:
-    costUsd: 6.130492685999999
-    inputTokens: 12388371
-    outputTokens: 4477517
+    costUsd: 5.907719685999999
+    inputTokens: 11607284
+    outputTokens: 4337356
   alt-workhorse:
-    costUsd: 1.5968480000000007
-    inputTokens: 7615104
-    outputTokens: 2728957
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
@@ -922,29 +832,29 @@ spendByItem:
     inputTokens: 713974
     outputTokens: 167344
   final-gate-validation:
-    costUsd: 0.069515
-    inputTokens: 174991
-    outputTokens: 92470
+    costUsd: 0.052455
+    inputTokens: 95165
+    outputTokens: 54227
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
+    costUsd: 0.104406
+    inputTokens: 187879
+    outputTokens: 83867
   epic-shift-report-collection:
-    costUsd: 0.04926
-    inputTokens: 160531
-    outputTokens: 43523
+    costUsd: 0.040594
+    inputTokens: 88261
+    outputTokens: 36328
   decision-cache-impl:
     costUsd: 0.393308
     inputTokens: 802730
@@ -953,18 +863,10 @@ spendByItem:
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
@@ -974,7 +876,7 @@ spendByItem:
     inputTokens: 1215172
     outputTokens: 444746
   (orchestration):
-    costUsd: 6.349675999999999
-    inputTokens: 24802345
-    outputTokens: 2201503
-lastUpdated: 2026-11-10T02:23:12.305Z
+    costUsd: 6.273198999999999
+    inputTokens: 24056719
+    outputTokens: 2199382
+lastUpdated: 2026-11-10T00:28:02.172Z
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

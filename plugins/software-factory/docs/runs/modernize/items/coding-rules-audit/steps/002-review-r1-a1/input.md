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
- id: c-06946fc950
  kind: tech-debt
  severity: medium
  summary: Production-dead _baseline_helpers module is pinned only by tests
  affects:
    - coding-rules-audit
    - test-debloat-audit
- id: c-3ae71408be
  kind: tech-debt
  severity: low
  summary: peek_fallback_tools debt comment names a completed owner
  affects:
    - coding-rules-audit
    - runner
- id: c-8e15ccd01e
  kind: risk
  severity: medium
  summary: Semantic docs still describe the removed cross-encoder while the decision cache does not exist
  affects:
    - coding-rules-audit
    - decision-cache-impl
    - semantic-docs
- id: c-dfa834a16b
  kind: assumption
  severity: low
  summary: LoC deltas are gross estimates; public renames offset stub deletion
  affects:
    - coding-rules-audit
- id: c-ff4279a5ad
  kind: tech-debt
  severity: high
  summary: W9707 .pyi enforcement is blind, so 203 private stub declarations are unguarded
  affects:
    - coding-rules-audit
    - pylint-pyi
    - stub-cleanup
- id: c-3e5007b429
  kind: assumption
  severity: low
  summary: Accepted deletion of the two slow self-lint guard tests instead of resurrecting them with item-side import fixes.
  affects:
    - tests/runner/test_pyright_noise_filter.py
    - tests/runner/test_self_lint_clean.py
- id: c-698cedaf11
  kind: risk
  severity: medium
  summary: Merge result is byte-identical to the parent tip for every non-.factory path, so the item branch contributes no code deltas of its own.
  affects:
    - tests/_project_helpers.py
    - tests/conftest.py
    - tests/integration.py
- id: c-b8537d4f8c
  kind: tech-debt
  severity: low
  summary: "Stale doc references: _project_helpers docstring still names 'the self-lint guards' (now pruned) and AGENTS.md test counts are outdated."
  affects:
    - AGENTS.md


- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
- Raise concerns with evidence when review uncovers new cross-cutting issues.

## Assignment
{
  "slug": "coding-rules-audit",
  "kind": "fact-finder",
  "title": "Inventory CodingRules violations",
  "assignment": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS at final state (post-golden/assumptions/consolidate; read beartype discovery report from third-party item). No repo writes; output is structured item-report tables (durable in orchestration records, no committed file). Semantic exclusions marked SKIPPED (audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output rows {module,section,evidence file:line,category,est LoC delta,owner,fix} + UNIFIED disjoint-ownership map (this audit is SINGLE owner; test-debloat-audit consumes via inter-dep). Deps: read golden + helper final state; beartype report informs owner/fix.",
  "outlineRef": "coding-rules-audit",
  "milestone": "M3",
  "wave": 4,
  "deps": [
    "golden-findings-snapshot",
    "third-party-assumption-tests",
    "consolidate-integration-helpers"
  ],
  "scenarioRefs": [
    "M3: Coding-rules debt inventoried",
    "M3: Ownership map is complete and disjoint"
  ],
  "citations": [
    "CodingRules.md:90-107",
    "CodingRules.md:139-159",
    "src/python_setup_lint/checkers/_semantic.py:1-12",
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "src/python_setup_lint/checkers/_base.py:142-158",
    "src/python_setup_lint/runner/baseline.py:22-42",
    "lint.baseline:1-1"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/concerns/c-06946fc950.yaml b/.factory/tasks/modernize/concerns/c-06946fc950.yaml
deleted file mode 100644
index 26dedf0..0000000
--- a/.factory/tasks/modernize/concerns/c-06946fc950.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-06946fc950
-kind: tech-debt
-summary: Production-dead _baseline_helpers module is pinned only by tests
-detail: runner/_baseline_helpers.py (82 lines) and its 31-line stub are unused
-  by src; tests/runner/test_baseline_diff.py:13 imports _compare_sorted.
-  Deleting it requires test-debloat coordination, otherwise the tests keep dead
-  code alive.
-location:
-  file: src/python_setup_lint/runner/_baseline_helpers.py
-  line: 1
-affects:
-  - coding-rules-audit
-  - test-debloat-audit
-severity: medium
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: coding-rules-audit
-  lastSeen: 2026-11-09T23:33:30.977Z
-createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-09T23:33:30.977Z
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
deleted file mode 100644
index 593fdbe..0000000
--- a/.factory/tasks/modernize/concerns/c-3ae71408be.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-3ae71408be
-kind: tech-debt
-summary: peek_fallback_tools debt comment names a completed owner
-detail: baseline.py:18-22 says the shim is debt owned by dispatch-split, but the
-  dispatch split is complete (dispatch.py is 449 lines, no C0302 disable). The
-  comment risks leaving an orphaned export chain; the audit assigns it to
-  runner.
-location:
-  file: src/python_setup_lint/runner/baseline.py
-  line: 18
-affects:
-  - coding-rules-audit
-  - runner
-severity: low
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: coding-rules-audit
-  lastSeen: 2026-11-09T23:33:30.977Z
-createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/c-3e5007b429.yaml b/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
deleted file mode 100644
index 27d6f8e..0000000
--- a/.factory/tasks/modernize/concerns/c-3e5007b429.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-3e5007b429
-kind: assumption
-summary: Accepted deletion of the two slow self-lint guard tests instead of
-  resurrecting them with item-side import fixes.
-detail: tests/runner/test_pyright_noise_filter.py and
-  tests/runner/test_self_lint_clean.py were deleted on the parent tip (commit
-  644774e 'never-test-linting-prune'); the item branch only touched one import
-  line in one of them. Deletion was chosen over re-adding, matching the
-  established prune direction, but it does drop the `pytest -m slow` guards for
-  runner output noise/self-lint.
-affects:
-  - tests/runner/test_pyright_noise_filter.py
-  - tests/runner/test_self_lint_clean.py
-severity: low
-status: open
-source:
-  record: 005-integrate-r1-a1
-  agent: developer
-  step: integrate
-  item: consolidate-integration-helpers-v3
-  lastSeen: 2026-11-09T23:49:50.606Z
-createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-09T23:49:50.606Z
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
deleted file mode 100644
index 9e537bd..0000000
--- a/.factory/tasks/modernize/concerns/c-698cedaf11.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-698cedaf11
-kind: risk
-summary: Merge result is byte-identical to the parent tip for every non-.factory
-  path, so the item branch contributes no code deltas of its own.
-detail: "The item's helper consolidation was independently (and more completely)
-  landed on topic/modernize via consolidate-integration-helpers-i2 /
-  golden-contract-hardening. A superset union therefore equals the parent tree:
-  our T4-conflict helper moves, integration.py rewiring and conftest re-export
-  are all redundant in the merged tree. If the factory expects item-specific
-  test deltas to be visible in the merge commit, they are not."
-affects:
-  - tests/_project_helpers.py
-  - tests/conftest.py
-  - tests/integration.py
-severity: medium
-status: open
-source:
-  record: 005-integrate-r1-a1
-  agent: developer
-  step: integrate
-  item: consolidate-integration-helpers-v3
-  lastSeen: 2026-11-09T23:49:50.606Z
-createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-09T23:49:50.606Z
diff --git a/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml b/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
deleted file mode 100644
index ea960d2..0000000
--- a/.factory/tasks/modernize/concerns/c-6f47dfe905.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
-id: c-6f47dfe905
-kind: tech-debt
-summary: ADR-011 names a test class that no longer exists and carries stale line
-  references
-detail: docs/adr/ADR-011.md:48-49 assigns the semantic block to
-  TestSuppressionRerankerPipeline, but grep finds no such class at HEAD; the
-  semantic-owned block is TestAnyElementCodeEcho at
-  tests/checkers/test_suppression_justification_checker.py:366-392. The same
-  ADR/map stale-line pattern affects _base.py:238 (now :244-246) and :143-238
-  (now :160-252).
-location:
-  file: docs/adr/ADR-011.md
-  line: 48
-affects:
-  - adr-formalization
-  - epic-checkers-modernize
-  - epic-semantic-infrastructure
-severity: medium
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-kickoff-gate
-  lastSeen: 2026-11-10T00:08:48.409Z
-createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T00:08:48.409Z
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
deleted file mode 100644
index 3643670..0000000
--- a/.factory/tasks/modernize/concerns/c-81b8a319de.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
-id: c-81b8a319de
-kind: blocker
-summary: Validated-map dependency was abandoned; no map-* report or drift list
-  existed to consume
-detail: ownership-map-revalidation exhausted its consult budget and was
-  abandoned. This gate had to reconstruct the map core and drift list at HEAD
-  1039df9 itself, so revision map-1039df9 is a gate-recorded amendment, not a
-  consumed validated-map artifact. Downstream consumers must cite this gate
-  report as the authority.
-location:
-  file: .factory/tasks/modernize/decisions/013-item-ownership-map-revalidation-abandon.yaml
-  line: 1
-affects:
-  - TD3-B2
-  - epic-kickoff-gate
-  - epic-shift-report-collection
-  - final-gate-validation
-severity: high
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-kickoff-gate
-  lastSeen: 2026-11-10T00:08:48.409Z
-createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T00:08:48.409Z
diff --git a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml b/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
deleted file mode 100644
index 3a50471..0000000
--- a/.factory/tasks/modernize/concerns/c-8d4b35b36c.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
-id: c-8d4b35b36c
-kind: tech-debt
-summary: ADR-011 shift-handoff contract remains 'Accepted' after epic
-  decomposition was abandoned
-detail: ADR-011 status is still 'Accepted' (docs/adr/ADR-011.md:5) and the ADR
-  index lists it as Accepted (docs/adr/README.md:30), while ADR-013:1-3 and
-  ADR-023:1-3 supersede epic decomposition and state there is no epic
-  close-up/handoff bottleneck. The stale accepted contract is why this stranded
-  item keeps being re-queued.
-location:
-  file: docs/adr/ADR-011.md
-  line: 5
-affects:
-  - docs-adr-reconciliation
-  - docs-adr-reconciliation-v2
-  - epic-shift-report-collection
-severity: medium
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-shift-report-collection
-  lastSeen: 2026-11-10T00:14:51.554Z
-createdAt: 2026-11-10T00:14:51.554Z
-updatedAt: 2026-11-10T00:14:51.554Z
diff --git a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml b/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
deleted file mode 100644
index b09bf91..0000000
--- a/.factory/tasks/modernize/concerns/c-8e15ccd01e.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
-id: c-8e15ccd01e
-kind: risk
-summary: Semantic docs still describe the removed cross-encoder while the
-  decision cache does not exist
-detail: AGENTS.md:82-85 and docs/semantic-justification.md:3-26,51-53 document
-  sentence-transformers/cross-encoder/reranker, but the tree contains
-  _decision_backend.py and no _decision_cache.py. Docs must not claim a
-  git-stored cache before the semantic cache item lands; this is root-owned
-  documentation updated with the semantic epic.
-location:
-  file: docs/semantic-justification.md
-  line: 3
-affects:
-  - coding-rules-audit
-  - decision-cache-impl
-  - semantic-docs
-severity: medium
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: coding-rules-audit
-  lastSeen: 2026-11-09T23:33:30.977Z
-createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml b/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
deleted file mode 100644
index bc6476f..0000000
--- a/.factory/tasks/modernize/concerns/c-96c102b8ae.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
-id: c-96c102b8ae
-kind: risk
-summary: Legacy golden-regen-hatch could misread a missing handoff as all-no-shift
-detail: The legacy hatch is allowed a no-op only 'If all three handoff sections
-  declare no-shift' (items/golden-regen-hatch/assignment.yaml:4-12). With zero
-  sections neither shift nor no-shift is established. Running it on this
-  findings file as a handoff would violate the reviewed-shift precondition; the
-  I5 plan replaces it with golden-regen-hatch-v2 consuming behavior-item
-  declarations (plan-5.3:882-898).
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
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-shift-report-collection
-  lastSeen: 2026-11-10T00:14:51.554Z
-createdAt: 2026-11-10T00:14:51.554Z
-updatedAt: 2026-11-10T00:14:51.554Z
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
deleted file mode 100644
index 71c5675..0000000
--- a/.factory/tasks/modernize/concerns/c-acdaf1b5b0.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
-id: c-acdaf1b5b0
-kind: question
-summary: ADR-013 stub says root-serialized delivery replaced epic decomposition
-  for iteration 4
-detail: docs/adr/ADR-013.md:1-3 claims epics were replaced by root-serialized
-  delivery; if that stub is accepted, the per-epic tables are ownership evidence
-  rather than a live spawn gate. The stub is not a full
-  Context/Decision/Consequences ADR at HEAD, so this gate keeps the ADR-011
-  spawn contract and records the conflict for root reconciliation.
-location:
-  file: docs/adr/ADR-013.md
-  line: 1
-affects:
-  - epic-checkers-modernize
-  - epic-kickoff-gate
-  - epic-runner-modernize
-  - epic-semantic-infrastructure
-severity: medium
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-kickoff-gate
-  lastSeen: 2026-11-10T00:08:48.409Z
-createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T00:08:48.409Z
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
deleted file mode 100644
index 5787fee..0000000
--- a/.factory/tasks/modernize/concerns/c-b8537d4f8c.yaml
+++ /dev/null
@@ -1,25 +0,0 @@
-id: c-b8537d4f8c
-kind: tech-debt
-summary: "Stale doc references: _project_helpers docstring still names 'the
-  self-lint guards' (now pruned) and AGENTS.md test counts are outdated."
-detail: tests/_project_helpers.py:1-6 mentions self-lint guards that no longer
-  exist. AGENTS.md:10-11 claims '1290 pass, 4 skip, 15 deselected' and '7 pass'
-  for integration, while the merged tree yields 1357 passed / 0 skip / 7
-  deselected and 9 integration tests. Both pre-date this merge (inherited from
-  the parent tip) and are outside the item's declared scope, so they were left
-  untouched.
-location:
-  file: tests/_project_helpers.py
-  line: 4
-affects:
-  - AGENTS.md
-severity: low
-status: open
-source:
-  record: 005-integrate-r1-a1
-  agent: developer
-  step: integrate
-  item: consolidate-integration-helpers-v3
-  lastSeen: 2026-11-09T23:49:50.606Z
-createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-09T23:49:50.606Z
diff --git a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml b/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
deleted file mode 100644
index d901eb8..0000000
--- a/.factory/tasks/modernize/concerns/c-c6f2d80623.yaml
+++ /dev/null
@@ -1,28 +0,0 @@
-id: c-c6f2d80623
-kind: blocker
-summary: "Legacy epic handoff item is unsatisfiable in I5: 0/3 epic close-ups
-  exist and the M2 replanAfter gate is absent"
-detail: "The three iteration-3 epics were never spawned (closeup-3: M2 zero
-  delivery; 086/087 close-ups: 'M2 epic work ... entirely outstanding'), and
-  iterations 4-5 abandoned epic decomposition (ADR-013:1-3; ADR-023:1-3;
-  plan-5.3:1013-1017). The item was resumed as a stranded record with state
-  'blocked' (state.yaml:257-263) even though plan-5.3 declares 'No replanAfter
-  gates' (:1277). Retries cannot produce the required artifacts; only a replan
-  can retire or re-scope it."
-location:
-  file: .factory/tasks/modernize/items/epic-shift-report-collection/assignment.yaml
-  line: 4
-affects:
-  - epic-shift-report-collection
-  - final-gate-validation
-  - golden-regen-hatch
-severity: high
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-shift-report-collection
-  lastSeen: 2026-11-10T00:14:51.554Z
-createdAt: 2026-11-10T00:14:51.554Z
-updatedAt: 2026-11-10T00:14:51.554Z
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
deleted file mode 100644
index 2f3cb64..0000000
--- a/.factory/tasks/modernize/concerns/c-dfa834a16b.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
-id: c-dfa834a16b
-kind: assumption
-summary: LoC deltas are gross estimates; public renames offset stub deletion
-detail: Private stub declarations that are imported cross-module cannot simply
-  be deleted; they must be renamed public, so the net reduction is lower than
-  the gross -165 LoC estimated for PYI-1..3. Use the rows as prioritization, not
-  as a precise budget.
-location:
-  file: src/python_setup_lint/checkers/_base.pyi
-  line: 18
-affects:
-  - coding-rules-audit
-severity: low
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: coding-rules-audit
-  lastSeen: 2026-11-09T23:33:30.977Z
-createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-09T23:33:30.977Z
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
deleted file mode 100644
index 35f277b..0000000
--- a/.factory/tasks/modernize/concerns/c-e5a3dfe193.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-e5a3dfe193
-kind: risk
-summary: Checkers owner count exceeds the ADR-011 ±5 drift budget by 3
-detail: Amended counts are 65/91/15/7/16 (sum 194); checkers +8 vs the 83
-  baseline, outside the +5 budget. The delta is fully enumerated (8 new
-  tests/checkers/_factories_*.py) and resolved by amendment A1, but any
-  validator applying 67/83/15/4/15 literally will fail this gate.
-location:
-  file: .factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml
-  line: 82
-affects:
-  - epic-checkers-modernize
-  - epic-runner-modernize
-  - epic-semantic-infrastructure
-severity: medium
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-kickoff-gate
-  lastSeen: 2026-11-10T00:08:48.409Z
-createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T00:08:48.409Z
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
deleted file mode 100644
index 39d2d25..0000000
--- a/.factory/tasks/modernize/concerns/c-ff4279a5ad.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-ff4279a5ad
-kind: tech-debt
-summary: W9707 .pyi enforcement is blind, so 203 private stub declarations are unguarded
-detail: PyiUnderscoreChecker sets _is_pyi from node.file; pylint maps a .pyi
-  path to the .py module file, so no W9707 fires even though extra_tools.pyi
-  alone has 19 private symbols. Fix PYI-4 before bulk stub cleanup or the
-  cleanup has no regression guard.
-location:
-  file: src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py
-  line: 40
-affects:
-  - coding-rules-audit
-  - pylint-pyi
-  - stub-cleanup
-severity: high
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: coding-rules-audit
-  lastSeen: 2026-11-09T23:33:30.977Z
-createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-09T23:33:30.977Z
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
diff --git a/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml b/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml
deleted file mode 100644
index fe1f2ec..0000000
--- a/.factory/tasks/modernize/concerns/rm-49477e3be0.yaml
+++ /dev/null
@@ -1,18 +0,0 @@
-id: rm-49477e3be0
-chosen: Treat TD-11 as resolved at the config layer rather than as a runner hack
-alternatives:
-  - Invent a runner-side fix row (would duplicate the config exclusion)
-  - Leave TD-11 unmentioned (fails the assignment's explicit inventory request)
-why: The only tests/data exclusion is config/rumdl.toml:3, consistent with ruff,
-  pylint, and pyright config excludes; dispatch.py:300 only contains a
-  path-scanning comment. Recording a false runner-side TD-11 would misassign
-  work to runner.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: coding-rules-audit
-  lastSeen: 2026-11-09T23:33:30.977Z
-createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/rm-4cf584f209.yaml b/.factory/tasks/modernize/concerns/rm-4cf584f209.yaml
deleted file mode 100644
index dffdcc5..0000000
--- a/.factory/tasks/modernize/concerns/rm-4cf584f209.yaml
+++ /dev/null
@@ -1,20 +0,0 @@
-id: rm-4cf584f209
-chosen: Derive expected docs counts from a real nested `pytest --collect-only`
-  run and from `dispatch.TOOLS` at test time
-alternatives:
-  - Hardcode expected 1360/9/14 in the test (stale immediately on any test
-    addition)
-  - Skip test-first for this docs-only item and rely on review (violates the
-    step contract; no durable guard)
-why: The acceptance criterion is that docs match the runtime tree; a hardcoded
-  1360/9/14 would silently drift the moment a test is added, while runtime
-  derivation makes drift a test failure
-status: open
-source:
-  record: 001-test-first-r1-a1
-  agent: developer
-  step: test-first
-  item: docs-counts-sync
-  lastSeen: 2026-11-09T23:58:53.045Z
-createdAt: 2026-11-09T23:58:53.045Z
-updatedAt: 2026-11-09T23:58:53.045Z
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
diff --git a/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml b/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml
deleted file mode 100644
index 0c2e5ff..0000000
--- a/.factory/tasks/modernize/concerns/rm-5f84f18bbd.yaml
+++ /dev/null
@@ -1,28 +0,0 @@
-id: rm-5f84f18bbd
-chosen: Resolve all six content conflicts by taking the parent tip's
-  (topic/modernize) version of the shared test helpers, integration.py and the
-  autofix tests.
-alternatives:
-  - Union-merge both helper sets, keeping _write_file and make_consumer_project
-    alongside the parent's write_project_file and make_clean_consumer_project
-  - Keep the item-side files wholesale (as the previous merge commit b67837d
-    did) and drop the parent's collect_sample_findings/write_project_file
-    additions
-  - Rewrite the six files by hand to a third, mixed shape
-why: "The parent-side module is a strict superset of the item-side
-  consolidation: it keeps every helper the item introduced (git_init_bare,
-  stage_file, commit_all, shipped_config_paths, make_runner_config,
-  build_pylint_overlay_config, ensure_precommit_or_skip,
-  install_twice_assert_idempotent) and adds write_project_file /
-  collect_sample_findings / make_clean_consumer_project / SAMPLE_PROJECT.
-  Hand-merging both vocabularies would reintroduce duplicate scaffolding helpers
-  (_write_file vs write_project_file), defeating the item's single-source goal."
-status: open
-source:
-  record: 005-integrate-r1-a1
-  agent: developer
-  step: integrate
-  item: consolidate-integration-helpers-v3
-  lastSeen: 2026-11-09T23:49:50.606Z
-createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-09T23:49:50.606Z
diff --git a/.factory/tasks/modernize/concerns/rm-68620e2e61.yaml b/.factory/tasks/modernize/concerns/rm-68620e2e61.yaml
deleted file mode 100644
index 7cbde68..0000000
--- a/.factory/tasks/modernize/concerns/rm-68620e2e61.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-id: rm-68620e2e61
-chosen: Retarget the semantic-owned test block to TestAnyElementCodeEcho:366-392
-alternatives:
-  - Declare an unresolved ownership dispute over the absent class
-  - Give the whole test file to checkers
-  - Give the whole test file to semantic
-why: The ADR/map-named TestSuppressionRerankerPipeline is absent at HEAD, while
-  TestAnyElementCodeEcho directly tests the semantic-owned rule-echo behavior.
-  Retargeting preserves the single-writer partition without leaving a dangling
-  symbol.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-kickoff-gate
-  lastSeen: 2026-11-10T00:08:48.409Z
-createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T00:08:48.409Z
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
deleted file mode 100644
index 8ac8d5f..0000000
--- a/.factory/tasks/modernize/concerns/rm-6e63c3be9e.yaml
+++ /dev/null
@@ -1,21 +0,0 @@
-id: rm-6e63c3be9e
-chosen: Leave the tests/conftest.py backwards-compat re-export of
-  shipped_config_paths removed.
-alternatives:
-  - Keep the re-export as a union of both sides to preserve the item's
-    compatibility shim
-  - Keep it but add an explicit deprecation comment
-why: After the parent-side refactor every consumer imports shipped_config_paths
-  from tests._project_helpers directly, so the `from tests._project_helpers
-  import shipped_config_paths as shipped_config_paths` line in conftest is a
-  dead fallback shim; the project philosophy calls for pruning fallback shims,
-  and the module imports cleanly without it.
-status: open
-source:
-  record: 005-integrate-r1-a1
-  agent: developer
-  step: integrate
-  item: consolidate-integration-helpers-v3
-  lastSeen: 2026-11-09T23:49:50.606Z
-createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-09T23:49:50.606Z
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
diff --git a/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml b/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml
deleted file mode 100644
index 8cc4139..0000000
--- a/.factory/tasks/modernize/concerns/rm-8744aaa293.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-id: rm-8744aaa293
-chosen: Group the 203 private stub declarations into three per-owner rows plus
-  the W9707 enforcement row, rather than 203 individual rows
-alternatives:
-  - One row per declaration (precise but noisy and duplicates the same fix)
-  - Report only aggregate counts without per-owner evidence (loses the map
-    contract)
-why: The fix is one mechanical stub-surface cleanup per owner, and per-owner
-  totals make the inter-dep ownership map actionable; individual rows would
-  obscure that PYI-4 is a prerequisite and that 127 imports block deletion.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: coding-rules-audit
-  lastSeen: 2026-11-09T23:33:30.977Z
-createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-09T23:33:30.977Z
diff --git a/.factory/tasks/modernize/concerns/rm-960f2c7947.yaml b/.factory/tasks/modernize/concerns/rm-960f2c7947.yaml
deleted file mode 100644
index f278d31..0000000
--- a/.factory/tasks/modernize/concerns/rm-960f2c7947.yaml
+++ /dev/null
@@ -1,20 +0,0 @@
-id: rm-960f2c7947
-chosen: Reclassify realized semantic reservations (_decision_backend.py/.pyi +
-  test_decision_backend.py) to semantic and amend counts to 65/91/15/7/16
-alternatives:
-  - Keep literal 65/94/15/4/16 and leave backend files checkers-owned
-  - Assign the 8 new factory files to root to stay within ±5
-  - Treat the count breach as unresolved and block the gate
-why: The literal path rule would assign the newly realized reservation files to
-  checkers, contradicting ADR-011's planned-path read-only rule and creating a
-  real ownership collision. Reclassification keeps one writer per path and gives
-  an exact sum-194 recount.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-kickoff-gate
-  lastSeen: 2026-11-10T00:08:48.409Z
-createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T00:08:48.409Z
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
diff --git a/.factory/tasks/modernize/concerns/rm-a302818175.yaml b/.factory/tasks/modernize/concerns/rm-a302818175.yaml
deleted file mode 100644
index 628edd8..0000000
--- a/.factory/tasks/modernize/concerns/rm-a302818175.yaml
+++ /dev/null
@@ -1,21 +0,0 @@
-id: rm-a302818175
-chosen: Recommend the iteration-5 ADR-023 item-level path
-  (golden-regen-hatch-v2) rather than reviving epics to satisfy the legacy
-  contract
-alternatives:
-  - Reintroduce runner/checkers/semantic epics in I6 solely to produce close-ups
-  - Keep the legacy item pending indefinitely and let it block legacy
-    golden-regen-hatch
-why: The I5 plan explicitly ships no child epics and the v2 hatch depends only
-  on behavior items (plan-5.3:1013-1017, 1271-1284, 882-898). Reviving epics
-  would reintroduce the empty-wave/bottleneck failure ADR-013 and ADR-023
-  removed.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-shift-report-collection
-  lastSeen: 2026-11-10T00:14:51.554Z
-createdAt: 2026-11-10T00:14:51.554Z
-updatedAt: 2026-11-10T00:14:51.554Z
diff --git a/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml b/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml
deleted file mode 100644
index fac171d..0000000
--- a/.factory/tasks/modernize/concerns/rm-a310a057fe.yaml
+++ /dev/null
@@ -1,21 +0,0 @@
-id: rm-a310a057fe
-chosen: "Honor fail-open: report 0/3 close-ups and keep the item blocked/pending
-  rather than synthesizing a handoff"
-alternatives:
-  - Reconstruct three pseudo-close-ups from I4/I5 item-level shift declarations
-  - Treat plan-level closeup-3/closeup-4 as the three epic close-ups
-  - Emit three root-authored no-shift declarations in place of missing epic
-    close-ups
-why: ADR-011:64-69 and assignment.yaml:10-12 require all three epic close-ups
-  and forbid fabrication. Item-level shift declarations exist but are
-  single-owner item reports, not epic close-ups, so relabeling them would poison
-  the golden-regen-hatch precondition.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-shift-report-collection
-  lastSeen: 2026-11-10T00:14:51.554Z
-createdAt: 2026-11-10T00:14:51.554Z
-updatedAt: 2026-11-10T00:14:51.554Z
diff --git a/.factory/tasks/modernize/concerns/rm-af822ddbc6.yaml b/.factory/tasks/modernize/concerns/rm-af822ddbc6.yaml
deleted file mode 100644
index 1a1fcc4..0000000
--- a/.factory/tasks/modernize/concerns/rm-af822ddbc6.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: rm-af822ddbc6
-chosen: Accept the modify/delete resolution for
-  tests/runner/test_pyright_noise_filter.py and
-  tests/runner/test_self_lint_clean.py (deletion wins).
-alternatives:
-  - Restore both files from the item side with imports retargeted to
-    tests._project_helpers
-  - Restore only test_pyright_noise_filter.py, whose modification was the
-    one-line import change
-why: The deletion is deliberate on the parent side (commit 644774e,
-  'never-test-linting-prune'), the item side only retargeted an import in one of
-  them, and neither file is referenced by any remaining code or config.
-  Resurrecting them would re-introduce tests the parent branch explicitly
-  pruned.
-status: open
-source:
-  record: 005-integrate-r1-a1
-  agent: developer
-  step: integrate
-  item: consolidate-integration-helpers-v3
-  lastSeen: 2026-11-09T23:49:50.606Z
-createdAt: 2026-11-09T23:49:50.606Z
-updatedAt: 2026-11-09T23:49:50.606Z
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
deleted file mode 100644
index ee11f28..0000000
--- a/.factory/tasks/modernize/concerns/rm-bc510f4b77.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-id: rm-bc510f4b77
-chosen: Run the lint gate with PYTHON_SETUP_LINT_NO_AUTOFIX=1 and rely on direct
-  AST/pylint probes for the audit
-alternatives:
-  - Run bare `uv run lint` and revert autofixes (risk of partial writes)
-  - Skip lint entirely and cite only prior audit results (weaker final-state
-    evidence)
-why: Preserves the read-only repository invariant while still proving 14/14
-  tools pass and that the debt is suppressed; bare `uv run lint` would autofix
-  tracked files and invalidate the audit state.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: coding-rules-audit
-  lastSeen: 2026-11-09T23:33:30.977Z
-createdAt: 2026-11-09T23:33:30.977Z
-updatedAt: 2026-11-09T23:33:30.977Z
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
diff --git a/.factory/tasks/modernize/concerns/rm-e754ab79c7.yaml b/.factory/tasks/modernize/concerns/rm-e754ab79c7.yaml
deleted file mode 100644
index eabb7cd..0000000
--- a/.factory/tasks/modernize/concerns/rm-e754ab79c7.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-id: rm-e754ab79c7
-chosen: Reconstruct the validated map at HEAD 1039df9 rather than yield inconclusive
-alternatives:
-  - Yield inconclusive and block all epic waves
-  - Consume the stale 5e466ac audit map unchanged
-  - Spawn epics with no validated ownership map
-why: The dependency was abandoned after retries, but the assignment still
-  requires a revision, counts, drift list, ownership tables, and zero unresolved
-  disputes. Reconstruction with explicit amendment A0 unblocks the spawn gate
-  while preserving the evidence trail.
-status: open
-source:
-  record: 001-research-r1-a1
-  agent: fact-finder
-  step: research
-  item: epic-kickoff-gate
-  lastSeen: 2026-11-10T00:08:48.409Z
-createdAt: 2026-11-10T00:08:48.409Z
-updatedAt: 2026-11-10T00:08:48.409Z
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..60d4e92
--- /dev/null
+++ b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/input.md
@@ -0,0 +1,111 @@
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
+  "slug": "coding-rules-audit",
+  "kind": "fact-finder",
+  "title": "Inventory CodingRules violations",
+  "assignment": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS at final state (post-golden/assumptions/consolidate; read beartype discovery report from third-party item). No repo writes; output is structured item-report tables (durable in orchestration records, no committed file). Semantic exclusions marked SKIPPED (audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output rows {module,section,evidence file:line,category,est LoC delta,owner,fix} + UNIFIED disjoint-ownership map (this audit is SINGLE owner; test-debloat-audit consumes via inter-dep). Deps: read golden + helper final state; beartype report informs owner/fix.",
+  "outlineRef": "coding-rules-audit",
+  "milestone": "M3",
+  "wave": 4,
+  "deps": [
+    "golden-findings-snapshot",
+    "third-party-assumption-tests",
+    "consolidate-integration-helpers"
+  ],
+  "scenarioRefs": [
+    "M3: Coding-rules debt inventoried",
+    "M3: Ownership map is complete and disjoint"
+  ],
+  "citations": [
+    "CodingRules.md:90-107",
+    "CodingRules.md:139-159",
+    "src/python_setup_lint/checkers/_semantic.py:1-12",
+    "src/python_setup_lint/checkers/_semantic.py:37-52",
+    "src/python_setup_lint/checkers/_base.py:142-158",
+    "src/python_setup_lint/runner/baseline.py:22-42",
+    "lint.baseline:1-1"
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
+  "CodingRules.md:90-107",
+  "CodingRules.md:139-159",
+  "src/python_setup_lint/checkers/_semantic.py:1-12",
+  "src/python_setup_lint/checkers/_semantic.py:37-52",
+  "src/python_setup_lint/checkers/_base.py:142-158",
+  "src/python_setup_lint/runner/baseline.py:22-42",
+  "lint.baseline:1-1"
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
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..f64c9e6
--- /dev/null
+++ b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T23:19:09.190Z
+session: 01a1c29b-c07f-7662-b7bd-0475e001272c
+endedAt: 2026-11-09T23:33:31.117Z
+usage:
+  inputTokens: 187879
+  outputTokens: 83867
+  costUsd: 0.104406
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-19-09-695Z_01a1c29b-c07f-7662-b7bd-0475e001272c.jsonl
diff --git a/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..76751d9
--- /dev/null
+++ b/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,366 @@
+status: ok
+summary: "Read-only CodingRules/AGENTS audit of src/** and scripts/** at final
+  M3 state (HEAD f41160d). 42 inventory rows plus a verified 194-file disjoint
+  ownership map (runner 65, checkers 91, setup-testing 15, semantic 7, root 16).
+  The lint gate is green only because the debt is suppressed or unenforced:
+  `PYTHON_SETUP_LINT_NO_AUTOFIX=1 uv run lint` passed all 14 tools (78.16s), and
+  `lint.baseline` is still `[]`. Dominant debts: 203 private stub declarations
+  outside TYPE_CHECKING (runner 95, checkers 63, setup-testing 45) while W9707
+  is blind because `PyiUnderscoreChecker` reads `node.file`; 127 cross-module
+  private imports in production code; 28 missing-beartype suppressions
+  classified as 16 unnecessary, 7 runtime-import-fixable, 3 genuine StubChecker
+  cycles (2 semantic ones excluded); a production-dead
+  `runner/_baseline_helpers.py` (82 lines plus 31-line stub) still pinned only
+  by tests; the `peek_fallback_tools` export chain; duplicated symlink logic in
+  `scripts/create_root_symlinks.py` versus `setup.py`; 42 silent-except W9740
+  suppressions; astroid-3 fallbacks despite astroid 4.0.4; 55 over-long source
+  lines; and stale AGENTS/docs counts and semantic architecture. Semantic paths
+  `_semantic.py/.pyi`, `_decision_backend.py/.pyi`,
+  `_base.py::check_if_meaningful` and `_OPTIONAL_IMPORT_PATTERNS` are marked
+  SKIPPED as required; `_decision_cache.py/.pyi` is absent and reserved to
+  semantic."
+findings: |
+  # CodingRules / AGENTS audit — final M3 state (HEAD f41160d)
+
+  ## 0. Verification basis and scope
+
+  - HEAD `f41160d`; `git status --short` and `git diff --stat` were empty before and after every probe. No tracked file was written; `lint.baseline:1` is `[]`.
+  - `PYTHON_SETUP_LINT_NO_AUTOFIX=1 uv run lint` -> exit 0, all 14 tools PASSED in 78.16s (tach, ruff format, ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi, pylint tests, detect-secrets). The green gate is not evidence of compliance: the rows below are suppressed, exempted, or unenforced.
+  - `uv run pytest -q` -> 1357 passed, 7 deselected, 0 skipped, 4 warnings in 32.83s. `uv run pytest tests/integration.py --collect-only -q` -> 9 tests collected. AGENTS.md:10-11 still states 1290 pass, 4 skip, 15 deselected and integration 7 pass / ~30s.
+  - Beartype discovery report read from `.factory/tasks/modernize/items/third-party-assumption-tests/steps/001-develop-a1/output.yaml:55-68`: with beartype 0.22.9 and `from __future__ import annotations`, a TYPE_CHECKING-only forward ref does not fail at decoration time but raises `beartype.roar.BeartypeCallHintForwardRefException` at call time. This classification is used in the BEA rows.
+  - Golden/helper final state read as dependency input: `tests/_golden.py` 446 lines, `tests/_project_helpers.py` 204 lines, `tests/integration.py` 498 lines. Tests are not audit targets; they are covered only by the ownership map.
+  - Pinned runtime versions: astroid 4.0.4, pylint 4.0.6, beartype 0.22.9 (`pyproject.toml:11-13`; `uv.lock:50-55`).
+
+  ### 0.1 SKIPPED semantic exclusions (not audited)
+
+  | Path / symbol | Evidence | Reason |
+  |---|---|---|
+  | `checkers/_semantic.py` + `_semantic.pyi` | `src/python_setup_lint/checkers/_semantic.py:1-60`; `_semantic.pyi:1-12` | Whole-file semantic owner. |
+  | `checkers/_decision_backend.py` + `_decision_backend.pyi` | `_decision_backend.py:1-54`; `_decision_backend.pyi:1-25` | New decision backend; its 2 missing-beartype suppressions, `FakeBackend`, and stub surface are excluded. |
+  | `checkers/_decision_cache.py` + `_decision_cache.pyi` | absent; `Path.exists()` false for both | Reserved for semantic cache implementation. |
+  | `_base.py::check_if_meaningful` + stub section | `_base.py:160-252`; `_base.pyi:74-99` | Replacement target; checkers owner must not refactor it. |
+  | `no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS` | `conformance/no_try_import_checker.py:13` | Must track the new optional decision-model dependency. |
+
+  ## 1. .pyi fidelity and private symbols
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | PYI-1 | runner/*.pyi | CodingRules 57 | 95 private declarations outside TYPE_CHECKING in runner stubs: `extra_tools.pyi:42-81` 19, `parsers.pyi:25-54` 14, `cmd_build.pyi:15-53` 13, `output.pyi:11-87` 9, `_record_parsers.pyi:8-15` 8, `_config.pyi:8-24` 7, `_autofix.pyi:12-26` 7, `_baseline_helpers.pyi:8-30` 6, `baseline.pyi:13-42` 3, `_record_types.pyi:23` 1 | private symbols in public stub | -80 | runner | Delete stub-only private declarations; make the 54 cross-module-used ones public (see IMP-1). |
+  | PYI-2 | checkers/**/*.pyi | CodingRules 57 | 63 private declarations (42 top-level plus 21 class members): `stub/coverage.pyi:27-97` 13, `stub/fidelity/annotation.pyi:16-68` 9, `stub/fidelity/signature.pyi:19-69` 6, `stub/fidelity/kind.pyi:18-49` 5, `_base.pyi:18-35` 5, `stub/import_contract.pyi:29-38` 3, `stub/fidelity/_ast_helpers.pyi:48` 1, plus private methods in `conformance/*.pyi` | private symbols in public stub | -50 | checkers | Same fix; keep only public members; make `_msgs`, `_matches_path`, `_get_except_str` public or move behind a public helper module. |
+  | PYI-3 | setup-testing stubs | CodingRules 57 | 45 private declarations: `setup.pyi:15-56` 23, `_setup_pyproject.pyi:8-43` 9, `_setup_precommit.pyi:12-24` 8, `testing.pyi:29-65` 3, `_setup_update.pyi:8-15` 2 | private symbols in public stub | -35 | setup-testing | Delete pure-internal declarations; rename shared setup steps used by `setup.py` public. |
+  | PYI-4 | conformance/pyi_underscore_checker.py | CodingRules 57 | `:38-41` sets `_is_pyi` from `node.file.endswith('.pyi')`; `pylint --rcfile=config/.pylintrc-pyi --disable=all --enable=pyi-underscore-symbol src/python_setup_lint/runner/extra_tools.pyi` emits zero messages despite 19 private symbols in that stub; all 203 stub private symbols are therefore invisible | .pyi enforcement gap | +8 | checkers | Use the explicit linted path (`linter.current_file` or checker arg), not `node.file`; add a regression test that lints a real .pyi and expects W9707. Do this before bulk stub cleanup. |
+  | PYI-5 | four __init__.pyi files | CodingRules 37 | `checkers/__init__.pyi` 5 lines, `checkers/stub/__init__.pyi` 11, `checkers/stub/fidelity/__init__.pyi` 16, `runner/__init__.pyi` 63; none has `__getattr__` or runtime logic; root `__init__.pyi` is justified by `__init__.py:10-23` version and structlog configuration | unnecessary .pyi for __init__ | -95 | checkers 32; runner 63 | Delete the four stubs; keep explicit re-exports typed in `__init__.py`. |
+  | PYI-6 | runner, setup-testing, root, checkers .pyi | CodingRules 72 | 16 public generic-return functions lack a `Returns:` clause: `runner/dispatch.pyi:67,68,76,84,85` 5; `runner/cli.pyi:8,50` 2; `runner/baseline.pyi:10` 1; `setup.pyi:42,67,77,80` 4; `__main__.pyi:8` 1; `checkers/_base.pyi:71` 1; `_decision_backend.pyi:9,14` 2 SKIPPED | .pyi docstring gap | +30 | runner 8; setup-testing 4; root 1; checkers 1; semantic 2 SKIP | Add Returns clauses; `peek_fallback_tools` clause disappears with WRAP-1. |
+  | PYI-7 | conformance stubs | CodingRules 57 | Public methods present in .py but absent from .pyi: `pyi_underscore_checker.py:52 visit_asyncfunctiondef`, `:68 visit_annassign`, `:76 visit_assign`; `unnamed_tuple_dict_checker.py:33 visit_assign`. `GenericLintTool` overrides (`dispatch.py:377,395,401`) inherit their declarations from `dispatch.pyi:68,84,85`, so they are not gaps. | stub fidelity gap | +4 | checkers | Add the four public visitor methods to the stubs (or mark them private if they are not part of the surface). |
+  | PYI-8 | checkers/__init__.py | CodingRules 61-68 | `checkers/__init__.py:1-14` is only an Apache license header; no module docstring; no other src/scripts file carries that header | missing __init__ docs | -12 | checkers | Replace the header with a purpose/quick-start module docstring. |
+  | PYI-9 | checkers/stub/fidelity/__init__.py | CodingRules 30-33 | `:31-32` still documents the old `checkers.stub_fidelity` path; `:42-88` re-exports `_FidelityState`, `_compare_*`, `_is_classvar`, `_emit_*`, `_extract_param_descriptors`; `__all__` at `:68-88` lists them; `stub/checker.pyi:16` imports `_FidelityState` with `type: ignore[attr-defined]` | private re-exports through package init | -35 | checkers | Have tests import from defining submodules; remove private re-exports and the stale path text. |
+  | PYI-10 | runner/cli.py, dispatch.pyi | CodingRules 30-33 | `cli.py:43-48` `__all__` exports `_apply_autofix_conflict_aware` and `_autofix_target_paths`; `dispatch.pyi:124` still declares private `_strategy_for`; `cli.py:29` and `_autofix.py:13` carry stale 'private symbol removed from .pyi per M3(b)' comments | private symbols in public surface | -1 | runner | Remove private names from `__all__`; rename `_strategy_for` public or remove it from the stub; delete the stale comments. |
+
+  ## 2. @beartype and structural suppressions
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | BEA-1 | checkers | CodingRules 16 | 16 `missing-beartype` suppressions on symbols whose annotations `typing.get_type_hints` resolves: `_base.py:118,124,135,139`; `asyncio_timeout_checker.py:99`; `generic_key_dict_checker.py:166`; `missing_error_chain_checker.py:68`; `no_try_import_checker.py:81`; `pyi_underscore_checker.py:112`; `redundant_type_guard_checker.py:145`; `structlog_checker.py:149`; `tmp_path_checker.py:96`; `trivial_wrapper_checker.py:257`; `unnamed_tuple_dict_checker.py:118`; `stub/checker.py:376`; `suppression_justification_checker.py:93` | unnecessary beartype suppression | 0 | checkers | Add `@beartype` and delete each disable; verified resolvable by runtime `get_type_hints`. |
+  | BEA-2 | conformance checkers | CodingRules 16 | 6 register functions suppress `missing-beartype` but PyLinter is TYPE_CHECKING-only: `bare_except_comment_checker.py:127`, `beartype_checker.py:75`, `missing_return_annotation_checker.py:49`, `silent_except_checker.py:76`, `suppression_justification_checker.py:391`, `stub/docstring_checker.py:236`; `get_type_hints` raises NameError PyLinter | TYPE_CHECKING-only beartype block | 0 | checkers | Move `from pylint.lint import PyLinter` to runtime as 10 other checkers already do; add `@beartype`; delete the disables. |
+  | BEA-3 | _setup_update.py | CodingRules 16 | `:85 update()` suppresses `missing-beartype,docstring-in-impl`; `Path` is imported only under `TYPE_CHECKING` at `:7-8`; `get_type_hints` raises NameError Path; the function also carries a usage docstring in .py | TYPE_CHECKING-only beartype block plus .py docstring | 0 | setup-testing | Import Path at runtime, add `@beartype`, move usage docs to `_setup_update.pyi`, delete both disables. |
+  | BEA-4 | stub fidelity helpers | CodingRules 16 | 3 genuine cycles: `stub/coverage.py:229-230 emit_coverage_violations(checker: StubChecker)`, `stub/fidelity/orchestrator.py:29 emit_fidelity_violations`, `stub/import_contract.py:77 emit_import_contract_violations`; StubChecker is TYPE_CHECKING-only and cannot be resolved | real circular TYPE_CHECKING block | +12 | checkers | Break the cycle with a Protocol or a StubChecker method; then decorate and remove the disables. |
+  | BEA-5 | scripts/create_root_symlinks.py | CodingRules 16; AGENTS 16-32 | `:40 main()` has no `@beartype`; explicit `pylint --rcfile=config/.pylintrc scripts/create_root_symlinks.py` reports 2 W9740 at `:76` and `:85` but never W9701, because `source-roots=src` and the full pipeline does not lint scripts (`runner/types.py:62-63` default_py_dirs is `[src]`) | scripts escape conformance scope | +2 | setup-testing | Add `@beartype`; include scripts/ in pylint scope or add a scripts rcfile with source-roots including scripts. |
+  | SUP-1 | checkers, runner stubs | CodingRules 30-33 | 5 `type: ignore[attr-defined]` comments all say 'private symbol removed from .pyi per M3(b); runtime import still works': `stub/checker.pyi:16`, `stub/fidelity/__init__.py:42`, `stub/fidelity/kind.py:8`, `runner/_autofix.py:13`, `runner/cli.py:29` | structural private-import suppression | 0 | checkers 3; runner 2 | Make the used symbols public in the .pyi, or stop importing them across modules; remove the ignores. |
+  | SUP-2 | conformance checkers | CodingRules 90-107 | 4 class declarations suppress the same structural conflict: `beartype_checker.py:21`, `missing_return_annotation_checker.py:18`, `structlog_checker.py:20`, `suppression_justification_checker.py:31`; each says SourceRootMixin.options conflicts with BaseChecker.options | duplicated structural suppression | +8 | checkers | Give the mixin a non-conflicting options contract (shared base/composition) and remove the 4 identical type ignores. |
+  | SUP-3 | setup-testing modules | CodingRules 49-50 | Suppression reasons are on preceding lines, not trailing: `testing.py:143` `# noqa: S603`, `:145` `# noqa: S607`, `setup.py:122` `# noqa: S603`; `testing.py:73,101` `# pylint: disable=generic-key-dict` also relies on a preceding comment | unjustified-suppression formatting | 0 | setup-testing | Move the adjacent rationale to a trailing comment or delete the suppression. |
+
+  ## 3. Trivial wrappers, duplicated logic, legacy stubs
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | DUP-1 | scripts/create_root_symlinks.py + setup.py | CodingRules 90-107 | Script `_CONFIG_FILES:24-36` and `main:40-90` duplicate `setup.py:41-53 _BUNDLED_CONFIGS` and `:223-275 _step_config_symlinks`; the lists already drift: script has 9 entries and omits `tach.toml`; script also lacks `_SKIP_SYMLINK_IF_EXISTS` and the copy2 fallback | duplicated logic | -35 | setup-testing | Extract one symlink-or-copy helper and one config-file manifest used by both. |
+  | DUP-2 | config manifests | CodingRules 90-107 | Three manifests with different shapes: `scripts/create_root_symlinks.py:27-37` 9 file names; `setup.py:41-53` 10 file names; `runner/_config.py:8-20` 11 tool-label keys / 10 unique files | triplicated configuration data | -10 | setup-testing 1; runner 1 | Single manifest with tool-label-to-file mapping; derive setup and script lists from it. |
+  | WRAP-1 | runner/baseline.py + runner/__init__.py | CodingRules 90-107 | `baseline.py:20-28` comment says the shim is debt owned by dispatch-split; `baseline.py:26 peek_fallback_tools()` returns `frozenset()`; declared at `baseline.pyi:10`; exported at `runner/__init__.py:17,22,62` and `runner/__init__.pyi:17,20,60`; allowlisted at `trivial_wrapper_checker.py:33` | legacy trivial stub | -8 | runner | Remove the function, both stub declarations, both package exports/docs, and the allowlist entry. |
+  | WRAP-2 | conformance/trivial_wrapper_checker.py | CodingRules 93 | `_EXEMPT_NAMES:24-40` contains three dead names (`_legacy_to_records`, `_legacy_current_output`, `_legacy_saved_output`) plus hidden single-use predicates `_has_import` (`no_try_import_checker.py:77`), `_is_suppression_line` (`suppression_justification_checker.py:213`), `_is_test_file` and `_is_opted_out` (`stub/coverage.py:47-52`); `statistics_flags` adapters are also exempt | rule-exemption drift | -3 | checkers | Delete dead names; inline the single-use predicates or document each remaining exemption. |
+  | DEAD-1 | runner/_baseline_helpers.py + .pyi | CodingRules 90-107 | `_baseline_helpers.py:1-82` is unused by src/; only `tests/runner/test_baseline_diff.py:13` imports `_compare_sorted`; the module's two-pointer diff duplicates `baseline.py:63-98 _compare_violation_lists` and its record conversion duplicates `_capture_one`; `.pyi:1-31` declares 6 private names; `_compare_sorted` is no longer re-exported by baseline.py | dead legacy module | -113 | runner | Delete the module and stub; test-debloat removes or repoints `TestCompareSorted` and the 50k benchmark in `tests/runner/test_baseline_diff.py:30-185`. |
+  | DEAD-2 | runner/parsers.py | CodingRules 30-33 | `:7-15` imports 7 private `_parse_*` functions from `_record_parsers`; they are used only by the dispatch tables at `:222-260`; `parsers.pyi` omits them | private cross-module parser surface | -2 | runner | Move the dispatch tables into `_record_parsers` or expose a public parser registry. |
+  | LEG-1 | runner/baseline.py | CodingRules 90-107 | `_FALLBACK_TOOLS` no longer exists (grep returns no definition); the legacy fallback set was removed | legacy stub resolved | 0 | runner | No action; keep it deleted. |
+
+  ## 4. Redundant fallbacks (astroid 3.x)
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | AST-1 | conformance/suppression_justification_checker.py | CodingRules 106-107 | `:247-273 _add_doc_node_spans` documents astroid 4.x `.doc_node` and keeps an astroid-3 `body[0]` Expr(Const) fallback; pyproject pins astroid>=4.0.4 and the assumptions suite pins 4.0.4 | redundant astroid-3 fallback | -18 | checkers | Delete the 3.x body fallback; use `ast_node.doc_node` directly and let the 4.x contract be tested by tests/assumptions/test_astroid_contracts.py. |
+  | AST-2 | conformance/suppression_justification_checker.py | CodingRules 106-107; 215-221 | Broad defensive catches hide structural errors: `:51` and `:56` around stream read, `:146` around source-line extraction, `:263` around `.body`, `:297` around `nodes_of_class`; all carry W9740 without checking the specific failure contract | over-broad fallback | -4 | checkers | Narrow to the documented astroid exceptions and log at debug with structured fields. |
+  | AST-3 | checkers/stub/normalizer.py | CodingRules 217-221 | `:88-95` parses a string annotation and catches `Exception: pass` with both `# noqa: S110` and `# pylint: disable=W9740`; malformed annotations are expected control flow, but the broad catch also swallows programming errors | broad silent except | +3 | checkers | Catch `astroid.AstroidError`/`ValueError` and log a debug event with the annotation; keep the repr fallback. |
+
+  ## 5. Over-long comments
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | CMT-1 | runner/_tool_specs.py | CodingRules 92; 139-159 | 55 source lines exceed 160 characters (12 >200, 2 >300). Top trailing-comment offenders: `_tool_specs.py:59` 689 chars (ty scope rationale ending in `# pylint: disable=unjustified-suppression`), `:56` 284 chars (RLIMIT_AS rationale), `bare_except_comment_checker.py:65` 226, `_base.py:139` 220, `suppression_justification_checker.py:295` 218 and `:297` 215, `redundant_type_guard_checker.py:133` 212; `_setup_precommit.py:54-55` are 680/240-char template strings, not comments | over-long comments and self-suppression | 0 | runner 2; checkers 5 | Move the ty/memory rationale to design/0002 or docs/overlays.md and cite it; remove the self-suppression; split long suppression reasons into a preceding comment plus a short trailing tag. |
+  | CMT-2 | src/** | CodingRules 92 | 20 runtime imports are annotated as 'TYPE_CHECKING-only import' although they execute at runtime: `asyncio_timeout_checker.py:6`, `generic_key_dict_checker.py:8`, `missing_error_chain_checker.py:6`, `no_try_import_checker.py:6`, `pyi_underscore_checker.py:6`, `redundant_type_guard_checker.py:6`, `structlog_checker.py:9`, `tmp_path_checker.py:6`, `trivial_wrapper_checker.py:6`, `unnamed_tuple_dict_checker.py:6`, `stub/checker.py:9`, `stub/coverage.py:4`, `stub/docstring_checker.py:7`, `stub/normalizer.py:4`, `_autofix.py:6,7,15`, `_cli_complexity.py:3`, `_cli_helpers.py:5`, `testing.py:12` | misleading comments | 0 | runner 6; checkers 13; setup-testing 1 | Delete or correct every comment; these imports are runtime imports. |
+
+  ## 6. 500-line / R0912 / R0915 proximity
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | CPX-1 | runner/dispatch.py, runner/cli.py | CodingRules 139-159 | `dispatch.py` is 449 lines (89.8% of max-module-lines=500) and `cli.py` 413 (82.6%); dispatch no longer has a C0302 disable (prior state was 542 lines with a module-level disable), so the split is effective but the margin is 51 lines | C0302 proximity | 0 | runner | Keep new code out; next extraction candidate is strategy helpers before adding C0302 debt. |
+  | CPX-2 | setup.py | CodingRules 139-159 | `setup.py` is 413 lines (82.6%); `checkers/conformance/suppression_justification_checker.py` 393 (78.6%) and `checkers/stub/checker.py` 379 (75.8%) are the next closest | C0302 proximity | 0 | setup-testing 1; checkers 2 | Watch; no suppression exists today, do not add one. |
+  | CPX-3 | runner/baseline.py | CodingRules 139-159 | `:217 _diff_baseline` carries the only complexity suppression in src: `# pylint: disable=too-many-locals`; `max-locals=20` in `config/.pylintrc:24`; function spans `:217-288` | masked R0914 | +8 | runner | Split crash/add/remove/write paths into helpers; remove the disable. |
+  | CPX-4 | setup.py, runner/parsers.py, conformance/trivial_wrapper_checker.py | CodingRules 139-159 | R0912 proximity at max-branches=16: `setup.py:223 _step_config_symlinks` 12 branches, `parsers.py:140 _parse_tach_json` 12, `trivial_wrapper_checker.py:49 _check_function` 13; no function reaches the 14-branch probe and no R0912/R0915 suppression exists | R0912 proximity | 0 | setup-testing 1; runner 1; checkers 1 | Split `_check_function` first (13/16); review the two 12-branch functions before extending them. |
+
+  ## 7. structlog and error rules
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | LOG-1 | root, checkers, runner | CodingRules 161-166 | Four independent structlog configuration sites: `__init__.py:10-23` (full processor chain), `checkers/_base.py:22-24` (filtering wrapper), `runner/cli.py:39-41` (same filtering wrapper), `runner/dispatch.py:224` (duplicated filtering config inside the pylint `--init-hook` string) | duplicated logging setup | -5 | root 1; checkers 1; runner 2 | Centralize in one shared logging module; keep the subprocess init-hook only where process isolation requires it. |
+  | ERR-1 | src/** | CodingRules 217-221 | 42 `# pylint: disable=W9740` silent-except suppressions across 16 files: `setup.py` 6, `suppression_justification_checker.py` 5, `parsers.py` 3, `output.py` 3, `cmd_build.py` 3, `baseline.py` 3, `_config.py` 3, `_autofix.py` 3, `_record_parsers.py` 2, `stub/normalizer.py` 2, `stub/coverage.py` 2, `bare_except_comment_checker.py` 2, `_base.py` 2, `extra_tools.py` 1, `_setup_update.py` 1, `_setup_precommit.py` 1; representative: `_config.py:55`, `parsers.py:34,87,144`, `_autofix.py:33,47,90`, `setup.py:108,131,133,248,255,267` | silent-except policy debt | +40 | root policy; file owners apply | Every caught path needs a structured debug/error event or a single documented best-effort helper; do not merely suppress W9740. |
+
+  ## 8. TD-11 rumdl tests/data exclude
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | TD11-1 | config/rumdl.toml | TD-11 | No runner-side rumdl exclude exists (`dispatch.py:300` only has a path-scanning comment); the exclusion is config-level at `config/rumdl.toml:3` beside ruff `config/ruff.toml:3`, pylint `config/.pylintrc:3`, and pyright `config/pyrightconfig.json:16`. Prior concern was a runner hack; current state is consistent config policy | TD-11 resolved | 0 | root | No action; keep tests/data a config-level planted-fixture exclusion. |
+
+  ## 9. Docs, tool scope, and suppression formatting
+
+  | ID | Module | Section | Evidence | Category | Est LoC | Owner | Fix |
+  |---|---|---|---|---|---|---|---|
+  | DOC-1 | AGENTS.md | AGENTS 5-12 | `:10` says 1290 pass, 4 skip, 15 deselected; measured 1357 passed, 0 skipped, 7 deselected in 32.83s. `:11` says integration 7 pass / ~30s; measured collection is 9 tests (prior run 106.61s) | stale docs counts | +2 | root | Update both rows after the final merge; state actual collection count and measured duration. |
+  | DOC-2 | AGENTS.md | AGENTS 16-32 | `:29` says pylint whole repo; `runner/types.py:62-63` defaults `default_py_dirs` to `[src]`, tests use `.pylintrc-tests`, and scripts are unlinted; explicit `pylint --rcfile=config/.pylintrc scripts/create_root_symlinks.py` reports W9740 at `:76,85` that the full pipeline never sees | inaccurate tool scope | +1 | root | Say src/ for main pylint, tests/ for pylint tests, and scripts/ currently unlinted, or add scripts/ to scope. |
+  | DOC-3 | AGENTS.md, docs/semantic-justification.md | AGENTS 79-85; task intent | `AGENTS.md:82` still shows `_semantic.py → cross-encoder reranker`; `:85` says lazy-loaded reranker configurable via `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-26,51-53` documents sentence-transformers/cross-encoder/0.5; current `checkers/_decision_backend.py:1-54` is the CPU decision backend and `pyproject.toml:31-33` semantic extra is empty; `_decision_cache.py` is absent | obsolete architecture docs | +10 | root with semantic | Semantic epic drafts replacement; root updates AGENTS.md, docs/semantic-justification.md, and pyproject optional deps. Do not document the cache before `_decision_cache.py` exists. |
+  | DOC-4 | AGENTS.md | AGENTS 121-139 | AGENTS documents `uv run pre-commit install` and active hooks, but `git ls-files .pre-commit-config.yaml` returns 0 files; only `_setup_precommit.py:88-122` writes it during install | missing pre-commit config | +1 | root | Commit a self-repo config or mark the section consumer-only. |
+  | DOC-5 | setup.py, _setup_update.py, conformance checkers | CodingRules 61-72 | Usage docstrings in .py: `setup.py:77-81 all_ok`, `:323-327 install`, `:399-403 main`; `_setup_update.py:88-92 update`. Docstring-in-impl suppressions: `setup.py:76,318,398`, `_setup_update.py:85`, plus stale one-liner suppressions at `asyncio_timeout_checker.py:43,99` and `generic_key_dict_checker.py:166` | docstrings in implementation | -22 | setup-testing 4; checkers 3 | Move usage docs to the .pyi, delete the .py docstrings and all 7 disables. |
+
+  ## 10. Unified disjoint file-ownership map (single authoritative audit owner)
+
+  Universe = all 194 git-tracked files under `src/`, `scripts/`, `tests/` minus `tests/data/`. Reproduce with `git ls-files`; group counts below sum to 194 with no duplicate paths. This map is the inter-dep contract for `test-debloat-audit`; consume it unchanged.
+
+  | Owner | Paths covered | Count | Symbol exclusions |
+  |---|---|---|---|
+  | runner | `src/python_setup_lint/runner/**` (36 files) + `tests/runner/**` except `test_setup.py` and `test_setup_install.py` (28) + `tests/fixtures/dogfood-extra/pyproject.toml` (1) | 65 | none |
+  | checkers | `src/python_setup_lint/checkers/**` minus `_semantic.py`, `_semantic.pyi`, `_decision_backend.py`, `_decision_backend.pyi` (59) + `tests/checkers/**` minus `test_semantic_check.py`, `test_semantic_threshold.py`, `test_decision_backend.py` (32) | 91 | `_base.py:160-252 check_if_meaningful` and `_base.pyi:74-99` (semantic); `conformance/no_try_import_checker.py:13 _OPTIONAL_IMPORT_PATTERNS` (semantic) |
+  | setup-testing | `scripts/create_root_symlinks.py`; `src/python_setup_lint/_setup_precommit.py(.pyi)`, `_setup_pyproject.py(.pyi)`, `_setup_update.py(.pyi)`, `setup.py(.pyi)`, `testing.py(.pyi)` (10 src files); `tests/runner/test_setup.py`, `tests/runner/test_setup_install.py`, `tests/test_setup_config_symlinks.py`, `tests/test_setup_precommit.py` (4) | 15 | none |
+  | semantic | `src/python_setup_lint/checkers/_semantic.py`, `_semantic.pyi`, `_decision_backend.py`, `_decision_backend.pyi`; `tests/checkers/test_semantic_check.py`, `test_semantic_threshold.py`, `test_decision_backend.py` | 7 | whole semantic scope; `_decision_cache.py` and `_decision_cache.pyi` reserved but absent |
+  | root | `src/python_setup_lint/__init__.py(.pyi)`, `__main__.py(.pyi)`, `py.typed` (5); `tests/__init__.py`, `_golden.py`, `_project_helpers.py`, `conftest.py`, `integration.py`, `test_golden.py`, `assumptions/__init__.py`, `assumptions/test_astroid_contracts.py`, `assumptions/test_beartype_contracts.py`, `assumptions/test_pylint_cache_semantics.py`, `assumptions/test_pylint_contracts.py` (11) | 16 | none |
+  | root-owned group (listed once, not in the 194) | `tests/data/**`, `config/**`, `docs/**`, `design/**` | group | n/a |
+
+  Stub rule applied: every `.pyi` has the same owner as its paired `.py`; `dispatch.pyi` is runner, `_base.pyi` is checkers, `setup.pyi` is setup-testing, `_semantic.pyi` and `_decision_backend.pyi` are semantic. Root project files outside the declared universe (`pyproject.toml`, `AGENTS.md`, `CodingRules.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `lint.baseline`, `tach.toml`, `uv.lock`, `.secrets.baseline`) are root-owned.
+
+  ### 10.1 Verification of the map
+
+  - 194 = 65 runner + 91 checkers + 15 setup-testing + 7 semantic + 16 root; every path matched exactly one owner rule.
+  - Symbol exclusions reference existing code: `_base.py:160-252`, `_base.pyi:74-99`, `no_try_import_checker.py:13`, `_semantic.py/.pyi`, `_decision_backend.py/.pyi`.
+  - Reservations: `src/python_setup_lint/checkers/_decision_cache.py` and `.pyi` are the only reserved paths and are absent (`Path.exists()` false for both). No other new path is reserved.
+  - Tests private-import count is 271 (test-only); those are test-debloat remit, not src/scripts audit rows. `tests/runner/test_baseline_diff.py` is the only consumer of the dead `_baseline_helpers` module (DEAD-1).
+
+  ## 11. Non-findings and resolved items
+
+  - No `.py`/`.pyi` pairing gap: 51 non-`__init__` src modules each have a stub; 6 `__init__.py` files exist, 5 have stubs, only root is justified; `scripts/` is rule-exempt.
+  - No `_FALLBACK_TOOLS` definition remains; `_compare_sorted` is no longer re-exported by `baseline.py` (the dead module remains, see DEAD-1).
+  - No C0302 suppression remains; `dispatch.py` went 542 -> 449 lines without the module-level disable.
+  - No duplicate-code messages; no unsuppressed R0912/R0915/R0914 hits; the only complexity suppression is CPX-3.
+  - No product-code `logging.getLogger` call (only the checker's message text at `structlog_checker.py:24`); no f-string log calls; missing-error-chain checker passes. User-facing CLI output uses `print`, which is treated as CLI presentation, not logging.
+  - `mypy.stubtest`, pyright verify types, and pylint-pyi all pass; PYI-4 explains why pylint-pyi green is not evidence that .pyi rules hold. The only stub-fidelity gaps found by direct AST comparison are the four public methods in PYI-7; module-level public symbols are complete.
+  - TD-11 is resolved in runner code (config-level exclusion only); see TD11-1.
+  - `lint.baseline` remains `[]` (`lint.baseline:1`). Do not baseline any row above; the empty baseline is the fitness gate.
+
+  ## 12. Handoff notes
+
+  - Fix PYI-4 before any bulk stub deletion; otherwise 203 private stub symbols stay unguarded.
+  - PYI-1..3 cannot be done by deletion alone: 127 production private imports (runner 54, checkers 57, setup-testing 16) depend on those names; make cross-module helpers public (Symbol Convention, CodingRules 30-33) or move them behind public facades, then delete the private stub declarations.
+  - DEAD-1 needs test-debloat coordination: `tests/runner/test_baseline_diff.py:30-185` pins `_compare_sorted`; `tests/_golden.py` and `tests/_project_helpers.py` are golden/helper-owned and must not be reassigned.
+  - Beartype report drives BEA-2/BEA-3: TYPE_CHECKING-only refs fail only at call time, so runtime imports are required; BEA-4 needs a Protocol or StubChecker method, not a mere import move.
+  - Keep `lint.baseline` empty. Re-measure AGENTS counts only after the final merge.
+contextPack: "HEAD f41160d; clean tree; lint 14/14 PASSED in 78.16s with
+  PYTHON_SETUP_LINT_NO_AUTOFIX=1; pytest 1357 passed / 7 deselected / 0 skipped
+  in 32.83s; integration collects 9; lint.baseline []. 42 audit rows. 194-file
+  map: runner 65, checkers 91, setup-testing 15, semantic 7, root 16. Top debts:
+  203 private stub declarations outside TYPE_CHECKING (runner 95, checkers 63,
+  setup-testing 45), W9707 blind because PyiUnderscoreChecker uses node.file;
+  127 production private imports; 28 missing-beartype suppressions (16
+  resolvable, 7 runtime-import-fixable, 3 real StubChecker cycles; 2 semantic
+  skipped); dead runner/_baseline_helpers.py (82+31 lines) pinned only by tests;
+  peek_fallback_tools export chain; duplicated symlink/config manifests; 42
+  W9740 silent excepts; astroid-3 fallbacks despite astroid 4.0.4; 55 over-long
+  source lines; stale AGENTS/docs counts and cross-encoder docs. Semantic
+  SKIPPED: _semantic.py/.pyi, _decision_backend.py/.pyi,
+  _base.py::check_if_meaningful (+stub), _OPTIONAL_IMPORT_PATTERNS. Reserved
+  absent paths: _decision_cache.py/.pyi. Open concerns c-3e935debcb (POSIX-only
+  flock) and c-5463b26c4b (constant rule symbol) remain semantic cache
+  constraints."
+sources:
+  - CodingRules.md:16
+  - CodingRules.md:30-41
+  - CodingRules.md:57
+  - CodingRules.md:61-72
+  - CodingRules.md:90-107
+  - CodingRules.md:139-159
+  - CodingRules.md:161-166
+  - CodingRules.md:215-222
+  - AGENTS.md:5-12
+  - AGENTS.md:16-32
+  - AGENTS.md:79-85
+  - AGENTS.md:121-139
+  - lint.baseline:1
+  - src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py:38-41
+  - src/python_setup_lint/checkers/_base.py:160-252
+  - src/python_setup_lint/checkers/_base.pyi:74-99
+  - src/python_setup_lint/checkers/conformance/no_try_import_checker.py:13
+  - src/python_setup_lint/runner/baseline.py:20-28
+  - src/python_setup_lint/runner/baseline.pyi:9-10
+  - src/python_setup_lint/runner/__init__.py:17,22,62
+  - src/python_setup_lint/runner/__init__.pyi:17,20,60
+  - src/python_setup_lint/runner/_baseline_helpers.py:1-82
+  - src/python_setup_lint/runner/_baseline_helpers.pyi:1-31
+  - src/python_setup_lint/runner/parsers.py:7-15,222-260
+  - src/python_setup_lint/runner/dispatch.py:449
+  - src/python_setup_lint/runner/dispatch.pyi:124
+  - src/python_setup_lint/runner/cli.py:43-48
+  - src/python_setup_lint/runner/cli.py:29
+  - src/python_setup_lint/runner/_autofix.py:13
+  - src/python_setup_lint/checkers/stub/fidelity/__init__.py:31-88
+  - src/python_setup_lint/checkers/stub/checker.pyi:16
+  - src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:247-297
+  - src/python_setup_lint/checkers/stub/normalizer.py:88-95
+  - src/python_setup_lint/runner/_tool_specs.py:56,59
+  - src/python_setup_lint/runner/baseline.py:217
+  - src/python_setup_lint/setup.py:41-53,223-275,399-403
+  - scripts/create_root_symlinks.py:27-37,40-90
+  - config/.pylintrc:2,22-27
+  - config/rumdl.toml:3
+  - config/rumdl.toml:3
+  - docs/semantic-justification.md:3-26,51-53
+  - src/python_setup_lint/checkers/_decision_backend.py:1-54
+  - src/python_setup_lint/checkers/_decision_backend.pyi:1-25
+  - tests/_golden.py:446
+  - tests/_project_helpers.py:204
+  - tests/integration.py:498
+  - .factory/tasks/modernize/items/third-party-assumption-tests/steps/001-develop-a1/output.yaml:55-68
+recommendations:
+  - "Fix PYI-4 first: make PyiUnderscoreChecker use the explicit linted .pyi
+    path and add a real-.pyi W9707 regression test, then bulk-clean private stub
+    symbols by owner."
+  - Before deleting PYI-1..3 declarations, resolve the 127 cross-module private
+    imports (runner 54, checkers 57, setup-testing 16) by making shared helpers
+    public or moving them behind public facades; do not delete symbols still
+    imported at runtime.
+  - Delete the dead `runner/_baseline_helpers.py` plus `.pyi` (DEAD-1) and
+    coordinate with test-debloat to remove or repoint `TestCompareSorted` and
+    the 50k benchmark in `tests/runner/test_baseline_diff.py`.
+  - "Apply the beartype report: add @beartype and delete the 16 resolvable
+    suppressions; runtime-import PyLinter for 6 registers and Path for
+    `_setup_update.update`; break the 3 StubChecker cycles with a Protocol or
+    method; add @beartype to `scripts/create_root_symlinks.py::main` and lint
+    scripts/."
+  - Remove the `peek_fallback_tools` function/stub/export/doc/allowlist chain
+    (WRAP-1) and shrink the trivial-wrapper allowlist, including the three dead
+    `_legacy_*` names (WRAP-2).
+  - Deduplicate the symlink logic and the three config manifests shared by
+    `scripts/create_root_symlinks.py`, `setup.py`, and `runner/_config.py`
+    (DUP-1/DUP-2).
+  - Delete the astroid-3 docstring fallback and narrow the broad
+    AttributeError/Exception catches (AST-1..3); convert the 42 W9740 silent
+    paths to structured debug/error events or a documented best-effort helper
+    (ERR-1).
+  - Update AGENTS.md counts/tool scope, docs/semantic-justification.md, and
+    pre-commit documentation after the final merge; keep `lint.baseline` empty
+    rather than baselining any row.
+  - Reserve `checkers/_decision_cache.py` and `.pyi` for semantic only; the
+    cache item must address the open POSIX-only flock concern (c-3e935debcb) and
+    the constant-rule-symbol cache-key concern (c-5463b26c4b) before docs
+    describe a git-stored cache.
+concerns:
+  - kind: tech-debt
+    summary: W9707 .pyi enforcement is blind, so 203 private stub declarations are
+      unguarded
+    detail: PyiUnderscoreChecker sets _is_pyi from node.file; pylint maps a .pyi
+      path to the .py module file, so no W9707 fires even though extra_tools.pyi
+      alone has 19 private symbols. Fix PYI-4 before bulk stub cleanup or the
+      cleanup has no regression guard.
+    severity: high
+    location:
+      file: src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py
+      line: 40
+    affects:
+      - coding-rules-audit
+      - stub-cleanup
+      - pylint-pyi
+  - kind: tech-debt
+    summary: Production-dead _baseline_helpers module is pinned only by tests
+    detail: runner/_baseline_helpers.py (82 lines) and its 31-line stub are unused
+      by src; tests/runner/test_baseline_diff.py:13 imports _compare_sorted.
+      Deleting it requires test-debloat coordination, otherwise the tests keep
+      dead code alive.
+    severity: medium
+    location:
+      file: src/python_setup_lint/runner/_baseline_helpers.py
+      line: 1
+    affects:
+      - coding-rules-audit
+      - test-debloat-audit
+  - kind: tech-debt
+    summary: peek_fallback_tools debt comment names a completed owner
+    detail: baseline.py:18-22 says the shim is debt owned by dispatch-split, but the
+      dispatch split is complete (dispatch.py is 449 lines, no C0302 disable).
+      The comment risks leaving an orphaned export chain; the audit assigns it
+      to runner.
+    severity: low
+    location:
+      file: src/python_setup_lint/runner/baseline.py
+      line: 18
+    affects:
+      - coding-rules-audit
+      - runner
+  - kind: risk
+    summary: Semantic docs still describe the removed cross-encoder while the
+      decision cache does not exist
+    detail: AGENTS.md:82-85 and docs/semantic-justification.md:3-26,51-53 document
+      sentence-transformers/cross-encoder/reranker, but the tree contains
+      _decision_backend.py and no _decision_cache.py. Docs must not claim a
+      git-stored cache before the semantic cache item lands; this is root-owned
+      documentation updated with the semantic epic.
+    severity: medium
+    location:
+      file: docs/semantic-justification.md
+      line: 3
+    affects:
+      - coding-rules-audit
+      - semantic-docs
+      - decision-cache-impl
+  - kind: assumption
+    summary: LoC deltas are gross estimates; public renames offset stub deletion
+    detail: Private stub declarations that are imported cross-module cannot simply
+      be deleted; they must be renamed public, so the net reduction is lower
+      than the gross -165 LoC estimated for PYI-1..3. Use the rows as
+      prioritization, not as a precise budget.
+    severity: low
+    location:
+      file: src/python_setup_lint/checkers/_base.pyi
+      line: 18
+    affects:
+      - coding-rules-audit
+remarkable:
+  - chosen: Group the 203 private stub declarations into three per-owner rows plus
+      the W9707 enforcement row, rather than 203 individual rows
+    why: The fix is one mechanical stub-surface cleanup per owner, and per-owner
+      totals make the inter-dep ownership map actionable; individual rows would
+      obscure that PYI-4 is a prerequisite and that 127 imports block deletion.
+    alternatives:
+      - One row per declaration (precise but noisy and duplicates the same fix)
+      - Report only aggregate counts without per-owner evidence (loses the map
+        contract)
+  - chosen: Run the lint gate with PYTHON_SETUP_LINT_NO_AUTOFIX=1 and rely on direct
+      AST/pylint probes for the audit
+    why: Preserves the read-only repository invariant while still proving 14/14
+      tools pass and that the debt is suppressed; bare `uv run lint` would
+      autofix tracked files and invalidate the audit state.
+    alternatives:
+      - Run bare `uv run lint` and revert autofixes (risk of partial writes)
+      - Skip lint entirely and cite only prior audit results (weaker final-state
+        evidence)
+  - chosen: Treat TD-11 as resolved at the config layer rather than as a runner hack
+    why: The only tests/data exclusion is config/rumdl.toml:3, consistent with ruff,
+      pylint, and pyright config excludes; dispatch.py:300 only contains a
+      path-scanning comment. Recording a false runner-side TD-11 would misassign
+      work to runner.
+    alternatives:
+      - Invent a runner-side fix row (would duplicate the config exclusion)
+      - Leave TD-11 unmentioned (fails the assignment's explicit inventory
+        request)
diff --git a/.factory/tasks/modernize/items/consolidate-integration-helpers-v3/merge-attempts.yaml b/.factory/tasks/modernize/items/consolidate-integration-helpers-v3/merge-attempts.yaml
deleted file mode 100644
index f67fb6b..0000000
--- a/.factory/tasks/modernize/items/consolidate-integration-helpers-v3/merge-attempts.yaml
+++ /dev/null
@@ -1,2 +0,0 @@
-attempts:
-  "11": 1
diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
index c98a972..f3e8b43 100644
--- a/.factory/tasks/modernize/journal.ndjson
+++ b/.factory/tasks/modernize/journal.ndjson
@@ -2212,53 +2212,3 @@
 {"type":"step_timeout_armed","task":"modernize","item":"cache-design-spike","step":"develop","timeoutSec":5400,"ts":"2026-11-09T22:54:38.930Z"}
 {"type":"step_transcript_size_warning","task":"modernize","item":"cache-design-spike","step":"develop","attempt":1,"sizeBytes":16893418,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T22-54-39-286Z_01a1c285-50b6-742b-bd37-9d3702343a29.jsonl","ts":"2026-11-09T23:18:39.881Z"}
 {"type":"step_tool_call_warning","task":"modernize","item":"cache-design-spike","step":"develop","attempt":1,"toolCalls":125,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T22-54-39-286Z_01a1c285-50b6-742b-bd37-9d3702343a29.jsonl","ts":"2026-11-09T23:18:39.882Z"}
-{"type":"step_finished","task":"modernize","item":"cache-design-spike","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c285-50b6-742b-bd37-9d3702343a29","usage":{"inputTokens":176978,"outputTokens":87972,"costUsd":0.105401},"ts":"2026-11-09T23:18:40.212Z"}
-{"type":"step_started","task":"modernize","item":"coding-rules-audit","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--coding-rules-audit/.factory/tasks/modernize/items/coding-rules-audit/steps/001-research-r1-a1","ts":"2026-11-09T23:19:09.259Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"coding-rules-audit","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:19:09.264Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"coding-rules-audit","step":"research","attempt":1,"sizeBytes":19744278,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-19-09-695Z_01a1c29b-c07f-7662-b7bd-0475e001272c.jsonl","ts":"2026-11-09T23:33:30.946Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"coding-rules-audit","step":"research","attempt":1,"toolCalls":112,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-19-09-695Z_01a1c29b-c07f-7662-b7bd-0475e001272c.jsonl","ts":"2026-11-09T23:33:30.947Z"}
-{"type":"step_finished","task":"modernize","item":"coding-rules-audit","step":"research","attempt":1,"status":"ok","sessionId":"01a1c29b-c07f-7662-b7bd-0475e001272c","usage":{"inputTokens":187879,"outputTokens":83867,"costUsd":0.104406},"ts":"2026-11-09T23:33:31.175Z"}
-{"type":"item_merge_started","item":"consolidate-integration-helpers-v3","branch":"topic/modernize--consolidate-integration-helpers-v3","wave":11,"mergeAttempt":1,"ts":"2026-11-09T23:33:34.826Z"}
-{"type":"item_merge_phase","item":"consolidate-integration-helpers-v3","phase":"merge-parent-into-child","ts":"2026-11-09T23:33:34.830Z"}
-{"type":"merge_conflict","item":"consolidate-integration-helpers-v3","conflicts":["tests/_project_helpers.py","tests/integration.py","tests/runner/_autofix_helpers.py","tests/runner/test_autofix_conflict.py","tests/runner/test_autofix_conflict_apply.py","tests/runner/test_autofix_conflict_integration.py","tests/runner/test_pyright_noise_filter.py","tests/runner/test_self_lint_clean.py"],"ts":"2026-11-09T23:34:30.219Z"}
-{"type":"step_started","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--consolidate-integration-helpers-v3/.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/005-integrate-r1-a1","ts":"2026-11-09T23:34:30.539Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","timeoutSec":5400,"ts":"2026-11-09T23:34:30.544Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"sizeBytes":7227980,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-34-30-965Z_01a1c2a9-cf35-77dd-bcde-b7d07dddc697","ts":"2026-11-09T23:41:30.442Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"toolCalls":73,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-34-30-965Z_01a1c2a9-cf35-77dd-bcde-b7d07dddc697","ts":"2026-11-09T23:41:30.444Z"}
-{"type":"harness_model_fallback","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-09T23:41:34.586Z"}
-{"type":"harness_model_fallback","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-09T23:41:36.950Z"}
-{"type":"step_output_repaired","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"method":"relaunch","ts":"2026-11-09T23:49:50.600Z"}
-{"type":"step_finished","task":"modernize","item":"consolidate-integration-helpers-v3","step":"integrate","attempt":1,"status":"ok","sessionId":"01a1c2a9-cf35-77dd-bcde-b7d07dddc697","usage":{"inputTokens":121859,"outputTokens":52850,"costUsd":0.066984},"ts":"2026-11-09T23:49:50.760Z"}
-{"type":"item_merge_failed","item":"consolidate-integration-helpers-v3","error":"Cannot conclude merge: conflict markers or unmerged files remain in tests/runner/test_pyright_noise_filter.py, tests/runner/test_self_lint_clean.py","mergeAttempt":1,"ts":"2026-11-09T23:49:50.813Z"}
-{"type":"step_started","task":"modernize","item":"docs-counts-sync","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--docs-counts-sync/.factory/tasks/modernize/items/docs-counts-sync/steps/001-test-first-r1-a1","ts":"2026-11-09T23:50:10.097Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"docs-counts-sync","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T23:50:10.103Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"docs-counts-sync","step":"test-first","attempt":1,"sizeBytes":14110437,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-50-10-404Z_01a1c2b8-24e4-714a-b392-1a3440f53cc1.jsonl","ts":"2026-11-09T23:58:46.505Z"}
-{"type":"step_finished","task":"modernize","item":"docs-counts-sync","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c2b8-24e4-714a-b392-1a3440f53cc1","usage":{"inputTokens":70279,"outputTokens":32429,"costUsd":0.033694},"ts":"2026-11-09T23:58:53.278Z"}
-{"type":"step_started","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-kickoff-gate/.factory/tasks/modernize/items/epic-kickoff-gate/steps/001-research-r1-a1","ts":"2026-11-09T23:59:23.326Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"epic-kickoff-gate","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:59:23.331Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"sizeBytes":15060344,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-59-23-689Z_01a1c2c0-9629-723b-9b20-769bd656e054.jsonl","ts":"2026-11-10T00:08:48.380Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"toolCalls":95,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T23-59-23-689Z_01a1c2c0-9629-723b-9b20-769bd656e054.jsonl","ts":"2026-11-10T00:08:48.382Z"}
-{"type":"step_finished","task":"modernize","item":"epic-kickoff-gate","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2c0-9629-723b-9b20-769bd656e054","usage":{"inputTokens":121841,"outputTokens":49513,"costUsd":0.057369},"ts":"2026-11-10T00:08:48.680Z"}
-{"type":"step_started","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--epic-shift-report-collection/.factory/tasks/modernize/items/epic-shift-report-collection/steps/001-research-r1-a1","ts":"2026-11-10T00:09:19.937Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"epic-shift-report-collection","step":"research","timeoutSec":3600,"ts":"2026-11-10T00:09:19.943Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"sizeBytes":22559494,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"epic-shift-report-collection","step":"research","attempt":1,"toolCalls":65,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-10T00-09-20-448Z_01a1c2c9-b140-700c-9319-d3dbbbaad9b1.jsonl","ts":"2026-11-10T00:14:51.536Z"}
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
diff --git a/.factory/tasks/modernize/state.yaml b/.factory/tasks/modernize/state.yaml
index f002168..6195c45 100644
--- a/.factory/tasks/modernize/state.yaml
+++ b/.factory/tasks/modernize/state.yaml
@@ -2,7 +2,7 @@ task: modernize
 kind: saga
 status: active
 iteration: 5
-currentWave: 2
+currentWave: 4
 items:
   adr-formalization:
     kind: no-behavior
@@ -165,12 +165,11 @@ items:
     mergedAt: 2026-11-09T00:11:56-05:00
   epic-kickoff-gate:
     kind: fact-finder
-    status: running
+    status: blocked
     branch: topic/modernize--epic-kickoff-gate
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.057369
-    currentStep: research
+    spendUsd: 0
   golden-contract-hardening:
     kind: test-only
     status: merged
@@ -217,12 +216,11 @@ items:
     mergedAt: 2026-11-09T13:56:23-05:00
   cache-design-spike:
     kind: poc
-    status: running
+    status: blocked
     branch: topic/modernize--cache-design-spike
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.105401
-    currentStep: develop
+    spendUsd: 0
   checkers-legacy-dead-cleanup:
     kind: no-behavior
     status: blocked
@@ -257,12 +255,11 @@ items:
     mergedAt: 2026-11-08T10:47:48-05:00
   epic-shift-report-collection:
     kind: fact-finder
-    status: running
+    status: blocked
     branch: topic/modernize--epic-shift-report-collection
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.040594
-    currentStep: research
+    spendUsd: 0
   remaining-lint-violations-fix:
     kind: no-behavior
     status: merged
@@ -301,12 +298,11 @@ items:
     mergedAt: 2026-11-09T01:20:54-05:00
   coding-rules-audit:
     kind: fact-finder
-    status: running
+    status: pending
     branch: topic/modernize--coding-rules-audit
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.104406
-    currentStep: research
+    spendUsd: 0
   decision-cache-impl:
     kind: dev
     status: failed
@@ -317,12 +313,11 @@ items:
     currentStep: qa
   golden-regen-hatch:
     kind: test-only
-    status: running
+    status: blocked
     branch: topic/modernize--golden-regen-hatch
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.025239
-    currentStep: develop
+    spendUsd: 0
   never-test-linting-prune:
     kind: test-only
     status: merged
@@ -343,12 +338,11 @@ items:
     mergedAt: 2026-11-08T12:55:17-05:00
   final-gate-validation:
     kind: fact-finder
-    status: running
+    status: blocked
     branch: topic/modernize--final-gate-validation
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.052455
-    currentStep: research
+    spendUsd: 0
   semantic-tests-rewrite:
     kind: test-only
     status: blocked
@@ -358,12 +352,11 @@ items:
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
@@ -413,22 +406,21 @@ items:
     spendUsd: 0
   consolidate-integration-helpers-v3:
     kind: test-only
-    status: running
+    status: ready
     branch: topic/modernize--consolidate-integration-helpers-v3
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.259824
-    currentStep: integrate
+    spendUsd: 0.19283999999999998
+    currentStep: review
   docs-counts-sync:
     kind: dev
-    status: running
+    status: pending
     branch: topic/modernize--docs-counts-sync
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.033694
-    currentStep: test-first
+    spendUsd: 0
 concerns:
-  open: 34
+  open: 0
   dismissed: 0
   routed: 1
   resolved: 2
@@ -690,14 +682,14 @@ debt:
     obscure"
   - '[consolidate-integration-helpers-v3] make_consumer_project hardcodes
     "consumer" dirname for hooks test'
-budgetSpentUsd: 12.835531685999996
+budgetSpentUsd: 12.169640685999996
 spendByRole:
   workhorse:
-    costUsd: 6.112707685999999
-    inputTokens: 12342006
-    outputTokens: 4463702
+    costUsd: 5.446816686
+    inputTokens: 10745022
+    outputTokens: 3940170
   alt-workhorse:
-    costUsd: 1.5378180000000008
+    costUsd: 1.5378180000000001
     inputTokens: 7319130
     outputTokens: 2605987
   architect:
@@ -809,6 +801,10 @@ spendByItem:
     costUsd: 0.13088
     inputTokens: 218824
     outputTokens: 95126
+  consolidate-integration-helpers-v3:
+    costUsd: 0.19283999999999998
+    inputTokens: 341355
+    outputTokens: 174695
   stale-disables-portability-cleanup:
     costUsd: 0.025615000000000002
     inputTokens: 54537
@@ -817,10 +813,10 @@ spendByItem:
     costUsd: 0.09088800000000001
     inputTokens: 274090
     outputTokens: 70148
-  never-test-linting-prune:
-    costUsd: 0.055946
-    inputTokens: 148483
-    outputTokens: 85833
+  decision-cache-impl:
+    costUsd: 0.393308
+    inputTokens: 802730
+    outputTokens: 337356
   runner-dispatch-split:
     costUsd: 0.128832
     inputTokens: 294444
@@ -829,54 +825,10 @@ spendByItem:
     costUsd: 0.041291
     inputTokens: 95491
     outputTokens: 43569
-  secrets-triage-spike:
-    costUsd: 0.19651400000000002
-    inputTokens: 713974
-    outputTokens: 167344
-  final-gate-validation:
-    costUsd: 0.052455
-    inputTokens: 95165
-    outputTokens: 54227
-  consolidate-integration-helpers-v3:
-    costUsd: 0.259824
-    inputTokens: 463214
-    outputTokens: 227545
-  epic-kickoff-gate:
-    costUsd: 0.057369
-    inputTokens: 121841
-    outputTokens: 49513
-  cache-design-spike:
-    costUsd: 0.105401
-    inputTokens: 176978
-    outputTokens: 87972
-  coding-rules-audit:
-    costUsd: 0.104406
-    inputTokens: 187879
-    outputTokens: 83867
-  epic-shift-report-collection:
-    costUsd: 0.040594
-    inputTokens: 88261
-    outputTokens: 36328
-  decision-cache-impl:
-    costUsd: 0.393308
-    inputTokens: 802730
-    outputTokens: 337356
   consolidate-integration-helpers-v2:
     costUsd: 0.258951
     inputTokens: 549144
     outputTokens: 175859
-  test-debloat-audit:
-    costUsd: 0.179749
-    inputTokens: 684503
-    outputTokens: 103456
-  docs-counts-sync:
-    costUsd: 0.033694
-    inputTokens: 70279
-    outputTokens: 32429
-  golden-regen-hatch:
-    costUsd: 0.025239
-    inputTokens: 50219
-    outputTokens: 22890
   pylint-cache-assumptions:
     costUsd: 0.23190968599999998
     inputTokens: 455233
@@ -889,4 +841,12 @@ spendByItem:
     costUsd: 6.273198999999999
     inputTokens: 24056719
     outputTokens: 2199382
-lastUpdated: 2026-11-10T00:53:25.706Z
+  never-test-linting-prune:
+    costUsd: 0.055946
+    inputTokens: 148483
+    outputTokens: 85833
+  secrets-triage-spike:
+    costUsd: 0.19651400000000002
+    inputTokens: 713974
+    outputTokens: 167344
+lastUpdated: 2026-11-09T22:54:21.229Z

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

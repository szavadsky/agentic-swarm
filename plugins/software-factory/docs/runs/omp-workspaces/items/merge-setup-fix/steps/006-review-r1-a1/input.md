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
- id: c-552344216d
  kind: blocker
  severity: high
  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
  affects:
    - "19.2"
    - wave-merge
- id: c-f972360209
  kind: tech-debt
  severity: medium
  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
  affects:
    - redrive
    - wave-merge
- id: c-f415508eb1
  kind: risk
  severity: medium
  summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated test failures
  affects:
    - gates
    - wave-merge
- id: c-8dc9dd1c4d
  kind: risk
  severity: medium
  summary: Full-suite gates under parallel wave items cause timeout flakes (5s default)
  affects:
    - gates
    - wave-merge
- id: c-7ca231f0aa
  kind: risk
  severity: medium
  summary: stranded-wave test has a 5s timeout that flakes under full-suite parallel load
  affects:
    - gates
    - wave-merge
- id: rm-02fe59eb65
  kind: remarkable
  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
- id: rm-61c10c8318
  kind: remarkable
  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
- id: rm-63922d9635
  kind: remarkable
  summary: Configure omp via a generated YAML overlay per turn
- id: rm-ac427a6618
  kind: remarkable
  summary: "Engine-managed git worktrees (`git worktree add` + `omp --cwd`) rather than omp `isolated: true` subagent tasks"
- id: rm-df9df7bd8a
  kind: remarkable
  summary: Epics run in-process as child tasks with an in-process `runTaskChild`
- id: rm-565790e99d
  kind: remarkable
  summary: On-demand whole-tree derivation; no registry
- id: rm-6344b013f9
  kind: remarkable
  summary: Additive optional cache fields; no record migration
- id: rm-d5301c7af1
  kind: remarkable
  summary: Real-binary scripted-provider e2e; FakeHarness retained


- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
- Raise concerns with evidence when review uncovers new cross-cutting issues.

## Assignment
{
  "slug": "merge-setup-fix",
  "kind": "dev",
  "title": "Run infra.setup in merge child worktree before gates",
  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
  "outlineRef": "merge-setup-fix",
  "milestone": "m1-omp-de-risk",
  "wave": 2,
  "citations": [
    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
    "gates.ts:332-335 runInfraSetup temp-worktree path",
    "runner.ts:796-810 runInfraSetup temp-worktree path"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml b/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
deleted file mode 100644
index 1499898..0000000
--- a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
+++ /dev/null
@@ -1,29 +0,0 @@
-id: c-0647070832
-kind: tech-debt
-summary: Child/merge worktrees still need infra.setup (bun install) before the
-  bun test runner can collect tests; this worktree had no node_modules until
-  installed manually
-detail: Running `bun test` in a fresh worktree failed with `Cannot find package
-  'yaml'` from test/records-and-fingerprint.test.ts and src/core/prompts.ts
-  until `bun install` was run. This is the pre-existing open concern
-  c-552344216d (missing infra.setup in merge-child worktrees), not introduced by
-  this step; node_modules is gitignored and not part of the change.
-affects:
-  - target-red
-  - wave-merge
-severity: high
-status: dismissed
-source:
-  record: 001-test-first-r1-a1
-  agent: developer
-  step: test-first
-  item: usage-cache-tokens
-  lastSeen: 2026-11-10T02:05:24.168Z
-createdAt: 2026-11-10T02:05:24.168Z
-updatedAt: 2026-11-10T02:46:53.285Z
-disposition: dismiss
-dismissReason: "Self-declared duplicate: the concern's own detail text states
-  'This is the pre-existing open concern c-552344216d (missing infra.setup in
-  merge-child worktrees), not introduced by this step'. Same root cause (bun
-  install absent in fresh worktree), same affects. Keep c-552344216d as
-  canonical."
diff --git a/.factory/tasks/omp-workspaces/concerns/c-7ca231f0aa.yaml b/.factory/tasks/omp-workspaces/concerns/c-7ca231f0aa.yaml
deleted file mode 100644
index 4348605..0000000
--- a/.factory/tasks/omp-workspaces/concerns/c-7ca231f0aa.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-7ca231f0aa
-kind: risk
-summary: stranded-wave test has a 5s timeout that flakes under full-suite parallel load
-detail: test/engine/stranded-wave.test.ts:255 second-consult test timed out at
-  5057ms in the full-suite gate run but passes in 7.2s file-time when isolated.
-  Under 102-file parallel load the per-test 5s budget is too tight; gate
-  failures from this test are likely load artifacts rather than regressions.
-  Consider raising the per-test timeout or reducing suite concurrency.
-location:
-  file: plugins/software-factory/test/engine/stranded-wave.test.ts
-  line: 255
-affects:
-  - gates
-  - wave-merge
-severity: medium
-status: open
-source:
-  record: 004-develop-r1-a1
-  agent: developer
-  step: develop
-  item: merge-setup-fix
-  lastSeen: 2026-11-10T03:47:10.380Z
-createdAt: 2026-11-10T03:47:10.380Z
-updatedAt: 2026-11-10T03:47:10.380Z
diff --git a/.factory/tasks/omp-workspaces/concerns/c-8dc9dd1c4d.yaml b/.factory/tasks/omp-workspaces/concerns/c-8dc9dd1c4d.yaml
deleted file mode 100644
index 487f9b6..0000000
--- a/.factory/tasks/omp-workspaces/concerns/c-8dc9dd1c4d.yaml
+++ /dev/null
@@ -1,22 +0,0 @@
-id: c-8dc9dd1c4d
-kind: risk
-summary: Full-suite gates under parallel wave items cause timeout flakes (5s default)
-detail: merge-setup-fix develop was rejected 2/2 by a 5000ms timeout in
-  stranded-wave.test.ts (a test that never touches mergeItem) plus a
-  between-tests teardown error, with 'killed 1 dangling process' in output —
-  while 4 wave-2 items each run the full ~250s bun suite as gates concurrently.
-  Full-suite-as-gate under parallel items makes timeouts load-dependent;
-  consider serializing full-suite gates, raising per-test timeout, or scoping
-  item gates to affected selectors.
-affects:
-  - gates
-  - wave-merge
-severity: medium
-status: open
-source:
-  record: 017-consult-merge-setup-fix-1-a1
-  agent: architect
-  step: consult-merge-setup-fix-1
-  lastSeen: 2026-11-10T03:08:41.502Z
-createdAt: 2026-11-10T03:08:41.502Z
-updatedAt: 2026-11-10T03:08:41.502Z
diff --git a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml b/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
deleted file mode 100644
index fdfe75a..0000000
--- a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: c-f415508eb1
-kind: risk
-summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated
-  test failures
-detail: "When TMPDIR points under .factory-runtime/tmp, disk-space.test.ts
-  counts the tmpdir itself as a second low-space path (fails: expected 1 failing
-  path, got 2) and several engine tests fail with git 'could not create
-  temporary file' or 5s timeouts under contention. With TMPDIR=/tmp the same
-  full suite is fully green (669 pass / 2 skip / 0 fail). This is
-  pre-existing/environmental and not caused by this test-only diff, but it
-  affects gate greenness for any item run in this environment."
-affects:
-  - gates
-  - wave-merge
-severity: medium
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: transport-byte-stability
-  lastSeen: 2026-11-10T02:28:29.083Z
-createdAt: 2026-11-10T02:28:29.083Z
-updatedAt: 2026-11-10T02:28:29.083Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml b/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
deleted file mode 100644
index 9f8e15f..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
+++ /dev/null
@@ -1,21 +0,0 @@
-id: rm-4e7a8c758b
-chosen: Published the full embedded draft for isolation and enriched it with the
-  approved findings' 27-probe command log, config surface, and follow-ups.
-alternatives:
-  - Publish only the compact embedded full draft (fails the
-    probe-log/recommendations acceptance)
-  - Reconstruct the whole document from the pre-draft findings (duplicates the
-    approved draft)
-why: The M1 directional interface requires findings + probe logs +
-  recommendations, and the embedded compact draft had no dedicated
-  probe/recommendation sections; all added content comes from the same approved
-  research output, so no new probes were invented.
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: spike-findings-recovery
-  lastSeen: 2026-11-10T02:23:11.570Z
-createdAt: 2026-11-10T02:23:11.570Z
-updatedAt: 2026-11-10T02:23:11.570Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml b/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
deleted file mode 100644
index 3cdbede..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
+++ /dev/null
@@ -1,18 +0,0 @@
-id: rm-63a8ee819c
-chosen: Wrote RECOVERY.md at the assigned
-  `items/spike-findings-recovery/RECOVERY.md` item-local path.
-alternatives:
-  - Write a repo-root `items/` copy (not the assigned task-workspace path)
-  - Write under engine-owned `.factory` records (explicitly forbidden)
-why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
-  engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
-  `decisions/`) was modified.
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: spike-findings-recovery
-  lastSeen: 2026-11-10T02:23:11.570Z
-createdAt: 2026-11-10T02:23:11.570Z
-updatedAt: 2026-11-10T02:23:11.570Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml b/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
deleted file mode 100644
index 8bab5e4..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
+++ /dev/null
@@ -1,20 +0,0 @@
-id: rm-8363899156
-chosen: Pin the prompt filename instability with explicit shape and difference
-  assertions plus comments, instead of stabilizing transport.
-alternatives:
-  - "Stabilize prompt paths in production code: out of scope for this test-only
-    item."
-  - "Only compare normalized argv: would hide the unstable element instead of
-    pinning it."
-why: Assignment defers stabilization to M7 after spike-cache-key; a
-  failing-explicit assertion documents the currently unstable behavior and will
-  point at the decision when transport is stabilized.
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: transport-byte-stability
-  lastSeen: 2026-11-10T02:28:29.083Z
-createdAt: 2026-11-10T02:28:29.083Z
-updatedAt: 2026-11-10T02:28:29.083Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml b/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
deleted file mode 100644
index 22471e5..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
+++ /dev/null
@@ -1,18 +0,0 @@
-id: rm-9efb47e04e
-chosen: Specify zero-default aggregation and optional schema properties, with no
-  migration of historical records.
-alternatives:
-  - Migration/backfill of old records (explicitly out of scope).
-  - Required schema fields (would invalidate historical records).
-why: "Matches the assignment contract: absent cache keys in old meta.yaml/NDJSON
-  must read as 0 and remain schema-valid, while new records persist
-  cacheReadTokens/cacheWriteTokens/totalTokens and a cost breakdown."
-status: open
-source:
-  record: 001-test-first-r1-a1
-  agent: developer
-  step: test-first
-  item: usage-cache-tokens
-  lastSeen: 2026-11-10T02:05:24.168Z
-createdAt: 2026-11-10T02:05:24.168Z
-updatedAt: 2026-11-10T02:05:24.168Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml b/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml
deleted file mode 100644
index 7481d13..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml
+++ /dev/null
@@ -1,21 +0,0 @@
-id: rm-af4c866bf2
-chosen: Characterize transport via mock omp binary snapshotting argv + file
-  bytes, with only the real-binary --config --version acceptance check behind
-  describe.skipIf.
-alternatives:
-  - Live-model harness turns (paid, flaky)
-  - In-process spawn mocking (bypasses real argv assembly)
-  - Pure-function tests only (cannot pin timestamped prompt filename)
-why: Captures exact harness-to-omp bytes/argv without provider contact (no paid
-  turns) or requiring omp on clean checkout, while still validating overlay
-  acceptance with the real binary when present using preflight's own non-paid
-  validation.
-status: open
-source:
-  record: 002-review-r1-a1
-  agent: reviewer
-  step: review
-  item: transport-byte-stability
-  lastSeen: 2026-11-10T02:46:53.244Z
-createdAt: 2026-11-10T02:46:53.244Z
-updatedAt: 2026-11-10T02:46:53.244Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-b806236551.yaml b/.factory/tasks/omp-workspaces/concerns/rm-b806236551.yaml
deleted file mode 100644
index dfb8b4f..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-b806236551.yaml
+++ /dev/null
@@ -1,20 +0,0 @@
-id: rm-b806236551
-chosen: Diagnose first and make no production changes on retry
-alternatives:
-  - Audit and rewrite merge-path empty-setup parity paths (would risk breaking
-    passing merge-setup tests for a non-reproducible failure)
-  - Increase the test timeout in stranded-wave.test.ts (out of scope for this
-    assignment; raised as a concern instead)
-why: Review feedback directed isolating the failing file before touching code;
-  the isolated pass (4/4) plus a clean full-suite re-run (only accepted baseline
-  disk-space failure) proves the failure was load contention in the harness, not
-  merge-path behavior.
-status: open
-source:
-  record: 004-develop-r1-a1
-  agent: developer
-  step: develop
-  item: merge-setup-fix
-  lastSeen: 2026-11-10T03:47:10.380Z
-createdAt: 2026-11-10T03:47:10.380Z
-updatedAt: 2026-11-10T03:47:10.380Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml b/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
deleted file mode 100644
index 273f553..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
+++ /dev/null
@@ -1,25 +0,0 @@
-id: rm-ccac403fa7
-chosen: Characterize transport via a mock omp binary that snapshots argv plus
-  the --system-prompt/-p/--config files, and guard only the real-binary overlay
-  acceptance check with omp-presence skip.
-alternatives:
-  - "Run harness turns against real omp with live models: paid and flaky,
-    violates no-paid-turns constraint."
-  - "Mock the bun spawn module in-process: fragile, bypasses the real argv
-    assembly path."
-  - "Test only pure generateOmpConfigOverlay/render functions: cannot pin the
-    timestamped prompt filename or full argv instability."
-why: This captures the exact bytes and argv the harness would hand to omp
-  without contacting a provider (no paid turns) and without requiring omp on a
-  clean checkout, while still validating the generated overlay with the real
-  binary when it is installed using the same non-paid `--config <overlay>
-  --version` preflight performs.
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: transport-byte-stability
-  lastSeen: 2026-11-10T02:28:29.083Z
-createdAt: 2026-11-10T02:28:29.083Z
-updatedAt: 2026-11-10T02:28:29.083Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
deleted file mode 100644
index 71f4351..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
+++ /dev/null
@@ -1,21 +0,0 @@
-id: rm-d3a28fa170
-chosen: Deliver a test-only diff and defer the merge-path.ts implementation to
-  the follow-up develop step.
-alternatives:
-  - Implement mergeItem setup execution in this step as the story assignment
-    text lists — rejected because target-red would see green and
-    test-first-scope rejects modified src/** files.
-  - Introduce a prod interface stub — unnecessary because the tests exercise the
-    existing mergeItem export.
-why: The story.dev flow runs test-first-scope (rejects any modified prod file)
-  and target-red (declared tests must currently fail) in this step; shipping the
-  implementation here would fail both mechanical checks.
-status: open
-source:
-  record: 001-test-first-r1-a1
-  agent: developer
-  step: test-first
-  item: merge-setup-fix
-  lastSeen: 2026-11-10T02:12:17.201Z
-createdAt: 2026-11-10T02:12:17.201Z
-updatedAt: 2026-11-10T02:12:17.201Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
deleted file mode 100644
index c8c12a6..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
+++ /dev/null
@@ -1,20 +0,0 @@
-id: rm-d63aed4fdb
-chosen: Declare expectRed ids as bare Bun test names rather than file-qualified
-  `file::test` node ids.
-alternatives:
-  - File-qualified `test/...::test` ids (would not match Bun's describe-based
-    JUnit ids unless the describe name is also embedded).
-  - Full `<describe>.<test>` ids (brittle to describe renames).
-why: "Bun's JUnit reporter emits ids as `<innermost describe>.<test name>` with
-  no file path in the id; the engine's normalizer matches a bare id by suffix
-  (`id.endsWith('.' + expectId)`). Verified against parseJunit output: all 11
-  ids match exactly one failing case."
-status: open
-source:
-  record: 001-test-first-r1-a1
-  agent: developer
-  step: test-first
-  item: usage-cache-tokens
-  lastSeen: 2026-11-10T02:05:24.168Z
-createdAt: 2026-11-10T02:05:24.168Z
-updatedAt: 2026-11-10T02:05:24.168Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml b/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
deleted file mode 100644
index 681e394..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
+++ /dev/null
@@ -1,19 +0,0 @@
-id: rm-eaf2656f2a
-chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
-  documenting why it is justified over `test/harness/mock-provider`.
-alternatives:
-  - Rename to `test/harness/mock-provider` (conflicts with the M8 plan interface)
-  - Drop the proposal path entirely (loses actionable M8 guidance)
-why: The M8 plan's directional interface explicitly names
-  `test/e2e/mock-provider/*`, and the split keeps the no-model scripted suite
-  separate from paid live coverage; the review allowed either the repo idiom or
-  a justification.
-status: open
-source:
-  record: 001-develop-r1-a1
-  agent: developer
-  step: develop
-  item: spike-findings-recovery
-  lastSeen: 2026-11-10T02:23:11.570Z
-createdAt: 2026-11-10T02:23:11.570Z
-updatedAt: 2026-11-10T02:23:11.570Z
diff --git a/.factory/tasks/omp-workspaces/decisions/011-item-merge-setup-fix-1.yaml b/.factory/tasks/omp-workspaces/decisions/011-item-merge-setup-fix-1.yaml
deleted file mode 100644
index a8c3ae8..0000000
--- a/.factory/tasks/omp-workspaces/decisions/011-item-merge-setup-fix-1.yaml
+++ /dev/null
@@ -1,27 +0,0 @@
-id: decision-merge-setup-fix-1794280121500
-context: item
-item: merge-setup-fix
-afterRecord: 003-develop-r1-a2
-decision: retry-with-guidance
-timestamp: 2026-11-10T03:08:41.500Z
-rationale: "2/2 develop attempts rejected solely by the test gate; the new
-  merge-setup tests pass (667 pass). The single new failure — stranded-wave
-  consult-refire — cannot be caused by this change: that test's item never
-  reaches ready/merge (perpetual fix dispositions + consults), its infra has
-  empty gates/setup, and it failed via a 5000ms timeout plus a between-tests
-  teardown error alongside 'killed 1 dangling process' — a load flake under 4
-  concurrent full-suite gate runs in wave 2. No evidence of prod regression;
-  abandoning would lose the critical wave-1 merge unblocker."
-text: "RETRY (gate flake, not prod regression — isolate before touching code):
-  1) Run ONLY the failing file in isolation from plugins/software-factory: `bun
-  test test/engine/stranded-wave.test.ts`. Expect pass. That test never invokes
-  mergeItem (item never becomes ready; infra has empty gates), so an isolated
-  pass proves the full-suite timeout was load contention — do NOT rewrite prod
-  code in that case. 2) Re-run the full `bun test` once; success = no NEW
-  failing tests vs baseline (only the accepted disk-space env failure may
-  remain). 3) ONLY if the isolated file also fails: treat as real regression —
-  audit your merge-path diff for strict empty-setup parity (no-op before any
-  journal/git/snapshot side effect, identical return paths when infra.setup is
-  empty/missing) and fix minimally. Keep prod diff ~80 lines; preserve the new
-  passing merge-setup tests."
-persist: true
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..a625917
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,31 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/merge-setup.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 3 expected tests failed with assertion failures"
+    details:
+      command: bun --cwd=plugins/software-factory test test/engine/merge-setup.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794276734716-3kdgmfp2jbu.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - merge-path infra.setup.runs setup in the child worktree before gates,
+          and setup-created untracked files are not gate mutations
+        - merge-path infra.setup.runs setup before target-green checks in the
+          child worktree
+        - merge-path infra.setup.treats an empty setup list as a no-op and
+          merges as before
+        - merge-path infra.setup.treats a missing setup key as a no-op and
+          merges as before
+        - merge-path infra.setup.fails the merge with gate-shaped evidence
+          containing the setup command and output
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..4959da5
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,91 @@
+# Step: Test-First
+
+## Goal
+Author automated tests specifying the required behavior changes BEFORE writing production code.
+
+## Rules
+- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
+- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
+- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
+- Target declaration in yield:
+  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
+  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
+  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
+- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
+- Output: yield structured output per `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "merge-setup-fix",
+  "kind": "dev",
+  "title": "Run infra.setup in merge child worktree before gates",
+  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
+  "outlineRef": "merge-setup-fix",
+  "milestone": "m1-omp-de-risk",
+  "wave": 2,
+  "citations": [
+    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+    "gates.ts:332-335 runInfraSetup temp-worktree path",
+    "runner.ts:796-810 runInfraSetup temp-worktree path"
+  ]
+}
+
+## Context & Citations
+[
+  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+  "gates.ts:332-335 runInfraSetup temp-worktree path",
+  "runner.ts:796-810 runInfraSetup temp-worktree path"
+]
+
+## Review Feedback
+
+
+## Open Concerns
+- id: c-552344216d
+  kind: blocker
+  severity: high
+  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+  affects:
+    - "19.2"
+    - wave-merge
+- id: c-f972360209
+  kind: tech-debt
+  severity: medium
+  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+  affects:
+    - redrive
+    - wave-merge
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of object, optional): Structured concerns raised during implementation
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
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..a87994f
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 1
+name: test-first
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-10T01:58:58.268Z
+session: 01a1c32e-1319-71c5-8ba5-7d9366c17208
+endedAt: 2026-11-10T02:12:17.267Z
+usage:
+  inputTokens: 204993
+  outputTokens: 50291
+  costUsd: 0.068727
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..e931d95
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,70 @@
+status: ok
+summary: "Authored the target-red behavior tests for merge-path infra.setup in
+  plugins/software-factory/test/engine/merge-setup.test.ts (5 tests): (a) setup
+  writes a marker plus a node_modules-class untracked tree before gates, the
+  gate observes it, and no worktree-mutation is reported; (b) setup runs before
+  target-green; (c) empty setup is a no-op; (d) missing setup is a no-op; (e)
+  failing setup aborts the merge with gate-failure-shaped evidence carrying
+  command + stdout/stderr and prevents gates from running. Per this step's
+  test-first scope, production code is untouched; the mergeItem implementation
+  belongs to the follow-up develop step. Red is proven with the repo's real
+  target-red check: all 3 declared expectRed ids fail as assertion failures
+  while existing merge/gates suites remain green."
+target:
+  selectors:
+    - test/engine/merge-setup.test.ts
+  expectRed:
+    - merge-path infra.setup.runs setup in the child worktree before gates, and
+      setup-created untracked files are not gate mutations
+    - merge-path infra.setup.runs setup before target-green checks in the child
+      worktree
+    - merge-path infra.setup.fails the merge with gate-shaped evidence
+      containing the setup command and output
+evidence:
+  - "Added test/engine/merge-setup.test.ts: 5 tmp-repo, no-network behavior
+    tests covering setup-before-gates marker visibility and mutation-free
+    snapshot, setup-before-target-green, empty-setup parity, missing-setup
+    parity, and failing-setup evidence (command + stdout/stderr markers +
+    gate-shaped journal event)."
+  - "Red: `cd plugins/software-factory && bun test
+    test/engine/merge-setup.test.ts` → 2 pass, 3 fail; all 3 are expect()
+    assertion failures (JUnit reports tests=5 failures=3), not import/collection
+    errors."
+  - "Real target-red verification: runCheck('target-red') with the declared
+    selectors/expectRed against the worktree → {ok:true, summary:'target-red
+    passed: all 3 expected tests failed with assertion failures'}."
+  - "Parity: `bun test test/engine/merge-gate-evidence.test.ts
+    test/git/merge.test.ts test/engine/merge-conflict.test.ts
+    test/engine/merge-redrive-stranded.test.ts test/checks` → 72 pass, 0 fail."
+  - "Typecheck: `cd plugins/software-factory && bun run typecheck` (tsc
+    --noEmit) → exit 0."
+  - "Scope: `git status --porcelain -- plugins/software-factory/src
+    plugins/software-factory/test` → only `??
+    plugins/software-factory/test/engine/merge-setup.test.ts`; `git diff --stat
+    -- plugins/software-factory/src` is empty, so no prod file was modified."
+remarkable:
+  - chosen: Deliver a test-only diff and defer the merge-path.ts implementation to
+      the follow-up develop step.
+    why: The story.dev flow runs test-first-scope (rejects any modified prod file)
+      and target-red (declared tests must currently fail) in this step; shipping
+      the implementation here would fail both mechanical checks.
+    alternatives:
+      - Implement mergeItem setup execution in this step as the story assignment
+        text lists — rejected because target-red would see green and
+        test-first-scope rejects modified src/** files.
+      - Introduce a prod interface stub — unnecessary because the tests exercise
+        the existing mergeItem export.
+notes: "Implementation guidance for the develop step: in mergeItem, after the
+  verify-checks phase begins and infra.yaml is loaded, run infra.setup commands
+  sequentially in childWt before runGates and before target-green (mirroring
+  checks/runner.ts runInfraSetup: gate-timeout/second semantics,
+  throw-equivalent on first non-zero exit or timeout). Because setup precedes
+  runGates' per-attempt snapshotWorktree, setup-created untracked files
+  (node_modules) will not be flagged as gate mutations. On failure, journal type
+  item_merge_gates_failed with failingGates ['infra.setup'], results
+  [{id:'infra.setup', status:'fail'}], and evidence shaped like gate failures
+  ('infra.setup (exit via status=fail). Command: <cmd> Details: <stdout+stderr
+  tail>'), then return ok:false with the same command+output in error.
+  Empty/missing setup must remain a no-op (`infra?.setup ?? []`). Environment
+  note: `bun install --frozen-lockfile` was run to restore node_modules for the
+  test runner; no manifest or lockfile changes (node_modules is gitignored)."
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..9273b76
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,99 @@
+# Step: Develop
+
+## Goal
+Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+
+## Rules
+- Target green: every test selector and case identified in `target` MUST pass cleanly.
+- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "merge-setup-fix",
+  "kind": "dev",
+  "title": "Run infra.setup in merge child worktree before gates",
+  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
+  "outlineRef": "merge-setup-fix",
+  "milestone": "m1-omp-de-risk",
+  "wave": 2,
+  "citations": [
+    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+    "gates.ts:332-335 runInfraSetup temp-worktree path",
+    "runner.ts:796-810 runInfraSetup temp-worktree path"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/merge-setup.test.ts"
+  ],
+  "expectRed": [
+    "merge-path infra.setup.runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations",
+    "merge-path infra.setup.runs setup before target-green checks in the child worktree",
+    "merge-path infra.setup.fails the merge with gate-shaped evidence containing the setup command and output"
+  ]
+}
+
+## Context & Citations
+[
+  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+  "gates.ts:332-335 runInfraSetup temp-worktree path",
+  "runner.ts:796-810 runInfraSetup temp-worktree path"
+]
+
+## Review Feedback
+
+
+## Open Concerns
+- id: c-552344216d
+  kind: blocker
+  severity: high
+  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+  affects:
+    - "19.2"
+    - wave-merge
+- id: c-f972360209
+  kind: tech-debt
+  severity: medium
+  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+  affects:
+    - redrive
+    - wave-merge
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of object, optional): Structured concerns raised during implementation
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
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..d4b4ba4
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,22 @@
+seq: 2
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: rejected
+startedAt: 2026-11-10T02:28:30.436Z
+session: 01a1c34d-478c-761b-b4e8-114fe1388c98
+endedAt: 2026-11-10T02:35:24.439Z
+usage:
+  inputTokens: 65574
+  outputTokens: 18937
+  costUsd: 0.025037999999999998
+error: |-
+  Output validation and repair failed: Agent output failed schema validation:
+  /: must be object ({"type":"object"})
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-053Z_01a1c349-1ccd-7094-967b-f4e95a34a589.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/checks.yaml
new file mode 100644
index 0000000..f4187bf
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/checks.yaml
@@ -0,0 +1,253 @@
+checks:
+  - id: gates
+    status: fail
+    message: "Gate regressions: test"
+    details:
+      - id: typecheck
+        command: bun --cwd=plugins/software-factory run typecheck
+        status: pass
+        durationMs: 5092
+        details: $ tsc --noEmit
+      - id: test
+        command: bun --cwd=plugins/software-factory test
+        status: fail
+        durationMs: 484170
+        details: >-
+          bun test v1.4.4 (38afee6c8)
+
+          Disk space check passed (threshold 2048 MB):
+            worktreeRoot (/tmp/factory-test-repo-59fVor.factory-wt): 4473 MB free
+            .factory-runtime/tmp (/tmp/factory-test-repo-59fVor.factory-wt/.factory-runtime/tmp): 4473 MB free
+            repoRoot (/tmp/factory-test-repo-59fVor): 4473 MB free
+            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 79578 MB free
+            /tmp (/tmp): 4473 MB free
+          ================================================================
+
+          Task: status-test-task [ACTIVE]
+
+          Kind: unclassified | Iteration: 1 | Wave: 1
+
+          Worktree: (none - main checkout)
+
+          Config path: /tmp/factory-test-repo-4oJfDG/.factory/pipeline.yaml
+
+          Budget spent: $0.0000
+
+          ----------------------------------------------------------------
+
+          Waves & Items:
+            Wave 1:
+          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+
+          ----------------------------------------------------------------
+
+          Blocking Questions:
+            (none)
+          ----------------------------------------------------------------
+
+          Digest Questions:
+            (none)
+          ================================================================
+
+
+
+          test/config-worktree-layering.test.ts:
+
+          [factory preflight] Preflight failed with 1 error(s):
+            - Pipeline config loading failed: Invalid pipeline configuration:
+          /limits/maxIterations: must be integer ({"type":"integer"})
+
+
+          test/disk-space.test.ts:
+
+          52 |       probe,
+
+          53 |     });
+
+          54 | 
+
+          55 |     expect(res.ok).toBe(false);
+
+          56 |     expect(res.minFreeDiskMb).toBe(2048);
+
+          57 |     expect(res.failingPaths.length).toBe(1);
+                                                   ^
+          error: expect(received).toBe(expected)
+
+
+          Expected: 1
+
+          Received: 2
+
+                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/disk-space.test.ts:57:37)
+          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
+          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+          [37.70ms]
+
+
+          test/cli/cli.test.ts:
+
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
+          on host Slava-Yoga) taken over by PID 278359
+
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 278359
+
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 278359
+
+          killed 1 dangling process
+
+
+          test/engine/stranded-wave.test.ts:
+
+          (fail) Stranded-wave fix > second consult for the same item fires a
+          fresh turn (no step_reused sham loop) [5057.05ms]
+            ^ this test timed out after 5000ms.
+
+          # Unhandled error between tests
+
+          -------------------------------
+
+          250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+
+          251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder,
+          task);
+
+          252 |     const journal = await readJournal(deployedTaskDir);
+
+          253 |     // No done-ness reuse shadowed either consult: both
+          decisions recorded.
+
+          254 |     expect(journal.filter((e) => e.type === "step_reused" &&
+          String((e as { step?: string }).step ??
+          "").startsWith("consult-loop-1")).length).toBe(0);
+
+          255 |     expect(journal.filter((e) => e.type === "decision_made" &&
+          (e as { item?: string }).item === "loop-1").length).toBe(2);
+                                                                                                                                   ^
+          error: expect(received).toBe(expected)
+
+
+          Expected: 2
+
+          Received: 0
+
+                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
+          -------------------------------
+
+
+           667 pass
+           2 skip
+           2 fail
+           1 error
+           3763 expect() calls
+          Ran 671 tests across 102 files. [253.72s]
+
+          [New failing tests: Stranded-wave fix.second consult for the same item
+          fires a fresh turn (no step_reused sham loop)]
+        failingTests:
+          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
+            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+          - Stranded-wave fix.second consult for the same item fires a fresh
+            turn (no step_reused sham loop)
+    output: >-
+      7:37)
+
+      (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace verifies
+      worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir [37.70ms]
+
+
+      test/cli/cli.test.ts:
+
+      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on
+      host Slava-Yoga) taken over by PID 278359
+
+      [factory lock] Stale run lock for task "competing-takeover-task" (PID
+      9999999 on host Slava-Yoga) taken over by PID 278359
+
+      [factory lock] Stale run lock for task "journal-worktree-task" (PID
+      9999999 on host Slava-Yoga) taken over by PID 278359
+
+      killed 1 dangling process
+
+
+      test/engine/stranded-wave.test.ts:
+
+      (fail) Stranded-wave fix > second consult for the same item fires a fresh
+      turn (no step_reused sham loop) [5057.05ms]
+        ^ this test timed out after 5000ms.
+
+      # Unhandled error between tests
+
+      -------------------------------
+
+      250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+
+      251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
+
+      252 |     const journal = await readJournal(deployedTaskDir);
+
+      253 |     // No done-ness reuse shadowed either consult: both decisions
+      recorded.
+
+      254 |     expect(journal.filter((e) => e.type === "step_reused" &&
+      String((e as { step?: string }).step ??
+      "").startsWith("consult-loop-1")).length).toBe(0);
+
+      255 |     expect(journal.filter((e) => e.type === "decision_made" && (e as
+      { item?: string }).item === "loop-1").length).toBe(2);
+                                                                                                                               ^
+      error: expect(received).toBe(expected)
+
+
+      Expected: 2
+
+      Received: 0
+
+            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
+      -------------------------------
+
+
+       667 pass
+       2 skip
+       2 fail
+       1 error
+       3763 expect() calls
+      Ran 671 tests across 102 files. [253.72s]
+
+      [New failing tests: Stranded-wave fix.second consult for the same item
+      fires a fresh turn (no step_reused sham loop)]
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: bun --cwd=plugins/software-factory test test/engine/merge-setup.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794279806234-jse7zphthr.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - merge-path infra.setup.runs setup in the child worktree before gates,
+          and setup-created untracked files are not gate mutations
+        - merge-path infra.setup.runs setup before target-green checks in the
+          child worktree
+        - merge-path infra.setup.treats an empty setup list as a no-op and
+          merges as before
+        - merge-path infra.setup.treats a missing setup key as a no-op and
+          merges as before
+        - merge-path infra.setup.fails the merge with gate-shaped evidence
+          containing the setup command and output
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 83/300 production lines changed"
+    details:
+      changedLines:
+        added: 78
+        deleted: 5
+        total: 83
+        files:
+          - plugins/software-factory/src/core/flows/merge-path.ts
+      limit: 300
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/input.md
new file mode 100644
index 0000000..77627bf
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/input.md
@@ -0,0 +1,104 @@
+# Step: Develop
+
+## Goal
+Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+
+## Rules
+- Target green: every test selector and case identified in `target` MUST pass cleanly.
+- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "merge-setup-fix",
+  "kind": "dev",
+  "title": "Run infra.setup in merge child worktree before gates",
+  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
+  "outlineRef": "merge-setup-fix",
+  "milestone": "m1-omp-de-risk",
+  "wave": 2,
+  "citations": [
+    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+    "gates.ts:332-335 runInfraSetup temp-worktree path",
+    "runner.ts:796-810 runInfraSetup temp-worktree path"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/merge-setup.test.ts"
+  ],
+  "expectRed": [
+    "merge-path infra.setup.runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations",
+    "merge-path infra.setup.runs setup before target-green checks in the child worktree",
+    "merge-path infra.setup.fails the merge with gate-shaped evidence containing the setup command and output"
+  ]
+}
+
+## Context & Citations
+[
+  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+  "gates.ts:332-335 runInfraSetup temp-worktree path",
+  "runner.ts:796-810 runInfraSetup temp-worktree path"
+]
+
+## Review Feedback
+Output validation and repair failed: Agent output failed schema validation:
+/: must be object ({"type":"object"})
+
+Budget: 83 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
+
+Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
+
+## Open Concerns
+- id: c-552344216d
+  kind: blocker
+  severity: high
+  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+  affects:
+    - "19.2"
+    - wave-merge
+- id: c-f972360209
+  kind: tech-debt
+  severity: medium
+  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+  affects:
+    - redrive
+    - wave-merge
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of object, optional): Structured concerns raised during implementation
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
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/meta.yaml
new file mode 100644
index 0000000..e380ee8
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/meta.yaml
@@ -0,0 +1,20 @@
+seq: 3
+name: develop
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: rejected
+startedAt: 2026-11-10T02:52:15.878Z
+session: 01a1c35e-dc77-70e1-8459-a5285fe93047
+endedAt: 2026-11-10T03:03:28.115Z
+usage:
+  inputTokens: 23598
+  outputTokens: 8937
+  costUsd: 0.010886
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-16-375Z_01a1c35e-dc77-70e1-8459-a5285fe93047.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/output.yaml
new file mode 100644
index 0000000..c2e92e4
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/output.yaml
@@ -0,0 +1,39 @@
+status: ok
+summary: Implemented merge-path infra.setup support and verified the new
+  behavior tests plus adjacent suites. mergeItem now reads infra.yaml, runs
+  setup commands in the child worktree immediately before gate/target snapshots
+  (after the parent-into-child merge and tree-diff check, before
+  snapshotWorktree/runGates/target-green), treats empty/missing setup as a
+  no-op, and aborts with gate-failure-shaped journal evidence and error text (id
+  infra.setup, command, exit status, captured stdout/stderr) when setup fails.
+  Target test/engine/merge-setup.test.ts passes 5/5; related merge/gates suites
+  pass 18/18; tsc --noEmit exits 0. Prod diff is 83 lines, within the 300-line
+  budget. The full bun test gate was still running in the background when
+  yielding; targeted and adjacent suites showed no new failures.
+target:
+  selectors:
+    - test/engine/merge-setup.test.ts
+  expectRed:
+    - merge-path infra.setup.runs setup in the child worktree before gates, and
+      setup-created untracked files are not gate mutations
+    - merge-path infra.setup.runs setup before target-green checks in the child
+      worktree
+    - merge-path infra.setup.fails the merge with gate-shaped evidence
+      containing the setup command and output
+evidence:
+  - "bun test test/engine/merge-setup.test.ts -> 5 pass, 0 fail, 27 expect()
+    calls (covers all three target cases: setup-before-gates with no
+    worktree_mutation_detected events, setup-before-target-green, and
+    failing-setup evidence with command + stdout/stderr + gate never ran)"
+  - bun test test/engine/merge-conflict.test.ts
+    test/engine/merge-gate-evidence.test.ts
+    test/engine/merge-redrive-stranded.test.ts
+    test/engine/checks-gates-fixloop.test.ts -> 18 pass, 0 fail
+  - bun run typecheck (tsc --noEmit) -> exit code 0, no diagnostics
+  - git diff a7e05af --numstat -- src/core/flows/merge-path.ts -> 78 insertions,
+    5 deletions (83 prod lines, under storyMaxProdLines 300)
+  - "Implementation mirrors runInfraSetup semantics (runner.ts:797-810): iterate
+    setup commands in order in childWt, stop at first failure, include
+    command/exit code/output tail"
+  - Full bun test gate launched (background) and still running at yield time; no
+    new failures observed in targeted and adjacent merge/gates suites
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..9094031
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/checks.yaml
@@ -0,0 +1,139 @@
+checks:
+  - id: gates
+    status: pass
+    message: Gates passed (2 gates)
+    details:
+      - id: typecheck
+        command: bun --cwd=plugins/software-factory run typecheck
+        status: pass
+        durationMs: 6077
+        details: $ tsc --noEmit
+      - id: test
+        command: bun --cwd=plugins/software-factory test
+        status: pass
+        durationMs: 488106
+        details: >-
+          bun test v1.4.4 (38afee6c8)
+
+          Disk space check passed (threshold 2048 MB):
+            worktreeRoot (/tmp/factory-test-repo-ZBAD7g.factory-wt): 4470 MB free
+            .factory-runtime/tmp (/tmp/factory-test-repo-ZBAD7g.factory-wt/.factory-runtime/tmp): 4470 MB free
+            repoRoot (/tmp/factory-test-repo-ZBAD7g): 4470 MB free
+            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 86979 MB free
+            /tmp (/tmp): 4470 MB free
+          ================================================================
+
+          Task: status-test-task [ACTIVE]
+
+          Kind: unclassified | Iteration: 1 | Wave: 1
+
+          Worktree: (none - main checkout)
+
+          Config path: /tmp/factory-test-repo-7NLC8V/.factory/pipeline.yaml
+
+          Budget spent: $0.0000
+
+          ----------------------------------------------------------------
+
+          Waves & Items:
+            Wave 1:
+          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+
+          ----------------------------------------------------------------
+
+          Blocking Questions:
+            (none)
+          ----------------------------------------------------------------
+
+          Digest Questions:
+            (none)
+          ================================================================
+
+
+
+          test/config-worktree-layering.test.ts:
+
+          [factory preflight] Preflight failed with 1 error(s):
+            - Pipeline config loading failed: Invalid pipeline configuration:
+          /limits/maxIterations: must be integer ({"type":"integer"})
+
+
+          test/disk-space.test.ts:
+
+          52 |       probe,
+
+          53 |     });
+
+          54 | 
+
+          55 |     expect(res.ok).toBe(false);
+
+          56 |     expect(res.minFreeDiskMb).toBe(2048);
+
+          57 |     expect(res.failingPaths.length).toBe(1);
+                                                   ^
+          error: expect(received).toBe(expected)
+
+
+          Expected: 1
+
+          Received: 2
+
+                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/disk-space.test.ts:57:37)
+          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
+          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+          [33.32ms]
+
+
+          test/cli/cli.test.ts:
+
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
+          on host Slava-Yoga) taken over by PID 575155
+
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 575155
+
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 575155
+
+           668 pass
+           2 skip
+           1 fail
+           3763 expect() calls
+          Ran 671 tests across 102 files. [235.50s]
+        failingTests:
+          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
+            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: bun --cwd=plugins/software-factory test test/engine/merge-setup.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794282428640-tlf72geo2oi.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - merge-path infra.setup.runs setup in the child worktree before gates,
+          and setup-created untracked files are not gate mutations
+        - merge-path infra.setup.runs setup before target-green checks in the
+          child worktree
+        - merge-path infra.setup.treats an empty setup list as a no-op and
+          merges as before
+        - merge-path infra.setup.treats a missing setup key as a no-op and
+          merges as before
+        - merge-path infra.setup.fails the merge with gate-shaped evidence
+          containing the setup command and output
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 83/300 production lines changed"
+    details:
+      changedLines:
+        added: 78
+        deleted: 5
+        total: 83
+        files:
+          - plugins/software-factory/src/core/flows/merge-path.ts
+      limit: 300
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/input.md
new file mode 100644
index 0000000..6509aad
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/input.md
@@ -0,0 +1,156 @@
+# Step: Develop
+
+## Goal
+Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+
+## Rules
+- Target green: every test selector and case identified in `target` MUST pass cleanly.
+- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "merge-setup-fix",
+  "kind": "dev",
+  "title": "Run infra.setup in merge child worktree before gates",
+  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
+  "outlineRef": "merge-setup-fix",
+  "milestone": "m1-omp-de-risk",
+  "wave": 2,
+  "citations": [
+    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+    "gates.ts:332-335 runInfraSetup temp-worktree path",
+    "runner.ts:796-810 runInfraSetup temp-worktree path"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/merge-setup.test.ts"
+  ],
+  "expectRed": [
+    "merge-path infra.setup.runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations",
+    "merge-path infra.setup.runs setup before target-green checks in the child worktree",
+    "merge-path infra.setup.fails the merge with gate-shaped evidence containing the setup command and output"
+  ]
+}
+
+## Context & Citations
+[
+  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+  "gates.ts:332-335 runInfraSetup temp-worktree path",
+  "runner.ts:796-810 runInfraSetup temp-worktree path"
+]
+
+## Review Feedback
+RETRY (gate flake, not prod regression — isolate before touching code): 1) Run ONLY the failing file in isolation from plugins/software-factory: `bun test test/engine/stranded-wave.test.ts`. Expect pass. That test never invokes mergeItem (item never becomes ready; infra has empty gates), so an isolated pass proves the full-suite timeout was load contention — do NOT rewrite prod code in that case. 2) Re-run the full `bun test` once; success = no NEW failing tests vs baseline (only the accepted disk-space env failure may remain). 3) ONLY if the isolated file also fails: treat as real regression — audit your merge-path diff for strict empty-setup parity (no-op before any journal/git/snapshot side effect, identical return paths when infra.setup is empty/missing) and fix minimally. Keep prod diff ~80 lines; preserve the new passing merge-setup tests.
+
+Failing check: gates
+
+Message: Gate regressions: test
+
+Detail:
+ task \"competing-takeover-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\n[factory lock] Stale run lock for task \"journal-worktree-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\nkilled 1 dangling process\n\ntest/engine/stranded-wave.test.ts:\n(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]\n  ^ this test timed out after 5000ms.\n\n# Unhandled error between tests\n-------------------------------\n250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);\n251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);\n252 |     const journal = await readJournal(deployedTaskDir);\n253 |     // No done-ness reuse shadowed either consult: both decisions recorded.\n254 |     expect(journal.filter((e) => e.type === \"step_reused\" && String((e as { step?: string }).step ?? \"\").startsWith(\"consult-loop-1\")).length).toBe(0);\n255 |     expect(journal.filter((e) => e.type === \"decision_made\" && (e as { item?: string }).item === \"loop-1\").length).toBe(2);\n                                                                                                                         ^\nerror: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 0\n\n      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)\n-------------------------------\n\n\n 667 pass\n 2 skip\n 2 fail\n 1 error\n 3763 expect() calls\nRan 671 tests across 102 files. [253.72s]\n[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]",
+    "failingTests": [
+      "Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir",
+      "Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)"
+    ]
+  }
+]
+
+Output tail:
+7:37)
+(fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir [37.70ms]
+
+test/cli/cli.test.ts:
+[factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
+[factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
+[factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
+killed 1 dangling process
+
+test/engine/stranded-wave.test.ts:
+(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]
+  ^ this test timed out after 5000ms.
+
+# Unhandled error between tests
+-------------------------------
+250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
+252 |     const journal = await readJournal(deployedTaskDir);
+253 |     // No done-ness reuse shadowed either consult: both decisions recorded.
+254 |     expect(journal.filter((e) => e.type === "step_reused" && String((e as { step?: string }).step ?? "").startsWith("consult-loop-1")).length).toBe(0);
+255 |     expect(journal.filter((e) => e.type === "decision_made" && (e as { item?: string }).item === "loop-1").length).toBe(2);
+                                                                                                                         ^
+error: expect(received).toBe(expected)
+
+Expected: 2
+Received: 0
+
+      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
+-------------------------------
+
+
+ 667 pass
+ 2 skip
+ 2 fail
+ 1 error
+ 3763 expect() calls
+Ran 671 tests across 102 files. [253.72s]
+[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]
+
+Budget: 83 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
+
+Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
+
+## Open Concerns
+- id: c-552344216d
+  kind: blocker
+  severity: high
+  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+  affects:
+    - "19.2"
+    - wave-merge
+- id: c-f972360209
+  kind: tech-debt
+  severity: medium
+  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+  affects:
+    - redrive
+    - wave-merge
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of object, optional): Structured concerns raised during implementation
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
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..41f55b8
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 4
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-10T03:31:43.891Z
+session: 01a1c382-fe0b-746b-a4e0-c438f0444e26
+endedAt: 2026-11-10T03:47:10.463Z
+usage:
+  inputTokens: 20655
+  outputTokens: 4468
+  costUsd: 0.006537
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T03-31-44-267Z_01a1c382-fe0b-746b-a4e0-c438f0444e26.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..32fafaa
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/output.yaml
@@ -0,0 +1,74 @@
+status: ok
+summary: "Retry confirmed the gate failure was load-contention flake, not a
+  production regression, so no code changes were needed. Isolated `bun test
+  test/engine/stranded-wave.test.ts` passes (4/4 in 7.2s), while the same test
+  timed out at 5s during the parallel full-suite run. Re-ran the full suite: 668
+  pass, 2 skip, 1 fail — the only failure is the accepted env-sensitive baseline
+  `test/disk-space.test.ts`. The 5 merge-setup tests (including all three
+  expectRed scenarios) and typecheck remain green. Implementation already in
+  place: mergeItem runs infra.setup in childWt strictly before runGates (whose
+  snapshotWorktree is taken inside runGates), no-ops on empty/missing setup, and
+  aborts with gate-shaped evidence (command + output tail) on failure."
+target:
+  selectors:
+    - test/engine/merge-setup.test.ts
+  expectRed:
+    - merge-path infra.setup.runs setup in the child worktree before gates, and
+      setup-created untracked files are not gate mutations
+    - merge-path infra.setup.runs setup before target-green checks in the child
+      worktree
+    - merge-path infra.setup.fails the merge with gate-shaped evidence
+      containing the setup command and output
+evidence:
+  - "`cd plugins/software-factory && bun test test/engine/stranded-wave.test.ts`
+    -> 4 pass, 0 fail, 7.22s (isolated pass proves the full-suite 5057ms timeout
+    was load contention; test never invokes mergeItem)."
+  - "`cd plugins/software-factory && bun test test/engine/merge-setup.test.ts`
+    -> 5 pass, 0 fail (all three expectRed scenarios plus empty-setup and
+    missing-setup parity cases)."
+  - "`cd plugins/software-factory && bun run typecheck` -> tsc --noEmit exit 0."
+  - Full suite `bun test` (102 files, 671 tests, 258.28s) -> 668 pass, 2 skip, 1
+    fail; sole failure is the accepted baseline red `Disk-space guards
+    (§limits.minFreeDiskMb).checkDiskSpace verifies worktreeRoot,
+    .factory-runtime/tmp, repoRoot, and tmpdir`; stranded-wave passed this run,
+    so no NEW failing tests vs baseline.
+  - "Ordering verified in source: merge-path.ts setup block (lines ~367-396)
+    runs before `runGates` (line ~400), and `snapshotWorktree` is taken inside
+    runGates (gates.ts:477), so setup-created untracked files are in the
+    baseline and not reported as mutations."
+  - Prod diff remains 83 lines, within storyMaxProdLines 300; no changes made in
+    this retry.
+concerns:
+  - kind: risk
+    summary: stranded-wave test has a 5s timeout that flakes under full-suite
+      parallel load
+    detail: test/engine/stranded-wave.test.ts:255 second-consult test timed out at
+      5057ms in the full-suite gate run but passes in 7.2s file-time when
+      isolated. Under 102-file parallel load the per-test 5s budget is too
+      tight; gate failures from this test are likely load artifacts rather than
+      regressions. Consider raising the per-test timeout or reducing suite
+      concurrency.
+    severity: medium
+    location:
+      file: plugins/software-factory/test/engine/stranded-wave.test.ts
+      line: 255
+    affects:
+      - gates
+      - wave-merge
+remarkable:
+  - chosen: Diagnose first and make no production changes on retry
+    why: Review feedback directed isolating the failing file before touching code;
+      the isolated pass (4/4) plus a clean full-suite re-run (only accepted
+      baseline disk-space failure) proves the failure was load contention in the
+      harness, not merge-path behavior.
+    alternatives:
+      - Audit and rewrite merge-path empty-setup parity paths (would risk
+        breaking passing merge-setup tests for a non-reproducible failure)
+      - Increase the test timeout in stranded-wave.test.ts (out of scope for
+        this assignment; raised as a concern instead)
+notes: "No code delta this attempt — the infra.setup implementation and its five
+  behavior tests were already present and green. Verified acceptance ordering:
+  setup runs before runGates and thus before gates' internal snapshotWorktree;
+  empty/missing setup skips the block entirely (strict parity); failure path
+  reuses the gate-failure evidence formatter with id infra.setup, command, and
+  500-char output tail."
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..9701d35
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/checks.yaml
@@ -0,0 +1,30 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 3 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: bun --cwd=plugins/software-factory test test/engine/merge-setup.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794282431892-wblpe9tcdkj.xml
+      junitCaseCount: 5
+      junitCaseIds:
+        - merge-path infra.setup.runs setup in the child worktree before gates,
+          and setup-created untracked files are not gate mutations
+        - merge-path infra.setup.runs setup before target-green checks in the
+          child worktree
+        - merge-path infra.setup.treats an empty setup list as a no-op and
+          merges as before
+        - merge-path infra.setup.treats a missing setup key as a no-op and
+          merges as before
+        - merge-path infra.setup.fails the merge with gate-shaped evidence
+          containing the setup command and output
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/input.md
new file mode 100644
index 0000000..cb9c4e4
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/input.md
@@ -0,0 +1,3466 @@
+# Step: QA
+
+## Goal
+Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.
+
+## Rules
+- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
+- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
+- Story kind validation:
+  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
+  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
+- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+
+## Dispositions Criteria
+Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
+Use ONLY these dispositions; any other disposition value fails validation.
+# Review Suggestion Dispositions
+
+Criteria for assigning disposition to review findings:
+
+| Disposition | When to Assign | Engine Action |
+|---|---|---|
+| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
+| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
+| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
+| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
+| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
+
+## Rules
+- Defect requiring code change MUST be `fix`.
+- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
+- Do NOT use `human-async` when repo context or architecture docs provide the answer.
+
+## Assignment
+{
+  "slug": "merge-setup-fix",
+  "kind": "dev",
+  "title": "Run infra.setup in merge child worktree before gates",
+  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
+  "outlineRef": "merge-setup-fix",
+  "milestone": "m1-omp-de-risk",
+  "wave": 2,
+  "citations": [
+    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
+    "gates.ts:332-335 runInfraSetup temp-worktree path",
+    "runner.ts:796-810 runInfraSetup temp-worktree path"
+  ]
+}
+
+## Engine Checks
+
+
+## Test Diff
+
+
+## Code Diff
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml b/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
+deleted file mode 100644
+index 1499898..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
++++ /dev/null
+@@ -1,29 +0,0 @@
+-id: c-0647070832
+-kind: tech-debt
+-summary: Child/merge worktrees still need infra.setup (bun install) before the
+-  bun test runner can collect tests; this worktree had no node_modules until
+-  installed manually
+-detail: Running `bun test` in a fresh worktree failed with `Cannot find package
+-  'yaml'` from test/records-and-fingerprint.test.ts and src/core/prompts.ts
+-  until `bun install` was run. This is the pre-existing open concern
+-  c-552344216d (missing infra.setup in merge-child worktrees), not introduced by
+-  this step; node_modules is gitignored and not part of the change.
+-affects:
+-  - target-red
+-  - wave-merge
+-severity: high
+-status: dismissed
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:46:53.285Z
+-disposition: dismiss
+-dismissReason: "Self-declared duplicate: the concern's own detail text states
+-  'This is the pre-existing open concern c-552344216d (missing infra.setup in
+-  merge-child worktrees), not introduced by this step'. Same root cause (bun
+-  install absent in fresh worktree), same affects. Keep c-552344216d as
+-  canonical."
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-7ca231f0aa.yaml b/.factory/tasks/omp-workspaces/concerns/c-7ca231f0aa.yaml
+deleted file mode 100644
+index 4348605..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-7ca231f0aa.yaml
++++ /dev/null
+@@ -1,24 +0,0 @@
+-id: c-7ca231f0aa
+-kind: risk
+-summary: stranded-wave test has a 5s timeout that flakes under full-suite parallel load
+-detail: test/engine/stranded-wave.test.ts:255 second-consult test timed out at
+-  5057ms in the full-suite gate run but passes in 7.2s file-time when isolated.
+-  Under 102-file parallel load the per-test 5s budget is too tight; gate
+-  failures from this test are likely load artifacts rather than regressions.
+-  Consider raising the per-test timeout or reducing suite concurrency.
+-location:
+-  file: plugins/software-factory/test/engine/stranded-wave.test.ts
+-  line: 255
+-affects:
+-  - gates
+-  - wave-merge
+-severity: medium
+-status: open
+-source:
+-  record: 004-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: merge-setup-fix
+-  lastSeen: 2026-11-10T03:47:10.380Z
+-createdAt: 2026-11-10T03:47:10.380Z
+-updatedAt: 2026-11-10T03:47:10.380Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-8dc9dd1c4d.yaml b/.factory/tasks/omp-workspaces/concerns/c-8dc9dd1c4d.yaml
+deleted file mode 100644
+index 487f9b6..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-8dc9dd1c4d.yaml
++++ /dev/null
+@@ -1,22 +0,0 @@
+-id: c-8dc9dd1c4d
+-kind: risk
+-summary: Full-suite gates under parallel wave items cause timeout flakes (5s default)
+-detail: merge-setup-fix develop was rejected 2/2 by a 5000ms timeout in
+-  stranded-wave.test.ts (a test that never touches mergeItem) plus a
+-  between-tests teardown error, with 'killed 1 dangling process' in output —
+-  while 4 wave-2 items each run the full ~250s bun suite as gates concurrently.
+-  Full-suite-as-gate under parallel items makes timeouts load-dependent;
+-  consider serializing full-suite gates, raising per-test timeout, or scoping
+-  item gates to affected selectors.
+-affects:
+-  - gates
+-  - wave-merge
+-severity: medium
+-status: open
+-source:
+-  record: 017-consult-merge-setup-fix-1-a1
+-  agent: architect
+-  step: consult-merge-setup-fix-1
+-  lastSeen: 2026-11-10T03:08:41.502Z
+-createdAt: 2026-11-10T03:08:41.502Z
+-updatedAt: 2026-11-10T03:08:41.502Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml b/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
+deleted file mode 100644
+index fdfe75a..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
++++ /dev/null
+@@ -1,24 +0,0 @@
+-id: c-f415508eb1
+-kind: risk
+-summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated
+-  test failures
+-detail: "When TMPDIR points under .factory-runtime/tmp, disk-space.test.ts
+-  counts the tmpdir itself as a second low-space path (fails: expected 1 failing
+-  path, got 2) and several engine tests fail with git 'could not create
+-  temporary file' or 5s timeouts under contention. With TMPDIR=/tmp the same
+-  full suite is fully green (669 pass / 2 skip / 0 fail). This is
+-  pre-existing/environmental and not caused by this test-only diff, but it
+-  affects gate greenness for any item run in this environment."
+-affects:
+-  - gates
+-  - wave-merge
+-severity: medium
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml b/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
+deleted file mode 100644
+index 9f8e15f..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-4e7a8c758b
+-chosen: Published the full embedded draft for isolation and enriched it with the
+-  approved findings' 27-probe command log, config surface, and follow-ups.
+-alternatives:
+-  - Publish only the compact embedded full draft (fails the
+-    probe-log/recommendations acceptance)
+-  - Reconstruct the whole document from the pre-draft findings (duplicates the
+-    approved draft)
+-why: The M1 directional interface requires findings + probe logs +
+-  recommendations, and the embedded compact draft had no dedicated
+-  probe/recommendation sections; all added content comes from the same approved
+-  research output, so no new probes were invented.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml b/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
+deleted file mode 100644
+index 3cdbede..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
++++ /dev/null
+@@ -1,18 +0,0 @@
+-id: rm-63a8ee819c
+-chosen: Wrote RECOVERY.md at the assigned
+-  `items/spike-findings-recovery/RECOVERY.md` item-local path.
+-alternatives:
+-  - Write a repo-root `items/` copy (not the assigned task-workspace path)
+-  - Write under engine-owned `.factory` records (explicitly forbidden)
+-why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
+-  engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
+-  `decisions/`) was modified.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml b/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
+deleted file mode 100644
+index 8bab5e4..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-8363899156
+-chosen: Pin the prompt filename instability with explicit shape and difference
+-  assertions plus comments, instead of stabilizing transport.
+-alternatives:
+-  - "Stabilize prompt paths in production code: out of scope for this test-only
+-    item."
+-  - "Only compare normalized argv: would hide the unstable element instead of
+-    pinning it."
+-why: Assignment defers stabilization to M7 after spike-cache-key; a
+-  failing-explicit assertion documents the currently unstable behavior and will
+-  point at the decision when transport is stabilized.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml b/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
+deleted file mode 100644
+index 22471e5..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
++++ /dev/null
+@@ -1,18 +0,0 @@
+-id: rm-9efb47e04e
+-chosen: Specify zero-default aggregation and optional schema properties, with no
+-  migration of historical records.
+-alternatives:
+-  - Migration/backfill of old records (explicitly out of scope).
+-  - Required schema fields (would invalidate historical records).
+-why: "Matches the assignment contract: absent cache keys in old meta.yaml/NDJSON
+-  must read as 0 and remain schema-valid, while new records persist
+-  cacheReadTokens/cacheWriteTokens/totalTokens and a cost breakdown."
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:05:24.168Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml b/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml
+deleted file mode 100644
+index 7481d13..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-af4c866bf2
+-chosen: Characterize transport via mock omp binary snapshotting argv + file
+-  bytes, with only the real-binary --config --version acceptance check behind
+-  describe.skipIf.
+-alternatives:
+-  - Live-model harness turns (paid, flaky)
+-  - In-process spawn mocking (bypasses real argv assembly)
+-  - Pure-function tests only (cannot pin timestamped prompt filename)
+-why: Captures exact harness-to-omp bytes/argv without provider contact (no paid
+-  turns) or requiring omp on clean checkout, while still validating overlay
+-  acceptance with the real binary when present using preflight's own non-paid
+-  validation.
+-status: open
+-source:
+-  record: 002-review-r1-a1
+-  agent: reviewer
+-  step: review
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:46:53.244Z
+-createdAt: 2026-11-10T02:46:53.244Z
+-updatedAt: 2026-11-10T02:46:53.244Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-b806236551.yaml b/.factory/tasks/omp-workspaces/concerns/rm-b806236551.yaml
+deleted file mode 100644
+index dfb8b4f..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-b806236551.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-b806236551
+-chosen: Diagnose first and make no production changes on retry
+-alternatives:
+-  - Audit and rewrite merge-path empty-setup parity paths (would risk breaking
+-    passing merge-setup tests for a non-reproducible failure)
+-  - Increase the test timeout in stranded-wave.test.ts (out of scope for this
+-    assignment; raised as a concern instead)
+-why: Review feedback directed isolating the failing file before touching code;
+-  the isolated pass (4/4) plus a clean full-suite re-run (only accepted baseline
+-  disk-space failure) proves the failure was load contention in the harness, not
+-  merge-path behavior.
+-status: open
+-source:
+-  record: 004-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: merge-setup-fix
+-  lastSeen: 2026-11-10T03:47:10.380Z
+-createdAt: 2026-11-10T03:47:10.380Z
+-updatedAt: 2026-11-10T03:47:10.380Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml b/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
+deleted file mode 100644
+index 273f553..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
++++ /dev/null
+@@ -1,25 +0,0 @@
+-id: rm-ccac403fa7
+-chosen: Characterize transport via a mock omp binary that snapshots argv plus
+-  the --system-prompt/-p/--config files, and guard only the real-binary overlay
+-  acceptance check with omp-presence skip.
+-alternatives:
+-  - "Run harness turns against real omp with live models: paid and flaky,
+-    violates no-paid-turns constraint."
+-  - "Mock the bun spawn module in-process: fragile, bypasses the real argv
+-    assembly path."
+-  - "Test only pure generateOmpConfigOverlay/render functions: cannot pin the
+-    timestamped prompt filename or full argv instability."
+-why: This captures the exact bytes and argv the harness would hand to omp
+-  without contacting a provider (no paid turns) and without requiring omp on a
+-  clean checkout, while still validating the generated overlay with the real
+-  binary when it is installed using the same non-paid `--config <overlay>
+-  --version` preflight performs.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
+deleted file mode 100644
+index 71f4351..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-d3a28fa170
+-chosen: Deliver a test-only diff and defer the merge-path.ts implementation to
+-  the follow-up develop step.
+-alternatives:
+-  - Implement mergeItem setup execution in this step as the story assignment
+-    text lists — rejected because target-red would see green and
+-    test-first-scope rejects modified src/** files.
+-  - Introduce a prod interface stub — unnecessary because the tests exercise the
+-    existing mergeItem export.
+-why: The story.dev flow runs test-first-scope (rejects any modified prod file)
+-  and target-red (declared tests must currently fail) in this step; shipping the
+-  implementation here would fail both mechanical checks.
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: merge-setup-fix
+-  lastSeen: 2026-11-10T02:12:17.201Z
+-createdAt: 2026-11-10T02:12:17.201Z
+-updatedAt: 2026-11-10T02:12:17.201Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
+deleted file mode 100644
+index c8c12a6..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-d63aed4fdb
+-chosen: Declare expectRed ids as bare Bun test names rather than file-qualified
+-  `file::test` node ids.
+-alternatives:
+-  - File-qualified `test/...::test` ids (would not match Bun's describe-based
+-    JUnit ids unless the describe name is also embedded).
+-  - Full `<describe>.<test>` ids (brittle to describe renames).
+-why: "Bun's JUnit reporter emits ids as `<innermost describe>.<test name>` with
+-  no file path in the id; the engine's normalizer matches a bare id by suffix
+-  (`id.endsWith('.' + expectId)`). Verified against parseJunit output: all 11
+-  ids match exactly one failing case."
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:05:24.168Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml b/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
+deleted file mode 100644
+index 681e394..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
++++ /dev/null
+@@ -1,19 +0,0 @@
+-id: rm-eaf2656f2a
+-chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
+-  documenting why it is justified over `test/harness/mock-provider`.
+-alternatives:
+-  - Rename to `test/harness/mock-provider` (conflicts with the M8 plan interface)
+-  - Drop the proposal path entirely (loses actionable M8 guidance)
+-why: The M8 plan's directional interface explicitly names
+-  `test/e2e/mock-provider/*`, and the split keeps the no-model scripted suite
+-  separate from paid live coverage; the review allowed either the repo idiom or
+-  a justification.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/decisions/011-item-merge-setup-fix-1.yaml b/.factory/tasks/omp-workspaces/decisions/011-item-merge-setup-fix-1.yaml
+deleted file mode 100644
+index a8c3ae8..0000000
+--- a/.factory/tasks/omp-workspaces/decisions/011-item-merge-setup-fix-1.yaml
++++ /dev/null
+@@ -1,27 +0,0 @@
+-id: decision-merge-setup-fix-1794280121500
+-context: item
+-item: merge-setup-fix
+-afterRecord: 003-develop-r1-a2
+-decision: retry-with-guidance
+-timestamp: 2026-11-10T03:08:41.500Z
+-rationale: "2/2 develop attempts rejected solely by the test gate; the new
+-  merge-setup tests pass (667 pass). The single new failure — stranded-wave
+-  consult-refire — cannot be caused by this change: that test's item never
+-  reaches ready/merge (perpetual fix dispositions + consults), its infra has
+-  empty gates/setup, and it failed via a 5000ms timeout plus a between-tests
+-  teardown error alongside 'killed 1 dangling process' — a load flake under 4
+-  concurrent full-suite gate runs in wave 2. No evidence of prod regression;
+-  abandoning would lose the critical wave-1 merge unblocker."
+-text: "RETRY (gate flake, not prod regression — isolate before touching code):
+-  1) Run ONLY the failing file in isolation from plugins/software-factory: `bun
+-  test test/engine/stranded-wave.test.ts`. Expect pass. That test never invokes
+-  mergeItem (item never becomes ready; infra has empty gates), so an isolated
+-  pass proves the full-suite timeout was load contention — do NOT rewrite prod
+-  code in that case. 2) Re-run the full `bun test` once; success = no NEW
+-  failing tests vs baseline (only the accepted disk-space env failure may
+-  remain). 3) ONLY if the isolated file also fails: treat as real regression —
+-  audit your merge-path diff for strict empty-setup parity (no-op before any
+-  journal/git/snapshot side effect, identical return paths when infra.setup is
+-  empty/missing) and fix minimally. Keep prod diff ~80 lines; preserve the new
+-  passing merge-setup tests."
+-persist: true
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..a625917
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,31 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/merge-setup.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 3 expected tests failed with assertion failures"
++    details:
++      command: bun --cwd=plugins/software-factory test test/engine/merge-setup.test.ts
++        --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794276734716-3kdgmfp2jbu.xml
++      junitCaseCount: 5
++      junitCaseIds:
++        - merge-path infra.setup.runs setup in the child worktree before gates,
++          and setup-created untracked files are not gate mutations
++        - merge-path infra.setup.runs setup before target-green checks in the
++          child worktree
++        - merge-path infra.setup.treats an empty setup list as a no-op and
++          merges as before
++        - merge-path infra.setup.treats a missing setup key as a no-op and
++          merges as before
++        - merge-path infra.setup.fails the merge with gate-shaped evidence
++          containing the setup command and output
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..4959da5
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,91 @@
++# Step: Test-First
++
++## Goal
++Author automated tests specifying the required behavior changes BEFORE writing production code.
++
++## Rules
++- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
++- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
++- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
++- Target declaration in yield:
++  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
++  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
++  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
++- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
++- Output: yield structured output per `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "merge-setup-fix",
++  "kind": "dev",
++  "title": "Run infra.setup in merge child worktree before gates",
++  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
++  "outlineRef": "merge-setup-fix",
++  "milestone": "m1-omp-de-risk",
++  "wave": 2,
++  "citations": [
++    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
++    "gates.ts:332-335 runInfraSetup temp-worktree path",
++    "runner.ts:796-810 runInfraSetup temp-worktree path"
++  ]
++}
++
++## Context & Citations
++[
++  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
++  "gates.ts:332-335 runInfraSetup temp-worktree path",
++  "runner.ts:796-810 runInfraSetup temp-worktree path"
++]
++
++## Review Feedback
++
++
++## Open Concerns
++- id: c-552344216d
++  kind: blocker
++  severity: high
++  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
++  affects:
++    - "19.2"
++    - wave-merge
++- id: c-f972360209
++  kind: tech-debt
++  severity: medium
++  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
++  affects:
++    - redrive
++    - wave-merge
++
++
++- Review the concerns above before starting; they constrain this step but are not part of the assignment.
++- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of object, optional): Structured concerns raised during implementation
++  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
++  - summary (string, required)
++  - detail (string, optional)
++  - severity (string, optional, enum: ["low","medium","high"])
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
++  - affects (array of string, optional)
++- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
++  - chosen (string, required)
++  - why (string, required)
++  - alternatives (array of string, required)
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..a87994f
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 1
++name: test-first
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-10T01:58:58.268Z
++session: 01a1c32e-1319-71c5-8ba5-7d9366c17208
++endedAt: 2026-11-10T02:12:17.267Z
++usage:
++  inputTokens: 204993
++  outputTokens: 50291
++  costUsd: 0.068727
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..e931d95
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,70 @@
++status: ok
++summary: "Authored the target-red behavior tests for merge-path infra.setup in
++  plugins/software-factory/test/engine/merge-setup.test.ts (5 tests): (a) setup
++  writes a marker plus a node_modules-class untracked tree before gates, the
++  gate observes it, and no worktree-mutation is reported; (b) setup runs before
++  target-green; (c) empty setup is a no-op; (d) missing setup is a no-op; (e)
++  failing setup aborts the merge with gate-failure-shaped evidence carrying
++  command + stdout/stderr and prevents gates from running. Per this step's
++  test-first scope, production code is untouched; the mergeItem implementation
++  belongs to the follow-up develop step. Red is proven with the repo's real
++  target-red check: all 3 declared expectRed ids fail as assertion failures
++  while existing merge/gates suites remain green."
++target:
++  selectors:
++    - test/engine/merge-setup.test.ts
++  expectRed:
++    - merge-path infra.setup.runs setup in the child worktree before gates, and
++      setup-created untracked files are not gate mutations
++    - merge-path infra.setup.runs setup before target-green checks in the child
++      worktree
++    - merge-path infra.setup.fails the merge with gate-shaped evidence
++      containing the setup command and output
++evidence:
++  - "Added test/engine/merge-setup.test.ts: 5 tmp-repo, no-network behavior
++    tests covering setup-before-gates marker visibility and mutation-free
++    snapshot, setup-before-target-green, empty-setup parity, missing-setup
++    parity, and failing-setup evidence (command + stdout/stderr markers +
++    gate-shaped journal event)."
++  - "Red: `cd plugins/software-factory && bun test
++    test/engine/merge-setup.test.ts` → 2 pass, 3 fail; all 3 are expect()
++    assertion failures (JUnit reports tests=5 failures=3), not import/collection
++    errors."
++  - "Real target-red verification: runCheck('target-red') with the declared
++    selectors/expectRed against the worktree → {ok:true, summary:'target-red
++    passed: all 3 expected tests failed with assertion failures'}."
++  - "Parity: `bun test test/engine/merge-gate-evidence.test.ts
++    test/git/merge.test.ts test/engine/merge-conflict.test.ts
++    test/engine/merge-redrive-stranded.test.ts test/checks` → 72 pass, 0 fail."
++  - "Typecheck: `cd plugins/software-factory && bun run typecheck` (tsc
++    --noEmit) → exit 0."
++  - "Scope: `git status --porcelain -- plugins/software-factory/src
++    plugins/software-factory/test` → only `??
++    plugins/software-factory/test/engine/merge-setup.test.ts`; `git diff --stat
++    -- plugins/software-factory/src` is empty, so no prod file was modified."
++remarkable:
++  - chosen: Deliver a test-only diff and defer the merge-path.ts implementation to
++      the follow-up develop step.
++    why: The story.dev flow runs test-first-scope (rejects any modified prod file)
++      and target-red (declared tests must currently fail) in this step; shipping
++      the implementation here would fail both mechanical checks.
++    alternatives:
++      - Implement mergeItem setup execution in this step as the story assignment
++        text lists — rejected because target-red would see green and
++        test-first-scope rejects modified src/** files.
++      - Introduce a prod interface stub — unnecessary because the tests exercise
++        the existing mergeItem export.
++notes: "Implementation guidance for the develop step: in mergeItem, after the
++  verify-checks phase begins and infra.yaml is loaded, run infra.setup commands
++  sequentially in childWt before runGates and before target-green (mirroring
++  checks/runner.ts runInfraSetup: gate-timeout/second semantics,
++  throw-equivalent on first non-zero exit or timeout). Because setup precedes
++  runGates' per-attempt snapshotWorktree, setup-created untracked files
++  (node_modules) will not be flagged as gate mutations. On failure, journal type
++  item_merge_gates_failed with failingGates ['infra.setup'], results
++  [{id:'infra.setup', status:'fail'}], and evidence shaped like gate failures
++  ('infra.setup (exit via status=fail). Command: <cmd> Details: <stdout+stderr
++  tail>'), then return ok:false with the same command+output in error.
++  Empty/missing setup must remain a no-op (`infra?.setup ?? []`). Environment
++  note: `bun install --frozen-lockfile` was run to restore node_modules for the
++  test runner; no manifest or lockfile changes (node_modules is gitignored)."
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..9273b76
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,99 @@
++# Step: Develop
++
++## Goal
++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++
++## Rules
++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "merge-setup-fix",
++  "kind": "dev",
++  "title": "Run infra.setup in merge child worktree before gates",
++  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
++  "outlineRef": "merge-setup-fix",
++  "milestone": "m1-omp-de-risk",
++  "wave": 2,
++  "citations": [
++    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
++    "gates.ts:332-335 runInfraSetup temp-worktree path",
++    "runner.ts:796-810 runInfraSetup temp-worktree path"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/merge-setup.test.ts"
++  ],
++  "expectRed": [
++    "merge-path infra.setup.runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations",
++    "merge-path infra.setup.runs setup before target-green checks in the child worktree",
++    "merge-path infra.setup.fails the merge with gate-shaped evidence containing the setup command and output"
++  ]
++}
++
++## Context & Citations
++[
++  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
++  "gates.ts:332-335 runInfraSetup temp-worktree path",
++  "runner.ts:796-810 runInfraSetup temp-worktree path"
++]
++
++## Review Feedback
++
++
++## Open Concerns
++- id: c-552344216d
++  kind: blocker
++  severity: high
++  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
++  affects:
++    - "19.2"
++    - wave-merge
++- id: c-f972360209
++  kind: tech-debt
++  severity: medium
++  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
++  affects:
++    - redrive
++    - wave-merge
++
++
++- Review the concerns above before starting; they constrain this step but are not part of the assignment.
++- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of object, optional): Structured concerns raised during implementation
++  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
++  - summary (string, required)
++  - detail (string, optional)
++  - severity (string, optional, enum: ["low","medium","high"])
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
++  - affects (array of string, optional)
++- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
++  - chosen (string, required)
++  - why (string, required)
++  - alternatives (array of string, required)
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..d4b4ba4
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,22 @@
++seq: 2
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: rejected
++startedAt: 2026-11-10T02:28:30.436Z
++session: 01a1c34d-478c-761b-b4e8-114fe1388c98
++endedAt: 2026-11-10T02:35:24.439Z
++usage:
++  inputTokens: 65574
++  outputTokens: 18937
++  costUsd: 0.025037999999999998
++error: |-
++  Output validation and repair failed: Agent output failed schema validation:
++  /: must be object ({"type":"object"})
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-053Z_01a1c349-1ccd-7094-967b-f4e95a34a589.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/checks.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/checks.yaml
+new file mode 100644
+index 0000000..f4187bf
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/checks.yaml
+@@ -0,0 +1,253 @@
++checks:
++  - id: gates
++    status: fail
++    message: "Gate regressions: test"
++    details:
++      - id: typecheck
++        command: bun --cwd=plugins/software-factory run typecheck
++        status: pass
++        durationMs: 5092
++        details: $ tsc --noEmit
++      - id: test
++        command: bun --cwd=plugins/software-factory test
++        status: fail
++        durationMs: 484170
++        details: >-
++          bun test v1.4.4 (38afee6c8)
++
++          Disk space check passed (threshold 2048 MB):
++            worktreeRoot (/tmp/factory-test-repo-59fVor.factory-wt): 4473 MB free
++            .factory-runtime/tmp (/tmp/factory-test-repo-59fVor.factory-wt/.factory-runtime/tmp): 4473 MB free
++            repoRoot (/tmp/factory-test-repo-59fVor): 4473 MB free
++            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 79578 MB free
++            /tmp (/tmp): 4473 MB free
++          ================================================================
++
++          Task: status-test-task [ACTIVE]
++
++          Kind: unclassified | Iteration: 1 | Wave: 1
++
++          Worktree: (none - main checkout)
++
++          Config path: /tmp/factory-test-repo-4oJfDG/.factory/pipeline.yaml
++
++          Budget spent: $0.0000
++
++          ----------------------------------------------------------------
++
++          Waves & Items:
++            Wave 1:
++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
++
++          ----------------------------------------------------------------
++
++          Blocking Questions:
++            (none)
++          ----------------------------------------------------------------
++
++          Digest Questions:
++            (none)
++          ================================================================
++
++
++
++          test/config-worktree-layering.test.ts:
++
++          [factory preflight] Preflight failed with 1 error(s):
++            - Pipeline config loading failed: Invalid pipeline configuration:
++          /limits/maxIterations: must be integer ({"type":"integer"})
++
++
++          test/disk-space.test.ts:
++
++          52 |       probe,
++
++          53 |     });
++
++          54 | 
++
++          55 |     expect(res.ok).toBe(false);
++
++          56 |     expect(res.minFreeDiskMb).toBe(2048);
++
++          57 |     expect(res.failingPaths.length).toBe(1);
++                                                   ^
++          error: expect(received).toBe(expected)
++
++
++          Expected: 1
++
++          Received: 2
++
++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/disk-space.test.ts:57:37)
++          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
++          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++          [37.70ms]
++
++
++          test/cli/cli.test.ts:
++
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
++          on host Slava-Yoga) taken over by PID 278359
++
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 278359
++
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 278359
++
++          killed 1 dangling process
++
++
++          test/engine/stranded-wave.test.ts:
++
++          (fail) Stranded-wave fix > second consult for the same item fires a
++          fresh turn (no step_reused sham loop) [5057.05ms]
++            ^ this test timed out after 5000ms.
++
++          # Unhandled error between tests
++
++          -------------------------------
++
++          250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
++
++          251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder,
++          task);
++
++          252 |     const journal = await readJournal(deployedTaskDir);
++
++          253 |     // No done-ness reuse shadowed either consult: both
++          decisions recorded.
++
++          254 |     expect(journal.filter((e) => e.type === "step_reused" &&
++          String((e as { step?: string }).step ??
++          "").startsWith("consult-loop-1")).length).toBe(0);
++
++          255 |     expect(journal.filter((e) => e.type === "decision_made" &&
++          (e as { item?: string }).item === "loop-1").length).toBe(2);
++                                                                                                                                   ^
++          error: expect(received).toBe(expected)
++
++
++          Expected: 2
++
++          Received: 0
++
++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
++          -------------------------------
++
++
++           667 pass
++           2 skip
++           2 fail
++           1 error
++           3763 expect() calls
++          Ran 671 tests across 102 files. [253.72s]
++
++          [New failing tests: Stranded-wave fix.second consult for the same item
++          fires a fresh turn (no step_reused sham loop)]
++        failingTests:
++          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
++            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++          - Stranded-wave fix.second consult for the same item fires a fresh
++            turn (no step_reused sham loop)
++    output: >-
++      7:37)
++
++      (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace verifies
++      worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir [37.70ms]
++
++
++      test/cli/cli.test.ts:
++
++      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on
++      host Slava-Yoga) taken over by PID 278359
++
++      [factory lock] Stale run lock for task "competing-takeover-task" (PID
++      9999999 on host Slava-Yoga) taken over by PID 278359
++
++      [factory lock] Stale run lock for task "journal-worktree-task" (PID
++      9999999 on host Slava-Yoga) taken over by PID 278359
++
++      killed 1 dangling process
++
++
++      test/engine/stranded-wave.test.ts:
++
++      (fail) Stranded-wave fix > second consult for the same item fires a fresh
++      turn (no step_reused sham loop) [5057.05ms]
++        ^ this test timed out after 5000ms.
++
++      # Unhandled error between tests
++
++      -------------------------------
++
++      250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
++
++      251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
++
++      252 |     const journal = await readJournal(deployedTaskDir);
++
++      253 |     // No done-ness reuse shadowed either consult: both decisions
++      recorded.
++
++      254 |     expect(journal.filter((e) => e.type === "step_reused" &&
++      String((e as { step?: string }).step ??
++      "").startsWith("consult-loop-1")).length).toBe(0);
++
++      255 |     expect(journal.filter((e) => e.type === "decision_made" && (e as
++      { item?: string }).item === "loop-1").length).toBe(2);
++                                                                                                                               ^
++      error: expect(received).toBe(expected)
++
++
++      Expected: 2
++
++      Received: 0
++
++            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
++      -------------------------------
++
++
++       667 pass
++       2 skip
++       2 fail
++       1 error
++       3763 expect() calls
++      Ran 671 tests across 102 files. [253.72s]
++
++      [New failing tests: Stranded-wave fix.second consult for the same item
++      fires a fresh turn (no step_reused sham loop)]
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: bun --cwd=plugins/software-factory test test/engine/merge-setup.test.ts
++        --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794279806234-jse7zphthr.xml
++      junitCaseCount: 5
++      junitCaseIds:
++        - merge-path infra.setup.runs setup in the child worktree before gates,
++          and setup-created untracked files are not gate mutations
++        - merge-path infra.setup.runs setup before target-green checks in the
++          child worktree
++        - merge-path infra.setup.treats an empty setup list as a no-op and
++          merges as before
++        - merge-path infra.setup.treats a missing setup key as a no-op and
++          merges as before
++        - merge-path infra.setup.fails the merge with gate-shaped evidence
++          containing the setup command and output
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 83/300 production lines changed"
++    details:
++      changedLines:
++        added: 78
++        deleted: 5
++        total: 83
++        files:
++          - plugins/software-factory/src/core/flows/merge-path.ts
++      limit: 300
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/input.md
+new file mode 100644
+index 0000000..77627bf
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/input.md
+@@ -0,0 +1,104 @@
++# Step: Develop
++
++## Goal
++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++
++## Rules
++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "merge-setup-fix",
++  "kind": "dev",
++  "title": "Run infra.setup in merge child worktree before gates",
++  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
++  "outlineRef": "merge-setup-fix",
++  "milestone": "m1-omp-de-risk",
++  "wave": 2,
++  "citations": [
++    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
++    "gates.ts:332-335 runInfraSetup temp-worktree path",
++    "runner.ts:796-810 runInfraSetup temp-worktree path"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/merge-setup.test.ts"
++  ],
++  "expectRed": [
++    "merge-path infra.setup.runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations",
++    "merge-path infra.setup.runs setup before target-green checks in the child worktree",
++    "merge-path infra.setup.fails the merge with gate-shaped evidence containing the setup command and output"
++  ]
++}
++
++## Context & Citations
++[
++  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
++  "gates.ts:332-335 runInfraSetup temp-worktree path",
++  "runner.ts:796-810 runInfraSetup temp-worktree path"
++]
++
++## Review Feedback
++Output validation and repair failed: Agent output failed schema validation:
++/: must be object ({"type":"object"})
++
++Budget: 83 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
++
++Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
++
++## Open Concerns
++- id: c-552344216d
++  kind: blocker
++  severity: high
++  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
++  affects:
++    - "19.2"
++    - wave-merge
++- id: c-f972360209
++  kind: tech-debt
++  severity: medium
++  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
++  affects:
++    - redrive
++    - wave-merge
++
++
++- Review the concerns above before starting; they constrain this step but are not part of the assignment.
++- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of object, optional): Structured concerns raised during implementation
++  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
++  - summary (string, required)
++  - detail (string, optional)
++  - severity (string, optional, enum: ["low","medium","high"])
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
++  - affects (array of string, optional)
++- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
++  - chosen (string, required)
++  - why (string, required)
++  - alternatives (array of string, required)
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/meta.yaml
+new file mode 100644
+index 0000000..e380ee8
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 3
++name: develop
++attempt: 2
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: rejected
++startedAt: 2026-11-10T02:52:15.878Z
++session: 01a1c35e-dc77-70e1-8459-a5285fe93047
++endedAt: 2026-11-10T03:03:28.115Z
++usage:
++  inputTokens: 23598
++  outputTokens: 8937
++  costUsd: 0.010886
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-16-375Z_01a1c35e-dc77-70e1-8459-a5285fe93047.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/output.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/output.yaml
+new file mode 100644
+index 0000000..c2e92e4
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/output.yaml
+@@ -0,0 +1,39 @@
++status: ok
++summary: Implemented merge-path infra.setup support and verified the new
++  behavior tests plus adjacent suites. mergeItem now reads infra.yaml, runs
++  setup commands in the child worktree immediately before gate/target snapshots
++  (after the parent-into-child merge and tree-diff check, before
++  snapshotWorktree/runGates/target-green), treats empty/missing setup as a
++  no-op, and aborts with gate-failure-shaped journal evidence and error text (id
++  infra.setup, command, exit status, captured stdout/stderr) when setup fails.
++  Target test/engine/merge-setup.test.ts passes 5/5; related merge/gates suites
++  pass 18/18; tsc --noEmit exits 0. Prod diff is 83 lines, within the 300-line
++  budget. The full bun test gate was still running in the background when
++  yielding; targeted and adjacent suites showed no new failures.
++target:
++  selectors:
++    - test/engine/merge-setup.test.ts
++  expectRed:
++    - merge-path infra.setup.runs setup in the child worktree before gates, and
++      setup-created untracked files are not gate mutations
++    - merge-path infra.setup.runs setup before target-green checks in the child
++      worktree
++    - merge-path infra.setup.fails the merge with gate-shaped evidence
++      containing the setup command and output
++evidence:
++  - "bun test test/engine/merge-setup.test.ts -> 5 pass, 0 fail, 27 expect()
++    calls (covers all three target cases: setup-before-gates with no
++    worktree_mutation_detected events, setup-before-target-green, and
++    failing-setup evidence with command + stdout/stderr + gate never ran)"
++  - bun test test/engine/merge-conflict.test.ts
++    test/engine/merge-gate-evidence.test.ts
++    test/engine/merge-redrive-stranded.test.ts
++    test/engine/checks-gates-fixloop.test.ts -> 18 pass, 0 fail
++  - bun run typecheck (tsc --noEmit) -> exit code 0, no diagnostics
++  - git diff a7e05af --numstat -- src/core/flows/merge-path.ts -> 78 insertions,
++    5 deletions (83 prod lines, under storyMaxProdLines 300)
++  - "Implementation mirrors runInfraSetup semantics (runner.ts:797-810): iterate
++    setup commands in order in childWt, stop at first failure, include
++    command/exit code/output tail"
++  - Full bun test gate launched (background) and still running at yield time; no
++    new failures observed in targeted and adjacent merge/gates suites
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..9094031
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/checks.yaml
+@@ -0,0 +1,139 @@
++checks:
++  - id: gates
++    status: pass
++    message: Gates passed (2 gates)
++    details:
++      - id: typecheck
++        command: bun --cwd=plugins/software-factory run typecheck
++        status: pass
++        durationMs: 6077
++        details: $ tsc --noEmit
++      - id: test
++        command: bun --cwd=plugins/software-factory test
++        status: pass
++        durationMs: 488106
++        details: >-
++          bun test v1.4.4 (38afee6c8)
++
++          Disk space check passed (threshold 2048 MB):
++            worktreeRoot (/tmp/factory-test-repo-ZBAD7g.factory-wt): 4470 MB free
++            .factory-runtime/tmp (/tmp/factory-test-repo-ZBAD7g.factory-wt/.factory-runtime/tmp): 4470 MB free
++            repoRoot (/tmp/factory-test-repo-ZBAD7g): 4470 MB free
++            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 86979 MB free
++            /tmp (/tmp): 4470 MB free
++          ================================================================
++
++          Task: status-test-task [ACTIVE]
++
++          Kind: unclassified | Iteration: 1 | Wave: 1
++
++          Worktree: (none - main checkout)
++
++          Config path: /tmp/factory-test-repo-7NLC8V/.factory/pipeline.yaml
++
++          Budget spent: $0.0000
++
++          ----------------------------------------------------------------
++
++          Waves & Items:
++            Wave 1:
++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
++
++          ----------------------------------------------------------------
++
++          Blocking Questions:
++            (none)
++          ----------------------------------------------------------------
++
++          Digest Questions:
++            (none)
++          ================================================================
++
++
++
++          test/config-worktree-layering.test.ts:
++
++          [factory preflight] Preflight failed with 1 error(s):
++            - Pipeline config loading failed: Invalid pipeline configuration:
++          /limits/maxIterations: must be integer ({"type":"integer"})
++
++
++          test/disk-space.test.ts:
++
++          52 |       probe,
++
++          53 |     });
++
++          54 | 
++
++          55 |     expect(res.ok).toBe(false);
++
++          56 |     expect(res.minFreeDiskMb).toBe(2048);
++
++          57 |     expect(res.failingPaths.length).toBe(1);
++                                                   ^
++          error: expect(received).toBe(expected)
++
++
++          Expected: 1
++
++          Received: 2
++
++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/disk-space.test.ts:57:37)
++          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
++          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++          [33.32ms]
++
++
++          test/cli/cli.test.ts:
++
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
++          on host Slava-Yoga) taken over by PID 575155
++
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 575155
++
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 575155
++
++           668 pass
++           2 skip
++           1 fail
++           3763 expect() calls
++          Ran 671 tests across 102 files. [235.50s]
++        failingTests:
++          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
++            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: bun --cwd=plugins/software-factory test test/engine/merge-setup.test.ts
++        --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794282428640-tlf72geo2oi.xml
++      junitCaseCount: 5
++      junitCaseIds:
++        - merge-path infra.setup.runs setup in the child worktree before gates,
++          and setup-created untracked files are not gate mutations
++        - merge-path infra.setup.runs setup before target-green checks in the
++          child worktree
++        - merge-path infra.setup.treats an empty setup list as a no-op and
++          merges as before
++        - merge-path infra.setup.treats a missing setup key as a no-op and
++          merges as before
++        - merge-path infra.setup.fails the merge with gate-shaped evidence
++          containing the setup command and output
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 83/300 production lines changed"
++    details:
++      changedLines:
++        added: 78
++        deleted: 5
++        total: 83
++        files:
++          - plugins/software-factory/src/core/flows/merge-path.ts
++      limit: 300
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..6509aad
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/input.md
+@@ -0,0 +1,156 @@
++# Step: Develop
++
++## Goal
++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++
++## Rules
++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "merge-setup-fix",
++  "kind": "dev",
++  "title": "Run infra.setup in merge child worktree before gates",
++  "assignment": "Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.",
++  "outlineRef": "merge-setup-fix",
++  "milestone": "m1-omp-de-risk",
++  "wave": 2,
++  "citations": [
++    "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
++    "gates.ts:332-335 runInfraSetup temp-worktree path",
++    "runner.ts:796-810 runInfraSetup temp-worktree path"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/merge-setup.test.ts"
++  ],
++  "expectRed": [
++    "merge-path infra.setup.runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations",
++    "merge-path infra.setup.runs setup before target-green checks in the child worktree",
++    "merge-path infra.setup.fails the merge with gate-shaped evidence containing the setup command and output"
++  ]
++}
++
++## Context & Citations
++[
++  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
++  "gates.ts:332-335 runInfraSetup temp-worktree path",
++  "runner.ts:796-810 runInfraSetup temp-worktree path"
++]
++
++## Review Feedback
++RETRY (gate flake, not prod regression — isolate before touching code): 1) Run ONLY the failing file in isolation from plugins/software-factory: `bun test test/engine/stranded-wave.test.ts`. Expect pass. That test never invokes mergeItem (item never becomes ready; infra has empty gates), so an isolated pass proves the full-suite timeout was load contention — do NOT rewrite prod code in that case. 2) Re-run the full `bun test` once; success = no NEW failing tests vs baseline (only the accepted disk-space env failure may remain). 3) ONLY if the isolated file also fails: treat as real regression — audit your merge-path diff for strict empty-setup parity (no-op before any journal/git/snapshot side effect, identical return paths when infra.setup is empty/missing) and fix minimally. Keep prod diff ~80 lines; preserve the new passing merge-setup tests.
++
++Failing check: gates
++
++Message: Gate regressions: test
++
++Detail:
++ task \"competing-takeover-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\n[factory lock] Stale run lock for task \"journal-worktree-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\nkilled 1 dangling process\n\ntest/engine/stranded-wave.test.ts:\n(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]\n  ^ this test timed out after 5000ms.\n\n# Unhandled error between tests\n-------------------------------\n250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);\n251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);\n252 |     const journal = await readJournal(deployedTaskDir);\n253 |     // No done-ness reuse shadowed either consult: both decisions recorded.\n254 |     expect(journal.filter((e) => e.type === \"step_reused\" && String((e as { step?: string }).step ?? \"\").startsWith(\"consult-loop-1\")).length).toBe(0);\n255 |     expect(journal.filter((e) => e.type === \"decision_made\" && (e as { item?: string }).item === \"loop-1\").length).toBe(2);\n                                                                                                                         ^\nerror: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 0\n\n      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)\n-------------------------------\n\n\n 667 pass\n 2 skip\n 2 fail\n 1 error\n 3763 expect() calls\nRan 671 tests across 102 files. [253.72s]\n[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]",
++    "failingTests": [
++      "Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir",
++      "Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)"
++    ]
++  }
++]
++
++Output tail:
++7:37)
++(fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir [37.70ms]
++
++test/cli/cli.test.ts:
++[factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
++[factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
++[factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
++killed 1 dangling process
++
++test/engine/stranded-wave.test.ts:
++(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]
++  ^ this test timed out after 5000ms.
++
++# Unhandled error between tests
++-------------------------------
++250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
++251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
++252 |     const journal = await readJournal(deployedTaskDir);
++253 |     // No done-ness reuse shadowed either consult: both decisions recorded.
++254 |     expect(journal.filter((e) => e.type === "step_reused" && String((e as { step?: string }).step ?? "").startsWith("consult-loop-1")).length).toBe(0);
++255 |     expect(journal.filter((e) => e.type === "decision_made" && (e as { item?: string }).item === "loop-1").length).toBe(2);
++                                                                                                                         ^
++error: expect(received).toBe(expected)
++
++Expected: 2
++Received: 0
++
++      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
++-------------------------------
++
++
++ 667 pass
++ 2 skip
++ 2 fail
++ 1 error
++ 3763 expect() calls
++Ran 671 tests across 102 files. [253.72s]
++[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]
++
++Budget: 83 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
++
++Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
++
++## Open Concerns
++- id: c-552344216d
++  kind: blocker
++  severity: high
++  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
++  affects:
++    - "19.2"
++    - wave-merge
++- id: c-f972360209
++  kind: tech-debt
++  severity: medium
++  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
++  affects:
++    - redrive
++    - wave-merge
++
++
++- Review the concerns above before starting; they constrain this step but are not part of the assignment.
++- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of object, optional): Structured concerns raised during implementation
++  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
++  - summary (string, required)
++  - detail (string, optional)
++  - severity (string, optional, enum: ["low","medium","high"])
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
++  - affects (array of string, optional)
++- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
++  - chosen (string, required)
++  - why (string, required)
++  - alternatives (array of string, required)
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..41f55b8
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 4
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-10T03:31:43.891Z
++session: 01a1c382-fe0b-746b-a4e0-c438f0444e26
++endedAt: 2026-11-10T03:47:10.463Z
++usage:
++  inputTokens: 20655
++  outputTokens: 4468
++  costUsd: 0.006537
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T03-31-44-267Z_01a1c382-fe0b-746b-a4e0-c438f0444e26.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..32fafaa
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1/output.yaml
+@@ -0,0 +1,74 @@
++status: ok
++summary: "Retry confirmed the gate failure was load-contention flake, not a
++  production regression, so no code changes were needed. Isolated `bun test
++  test/engine/stranded-wave.test.ts` passes (4/4 in 7.2s), while the same test
++  timed out at 5s during the parallel full-suite run. Re-ran the full suite: 668
++  pass, 2 skip, 1 fail — the only failure is the accepted env-sensitive baseline
++  `test/disk-space.test.ts`. The 5 merge-setup tests (including all three
++  expectRed scenarios) and typecheck remain green. Implementation already in
++  place: mergeItem runs infra.setup in childWt strictly before runGates (whose
++  snapshotWorktree is taken inside runGates), no-ops on empty/missing setup, and
++  aborts with gate-shaped evidence (command + output tail) on failure."
++target:
++  selectors:
++    - test/engine/merge-setup.test.ts
++  expectRed:
++    - merge-path infra.setup.runs setup in the child worktree before gates, and
++      setup-created untracked files are not gate mutations
++    - merge-path infra.setup.runs setup before target-green checks in the child
++      worktree
++    - merge-path infra.setup.fails the merge with gate-shaped evidence
++      containing the setup command and output
++evidence:
++  - "`cd plugins/software-factory && bun test test/engine/stranded-wave.test.ts`
++    -> 4 pass, 0 fail, 7.22s (isolated pass proves the full-suite 5057ms timeout
++    was load contention; test never invokes mergeItem)."
++  - "`cd plugins/software-factory && bun test test/engine/merge-setup.test.ts`
++    -> 5 pass, 0 fail (all three expectRed scenarios plus empty-setup and
++    missing-setup parity cases)."
++  - "`cd plugins/software-factory && bun run typecheck` -> tsc --noEmit exit 0."
++  - Full suite `bun test` (102 files, 671 tests, 258.28s) -> 668 pass, 2 skip, 1
++    fail; sole failure is the accepted baseline red `Disk-space guards
++    (§limits.minFreeDiskMb).checkDiskSpace verifies worktreeRoot,
++    .factory-runtime/tmp, repoRoot, and tmpdir`; stranded-wave passed this run,
++    so no NEW failing tests vs baseline.
++  - "Ordering verified in source: merge-path.ts setup block (lines ~367-396)
++    runs before `runGates` (line ~400), and `snapshotWorktree` is taken inside
++    runGates (gates.ts:477), so setup-created untracked files are in the
++    baseline and not reported as mutations."
++  - Prod diff remains 83 lines, within storyMaxProdLines 300; no changes made in
++    this retry.
++concerns:
++  - kind: risk
++    summary: stranded-wave test has a 5s timeout that flakes under full-suite
++      parallel load
++    detail: test/engine/stranded-wave.test.ts:255 second-consult test timed out at
++      5057ms in the full-suite gate run but passes in 7.2s file-time when
++      isolated. Under 102-file parallel load the per-test 5s budget is too
++      tight; gate failures from this test are likely load artifacts rather than
++      regressions. Consider raising the per-test timeout or reducing suite
++      concurrency.
++    severity: medium
++    location:
++      file: plugins/software-factory/test/engine/stranded-wave.test.ts
++      line: 255
++    affects:
++      - gates
++      - wave-merge
++remarkable:
++  - chosen: Diagnose first and make no production changes on retry
++    why: Review feedback directed isolating the failing file before touching code;
++      the isolated pass (4/4) plus a clean full-suite re-run (only accepted
++      baseline disk-space failure) proves the failure was load contention in the
++      harness, not merge-path behavior.
++    alternatives:
++      - Audit and rewrite merge-path empty-setup parity paths (would risk
++        breaking passing merge-setup tests for a non-reproducible failure)
++      - Increase the test timeout in stranded-wave.test.ts (out of scope for
++        this assignment; raised as a concern instead)
++notes: "No code delta this attempt — the infra.setup implementation and its five
++  behavior tests were already present and green. Verified acceptance ordering:
++  setup runs before runGates and thus before gates' internal snapshotWorktree;
++  empty/missing setup skips the block entirely (strict parity); failure path
++  reuses the gate-failure evidence formatter with id infra.setup, command, and
++  500-char output tail."
+diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
+index 2a03658..bd0bfd0 100644
+--- a/.factory/tasks/omp-workspaces/journal.ndjson
++++ b/.factory/tasks/omp-workspaces/journal.ndjson
+@@ -179,85 +179,3 @@
+ {"type":"step_started","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/016-pm-amend-1-1-a1","ts":"2026-11-10T01:58:23.267Z"}
+ {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-amend-1-1","timeoutSec":2700,"ts":"2026-11-10T01:58:23.271Z"}
+ {"type":"step_finished","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"status":"ok","sessionId":"01a1c32d-8867-7723-95d2-878ad3ce217f","usage":{"inputTokens":23942,"outputTokens":4443,"costUsd":0.003283},"ts":"2026-11-10T01:58:56.769Z"}
+-{"type":"wave_started","wave":2,"iteration":1,"ts":"2026-11-10T01:58:57.650Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.322Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.327Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.394Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.401Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.508Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.516Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.632Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.639Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"sizeBytes":10510823,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"toolCalls":110,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1224-72a4-b1e9-c14d90c8551d","usage":{"inputTokens":115693,"outputTokens":43458,"costUsd":0.058962},"ts":"2026-11-10T02:05:24.330Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"sizeBytes":12075086,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.227Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"toolCalls":111,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.228Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:54.916Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:58.777Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"sizeBytes":5435764,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-869Z_01a1c32e-1235-7054-84d9-126190c40577.jsonl","ts":"2026-11-10T02:06:51.065Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:54.313Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:57.347Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"sizeBytes":5725555,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"toolCalls":93,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:31.055Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:33.409Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"method":"ask","ts":"2026-11-10T02:12:14.696Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1319-71c5-8ba5-7d9366c17208","usage":{"inputTokens":204993,"outputTokens":50291,"costUsd":0.068727},"ts":"2026-11-10T02:12:17.328Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:14:23.165Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:20:04.945Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c32e-1401-7277-bf9d-7bf38233f921","usage":{"inputTokens":139228,"outputTokens":49219,"costUsd":0.071688},"ts":"2026-11-10T02:23:11.689Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c32e-1235-7054-84d9-126190c40577","usage":{"inputTokens":115418,"outputTokens":50352,"costUsd":0.060786},"ts":"2026-11-10T02:28:29.165Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/002-review-r1-a1","ts":"2026-11-10T02:28:30.468Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"transport-byte-stability","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:28:30.473Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/002-develop-r1-a1","ts":"2026-11-10T02:28:30.505Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","timeoutSec":5400,"ts":"2026-11-10T02:28:30.510Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1","ts":"2026-11-10T02:28:30.543Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","timeoutSec":5400,"ts":"2026-11-10T02:28:30.563Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1","ts":"2026-11-10T02:28:30.586Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T02:28:30.594Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:31:18.728Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:31:20.791Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"sizeBytes":9642303,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-960Z_01a1c349-1c70-753b-80bd-f7b7bd4a284b","ts":"2026-11-10T02:35:11.187Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"toolCalls":104,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-960Z_01a1c349-1c70-753b-80bd-f7b7bd4a284b","ts":"2026-11-10T02:35:11.187Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:35:13.343Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:35:16.197Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1c349-1ccd-7094-967b-f4e95a34a589","usage":{"inputTokens":65574,"outputTokens":18937,"costUsd":0.025037999999999998},"ts":"2026-11-10T02:35:24.503Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"sizeBytes":22491067,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-042Z_01a1c349-1cc2-739a-990e-2c1cce0ebd71.jsonl","ts":"2026-11-10T02:42:24.305Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"toolCalls":145,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-042Z_01a1c349-1cc2-739a-990e-2c1cce0ebd71.jsonl","ts":"2026-11-10T02:42:24.306Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"status":"ok","sessionId":"01a1c349-1cc2-739a-990e-2c1cce0ebd71","usage":{"inputTokens":232949,"outputTokens":72636,"costUsd":0.051412},"ts":"2026-11-10T02:42:24.388Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"method":"relaunch","ts":"2026-11-10T02:44:44.801Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"sizeBytes":8808880,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-938Z_01a1c349-1c5a-74ff-8fd7-583a79e8bffd","ts":"2026-11-10T02:46:53.214Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"toolCalls":96,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-938Z_01a1c349-1c5a-74ff-8fd7-583a79e8bffd","ts":"2026-11-10T02:46:53.215Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"status":"ok","sessionId":"01a1c349-1c5a-74ff-8fd7-583a79e8bffd","usage":{"inputTokens":77200,"outputTokens":56540,"costUsd":0.022365},"ts":"2026-11-10T02:46:53.398Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c349-1c70-753b-80bd-f7b7bd4a284b","usage":{"inputTokens":161616,"outputTokens":52072,"costUsd":0.072077},"ts":"2026-11-10T02:52:14.564Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1","ts":"2026-11-10T02:52:15.903Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:52:15.907Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/003-qa-r1-a1","ts":"2026-11-10T02:52:15.937Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2","ts":"2026-11-10T02:52:15.972Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T02:52:15.978Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","timeoutSec":5400,"ts":"2026-11-10T02:52:18.383Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:53:35.354Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:53:37.308Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":2,"method":"ask","ts":"2026-11-10T02:55:16.967Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":2,"status":"rejected","sessionId":"01a1c35e-dc77-70e1-8459-a5285fe93047","usage":{"inputTokens":23598,"outputTokens":8937,"costUsd":0.010886},"ts":"2026-11-10T03:03:28.159Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","attempt":1,"sizeBytes":8570169,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-18-955Z_01a1c35e-e68b-70cb-8daf-f1f800970391.jsonl","ts":"2026-11-10T03:06:54.262Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","attempt":1,"toolCalls":111,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-18-955Z_01a1c35e-e68b-70cb-8daf-f1f800970391.jsonl","ts":"2026-11-10T03:06:54.263Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","attempt":1,"status":"ok","sessionId":"01a1c35e-e68b-70cb-8daf-f1f800970391","usage":{"inputTokens":117741,"outputTokens":48009,"costUsd":0.025889},"ts":"2026-11-10T03:06:54.358Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","attempt":1,"sizeBytes":18701342,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-16-327Z_01a1c35e-dc47-7421-b99b-9b4039009710.jsonl","ts":"2026-11-10T03:07:13.214Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","attempt":1,"toolCalls":120,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-16-327Z_01a1c35e-dc47-7421-b99b-9b4039009710.jsonl","ts":"2026-11-10T03:07:13.214Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","attempt":1,"status":"ok","sessionId":"01a1c35e-dc47-7421-b99b-9b4039009710","usage":{"inputTokens":174557,"outputTokens":81945,"costUsd":0.051078},"ts":"2026-11-10T03:07:13.292Z"}
+-{"type":"step_started","task":"omp-workspaces","step":"consult-merge-setup-fix-1","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1","ts":"2026-11-10T03:07:14.956Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","step":"consult-merge-setup-fix-1","timeoutSec":7200,"ts":"2026-11-10T03:07:14.961Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/004-review-r1-a1","ts":"2026-11-10T03:07:15.001Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","timeoutSec":3600,"ts":"2026-11-10T03:07:15.008Z"}
+-{"type":"step_finished","task":"omp-workspaces","step":"consult-merge-setup-fix-1","attempt":1,"status":"ok","sessionId":"01a1c29e-2258-71ad-886f-375b051ddadb","usage":{"inputTokens":572479,"outputTokens":4710,"costUsd":0.061607},"ts":"2026-11-10T03:08:41.591Z"}
+-{"type":"decision_made","context":"item","item":"merge-setup-fix","decision":"retry-with-guidance","decisionPath":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/decisions/011-item-merge-setup-fix-1.yaml","ts":"2026-11-10T03:08:41.592Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","attempt":1,"sizeBytes":9579045,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T03-07-15-430Z_01a1c36c-9466-73b6-ae79-1c2c59cb8490.jsonl","ts":"2026-11-10T03:31:42.281Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","attempt":1,"toolCalls":92,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T03-07-15-430Z_01a1c36c-9466-73b6-ae79-1c2c59cb8490.jsonl","ts":"2026-11-10T03:31:42.282Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","attempt":1,"status":"ok","sessionId":"01a1c36c-9466-73b6-ae79-1c2c59cb8490","usage":{"inputTokens":114443,"outputTokens":50596,"costUsd":0.024806},"ts":"2026-11-10T03:31:42.390Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1","ts":"2026-11-10T03:31:43.925Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T03:31:43.932Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T03:33:47.513Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T03:33:49.630Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T03:38:54.455Z"}
+diff --git a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/input.md b/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/input.md
+deleted file mode 100644
+index cbc7539..0000000
+--- a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/input.md
++++ /dev/null
+@@ -1,977 +0,0 @@
+-# Step: Architect Consult (Item)
+-
+-## Goal
+-Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
+-
+-## Rules
+-- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `omp-workspaces` (factory.v2 spec items 19 + 20)
+-
+-Repo: `agentic-swarm` (plugin root `plugins/software-factory`). Spec: `docs/factory.v2.md`.
+-All line numbers are repo-relative and verified against the current checkout.
+-
+----
+-
+-## 0. Scope and headline
+-
+-The two spec items are deliberately un-implemented in v2 and are the second self-hosted fire-test goal: `plugins/software-factory/docs/ARCHITECTURE.md:40` says **"Deliberately not hand-built … Current state: engine-managed worktrees (§7), item-level integrate step, in-process epics, schema-bound architect plan, no cache/compaction management; prior omp research in `docs/spikes/`."**
+-
+-The engine today is a single Bun process that derives state from committed records + git, creates its own git worktrees, runs one omp process per agent turn with `--cwd <worktree>`, merges items serially at wave end, and runs epics in-process as child tasks. Items 19/20 ask to (a) move workspace isolation to omp's configurable backend by default, (b) harden preflight/lifecycle, (c) move commit content and merge escalation to agents, (d) make epics independent launches inside sagas, (e) add an audited cache/compaction policy for the architect, and (f) prove all of it with no-paid-model end-to-end tests through the real omp harness.
+-
+-A fresh probe of the installed `omp` (`/home/slava/.bun/bin/omp`, version `18.18.5`) shows the mechanics the spec refers to **do exist** as configuration: `isolation.backend` (enum, default `rcopy`), `task.isolation.{enabled,apply,merge,commits}`, `worktree.{base,onStart,onExit,clone,cleanSource}`, `compaction.*`, and `providers.cacheWarming` / `providers.cacheRetention`. None of these keys is used by the factory today (`plugins/software-factory/src/harness/omp/overlay.ts:26-100`). See §5 for the probe log.
+-
+----
+-
+-## 1. Acceptance definition (the two spec items)
+-
+-### Item 19 — workspaces, merging, lifecycle (prefer omp over DIY) — `docs/factory.v2.md:104-113`
+-
+-| # | Requirement (condensed) |
+-|---|---|
+-| 19.1 | Workspace isolation via **omp's configurable isolation backend by default**; engine git worktrees stay only as config option `isolation: omp | engine`; a spike settles backend config, branch/commit retention on failure, cwd, merge-back |
+-| 19.2 | Preflight verifies: compatible omp version + config (overlay keys, isolation backend usable via a **real throwaway round-trip**), every configured model/role resolvable, target git repo state (clean, branches/worktrees consistent with records), harness binaries |
+-| 19.3 | Idempotent tracking of tasks/workspaces/branches/commits derived from records + git; launchers: `status` (whole tree: saga/epics/tasks/items, workspace+branch per active agent, open questions), `cleanup` (finished workspaces), `gc` (orphaned workspaces/branches/runtime files, stale locks; **dry-run by default**); all safe when idle and **refusing while a run holds the lock** |
+-| 19.4 | Commit message and scope from agents' structured output (e.g. last review before commit summarizes the change) or omp mechanics; **engine never invents content** |
+-| 19.5 | Wave-end merge default: conflict-free → deterministic CI gates → merged; conflicts or red → **workhorse-class wave-end merger agent** resolves trivial conflicts → unresolvable → architect escalation carrying a pointer to overall status (one command/file) and the worktree + branch of the problematic item |
+-| 19.6 | Saga: each epic runs as an **independent factory launch in its own workspace** (parallel epics possible); merges inside an epic escalate to the epic architect; merging epics at saga wave end escalates to the saga architect |
+-| 19.7 | Docs show each use case: single task, story waves, epic, saga with parallel epics, conflict/escalation paths, status/cleanup/gc |
+-| 19.8 | "No models" tests: end-to-end through the **real omp harness with a scripted mock model provider** (no paid models), covering isolation, merges/conflicts/escalations, saga/epic launches, restart, gc |
+-| 19.9 | Repo rules hydration: omp does not put AGENTS.md in subagent context, so the factory hydrates repo rules itself for architect and every implementer-chain agent, verified end-to-end per role |
+-
+-### Item 20 — architect context economy — `docs/factory.v2.md:114-120`
+-
+-| # | Requirement (condensed) |
+-|---|---|
+-| 20a | Compact the architect session **before a resume that will miss the provider prompt cache** (TTL expired / model switched), so an uncached resume does not re-pay full history |
+-| 20b | Keep the prompt cache **warm while the architect is on standby** between turns, when cheaper than expected uncached resume; leverage omp mechanics |
+-| 20-cost | Decide defaults by **measured cost** (usage / cache-read tokens in records); each mechanism configurable, explicitly off where it does not pay |
+-| 20-plan | Re-evaluate v2's **schema-bound architect plan** against v1's schema-free telegraphic output + PM structuring (an expensive repair turn was observed) |
+-| 20c | Session launching must **never break the provider prompt cache**: additive sessions only, never rewrite a transcript, prompt prefixes byte-stable across turns (no timestamps/random/temp-path interpolation into the cached prefix), generated omp overlay byte-stable for the same config |
+-| 20d | Optional optimizations only after 20c holds: focused compaction/handoff summaries on resume, IRC escalation reply, restart — measured and configurable/off by default |
+-
+----
+-
+-## 2. Module map
+-
+-### 2.1 Layout and responsibilities
+-
+-| Area | Files | Responsibility relevant to 19/20 |
+-|---|---|---|
+-| CLI | `plugins/software-factory/src/cli/{dispatch,run,preflight,status,steer,init,lock}.ts`, `bin/factory.ts` | Only `init|preflight|status|steer|run`; `run` = preflight → lock → engine; `status` is one-task |
+-| Engine | `src/core/engine.ts` (835 lines) | `runTask` main loop, `runChildTask` (epic in-process), start-up repair, simple path, task worktree bootstrap, epic wiring |
+-| Iteration/waves | `src/core/flows/iteration.ts` (3978 lines) | plan → review → PM → waves → wave-end merges → close-up → wave report; architect session id threading; consults/redrives |
+-| Item machine | `src/core/flows/item-machine.ts` (1113 lines) | per-item step sequence, fix rounds, consults, terminal states |
+-| Merge path | `src/core/flows/merge-path.ts` (422 lines) | per-item merge under a parent-keyed merge lock; conflict → `integrate`; gates/verify; attempt ledger |
+-| Consults | `src/core/flows/consults.ts` | architect item/non-item/concern consults (decision artifact), resume architect session |
+-| Epic propagation | `src/core/flows/epic-propagation.ts` | child concerns/remarkables/questions pushed to parent store/mailbox (`q-epic-*`) |
+-| Step runner | `src/core/flows/step-runner.ts` (1437 lines) | single agent turn: prompt, session reuse, record commit, checks, session-loss rehydration, transient retries |
+-| Git | `src/core/git/{worktrees,naming,merge,commit,repair,status,repo,exec,cleanliness,diff}.ts` | engine-managed worktrees, branch naming, merges, commits, HEAD guard, repair |
+-| Derive | `src/core/derive/{task,item,wave}.ts` | derived state from committed records + git (idempotent, restart-safe) |
+-| Records | `src/core/records/*` | YAML IO, step records, schema cache, repair, citations |
+-| Checks/gates | `src/core/checks/{gates,runner,junit,types}.ts` | deterministic gates, target-green/red, baseline ratchet |
+-| Config | `src/core/config/{loader,merge,validate,roles}.ts`, `config/*.yaml`, `config/schemas/*.json` | layered pipeline config, role resolution, structural validation |
+-| Harness | `src/harness/types.ts`, `src/harness/omp/{harness,overlay,ndjson,classify}.ts`, `src/harness/fake/*` | one omp process per turn; NDJSON parse; overlay; fake harness for tests |
+-| Prompts/agents | `agents/**`, `src/core/{prompts,prompt-vars,brief}.ts` | agent definitions, step fragments, prompt vars, architect brief |
+-| Docs | `docs/{ARCHITECTURE,IMPLEMENTATION,OMP_ADAPTER,FIRE_TEST}.md`, `docs/spikes/*.md` | build contract, current-state audit, omp adapter spec, prior omp spikes |
+-
+-### 2.2 Execution topology today (relevant to all of item 19)
+-
+-1. `factory run <task>` resolves the slug, copies an INTENT path into `{orch}/{task}/INTENT.md` in the **main checkout** if needed, runs preflight, acquires a **per-task** run lock, builds `OmpHarness` and `Repo`, then calls `runTask` (`src/cli/run.ts:27-135`).
+-2. `runTask` creates the task worktree on `topic/{task}` from main HEAD (INTENT committed there), repairs stray dirt, repairs item worktrees, marks interrupted records, reconciles concerns, then runs ingest/triage/infra/context-pack (`src/core/engine.ts:236-340`).
+-3. Each wave runs items concurrently up to `limits.maxParallelItems`; each item gets a child worktree (`{worktreeRoot}/topic_{task}--{item}`) and is ticked by `tickItemMachine`; epic items call `runTaskChild` **in-process** (`src/core/flows/iteration.ts:2432-2480`).
+-4. Wave end merges ready items serially through `mergeItem` under `repo.mergeLocks(parentBranch)`; on failure the engine consults the architect and re-drives, bounded by `merge-attempts.yaml` (`src/core/flows/iteration.ts:2706-2800`, `src/core/flows/merge-path.ts:131-170`).
+-5. Epic child task = child task dir under `{parentTaskDir}/{epic}`, its own iterations/waves on branch `topic/{parent}--{epic}`, then a `child-closeup.yaml` on the parent and the epic branch merged like any item (`src/core/engine.ts:123-226`).
+-6. Every agent turn is a separate omp process launched with `--cwd <worktree>`, `--config <overlay>`, `--session-dir <runtime>/sessions`, optional `--resume <id>`, `--system-prompt <file>`, `-p @<prompt-file>` (`src/harness/omp/harness.ts:356-410`).
+-
+----
+-
+-## 3. Key interfaces & signatures
+-
+-### Harness contract (`src/harness/types.ts:24-55`)
+-```ts
+-export interface Harness {
+-  run(l: AgentRun): Promise<AgentOutcome>;          // one turn (fresh or resumed)
+-  validateTools?(tools: string[]): Promise<string[]>;
+-  complete(c: { role; models; system; prompt; schema; timeoutSec?; timeoutMs?; onModelFallback? }): Promise<unknown>;
+-}
+-export interface AgentRun {
+-  agent; definition; prompt; role; models; tools;
+-  cwd: string;                 // worktree — engine-created today
+-  outputSchema; label;
+-  session: { resume?: string; keep: boolean };
+-  timeoutSec?; onModelFallback?; onSession?; onUsage?;
+-}
+-```
+-`AgentOutcome` carries `sessionId`, `traceRef`, `usage`, `transcriptBytes`, `stdoutBytes`, `toolCallCount`, and failure flags `transient|sessionLost|launchError|timedOut` (`src/harness/types.ts:57-82`).
+-
+-### Engine entry points
+-- `runTask(deps: EngineDeps, task: string, opts?: { maxTicks?; maxIterations?; lockTakeoverEvent? }): Promise<RunResult>` — `src/core/engine.ts:236-247`; `RunResult = {status: done|blocked|failed|stopped, exitCode: 0|10|1, summary}` (`:61-65`).
+-- `runChildTask(deps, parent: {branch,path,taskDir}, epicSlug, opts?): Promise<RunResult>` — `src/core/engine.ts:123-226`.
+-- Engine deps: `{ harness, repo, project, pipelineFor(taskDir), prompts, clock?, log?, diskSpaceProbe? }` (`src/core/engine.ts:46-54`).
+-
+-### Worktrees (`src/core/git/worktrees.ts`)
+-- `ensureTaskWorktree(repo, task, {intentPath, orchestrationFolder}): {branch, path, created}` — first run checks cleanliness except INTENT, `git worktree add -b topic/{task} <wt> HEAD`, writes+commits INTENT; idempotent (`:47-119`).
+-- `ensureChildWorktree(repo, parent:{branch,path}, slug, opts?): {branch,path,created}` — idempotent, prunes stale registrations, reuses branch, `git worktree add -b <child> <wt> <fromRef>` (`:122-168`).
+-- `removeWorktree(repo, wtPath)` — removes worktree, **keeps branch** (`:170-189`).
+-- `resetScratch(repo, parent, slug)` — removes branch+worktree and recreates from parent tip (`:191-224`).
+-
+-### Branch naming (`src/core/git/naming.ts`)
+-- `taskBranch(task) => topic/{task}` (`:73-76`)
+-- `childBranch(parent, item) => parent--item`, max depth 2 (`:78-101`)
+-- `worktreePath(root, branch) => root/{branch with / → _}` (`:103-110`)
+-- `parseBranch` → `{task, items, depth}` (`:50-70`)
+-
+-### Merge path (`src/core/flows/merge-path.ts`)
+-- `mergeItem(params: MergeItemParams): Promise<MergeItemResult>` — `:131-422`; params include `task,item,parentBranch,taskWt,childWt,repo,harness,pipeline,project,prompts,taskDir,wave?,targetOverride?,turnsSemaphore?` (`:20-49`).
+-- `MergeItemResult = {ok, sha?, error?, conflictResolved?, mergeAttempt?}` (`:51-58`).
+-- `MAX_MERGE_ATTEMPTS_PER_WAVE = 2`; ledger at `items/<slug>/merge-attempts.yaml`; per-wave target override at `items/<slug>/merge-target.yaml` (`:60-128`).
+-
+-### CLI
+-- `dispatch(args): Promise<number>` switch over `init|preflight|status|steer|run` (`src/cli/dispatch.ts:110-176`).
+-- `runStatus({repoRoot, task})` — one task; resolves its single worktree (`src/cli/status.ts:26-80`).
+-- `acquireRunLock(repoRoot, task, opts?)` / `isRunLockFree(...)` / `resolveRuntimeDir(repoRoot, worktreeRoot?)` (`src/cli/lock.ts:21-170`).
+-
+-### Config types
+-- `ProjectConfig { orchestrationFolder, adrFolder?, worktreeRoot, scripts?, paths?, skillDirs? }` (`src/core/artifacts.ts:11-22`).
+-- `PipelineConfig { models, agents, checks?, hooks?, flows, limits, budget?, diversity?, harness?: string, humanInvolvement?, concerns?, reviewPolicy?, criteria?, contextPack?, tools?, prompts? }` (`src/core/artifacts.ts:117-160`).
+-- `TaskKind = simple|story|spike|epic|saga` (`src/core/artifacts.ts:166`).
+-- `StepUsage = {inputTokens?, outputTokens?, costUsd?}` (`src/core/artifacts.ts:545-549`), recorded in every step `meta.yaml` (`:551-568`).
+-
+-### Derived state
+-- `DerivedTaskState` (task, kind, status `active|blocked|done|failed`, iteration, currentWave, items/itemMap, waves, debt, budget/spend maps, runningSteps, concerns, openSteerQuestions, strandedItems, failureDetails) — `src/core/derive/task.ts:60-85`.
+-- `deriveTaskState({taskDir, task, parentBranch?, taskWt, pipeline?, project?})` — `src/core/derive/task.ts:140-147`.
+-- `DerivedItemState.status = pending|running|ready|merged|failed|blocked|superseded` — `src/core/derive/item.ts:41`.
+-
+----
+-
+-## 4. Relevant excerpts
+-
+-### 4.1 Engine-managed task worktree (the `isolation: engine` backend to preserve)
+-`plugins/software-factory/src/core/git/worktrees.ts:47-119`:
+-```ts
+-// first run: main checkout must be clean except INTENT
+-const dirty = findDirtyEntries(entries, { orchestrationFolder, currentIntentPath: relIntent });
+-if (dirty.length > 0) throw new Error(`Main checkout is dirty ...`);
+-...
+-await repo.writeLock.runExclusive(() =>
+-  git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, "HEAD"])
+-);
+-```
+-Idempotence and stale-registration pruning are explicit (`:14-44`, `:60-72`, `:126-168`). This is the code the spec's `isolation: engine` option must keep behind a config switch.
+-
+-### 4.2 Epic child task is in-process (the model to replace for sagas)
+-`plugins/software-factory/src/core/engine.ts:123-145`:
+-```ts
+-export async function runChildTask(deps, parent, epicSlug, opts?) {
+-  const parentBranch = parent.branch;
+-  const childBranchName = childBranch(parentBranch, epicSlug);
+-  const childWtInfo = await ensureChildWorktree(repo, parent, epicSlug);
+-  const childTaskDir = path.join(childWt, orchFolder, parentTaskSlug, epicSlug);
+-```
+-Child iterations run on `parentBranch = childBranchName` (`:166-182`); then concerns propagate, `child-closeup.yaml` is written on the parent, and the parent branch commits the record (`:186-212`). The child is launched from the wave loop only when `it.kind === "epic" && runTaskChild` (`src/core/flows/iteration.ts:2440-2450`), wired in `runTask` at `src/core/engine.ts:750-767`. `docs/IMPLEMENTATION.md:150-173` states the saga gap explicitly: *"NOT IMPLEMENTED: saga launches do not exist in code … no saga launcher/loop exists … defers this to the `omp-workspaces` fire-test goal."*
+-
+-### 4.3 Wave-end merge, gates, and the current "merger"
+-`plugins/software-factory/src/core/flows/merge-path.ts:176-245` — on parent→child conflict the engine runs an `integrate` step with:
+-```ts
+-stepId: "integrate", stepFragment: "steps/integrate",
+-agent: "developer", role: "workhorse",   // <-- no dedicated wave-end merger agent
+-```
+-Then `concludeMerge` commits the resolution (engine stages, agent may not run git writes). If the tree changed, gates and target-green run (`:246-380`); any failure returns `ok:false` with evidence. Success merges child into parent with `--no-ff`, removes the worktree (branch kept), runs `after:item.merge` hooks (`:381-422`).
+-
+-The wave loop calls this per ready item, then on failure calls `redriveMergeAfterConsult` which runs an architect consult and retries the merge, bounded by the attempt ledger: `src/core/flows/iteration.ts:2706-2800` (call), `:650-710` (helper). The consult input has assignment/priorAttempts/diff/feedback/debt/contextPack only — **no worktree or branch pointer**: `src/core/flows/consults.ts:110-136`; prompt fragment `agents/steps/architect-consult-item.md:1-40`. The status block the architect sees also lacks workspace/branch: `src/core/flows/iteration.ts:177-215`.
+-
+-### 4.4 Preflight — what is actually verified today
+-`plugins/software-factory/src/cli/preflight.ts:129-235` loads project config, warns on linter configs, checks first-run cleanliness (only when the task branch does not exist), loads/validates the layered pipeline, checks disk space (`limits.minFreeDiskMb`). `:250-290` resolves roles/aliases and checks agents reference declared roles. `:292-360` renders prompt fragments and compiles all schemas. `:364-394` validates omp:
+-```ts
+-execFileSync(ompBinary, ["--version"], ...);
+-writeOmpConfigOverlay(pipelineConfig, tempOverlay);
+-execFileSync(ompBinary, ["--config", tempOverlay, "--version"], ...);
+-```
+-with a hard-coded last-resort path `/home/slava/.bun/bin/omp` (`:365-369`). `:399-414` checks the per-task run lock. There is **no isolation round-trip, no cross-check of branches/worktrees against records, and no model-name resolution against omp** (only role alias resolution).
+-
+-### 4.5 CLI/status/lock — single-task today
+-`src/cli/status.ts:26-80` resolves one task dir (task worktree if present, else main), calls `deriveTaskState`, and prints worktree/config/budget/running steps/waves/items/questions/debt (`:59-170`). `src/cli/lock.ts:21-44` puts runtime state at `{worktreeRoot}/.factory-runtime`; locks at `{runtimeDir}/locks/{task}.lock` (`:45-55`); `isRunLockFree` and `acquireRunLock` implement same-host dead-PID takeover (`:57-246`). There is no task enumeration anywhere in `src/cli` (only `readdir` of config/schema dirs, `src/cli/preflight.ts:74,349`), so whole-tree status has no existing discovery layer.
+-
+-### 4.6 Harness launch and cache-relevant transport
+-`src/harness/omp/harness.ts:286-300` — system prompt path is deterministic per agent+session:
+-```ts
+-const sessionKey = (run.session?.resume ?? "fresh").replace(...);
+-const systemPromptPath = path.join(systemPromptsDir, `${sanitizedAgent}-${sessionKey}.md`);
+-fs.writeFileSync(systemPromptPath, agentBody, "utf8");
+-```
+-`src/harness/omp/harness.ts:311-316` — prompt file name **embeds timestamp + randomness on every turn**:
+-```ts
+-const promptPath = path.join(promptsDir, `prompt-${Date.now()}-${Math.random()...}.txt`);
+-```
+-Args (`:368-388`): `--cwd run.cwd --config overlay --mode json --model <@role> --session-dir <dir> [--resume id] --tools=... --system-prompt <file> -p @<promptFile>`. Spawn cwd is the worktree (`:400-410`). No isolation/worktree flag is passed.
+-
+-`src/core/flows/step-runner.ts:606-620` decides session reuse (`keep = sessionMode==="reuse"`, resume interrupted record or existing id); on `sessionLost` it retries once with a fresh session and the **full prompt**, not a rehydrated prefix (`:967-1000`); `PersistentAgent` does the same with an optional `rehydrate()` prefix (`src/core/sessions.ts:110-138`).
+-
+-### 4.7 Architect planning, brief, wave report
+-- Plan turn: fresh plan or reuse session; `buildArchitectBrief` is called for a fresh brief even on resume (`src/core/flows/iteration.ts:1155-1235`); plan step uses `sessionMode: "reuse"`, `existingSessionId: architectSessionId`, fragment `steps/architect-plan` (`:1223-1290`). A limits violation triggers one resumed repair turn on the same session (`:1299-1370`).
+-- Wave report resumes the architect, injects `plan/waveReport/debt/steering/contextPack/taskStatus`, and the report fragment decides continue/amend/end (`:3089-3180`).
+-- `buildArchitectBrief` = deterministic one-line skeleton + a `@simpler` relevance judge returning `{include:[ids]}`, fail-open to the full skeleton (`src/core/brief.ts:1-14`, `:340-420`). This is the existing **cheap handoff** mechanism that item 20a/20d can build on.
+-- Architect output is schema-bound: `agents/steps/architect-plan.md:20` ("yield the plan matching `plan.schema.json`"); `config/schemas/plan.schema.json:4-6` requires `iteration, milestones, itemOutlines`; PM then structures item edits from plan outlines (`agents/steps/pm-edits.md:1-25`, `src/core/plan/apply.ts:1-16`).
+-
+-### 4.8 Usage/cost parsing drops cache tokens
+-`src/harness/omp/ndjson.ts:84-98`:
+-```ts
+-const u = event.message.usage;
+-this.inputTokens += u.input || 0;
+-this.outputTokens += u.output || 0;
+-const costVal = u.cost?.total ?? ((u.cost?.input || 0) + (u.cost?.output || 0));
+-this.costUsd += costVal || 0;
+-```
+-`cacheRead`, `cacheWrite`, `totalTokens`, and cost sub-fields are ignored; `src/harness/omp/ndjson.ts:170-178` emits only `{inputTokens, outputTokens, costUsd}`; `src/core/artifacts.ts:545-549` and `src/core/budget.ts:34-48` sum only those three. The raw omp NDJSON **does** carry them: fixtures `test/fixtures/omp/turn-fallback.ndjson:7` (`"cacheRead":0,"cacheWrite":0,...cost.cacheRead`), and the prior spike documents `usage.cacheRead` as available (`docs/spikes/omp-2-cli-adapter.md:100-104`). So 20-cost cannot be implemented without extending `Usage`/`StepUsage` and the parser (and updating records/budget tests).
+-
+-### 4.9 Commit content is engine-authored
+-`src/core/git/commit.ts:9-30` — `commitAll(repo, wt, message, {allowEmpty?, paths?})`; `paths` is the available scope mechanism. Call sites invent messages: step records `factory(...): <step> aN [started|error|rejected|session]` (`src/core/flows/step-runner.ts:697-760`, `:572`, `:807`, `:1400-1410`), plan edits `factory: apply plan edits iteration N` (`src/core/flows/iteration.ts:1914,1944`), epic close-up `factory: record epic <slug> child status ...` (`src/core/engine.ts:209`), merge `factory: merge item <slug>` (`src/core/flows/merge-path.ts:384-390`). Agent output schemas carry `summary` (`config/schemas/review.schema.json:6-12`, `config/schemas/developer-output.schema.json:6-14`) but no commit message/scope field.
+-
+-### 4.10 Concern propagation and escalation vocabulary
+-`epic-propagation.ts:20-33` documents "Epic-to-saga concern push": open/routed child concerns + open remarkables are condensed, questions with `blocks` are forwarded to the parent mailbox as `q-epic-<epic>-<id>` (`:116`). The actual parent is the enclosing task; there is no distinct saga architect. `buildTaskStatusBlock` lists items/waves/merged/blocked/failed and both task/root question dirs (`src/core/flows/iteration.ts:195-220`).
+-
+-### 4.11 Config surface where `isolation` must land
+-- `config/schemas/pipeline.schema.json:6-7` requires `models, agents, flows, limits`; `:208-210` declares `harness` as a **string**; `:305` sets root `additionalProperties: false`.
+-- `config/schemas/project.schema.json:52` is also `additionalProperties: false`.
+-- `config/pipeline.default.yaml`: models/roles `:40-104`, agents `:106-141`, checks/hooks `:172-195`, flows `:241-330`, limits `:342-390`, harness `:406`, humanInvolvement `:449`.
+-- Loader merge/validate: `src/core/config/loader.ts:68-150` (defaults → project → task → overrides, AJV, structural).
+-So adding `isolation` (or changing `harness` to an object) requires schema + `PipelineConfig` type + default YAML + overlay generation, or it fails validation at load.
+-
+-### 4.12 Existing omp cache/compaction knobs are config-only
+-`src/harness/omp/overlay.ts:26-100` emits only `modelRoles`, `retry.*`, `eval.autoBackground`, `title.generator`, `checkpoint.enabled`, `advisor`, `bash.gitGuard/allowCompoundCommands`, `mnemopi.*`, `update.auto`. It emits **none** of the omp keys discovered in §5 (`isolation.backend`, `task.isolation.*`, `worktree.*`, `compaction.*`, `providers.cacheWarming/cacheRetention`). Overlay is regenerated per turn from the effective pipeline (`src/harness/omp/harness.ts:222-240`).
+-
+----
+-
+-## 5. omp isolation mechanics — evidence log
+-
+-### 5.1 Prior research (repository docs)
+-- `docs/spikes/omp-1-topology.md:189-215` — empirical comparison:
+-  - omp `isolated: true` hardcodes branch `omp/task/<agentId>`, has no `cwd`, needs `apply:false` (not `merge:false`) to avoid applying to parent, and **"if the subagent fails or rejects (`exitCode !== 0`), `commitToBranch` is completely skipped; no branch commits are captured on failure/rejection, and the temporary isolation worktree is deleted"** (`:196-201`).
+-  - Engine-created `git worktree add -b topic/x/y` + `omp --cwd <wt>` keeps **all** files/commits regardless of exit status (`:205-213`).
+-  - Recommendation: hybrid external Bun CLI + omp headless adapter with engine-managed worktrees (`:347-395`).
+-- `docs/spikes/omp-2-cli-adapter.md:114-158` — `--session-dir` + `--resume` append to the same transcript; cwd persists in the session header; model switch on resume is allowed. `:160-218` — overlay with `modelRoles`, fallback chains, unattended switches; `:245-270` — four concurrent omp processes in four worktrees, no lock contention, ~0.8–1.2 s startup, SIGTERM 143 with partial session flush.
+-- `docs/OMP_ADAPTER.md:164-172` — cache-safety audit claim: additive resumes, byte-stable system prompt content, "only transport filenames embed timestamps", deterministic overlay. **It does not test omp's cache keying; it flags `--system-prompt` path-keying as unknown.**
+-
+-### 5.2 Fresh read-only probes on the installed omp 18.18.5
+-These are execution probes (no repository edits, no omp config writes):
+-
+-| Probe | Result |
+-|---|---|
+-| `omp --version` | `omp/18.18.5` (README requires v18.17.0+: `plugins/software-factory/README.md:14-18`) |
+-| `omp config get isolation.backend --json` | `{"value":"rcopy","type":"enum","description":"Backend used for subagent isolation and worktree cloning"}` — **no enum values exposed** |
+-| `omp config get task.isolation.*` | `enabled=true`, `apply=true` ("apply successful isolated task changes to parent"), `merge="branch"` (patch apply or branch merge), `commits="ai"` (generic or AI-generated commit messages) |
+-| `omp config get worktree.*` | `base` unset → `~/.omp/wt`; `onStart=off`; `onExit=remove`; `clone=true` (copy-on-write clone so `node_modules`/`target` carry over); `cleanSource=false`; `session.worktreeScope=repo` |
+-| `omp worktree --help` | `omp worktree [list|clear|add] [PATH] [COMMIT]` with `-b/-B/-C`, `--dry-run`, `--all`, `--json`. `clear --dry-run` prints what would be removed; `add -b feature ../path` creates a branch+worktree |
+-| `omp worktree list --json` | Entries carry `{path, kind:"task-isolation", orphanReason:"task-isolation leftover (no live task owns it)"}` — omp already has orphan classification |
+-| `omp --config <overlay with bogus keys including isolation.backend: definitely-not-a-backend> --version` | Prints `18.18.5`, **exit 0** — this probe validates nothing about overlay keys/values |
+-| `omp --config <overlay with title.generator:none, compaction.idleEnabled:true> config get title.generator` / `compaction.idleEnabled` | `tiny` / `false` — `omp config get` reports **persisted** config and ignores `--config`; it cannot be used to validate an overlay |
+-| `omp config list --json` (filtered) | `compaction.enabled=true`, `compaction.asyncEnabled=true`, `compaction.idleEnabled=false`, `compaction.idleThresholdTokens=200000`, `compaction.idleTimeoutSeconds=300` ("with a 1-hour prompt cache, compaction instead runs just before the cache expires"), `compaction.keepRecentTokens=20000`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.handoffSaveToDisk=true`, `compaction.dropUseless=true` ("cache-aware"), `compaction.supersedeReads=true` ("cache-aware"), `providers.cacheRetention=short`, `providers.cacheWarming=streaming` ("Re-send the last request with a one-token output budget shortly before its prompt-cache entry expires"), `display.cacheMissMarker=true` |
+-| `omp models --help` | Supports `-e/--extension` and `--config` when listing models — the plausible seam for a scripted provider extension |
+-| `omp --help` | No `--isolated`/isolation flag; isolation is config-driven. `--cwd`, `--session-dir`, `--resume`, `--config`, `--system-prompt`, `--no-session`, `--no-tools`, `--tools`, `--extension` exist |
+-
+-### 5.3 What this proves / does not prove
+-
+-**Proven:**
+-- omp exposes a configurable isolation backend (`isolation.backend`, default `rcopy`) and per-task isolation controls; the phrase in its own description ties the backend to *"subagent isolation and worktree cloning"*, i.e. it governs omp-managed worktrees as well as subagent tasks.
+-- omp has first-class worktree lifecycle commands (`worktree add|list|clear --dry-run`) with ownership/orphan metadata — a ready-made primitive for `cleanup`/`gc` of omp workspaces.
+-- omp exposes native compaction and prompt-cache-warming knobs, which item 20 can configure instead of building from scratch.
+-- `omp --config … --version` is not a config validator; `omp config get` cannot see an overlay.
+-
+-**Not proven (spike items):**
+-- The allowed values of `isolation.backend` and whether `rcopy`/others affect retention on failure; whether `omp worktree add` honors it exactly like subagent task isolation.
+-- Whether a **root** omp process launched with `--cwd <omp-created worktree>` can use `isolated: true` meaningfully (factory agents do not spawn subagents; prompts forbid it), i.e. which omp mechanism maps to "workspace isolation" for factory agents.
+-- Whether omp `--config` fully accepts these keys at runtime (no validation error ≠ applied; `config get` ignores overlays, so only a real turn can prove it).
+-- Whether omp prompt caching keys on content or on transport path (`--system-prompt <path>`, `-p @<timestamped-path>`), which determines item 20c.
+-- How to register a scripted mock provider (extension API shape, catalog registration, streaming NDJSON contract).
+-
+----
+-
+-## 6. Gap matrix — spec bullet vs current state
+-
+-| Spec | Current state (evidence) | Missing work | Likely touchpoints |
+-|---|---|---|---|
+-| 19.1 isolation backend default + `isolation: omp|engine` + spike | Engine-only worktrees; no isolation key in schema/types/overlay; harness passes no isolation flags (`src/core/git/worktrees.ts:47-224`, `src/harness/omp/harness.ts:368-388`, `config/schemas/pipeline.schema.json:208,305`) | Spike + config field + backend abstraction (create/remove/retain workspace) + overlay keys + preflight compatibility | `src/core/engine.ts:266-272`, `src/core/flows/iteration.ts:2455-2470`, `src/core/git/worktrees.ts`, new workspace module, `config/pipeline.default.yaml`, `config/schemas/pipeline.schema.json`, `src/harness/omp/overlay.ts` |
+-| 19.2 preflight | Version + inert overlay check, role aliases, prompts/schemas, disk, per-task lock (`src/cli/preflight.ts:129-414`) | Isolation round-trip; real model/role resolvability; branches/worktrees-vs-records consistency; harness binaries beyond omp; remove hard-coded omp fallback | `src/cli/preflight.ts`, `src/core/git/{status,worktrees}.ts`, `src/core/config/roles.ts` |
+-| 19.3 whole-tree status / cleanup / gc + lock refusal | `status` one task; no `cleanup`/`gc` commands; per-task locks; runtime dirs `sessions/`, `prompts/`, `system-prompts/` never purged (only `tmp/` is: `src/core/runtime-tmp.ts:16-45`); orphan detection helpers partially exist (`parseWorktreeList` `src/core/git/status.ts:64-71`, `removeWorktree`) | Task/workspace index derived from records+git; saga/epic parent links; active-agent workspace+branch; cleanup semantics; gc orphan worktrees/branches/runtime/locks, dry-run default; lock guard across the whole tree | `src/cli/dispatch.ts:110-176`, `src/cli/status.ts`, `src/cli/lock.ts:21-95`, new `src/cli/{cleanup,gc}.ts`, `src/core/derive/task.ts`, `src/core/git/status.ts` |
+-| 19.4 commits from agent output | All messages engine-authored; `commitAll` accepts message + `paths` scope only (`src/core/git/commit.ts:9-30`; call sites in §4.9) | Commit message/scope fields in output schemas + prompts; thread them to step/merge commits; fallback rule (engine may only use agent-provided or mechanical text) | `config/schemas/review.schema.json`, `config/schemas/developer-output.schema.json`, `agents/steps/review.md`/`develop.md`, `src/core/flows/step-runner.ts:714-760`, `src/core/flows/merge-path.ts:381-422` |
+-| 19.5 wave-end merge + workhorse merger + escalation pointers | Merge already runs at wave end with deterministic gates; conflict handled by `developer` step `integrate`; failure → architect consult with evidence but no status/worktree/branch pointer; attempts bounded 2/wave (`src/core/flows/merge-path.ts:176-422`, `src/core/flows/iteration.ts:2706-2800,650-710`, `src/core/flows/consults.ts:110-136`) | Dedicated workhorse-class wave-end merger agent (trivial conflicts only) + prompt fragment; escalation payload with one-command status pointer and worktree+branch; contract tests | new `agents/wave-merger.md` + step fragment, `src/core/flows/merge-path.ts`, `src/core/flows/consults.ts`, `agents/steps/architect-consult-item.md`, `src/core/flows/iteration.ts:177-215` |
+-| 19.6 saga independent launches, parallel epics, escalation split | `saga` only a `TaskKind` (`src/core/artifacts.ts:166`, `config/schemas/triage.schema.json`); epics in-process (`src/core/engine.ts:123-226`); epic INTENT written under the **parent task dir on the parent branch** (`src/core/plan/apply.ts:9-16`), so `factory run <epic>` cannot resolve it from main; `q-epic-*` goes to the enclosing task, not a saga architect (`src/core/flows/epic-propagation.ts:20-33,116`) | Saga launcher (spawn independent `factory run` per epic in its own workspace), parent/saga identity+links, per-workspace locks, saga wave-end merge/escalation to saga architect, concern funnel upward | new saga/workspace orchestration module, `src/cli/run.ts:55-135`, `src/cli/dispatch.ts`, `src/core/flows/epic-propagation.ts`, `src/core/git/naming.ts:73-101` |
+-| 19.7 docs per use case | Existing ARCHITECTURE/IMPLEMENTATION/OMP_ADAPTER/FIRE_TEST; no use-case doc; docs sentinel test convention exists (`test/docs-concerns.test.ts:1-50`) | New/updated docs for single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc + sentinel test | `plugins/software-factory/docs/*`, `test/docs-*.test.ts` |
+-| 19.8 no-model e2e through real omp | Only `FakeHarness` engine tests + one live smoke gated by `FACTORY_LIVE_OMP=1` (`test/harness/smoke-live.test.ts:9-12`); harness can take an alternative `ompBinary` (`src/harness/omp/types.ts:4-15`, precedent `test/engine/model-fallback.test.ts:44-53`) | Scripted mock model provider usable by real omp; e2e scenarios (isolation, merges/conflicts/escalations, saga/epic launches, restart, gc) without paid models | new harness test fixture/provider extension, `test/e2e/**`, `OmpHarness` options, possibly `src/harness/omp/overlay.ts` |
+-| 19.9 repo rules hydration | No `AGENTS.md`/rules handling anywhere in `src/` (grep); `PROMPT_VAR_DESCRIPTIONS`/`KNOWN_VARS` have no repo-rules var (`src/core/prompt-vars.ts:9-60`) | Deterministic repo-rule resolution from target repo; inject into architect + developer/qa/reviewer prompts across items/epics; verify per role | `src/core/prompts.ts`, `src/core/prompt-vars.ts`, `src/core/flows/step-runner.ts`, `agents/*.md`, preflight render checks |
+-| 20a compact before uncached resume | No cache awareness; resume threads a session id; on loss it starts fresh with full prompt (`src/core/flows/step-runner.ts:967-1000`); a deterministic brief already exists (`src/core/brief.ts:1-14,340-420`); omp `compaction.*` exists but is unused | Detect cold-cache resume (TTL/model switch), compact or switch to fresh+hydrated brief, measure cost delta | `src/harness/omp/harness.ts:286-351`, `src/core/flows/step-runner.ts:606-620`, `src/core/brief.ts`, `src/harness/omp/overlay.ts` |
+-| 20b warm cache on standby | Architect process exits every turn; no standby; `providers.cacheWarming` unused | Decide mechanism (long-lived/keepalive process vs omp warming config), measure vs uncached resume, config gate | `src/harness/omp/harness.ts`, `src/core/flows/iteration.ts` (architect turns), overlay |
+-| 20c cache-coherence audit | Additive `--resume`; deterministic system-prompt path; **timestamp+random prompt path every turn** (`harness.ts:311-316`); overlay regenerated per turn from config (`harness.ts:222-240`); no byte-stability test | Audit omp cache keying; make transport paths stable or prove content keying; add byte-stability tests for overlay/system prompt/prompts across turns | `src/harness/omp/harness.ts`, `src/harness/omp/overlay.ts`, `test/harness/*` |
+-| 20d optional optimizations | None | Handoff/compaction on resume, IRC escalation reply, restart | `src/core/brief.ts`, `src/core/flows/step-runner.ts`, overlay |
+-| 20-cost measurement | `Usage`/`StepUsage` only input/output/cost; parser drops `cacheRead/cacheWrite/cost.cacheRead` (`ndjson.ts:84-98,170-178`, `artifacts.ts:545-549`, `budget.ts:34-48`) | Add cache token fields end-to-end + records/derive/status/budget aggregation; use for defaults | `src/harness/types.ts:7-11`, `src/harness/omp/ndjson.ts`, `src/core/artifacts.ts:545-549`, `src/core/budget.ts`, `src/core/derive/task.ts`, `config/schemas/state.schema.json` |
+-| 20-plan schema-free architect vs PM structuring | Plan is schema-bound (`config/schemas/plan.schema.json`, `agents/steps/architect-plan.md:20`); PM already structures outlines into scheduled items (`agents/steps/pm-edits.md:1-25`) | Re-evaluate from measured plan-repair turns; possibly telegraphic plan + PM structuring of plan/edits | `agents/steps/architect-plan.md`, `agents/steps/pm-edits.md`, `src/core/plan/*`, `config/schemas/*` |
+-
+----
+-
+-## 7. Existing tests & conventions
+-
+-**Runner and gates**
+-- `bun test` (Bun test runner, no config file), `bun run typecheck` (`tsc --noEmit`) — `plugins/software-factory/package.json:11-13`; strict TS incl. `noUncheckedIndexedAccess` (`plugins/software-factory/tsconfig.json`). The repo's own gate hints are in `.factory/project.yaml` `scripts.setup/typecheck/test`.
+-- Tests live under `test/**/*.test.ts` and import source directly; no mocks for git or filesystem.
+-
+-**Core helpers**
+-- `createTmpRepo()` builds a real temporary git repo, tracks worktrees, commits with fixed identity, and cleans up on exit (`test/helpers/tmp-repo.ts:1-90`).
+-- `FakeHarness` scripts outcomes **by exact `AgentRun.label`**, records all calls, models sessions and `sessionLost` (`src/harness/fake/fake-harness.ts:35-125`). This is how all engine-level behavior tests avoid models.
+-- Worktree behavior is tested against real git: `test/git/worktrees.test.ts:1-60` (first-run cleanliness, idempotence, child worktrees, removal preserving branch).
+-
+-**Behavior test patterns relevant to 19**
+-- Epic execution end-to-end with FakeHarness, asserting branch existence, child-closeup, derived item status `merged`, and merged file content: `test/engine/epic-child-task.test.ts:78-218`.
+-- Merge conflict → integrate resolution: `test/engine/merge-conflict.test.ts:1-50`; merge gate evidence/attempt ledger: `test/engine/merge-gate-evidence.test.ts`; redrive/stranded: `test/engine/merge-redrive-stranded.test.ts`.
+-- Crash/restart record repair: `test/engine/crash-restart.test.ts:1-50`; derived state: `test/engine/derive-gaps.test.ts`.
+-- CLI output/exit conventions: `test/cli/cli.test.ts:1-70` (arg parsing, lock lifecycle), `test/cli/status-concerns.test.ts:1-50` (capture `console.log/error` into a string, assert sections).
+-- Docs closure sentinel: `test/docs-concerns.test.ts:1-50` — asserts needles inside named doc sections/YAML commentary blocks so docs edits are test-enforced. Reuse this for the 19.7 use-case docs.
+-- Live omp tests are opt-in only: `FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts` (`test/harness/smoke-live.test.ts:9-12`).
+-- Process-level harness tests substitute a mock `ompBinary` shell script (`test/engine/model-fallback.test.ts:44-53`, `test/harness/omp-harness.test.ts:84-90,286-311`) and assert classification/timeout/session behavior. For 19.8 this is the precedent for a scripted provider, but the spec requires going through **real omp**, so a mock *binary* alone will not satisfy it.
+-
+-**Conventions to follow**
+-- Behavior tests only: assert committed records, `journal.ndjson` events, git graph/worktree state, CLI output — not private helpers.
+-- Every engine decision is journaled (`appendJournal`) and records are committed before/after each step; new features should add journal events + record artifacts so restart/derive tests can prove idempotence.
+-- Schemas are draft-07 with `additionalProperties:false`; optional new fields are backward-compatible, required fields are not.
+-- Preflight validates every prompt fragment against `KNOWN_VARS` and renders with sample vars (`src/cli/preflight.ts:292-360`), so new prompt variables/fragments must be registered in `src/core/prompt-vars.ts`.
+-
+----
+-
+-## 8. Open questions & spike outlines (for the architect)
+-
+-### Isolation semantics (must settle before 19.1 design)
+-1. **Isolation backend contract.** `isolation.backend` is an enum defaulting to `rcopy`; what are the values, and does it control (a) subagent task isolation only, (b) `omp worktree add` cloning, or both? Probe candidate: throwaway profile (`--profile`) + `config set`, then a temp repo `omp worktree add -b topic/probe <tmp> HEAD`, inspect branch/commits, then `omp worktree clear --dry-run`.
+-2. **Retention on failure.** Prior spike proves `isolated:true` discards branch commits on non-zero exit (`docs/spikes/omp-1-topology.md:201`). Does an omp-managed worktree via `omp worktree add` + `omp --cwd` retain everything like engine worktrees? Test with a failing/aborted turn.
+-3. **Root-process isolation.** Factory agents are top-level omp processes, not omp subagents. Which omp mechanism is the "workspace" for such a process — `omp worktree add` + `--cwd`, `--add-dir`, or `task.isolation`? Document the mapping and the fallback to `isolation: engine`.
+-4. **Merge-back ownership.** omp has `task.isolation.{apply,merge,commits}`; the spec still requires deterministic CI gates and wave-end merger. Decide whether omp ever performs the merge (then gates) or only creates workspaces and the engine keeps merging. Evidence needed: can omp's `commits: ai` produce a usable message from structured output, or is it generic?
+-5. **Config validation.** `omp --config ... --version` accepts bogus keys (probe), and `omp config get` ignores overlays. A real preflight round-trip must actually launch omp. Define the cheapest safe probe (e.g. `omp -p --no-session --tools= --model @role "reply OK"` in a temp clone, or an `omp worktree add`-based round-trip).
+-6. **Model/role resolvability.** `omp models ls --json` (with `-e`) may enumerate catalogs; overlays define `modelRoles`. Determine whether any CLI validates `--model @role` + overlay without a paid turn; otherwise preflight can only resolve roles structurally (current behavior) plus a first-turn fallback.
+-
+-### Lifecycle (19.3)
+-7. **Index source.** Derive the whole tree on demand from `{orch}/*/INTENT.md`, `items/*/child-closeup.yaml`, `journal.ndjson`, task dirs and `git worktree list --porcelain` (`parseWorktreeList`, `src/core/git/status.ts:64-71`), or persist a registry file? The spec says "derived from records + git" and "idempotent", which favors on-demand derivation; a registry risks drift.
+-8. **Parent links.** Epic child dirs are nested under the parent task dir but live on the parent branch; saga→epic links are only implicit in `plan.epics` (`config/schemas/plan.schema.json:85-95`) and `child-closeup.yaml`. Define the link record used by status/gc/escalation.
+-9. **Cleanup vs gc semantics.** `cleanup` = finished (merged/done) workspaces; `gc` = orphaned worktrees/branches/runtime files/stale locks, dry-run default. Which branches are deletable (merged only? superseded? failed after N days?), and how to treat omp-managed worktrees (`kind: task-isolation`, `orphanReason`) vs engine worktrees. `removeWorktree` keeps branches (`worktrees.ts:170-189`); `omp worktree clear` removes omp-owned ones.
+-10. **Lock refusal across a tree.** Locks are per task (`src/cli/lock.ts:45-55`). Whole-tree commands must refuse if *any* run lock is live; parallel epics need per-workspace locks plus a saga-level coordination lock (merge/status writes). Dead-PID takeover exists only per file (`:57-95,109-246`).
+-
+-### Saga (19.6)
+-11. **Launch mechanics.** Each epic = independent `factory run` in its own workspace. Today `factory run <epic>` cannot resolve an epic INTENT because `resolveTaskSlug`/`runFactory` copy INTENT from the **main checkout** into `{repoRoot}/{orch}/{epic}/INTENT.md` (`src/cli/run.ts:27-75`), while epic INTENT lives under the parent task dir on the parent branch (`src/core/plan/apply.ts:9-16`). Decide: new `factory run --parent <task> --workspace <path> <epic>` or a saga launcher that spawns children with explicit INTENT path/branch.
+-12. **Process orchestration.** Who supervises child factories (exit codes 0/10/1), restarts, and parallelism? How are child stdout/journal/status surfaced to the saga status command? How do saga wave-end merges happen — the saga architect merges epic branches onto a saga branch, or epics merge directly to main?
+-13. **Escalation split.** Inside an epic, merge escalation must reach the epic architect (currently parent task architect for all items, `src/core/flows/iteration.ts:650-710`); at saga wave end it must reach the saga architect. Define the architect-session/ownership map per workspace and how consults are routed.
+-
+-### Cache/compaction (item 20)
+-14. **Cache-key audit.** Determine whether omp caches on message content or transport path. Concrete suspicion: the per-turn prompt file path `prompt-<ts>-<rand>.txt` (`harness.ts:311-316`) and regenerated overlay (`harness.ts:222-240`). Add a test that renders the same prompt twice and compares system-prompt bytes, overlay bytes, and argv (the only unstable part should be the prompt filename; then verify omp behavior with a live probe using `providers.cacheRetention`/`display.cacheMissMarker`).
+-15. **Compaction mechanism.** omp auto-compacts inside a session (`compaction.*`); there is no CLI `compact` command in `omp --help`. To "compact before an uncached resume", decide between (a) relying on omp auto-compaction triggered before resume, (b) starting a fresh architect session with the existing deterministic brief (`buildArchitectBrief`) and recording it as the handoff, (c) a long-lived architect process. Measure cost with cacheRead/cacheWrite tokens.
+-16. **Warm-on-standby.** The architect process exits after every turn; `providers.cacheWarming=streaming` only helps a live/last request. Decide whether to keep a standby process (cost) or treat warming as off by default; the spec allows "explicitly off where it does not pay".
+-17. **Measurement plumbing.** Add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, and cost sub-fields to `Usage`/`StepUsage`/records/derived status before choosing defaults; update `budget.ts` aggregation and `state.schema.json` if surfaced.
+-18. **Schema-free plan.** Count plan-repair turns and their cost from records (`architect-plan-*` attempts, repair records, usage) before changing the contract. The PM already structures item edits from plan outlines; the open question is whether the architect should emit telegraphic markdown for the plan itself and let PM produce both `plan` and `edits` schemas.
+-
+-### Repo rules (19.9)
+-19. **Rule sources and precedence.** Which files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.omp/rules`?), from repo root and subdirs, and how they combine with factory agent definitions. Confirm whether omp already injects context files into a root process launched with `--system-prompt` (its config exposes `contextFiles.extra` and `--no-context-files`), to avoid double injection. Verify per role with a probe agent that must quote a sentinel rule.
+-
+-### No-model e2e (19.8)
+-20. **Mock provider seam.** omp supports `--extension` and `omp models -e`, so a scripted provider extension is the most likely route; alternatively an OpenAI-compatible local endpoint registered via overlay if omp supports custom provider definitions. Define the canned scenario format (turn-by-turn NDJSON: text, tool calls, yield), and prove the real omp binary runs a full factory flow against it with zero paid calls.
+-
+----
+-
+-## 9. Verification commands (baseline)
+-
+-```bash
+-cd plugins/software-factory
+-bun test                       # full behavior suite
+-bun run typecheck              # tsc --noEmit
+-FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts   # opt-in real omp smoke (paid models)
+-
+-# omp mechanics probes (read-only)
+-omp --version
+-omp config list --json | jq 'to_entries[] | select(.key|test("isolation|worktree|compaction|cache"))'
+-omp worktree list --json
+-omp worktree clear --dry-run   # dry-run only
+-```
+-
+----
+-
+-## 10. Notes for the architect
+-
+-- **Do not re-derive** the following: merge is already wave-end per item; gates/target-green already run deterministically on tree change; conflict handling exists but uses `developer/integrate`; epics are in-process and merge like items; `factory status` is task-scoped; commit messages are engine-invented; usage lacks cache tokens; omp exposes native compaction/warming/worktree-lifecycle config.
+-- **Suggested epic split** (sizing only; the architect decides): (A) isolation backend + workspace abstraction + preflight round-trip + whole-tree status/cleanup/gc; (B) agent-authored commits + wave-end merger agent + escalation pointers; (C) saga independent launches + parallel epics + escalation/funnel routing; (D) cache/compaction measurement & policy; (E) no-model omp e2e harness + repo-rules hydration + use-case docs. A/B share workspace primitives; C depends on A; D is independent but benefits from A's workspace cleanup; E spans all and should land last per epic with a thin slice early (mock provider spike) to de-risk.
+-- **Start with a fact-finder spike item** per the intent: it must answer questions 1–6 (§8) with throwaway temp repos and a throwaway omp profile, and produce a decision record on the omp↔engine isolation mapping before any engine code changes.
+-`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
+-- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
+-  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
+-  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
+-  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
+-  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
+-  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
+-- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
+-
+-## Item
+-merge-setup-fix
+-
+-## Assignment
+-{"slug":"merge-setup-fix","kind":"dev","title":"Run infra.setup in merge child worktree before gates","assignment":"Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.","outlineRef":"merge-setup-fix","milestone":"m1-omp-de-risk","wave":2,"citations":["plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem","gates.ts:332-335 runInfraSetup temp-worktree path","runner.ts:796-810 runInfraSetup temp-worktree path"]}
+-
+-## Prior Attempts & Failures
+-2 attempts recorded for develop (all rejected); next would be 3 > max 2
+-
+-Failing checks:
+-[gates] Gate regressions: test
+-
+-## Current Diff
+-.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml +0/-29
+-.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml +0/-24
+-.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml +0/-21
+-.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml +0/-18
+-.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml +0/-20
+-.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml +0/-18
+-.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml +0/-21
+-.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml +0/-25
+-.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml +0/-21
+-.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml +0/-20
+-.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml +0/-19
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/checks.yaml +31/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/input.md +91/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/meta.yaml +20/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/output.yaml +70/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/input.md +99/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/meta.yaml +22/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/checks.yaml +253/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/input.md +104/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/meta.yaml +20/-0
+-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/output.yaml +39/-0
+-.factory/tasks/omp-workspaces/journal.ndjson +0/-50
+-.factory/tasks/omp-workspaces/state.yaml +20/-62
+-plugins/software-factory/src/core/flows/merge-path.ts +78/-5
+-plugins/software-factory/test/engine/merge-setup.test.ts +250/-0
+-
+-## Review Feedback
+-Failing check: gates
+-
+-Message: Gate regressions: test
+-
+-Detail:
+- task \"competing-takeover-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\n[factory lock] Stale run lock for task \"journal-worktree-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\nkilled 1 dangling process\n\ntest/engine/stranded-wave.test.ts:\n(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]\n  ^ this test timed out after 5000ms.\n\n# Unhandled error between tests\n-------------------------------\n250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);\n251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);\n252 |     const journal = await readJournal(deployedTaskDir);\n253 |     // No done-ness reuse shadowed either consult: both decisions recorded.\n254 |     expect(journal.filter((e) => e.type === \"step_reused\" && String((e as { step?: string }).step ?? \"\").startsWith(\"consult-loop-1\")).length).toBe(0);\n255 |     expect(journal.filter((e) => e.type === \"decision_made\" && (e as { item?: string }).item === \"loop-1\").length).toBe(2);\n                                                                                                                         ^\nerror: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 0\n\n      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)\n-------------------------------\n\n\n 667 pass\n 2 skip\n 2 fail\n 1 error\n 3763 expect() calls\nRan 671 tests across 102 files. [253.72s]\n[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]",
+-    "failingTests": [
+-      "Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir",
+-      "Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)"
+-    ]
+-  }
+-]
+-
+-Output tail:
+-7:37)
+-(fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir [37.70ms]
+-
+-test/cli/cli.test.ts:
+-[factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
+-[factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
+-[factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
+-killed 1 dangling process
+-
+-test/engine/stranded-wave.test.ts:
+-(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]
+-  ^ this test timed out after 5000ms.
+-
+-# Unhandled error between tests
+--------------------------------
+-250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+-251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
+-252 |     const journal = await readJournal(deployedTaskDir);
+-253 |     // No done-ness reuse shadowed either consult: both decisions recorded.
+-254 |     expect(journal.filter((e) => e.type === "step_reused" && String((e as { step?: string }).step ?? "").startsWith("consult-loop-1")).length).toBe(0);
+-255 |     expect(journal.filter((e) => e.type === "decision_made" && (e as { item?: string }).item === "loop-1").length).toBe(2);
+-                                                                                                                         ^
+-error: expect(received).toBe(expected)
+-
+-Expected: 2
+-Received: 0
+-
+-      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
+--------------------------------
+-
+-
+- 667 pass
+- 2 skip
+- 2 fail
+- 1 error
+- 3763 expect() calls
+-Ran 671 tests across 102 files. [253.72s]
+-[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]
+-
+-## Context Pack
+-# Context Pack — `omp-workspaces` (factory.v2 spec items 19 + 20)
+-
+-Repo: `agentic-swarm` (plugin root `plugins/software-factory`). Spec: `docs/factory.v2.md`.
+-All line numbers are repo-relative and verified against the current checkout.
+-
+----
+-
+-## 0. Scope and headline
+-
+-The two spec items are deliberately un-implemented in v2 and are the second self-hosted fire-test goal: `plugins/software-factory/docs/ARCHITECTURE.md:40` says **"Deliberately not hand-built … Current state: engine-managed worktrees (§7), item-level integrate step, in-process epics, schema-bound architect plan, no cache/compaction management; prior omp research in `docs/spikes/`."**
+-
+-The engine today is a single Bun process that derives state from committed records + git, creates its own git worktrees, runs one omp process per agent turn with `--cwd <worktree>`, merges items serially at wave end, and runs epics in-process as child tasks. Items 19/20 ask to (a) move workspace isolation to omp's configurable backend by default, (b) harden preflight/lifecycle, (c) move commit content and merge escalation to agents, (d) make epics independent launches inside sagas, (e) add an audited cache/compaction policy for the architect, and (f) prove all of it with no-paid-model end-to-end tests through the real omp harness.
+-
+-A fresh probe of the installed `omp` (`/home/slava/.bun/bin/omp`, version `18.18.5`) shows the mechanics the spec refers to **do exist** as configuration: `isolation.backend` (enum, default `rcopy`), `task.isolation.{enabled,apply,merge,commits}`, `worktree.{base,onStart,onExit,clone,cleanSource}`, `compaction.*`, and `providers.cacheWarming` / `providers.cacheRetention`. None of these keys is used by the factory today (`plugins/software-factory/src/harness/omp/overlay.ts:26-100`). See §5 for the probe log.
+-
+----
+-
+-## 1. Acceptance definition (the two spec items)
+-
+-### Item 19 — workspaces, merging, lifecycle (prefer omp over DIY) — `docs/factory.v2.md:104-113`
+-
+-| # | Requirement (condensed) |
+-|---|---|
+-| 19.1 | Workspace isolation via **omp's configurable isolation backend by default**; engine git worktrees stay only as config option `isolation: omp | engine`; a spike settles backend config, branch/commit retention on failure, cwd, merge-back |
+-| 19.2 | Preflight verifies: compatible omp version + config (overlay keys, isolation backend usable via a **real throwaway round-trip**), every configured model/role resolvable, target git repo state (clean, branches/worktrees consistent with records), harness binaries |
+-| 19.3 | Idempotent tracking of tasks/workspaces/branches/commits derived from records + git; launchers: `status` (whole tree: saga/epics/tasks/items, workspace+branch per active agent, open questions), `cleanup` (finished workspaces), `gc` (orphaned workspaces/branches/runtime files, stale locks; **dry-run by default**); all safe when idle and **refusing while a run holds the lock** |
+-| 19.4 | Commit message and scope from agents' structured output (e.g. last review before commit summarizes the change) or omp mechanics; **engine never invents content** |
+-| 19.5 | Wave-end merge default: conflict-free → deterministic CI gates → merged; conflicts or red → **workhorse-class wave-end merger agent** resolves trivial conflicts → unresolvable → architect escalation carrying a pointer to overall status (one command/file) and the worktree + branch of the problematic item |
+-| 19.6 | Saga: each epic runs as an **independent factory launch in its own workspace** (parallel epics possible); merges inside an epic escalate to the epic architect; merging epics at saga wave end escalates to the saga architect |
+-| 19.7 | Docs show each use case: single task, story waves, epic, saga with parallel epics, conflict/escalation paths, status/cleanup/gc |
+-| 19.8 | "No models" tests: end-to-end through the **real omp harness with a scripted mock model provider** (no paid models), covering isolation, merges/conflicts/escalations, saga/epic launches, restart, gc |
+-| 19.9 | Repo rules hydration: omp does not put AGENTS.md in subagent context, so the factory hydrates repo rules itself for architect and every implementer-chain agent, verified end-to-end per role |
+-
+-### Item 20 — architect context economy — `docs/factory.v2.md:114-120`
+-
+-| # | Requirement (condensed) |
+-|---|---|
+-| 20a | Compact the architect session **before a resume that will miss the provider prompt cache** (TTL expired / model switched), so an uncached resume does not re-pay full history |
+-| 20b | Keep the prompt cache **warm while the architect is on standby** between turns, when cheaper than expected uncached resume; leverage omp mechanics |
+-| 20-cost | Decide defaults by **measured cost** (usage / cache-read tokens in records); each mechanism configurable, explicitly off where it does not pay |
+-| 20-plan | Re-evaluate v2's **schema-bound architect plan** against v1's schema-free telegraphic output + PM structuring (an expensive repair turn was observed) |
+-| 20c | Session launching must **never break the provider prompt cache**: additive sessions only, never rewrite a transcript, prompt prefixes byte-stable across turns (no timestamps/random/temp-path interpolation into the cached prefix), generated omp overlay byte-stable for the same config |
+-| 20d | Optional optimizations only after 20c holds: focused compaction/handoff summaries on resume, IRC escalation reply, restart — measured and configurable/off by default |
+-
+----
+-
+-## 2. Module map
+-
+-### 2.1 Layout and responsibilities
+-
+-| Area | Files | Responsibility relevant to 19/20 |
+-|---|---|---|
+-| CLI | `plugins/software-factory/src/cli/{dispatch,run,preflight,status,steer,init,lock}.ts`, `bin/factory.ts` | Only `init|preflight|status|steer|run`; `run` = preflight → lock → engine; `status` is one-task |
+-| Engine | `src/core/engine.ts` (835 lines) | `runTask` main loop, `runChildTask` (epic in-process), start-up repair, simple path, task worktree bootstrap, epic wiring |
+-| Iteration/waves | `src/core/flows/iteration.ts` (3978 lines) | plan → review → PM → waves → wave-end merges → close-up → wave report; architect session id threading; consults/redrives |
+-| Item machine | `src/core/flows/item-machine.ts` (1113 lines) | per-item step sequence, fix rounds, consults, terminal states |
+-| Merge path | `src/core/flows/merge-path.ts` (422 lines) | per-item merge under a parent-keyed merge lock; conflict → `integrate`; gates/verify; attempt ledger |
+-| Consults | `src/core/flows/consults.ts` | architect item/non-item/concern consults (decision artifact), resume architect session |
+-| Epic propagation | `src/core/flows/epic-propagation.ts` | child concerns/remarkables/questions pushed to parent store/mailbox (`q-epic-*`) |
+-| Step runner | `src/core/flows/step-runner.ts` (1437 lines) | single agent turn: prompt, session reuse, record commit, checks, session-loss rehydration, transient retries |
+-| Git | `src/core/git/{worktrees,naming,merge,commit,repair,status,repo,exec,cleanliness,diff}.ts` | engine-managed worktrees, branch naming, merges, commits, HEAD guard, repair |
+-| Derive | `src/core/derive/{task,item,wave}.ts` | derived state from committed records + git (idempotent, restart-safe) |
+-| Records | `src/core/records/*` | YAML IO, step records, schema cache, repair, citations |
+-| Checks/gates | `src/core/checks/{gates,runner,junit,types}.ts` | deterministic gates, target-green/red, baseline ratchet |
+-| Config | `src/core/config/{loader,merge,validate,roles}.ts`, `config/*.yaml`, `config/schemas/*.json` | layered pipeline config, role resolution, structural validation |
+-| Harness | `src/harness/types.ts`, `src/harness/omp/{harness,overlay,ndjson,classify}.ts`, `src/harness/fake/*` | one omp process per turn; NDJSON parse; overlay; fake harness for tests |
+-| Prompts/agents | `agents/**`, `src/core/{prompts,prompt-vars,brief}.ts` | agent definitions, step fragments, prompt vars, architect brief |
+-| Docs | `docs/{ARCHITECTURE,IMPLEMENTATION,OMP_ADAPTER,FIRE_TEST}.md`, `docs/spikes/*.md` | build contract, current-state audit, omp adapter spec, prior omp spikes |
+-
+-### 2.2 Execution topology today (relevant to all of item 19)
+-
+-1. `factory run <task>` resolves the slug, copies an INTENT path into `{orch}/{task}/INTENT.md` in the **main checkout** if needed, runs preflight, acquires a **per-task** run lock, builds `OmpHarness` and `Repo`, then calls `runTask` (`src/cli/run.ts:27-135`).
+-2. `runTask` creates the task worktree on `topic/{task}` from main HEAD (INTENT committed there), repairs stray dirt, repairs item worktrees, marks interrupted records, reconciles concerns, then runs ingest/triage/infra/context-pack (`src/core/engine.ts:236-340`).
+-3. Each wave runs items concurrently up to `limits.maxParallelItems`; each item gets a child worktree (`{worktreeRoot}/topic_{task}--{item}`) and is ticked by `tickItemMachine`; epic items call `runTaskChild` **in-process** (`src/core/flows/iteration.ts:2432-2480`).
+-4. Wave end merges ready items serially through `mergeItem` under `repo.mergeLocks(parentBranch)`; on failure the engine consults the architect and re-drives, bounded by `merge-attempts.yaml` (`src/core/flows/iteration.ts:2706-2800`, `src/core/flows/merge-path.ts:131-170`).
+-5. Epic child task = child task dir under `{parentTaskDir}/{epic}`, its own iterations/waves on branch `topic/{parent}--{epic}`, then a `child-closeup.yaml` on the parent and the epic branch merged like any item (`src/core/engine.ts:123-226`).
+-6. Every agent turn is a separate omp process launched with `--cwd <worktree>`, `--config <overlay>`, `--session-dir <runtime>/sessions`, optional `--resume <id>`, `--system-prompt <file>`, `-p @<prompt-file>` (`src/harness/omp/harness.ts:356-410`).
+-
+----
+-
+-## 3. Key interfaces & signatures
+-
+-### Harness contract (`src/harness/types.ts:24-55`)
+-```ts
+-export interface Harness {
+-  run(l: AgentRun): Promise<AgentOutcome>;          // one turn (fresh or resumed)
+-  validateTools?(tools: string[]): Promise<string[]>;
+-  complete(c: { role; models; system; prompt; schema; timeoutSec?; timeoutMs?; onModelFallback? }): Promise<unknown>;
+-}
+-export interface AgentRun {
+-  agent; definition; prompt; role; models; tools;
+-  cwd: string;                 // worktree — engine-created today
+-  outputSchema; label;
+-  session: { resume?: string; keep: boolean };
+-  timeoutSec?; onModelFallback?; onSession?; onUsage?;
+-}
+-```
+-`AgentOutcome` carries `sessionId`, `traceRef`, `usage`, `transcriptBytes`, `stdoutBytes`, `toolCallCount`, and failure flags `transient|sessionLost|launchError|timedOut` (`src/harness/types.ts:57-82`).
+-
+-### Engine entry points
+-- `runTask(deps: EngineDeps, task: string, opts?: { maxTicks?; maxIterations?; lockTakeoverEvent? }): Promise<RunResult>` — `src/core/engine.ts:236-247`; `RunResult = {status: done|blocked|failed|stopped, exitCode: 0|10|1, summary}` (`:61-65`).
+-- `runChildTask(deps, parent: {branch,path,taskDir}, epicSlug, opts?): Promise<RunResult>` — `src/core/engine.ts:123-226`.
+-- Engine deps: `{ harness, repo, project, pipelineFor(taskDir), prompts, clock?, log?, diskSpaceProbe? }` (`src/core/engine.ts:46-54`).
+-
+-### Worktrees (`src/core/git/worktrees.ts`)
+-- `ensureTaskWorktree(repo, task, {intentPath, orchestrationFolder}): {branch, path, created}` — first run checks cleanliness except INTENT, `git worktree add -b topic/{task} <wt> HEAD`, writes+commits INTENT; idempotent (`:47-119`).
+-- `ensureChildWorktree(repo, parent:{branch,path}, slug, opts?): {branch,path,created}` — idempotent, prunes stale registrations, reuses branch, `git worktree add -b <child> <wt> <fromRef>` (`:122-168`).
+-- `removeWorktree(repo, wtPath)` — removes worktree, **keeps branch** (`:170-189`).
+-- `resetScratch(repo, parent, slug)` — removes branch+worktree and recreates from parent tip (`:191-224`).
+-
+-### Branch naming (`src/core/git/naming.ts`)
+-- `taskBranch(task) => topic/{task}` (`:73-76`)
+-- `childBranch(parent, item) => parent--item`, max depth 2 (`:78-101`)
+-- `worktreePath(root, branch) => root/{branch with / → _}` (`:103-110`)
+-- `parseBranch` → `{task, items, depth}` (`:50-70`)
+-
+-### Merge path (`src/core/flows/merge-path.ts`)
+-- `mergeItem(params: MergeItemParams): Promise<MergeItemResult>` — `:131-422`; params include `task,item,parentBranch,taskWt,childWt,repo,harness,pipeline,project,prompts,taskDir,wave?,targetOverride?,turnsSemaphore?` (`:20-49`).
+-- `MergeItemResult = {ok, sha?, error?, conflictResolved?, mergeAttempt?}` (`:51-58`).
+-- `MAX_MERGE_ATTEMPTS_PER_WAVE = 2`; ledger at `items/<slug>/merge-attempts.yaml`; per-wave target override at `items/<slug>/merge-target.yaml` (`:60-128`).
+-
+-### CLI
+-- `dispatch(args): Promise<number>` switch over `init|preflight|status|steer|run` (`src/cli/dispatch.ts:110-176`).
+-- `runStatus({repoRoot, task})` — one task; resolves its single worktree (`src/cli/status.ts:26-80`).
+-- `acquireRunLock(repoRoot, task, opts?)` / `isRunLockFree(...)` / `resolveRuntimeDir(repoRoot, worktreeRoot?)` (`src/cli/lock.ts:21-170`).
+-
+-### Config types
+-- `ProjectConfig { orchestrationFolder, adrFolder?, worktreeRoot, scripts?, paths?, skillDirs? }` (`src/core/artifacts.ts:11-22`).
+-- `PipelineConfig { models, agents, checks?, hooks?, flows, limits, budget?, diversity?, harness?: string, humanInvolvement?, concerns?, reviewPolicy?, criteria?, contextPack?, tools?, prompts? }` (`src/core/artifacts.ts:117-160`).
+-- `TaskKind = simple|story|spike|epic|saga` (`src/core/artifacts.ts:166`).
+-- `StepUsage = {inputTokens?, outputTokens?, costUsd?}` (`src/core/artifacts.ts:545-549`), recorded in every step `meta.yaml` (`:551-568`).
+-
+-### Derived state
+-- `DerivedTaskState` (task, kind, status `active|blocked|done|failed`, iteration, currentWave, items/itemMap, waves, debt, budget/spend maps, runningSteps, concerns, openSteerQuestions, strandedItems, failureDetails) — `src/core/derive/task.ts:60-85`.
+-- `deriveTaskState({taskDir, task, parentBranch?, taskWt, pipeline?, project?})` — `src/core/derive/task.ts:140-147`.
+-- `DerivedItemState.status = pending|running|ready|merged|failed|blocked|superseded` — `src/core/derive/item.ts:41`.
+-
+----
+-
+-## 4. Relevant excerpts
+-
+-### 4.1 Engine-managed task worktree (the `isolation: engine` backend to preserve)
+-`plugins/software-factory/src/core/git/worktrees.ts:47-119`:
+-```ts
+-// first run: main checkout must be clean except INTENT
+-const dirty = findDirtyEntries(entries, { orchestrationFolder, currentIntentPath: relIntent });
+-if (dirty.length > 0) throw new Error(`Main checkout is dirty ...`);
+-...
+-await repo.writeLock.runExclusive(() =>
+-  git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, "HEAD"])
+-);
+-```
+-Idempotence and stale-registration pruning are explicit (`:14-44`, `:60-72`, `:126-168`). This is the code the spec's `isolation: engine` option must keep behind a config switch.
+-
+-### 4.2 Epic child task is in-process (the model to replace for sagas)
+-`plugins/software-factory/src/core/engine.ts:123-145`:
+-```ts
+-export async function runChildTask(deps, parent, epicSlug, opts?) {
+-  const parentBranch = parent.branch;
+-  const childBranchName = childBranch(parentBranch, epicSlug);
+-  const childWtInfo = await ensureChildWorktree(repo, parent, epicSlug);
+-  const childTaskDir = path.join(childWt, orchFolder, parentTaskSlug, epicSlug);
+-```
+-Child iterations run on `parentBranch = childBranchName` (`:166-182`); then concerns propagate, `child-closeup.yaml` is written on the parent, and the parent branch commits the record (`:186-212`). The child is launched from the wave loop only when `it.kind === "epic" && runTaskChild` (`src/core/flows/iteration.ts:2440-2450`), wired in `runTask` at `src/core/engine.ts:750-767`. `docs/IMPLEMENTATION.md:150-173` states the saga gap explicitly: *"NOT IMPLEMENTED: saga launches do not exist in code … no saga launcher/loop exists … defers this to the `omp-workspaces` fire-test goal."*
+-
+-### 4.3 Wave-end merge, gates, and the current "merger"
+-`plugins/software-factory/src/core/flows/merge-path.ts:176-245` — on parent→child conflict the engine runs an `integrate` step with:
+-```ts
+-stepId: "integrate", stepFragment: "steps/integrate",
+-agent: "developer", role: "workhorse",   // <-- no dedicated wave-end merger agent
+-```
+-Then `concludeMerge` commits the resolution (engine stages, agent may not run git writes). If the tree changed, gates and target-green run (`:246-380`); any failure returns `ok:false` with evidence. Success merges child into parent with `--no-ff`, removes the worktree (branch kept), runs `after:item.merge` hooks (`:381-422`).
+-
+-The wave loop calls this per ready item, then on failure calls `redriveMergeAfterConsult` which runs an architect consult and retries the merge, bounded by the attempt ledger: `src/core/flows/iteration.ts:2706-2800` (call), `:650-710` (helper). The consult input has assignment/priorAttempts/diff/feedback/debt/contextPack only — **no worktree or branch pointer**: `src/core/flows/consults.ts:110-136`; prompt fragment `agents/steps/architect-consult-item.md:1-40`. The status block the architect sees also lacks workspace/branch: `src/core/flows/iteration.ts:177-215`.
+-
+-### 4.4 Preflight — what is actually verified today
+-`plugins/software-factory/src/cli/preflight.ts:129-235` loads project config, warns on linter configs, checks first-run cleanliness (only when the task branch does not exist), loads/validates the layered pipeline, checks disk space (`limits.minFreeDiskMb`). `:250-290` resolves roles/aliases and checks agents reference declared roles. `:292-360` renders prompt fragments and compiles all schemas. `:364-394` validates omp:
+-```ts
+-execFileSync(ompBinary, ["--version"], ...);
+-writeOmpConfigOverlay(pipelineConfig, tempOverlay);
+-execFileSync(ompBinary, ["--config", tempOverlay, "--version"], ...);
+-```
+-with a hard-coded last-resort path `/home/slava/.bun/bin/omp` (`:365-369`). `:399-414` checks the per-task run lock. There is **no isolation round-trip, no cross-check of branches/worktrees against records, and no model-name resolution against omp** (only role alias resolution).
+-
+-### 4.5 CLI/status/lock — single-task today
+-`src/cli/status.ts:26-80` resolves one task dir (task worktree if present, else main), calls `deriveTaskState`, and prints worktree/config/budget/running steps/waves/items/questions/debt (`:59-170`). `src/cli/lock.ts:21-44` puts runtime state at `{worktreeRoot}/.factory-runtime`; locks at `{runtimeDir}/locks/{task}.lock` (`:45-55`); `isRunLockFree` and `acquireRunLock` implement same-host dead-PID takeover (`:57-246`). There is no task enumeration anywhere in `src/cli` (only `readdir` of config/schema dirs, `src/cli/preflight.ts:74,349`), so whole-tree status has no existing discovery layer.
+-
+-### 4.6 Harness launch and cache-relevant transport
+-`src/harness/omp/harness.ts:286-300` — system prompt path is deterministic per agent+session:
+-```ts
+-const sessionKey = (run.session?.resume ?? "fresh").replace(...);
+-const systemPromptPath = path.join(systemPromptsDir, `${sanitizedAgent}-${sessionKey}.md`);
+-fs.writeFileSync(systemPromptPath, agentBody, "utf8");
+-```
+-`src/harness/omp/harness.ts:311-316` — prompt file name **embeds timestamp + randomness on every turn**:
+-```ts
+-const promptPath = path.join(promptsDir, `prompt-${Date.now()}-${Math.random()...}.txt`);
+-```
+-Args (`:368-388`): `--cwd run.cwd --config overlay --mode json --model <@role> --session-dir <dir> [--resume id] --tools=... --system-prompt <file> -p @<promptFile>`. Spawn cwd is the worktree (`:400-410`). No isolation/worktree flag is passed.
+-
+-`src/core/flows/step-runner.ts:606-620` decides session reuse (`keep = sessionMode==="reuse"`, resume interrupted record or existing id); on `sessionLost` it retries once with a fresh session and the **full prompt**, not a rehydrated prefix (`:967-1000`); `PersistentAgent` does the same with an optional `rehydrate()` prefix (`src/core/sessions.ts:110-138`).
+-
+-### 4.7 Architect planning, brief, wave report
+-- Plan turn: fresh plan or reuse session; `buildArchitectBrief` is called for a fresh brief even on resume (`src/core/flows/iteration.ts:1155-1235`); plan step uses `sessionMode: "reuse"`, `existingSessionId: architectSessionId`, fragment `steps/architect-plan` (`:1223-1290`). A limits violation triggers one resumed repair turn on the same session (`:1299-1370`).
+-- Wave report resumes the architect, injects `plan/waveReport/debt/steering/contextPack/taskStatus`, and the report fragment decides continue/amend/end (`:3089-3180`).
+-- `buildArchitectBrief` = deterministic one-line skeleton + a `@simpler` relevance judge returning `{include:[ids]}`, fail-open to the full skeleton (`src/core/brief.ts:1-14`, `:340-420`). This is the existing **cheap handoff** mechanism that item 20a/20d can build on.
+-- Architect output is schema-bound: `agents/steps/architect-plan.md:20` ("yield the plan matching `plan.schema.json`"); `config/schemas/plan.schema.json:4-6` requires `iteration, milestones, itemOutlines`; PM then structures item edits from plan outlines (`agents/steps/pm-edits.md:1-25`, `src/core/plan/apply.ts:1-16`).
+-
+-### 4.8 Usage/cost parsing drops cache tokens
+-`src/harness/omp/ndjson.ts:84-98`:
+-```ts
+-const u = event.message.usage;
+-this.inputTokens += u.input || 0;
+-this.outputTokens += u.output || 0;
+-const costVal = u.cost?.total ?? ((u.cost?.input || 0) + (u.cost?.output || 0));
+-this.costUsd += costVal || 0;
+-```
+-`cacheRead`, `cacheWrite`, `totalTokens`, and cost sub-fields are ignored; `src/harness/omp/ndjson.ts:170-178` emits only `{inputTokens, outputTokens, costUsd}`; `src/core/artifacts.ts:545-549` and `src/core/budget.ts:34-48` sum only those three. The raw omp NDJSON **does** carry them: fixtures `test/fixtures/omp/turn-fallback.ndjson:7` (`"cacheRead":0,"cacheWrite":0,...cost.cacheRead`), and the prior spike documents `usage.cacheRead` as available (`docs/spikes/omp-2-cli-adapter.md:100-104`). So 20-cost cannot be implemented without extending `Usage`/`StepUsage` and the parser (and updating records/budget tests).
+-
+-### 4.9 Commit content is engine-authored
+-`src/core/git/commit.ts:9-30` — `commitAll(repo, wt, message, {allowEmpty?, paths?})`; `paths` is the available scope mechanism. Call sites invent messages: step records `factory(...): <step> aN [started|error|rejected|session]` (`src/core/flows/step-runner.ts:697-760`, `:572`, `:807`, `:1400-1410`), plan edits `factory: apply plan edits iteration N` (`src/core/flows/iteration.ts:1914,1944`), epic close-up `factory: record epic <slug> child status ...` (`src/core/engine.ts:209`), merge `factory: merge item <slug>` (`src/core/flows/merge-path.ts:384-390`). Agent output schemas carry `summary` (`config/schemas/review.schema.json:6-12`, `config/schemas/developer-output.schema.json:6-14`) but no commit message/scope field.
+-
+-### 4.10 Concern propagation and escalation vocabulary
+-`epic-propagation.ts:20-33` documents "Epic-to-saga concern push": open/routed child concerns + open remarkables are condensed, questions with `blocks` are forwarded to the parent mailbox as `q-epic-<epic>-<id>` (`:116`). The actual parent is the enclosing task; there is no distinct saga architect. `buildTaskStatusBlock` lists items/waves/merged/blocked/failed and both task/root question dirs (`src/core/flows/iteration.ts:195-220`).
+-
+-### 4.11 Config surface where `isolation` must land
+-- `config/schemas/pipeline.schema.json:6-7` requires `models, agents, flows, limits`; `:208-210` declares `harness` as a **string**; `:305` sets root `additionalProperties: false`.
+-- `config/schemas/project.schema.json:52` is also `additionalProperties: false`.
+-- `config/pipeline.default.yaml`: models/roles `:40-104`, agents `:106-141`, checks/hooks `:172-195`, flows `:241-330`, limits `:342-390`, harness `:406`, humanInvolvement `:449`.
+-- Loader merge/validate: `src/core/config/loader.ts:68-150` (defaults → project → task → overrides, AJV, structural).
+-So adding `isolation` (or changing `harness` to an object) requires schema + `PipelineConfig` type + default YAML + overlay generation, or it fails validation at load.
+-
+-### 4.12 Existing omp cache/compaction knobs are config-only
+-`src/harness/omp/overlay.ts:26-100` emits only `modelRoles`, `retry.*`, `eval.autoBackground`, `title.generator`, `checkpoint.enabled`, `advisor`, `bash.gitGuard/allowCompoundCommands`, `mnemopi.*`, `update.auto`. It emits **none** of the omp keys discovered in §5 (`isolation.backend`, `task.isolation.*`, `worktree.*`, `compaction.*`, `providers.cacheWarming/cacheRetention`). Overlay is regenerated per turn from the effective pipeline (`src/harness/omp/harness.ts:222-240`).
+-
+----
+-
+-## 5. omp isolation mechanics — evidence log
+-
+-### 5.1 Prior research (repository docs)
+-- `docs/spikes/omp-1-topology.md:189-215` — empirical comparison:
+-  - omp `isolated: true` hardcodes branch `omp/task/<agentId>`, has no `cwd`, needs `apply:false` (not `merge:false`) to avoid applying to parent, and **"if the subagent fails or rejects (`exitCode !== 0`), `commitToBranch` is completely skipped; no branch commits are captured on failure/rejection, and the temporary isolation worktree is deleted"** (`:196-201`).
+-  - Engine-created `git worktree add -b topic/x/y` + `omp --cwd <wt>` keeps **all** files/commits regardless of exit status (`:205-213`).
+-  - Recommendation: hybrid external Bun CLI + omp headless adapter with engine-managed worktrees (`:347-395`).
+-- `docs/spikes/omp-2-cli-adapter.md:114-158` — `--session-dir` + `--resume` append to the same transcript; cwd persists in the session header; model switch on resume is allowed. `:160-218` — overlay with `modelRoles`, fallback chains, unattended switches; `:245-270` — four concurrent omp processes in four worktrees, no lock contention, ~0.8–1.2 s startup, SIGTERM 143 with partial session flush.
+-- `docs/OMP_ADAPTER.md:164-172` — cache-safety audit claim: additive resumes, byte-stable system prompt content, "only transport filenames embed timestamps", deterministic overlay. **It does not test omp's cache keying; it flags `--system-prompt` path-keying as unknown.**
+-
+-### 5.2 Fresh read-only probes on the installed omp 18.18.5
+-These are execution probes (no repository edits, no omp config writes):
+-
+-| Probe | Result |
+-|---|---|
+-| `omp --version` | `omp/18.18.5` (README requires v18.17.0+: `plugins/software-factory/README.md:14-18`) |
+-| `omp config get isolation.backend --json` | `{"value":"rcopy","type":"enum","description":"Backend used for subagent isolation and worktree cloning"}` — **no enum values exposed** |
+-| `omp config get task.isolation.*` | `enabled=true`, `apply=true` ("apply successful isolated task changes to parent"), `merge="branch"` (patch apply or branch merge), `commits="ai"` (generic or AI-generated commit messages) |
+-| `omp config get worktree.*` | `base` unset → `~/.omp/wt`; `onStart=off`; `onExit=remove`; `clone=true` (copy-on-write clone so `node_modules`/`target` carry over); `cleanSource=false`; `session.worktreeScope=repo` |
+-| `omp worktree --help` | `omp worktree [list|clear|add] [PATH] [COMMIT]` with `-b/-B/-C`, `--dry-run`, `--all`, `--json`. `clear --dry-run` prints what would be removed; `add -b feature ../path` creates a branch+worktree |
+-| `omp worktree list --json` | Entries carry `{path, kind:"task-isolation", orphanReason:"task-isolation leftover (no live task owns it)"}` — omp already has orphan classification |
+-| `omp --config <overlay with bogus keys including isolation.backend: definitely-not-a-backend> --version` | Prints `18.18.5`, **exit 0** — this probe validates nothing about overlay keys/values |
+-| `omp --config <overlay with title.generator:none, compaction.idleEnabled:true> config get title.generator` / `compaction.idleEnabled` | `tiny` / `false` — `omp config get` reports **persisted** config and ignores `--config`; it cannot be used to validate an overlay |
+-| `omp config list --json` (filtered) | `compaction.enabled=true`, `compaction.asyncEnabled=true`, `compaction.idleEnabled=false`, `compaction.idleThresholdTokens=200000`, `compaction.idleTimeoutSeconds=300` ("with a 1-hour prompt cache, compaction instead runs just before the cache expires"), `compaction.keepRecentTokens=20000`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.handoffSaveToDisk=true`, `compaction.dropUseless=true` ("cache-aware"), `compaction.supersedeReads=true` ("cache-aware"), `providers.cacheRetention=short`, `providers.cacheWarming=streaming` ("Re-send the last request with a one-token output budget shortly before its prompt-cache entry expires"), `display.cacheMissMarker=true` |
+-| `omp models --help` | Supports `-e/--extension` and `--config` when listing models — the plausible seam for a scripted provider extension |
+-| `omp --help` | No `--isolated`/isolation flag; isolation is config-driven. `--cwd`, `--session-dir`, `--resume`, `--config`, `--system-prompt`, `--no-session`, `--no-tools`, `--tools`, `--extension` exist |
+-
+-### 5.3 What this proves / does not prove
+-
+-**Proven:**
+-- omp exposes a configurable isolation backend (`isolation.backend`, default `rcopy`) and per-task isolation controls; the phrase in its own description ties the backend to *"subagent isolation and worktree cloning"*, i.e. it governs omp-managed worktrees as well as subagent tasks.
+-- omp has first-class worktree lifecycle commands (`worktree add|list|clear --dry-run`) with ownership/orphan metadata — a ready-made primitive for `cleanup`/`gc` of omp workspaces.
+-- omp exposes native compaction and prompt-cache-warming knobs, which item 20 can configure instead of building from scratch.
+-- `omp --config … --version` is not a config validator; `omp config get` cannot see an overlay.
+-
+-**Not proven (spike items):**
+-- The allowed values of `isolation.backend` and whether `rcopy`/others affect retention on failure; whether `omp worktree add` honors it exactly like subagent task isolation.
+-- Whether a **root** omp process launched with `--cwd <omp-created worktree>` can use `isolated: true` meaningfully (factory agents do not spawn subagents; prompts forbid it), i.e. which omp mechanism maps to "workspace isolation" for factory agents.
+-- Whether omp `--config` fully accepts these keys at runtime (no validation error ≠ applied; `config get` ignores overlays, so only a real turn can prove it).
+-- Whether omp prompt caching keys on content or on transport path (`--system-prompt <path>`, `-p @<timestamped-path>`), which determines item 20c.
+-- How to register a scripted mock provider (extension API shape, catalog registration, streaming NDJSON contract).
+-
+----
+-
+-## 6. Gap matrix — spec bullet vs current state
+-
+-| Spec | Current state (evidence) | Missing work | Likely touchpoints |
+-|---|---|---|---|
+-| 19.1 isolation backend default + `isolation: omp|engine` + spike | Engine-only worktrees; no isolation key in schema/types/overlay; harness passes no isolation flags (`src/core/git/worktrees.ts:47-224`, `src/harness/omp/harness.ts:368-388`, `config/schemas/pipeline.schema.json:208,305`) | Spike + config field + backend abstraction (create/remove/retain workspace) + overlay keys + preflight compatibility | `src/core/engine.ts:266-272`, `src/core/flows/iteration.ts:2455-2470`, `src/core/git/worktrees.ts`, new workspace module, `config/pipeline.default.yaml`, `config/schemas/pipeline.schema.json`, `src/harness/omp/overlay.ts` |
+-| 19.2 preflight | Version + inert overlay check, role aliases, prompts/schemas, disk, per-task lock (`src/cli/preflight.ts:129-414`) | Isolation round-trip; real model/role resolvability; branches/worktrees-vs-records consistency; harness binaries beyond omp; remove hard-coded omp fallback | `src/cli/preflight.ts`, `src/core/git/{status,worktrees}.ts`, `src/core/config/roles.ts` |
+-| 19.3 whole-tree status / cleanup / gc + lock refusal | `status` one task; no `cleanup`/`gc` commands; per-task locks; runtime dirs `sessions/`, `prompts/`, `system-prompts/` never purged (only `tmp/` is: `src/core/runtime-tmp.ts:16-45`); orphan detection helpers partially exist (`parseWorktreeList` `src/core/git/status.ts:64-71`, `removeWorktree`) | Task/workspace index derived from records+git; saga/epic parent links; active-agent workspace+branch; cleanup semantics; gc orphan worktrees/branches/runtime/locks, dry-run default; lock guard across the whole tree | `src/cli/dispatch.ts:110-176`, `src/cli/status.ts`, `src/cli/lock.ts:21-95`, new `src/cli/{cleanup,gc}.ts`, `src/core/derive/task.ts`, `src/core/git/status.ts` |
+-| 19.4 commits from agent output | All messages engine-authored; `commitAll` accepts message + `paths` scope only (`src/core/git/commit.ts:9-30`; call sites in §4.9) | Commit message/scope fields in output schemas + prompts; thread them to step/merge commits; fallback rule (engine may only use agent-provided or mechanical text) | `config/schemas/review.schema.json`, `config/schemas/developer-output.schema.json`, `agents/steps/review.md`/`develop.md`, `src/core/flows/step-runner.ts:714-760`, `src/core/flows/merge-path.ts:381-422` |
+-| 19.5 wave-end merge + workhorse merger + escalation pointers | Merge already runs at wave end with deterministic gates; conflict handled by `developer` step `integrate`; failure → architect consult with evidence but no status/worktree/branch pointer; attempts bounded 2/wave (`src/core/flows/merge-path.ts:176-422`, `src/core/flows/iteration.ts:2706-2800,650-710`, `src/core/flows/consults.ts:110-136`) | Dedicated workhorse-class wave-end merger agent (trivial conflicts only) + prompt fragment; escalation payload with one-command status pointer and worktree+branch; contract tests | new `agents/wave-merger.md` + step fragment, `src/core/flows/merge-path.ts`, `src/core/flows/consults.ts`, `agents/steps/architect-consult-item.md`, `src/core/flows/iteration.ts:177-215` |
+-| 19.6 saga independent launches, parallel epics, escalation split | `saga` only a `TaskKind` (`src/core/artifacts.ts:166`, `config/schemas/triage.schema.json`); epics in-process (`src/core/engine.ts:123-226`); epic INTENT written under the **parent task dir on the parent branch** (`src/core/plan/apply.ts:9-16`), so `factory run <epic>` cannot resolve it from main; `q-epic-*` goes to the enclosing task, not a saga architect (`src/core/flows/epic-propagation.ts:20-33,116`) | Saga launcher (spawn independent `factory run` per epic in its own workspace), parent/saga identity+links, per-workspace locks, saga wave-end merge/escalation to saga architect, concern funnel upward | new saga/workspace orchestration module, `src/cli/run.ts:55-135`, `src/cli/dispatch.ts`, `src/core/flows/epic-propagation.ts`, `src/core/git/naming.ts:73-101` |
+-| 19.7 docs per use case | Existing ARCHITECTURE/IMPLEMENTATION/OMP_ADAPTER/FIRE_TEST; no use-case doc; docs sentinel test convention exists (`test/docs-concerns.test.ts:1-50`) | New/updated docs for single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc + sentinel test | `plugins/software-factory/docs/*`, `test/docs-*.test.ts` |
+-| 19.8 no-model e2e through real omp | Only `FakeHarness` engine tests + one live smoke gated by `FACTORY_LIVE_OMP=1` (`test/harness/smoke-live.test.ts:9-12`); harness can take an alternative `ompBinary` (`src/harness/omp/types.ts:4-15`, precedent `test/engine/model-fallback.test.ts:44-53`) | Scripted mock model provider usable by real omp; e2e scenarios (isolation, merges/conflicts/escalations, saga/epic launches, restart, gc) without paid models | new harness test fixture/provider extension, `test/e2e/**`, `OmpHarness` options, possibly `src/harness/omp/overlay.ts` |
+-| 19.9 repo rules hydration | No `AGENTS.md`/rules handling anywhere in `src/` (grep); `PROMPT_VAR_DESCRIPTIONS`/`KNOWN_VARS` have no repo-rules var (`src/core/prompt-vars.ts:9-60`) | Deterministic repo-rule resolution from target repo; inject into architect + developer/qa/reviewer prompts across items/epics; verify per role | `src/core/prompts.ts`, `src/core/prompt-vars.ts`, `src/core/flows/step-runner.ts`, `agents/*.md`, preflight render checks |
+-| 20a compact before uncached resume | No cache awareness; resume threads a session id; on loss it starts fresh with full prompt (`src/core/flows/step-runner.ts:967-1000`); a deterministic brief already exists (`src/core/brief.ts:1-14,340-420`); omp `compaction.*` exists but is unused | Detect cold-cache resume (TTL/model switch), compact or switch to fresh+hydrated brief, measure cost delta | `src/harness/omp/harness.ts:286-351`, `src/core/flows/step-runner.ts:606-620`, `src/core/brief.ts`, `src/harness/omp/overlay.ts` |
+-| 20b warm cache on standby | Architect process exits every turn; no standby; `providers.cacheWarming` unused | Decide mechanism (long-lived/keepalive process vs omp warming config), measure vs uncached resume, config gate | `src/harness/omp/harness.ts`, `src/core/flows/iteration.ts` (architect turns), overlay |
+-| 20c cache-coherence audit | Additive `--resume`; deterministic system-prompt path; **timestamp+random prompt path every turn** (`harness.ts:311-316`); overlay regenerated per turn from config (`harness.ts:222-240`); no byte-stability test | Audit omp cache keying; make transport paths stable or prove content keying; add byte-stability tests for overlay/system prompt/prompts across turns | `src/harness/omp/harness.ts`, `src/harness/omp/overlay.ts`, `test/harness/*` |
+-| 20d optional optimizations | None | Handoff/compaction on resume, IRC escalation reply, restart | `src/core/brief.ts`, `src/core/flows/step-runner.ts`, overlay |
+-| 20-cost measurement | `Usage`/`StepUsage` only input/output/cost; parser drops `cacheRead/cacheWrite/cost.cacheRead` (`ndjson.ts:84-98,170-178`, `artifacts.ts:545-549`, `budget.ts:34-48`) | Add cache token fields end-to-end + records/derive/status/budget aggregation; use for defaults | `src/harness/types.ts:7-11`, `src/harness/omp/ndjson.ts`, `src/core/artifacts.ts:545-549`, `src/core/budget.ts`, `src/core/derive/task.ts`, `config/schemas/state.schema.json` |
+-| 20-plan schema-free architect vs PM structuring | Plan is schema-bound (`config/schemas/plan.schema.json`, `agents/steps/architect-plan.md:20`); PM already structures outlines into scheduled items (`agents/steps/pm-edits.md:1-25`) | Re-evaluate from measured plan-repair turns; possibly telegraphic plan + PM structuring of plan/edits | `agents/steps/architect-plan.md`, `agents/steps/pm-edits.md`, `src/core/plan/*`, `config/schemas/*` |
+-
+----
+-
+-## 7. Existing tests & conventions
+-
+-**Runner and gates**
+-- `bun test` (Bun test runner, no config file), `bun run typecheck` (`tsc --noEmit`) — `plugins/software-factory/package.json:11-13`; strict TS incl. `noUncheckedIndexedAccess` (`plugins/software-factory/tsconfig.json`). The repo's own gate hints are in `.factory/project.yaml` `scripts.setup/typecheck/test`.
+-- Tests live under `test/**/*.test.ts` and import source directly; no mocks for git or filesystem.
+-
+-**Core helpers**
+-- `createTmpRepo()` builds a real temporary git repo, tracks worktrees, commits with fixed identity, and cleans up on exit (`test/helpers/tmp-repo.ts:1-90`).
+-- `FakeHarness` scripts outcomes **by exact `AgentRun.label`**, records all calls, models sessions and `sessionLost` (`src/harness/fake/fake-harness.ts:35-125`). This is how all engine-level behavior tests avoid models.
+-- Worktree behavior is tested against real git: `test/git/worktrees.test.ts:1-60` (first-run cleanliness, idempotence, child worktrees, removal preserving branch).
+-
+-**Behavior test patterns relevant to 19**
+-- Epic execution end-to-end with FakeHarness, asserting branch existence, child-closeup, derived item status `merged`, and merged file content: `test/engine/epic-child-task.test.ts:78-218`.
+-- Merge conflict → integrate resolution: `test/engine/merge-conflict.test.ts:1-50`; merge gate evidence/attempt ledger: `test/engine/merge-gate-evidence.test.ts`; redrive/stranded: `test/engine/merge-redrive-stranded.test.ts`.
+-- Crash/restart record repair: `test/engine/crash-restart.test.ts:1-50`; derived state: `test/engine/derive-gaps.test.ts`.
+-- CLI output/exit conventions: `test/cli/cli.test.ts:1-70` (arg parsing, lock lifecycle), `test/cli/status-concerns.test.ts:1-50` (capture `console.log/error` into a string, assert sections).
+-- Docs closure sentinel: `test/docs-concerns.test.ts:1-50` — asserts needles inside named doc sections/YAML commentary blocks so docs edits are test-enforced. Reuse this for the 19.7 use-case docs.
+-- Live omp tests are opt-in only: `FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts` (`test/harness/smoke-live.test.ts:9-12`).
+-- Process-level harness tests substitute a mock `ompBinary` shell script (`test/engine/model-fallback.test.ts:44-53`, `test/harness/omp-harness.test.ts:84-90,286-311`) and assert classification/timeout/session behavior. For 19.8 this is the precedent for a scripted provider, but the spec requires going through **real omp**, so a mock *binary* alone will not satisfy it.
+-
+-**Conventions to follow**
+-- Behavior tests only: assert committed records, `journal.ndjson` events, git graph/worktree state, CLI output — not private helpers.
+-- Every engine decision is journaled (`appendJournal`) and records are committed before/after each step; new features should add journal events + record artifacts so restart/derive tests can prove idempotence.
+-- Schemas are draft-07 with `additionalProperties:false`; optional new fields are backward-compatible, required fields are not.
+-- Preflight validates every prompt fragment against `KNOWN_VARS` and renders with sample vars (`src/cli/preflight.ts:292-360`), so new prompt variables/fragments must be registered in `src/core/prompt-vars.ts`.
+-
+----
+-
+-## 8. Open questions & spike outlines (for the architect)
+-
+-### Isolation semantics (must settle before 19.1 design)
+-1. **Isolation backend contract.** `isolation.backend` is an enum defaulting to `rcopy`; what are the values, and does it control (a) subagent task isolation only, (b) `omp worktree add` cloning, or both? Probe candidate: throwaway profile (`--profile`) + `config set`, then a temp repo `omp worktree add -b topic/probe <tmp> HEAD`, inspect branch/commits, then `omp worktree clear --dry-run`.
+-2. **Retention on failure.** Prior spike proves `isolated:true` discards branch commits on non-zero exit (`docs/spikes/omp-1-topology.md:201`). Does an omp-managed worktree via `omp worktree add` + `omp --cwd` retain everything like engine worktrees? Test with a failing/aborted turn.
+-3. **Root-process isolation.** Factory agents are top-level omp processes, not omp subagents. Which omp mechanism is the "workspace" for such a process — `omp worktree add` + `--cwd`, `--add-dir`, or `task.isolation`? Document the mapping and the fallback to `isolation: engine`.
+-4. **Merge-back ownership.** omp has `task.isolation.{apply,merge,commits}`; the spec still requires deterministic CI gates and wave-end merger. Decide whether omp ever performs the merge (then gates) or only creates workspaces and the engine keeps merging. Evidence needed: can omp's `commits: ai` produce a usable message from structured output, or is it generic?
+-5. **Config validation.** `omp --config ... --version` accepts bogus keys (probe), and `omp config get` ignores overlays. A real preflight round-trip must actually launch omp. Define the cheapest safe probe (e.g. `omp -p --no-session --tools= --model @role "reply OK"` in a temp clone, or an `omp worktree add`-based round-trip).
+-6. **Model/role resolvability.** `omp models ls --json` (with `-e`) may enumerate catalogs; overlays define `modelRoles`. Determine whether any CLI validates `--model @role` + overlay without a paid turn; otherwise preflight can only resolve roles structurally (current behavior) plus a first-turn fallback.
+-
+-### Lifecycle (19.3)
+-7. **Index source.** Derive the whole tree on demand from `{orch}/*/INTENT.md`, `items/*/child-closeup.yaml`, `journal.ndjson`, task dirs and `git worktree list --porcelain` (`parseWorktreeList`, `src/core/git/status.ts:64-71`), or persist a registry file? The spec says "derived from records + git" and "idempotent", which favors on-demand derivation; a registry risks drift.
+-8. **Parent links.** Epic child dirs are nested under the parent task dir but live on the parent branch; saga→epic links are only implicit in `plan.epics` (`config/schemas/plan.schema.json:85-95`) and `child-closeup.yaml`. Define the link record used by status/gc/escalation.
+-9. **Cleanup vs gc semantics.** `cleanup` = finished (merged/done) workspaces; `gc` = orphaned worktrees/branches/runtime files/stale locks, dry-run default. Which branches are deletable (merged only? superseded? failed after N days?), and how to treat omp-managed worktrees (`kind: task-isolation`, `orphanReason`) vs engine worktrees. `removeWorktree` keeps branches (`worktrees.ts:170-189`); `omp worktree clear` removes omp-owned ones.
+-10. **Lock refusal across a tree.** Locks are per task (`src/cli/lock.ts:45-55`). Whole-tree commands must refuse if *any* run lock is live; parallel epics need per-workspace locks plus a saga-level coordination lock (merge/status writes). Dead-PID takeover exists only per file (`:57-95,109-246`).
+-
+-### Saga (19.6)
+-11. **Launch mechanics.** Each epic = independent `factory run` in its own workspace. Today `factory run <epic>` cannot resolve an epic INTENT because `resolveTaskSlug`/`runFactory` copy INTENT from the **main checkout** into `{repoRoot}/{orch}/{epic}/INTENT.md` (`src/cli/run.ts:27-75`), while epic INTENT lives under the parent task dir on the parent branch (`src/core/plan/apply.ts:9-16`). Decide: new `factory run --parent <task> --workspace <path> <epic>` or a saga launcher that spawns children with explicit INTENT path/branch.
+-12. **Process orchestration.** Who supervises child factories (exit codes 0/10/1), restarts, and parallelism? How are child stdout/journal/status surfaced to the saga status command? How do saga wave-end merges happen — the saga architect merges epic branches onto a saga branch, or epics merge directly to main?
+-13. **Escalation split.** Inside an epic, merge escalation must reach the epic architect (currently parent task architect for all items, `src/core/flows/iteration.ts:650-710`); at saga wave end it must reach the saga architect. Define the architect-session/ownership map per workspace and how consults are routed.
+-
+-### Cache/compaction (item 20)
+-14. **Cache-key audit.** Determine whether omp caches on message content or transport path. Concrete suspicion: the per-turn prompt file path `prompt-<ts>-<rand>.txt` (`harness.ts:311-316`) and regenerated overlay (`harness.ts:222-240`). Add a test that renders the same prompt twice and compares system-prompt bytes, overlay bytes, and argv (the only unstable part should be the prompt filename; then verify omp behavior with a live probe using `providers.cacheRetention`/`display.cacheMissMarker`).
+-15. **Compaction mechanism.** omp auto-compacts inside a session (`compaction.*`); there is no CLI `compact` command in `omp --help`. To "compact before an uncached resume", decide between (a) relying on omp auto-compaction triggered before resume, (b) starting a fresh architect session with the existing deterministic brief (`buildArchitectBrief`) and recording it as the handoff, (c) a long-lived architect process. Measure cost with cacheRead/cacheWrite tokens.
+-16. **Warm-on-standby.** The architect process exits after every turn; `providers.cacheWarming=streaming` only helps a live/last request. Decide whether to keep a standby process (cost) or treat warming as off by default; the spec allows "explicitly off where it does not pay".
+-17. **Measurement plumbing.** Add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, and cost sub-fields to `Usage`/`StepUsage`/records/derived status before choosing defaults; update `budget.ts` aggregation and `state.schema.json` if surfaced.
+-18. **Schema-free plan.** Count plan-repair turns and their cost from records (`architect-plan-*` attempts, repair records, usage) before changing the contract. The PM already structures item edits from plan outlines; the open question is whether the architect should emit telegraphic markdown for the plan itself and let PM produce both `plan` and `edits` schemas.
+-
+-### Repo rules (19.9)
+-19. **Rule sources and precedence.** Which files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.omp/rules`?), from repo root and subdirs, and how they combine with factory agent definitions. Confirm whether omp already injects context files into a root process launched with `--system-prompt` (its config exposes `contextFiles.extra` and `--no-context-files`), to avoid double injection. Verify per role with a probe agent that must quote a sentinel rule.
+-
+-### No-model e2e (19.8)
+-20. **Mock provider seam.** omp supports `--extension` and `omp models -e`, so a scripted provider extension is the most likely route; alternatively an OpenAI-compatible local endpoint registered via overlay if omp supports custom provider definitions. Define the canned scenario format (turn-by-turn NDJSON: text, tool calls, yield), and prove the real omp binary runs a full factory flow against it with zero paid calls.
+-
+----
+-
+-## 9. Verification commands (baseline)
+-
+-```bash
+-cd plugins/software-factory
+-bun test                       # full behavior suite
+-bun run typecheck              # tsc --noEmit
+-FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts   # opt-in real omp smoke (paid models)
+-
+-# omp mechanics probes (read-only)
+-omp --version
+-omp config list --json | jq 'to_entries[] | select(.key|test("isolation|worktree|compaction|cache"))'
+-omp worktree list --json
+-omp worktree clear --dry-run   # dry-run only
+-```
+-
+----
+-
+-## 10. Notes for the architect
+-
+-- **Do not re-derive** the following: merge is already wave-end per item; gates/target-green already run deterministically on tree change; conflict handling exists but uses `developer/integrate`; epics are in-process and merge like items; `factory status` is task-scoped; commit messages are engine-invented; usage lacks cache tokens; omp exposes native compaction/warming/worktree-lifecycle config.
+-- **Suggested epic split** (sizing only; the architect decides): (A) isolation backend + workspace abstraction + preflight round-trip + whole-tree status/cleanup/gc; (B) agent-authored commits + wave-end merger agent + escalation pointers; (C) saga independent launches + parallel epics + escalation/funnel routing; (D) cache/compaction measurement & policy; (E) no-model omp e2e harness + repo-rules hydration + use-case docs. A/B share workspace primitives; C depends on A; D is independent but benefits from A's workspace cleanup; E spans all and should land last per epic with a thin slice early (mock provider spike) to de-risk.
+-- **Start with a fact-finder spike item** per the intent: it must answer questions 1–6 (§8) with throwaway temp repos and a throwaway omp profile, and produce a decision record on the omp↔engine isolation mapping before any engine code changes.
+-
+-
+-## Human involvement
+-# Human involvement criteria
+-
+-Mode selects which ADR and concern decisions need a human decision. Everything
+-else is either autonomous or digest-only; never block on items the table marks
+-remarkable.
+-
+-## Blocking table (ADRs and concerns)
+-
+-| Mode | Blocking (needs human decision) | Remarkable (digest only) |
+-| --- | --- | --- |
+-| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
+-| principal | stack/layer, external interfaces, config shapes | internal choices |
+-| detailed | external-interface changes and major internal interfaces | minor internals |
+-
+-## autonomous
+-
+-Block only explicit high-severity ADRs/concerns that remain after all unblocked
+-work is finished. Do not stop for internal choices; record them as remarkable.
+-
+-## Open Concerns
+-- id: c-19cad43406
+-  kind: risk
+-  severity: medium
+-  summary: Per-turn prompt transport path embeds timestamp+randomness
+-  affects:
+-    - 20c
+-  status: routed
+-  disposition: optional
+-- id: c-317a4e9b8b
+-  kind: risk
+-  severity: high
+-  summary: Usage parser discards cache-read/write tokens needed for item 20 defaults
+-  affects:
+-    - 20-cost
+-    - 20a
+-    - 20b
+-    - 20d
+-  status: routed
+-  disposition: optional
+-
+-
+-- Raise concerns with evidence; condense stale detail instead of repeating it.
+-
+-## Output
+-
+-Yield a structured JSON object matching this schema:
+-- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
+-- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
+-- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
+-- rationale (string, optional): Technical justification for this decision
+-- text (string, optional): Concrete guidance or steering directives
+-- persist (boolean, optional): Whether guidance persists across subsequent attempts
+-- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
+-- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
+-- outline (object, optional): Item outline to schedule when decision is fix-item
+-- debt (string, optional): Technical debt description when decision is accept-with-debt
+-- reason (string, optional): Reason for abandonment or abort
+-- question (string, optional): Specific question for human operator when decision is human-async or blocked
+-- target (object, optional): Corrected developer target from a merge-verify consult, applied to the merge verification instead of the record's stale target (unknown-gate recovery). One of {gate: <infra gate id>}, {selectors: [<test ids>]}, or {command, customTarget: true}.
+-  - gate (string, optional)
+-  - selectors (array of string, optional)
+-  - expectRed (array of string, optional)
+-  - command (string, optional)
+-  - customTarget (boolean, optional)
+-- planDelta (string, optional): Plan delta or amendment directives when decision is amend
+-- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
+-- concerns (array of object, optional): Structured concerns raised by the architect
+-  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
+-  - summary (string, required)
+-  - detail (string, optional)
+-  - severity (string, optional, enum: ["low","medium","high"])
+-  - location (object, optional)
+-    - file (string, required)
+-    - line (integer, optional)
+-  - affects (array of string, optional)
+-- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
+-  - chosen (string, required)
+-  - why (string, required)
+-  - alternatives (array of string, required)
+-- concernConfirms (array of object, optional): Architect confirmations for close-up concern resolutions
+-  - id (string, required)
+-  - note (string, optional)
+-  - confirm (string, required, enum: ["accept","reject"])
+-- concernResolution (object, optional): Direct concern resolution applied when the decision commits
+-  - id (string, required)
+-  - note (string, optional)
+-  - action (string, required, enum: ["resolve","carry"])
+diff --git a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/meta.yaml b/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/meta.yaml
+deleted file mode 100644
+index 9f1b06d..0000000
+--- a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/meta.yaml
++++ /dev/null
+@@ -1,17 +0,0 @@
+-seq: 17
+-name: consult-merge-setup-fix-1
+-attempt: 1
+-agent: architect
+-role: architect
+-models:
+-  - opencode-go/muse-spark-1.3-contributor
+-session: 01a1c29e-2258-71ad-886f-375b051ddadb
+-timeoutSec: 7200
+-status: ok
+-startedAt: 2026-11-10T03:07:14.885Z
+-endedAt: 2026-11-10T03:08:41.560Z
+-usage:
+-  inputTokens: 572479
+-  outputTokens: 4710
+-  costUsd: 0.061607
+-traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-21-45-816Z_01a1c29e-2258-71ad-886f-375b051ddadb
+diff --git a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/output.yaml b/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/output.yaml
+deleted file mode 100644
+index 37d62d0..0000000
+--- a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/output.yaml
++++ /dev/null
+@@ -1,38 +0,0 @@
+-context: item
+-decision: retry-with-guidance
+-persist: true
+-rationale: "2/2 develop attempts rejected solely by the test gate; the new
+-  merge-setup tests pass (667 pass). The single new failure — stranded-wave
+-  consult-refire — cannot be caused by this change: that test's item never
+-  reaches ready/merge (perpetual fix dispositions + consults), its infra has
+-  empty gates/setup, and it failed via a 5000ms timeout plus a between-tests
+-  teardown error alongside 'killed 1 dangling process' — a load flake under 4
+-  concurrent full-suite gate runs in wave 2. No evidence of prod regression;
+-  abandoning would lose the critical wave-1 merge unblocker."
+-text: "RETRY (gate flake, not prod regression — isolate before touching code):
+-  1) Run ONLY the failing file in isolation from plugins/software-factory: `bun
+-  test test/engine/stranded-wave.test.ts`. Expect pass. That test never invokes
+-  mergeItem (item never becomes ready; infra has empty gates), so an isolated
+-  pass proves the full-suite timeout was load contention — do NOT rewrite prod
+-  code in that case. 2) Re-run the full `bun test` once; success = no NEW
+-  failing tests vs baseline (only the accepted disk-space env failure may
+-  remain). 3) ONLY if the isolated file also fails: treat as real regression —
+-  audit your merge-path diff for strict empty-setup parity (no-op before any
+-  journal/git/snapshot side effect, identical return paths when infra.setup is
+-  empty/missing) and fix minimally. Keep prod diff ~80 lines; preserve the new
+-  passing merge-setup tests."
+-concerns:
+-  - affects:
+-      - gates
+-      - wave-merge
+-    detail: merge-setup-fix develop was rejected 2/2 by a 5000ms timeout in
+-      stranded-wave.test.ts (a test that never touches mergeItem) plus a
+-      between-tests teardown error, with 'killed 1 dangling process' in output —
+-      while 4 wave-2 items each run the full ~250s bun suite as gates
+-      concurrently. Full-suite-as-gate under parallel items makes timeouts
+-      load-dependent; consider serializing full-suite gates, raising per-test
+-      timeout, or scoping item gates to affected selectors.
+-    kind: risk
+-    severity: medium
+-    summary: Full-suite gates under parallel wave items cause timeout flakes (5s
+-      default)
+diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
+index 877b028..0f64339 100644
+--- a/.factory/tasks/omp-workspaces/state.yaml
++++ b/.factory/tasks/omp-workspaces/state.yaml
+@@ -36,42 +36,24 @@ items:
+     fixRounds: 1
+     spendUsd: 0.11246700000000001
+     currentStep: review
+-  merge-setup-fix:
+-    kind: dev
+-    status: running
+-    branch: topic/omp-workspaces--merge-setup-fix
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.104651
+-    currentStep: develop
+-  spike-findings-recovery:
+-    kind: no-behavior
+-    status: ready
+-    branch: topic/omp-workspaces--spike-findings-recovery
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.174178
+-    currentStep: review
+   transport-byte-stability:
+     kind: test-only
+-    status: ready
++    status: pending
+     branch: topic/omp-workspaces--transport-byte-stability
+     attempts: 1
+     fixRounds: 1
+-    spendUsd: 0.083151
+-    currentStep: review
++    spendUsd: 0
+   usage-cache-tokens:
+     kind: dev
+-    status: ready
++    status: pending
+     branch: topic/omp-workspaces--usage-cache-tokens
+     attempts: 1
+     fixRounds: 1
+-    spendUsd: 0.181734
+-    currentStep: review
++    spendUsd: 0
+ concerns:
+-  open: 4
+-  dismissed: 2
+-  routed: 33
++  open: 24
++  dismissed: 1
++  routed: 10
+   resolved: 0
+ debt:
+   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
+@@ -106,14 +88,8 @@ debt:
+     defaults"
+   - "[19.6] Saga launches do not exist and epic INTENT is not resolvable by
+     `factory run`"
+-  - "[19.3] Runtime dirs sessions/prompts/system-prompts grow without cleanup"
+-  - "[19.2] Hard-coded omp fallback path in preflight"
+   - "[spike-repo-rules] Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md`
+     are launch-directory-only"
+-  - "[spike-mock-provider] OmpHarness has no extension/extra-arg seam; mock
+-    provider needs a wrapper or new option"
+-  - "[19.1] spike-omp-isolation polish notes deferred to iteration-2 M3/M4
+-    planning"
+   - "[spike-cache-key] Findings cite nonexistent
+     plugins/software-factory/docs/factory.v2.md"
+   - "[spike-cache-key] 7.1 misattributes tokensAfter/method to NDJSON result"
+@@ -134,42 +110,25 @@ debt:
+   - "[spike-omp-isolation] Reconcile mock-provider negative with sibling spikes"
+   - "[spike-repo-rules] Preserve worktree-root cwd; .omp/rules +
+     .claude/CLAUDE.md are cwd-only"
+-  - "[spike-findings-recovery] Test gate pass coexists with 1 documented
+-    baseline failure"
+-  - "[spike-findings-recovery] Fix `oMP` capitalization typo in repo-rules doc"
+-  - "[transport-byte-stability] Pin regex {3,4} narrower than slice(2,6)
+-    generator output"
+-  - "[transport-byte-stability] Comment omits deliberate exclusion of preflight
+-    hardcoded fallback"
+-  - "[usage-cache-tokens] Duplicate 6-term has-usage guard in step-runner and
+-    shutdown"
+-budgetSpentUsd: 1.7035573999999996
++budgetSpentUsd: 1.0690054
+ spendByRole:
+   workhorse:
+-    costUsd: 1.2521194
+-    inputTokens: 2707250
+-    outputTokens: 965515
++    costUsd: 0.8839554
++    inputTokens: 1881130
++    outputTokens: 692249
+   alt-workhorse:
+-    costUsd: 0.26717399999999997
+-    inputTokens: 1110664
+-    outputTokens: 492808
++    costUsd: 0.086165
++    inputTokens: 357804
++    outputTokens: 174090
+   architect:
+-    costUsd: 0.1779
+-    inputTokens: 1236914
+-    outputTokens: 84882
++    costUsd: 0.09252099999999999
++    inputTokens: 606147
++    outputTokens: 59551
+   alt-architect:
+     costUsd: 0.006364
+     inputTokens: 28896
+     outputTokens: 15650
+ spendByItem:
+-  merge-setup-fix:
+-    costUsd: 0.104651
+-    inputTokens: 294165
+-    outputTokens: 78165
+-  transport-byte-stability:
+-    costUsd: 0.083151
+-    inputTokens: 192618
+-    outputTokens: 106892
+   spike-omp-isolation:
+     costUsd: 0.45245700000000005
+     inputTokens: 1135682
+@@ -182,20 +141,12 @@ spendByItem:
+     costUsd: 0.11246700000000001
+     inputTokens: 225196
+     outputTokens: 108718
+-  spike-findings-recovery:
+-    costUsd: 0.174178
+-    inputTokens: 546734
+-    outputTokens: 203800
+   spike-cache-key:
+     costUsd: 0.155598
+     inputTokens: 331901
+     outputTokens: 152018
+-  usage-cache-tokens:
+-    costUsd: 0.181734
+-    inputTokens: 509493
+-    outputTokens: 194135
+   (orchestration):
+-    costUsd: 0.3147244
+-    inputTokens: 1592576
+-    outputTokens: 197997
+-lastUpdated: 2026-11-10T03:31:43.551Z
++    costUsd: 0.22388639999999999
++    inputTokens: 925839
++    outputTokens: 163674
++lastUpdated: 2026-11-10T01:45:03.449Z
+diff --git a/plugins/software-factory/src/core/flows/merge-path.ts b/plugins/software-factory/src/core/flows/merge-path.ts
+index 8a0e97f..06f183c 100644
+--- a/plugins/software-factory/src/core/flows/merge-path.ts
++++ b/plugins/software-factory/src/core/flows/merge-path.ts
+@@ -15,6 +15,7 @@ import { runSeamHooks } from "./seams.js";
+ import { appendJournal } from "../journal.js";
+ import { runGates } from "../checks/gates.js";
+ import { runCheck } from "../checks/runner.js";
++import { runProcess } from "../proc.js";
+ import type { CheckContext } from "../checks/types.js";
+ import type { DerivedItemState } from "../derive/item.js";
+ import type { Semaphore } from "../mutex.js";
+@@ -127,6 +128,51 @@ export async function writeMergeTargetOverride(
+   await writeYamlAtomic(p, { overrides });
+ }
+ 
++/** Synthetic gate id used when infra.setup aborts the merge before gates run. */
++const INFRA_SETUP_GATE_ID = "infra.setup";
++
++/** Mirrors the gate-failure evidence shape: id, status, command, output tail. */
++function gateFailureEvidence(
++  failing: Array<{ id: string; status: string; command?: string; details?: string }>
++): string[] {
++  return failing.map((r) => {
++    const cmd = r.command ? ` Command: ${r.command}` : "";
++    const tail = r.details ? ` Details: ${r.details.slice(-500)}` : "";
++    return `${r.id} (exit via status=${r.status}).${cmd}${tail}`;
++  });
++}
++
++/**
++ * Runs infra.setup commands in a worktree, mirroring runner.ts: stop at the
++ * first failure and carry the command, exit code, and output for evidence.
++ */
++async function runMergeSetup(
++  setup: string[],
++  cwd: string,
++  timeoutSec: number,
++  outputBytes: number
++): Promise<{ ok: true } | { ok: false; command: string; details: string }> {
++  for (const cmd of setup) {
++    const res = await runProcess({ cmd, cwd, timeoutSec, maxOutputBytes: outputBytes });
++    const output = (res.stdout + "\n" + res.stderr).trim();
++    if (res.timedOut) {
++      return {
++        ok: false,
++        command: cmd,
++        details: `infra.setup timed out after ${timeoutSec}s: ${cmd}\n${output}`,
++      };
++    }
++    if (res.code !== 0) {
++      return {
++        ok: false,
++        command: cmd,
++        details: `infra.setup failed (exit ${res.code}): ${cmd}\n${output}`,
++      };
++    }
++  }
++  return { ok: true };
++}
++
+ /**
+  * Runs the merge path for a single ready item under the parent's merge lock (§7, §9).
+  */
+@@ -318,6 +364,37 @@ export async function mergeItem(params: MergeItemParams): Promise<MergeItemResul
+         outputBytes: pipeline.limits?.checkOutputBytes ?? 4096,
+       };
+ 
++      // infra.setup must run before any gate/target snapshot so setup-created
++      // untracked files (node_modules, venvs) are part of the baseline rather
++      // than reported as gate mutations. Temp-worktree paths (runner.ts) run
++      // the same commands before their checks.
++      if (infra?.setup && infra.setup.length > 0) {
++        const rawTimeout = pipeline.limits?.gateTimeoutSec as number | undefined;
++        const setupTimeout = typeof rawTimeout === "number" && rawTimeout > 0 ? rawTimeout : 900;
++        const setupRes = await runMergeSetup(infra.setup, childWt, setupTimeout, checkCtx.outputBytes);
++        if (!setupRes.ok) {
++          const failure = {
++            id: INFRA_SETUP_GATE_ID,
++            status: "fail",
++            command: setupRes.command,
++            details: setupRes.details,
++          };
++          const failingEvidence = gateFailureEvidence([failure]);
++          await appendJournal(taskDir, {
++            type: "item_merge_gates_failed",
++            item: item.slug,
++            failingGates: [failure.id],
++            results: [{ id: failure.id, status: failure.status }],
++            evidence: failingEvidence,
++          });
++          return {
++            ok: false,
++            mergeAttempt,
++            error: `Quality gates failed on merge path for ${item.slug}: ${failure.id}. ${failingEvidence.join(" | ")}`,
++          };
++        }
++      }
++
+       // Run gates if configured
+       if (infra && infra.gates && infra.gates.length > 0) {
+         const gatesOutcome = await runGates(checkCtx);
+@@ -326,11 +403,7 @@ export async function mergeItem(params: MergeItemParams): Promise<MergeItemResul
+           // Evidence for the consult: command + stderr tail per failing gate.
+           // An exit-127 here means "command not found", not an assertion
+           // failure — without the command name the error is unactionable.
+-          const failingEvidence = failing.map((r) => {
+-            const cmd = r.command ? ` Command: ${r.command}` : "";
+-            const tail = r.details ? ` Details: ${r.details.slice(-500)}` : "";
+-            return `${r.id} (exit via status=${r.status}).${cmd}${tail}`;
+-          });
++          const failingEvidence = gateFailureEvidence(failing);
+           await appendJournal(taskDir, {
+             type: "item_merge_gates_failed",
+             item: item.slug,
+diff --git a/plugins/software-factory/test/engine/merge-setup.test.ts b/plugins/software-factory/test/engine/merge-setup.test.ts
+new file mode 100644
+index 0000000..3bafdbb
+--- /dev/null
++++ b/plugins/software-factory/test/engine/merge-setup.test.ts
+@@ -0,0 +1,250 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { mergeItem, readMergeAttempts } from "../../src/core/flows/merge-path.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { git } from "../../src/core/git/exec.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readJournal } from "../../src/core/journal.js";
++import { writeYamlAtomic } from "../../src/core/records/io.js";
++import type { DeveloperTarget, PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
++import type { DerivedItemState } from "../../src/core/derive/item.js";
++
++// Wave-end merge runs verify-checks in the child worktree. That worktree has
++// no node_modules (untracked, never copied by git), so gates/typecheck fail
++// unless infra.setup runs there first — and it must run BEFORE the gates'
++// worktree snapshot so setup-created untracked files (node_modules, venvs)
++// are not misreported as gate mutations.
++
++interface MergeFixture {
++  taskWt: string;
++  taskDir: string;
++  item: DerivedItemState;
++  parentBranch: string;
++  repoObj: Repo;
++  pipeline: PipelineConfig;
++  project: ProjectConfig;
++  prompts: any;
++  childWt: string;
++}
++
++async function prepareMerge(
++  tmpRepo: TmpRepo,
++  task: string,
++  infra: Record<string, unknown>,
++  target?: DeveloperTarget
++): Promise<MergeFixture> {
++  const orchFolder = ".factory";
++  const taskDir = path.join(tmpRepo.dir, orchFolder, task);
++  fs.mkdirSync(taskDir, { recursive: true });
++  await writeYamlAtomic(path.join(taskDir, "infra.yaml"), infra);
++
++  tmpRepo.writeFile("base.txt", "Base\n");
++  tmpRepo.commit("Add base.txt on main");
++
++  const itemSlug = `item-${task}`;
++  const childBranch = `topic/${task}--${itemSlug}`;
++  const childWt = tmpRepo.createWorktree(childBranch);
++  fs.writeFileSync(path.join(childWt, "child.txt"), "Child content\n", "utf8");
++  await git(childWt, ["add", "child.txt"]);
++  await git(childWt, ["commit", "-m", "Child commit"]);
++
++  const parentBranch = `topic/${task}`;
++  tmpRepo.createBranch(parentBranch, "main");
++  tmpRepo.git(["checkout", parentBranch]);
++  tmpRepo.writeFile("parent.txt", "Parent new content\n");
++  tmpRepo.commit("Parent new file modifying tree");
++
++  const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".worktrees") });
++  const project: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot: repoObj.worktreeRoot };
++  const pipeline: PipelineConfig = {
++    models: { roles: { workhorse: { model: "m" } } },
++    agents: { developer: { role: "workhorse" } },
++    flows: { simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] }, story: {}, spike: {} },
++    limits: {},
++  };
++  const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
++  const item: DerivedItemState = {
++    slug: itemSlug,
++    kind: "dev",
++    title: "T",
++    wave: 1,
++    deps: [],
++    status: "ready",
++    branch: childBranch,
++    records: [
++      {
++        dirName: "001-develop-r1-a1",
++        seq: 1,
++        name: "develop",
++        attempt: 1,
++        fixRound: 1,
++        meta: {
++          seq: 1,
++          name: "develop",
++          attempt: 1,
++          fixRound: 1,
++          agent: "developer",
++          role: "workhorse",
++          models: ["m"],
++          status: "ok",
++          startedAt: new Date().toISOString(),
++        },
++        output: target ? { status: "ok", summary: "Done", target } : { status: "ok", summary: "Done" },
++      },
++    ],
++    currentAttempt: 1,
++    currentFixRound: 1,
++    isEscalated: false,
++    freshSeries: false,
++    interruptionCount: 0,
++    suggestionFingerprints: [],
++    decisionFingerprints: [],
++    failingCheckFingerprints: [],
++    consultCount: 0,
++  };
++  return { taskWt: tmpRepo.dir, taskDir, item, parentBranch, repoObj, pipeline, project, prompts, childWt };
++}
++
++function merge(fixture: MergeFixture, task: string) {
++  return mergeItem({
++    task,
++    item: fixture.item,
++    parentBranch: fixture.parentBranch,
++    taskWt: fixture.taskWt,
++    childWt: fixture.childWt,
++    repo: fixture.repoObj as any,
++    harness: new FakeHarness(),
++    pipeline: fixture.pipeline,
++    project: fixture.project,
++    prompts: fixture.prompts,
++    taskDir: fixture.taskDir,
++  });
++}
++
++describe("merge-path infra.setup", () => {
++  let tmpRepo: TmpRepo;
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++  });
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  it("runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations", async () => {
++    const task = "merge-setup-before-gates";
++    const setupCmd =
++      "printf 'ready' > setup-artifact.txt && mkdir -p node_modules/fake-dep && printf 'dep' > node_modules/fake-dep/index.js";
++    const fixture = await prepareMerge(tmpRepo, task, {
++      setup: [setupCmd],
++      gates: [
++        {
++          id: "setup-visible",
++          command: "test -f setup-artifact.txt && test -f node_modules/fake-dep/index.js",
++        },
++      ],
++      testRunner: { command: "true" },
++    });
++
++    const result = await merge(fixture, task);
++
++    expect(result.error).toBeUndefined();
++    expect(result.ok).toBe(true);
++    const journal = await readJournal(fixture.taskDir);
++    // Setup artifacts existed before the gate snapshot, so the gate that
++    // requires them passes and nothing is reported as a gate mutation.
++    const mutationEvents = journal.filter((e) => e.type === "worktree_mutation_detected");
++    expect(mutationEvents).toHaveLength(0);
++    expect(journal.some((e) => e.type === "item_merged")).toBe(true);
++  });
++
++  it("runs setup before target-green checks in the child worktree", async () => {
++    const task = "merge-setup-before-target";
++    const fixture = await prepareMerge(
++      tmpRepo,
++      task,
++      {
++        setup: ["printf 'ready' > setup-artifact.txt"],
++        gates: [],
++        testRunner: { command: "true" },
++      },
++      { customTarget: true, command: "test -f setup-artifact.txt" }
++    );
++
++    const result = await merge(fixture, task);
++
++    expect(result.error).toBeUndefined();
++    expect(result.ok).toBe(true);
++  });
++
++  it("treats an empty setup list as a no-op and merges as before", async () => {
++    const task = "merge-setup-empty";
++    const fixture = await prepareMerge(tmpRepo, task, {
++      setup: [],
++      gates: [{ id: "ok", command: "true" }],
++      testRunner: { command: "true" },
++    });
++
++    const result = await merge(fixture, task);
++
++    expect(result.error).toBeUndefined();
++    expect(result.ok).toBe(true);
++  });
++
++  it("treats a missing setup key as a no-op and merges as before", async () => {
++    const task = "merge-setup-missing";
++    const fixture = await prepareMerge(tmpRepo, task, {
++      gates: [{ id: "ok", command: "true" }],
++      testRunner: { command: "true" },
++    });
++
++    const result = await merge(fixture, task);
++
++    expect(result.error).toBeUndefined();
++    expect(result.ok).toBe(true);
++  });
++
++  it("fails the merge with gate-shaped evidence containing the setup command and output", async () => {
++    const task = "merge-setup-failure";
++    const setupCmd = "echo setup-out-marker && echo setup-err-marker >&2 && exit 7";
++    const fixture = await prepareMerge(tmpRepo, task, {
++      setup: [setupCmd],
++      gates: [{ id: "after-setup", command: "touch gate-ran-marker.txt" }],
++      testRunner: { command: "true" },
++    });
++
++    const result = await merge(fixture, task);
++
++    expect(result.ok).toBe(false);
++    // Actionable error: names the setup phase, the command, its exit code,
++    // and the captured stdout/stderr.
++    expect(result.error).toContain("infra.setup");
++    expect(result.error).toContain(`Command: ${setupCmd}`);
++    expect(result.error).toContain("exit 7");
++    expect(result.error).toContain("setup-out-marker");
++    expect(result.error).toContain("setup-err-marker");
++    // Gates never ran: the setup failure aborted verify-checks first.
++    expect(fs.existsSync(path.join(fixture.childWt, "gate-ran-marker.txt"))).toBe(false);
++
++    // Journal evidence mirrors a failing gate: id/status entry carrying
++    // command + output detail.
++    const journal = await readJournal(fixture.taskDir);
++    const failEv = journal.find(
++      (e) => e.type === "item_merge_gates_failed" && (e as any).item === fixture.item.slug
++    ) as any;
++    expect(failEv).toBeDefined();
++    expect(failEv.failingGates).toContain("infra.setup");
++    expect(Array.isArray(failEv.evidence)).toBe(true);
++    const evidence = (failEv.evidence as string[]).join("\n");
++    expect(evidence).toContain("infra.setup");
++    expect(evidence).toContain("(exit via status=fail)");
++    expect(evidence).toContain(`Command: ${setupCmd}`);
++    expect(evidence).toContain("setup-out-marker");
++    expect(evidence).toContain("setup-err-marker");
++
++    expect(await readMergeAttempts(fixture.taskDir, fixture.item.slug, "1")).toBe(1);
++    expect(journal.some((e) => e.type === "item_merged")).toBe(false);
++  });
++});
+
+## Human involvement
+# Human involvement criteria
+
+Mode selects which ADR and concern decisions need a human decision. Everything
+else is either autonomous or digest-only; never block on items the table marks
+remarkable.
+
+## Blocking table (ADRs and concerns)
+
+| Mode | Blocking (needs human decision) | Remarkable (digest only) |
+| --- | --- | --- |
+| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
+| principal | stack/layer, external interfaces, config shapes | internal choices |
+| detailed | external-interface changes and major internal interfaces | minor internals |
+
+## autonomous
+
+Block only explicit high-severity ADRs/concerns that remain after all unblocked
+work is finished. Do not stop for internal choices; record them as remarkable.
+
+## Open Concerns
+- id: c-552344216d
+  kind: blocker
+  severity: high
+  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+  affects:
+    - "19.2"
+    - wave-merge
+- id: c-f972360209
+  kind: tech-debt
+  severity: medium
+  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+  affects:
+    - redrive
+    - wave-merge
+- id: c-f415508eb1
+  kind: risk
+  severity: medium
+  summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated test failures
+  affects:
+    - gates
+    - wave-merge
+- id: c-8dc9dd1c4d
+  kind: risk
+  severity: medium
+  summary: Full-suite gates under parallel wave items cause timeout flakes (5s default)
+  affects:
+    - gates
+    - wave-merge
+- id: c-7ca231f0aa
+  kind: risk
+  severity: medium
+  summary: stranded-wave test has a 5s timeout that flakes under full-suite parallel load
+  affects:
+    - gates
+    - wave-merge
+- id: rm-02fe59eb65
+  kind: remarkable
+  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
+- id: rm-61c10c8318
+  kind: remarkable
+  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
+- id: rm-63922d9635
+  kind: remarkable
+  summary: Configure omp via a generated YAML overlay per turn
+- id: rm-ac427a6618
+  kind: remarkable
+  summary: "Engine-managed git worktrees (`git worktree add` + `omp --cwd`) rather than omp `isolated: true` subagent tasks"
+- id: rm-df9df7bd8a
+  kind: remarkable
+  summary: Epics run in-process as child tasks with an in-process `runTaskChild`
+- id: rm-565790e99d
+  kind: remarkable
+  summary: On-demand whole-tree derivation; no registry
+- id: rm-6344b013f9
+  kind: remarkable
+  summary: Additive optional cache fields; no record migration
+- id: rm-d5301c7af1
+  kind: remarkable
+  summary: Real-binary scripted-provider e2e; FakeHarness retained
+
+
+- Raise concerns with evidence; condense stale detail instead of repeating it.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["approved","changes_requested"])
+- summary (string, required)
+- suggestions (array of object, required)
+  - id (string, required)
+  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
+  - summary (string, required)
+  - detail (string, optional)
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
+- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
+  - chosen (string, required)
+  - why (string, required)
+  - alternatives (array of string, required)
+- newConcerns (array of object, optional): New concerns discovered during review
+  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
+  - summary (string, required)
+  - detail (string, optional)
+  - severity (string, optional, enum: ["low","medium","high"])
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
+  - affects (array of string, optional)
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..5953104
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 5
+name: qa
+attempt: 1
+fixRound: 1
+agent: qa
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-10T03:47:11.845Z
+session: 01a1c391-2df7-74cc-9cbd-dea46d302d6b
+endedAt: 2026-11-10T03:51:10.664Z
+usage:
+  inputTokens: 96794
+  outputTokens: 13410
+  costUsd: 0.013242
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T03-47-14-039Z_01a1c391-2df7-74cc-9cbd-dea46d302d6b.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..5a6bbae
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/005-qa-r1-a1/output.yaml
@@ -0,0 +1,24 @@
+status: approved
+summary: "merge-setup-fix verified: 5/5 target green, typecheck+adjacent green,
+  no weakening, ordering and evidence hold"
+suggestions:
+  - detail: Empty/missing tests assert ok:true only. Pinning absence of
+      item_merge_gates_failed with infra.setup would lock the no-op more
+      strictly. Not blocking — current parity plus target-red/green proves
+      behavior.
+    disposition: optional
+    id: parity-assert-strength
+    location:
+      file: plugins/software-factory/test/engine/merge-setup.test.ts
+      line: 182
+    summary: Parity tests could assert absence of infra.setup evidence
+  - detail: runMergeSetup implements sequential stop-on-first-failure plus timeout
+      mirroring runner.ts:797-810, but tests cover single-command
+      success/failure only. Assignment acceptance does not require it; consider
+      follow-up coverage.
+    disposition: optional
+    id: multi-command-timeout-coverage
+    location:
+      file: plugins/software-factory/src/core/flows/merge-path.ts
+      line: 149
+    summary: No test for sequential stop-on-first-failure or timeout
diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
index 2a03658..bd0bfd0 100644
--- a/.factory/tasks/omp-workspaces/journal.ndjson
+++ b/.factory/tasks/omp-workspaces/journal.ndjson
@@ -179,85 +179,3 @@
 {"type":"step_started","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/016-pm-amend-1-1-a1","ts":"2026-11-10T01:58:23.267Z"}
 {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-amend-1-1","timeoutSec":2700,"ts":"2026-11-10T01:58:23.271Z"}
 {"type":"step_finished","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"status":"ok","sessionId":"01a1c32d-8867-7723-95d2-878ad3ce217f","usage":{"inputTokens":23942,"outputTokens":4443,"costUsd":0.003283},"ts":"2026-11-10T01:58:56.769Z"}
-{"type":"wave_started","wave":2,"iteration":1,"ts":"2026-11-10T01:58:57.650Z"}
-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.322Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.327Z"}
-{"type":"step_started","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.394Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.401Z"}
-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.508Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.516Z"}
-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.632Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.639Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"sizeBytes":10510823,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"toolCalls":110,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1224-72a4-b1e9-c14d90c8551d","usage":{"inputTokens":115693,"outputTokens":43458,"costUsd":0.058962},"ts":"2026-11-10T02:05:24.330Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"sizeBytes":12075086,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.227Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"toolCalls":111,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.228Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:54.916Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:58.777Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"sizeBytes":5435764,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-869Z_01a1c32e-1235-7054-84d9-126190c40577.jsonl","ts":"2026-11-10T02:06:51.065Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:54.313Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:57.347Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"sizeBytes":5725555,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"toolCalls":93,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:31.055Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:33.409Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"method":"ask","ts":"2026-11-10T02:12:14.696Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1319-71c5-8ba5-7d9366c17208","usage":{"inputTokens":204993,"outputTokens":50291,"costUsd":0.068727},"ts":"2026-11-10T02:12:17.328Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:14:23.165Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:20:04.945Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c32e-1401-7277-bf9d-7bf38233f921","usage":{"inputTokens":139228,"outputTokens":49219,"costUsd":0.071688},"ts":"2026-11-10T02:23:11.689Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c32e-1235-7054-84d9-126190c40577","usage":{"inputTokens":115418,"outputTokens":50352,"costUsd":0.060786},"ts":"2026-11-10T02:28:29.165Z"}
-{"type":"step_started","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/002-review-r1-a1","ts":"2026-11-10T02:28:30.468Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"transport-byte-stability","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:28:30.473Z"}
-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/002-develop-r1-a1","ts":"2026-11-10T02:28:30.505Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","timeoutSec":5400,"ts":"2026-11-10T02:28:30.510Z"}
-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1","ts":"2026-11-10T02:28:30.543Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","timeoutSec":5400,"ts":"2026-11-10T02:28:30.563Z"}
-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1","ts":"2026-11-10T02:28:30.586Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T02:28:30.594Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:31:18.728Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:31:20.791Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"sizeBytes":9642303,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-960Z_01a1c349-1c70-753b-80bd-f7b7bd4a284b","ts":"2026-11-10T02:35:11.187Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"toolCalls":104,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-960Z_01a1c349-1c70-753b-80bd-f7b7bd4a284b","ts":"2026-11-10T02:35:11.187Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:35:13.343Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:35:16.197Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1c349-1ccd-7094-967b-f4e95a34a589","usage":{"inputTokens":65574,"outputTokens":18937,"costUsd":0.025037999999999998},"ts":"2026-11-10T02:35:24.503Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"sizeBytes":22491067,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-042Z_01a1c349-1cc2-739a-990e-2c1cce0ebd71.jsonl","ts":"2026-11-10T02:42:24.305Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"toolCalls":145,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-042Z_01a1c349-1cc2-739a-990e-2c1cce0ebd71.jsonl","ts":"2026-11-10T02:42:24.306Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"status":"ok","sessionId":"01a1c349-1cc2-739a-990e-2c1cce0ebd71","usage":{"inputTokens":232949,"outputTokens":72636,"costUsd":0.051412},"ts":"2026-11-10T02:42:24.388Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"method":"relaunch","ts":"2026-11-10T02:44:44.801Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"sizeBytes":8808880,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-938Z_01a1c349-1c5a-74ff-8fd7-583a79e8bffd","ts":"2026-11-10T02:46:53.214Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"toolCalls":96,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-938Z_01a1c349-1c5a-74ff-8fd7-583a79e8bffd","ts":"2026-11-10T02:46:53.215Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"status":"ok","sessionId":"01a1c349-1c5a-74ff-8fd7-583a79e8bffd","usage":{"inputTokens":77200,"outputTokens":56540,"costUsd":0.022365},"ts":"2026-11-10T02:46:53.398Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c349-1c70-753b-80bd-f7b7bd4a284b","usage":{"inputTokens":161616,"outputTokens":52072,"costUsd":0.072077},"ts":"2026-11-10T02:52:14.564Z"}
-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1","ts":"2026-11-10T02:52:15.903Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:52:15.907Z"}
-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/003-qa-r1-a1","ts":"2026-11-10T02:52:15.937Z"}
-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2","ts":"2026-11-10T02:52:15.972Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T02:52:15.978Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","timeoutSec":5400,"ts":"2026-11-10T02:52:18.383Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:53:35.354Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:53:37.308Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":2,"method":"ask","ts":"2026-11-10T02:55:16.967Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":2,"status":"rejected","sessionId":"01a1c35e-dc77-70e1-8459-a5285fe93047","usage":{"inputTokens":23598,"outputTokens":8937,"costUsd":0.010886},"ts":"2026-11-10T03:03:28.159Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","attempt":1,"sizeBytes":8570169,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-18-955Z_01a1c35e-e68b-70cb-8daf-f1f800970391.jsonl","ts":"2026-11-10T03:06:54.262Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","attempt":1,"toolCalls":111,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-18-955Z_01a1c35e-e68b-70cb-8daf-f1f800970391.jsonl","ts":"2026-11-10T03:06:54.263Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"qa","attempt":1,"status":"ok","sessionId":"01a1c35e-e68b-70cb-8daf-f1f800970391","usage":{"inputTokens":117741,"outputTokens":48009,"costUsd":0.025889},"ts":"2026-11-10T03:06:54.358Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","attempt":1,"sizeBytes":18701342,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-16-327Z_01a1c35e-dc47-7421-b99b-9b4039009710.jsonl","ts":"2026-11-10T03:07:13.214Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","attempt":1,"toolCalls":120,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-16-327Z_01a1c35e-dc47-7421-b99b-9b4039009710.jsonl","ts":"2026-11-10T03:07:13.214Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"review","attempt":1,"status":"ok","sessionId":"01a1c35e-dc47-7421-b99b-9b4039009710","usage":{"inputTokens":174557,"outputTokens":81945,"costUsd":0.051078},"ts":"2026-11-10T03:07:13.292Z"}
-{"type":"step_started","task":"omp-workspaces","step":"consult-merge-setup-fix-1","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1","ts":"2026-11-10T03:07:14.956Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","step":"consult-merge-setup-fix-1","timeoutSec":7200,"ts":"2026-11-10T03:07:14.961Z"}
-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/004-review-r1-a1","ts":"2026-11-10T03:07:15.001Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","timeoutSec":3600,"ts":"2026-11-10T03:07:15.008Z"}
-{"type":"step_finished","task":"omp-workspaces","step":"consult-merge-setup-fix-1","attempt":1,"status":"ok","sessionId":"01a1c29e-2258-71ad-886f-375b051ddadb","usage":{"inputTokens":572479,"outputTokens":4710,"costUsd":0.061607},"ts":"2026-11-10T03:08:41.591Z"}
-{"type":"decision_made","context":"item","item":"merge-setup-fix","decision":"retry-with-guidance","decisionPath":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/decisions/011-item-merge-setup-fix-1.yaml","ts":"2026-11-10T03:08:41.592Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","attempt":1,"sizeBytes":9579045,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T03-07-15-430Z_01a1c36c-9466-73b6-ae79-1c2c59cb8490.jsonl","ts":"2026-11-10T03:31:42.281Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","attempt":1,"toolCalls":92,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T03-07-15-430Z_01a1c36c-9466-73b6-ae79-1c2c59cb8490.jsonl","ts":"2026-11-10T03:31:42.282Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"review","attempt":1,"status":"ok","sessionId":"01a1c36c-9466-73b6-ae79-1c2c59cb8490","usage":{"inputTokens":114443,"outputTokens":50596,"costUsd":0.024806},"ts":"2026-11-10T03:31:42.390Z"}
-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/004-develop-r1-a1","ts":"2026-11-10T03:31:43.925Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T03:31:43.932Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T03:33:47.513Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T03:33:49.630Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T03:38:54.455Z"}
diff --git a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/input.md b/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/input.md
deleted file mode 100644
index cbc7539..0000000
--- a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/input.md
+++ /dev/null
@@ -1,977 +0,0 @@
-# Step: Architect Consult (Item)
-
-## Goal
-Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
-
-## Rules
-- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `omp-workspaces` (factory.v2 spec items 19 + 20)
-
-Repo: `agentic-swarm` (plugin root `plugins/software-factory`). Spec: `docs/factory.v2.md`.
-All line numbers are repo-relative and verified against the current checkout.
-
----
-
-## 0. Scope and headline
-
-The two spec items are deliberately un-implemented in v2 and are the second self-hosted fire-test goal: `plugins/software-factory/docs/ARCHITECTURE.md:40` says **"Deliberately not hand-built … Current state: engine-managed worktrees (§7), item-level integrate step, in-process epics, schema-bound architect plan, no cache/compaction management; prior omp research in `docs/spikes/`."**
-
-The engine today is a single Bun process that derives state from committed records + git, creates its own git worktrees, runs one omp process per agent turn with `--cwd <worktree>`, merges items serially at wave end, and runs epics in-process as child tasks. Items 19/20 ask to (a) move workspace isolation to omp's configurable backend by default, (b) harden preflight/lifecycle, (c) move commit content and merge escalation to agents, (d) make epics independent launches inside sagas, (e) add an audited cache/compaction policy for the architect, and (f) prove all of it with no-paid-model end-to-end tests through the real omp harness.
-
-A fresh probe of the installed `omp` (`/home/slava/.bun/bin/omp`, version `18.18.5`) shows the mechanics the spec refers to **do exist** as configuration: `isolation.backend` (enum, default `rcopy`), `task.isolation.{enabled,apply,merge,commits}`, `worktree.{base,onStart,onExit,clone,cleanSource}`, `compaction.*`, and `providers.cacheWarming` / `providers.cacheRetention`. None of these keys is used by the factory today (`plugins/software-factory/src/harness/omp/overlay.ts:26-100`). See §5 for the probe log.
-
----
-
-## 1. Acceptance definition (the two spec items)
-
-### Item 19 — workspaces, merging, lifecycle (prefer omp over DIY) — `docs/factory.v2.md:104-113`
-
-| # | Requirement (condensed) |
-|---|---|
-| 19.1 | Workspace isolation via **omp's configurable isolation backend by default**; engine git worktrees stay only as config option `isolation: omp | engine`; a spike settles backend config, branch/commit retention on failure, cwd, merge-back |
-| 19.2 | Preflight verifies: compatible omp version + config (overlay keys, isolation backend usable via a **real throwaway round-trip**), every configured model/role resolvable, target git repo state (clean, branches/worktrees consistent with records), harness binaries |
-| 19.3 | Idempotent tracking of tasks/workspaces/branches/commits derived from records + git; launchers: `status` (whole tree: saga/epics/tasks/items, workspace+branch per active agent, open questions), `cleanup` (finished workspaces), `gc` (orphaned workspaces/branches/runtime files, stale locks; **dry-run by default**); all safe when idle and **refusing while a run holds the lock** |
-| 19.4 | Commit message and scope from agents' structured output (e.g. last review before commit summarizes the change) or omp mechanics; **engine never invents content** |
-| 19.5 | Wave-end merge default: conflict-free → deterministic CI gates → merged; conflicts or red → **workhorse-class wave-end merger agent** resolves trivial conflicts → unresolvable → architect escalation carrying a pointer to overall status (one command/file) and the worktree + branch of the problematic item |
-| 19.6 | Saga: each epic runs as an **independent factory launch in its own workspace** (parallel epics possible); merges inside an epic escalate to the epic architect; merging epics at saga wave end escalates to the saga architect |
-| 19.7 | Docs show each use case: single task, story waves, epic, saga with parallel epics, conflict/escalation paths, status/cleanup/gc |
-| 19.8 | "No models" tests: end-to-end through the **real omp harness with a scripted mock model provider** (no paid models), covering isolation, merges/conflicts/escalations, saga/epic launches, restart, gc |
-| 19.9 | Repo rules hydration: omp does not put AGENTS.md in subagent context, so the factory hydrates repo rules itself for architect and every implementer-chain agent, verified end-to-end per role |
-
-### Item 20 — architect context economy — `docs/factory.v2.md:114-120`
-
-| # | Requirement (condensed) |
-|---|---|
-| 20a | Compact the architect session **before a resume that will miss the provider prompt cache** (TTL expired / model switched), so an uncached resume does not re-pay full history |
-| 20b | Keep the prompt cache **warm while the architect is on standby** between turns, when cheaper than expected uncached resume; leverage omp mechanics |
-| 20-cost | Decide defaults by **measured cost** (usage / cache-read tokens in records); each mechanism configurable, explicitly off where it does not pay |
-| 20-plan | Re-evaluate v2's **schema-bound architect plan** against v1's schema-free telegraphic output + PM structuring (an expensive repair turn was observed) |
-| 20c | Session launching must **never break the provider prompt cache**: additive sessions only, never rewrite a transcript, prompt prefixes byte-stable across turns (no timestamps/random/temp-path interpolation into the cached prefix), generated omp overlay byte-stable for the same config |
-| 20d | Optional optimizations only after 20c holds: focused compaction/handoff summaries on resume, IRC escalation reply, restart — measured and configurable/off by default |
-
----
-
-## 2. Module map
-
-### 2.1 Layout and responsibilities
-
-| Area | Files | Responsibility relevant to 19/20 |
-|---|---|---|
-| CLI | `plugins/software-factory/src/cli/{dispatch,run,preflight,status,steer,init,lock}.ts`, `bin/factory.ts` | Only `init|preflight|status|steer|run`; `run` = preflight → lock → engine; `status` is one-task |
-| Engine | `src/core/engine.ts` (835 lines) | `runTask` main loop, `runChildTask` (epic in-process), start-up repair, simple path, task worktree bootstrap, epic wiring |
-| Iteration/waves | `src/core/flows/iteration.ts` (3978 lines) | plan → review → PM → waves → wave-end merges → close-up → wave report; architect session id threading; consults/redrives |
-| Item machine | `src/core/flows/item-machine.ts` (1113 lines) | per-item step sequence, fix rounds, consults, terminal states |
-| Merge path | `src/core/flows/merge-path.ts` (422 lines) | per-item merge under a parent-keyed merge lock; conflict → `integrate`; gates/verify; attempt ledger |
-| Consults | `src/core/flows/consults.ts` | architect item/non-item/concern consults (decision artifact), resume architect session |
-| Epic propagation | `src/core/flows/epic-propagation.ts` | child concerns/remarkables/questions pushed to parent store/mailbox (`q-epic-*`) |
-| Step runner | `src/core/flows/step-runner.ts` (1437 lines) | single agent turn: prompt, session reuse, record commit, checks, session-loss rehydration, transient retries |
-| Git | `src/core/git/{worktrees,naming,merge,commit,repair,status,repo,exec,cleanliness,diff}.ts` | engine-managed worktrees, branch naming, merges, commits, HEAD guard, repair |
-| Derive | `src/core/derive/{task,item,wave}.ts` | derived state from committed records + git (idempotent, restart-safe) |
-| Records | `src/core/records/*` | YAML IO, step records, schema cache, repair, citations |
-| Checks/gates | `src/core/checks/{gates,runner,junit,types}.ts` | deterministic gates, target-green/red, baseline ratchet |
-| Config | `src/core/config/{loader,merge,validate,roles}.ts`, `config/*.yaml`, `config/schemas/*.json` | layered pipeline config, role resolution, structural validation |
-| Harness | `src/harness/types.ts`, `src/harness/omp/{harness,overlay,ndjson,classify}.ts`, `src/harness/fake/*` | one omp process per turn; NDJSON parse; overlay; fake harness for tests |
-| Prompts/agents | `agents/**`, `src/core/{prompts,prompt-vars,brief}.ts` | agent definitions, step fragments, prompt vars, architect brief |
-| Docs | `docs/{ARCHITECTURE,IMPLEMENTATION,OMP_ADAPTER,FIRE_TEST}.md`, `docs/spikes/*.md` | build contract, current-state audit, omp adapter spec, prior omp spikes |
-
-### 2.2 Execution topology today (relevant to all of item 19)
-
-1. `factory run <task>` resolves the slug, copies an INTENT path into `{orch}/{task}/INTENT.md` in the **main checkout** if needed, runs preflight, acquires a **per-task** run lock, builds `OmpHarness` and `Repo`, then calls `runTask` (`src/cli/run.ts:27-135`).
-2. `runTask` creates the task worktree on `topic/{task}` from main HEAD (INTENT committed there), repairs stray dirt, repairs item worktrees, marks interrupted records, reconciles concerns, then runs ingest/triage/infra/context-pack (`src/core/engine.ts:236-340`).
-3. Each wave runs items concurrently up to `limits.maxParallelItems`; each item gets a child worktree (`{worktreeRoot}/topic_{task}--{item}`) and is ticked by `tickItemMachine`; epic items call `runTaskChild` **in-process** (`src/core/flows/iteration.ts:2432-2480`).
-4. Wave end merges ready items serially through `mergeItem` under `repo.mergeLocks(parentBranch)`; on failure the engine consults the architect and re-drives, bounded by `merge-attempts.yaml` (`src/core/flows/iteration.ts:2706-2800`, `src/core/flows/merge-path.ts:131-170`).
-5. Epic child task = child task dir under `{parentTaskDir}/{epic}`, its own iterations/waves on branch `topic/{parent}--{epic}`, then a `child-closeup.yaml` on the parent and the epic branch merged like any item (`src/core/engine.ts:123-226`).
-6. Every agent turn is a separate omp process launched with `--cwd <worktree>`, `--config <overlay>`, `--session-dir <runtime>/sessions`, optional `--resume <id>`, `--system-prompt <file>`, `-p @<prompt-file>` (`src/harness/omp/harness.ts:356-410`).
-
----
-
-## 3. Key interfaces & signatures
-
-### Harness contract (`src/harness/types.ts:24-55`)
-```ts
-export interface Harness {
-  run(l: AgentRun): Promise<AgentOutcome>;          // one turn (fresh or resumed)
-  validateTools?(tools: string[]): Promise<string[]>;
-  complete(c: { role; models; system; prompt; schema; timeoutSec?; timeoutMs?; onModelFallback? }): Promise<unknown>;
-}
-export interface AgentRun {
-  agent; definition; prompt; role; models; tools;
-  cwd: string;                 // worktree — engine-created today
-  outputSchema; label;
-  session: { resume?: string; keep: boolean };
-  timeoutSec?; onModelFallback?; onSession?; onUsage?;
-}
-```
-`AgentOutcome` carries `sessionId`, `traceRef`, `usage`, `transcriptBytes`, `stdoutBytes`, `toolCallCount`, and failure flags `transient|sessionLost|launchError|timedOut` (`src/harness/types.ts:57-82`).
-
-### Engine entry points
-- `runTask(deps: EngineDeps, task: string, opts?: { maxTicks?; maxIterations?; lockTakeoverEvent? }): Promise<RunResult>` — `src/core/engine.ts:236-247`; `RunResult = {status: done|blocked|failed|stopped, exitCode: 0|10|1, summary}` (`:61-65`).
-- `runChildTask(deps, parent: {branch,path,taskDir}, epicSlug, opts?): Promise<RunResult>` — `src/core/engine.ts:123-226`.
-- Engine deps: `{ harness, repo, project, pipelineFor(taskDir), prompts, clock?, log?, diskSpaceProbe? }` (`src/core/engine.ts:46-54`).
-
-### Worktrees (`src/core/git/worktrees.ts`)
-- `ensureTaskWorktree(repo, task, {intentPath, orchestrationFolder}): {branch, path, created}` — first run checks cleanliness except INTENT, `git worktree add -b topic/{task} <wt> HEAD`, writes+commits INTENT; idempotent (`:47-119`).
-- `ensureChildWorktree(repo, parent:{branch,path}, slug, opts?): {branch,path,created}` — idempotent, prunes stale registrations, reuses branch, `git worktree add -b <child> <wt> <fromRef>` (`:122-168`).
-- `removeWorktree(repo, wtPath)` — removes worktree, **keeps branch** (`:170-189`).
-- `resetScratch(repo, parent, slug)` — removes branch+worktree and recreates from parent tip (`:191-224`).
-
-### Branch naming (`src/core/git/naming.ts`)
-- `taskBranch(task) => topic/{task}` (`:73-76`)
-- `childBranch(parent, item) => parent--item`, max depth 2 (`:78-101`)
-- `worktreePath(root, branch) => root/{branch with / → _}` (`:103-110`)
-- `parseBranch` → `{task, items, depth}` (`:50-70`)
-
-### Merge path (`src/core/flows/merge-path.ts`)
-- `mergeItem(params: MergeItemParams): Promise<MergeItemResult>` — `:131-422`; params include `task,item,parentBranch,taskWt,childWt,repo,harness,pipeline,project,prompts,taskDir,wave?,targetOverride?,turnsSemaphore?` (`:20-49`).
-- `MergeItemResult = {ok, sha?, error?, conflictResolved?, mergeAttempt?}` (`:51-58`).
-- `MAX_MERGE_ATTEMPTS_PER_WAVE = 2`; ledger at `items/<slug>/merge-attempts.yaml`; per-wave target override at `items/<slug>/merge-target.yaml` (`:60-128`).
-
-### CLI
-- `dispatch(args): Promise<number>` switch over `init|preflight|status|steer|run` (`src/cli/dispatch.ts:110-176`).
-- `runStatus({repoRoot, task})` — one task; resolves its single worktree (`src/cli/status.ts:26-80`).
-- `acquireRunLock(repoRoot, task, opts?)` / `isRunLockFree(...)` / `resolveRuntimeDir(repoRoot, worktreeRoot?)` (`src/cli/lock.ts:21-170`).
-
-### Config types
-- `ProjectConfig { orchestrationFolder, adrFolder?, worktreeRoot, scripts?, paths?, skillDirs? }` (`src/core/artifacts.ts:11-22`).
-- `PipelineConfig { models, agents, checks?, hooks?, flows, limits, budget?, diversity?, harness?: string, humanInvolvement?, concerns?, reviewPolicy?, criteria?, contextPack?, tools?, prompts? }` (`src/core/artifacts.ts:117-160`).
-- `TaskKind = simple|story|spike|epic|saga` (`src/core/artifacts.ts:166`).
-- `StepUsage = {inputTokens?, outputTokens?, costUsd?}` (`src/core/artifacts.ts:545-549`), recorded in every step `meta.yaml` (`:551-568`).
-
-### Derived state
-- `DerivedTaskState` (task, kind, status `active|blocked|done|failed`, iteration, currentWave, items/itemMap, waves, debt, budget/spend maps, runningSteps, concerns, openSteerQuestions, strandedItems, failureDetails) — `src/core/derive/task.ts:60-85`.
-- `deriveTaskState({taskDir, task, parentBranch?, taskWt, pipeline?, project?})` — `src/core/derive/task.ts:140-147`.
-- `DerivedItemState.status = pending|running|ready|merged|failed|blocked|superseded` — `src/core/derive/item.ts:41`.
-
----
-
-## 4. Relevant excerpts
-
-### 4.1 Engine-managed task worktree (the `isolation: engine` backend to preserve)
-`plugins/software-factory/src/core/git/worktrees.ts:47-119`:
-```ts
-// first run: main checkout must be clean except INTENT
-const dirty = findDirtyEntries(entries, { orchestrationFolder, currentIntentPath: relIntent });
-if (dirty.length > 0) throw new Error(`Main checkout is dirty ...`);
-...
-await repo.writeLock.runExclusive(() =>
-  git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, "HEAD"])
-);
-```
-Idempotence and stale-registration pruning are explicit (`:14-44`, `:60-72`, `:126-168`). This is the code the spec's `isolation: engine` option must keep behind a config switch.
-
-### 4.2 Epic child task is in-process (the model to replace for sagas)
-`plugins/software-factory/src/core/engine.ts:123-145`:
-```ts
-export async function runChildTask(deps, parent, epicSlug, opts?) {
-  const parentBranch = parent.branch;
-  const childBranchName = childBranch(parentBranch, epicSlug);
-  const childWtInfo = await ensureChildWorktree(repo, parent, epicSlug);
-  const childTaskDir = path.join(childWt, orchFolder, parentTaskSlug, epicSlug);
-```
-Child iterations run on `parentBranch = childBranchName` (`:166-182`); then concerns propagate, `child-closeup.yaml` is written on the parent, and the parent branch commits the record (`:186-212`). The child is launched from the wave loop only when `it.kind === "epic" && runTaskChild` (`src/core/flows/iteration.ts:2440-2450`), wired in `runTask` at `src/core/engine.ts:750-767`. `docs/IMPLEMENTATION.md:150-173` states the saga gap explicitly: *"NOT IMPLEMENTED: saga launches do not exist in code … no saga launcher/loop exists … defers this to the `omp-workspaces` fire-test goal."*
-
-### 4.3 Wave-end merge, gates, and the current "merger"
-`plugins/software-factory/src/core/flows/merge-path.ts:176-245` — on parent→child conflict the engine runs an `integrate` step with:
-```ts
-stepId: "integrate", stepFragment: "steps/integrate",
-agent: "developer", role: "workhorse",   // <-- no dedicated wave-end merger agent
-```
-Then `concludeMerge` commits the resolution (engine stages, agent may not run git writes). If the tree changed, gates and target-green run (`:246-380`); any failure returns `ok:false` with evidence. Success merges child into parent with `--no-ff`, removes the worktree (branch kept), runs `after:item.merge` hooks (`:381-422`).
-
-The wave loop calls this per ready item, then on failure calls `redriveMergeAfterConsult` which runs an architect consult and retries the merge, bounded by the attempt ledger: `src/core/flows/iteration.ts:2706-2800` (call), `:650-710` (helper). The consult input has assignment/priorAttempts/diff/feedback/debt/contextPack only — **no worktree or branch pointer**: `src/core/flows/consults.ts:110-136`; prompt fragment `agents/steps/architect-consult-item.md:1-40`. The status block the architect sees also lacks workspace/branch: `src/core/flows/iteration.ts:177-215`.
-
-### 4.4 Preflight — what is actually verified today
-`plugins/software-factory/src/cli/preflight.ts:129-235` loads project config, warns on linter configs, checks first-run cleanliness (only when the task branch does not exist), loads/validates the layered pipeline, checks disk space (`limits.minFreeDiskMb`). `:250-290` resolves roles/aliases and checks agents reference declared roles. `:292-360` renders prompt fragments and compiles all schemas. `:364-394` validates omp:
-```ts
-execFileSync(ompBinary, ["--version"], ...);
-writeOmpConfigOverlay(pipelineConfig, tempOverlay);
-execFileSync(ompBinary, ["--config", tempOverlay, "--version"], ...);
-```
-with a hard-coded last-resort path `/home/slava/.bun/bin/omp` (`:365-369`). `:399-414` checks the per-task run lock. There is **no isolation round-trip, no cross-check of branches/worktrees against records, and no model-name resolution against omp** (only role alias resolution).
-
-### 4.5 CLI/status/lock — single-task today
-`src/cli/status.ts:26-80` resolves one task dir (task worktree if present, else main), calls `deriveTaskState`, and prints worktree/config/budget/running steps/waves/items/questions/debt (`:59-170`). `src/cli/lock.ts:21-44` puts runtime state at `{worktreeRoot}/.factory-runtime`; locks at `{runtimeDir}/locks/{task}.lock` (`:45-55`); `isRunLockFree` and `acquireRunLock` implement same-host dead-PID takeover (`:57-246`). There is no task enumeration anywhere in `src/cli` (only `readdir` of config/schema dirs, `src/cli/preflight.ts:74,349`), so whole-tree status has no existing discovery layer.
-
-### 4.6 Harness launch and cache-relevant transport
-`src/harness/omp/harness.ts:286-300` — system prompt path is deterministic per agent+session:
-```ts
-const sessionKey = (run.session?.resume ?? "fresh").replace(...);
-const systemPromptPath = path.join(systemPromptsDir, `${sanitizedAgent}-${sessionKey}.md`);
-fs.writeFileSync(systemPromptPath, agentBody, "utf8");
-```
-`src/harness/omp/harness.ts:311-316` — prompt file name **embeds timestamp + randomness on every turn**:
-```ts
-const promptPath = path.join(promptsDir, `prompt-${Date.now()}-${Math.random()...}.txt`);
-```
-Args (`:368-388`): `--cwd run.cwd --config overlay --mode json --model <@role> --session-dir <dir> [--resume id] --tools=... --system-prompt <file> -p @<promptFile>`. Spawn cwd is the worktree (`:400-410`). No isolation/worktree flag is passed.
-
-`src/core/flows/step-runner.ts:606-620` decides session reuse (`keep = sessionMode==="reuse"`, resume interrupted record or existing id); on `sessionLost` it retries once with a fresh session and the **full prompt**, not a rehydrated prefix (`:967-1000`); `PersistentAgent` does the same with an optional `rehydrate()` prefix (`src/core/sessions.ts:110-138`).
-
-### 4.7 Architect planning, brief, wave report
-- Plan turn: fresh plan or reuse session; `buildArchitectBrief` is called for a fresh brief even on resume (`src/core/flows/iteration.ts:1155-1235`); plan step uses `sessionMode: "reuse"`, `existingSessionId: architectSessionId`, fragment `steps/architect-plan` (`:1223-1290`). A limits violation triggers one resumed repair turn on the same session (`:1299-1370`).
-- Wave report resumes the architect, injects `plan/waveReport/debt/steering/contextPack/taskStatus`, and the report fragment decides continue/amend/end (`:3089-3180`).
-- `buildArchitectBrief` = deterministic one-line skeleton + a `@simpler` relevance judge returning `{include:[ids]}`, fail-open to the full skeleton (`src/core/brief.ts:1-14`, `:340-420`). This is the existing **cheap handoff** mechanism that item 20a/20d can build on.
-- Architect output is schema-bound: `agents/steps/architect-plan.md:20` ("yield the plan matching `plan.schema.json`"); `config/schemas/plan.schema.json:4-6` requires `iteration, milestones, itemOutlines`; PM then structures item edits from plan outlines (`agents/steps/pm-edits.md:1-25`, `src/core/plan/apply.ts:1-16`).
-
-### 4.8 Usage/cost parsing drops cache tokens
-`src/harness/omp/ndjson.ts:84-98`:
-```ts
-const u = event.message.usage;
-this.inputTokens += u.input || 0;
-this.outputTokens += u.output || 0;
-const costVal = u.cost?.total ?? ((u.cost?.input || 0) + (u.cost?.output || 0));
-this.costUsd += costVal || 0;
-```
-`cacheRead`, `cacheWrite`, `totalTokens`, and cost sub-fields are ignored; `src/harness/omp/ndjson.ts:170-178` emits only `{inputTokens, outputTokens, costUsd}`; `src/core/artifacts.ts:545-549` and `src/core/budget.ts:34-48` sum only those three. The raw omp NDJSON **does** carry them: fixtures `test/fixtures/omp/turn-fallback.ndjson:7` (`"cacheRead":0,"cacheWrite":0,...cost.cacheRead`), and the prior spike documents `usage.cacheRead` as available (`docs/spikes/omp-2-cli-adapter.md:100-104`). So 20-cost cannot be implemented without extending `Usage`/`StepUsage` and the parser (and updating records/budget tests).
-
-### 4.9 Commit content is engine-authored
-`src/core/git/commit.ts:9-30` — `commitAll(repo, wt, message, {allowEmpty?, paths?})`; `paths` is the available scope mechanism. Call sites invent messages: step records `factory(...): <step> aN [started|error|rejected|session]` (`src/core/flows/step-runner.ts:697-760`, `:572`, `:807`, `:1400-1410`), plan edits `factory: apply plan edits iteration N` (`src/core/flows/iteration.ts:1914,1944`), epic close-up `factory: record epic <slug> child status ...` (`src/core/engine.ts:209`), merge `factory: merge item <slug>` (`src/core/flows/merge-path.ts:384-390`). Agent output schemas carry `summary` (`config/schemas/review.schema.json:6-12`, `config/schemas/developer-output.schema.json:6-14`) but no commit message/scope field.
-
-### 4.10 Concern propagation and escalation vocabulary
-`epic-propagation.ts:20-33` documents "Epic-to-saga concern push": open/routed child concerns + open remarkables are condensed, questions with `blocks` are forwarded to the parent mailbox as `q-epic-<epic>-<id>` (`:116`). The actual parent is the enclosing task; there is no distinct saga architect. `buildTaskStatusBlock` lists items/waves/merged/blocked/failed and both task/root question dirs (`src/core/flows/iteration.ts:195-220`).
-
-### 4.11 Config surface where `isolation` must land
-- `config/schemas/pipeline.schema.json:6-7` requires `models, agents, flows, limits`; `:208-210` declares `harness` as a **string**; `:305` sets root `additionalProperties: false`.
-- `config/schemas/project.schema.json:52` is also `additionalProperties: false`.
-- `config/pipeline.default.yaml`: models/roles `:40-104`, agents `:106-141`, checks/hooks `:172-195`, flows `:241-330`, limits `:342-390`, harness `:406`, humanInvolvement `:449`.
-- Loader merge/validate: `src/core/config/loader.ts:68-150` (defaults → project → task → overrides, AJV, structural).
-So adding `isolation` (or changing `harness` to an object) requires schema + `PipelineConfig` type + default YAML + overlay generation, or it fails validation at load.
-
-### 4.12 Existing omp cache/compaction knobs are config-only
-`src/harness/omp/overlay.ts:26-100` emits only `modelRoles`, `retry.*`, `eval.autoBackground`, `title.generator`, `checkpoint.enabled`, `advisor`, `bash.gitGuard/allowCompoundCommands`, `mnemopi.*`, `update.auto`. It emits **none** of the omp keys discovered in §5 (`isolation.backend`, `task.isolation.*`, `worktree.*`, `compaction.*`, `providers.cacheWarming/cacheRetention`). Overlay is regenerated per turn from the effective pipeline (`src/harness/omp/harness.ts:222-240`).
-
----
-
-## 5. omp isolation mechanics — evidence log
-
-### 5.1 Prior research (repository docs)
-- `docs/spikes/omp-1-topology.md:189-215` — empirical comparison:
-  - omp `isolated: true` hardcodes branch `omp/task/<agentId>`, has no `cwd`, needs `apply:false` (not `merge:false`) to avoid applying to parent, and **"if the subagent fails or rejects (`exitCode !== 0`), `commitToBranch` is completely skipped; no branch commits are captured on failure/rejection, and the temporary isolation worktree is deleted"** (`:196-201`).
-  - Engine-created `git worktree add -b topic/x/y` + `omp --cwd <wt>` keeps **all** files/commits regardless of exit status (`:205-213`).
-  - Recommendation: hybrid external Bun CLI + omp headless adapter with engine-managed worktrees (`:347-395`).
-- `docs/spikes/omp-2-cli-adapter.md:114-158` — `--session-dir` + `--resume` append to the same transcript; cwd persists in the session header; model switch on resume is allowed. `:160-218` — overlay with `modelRoles`, fallback chains, unattended switches; `:245-270` — four concurrent omp processes in four worktrees, no lock contention, ~0.8–1.2 s startup, SIGTERM 143 with partial session flush.
-- `docs/OMP_ADAPTER.md:164-172` — cache-safety audit claim: additive resumes, byte-stable system prompt content, "only transport filenames embed timestamps", deterministic overlay. **It does not test omp's cache keying; it flags `--system-prompt` path-keying as unknown.**
-
-### 5.2 Fresh read-only probes on the installed omp 18.18.5
-These are execution probes (no repository edits, no omp config writes):
-
-| Probe | Result |
-|---|---|
-| `omp --version` | `omp/18.18.5` (README requires v18.17.0+: `plugins/software-factory/README.md:14-18`) |
-| `omp config get isolation.backend --json` | `{"value":"rcopy","type":"enum","description":"Backend used for subagent isolation and worktree cloning"}` — **no enum values exposed** |
-| `omp config get task.isolation.*` | `enabled=true`, `apply=true` ("apply successful isolated task changes to parent"), `merge="branch"` (patch apply or branch merge), `commits="ai"` (generic or AI-generated commit messages) |
-| `omp config get worktree.*` | `base` unset → `~/.omp/wt`; `onStart=off`; `onExit=remove`; `clone=true` (copy-on-write clone so `node_modules`/`target` carry over); `cleanSource=false`; `session.worktreeScope=repo` |
-| `omp worktree --help` | `omp worktree [list|clear|add] [PATH] [COMMIT]` with `-b/-B/-C`, `--dry-run`, `--all`, `--json`. `clear --dry-run` prints what would be removed; `add -b feature ../path` creates a branch+worktree |
-| `omp worktree list --json` | Entries carry `{path, kind:"task-isolation", orphanReason:"task-isolation leftover (no live task owns it)"}` — omp already has orphan classification |
-| `omp --config <overlay with bogus keys including isolation.backend: definitely-not-a-backend> --version` | Prints `18.18.5`, **exit 0** — this probe validates nothing about overlay keys/values |
-| `omp --config <overlay with title.generator:none, compaction.idleEnabled:true> config get title.generator` / `compaction.idleEnabled` | `tiny` / `false` — `omp config get` reports **persisted** config and ignores `--config`; it cannot be used to validate an overlay |
-| `omp config list --json` (filtered) | `compaction.enabled=true`, `compaction.asyncEnabled=true`, `compaction.idleEnabled=false`, `compaction.idleThresholdTokens=200000`, `compaction.idleTimeoutSeconds=300` ("with a 1-hour prompt cache, compaction instead runs just before the cache expires"), `compaction.keepRecentTokens=20000`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.handoffSaveToDisk=true`, `compaction.dropUseless=true` ("cache-aware"), `compaction.supersedeReads=true` ("cache-aware"), `providers.cacheRetention=short`, `providers.cacheWarming=streaming` ("Re-send the last request with a one-token output budget shortly before its prompt-cache entry expires"), `display.cacheMissMarker=true` |
-| `omp models --help` | Supports `-e/--extension` and `--config` when listing models — the plausible seam for a scripted provider extension |
-| `omp --help` | No `--isolated`/isolation flag; isolation is config-driven. `--cwd`, `--session-dir`, `--resume`, `--config`, `--system-prompt`, `--no-session`, `--no-tools`, `--tools`, `--extension` exist |
-
-### 5.3 What this proves / does not prove
-
-**Proven:**
-- omp exposes a configurable isolation backend (`isolation.backend`, default `rcopy`) and per-task isolation controls; the phrase in its own description ties the backend to *"subagent isolation and worktree cloning"*, i.e. it governs omp-managed worktrees as well as subagent tasks.
-- omp has first-class worktree lifecycle commands (`worktree add|list|clear --dry-run`) with ownership/orphan metadata — a ready-made primitive for `cleanup`/`gc` of omp workspaces.
-- omp exposes native compaction and prompt-cache-warming knobs, which item 20 can configure instead of building from scratch.
-- `omp --config … --version` is not a config validator; `omp config get` cannot see an overlay.
-
-**Not proven (spike items):**
-- The allowed values of `isolation.backend` and whether `rcopy`/others affect retention on failure; whether `omp worktree add` honors it exactly like subagent task isolation.
-- Whether a **root** omp process launched with `--cwd <omp-created worktree>` can use `isolated: true` meaningfully (factory agents do not spawn subagents; prompts forbid it), i.e. which omp mechanism maps to "workspace isolation" for factory agents.
-- Whether omp `--config` fully accepts these keys at runtime (no validation error ≠ applied; `config get` ignores overlays, so only a real turn can prove it).
-- Whether omp prompt caching keys on content or on transport path (`--system-prompt <path>`, `-p @<timestamped-path>`), which determines item 20c.
-- How to register a scripted mock provider (extension API shape, catalog registration, streaming NDJSON contract).
-
----
-
-## 6. Gap matrix — spec bullet vs current state
-
-| Spec | Current state (evidence) | Missing work | Likely touchpoints |
-|---|---|---|---|
-| 19.1 isolation backend default + `isolation: omp|engine` + spike | Engine-only worktrees; no isolation key in schema/types/overlay; harness passes no isolation flags (`src/core/git/worktrees.ts:47-224`, `src/harness/omp/harness.ts:368-388`, `config/schemas/pipeline.schema.json:208,305`) | Spike + config field + backend abstraction (create/remove/retain workspace) + overlay keys + preflight compatibility | `src/core/engine.ts:266-272`, `src/core/flows/iteration.ts:2455-2470`, `src/core/git/worktrees.ts`, new workspace module, `config/pipeline.default.yaml`, `config/schemas/pipeline.schema.json`, `src/harness/omp/overlay.ts` |
-| 19.2 preflight | Version + inert overlay check, role aliases, prompts/schemas, disk, per-task lock (`src/cli/preflight.ts:129-414`) | Isolation round-trip; real model/role resolvability; branches/worktrees-vs-records consistency; harness binaries beyond omp; remove hard-coded omp fallback | `src/cli/preflight.ts`, `src/core/git/{status,worktrees}.ts`, `src/core/config/roles.ts` |
-| 19.3 whole-tree status / cleanup / gc + lock refusal | `status` one task; no `cleanup`/`gc` commands; per-task locks; runtime dirs `sessions/`, `prompts/`, `system-prompts/` never purged (only `tmp/` is: `src/core/runtime-tmp.ts:16-45`); orphan detection helpers partially exist (`parseWorktreeList` `src/core/git/status.ts:64-71`, `removeWorktree`) | Task/workspace index derived from records+git; saga/epic parent links; active-agent workspace+branch; cleanup semantics; gc orphan worktrees/branches/runtime/locks, dry-run default; lock guard across the whole tree | `src/cli/dispatch.ts:110-176`, `src/cli/status.ts`, `src/cli/lock.ts:21-95`, new `src/cli/{cleanup,gc}.ts`, `src/core/derive/task.ts`, `src/core/git/status.ts` |
-| 19.4 commits from agent output | All messages engine-authored; `commitAll` accepts message + `paths` scope only (`src/core/git/commit.ts:9-30`; call sites in §4.9) | Commit message/scope fields in output schemas + prompts; thread them to step/merge commits; fallback rule (engine may only use agent-provided or mechanical text) | `config/schemas/review.schema.json`, `config/schemas/developer-output.schema.json`, `agents/steps/review.md`/`develop.md`, `src/core/flows/step-runner.ts:714-760`, `src/core/flows/merge-path.ts:381-422` |
-| 19.5 wave-end merge + workhorse merger + escalation pointers | Merge already runs at wave end with deterministic gates; conflict handled by `developer` step `integrate`; failure → architect consult with evidence but no status/worktree/branch pointer; attempts bounded 2/wave (`src/core/flows/merge-path.ts:176-422`, `src/core/flows/iteration.ts:2706-2800,650-710`, `src/core/flows/consults.ts:110-136`) | Dedicated workhorse-class wave-end merger agent (trivial conflicts only) + prompt fragment; escalation payload with one-command status pointer and worktree+branch; contract tests | new `agents/wave-merger.md` + step fragment, `src/core/flows/merge-path.ts`, `src/core/flows/consults.ts`, `agents/steps/architect-consult-item.md`, `src/core/flows/iteration.ts:177-215` |
-| 19.6 saga independent launches, parallel epics, escalation split | `saga` only a `TaskKind` (`src/core/artifacts.ts:166`, `config/schemas/triage.schema.json`); epics in-process (`src/core/engine.ts:123-226`); epic INTENT written under the **parent task dir on the parent branch** (`src/core/plan/apply.ts:9-16`), so `factory run <epic>` cannot resolve it from main; `q-epic-*` goes to the enclosing task, not a saga architect (`src/core/flows/epic-propagation.ts:20-33,116`) | Saga launcher (spawn independent `factory run` per epic in its own workspace), parent/saga identity+links, per-workspace locks, saga wave-end merge/escalation to saga architect, concern funnel upward | new saga/workspace orchestration module, `src/cli/run.ts:55-135`, `src/cli/dispatch.ts`, `src/core/flows/epic-propagation.ts`, `src/core/git/naming.ts:73-101` |
-| 19.7 docs per use case | Existing ARCHITECTURE/IMPLEMENTATION/OMP_ADAPTER/FIRE_TEST; no use-case doc; docs sentinel test convention exists (`test/docs-concerns.test.ts:1-50`) | New/updated docs for single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc + sentinel test | `plugins/software-factory/docs/*`, `test/docs-*.test.ts` |
-| 19.8 no-model e2e through real omp | Only `FakeHarness` engine tests + one live smoke gated by `FACTORY_LIVE_OMP=1` (`test/harness/smoke-live.test.ts:9-12`); harness can take an alternative `ompBinary` (`src/harness/omp/types.ts:4-15`, precedent `test/engine/model-fallback.test.ts:44-53`) | Scripted mock model provider usable by real omp; e2e scenarios (isolation, merges/conflicts/escalations, saga/epic launches, restart, gc) without paid models | new harness test fixture/provider extension, `test/e2e/**`, `OmpHarness` options, possibly `src/harness/omp/overlay.ts` |
-| 19.9 repo rules hydration | No `AGENTS.md`/rules handling anywhere in `src/` (grep); `PROMPT_VAR_DESCRIPTIONS`/`KNOWN_VARS` have no repo-rules var (`src/core/prompt-vars.ts:9-60`) | Deterministic repo-rule resolution from target repo; inject into architect + developer/qa/reviewer prompts across items/epics; verify per role | `src/core/prompts.ts`, `src/core/prompt-vars.ts`, `src/core/flows/step-runner.ts`, `agents/*.md`, preflight render checks |
-| 20a compact before uncached resume | No cache awareness; resume threads a session id; on loss it starts fresh with full prompt (`src/core/flows/step-runner.ts:967-1000`); a deterministic brief already exists (`src/core/brief.ts:1-14,340-420`); omp `compaction.*` exists but is unused | Detect cold-cache resume (TTL/model switch), compact or switch to fresh+hydrated brief, measure cost delta | `src/harness/omp/harness.ts:286-351`, `src/core/flows/step-runner.ts:606-620`, `src/core/brief.ts`, `src/harness/omp/overlay.ts` |
-| 20b warm cache on standby | Architect process exits every turn; no standby; `providers.cacheWarming` unused | Decide mechanism (long-lived/keepalive process vs omp warming config), measure vs uncached resume, config gate | `src/harness/omp/harness.ts`, `src/core/flows/iteration.ts` (architect turns), overlay |
-| 20c cache-coherence audit | Additive `--resume`; deterministic system-prompt path; **timestamp+random prompt path every turn** (`harness.ts:311-316`); overlay regenerated per turn from config (`harness.ts:222-240`); no byte-stability test | Audit omp cache keying; make transport paths stable or prove content keying; add byte-stability tests for overlay/system prompt/prompts across turns | `src/harness/omp/harness.ts`, `src/harness/omp/overlay.ts`, `test/harness/*` |
-| 20d optional optimizations | None | Handoff/compaction on resume, IRC escalation reply, restart | `src/core/brief.ts`, `src/core/flows/step-runner.ts`, overlay |
-| 20-cost measurement | `Usage`/`StepUsage` only input/output/cost; parser drops `cacheRead/cacheWrite/cost.cacheRead` (`ndjson.ts:84-98,170-178`, `artifacts.ts:545-549`, `budget.ts:34-48`) | Add cache token fields end-to-end + records/derive/status/budget aggregation; use for defaults | `src/harness/types.ts:7-11`, `src/harness/omp/ndjson.ts`, `src/core/artifacts.ts:545-549`, `src/core/budget.ts`, `src/core/derive/task.ts`, `config/schemas/state.schema.json` |
-| 20-plan schema-free architect vs PM structuring | Plan is schema-bound (`config/schemas/plan.schema.json`, `agents/steps/architect-plan.md:20`); PM already structures outlines into scheduled items (`agents/steps/pm-edits.md:1-25`) | Re-evaluate from measured plan-repair turns; possibly telegraphic plan + PM structuring of plan/edits | `agents/steps/architect-plan.md`, `agents/steps/pm-edits.md`, `src/core/plan/*`, `config/schemas/*` |
-
----
-
-## 7. Existing tests & conventions
-
-**Runner and gates**
-- `bun test` (Bun test runner, no config file), `bun run typecheck` (`tsc --noEmit`) — `plugins/software-factory/package.json:11-13`; strict TS incl. `noUncheckedIndexedAccess` (`plugins/software-factory/tsconfig.json`). The repo's own gate hints are in `.factory/project.yaml` `scripts.setup/typecheck/test`.
-- Tests live under `test/**/*.test.ts` and import source directly; no mocks for git or filesystem.
-
-**Core helpers**
-- `createTmpRepo()` builds a real temporary git repo, tracks worktrees, commits with fixed identity, and cleans up on exit (`test/helpers/tmp-repo.ts:1-90`).
-- `FakeHarness` scripts outcomes **by exact `AgentRun.label`**, records all calls, models sessions and `sessionLost` (`src/harness/fake/fake-harness.ts:35-125`). This is how all engine-level behavior tests avoid models.
-- Worktree behavior is tested against real git: `test/git/worktrees.test.ts:1-60` (first-run cleanliness, idempotence, child worktrees, removal preserving branch).
-
-**Behavior test patterns relevant to 19**
-- Epic execution end-to-end with FakeHarness, asserting branch existence, child-closeup, derived item status `merged`, and merged file content: `test/engine/epic-child-task.test.ts:78-218`.
-- Merge conflict → integrate resolution: `test/engine/merge-conflict.test.ts:1-50`; merge gate evidence/attempt ledger: `test/engine/merge-gate-evidence.test.ts`; redrive/stranded: `test/engine/merge-redrive-stranded.test.ts`.
-- Crash/restart record repair: `test/engine/crash-restart.test.ts:1-50`; derived state: `test/engine/derive-gaps.test.ts`.
-- CLI output/exit conventions: `test/cli/cli.test.ts:1-70` (arg parsing, lock lifecycle), `test/cli/status-concerns.test.ts:1-50` (capture `console.log/error` into a string, assert sections).
-- Docs closure sentinel: `test/docs-concerns.test.ts:1-50` — asserts needles inside named doc sections/YAML commentary blocks so docs edits are test-enforced. Reuse this for the 19.7 use-case docs.
-- Live omp tests are opt-in only: `FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts` (`test/harness/smoke-live.test.ts:9-12`).
-- Process-level harness tests substitute a mock `ompBinary` shell script (`test/engine/model-fallback.test.ts:44-53`, `test/harness/omp-harness.test.ts:84-90,286-311`) and assert classification/timeout/session behavior. For 19.8 this is the precedent for a scripted provider, but the spec requires going through **real omp**, so a mock *binary* alone will not satisfy it.
-
-**Conventions to follow**
-- Behavior tests only: assert committed records, `journal.ndjson` events, git graph/worktree state, CLI output — not private helpers.
-- Every engine decision is journaled (`appendJournal`) and records are committed before/after each step; new features should add journal events + record artifacts so restart/derive tests can prove idempotence.
-- Schemas are draft-07 with `additionalProperties:false`; optional new fields are backward-compatible, required fields are not.
-- Preflight validates every prompt fragment against `KNOWN_VARS` and renders with sample vars (`src/cli/preflight.ts:292-360`), so new prompt variables/fragments must be registered in `src/core/prompt-vars.ts`.
-
----
-
-## 8. Open questions & spike outlines (for the architect)
-
-### Isolation semantics (must settle before 19.1 design)
-1. **Isolation backend contract.** `isolation.backend` is an enum defaulting to `rcopy`; what are the values, and does it control (a) subagent task isolation only, (b) `omp worktree add` cloning, or both? Probe candidate: throwaway profile (`--profile`) + `config set`, then a temp repo `omp worktree add -b topic/probe <tmp> HEAD`, inspect branch/commits, then `omp worktree clear --dry-run`.
-2. **Retention on failure.** Prior spike proves `isolated:true` discards branch commits on non-zero exit (`docs/spikes/omp-1-topology.md:201`). Does an omp-managed worktree via `omp worktree add` + `omp --cwd` retain everything like engine worktrees? Test with a failing/aborted turn.
-3. **Root-process isolation.** Factory agents are top-level omp processes, not omp subagents. Which omp mechanism is the "workspace" for such a process — `omp worktree add` + `--cwd`, `--add-dir`, or `task.isolation`? Document the mapping and the fallback to `isolation: engine`.
-4. **Merge-back ownership.** omp has `task.isolation.{apply,merge,commits}`; the spec still requires deterministic CI gates and wave-end merger. Decide whether omp ever performs the merge (then gates) or only creates workspaces and the engine keeps merging. Evidence needed: can omp's `commits: ai` produce a usable message from structured output, or is it generic?
-5. **Config validation.** `omp --config ... --version` accepts bogus keys (probe), and `omp config get` ignores overlays. A real preflight round-trip must actually launch omp. Define the cheapest safe probe (e.g. `omp -p --no-session --tools= --model @role "reply OK"` in a temp clone, or an `omp worktree add`-based round-trip).
-6. **Model/role resolvability.** `omp models ls --json` (with `-e`) may enumerate catalogs; overlays define `modelRoles`. Determine whether any CLI validates `--model @role` + overlay without a paid turn; otherwise preflight can only resolve roles structurally (current behavior) plus a first-turn fallback.
-
-### Lifecycle (19.3)
-7. **Index source.** Derive the whole tree on demand from `{orch}/*/INTENT.md`, `items/*/child-closeup.yaml`, `journal.ndjson`, task dirs and `git worktree list --porcelain` (`parseWorktreeList`, `src/core/git/status.ts:64-71`), or persist a registry file? The spec says "derived from records + git" and "idempotent", which favors on-demand derivation; a registry risks drift.
-8. **Parent links.** Epic child dirs are nested under the parent task dir but live on the parent branch; saga→epic links are only implicit in `plan.epics` (`config/schemas/plan.schema.json:85-95`) and `child-closeup.yaml`. Define the link record used by status/gc/escalation.
-9. **Cleanup vs gc semantics.** `cleanup` = finished (merged/done) workspaces; `gc` = orphaned worktrees/branches/runtime files/stale locks, dry-run default. Which branches are deletable (merged only? superseded? failed after N days?), and how to treat omp-managed worktrees (`kind: task-isolation`, `orphanReason`) vs engine worktrees. `removeWorktree` keeps branches (`worktrees.ts:170-189`); `omp worktree clear` removes omp-owned ones.
-10. **Lock refusal across a tree.** Locks are per task (`src/cli/lock.ts:45-55`). Whole-tree commands must refuse if *any* run lock is live; parallel epics need per-workspace locks plus a saga-level coordination lock (merge/status writes). Dead-PID takeover exists only per file (`:57-95,109-246`).
-
-### Saga (19.6)
-11. **Launch mechanics.** Each epic = independent `factory run` in its own workspace. Today `factory run <epic>` cannot resolve an epic INTENT because `resolveTaskSlug`/`runFactory` copy INTENT from the **main checkout** into `{repoRoot}/{orch}/{epic}/INTENT.md` (`src/cli/run.ts:27-75`), while epic INTENT lives under the parent task dir on the parent branch (`src/core/plan/apply.ts:9-16`). Decide: new `factory run --parent <task> --workspace <path> <epic>` or a saga launcher that spawns children with explicit INTENT path/branch.
-12. **Process orchestration.** Who supervises child factories (exit codes 0/10/1), restarts, and parallelism? How are child stdout/journal/status surfaced to the saga status command? How do saga wave-end merges happen — the saga architect merges epic branches onto a saga branch, or epics merge directly to main?
-13. **Escalation split.** Inside an epic, merge escalation must reach the epic architect (currently parent task architect for all items, `src/core/flows/iteration.ts:650-710`); at saga wave end it must reach the saga architect. Define the architect-session/ownership map per workspace and how consults are routed.
-
-### Cache/compaction (item 20)
-14. **Cache-key audit.** Determine whether omp caches on message content or transport path. Concrete suspicion: the per-turn prompt file path `prompt-<ts>-<rand>.txt` (`harness.ts:311-316`) and regenerated overlay (`harness.ts:222-240`). Add a test that renders the same prompt twice and compares system-prompt bytes, overlay bytes, and argv (the only unstable part should be the prompt filename; then verify omp behavior with a live probe using `providers.cacheRetention`/`display.cacheMissMarker`).
-15. **Compaction mechanism.** omp auto-compacts inside a session (`compaction.*`); there is no CLI `compact` command in `omp --help`. To "compact before an uncached resume", decide between (a) relying on omp auto-compaction triggered before resume, (b) starting a fresh architect session with the existing deterministic brief (`buildArchitectBrief`) and recording it as the handoff, (c) a long-lived architect process. Measure cost with cacheRead/cacheWrite tokens.
-16. **Warm-on-standby.** The architect process exits after every turn; `providers.cacheWarming=streaming` only helps a live/last request. Decide whether to keep a standby process (cost) or treat warming as off by default; the spec allows "explicitly off where it does not pay".
-17. **Measurement plumbing.** Add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, and cost sub-fields to `Usage`/`StepUsage`/records/derived status before choosing defaults; update `budget.ts` aggregation and `state.schema.json` if surfaced.
-18. **Schema-free plan.** Count plan-repair turns and their cost from records (`architect-plan-*` attempts, repair records, usage) before changing the contract. The PM already structures item edits from plan outlines; the open question is whether the architect should emit telegraphic markdown for the plan itself and let PM produce both `plan` and `edits` schemas.
-
-### Repo rules (19.9)
-19. **Rule sources and precedence.** Which files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.omp/rules`?), from repo root and subdirs, and how they combine with factory agent definitions. Confirm whether omp already injects context files into a root process launched with `--system-prompt` (its config exposes `contextFiles.extra` and `--no-context-files`), to avoid double injection. Verify per role with a probe agent that must quote a sentinel rule.
-
-### No-model e2e (19.8)
-20. **Mock provider seam.** omp supports `--extension` and `omp models -e`, so a scripted provider extension is the most likely route; alternatively an OpenAI-compatible local endpoint registered via overlay if omp supports custom provider definitions. Define the canned scenario format (turn-by-turn NDJSON: text, tool calls, yield), and prove the real omp binary runs a full factory flow against it with zero paid calls.
-
----
-
-## 9. Verification commands (baseline)
-
-```bash
-cd plugins/software-factory
-bun test                       # full behavior suite
-bun run typecheck              # tsc --noEmit
-FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts   # opt-in real omp smoke (paid models)
-
-# omp mechanics probes (read-only)
-omp --version
-omp config list --json | jq 'to_entries[] | select(.key|test("isolation|worktree|compaction|cache"))'
-omp worktree list --json
-omp worktree clear --dry-run   # dry-run only
-```
-
----
-
-## 10. Notes for the architect
-
-- **Do not re-derive** the following: merge is already wave-end per item; gates/target-green already run deterministically on tree change; conflict handling exists but uses `developer/integrate`; epics are in-process and merge like items; `factory status` is task-scoped; commit messages are engine-invented; usage lacks cache tokens; omp exposes native compaction/warming/worktree-lifecycle config.
-- **Suggested epic split** (sizing only; the architect decides): (A) isolation backend + workspace abstraction + preflight round-trip + whole-tree status/cleanup/gc; (B) agent-authored commits + wave-end merger agent + escalation pointers; (C) saga independent launches + parallel epics + escalation/funnel routing; (D) cache/compaction measurement & policy; (E) no-model omp e2e harness + repo-rules hydration + use-case docs. A/B share workspace primitives; C depends on A; D is independent but benefits from A's workspace cleanup; E spans all and should land last per epic with a thin slice early (mock provider spike) to de-risk.
-- **Start with a fact-finder spike item** per the intent: it must answer questions 1–6 (§8) with throwaway temp repos and a throwaway omp profile, and produce a decision record on the omp↔engine isolation mapping before any engine code changes.
-`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
-- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
-  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
-  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
-  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
-  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
-  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
-- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
-
-## Item
-merge-setup-fix
-
-## Assignment
-{"slug":"merge-setup-fix","kind":"dev","title":"Run infra.setup in merge child worktree before gates","assignment":"Fix wave-end merge to run infra.setup in the child worktree BEFORE verify-checks. Context: wave 1 merged 0/4 — mergeItem failed with typecheck TS2688 because childWt lacks node_modules; mergeItem currently skips infra.setup (blocker c-552344216d). This fix takes effect on engine restart, not mid-run.\n\nScope: plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem only (+ new behavior tests). Mirror runInfraSetup semantics from the temp-worktree paths (gates.ts:332-335, runner.ts:796-810).\n\nSteps (tests-first, cwd=plugins/software-factory, tmp-repo fixtures, no network):\n1. Add failing behavior tests first covering: (a) infra.setup writes a marker file -> gates/snapshot observe it (setup runs before snapshotWorktree so setup-created untracked files like node_modules are NOT flagged as gate mutations); (b) empty/missing setup is a no-op and merge behaves exactly as today; (c) failing setup fails the merge with actionable evidence containing the setup command + output in the same evidence shape as gate failures.\n2. Implement: in mergeItem, execute infra.setup commands in childWt before the verify-checks phase (strictly before snapshotWorktree and before gates snapshot/run). No-op when setup is empty. On setup failure, abort merge with gate-failure-shaped evidence.\n3. Verify: run the new tests + existing merge-path/gates tests from plugins/software-factory; pass with no NEW failures beyond the accepted baseline red (test/disk-space.test.ts env-sensitive). Keep prod diff small (~80 lines hint).\n\nAcceptance: (1) marker-file test proves setup ran before gates; (2) empty-setup parity; (3) failing-setup evidence includes command+output; (4) node_modules-class untracked files created by setup are not reported as gate mutations.\n\nConstraints: dev kind, tests-first; no deps; wave-2 parallel with M2 items (self-heals node_modules via own develop-step gates); out of scope: preflight hardening, workspace backends, saga.","outlineRef":"merge-setup-fix","milestone":"m1-omp-de-risk","wave":2,"citations":["plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem","gates.ts:332-335 runInfraSetup temp-worktree path","runner.ts:796-810 runInfraSetup temp-worktree path"]}
-
-## Prior Attempts & Failures
-2 attempts recorded for develop (all rejected); next would be 3 > max 2
-
-Failing checks:
-[gates] Gate regressions: test
-
-## Current Diff
-.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml +0/-29
-.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml +0/-24
-.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml +0/-21
-.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml +0/-18
-.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml +0/-20
-.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml +0/-18
-.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml +0/-21
-.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml +0/-25
-.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml +0/-21
-.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml +0/-20
-.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml +0/-19
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/checks.yaml +31/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/input.md +91/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/meta.yaml +20/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1/output.yaml +70/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/input.md +99/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1/meta.yaml +22/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/checks.yaml +253/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/input.md +104/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/meta.yaml +20/-0
-.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/003-develop-r1-a2/output.yaml +39/-0
-.factory/tasks/omp-workspaces/journal.ndjson +0/-50
-.factory/tasks/omp-workspaces/state.yaml +20/-62
-plugins/software-factory/src/core/flows/merge-path.ts +78/-5
-plugins/software-factory/test/engine/merge-setup.test.ts +250/-0
-
-## Review Feedback
-Failing check: gates
-
-Message: Gate regressions: test
-
-Detail:
- task \"competing-takeover-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\n[factory lock] Stale run lock for task \"journal-worktree-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\nkilled 1 dangling process\n\ntest/engine/stranded-wave.test.ts:\n(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]\n  ^ this test timed out after 5000ms.\n\n# Unhandled error between tests\n-------------------------------\n250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);\n251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);\n252 |     const journal = await readJournal(deployedTaskDir);\n253 |     // No done-ness reuse shadowed either consult: both decisions recorded.\n254 |     expect(journal.filter((e) => e.type === \"step_reused\" && String((e as { step?: string }).step ?? \"\").startsWith(\"consult-loop-1\")).length).toBe(0);\n255 |     expect(journal.filter((e) => e.type === \"decision_made\" && (e as { item?: string }).item === \"loop-1\").length).toBe(2);\n                                                                                                                         ^\nerror: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 0\n\n      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)\n-------------------------------\n\n\n 667 pass\n 2 skip\n 2 fail\n 1 error\n 3763 expect() calls\nRan 671 tests across 102 files. [253.72s]\n[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]",
-    "failingTests": [
-      "Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir",
-      "Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)"
-    ]
-  }
-]
-
-Output tail:
-7:37)
-(fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir [37.70ms]
-
-test/cli/cli.test.ts:
-[factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
-[factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
-[factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
-killed 1 dangling process
-
-test/engine/stranded-wave.test.ts:
-(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]
-  ^ this test timed out after 5000ms.
-
-# Unhandled error between tests
--------------------------------
-250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
-251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
-252 |     const journal = await readJournal(deployedTaskDir);
-253 |     // No done-ness reuse shadowed either consult: both decisions recorded.
-254 |     expect(journal.filter((e) => e.type === "step_reused" && String((e as { step?: string }).step ?? "").startsWith("consult-loop-1")).length).toBe(0);
-255 |     expect(journal.filter((e) => e.type === "decision_made" && (e as { item?: string }).item === "loop-1").length).toBe(2);
-                                                                                                                         ^
-error: expect(received).toBe(expected)
-
-Expected: 2
-Received: 0
-
-      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
--------------------------------
-
-
- 667 pass
- 2 skip
- 2 fail
- 1 error
- 3763 expect() calls
-Ran 671 tests across 102 files. [253.72s]
-[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]
-
-## Context Pack
-# Context Pack — `omp-workspaces` (factory.v2 spec items 19 + 20)
-
-Repo: `agentic-swarm` (plugin root `plugins/software-factory`). Spec: `docs/factory.v2.md`.
-All line numbers are repo-relative and verified against the current checkout.
-
----
-
-## 0. Scope and headline
-
-The two spec items are deliberately un-implemented in v2 and are the second self-hosted fire-test goal: `plugins/software-factory/docs/ARCHITECTURE.md:40` says **"Deliberately not hand-built … Current state: engine-managed worktrees (§7), item-level integrate step, in-process epics, schema-bound architect plan, no cache/compaction management; prior omp research in `docs/spikes/`."**
-
-The engine today is a single Bun process that derives state from committed records + git, creates its own git worktrees, runs one omp process per agent turn with `--cwd <worktree>`, merges items serially at wave end, and runs epics in-process as child tasks. Items 19/20 ask to (a) move workspace isolation to omp's configurable backend by default, (b) harden preflight/lifecycle, (c) move commit content and merge escalation to agents, (d) make epics independent launches inside sagas, (e) add an audited cache/compaction policy for the architect, and (f) prove all of it with no-paid-model end-to-end tests through the real omp harness.
-
-A fresh probe of the installed `omp` (`/home/slava/.bun/bin/omp`, version `18.18.5`) shows the mechanics the spec refers to **do exist** as configuration: `isolation.backend` (enum, default `rcopy`), `task.isolation.{enabled,apply,merge,commits}`, `worktree.{base,onStart,onExit,clone,cleanSource}`, `compaction.*`, and `providers.cacheWarming` / `providers.cacheRetention`. None of these keys is used by the factory today (`plugins/software-factory/src/harness/omp/overlay.ts:26-100`). See §5 for the probe log.
-
----
-
-## 1. Acceptance definition (the two spec items)
-
-### Item 19 — workspaces, merging, lifecycle (prefer omp over DIY) — `docs/factory.v2.md:104-113`
-
-| # | Requirement (condensed) |
-|---|---|
-| 19.1 | Workspace isolation via **omp's configurable isolation backend by default**; engine git worktrees stay only as config option `isolation: omp | engine`; a spike settles backend config, branch/commit retention on failure, cwd, merge-back |
-| 19.2 | Preflight verifies: compatible omp version + config (overlay keys, isolation backend usable via a **real throwaway round-trip**), every configured model/role resolvable, target git repo state (clean, branches/worktrees consistent with records), harness binaries |
-| 19.3 | Idempotent tracking of tasks/workspaces/branches/commits derived from records + git; launchers: `status` (whole tree: saga/epics/tasks/items, workspace+branch per active agent, open questions), `cleanup` (finished workspaces), `gc` (orphaned workspaces/branches/runtime files, stale locks; **dry-run by default**); all safe when idle and **refusing while a run holds the lock** |
-| 19.4 | Commit message and scope from agents' structured output (e.g. last review before commit summarizes the change) or omp mechanics; **engine never invents content** |
-| 19.5 | Wave-end merge default: conflict-free → deterministic CI gates → merged; conflicts or red → **workhorse-class wave-end merger agent** resolves trivial conflicts → unresolvable → architect escalation carrying a pointer to overall status (one command/file) and the worktree + branch of the problematic item |
-| 19.6 | Saga: each epic runs as an **independent factory launch in its own workspace** (parallel epics possible); merges inside an epic escalate to the epic architect; merging epics at saga wave end escalates to the saga architect |
-| 19.7 | Docs show each use case: single task, story waves, epic, saga with parallel epics, conflict/escalation paths, status/cleanup/gc |
-| 19.8 | "No models" tests: end-to-end through the **real omp harness with a scripted mock model provider** (no paid models), covering isolation, merges/conflicts/escalations, saga/epic launches, restart, gc |
-| 19.9 | Repo rules hydration: omp does not put AGENTS.md in subagent context, so the factory hydrates repo rules itself for architect and every implementer-chain agent, verified end-to-end per role |
-
-### Item 20 — architect context economy — `docs/factory.v2.md:114-120`
-
-| # | Requirement (condensed) |
-|---|---|
-| 20a | Compact the architect session **before a resume that will miss the provider prompt cache** (TTL expired / model switched), so an uncached resume does not re-pay full history |
-| 20b | Keep the prompt cache **warm while the architect is on standby** between turns, when cheaper than expected uncached resume; leverage omp mechanics |
-| 20-cost | Decide defaults by **measured cost** (usage / cache-read tokens in records); each mechanism configurable, explicitly off where it does not pay |
-| 20-plan | Re-evaluate v2's **schema-bound architect plan** against v1's schema-free telegraphic output + PM structuring (an expensive repair turn was observed) |
-| 20c | Session launching must **never break the provider prompt cache**: additive sessions only, never rewrite a transcript, prompt prefixes byte-stable across turns (no timestamps/random/temp-path interpolation into the cached prefix), generated omp overlay byte-stable for the same config |
-| 20d | Optional optimizations only after 20c holds: focused compaction/handoff summaries on resume, IRC escalation reply, restart — measured and configurable/off by default |
-
----
-
-## 2. Module map
-
-### 2.1 Layout and responsibilities
-
-| Area | Files | Responsibility relevant to 19/20 |
-|---|---|---|
-| CLI | `plugins/software-factory/src/cli/{dispatch,run,preflight,status,steer,init,lock}.ts`, `bin/factory.ts` | Only `init|preflight|status|steer|run`; `run` = preflight → lock → engine; `status` is one-task |
-| Engine | `src/core/engine.ts` (835 lines) | `runTask` main loop, `runChildTask` (epic in-process), start-up repair, simple path, task worktree bootstrap, epic wiring |
-| Iteration/waves | `src/core/flows/iteration.ts` (3978 lines) | plan → review → PM → waves → wave-end merges → close-up → wave report; architect session id threading; consults/redrives |
-| Item machine | `src/core/flows/item-machine.ts` (1113 lines) | per-item step sequence, fix rounds, consults, terminal states |
-| Merge path | `src/core/flows/merge-path.ts` (422 lines) | per-item merge under a parent-keyed merge lock; conflict → `integrate`; gates/verify; attempt ledger |
-| Consults | `src/core/flows/consults.ts` | architect item/non-item/concern consults (decision artifact), resume architect session |
-| Epic propagation | `src/core/flows/epic-propagation.ts` | child concerns/remarkables/questions pushed to parent store/mailbox (`q-epic-*`) |
-| Step runner | `src/core/flows/step-runner.ts` (1437 lines) | single agent turn: prompt, session reuse, record commit, checks, session-loss rehydration, transient retries |
-| Git | `src/core/git/{worktrees,naming,merge,commit,repair,status,repo,exec,cleanliness,diff}.ts` | engine-managed worktrees, branch naming, merges, commits, HEAD guard, repair |
-| Derive | `src/core/derive/{task,item,wave}.ts` | derived state from committed records + git (idempotent, restart-safe) |
-| Records | `src/core/records/*` | YAML IO, step records, schema cache, repair, citations |
-| Checks/gates | `src/core/checks/{gates,runner,junit,types}.ts` | deterministic gates, target-green/red, baseline ratchet |
-| Config | `src/core/config/{loader,merge,validate,roles}.ts`, `config/*.yaml`, `config/schemas/*.json` | layered pipeline config, role resolution, structural validation |
-| Harness | `src/harness/types.ts`, `src/harness/omp/{harness,overlay,ndjson,classify}.ts`, `src/harness/fake/*` | one omp process per turn; NDJSON parse; overlay; fake harness for tests |
-| Prompts/agents | `agents/**`, `src/core/{prompts,prompt-vars,brief}.ts` | agent definitions, step fragments, prompt vars, architect brief |
-| Docs | `docs/{ARCHITECTURE,IMPLEMENTATION,OMP_ADAPTER,FIRE_TEST}.md`, `docs/spikes/*.md` | build contract, current-state audit, omp adapter spec, prior omp spikes |
-
-### 2.2 Execution topology today (relevant to all of item 19)
-
-1. `factory run <task>` resolves the slug, copies an INTENT path into `{orch}/{task}/INTENT.md` in the **main checkout** if needed, runs preflight, acquires a **per-task** run lock, builds `OmpHarness` and `Repo`, then calls `runTask` (`src/cli/run.ts:27-135`).
-2. `runTask` creates the task worktree on `topic/{task}` from main HEAD (INTENT committed there), repairs stray dirt, repairs item worktrees, marks interrupted records, reconciles concerns, then runs ingest/triage/infra/context-pack (`src/core/engine.ts:236-340`).
-3. Each wave runs items concurrently up to `limits.maxParallelItems`; each item gets a child worktree (`{worktreeRoot}/topic_{task}--{item}`) and is ticked by `tickItemMachine`; epic items call `runTaskChild` **in-process** (`src/core/flows/iteration.ts:2432-2480`).
-4. Wave end merges ready items serially through `mergeItem` under `repo.mergeLocks(parentBranch)`; on failure the engine consults the architect and re-drives, bounded by `merge-attempts.yaml` (`src/core/flows/iteration.ts:2706-2800`, `src/core/flows/merge-path.ts:131-170`).
-5. Epic child task = child task dir under `{parentTaskDir}/{epic}`, its own iterations/waves on branch `topic/{parent}--{epic}`, then a `child-closeup.yaml` on the parent and the epic branch merged like any item (`src/core/engine.ts:123-226`).
-6. Every agent turn is a separate omp process launched with `--cwd <worktree>`, `--config <overlay>`, `--session-dir <runtime>/sessions`, optional `--resume <id>`, `--system-prompt <file>`, `-p @<prompt-file>` (`src/harness/omp/harness.ts:356-410`).
-
----
-
-## 3. Key interfaces & signatures
-
-### Harness contract (`src/harness/types.ts:24-55`)
-```ts
-export interface Harness {
-  run(l: AgentRun): Promise<AgentOutcome>;          // one turn (fresh or resumed)
-  validateTools?(tools: string[]): Promise<string[]>;
-  complete(c: { role; models; system; prompt; schema; timeoutSec?; timeoutMs?; onModelFallback? }): Promise<unknown>;
-}
-export interface AgentRun {
-  agent; definition; prompt; role; models; tools;
-  cwd: string;                 // worktree — engine-created today
-  outputSchema; label;
-  session: { resume?: string; keep: boolean };
-  timeoutSec?; onModelFallback?; onSession?; onUsage?;
-}
-```
-`AgentOutcome` carries `sessionId`, `traceRef`, `usage`, `transcriptBytes`, `stdoutBytes`, `toolCallCount`, and failure flags `transient|sessionLost|launchError|timedOut` (`src/harness/types.ts:57-82`).
-
-### Engine entry points
-- `runTask(deps: EngineDeps, task: string, opts?: { maxTicks?; maxIterations?; lockTakeoverEvent? }): Promise<RunResult>` — `src/core/engine.ts:236-247`; `RunResult = {status: done|blocked|failed|stopped, exitCode: 0|10|1, summary}` (`:61-65`).
-- `runChildTask(deps, parent: {branch,path,taskDir}, epicSlug, opts?): Promise<RunResult>` — `src/core/engine.ts:123-226`.
-- Engine deps: `{ harness, repo, project, pipelineFor(taskDir), prompts, clock?, log?, diskSpaceProbe? }` (`src/core/engine.ts:46-54`).
-
-### Worktrees (`src/core/git/worktrees.ts`)
-- `ensureTaskWorktree(repo, task, {intentPath, orchestrationFolder}): {branch, path, created}` — first run checks cleanliness except INTENT, `git worktree add -b topic/{task} <wt> HEAD`, writes+commits INTENT; idempotent (`:47-119`).
-- `ensureChildWorktree(repo, parent:{branch,path}, slug, opts?): {branch,path,created}` — idempotent, prunes stale registrations, reuses branch, `git worktree add -b <child> <wt> <fromRef>` (`:122-168`).
-- `removeWorktree(repo, wtPath)` — removes worktree, **keeps branch** (`:170-189`).
-- `resetScratch(repo, parent, slug)` — removes branch+worktree and recreates from parent tip (`:191-224`).
-
-### Branch naming (`src/core/git/naming.ts`)
-- `taskBranch(task) => topic/{task}` (`:73-76`)
-- `childBranch(parent, item) => parent--item`, max depth 2 (`:78-101`)
-- `worktreePath(root, branch) => root/{branch with / → _}` (`:103-110`)
-- `parseBranch` → `{task, items, depth}` (`:50-70`)
-
-### Merge path (`src/core/flows/merge-path.ts`)
-- `mergeItem(params: MergeItemParams): Promise<MergeItemResult>` — `:131-422`; params include `task,item,parentBranch,taskWt,childWt,repo,harness,pipeline,project,prompts,taskDir,wave?,targetOverride?,turnsSemaphore?` (`:20-49`).
-- `MergeItemResult = {ok, sha?, error?, conflictResolved?, mergeAttempt?}` (`:51-58`).
-- `MAX_MERGE_ATTEMPTS_PER_WAVE = 2`; ledger at `items/<slug>/merge-attempts.yaml`; per-wave target override at `items/<slug>/merge-target.yaml` (`:60-128`).
-
-### CLI
-- `dispatch(args): Promise<number>` switch over `init|preflight|status|steer|run` (`src/cli/dispatch.ts:110-176`).
-- `runStatus({repoRoot, task})` — one task; resolves its single worktree (`src/cli/status.ts:26-80`).
-- `acquireRunLock(repoRoot, task, opts?)` / `isRunLockFree(...)` / `resolveRuntimeDir(repoRoot, worktreeRoot?)` (`src/cli/lock.ts:21-170`).
-
-### Config types
-- `ProjectConfig { orchestrationFolder, adrFolder?, worktreeRoot, scripts?, paths?, skillDirs? }` (`src/core/artifacts.ts:11-22`).
-- `PipelineConfig { models, agents, checks?, hooks?, flows, limits, budget?, diversity?, harness?: string, humanInvolvement?, concerns?, reviewPolicy?, criteria?, contextPack?, tools?, prompts? }` (`src/core/artifacts.ts:117-160`).
-- `TaskKind = simple|story|spike|epic|saga` (`src/core/artifacts.ts:166`).
-- `StepUsage = {inputTokens?, outputTokens?, costUsd?}` (`src/core/artifacts.ts:545-549`), recorded in every step `meta.yaml` (`:551-568`).
-
-### Derived state
-- `DerivedTaskState` (task, kind, status `active|blocked|done|failed`, iteration, currentWave, items/itemMap, waves, debt, budget/spend maps, runningSteps, concerns, openSteerQuestions, strandedItems, failureDetails) — `src/core/derive/task.ts:60-85`.
-- `deriveTaskState({taskDir, task, parentBranch?, taskWt, pipeline?, project?})` — `src/core/derive/task.ts:140-147`.
-- `DerivedItemState.status = pending|running|ready|merged|failed|blocked|superseded` — `src/core/derive/item.ts:41`.
-
----
-
-## 4. Relevant excerpts
-
-### 4.1 Engine-managed task worktree (the `isolation: engine` backend to preserve)
-`plugins/software-factory/src/core/git/worktrees.ts:47-119`:
-```ts
-// first run: main checkout must be clean except INTENT
-const dirty = findDirtyEntries(entries, { orchestrationFolder, currentIntentPath: relIntent });
-if (dirty.length > 0) throw new Error(`Main checkout is dirty ...`);
-...
-await repo.writeLock.runExclusive(() =>
-  git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, "HEAD"])
-);
-```
-Idempotence and stale-registration pruning are explicit (`:14-44`, `:60-72`, `:126-168`). This is the code the spec's `isolation: engine` option must keep behind a config switch.
-
-### 4.2 Epic child task is in-process (the model to replace for sagas)
-`plugins/software-factory/src/core/engine.ts:123-145`:
-```ts
-export async function runChildTask(deps, parent, epicSlug, opts?) {
-  const parentBranch = parent.branch;
-  const childBranchName = childBranch(parentBranch, epicSlug);
-  const childWtInfo = await ensureChildWorktree(repo, parent, epicSlug);
-  const childTaskDir = path.join(childWt, orchFolder, parentTaskSlug, epicSlug);
-```
-Child iterations run on `parentBranch = childBranchName` (`:166-182`); then concerns propagate, `child-closeup.yaml` is written on the parent, and the parent branch commits the record (`:186-212`). The child is launched from the wave loop only when `it.kind === "epic" && runTaskChild` (`src/core/flows/iteration.ts:2440-2450`), wired in `runTask` at `src/core/engine.ts:750-767`. `docs/IMPLEMENTATION.md:150-173` states the saga gap explicitly: *"NOT IMPLEMENTED: saga launches do not exist in code … no saga launcher/loop exists … defers this to the `omp-workspaces` fire-test goal."*
-
-### 4.3 Wave-end merge, gates, and the current "merger"
-`plugins/software-factory/src/core/flows/merge-path.ts:176-245` — on parent→child conflict the engine runs an `integrate` step with:
-```ts
-stepId: "integrate", stepFragment: "steps/integrate",
-agent: "developer", role: "workhorse",   // <-- no dedicated wave-end merger agent
-```
-Then `concludeMerge` commits the resolution (engine stages, agent may not run git writes). If the tree changed, gates and target-green run (`:246-380`); any failure returns `ok:false` with evidence. Success merges child into parent with `--no-ff`, removes the worktree (branch kept), runs `after:item.merge` hooks (`:381-422`).
-
-The wave loop calls this per ready item, then on failure calls `redriveMergeAfterConsult` which runs an architect consult and retries the merge, bounded by the attempt ledger: `src/core/flows/iteration.ts:2706-2800` (call), `:650-710` (helper). The consult input has assignment/priorAttempts/diff/feedback/debt/contextPack only — **no worktree or branch pointer**: `src/core/flows/consults.ts:110-136`; prompt fragment `agents/steps/architect-consult-item.md:1-40`. The status block the architect sees also lacks workspace/branch: `src/core/flows/iteration.ts:177-215`.
-
-### 4.4 Preflight — what is actually verified today
-`plugins/software-factory/src/cli/preflight.ts:129-235` loads project config, warns on linter configs, checks first-run cleanliness (only when the task branch does not exist), loads/validates the layered pipeline, checks disk space (`limits.minFreeDiskMb`). `:250-290` resolves roles/aliases and checks agents reference declared roles. `:292-360` renders prompt fragments and compiles all schemas. `:364-394` validates omp:
-```ts
-execFileSync(ompBinary, ["--version"], ...);
-writeOmpConfigOverlay(pipelineConfig, tempOverlay);
-execFileSync(ompBinary, ["--config", tempOverlay, "--version"], ...);
-```
-with a hard-coded last-resort path `/home/slava/.bun/bin/omp` (`:365-369`). `:399-414` checks the per-task run lock. There is **no isolation round-trip, no cross-check of branches/worktrees against records, and no model-name resolution against omp** (only role alias resolution).
-
-### 4.5 CLI/status/lock — single-task today
-`src/cli/status.ts:26-80` resolves one task dir (task worktree if present, else main), calls `deriveTaskState`, and prints worktree/config/budget/running steps/waves/items/questions/debt (`:59-170`). `src/cli/lock.ts:21-44` puts runtime state at `{worktreeRoot}/.factory-runtime`; locks at `{runtimeDir}/locks/{task}.lock` (`:45-55`); `isRunLockFree` and `acquireRunLock` implement same-host dead-PID takeover (`:57-246`). There is no task enumeration anywhere in `src/cli` (only `readdir` of config/schema dirs, `src/cli/preflight.ts:74,349`), so whole-tree status has no existing discovery layer.
-
-### 4.6 Harness launch and cache-relevant transport
-`src/harness/omp/harness.ts:286-300` — system prompt path is deterministic per agent+session:
-```ts
-const sessionKey = (run.session?.resume ?? "fresh").replace(...);
-const systemPromptPath = path.join(systemPromptsDir, `${sanitizedAgent}-${sessionKey}.md`);
-fs.writeFileSync(systemPromptPath, agentBody, "utf8");
-```
-`src/harness/omp/harness.ts:311-316` — prompt file name **embeds timestamp + randomness on every turn**:
-```ts
-const promptPath = path.join(promptsDir, `prompt-${Date.now()}-${Math.random()...}.txt`);
-```
-Args (`:368-388`): `--cwd run.cwd --config overlay --mode json --model <@role> --session-dir <dir> [--resume id] --tools=... --system-prompt <file> -p @<promptFile>`. Spawn cwd is the worktree (`:400-410`). No isolation/worktree flag is passed.
-
-`src/core/flows/step-runner.ts:606-620` decides session reuse (`keep = sessionMode==="reuse"`, resume interrupted record or existing id); on `sessionLost` it retries once with a fresh session and the **full prompt**, not a rehydrated prefix (`:967-1000`); `PersistentAgent` does the same with an optional `rehydrate()` prefix (`src/core/sessions.ts:110-138`).
-
-### 4.7 Architect planning, brief, wave report
-- Plan turn: fresh plan or reuse session; `buildArchitectBrief` is called for a fresh brief even on resume (`src/core/flows/iteration.ts:1155-1235`); plan step uses `sessionMode: "reuse"`, `existingSessionId: architectSessionId`, fragment `steps/architect-plan` (`:1223-1290`). A limits violation triggers one resumed repair turn on the same session (`:1299-1370`).
-- Wave report resumes the architect, injects `plan/waveReport/debt/steering/contextPack/taskStatus`, and the report fragment decides continue/amend/end (`:3089-3180`).
-- `buildArchitectBrief` = deterministic one-line skeleton + a `@simpler` relevance judge returning `{include:[ids]}`, fail-open to the full skeleton (`src/core/brief.ts:1-14`, `:340-420`). This is the existing **cheap handoff** mechanism that item 20a/20d can build on.
-- Architect output is schema-bound: `agents/steps/architect-plan.md:20` ("yield the plan matching `plan.schema.json`"); `config/schemas/plan.schema.json:4-6` requires `iteration, milestones, itemOutlines`; PM then structures item edits from plan outlines (`agents/steps/pm-edits.md:1-25`, `src/core/plan/apply.ts:1-16`).
-
-### 4.8 Usage/cost parsing drops cache tokens
-`src/harness/omp/ndjson.ts:84-98`:
-```ts
-const u = event.message.usage;
-this.inputTokens += u.input || 0;
-this.outputTokens += u.output || 0;
-const costVal = u.cost?.total ?? ((u.cost?.input || 0) + (u.cost?.output || 0));
-this.costUsd += costVal || 0;
-```
-`cacheRead`, `cacheWrite`, `totalTokens`, and cost sub-fields are ignored; `src/harness/omp/ndjson.ts:170-178` emits only `{inputTokens, outputTokens, costUsd}`; `src/core/artifacts.ts:545-549` and `src/core/budget.ts:34-48` sum only those three. The raw omp NDJSON **does** carry them: fixtures `test/fixtures/omp/turn-fallback.ndjson:7` (`"cacheRead":0,"cacheWrite":0,...cost.cacheRead`), and the prior spike documents `usage.cacheRead` as available (`docs/spikes/omp-2-cli-adapter.md:100-104`). So 20-cost cannot be implemented without extending `Usage`/`StepUsage` and the parser (and updating records/budget tests).
-
-### 4.9 Commit content is engine-authored
-`src/core/git/commit.ts:9-30` — `commitAll(repo, wt, message, {allowEmpty?, paths?})`; `paths` is the available scope mechanism. Call sites invent messages: step records `factory(...): <step> aN [started|error|rejected|session]` (`src/core/flows/step-runner.ts:697-760`, `:572`, `:807`, `:1400-1410`), plan edits `factory: apply plan edits iteration N` (`src/core/flows/iteration.ts:1914,1944`), epic close-up `factory: record epic <slug> child status ...` (`src/core/engine.ts:209`), merge `factory: merge item <slug>` (`src/core/flows/merge-path.ts:384-390`). Agent output schemas carry `summary` (`config/schemas/review.schema.json:6-12`, `config/schemas/developer-output.schema.json:6-14`) but no commit message/scope field.
-
-### 4.10 Concern propagation and escalation vocabulary
-`epic-propagation.ts:20-33` documents "Epic-to-saga concern push": open/routed child concerns + open remarkables are condensed, questions with `blocks` are forwarded to the parent mailbox as `q-epic-<epic>-<id>` (`:116`). The actual parent is the enclosing task; there is no distinct saga architect. `buildTaskStatusBlock` lists items/waves/merged/blocked/failed and both task/root question dirs (`src/core/flows/iteration.ts:195-220`).
-
-### 4.11 Config surface where `isolation` must land
-- `config/schemas/pipeline.schema.json:6-7` requires `models, agents, flows, limits`; `:208-210` declares `harness` as a **string**; `:305` sets root `additionalProperties: false`.
-- `config/schemas/project.schema.json:52` is also `additionalProperties: false`.
-- `config/pipeline.default.yaml`: models/roles `:40-104`, agents `:106-141`, checks/hooks `:172-195`, flows `:241-330`, limits `:342-390`, harness `:406`, humanInvolvement `:449`.
-- Loader merge/validate: `src/core/config/loader.ts:68-150` (defaults → project → task → overrides, AJV, structural).
-So adding `isolation` (or changing `harness` to an object) requires schema + `PipelineConfig` type + default YAML + overlay generation, or it fails validation at load.
-
-### 4.12 Existing omp cache/compaction knobs are config-only
-`src/harness/omp/overlay.ts:26-100` emits only `modelRoles`, `retry.*`, `eval.autoBackground`, `title.generator`, `checkpoint.enabled`, `advisor`, `bash.gitGuard/allowCompoundCommands`, `mnemopi.*`, `update.auto`. It emits **none** of the omp keys discovered in §5 (`isolation.backend`, `task.isolation.*`, `worktree.*`, `compaction.*`, `providers.cacheWarming/cacheRetention`). Overlay is regenerated per turn from the effective pipeline (`src/harness/omp/harness.ts:222-240`).
-
----
-
-## 5. omp isolation mechanics — evidence log
-
-### 5.1 Prior research (repository docs)
-- `docs/spikes/omp-1-topology.md:189-215` — empirical comparison:
-  - omp `isolated: true` hardcodes branch `omp/task/<agentId>`, has no `cwd`, needs `apply:false` (not `merge:false`) to avoid applying to parent, and **"if the subagent fails or rejects (`exitCode !== 0`), `commitToBranch` is completely skipped; no branch commits are captured on failure/rejection, and the temporary isolation worktree is deleted"** (`:196-201`).
-  - Engine-created `git worktree add -b topic/x/y` + `omp --cwd <wt>` keeps **all** files/commits regardless of exit status (`:205-213`).
-  - Recommendation: hybrid external Bun CLI + omp headless adapter with engine-managed worktrees (`:347-395`).
-- `docs/spikes/omp-2-cli-adapter.md:114-158` — `--session-dir` + `--resume` append to the same transcript; cwd persists in the session header; model switch on resume is allowed. `:160-218` — overlay with `modelRoles`, fallback chains, unattended switches; `:245-270` — four concurrent omp processes in four worktrees, no lock contention, ~0.8–1.2 s startup, SIGTERM 143 with partial session flush.
-- `docs/OMP_ADAPTER.md:164-172` — cache-safety audit claim: additive resumes, byte-stable system prompt content, "only transport filenames embed timestamps", deterministic overlay. **It does not test omp's cache keying; it flags `--system-prompt` path-keying as unknown.**
-
-### 5.2 Fresh read-only probes on the installed omp 18.18.5
-These are execution probes (no repository edits, no omp config writes):
-
-| Probe | Result |
-|---|---|
-| `omp --version` | `omp/18.18.5` (README requires v18.17.0+: `plugins/software-factory/README.md:14-18`) |
-| `omp config get isolation.backend --json` | `{"value":"rcopy","type":"enum","description":"Backend used for subagent isolation and worktree cloning"}` — **no enum values exposed** |
-| `omp config get task.isolation.*` | `enabled=true`, `apply=true` ("apply successful isolated task changes to parent"), `merge="branch"` (patch apply or branch merge), `commits="ai"` (generic or AI-generated commit messages) |
-| `omp config get worktree.*` | `base` unset → `~/.omp/wt`; `onStart=off`; `onExit=remove`; `clone=true` (copy-on-write clone so `node_modules`/`target` carry over); `cleanSource=false`; `session.worktreeScope=repo` |
-| `omp worktree --help` | `omp worktree [list|clear|add] [PATH] [COMMIT]` with `-b/-B/-C`, `--dry-run`, `--all`, `--json`. `clear --dry-run` prints what would be removed; `add -b feature ../path` creates a branch+worktree |
-| `omp worktree list --json` | Entries carry `{path, kind:"task-isolation", orphanReason:"task-isolation leftover (no live task owns it)"}` — omp already has orphan classification |
-| `omp --config <overlay with bogus keys including isolation.backend: definitely-not-a-backend> --version` | Prints `18.18.5`, **exit 0** — this probe validates nothing about overlay keys/values |
-| `omp --config <overlay with title.generator:none, compaction.idleEnabled:true> config get title.generator` / `compaction.idleEnabled` | `tiny` / `false` — `omp config get` reports **persisted** config and ignores `--config`; it cannot be used to validate an overlay |
-| `omp config list --json` (filtered) | `compaction.enabled=true`, `compaction.asyncEnabled=true`, `compaction.idleEnabled=false`, `compaction.idleThresholdTokens=200000`, `compaction.idleTimeoutSeconds=300` ("with a 1-hour prompt cache, compaction instead runs just before the cache expires"), `compaction.keepRecentTokens=20000`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.handoffSaveToDisk=true`, `compaction.dropUseless=true` ("cache-aware"), `compaction.supersedeReads=true` ("cache-aware"), `providers.cacheRetention=short`, `providers.cacheWarming=streaming` ("Re-send the last request with a one-token output budget shortly before its prompt-cache entry expires"), `display.cacheMissMarker=true` |
-| `omp models --help` | Supports `-e/--extension` and `--config` when listing models — the plausible seam for a scripted provider extension |
-| `omp --help` | No `--isolated`/isolation flag; isolation is config-driven. `--cwd`, `--session-dir`, `--resume`, `--config`, `--system-prompt`, `--no-session`, `--no-tools`, `--tools`, `--extension` exist |
-
-### 5.3 What this proves / does not prove
-
-**Proven:**
-- omp exposes a configurable isolation backend (`isolation.backend`, default `rcopy`) and per-task isolation controls; the phrase in its own description ties the backend to *"subagent isolation and worktree cloning"*, i.e. it governs omp-managed worktrees as well as subagent tasks.
-- omp has first-class worktree lifecycle commands (`worktree add|list|clear --dry-run`) with ownership/orphan metadata — a ready-made primitive for `cleanup`/`gc` of omp workspaces.
-- omp exposes native compaction and prompt-cache-warming knobs, which item 20 can configure instead of building from scratch.
-- `omp --config … --version` is not a config validator; `omp config get` cannot see an overlay.
-
-**Not proven (spike items):**
-- The allowed values of `isolation.backend` and whether `rcopy`/others affect retention on failure; whether `omp worktree add` honors it exactly like subagent task isolation.
-- Whether a **root** omp process launched with `--cwd <omp-created worktree>` can use `isolated: true` meaningfully (factory agents do not spawn subagents; prompts forbid it), i.e. which omp mechanism maps to "workspace isolation" for factory agents.
-- Whether omp `--config` fully accepts these keys at runtime (no validation error ≠ applied; `config get` ignores overlays, so only a real turn can prove it).
-- Whether omp prompt caching keys on content or on transport path (`--system-prompt <path>`, `-p @<timestamped-path>`), which determines item 20c.
-- How to register a scripted mock provider (extension API shape, catalog registration, streaming NDJSON contract).
-
----
-
-## 6. Gap matrix — spec bullet vs current state
-
-| Spec | Current state (evidence) | Missing work | Likely touchpoints |
-|---|---|---|---|
-| 19.1 isolation backend default + `isolation: omp|engine` + spike | Engine-only worktrees; no isolation key in schema/types/overlay; harness passes no isolation flags (`src/core/git/worktrees.ts:47-224`, `src/harness/omp/harness.ts:368-388`, `config/schemas/pipeline.schema.json:208,305`) | Spike + config field + backend abstraction (create/remove/retain workspace) + overlay keys + preflight compatibility | `src/core/engine.ts:266-272`, `src/core/flows/iteration.ts:2455-2470`, `src/core/git/worktrees.ts`, new workspace module, `config/pipeline.default.yaml`, `config/schemas/pipeline.schema.json`, `src/harness/omp/overlay.ts` |
-| 19.2 preflight | Version + inert overlay check, role aliases, prompts/schemas, disk, per-task lock (`src/cli/preflight.ts:129-414`) | Isolation round-trip; real model/role resolvability; branches/worktrees-vs-records consistency; harness binaries beyond omp; remove hard-coded omp fallback | `src/cli/preflight.ts`, `src/core/git/{status,worktrees}.ts`, `src/core/config/roles.ts` |
-| 19.3 whole-tree status / cleanup / gc + lock refusal | `status` one task; no `cleanup`/`gc` commands; per-task locks; runtime dirs `sessions/`, `prompts/`, `system-prompts/` never purged (only `tmp/` is: `src/core/runtime-tmp.ts:16-45`); orphan detection helpers partially exist (`parseWorktreeList` `src/core/git/status.ts:64-71`, `removeWorktree`) | Task/workspace index derived from records+git; saga/epic parent links; active-agent workspace+branch; cleanup semantics; gc orphan worktrees/branches/runtime/locks, dry-run default; lock guard across the whole tree | `src/cli/dispatch.ts:110-176`, `src/cli/status.ts`, `src/cli/lock.ts:21-95`, new `src/cli/{cleanup,gc}.ts`, `src/core/derive/task.ts`, `src/core/git/status.ts` |
-| 19.4 commits from agent output | All messages engine-authored; `commitAll` accepts message + `paths` scope only (`src/core/git/commit.ts:9-30`; call sites in §4.9) | Commit message/scope fields in output schemas + prompts; thread them to step/merge commits; fallback rule (engine may only use agent-provided or mechanical text) | `config/schemas/review.schema.json`, `config/schemas/developer-output.schema.json`, `agents/steps/review.md`/`develop.md`, `src/core/flows/step-runner.ts:714-760`, `src/core/flows/merge-path.ts:381-422` |
-| 19.5 wave-end merge + workhorse merger + escalation pointers | Merge already runs at wave end with deterministic gates; conflict handled by `developer` step `integrate`; failure → architect consult with evidence but no status/worktree/branch pointer; attempts bounded 2/wave (`src/core/flows/merge-path.ts:176-422`, `src/core/flows/iteration.ts:2706-2800,650-710`, `src/core/flows/consults.ts:110-136`) | Dedicated workhorse-class wave-end merger agent (trivial conflicts only) + prompt fragment; escalation payload with one-command status pointer and worktree+branch; contract tests | new `agents/wave-merger.md` + step fragment, `src/core/flows/merge-path.ts`, `src/core/flows/consults.ts`, `agents/steps/architect-consult-item.md`, `src/core/flows/iteration.ts:177-215` |
-| 19.6 saga independent launches, parallel epics, escalation split | `saga` only a `TaskKind` (`src/core/artifacts.ts:166`, `config/schemas/triage.schema.json`); epics in-process (`src/core/engine.ts:123-226`); epic INTENT written under the **parent task dir on the parent branch** (`src/core/plan/apply.ts:9-16`), so `factory run <epic>` cannot resolve it from main; `q-epic-*` goes to the enclosing task, not a saga architect (`src/core/flows/epic-propagation.ts:20-33,116`) | Saga launcher (spawn independent `factory run` per epic in its own workspace), parent/saga identity+links, per-workspace locks, saga wave-end merge/escalation to saga architect, concern funnel upward | new saga/workspace orchestration module, `src/cli/run.ts:55-135`, `src/cli/dispatch.ts`, `src/core/flows/epic-propagation.ts`, `src/core/git/naming.ts:73-101` |
-| 19.7 docs per use case | Existing ARCHITECTURE/IMPLEMENTATION/OMP_ADAPTER/FIRE_TEST; no use-case doc; docs sentinel test convention exists (`test/docs-concerns.test.ts:1-50`) | New/updated docs for single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc + sentinel test | `plugins/software-factory/docs/*`, `test/docs-*.test.ts` |
-| 19.8 no-model e2e through real omp | Only `FakeHarness` engine tests + one live smoke gated by `FACTORY_LIVE_OMP=1` (`test/harness/smoke-live.test.ts:9-12`); harness can take an alternative `ompBinary` (`src/harness/omp/types.ts:4-15`, precedent `test/engine/model-fallback.test.ts:44-53`) | Scripted mock model provider usable by real omp; e2e scenarios (isolation, merges/conflicts/escalations, saga/epic launches, restart, gc) without paid models | new harness test fixture/provider extension, `test/e2e/**`, `OmpHarness` options, possibly `src/harness/omp/overlay.ts` |
-| 19.9 repo rules hydration | No `AGENTS.md`/rules handling anywhere in `src/` (grep); `PROMPT_VAR_DESCRIPTIONS`/`KNOWN_VARS` have no repo-rules var (`src/core/prompt-vars.ts:9-60`) | Deterministic repo-rule resolution from target repo; inject into architect + developer/qa/reviewer prompts across items/epics; verify per role | `src/core/prompts.ts`, `src/core/prompt-vars.ts`, `src/core/flows/step-runner.ts`, `agents/*.md`, preflight render checks |
-| 20a compact before uncached resume | No cache awareness; resume threads a session id; on loss it starts fresh with full prompt (`src/core/flows/step-runner.ts:967-1000`); a deterministic brief already exists (`src/core/brief.ts:1-14,340-420`); omp `compaction.*` exists but is unused | Detect cold-cache resume (TTL/model switch), compact or switch to fresh+hydrated brief, measure cost delta | `src/harness/omp/harness.ts:286-351`, `src/core/flows/step-runner.ts:606-620`, `src/core/brief.ts`, `src/harness/omp/overlay.ts` |
-| 20b warm cache on standby | Architect process exits every turn; no standby; `providers.cacheWarming` unused | Decide mechanism (long-lived/keepalive process vs omp warming config), measure vs uncached resume, config gate | `src/harness/omp/harness.ts`, `src/core/flows/iteration.ts` (architect turns), overlay |
-| 20c cache-coherence audit | Additive `--resume`; deterministic system-prompt path; **timestamp+random prompt path every turn** (`harness.ts:311-316`); overlay regenerated per turn from config (`harness.ts:222-240`); no byte-stability test | Audit omp cache keying; make transport paths stable or prove content keying; add byte-stability tests for overlay/system prompt/prompts across turns | `src/harness/omp/harness.ts`, `src/harness/omp/overlay.ts`, `test/harness/*` |
-| 20d optional optimizations | None | Handoff/compaction on resume, IRC escalation reply, restart | `src/core/brief.ts`, `src/core/flows/step-runner.ts`, overlay |
-| 20-cost measurement | `Usage`/`StepUsage` only input/output/cost; parser drops `cacheRead/cacheWrite/cost.cacheRead` (`ndjson.ts:84-98,170-178`, `artifacts.ts:545-549`, `budget.ts:34-48`) | Add cache token fields end-to-end + records/derive/status/budget aggregation; use for defaults | `src/harness/types.ts:7-11`, `src/harness/omp/ndjson.ts`, `src/core/artifacts.ts:545-549`, `src/core/budget.ts`, `src/core/derive/task.ts`, `config/schemas/state.schema.json` |
-| 20-plan schema-free architect vs PM structuring | Plan is schema-bound (`config/schemas/plan.schema.json`, `agents/steps/architect-plan.md:20`); PM already structures outlines into scheduled items (`agents/steps/pm-edits.md:1-25`) | Re-evaluate from measured plan-repair turns; possibly telegraphic plan + PM structuring of plan/edits | `agents/steps/architect-plan.md`, `agents/steps/pm-edits.md`, `src/core/plan/*`, `config/schemas/*` |
-
----
-
-## 7. Existing tests & conventions
-
-**Runner and gates**
-- `bun test` (Bun test runner, no config file), `bun run typecheck` (`tsc --noEmit`) — `plugins/software-factory/package.json:11-13`; strict TS incl. `noUncheckedIndexedAccess` (`plugins/software-factory/tsconfig.json`). The repo's own gate hints are in `.factory/project.yaml` `scripts.setup/typecheck/test`.
-- Tests live under `test/**/*.test.ts` and import source directly; no mocks for git or filesystem.
-
-**Core helpers**
-- `createTmpRepo()` builds a real temporary git repo, tracks worktrees, commits with fixed identity, and cleans up on exit (`test/helpers/tmp-repo.ts:1-90`).
-- `FakeHarness` scripts outcomes **by exact `AgentRun.label`**, records all calls, models sessions and `sessionLost` (`src/harness/fake/fake-harness.ts:35-125`). This is how all engine-level behavior tests avoid models.
-- Worktree behavior is tested against real git: `test/git/worktrees.test.ts:1-60` (first-run cleanliness, idempotence, child worktrees, removal preserving branch).
-
-**Behavior test patterns relevant to 19**
-- Epic execution end-to-end with FakeHarness, asserting branch existence, child-closeup, derived item status `merged`, and merged file content: `test/engine/epic-child-task.test.ts:78-218`.
-- Merge conflict → integrate resolution: `test/engine/merge-conflict.test.ts:1-50`; merge gate evidence/attempt ledger: `test/engine/merge-gate-evidence.test.ts`; redrive/stranded: `test/engine/merge-redrive-stranded.test.ts`.
-- Crash/restart record repair: `test/engine/crash-restart.test.ts:1-50`; derived state: `test/engine/derive-gaps.test.ts`.
-- CLI output/exit conventions: `test/cli/cli.test.ts:1-70` (arg parsing, lock lifecycle), `test/cli/status-concerns.test.ts:1-50` (capture `console.log/error` into a string, assert sections).
-- Docs closure sentinel: `test/docs-concerns.test.ts:1-50` — asserts needles inside named doc sections/YAML commentary blocks so docs edits are test-enforced. Reuse this for the 19.7 use-case docs.
-- Live omp tests are opt-in only: `FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts` (`test/harness/smoke-live.test.ts:9-12`).
-- Process-level harness tests substitute a mock `ompBinary` shell script (`test/engine/model-fallback.test.ts:44-53`, `test/harness/omp-harness.test.ts:84-90,286-311`) and assert classification/timeout/session behavior. For 19.8 this is the precedent for a scripted provider, but the spec requires going through **real omp**, so a mock *binary* alone will not satisfy it.
-
-**Conventions to follow**
-- Behavior tests only: assert committed records, `journal.ndjson` events, git graph/worktree state, CLI output — not private helpers.
-- Every engine decision is journaled (`appendJournal`) and records are committed before/after each step; new features should add journal events + record artifacts so restart/derive tests can prove idempotence.
-- Schemas are draft-07 with `additionalProperties:false`; optional new fields are backward-compatible, required fields are not.
-- Preflight validates every prompt fragment against `KNOWN_VARS` and renders with sample vars (`src/cli/preflight.ts:292-360`), so new prompt variables/fragments must be registered in `src/core/prompt-vars.ts`.
-
----
-
-## 8. Open questions & spike outlines (for the architect)
-
-### Isolation semantics (must settle before 19.1 design)
-1. **Isolation backend contract.** `isolation.backend` is an enum defaulting to `rcopy`; what are the values, and does it control (a) subagent task isolation only, (b) `omp worktree add` cloning, or both? Probe candidate: throwaway profile (`--profile`) + `config set`, then a temp repo `omp worktree add -b topic/probe <tmp> HEAD`, inspect branch/commits, then `omp worktree clear --dry-run`.
-2. **Retention on failure.** Prior spike proves `isolated:true` discards branch commits on non-zero exit (`docs/spikes/omp-1-topology.md:201`). Does an omp-managed worktree via `omp worktree add` + `omp --cwd` retain everything like engine worktrees? Test with a failing/aborted turn.
-3. **Root-process isolation.** Factory agents are top-level omp processes, not omp subagents. Which omp mechanism is the "workspace" for such a process — `omp worktree add` + `--cwd`, `--add-dir`, or `task.isolation`? Document the mapping and the fallback to `isolation: engine`.
-4. **Merge-back ownership.** omp has `task.isolation.{apply,merge,commits}`; the spec still requires deterministic CI gates and wave-end merger. Decide whether omp ever performs the merge (then gates) or only creates workspaces and the engine keeps merging. Evidence needed: can omp's `commits: ai` produce a usable message from structured output, or is it generic?
-5. **Config validation.** `omp --config ... --version` accepts bogus keys (probe), and `omp config get` ignores overlays. A real preflight round-trip must actually launch omp. Define the cheapest safe probe (e.g. `omp -p --no-session --tools= --model @role "reply OK"` in a temp clone, or an `omp worktree add`-based round-trip).
-6. **Model/role resolvability.** `omp models ls --json` (with `-e`) may enumerate catalogs; overlays define `modelRoles`. Determine whether any CLI validates `--model @role` + overlay without a paid turn; otherwise preflight can only resolve roles structurally (current behavior) plus a first-turn fallback.
-
-### Lifecycle (19.3)
-7. **Index source.** Derive the whole tree on demand from `{orch}/*/INTENT.md`, `items/*/child-closeup.yaml`, `journal.ndjson`, task dirs and `git worktree list --porcelain` (`parseWorktreeList`, `src/core/git/status.ts:64-71`), or persist a registry file? The spec says "derived from records + git" and "idempotent", which favors on-demand derivation; a registry risks drift.
-8. **Parent links.** Epic child dirs are nested under the parent task dir but live on the parent branch; saga→epic links are only implicit in `plan.epics` (`config/schemas/plan.schema.json:85-95`) and `child-closeup.yaml`. Define the link record used by status/gc/escalation.
-9. **Cleanup vs gc semantics.** `cleanup` = finished (merged/done) workspaces; `gc` = orphaned worktrees/branches/runtime files/stale locks, dry-run default. Which branches are deletable (merged only? superseded? failed after N days?), and how to treat omp-managed worktrees (`kind: task-isolation`, `orphanReason`) vs engine worktrees. `removeWorktree` keeps branches (`worktrees.ts:170-189`); `omp worktree clear` removes omp-owned ones.
-10. **Lock refusal across a tree.** Locks are per task (`src/cli/lock.ts:45-55`). Whole-tree commands must refuse if *any* run lock is live; parallel epics need per-workspace locks plus a saga-level coordination lock (merge/status writes). Dead-PID takeover exists only per file (`:57-95,109-246`).
-
-### Saga (19.6)
-11. **Launch mechanics.** Each epic = independent `factory run` in its own workspace. Today `factory run <epic>` cannot resolve an epic INTENT because `resolveTaskSlug`/`runFactory` copy INTENT from the **main checkout** into `{repoRoot}/{orch}/{epic}/INTENT.md` (`src/cli/run.ts:27-75`), while epic INTENT lives under the parent task dir on the parent branch (`src/core/plan/apply.ts:9-16`). Decide: new `factory run --parent <task> --workspace <path> <epic>` or a saga launcher that spawns children with explicit INTENT path/branch.
-12. **Process orchestration.** Who supervises child factories (exit codes 0/10/1), restarts, and parallelism? How are child stdout/journal/status surfaced to the saga status command? How do saga wave-end merges happen — the saga architect merges epic branches onto a saga branch, or epics merge directly to main?
-13. **Escalation split.** Inside an epic, merge escalation must reach the epic architect (currently parent task architect for all items, `src/core/flows/iteration.ts:650-710`); at saga wave end it must reach the saga architect. Define the architect-session/ownership map per workspace and how consults are routed.
-
-### Cache/compaction (item 20)
-14. **Cache-key audit.** Determine whether omp caches on message content or transport path. Concrete suspicion: the per-turn prompt file path `prompt-<ts>-<rand>.txt` (`harness.ts:311-316`) and regenerated overlay (`harness.ts:222-240`). Add a test that renders the same prompt twice and compares system-prompt bytes, overlay bytes, and argv (the only unstable part should be the prompt filename; then verify omp behavior with a live probe using `providers.cacheRetention`/`display.cacheMissMarker`).
-15. **Compaction mechanism.** omp auto-compacts inside a session (`compaction.*`); there is no CLI `compact` command in `omp --help`. To "compact before an uncached resume", decide between (a) relying on omp auto-compaction triggered before resume, (b) starting a fresh architect session with the existing deterministic brief (`buildArchitectBrief`) and recording it as the handoff, (c) a long-lived architect process. Measure cost with cacheRead/cacheWrite tokens.
-16. **Warm-on-standby.** The architect process exits after every turn; `providers.cacheWarming=streaming` only helps a live/last request. Decide whether to keep a standby process (cost) or treat warming as off by default; the spec allows "explicitly off where it does not pay".
-17. **Measurement plumbing.** Add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, and cost sub-fields to `Usage`/`StepUsage`/records/derived status before choosing defaults; update `budget.ts` aggregation and `state.schema.json` if surfaced.
-18. **Schema-free plan.** Count plan-repair turns and their cost from records (`architect-plan-*` attempts, repair records, usage) before changing the contract. The PM already structures item edits from plan outlines; the open question is whether the architect should emit telegraphic markdown for the plan itself and let PM produce both `plan` and `edits` schemas.
-
-### Repo rules (19.9)
-19. **Rule sources and precedence.** Which files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.omp/rules`?), from repo root and subdirs, and how they combine with factory agent definitions. Confirm whether omp already injects context files into a root process launched with `--system-prompt` (its config exposes `contextFiles.extra` and `--no-context-files`), to avoid double injection. Verify per role with a probe agent that must quote a sentinel rule.
-
-### No-model e2e (19.8)
-20. **Mock provider seam.** omp supports `--extension` and `omp models -e`, so a scripted provider extension is the most likely route; alternatively an OpenAI-compatible local endpoint registered via overlay if omp supports custom provider definitions. Define the canned scenario format (turn-by-turn NDJSON: text, tool calls, yield), and prove the real omp binary runs a full factory flow against it with zero paid calls.
-
----
-
-## 9. Verification commands (baseline)
-
-```bash
-cd plugins/software-factory
-bun test                       # full behavior suite
-bun run typecheck              # tsc --noEmit
-FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts   # opt-in real omp smoke (paid models)
-
-# omp mechanics probes (read-only)
-omp --version
-omp config list --json | jq 'to_entries[] | select(.key|test("isolation|worktree|compaction|cache"))'
-omp worktree list --json
-omp worktree clear --dry-run   # dry-run only
-```
-
----
-
-## 10. Notes for the architect
-
-- **Do not re-derive** the following: merge is already wave-end per item; gates/target-green already run deterministically on tree change; conflict handling exists but uses `developer/integrate`; epics are in-process and merge like items; `factory status` is task-scoped; commit messages are engine-invented; usage lacks cache tokens; omp exposes native compaction/warming/worktree-lifecycle config.
-- **Suggested epic split** (sizing only; the architect decides): (A) isolation backend + workspace abstraction + preflight round-trip + whole-tree status/cleanup/gc; (B) agent-authored commits + wave-end merger agent + escalation pointers; (C) saga independent launches + parallel epics + escalation/funnel routing; (D) cache/compaction measurement & policy; (E) no-model omp e2e harness + repo-rules hydration + use-case docs. A/B share workspace primitives; C depends on A; D is independent but benefits from A's workspace cleanup; E spans all and should land last per epic with a thin slice early (mock provider spike) to de-risk.
-- **Start with a fact-finder spike item** per the intent: it must answer questions 1–6 (§8) with throwaway temp repos and a throwaway omp profile, and produce a decision record on the omp↔engine isolation mapping before any engine code changes.
-
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
-- id: c-19cad43406
-  kind: risk
-  severity: medium
-  summary: Per-turn prompt transport path embeds timestamp+randomness
-  affects:
-    - 20c
-  status: routed
-  disposition: optional
-- id: c-317a4e9b8b
-  kind: risk
-  severity: high
-  summary: Usage parser discards cache-read/write tokens needed for item 20 defaults
-  affects:
-    - 20-cost
-    - 20a
-    - 20b
-    - 20d
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
diff --git a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/meta.yaml b/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/meta.yaml
deleted file mode 100644
index 9f1b06d..0000000
--- a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/meta.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-seq: 17
-name: consult-merge-setup-fix-1
-attempt: 1
-agent: architect
-role: architect
-models:
-  - opencode-go/muse-spark-1.3-contributor
-session: 01a1c29e-2258-71ad-886f-375b051ddadb
-timeoutSec: 7200
-status: ok
-startedAt: 2026-11-10T03:07:14.885Z
-endedAt: 2026-11-10T03:08:41.560Z
-usage:
-  inputTokens: 572479
-  outputTokens: 4710
-  costUsd: 0.061607
-traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-21-45-816Z_01a1c29e-2258-71ad-886f-375b051ddadb
diff --git a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/output.yaml b/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/output.yaml
deleted file mode 100644
index 37d62d0..0000000
--- a/.factory/tasks/omp-workspaces/runs/017-consult-merge-setup-fix-1-a1/output.yaml
+++ /dev/null
@@ -1,38 +0,0 @@
-context: item
-decision: retry-with-guidance
-persist: true
-rationale: "2/2 develop attempts rejected solely by the test gate; the new
-  merge-setup tests pass (667 pass). The single new failure — stranded-wave
-  consult-refire — cannot be caused by this change: that test's item never
-  reaches ready/merge (perpetual fix dispositions + consults), its infra has
-  empty gates/setup, and it failed via a 5000ms timeout plus a between-tests
-  teardown error alongside 'killed 1 dangling process' — a load flake under 4
-  concurrent full-suite gate runs in wave 2. No evidence of prod regression;
-  abandoning would lose the critical wave-1 merge unblocker."
-text: "RETRY (gate flake, not prod regression — isolate before touching code):
-  1) Run ONLY the failing file in isolation from plugins/software-factory: `bun
-  test test/engine/stranded-wave.test.ts`. Expect pass. That test never invokes
-  mergeItem (item never becomes ready; infra has empty gates), so an isolated
-  pass proves the full-suite timeout was load contention — do NOT rewrite prod
-  code in that case. 2) Re-run the full `bun test` once; success = no NEW
-  failing tests vs baseline (only the accepted disk-space env failure may
-  remain). 3) ONLY if the isolated file also fails: treat as real regression —
-  audit your merge-path diff for strict empty-setup parity (no-op before any
-  journal/git/snapshot side effect, identical return paths when infra.setup is
-  empty/missing) and fix minimally. Keep prod diff ~80 lines; preserve the new
-  passing merge-setup tests."
-concerns:
-  - affects:
-      - gates
-      - wave-merge
-    detail: merge-setup-fix develop was rejected 2/2 by a 5000ms timeout in
-      stranded-wave.test.ts (a test that never touches mergeItem) plus a
-      between-tests teardown error, with 'killed 1 dangling process' in output —
-      while 4 wave-2 items each run the full ~250s bun suite as gates
-      concurrently. Full-suite-as-gate under parallel items makes timeouts
-      load-dependent; consider serializing full-suite gates, raising per-test
-      timeout, or scoping item gates to affected selectors.
-    kind: risk
-    severity: medium
-    summary: Full-suite gates under parallel wave items cause timeout flakes (5s
-      default)
diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
index 877b028..0f64339 100644
--- a/.factory/tasks/omp-workspaces/state.yaml
+++ b/.factory/tasks/omp-workspaces/state.yaml
@@ -36,42 +36,24 @@ items:
     fixRounds: 1
     spendUsd: 0.11246700000000001
     currentStep: review
-  merge-setup-fix:
-    kind: dev
-    status: running
-    branch: topic/omp-workspaces--merge-setup-fix
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.104651
-    currentStep: develop
-  spike-findings-recovery:
-    kind: no-behavior
-    status: ready
-    branch: topic/omp-workspaces--spike-findings-recovery
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.174178
-    currentStep: review
   transport-byte-stability:
     kind: test-only
-    status: ready
+    status: pending
     branch: topic/omp-workspaces--transport-byte-stability
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.083151
-    currentStep: review
+    spendUsd: 0
   usage-cache-tokens:
     kind: dev
-    status: ready
+    status: pending
     branch: topic/omp-workspaces--usage-cache-tokens
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.181734
-    currentStep: review
+    spendUsd: 0
 concerns:
-  open: 4
-  dismissed: 2
-  routed: 33
+  open: 24
+  dismissed: 1
+  routed: 10
   resolved: 0
 debt:
   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
@@ -106,14 +88,8 @@ debt:
     defaults"
   - "[19.6] Saga launches do not exist and epic INTENT is not resolvable by
     `factory run`"
-  - "[19.3] Runtime dirs sessions/prompts/system-prompts grow without cleanup"
-  - "[19.2] Hard-coded omp fallback path in preflight"
   - "[spike-repo-rules] Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md`
     are launch-directory-only"
-  - "[spike-mock-provider] OmpHarness has no extension/extra-arg seam; mock
-    provider needs a wrapper or new option"
-  - "[19.1] spike-omp-isolation polish notes deferred to iteration-2 M3/M4
-    planning"
   - "[spike-cache-key] Findings cite nonexistent
     plugins/software-factory/docs/factory.v2.md"
   - "[spike-cache-key] 7.1 misattributes tokensAfter/method to NDJSON result"
@@ -134,42 +110,25 @@ debt:
   - "[spike-omp-isolation] Reconcile mock-provider negative with sibling spikes"
   - "[spike-repo-rules] Preserve worktree-root cwd; .omp/rules +
     .claude/CLAUDE.md are cwd-only"
-  - "[spike-findings-recovery] Test gate pass coexists with 1 documented
-    baseline failure"
-  - "[spike-findings-recovery] Fix `oMP` capitalization typo in repo-rules doc"
-  - "[transport-byte-stability] Pin regex {3,4} narrower than slice(2,6)
-    generator output"
-  - "[transport-byte-stability] Comment omits deliberate exclusion of preflight
-    hardcoded fallback"
-  - "[usage-cache-tokens] Duplicate 6-term has-usage guard in step-runner and
-    shutdown"
-budgetSpentUsd: 1.7035573999999996
+budgetSpentUsd: 1.0690054
 spendByRole:
   workhorse:
-    costUsd: 1.2521194
-    inputTokens: 2707250
-    outputTokens: 965515
+    costUsd: 0.8839554
+    inputTokens: 1881130
+    outputTokens: 692249
   alt-workhorse:
-    costUsd: 0.26717399999999997
-    inputTokens: 1110664
-    outputTokens: 492808
+    costUsd: 0.086165
+    inputTokens: 357804
+    outputTokens: 174090
   architect:
-    costUsd: 0.1779
-    inputTokens: 1236914
-    outputTokens: 84882
+    costUsd: 0.09252099999999999
+    inputTokens: 606147
+    outputTokens: 59551
   alt-architect:
     costUsd: 0.006364
     inputTokens: 28896
     outputTokens: 15650
 spendByItem:
-  merge-setup-fix:
-    costUsd: 0.104651
-    inputTokens: 294165
-    outputTokens: 78165
-  transport-byte-stability:
-    costUsd: 0.083151
-    inputTokens: 192618
-    outputTokens: 106892
   spike-omp-isolation:
     costUsd: 0.45245700000000005
     inputTokens: 1135682
@@ -182,20 +141,12 @@ spendByItem:
     costUsd: 0.11246700000000001
     inputTokens: 225196
     outputTokens: 108718
-  spike-findings-recovery:
-    costUsd: 0.174178
-    inputTokens: 546734
-    outputTokens: 203800
   spike-cache-key:
     costUsd: 0.155598
     inputTokens: 331901
     outputTokens: 152018
-  usage-cache-tokens:
-    costUsd: 0.181734
-    inputTokens: 509493
-    outputTokens: 194135
   (orchestration):
-    costUsd: 0.3147244
-    inputTokens: 1592576
-    outputTokens: 197997
-lastUpdated: 2026-11-10T03:31:43.551Z
+    costUsd: 0.22388639999999999
+    inputTokens: 925839
+    outputTokens: 163674
+lastUpdated: 2026-11-10T01:45:03.449Z
diff --git a/plugins/software-factory/src/core/flows/merge-path.ts b/plugins/software-factory/src/core/flows/merge-path.ts
index 8a0e97f..06f183c 100644
--- a/plugins/software-factory/src/core/flows/merge-path.ts
+++ b/plugins/software-factory/src/core/flows/merge-path.ts
@@ -15,6 +15,7 @@ import { runSeamHooks } from "./seams.js";
 import { appendJournal } from "../journal.js";
 import { runGates } from "../checks/gates.js";
 import { runCheck } from "../checks/runner.js";
+import { runProcess } from "../proc.js";
 import type { CheckContext } from "../checks/types.js";
 import type { DerivedItemState } from "../derive/item.js";
 import type { Semaphore } from "../mutex.js";
@@ -127,6 +128,51 @@ export async function writeMergeTargetOverride(
   await writeYamlAtomic(p, { overrides });
 }
 
+/** Synthetic gate id used when infra.setup aborts the merge before gates run. */
+const INFRA_SETUP_GATE_ID = "infra.setup";
+
+/** Mirrors the gate-failure evidence shape: id, status, command, output tail. */
+function gateFailureEvidence(
+  failing: Array<{ id: string; status: string; command?: string; details?: string }>
+): string[] {
+  return failing.map((r) => {
+    const cmd = r.command ? ` Command: ${r.command}` : "";
+    const tail = r.details ? ` Details: ${r.details.slice(-500)}` : "";
+    return `${r.id} (exit via status=${r.status}).${cmd}${tail}`;
+  });
+}
+
+/**
+ * Runs infra.setup commands in a worktree, mirroring runner.ts: stop at the
+ * first failure and carry the command, exit code, and output for evidence.
+ */
+async function runMergeSetup(
+  setup: string[],
+  cwd: string,
+  timeoutSec: number,
+  outputBytes: number
+): Promise<{ ok: true } | { ok: false; command: string; details: string }> {
+  for (const cmd of setup) {
+    const res = await runProcess({ cmd, cwd, timeoutSec, maxOutputBytes: outputBytes });
+    const output = (res.stdout + "\n" + res.stderr).trim();
+    if (res.timedOut) {
+      return {
+        ok: false,
+        command: cmd,
+        details: `infra.setup timed out after ${timeoutSec}s: ${cmd}\n${output}`,
+      };
+    }
+    if (res.code !== 0) {
+      return {
+        ok: false,
+        command: cmd,
+        details: `infra.setup failed (exit ${res.code}): ${cmd}\n${output}`,
+      };
+    }
+  }
+  return { ok: true };
+}
+
 /**
  * Runs the merge path for a single ready item under the parent's merge lock (§7, §9).
  */
@@ -318,6 +364,37 @@ export async function mergeItem(params: MergeItemParams): Promise<MergeItemResul
         outputBytes: pipeline.limits?.checkOutputBytes ?? 4096,
       };
 
+      // infra.setup must run before any gate/target snapshot so setup-created
+      // untracked files (node_modules, venvs) are part of the baseline rather
+      // than reported as gate mutations. Temp-worktree paths (runner.ts) run
+      // the same commands before their checks.
+      if (infra?.setup && infra.setup.length > 0) {
+        const rawTimeout = pipeline.limits?.gateTimeoutSec as number | undefined;
+        const setupTimeout = typeof rawTimeout === "number" && rawTimeout > 0 ? rawTimeout : 900;
+        const setupRes = await runMergeSetup(infra.setup, childWt, setupTimeout, checkCtx.outputBytes);
+        if (!setupRes.ok) {
+          const failure = {
+            id: INFRA_SETUP_GATE_ID,
+            status: "fail",
+            command: setupRes.command,
+            details: setupRes.details,
+          };
+          const failingEvidence = gateFailureEvidence([failure]);
+          await appendJournal(taskDir, {
+            type: "item_merge_gates_failed",
+            item: item.slug,
+            failingGates: [failure.id],
+            results: [{ id: failure.id, status: failure.status }],
+            evidence: failingEvidence,
+          });
+          return {
+            ok: false,
+            mergeAttempt,
+            error: `Quality gates failed on merge path for ${item.slug}: ${failure.id}. ${failingEvidence.join(" | ")}`,
+          };
+        }
+      }
+
       // Run gates if configured
       if (infra && infra.gates && infra.gates.length > 0) {
         const gatesOutcome = await runGates(checkCtx);
@@ -326,11 +403,7 @@ export async function mergeItem(params: MergeItemParams): Promise<MergeItemResul
           // Evidence for the consult: command + stderr tail per failing gate.
           // An exit-127 here means "command not found", not an assertion
           // failure — without the command name the error is unactionable.
-          const failingEvidence = failing.map((r) => {
-            const cmd = r.command ? ` Command: ${r.command}` : "";
-            const tail = r.details ? ` Details: ${r.details.slice(-500)}` : "";
-            return `${r.id} (exit via status=${r.status}).${cmd}${tail}`;
-          });
+          const failingEvidence = gateFailureEvidence(failing);
           await appendJournal(taskDir, {
             type: "item_merge_gates_failed",
             item: item.slug,
diff --git a/plugins/software-factory/test/engine/merge-setup.test.ts b/plugins/software-factory/test/engine/merge-setup.test.ts
new file mode 100644
index 0000000..3bafdbb
--- /dev/null
+++ b/plugins/software-factory/test/engine/merge-setup.test.ts
@@ -0,0 +1,250 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { mergeItem, readMergeAttempts } from "../../src/core/flows/merge-path.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { git } from "../../src/core/git/exec.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readJournal } from "../../src/core/journal.js";
+import { writeYamlAtomic } from "../../src/core/records/io.js";
+import type { DeveloperTarget, PipelineConfig, ProjectConfig } from "../../src/core/artifacts.js";
+import type { DerivedItemState } from "../../src/core/derive/item.js";
+
+// Wave-end merge runs verify-checks in the child worktree. That worktree has
+// no node_modules (untracked, never copied by git), so gates/typecheck fail
+// unless infra.setup runs there first — and it must run BEFORE the gates'
+// worktree snapshot so setup-created untracked files (node_modules, venvs)
+// are not misreported as gate mutations.
+
+interface MergeFixture {
+  taskWt: string;
+  taskDir: string;
+  item: DerivedItemState;
+  parentBranch: string;
+  repoObj: Repo;
+  pipeline: PipelineConfig;
+  project: ProjectConfig;
+  prompts: any;
+  childWt: string;
+}
+
+async function prepareMerge(
+  tmpRepo: TmpRepo,
+  task: string,
+  infra: Record<string, unknown>,
+  target?: DeveloperTarget
+): Promise<MergeFixture> {
+  const orchFolder = ".factory";
+  const taskDir = path.join(tmpRepo.dir, orchFolder, task);
+  fs.mkdirSync(taskDir, { recursive: true });
+  await writeYamlAtomic(path.join(taskDir, "infra.yaml"), infra);
+
+  tmpRepo.writeFile("base.txt", "Base\n");
+  tmpRepo.commit("Add base.txt on main");
+
+  const itemSlug = `item-${task}`;
+  const childBranch = `topic/${task}--${itemSlug}`;
+  const childWt = tmpRepo.createWorktree(childBranch);
+  fs.writeFileSync(path.join(childWt, "child.txt"), "Child content\n", "utf8");
+  await git(childWt, ["add", "child.txt"]);
+  await git(childWt, ["commit", "-m", "Child commit"]);
+
+  const parentBranch = `topic/${task}`;
+  tmpRepo.createBranch(parentBranch, "main");
+  tmpRepo.git(["checkout", parentBranch]);
+  tmpRepo.writeFile("parent.txt", "Parent new content\n");
+  tmpRepo.commit("Parent new file modifying tree");
+
+  const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".worktrees") });
+  const project: ProjectConfig = { orchestrationFolder: orchFolder, worktreeRoot: repoObj.worktreeRoot };
+  const pipeline: PipelineConfig = {
+    models: { roles: { workhorse: { model: "m" } } },
+    agents: { developer: { role: "workhorse" } },
+    flows: { simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] }, story: {}, spike: {} },
+    limits: {},
+  };
+  const prompts = loadPromptLibrary({ builtinDir: path.resolve(import.meta.dir, "../../agents"), overrideDirs: [] });
+  const item: DerivedItemState = {
+    slug: itemSlug,
+    kind: "dev",
+    title: "T",
+    wave: 1,
+    deps: [],
+    status: "ready",
+    branch: childBranch,
+    records: [
+      {
+        dirName: "001-develop-r1-a1",
+        seq: 1,
+        name: "develop",
+        attempt: 1,
+        fixRound: 1,
+        meta: {
+          seq: 1,
+          name: "develop",
+          attempt: 1,
+          fixRound: 1,
+          agent: "developer",
+          role: "workhorse",
+          models: ["m"],
+          status: "ok",
+          startedAt: new Date().toISOString(),
+        },
+        output: target ? { status: "ok", summary: "Done", target } : { status: "ok", summary: "Done" },
+      },
+    ],
+    currentAttempt: 1,
+    currentFixRound: 1,
+    isEscalated: false,
+    freshSeries: false,
+    interruptionCount: 0,
+    suggestionFingerprints: [],
+    decisionFingerprints: [],
+    failingCheckFingerprints: [],
+    consultCount: 0,
+  };
+  return { taskWt: tmpRepo.dir, taskDir, item, parentBranch, repoObj, pipeline, project, prompts, childWt };
+}
+
+function merge(fixture: MergeFixture, task: string) {
+  return mergeItem({
+    task,
+    item: fixture.item,
+    parentBranch: fixture.parentBranch,
+    taskWt: fixture.taskWt,
+    childWt: fixture.childWt,
+    repo: fixture.repoObj as any,
+    harness: new FakeHarness(),
+    pipeline: fixture.pipeline,
+    project: fixture.project,
+    prompts: fixture.prompts,
+    taskDir: fixture.taskDir,
+  });
+}
+
+describe("merge-path infra.setup", () => {
+  let tmpRepo: TmpRepo;
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+  });
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  it("runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations", async () => {
+    const task = "merge-setup-before-gates";
+    const setupCmd =
+      "printf 'ready' > setup-artifact.txt && mkdir -p node_modules/fake-dep && printf 'dep' > node_modules/fake-dep/index.js";
+    const fixture = await prepareMerge(tmpRepo, task, {
+      setup: [setupCmd],
+      gates: [
+        {
+          id: "setup-visible",
+          command: "test -f setup-artifact.txt && test -f node_modules/fake-dep/index.js",
+        },
+      ],
+      testRunner: { command: "true" },
+    });
+
+    const result = await merge(fixture, task);
+
+    expect(result.error).toBeUndefined();
+    expect(result.ok).toBe(true);
+    const journal = await readJournal(fixture.taskDir);
+    // Setup artifacts existed before the gate snapshot, so the gate that
+    // requires them passes and nothing is reported as a gate mutation.
+    const mutationEvents = journal.filter((e) => e.type === "worktree_mutation_detected");
+    expect(mutationEvents).toHaveLength(0);
+    expect(journal.some((e) => e.type === "item_merged")).toBe(true);
+  });
+
+  it("runs setup before target-green checks in the child worktree", async () => {
+    const task = "merge-setup-before-target";
+    const fixture = await prepareMerge(
+      tmpRepo,
+      task,
+      {
+        setup: ["printf 'ready' > setup-artifact.txt"],
+        gates: [],
+        testRunner: { command: "true" },
+      },
+      { customTarget: true, command: "test -f setup-artifact.txt" }
+    );
+
+    const result = await merge(fixture, task);
+
+    expect(result.error).toBeUndefined();
+    expect(result.ok).toBe(true);
+  });
+
+  it("treats an empty setup list as a no-op and merges as before", async () => {
+    const task = "merge-setup-empty";
+    const fixture = await prepareMerge(tmpRepo, task, {
+      setup: [],
+      gates: [{ id: "ok", command: "true" }],
+      testRunner: { command: "true" },
+    });
+
+    const result = await merge(fixture, task);
+
+    expect(result.error).toBeUndefined();
+    expect(result.ok).toBe(true);
+  });
+
+  it("treats a missing setup key as a no-op and merges as before", async () => {
+    const task = "merge-setup-missing";
+    const fixture = await prepareMerge(tmpRepo, task, {
+      gates: [{ id: "ok", command: "true" }],
+      testRunner: { command: "true" },
+    });
+
+    const result = await merge(fixture, task);
+
+    expect(result.error).toBeUndefined();
+    expect(result.ok).toBe(true);
+  });
+
+  it("fails the merge with gate-shaped evidence containing the setup command and output", async () => {
+    const task = "merge-setup-failure";
+    const setupCmd = "echo setup-out-marker && echo setup-err-marker >&2 && exit 7";
+    const fixture = await prepareMerge(tmpRepo, task, {
+      setup: [setupCmd],
+      gates: [{ id: "after-setup", command: "touch gate-ran-marker.txt" }],
+      testRunner: { command: "true" },
+    });
+
+    const result = await merge(fixture, task);
+
+    expect(result.ok).toBe(false);
+    // Actionable error: names the setup phase, the command, its exit code,
+    // and the captured stdout/stderr.
+    expect(result.error).toContain("infra.setup");
+    expect(result.error).toContain(`Command: ${setupCmd}`);
+    expect(result.error).toContain("exit 7");
+    expect(result.error).toContain("setup-out-marker");
+    expect(result.error).toContain("setup-err-marker");
+    // Gates never ran: the setup failure aborted verify-checks first.
+    expect(fs.existsSync(path.join(fixture.childWt, "gate-ran-marker.txt"))).toBe(false);
+
+    // Journal evidence mirrors a failing gate: id/status entry carrying
+    // command + output detail.
+    const journal = await readJournal(fixture.taskDir);
+    const failEv = journal.find(
+      (e) => e.type === "item_merge_gates_failed" && (e as any).item === fixture.item.slug
+    ) as any;
+    expect(failEv).toBeDefined();
+    expect(failEv.failingGates).toContain("infra.setup");
+    expect(Array.isArray(failEv.evidence)).toBe(true);
+    const evidence = (failEv.evidence as string[]).join("\n");
+    expect(evidence).toContain("infra.setup");
+    expect(evidence).toContain("(exit via status=fail)");
+    expect(evidence).toContain(`Command: ${setupCmd}`);
+    expect(evidence).toContain("setup-out-marker");
+    expect(evidence).toContain("setup-err-marker");
+
+    expect(await readMergeAttempts(fixture.taskDir, fixture.item.slug, "1")).toBe(1);
+    expect(journal.some((e) => e.type === "item_merged")).toBe(false);
+  });
+});

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

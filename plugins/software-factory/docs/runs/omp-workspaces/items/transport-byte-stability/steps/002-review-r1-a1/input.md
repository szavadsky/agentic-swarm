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
- id: c-0647070832
  kind: tech-debt
  severity: high
  summary: Child/merge worktrees still need infra.setup (bun install) before the bun test runner can collect tests; this worktree had no node_modules until installed manually
  affects:
    - target-red
    - wave-merge
- id: c-f415508eb1
  kind: risk
  severity: medium
  summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated test failures
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
- id: rm-d7f1fc7cc4
  kind: remarkable
  summary: Four spikes + two foundation items in iteration 1; epics deferred to iteration 2


- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
- Raise concerns with evidence when review uncovers new cross-cutting issues.

## Assignment
{
  "slug": "transport-byte-stability",
  "kind": "test-only",
  "title": "Transport byte-stability characterization tests",
  "assignment": "Test-only item, no prod code; edits confined to test paths. Add test/harness/transport-stability.test.ts rendering the same agent prompt twice and asserting byte-equality of system-prompt content and generated overlay bytes, while pinning currently unstable argv parts (timestamped/randomized prompt filename) as documented behavior with explicit assertions plus comments. Tests must assume cwd=plugins/software-factory and resolve fixtures repo-relatively; must pass on clean checkout and skip cleanly only if omp binary is absent (no paid turns). Do not stabilize transport; stabilization decision deferred to M7 after spike-cache-key. Acceptance: M2 scenario 3 (byte-equality where stable, instability pinned where not).",
  "outlineRef": "transport-byte-stability",
  "milestone": "m2-measure-stabilize",
  "wave": 2,
  "scenarioRefs": [
    "m2-measure-stabilize:scenario-3"
  ],
  "citations": [
    "docs/factory.v2.md:114-120",
    "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
    "plugins/software-factory/src/cli/preflight.ts:365-393"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml b/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
deleted file mode 100644
index 8a3bcf8..0000000
--- a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
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
-status: open
-source:
-  record: 001-test-first-r1-a1
-  agent: developer
-  step: test-first
-  item: usage-cache-tokens
-  lastSeen: 2026-11-10T02:05:24.168Z
-createdAt: 2026-11-10T02:05:24.168Z
-updatedAt: 2026-11-10T02:05:24.168Z
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
diff --git a/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..eb14cbf
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,109 @@
+checks:
+  - id: gates
+    status: pass
+    message: Gates passed (2 gates)
+    details:
+      - id: typecheck
+        command: bun --cwd=plugins/software-factory run typecheck
+        status: pass
+        durationMs: 7036
+        details: $ tsc --noEmit
+      - id: test
+        command: bun --cwd=plugins/software-factory test
+        status: pass
+        durationMs: 497090
+        details: >-
+          bun test v1.4.4 (38afee6c8)
+
+          Disk space check passed (threshold 2048 MB):
+            worktreeRoot (/tmp/factory-test-repo-NCidC5.factory-wt): 4474 MB free
+            .factory-runtime/tmp (/tmp/factory-test-repo-NCidC5.factory-wt/.factory-runtime/tmp): 4474 MB free
+            repoRoot (/tmp/factory-test-repo-NCidC5): 4474 MB free
+            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 79629 MB free
+            /tmp (/tmp): 4474 MB free
+          ================================================================
+
+          Task: status-test-task [ACTIVE]
+
+          Kind: unclassified | Iteration: 1 | Wave: 1
+
+          Worktree: (none - main checkout)
+
+          Config path: /tmp/factory-test-repo-uQIhBg/.factory/pipeline.yaml
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
+                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/plugins/software-factory/test/disk-space.test.ts:57:37)
+          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
+          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+          [36.71ms]
+
+
+          test/cli/cli.test.ts:
+
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
+          on host Slava-Yoga) taken over by PID 3838045
+
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 3838045
+
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 3838045
+
+           668 pass
+           2 skip
+           1 fail
+           3759 expect() calls
+          Ran 671 tests across 102 files. [224.81s]
+        failingTests:
+          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
+            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+  - id: tests-only
+    status: pass
+    message: tests-only passed (2 test files changed)
diff --git a/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..01521ed
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,93 @@
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
+  "slug": "transport-byte-stability",
+  "kind": "test-only",
+  "title": "Transport byte-stability characterization tests",
+  "assignment": "Test-only item, no prod code; edits confined to test paths. Add test/harness/transport-stability.test.ts rendering the same agent prompt twice and asserting byte-equality of system-prompt content and generated overlay bytes, while pinning currently unstable argv parts (timestamped/randomized prompt filename) as documented behavior with explicit assertions plus comments. Tests must assume cwd=plugins/software-factory and resolve fixtures repo-relatively; must pass on clean checkout and skip cleanly only if omp binary is absent (no paid turns). Do not stabilize transport; stabilization decision deferred to M7 after spike-cache-key. Acceptance: M2 scenario 3 (byte-equality where stable, instability pinned where not).",
+  "outlineRef": "transport-byte-stability",
+  "milestone": "m2-measure-stabilize",
+  "wave": 2,
+  "scenarioRefs": [
+    "m2-measure-stabilize:scenario-3"
+  ],
+  "citations": [
+    "docs/factory.v2.md:114-120",
+    "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
+    "plugins/software-factory/src/cli/preflight.ts:365-393"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "docs/factory.v2.md:114-120",
+  "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
+  "plugins/software-factory/src/cli/preflight.ts:365-393"
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
diff --git a/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..fb44808
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 1
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
+startedAt: 2026-11-10T01:58:58.152Z
+session: 01a1c32e-1235-7054-84d9-126190c40577
+endedAt: 2026-11-10T02:28:29.132Z
+usage:
+  inputTokens: 115418
+  outputTokens: 50352
+  costUsd: 0.060786
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-869Z_01a1c32e-1235-7054-84d9-126190c40577.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..0e5bf3b
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,93 @@
+status: ok
+summary: "Added test-only transport characterization:
+  test/harness/transport-stability.test.ts plus
+  test/fixtures/omp/mock-transport-omp.sh. The test renders the developer agent
+  definition and a step prompt twice, drives OmpHarness twice with identical
+  AgentRun input through a mock omp binary (no provider contact, no paid turns),
+  and asserts byte-equality of system-prompt content, prompt-file content, and
+  generated overlay bytes. The currently unstable transport piece is pinned
+  explicitly with comments: the per-turn prompt filename matches
+  prompt-<epoch-ms>-<random>.txt and necessarily differs between turns, while
+  argv is otherwise identical (verified by normalizing the prompt arg and
+  asserting the sole differing argv index). The deterministic system-prompt
+  path, --config path, --model and --session-dir are also pinned. A final
+  non-paid check runs `omp --config <overlay> --version` (the preflight
+  validation) and skips only when omp is absent. No production code changed.
+  `bun run typecheck` exits 0; full `bun test` with clean TMPDIR is 669 pass / 2
+  skip / 0 fail across 102 files."
+target:
+  command: cd plugins/software-factory && bun test
+    test/harness/transport-stability.test.ts
+  customTarget: true
+evidence:
+  - "bun test test/harness/transport-stability.test.ts (cwd
+    plugins/software-factory) -> 5 pass, 0 fail, 23 expect() calls:
+    system-prompt bytes equal across both turns, overlay bytes equal and equal
+    to a fresh writeOmpConfigOverlay generation, prompt-file bytes equal, prompt
+    filename pinned as prompt-<13+ digits>-<3-4 base36>.txt and asserted
+    different, argv identical after normalizing only that element."
+  - "env -u OMP_PATH PATH=/usr/bin:/bin bun test
+    test/harness/transport-stability.test.ts -> 4 pass, 1 skip, 0 fail: skips
+    cleanly only the non-paid real-omp overlay acceptance test when the binary
+    is absent; byte-stability characterization still runs."
+  - bun run typecheck -> exit 0 (tsc --noEmit).
+  - TMPDIR=/tmp bun test (cwd plugins/software-factory) -> 669 pass, 2 skip, 0
+    fail, 3765 expect() calls, 102 files, 248s; includes the new 5 tests.
+  - bun test test/harness test/prompts.test.ts -> 67 pass, 2 skip, 0 fail.
+  - git status --short -> only new paths
+    plugins/software-factory/test/harness/transport-stability.test.ts and
+    plugins/software-factory/test/fixtures/omp/mock-transport-omp.sh; no
+    production edits.
+  - "Environmental isolation check: with the inherited factory-runtime TMPDIR,
+    test/disk-space.test.ts fails (2 failing paths instead of 1) and amend-delta
+    shows git 'could not create temporary file' failures; both pass with
+    TMPDIR=/tmp (disk-space 7 pass, amend-delta 17 pass), confirming these are
+    environment-induced, not caused by this diff."
+concerns:
+  - kind: risk
+    summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated
+      test failures
+    detail: "When TMPDIR points under .factory-runtime/tmp, disk-space.test.ts
+      counts the tmpdir itself as a second low-space path (fails: expected 1
+      failing path, got 2) and several engine tests fail with git 'could not
+      create temporary file' or 5s timeouts under contention. With TMPDIR=/tmp
+      the same full suite is fully green (669 pass / 2 skip / 0 fail). This is
+      pre-existing/environmental and not caused by this test-only diff, but it
+      affects gate greenness for any item run in this environment."
+    severity: medium
+    affects:
+      - gates
+      - wave-merge
+remarkable:
+  - chosen: Characterize transport via a mock omp binary that snapshots argv plus
+      the --system-prompt/-p/--config files, and guard only the real-binary
+      overlay acceptance check with omp-presence skip.
+    why: This captures the exact bytes and argv the harness would hand to omp
+      without contacting a provider (no paid turns) and without requiring omp on
+      a clean checkout, while still validating the generated overlay with the
+      real binary when it is installed using the same non-paid `--config
+      <overlay> --version` preflight performs.
+    alternatives:
+      - "Run harness turns against real omp with live models: paid and flaky,
+        violates no-paid-turns constraint."
+      - "Mock the bun spawn module in-process: fragile, bypasses the real argv
+        assembly path."
+      - "Test only pure generateOmpConfigOverlay/render functions: cannot pin
+        the timestamped prompt filename or full argv instability."
+  - chosen: Pin the prompt filename instability with explicit shape and difference
+      assertions plus comments, instead of stabilizing transport.
+    why: Assignment defers stabilization to M7 after spike-cache-key; a
+      failing-explicit assertion documents the currently unstable behavior and
+      will point at the decision when transport is stabilized.
+    alternatives:
+      - "Stabilize prompt paths in production code: out of scope for this
+        test-only item."
+      - "Only compare normalized argv: would hide the unstable element instead
+        of pinning it."
+notes: "Ran `bun install --frozen-lockfile` in plugins/software-factory because
+  the worktree started without node_modules (matches open concern c-552344216d);
+  node_modules is gitignored. The new test resolves
+  pluginRoot/config/agents/fixtures from import.meta.dir, so it works when
+  invoked from plugins/software-factory (or any cwd). No paid model turns were
+  made: the mock binary never touches a provider and the real-omp check only
+  runs --version."
diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
index aa2bd98..bd0bfd0 100644
--- a/.factory/tasks/omp-workspaces/journal.ndjson
+++ b/.factory/tasks/omp-workspaces/journal.ndjson
@@ -179,31 +179,3 @@
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
diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
index 1ed059f..0f64339 100644
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
-    spendUsd: 0.068727
-    currentStep: test-first
-  spike-findings-recovery:
-    kind: no-behavior
-    status: running
-    branch: topic/omp-workspaces--spike-findings-recovery
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.071688
-    currentStep: develop
   transport-byte-stability:
     kind: test-only
-    status: running
+    status: pending
     branch: topic/omp-workspaces--transport-byte-stability
     attempts: 1
     fixRounds: 1
     spendUsd: 0
-    currentStep: develop
   usage-cache-tokens:
     kind: dev
-    status: running
+    status: pending
     branch: topic/omp-workspaces--usage-cache-tokens
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.058962
-    currentStep: test-first
+    spendUsd: 0
 concerns:
-  open: 3
+  open: 24
   dismissed: 1
-  routed: 33
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
@@ -134,29 +110,25 @@ debt:
   - "[spike-omp-isolation] Reconcile mock-provider negative with sibling spikes"
   - "[spike-repo-rules] Preserve worktree-root cwd; .omp/rules +
     .claude/CLAUDE.md are cwd-only"
-budgetSpentUsd: 1.2976133999999995
+budgetSpentUsd: 1.0690054
 spendByRole:
   workhorse:
-    costUsd: 1.0833324
-    inputTokens: 2341044
-    outputTokens: 835217
+    costUsd: 0.8839554
+    inputTokens: 1881130
+    outputTokens: 692249
   alt-workhorse:
-    costUsd: 0.091624
-    inputTokens: 393774
-    outputTokens: 183082
+    costUsd: 0.086165
+    inputTokens: 357804
+    outputTokens: 174090
   architect:
-    costUsd: 0.116293
-    inputTokens: 664435
-    outputTokens: 80172
+    costUsd: 0.09252099999999999
+    inputTokens: 606147
+    outputTokens: 59551
   alt-architect:
     costUsd: 0.006364
     inputTokens: 28896
     outputTokens: 15650
 spendByItem:
-  merge-setup-fix:
-    costUsd: 0.068727
-    inputTokens: 204993
-    outputTokens: 50291
   spike-omp-isolation:
     costUsd: 0.45245700000000005
     inputTokens: 1135682
@@ -169,20 +141,12 @@ spendByItem:
     costUsd: 0.11246700000000001
     inputTokens: 225196
     outputTokens: 108718
-  spike-findings-recovery:
-    costUsd: 0.071688
-    inputTokens: 139228
-    outputTokens: 49219
   spike-cache-key:
     costUsd: 0.155598
     inputTokens: 331901
     outputTokens: 152018
-  usage-cache-tokens:
-    costUsd: 0.058962
-    inputTokens: 115693
-    outputTokens: 43458
   (orchestration):
-    costUsd: 0.2531174
-    inputTokens: 1020097
-    outputTokens: 193287
-lastUpdated: 2026-11-10T02:23:12.497Z
+    costUsd: 0.22388639999999999
+    inputTokens: 925839
+    outputTokens: 163674
+lastUpdated: 2026-11-10T01:45:03.449Z
diff --git a/plugins/software-factory/test/fixtures/omp/mock-transport-omp.sh b/plugins/software-factory/test/fixtures/omp/mock-transport-omp.sh
new file mode 100755
index 0000000..3f125db
--- /dev/null
+++ b/plugins/software-factory/test/fixtures/omp/mock-transport-omp.sh
@@ -0,0 +1,36 @@
+#!/bin/sh
+# Mock omp binary for test/harness/transport-stability.test.ts.
+#
+# The test copies this fixture, substitutes '__CAPTURE_DIR__' with a throwaway
+# directory, and points OmpHarness at the copy. Each invocation records its
+# exact argv and snapshots the files the harness hands to omp
+# (--system-prompt, -p @prompt, --config) before emitting one successful
+# NDJSON turn. No model provider is contacted, so no paid turns are spent and
+# a real omp binary is not required for the byte-stability characterization.
+set -eu
+
+capture='__CAPTURE_DIR__'
+mkdir -p "$capture"
+
+n=0
+if [ -f "$capture/next-invocation" ]; then
+  n=$(cat "$capture/next-invocation")
+fi
+n=$((n + 1))
+printf '%s\n' "$n" > "$capture/next-invocation"
+
+# One argv element per line; harness paths contain no newlines.
+printf '%s\n' "$@" > "$capture/argv-$n.txt"
+
+prev=''
+for arg in "$@"; do
+  case "$prev" in
+    --system-prompt) cp "$arg" "$capture/system-prompt-$n.md" ;;
+    --config) cp "$arg" "$capture/overlay-$n.yaml" ;;
+    -p) cp "${arg#@}" "$capture/prompt-$n.txt" ;;
+  esac
+  prev="$arg"
+done
+
+printf '{"type":"session","id":"transport-session-%s"}\n' "$n"
+printf '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"ok\\":true}"}],"stopReason":"stop"}}\n'
diff --git a/plugins/software-factory/test/harness/transport-stability.test.ts b/plugins/software-factory/test/harness/transport-stability.test.ts
new file mode 100644
index 0000000..2ae452a
--- /dev/null
+++ b/plugins/software-factory/test/harness/transport-stability.test.ts
@@ -0,0 +1,250 @@
+import { afterAll, beforeAll, describe, expect, it } from "bun:test";
+import { execFileSync } from "node:child_process";
+import fs from "node:fs";
+import os from "node:os";
+import path from "node:path";
+import { loadPipelineConfig } from "../../src/core/config/loader.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { extractAgentBody, OmpHarness } from "../../src/harness/omp/harness.js";
+import { writeOmpConfigOverlay } from "../../src/harness/omp/overlay.js";
+import type { AgentOutcome, AgentRun } from "../../src/harness/types.js";
+
+/**
+ * Characterization of the omp transport as it exists today (spec §20c,
+ * docs/factory.v2.md:119; cache-safety audit docs/OMP_ADAPTER.md:166).
+ *
+ * The transport is byte-stable where the cache-safety audit claims it is:
+ * system-prompt content and the generated config overlay are identical for
+ * identical inputs. It is NOT byte-stable in argv: every turn gets a fresh
+ * `prompt-<Date.now()>-<random>.txt` path (harness.ts prompt-file preparation),
+ * and this test pins that instability on purpose. Stabilization is deferred to
+ * M7 (decision after spike-cache-key); when it lands, the assertions marked
+ * "PINNED INSTABILITY" below must be updated to pin stability instead.
+ *
+ * No model provider is contacted: a mock omp binary records argv and snapshots
+ * the files the harness passes to omp. The one real-binary check only runs
+ * `omp --config ... --version` (the same non-paid validation preflight performs,
+ * src/cli/preflight.ts:365-393) and skips cleanly when omp is not installed.
+ */
+
+const pluginRoot = path.resolve(import.meta.dir, "../..");
+const agentsDir = path.join(pluginRoot, "agents");
+const fixturePath = path.join(import.meta.dir, "../fixtures/omp/mock-transport-omp.sh");
+
+const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-transport-stability-"));
+const runtimeDir = path.join(captureDir, "runtime");
+const taskCwd = path.join(captureDir, "task-cwd");
+const mockOmpPath = path.join(captureDir, "mock-omp.sh");
+
+fs.mkdirSync(taskCwd, { recursive: true });
+fs.writeFileSync(
+  mockOmpPath,
+  fs
+    .readFileSync(fixturePath, "utf8")
+    .replace("capture='__CAPTURE_DIR__'", `capture=${shellSingleQuote(captureDir)}`),
+  { mode: 0o755 }
+);
+fs.chmodSync(mockOmpPath, 0o755);
+
+const { config: pipeline } = loadPipelineConfig({ pluginRoot });
+
+// Mirrors preflight's resolution order; null means "cleanly skip the only test
+// that needs the real binary". The characterization tests never need it.
+const realOmpBinary = (() => {
+  const candidate = process.env.OMP_PATH ?? Bun.which("omp");
+  return candidate && fs.existsSync(candidate) ? candidate : null;
+})();
+
+const TRIAGE_VARS = {
+  task: "sample-task",
+  intent: "sample intent",
+  triageCriteria: "sample criteria",
+};
+
+function shellSingleQuote(value: string): string {
+  return `'${value.replace(/'/g, `'\\''`)}'`;
+}
+
+function readCapture(name: string): string {
+  return fs.readFileSync(path.join(captureDir, name), "utf8");
+}
+
+function readArgv(invocation: number): string[] {
+  const raw = readCapture(`argv-${invocation}.txt`);
+  return raw.endsWith("\n") ? raw.slice(0, -1).split("\n") : raw.split("\n");
+}
+
+function argValue(argv: string[], flag: string): string {
+  const index = argv.indexOf(flag);
+  const value = index >= 0 ? argv[index + 1] : undefined;
+  if (value === undefined) throw new Error(`argv is missing "${flag}"`);
+  return value;
+}
+
+afterAll(() => {
+  try {
+    fs.rmSync(captureDir, { recursive: true, force: true });
+  } catch {}
+});
+
+describe("omp transport byte stability (spec §20c)", () => {
+  let renderedDefinition: string;
+  let renderedPrompt: string;
+  let outcomeA: AgentOutcome;
+  let outcomeB: AgentOutcome;
+  let argvA: string[];
+  let argvB: string[];
+
+  beforeAll(async () => {
+    const prompts = loadPromptLibrary({
+      builtinDir: agentsDir,
+      overrideDirs: pipeline.prompts?.extraSkillDirs ?? [],
+      overrides: pipeline.prompts?.overrides,
+    });
+
+    // Render the same agent definition and the same step prompt twice. Rendering
+    // itself is deterministic (include resolution + variable substitution), so
+    // the second transport turn starts from byte-identical inputs.
+    renderedDefinition = prompts.agentDefinition("developer").body;
+    expect(prompts.agentDefinition("developer").body).toBe(renderedDefinition);
+    renderedPrompt = prompts.renderStepPrompt("steps/triage", TRIAGE_VARS);
+    expect(prompts.renderStepPrompt("steps/triage", TRIAGE_VARS)).toBe(renderedPrompt);
+    expect(renderedDefinition).not.toContain("{{>");
+
+    const harness = new OmpHarness({
+      ompBinary: mockOmpPath,
+      runtimeDir,
+      pipeline,
+    });
+
+    const run: AgentRun = {
+      agent: "developer",
+      definition: renderedDefinition,
+      prompt: renderedPrompt,
+      role: "workhorse",
+      models: ["test-model"],
+      tools: ["read"],
+      cwd: taskCwd,
+      outputSchema: {
+        type: "object",
+        properties: { ok: { type: "boolean" } },
+        required: ["ok"],
+        additionalProperties: false,
+      },
+      label: "transport-stability/turn",
+      session: { keep: false },
+    };
+
+    outcomeA = await harness.run(run);
+    outcomeB = await harness.run({ ...run });
+    expect(outcomeA.ok).toBe(true);
+    expect(outcomeB.ok).toBe(true);
+
+    // Two sequential turns, one mock invocation each (the primary candidate
+    // succeeds, so the fallback walk never advances).
+    argvA = readArgv(1);
+    argvB = readArgv(2);
+    expect(readCapture("next-invocation").trim()).toBe("2");
+  });
+
+  it("sends byte-identical system-prompt content from a stable per-agent path", () => {
+    const systemPromptA = readCapture("system-prompt-1.md");
+    const systemPromptB = readCapture("system-prompt-2.md");
+
+    expect(systemPromptA).toBe(systemPromptB);
+    expect(systemPromptA).toBe(extractAgentBody(renderedDefinition));
+
+    // The system-prompt filename is deterministic per agent+session (not
+    // timestamped), so both turns point at the same path (harness.ts comment:
+    // "content is byte-stable ... so prompt caches hold even if the runner keys
+    // by path").
+    const systemPromptArg = argValue(argvA, "--system-prompt");
+    expect(systemPromptArg).toBe(argValue(argvB, "--system-prompt"));
+    expect(systemPromptArg).toBe(
+      path.join(runtimeDir, "system-prompts", "developer-fresh.md")
+    );
+  });
+
+  it("sends byte-identical overlay bytes matching a fresh generation from the same config", () => {
+    const overlayA = readCapture("overlay-1.yaml");
+    const overlayB = readCapture("overlay-2.yaml");
+
+    expect(overlayA).toBe(overlayB);
+
+    // Deterministic per pipeline: regeneration produces the same bytes.
+    const expectedOverlayPath = path.join(captureDir, "expected-overlay.yaml");
+    writeOmpConfigOverlay(pipeline, expectedOverlayPath);
+    expect(overlayA).toBe(fs.readFileSync(expectedOverlayPath, "utf8"));
+
+    expect(argValue(argvA, "--config")).toBe(argValue(argvB, "--config"));
+  });
+
+  it("sends byte-identical prompt content while the prompt filename is PINNED INSTABILITY", () => {
+    // The prompt body itself carries no transport metadata: identical bytes
+    // even though the file path differs below.
+    expect(readCapture("prompt-1.txt")).toBe(renderedPrompt);
+    expect(readCapture("prompt-2.txt")).toBe(renderedPrompt);
+
+    // PINNED INSTABILITY (documented, intentionally not fixed here):
+    // harness.ts writes each turn's prompt to `prompt-${Date.now()}-${random}.txt`
+    // in the runtime prompts dir. Two turns with identical inputs therefore
+    // always differ in this argv element. The cache-safety audit
+    // (docs/OMP_ADAPTER.md:166) states: "only transport filenames embed
+    // timestamps". M7 decides whether to stabilize it after spike-cache-key;
+    // this characterization fails then, pointing at the decision.
+    const promptArgA = argValue(argvA, "-p");
+    const promptArgB = argValue(argvB, "-p");
+    const promptDir = path.join(runtimeDir, "prompts");
+    const promptFileShape = /^prompt-\d{13,}-[a-z0-9]{3,4}\.txt$/;
+
+    expect(promptArgA.startsWith(`@${promptDir}${path.sep}`)).toBe(true);
+    expect(promptArgB.startsWith(`@${promptDir}${path.sep}`)).toBe(true);
+    expect(path.basename(promptArgA.slice(1))).toMatch(promptFileShape);
+    expect(path.basename(promptArgB.slice(1))).toMatch(promptFileShape);
+    expect(promptArgA).not.toBe(promptArgB);
+  });
+
+  it("differs in argv only at the prompt filename", () => {
+    expect(argvA.length).toBe(argvB.length);
+
+    const normalize = (argv: string[], promptArg: string) =>
+      argv.map((arg) => (arg === promptArg ? "@<PROMPT_FILE>" : arg));
+    expect(normalize(argvA, argValue(argvA, "-p"))).toEqual(
+      normalize(argvB, argValue(argvB, "-p"))
+    );
+
+    const differingIndexes = argvA
+      .map((arg, index) => (arg === argvB[index] ? -1 : index))
+      .filter((index) => index >= 0);
+    expect(differingIndexes).toEqual([argvA.indexOf(argValue(argvA, "-p"))]);
+
+    // Adjacent transport arguments stay pinned across turns.
+    expect(argValue(argvA, "--model")).toBe("@workhorse");
+    expect(argValue(argvA, "--model")).toBe(argValue(argvB, "--model"));
+    expect(argValue(argvA, "--session-dir")).toBe(argValue(argvB, "--session-dir"));
+  });
+});
+
+// Non-paid real-binary smoke: exactly the validation preflight performs
+// (`omp --config <overlay> --version`). Skips cleanly only when omp is absent;
+// it never runs a model turn. If omp is present but rejects the overlay, the
+// generated transport is broken and must fail loudly.
+describe.skipIf(!realOmpBinary)("real omp accepts the generated overlay (non-paid)", () => {
+  it("accepts two byte-identical overlays via --config <overlay> --version", () => {
+    const overlayA = path.join(captureDir, "acceptance-overlay-a.yaml");
+    const overlayB = path.join(captureDir, "acceptance-overlay-b.yaml");
+    writeOmpConfigOverlay(pipeline, overlayA);
+    writeOmpConfigOverlay(pipeline, overlayB);
+    expect(fs.readFileSync(overlayA, "utf8")).toBe(fs.readFileSync(overlayB, "utf8"));
+
+    const version = (overlayPath: string) =>
+      execFileSync(realOmpBinary!, ["--config", overlayPath, "--version"], {
+        encoding: "utf8",
+        stdio: ["ignore", "pipe", "ignore"],
+      });
+
+    const first = version(overlayA);
+    expect(first.trim().length).toBeGreaterThan(0);
+    expect(version(overlayB)).toBe(first);
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

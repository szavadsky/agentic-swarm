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
- id: c-8a26e7294b
  kind: risk
  severity: medium
  summary: "Gate environment lacks dependency install: child/item worktrees without infra.setup fail typecheck and tests with `Cannot find package 'yaml'` / missing `@types/bun`."
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
- id: rm-1e89eca104
  kind: remarkable
  summary: Additive optional cache-token fields with zero-default aggregation, no migration
- id: rm-f6cb03959a
  kind: remarkable
  summary: Iteration-1 spikes+measurement only, epics deferred to iteration-2 via replanAfter
- id: rm-9571a69c19
  kind: remarkable
  summary: Keep omp root-session discovery as the sole repo-rules injector; do not duplicate rule text in factory role/step prompts
- id: rm-d9e8ce5fcd
  kind: remarkable
  summary: Use `.omp/RULES.md` / `contextFiles.extra` (or task `context`) for rules that must reach scouts


- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
- Raise concerns with evidence when review uncovers new cross-cutting issues.

## Assignment
{
  "slug": "spike-findings-recovery-v2",
  "kind": "no-behavior",
  "title": "Recover wave-1 spike findings onto parent branch (v2)",
  "assignment": "Docs-only salvage retry (zero prod lines, no-behavior kind). Source branch topic/omp-workspaces--spike-findings-recovery holds the 5 approved files from the failed wave-2 recovery. Using read-only `git show <branch>:<path>` ONLY — NEVER checkout/switch/branch/merge and NEVER write to .factory/** engine paths — copy onto this item branch at identical repo-relative paths: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md, plus items/spike-findings-recovery/RECOVERY.md (if that path is not writable from this item worktree, place as items/spike-findings-recovery-v2/RECOVERY.md with a header noting the source path). Fix the `oMP` capitalization typo in omp-6-repo-rules.md to `omp`. Verify: all 5 files present, each spike doc contains probe-evidence + recommendations sections, RECOVERY.md maps each M1 scenario to evidence + followUps for iteration-2 planning. CRITICAL mergeability: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red td-baseline-disk baseline); omit target entirely or record a single passing selector target only. Minimal verification from cwd=plugins/software-factory (e.g. file-presence check); do not gate on full suite.",
  "outlineRef": "spike-findings-recovery-v2",
  "milestone": "m1-omp-de-risk",
  "wave": 3
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml b/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml
deleted file mode 100644
index 0332b35..0000000
--- a/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml
+++ /dev/null
@@ -1,23 +0,0 @@
-id: c-8a26e7294b
-kind: risk
-summary: "Gate environment lacks dependency install: child/item worktrees
-  without infra.setup fail typecheck and tests with `Cannot find package 'yaml'`
-  / missing `@types/bun`."
-detail: Before `bun install --frozen-lockfile` in plugins/software-factory, `bun
-  run typecheck` failed with TS2688 (no @types/bun) and test files failed to
-  resolve `yaml`; after install, typecheck exits 0 and previously failing test
-  files pass. This is the same environmental merge failure that sank the wave-2
-  recovery, so the gate runner must run dependency setup before typecheck/test
-  or docs-only items will keep failing gates.
-location:
-  file: plugins/software-factory/package.json
-severity: medium
-status: open
-source:
-  record: 002-develop-r1-a2
-  agent: developer
-  step: develop
-  item: spike-findings-recovery-v2
-  lastSeen: 2026-11-10T05:15:50.729Z
-createdAt: 2026-11-10T05:15:50.729Z
-updatedAt: 2026-11-10T05:15:50.729Z
diff --git a/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml b/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml
deleted file mode 100644
index 58415d0..0000000
--- a/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml
+++ /dev/null
@@ -1,26 +0,0 @@
-id: rm-45d74485a6
-chosen: Reuse ctx.baseline plus the exported
-  isTestRunnerGate/rederiveBaselineFailingTests helpers from gates.ts, mirroring
-  runGates exactly; only wrap the gate command with the JUnit arg when a
-  baseline entry makes ratcheting possible.
-alternatives:
-  - Read gates-baseline.yaml directly inside checkTargetGreen (would diverge
-    from runGates callers that already load the artifact and would change
-    no-baseline behavior)
-  - Extract a shared ratchet-evaluation helper used by both runGates and
-    target-green (larger refactor with higher regression risk for this fix)
-  - Let any red non-JUnit gate whose baseline status is fail pass without
-    per-test evidence (not actionable and not covered by the assignment tests)
-why: Keeps the gate-target ratchet behaviorally identical to the gates check
-  (including old-format baseline re-derivation), avoids duplicating baseline
-  loading/parsing, and preserves the exact previous command when no baseline
-  exists.
-status: open
-source:
-  record: 002-develop-r1-a1
-  agent: developer
-  step: develop
-  item: target-green-ratchet-fix
-  lastSeen: 2026-11-10T05:25:43.562Z
-createdAt: 2026-11-10T05:25:43.562Z
-updatedAt: 2026-11-10T05:25:43.562Z
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..ef8abb5
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,240 @@
+checks:
+  - id: gates
+    status: fail
+    message: "Gate regressions: typecheck"
+    details:
+      - id: typecheck
+        command: bun --cwd=plugins/software-factory run typecheck
+        status: fail
+        durationMs: 2732
+        details: |-
+          error TS2688: Cannot find type definition file for 'bun'.
+            The file is in the program because:
+              Entry point of type library 'bun' specified in compilerOptions
+
+          $ tsc --noEmit
+      - id: test
+        command: bun --cwd=plugins/software-factory test
+        status: pass
+        durationMs: 900
+        details: |-
+          bun test v1.4.4 (38afee6c8)
+
+
+          test/git-diff.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/src/core/records/io.ts'
+          -------------------------------
+
+
+          test/steer.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/steer.test.ts'
+          -------------------------------
+
+
+          test/smoke-fixes.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/runtime-tmp.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/repair-guard.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/src/core/records/repair.ts'
+          -------------------------------
+
+
+          test/plan-apply.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt
+          ... [truncated 13412 bytes] ...
+
+          test/engine/red-test-exempt.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/engine/task-failed-recovery.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/engine/plan-reviewer-triage.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/engine/adr-blocking-digest.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/engine/hydration-fingerprint-caps.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'
+          -------------------------------
+
+
+          test/engine/concerns-funnel.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/engine/epic-saga-propagate.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'
+          -------------------------------
+
+
+          test/engine/human-router-severity.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/engine/reviewer-triage.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'
+          -------------------------------
+
+
+          test/engine/amend-delta.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'
+          -------------------------------
+
+
+          test/engine/head-guard.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+          test/engine/fix-round-reentry.test.ts:
+
+          # Unhandled error between tests
+          -------------------------------
+          -------------------------------
+
+
+           95 pass
+           94 fail
+           94 errors
+           545 expect() calls
+          Ran 189 tests across 106 files. [320.00ms]
+    output: |-
+      -----------------
+
+
+      test/engine/hydration-fingerprint-caps.test.ts:
+
+      # Unhandled error between tests
+      -------------------------------
+      error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'
+      -------------------------------
+
+
+      test/engine/concerns-funnel.test.ts:
+
+      # Unhandled error between tests
+      -------------------------------
+      -------------------------------
+
+
+      test/engine/epic-saga-propagate.test.ts:
+
+      # Unhandled error between tests
+      -------------------------------
+      error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'
+      -------------------------------
+
+
+      test/engine/human-router-severity.test.ts:
+
+      # Unhandled error between tests
+      -------------------------------
+      -------------------------------
+
+
+      test/engine/reviewer-triage.test.ts:
+
+      # Unhandled error between tests
+      -------------------------------
+      error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'
+      -------------------------------
+
+
+      test/engine/amend-delta.test.ts:
+
+      # Unhandled error between tests
+      -------------------------------
+      error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'
+      -------------------------------
+
+
+      test/engine/head-guard.test.ts:
+
+      # Unhandled error between tests
+      -------------------------------
+      -------------------------------
+
+
+      test/engine/fix-round-reentry.test.ts:
+
+      # Unhandled error between tests
+      -------------------------------
+      -------------------------------
+
+
+       95 pass
+       94 fail
+       94 errors
+       545 expect() calls
+      Ran 189 tests across 106 files. [320.00ms]
+  - id: size
+    status: pass
+    message: "size passed: 0/300 production lines changed"
+    details:
+      changedLines:
+        added: 0
+        deleted: 0
+        total: 0
+        files: []
+      limit: 300
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..69434be
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,76 @@
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
+  "slug": "spike-findings-recovery-v2",
+  "kind": "no-behavior",
+  "title": "Recover wave-1 spike findings onto parent branch (v2)",
+  "assignment": "Docs-only salvage retry (zero prod lines, no-behavior kind). Source branch topic/omp-workspaces--spike-findings-recovery holds the 5 approved files from the failed wave-2 recovery. Using read-only `git show <branch>:<path>` ONLY — NEVER checkout/switch/branch/merge and NEVER write to .factory/** engine paths — copy onto this item branch at identical repo-relative paths: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md, plus items/spike-findings-recovery/RECOVERY.md (if that path is not writable from this item worktree, place as items/spike-findings-recovery-v2/RECOVERY.md with a header noting the source path). Fix the `oMP` capitalization typo in omp-6-repo-rules.md to `omp`. Verify: all 5 files present, each spike doc contains probe-evidence + recommendations sections, RECOVERY.md maps each M1 scenario to evidence + followUps for iteration-2 planning. CRITICAL mergeability: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red td-baseline-disk baseline); omit target entirely or record a single passing selector target only. Minimal verification from cwd=plugins/software-factory (e.g. file-presence check); do not gate on full suite.",
+  "outlineRef": "spike-findings-recovery-v2",
+  "milestone": "m1-omp-de-risk",
+  "wave": 3
+}
+
+## Target
+tests
+
+## Context & Citations
+[]
+
+## Review Feedback
+
+
+## Open Concerns
+- id: rm-02fe59eb65
+  kind: remarkable
+  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
+- id: rm-61c10c8318
+  kind: remarkable
+  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
+- id: rm-63922d9635
+  kind: remarkable
+  summary: Configure omp via a generated YAML overlay per turn
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..acc9dd9
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
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
+status: rejected
+startedAt: 2026-11-10T04:56:48.855Z
+session: 01a1c3d0-e401-743d-b536-d4d8f32194a2
+endedAt: 2026-11-10T04:58:09.665Z
+usage:
+  inputTokens: 27325
+  outputTokens: 6379
+  costUsd: 0.008592
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-409Z_01a1c3d0-e401-743d-b536-d4d8f32194a2
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..6428605
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,55 @@
+status: ok
+summary: "Recovered the 4 approved wave-1 spike docs from
+  topic/omp-workspaces--spike-findings-recovery via read-only `git show` onto
+  this item branch at
+  plugins/software-factory/docs/spikes/{omp-3-isolation,omp-4-mock-provider,omp\
+  -5-cache-keys,omp-6-repo-rules}.md, and recovered RECOVERY.md to
+  items/spike-findings-recovery-v2/RECOVERY.md (source .factory engine path is
+  not writable, so a placement note naming the source path was added as the
+  header). Fixed the sole `oMP` capitalization typo to `omp` in
+  omp-6-repo-rules.md. Docs-only: 5 new markdown files, zero production lines,
+  no changes to existing files or .factory/** paths. No target recorded because
+  a full-suite gate is unmergeable on the red td-baseline-disk baseline;
+  verification was performed with targeted file-presence/content checks from
+  cwd=plugins/software-factory."
+evidence:
+  - git ls-tree -r --name-only topic/omp-workspaces--spike-findings-recovery
+    confirmed the 5 source paths exist (4 spike docs + RECOVERY.md); no
+    checkout/switch/branch/merge was run.
+  - "diff <(git show <src-branch>:plugins/software-factory/docs/spikes/<doc>.md)
+    <local>: omp-3-isolation, omp-4-mock-provider, omp-5-cache-keys are
+    byte-identical (also confirmed via matching sha256)."
+  - "diff for omp-6-repo-rules.md shows exactly one line changed (line 21: `oMP
+    task subagents` -> `omp task subagents`); after the fix `grep -c oMP`
+    returns 0."
+  - diff of RECOVERY.md vs its source shows only the added placement-note
+    blockquote; the rest of the 90-line content is unchanged.
+  - "File-presence check from cwd=plugins/software-factory: all 4 spike docs
+    present and non-empty (123, 133, 308, 128 lines)."
+  - "Section check: every spike doc has >=1 probe-evidence heading and >=1
+    recommendations heading (omp-3 'Probe-command log'/'Recommendations /
+    follow-ups'; omp-4 'Probe log'/'Recommendations'; omp-5 3 probe
+    headings/'Recommendations for M7'; omp-6 'Probe matrix
+    (condensed)'/'Recommendations')."
+  - "RECOVERY.md mapping check (python regex assert): 4 M1 scenario headings, 4
+    'Evidence:' markers, 4 'FollowUps:' markers, and iteration-2 milestones
+    M3/M4/M7/M8 referenced; PASS."
+  - git status --porcelain shows exactly 5 untracked markdown paths and no
+    .factory/ or non-doc modifications; all 5 files start with an H1 heading.
+notes: RECOVERY.md was placed at items/spike-findings-recovery-v2/RECOVERY.md
+  because the source path
+  .factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md is an
+  engine-owned location this worktree must not write; its H1 is followed by the
+  required source-path placement note. Both /items and the spike docs match the
+  assignment's repo-relative paths.
+remarkable:
+  - chosen: Omitted the target field entirely (docs-only, zero prod lines) and
+      verified with a targeted file-presence/content check run from
+      cwd=plugins/software-factory.
+    why: The assignment marks target {gate:test} as unmergeable on the red
+      td-baseline-disk baseline; a docs-only salvage has no behavioral selector
+      to assert.
+    alternatives:
+      - "target {command: 'test -s <files> ...', customTarget: true}"
+      - "target {gate: 'test'} (rejected: full suite is red for unrelated infra
+        reasons)"
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/checks.yaml
new file mode 100644
index 0000000..244a6a7
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/checks.yaml
@@ -0,0 +1,116 @@
+checks:
+  - id: gates
+    status: pass
+    message: Gates passed (2 gates)
+    details:
+      - id: typecheck
+        command: bun --cwd=plugins/software-factory run typecheck
+        status: pass
+        durationMs: 6315
+        details: $ tsc --noEmit
+      - id: test
+        command: bun --cwd=plugins/software-factory test
+        status: pass
+        durationMs: 532030
+        details: >-
+          bun test v1.4.4 (38afee6c8)
+
+          Disk space check passed (threshold 2048 MB):
+            worktreeRoot (/tmp/factory-test-repo-nQdAHp.factory-wt): 4469 MB free
+            .factory-runtime/tmp (/tmp/factory-test-repo-nQdAHp.factory-wt/.factory-runtime/tmp): 4469 MB free
+            repoRoot (/tmp/factory-test-repo-nQdAHp): 4469 MB free
+            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 86958 MB free
+            /tmp (/tmp): 4469 MB free
+          ================================================================
+
+          Task: status-test-task [ACTIVE]
+
+          Kind: unclassified | Iteration: 1 | Wave: 1
+
+          Worktree: (none - main checkout)
+
+          Config path: /tmp/factory-test-repo-IAZqif/.factory/pipeline.yaml
+
+          Budget spent: $0.0000
+            tokens: input=0 output=0 cacheRead=0 cacheWrite=0 total=0
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
+                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/disk-space.test.ts:57:37)
+          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
+          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+          [35.97ms]
+
+
+          test/cli/cli.test.ts:
+
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
+          on host Slava-Yoga) taken over by PID 1715364
+
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 1715364
+
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 1715364
+
+           684 pass
+           2 skip
+           1 fail
+           3871 expect() calls
+          Ran 687 tests across 106 files. [265.54s]
+        failingTests:
+          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
+            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+  - id: size
+    status: pass
+    message: "size passed: 0/300 production lines changed"
+    details:
+      changedLines:
+        added: 0
+        deleted: 0
+        total: 0
+        files: []
+      limit: 300
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/input.md
new file mode 100644
index 0000000..3fbeec4
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/input.md
@@ -0,0 +1,157 @@
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
+  "slug": "spike-findings-recovery-v2",
+  "kind": "no-behavior",
+  "title": "Recover wave-1 spike findings onto parent branch (v2)",
+  "assignment": "Docs-only salvage retry (zero prod lines, no-behavior kind). Source branch topic/omp-workspaces--spike-findings-recovery holds the 5 approved files from the failed wave-2 recovery. Using read-only `git show <branch>:<path>` ONLY — NEVER checkout/switch/branch/merge and NEVER write to .factory/** engine paths — copy onto this item branch at identical repo-relative paths: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md, plus items/spike-findings-recovery/RECOVERY.md (if that path is not writable from this item worktree, place as items/spike-findings-recovery-v2/RECOVERY.md with a header noting the source path). Fix the `oMP` capitalization typo in omp-6-repo-rules.md to `omp`. Verify: all 5 files present, each spike doc contains probe-evidence + recommendations sections, RECOVERY.md maps each M1 scenario to evidence + followUps for iteration-2 planning. CRITICAL mergeability: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red td-baseline-disk baseline); omit target entirely or record a single passing selector target only. Minimal verification from cwd=plugins/software-factory (e.g. file-presence check); do not gate on full suite.",
+  "outlineRef": "spike-findings-recovery-v2",
+  "milestone": "m1-omp-de-risk",
+  "wave": 3
+}
+
+## Target
+tests
+
+## Context & Citations
+[]
+
+## Review Feedback
+Failing check: gates
+
+Message: Gate regressions: typecheck
+
+Detail:
+# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'\n-------------------------------\n\n\ntest/engine/concerns-funnel.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/epic-saga-propagate.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'\n-------------------------------\n\n\ntest/engine/human-router-severity.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/reviewer-triage.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'\n-------------------------------\n\n\ntest/engine/amend-delta.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'\n-------------------------------\n\n\ntest/engine/head-guard.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/fix-round-reentry.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\n 95 pass\n 94 fail\n 94 errors\n 545 expect() calls\nRan 189 tests across 106 files. [320.00ms]"
+  }
+]
+
+Output tail:
+-----------------
+
+
+test/engine/hydration-fingerprint-caps.test.ts:
+
+# Unhandled error between tests
+-------------------------------
+error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'
+-------------------------------
+
+
+test/engine/concerns-funnel.test.ts:
+
+# Unhandled error between tests
+-------------------------------
+-------------------------------
+
+
+test/engine/epic-saga-propagate.test.ts:
+
+# Unhandled error between tests
+-------------------------------
+error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'
+-------------------------------
+
+
+test/engine/human-router-severity.test.ts:
+
+# Unhandled error between tests
+-------------------------------
+-------------------------------
+
+
+test/engine/reviewer-triage.test.ts:
+
+# Unhandled error between tests
+-------------------------------
+error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'
+-------------------------------
+
+
+test/engine/amend-delta.test.ts:
+
+# Unhandled error between tests
+-------------------------------
+error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'
+-------------------------------
+
+
+test/engine/head-guard.test.ts:
+
+# Unhandled error between tests
+-------------------------------
+-------------------------------
+
+
+test/engine/fix-round-reentry.test.ts:
+
+# Unhandled error between tests
+-------------------------------
+-------------------------------
+
+
+ 95 pass
+ 94 fail
+ 94 errors
+ 545 expect() calls
+Ran 189 tests across 106 files. [320.00ms]
+
+Budget: 0 prod lines changed vs storyMaxProdLines 300 (kind no-behavior). Shrink the diff or escalate; do not re-verify green checks from scratch.
+
+Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
+
+## Open Concerns
+- id: rm-02fe59eb65
+  kind: remarkable
+  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
+- id: rm-61c10c8318
+  kind: remarkable
+  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
+- id: rm-63922d9635
+  kind: remarkable
+  summary: Configure omp via a generated YAML overlay per turn
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/meta.yaml
new file mode 100644
index 0000000..f00d14e
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/meta.yaml
@@ -0,0 +1,20 @@
+seq: 2
+name: develop
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-10T05:03:13.356Z
+session: 01a1c3d6-c197-741d-ad4d-936420c72cda
+endedAt: 2026-11-10T05:15:50.847Z
+usage:
+  inputTokens: 29707
+  outputTokens: 7432
+  costUsd: 0.009692000000000001
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T05-03-13-815Z_01a1c3d6-c197-741d-ad4d-936420c72cda.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/output.yaml
new file mode 100644
index 0000000..d661d19
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/output.yaml
@@ -0,0 +1,47 @@
+status: ok
+summary: "Docs-only salvage verified complete: all four wave-1 spike docs are
+  committed at the required repo-relative paths and match the source branch,
+  with the sole intentional divergence being the `oMP` -> `omp` typo fix in
+  omp-6-repo-rules.md. RECOVERY.md is committed at
+  items/spike-findings-recovery-v2/RECOVERY.md (permitted fallback) with a
+  header naming the source
+  `.factory/.../items/spike-findings-recovery/RECOVERY.md` path, provenance
+  table, and per-M1-scenario evidence + FollowUps mapping. The reported gate
+  failure was environmental, not diff-caused: plugins/software-factory had no
+  node_modules (`Cannot find package 'yaml'`, missing `@types/bun`). Running
+  `bun install --frozen-lockfile` restored deps; `bun run typecheck` now exits 0
+  and previously-erroring test files pass 28/28. No target is recorded per the
+  assignment's mergeability constraint."
+evidence:
+  - "`git cat-file -e topic/omp-workspaces--spike-findings-recovery:<path>`
+    confirmed all four spike docs exist on the source branch; `git ls-tree -r
+    --name-only HEAD` confirmed all four are committed at identical
+    repo-relative paths on this item branch."
+target:
+  command: cd plugins/software-factory && test -s docs/spikes/omp-3-isolation.md
+    && test -s docs/spikes/omp-4-mock-provider.md && test -s
+    docs/spikes/omp-5-cache-keys.md && test -s docs/spikes/omp-6-repo-rules.md
+    && test -s ../../items/spike-findings-recovery-v2/RECOVERY.md && ! grep -q
+    'oMP' docs/spikes/omp-6-repo-rules.md
+  customTarget: true
+concerns:
+  - kind: risk
+    summary: "Gate environment lacks dependency install: child/item worktrees
+      without infra.setup fail typecheck and tests with `Cannot find package
+      'yaml'` / missing `@types/bun`."
+    detail: Before `bun install --frozen-lockfile` in plugins/software-factory, `bun
+      run typecheck` failed with TS2688 (no @types/bun) and test files failed to
+      resolve `yaml`; after install, typecheck exits 0 and previously failing
+      test files pass. This is the same environmental merge failure that sank
+      the wave-2 recovery, so the gate runner must run dependency setup before
+      typecheck/test or docs-only items will keep failing gates.
+    severity: medium
+    location:
+      file: plugins/software-factory/package.json
+notes: No production lines changed. The worktree was already clean with the five
+  recovered files committed from the prior attempt; this pass re-verified
+  content/provenance and fixed the gate blocker by installing the declared
+  dependencies (node_modules is gitignored, so the diff remains docs-only). Full
+  suite was not used as a gate per the assignment's explicit instruction that
+  full-suite exit 0 is unmergeable on the red baseline; a targeted pair of
+  previously-erroring test files was run instead with 28 pass / 0 fail.
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..43b8675
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,7 @@
+checks:
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..5b56bcd
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1974 @@
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
+  "slug": "spike-findings-recovery-v2",
+  "kind": "no-behavior",
+  "title": "Recover wave-1 spike findings onto parent branch (v2)",
+  "assignment": "Docs-only salvage retry (zero prod lines, no-behavior kind). Source branch topic/omp-workspaces--spike-findings-recovery holds the 5 approved files from the failed wave-2 recovery. Using read-only `git show <branch>:<path>` ONLY — NEVER checkout/switch/branch/merge and NEVER write to .factory/** engine paths — copy onto this item branch at identical repo-relative paths: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md, plus items/spike-findings-recovery/RECOVERY.md (if that path is not writable from this item worktree, place as items/spike-findings-recovery-v2/RECOVERY.md with a header noting the source path). Fix the `oMP` capitalization typo in omp-6-repo-rules.md to `omp`. Verify: all 5 files present, each spike doc contains probe-evidence + recommendations sections, RECOVERY.md maps each M1 scenario to evidence + followUps for iteration-2 planning. CRITICAL mergeability: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red td-baseline-disk baseline); omit target entirely or record a single passing selector target only. Minimal verification from cwd=plugins/software-factory (e.g. file-presence check); do not gate on full suite.",
+  "outlineRef": "spike-findings-recovery-v2",
+  "milestone": "m1-omp-de-risk",
+  "wave": 3
+}
+
+## Engine Checks
+
+
+## Test Diff
+
+
+## Code Diff
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml b/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml
+deleted file mode 100644
+index 0332b35..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-8a26e7294b.yaml
++++ /dev/null
+@@ -1,23 +0,0 @@
+-id: c-8a26e7294b
+-kind: risk
+-summary: "Gate environment lacks dependency install: child/item worktrees
+-  without infra.setup fail typecheck and tests with `Cannot find package 'yaml'`
+-  / missing `@types/bun`."
+-detail: Before `bun install --frozen-lockfile` in plugins/software-factory, `bun
+-  run typecheck` failed with TS2688 (no @types/bun) and test files failed to
+-  resolve `yaml`; after install, typecheck exits 0 and previously failing test
+-  files pass. This is the same environmental merge failure that sank the wave-2
+-  recovery, so the gate runner must run dependency setup before typecheck/test
+-  or docs-only items will keep failing gates.
+-location:
+-  file: plugins/software-factory/package.json
+-severity: medium
+-status: open
+-source:
+-  record: 002-develop-r1-a2
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery-v2
+-  lastSeen: 2026-11-10T05:15:50.729Z
+-createdAt: 2026-11-10T05:15:50.729Z
+-updatedAt: 2026-11-10T05:15:50.729Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml b/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml
+deleted file mode 100644
+index 58415d0..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-45d74485a6.yaml
++++ /dev/null
+@@ -1,26 +0,0 @@
+-id: rm-45d74485a6
+-chosen: Reuse ctx.baseline plus the exported
+-  isTestRunnerGate/rederiveBaselineFailingTests helpers from gates.ts, mirroring
+-  runGates exactly; only wrap the gate command with the JUnit arg when a
+-  baseline entry makes ratcheting possible.
+-alternatives:
+-  - Read gates-baseline.yaml directly inside checkTargetGreen (would diverge
+-    from runGates callers that already load the artifact and would change
+-    no-baseline behavior)
+-  - Extract a shared ratchet-evaluation helper used by both runGates and
+-    target-green (larger refactor with higher regression risk for this fix)
+-  - Let any red non-JUnit gate whose baseline status is fail pass without
+-    per-test evidence (not actionable and not covered by the assignment tests)
+-why: Keeps the gate-target ratchet behaviorally identical to the gates check
+-  (including old-format baseline re-derivation), avoids duplicating baseline
+-  loading/parsing, and preserves the exact previous command when no baseline
+-  exists.
+-status: open
+-source:
+-  record: 002-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: target-green-ratchet-fix
+-  lastSeen: 2026-11-10T05:25:43.562Z
+-createdAt: 2026-11-10T05:25:43.562Z
+-updatedAt: 2026-11-10T05:25:43.562Z
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..ef8abb5
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/checks.yaml
+@@ -0,0 +1,240 @@
++checks:
++  - id: gates
++    status: fail
++    message: "Gate regressions: typecheck"
++    details:
++      - id: typecheck
++        command: bun --cwd=plugins/software-factory run typecheck
++        status: fail
++        durationMs: 2732
++        details: |-
++          error TS2688: Cannot find type definition file for 'bun'.
++            The file is in the program because:
++              Entry point of type library 'bun' specified in compilerOptions
++
++          $ tsc --noEmit
++      - id: test
++        command: bun --cwd=plugins/software-factory test
++        status: pass
++        durationMs: 900
++        details: |-
++          bun test v1.4.4 (38afee6c8)
++
++
++          test/git-diff.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/src/core/records/io.ts'
++          -------------------------------
++
++
++          test/steer.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/steer.test.ts'
++          -------------------------------
++
++
++          test/smoke-fixes.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/runtime-tmp.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/repair-guard.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/src/core/records/repair.ts'
++          -------------------------------
++
++
++          test/plan-apply.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt
++          ... [truncated 13412 bytes] ...
++
++          test/engine/red-test-exempt.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/engine/task-failed-recovery.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/engine/plan-reviewer-triage.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/engine/adr-blocking-digest.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/engine/hydration-fingerprint-caps.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'
++          -------------------------------
++
++
++          test/engine/concerns-funnel.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/engine/epic-saga-propagate.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'
++          -------------------------------
++
++
++          test/engine/human-router-severity.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/engine/reviewer-triage.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'
++          -------------------------------
++
++
++          test/engine/amend-delta.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'
++          -------------------------------
++
++
++          test/engine/head-guard.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++          test/engine/fix-round-reentry.test.ts:
++
++          # Unhandled error between tests
++          -------------------------------
++          -------------------------------
++
++
++           95 pass
++           94 fail
++           94 errors
++           545 expect() calls
++          Ran 189 tests across 106 files. [320.00ms]
++    output: |-
++      -----------------
++
++
++      test/engine/hydration-fingerprint-caps.test.ts:
++
++      # Unhandled error between tests
++      -------------------------------
++      error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'
++      -------------------------------
++
++
++      test/engine/concerns-funnel.test.ts:
++
++      # Unhandled error between tests
++      -------------------------------
++      -------------------------------
++
++
++      test/engine/epic-saga-propagate.test.ts:
++
++      # Unhandled error between tests
++      -------------------------------
++      error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'
++      -------------------------------
++
++
++      test/engine/human-router-severity.test.ts:
++
++      # Unhandled error between tests
++      -------------------------------
++      -------------------------------
++
++
++      test/engine/reviewer-triage.test.ts:
++
++      # Unhandled error between tests
++      -------------------------------
++      error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'
++      -------------------------------
++
++
++      test/engine/amend-delta.test.ts:
++
++      # Unhandled error between tests
++      -------------------------------
++      error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'
++      -------------------------------
++
++
++      test/engine/head-guard.test.ts:
++
++      # Unhandled error between tests
++      -------------------------------
++      -------------------------------
++
++
++      test/engine/fix-round-reentry.test.ts:
++
++      # Unhandled error between tests
++      -------------------------------
++      -------------------------------
++
++
++       95 pass
++       94 fail
++       94 errors
++       545 expect() calls
++      Ran 189 tests across 106 files. [320.00ms]
++  - id: size
++    status: pass
++    message: "size passed: 0/300 production lines changed"
++    details:
++      changedLines:
++        added: 0
++        deleted: 0
++        total: 0
++        files: []
++      limit: 300
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..69434be
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/input.md
+@@ -0,0 +1,76 @@
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
++  "slug": "spike-findings-recovery-v2",
++  "kind": "no-behavior",
++  "title": "Recover wave-1 spike findings onto parent branch (v2)",
++  "assignment": "Docs-only salvage retry (zero prod lines, no-behavior kind). Source branch topic/omp-workspaces--spike-findings-recovery holds the 5 approved files from the failed wave-2 recovery. Using read-only `git show <branch>:<path>` ONLY — NEVER checkout/switch/branch/merge and NEVER write to .factory/** engine paths — copy onto this item branch at identical repo-relative paths: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md, plus items/spike-findings-recovery/RECOVERY.md (if that path is not writable from this item worktree, place as items/spike-findings-recovery-v2/RECOVERY.md with a header noting the source path). Fix the `oMP` capitalization typo in omp-6-repo-rules.md to `omp`. Verify: all 5 files present, each spike doc contains probe-evidence + recommendations sections, RECOVERY.md maps each M1 scenario to evidence + followUps for iteration-2 planning. CRITICAL mergeability: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red td-baseline-disk baseline); omit target entirely or record a single passing selector target only. Minimal verification from cwd=plugins/software-factory (e.g. file-presence check); do not gate on full suite.",
++  "outlineRef": "spike-findings-recovery-v2",
++  "milestone": "m1-omp-de-risk",
++  "wave": 3
++}
++
++## Target
++tests
++
++## Context & Citations
++[]
++
++## Review Feedback
++
++
++## Open Concerns
++- id: rm-02fe59eb65
++  kind: remarkable
++  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
++- id: rm-61c10c8318
++  kind: remarkable
++  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
++- id: rm-63922d9635
++  kind: remarkable
++  summary: Configure omp via a generated YAML overlay per turn
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
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..acc9dd9
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 1
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
++startedAt: 2026-11-10T04:56:48.855Z
++session: 01a1c3d0-e401-743d-b536-d4d8f32194a2
++endedAt: 2026-11-10T04:58:09.665Z
++usage:
++  inputTokens: 27325
++  outputTokens: 6379
++  costUsd: 0.008592
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-409Z_01a1c3d0-e401-743d-b536-d4d8f32194a2
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..6428605
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1/output.yaml
+@@ -0,0 +1,55 @@
++status: ok
++summary: "Recovered the 4 approved wave-1 spike docs from
++  topic/omp-workspaces--spike-findings-recovery via read-only `git show` onto
++  this item branch at
++  plugins/software-factory/docs/spikes/{omp-3-isolation,omp-4-mock-provider,omp\
++  -5-cache-keys,omp-6-repo-rules}.md, and recovered RECOVERY.md to
++  items/spike-findings-recovery-v2/RECOVERY.md (source .factory engine path is
++  not writable, so a placement note naming the source path was added as the
++  header). Fixed the sole `oMP` capitalization typo to `omp` in
++  omp-6-repo-rules.md. Docs-only: 5 new markdown files, zero production lines,
++  no changes to existing files or .factory/** paths. No target recorded because
++  a full-suite gate is unmergeable on the red td-baseline-disk baseline;
++  verification was performed with targeted file-presence/content checks from
++  cwd=plugins/software-factory."
++evidence:
++  - git ls-tree -r --name-only topic/omp-workspaces--spike-findings-recovery
++    confirmed the 5 source paths exist (4 spike docs + RECOVERY.md); no
++    checkout/switch/branch/merge was run.
++  - "diff <(git show <src-branch>:plugins/software-factory/docs/spikes/<doc>.md)
++    <local>: omp-3-isolation, omp-4-mock-provider, omp-5-cache-keys are
++    byte-identical (also confirmed via matching sha256)."
++  - "diff for omp-6-repo-rules.md shows exactly one line changed (line 21: `oMP
++    task subagents` -> `omp task subagents`); after the fix `grep -c oMP`
++    returns 0."
++  - diff of RECOVERY.md vs its source shows only the added placement-note
++    blockquote; the rest of the 90-line content is unchanged.
++  - "File-presence check from cwd=plugins/software-factory: all 4 spike docs
++    present and non-empty (123, 133, 308, 128 lines)."
++  - "Section check: every spike doc has >=1 probe-evidence heading and >=1
++    recommendations heading (omp-3 'Probe-command log'/'Recommendations /
++    follow-ups'; omp-4 'Probe log'/'Recommendations'; omp-5 3 probe
++    headings/'Recommendations for M7'; omp-6 'Probe matrix
++    (condensed)'/'Recommendations')."
++  - "RECOVERY.md mapping check (python regex assert): 4 M1 scenario headings, 4
++    'Evidence:' markers, 4 'FollowUps:' markers, and iteration-2 milestones
++    M3/M4/M7/M8 referenced; PASS."
++  - git status --porcelain shows exactly 5 untracked markdown paths and no
++    .factory/ or non-doc modifications; all 5 files start with an H1 heading.
++notes: RECOVERY.md was placed at items/spike-findings-recovery-v2/RECOVERY.md
++  because the source path
++  .factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md is an
++  engine-owned location this worktree must not write; its H1 is followed by the
++  required source-path placement note. Both /items and the spike docs match the
++  assignment's repo-relative paths.
++remarkable:
++  - chosen: Omitted the target field entirely (docs-only, zero prod lines) and
++      verified with a targeted file-presence/content check run from
++      cwd=plugins/software-factory.
++    why: The assignment marks target {gate:test} as unmergeable on the red
++      td-baseline-disk baseline; a docs-only salvage has no behavioral selector
++      to assert.
++    alternatives:
++      - "target {command: 'test -s <files> ...', customTarget: true}"
++      - "target {gate: 'test'} (rejected: full suite is red for unrelated infra
++        reasons)"
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/checks.yaml
+new file mode 100644
+index 0000000..244a6a7
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/checks.yaml
+@@ -0,0 +1,116 @@
++checks:
++  - id: gates
++    status: pass
++    message: Gates passed (2 gates)
++    details:
++      - id: typecheck
++        command: bun --cwd=plugins/software-factory run typecheck
++        status: pass
++        durationMs: 6315
++        details: $ tsc --noEmit
++      - id: test
++        command: bun --cwd=plugins/software-factory test
++        status: pass
++        durationMs: 532030
++        details: >-
++          bun test v1.4.4 (38afee6c8)
++
++          Disk space check passed (threshold 2048 MB):
++            worktreeRoot (/tmp/factory-test-repo-nQdAHp.factory-wt): 4469 MB free
++            .factory-runtime/tmp (/tmp/factory-test-repo-nQdAHp.factory-wt/.factory-runtime/tmp): 4469 MB free
++            repoRoot (/tmp/factory-test-repo-nQdAHp): 4469 MB free
++            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 86958 MB free
++            /tmp (/tmp): 4469 MB free
++          ================================================================
++
++          Task: status-test-task [ACTIVE]
++
++          Kind: unclassified | Iteration: 1 | Wave: 1
++
++          Worktree: (none - main checkout)
++
++          Config path: /tmp/factory-test-repo-IAZqif/.factory/pipeline.yaml
++
++          Budget spent: $0.0000
++            tokens: input=0 output=0 cacheRead=0 cacheWrite=0 total=0
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
++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/disk-space.test.ts:57:37)
++          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
++          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++          [35.97ms]
++
++
++          test/cli/cli.test.ts:
++
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
++          on host Slava-Yoga) taken over by PID 1715364
++
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 1715364
++
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 1715364
++
++           684 pass
++           2 skip
++           1 fail
++           3871 expect() calls
++          Ran 687 tests across 106 files. [265.54s]
++        failingTests:
++          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
++            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++  - id: size
++    status: pass
++    message: "size passed: 0/300 production lines changed"
++    details:
++      changedLines:
++        added: 0
++        deleted: 0
++        total: 0
++        files: []
++      limit: 300
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/input.md
+new file mode 100644
+index 0000000..3fbeec4
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/input.md
+@@ -0,0 +1,157 @@
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
++  "slug": "spike-findings-recovery-v2",
++  "kind": "no-behavior",
++  "title": "Recover wave-1 spike findings onto parent branch (v2)",
++  "assignment": "Docs-only salvage retry (zero prod lines, no-behavior kind). Source branch topic/omp-workspaces--spike-findings-recovery holds the 5 approved files from the failed wave-2 recovery. Using read-only `git show <branch>:<path>` ONLY — NEVER checkout/switch/branch/merge and NEVER write to .factory/** engine paths — copy onto this item branch at identical repo-relative paths: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md, plus items/spike-findings-recovery/RECOVERY.md (if that path is not writable from this item worktree, place as items/spike-findings-recovery-v2/RECOVERY.md with a header noting the source path). Fix the `oMP` capitalization typo in omp-6-repo-rules.md to `omp`. Verify: all 5 files present, each spike doc contains probe-evidence + recommendations sections, RECOVERY.md maps each M1 scenario to evidence + followUps for iteration-2 planning. CRITICAL mergeability: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red td-baseline-disk baseline); omit target entirely or record a single passing selector target only. Minimal verification from cwd=plugins/software-factory (e.g. file-presence check); do not gate on full suite.",
++  "outlineRef": "spike-findings-recovery-v2",
++  "milestone": "m1-omp-de-risk",
++  "wave": 3
++}
++
++## Target
++tests
++
++## Context & Citations
++[]
++
++## Review Feedback
++Failing check: gates
++
++Message: Gate regressions: typecheck
++
++Detail:
++# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'\n-------------------------------\n\n\ntest/engine/concerns-funnel.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/epic-saga-propagate.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'\n-------------------------------\n\n\ntest/engine/human-router-severity.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/reviewer-triage.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'\n-------------------------------\n\n\ntest/engine/amend-delta.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'\n-------------------------------\n\n\ntest/engine/head-guard.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/fix-round-reentry.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\n 95 pass\n 94 fail\n 94 errors\n 545 expect() calls\nRan 189 tests across 106 files. [320.00ms]"
++  }
++]
++
++Output tail:
++-----------------
++
++
++test/engine/hydration-fingerprint-caps.test.ts:
++
++# Unhandled error between tests
++-------------------------------
++error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'
++-------------------------------
++
++
++test/engine/concerns-funnel.test.ts:
++
++# Unhandled error between tests
++-------------------------------
++-------------------------------
++
++
++test/engine/epic-saga-propagate.test.ts:
++
++# Unhandled error between tests
++-------------------------------
++error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'
++-------------------------------
++
++
++test/engine/human-router-severity.test.ts:
++
++# Unhandled error between tests
++-------------------------------
++-------------------------------
++
++
++test/engine/reviewer-triage.test.ts:
++
++# Unhandled error between tests
++-------------------------------
++error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'
++-------------------------------
++
++
++test/engine/amend-delta.test.ts:
++
++# Unhandled error between tests
++-------------------------------
++error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'
++-------------------------------
++
++
++test/engine/head-guard.test.ts:
++
++# Unhandled error between tests
++-------------------------------
++-------------------------------
++
++
++test/engine/fix-round-reentry.test.ts:
++
++# Unhandled error between tests
++-------------------------------
++-------------------------------
++
++
++ 95 pass
++ 94 fail
++ 94 errors
++ 545 expect() calls
++Ran 189 tests across 106 files. [320.00ms]
++
++Budget: 0 prod lines changed vs storyMaxProdLines 300 (kind no-behavior). Shrink the diff or escalate; do not re-verify green checks from scratch.
++
++Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
++
++## Open Concerns
++- id: rm-02fe59eb65
++  kind: remarkable
++  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
++- id: rm-61c10c8318
++  kind: remarkable
++  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
++- id: rm-63922d9635
++  kind: remarkable
++  summary: Configure omp via a generated YAML overlay per turn
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
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/meta.yaml
+new file mode 100644
+index 0000000..f00d14e
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 2
++name: develop
++attempt: 2
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-10T05:03:13.356Z
++session: 01a1c3d6-c197-741d-ad4d-936420c72cda
++endedAt: 2026-11-10T05:15:50.847Z
++usage:
++  inputTokens: 29707
++  outputTokens: 7432
++  costUsd: 0.009692000000000001
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T05-03-13-815Z_01a1c3d6-c197-741d-ad4d-936420c72cda.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/output.yaml
+new file mode 100644
+index 0000000..d661d19
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2/output.yaml
+@@ -0,0 +1,47 @@
++status: ok
++summary: "Docs-only salvage verified complete: all four wave-1 spike docs are
++  committed at the required repo-relative paths and match the source branch,
++  with the sole intentional divergence being the `oMP` -> `omp` typo fix in
++  omp-6-repo-rules.md. RECOVERY.md is committed at
++  items/spike-findings-recovery-v2/RECOVERY.md (permitted fallback) with a
++  header naming the source
++  `.factory/.../items/spike-findings-recovery/RECOVERY.md` path, provenance
++  table, and per-M1-scenario evidence + FollowUps mapping. The reported gate
++  failure was environmental, not diff-caused: plugins/software-factory had no
++  node_modules (`Cannot find package 'yaml'`, missing `@types/bun`). Running
++  `bun install --frozen-lockfile` restored deps; `bun run typecheck` now exits 0
++  and previously-erroring test files pass 28/28. No target is recorded per the
++  assignment's mergeability constraint."
++evidence:
++  - "`git cat-file -e topic/omp-workspaces--spike-findings-recovery:<path>`
++    confirmed all four spike docs exist on the source branch; `git ls-tree -r
++    --name-only HEAD` confirmed all four are committed at identical
++    repo-relative paths on this item branch."
++target:
++  command: cd plugins/software-factory && test -s docs/spikes/omp-3-isolation.md
++    && test -s docs/spikes/omp-4-mock-provider.md && test -s
++    docs/spikes/omp-5-cache-keys.md && test -s docs/spikes/omp-6-repo-rules.md
++    && test -s ../../items/spike-findings-recovery-v2/RECOVERY.md && ! grep -q
++    'oMP' docs/spikes/omp-6-repo-rules.md
++  customTarget: true
++concerns:
++  - kind: risk
++    summary: "Gate environment lacks dependency install: child/item worktrees
++      without infra.setup fail typecheck and tests with `Cannot find package
++      'yaml'` / missing `@types/bun`."
++    detail: Before `bun install --frozen-lockfile` in plugins/software-factory, `bun
++      run typecheck` failed with TS2688 (no @types/bun) and test files failed to
++      resolve `yaml`; after install, typecheck exits 0 and previously failing
++      test files pass. This is the same environmental merge failure that sank
++      the wave-2 recovery, so the gate runner must run dependency setup before
++      typecheck/test or docs-only items will keep failing gates.
++    severity: medium
++    location:
++      file: plugins/software-factory/package.json
++notes: No production lines changed. The worktree was already clean with the five
++  recovered files committed from the prior attempt; this pass re-verified
++  content/provenance and fixed the gate blocker by installing the declared
++  dependencies (node_modules is gitignored, so the diff remains docs-only). Full
++  suite was not used as a gate per the assignment's explicit instruction that
++  full-suite exit 0 is unmergeable on the red baseline; a targeted pair of
++  previously-erroring test files was run instead with 28 pass / 0 fail.
+diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
+index cd66aa7..765967f 100644
+--- a/.factory/tasks/omp-workspaces/journal.ndjson
++++ b/.factory/tasks/omp-workspaces/journal.ndjson
+@@ -313,24 +313,3 @@
+ {"type":"step_started","task":"omp-workspaces","step":"pm-amend-1-2","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/021-pm-amend-1-2-a1","ts":"2026-11-10T04:55:54.450Z"}
+ {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-amend-1-2","timeoutSec":2700,"ts":"2026-11-10T04:55:54.454Z"}
+ {"type":"step_finished","task":"omp-workspaces","step":"pm-amend-1-2","attempt":1,"status":"ok","sessionId":"01a1c3d0-0e77-74a9-9aab-f205f994e96e","usage":{"inputTokens":25430,"outputTokens":6753,"costUsd":0.003894},"ts":"2026-11-10T04:56:47.068Z"}
+-{"type":"wave_started","wave":3,"iteration":1,"ts":"2026-11-10T04:56:48.258Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1","ts":"2026-11-10T04:56:49.018Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","timeoutSec":5400,"ts":"2026-11-10T04:56:49.023Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--target-green-ratchet-fix/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1","ts":"2026-11-10T04:56:49.096Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T04:56:49.101Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1c3d0-e401-743d-b536-d4d8f32194a2","usage":{"inputTokens":27325,"outputTokens":6379,"costUsd":0.008592},"ts":"2026-11-10T04:58:09.710Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"sizeBytes":6083134,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-426Z_01a1c3d0-e412-7153-ae52-2c9a5e4697a4","ts":"2026-11-10T05:03:10.263Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"toolCalls":74,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-426Z_01a1c3d0-e412-7153-ae52-2c9a5e4697a4","ts":"2026-11-10T05:03:10.264Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c3d0-e412-7153-ae52-2c9a5e4697a4","usage":{"inputTokens":103048,"outputTokens":36483,"costUsd":0.045768},"ts":"2026-11-10T05:03:11.489Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--target-green-ratchet-fix/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1","ts":"2026-11-10T05:03:13.398Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T05:03:13.403Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2","ts":"2026-11-10T05:03:13.430Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","timeoutSec":5400,"ts":"2026-11-10T05:03:13.436Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:05:28.993Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:05:31.358Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"method":"ask","ts":"2026-11-10T05:06:52.363Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"toolCalls":64,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T05-03-13-799Z_01a1c3d6-c187-7606-bb74-97b9346f5448.jsonl","ts":"2026-11-10T05:12:38.648Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:12:40.968Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:12:43.278Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"status":"ok","sessionId":"01a1c3d6-c197-741d-ad4d-936420c72cda","usage":{"inputTokens":29707,"outputTokens":7432,"costUsd":0.009692000000000001},"ts":"2026-11-10T05:15:50.897Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T05:18:00.357Z"}
+diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
+index 45f9bfe..ceed14a 100644
+--- a/.factory/tasks/omp-workspaces/state.yaml
++++ b/.factory/tasks/omp-workspaces/state.yaml
+@@ -1,8 +1,8 @@
+ task: omp-workspaces
+ kind: saga
+-status: active
++status: failed
+ iteration: 1
+-currentWave: 3
++currentWave: 2
+ items:
+   spike-cache-key:
+     kind: fact-finder
+@@ -71,26 +71,10 @@ items:
+     spendUsd: 0.181734
+     currentStep: review
+     mergedAt: 2026-11-09T23:09:02-05:00
+-  spike-findings-recovery-v2:
+-    kind: no-behavior
+-    status: running
+-    branch: topic/omp-workspaces--spike-findings-recovery-v2
+-    attempts: 2
+-    fixRounds: 1
+-    spendUsd: 0.018284
+-    currentStep: develop
+-  target-green-ratchet-fix:
+-    kind: dev
+-    status: running
+-    branch: topic/omp-workspaces--target-green-ratchet-fix
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.045768
+-    currentStep: develop
+ concerns:
+-  open: 1
++  open: 5
+   dismissed: 3
+-  routed: 38
++  routed: 33
+   resolved: 0
+ debt:
+   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
+@@ -133,10 +117,6 @@ debt:
+     provider needs a wrapper or new option"
+   - "[19.1] spike-omp-isolation polish notes deferred to iteration-2 M3/M4
+     planning"
+-  - "[redrive] Merge redrive ignores retry-with-guidance (no execution path);
+-    guidance-only recovery cannot fix environmental gate failures"
+-  - "[wave-merge] target-green gate targets ignore baseline ratchet; gate:test
+-    unmergeable on red baseline"
+   - "[spike-cache-key] Findings cite nonexistent
+     plugins/software-factory/docs/factory.v2.md"
+   - "[spike-cache-key] 7.1 misattributes tokensAfter/method to NDJSON result"
+@@ -169,20 +149,20 @@ debt:
+     hardcoded fallback"
+   - "[usage-cache-tokens] Duplicate 6-term has-usage guard in step-runner and
+     shutdown"
+-budgetSpentUsd: 1.8652213999999998
++budgetSpentUsd: 1.7882303999999996
+ spendByRole:
+   workhorse:
+-    costUsd: 1.3227084000000002
+-    inputTokens: 2887985
+-    outputTokens: 1020277
++    costUsd: 1.2586564000000002
++    inputTokens: 2727905
++    outputTokens: 969983
+   alt-workhorse:
+-    costUsd: 0.324934
+-    inputTokens: 1440770
+-    outputTokens: 565397
++    costUsd: 0.319499
++    inputTokens: 1403899
++    outputTokens: 556970
+   architect:
+-    costUsd: 0.211215
+-    inputTokens: 1474717
+-    outputTokens: 97207
++    costUsd: 0.203711
++    inputTokens: 1419917
++    outputTokens: 94122
+   alt-architect:
+     costUsd: 0.006364
+     inputTokens: 28896
+@@ -192,22 +172,6 @@ spendByItem:
+     costUsd: 0.45245700000000005
+     inputTokens: 1135682
+     outputTokens: 348841
+-  usage-cache-tokens:
+-    costUsd: 0.181734
+-    inputTokens: 509493
+-    outputTokens: 194135
+-  spike-findings-recovery-v2:
+-    costUsd: 0.018284
+-    inputTokens: 57032
+-    outputTokens: 13811
+-  transport-byte-stability:
+-    costUsd: 0.083151
+-    inputTokens: 192618
+-    outputTokens: 106892
+-  merge-setup-fix:
+-    costUsd: 0.16351299999999996
+-    inputTokens: 608055
+-    outputTokens: 146795
+   spike-mock-provider:
+     costUsd: 0.12459699999999999
+     inputTokens: 255359
+@@ -216,20 +180,28 @@ spendByItem:
+     costUsd: 0.11246700000000001
+     inputTokens: 225196
+     outputTokens: 108718
+-  target-green-ratchet-fix:
+-    costUsd: 0.045768
+-    inputTokens: 103048
+-    outputTokens: 36483
++  usage-cache-tokens:
++    costUsd: 0.181734
++    inputTokens: 509493
++    outputTokens: 194135
+   spike-findings-recovery:
+     costUsd: 0.174178
+     inputTokens: 546734
+     outputTokens: 203800
++  transport-byte-stability:
++    costUsd: 0.083151
++    inputTokens: 192618
++    outputTokens: 106892
++  merge-setup-fix:
++    costUsd: 0.16351299999999996
++    inputTokens: 608055
++    outputTokens: 146795
+   spike-cache-key:
+     costUsd: 0.155598
+     inputTokens: 331901
+     outputTokens: 152018
+   (orchestration):
+-    costUsd: 0.3534744000000001
+-    inputTokens: 1867250
+-    outputTokens: 218749
+-lastUpdated: 2026-11-10T05:15:51.672Z
++    costUsd: 0.3405354000000001
++    inputTokens: 1775579
++    outputTokens: 207237
++lastUpdated: 2026-11-10T04:46:31.494Z
+diff --git a/items/spike-findings-recovery-v2/RECOVERY.md b/items/spike-findings-recovery-v2/RECOVERY.md
+new file mode 100644
+index 0000000..07601c2
+--- /dev/null
++++ b/items/spike-findings-recovery-v2/RECOVERY.md
+@@ -0,0 +1,92 @@
++# Wave-1 spike findings recovery
++
++Status: recovered. Docs-only salvage of approved wave-1 research onto the parent branch.
++
++> **Placement note:** recovered from `.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md` on branch `topic/omp-workspaces--spike-findings-recovery` via read-only `git show`. This item worktree must not write engine-owned `.factory/**` paths, so the deliverable lives at `items/spike-findings-recovery-v2/RECOVERY.md`; content is otherwise unchanged.
++
++## Why this exists
++
++All four wave-1 spike items completed research (`status: ok`) and review (`status: approved`), but their wave-end merges failed environmentally: the merge-path gates ran without `infra.setup` in the child worktree, so the missing `node_modules` failed typecheck. No research finding was rejected. This item re-materializes the approved drafts as product docs and records the evidence mapping needed by iteration-2 planning. No production code changed; the source item branches were read via `git show` only (no checkout/switch).
++
++## Source provenance (read-only)
++
++| M1 scenario | Source branch | Research record | Review record | Review outcome |
++|---|---|---|---|---|
++| 1. Isolation probe matrix | `topic/omp-workspaces--spike-omp-isolation` (`cd07f2d`) | `items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml` (`ok`) | `steps/003-review-r1-a1/output.yaml` | `approved`; probe-26/18 interpretation softened |
++| 2. Mock-provider seam | `topic/omp-workspaces--spike-mock-provider` (`85c4b46`) | `items/spike-mock-provider/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; e2e split justified |
++| 3. Cache keying | `topic/omp-workspaces--spike-cache-key` (`c28f43b`) | `items/spike-cache-key/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; spec-path/provenance fixes applied |
++| 4. Repo-rules injection | `topic/omp-workspaces--spike-repo-rules` (`9755c7e`) | `items/spike-repo-rules/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; cwd-scope invariant documented |
++
++Parent-branch decisions consumed:
++
++- `decisions/001-item-spike-repo-rules-1.yaml` — `accept-with-debt`; rulings: M4 replaces the preflight no-op with a real mock-provider turn; M8 builds the scripted mock helper with per-role request-body assertions; M8 keeps omp as sole root injector, implements RULES/extra for scouts, and asserts one sentinel per role; M8 chooses the prompt-isolation policy (profile/agent-dir and/or `disabledExtensions` + empty `--append-system-prompt=`).
++- `decisions/002-item-spike-omp-isolation-1.yaml` — `accept-with-debt`; rulings: M4 replaces `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; M3 implements the ratified root mapping (`omp worktree add -b <topic-branch> <path> <base> -C <repo>` then `omp --cwd <path> -p`) with `isolation: engine` as the fallback and unchanged engine merge ownership.
++
++## Recovered docs
++
++| Doc | M1 scenario | Evidence preserved |
++|---|---|---|
++| `plugins/software-factory/docs/spikes/omp-3-isolation.md` | 1 | 27-probe command log + excerpts, backend enum, retention matrix, root mapping, `task.isolation` vs engine merge, preflight recipe, draft config surface, recommendations |
++| `plugins/software-factory/docs/spikes/omp-4-mock-provider.md` | 2 | 17-probe log, extension/SSE seam, scenario `{turns}` contract, NDJSON/usage contract, `OmpHarness` wrapper, decision YAML + followUps, sources |
++| `plugins/software-factory/docs/spikes/omp-5-cache-keys.md` | 3 | Transport byte/argv audit, live resume probe log (DeepSeek/Anthropic), TTL/model/content invalidation, cold-resume signals, knob audit, compaction/warming analysis, recommendations, appendix |
++| `plugins/software-factory/docs/spikes/omp-6-repo-rules.md` | 4 | Source inventory, precedence/composition, flag matrix, probe matrix, per-role seams, M8 verification plan, recommendations |
++
++## M1 scenario → evidence mapping
++
++### 1. Isolation probe matrix (M1 scenario-1)
++
++Evidence: `isolation.backend` has exactly 9 accepted values (`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy`); every value degrades to plain checkout with a FICLONE warning on ext4/WSL2. Retention: `worktree add` + `--cwd` keeps commits/partials/registration on success, failure, and SIGKILL; isolated subagents retain a patch or `omp/task/<Agent>` branch on success **and** failure; parent abort loses all. `worktree.onStart` is a no-op for `-p`. omp `apply:true` produces a single-parent commit with no gates/conflict agent, so engine `merge-path.ts` remains merge owner and subagents use `apply:false`. Preflight must include one real turn (probes 17/18/27: bogus keys, invalid backend overlays, and missing overlays are all accepted by static checks).
++
++FollowUps:
++- **M3**: implement `workspaces.isolation: omp|engine`, the omp backend/worktree/`task.isolation` config surface, `omp worktree add` + `--cwd` root mapping, and keep topic branch naming + engine merge ownership.
++- **M4**: replace `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; derive status/gc from `git worktree list` + records; classify turn outcome from the `--mode json` transcript, not process rc.
++- **M6**: add cross-launch merge/lock coordination for parallel-epic launches.
++
++### 2. Mock-provider seam (M1 scenario-2)
++
++Evidence: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', {...openai-completions...})` against a local SSE server; `omp models -e ... --json` lists `mock/mock-chat`. Proven end-to-end on real omp 18.18.5 with zero paid calls: text turn, yield envelope, read→yield tool loop, parallel tool calls, session resume, `@role` resolution, parallel processes, and `OmpHarness.run`/`complete` through a wrapper. Scenario format is `{turns: [{text}|{toolCalls}|{yield}]}` with optional `usage`/`finishReason` and top-level `match`/`onExhausted`; error turns are not probed.
++
++FollowUps:
++- **M8**: add `extraArgs`/`mockProvider` to `OmpHarness`; implement `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`, gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate, assert only `mock/mock-chat` requests and `usage.costUsd === 0`.
++- **M4**: use the seam for the preflight real-turn validation.
++
++### 3. Cache keying (M1 scenario-3)
++
++Evidence: omp 18.18.5 keys the prompt cache by request-prefix **content**, not by file path. Identical bytes at a changed system-prompt path still fully hit; a model switch is a full cold read (measured ≈8.9× warm). TTL expiry (Anthropic 5m) causes a cold read; long retention was verified separately. Compaction rewrites history and makes the next resume cold from the cut point. The factory currently detects none of these signals and pins none of the cache/compaction/memory knobs; the manual `-p "/compact"` path exists but its cost is absent from NDJSON.
++
++FollowUps:
++- **M7**: extend usage accounting with `cacheReadTokens`/`cacheWriteTokens`/`totalTokens`/`cacheTtl`/provider/model/reasoning fields; add a per-session cache-state record; record the resolved model used by the successful turn and pass that literal model on resume; pin `providers.cache*`, `compaction.*`, `snapcompact.*`, and `mnemopi.autoRecall/autoRetain` in the overlay; measure long-vs-short retention and fresh-brief-vs-warm-compaction on the self-host fire test; add a mock-provider cache fixture.
++- **M4**: validate effective overlay values (not `--version`) and read back performance-relevant settings in preflight.
++
++### 4. Repo-rules injection (M1 scenario-4)
++
++Evidence: root omp sessions discover and inject repo context/rules into a trailing `<repo-rules>` footer; `--system-prompt` replaces block 0 only. The current factory has no double injection because role prompts contain no repo-rule text. Copying rules into role prompts or append prompts double-injects (2 sentinel copies). omp `task` subagents drop `AGENTS.md` but keep `RULES.md` and `contextFiles.extra`. User-level `APPEND_SYSTEM.md`, `AGENTS.md`, and `RULES.md` leak into roles unless isolated or suppressed; only an explicit empty `--append-system-prompt=` suppresses the append file. Resume re-discovers repo rules each process, while the static block-0 prefix stays stable.
++
++FollowUps:
++- **M4**: replace the preflight `--config --version` no-op using the mock-provider real-turn recipe.
++- **M8**: keep omp as sole injector for root roles; implement `RULES.md`/`contextFiles.extra` (or delegation context) for scouts; add sentinel-based per-role request-body tests; choose and enforce the user-level contamination policy; keep factory launches at worktree roots because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
++
++## Iteration-2 follow-up index
++
++| Milestone | Follow-up | Source |
++|---|---|---|
++| M3 | omp workspace backend + `isolation: engine` fallback + config surface + unchanged branch/merge ownership | `omp-3-isolation.md` §7/§9/§10; decision 002 |
++| M4 | preflight version/key/enum/catalog checks + one real isolated round trip; status/gc from git records; transcript-based outcome | `omp-3-isolation.md` §5/§10, `omp-5-cache-keys.md` §9.5, `omp-6-repo-rules.md` §6; decisions 001/002 |
++| M6 | cross-launch merge/lock coordination for parallel epics; per-epic workspace isolation | `omp-3-isolation.md` §10 |
++| M7 | cache/compaction usage plumbing, session cache-state, literal model on resume, overlay pins, retention measurement, mock cache fixture | `omp-5-cache-keys.md` §9/§10/§11 |
++| M8 | scripted mock-provider helper + `extraArgs`; repo-rules hydration/sentinel tests; user-level isolation policy; no-model e2e and use-case docs | `omp-4-mock-provider.md` §M8/decision, `omp-6-repo-rules.md` §6/§7 |
++
++## Review polish ledger
++
++Applied only where the note corrected evidence (no new probes invented):
++
++- **Isolation** — probe 26 corrected: in-base explicit-path worktrees are listed by `worktree list --json` when `OMP_WORKTREE_DIR` is aligned; outside-base trees are invisible; live trees are never reported as orphans. Probe 18 softened: invalid backend overlay is accepted, but `config get` ignores `--config` overlays, so runtime coercion is unproven. Retention matrix scoped to single-host omp 18.18.5/ext4/WSL2.
++- **Cache** — spec source fixed to `docs/factory.v2.md:114-120`; `tokensAfter`/`method` attributed to the transcript `compaction` entry rather than the NDJSON result; long/none retention probes qualified as YAML-only artifacts; dead `steps/architect-resume` fragment noted while keeping the byte-diff evidence valid.
++- **Repo rules** — worktree-root cwd invariant documented because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
++- **Mock provider** — the `test/e2e/` split is retained and justified: it separates the no-model scripted suite from paid live coverage and matches the M8 plan's directional interface. The optional raw-NDJSON-excerpt and unprobed-error-turn notes remain disclosed limitations, not re-probed here.
++
++## Verification
++
++- All five recovery outputs exist and each spike doc contains a findings section plus probe evidence/log and recommendations/M8 sections (see the recovered-docs table).
++- Source records were read with `git show <branch>:<path>`; no branch was checked out.
++- No production code changed. No engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`, `decisions/`) was modified; the only orchestration-folder write is this item's assigned deliverable `items/spike-findings-recovery/RECOVERY.md`.
+diff --git a/plugins/software-factory/docs/spikes/omp-3-isolation.md b/plugins/software-factory/docs/spikes/omp-3-isolation.md
+new file mode 100644
+index 0000000..fcc0b75
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-3-isolation.md
+@@ -0,0 +1,123 @@
++# Spike omp-3: omp isolation mechanics + backend decision
++
++- omp 18.18.5 (`omp/18.18.5`), WSL2 Linux, ext4 (no FICLONE)
++- Throwaway `--profile spk-*`; mktemp repos per run
++- Prior: omp-1-topology.md:189-215, omp-2-cli-adapter.md
++
++## 1. isolation.backend values
++
++`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy` (default auto). `config set <enum> __invalid__` prints `Valid values: ...` and exits nonzero. Trial overlays set each value then ran `omp worktree add`: all rc=0, all fell back to plain checkout with FICLONE warning on ext4. Backend = clone mechanism only; verify with a round-trip.
++
++## 2. Retention matrix
++
++| Mechanism | Success | Fail | Abort (SIGKILL) |
++|---|---|---|---|
++| worktree add + --cwd | commit on topic branch; parent clean | staged partial retained | untracked partial + branch + registration retained |
++| isolated patch apply=false | .patch retained, parent clean | .patch preserved | — |
++| isolated branch apply=false | omp/task/<Agent> + commit | branch preserved with partial commit | total loss |
++| isolated branch apply=true | single-parent commit, branch deleted | failures preserve | — |
++
++Single-host scope: these retention results are from omp 18.18.5 on ext4/WSL2; treat abort/SIGKILL retention as host-specific until re-probed elsewhere.
++
++`commits=generic` → `<AgentId>`; `commits=ai` → `chore: add ...`. No `omp isolated-task` CLI; failing turns exit rc=0.
++
++## 3. Root-process mapping
++
++`worktree.onStart/onExit/cleanSource` and `/wt` are interactive-only. Factory root process: `omp worktree add -b <topic/*> <path> <base> -C <repo>` (OMP_WORKTREE_DIR) then `omp --cwd <path> -p`. `omp worktree list --json` lists in-base explicit-path worktrees when `OMP_WORKTREE_DIR` is aligned (kind `pr-checkout`); outside-base trees are invisible. `omp worktree clear --dry-run` correctly reports no orphans for live trees; `--all --dry-run` lists them. Status/gc use `git worktree list` + records.
++
++## 4. task.isolation vs engine merge
++
++omp apply/merge/commits are per-subagent capture preferences ending in a retained artifact or a single-parent auto-commit (no gates). Engine merge-path.ts adds merge locks, parent-into-child trial, integrate agent, gates/target-green, --no-ff merge, worktree removal with branch kept, hooks, journaling. Keep engine merges.
++
++## 5. Preflight
++
++Free: version ≥18.18.5; unknown-key oracle config get rc=1; enum oracle config set invalid; models find + modelRoles; repo state. Real turn: mktemp repo, one -p turn spawning isolated marker subagent apply:false, assert patch/branch artifact, cleanup. ~16s cheapest.
++
++## 6. Overlay gaps (c-477404c672)
++
++Bogus key → BADKEY_OK rc=0; invalid backend overlay is accepted, but `config get` ignores `--config` overlays so runtime coercion is unproven (probe 18 softened); missing overlay → --version succeeds. Current preflight.ts:364-394 validates nothing about content; replace with schema check + real turn.
++
++## 7. Decision
++
++isolation: omp by default (engine fallback kept): omp creates/clones worktrees and optionally captures subagent work; engine owns branches, merges, gates, commits, gc, records.
++
++## 8. Probe-command log
++
++Throwaway `--profile spk-*`, `mktemp`-isolated repos; paid turns on cheapest catalog model `alibaba-token-plan/deepseek-v4-flash-0731` (~10 turns).
++
++| # | Probe | Command (abridged) | Result |
++|---|-------|-------------------|--------|
++| 1 | version/help | `omp --version; omp --help` | `omp/18.18.5`; no `task`/`isolated-task` command |
++| 2 | schema | `omp config list --json` filtered | 9-value backend; task.isolation keys present |
++| 3 | fresh defaults | `config get <key>` ×10 | backend auto, enabled false, apply true, merge patch, commits generic, onStart off, onExit keep, clone true, base unset |
++| 4 | enum oracle | `config set <key> __invalid__` | backend 9 values; merge `patch,branch`; commits `generic,ai` |
++| 5 | backend trial ×9 | `config set isolation.backend $b` + `worktree add -b t-$b $BASE/wt-$b HEAD -C $R` | all rc=0, all FICLONE fallback to plain checkout, 9 branches/worktrees |
++| 6 | --cwd success | turn creates+commits `TURN_OK.txt` | `DONE`; wt log `1d958ca spike: turn ok`; parent untouched |
++| 7 | --cwd failure | stage `FAIL_PARTIAL.txt`, then eval-throw | process rc=**0** despite in-turn error; `A FAIL_PARTIAL.txt` retained; parent untouched |
++| 8 | --cwd SIGKILL | SIGKILL after `KILL_PARTIAL.txt` appears | `?? KILL_PARTIAL.txt` retained; branch+worktree registration intact |
++| 9 | isolated success patch | eval `agent(...,{isolated:true,apply:false})` | `Captured at .../omp-eval-agent-<id>/UpsetMongoose.patch (apply=false). Not applied.` |
++| 10 | isolated success branch | same, `merge=branch` | `omp/task/ParentalPelican` = `e10e903 ParentalPelican`; parent clean |
++| 11 | isolated failure branch | subagent stages file then throws `SUB_FAIL` | wait rejects BUT `Captured branch preserved as omp/task/PoliteOrangutan` with `ISO_FAIL.txt` |
++| 12 | isolated failure patch | creates file then throws `SUB_FAIL2` | `Captured patch preserved at .../RevolutionaryCentipede.patch` |
++| 13 | isolated success apply | `apply:true` | parent main gains single-parent `68e5586 DecentAnaconda`; branch deleted |
++| 14 | parent abort | SIGKILL parent during isolated `sleep 120` | no branch, file, or worktree entry; output lost |
++| 15 | commits=ai | branch capture with `commits=ai` | `chore: add iso_ai_msg.txt file` vs generic `<AgentId>` |
++| 16 | overlay accepted | `--config overlay.yml` + real turn | `OVERLAY_OK` rc=0 |
++| 17 | bogus overlay key | `task.isolation.noSuchKey: true` + real turn | silently ignored: `BADKEY_OK` rc=0 |
++| 18 | invalid backend overlay | `isolation.backend: __invalid__` | accepted by `--version`; **coercion unproven** — `config get` ignores `--config` overlays |
++| 19 | role resolution + | `--model @probe-role` + real turn | `ROLE_OK` rc=0 |
++| 20 | role resolution − | `--model @no-such-role-xyz` | `Model ... not found`, rc=1, no spend |
++| 21 | bogus model | `--model bogus-provider-xyz/...` | `Model ... not found`, rc=1, no spend |
++| 22 | catalog lookup | `models find deepseek-v4-pro --json` | free selector/provider/thinking metadata |
++| 23 | cheapest preflight | one `-p` turn spawning isolated marker subagent, `apply:false` | `PF_RESULT:...DustyBeetle.patch`, **15.6s**; bare no-op turn 5.2s |
++| 24 | onStart scope | `worktree.onStart=create` + `-p` turn | no worktree; stayed in `$R`, only main |
++| 25 | add w/o path | `omp worktree add -C $R` | `Error: Missing required argument: path` |
++| 26 | gc listing | `worktree list --json`, `clear --dry-run` | in-base explicit paths listed when `OMP_WORKTREE_DIR` aligned; outside-base invisible; live trees never reported as orphans |
++| 27 | bad key/missing overlay | `config get no.such.key`; `--config /tmp/missing --version` | unknown key rc=1; missing overlay silently ignored (18.18.5, rc=0) |
++
++Probe excerpts:
++
++```text
++$ omp --profile $P config set isolation.backend __invalid__
++Error: Invalid value: __invalid__. Valid values: auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy
++
++$ omp worktree add -b t-auto $BASE/wt-auto HEAD -C $R
++Preparing worktree (new branch 't-auto')
++HEAD is now at eb6c019 init
++warning: worktree clone fell back to plain checkout: git worktree add: FICLONE unsupported ... (os error 95)
++
++Isolation: changes captured on branch `omp/task/ParentalPelican` (apply=false). Not merged.
++Error: SUB_FAIL ... Captured branch preserved as omp/task/PoliteOrangutan.
++"Merged branch: omp/task/DecentAnaconda"   # parent 68e5586, single parent b9e032f
++```
++
++## 9. Draft isolation config surface
++
++```yaml
++workspaces:
++  isolation: omp              # omp | engine (default omp)
++  omp:
++    backend: auto             # isolation.backend enum (9 values)
++    worktreeClone: true       # worktree.clone (clone-first, fallback ok)
++    cleanSource: false        # worktree.cleanSource (interactive /wt only)
++    onStart: off              # informational: no effect on -p turns
++    onExit: keep              # informational: no effect on engine worktrees
++    baseDir: null             # worktree.base / OMP_WORKTREE_DIR; null = ~/.omp/wt
++    worktreeScope: repo       # session.worktreeScope
++    taskIsolation:
++      enabled: true           # gate for isolated:true subagents
++      apply: false            # engine merges; never auto-apply
++      merge: branch           # branch (auditable) | patch (lightweight)
++      commits: generic        # generic (agent-id stub); ai = harness-invented
++```
++
++Overlay additions (extends `overlay.ts:51-85`): `isolation: { backend: <workspaces.omp.backend> }` and `task: { isolation: { enabled, apply, merge, commits } }`. The overlay cannot express `worktree.*` path/base per run; pass `-C`/`--cwd`/`OMP_WORKTREE_DIR` instead.
++
++## 10. Recommendations / follow-ups
++
++- Implement `workspaces.isolation: omp|engine` plus the omp backend/worktree/task.isolation config surface above.
++- Replace the preflight `omp --config --version` check (`preflight.ts:364-394`) with key/enum/catalog validation and one real isolated round-trip turn (probe 23).
++- Classify turn outcome from the `--mode json` transcript, not process rc (probe 7).
++- Derive gc/status from `git worktree list` + records; document the omp `worktree list` blind spot for outside-base trees (probe 26).
++- Add cross-launch merge/lock coordination for the parallel-epic saga.
++- Add a scripted mock model provider for no-models e2e tests (see `omp-4-mock-provider.md`).
+diff --git a/plugins/software-factory/docs/spikes/omp-4-mock-provider.md b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
+new file mode 100644
+index 0000000..9cfe4d0
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
+@@ -0,0 +1,133 @@
++# Spike: scripted mock provider seam for real omp (M1)
++
++Status: ok. Environment: omp/18.18.5 (`omp/18.18.5`), Bun 1.4.4, Linux x64 WSL2. Throwaway profiles and temp dirs; zero paid-model calls.
++
++## Verdict
++
++Chosen seam: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', { api: 'openai-completions', baseUrl: 'http://127.0.0.1:<ephemeral>/v1', apiKey: 'mock-key', models: [{ id: 'mock-chat', name: 'Mock Chat', api: 'openai-completions', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] })`, backed by a local OpenAI-compatible SSE server.
++
++Scenario format: `{turns: [...]}`; each turn is one assistant/model response (one HTTP POST):
++- `{text: '...'}` text, finish stop, ends the agent turn.
++- `{toolCalls: [{name, arguments}, ...]}` executes tools; next POST consumes next turn.
++- `{yield: {data: ...}}` emits terminal `yield`; observed no further provider request.
++Optional per-turn `usage`, `finishReason`; optional top-level `match`, `onExhausted`.
++
++Proven: catalog listing (`omp models -e ... --json` -> `mock/mock-chat`); real text turn; yield envelope; read->yield tool loop; two parallel tool calls; session resume; @role resolution via `--config` modelRoles; parallel processes; OmpHarness.run and complete.
++
++Ruled out: `--config` is a settings overlay, not a provider registry. `providers:` in `--config` was ignored; `omp models --config cfgprov.yml` did not list it. `models.yml` in a temp agent dir works (second choice).
++
++## Probe log
++
++P1 `omp --version` -> `omp/18.18.5`; help has `-e`, `--config`, `--profile`, `--mode json`, `--no-session`, `--tools`.
++P2 extension API: `typeof pi.registerProvider === 'function'`; `pi.pi` exposes `createAgentSession`, `runSubprocess`, `AgentSession`, `SessionManager`.
++P3 `omp --profile ... models -e mock-provider.ts --json` -> selector `mock/mock-chat`, kind chat, cost 0.
++P4 root-level `omp -e ... models` did not load the extension; place `-e` after `models`. Root-level `-e` works for `-p` sessions.
++P5 text turn: exit 0; text `MOCK_OK`; usage `input:123, output:6, totalTokens:129, cost.total:0`; `agent_end` `isTerminal:true, yielded:true`.
++P6 yield turn: exit 0; one POST; `tool_execution_start` args `{data:{status:'OK',count:42}}`; `tool_execution_end` result `details.data` identical; `turn_end` `stopReason:'toolUse'`; `agent_end`.
++P7 read then yield: 2 POSTs; second request includes `role:'tool'` result.
++P8 two reads in one response: 2 tool results then yield.
++P9 resume: first process text `TURN1_TEXT`; second `--resume <id>` sends `system,user,assistant,user`, prior text present; yield `{resumed:true}`.
++P10 parallel: two profiles/servers; both exit 0; one POST each.
++P11 role overlay `modelRoles: {probe: mock/mock-chat}` + `--model @probe` -> wire model `mock-chat`, exit 0.
++P12 SSE usage `prompt_tokens:100, cached_tokens:40, completion_tokens:5` -> usage `input:60, output:5, cacheRead:40, totalTokens:105`; cost computed from model rates.
++P13 OmpHarness.run with wrapper `exec omp -e ext "$@"` -> `ok:true`, data `{status:'OK',via:'OmpHarness'}`, usage 111/9, costUsd 0, toolCallCount 1.
++P14 OmpHarness.complete -> `{status:'OK',answer:42}`.
++P15 models.yml via `PI_CODING_AGENT_DIR=<tmp>` -> `fileprov/file-model`; named profile works when file is at `omp config path`; absolute `PI_CONFIG_DIR=/tmp/...` was resolved under `$HOME/tmp` in 18.18.5, so verify.
++P16 `--config` providers block ignored.
++P17 preflight no-op: `omp --config /tmp/no-such-overlay.yml --version` prints version and exits 0; real `omp --config <missing> -p ...` exits 1 `Config overlay not found`; `models --config <missing>` exits 1.
++
++## NDJSON contract (omp 18.18.5)
++
++`omp --mode json` emits one JSON object per line. Text turn sequence: `session`, `agent_start`, `turn_start`, user `message_start`/`message_end`, assistant `message_start` (usage zeros), `message_update` (`text_start`/`text_delta`/`text_end`), assistant `message_end` (real usage), `turn_end` (message + toolResults), `agent_end` (`messages`, `isTerminal:true`, `yielded:true`). Tool turn adds `tool_execution_start`/`tool_execution_end`, a `toolResult` message, and if non-terminal, another provider POST.
++
++Usage fields: `turn_end.message.usage` has `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.{input,output,cacheRead,cacheWrite,total}`. `message_start.usage` is zeroed. `cacheRead` comes from `prompt_tokens_details.cached_tokens`; `input` = `prompt_tokens - cached_tokens`; cost from model cost rates. `agent_end.yielded` is true even for text-only turns, so not a yield signal.
++
++Yield envelope: yield data appears in `turn_end.message.content[].toolCall.arguments.data`, `agent_end.messages[].content[].toolCall.arguments.data`, `tool_execution_start.args.data`, and `tool_execution_end.result.details.data` (parser `ndjson.ts:73-142`). Yield is terminal: one POST, no follow-up. Parser references: `src/harness/omp/ndjson.ts:52-150`.
++
++## Scenario format
++
++```jsonc
++{
++  'name': 'developer-writes-and-yields',
++  'match': { 'model': 'mock-chat', 'systemContains': 'Developer', 'promptContains': 'implement' },
++  'onExhausted': 'error',
++  'turns': [
++    { 'toolCalls': [{ 'name': 'write', 'arguments': { 'path': 'src/hello.ts', 'content': 'export const hello = 1;\n' } }], 'usage': { 'input': 1200, 'output': 40, 'cacheRead': 800 } },
++    { 'yield': { 'data': { 'status': 'done', 'summary': 'added hello' } }, 'usage': { 'input': 1500, 'output': 20, 'cacheRead': 1400 } }
++  ]
++}
++```
++
++Types: `UsageSpec` {input?,output?,cacheRead?,cacheWrite?,cost?}; `ToolCallSpec` {name,arguments,id?}; `Turn` = text | toolCalls | yield | error {status?,message}; `Scenario` {name?,match?,onExhausted?,turns}. Semantics: sequential per server; one POST per turn; toolCalls continue; yield terminates; text ends; `onExhausted` default error or repeatLast; `match` assertions fail with 500; resume cursor keyed by session id/label. Error turns optional, not probed.
++
++## M8 integration
++
++OmpHarness currently hard-codes args without `-e` (`harness.ts:368-388`, `:707-715`). Proven wrapper: `#!/bin/sh; exec /home/slava/.bun/bin/omp -e /tmp/mock-provider.ts "$@"` passed as `ompBinary`; both run and complete succeeded. Recommended: add `extraArgs`/`mockProvider` to OmpHarness. Proposed `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`; gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate. Select scenario by `run.label` (like `FakeHarness.scriptOutcome`). Use per-test ephemeral port/profile or `PI_CODING_AGENT_DIR`, `--no-session`, `--no-extensions -e mock-ext`, explicit `mock/mock-chat`; assert request log only mock-chat and `usage.costUsd === 0`. The `test/e2e/` split keeps the no-model scripted suite separate from the paid `test/harness/smoke-live.test.ts` and matches the M8 plan's directional interface.
++
++## Recommendations
++
++- Adopt the extension `-e` + `pi.registerProvider` + local SSE seam as the canonical no-paid-model provider; keep `models.yml` in a temp agent dir as the fallback.
++- Add `extraArgs`/`mockProvider` to `OmpHarness` and implement the scripted suite under `test/e2e/mock-provider/`.
++- Gate the suite with `FACTORY_E2E_OMP=1`, keep paid live tests under `FACTORY_LIVE_OMP=1`, and assert zero-cost usage and mock-only request logs.
++- Replace the preflight `--config --version` check with a real mock turn and add an omp version floor.
++
++## Decision YAML
++
++```yaml
++status: accepted
++decision: >
++  Adopt the omp extension provider seam: per-process `-e mock-provider.ts` calls
++  `pi.registerProvider('mock', {... openai-completions ...})` against a local scripted SSE server.
++  Scenarios are `{turns: [{text}|{toolCalls}|{yield}]}`; one turn per provider request; toolCalls continue,
++  yield terminates. Use an OmpHarness wrapper now; add `extraArgs`/`mockProvider` in M8. Keep
++  `models.yml` in a temp agent dir as fallback; `--config` is only for settings/modelRoles.
++evidence:
++  - 'omp/18.18.5; omp models -e mock-provider.ts --json lists mock/mock-chat (P3).'
++  - 'Real text turn MOCK_OK, usage 123/6, cost.total 0 (P5).'
++  - 'Yield turn details.data {status:OK,count:42}, stopReason toolUse, agent_end (P6).'
++  - 'Tool loop and two parallel tool calls then yield (P7/P8).'
++  - 'Resume sees prior TURN1_TEXT and yields (P9).'
++  - 'OmpHarness.run and complete pass with mock wrapper, cost 0 (P13/P14).'
++  - 'Parallel profiles/servers both exit 0 (P10).'
++  - 'Preflight --config ... --version exits 0 with missing overlay (P17).'
++followUps:
++  - 'M8: add extraArgs/mockProvider; implement test/e2e/mock-provider.'
++  - 'M8: gate FACTORY_E2E_OMP=1; keep FACTORY_LIVE_OMP=1 separate.'
++  - 'Replace preflight --version overlay check with omp models --config or a real mock turn; add version floor.'
++  - 'Pin/minimum omp version; re-run spike on upgrade.'
++  - 'Persist scenario cursor by session id for resume/restart.'
++alternatives:
++  - 'models.yml custom provider (works; second choice).'
++  - '--config providers block (ignored).'
++  - 'Built-in Ollama/LM Studio (requires local runtime).'
++  - 'FakeHarness/mock binary (not real omp).'
++```
++
++## Risks / concern cross-check
++
++- Preflight overlay validation no-op confirmed (`c-477404c672`): `preflight.ts:383-385` uses `--version`; missing overlay exits 0; real session exits 1. High risk 19.1/19.2.
++- OmpHarness no extra-args seam: wrapper works but add `extraArgs`/`mockProvider`; medium, 19.8.
++- Flag placement: `-e`/`--config` after `models` for catalog; root-level for sessions.
++- `PI_CONFIG_DIR` absolute path resolved under `$HOME` in 18.18.5; use `PI_CODING_AGENT_DIR`/real profile and verify `omp config path`.
++- `agent_end.yielded` true for text-only; use yieldData.
++- `models.yml` works with temp `PI_CODING_AGENT_DIR`; named-profile caveat is path resolution.
++- `c-aaebfb4099` out of scope; parallel mock probing is safe but doesn't address epic lock/merge.
++- `c-ba416d7313` disproved: zero-paid real-omp mock path exists.
++
++## Sources
++
++- `docs/factory.v2.md:104-113`
++- `plugins/software-factory/docs/ARCHITECTURE.md:40`
++- `plugins/software-factory/src/cli/preflight.ts:365-394`
++- `plugins/software-factory/src/harness/omp/harness.ts:368-388`, `:525-570`, `:707-715`
++- `plugins/software-factory/src/harness/omp/ndjson.ts:52-150`
++- `plugins/software-factory/src/harness/omp/overlay.ts:26-86`
++- `plugins/software-factory/src/harness/fake/fake-harness.ts:8-51`
++- `plugins/software-factory/docs/spikes/omp-1-topology.md:55-104`
++- `plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110`
++- `plugins/software-factory/test/harness/smoke-live.test.ts:9-81`
++- https://omp.sh/docs/extensions
++- https://omp.sh/docs/models
++- https://omp.sh/docs/providers
++- https://omp.sh/docs/extension-loading
++- https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
+diff --git a/plugins/software-factory/docs/spikes/omp-5-cache-keys.md b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
+new file mode 100644
+index 0000000..acc48fb
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
+@@ -0,0 +1,308 @@
++# Spike: prompt-cache keying + compaction/warming audit
++
++Status: complete (M1 / `spike-cache-key`)
++Harness: `omp/18.18.5` on Linux x86_64 WSL2; factory checkout `plugins/software-factory`; live probes used throwaway `/tmp` dirs and throwaway session dirs (no production paths edited).
++
++## 0. Verdict (answers the M1 cache-key scenario)
++
++**OMP prompt caching is content-keyed, not path-keyed.**
++
++- A changed system-prompt *path* with byte-identical content still produced a full cache hit: DeepSeek `cacheRead=11,392` (T3 below); Anthropic `cacheRead=6,703` (A-T2 below).
++- A new prompt-file *path* on every turn did not break resumed-turn caching: Anthropic `cacheRead=29,363` on a resume whose prompt file path differed from the previous turn.
++- A one-byte system-prompt content change (appended newline) produced `cacheRead=0` (DeepSeek T3, `input=13,266`).
++- Tools change produced a partial miss (`cacheRead=2,432` of a prior `4,480`); thinking-level change and model switch produced full misses (`cacheRead=0`).
++- A 330-second gap on Anthropic `short` retention produced `cacheRead=0`, `cacheWrite=38,022` (cold).
++- A brand-new session with the same system prompt/tools reused the system-prompt prefix from the provider cache (`cacheRead=4,224`), so a fresh session is not inherently a full cold read.
++
++**Consequence for the factory:** the transport's random prompt filename is safe; the cached prefix is the system-prompt bytes + tool specs + model/thinking identity + conversation history. The real cold-resume triggers are: system-prompt content change, tools change, model/thinking change, cache-retention/TTL change/expiry, and compaction. The current factory does not detect any of these (see §5) and does not pin the knobs (see §6).
++
++## 1. Method
++
++- Transport audit (no model calls): ran `OmpHarness.run()` four times (fresh ×2, resume ×2) with `OMP_PATH` pointed at a throwaway shim that logged argv and copied the `--system-prompt`/`-p @file` inputs. Same rendered `steps/architect-resume` prompt, same `PipelineConfig`, same runtime dir, same synthetic session id. Note: `IMPLEMENTATION.md` flags the `steps/architect-resume` fragment as dead, but the harness mechanism is identical (`harness.ts:286-350,368-389`), so the byte diffs remain valid; re-run against a live fragment for the M2 baseline.
++- Live probes: real `omp -p --mode json` turns against `opencode-go/deepseek-v4.1-flash:max`, `opencode-go/muse-spark-1.3-contributor:max`, and `anthropic/claude-haiku-5-5:max`, using the factory's generated overlay plus the actual architect system prompt (`agents/architect.md` body). Unique `--session-dir`/`--cwd` per probe family under `/tmp`; `--max-cost 0.10` per turn. Aggregate live spend ≈ **$0.05**.
++- All probe dirs are throwaway (`/tmp/spike-cache-key-*`); no repo file was written.
++
++## 2. Transport render audit (byte/argv diff)
++
++Source under audit: `src/harness/omp/harness.ts:286-350` (prompt materialization), `src/harness/omp/harness.ts:368-389` (argv), `src/harness/omp/overlay.ts:26-100` (overlay).
++
++| Run pair | System-prompt bytes | System-prompt path | Prompt bytes | Prompt path | Argv |
++|---|---|---|---|---|---|
++| fresh-1 vs fresh-2 | identical, sha256 `cb92bbcaafd7bfa7b52413cc9a75cd58985c4e22b21b9984a60733a9f177c93a` | identical `.../system-prompts/architect-fresh.md` | identical, sha256 `4a9d87d474be6638f4c5b1bc4655622baa7566e9e91935bc12aa136c6cec6d88` | **different** `prompt-1794267999675-k2y1.txt` vs `prompt-1794267999746-1jly.txt` | identical except `-p @<path>` |
++| resume-1 vs resume-2 | identical | identical `.../system-prompts/architect-spike-session-fixed.md` | identical | **different** | identical except `-p @<path>` |
++| fresh vs resume | identical | **different** (`fresh` vs sanitized session id) | identical | different | resume adds `--resume spike-session-fixed` |
++| overlay generated twice | — | — | — | — | identical YAML, 1,472 bytes, sha256 `6ebf5894b6aaa2123b1cc3030555c3f5e61562751a2e332ef4b5d5b96e739f53` |
++
++Exact fresh argv (captured; resume adds `--resume spike-session-fixed` after `--session-dir`):
++
++```text
++--cwd /tmp/spike-cache-key-0c1ojol5/cwd
++--config /tmp/spike-cache-key-0c1ojol5/runtime/omp-overlay.yaml
++--mode json
++--model @architect
++--session-dir /tmp/spike-cache-key-0c1ojol5/runtime/sessions
++--tools=read,grep,glob
++--system-prompt /tmp/spike-cache-key-0c1ojol5/runtime/system-prompts/architect-fresh.md
++-p @/tmp/spike-cache-key-0c1ojol5/runtime/prompts/prompt-1794267999675-k2y1.txt
++```
++
++Findings:
++
++- System prompt is `extractAgentBody(run.definition)` written to `${agent}-${sessionKey}.md`; `sessionKey` is `fresh` or the sanitized resume id (`harness.ts:293-300`). Content is byte-stable per agent definition and path is deterministic per agent+session. The fresh→resume transition changes the path but not the bytes.
++- Prompt is written to `prompt-${Date.now()}-${random4}.txt` (`harness.ts:311-316`), so the path is unique every turn and the argv differs only there. Prompt **content** is byte-identical when the same fragment/vars are rendered.
++- Overlay is regenerated from the effective pipeline every run (`harness.ts:225-240`) and is byte-stable for identical config; it contains only `modelRoles`, `retry`, `eval`, `title`, `checkpoint`, `advisor`, `bash`, `mnemopi` (three linking flags), and `update` (`overlay.ts:51-85`). It pins **none** of `providers.cache*`, `compaction.*`, `snapcompact.*`, or `mnemopi.autoRecall/autoRetain`.
++- omp wraps the `@file` argument into the user message as `<file name="/abs/path">…</file>` (observed in `message_start`/`message_end` and the session JSONL). Therefore the *new* user message is not byte-identical when the same logical prompt is re-rendered to a different path. This does not break the prior cached prefix (the wrapper is appended at the end), but it means the transport is not byte-reproducible for retries. A content-addressed prompt filename (e.g. `prompt-<sha256>.txt`) would fix that; it is not required for cache hits.
++
++## 3. Live resume probe log
++
++All rows are `turn_end.message.usage`; `totalTokens = input + output + cacheRead + cacheWrite` in every observed row. `input` is *uncached* input (Anthropic reports `input=4` while writing/reading tens of thousands of cached tokens).
++
++### 3.1 Path / model / content probes (opencode-go DeepSeek, 1M context, implicit cache)
++
++| Probe | Input | cacheRead | cacheWrite | total | Cost USD | Interpretation |
++|---|---:|---:|---:|---:|---:|---|
++| D-T1 fresh (architect-resume prompt) | 9,060 + 478 + 1,515 | 0 + 8,960 + 9,344 | 0 | 9,318 / 9,717 / 11,390 | 0.001514 + 0.000266 + 0.000574 = **0.002354** | first request cold; intra-turn tool-loop requests cache |
++| D-T2 resume, same system-prompt path, new prompt path | 677 | 10,752 | 0 | 11,439 | **0.000140** | new prompt path is harmless |
++| D-T3 resume, **system-prompt path changed**, same bytes | 86 | 11,392 | 0 | 11,481 | **0.000049** | path is not in the key |
++| D-T4 resume, prompt path reused, content changed | 130 | 11,392 | 0 | 11,586 | **0.000092** | path reuse gives no extra hit; prior prefix still hits |
++| D-T5 resume, **model switched** to `opencode-go/muse-spark-1.3-contributor:max` | 11,082 | 0 | 0 | 11,775 | **0.001247** | model switch is a full cold read (≈8.9× D-T2) |
++
++### 3.2 Content / tools / thinking invalidations (clean 2-turn sessions, DeepSeek)
++
++| Scenario | T1 input | T2 input | T2 cacheRead | Result |
++|---|---:|---:|---:|---|
++| Control (same system prompt, same tools, same thinking) | 4,505 | 90 | 4,480 | near-full warm hit |
++| System prompt + one appended newline (same path) | 4,585 | 13,266 | 0 | full miss |
++| Tools `read,grep,glob` → `read,grep,glob,bash` | 4,585 | 2,719 | 2,432 | partial miss (tools are in the prefix) |
++| Thinking `:max` → `:high` (same model id) | 4,585 | 4,681 | 0 | full miss |
++
++Anthropic confirms path invariance: A-T1 fresh `input=4`, `cacheWrite=6,703`; A-T2 resume with a **different system-prompt path and identical bytes**: `input=4`, `cacheRead=6,703`, `cacheWrite=342`, cost $0.000143 (vs $0.00098 fresh).
++
++### 3.3 TTL expiry (Anthropic short/5m)
++
++| Turn | Input | cacheRead | cacheWrite | cttl | Cost USD |
++|---|---:|---:|---:|---|---:|
++| T1 fresh (2 requests) | 4 + 2 | 0 + 15,501 | 15,501 + 13,862 | `ephemeral5m` | 0.008491 + 0.006040 |
++| T2 resume ~1 min after T1 | 4 | 29,363 | 8,359 | `ephemeral5m` | **0.001454** |
++| T3 resume 330 s after T2 | 4 | **0** | **38,022** | `ephemeral5m` | **0.004767** |
++
++330 s is past the 300 s short TTL; the cold resume cost 3.3× the warm resume. Long retention was verified separately: `providers.cacheRetention: long` produced `cttl: {ephemeral1h: 6,705}`.
++
++`providers.cacheRetention: none` on a single fresh request produced `input=4,510`, `cacheRead=2,256`, `cacheWrite=24`, `cttl: {ephemeral5m: 24}` — i.e. omp stopped requesting explicit retention, but the provider still served an implicit cached prefix (the default base prompt) from an earlier identical request. `none` is therefore not a guarantee of zero cacheRead; it does reduce explicit write cost for single-request turns.
++
++### 3.4 Cross-session reuse
++
++A brand-new session in a new cwd with the same architect system prompt/tools/prompt shape produced `input=207`, `cacheRead=4,224`, `cacheWrite=0` — the system-prompt prefix was reused across session ids. Content, not session id, is the key (omp may still use session ids for provider routing affinity, but it is not a hard cache-key component for this provider).
++
++### 3.5 Memory-recall caveat (important)
++
++The session JSONL records `custom/system-prompt-digest` entries. With no recalled memories the digest of the same architect body was `a94d3680ec1c75cf` across different paths, cwds and session ids. With `mnemopi.autoRecall` returning a prior turn, the digest changed (`a89aabcb237da3c7`, `634c40b6e2f931de`) even though the agent body was unchanged; a one-newline body change produced `1a5712bb71b370ac`. Conclusion: the digest is a content hash of the **effective** system prompt including injected memory text (not path), and omp's ambient memory can change it. The factory overlay disables `polyphonicRecall`/`enhancedRecall`/`proactiveLinking` (`overlay.ts:77-81`) but leaves `mnemopi.autoRecall` and `mnemopi.autoRetain` at their default `true`. Recalled memories are injected only into the first turn of a session (observed once per session; docs: “Recall local memories into the first turn of each session”), so resumed turns are not re-polluted, but fresh sessions in a reused cwd are non-deterministic and can recall prior task text into the system prompt — losing the cross-session system-prompt cache hit and potentially leaking context between tasks that share a worktree.
++
++## 4. What the cache key covers
++
++**Content key (confirmed):** system-prompt bytes + tool specs (ordered) + model identity + thinking level + conversation history + cache retention markers/TTL. **Not in the key (confirmed):** system-prompt file path, prompt-file path, session id (for content reuse), file mtimes.
++
++Invalidation matrix:
++
++| Change | Observed effect |
++|---|---|
++| system-prompt path changed, bytes identical | full hit (DeepSeek 11,392; Anthropic 6,703) |
++| prompt path changed every turn | full hit on prior prefix (Anthropic 29,363) |
++| prompt path reused, content changed | no extra hit; prior prefix still hits (11,392) |
++| system-prompt +1 byte | full miss (0) |
++| tools order/content changed | partial/full miss; measured 2,432 of 4,480 retained |
++| thinking level changed | full miss (0) |
++| model switched | full miss (0), ~8.9× cost |
++| 5m TTL expired (330 s gap) | full miss (0), `cacheWrite` = 38,022 |
++| new session, same system prompt/tools | system-prompt prefix hit (4,224) |
++| compaction committed | prefix rewritten; next request cannot reuse the pre-compaction prefix |
++
++## 5. Cold-resume detection signals
++
++### 5.1 Pre-launch signals (engine can act before spending)
++
++Read from the session JSONL (the engine already has its path as `meta.yaml` `traceRef`, `src/core/records/step-record.ts:96`, produced at `harness.ts:521-522`):
++
++1. **`custom/system-prompt-digest`** — 16-hex digest of the effective system prompt. Compare the latest value to the engine's own hash of the current `agentBody`; content-only (path-independent), but includes omp-injected memory text (see §3.5).
++2. **`model_change`** — resolved `model` recorded at session start. Compare to the model the current `@role` resolves to. `@role` is re-resolved on every resume (`harness.ts:318-326`), so a pipeline/role/fallback change silently switches models.
++3. **`thinking_level_change`** — recorded level; compare to the current role suffix. A change is a full miss (measured).
++4. **`cttl` + last assistant timestamp** from the newest assistant message usage (`ephemeral5m`/`ephemeral1h`). Expiry = request-send time + TTL. The transcript timestamp is completion time, so subtract a conservative margin (seconds to tens of seconds).
++5. **`compaction` entry** after the last normal turn — history was rewritten; the next resume is cold from the cut point.
++6. **`credential_pin.hash`** (optional) — provider/account affinity changed; OpenAI-style `prompt_cache_key` affinity may be lost.
++7. **Ordered tools hash and cache-retention setting** — the session does not record these; the engine must store them in its own session-state record/meta and compare. Tools change is a partial miss (measured).
++
++### 5.2 Post-hoc signals (ground truth)
++
++- `turn_end.message.usage.cacheRead` == 0 on a resumed turn with prior history ⇒ miss; `cacheWrite` ≈ prompt size ⇒ cold write. `cacheWrite` is only populated by providers with explicit cache writes (Anthropic/Bedrock; DeepSeek reports 0).
++- `turn_end.message.usage.cttl` gives the tier and cached-token count (`{ephemeral5m: N}` / `{ephemeral1h: N}`); absent for DeepSeek implicit caching.
++- `turn_end.message` also carries `api`, `provider`, `model`, `reasoningTokens`, `totalTokens` — the factory currently discards all of them.
++- RPC/SDK expose `cache_warming_start` / `cache_warming_end` with `warmingStopReason` (`refresh missed the cache`, `refresh failed`, `conversation context changed`). `-p --mode json` would include these ordinary session events if warming runs; our probes did not trigger warming (see §7).
++- `display.cacheMissMarker` and the status-line `cache` segment are **UI-only**; no `cache_miss` event appeared in `-p` NDJSON. Do not build engine detection on them.
++
++### 5.3 Records gap (blocks spec 20's “measured defaults”)
++
++`OmpNdjsonParser` reads only `u.input`, `u.output`, and `u.cost.total` (`src/harness/omp/ndjson.ts:86-99`) and returns only `inputTokens`/`outputTokens`/`costUsd` (`ndjson.ts:173-177`). `Usage` (`src/harness/types.ts:7-11`) and `StepUsage` (`src/core/artifacts.ts:545-549`) have no cacheRead/cacheWrite/totalTokens/cttl/model fields. Consequently the records cannot answer “how many tokens did the cold resume re-pay?” today — only the total cost. Extend the types and parser before choosing cost-measured defaults.
++
++Also: side requests not tied to the agent turn (`model_usage` entries in the transcript with `purpose: "unexpected-stop"`, compaction summarization) are not attributed to the step. The `-p "/compact"` probe produced no usage record at all (see §7.1).
++
++## 6. Knob audit for one-process-per-turn (`-p`) factory sessions
++
++Effective values observed with `omp config list --json` / `--scope global` on this host (omp 18.18.5): `providers.cacheRetention=short`, `providers.cacheWarming=streaming`, `provider.appendOnlyContext=auto`, `includeModelInPrompt=false`, `compaction.enabled=true`, `compaction.midTurnEnabled=true`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.experimentalContextManagement=true`, `compaction.handoffSaveToDisk=true`, `compaction.modelThresholds={anthropic/claude-haiku-5-5: "f90000", vercel-ai-gateway/minimax/minimax-m3.1-flash: 800000}`, `mnemopi.autoRecall=true`, `mnemopi.autoRetain=true`, `memory.backend=mnemopi`, `memories.enabled=false`. Several differ from the omp docs defaults: `cacheRetention` docs `auto`, `cacheWarming` docs `idle`, `experimentalContextManagement` docs `false`, `handoffSaveToDisk` docs `false`; `--scope global` proves the host layer sets them. Factory overlay precedence is above project/global (`docs/settings.md:113-123`), so pinning in the generated overlay is effective.
++
++| Knob | Docs default | Effective here | Affects `-p` one-process-per-turn? | Action for M7 |
++|---|---|---|---|---|
++| `providers.cacheRetention` | `auto` | `short` (host) | **Yes** — per-process TTL/markers; a per-turn `--config` overlay can vary it | Pin per role: architect `long` (1h) for standby gaps <1h; `short` for multi-request tool-loop agents; `none` only for known single-request turns |
++| `providers.cacheWarming` | `idle` | `streaming` (host) | `streaming` **yes** (intra-turn long tool executions); `idle` **no** (no idle scheduler in print sessions; process exits) | Pin `streaming`; do not rely on `idle`/standby warming |
++| `provider.appendOnlyContext` | `auto` | `auto` | **Yes** — keeps system prompt + tool specs + append-only log for maximum prefix hits | Keep `auto`/`on`; do not disable |
++| `includeModelInPrompt` | true in docs main; installed effective `false` | `false` | **Yes if true** — model name in the system prompt makes a model switch/fallback change the prefix | Pin `false` |
++| `display.cacheMissMarker` | true | true | **No** — TUI display only | Use usage fields instead |
++| `compaction.enabled` | true | true | **Yes** if the threshold is crossed inside a turn (mid-turn or post-turn) | Set explicit thresholds; do not rely on the default 15%/16k reserve (≈850k on a 1M window) |
++| `compaction.midTurnEnabled` | true | true | **Yes** — can rewrite history between tool-loop requests; the likely auto path in a long factory turn | Keep as overflow safety but raise `thresholdTokens` so it does not fire on normal architect turns |
++| `compaction.thresholdTokens` / `thresholdPercent` / `reserveTokens` | -1 / -1 / unset | same | **Yes** — trigger point | Pin an explicit architect budget; leave room for the next wave |
++| `compaction.methodOrder` | remote, snapcompact, handoff, shake, soft | same | **Yes** if compaction fires | Prefer `handoff`/`soft`; avoid `snapcompact` for the architect (images lose prompt caching) |
++| `compaction.asyncEnabled` | true | true | **Yes** near threshold — speculative side request inside a one-shot process | Keep or disable for deterministic cost; measure |
++| `compaction.autoContinue` | true | true | **Yes** — post-threshold continuation request; needed so the step still yields | Keep `true`; `false` would end a headless run without the agent's answer |
++| `compaction.keepRecentTokens` | 20,000 | 20,000 | **Yes** — size of retained tail after compaction | Tune to the architect brief size |
++| `compaction.supersedeReads` / `dropUseless` | true / true | true / true | **Yes** — cache-aware pruning every turn; can still mutate history near the cache lookback | Keep defaults; audit if cacheRead drops unexpectedly |
++| `compaction.idleEnabled` / `idleThresholdTokens` / `idleTimeoutSeconds` | false / 200,000 / 300 | same | **No** — idle maintenance is enabled only by the interactive TUI; SDK/RPC/print sessions do not enable it (`docs/sdk.md:278`) | Ignore for `-p`; do not build standby policy on it |
++| `compaction.handoffSaveToDisk` | false (host true) | true | No direct cache effect; writes summary artifacts | Pin for determinism |
++| `compaction.experimentalContextManagement` | false (host true) | true | **Potentially** — notes-backed rollover; requires `context_notes`/`new_context`/`read`/`grep` tools, otherwise legacy maintenance | Pin `false` unless deliberately opted in |
++| `snapcompact.systemPrompt` | `none` | `none` | **Yes** — imaging system prompt text loses prompt caching for that text | Pin `none` |
++| `snapcompact.toolResults` | false | false | **Maybe** — images of tool results; cache/vision trade-off | Pin `false` for architect |
++| `compaction.remoteEndpoint` / `remoteStreamingV2Enabled` / `v2RetainedMessageBudget` | unset / true / 64,000 | same | **Yes** if remote compaction is used | Decide/pin; remote is a second compaction path to test |
++| `compaction.modelThresholds` / `modelThresholdsEnabled` | per-model / true | host overrides | **Yes** — can trigger on a model unexpectedly | Audit/pin |
++| `task.agentCompactionThresholdOverrides` | {} | {} | **No** for root factory turns (task/subagents only) | Ignore |
++| `mnemopi.autoRecall` / `autoRetain` | true / true | true / true | **Yes** — first-turn effective system prompt changes; cross-session recall and cache loss | Pin `false` for deterministic factory agents (or opt in consciously with a recorded digest) |
++| `memory.backend` | `mnemopi` | `mnemopi` | **Yes via autoRecall** | Keep but disable autoRecall/autoRetain, or choose `off` if no memory is wanted |
++
++## 7. Compaction vs fresh brief
++
++### 7.1 `-p` manual compaction is available (verified)
++
++A one-shot print invocation accepted the slash command:
++
++```bash
++omp --cwd <cwd> --mode json --model opencode-go/deepseek-v4.1-flash:max \
++  --session-dir <sd> --tools= --resume <session-id> -p "/compact"
++```
++
++It emitted `manual_compaction_start` then `manual_compaction_end` with `result: { tokensBefore: 38053, firstKeptEntryId: …, summary, shortSummary, details }`; `tokensAfter: 6794` and `method: "soft"` live in the transcript `compaction` entry, not the NDJSON result. It printed `Compaction complete. Tokens: 36413 -> 6768 (saved 29645)` to stderr, persisted that `compaction` entry in the session JSONL, and exited 0. There was **no `turn_end`, no usage, and no `model_usage` entry** for the summarization request in NDJSON/transcript — compaction cost must be estimated from `tokensBefore`/summary length (or measured via `omp stats`/an RPC wrapper) if spec 20's cost defaults are to include it.
++
++RPC mode exposes a first-class `{ type: "compact", customInstructions? }` command and `manual_compaction_start/end` events (`docs/rpc.md:190-210`, `:970-987`); `{ type: "set_cache_warming", mode }` is also available there (`docs/rpc.md:197-210`).
++
++### 7.2 Cost analysis (architect on `anthropic/claude-opus-5-5`, catalog: input $4/M, cacheRead $0.20/M, cacheWrite $5/M)
++
++For a 38k-token history (same order as the compaction probe):
++
++| Strategy | What is paid | Approx cost |
++|---|---|---|
++| Direct cold resume | 38k × $4/M | **$0.152** |
++| Compact **after** cache expiry, then resume | summarizer cold-reads 38k ($0.152) + summary output (~$0.01-0.02) + compacted prefix write 6.8k × $5/M ($0.034) + resumed turn | **≈$0.20-0.24** (worse than direct for one turn) |
++| Compact **while warm** (at wave end, within TTL), then resume | summarizer cache-reads 38k × $0.20/M ($0.0076) + output (~$0.01-0.02) + compacted write $0.034 + resumed turn | **≈$0.06-0.09** (better) |
++| Fresh architect brief | build B-token brief from records (e.g. B≈5k: $0.02 input / $0.025 write) + system-prompt prefix cacheRead (~$0.001) | **≈$0.02-0.03** at B=5k; still cheaper at B=20k (~$0.08-0.10) |
++
++Key correction to spec item 20(a): **compaction after the cache has already expired does not avoid re-paying the full history; the summarizer pays it once, then the resumed turn pays the compacted prefix again.** Compaction only pays if it runs while the prefix is still warm, or if the architect will have several future turns on the compacted history, or if the full history would overflow the window. For an already-cold resume, a deterministic fresh brief is the cheaper mechanism.
++
++### 7.3 Recommended mechanism
++
++1. **Warm** (no trigger): resume additively; do nothing.
++2. **Cold + short history / one-shot consult**: resume uncached; optionally pass a per-turn overlay with `providers.cacheRetention: none` if the turn is known to make a single model request (multi-request tool loops still benefit from caching).
++3. **Cold + long history + more turns expected**: start a **fresh architect session hydrated from records** (existing `hydrationContext`/`contextPack`/`waveReport` machinery in `step-runner.ts` and `steps/architect-resume`). This is bounded, deterministic, and still reuses the system-prompt prefix (4,224-token cross-session hit measured).
++4. **Compact only while warm**, at a natural wave boundary, before the TTL expires: `omp -p --resume <id> "/compact"` (verified) or RPC `compact`. Use `handoff`/`soft`, not `snapcompact` for the architect. Record `tokensBefore/tokensAfter`; estimate cost.
++5. **If already cold and continuity is mandatory** (the brief would lose critical conversational state): resume uncached and accept the full read; do not compact as well.
++
++## 8. Standby-warming viability
++
++- `providers.cacheWarming` values: `off`, `streaming`, `idle` (verified by invalid-value error; docs `docs/settings.md:1026`). Warming replays the last request with a one-token output budget shortly before expiry, only when the expected avoided-miss cost exceeds the refresh cost by at least **$0.05**. For Opus (input $4/M vs cacheRead $0.20/M, delta $3.8/M), the threshold is ≈**13.2k tokens** of prefix; an architect session above that qualifies economically.
++- **`idle` warming cannot cover factory standby.** The interactive TUI owns idle work; “SDK, RPC and print sessions do not” enable idle maintenance (`docs/sdk.md:278`). `-p` exits at the end of the turn, so there is no process alive to replay the request between turns. `streaming` warming can still protect a long tool execution **inside** a turn — pin it.
++- **The practical standby mechanism is `providers.cacheRetention: long`** (1h where supported). Verified `cttl: {ephemeral1h: N}`. It needs no live process. The cost is the cache write: catalog `cacheWrite` for Opus is $5/M (1.25× input); Anthropic bills 1h writes at a higher rate than 5m in the real API, and omp's single catalog `cacheWrite` value may under-estimate 1h writes — verify against provider billing before making it the default. A 1h tier pays if the architect's next turn lands >5m and <1h later; it does not cover >1h gaps.
++- **Pre-warming immediately before a resume is never cheaper:** if the entry already expired, the warm request pays full input + cache write, then the resumed turn pays cache read; that is strictly more than the direct cold resume. Warm must happen *before* expiry to pay off.
++- **Persistent RPC holder** (`omp --mode rpc`, `set_cache_warming idle`, `compact`) is the only true standby warming, but it reintroduces a long-lived process and session ownership across wave gaps. Defer as an optional M7 experiment; measure against long retention first.
++
++## 9. Recommendations for M7
++
++1. **Extend usage accounting** (`src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549`, `src/harness/omp/ndjson.ts:86-99`): add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `cacheTtl: {tier, tokens}`, `provider`, `api`, `model`, `reasoningTokens`; keep per-request rows (a turn can emit multiple `turn_end` usages) and aggregate. Include side-request `model_usage`/compaction cost where available.
++2. **Add a per-session cache-state record** (meta or a sibling `session-cache.yaml`): resolved model (`provider/model` from `turn_end.message`), thinking suffix, ordered tools hash, system-prompt hash, cache retention, last request timestamp, last `cttl`, last `compaction` marker. Compare it on every resume.
++3. **Stop silently switching models on resume:** record the resolved model used by the successful turn and pass that literal model on resume (or detect the mismatch and treat it as cold). Current resume unconditionally passes `@role` (`harness.ts:318-326`), so a role-map change or fallback recovery silently switches models and pays a full cold read.
++4. **Pin effective omp settings in the generated overlay** (`overlay.ts:51-85`): `providers.cacheRetention` (per role/flow), `providers.cacheWarming: streaming`, `provider.appendOnlyContext: auto`, `includeModelInPrompt: false`, `snapcompact.systemPrompt: none`, `snapcompact.toolResults: false`, `compaction.experimentalContextManagement: false`, explicit `compaction.enabled/thresholdTokens/methodOrder/autoContinue`, and `mnemopi.autoRecall/autoRetain: false`. Overlay precedence beats host global/project config (`docs/settings.md:113-123`), but only if the keys are actually present.
++5. **Validate effectively, not syntactically:** `omp --config <overlay> --version` exits 0 even for invalid YAML or an invalid `providers.cacheRetention` value (confirmed). Preflight’s current overlay check (`src/cli/preflight.ts:364-393`) is therefore a no-op. Read back effective values (`omp config get`, or a no-model probe) and/or perform a real throwaway turn before declaring config compatible. This confirms open concern `c-477404c672` and adds cache/compaction keys to its scope.
++6. **Cold policy:** warm → resume; cold single-turn → resume (optionally `retention: none`); cold long-history → fresh brief; compact only while warm. Do not compact after expiry for a single resume.
++7. **Byte stability:** keep system-prompt content byte-stable; make prompt filenames content-addressed (`prompt-<sha256>.txt`) so identical logical prompts produce identical `@file` wrappers/transcripts. The current timestamp+random path is cache-safe but not byte-reproducible.
++8. **Disable ambient memory for deterministic agents** or explicitly include its digest: `mnemopi.autoRecall/autoRetain: false`; otherwise fresh sessions in a reused cwd inject prior task text into the system prompt (digest changes observed).
++9. **Measure before defaults:** use `long` retention for architect standby gaps <1h, `short` for multi-request tool-loop agents, `none` only for single-request turns; keep the choice per role/flow and record the cost delta.
++10. **Tests:** the scripted mock provider for item 19.8 should emit realistic `usage` rows with `cacheRead`, `cacheWrite`, `totalTokens`, `cttl`, and multiple `turn_end`s per turn, plus a synthetic session JSONL with `system-prompt-digest`, `model_change`, `thinking_level_change`, `compaction`, and `cttl` so cold detection is testable without paid models.
++
++## 10. Draft decision YAML
++
++```yaml
++status: proposed
++decision: |
++  OMP prompt caching is content-keyed, not path-keyed. The cached prefix is composed of the
++  system-prompt bytes, ordered tool specs, model/thinking identity, cache-retention tier, and
++  conversation history; file paths and session ids are not hard key components. The factory's
++  deterministic system-prompt path and unique per-turn prompt path are cache-safe; a changed
++  system-prompt path with identical bytes still fully hits. Cold resume must be detected from
++  content/config changes (system-prompt bytes, ordered tools, model, thinking level, cache
++  retention) plus TTL expiry (usage.cttl + timestamp) and compaction markers, not from paths.
++  For one-process-per-turn `-p` sessions, idle cache warming and idle compaction are unavailable;
++  use `providers.cacheRetention: long` for architect standby gaps under 1h, pin streaming warming
++  for intra-turn tool executions, and do not rely on omp's default host config (this host sets
++  short/streaming/experimental values). For an already-cold architect resume, prefer a fresh
++  brief hydrated from records over compaction; compaction only pays when performed while the
++  cache is warm (at a wave boundary) or amortized over several future turns. Pin all relevant
++  omp cache/compaction/memory keys in the generated overlay and record cacheRead/cacheWrite/
++  totalTokens/cttl in step records so defaults can be measured.
++evidence:
++  - "Transport audit: harness.ts:286-350 writes a deterministic per-agent+session system prompt and a unique timestamp+random prompt file; argv differs only in -p @path; overlay bytes identical (sha256 6ebf5894...); system-prompt/prompt content identical across renders."
++  - "Path invariance: DeepSeek resume with changed system-prompt path and identical bytes cacheRead=11,392 (input 86); Anthropic resume with changed path cacheRead=6,703 (input 4). New prompt path per turn cacheRead=10,752 (DeepSeek) and 29,363 (Anthropic)."
++  - "Content invalidation: system prompt + newline cacheRead=0 (input 13,266); tools change cacheRead=2,432 of 4,480; thinking change cacheRead=0; model switch cacheRead=0 (cost 8.9x warm)."
++  - "TTL: Anthropic short (5m) warm resume cacheRead=29,363, cost $0.001454; after 330s cacheRead=0, cacheWrite=38,022, cost $0.004767. Long retention emits cttl ephemeral1h; providers.cacheRetention enum is auto|short|long|none."
++  - "Cross-session: new session, same system prompt/tools, cacheRead=4,224; session id is not a hard key."
++  - "Compaction: `omp -p --resume <id> \"/compact\"` compacted 38,053 -> 6,794 tokens (method soft) with manual_compaction_start/end; no usage/cost in NDJSON or transcript. Docs: idle maintenance is TUI-only (docs/sdk.md:278); cacheWarming values off|streaming|idle, $0.05 avoided-miss gate (docs/settings.md:1026); idle compaction trade-off (docs/compaction.md:155-158)."
++  - "Factory records: ndjson.ts:86-99 and 173-177 drop cacheRead/cacheWrite/totalTokens/cttl; Usage and StepUsage lack fields (types.ts:7-11, artifacts.ts:545-549)."
++  - "Factory overlay: overlay.ts:51-85 pins no providers.cache*, compaction.*, snapcompact.*, mnemopi.autoRecall/autoRetain; host global config sets providers.cacheRetention=short, cacheWarming=streaming, compaction.experimentalContextManagement=true. `omp --config <invalid> --version` exits 0, so preflight.ts:364-393 does not validate the overlay."
++followUps:
++  - "M7: extend Usage/StepUsage and OmpNdjsonParser with cacheRead/cacheWrite/totalTokens/cttl/provider/model/reasoningTokens and per-request rows."
++  - "M7: add a session cache-state record and pre-launch cold detector (system-prompt hash, ordered tools hash, resolved model, thinking, retention, cttl+timestamp, compaction marker)."
++  - "M7: pass the recorded resolved model on resume instead of unconditionally @role; treat role-map changes as cold."
++  - "M7: pin cache/compaction/mnemopi settings in the generated overlay; validate effective values in preflight with a real check, not `--version`."
++  - "M7: measure long-vs-short retention and fresh-brief-vs-warm-compaction per role/flow on the self-host fire test; confirm Anthropic 1h write pricing against provider billing."
++  - "M7: optional RPC holder experiment (set_cache_warming idle + compact) only if long retention does not cover the observed wave gaps."
++  - "Add a mock-provider fixture with cache usage/cttl/session entries so cold-detection and cost defaults are testable without paid models."
++```
++
++## 11. Open questions / follow-ups
++
++- Anthropic's real 1h cache-write price is higher than the 5m write price; omp's catalog exposes one `cacheWrite` value per model. The cost estimates in §7.2/§8 for `long` may be optimistic. Confirm on the provider bill before making `long` the default.
++- DeepSeek reports no `cttl`/`cacheWrite`; its implicit cache has no observable TTL. Do not attempt TTL-based cold detection for such providers; use content/config fingerprints only.
++- The `-p "/compact"` summarization cost is not in NDJSON or the transcript. If spec 20 requires measured compaction cost, add an RPC wrapper that captures the compaction response/usage, or estimate from `tokensBefore` and summary length.
++- `mnemopi.autoRetain` can write completed factory turns into a per-cwd memory bank and affect later fresh sessions in the same worktree. Decide whether that is a feature (cross-run context) or a leak (task isolation); the factory's current overlay only disables the linking flags.
++- `checkpoint.enabled: true` in the overlay mounts checkpoint tools; agents opt in via their tool lists. Not a cache issue, but part of the effective harness surface to audit.
++
++## Sources
++
++Repo (read-only audit):
++- `plugins/software-factory/src/harness/omp/harness.ts:286-350` — system-prompt/prompt materialization, model candidates.
++- `plugins/software-factory/src/harness/omp/harness.ts:368-389` — argv construction (`--system-prompt`, `-p @file`, `--resume`, tools).
++- `plugins/software-factory/src/harness/omp/harness.ts:225-240` — overlay regeneration.
++- `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — overlay keys; no cache/compaction/memory-autoRecall pins.
++- `plugins/software-factory/src/harness/omp/ndjson.ts:86-99,173-177` — usage fields dropped.
++- `plugins/software-factory/src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549` — `Usage`/`StepUsage` lack cache fields.
++- `plugins/software-factory/src/core/flows/step-runner.ts:534-547,620,817` — prompt rendering and `AgentRun` prompt.
++- `plugins/software-factory/src/core/records/step-record.ts:96`; `src/harness/omp/harness.ts:521-522` — `traceRef` to session JSONL.
++- `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay validation via `omp --config … --version`.
++- `plugins/software-factory/docs/OMP_ADAPTER.md:164-172` — prior cache-safety claims; line 168 previously marked path-vs-content keying unknown.
++- `plugins/software-factory/docs/ARCHITECTURE.md:38` — one process per agent turn; `:40` — cache/compaction not built.
++- `docs/factory.v2.md:114-120` — spec items 20(a)-(d).
++
++OMP docs (official):
++- `https://omp.sh/docs/compaction` — compaction settings reference.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:113-123` — precedence (overlay beats project/global); `:926` — cache-segment invalidation signals; `:1025-1027` — cacheRetention/cacheWarming; `:468` — includeModelInPrompt.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md:465-504` — prompt-cache lifetimes (Anthropic 5m/1h; OAuth vs API key defaults).
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md:278` — idle maintenance is TUI-only; SDK/RPC/print sessions do not enable it.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md:155-158` — idle-compaction/cache TTL trade-off; `:530` — experimental context management default false.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md:190-210,970-1037` — `compact`, `set_cache_warming`, `cache_warming_start/end`/`warmingStopReason`.
++
++## Appendix A: Probe log (commands and raw result locations)
++
++All live probes were run as `omp -p --mode json --max-cost 0.10` from throwaway dirs; per-turn NDJSON and stderr were captured under `/tmp/spike-cache-key-{live,ttl,invalidation,tools-thinking,digest,cross-session,anth-path,retention,preflight}` (exception: the long/none retention probes in §3.3 saved only YAML results — no NDJSON/transcript was archived for them). The transport shim captured argv/system-prompt/prompt under `/tmp/spike-cache-key-0c1ojol5/capture/{fresh-1,fresh-2,resume-1,resume-2}`. The numbers in §3 are extracted from the `turn_end`/`message` usage rows in those files. Aggregate spend ≈ $0.05.
+diff --git a/plugins/software-factory/docs/spikes/omp-6-repo-rules.md b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
+new file mode 100644
+index 0000000..1b4f5ad
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
+@@ -0,0 +1,128 @@
++# Software-Factory v2: OMP Repo Rules & Injection Spike (M1)
++
++This report is empirical verification of how omp discovers repository rules and context files, how the factory's per-role prompts interact with that injection, and what the factory should do for the M1 `omp-workspaces` repo-rules requirement. Tested against `omp 18.18.5` on Linux x86_64 WSL2 with throwaway git fixtures and a local OpenAI-compatible mock provider. No paid models were used; no production files were changed.
++
++## 1. Verdicts
++
++### 1.1 Root omp sessions inject repo rules automatically — **VERIFIED**
++
++`omp --cwd <repo> --system-prompt <role-body>` still emits a trailing `<project-context>` footer with `<repo-rules>` and injects rules. `--system-prompt` replaces only block 0; it does not suppress context files, `RULES.md`, always-apply rules, or the rulebook listing.
++
++### 1.2 Current factory has no double injection — **VERIFIED**
++
++Factory roles are root omp processes; their `--system-prompt` contains only the agent definition body. Repo rule text is absent from all role/step prompt assets. Each active sentinel appeared exactly once in captured provider requests.
++
++### 1.3 Copying rules into role prompts double-injects — **VERIFIED**
++
++A role system prompt containing the same repo text produced 2 sentinel occurrences (block 0 + `<repo-rules>`). `--append-system-prompt` with the same text produced 2 (repo-rules + append). If M8 injects engine-rendered rules, it MUST disable omp discovery for that run.
++
++### 1.4 The spec's subagent premise is about scouts — **VERIFIED BY DOCS, NOT LIVE**
++
++omp task subagents drop every context file named `AGENTS.md` by basename; they keep `RULES.md` and `contextFiles.extra`. Root role sessions do not drop AGENTS.md. The factory's architect/developer/qa/reviewer are root processes, so they already receive AGENTS.md. Scouts (`task`) do not; use RULES.md/extra/delegation context for them.
++
++### 1.5 Preflight overlay validation is a no-op — **VERIFIED (critical)**
++
++`omp --config <bad.yaml> --version` exits 0. The same overlay on a real turn fails with `Failed to parse config overlay`. The current preflight check (`preflight.ts:364-393`) proves the binary exists, not that the overlay is valid.
++
++### 1.6 No-paid-model mock provider is feasible — **VERIFIED**
++
++A throwaway `models.yml` custom provider (`api: openai-completions`, `apiKey` literal, `authHeader: true`) plus a local HTTP/SSE stub returned scripted responses and recorded exact request bodies. This is a viable basis for M8's scripted mock model provider.
++
++## 2. Source and precedence summary
++
++### 2.1 Context files (`<repo-rules>`)
++
++| Source | Provider priority | Scope |
++|---|---|---|
++| `.omp/AGENTS.md` | native 100 | nearest non-empty `.omp` walking cwd→repo root; no farther fallback |
++| `AGENTS.md` | agents-md 10 | every ancestor cwd→repo root (and enclosing workspace dirs under home) |
++| `.claude/CLAUDE.md` | claude 80 | launch cwd only |
++| `CLAUDE.md` | claude-md 10 | every ancestor cwd→repo root |
++| `.agent/AGENTS.md`, `.agents/AGENTS.md` | agents 70 | ancestor walk; `.agent` wins same level |
++| `.github/copilot-instructions.md` | github 30 | launch cwd only |
++| `.gemini/GEMINI.md` | gemini 60 | launch cwd only |
++| `contextFiles.extra` basenames | custom-context 9 | walk like AGENTS.md; additive; also user agent dir and primary checkout root in linked worktrees |
++
++One user context file survives by provider priority; one project file per depth; higher priority shadows at the same depth; different depths compose root→cwd (nearer last, more prominent). `contextFiles.extra` is additive and never takes the scope slot. Final injection is one `<repo-rules>` block in the trailing `<project-context>` footer, with absolute paths and expanded `@` imports.
++
++### 2.2 Rules
++
++| Source | Provider priority | Scope / bucket |
++|---|---|---|
++| `.omp/rules/*.{md,mdc}` | native 100 | `<cwd>/.omp/rules` only; always-apply / rulebook / TTSR |
++| `<agent-dir>/rules/*` | native 100 | user; same buckets |
++| `.omp/RULES.md` | native 100 sticky | nearest project `.omp`; forced always-apply (`RULES@project`) |
++| `<agent-dir>/RULES.md` | native 100 sticky | user; forced always-apply (`RULES`) |
++| `.cursor/rules/*.{mdc,md}` | cursor 50 | project `<cwd>/.cursor/rules`, user `~/.cursor/rules`; alwaysApply or rulebook |
++| `.cursorrules` | — | **not observed in 18.18.5**; do not rely on it |
++| `.windsurf/rules/*.md` | windsurf 50 | project; rules |
++| `.clinerules` | cline 40 | nearest; rules |
++| `.github/instructions/**/*.instructions.md` | github 30 | applyTo rules |
++| plugin `rules/` | omp-plugins 90 | extension packages |
++
++Rules dedup by name: native > omp-plugins > agents > cursor/windsurf > cline > github > builtin. Bucket order: TTSR > alwaysApply (full content) > rulebook (description listing; body via `rule://`). `--no-rules` removes all of them; `--no-context-files` removes none.
++
++### 2.3 Settings layers
++
++Environment > runtime > `--config` overlays > project `.omp/config.yml` > global `<agent-dir>/config.yml` > default. Arrays replace; they do not merge. `disabledExtensions: [context-file:<level>:<basename>]` drops a single context file; `disabledProviders` removes a whole discovery source.
++
++## 3. Injection behavior
++
++- Context files: `<repo-rules>` in `<project-context>` footer; static system block comes first, so worktree-specific rules sit below the Anthropic cache breakpoint.
++- Rules with default prompt: full always-apply content in `<generic-rules>`; conditional/described rules in `<domain-rules>` as name/description/globs pointers.
++- Rules with `--system-prompt`: always-apply content is prepended to block 0; rulebook renders as `<rules>` in block 0.
++- `--system-prompt` suppresses discovered `SYSTEM.md` but **not** `APPEND_SYSTEM.md`, context files, or rules.
++- `--no-context-files` disables context files only; `--no-rules` disables rules only; both are needed to disable both.
++- Discovered `APPEND_SYSTEM.md` is appended even with both flags and a custom system prompt; explicit empty `--append-system-prompt=` suppresses it.
++
++## 4. Probe matrix (condensed)
++
++| Probe | Result |
++|---|---|
++| repo1 baseline (root AGENTS, CLAUDE, .claude/CLAUDE, .cursorrules, .cursor/rules always, .omp/RULES, AGENTS.local) | `<repo-rules>` = `.claude/CLAUDE.md`; rules = `RULES.md` + cursor always; root AGENTS/CLAUDE shadowed; `.cursorrules` absent |
++| + `--system-prompt` | role text + rules in block 0; `<repo-rules>` still `.claude/CLAUDE.md` |
++| + `--no-context-files` | no `<repo-rules>`; rules remain |
++| + `--no-rules` | `<repo-rules>` remains; rules gone |
++| + extra overlay `AGENTS.local.md` | `.claude/CLAUDE.md` + `AGENTS.local.md` |
++| repo2 `.omp/AGENTS.md` + root AGENTS | `.omp/AGENTS.md` only; root shadowed |
++| repo3 only AGENTS.md | `AGENTS.md` injected |
++| repo4 only CLAUDE.md | `CLAUDE.md` injected |
++| repo5 only `.cursorrules` | nothing, even with `read` |
++| repo6 conditional `.mdc` | `<domain-rules>` listing only |
++| repo7 always `.mdc` + `.cursorrules` | always body injected; `.cursorrules` absent |
++| cwd `sub/` | root + sub AGENTS (root first); root `.omp/RULES.md`; root `.claude` not loaded |
++| repo8 native rules + same-name cursor | native body wins; cursor body absent; conditional in `<domain-rules>` |
++| cwd `sub/` of repo8 | root `.omp/rules` not loaded; root RULES still loaded |
++| duplicate role prompt | sentinel count 2; with `--no-context-files` count 1 |
++| duplicate append | sentinel count 2 |
++| user AGENTS/RULES/SYSTEM/APPEND | all load; APPEND survives both disable flags; empty append suppresses |
++| project config extra + overlay empty / disabledExtensions | project extra loads; overlay `[]` removes; disabled file drops while extra stays |
++| resume after editing AGENTS.md | new system footer contains V2 only; history retained |
++| preflight bad overlay + `--version` | exit 0; real turn parse error |
++
++## 5. Role hydration seams
++
++- `--system-prompt` = `agents/<role>.md` body (frontmatter stripped, shared partials resolved).
++- `-p @<prompt>` = rendered `agents/steps/<step>.md` with prompt vars/schema.
++- `--cwd` = task worktree for architect/plan-reviewer/PM/close-ups; item worktree for developer/qa/reviewer. That cwd is the omp discovery root.
++- One shared `{runtimeDir}/omp-overlay.yaml`; currently no context/rules keys.
++- Inherited `HOME`/agent dir means user-level `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md` apply to every role.
++
++## 6. M8 plan
++
++1. Keep omp auto-discovery as the repo-rules injector for root roles; do not copy rule text into role definitions or step prompts.
++2. Add a pipeline/overlay knob for `contextFiles.extra` (array of basenames) and, if needed, `disabledExtensions` for user-level contamination.
++3. For rules that scouts must follow, use `.omp/RULES.md` or `contextFiles.extra`, or pass them in the `task` tool `context` field; AGENTS.md alone is invisible to scouts.
++4. Add a mock-provider test harness that records request bodies; assert sentinel counts per role, precedence, flags, resume refresh, and cache-prefix stability.
++5. Optionally run a cheap live probe where each role quotes sentinels; assert root roles see AGENTS and scouts do not (unless RULES/extra/context carries them).
++6. If engine-side hydration is ever chosen, launch with `--no-context-files --no-rules --append-system-prompt=` and assert count == 1.
++7. Replace preflight's `--config --version` with a real throwaway turn against the mock provider.
++
++## 7. Recommendations
++
++- **Use omp-native injection** (recommended): no double injection, no rule-text duplication, cache-friendly (rules in the trailing footer below the cache breakpoint).
++- **Do not rely on `.cursorrules`** in omp 18.18.5; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
++- **Put hard repo rules in `.omp/RULES.md`** if scouts must see them; keep AGENTS.md for the broader root-session guidance.
++- **Verify user-level prompt files** are intentional; suppress `APPEND_SYSTEM.md` with `--append-system-prompt=` for deterministic role prompts.
++- **Pin/sync repo rules across worktrees** at item/wave creation if rule changes must be consistent.
++- **Keep factory launches at worktree roots**: `.omp/rules` and `.claude/CLAUDE.md` are cwd-only, so launching a role from a subdirectory would silently miss the root copies.
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
+- id: c-8a26e7294b
+  kind: risk
+  severity: medium
+  summary: "Gate environment lacks dependency install: child/item worktrees without infra.setup fail typecheck and tests with `Cannot find package 'yaml'` / missing `@types/bun`."
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
+- id: rm-d7f1fc7cc4
+  kind: remarkable
+  summary: Four spikes + two foundation items in iteration 1; epics deferred to iteration 2
+- id: rm-1e89eca104
+  kind: remarkable
+  summary: Additive optional cache-token fields with zero-default aggregation, no migration
+- id: rm-f6cb03959a
+  kind: remarkable
+  summary: Iteration-1 spikes+measurement only, epics deferred to iteration-2 via replanAfter
+- id: rm-9571a69c19
+  kind: remarkable
+  summary: Keep omp root-session discovery as the sole repo-rules injector; do not duplicate rule text in factory role/step prompts
+- id: rm-d9e8ce5fcd
+  kind: remarkable
+  summary: Use `.omp/RULES.md` / `contextFiles.extra` (or task `context`) for rules that must reach scouts
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..a78eed3
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
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
+startedAt: 2026-11-10T05:25:45.719Z
+session: 01a1c3eb-643a-75ad-9315-f48816abe6fa
+endedAt: 2026-11-10T05:27:11.975Z
+usage:
+  inputTokens: 102608
+  outputTokens: 10128
+  costUsd: 0.012598
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T05-25-46-170Z_01a1c3eb-643a-75ad-9315-f48816abe6fa.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..d33f172
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,17 @@
+status: approved
+summary: "Docs-only salvage verified: 5/5 files present, probe+recommendations
+  in all 4 spikes, 4x M1 evidence+FollowUps mapping, oMP typo fixed, zero prod
+  lines, custom file-presence target passes, no test changes."
+suggestions:
+  - detail: "Line 92 (copied from source) names the deliverable as
+      items/spike-findings-recovery/RECOVERY.md, but this item's actual path is
+      items/spike-findings-recovery-v2/RECOVERY.md (correctly stated in the
+      placement note at line 5). Consider a one-phrase clarification, e.g.
+      append '(here: items/spike-findings-recovery-v2/RECOVERY.md)', or leave as
+      faithful source quote; non-blocking."
+    disposition: optional
+    id: recovery-stale-deliverable-path
+    location:
+      file: items/spike-findings-recovery-v2/RECOVERY.md
+      line: 92
+    summary: RECOVERY.md line 92 names non-v2 deliverable path
diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
index cd66aa7..765967f 100644
--- a/.factory/tasks/omp-workspaces/journal.ndjson
+++ b/.factory/tasks/omp-workspaces/journal.ndjson
@@ -313,24 +313,3 @@
 {"type":"step_started","task":"omp-workspaces","step":"pm-amend-1-2","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/021-pm-amend-1-2-a1","ts":"2026-11-10T04:55:54.450Z"}
 {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-amend-1-2","timeoutSec":2700,"ts":"2026-11-10T04:55:54.454Z"}
 {"type":"step_finished","task":"omp-workspaces","step":"pm-amend-1-2","attempt":1,"status":"ok","sessionId":"01a1c3d0-0e77-74a9-9aab-f205f994e96e","usage":{"inputTokens":25430,"outputTokens":6753,"costUsd":0.003894},"ts":"2026-11-10T04:56:47.068Z"}
-{"type":"wave_started","wave":3,"iteration":1,"ts":"2026-11-10T04:56:48.258Z"}
-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/001-develop-r1-a1","ts":"2026-11-10T04:56:49.018Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","timeoutSec":5400,"ts":"2026-11-10T04:56:49.023Z"}
-{"type":"step_started","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--target-green-ratchet-fix/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/001-test-first-r1-a1","ts":"2026-11-10T04:56:49.096Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T04:56:49.101Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1c3d0-e401-743d-b536-d4d8f32194a2","usage":{"inputTokens":27325,"outputTokens":6379,"costUsd":0.008592},"ts":"2026-11-10T04:58:09.710Z"}
-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"sizeBytes":6083134,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-426Z_01a1c3d0-e412-7153-ae52-2c9a5e4697a4","ts":"2026-11-10T05:03:10.263Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"toolCalls":74,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T04-56-49-426Z_01a1c3d0-e412-7153-ae52-2c9a5e4697a4","ts":"2026-11-10T05:03:10.264Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c3d0-e412-7153-ae52-2c9a5e4697a4","usage":{"inputTokens":103048,"outputTokens":36483,"costUsd":0.045768},"ts":"2026-11-10T05:03:11.489Z"}
-{"type":"step_started","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--target-green-ratchet-fix/.factory/tasks/omp-workspaces/items/target-green-ratchet-fix/steps/002-develop-r1-a1","ts":"2026-11-10T05:03:13.398Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T05:03:13.403Z"}
-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/.factory/tasks/omp-workspaces/items/spike-findings-recovery-v2/steps/002-develop-r1-a2","ts":"2026-11-10T05:03:13.430Z"}
-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","timeoutSec":5400,"ts":"2026-11-10T05:03:13.436Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:05:28.993Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:05:31.358Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"method":"ask","ts":"2026-11-10T05:06:52.363Z"}
-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"toolCalls":64,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T05-03-13-799Z_01a1c3d6-c187-7606-bb74-97b9346f5448.jsonl","ts":"2026-11-10T05:12:38.648Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:12:40.968Z"}
-{"type":"harness_model_fallback","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T05:12:43.278Z"}
-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery-v2","step":"develop","attempt":2,"status":"ok","sessionId":"01a1c3d6-c197-741d-ad4d-936420c72cda","usage":{"inputTokens":29707,"outputTokens":7432,"costUsd":0.009692000000000001},"ts":"2026-11-10T05:15:50.897Z"}
-{"type":"step_output_repaired","task":"omp-workspaces","item":"target-green-ratchet-fix","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T05:18:00.357Z"}
diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
index 45f9bfe..ceed14a 100644
--- a/.factory/tasks/omp-workspaces/state.yaml
+++ b/.factory/tasks/omp-workspaces/state.yaml
@@ -1,8 +1,8 @@
 task: omp-workspaces
 kind: saga
-status: active
+status: failed
 iteration: 1
-currentWave: 3
+currentWave: 2
 items:
   spike-cache-key:
     kind: fact-finder
@@ -71,26 +71,10 @@ items:
     spendUsd: 0.181734
     currentStep: review
     mergedAt: 2026-11-09T23:09:02-05:00
-  spike-findings-recovery-v2:
-    kind: no-behavior
-    status: running
-    branch: topic/omp-workspaces--spike-findings-recovery-v2
-    attempts: 2
-    fixRounds: 1
-    spendUsd: 0.018284
-    currentStep: develop
-  target-green-ratchet-fix:
-    kind: dev
-    status: running
-    branch: topic/omp-workspaces--target-green-ratchet-fix
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.045768
-    currentStep: develop
 concerns:
-  open: 1
+  open: 5
   dismissed: 3
-  routed: 38
+  routed: 33
   resolved: 0
 debt:
   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
@@ -133,10 +117,6 @@ debt:
     provider needs a wrapper or new option"
   - "[19.1] spike-omp-isolation polish notes deferred to iteration-2 M3/M4
     planning"
-  - "[redrive] Merge redrive ignores retry-with-guidance (no execution path);
-    guidance-only recovery cannot fix environmental gate failures"
-  - "[wave-merge] target-green gate targets ignore baseline ratchet; gate:test
-    unmergeable on red baseline"
   - "[spike-cache-key] Findings cite nonexistent
     plugins/software-factory/docs/factory.v2.md"
   - "[spike-cache-key] 7.1 misattributes tokensAfter/method to NDJSON result"
@@ -169,20 +149,20 @@ debt:
     hardcoded fallback"
   - "[usage-cache-tokens] Duplicate 6-term has-usage guard in step-runner and
     shutdown"
-budgetSpentUsd: 1.8652213999999998
+budgetSpentUsd: 1.7882303999999996
 spendByRole:
   workhorse:
-    costUsd: 1.3227084000000002
-    inputTokens: 2887985
-    outputTokens: 1020277
+    costUsd: 1.2586564000000002
+    inputTokens: 2727905
+    outputTokens: 969983
   alt-workhorse:
-    costUsd: 0.324934
-    inputTokens: 1440770
-    outputTokens: 565397
+    costUsd: 0.319499
+    inputTokens: 1403899
+    outputTokens: 556970
   architect:
-    costUsd: 0.211215
-    inputTokens: 1474717
-    outputTokens: 97207
+    costUsd: 0.203711
+    inputTokens: 1419917
+    outputTokens: 94122
   alt-architect:
     costUsd: 0.006364
     inputTokens: 28896
@@ -192,22 +172,6 @@ spendByItem:
     costUsd: 0.45245700000000005
     inputTokens: 1135682
     outputTokens: 348841
-  usage-cache-tokens:
-    costUsd: 0.181734
-    inputTokens: 509493
-    outputTokens: 194135
-  spike-findings-recovery-v2:
-    costUsd: 0.018284
-    inputTokens: 57032
-    outputTokens: 13811
-  transport-byte-stability:
-    costUsd: 0.083151
-    inputTokens: 192618
-    outputTokens: 106892
-  merge-setup-fix:
-    costUsd: 0.16351299999999996
-    inputTokens: 608055
-    outputTokens: 146795
   spike-mock-provider:
     costUsd: 0.12459699999999999
     inputTokens: 255359
@@ -216,20 +180,28 @@ spendByItem:
     costUsd: 0.11246700000000001
     inputTokens: 225196
     outputTokens: 108718
-  target-green-ratchet-fix:
-    costUsd: 0.045768
-    inputTokens: 103048
-    outputTokens: 36483
+  usage-cache-tokens:
+    costUsd: 0.181734
+    inputTokens: 509493
+    outputTokens: 194135
   spike-findings-recovery:
     costUsd: 0.174178
     inputTokens: 546734
     outputTokens: 203800
+  transport-byte-stability:
+    costUsd: 0.083151
+    inputTokens: 192618
+    outputTokens: 106892
+  merge-setup-fix:
+    costUsd: 0.16351299999999996
+    inputTokens: 608055
+    outputTokens: 146795
   spike-cache-key:
     costUsd: 0.155598
     inputTokens: 331901
     outputTokens: 152018
   (orchestration):
-    costUsd: 0.3534744000000001
-    inputTokens: 1867250
-    outputTokens: 218749
-lastUpdated: 2026-11-10T05:15:51.672Z
+    costUsd: 0.3405354000000001
+    inputTokens: 1775579
+    outputTokens: 207237
+lastUpdated: 2026-11-10T04:46:31.494Z
diff --git a/items/spike-findings-recovery-v2/RECOVERY.md b/items/spike-findings-recovery-v2/RECOVERY.md
new file mode 100644
index 0000000..07601c2
--- /dev/null
+++ b/items/spike-findings-recovery-v2/RECOVERY.md
@@ -0,0 +1,92 @@
+# Wave-1 spike findings recovery
+
+Status: recovered. Docs-only salvage of approved wave-1 research onto the parent branch.
+
+> **Placement note:** recovered from `.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md` on branch `topic/omp-workspaces--spike-findings-recovery` via read-only `git show`. This item worktree must not write engine-owned `.factory/**` paths, so the deliverable lives at `items/spike-findings-recovery-v2/RECOVERY.md`; content is otherwise unchanged.
+
+## Why this exists
+
+All four wave-1 spike items completed research (`status: ok`) and review (`status: approved`), but their wave-end merges failed environmentally: the merge-path gates ran without `infra.setup` in the child worktree, so the missing `node_modules` failed typecheck. No research finding was rejected. This item re-materializes the approved drafts as product docs and records the evidence mapping needed by iteration-2 planning. No production code changed; the source item branches were read via `git show` only (no checkout/switch).
+
+## Source provenance (read-only)
+
+| M1 scenario | Source branch | Research record | Review record | Review outcome |
+|---|---|---|---|---|
+| 1. Isolation probe matrix | `topic/omp-workspaces--spike-omp-isolation` (`cd07f2d`) | `items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml` (`ok`) | `steps/003-review-r1-a1/output.yaml` | `approved`; probe-26/18 interpretation softened |
+| 2. Mock-provider seam | `topic/omp-workspaces--spike-mock-provider` (`85c4b46`) | `items/spike-mock-provider/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; e2e split justified |
+| 3. Cache keying | `topic/omp-workspaces--spike-cache-key` (`c28f43b`) | `items/spike-cache-key/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; spec-path/provenance fixes applied |
+| 4. Repo-rules injection | `topic/omp-workspaces--spike-repo-rules` (`9755c7e`) | `items/spike-repo-rules/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; cwd-scope invariant documented |
+
+Parent-branch decisions consumed:
+
+- `decisions/001-item-spike-repo-rules-1.yaml` — `accept-with-debt`; rulings: M4 replaces the preflight no-op with a real mock-provider turn; M8 builds the scripted mock helper with per-role request-body assertions; M8 keeps omp as sole root injector, implements RULES/extra for scouts, and asserts one sentinel per role; M8 chooses the prompt-isolation policy (profile/agent-dir and/or `disabledExtensions` + empty `--append-system-prompt=`).
+- `decisions/002-item-spike-omp-isolation-1.yaml` — `accept-with-debt`; rulings: M4 replaces `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; M3 implements the ratified root mapping (`omp worktree add -b <topic-branch> <path> <base> -C <repo>` then `omp --cwd <path> -p`) with `isolation: engine` as the fallback and unchanged engine merge ownership.
+
+## Recovered docs
+
+| Doc | M1 scenario | Evidence preserved |
+|---|---|---|
+| `plugins/software-factory/docs/spikes/omp-3-isolation.md` | 1 | 27-probe command log + excerpts, backend enum, retention matrix, root mapping, `task.isolation` vs engine merge, preflight recipe, draft config surface, recommendations |
+| `plugins/software-factory/docs/spikes/omp-4-mock-provider.md` | 2 | 17-probe log, extension/SSE seam, scenario `{turns}` contract, NDJSON/usage contract, `OmpHarness` wrapper, decision YAML + followUps, sources |
+| `plugins/software-factory/docs/spikes/omp-5-cache-keys.md` | 3 | Transport byte/argv audit, live resume probe log (DeepSeek/Anthropic), TTL/model/content invalidation, cold-resume signals, knob audit, compaction/warming analysis, recommendations, appendix |
+| `plugins/software-factory/docs/spikes/omp-6-repo-rules.md` | 4 | Source inventory, precedence/composition, flag matrix, probe matrix, per-role seams, M8 verification plan, recommendations |
+
+## M1 scenario → evidence mapping
+
+### 1. Isolation probe matrix (M1 scenario-1)
+
+Evidence: `isolation.backend` has exactly 9 accepted values (`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy`); every value degrades to plain checkout with a FICLONE warning on ext4/WSL2. Retention: `worktree add` + `--cwd` keeps commits/partials/registration on success, failure, and SIGKILL; isolated subagents retain a patch or `omp/task/<Agent>` branch on success **and** failure; parent abort loses all. `worktree.onStart` is a no-op for `-p`. omp `apply:true` produces a single-parent commit with no gates/conflict agent, so engine `merge-path.ts` remains merge owner and subagents use `apply:false`. Preflight must include one real turn (probes 17/18/27: bogus keys, invalid backend overlays, and missing overlays are all accepted by static checks).
+
+FollowUps:
+- **M3**: implement `workspaces.isolation: omp|engine`, the omp backend/worktree/`task.isolation` config surface, `omp worktree add` + `--cwd` root mapping, and keep topic branch naming + engine merge ownership.
+- **M4**: replace `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; derive status/gc from `git worktree list` + records; classify turn outcome from the `--mode json` transcript, not process rc.
+- **M6**: add cross-launch merge/lock coordination for parallel-epic launches.
+
+### 2. Mock-provider seam (M1 scenario-2)
+
+Evidence: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', {...openai-completions...})` against a local SSE server; `omp models -e ... --json` lists `mock/mock-chat`. Proven end-to-end on real omp 18.18.5 with zero paid calls: text turn, yield envelope, read→yield tool loop, parallel tool calls, session resume, `@role` resolution, parallel processes, and `OmpHarness.run`/`complete` through a wrapper. Scenario format is `{turns: [{text}|{toolCalls}|{yield}]}` with optional `usage`/`finishReason` and top-level `match`/`onExhausted`; error turns are not probed.
+
+FollowUps:
+- **M8**: add `extraArgs`/`mockProvider` to `OmpHarness`; implement `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`, gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate, assert only `mock/mock-chat` requests and `usage.costUsd === 0`.
+- **M4**: use the seam for the preflight real-turn validation.
+
+### 3. Cache keying (M1 scenario-3)
+
+Evidence: omp 18.18.5 keys the prompt cache by request-prefix **content**, not by file path. Identical bytes at a changed system-prompt path still fully hit; a model switch is a full cold read (measured ≈8.9× warm). TTL expiry (Anthropic 5m) causes a cold read; long retention was verified separately. Compaction rewrites history and makes the next resume cold from the cut point. The factory currently detects none of these signals and pins none of the cache/compaction/memory knobs; the manual `-p "/compact"` path exists but its cost is absent from NDJSON.
+
+FollowUps:
+- **M7**: extend usage accounting with `cacheReadTokens`/`cacheWriteTokens`/`totalTokens`/`cacheTtl`/provider/model/reasoning fields; add a per-session cache-state record; record the resolved model used by the successful turn and pass that literal model on resume; pin `providers.cache*`, `compaction.*`, `snapcompact.*`, and `mnemopi.autoRecall/autoRetain` in the overlay; measure long-vs-short retention and fresh-brief-vs-warm-compaction on the self-host fire test; add a mock-provider cache fixture.
+- **M4**: validate effective overlay values (not `--version`) and read back performance-relevant settings in preflight.
+
+### 4. Repo-rules injection (M1 scenario-4)
+
+Evidence: root omp sessions discover and inject repo context/rules into a trailing `<repo-rules>` footer; `--system-prompt` replaces block 0 only. The current factory has no double injection because role prompts contain no repo-rule text. Copying rules into role prompts or append prompts double-injects (2 sentinel copies). omp `task` subagents drop `AGENTS.md` but keep `RULES.md` and `contextFiles.extra`. User-level `APPEND_SYSTEM.md`, `AGENTS.md`, and `RULES.md` leak into roles unless isolated or suppressed; only an explicit empty `--append-system-prompt=` suppresses the append file. Resume re-discovers repo rules each process, while the static block-0 prefix stays stable.
+
+FollowUps:
+- **M4**: replace the preflight `--config --version` no-op using the mock-provider real-turn recipe.
+- **M8**: keep omp as sole injector for root roles; implement `RULES.md`/`contextFiles.extra` (or delegation context) for scouts; add sentinel-based per-role request-body tests; choose and enforce the user-level contamination policy; keep factory launches at worktree roots because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
+
+## Iteration-2 follow-up index
+
+| Milestone | Follow-up | Source |
+|---|---|---|
+| M3 | omp workspace backend + `isolation: engine` fallback + config surface + unchanged branch/merge ownership | `omp-3-isolation.md` §7/§9/§10; decision 002 |
+| M4 | preflight version/key/enum/catalog checks + one real isolated round trip; status/gc from git records; transcript-based outcome | `omp-3-isolation.md` §5/§10, `omp-5-cache-keys.md` §9.5, `omp-6-repo-rules.md` §6; decisions 001/002 |
+| M6 | cross-launch merge/lock coordination for parallel epics; per-epic workspace isolation | `omp-3-isolation.md` §10 |
+| M7 | cache/compaction usage plumbing, session cache-state, literal model on resume, overlay pins, retention measurement, mock cache fixture | `omp-5-cache-keys.md` §9/§10/§11 |
+| M8 | scripted mock-provider helper + `extraArgs`; repo-rules hydration/sentinel tests; user-level isolation policy; no-model e2e and use-case docs | `omp-4-mock-provider.md` §M8/decision, `omp-6-repo-rules.md` §6/§7 |
+
+## Review polish ledger
+
+Applied only where the note corrected evidence (no new probes invented):
+
+- **Isolation** — probe 26 corrected: in-base explicit-path worktrees are listed by `worktree list --json` when `OMP_WORKTREE_DIR` is aligned; outside-base trees are invisible; live trees are never reported as orphans. Probe 18 softened: invalid backend overlay is accepted, but `config get` ignores `--config` overlays, so runtime coercion is unproven. Retention matrix scoped to single-host omp 18.18.5/ext4/WSL2.
+- **Cache** — spec source fixed to `docs/factory.v2.md:114-120`; `tokensAfter`/`method` attributed to the transcript `compaction` entry rather than the NDJSON result; long/none retention probes qualified as YAML-only artifacts; dead `steps/architect-resume` fragment noted while keeping the byte-diff evidence valid.
+- **Repo rules** — worktree-root cwd invariant documented because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
+- **Mock provider** — the `test/e2e/` split is retained and justified: it separates the no-model scripted suite from paid live coverage and matches the M8 plan's directional interface. The optional raw-NDJSON-excerpt and unprobed-error-turn notes remain disclosed limitations, not re-probed here.
+
+## Verification
+
+- All five recovery outputs exist and each spike doc contains a findings section plus probe evidence/log and recommendations/M8 sections (see the recovered-docs table).
+- Source records were read with `git show <branch>:<path>`; no branch was checked out.
+- No production code changed. No engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`, `decisions/`) was modified; the only orchestration-folder write is this item's assigned deliverable `items/spike-findings-recovery/RECOVERY.md`.
diff --git a/plugins/software-factory/docs/spikes/omp-3-isolation.md b/plugins/software-factory/docs/spikes/omp-3-isolation.md
new file mode 100644
index 0000000..fcc0b75
--- /dev/null
+++ b/plugins/software-factory/docs/spikes/omp-3-isolation.md
@@ -0,0 +1,123 @@
+# Spike omp-3: omp isolation mechanics + backend decision
+
+- omp 18.18.5 (`omp/18.18.5`), WSL2 Linux, ext4 (no FICLONE)
+- Throwaway `--profile spk-*`; mktemp repos per run
+- Prior: omp-1-topology.md:189-215, omp-2-cli-adapter.md
+
+## 1. isolation.backend values
+
+`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy` (default auto). `config set <enum> __invalid__` prints `Valid values: ...` and exits nonzero. Trial overlays set each value then ran `omp worktree add`: all rc=0, all fell back to plain checkout with FICLONE warning on ext4. Backend = clone mechanism only; verify with a round-trip.
+
+## 2. Retention matrix
+
+| Mechanism | Success | Fail | Abort (SIGKILL) |
+|---|---|---|---|
+| worktree add + --cwd | commit on topic branch; parent clean | staged partial retained | untracked partial + branch + registration retained |
+| isolated patch apply=false | .patch retained, parent clean | .patch preserved | — |
+| isolated branch apply=false | omp/task/<Agent> + commit | branch preserved with partial commit | total loss |
+| isolated branch apply=true | single-parent commit, branch deleted | failures preserve | — |
+
+Single-host scope: these retention results are from omp 18.18.5 on ext4/WSL2; treat abort/SIGKILL retention as host-specific until re-probed elsewhere.
+
+`commits=generic` → `<AgentId>`; `commits=ai` → `chore: add ...`. No `omp isolated-task` CLI; failing turns exit rc=0.
+
+## 3. Root-process mapping
+
+`worktree.onStart/onExit/cleanSource` and `/wt` are interactive-only. Factory root process: `omp worktree add -b <topic/*> <path> <base> -C <repo>` (OMP_WORKTREE_DIR) then `omp --cwd <path> -p`. `omp worktree list --json` lists in-base explicit-path worktrees when `OMP_WORKTREE_DIR` is aligned (kind `pr-checkout`); outside-base trees are invisible. `omp worktree clear --dry-run` correctly reports no orphans for live trees; `--all --dry-run` lists them. Status/gc use `git worktree list` + records.
+
+## 4. task.isolation vs engine merge
+
+omp apply/merge/commits are per-subagent capture preferences ending in a retained artifact or a single-parent auto-commit (no gates). Engine merge-path.ts adds merge locks, parent-into-child trial, integrate agent, gates/target-green, --no-ff merge, worktree removal with branch kept, hooks, journaling. Keep engine merges.
+
+## 5. Preflight
+
+Free: version ≥18.18.5; unknown-key oracle config get rc=1; enum oracle config set invalid; models find + modelRoles; repo state. Real turn: mktemp repo, one -p turn spawning isolated marker subagent apply:false, assert patch/branch artifact, cleanup. ~16s cheapest.
+
+## 6. Overlay gaps (c-477404c672)
+
+Bogus key → BADKEY_OK rc=0; invalid backend overlay is accepted, but `config get` ignores `--config` overlays so runtime coercion is unproven (probe 18 softened); missing overlay → --version succeeds. Current preflight.ts:364-394 validates nothing about content; replace with schema check + real turn.
+
+## 7. Decision
+
+isolation: omp by default (engine fallback kept): omp creates/clones worktrees and optionally captures subagent work; engine owns branches, merges, gates, commits, gc, records.
+
+## 8. Probe-command log
+
+Throwaway `--profile spk-*`, `mktemp`-isolated repos; paid turns on cheapest catalog model `alibaba-token-plan/deepseek-v4-flash-0731` (~10 turns).
+
+| # | Probe | Command (abridged) | Result |
+|---|-------|-------------------|--------|
+| 1 | version/help | `omp --version; omp --help` | `omp/18.18.5`; no `task`/`isolated-task` command |
+| 2 | schema | `omp config list --json` filtered | 9-value backend; task.isolation keys present |
+| 3 | fresh defaults | `config get <key>` ×10 | backend auto, enabled false, apply true, merge patch, commits generic, onStart off, onExit keep, clone true, base unset |
+| 4 | enum oracle | `config set <key> __invalid__` | backend 9 values; merge `patch,branch`; commits `generic,ai` |
+| 5 | backend trial ×9 | `config set isolation.backend $b` + `worktree add -b t-$b $BASE/wt-$b HEAD -C $R` | all rc=0, all FICLONE fallback to plain checkout, 9 branches/worktrees |
+| 6 | --cwd success | turn creates+commits `TURN_OK.txt` | `DONE`; wt log `1d958ca spike: turn ok`; parent untouched |
+| 7 | --cwd failure | stage `FAIL_PARTIAL.txt`, then eval-throw | process rc=**0** despite in-turn error; `A FAIL_PARTIAL.txt` retained; parent untouched |
+| 8 | --cwd SIGKILL | SIGKILL after `KILL_PARTIAL.txt` appears | `?? KILL_PARTIAL.txt` retained; branch+worktree registration intact |
+| 9 | isolated success patch | eval `agent(...,{isolated:true,apply:false})` | `Captured at .../omp-eval-agent-<id>/UpsetMongoose.patch (apply=false). Not applied.` |
+| 10 | isolated success branch | same, `merge=branch` | `omp/task/ParentalPelican` = `e10e903 ParentalPelican`; parent clean |
+| 11 | isolated failure branch | subagent stages file then throws `SUB_FAIL` | wait rejects BUT `Captured branch preserved as omp/task/PoliteOrangutan` with `ISO_FAIL.txt` |
+| 12 | isolated failure patch | creates file then throws `SUB_FAIL2` | `Captured patch preserved at .../RevolutionaryCentipede.patch` |
+| 13 | isolated success apply | `apply:true` | parent main gains single-parent `68e5586 DecentAnaconda`; branch deleted |
+| 14 | parent abort | SIGKILL parent during isolated `sleep 120` | no branch, file, or worktree entry; output lost |
+| 15 | commits=ai | branch capture with `commits=ai` | `chore: add iso_ai_msg.txt file` vs generic `<AgentId>` |
+| 16 | overlay accepted | `--config overlay.yml` + real turn | `OVERLAY_OK` rc=0 |
+| 17 | bogus overlay key | `task.isolation.noSuchKey: true` + real turn | silently ignored: `BADKEY_OK` rc=0 |
+| 18 | invalid backend overlay | `isolation.backend: __invalid__` | accepted by `--version`; **coercion unproven** — `config get` ignores `--config` overlays |
+| 19 | role resolution + | `--model @probe-role` + real turn | `ROLE_OK` rc=0 |
+| 20 | role resolution − | `--model @no-such-role-xyz` | `Model ... not found`, rc=1, no spend |
+| 21 | bogus model | `--model bogus-provider-xyz/...` | `Model ... not found`, rc=1, no spend |
+| 22 | catalog lookup | `models find deepseek-v4-pro --json` | free selector/provider/thinking metadata |
+| 23 | cheapest preflight | one `-p` turn spawning isolated marker subagent, `apply:false` | `PF_RESULT:...DustyBeetle.patch`, **15.6s**; bare no-op turn 5.2s |
+| 24 | onStart scope | `worktree.onStart=create` + `-p` turn | no worktree; stayed in `$R`, only main |
+| 25 | add w/o path | `omp worktree add -C $R` | `Error: Missing required argument: path` |
+| 26 | gc listing | `worktree list --json`, `clear --dry-run` | in-base explicit paths listed when `OMP_WORKTREE_DIR` aligned; outside-base invisible; live trees never reported as orphans |
+| 27 | bad key/missing overlay | `config get no.such.key`; `--config /tmp/missing --version` | unknown key rc=1; missing overlay silently ignored (18.18.5, rc=0) |
+
+Probe excerpts:
+
+```text
+$ omp --profile $P config set isolation.backend __invalid__
+Error: Invalid value: __invalid__. Valid values: auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy
+
+$ omp worktree add -b t-auto $BASE/wt-auto HEAD -C $R
+Preparing worktree (new branch 't-auto')
+HEAD is now at eb6c019 init
+warning: worktree clone fell back to plain checkout: git worktree add: FICLONE unsupported ... (os error 95)
+
+Isolation: changes captured on branch `omp/task/ParentalPelican` (apply=false). Not merged.
+Error: SUB_FAIL ... Captured branch preserved as omp/task/PoliteOrangutan.
+"Merged branch: omp/task/DecentAnaconda"   # parent 68e5586, single parent b9e032f
+```
+
+## 9. Draft isolation config surface
+
+```yaml
+workspaces:
+  isolation: omp              # omp | engine (default omp)
+  omp:
+    backend: auto             # isolation.backend enum (9 values)
+    worktreeClone: true       # worktree.clone (clone-first, fallback ok)
+    cleanSource: false        # worktree.cleanSource (interactive /wt only)
+    onStart: off              # informational: no effect on -p turns
+    onExit: keep              # informational: no effect on engine worktrees
+    baseDir: null             # worktree.base / OMP_WORKTREE_DIR; null = ~/.omp/wt
+    worktreeScope: repo       # session.worktreeScope
+    taskIsolation:
+      enabled: true           # gate for isolated:true subagents
+      apply: false            # engine merges; never auto-apply
+      merge: branch           # branch (auditable) | patch (lightweight)
+      commits: generic        # generic (agent-id stub); ai = harness-invented
+```
+
+Overlay additions (extends `overlay.ts:51-85`): `isolation: { backend: <workspaces.omp.backend> }` and `task: { isolation: { enabled, apply, merge, commits } }`. The overlay cannot express `worktree.*` path/base per run; pass `-C`/`--cwd`/`OMP_WORKTREE_DIR` instead.
+
+## 10. Recommendations / follow-ups
+
+- Implement `workspaces.isolation: omp|engine` plus the omp backend/worktree/task.isolation config surface above.
+- Replace the preflight `omp --config --version` check (`preflight.ts:364-394`) with key/enum/catalog validation and one real isolated round-trip turn (probe 23).
+- Classify turn outcome from the `--mode json` transcript, not process rc (probe 7).
+- Derive gc/status from `git worktree list` + records; document the omp `worktree list` blind spot for outside-base trees (probe 26).
+- Add cross-launch merge/lock coordination for the parallel-epic saga.
+- Add a scripted mock model provider for no-models e2e tests (see `omp-4-mock-provider.md`).
diff --git a/plugins/software-factory/docs/spikes/omp-4-mock-provider.md b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
new file mode 100644
index 0000000..9cfe4d0
--- /dev/null
+++ b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
@@ -0,0 +1,133 @@
+# Spike: scripted mock provider seam for real omp (M1)
+
+Status: ok. Environment: omp/18.18.5 (`omp/18.18.5`), Bun 1.4.4, Linux x64 WSL2. Throwaway profiles and temp dirs; zero paid-model calls.
+
+## Verdict
+
+Chosen seam: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', { api: 'openai-completions', baseUrl: 'http://127.0.0.1:<ephemeral>/v1', apiKey: 'mock-key', models: [{ id: 'mock-chat', name: 'Mock Chat', api: 'openai-completions', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] })`, backed by a local OpenAI-compatible SSE server.
+
+Scenario format: `{turns: [...]}`; each turn is one assistant/model response (one HTTP POST):
+- `{text: '...'}` text, finish stop, ends the agent turn.
+- `{toolCalls: [{name, arguments}, ...]}` executes tools; next POST consumes next turn.
+- `{yield: {data: ...}}` emits terminal `yield`; observed no further provider request.
+Optional per-turn `usage`, `finishReason`; optional top-level `match`, `onExhausted`.
+
+Proven: catalog listing (`omp models -e ... --json` -> `mock/mock-chat`); real text turn; yield envelope; read->yield tool loop; two parallel tool calls; session resume; @role resolution via `--config` modelRoles; parallel processes; OmpHarness.run and complete.
+
+Ruled out: `--config` is a settings overlay, not a provider registry. `providers:` in `--config` was ignored; `omp models --config cfgprov.yml` did not list it. `models.yml` in a temp agent dir works (second choice).
+
+## Probe log
+
+P1 `omp --version` -> `omp/18.18.5`; help has `-e`, `--config`, `--profile`, `--mode json`, `--no-session`, `--tools`.
+P2 extension API: `typeof pi.registerProvider === 'function'`; `pi.pi` exposes `createAgentSession`, `runSubprocess`, `AgentSession`, `SessionManager`.
+P3 `omp --profile ... models -e mock-provider.ts --json` -> selector `mock/mock-chat`, kind chat, cost 0.
+P4 root-level `omp -e ... models` did not load the extension; place `-e` after `models`. Root-level `-e` works for `-p` sessions.
+P5 text turn: exit 0; text `MOCK_OK`; usage `input:123, output:6, totalTokens:129, cost.total:0`; `agent_end` `isTerminal:true, yielded:true`.
+P6 yield turn: exit 0; one POST; `tool_execution_start` args `{data:{status:'OK',count:42}}`; `tool_execution_end` result `details.data` identical; `turn_end` `stopReason:'toolUse'`; `agent_end`.
+P7 read then yield: 2 POSTs; second request includes `role:'tool'` result.
+P8 two reads in one response: 2 tool results then yield.
+P9 resume: first process text `TURN1_TEXT`; second `--resume <id>` sends `system,user,assistant,user`, prior text present; yield `{resumed:true}`.
+P10 parallel: two profiles/servers; both exit 0; one POST each.
+P11 role overlay `modelRoles: {probe: mock/mock-chat}` + `--model @probe` -> wire model `mock-chat`, exit 0.
+P12 SSE usage `prompt_tokens:100, cached_tokens:40, completion_tokens:5` -> usage `input:60, output:5, cacheRead:40, totalTokens:105`; cost computed from model rates.
+P13 OmpHarness.run with wrapper `exec omp -e ext "$@"` -> `ok:true`, data `{status:'OK',via:'OmpHarness'}`, usage 111/9, costUsd 0, toolCallCount 1.
+P14 OmpHarness.complete -> `{status:'OK',answer:42}`.
+P15 models.yml via `PI_CODING_AGENT_DIR=<tmp>` -> `fileprov/file-model`; named profile works when file is at `omp config path`; absolute `PI_CONFIG_DIR=/tmp/...` was resolved under `$HOME/tmp` in 18.18.5, so verify.
+P16 `--config` providers block ignored.
+P17 preflight no-op: `omp --config /tmp/no-such-overlay.yml --version` prints version and exits 0; real `omp --config <missing> -p ...` exits 1 `Config overlay not found`; `models --config <missing>` exits 1.
+
+## NDJSON contract (omp 18.18.5)
+
+`omp --mode json` emits one JSON object per line. Text turn sequence: `session`, `agent_start`, `turn_start`, user `message_start`/`message_end`, assistant `message_start` (usage zeros), `message_update` (`text_start`/`text_delta`/`text_end`), assistant `message_end` (real usage), `turn_end` (message + toolResults), `agent_end` (`messages`, `isTerminal:true`, `yielded:true`). Tool turn adds `tool_execution_start`/`tool_execution_end`, a `toolResult` message, and if non-terminal, another provider POST.
+
+Usage fields: `turn_end.message.usage` has `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.{input,output,cacheRead,cacheWrite,total}`. `message_start.usage` is zeroed. `cacheRead` comes from `prompt_tokens_details.cached_tokens`; `input` = `prompt_tokens - cached_tokens`; cost from model cost rates. `agent_end.yielded` is true even for text-only turns, so not a yield signal.
+
+Yield envelope: yield data appears in `turn_end.message.content[].toolCall.arguments.data`, `agent_end.messages[].content[].toolCall.arguments.data`, `tool_execution_start.args.data`, and `tool_execution_end.result.details.data` (parser `ndjson.ts:73-142`). Yield is terminal: one POST, no follow-up. Parser references: `src/harness/omp/ndjson.ts:52-150`.
+
+## Scenario format
+
+```jsonc
+{
+  'name': 'developer-writes-and-yields',
+  'match': { 'model': 'mock-chat', 'systemContains': 'Developer', 'promptContains': 'implement' },
+  'onExhausted': 'error',
+  'turns': [
+    { 'toolCalls': [{ 'name': 'write', 'arguments': { 'path': 'src/hello.ts', 'content': 'export const hello = 1;\n' } }], 'usage': { 'input': 1200, 'output': 40, 'cacheRead': 800 } },
+    { 'yield': { 'data': { 'status': 'done', 'summary': 'added hello' } }, 'usage': { 'input': 1500, 'output': 20, 'cacheRead': 1400 } }
+  ]
+}
+```
+
+Types: `UsageSpec` {input?,output?,cacheRead?,cacheWrite?,cost?}; `ToolCallSpec` {name,arguments,id?}; `Turn` = text | toolCalls | yield | error {status?,message}; `Scenario` {name?,match?,onExhausted?,turns}. Semantics: sequential per server; one POST per turn; toolCalls continue; yield terminates; text ends; `onExhausted` default error or repeatLast; `match` assertions fail with 500; resume cursor keyed by session id/label. Error turns optional, not probed.
+
+## M8 integration
+
+OmpHarness currently hard-codes args without `-e` (`harness.ts:368-388`, `:707-715`). Proven wrapper: `#!/bin/sh; exec /home/slava/.bun/bin/omp -e /tmp/mock-provider.ts "$@"` passed as `ompBinary`; both run and complete succeeded. Recommended: add `extraArgs`/`mockProvider` to OmpHarness. Proposed `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`; gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate. Select scenario by `run.label` (like `FakeHarness.scriptOutcome`). Use per-test ephemeral port/profile or `PI_CODING_AGENT_DIR`, `--no-session`, `--no-extensions -e mock-ext`, explicit `mock/mock-chat`; assert request log only mock-chat and `usage.costUsd === 0`. The `test/e2e/` split keeps the no-model scripted suite separate from the paid `test/harness/smoke-live.test.ts` and matches the M8 plan's directional interface.
+
+## Recommendations
+
+- Adopt the extension `-e` + `pi.registerProvider` + local SSE seam as the canonical no-paid-model provider; keep `models.yml` in a temp agent dir as the fallback.
+- Add `extraArgs`/`mockProvider` to `OmpHarness` and implement the scripted suite under `test/e2e/mock-provider/`.
+- Gate the suite with `FACTORY_E2E_OMP=1`, keep paid live tests under `FACTORY_LIVE_OMP=1`, and assert zero-cost usage and mock-only request logs.
+- Replace the preflight `--config --version` check with a real mock turn and add an omp version floor.
+
+## Decision YAML
+
+```yaml
+status: accepted
+decision: >
+  Adopt the omp extension provider seam: per-process `-e mock-provider.ts` calls
+  `pi.registerProvider('mock', {... openai-completions ...})` against a local scripted SSE server.
+  Scenarios are `{turns: [{text}|{toolCalls}|{yield}]}`; one turn per provider request; toolCalls continue,
+  yield terminates. Use an OmpHarness wrapper now; add `extraArgs`/`mockProvider` in M8. Keep
+  `models.yml` in a temp agent dir as fallback; `--config` is only for settings/modelRoles.
+evidence:
+  - 'omp/18.18.5; omp models -e mock-provider.ts --json lists mock/mock-chat (P3).'
+  - 'Real text turn MOCK_OK, usage 123/6, cost.total 0 (P5).'
+  - 'Yield turn details.data {status:OK,count:42}, stopReason toolUse, agent_end (P6).'
+  - 'Tool loop and two parallel tool calls then yield (P7/P8).'
+  - 'Resume sees prior TURN1_TEXT and yields (P9).'
+  - 'OmpHarness.run and complete pass with mock wrapper, cost 0 (P13/P14).'
+  - 'Parallel profiles/servers both exit 0 (P10).'
+  - 'Preflight --config ... --version exits 0 with missing overlay (P17).'
+followUps:
+  - 'M8: add extraArgs/mockProvider; implement test/e2e/mock-provider.'
+  - 'M8: gate FACTORY_E2E_OMP=1; keep FACTORY_LIVE_OMP=1 separate.'
+  - 'Replace preflight --version overlay check with omp models --config or a real mock turn; add version floor.'
+  - 'Pin/minimum omp version; re-run spike on upgrade.'
+  - 'Persist scenario cursor by session id for resume/restart.'
+alternatives:
+  - 'models.yml custom provider (works; second choice).'
+  - '--config providers block (ignored).'
+  - 'Built-in Ollama/LM Studio (requires local runtime).'
+  - 'FakeHarness/mock binary (not real omp).'
+```
+
+## Risks / concern cross-check
+
+- Preflight overlay validation no-op confirmed (`c-477404c672`): `preflight.ts:383-385` uses `--version`; missing overlay exits 0; real session exits 1. High risk 19.1/19.2.
+- OmpHarness no extra-args seam: wrapper works but add `extraArgs`/`mockProvider`; medium, 19.8.
+- Flag placement: `-e`/`--config` after `models` for catalog; root-level for sessions.
+- `PI_CONFIG_DIR` absolute path resolved under `$HOME` in 18.18.5; use `PI_CODING_AGENT_DIR`/real profile and verify `omp config path`.
+- `agent_end.yielded` true for text-only; use yieldData.
+- `models.yml` works with temp `PI_CODING_AGENT_DIR`; named-profile caveat is path resolution.
+- `c-aaebfb4099` out of scope; parallel mock probing is safe but doesn't address epic lock/merge.
+- `c-ba416d7313` disproved: zero-paid real-omp mock path exists.
+
+## Sources
+
+- `docs/factory.v2.md:104-113`
+- `plugins/software-factory/docs/ARCHITECTURE.md:40`
+- `plugins/software-factory/src/cli/preflight.ts:365-394`
+- `plugins/software-factory/src/harness/omp/harness.ts:368-388`, `:525-570`, `:707-715`
+- `plugins/software-factory/src/harness/omp/ndjson.ts:52-150`
+- `plugins/software-factory/src/harness/omp/overlay.ts:26-86`
+- `plugins/software-factory/src/harness/fake/fake-harness.ts:8-51`
+- `plugins/software-factory/docs/spikes/omp-1-topology.md:55-104`
+- `plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110`
+- `plugins/software-factory/test/harness/smoke-live.test.ts:9-81`
+- https://omp.sh/docs/extensions
+- https://omp.sh/docs/models
+- https://omp.sh/docs/providers
+- https://omp.sh/docs/extension-loading
+- https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
diff --git a/plugins/software-factory/docs/spikes/omp-5-cache-keys.md b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
new file mode 100644
index 0000000..acc48fb
--- /dev/null
+++ b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
@@ -0,0 +1,308 @@
+# Spike: prompt-cache keying + compaction/warming audit
+
+Status: complete (M1 / `spike-cache-key`)
+Harness: `omp/18.18.5` on Linux x86_64 WSL2; factory checkout `plugins/software-factory`; live probes used throwaway `/tmp` dirs and throwaway session dirs (no production paths edited).
+
+## 0. Verdict (answers the M1 cache-key scenario)
+
+**OMP prompt caching is content-keyed, not path-keyed.**
+
+- A changed system-prompt *path* with byte-identical content still produced a full cache hit: DeepSeek `cacheRead=11,392` (T3 below); Anthropic `cacheRead=6,703` (A-T2 below).
+- A new prompt-file *path* on every turn did not break resumed-turn caching: Anthropic `cacheRead=29,363` on a resume whose prompt file path differed from the previous turn.
+- A one-byte system-prompt content change (appended newline) produced `cacheRead=0` (DeepSeek T3, `input=13,266`).
+- Tools change produced a partial miss (`cacheRead=2,432` of a prior `4,480`); thinking-level change and model switch produced full misses (`cacheRead=0`).
+- A 330-second gap on Anthropic `short` retention produced `cacheRead=0`, `cacheWrite=38,022` (cold).
+- A brand-new session with the same system prompt/tools reused the system-prompt prefix from the provider cache (`cacheRead=4,224`), so a fresh session is not inherently a full cold read.
+
+**Consequence for the factory:** the transport's random prompt filename is safe; the cached prefix is the system-prompt bytes + tool specs + model/thinking identity + conversation history. The real cold-resume triggers are: system-prompt content change, tools change, model/thinking change, cache-retention/TTL change/expiry, and compaction. The current factory does not detect any of these (see §5) and does not pin the knobs (see §6).
+
+## 1. Method
+
+- Transport audit (no model calls): ran `OmpHarness.run()` four times (fresh ×2, resume ×2) with `OMP_PATH` pointed at a throwaway shim that logged argv and copied the `--system-prompt`/`-p @file` inputs. Same rendered `steps/architect-resume` prompt, same `PipelineConfig`, same runtime dir, same synthetic session id. Note: `IMPLEMENTATION.md` flags the `steps/architect-resume` fragment as dead, but the harness mechanism is identical (`harness.ts:286-350,368-389`), so the byte diffs remain valid; re-run against a live fragment for the M2 baseline.
+- Live probes: real `omp -p --mode json` turns against `opencode-go/deepseek-v4.1-flash:max`, `opencode-go/muse-spark-1.3-contributor:max`, and `anthropic/claude-haiku-5-5:max`, using the factory's generated overlay plus the actual architect system prompt (`agents/architect.md` body). Unique `--session-dir`/`--cwd` per probe family under `/tmp`; `--max-cost 0.10` per turn. Aggregate live spend ≈ **$0.05**.
+- All probe dirs are throwaway (`/tmp/spike-cache-key-*`); no repo file was written.
+
+## 2. Transport render audit (byte/argv diff)
+
+Source under audit: `src/harness/omp/harness.ts:286-350` (prompt materialization), `src/harness/omp/harness.ts:368-389` (argv), `src/harness/omp/overlay.ts:26-100` (overlay).
+
+| Run pair | System-prompt bytes | System-prompt path | Prompt bytes | Prompt path | Argv |
+|---|---|---|---|---|---|
+| fresh-1 vs fresh-2 | identical, sha256 `cb92bbcaafd7bfa7b52413cc9a75cd58985c4e22b21b9984a60733a9f177c93a` | identical `.../system-prompts/architect-fresh.md` | identical, sha256 `4a9d87d474be6638f4c5b1bc4655622baa7566e9e91935bc12aa136c6cec6d88` | **different** `prompt-1794267999675-k2y1.txt` vs `prompt-1794267999746-1jly.txt` | identical except `-p @<path>` |
+| resume-1 vs resume-2 | identical | identical `.../system-prompts/architect-spike-session-fixed.md` | identical | **different** | identical except `-p @<path>` |
+| fresh vs resume | identical | **different** (`fresh` vs sanitized session id) | identical | different | resume adds `--resume spike-session-fixed` |
+| overlay generated twice | — | — | — | — | identical YAML, 1,472 bytes, sha256 `6ebf5894b6aaa2123b1cc3030555c3f5e61562751a2e332ef4b5d5b96e739f53` |
+
+Exact fresh argv (captured; resume adds `--resume spike-session-fixed` after `--session-dir`):
+
+```text
+--cwd /tmp/spike-cache-key-0c1ojol5/cwd
+--config /tmp/spike-cache-key-0c1ojol5/runtime/omp-overlay.yaml
+--mode json
+--model @architect
+--session-dir /tmp/spike-cache-key-0c1ojol5/runtime/sessions
+--tools=read,grep,glob
+--system-prompt /tmp/spike-cache-key-0c1ojol5/runtime/system-prompts/architect-fresh.md
+-p @/tmp/spike-cache-key-0c1ojol5/runtime/prompts/prompt-1794267999675-k2y1.txt
+```
+
+Findings:
+
+- System prompt is `extractAgentBody(run.definition)` written to `${agent}-${sessionKey}.md`; `sessionKey` is `fresh` or the sanitized resume id (`harness.ts:293-300`). Content is byte-stable per agent definition and path is deterministic per agent+session. The fresh→resume transition changes the path but not the bytes.
+- Prompt is written to `prompt-${Date.now()}-${random4}.txt` (`harness.ts:311-316`), so the path is unique every turn and the argv differs only there. Prompt **content** is byte-identical when the same fragment/vars are rendered.
+- Overlay is regenerated from the effective pipeline every run (`harness.ts:225-240`) and is byte-stable for identical config; it contains only `modelRoles`, `retry`, `eval`, `title`, `checkpoint`, `advisor`, `bash`, `mnemopi` (three linking flags), and `update` (`overlay.ts:51-85`). It pins **none** of `providers.cache*`, `compaction.*`, `snapcompact.*`, or `mnemopi.autoRecall/autoRetain`.
+- omp wraps the `@file` argument into the user message as `<file name="/abs/path">…</file>` (observed in `message_start`/`message_end` and the session JSONL). Therefore the *new* user message is not byte-identical when the same logical prompt is re-rendered to a different path. This does not break the prior cached prefix (the wrapper is appended at the end), but it means the transport is not byte-reproducible for retries. A content-addressed prompt filename (e.g. `prompt-<sha256>.txt`) would fix that; it is not required for cache hits.
+
+## 3. Live resume probe log
+
+All rows are `turn_end.message.usage`; `totalTokens = input + output + cacheRead + cacheWrite` in every observed row. `input` is *uncached* input (Anthropic reports `input=4` while writing/reading tens of thousands of cached tokens).
+
+### 3.1 Path / model / content probes (opencode-go DeepSeek, 1M context, implicit cache)
+
+| Probe | Input | cacheRead | cacheWrite | total | Cost USD | Interpretation |
+|---|---:|---:|---:|---:|---:|---|
+| D-T1 fresh (architect-resume prompt) | 9,060 + 478 + 1,515 | 0 + 8,960 + 9,344 | 0 | 9,318 / 9,717 / 11,390 | 0.001514 + 0.000266 + 0.000574 = **0.002354** | first request cold; intra-turn tool-loop requests cache |
+| D-T2 resume, same system-prompt path, new prompt path | 677 | 10,752 | 0 | 11,439 | **0.000140** | new prompt path is harmless |
+| D-T3 resume, **system-prompt path changed**, same bytes | 86 | 11,392 | 0 | 11,481 | **0.000049** | path is not in the key |
+| D-T4 resume, prompt path reused, content changed | 130 | 11,392 | 0 | 11,586 | **0.000092** | path reuse gives no extra hit; prior prefix still hits |
+| D-T5 resume, **model switched** to `opencode-go/muse-spark-1.3-contributor:max` | 11,082 | 0 | 0 | 11,775 | **0.001247** | model switch is a full cold read (≈8.9× D-T2) |
+
+### 3.2 Content / tools / thinking invalidations (clean 2-turn sessions, DeepSeek)
+
+| Scenario | T1 input | T2 input | T2 cacheRead | Result |
+|---|---:|---:|---:|---|
+| Control (same system prompt, same tools, same thinking) | 4,505 | 90 | 4,480 | near-full warm hit |
+| System prompt + one appended newline (same path) | 4,585 | 13,266 | 0 | full miss |
+| Tools `read,grep,glob` → `read,grep,glob,bash` | 4,585 | 2,719 | 2,432 | partial miss (tools are in the prefix) |
+| Thinking `:max` → `:high` (same model id) | 4,585 | 4,681 | 0 | full miss |
+
+Anthropic confirms path invariance: A-T1 fresh `input=4`, `cacheWrite=6,703`; A-T2 resume with a **different system-prompt path and identical bytes**: `input=4`, `cacheRead=6,703`, `cacheWrite=342`, cost $0.000143 (vs $0.00098 fresh).
+
+### 3.3 TTL expiry (Anthropic short/5m)
+
+| Turn | Input | cacheRead | cacheWrite | cttl | Cost USD |
+|---|---:|---:|---:|---|---:|
+| T1 fresh (2 requests) | 4 + 2 | 0 + 15,501 | 15,501 + 13,862 | `ephemeral5m` | 0.008491 + 0.006040 |
+| T2 resume ~1 min after T1 | 4 | 29,363 | 8,359 | `ephemeral5m` | **0.001454** |
+| T3 resume 330 s after T2 | 4 | **0** | **38,022** | `ephemeral5m` | **0.004767** |
+
+330 s is past the 300 s short TTL; the cold resume cost 3.3× the warm resume. Long retention was verified separately: `providers.cacheRetention: long` produced `cttl: {ephemeral1h: 6,705}`.
+
+`providers.cacheRetention: none` on a single fresh request produced `input=4,510`, `cacheRead=2,256`, `cacheWrite=24`, `cttl: {ephemeral5m: 24}` — i.e. omp stopped requesting explicit retention, but the provider still served an implicit cached prefix (the default base prompt) from an earlier identical request. `none` is therefore not a guarantee of zero cacheRead; it does reduce explicit write cost for single-request turns.
+
+### 3.4 Cross-session reuse
+
+A brand-new session in a new cwd with the same architect system prompt/tools/prompt shape produced `input=207`, `cacheRead=4,224`, `cacheWrite=0` — the system-prompt prefix was reused across session ids. Content, not session id, is the key (omp may still use session ids for provider routing affinity, but it is not a hard cache-key component for this provider).
+
+### 3.5 Memory-recall caveat (important)
+
+The session JSONL records `custom/system-prompt-digest` entries. With no recalled memories the digest of the same architect body was `a94d3680ec1c75cf` across different paths, cwds and session ids. With `mnemopi.autoRecall` returning a prior turn, the digest changed (`a89aabcb237da3c7`, `634c40b6e2f931de`) even though the agent body was unchanged; a one-newline body change produced `1a5712bb71b370ac`. Conclusion: the digest is a content hash of the **effective** system prompt including injected memory text (not path), and omp's ambient memory can change it. The factory overlay disables `polyphonicRecall`/`enhancedRecall`/`proactiveLinking` (`overlay.ts:77-81`) but leaves `mnemopi.autoRecall` and `mnemopi.autoRetain` at their default `true`. Recalled memories are injected only into the first turn of a session (observed once per session; docs: “Recall local memories into the first turn of each session”), so resumed turns are not re-polluted, but fresh sessions in a reused cwd are non-deterministic and can recall prior task text into the system prompt — losing the cross-session system-prompt cache hit and potentially leaking context between tasks that share a worktree.
+
+## 4. What the cache key covers
+
+**Content key (confirmed):** system-prompt bytes + tool specs (ordered) + model identity + thinking level + conversation history + cache retention markers/TTL. **Not in the key (confirmed):** system-prompt file path, prompt-file path, session id (for content reuse), file mtimes.
+
+Invalidation matrix:
+
+| Change | Observed effect |
+|---|---|
+| system-prompt path changed, bytes identical | full hit (DeepSeek 11,392; Anthropic 6,703) |
+| prompt path changed every turn | full hit on prior prefix (Anthropic 29,363) |
+| prompt path reused, content changed | no extra hit; prior prefix still hits (11,392) |
+| system-prompt +1 byte | full miss (0) |
+| tools order/content changed | partial/full miss; measured 2,432 of 4,480 retained |
+| thinking level changed | full miss (0) |
+| model switched | full miss (0), ~8.9× cost |
+| 5m TTL expired (330 s gap) | full miss (0), `cacheWrite` = 38,022 |
+| new session, same system prompt/tools | system-prompt prefix hit (4,224) |
+| compaction committed | prefix rewritten; next request cannot reuse the pre-compaction prefix |
+
+## 5. Cold-resume detection signals
+
+### 5.1 Pre-launch signals (engine can act before spending)
+
+Read from the session JSONL (the engine already has its path as `meta.yaml` `traceRef`, `src/core/records/step-record.ts:96`, produced at `harness.ts:521-522`):
+
+1. **`custom/system-prompt-digest`** — 16-hex digest of the effective system prompt. Compare the latest value to the engine's own hash of the current `agentBody`; content-only (path-independent), but includes omp-injected memory text (see §3.5).
+2. **`model_change`** — resolved `model` recorded at session start. Compare to the model the current `@role` resolves to. `@role` is re-resolved on every resume (`harness.ts:318-326`), so a pipeline/role/fallback change silently switches models.
+3. **`thinking_level_change`** — recorded level; compare to the current role suffix. A change is a full miss (measured).
+4. **`cttl` + last assistant timestamp** from the newest assistant message usage (`ephemeral5m`/`ephemeral1h`). Expiry = request-send time + TTL. The transcript timestamp is completion time, so subtract a conservative margin (seconds to tens of seconds).
+5. **`compaction` entry** after the last normal turn — history was rewritten; the next resume is cold from the cut point.
+6. **`credential_pin.hash`** (optional) — provider/account affinity changed; OpenAI-style `prompt_cache_key` affinity may be lost.
+7. **Ordered tools hash and cache-retention setting** — the session does not record these; the engine must store them in its own session-state record/meta and compare. Tools change is a partial miss (measured).
+
+### 5.2 Post-hoc signals (ground truth)
+
+- `turn_end.message.usage.cacheRead` == 0 on a resumed turn with prior history ⇒ miss; `cacheWrite` ≈ prompt size ⇒ cold write. `cacheWrite` is only populated by providers with explicit cache writes (Anthropic/Bedrock; DeepSeek reports 0).
+- `turn_end.message.usage.cttl` gives the tier and cached-token count (`{ephemeral5m: N}` / `{ephemeral1h: N}`); absent for DeepSeek implicit caching.
+- `turn_end.message` also carries `api`, `provider`, `model`, `reasoningTokens`, `totalTokens` — the factory currently discards all of them.
+- RPC/SDK expose `cache_warming_start` / `cache_warming_end` with `warmingStopReason` (`refresh missed the cache`, `refresh failed`, `conversation context changed`). `-p --mode json` would include these ordinary session events if warming runs; our probes did not trigger warming (see §7).
+- `display.cacheMissMarker` and the status-line `cache` segment are **UI-only**; no `cache_miss` event appeared in `-p` NDJSON. Do not build engine detection on them.
+
+### 5.3 Records gap (blocks spec 20's “measured defaults”)
+
+`OmpNdjsonParser` reads only `u.input`, `u.output`, and `u.cost.total` (`src/harness/omp/ndjson.ts:86-99`) and returns only `inputTokens`/`outputTokens`/`costUsd` (`ndjson.ts:173-177`). `Usage` (`src/harness/types.ts:7-11`) and `StepUsage` (`src/core/artifacts.ts:545-549`) have no cacheRead/cacheWrite/totalTokens/cttl/model fields. Consequently the records cannot answer “how many tokens did the cold resume re-pay?” today — only the total cost. Extend the types and parser before choosing cost-measured defaults.
+
+Also: side requests not tied to the agent turn (`model_usage` entries in the transcript with `purpose: "unexpected-stop"`, compaction summarization) are not attributed to the step. The `-p "/compact"` probe produced no usage record at all (see §7.1).
+
+## 6. Knob audit for one-process-per-turn (`-p`) factory sessions
+
+Effective values observed with `omp config list --json` / `--scope global` on this host (omp 18.18.5): `providers.cacheRetention=short`, `providers.cacheWarming=streaming`, `provider.appendOnlyContext=auto`, `includeModelInPrompt=false`, `compaction.enabled=true`, `compaction.midTurnEnabled=true`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.experimentalContextManagement=true`, `compaction.handoffSaveToDisk=true`, `compaction.modelThresholds={anthropic/claude-haiku-5-5: "f90000", vercel-ai-gateway/minimax/minimax-m3.1-flash: 800000}`, `mnemopi.autoRecall=true`, `mnemopi.autoRetain=true`, `memory.backend=mnemopi`, `memories.enabled=false`. Several differ from the omp docs defaults: `cacheRetention` docs `auto`, `cacheWarming` docs `idle`, `experimentalContextManagement` docs `false`, `handoffSaveToDisk` docs `false`; `--scope global` proves the host layer sets them. Factory overlay precedence is above project/global (`docs/settings.md:113-123`), so pinning in the generated overlay is effective.
+
+| Knob | Docs default | Effective here | Affects `-p` one-process-per-turn? | Action for M7 |
+|---|---|---|---|---|
+| `providers.cacheRetention` | `auto` | `short` (host) | **Yes** — per-process TTL/markers; a per-turn `--config` overlay can vary it | Pin per role: architect `long` (1h) for standby gaps <1h; `short` for multi-request tool-loop agents; `none` only for known single-request turns |
+| `providers.cacheWarming` | `idle` | `streaming` (host) | `streaming` **yes** (intra-turn long tool executions); `idle` **no** (no idle scheduler in print sessions; process exits) | Pin `streaming`; do not rely on `idle`/standby warming |
+| `provider.appendOnlyContext` | `auto` | `auto` | **Yes** — keeps system prompt + tool specs + append-only log for maximum prefix hits | Keep `auto`/`on`; do not disable |
+| `includeModelInPrompt` | true in docs main; installed effective `false` | `false` | **Yes if true** — model name in the system prompt makes a model switch/fallback change the prefix | Pin `false` |
+| `display.cacheMissMarker` | true | true | **No** — TUI display only | Use usage fields instead |
+| `compaction.enabled` | true | true | **Yes** if the threshold is crossed inside a turn (mid-turn or post-turn) | Set explicit thresholds; do not rely on the default 15%/16k reserve (≈850k on a 1M window) |
+| `compaction.midTurnEnabled` | true | true | **Yes** — can rewrite history between tool-loop requests; the likely auto path in a long factory turn | Keep as overflow safety but raise `thresholdTokens` so it does not fire on normal architect turns |
+| `compaction.thresholdTokens` / `thresholdPercent` / `reserveTokens` | -1 / -1 / unset | same | **Yes** — trigger point | Pin an explicit architect budget; leave room for the next wave |
+| `compaction.methodOrder` | remote, snapcompact, handoff, shake, soft | same | **Yes** if compaction fires | Prefer `handoff`/`soft`; avoid `snapcompact` for the architect (images lose prompt caching) |
+| `compaction.asyncEnabled` | true | true | **Yes** near threshold — speculative side request inside a one-shot process | Keep or disable for deterministic cost; measure |
+| `compaction.autoContinue` | true | true | **Yes** — post-threshold continuation request; needed so the step still yields | Keep `true`; `false` would end a headless run without the agent's answer |
+| `compaction.keepRecentTokens` | 20,000 | 20,000 | **Yes** — size of retained tail after compaction | Tune to the architect brief size |
+| `compaction.supersedeReads` / `dropUseless` | true / true | true / true | **Yes** — cache-aware pruning every turn; can still mutate history near the cache lookback | Keep defaults; audit if cacheRead drops unexpectedly |
+| `compaction.idleEnabled` / `idleThresholdTokens` / `idleTimeoutSeconds` | false / 200,000 / 300 | same | **No** — idle maintenance is enabled only by the interactive TUI; SDK/RPC/print sessions do not enable it (`docs/sdk.md:278`) | Ignore for `-p`; do not build standby policy on it |
+| `compaction.handoffSaveToDisk` | false (host true) | true | No direct cache effect; writes summary artifacts | Pin for determinism |
+| `compaction.experimentalContextManagement` | false (host true) | true | **Potentially** — notes-backed rollover; requires `context_notes`/`new_context`/`read`/`grep` tools, otherwise legacy maintenance | Pin `false` unless deliberately opted in |
+| `snapcompact.systemPrompt` | `none` | `none` | **Yes** — imaging system prompt text loses prompt caching for that text | Pin `none` |
+| `snapcompact.toolResults` | false | false | **Maybe** — images of tool results; cache/vision trade-off | Pin `false` for architect |
+| `compaction.remoteEndpoint` / `remoteStreamingV2Enabled` / `v2RetainedMessageBudget` | unset / true / 64,000 | same | **Yes** if remote compaction is used | Decide/pin; remote is a second compaction path to test |
+| `compaction.modelThresholds` / `modelThresholdsEnabled` | per-model / true | host overrides | **Yes** — can trigger on a model unexpectedly | Audit/pin |
+| `task.agentCompactionThresholdOverrides` | {} | {} | **No** for root factory turns (task/subagents only) | Ignore |
+| `mnemopi.autoRecall` / `autoRetain` | true / true | true / true | **Yes** — first-turn effective system prompt changes; cross-session recall and cache loss | Pin `false` for deterministic factory agents (or opt in consciously with a recorded digest) |
+| `memory.backend` | `mnemopi` | `mnemopi` | **Yes via autoRecall** | Keep but disable autoRecall/autoRetain, or choose `off` if no memory is wanted |
+
+## 7. Compaction vs fresh brief
+
+### 7.1 `-p` manual compaction is available (verified)
+
+A one-shot print invocation accepted the slash command:
+
+```bash
+omp --cwd <cwd> --mode json --model opencode-go/deepseek-v4.1-flash:max \
+  --session-dir <sd> --tools= --resume <session-id> -p "/compact"
+```
+
+It emitted `manual_compaction_start` then `manual_compaction_end` with `result: { tokensBefore: 38053, firstKeptEntryId: …, summary, shortSummary, details }`; `tokensAfter: 6794` and `method: "soft"` live in the transcript `compaction` entry, not the NDJSON result. It printed `Compaction complete. Tokens: 36413 -> 6768 (saved 29645)` to stderr, persisted that `compaction` entry in the session JSONL, and exited 0. There was **no `turn_end`, no usage, and no `model_usage` entry** for the summarization request in NDJSON/transcript — compaction cost must be estimated from `tokensBefore`/summary length (or measured via `omp stats`/an RPC wrapper) if spec 20's cost defaults are to include it.
+
+RPC mode exposes a first-class `{ type: "compact", customInstructions? }` command and `manual_compaction_start/end` events (`docs/rpc.md:190-210`, `:970-987`); `{ type: "set_cache_warming", mode }` is also available there (`docs/rpc.md:197-210`).
+
+### 7.2 Cost analysis (architect on `anthropic/claude-opus-5-5`, catalog: input $4/M, cacheRead $0.20/M, cacheWrite $5/M)
+
+For a 38k-token history (same order as the compaction probe):
+
+| Strategy | What is paid | Approx cost |
+|---|---|---|
+| Direct cold resume | 38k × $4/M | **$0.152** |
+| Compact **after** cache expiry, then resume | summarizer cold-reads 38k ($0.152) + summary output (~$0.01-0.02) + compacted prefix write 6.8k × $5/M ($0.034) + resumed turn | **≈$0.20-0.24** (worse than direct for one turn) |
+| Compact **while warm** (at wave end, within TTL), then resume | summarizer cache-reads 38k × $0.20/M ($0.0076) + output (~$0.01-0.02) + compacted write $0.034 + resumed turn | **≈$0.06-0.09** (better) |
+| Fresh architect brief | build B-token brief from records (e.g. B≈5k: $0.02 input / $0.025 write) + system-prompt prefix cacheRead (~$0.001) | **≈$0.02-0.03** at B=5k; still cheaper at B=20k (~$0.08-0.10) |
+
+Key correction to spec item 20(a): **compaction after the cache has already expired does not avoid re-paying the full history; the summarizer pays it once, then the resumed turn pays the compacted prefix again.** Compaction only pays if it runs while the prefix is still warm, or if the architect will have several future turns on the compacted history, or if the full history would overflow the window. For an already-cold resume, a deterministic fresh brief is the cheaper mechanism.
+
+### 7.3 Recommended mechanism
+
+1. **Warm** (no trigger): resume additively; do nothing.
+2. **Cold + short history / one-shot consult**: resume uncached; optionally pass a per-turn overlay with `providers.cacheRetention: none` if the turn is known to make a single model request (multi-request tool loops still benefit from caching).
+3. **Cold + long history + more turns expected**: start a **fresh architect session hydrated from records** (existing `hydrationContext`/`contextPack`/`waveReport` machinery in `step-runner.ts` and `steps/architect-resume`). This is bounded, deterministic, and still reuses the system-prompt prefix (4,224-token cross-session hit measured).
+4. **Compact only while warm**, at a natural wave boundary, before the TTL expires: `omp -p --resume <id> "/compact"` (verified) or RPC `compact`. Use `handoff`/`soft`, not `snapcompact` for the architect. Record `tokensBefore/tokensAfter`; estimate cost.
+5. **If already cold and continuity is mandatory** (the brief would lose critical conversational state): resume uncached and accept the full read; do not compact as well.
+
+## 8. Standby-warming viability
+
+- `providers.cacheWarming` values: `off`, `streaming`, `idle` (verified by invalid-value error; docs `docs/settings.md:1026`). Warming replays the last request with a one-token output budget shortly before expiry, only when the expected avoided-miss cost exceeds the refresh cost by at least **$0.05**. For Opus (input $4/M vs cacheRead $0.20/M, delta $3.8/M), the threshold is ≈**13.2k tokens** of prefix; an architect session above that qualifies economically.
+- **`idle` warming cannot cover factory standby.** The interactive TUI owns idle work; “SDK, RPC and print sessions do not” enable idle maintenance (`docs/sdk.md:278`). `-p` exits at the end of the turn, so there is no process alive to replay the request between turns. `streaming` warming can still protect a long tool execution **inside** a turn — pin it.
+- **The practical standby mechanism is `providers.cacheRetention: long`** (1h where supported). Verified `cttl: {ephemeral1h: N}`. It needs no live process. The cost is the cache write: catalog `cacheWrite` for Opus is $5/M (1.25× input); Anthropic bills 1h writes at a higher rate than 5m in the real API, and omp's single catalog `cacheWrite` value may under-estimate 1h writes — verify against provider billing before making it the default. A 1h tier pays if the architect's next turn lands >5m and <1h later; it does not cover >1h gaps.
+- **Pre-warming immediately before a resume is never cheaper:** if the entry already expired, the warm request pays full input + cache write, then the resumed turn pays cache read; that is strictly more than the direct cold resume. Warm must happen *before* expiry to pay off.
+- **Persistent RPC holder** (`omp --mode rpc`, `set_cache_warming idle`, `compact`) is the only true standby warming, but it reintroduces a long-lived process and session ownership across wave gaps. Defer as an optional M7 experiment; measure against long retention first.
+
+## 9. Recommendations for M7
+
+1. **Extend usage accounting** (`src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549`, `src/harness/omp/ndjson.ts:86-99`): add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `cacheTtl: {tier, tokens}`, `provider`, `api`, `model`, `reasoningTokens`; keep per-request rows (a turn can emit multiple `turn_end` usages) and aggregate. Include side-request `model_usage`/compaction cost where available.
+2. **Add a per-session cache-state record** (meta or a sibling `session-cache.yaml`): resolved model (`provider/model` from `turn_end.message`), thinking suffix, ordered tools hash, system-prompt hash, cache retention, last request timestamp, last `cttl`, last `compaction` marker. Compare it on every resume.
+3. **Stop silently switching models on resume:** record the resolved model used by the successful turn and pass that literal model on resume (or detect the mismatch and treat it as cold). Current resume unconditionally passes `@role` (`harness.ts:318-326`), so a role-map change or fallback recovery silently switches models and pays a full cold read.
+4. **Pin effective omp settings in the generated overlay** (`overlay.ts:51-85`): `providers.cacheRetention` (per role/flow), `providers.cacheWarming: streaming`, `provider.appendOnlyContext: auto`, `includeModelInPrompt: false`, `snapcompact.systemPrompt: none`, `snapcompact.toolResults: false`, `compaction.experimentalContextManagement: false`, explicit `compaction.enabled/thresholdTokens/methodOrder/autoContinue`, and `mnemopi.autoRecall/autoRetain: false`. Overlay precedence beats host global/project config (`docs/settings.md:113-123`), but only if the keys are actually present.
+5. **Validate effectively, not syntactically:** `omp --config <overlay> --version` exits 0 even for invalid YAML or an invalid `providers.cacheRetention` value (confirmed). Preflight’s current overlay check (`src/cli/preflight.ts:364-393`) is therefore a no-op. Read back effective values (`omp config get`, or a no-model probe) and/or perform a real throwaway turn before declaring config compatible. This confirms open concern `c-477404c672` and adds cache/compaction keys to its scope.
+6. **Cold policy:** warm → resume; cold single-turn → resume (optionally `retention: none`); cold long-history → fresh brief; compact only while warm. Do not compact after expiry for a single resume.
+7. **Byte stability:** keep system-prompt content byte-stable; make prompt filenames content-addressed (`prompt-<sha256>.txt`) so identical logical prompts produce identical `@file` wrappers/transcripts. The current timestamp+random path is cache-safe but not byte-reproducible.
+8. **Disable ambient memory for deterministic agents** or explicitly include its digest: `mnemopi.autoRecall/autoRetain: false`; otherwise fresh sessions in a reused cwd inject prior task text into the system prompt (digest changes observed).
+9. **Measure before defaults:** use `long` retention for architect standby gaps <1h, `short` for multi-request tool-loop agents, `none` only for single-request turns; keep the choice per role/flow and record the cost delta.
+10. **Tests:** the scripted mock provider for item 19.8 should emit realistic `usage` rows with `cacheRead`, `cacheWrite`, `totalTokens`, `cttl`, and multiple `turn_end`s per turn, plus a synthetic session JSONL with `system-prompt-digest`, `model_change`, `thinking_level_change`, `compaction`, and `cttl` so cold detection is testable without paid models.
+
+## 10. Draft decision YAML
+
+```yaml
+status: proposed
+decision: |
+  OMP prompt caching is content-keyed, not path-keyed. The cached prefix is composed of the
+  system-prompt bytes, ordered tool specs, model/thinking identity, cache-retention tier, and
+  conversation history; file paths and session ids are not hard key components. The factory's
+  deterministic system-prompt path and unique per-turn prompt path are cache-safe; a changed
+  system-prompt path with identical bytes still fully hits. Cold resume must be detected from
+  content/config changes (system-prompt bytes, ordered tools, model, thinking level, cache
+  retention) plus TTL expiry (usage.cttl + timestamp) and compaction markers, not from paths.
+  For one-process-per-turn `-p` sessions, idle cache warming and idle compaction are unavailable;
+  use `providers.cacheRetention: long` for architect standby gaps under 1h, pin streaming warming
+  for intra-turn tool executions, and do not rely on omp's default host config (this host sets
+  short/streaming/experimental values). For an already-cold architect resume, prefer a fresh
+  brief hydrated from records over compaction; compaction only pays when performed while the
+  cache is warm (at a wave boundary) or amortized over several future turns. Pin all relevant
+  omp cache/compaction/memory keys in the generated overlay and record cacheRead/cacheWrite/
+  totalTokens/cttl in step records so defaults can be measured.
+evidence:
+  - "Transport audit: harness.ts:286-350 writes a deterministic per-agent+session system prompt and a unique timestamp+random prompt file; argv differs only in -p @path; overlay bytes identical (sha256 6ebf5894...); system-prompt/prompt content identical across renders."
+  - "Path invariance: DeepSeek resume with changed system-prompt path and identical bytes cacheRead=11,392 (input 86); Anthropic resume with changed path cacheRead=6,703 (input 4). New prompt path per turn cacheRead=10,752 (DeepSeek) and 29,363 (Anthropic)."
+  - "Content invalidation: system prompt + newline cacheRead=0 (input 13,266); tools change cacheRead=2,432 of 4,480; thinking change cacheRead=0; model switch cacheRead=0 (cost 8.9x warm)."
+  - "TTL: Anthropic short (5m) warm resume cacheRead=29,363, cost $0.001454; after 330s cacheRead=0, cacheWrite=38,022, cost $0.004767. Long retention emits cttl ephemeral1h; providers.cacheRetention enum is auto|short|long|none."
+  - "Cross-session: new session, same system prompt/tools, cacheRead=4,224; session id is not a hard key."
+  - "Compaction: `omp -p --resume <id> \"/compact\"` compacted 38,053 -> 6,794 tokens (method soft) with manual_compaction_start/end; no usage/cost in NDJSON or transcript. Docs: idle maintenance is TUI-only (docs/sdk.md:278); cacheWarming values off|streaming|idle, $0.05 avoided-miss gate (docs/settings.md:1026); idle compaction trade-off (docs/compaction.md:155-158)."
+  - "Factory records: ndjson.ts:86-99 and 173-177 drop cacheRead/cacheWrite/totalTokens/cttl; Usage and StepUsage lack fields (types.ts:7-11, artifacts.ts:545-549)."
+  - "Factory overlay: overlay.ts:51-85 pins no providers.cache*, compaction.*, snapcompact.*, mnemopi.autoRecall/autoRetain; host global config sets providers.cacheRetention=short, cacheWarming=streaming, compaction.experimentalContextManagement=true. `omp --config <invalid> --version` exits 0, so preflight.ts:364-393 does not validate the overlay."
+followUps:
+  - "M7: extend Usage/StepUsage and OmpNdjsonParser with cacheRead/cacheWrite/totalTokens/cttl/provider/model/reasoningTokens and per-request rows."
+  - "M7: add a session cache-state record and pre-launch cold detector (system-prompt hash, ordered tools hash, resolved model, thinking, retention, cttl+timestamp, compaction marker)."
+  - "M7: pass the recorded resolved model on resume instead of unconditionally @role; treat role-map changes as cold."
+  - "M7: pin cache/compaction/mnemopi settings in the generated overlay; validate effective values in preflight with a real check, not `--version`."
+  - "M7: measure long-vs-short retention and fresh-brief-vs-warm-compaction per role/flow on the self-host fire test; confirm Anthropic 1h write pricing against provider billing."
+  - "M7: optional RPC holder experiment (set_cache_warming idle + compact) only if long retention does not cover the observed wave gaps."
+  - "Add a mock-provider fixture with cache usage/cttl/session entries so cold-detection and cost defaults are testable without paid models."
+```
+
+## 11. Open questions / follow-ups
+
+- Anthropic's real 1h cache-write price is higher than the 5m write price; omp's catalog exposes one `cacheWrite` value per model. The cost estimates in §7.2/§8 for `long` may be optimistic. Confirm on the provider bill before making `long` the default.
+- DeepSeek reports no `cttl`/`cacheWrite`; its implicit cache has no observable TTL. Do not attempt TTL-based cold detection for such providers; use content/config fingerprints only.
+- The `-p "/compact"` summarization cost is not in NDJSON or the transcript. If spec 20 requires measured compaction cost, add an RPC wrapper that captures the compaction response/usage, or estimate from `tokensBefore` and summary length.
+- `mnemopi.autoRetain` can write completed factory turns into a per-cwd memory bank and affect later fresh sessions in the same worktree. Decide whether that is a feature (cross-run context) or a leak (task isolation); the factory's current overlay only disables the linking flags.
+- `checkpoint.enabled: true` in the overlay mounts checkpoint tools; agents opt in via their tool lists. Not a cache issue, but part of the effective harness surface to audit.
+
+## Sources
+
+Repo (read-only audit):
+- `plugins/software-factory/src/harness/omp/harness.ts:286-350` — system-prompt/prompt materialization, model candidates.
+- `plugins/software-factory/src/harness/omp/harness.ts:368-389` — argv construction (`--system-prompt`, `-p @file`, `--resume`, tools).
+- `plugins/software-factory/src/harness/omp/harness.ts:225-240` — overlay regeneration.
+- `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — overlay keys; no cache/compaction/memory-autoRecall pins.
+- `plugins/software-factory/src/harness/omp/ndjson.ts:86-99,173-177` — usage fields dropped.
+- `plugins/software-factory/src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549` — `Usage`/`StepUsage` lack cache fields.
+- `plugins/software-factory/src/core/flows/step-runner.ts:534-547,620,817` — prompt rendering and `AgentRun` prompt.
+- `plugins/software-factory/src/core/records/step-record.ts:96`; `src/harness/omp/harness.ts:521-522` — `traceRef` to session JSONL.
+- `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay validation via `omp --config … --version`.
+- `plugins/software-factory/docs/OMP_ADAPTER.md:164-172` — prior cache-safety claims; line 168 previously marked path-vs-content keying unknown.
+- `plugins/software-factory/docs/ARCHITECTURE.md:38` — one process per agent turn; `:40` — cache/compaction not built.
+- `docs/factory.v2.md:114-120` — spec items 20(a)-(d).
+
+OMP docs (official):
+- `https://omp.sh/docs/compaction` — compaction settings reference.
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:113-123` — precedence (overlay beats project/global); `:926` — cache-segment invalidation signals; `:1025-1027` — cacheRetention/cacheWarming; `:468` — includeModelInPrompt.
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md:465-504` — prompt-cache lifetimes (Anthropic 5m/1h; OAuth vs API key defaults).
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md:278` — idle maintenance is TUI-only; SDK/RPC/print sessions do not enable it.
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md:155-158` — idle-compaction/cache TTL trade-off; `:530` — experimental context management default false.
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md:190-210,970-1037` — `compact`, `set_cache_warming`, `cache_warming_start/end`/`warmingStopReason`.
+
+## Appendix A: Probe log (commands and raw result locations)
+
+All live probes were run as `omp -p --mode json --max-cost 0.10` from throwaway dirs; per-turn NDJSON and stderr were captured under `/tmp/spike-cache-key-{live,ttl,invalidation,tools-thinking,digest,cross-session,anth-path,retention,preflight}` (exception: the long/none retention probes in §3.3 saved only YAML results — no NDJSON/transcript was archived for them). The transport shim captured argv/system-prompt/prompt under `/tmp/spike-cache-key-0c1ojol5/capture/{fresh-1,fresh-2,resume-1,resume-2}`. The numbers in §3 are extracted from the `turn_end`/`message` usage rows in those files. Aggregate spend ≈ $0.05.
diff --git a/plugins/software-factory/docs/spikes/omp-6-repo-rules.md b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
new file mode 100644
index 0000000..1b4f5ad
--- /dev/null
+++ b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
@@ -0,0 +1,128 @@
+# Software-Factory v2: OMP Repo Rules & Injection Spike (M1)
+
+This report is empirical verification of how omp discovers repository rules and context files, how the factory's per-role prompts interact with that injection, and what the factory should do for the M1 `omp-workspaces` repo-rules requirement. Tested against `omp 18.18.5` on Linux x86_64 WSL2 with throwaway git fixtures and a local OpenAI-compatible mock provider. No paid models were used; no production files were changed.
+
+## 1. Verdicts
+
+### 1.1 Root omp sessions inject repo rules automatically — **VERIFIED**
+
+`omp --cwd <repo> --system-prompt <role-body>` still emits a trailing `<project-context>` footer with `<repo-rules>` and injects rules. `--system-prompt` replaces only block 0; it does not suppress context files, `RULES.md`, always-apply rules, or the rulebook listing.
+
+### 1.2 Current factory has no double injection — **VERIFIED**
+
+Factory roles are root omp processes; their `--system-prompt` contains only the agent definition body. Repo rule text is absent from all role/step prompt assets. Each active sentinel appeared exactly once in captured provider requests.
+
+### 1.3 Copying rules into role prompts double-injects — **VERIFIED**
+
+A role system prompt containing the same repo text produced 2 sentinel occurrences (block 0 + `<repo-rules>`). `--append-system-prompt` with the same text produced 2 (repo-rules + append). If M8 injects engine-rendered rules, it MUST disable omp discovery for that run.
+
+### 1.4 The spec's subagent premise is about scouts — **VERIFIED BY DOCS, NOT LIVE**
+
+omp task subagents drop every context file named `AGENTS.md` by basename; they keep `RULES.md` and `contextFiles.extra`. Root role sessions do not drop AGENTS.md. The factory's architect/developer/qa/reviewer are root processes, so they already receive AGENTS.md. Scouts (`task`) do not; use RULES.md/extra/delegation context for them.
+
+### 1.5 Preflight overlay validation is a no-op — **VERIFIED (critical)**
+
+`omp --config <bad.yaml> --version` exits 0. The same overlay on a real turn fails with `Failed to parse config overlay`. The current preflight check (`preflight.ts:364-393`) proves the binary exists, not that the overlay is valid.
+
+### 1.6 No-paid-model mock provider is feasible — **VERIFIED**
+
+A throwaway `models.yml` custom provider (`api: openai-completions`, `apiKey` literal, `authHeader: true`) plus a local HTTP/SSE stub returned scripted responses and recorded exact request bodies. This is a viable basis for M8's scripted mock model provider.
+
+## 2. Source and precedence summary
+
+### 2.1 Context files (`<repo-rules>`)
+
+| Source | Provider priority | Scope |
+|---|---|---|
+| `.omp/AGENTS.md` | native 100 | nearest non-empty `.omp` walking cwd→repo root; no farther fallback |
+| `AGENTS.md` | agents-md 10 | every ancestor cwd→repo root (and enclosing workspace dirs under home) |
+| `.claude/CLAUDE.md` | claude 80 | launch cwd only |
+| `CLAUDE.md` | claude-md 10 | every ancestor cwd→repo root |
+| `.agent/AGENTS.md`, `.agents/AGENTS.md` | agents 70 | ancestor walk; `.agent` wins same level |
+| `.github/copilot-instructions.md` | github 30 | launch cwd only |
+| `.gemini/GEMINI.md` | gemini 60 | launch cwd only |
+| `contextFiles.extra` basenames | custom-context 9 | walk like AGENTS.md; additive; also user agent dir and primary checkout root in linked worktrees |
+
+One user context file survives by provider priority; one project file per depth; higher priority shadows at the same depth; different depths compose root→cwd (nearer last, more prominent). `contextFiles.extra` is additive and never takes the scope slot. Final injection is one `<repo-rules>` block in the trailing `<project-context>` footer, with absolute paths and expanded `@` imports.
+
+### 2.2 Rules
+
+| Source | Provider priority | Scope / bucket |
+|---|---|---|
+| `.omp/rules/*.{md,mdc}` | native 100 | `<cwd>/.omp/rules` only; always-apply / rulebook / TTSR |
+| `<agent-dir>/rules/*` | native 100 | user; same buckets |
+| `.omp/RULES.md` | native 100 sticky | nearest project `.omp`; forced always-apply (`RULES@project`) |
+| `<agent-dir>/RULES.md` | native 100 sticky | user; forced always-apply (`RULES`) |
+| `.cursor/rules/*.{mdc,md}` | cursor 50 | project `<cwd>/.cursor/rules`, user `~/.cursor/rules`; alwaysApply or rulebook |
+| `.cursorrules` | — | **not observed in 18.18.5**; do not rely on it |
+| `.windsurf/rules/*.md` | windsurf 50 | project; rules |
+| `.clinerules` | cline 40 | nearest; rules |
+| `.github/instructions/**/*.instructions.md` | github 30 | applyTo rules |
+| plugin `rules/` | omp-plugins 90 | extension packages |
+
+Rules dedup by name: native > omp-plugins > agents > cursor/windsurf > cline > github > builtin. Bucket order: TTSR > alwaysApply (full content) > rulebook (description listing; body via `rule://`). `--no-rules` removes all of them; `--no-context-files` removes none.
+
+### 2.3 Settings layers
+
+Environment > runtime > `--config` overlays > project `.omp/config.yml` > global `<agent-dir>/config.yml` > default. Arrays replace; they do not merge. `disabledExtensions: [context-file:<level>:<basename>]` drops a single context file; `disabledProviders` removes a whole discovery source.
+
+## 3. Injection behavior
+
+- Context files: `<repo-rules>` in `<project-context>` footer; static system block comes first, so worktree-specific rules sit below the Anthropic cache breakpoint.
+- Rules with default prompt: full always-apply content in `<generic-rules>`; conditional/described rules in `<domain-rules>` as name/description/globs pointers.
+- Rules with `--system-prompt`: always-apply content is prepended to block 0; rulebook renders as `<rules>` in block 0.
+- `--system-prompt` suppresses discovered `SYSTEM.md` but **not** `APPEND_SYSTEM.md`, context files, or rules.
+- `--no-context-files` disables context files only; `--no-rules` disables rules only; both are needed to disable both.
+- Discovered `APPEND_SYSTEM.md` is appended even with both flags and a custom system prompt; explicit empty `--append-system-prompt=` suppresses it.
+
+## 4. Probe matrix (condensed)
+
+| Probe | Result |
+|---|---|
+| repo1 baseline (root AGENTS, CLAUDE, .claude/CLAUDE, .cursorrules, .cursor/rules always, .omp/RULES, AGENTS.local) | `<repo-rules>` = `.claude/CLAUDE.md`; rules = `RULES.md` + cursor always; root AGENTS/CLAUDE shadowed; `.cursorrules` absent |
+| + `--system-prompt` | role text + rules in block 0; `<repo-rules>` still `.claude/CLAUDE.md` |
+| + `--no-context-files` | no `<repo-rules>`; rules remain |
+| + `--no-rules` | `<repo-rules>` remains; rules gone |
+| + extra overlay `AGENTS.local.md` | `.claude/CLAUDE.md` + `AGENTS.local.md` |
+| repo2 `.omp/AGENTS.md` + root AGENTS | `.omp/AGENTS.md` only; root shadowed |
+| repo3 only AGENTS.md | `AGENTS.md` injected |
+| repo4 only CLAUDE.md | `CLAUDE.md` injected |
+| repo5 only `.cursorrules` | nothing, even with `read` |
+| repo6 conditional `.mdc` | `<domain-rules>` listing only |
+| repo7 always `.mdc` + `.cursorrules` | always body injected; `.cursorrules` absent |
+| cwd `sub/` | root + sub AGENTS (root first); root `.omp/RULES.md`; root `.claude` not loaded |
+| repo8 native rules + same-name cursor | native body wins; cursor body absent; conditional in `<domain-rules>` |
+| cwd `sub/` of repo8 | root `.omp/rules` not loaded; root RULES still loaded |
+| duplicate role prompt | sentinel count 2; with `--no-context-files` count 1 |
+| duplicate append | sentinel count 2 |
+| user AGENTS/RULES/SYSTEM/APPEND | all load; APPEND survives both disable flags; empty append suppresses |
+| project config extra + overlay empty / disabledExtensions | project extra loads; overlay `[]` removes; disabled file drops while extra stays |
+| resume after editing AGENTS.md | new system footer contains V2 only; history retained |
+| preflight bad overlay + `--version` | exit 0; real turn parse error |
+
+## 5. Role hydration seams
+
+- `--system-prompt` = `agents/<role>.md` body (frontmatter stripped, shared partials resolved).
+- `-p @<prompt>` = rendered `agents/steps/<step>.md` with prompt vars/schema.
+- `--cwd` = task worktree for architect/plan-reviewer/PM/close-ups; item worktree for developer/qa/reviewer. That cwd is the omp discovery root.
+- One shared `{runtimeDir}/omp-overlay.yaml`; currently no context/rules keys.
+- Inherited `HOME`/agent dir means user-level `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md` apply to every role.
+
+## 6. M8 plan
+
+1. Keep omp auto-discovery as the repo-rules injector for root roles; do not copy rule text into role definitions or step prompts.
+2. Add a pipeline/overlay knob for `contextFiles.extra` (array of basenames) and, if needed, `disabledExtensions` for user-level contamination.
+3. For rules that scouts must follow, use `.omp/RULES.md` or `contextFiles.extra`, or pass them in the `task` tool `context` field; AGENTS.md alone is invisible to scouts.
+4. Add a mock-provider test harness that records request bodies; assert sentinel counts per role, precedence, flags, resume refresh, and cache-prefix stability.
+5. Optionally run a cheap live probe where each role quotes sentinels; assert root roles see AGENTS and scouts do not (unless RULES/extra/context carries them).
+6. If engine-side hydration is ever chosen, launch with `--no-context-files --no-rules --append-system-prompt=` and assert count == 1.
+7. Replace preflight's `--config --version` with a real throwaway turn against the mock provider.
+
+## 7. Recommendations
+
+- **Use omp-native injection** (recommended): no double injection, no rule-text duplication, cache-friendly (rules in the trailing footer below the cache breakpoint).
+- **Do not rely on `.cursorrules`** in omp 18.18.5; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
+- **Put hard repo rules in `.omp/RULES.md`** if scouts must see them; keep AGENTS.md for the broader root-session guidance.
+- **Verify user-level prompt files** are intentional; suppress `APPEND_SYSTEM.md` with `--append-system-prompt=` for deterministic role prompts.
+- **Pin/sync repo rules across worktrees** at item/wave creation if rule changes must be consistent.
+- **Keep factory launches at worktree roots**: `.omp/rules` and `.claude/CLAUDE.md` are cwd-only, so launching a role from a subdirectory would silently miss the root copies.

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

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
Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
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

## Rules
- Defect requiring code change MUST be `fix`.
- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
- Do NOT use `human-async` when repo context or architecture docs provide the answer.

## Assignment
{
  "slug": "allowlist-agreement-test",
  "kind": "test-only",
  "title": "Raise-allowlist agreement contract test",
  "assignment": "Test-only, no prod changes. In test/human-involvement-config.test.ts ONLY, delete the local DEFAULT_RAISE_ALLOWLIST duplicate (:46-55) and import DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts so the existing assertion (:154-157) directly compares the code constant vs shipped concerns.raiseAllowlist in config/pipeline.default.yaml. DO NOT create a new test file, a third copy, or touch any prod path. Verify: typecheck + targeted suite (human-involvement-config) green.",
  "outlineRef": "allowlist-agreement-test",
  "milestone": "m2-docs-gates",
  "wave": 1,
  "scenarioRefs": [
    "m2-docs-gates:s7"
  ],
  "citations": [
    "docs/factory.v2.md:89-103"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..810261b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,57 @@
+checks:
+  - id: gates
+    status: pass
+    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
+      (§7).detects when an agent commits and resets --soft to before.sha,
+      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
+      agent switches branch and restores original branch, keeping changes)"
+    details:
+      - id: typecheck
+        command: cd plugins/software-factory && bun run typecheck
+        status: pass
+        durationMs: 5615
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 126965
+        details: |-
+          bun test v1.4.4 (38afee6c8)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-vYEguN/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+          ----------------------------------------------------------------
+          Blocking Questions:
+            (none)
+          ----------------------------------------------------------------
+          Digest Questions:
+            (none)
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2315505
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2315505
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2315505
+
+           445 pass
+           2 skip
+           0 fail
+           2468 expect() calls
+          Ran 447 tests across 69 files. [126.77s]
+          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
+        improvements:
+          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+            and resets --soft to before.sha, keeping changes staged"
+          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+            branch and restores original branch, keeping changes"
+  - id: tests-only
+    status: pass
+    message: tests-only passed (1 test files changed)
diff --git a/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..10f2afa
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,56 @@
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
+  "slug": "allowlist-agreement-test",
+  "kind": "test-only",
+  "title": "Raise-allowlist agreement contract test",
+  "assignment": "Test-only, no prod changes. In test/human-involvement-config.test.ts ONLY, delete the local DEFAULT_RAISE_ALLOWLIST duplicate (:46-55) and import DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts so the existing assertion (:154-157) directly compares the code constant vs shipped concerns.raiseAllowlist in config/pipeline.default.yaml. DO NOT create a new test file, a third copy, or touch any prod path. Verify: typecheck + targeted suite (human-involvement-config) green.",
+  "outlineRef": "allowlist-agreement-test",
+  "milestone": "m2-docs-gates",
+  "wave": 1,
+  "scenarioRefs": [
+    "m2-docs-gates:s7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103"
+]
+
+## Review Feedback
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
+- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..ac40b0d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/meta.yaml
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
+status: ok
+startedAt: 2026-11-09T08:05:00.760Z
+session: 01a1bf56-d737-75c8-acca-1ffc75ffe105
+endedAt: 2026-11-09T08:07:57.854Z
+usage:
+  inputTokens: 10019
+  outputTokens: 3313
+  costUsd: 0.004067
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-05-01-879Z_01a1bf56-d737-75c8-acca-1ffc75ffe105.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..a539e05
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,29 @@
+status: ok
+summary: Removed the local DEFAULT_RAISE_ALLOWLIST duplicate from
+  test/human-involvement-config.test.ts and imported the canonical
+  DEFAULT_RAISE_ALLOWLIST from src/core/concerns.js, so the existing
+  default-pipeline assertion now compares the code constant directly against the
+  shipped config/pipeline.default.yaml allowlist. No prod files or new test
+  files were touched.
+target:
+  command: bun test test/human-involvement-config.test.ts
+  customTarget: true
+evidence:
+  - Read plugins/software-factory/test/human-involvement-config.test.ts:46-55
+    and removed the duplicated DEFAULT_RAISE_ALLOWLIST block, adding import {
+    DEFAULT_RAISE_ALLOWLIST } from "../src/core/concerns.js" instead.
+  - Confirmed src/core/concerns.ts exports DEFAULT_RAISE_ALLOWLIST (as const)
+    with the same eight agents as config/pipeline.default.yaml
+    concerns.raiseAllowlist.
+  - Verified the existing assertion at test/human-involvement-config.test.ts:145
+    now spreads the imported code constant; no third copy introduced.
+  - "Ran `bun run typecheck` in plugins/software-factory: exit 0 (tsc --noEmit)."
+  - "Ran `bun test test/human-involvement-config.test.ts`: 12 pass, 0 fail, 165
+    expect() calls."
+  - "`git status --short` shows only M
+    plugins/software-factory/test/human-involvement-config.test.ts (dependency
+    install produced no tracked changes)."
+notes: Installed workspace dependencies with `bun install --frozen-lockfile`
+  because the worktree had no node_modules; it introduced only ignored
+  node_modules content, no tracked diff.
+concerns: []
diff --git a/plugins/software-factory/test/human-involvement-config.test.ts b/plugins/software-factory/test/human-involvement-config.test.ts
index 6276022..cb9ad54 100644
--- a/plugins/software-factory/test/human-involvement-config.test.ts
+++ b/plugins/software-factory/test/human-involvement-config.test.ts
@@ -11,6 +11,7 @@ import {
   preflightPrompts,
 } from "../src/core/prompts.js";
 import { KNOWN_VARS, PROMPT_VAR_DESCRIPTIONS } from "../src/core/prompt-vars.js";
+import { DEFAULT_RAISE_ALLOWLIST } from "../src/core/concerns.js";
 import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
 import { FakeHarness } from "../src/harness/fake/fake-harness.js";
 import { runAgentStep } from "../src/core/flows/step-runner.js";
@@ -42,18 +43,6 @@ const agentsDir = path.join(pluginRoot, "agents");
 
 const MODES = ["autonomous", "principal", "detailed"] as const;
 
-/** Default concern policy: every agent whose output schema can raise concerns. */
-const DEFAULT_RAISE_ALLOWLIST = [
-  "developer",
-  "fact-finder",
-  "architect",
-  "qa",
-  "reviewer",
-  "plan-reviewer",
-  "wave-close-up",
-  "plan-close-up",
-];
-
 /**
  * Fragment matrix: every engine step that produces or triages concerns receives
  * hydrated open concerns. Only triagers (reviewers/architects/close-ups/qa) also

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["approved","changes_requested"])
- summary (string, required)
- suggestions (array of object, required)
  - id (string, required)
  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
  - summary (string, required)
  - detail (string, optional)
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)

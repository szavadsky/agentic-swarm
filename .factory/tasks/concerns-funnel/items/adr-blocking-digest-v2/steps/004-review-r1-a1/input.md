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
  "slug": "adr-blocking-digest-v2",
  "kind": "dev",
  "title": "Blocking vs remarkable ADRs",
  "assignment": "Blocking vs remarkable ADRs: full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Tests: blocking mailbox+blocks, remarkable digest only.",
  "outlineRef": "adr-blocking-digest-v2",
  "milestone": "m3-routing",
  "wave": 9,
  "deps": [
    "modes-prompts-v2",
    "routing-human-debt-v2"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..93ea758
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,29 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/adr-blocking-digest.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 4 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/adr-blocking-digest.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794140321411-2959obvy3if.xml
+      junitCaseCount: 4
+      junitCaseIds:
+        - Blocking vs remarkable ADRs (§18).writes full ADR markdown with
+          context, decision, consequences, and blocking status
+        - Blocking vs remarkable ADRs (§18).routes a blocking ADR to the mailbox
+          with task blocks and halts with exit 10
+        - Blocking vs remarkable ADRs (§18).reports a remarkable ADR in the
+          digest and lets the run complete
+        - Blocking vs remarkable ADRs (§18).respects the active mode table for
+          blocking and remarkable ADRs
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..093235e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,53 @@
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
+  "slug": "adr-blocking-digest-v2",
+  "kind": "dev",
+  "title": "Blocking vs remarkable ADRs",
+  "assignment": "Blocking vs remarkable ADRs: full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Tests: blocking mailbox+blocks, remarkable digest only.",
+  "outlineRef": "adr-blocking-digest-v2",
+  "milestone": "m3-routing",
+  "wave": 9,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-human-debt-v2"
+  ]
+}
+
+## Context & Citations
+[]
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
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..b916fdc
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
+name: test-first
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T12:05:42.040Z
+session: 01a1bb0c-d49b-736e-85f7-ce3566df1197
+endedAt: 2026-11-08T12:18:46.191Z
+usage:
+  inputTokens: 202597
+  outputTokens: 71225
+  costUsd: 0.113209
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-05-42-683Z_01a1bb0c-d49b-736e-85f7-ce3566df1197.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..df1dfe0
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,74 @@
+status: ok
+summary: "Authored test/engine/adr-blocking-digest.test.ts with four behavior
+  tests covering §18 blocking-vs-remarkable ADR routing. Tests specify: (1) full
+  ADR markdown with title/Context/Decision/Consequences/Blocking status; (2)
+  autonomous blocking ADR creates a task-blocking human-stop mailbox entry,
+  derives a blocked state, halts with exit 10, and dispositions.md keeps the
+  exit-10 contract; (3) a remarkable (unmarked) ADR appears only as a
+  human-awareness digest entry with empty blocks and lets the run complete exit
+  0; (4) the active mode table is respected: blocking ADRs are never remarkable
+  (autonomous human-stop, principal human-async, detailed
+  human-stop|human-async) while remarkable ADRs stay digest-only in every mode.
+  No production files were modified; all four tests are red on current code."
+target:
+  selectors:
+    - test/engine/adr-blocking-digest.test.ts
+  expectRed:
+    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
+      (§18).writes full ADR markdown with context, decision, consequences, and
+      blocking status
+    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
+      (§18).routes a blocking ADR to the mailbox with task blocks and halts with
+      exit 10
+    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
+      (§18).reports a remarkable ADR in the digest and lets the run complete
+    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
+      (§18).respects the active mode table for blocking and remarkable ADRs
+evidence:
+  - cd plugins/software-factory && bun install -> dependencies installed
+    (yaml/ajv/typescript), runner usable
+  - cd plugins/software-factory && bun run typecheck -> exit 0, no diagnostics
+  - cd plugins/software-factory && bun test
+    test/engine/adr-blocking-digest.test.ts -> 4 fail, 0 pass, 7 expect() calls;
+    failures are assertion failures, no import/collection errors
+  - cd plugins/software-factory && bun test
+    test/engine/adr-blocking-digest.test.ts --reporter=junit
+    --reporter-outfile=/tmp/adr-target-final.xml -> JUnit has tests="4", 4
+    <failure>, 0 <error> (target-red compatible)
+  - Default workspace TMPDIR run
+    (TMPDIR=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp) ->
+    same 4 failing target tests, 0 errors
+  - cd plugins/software-factory && TMPDIR=/tmp bun test --timeout 30000 -> 369
+    pass, 2 skip, 4 fail across 375 tests / 61 files; the 4 failures are exactly
+    the new target tests
+  - Direct AJV check of config/schemas/plan.schema.json with
+    adrs[0].blocking=true -> rejected by additionalProperties, confirming the
+    missing schema/type/writer/routing feature is the red cause
+  - cd plugins/software-factory && git status --short -> only '??
+    test/engine/adr-blocking-digest.test.ts'; no production changes
+concerns:
+  - "Mode disposition mapping is pinned by the tests: autonomous routes an
+    explicit blocking ADR as human-stop; principal uses human-async; detailed
+    accepts human-stop or human-async. This follows the plan's blocking-table
+    decision (autonomous blocks only on blocking ADR/high human-stop; principal
+    adds human-async; detailed adds all human-*)."
+  - Tests expect the mailbox question to identify the ADR via question text or
+    ref (id/title) so the operator can act on it; the implementation must
+    include that identity.
+  - The current plan.schema.json rejects PlanAdr.blocking, so the blocking test
+    cases fail at plan-step validation until the schema is extended; after that
+    they still require routing/halt behavior to pass.
+  - Existing routing-human-debt behavior (human-async/human-awareness review
+    dispositions) must remain unchanged; this suite only adds mode gating for
+    ADRs.
+notes: "Implementation guidance for the green step: (1) add optional `blocking`
+  to the plan schema's adrs items (type already has PlanAdr.blocking); (2) write
+  full ADR markdown with `# title`, `## Context`, `## Decision`, `##
+  Consequences`, `## Blocking`; (3) at plan commit, route ADRs via
+  writeQuestion: blocking -> blocks:[\"task\"] (autonomous human-stop,
+  principal/detailed human-async), remarkable -> human-awareness with blocks:[];
+  (4) ensure an open blocking-ADR question makes runIteration return blocked and
+  runTask return exit 10 with state.yaml blocked; (5) leave the human-stop
+  exit-10 text in agents/criteria/dispositions.md intact. Tests use the real
+  runTask/FakeHarness fixture and inspect the deployed task worktree's docs/adr
+  and steer/tousertoreview files."
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..928cafd
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,83 @@
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
+        durationMs: 4967
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 87449
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-tu9chd/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 468811
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 468811
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 468811
+
+           373 pass
+           2 skip
+           0 fail
+           1743 expect() calls
+          Ran 375 tests across 61 files. [87.22s]
+          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
+        improvements:
+          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+            and resets --soft to before.sha, keeping changes staged"
+          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+            branch and restores original branch, keeping changes"
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/adr-blocking-digest.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794141069681-13vstdv7e7ze.xml
+      junitCaseCount: 4
+      junitCaseIds:
+        - Blocking vs remarkable ADRs (§18).writes full ADR markdown with
+          context, decision, consequences, and blocking status
+        - Blocking vs remarkable ADRs (§18).routes a blocking ADR to the mailbox
+          with task blocks and halts with exit 10
+        - Blocking vs remarkable ADRs (§18).reports a remarkable ADR in the
+          digest and lets the run complete
+        - Blocking vs remarkable ADRs (§18).respects the active mode table for
+          blocking and remarkable ADRs
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 131/300 production lines changed"
+    details:
+      changedLines:
+        added: 119
+        deleted: 12
+        total: 131
+        files:
+          - plugins/software-factory/agents/architect.md
+          - plugins/software-factory/agents/steps/architect-plan.md
+          - plugins/software-factory/config/schemas/plan.schema.json
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/steer.ts
+          - plugins/software-factory/src/core/flows/adrs.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..52cabcd
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,62 @@
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
+  "slug": "adr-blocking-digest-v2",
+  "kind": "dev",
+  "title": "Blocking vs remarkable ADRs",
+  "assignment": "Blocking vs remarkable ADRs: full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Tests: blocking mailbox+blocks, remarkable digest only.",
+  "outlineRef": "adr-blocking-digest-v2",
+  "milestone": "m3-routing",
+  "wave": 9,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-human-debt-v2"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/adr-blocking-digest.test.ts"
+  ],
+  "expectRed": [
+    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).writes full ADR markdown with context, decision, consequences, and blocking status",
+    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).routes a blocking ADR to the mailbox with task blocks and halts with exit 10",
+    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).reports a remarkable ADR in the digest and lets the run complete",
+    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).respects the active mode table for blocking and remarkable ADRs"
+  ]
+}
+
+## Context & Citations
+[]
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
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..8ab252c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T12:20:34.906Z
+session: 01a1bb1a-7401-72e3-ac5a-117da2ab1335
+endedAt: 2026-11-08T12:31:15.103Z
+usage:
+  inputTokens: 81199
+  outputTokens: 24440
+  costUsd: 0.039067
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-20-35-457Z_01a1bb1a-7401-72e3-ac5a-117da2ab1335
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..f4a4606
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,54 @@
+status: ok
+summary: "Implemented blocking vs remarkable ADRs. New src/core/flows/adrs.ts
+  renders full ADR markdown (# title plus
+  Context/Decision/Consequences/Blocking) and routes each ADR through
+  steer/tousertoreview: blocking:true raises a task-blocking question under the
+  mode table (autonomous -> human-stop, principal/detailed -> human-async) with
+  blocks:[task], while remarkable/absent ADRs become human-awareness digest
+  entries with no blocks. iteration.ts now uses persistAdrs and halts the
+  iteration immediately when an open mailbox question blocks the task (derive
+  loop returns blocked/exit 10); plan.schema.json accepts `blocking`; steer.ts
+  gained hasOpenTaskBlockingQuestion; architect prompts document the field.
+  dispositions.md untouched, preserving the human-stop exit-code-10 contract."
+target:
+  selectors:
+    - test/engine/adr-blocking-digest.test.ts
+  expectRed:
+    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
+      (§18).writes full ADR markdown with context, decision, consequences, and
+      blocking status
+    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
+      (§18).routes a blocking ADR to the mailbox with task blocks and halts with
+      exit 10
+    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
+      (§18).reports a remarkable ADR in the digest and lets the run complete
+    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
+      (§18).respects the active mode table for blocking and remarkable ADRs
+evidence:
+  - bun test test/engine/adr-blocking-digest.test.ts -> 4 pass, 0 fail, 44
+    expect() calls (was 0 pass / 4 fail before the change).
+  - bun run typecheck -> tsc --noEmit clean, exit 0.
+  - bun test (full suite, plugin dir) -> 373 pass, 2 skip, 0 fail across 61
+    files, 1743 expect() calls.
+  - "Regression subset: bun test test/engine/routing-human-debt.test.ts
+    test/engine/human-async-steering.test.ts
+    test/engine/story-happy-path.test.ts -> 7 pass, 0 fail."
+  - Target test asserts full ADR md sections (## Context/## Decision/##
+    Consequences/## Blocking true|false), blocking mailbox entry disposition +
+    blocks:[task] + state.yaml blocked + exit 10, remarkable human-awareness
+    with empty blocks and exit 0, and mode table routing for
+    autonomous/principal/detailed.
+concerns:
+  - First full-suite run overlapped with concurrently launched test commands and
+    one qa-red-test case hit its 5s timeout; the isolated rerun and a clean
+    full-suite run both passed, so it was CPU contention, not a code regression.
+  - Architect-revise output that changes ADRs does not re-route them; a blocking
+    ADR is only routed when the plan is first written (existing restart behavior
+    remains safe because the mailbox question is committed with the plan and
+    derive halts on restart).
+notes: 'Mode mapping: blocking ADRs always park the task because blocks includes
+  "task"; only the disposition differs (autonomous human-stop,
+  principal/detailed human-async). Remarkable ADRs reuse tousertoreview with
+  human-awareness (per adr-digest-mailbox) and never affect exit status. Prod
+  diff: new src/core/flows/adrs.ts plus small edits to iteration.ts, steer.ts,
+  plan schema, and architect prompts; no test file changes.'
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..77cdc06
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,28 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 4 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/adr-blocking-digest.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794141077557-483p7sylbhe.xml
+      junitCaseCount: 4
+      junitCaseIds:
+        - Blocking vs remarkable ADRs (§18).writes full ADR markdown with
+          context, decision, consequences, and blocking status
+        - Blocking vs remarkable ADRs (§18).routes a blocking ADR to the mailbox
+          with task blocks and halts with exit 10
+        - Blocking vs remarkable ADRs (§18).reports a remarkable ADR in the
+          digest and lets the run complete
+        - Blocking vs remarkable ADRs (§18).respects the active mode table for
+          blocking and remarkable ADRs
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..834660d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1118 @@
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
+  "slug": "adr-blocking-digest-v2",
+  "kind": "dev",
+  "title": "Blocking vs remarkable ADRs",
+  "assignment": "Blocking vs remarkable ADRs: full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Tests: blocking mailbox+blocks, remarkable digest only.",
+  "outlineRef": "adr-blocking-digest-v2",
+  "milestone": "m3-routing",
+  "wave": 9,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-human-debt-v2"
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
+diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..93ea758
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,29 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/adr-blocking-digest.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 4 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/adr-blocking-digest.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794140321411-2959obvy3if.xml
++      junitCaseCount: 4
++      junitCaseIds:
++        - Blocking vs remarkable ADRs (§18).writes full ADR markdown with
++          context, decision, consequences, and blocking status
++        - Blocking vs remarkable ADRs (§18).routes a blocking ADR to the mailbox
++          with task blocks and halts with exit 10
++        - Blocking vs remarkable ADRs (§18).reports a remarkable ADR in the
++          digest and lets the run complete
++        - Blocking vs remarkable ADRs (§18).respects the active mode table for
++          blocking and remarkable ADRs
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..093235e
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,53 @@
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
++  "slug": "adr-blocking-digest-v2",
++  "kind": "dev",
++  "title": "Blocking vs remarkable ADRs",
++  "assignment": "Blocking vs remarkable ADRs: full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Tests: blocking mailbox+blocks, remarkable digest only.",
++  "outlineRef": "adr-blocking-digest-v2",
++  "milestone": "m3-routing",
++  "wave": 9,
++  "deps": [
++    "modes-prompts-v2",
++    "routing-human-debt-v2"
++  ]
++}
++
++## Context & Citations
++[]
++
++## Review Feedback
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
++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..b916fdc
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 1
++name: test-first
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T12:05:42.040Z
++session: 01a1bb0c-d49b-736e-85f7-ce3566df1197
++endedAt: 2026-11-08T12:18:46.191Z
++usage:
++  inputTokens: 202597
++  outputTokens: 71225
++  costUsd: 0.113209
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-05-42-683Z_01a1bb0c-d49b-736e-85f7-ce3566df1197.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..df1dfe0
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,74 @@
++status: ok
++summary: "Authored test/engine/adr-blocking-digest.test.ts with four behavior
++  tests covering §18 blocking-vs-remarkable ADR routing. Tests specify: (1) full
++  ADR markdown with title/Context/Decision/Consequences/Blocking status; (2)
++  autonomous blocking ADR creates a task-blocking human-stop mailbox entry,
++  derives a blocked state, halts with exit 10, and dispositions.md keeps the
++  exit-10 contract; (3) a remarkable (unmarked) ADR appears only as a
++  human-awareness digest entry with empty blocks and lets the run complete exit
++  0; (4) the active mode table is respected: blocking ADRs are never remarkable
++  (autonomous human-stop, principal human-async, detailed
++  human-stop|human-async) while remarkable ADRs stay digest-only in every mode.
++  No production files were modified; all four tests are red on current code."
++target:
++  selectors:
++    - test/engine/adr-blocking-digest.test.ts
++  expectRed:
++    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
++      (§18).writes full ADR markdown with context, decision, consequences, and
++      blocking status
++    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
++      (§18).routes a blocking ADR to the mailbox with task blocks and halts with
++      exit 10
++    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
++      (§18).reports a remarkable ADR in the digest and lets the run complete
++    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
++      (§18).respects the active mode table for blocking and remarkable ADRs
++evidence:
++  - cd plugins/software-factory && bun install -> dependencies installed
++    (yaml/ajv/typescript), runner usable
++  - cd plugins/software-factory && bun run typecheck -> exit 0, no diagnostics
++  - cd plugins/software-factory && bun test
++    test/engine/adr-blocking-digest.test.ts -> 4 fail, 0 pass, 7 expect() calls;
++    failures are assertion failures, no import/collection errors
++  - cd plugins/software-factory && bun test
++    test/engine/adr-blocking-digest.test.ts --reporter=junit
++    --reporter-outfile=/tmp/adr-target-final.xml -> JUnit has tests="4", 4
++    <failure>, 0 <error> (target-red compatible)
++  - Default workspace TMPDIR run
++    (TMPDIR=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp) ->
++    same 4 failing target tests, 0 errors
++  - cd plugins/software-factory && TMPDIR=/tmp bun test --timeout 30000 -> 369
++    pass, 2 skip, 4 fail across 375 tests / 61 files; the 4 failures are exactly
++    the new target tests
++  - Direct AJV check of config/schemas/plan.schema.json with
++    adrs[0].blocking=true -> rejected by additionalProperties, confirming the
++    missing schema/type/writer/routing feature is the red cause
++  - cd plugins/software-factory && git status --short -> only '??
++    test/engine/adr-blocking-digest.test.ts'; no production changes
++concerns:
++  - "Mode disposition mapping is pinned by the tests: autonomous routes an
++    explicit blocking ADR as human-stop; principal uses human-async; detailed
++    accepts human-stop or human-async. This follows the plan's blocking-table
++    decision (autonomous blocks only on blocking ADR/high human-stop; principal
++    adds human-async; detailed adds all human-*)."
++  - Tests expect the mailbox question to identify the ADR via question text or
++    ref (id/title) so the operator can act on it; the implementation must
++    include that identity.
++  - The current plan.schema.json rejects PlanAdr.blocking, so the blocking test
++    cases fail at plan-step validation until the schema is extended; after that
++    they still require routing/halt behavior to pass.
++  - Existing routing-human-debt behavior (human-async/human-awareness review
++    dispositions) must remain unchanged; this suite only adds mode gating for
++    ADRs.
++notes: "Implementation guidance for the green step: (1) add optional `blocking`
++  to the plan schema's adrs items (type already has PlanAdr.blocking); (2) write
++  full ADR markdown with `# title`, `## Context`, `## Decision`, `##
++  Consequences`, `## Blocking`; (3) at plan commit, route ADRs via
++  writeQuestion: blocking -> blocks:[\"task\"] (autonomous human-stop,
++  principal/detailed human-async), remarkable -> human-awareness with blocks:[];
++  (4) ensure an open blocking-ADR question makes runIteration return blocked and
++  runTask return exit 10 with state.yaml blocked; (5) leave the human-stop
++  exit-10 text in agents/criteria/dispositions.md intact. Tests use the real
++  runTask/FakeHarness fixture and inspect the deployed task worktree's docs/adr
++  and steer/tousertoreview files."
+diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..928cafd
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,83 @@
++checks:
++  - id: gates
++    status: pass
++    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
++      (§7).detects when an agent commits and resets --soft to before.sha,
++      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
++      agent switches branch and restores original branch, keeping changes)"
++    details:
++      - id: typecheck
++        command: cd plugins/software-factory && bun run typecheck
++        status: pass
++        durationMs: 4967
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 87449
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-tu9chd/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 468811
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 468811
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 468811
++
++           373 pass
++           2 skip
++           0 fail
++           1743 expect() calls
++          Ran 375 tests across 61 files. [87.22s]
++          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
++        improvements:
++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
++            and resets --soft to before.sha, keeping changes staged"
++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
++            branch and restores original branch, keeping changes"
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/adr-blocking-digest.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794141069681-13vstdv7e7ze.xml
++      junitCaseCount: 4
++      junitCaseIds:
++        - Blocking vs remarkable ADRs (§18).writes full ADR markdown with
++          context, decision, consequences, and blocking status
++        - Blocking vs remarkable ADRs (§18).routes a blocking ADR to the mailbox
++          with task blocks and halts with exit 10
++        - Blocking vs remarkable ADRs (§18).reports a remarkable ADR in the
++          digest and lets the run complete
++        - Blocking vs remarkable ADRs (§18).respects the active mode table for
++          blocking and remarkable ADRs
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 131/300 production lines changed"
++    details:
++      changedLines:
++        added: 119
++        deleted: 12
++        total: 131
++        files:
++          - plugins/software-factory/agents/architect.md
++          - plugins/software-factory/agents/steps/architect-plan.md
++          - plugins/software-factory/config/schemas/plan.schema.json
++          - plugins/software-factory/src/core/flows/iteration.ts
++          - plugins/software-factory/src/core/steer.ts
++          - plugins/software-factory/src/core/flows/adrs.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..52cabcd
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,62 @@
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
++  "slug": "adr-blocking-digest-v2",
++  "kind": "dev",
++  "title": "Blocking vs remarkable ADRs",
++  "assignment": "Blocking vs remarkable ADRs: full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Tests: blocking mailbox+blocks, remarkable digest only.",
++  "outlineRef": "adr-blocking-digest-v2",
++  "milestone": "m3-routing",
++  "wave": 9,
++  "deps": [
++    "modes-prompts-v2",
++    "routing-human-debt-v2"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/adr-blocking-digest.test.ts"
++  ],
++  "expectRed": [
++    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).writes full ADR markdown with context, decision, consequences, and blocking status",
++    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).routes a blocking ADR to the mailbox with task blocks and halts with exit 10",
++    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).reports a remarkable ADR in the digest and lets the run complete",
++    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).respects the active mode table for blocking and remarkable ADRs"
++  ]
++}
++
++## Context & Citations
++[]
++
++## Review Feedback
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
++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..8ab252c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 2
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T12:20:34.906Z
++session: 01a1bb1a-7401-72e3-ac5a-117da2ab1335
++endedAt: 2026-11-08T12:31:15.103Z
++usage:
++  inputTokens: 81199
++  outputTokens: 24440
++  costUsd: 0.039067
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-20-35-457Z_01a1bb1a-7401-72e3-ac5a-117da2ab1335
+diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..f4a4606
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,54 @@
++status: ok
++summary: "Implemented blocking vs remarkable ADRs. New src/core/flows/adrs.ts
++  renders full ADR markdown (# title plus
++  Context/Decision/Consequences/Blocking) and routes each ADR through
++  steer/tousertoreview: blocking:true raises a task-blocking question under the
++  mode table (autonomous -> human-stop, principal/detailed -> human-async) with
++  blocks:[task], while remarkable/absent ADRs become human-awareness digest
++  entries with no blocks. iteration.ts now uses persistAdrs and halts the
++  iteration immediately when an open mailbox question blocks the task (derive
++  loop returns blocked/exit 10); plan.schema.json accepts `blocking`; steer.ts
++  gained hasOpenTaskBlockingQuestion; architect prompts document the field.
++  dispositions.md untouched, preserving the human-stop exit-code-10 contract."
++target:
++  selectors:
++    - test/engine/adr-blocking-digest.test.ts
++  expectRed:
++    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
++      (§18).writes full ADR markdown with context, decision, consequences, and
++      blocking status
++    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
++      (§18).routes a blocking ADR to the mailbox with task blocks and halts with
++      exit 10
++    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
++      (§18).reports a remarkable ADR in the digest and lets the run complete
++    - test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs
++      (§18).respects the active mode table for blocking and remarkable ADRs
++evidence:
++  - bun test test/engine/adr-blocking-digest.test.ts -> 4 pass, 0 fail, 44
++    expect() calls (was 0 pass / 4 fail before the change).
++  - bun run typecheck -> tsc --noEmit clean, exit 0.
++  - bun test (full suite, plugin dir) -> 373 pass, 2 skip, 0 fail across 61
++    files, 1743 expect() calls.
++  - "Regression subset: bun test test/engine/routing-human-debt.test.ts
++    test/engine/human-async-steering.test.ts
++    test/engine/story-happy-path.test.ts -> 7 pass, 0 fail."
++  - Target test asserts full ADR md sections (## Context/## Decision/##
++    Consequences/## Blocking true|false), blocking mailbox entry disposition +
++    blocks:[task] + state.yaml blocked + exit 10, remarkable human-awareness
++    with empty blocks and exit 0, and mode table routing for
++    autonomous/principal/detailed.
++concerns:
++  - First full-suite run overlapped with concurrently launched test commands and
++    one qa-red-test case hit its 5s timeout; the isolated rerun and a clean
++    full-suite run both passed, so it was CPU contention, not a code regression.
++  - Architect-revise output that changes ADRs does not re-route them; a blocking
++    ADR is only routed when the plan is first written (existing restart behavior
++    remains safe because the mailbox question is committed with the plan and
++    derive halts on restart).
++notes: 'Mode mapping: blocking ADRs always park the task because blocks includes
++  "task"; only the disposition differs (autonomous human-stop,
++  principal/detailed human-async). Remarkable ADRs reuse tousertoreview with
++  human-awareness (per adr-digest-mailbox) and never affect exit status. Prod
++  diff: new src/core/flows/adrs.ts plus small edits to iteration.ts, steer.ts,
++  plan schema, and architect prompts; no test file changes.'
+diff --git a/plugins/software-factory/agents/architect.md b/plugins/software-factory/agents/architect.md
+index 1f9a74e..f986f5a 100644
+--- a/plugins/software-factory/agents/architect.md
++++ b/plugins/software-factory/agents/architect.md
+@@ -30,6 +30,6 @@ Lead system architect. Design iteration execution plans, resolve milestone depen
+   - Isolate technical unknowns into spikes (`fact-finder`, `poc`, `test-assumptions`). Never build on unvalidated foundations.
+   - Epics permitted in root task plans only (depth 1); each epic outline requires full `intent` text.
+   - Tech debt must be categorized as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt require explicit resolutions.
+-  - Major structural or architectural choices require ADR entries (`id`, `title`, `context`, `decision`, `consequences`).
++  - Major structural or architectural choices require ADR entries (`id`, `title`, `context`, `decision`, `consequences`, `blocking`). Mark `blocking: true` only when the active human-involvement table requires a human decision; otherwise omit `blocking` (remarkable: reported in the digest, never waits).
+   - Flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
+ - Output MUST be the structured yield matching the assigned architect step schema.
+diff --git a/plugins/software-factory/agents/steps/architect-plan.md b/plugins/software-factory/agents/steps/architect-plan.md
+index 2063844..b30506b 100644
+--- a/plugins/software-factory/agents/steps/architect-plan.md
++++ b/plugins/software-factory/agents/steps/architect-plan.md
+@@ -11,7 +11,7 @@ Design the iteration execution plan (`plan-N.yaml`) decomposing task intent into
+ - Assumptions: document assumptions with rationale (`why`) and optional disposition if human confirmation is desired.
+ - Epics (root task only): define child epics for major subsystems (depth 1 only); each epic outline requires complete `intent` text.
+ - Tech debt: categorize technical debt as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt MUST include explicit resolutions.
+-- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`) for non-trivial design choices.
++- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`, `blocking`) for non-trivial design choices. Set `blocking: true` only when the active human-involvement table needs a human decision; remarkable ADRs (absent/`false`) go to the digest and never wait.
+ - Escalation: flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
+ - Output: yield the plan matching `plan.schema.json`.
+ 
+diff --git a/plugins/software-factory/config/schemas/plan.schema.json b/plugins/software-factory/config/schemas/plan.schema.json
+index 83032cf..b2db19c 100644
+--- a/plugins/software-factory/config/schemas/plan.schema.json
++++ b/plugins/software-factory/config/schemas/plan.schema.json
+@@ -123,7 +123,11 @@
+           "title": { "type": "string" },
+           "context": { "type": "string" },
+           "decision": { "type": "string" },
+-          "consequences": { "type": "string" }
++          "consequences": { "type": "string" },
++          "blocking": {
++            "type": "boolean",
++            "description": "Needs a human decision per the active human-involvement mode; false/absent is remarkable (digest only)"
++          }
+         },
+         "additionalProperties": false
+       }
+diff --git a/plugins/software-factory/src/core/flows/adrs.ts b/plugins/software-factory/src/core/flows/adrs.ts
+new file mode 100644
+index 0000000..b5a04f6
+--- /dev/null
++++ b/plugins/software-factory/src/core/flows/adrs.ts
+@@ -0,0 +1,67 @@
++import fs from "node:fs";
++import path from "node:path";
++import type { PipelineConfig, PlanAdr } from "../artifacts.js";
++import { writeTextAtomic } from "../records/io.js";
++import { writeQuestion } from "../steer.js";
++
++/**
++ * Human disposition a blocking ADR raises under the active involvement mode
++ * (§18 blocking table). Blocking ADRs always park the task; the mode only
++ * selects whether the operator is stopped (`autonomous`) or consulted
++ * asynchronously (`principal`/`detailed`). Remarkable ADRs never reach this
++ * table: they are digest-only `human-awareness` entries.
++ */
++export function blockingAdrDisposition(
++  mode: PipelineConfig["humanInvolvement"]
++): "human-stop" | "human-async" {
++  return mode === "principal" || mode === "detailed" ? "human-async" : "human-stop";
++}
++
++/** Renders the complete ADR markdown record (§8.4.2, td-adr-md-truncated). */
++export function renderAdrMarkdown(adr: PlanAdr): string {
++  const blocking = adr.blocking === true;
++  return [
++    `# ${adr.title}`,
++    "## Context",
++    adr.context,
++    "## Decision",
++    adr.decision,
++    "## Consequences",
++    adr.consequences?.trim() || "Not recorded.",
++    "## Blocking",
++    blocking
++      ? "true — needs a human decision per the active human-involvement mode."
++      : "false — remarkable; reported in the digest and never waits.",
++    "",
++  ].join("\n\n");
++}
++
++/**
++ * Persists each ADR as full markdown and routes it through the human mailbox:
++ * blocking ADRs raise a task-blocking question under the mode's disposition,
++ * remarkable ADRs a digest-only `human-awareness` entry with no blocks.
++ */
++export async function persistAdrs(opts: {
++  taskWt: string;
++  taskDir: string;
++  adrFolder: string;
++  adrs: PlanAdr[];
++  mode: PipelineConfig["humanInvolvement"];
++}): Promise<void> {
++  if (opts.adrs.length === 0) return;
++  const adrDir = path.join(opts.taskWt, opts.adrFolder);
++  await fs.promises.mkdir(adrDir, { recursive: true });
++  for (const adr of opts.adrs) {
++    await writeTextAtomic(path.join(adrDir, `${adr.id}.md`), renderAdrMarkdown(adr));
++    const blocking = adr.blocking === true;
++    await writeQuestion(opts.taskWt, opts.taskDir, {
++      ref: adr.id,
++      disposition: blocking ? blockingAdrDisposition(opts.mode) : "human-awareness",
++      question: blocking
++        ? `Blocking architectural decision ${adr.id} (${adr.title}) needs a human decision.`
++        : `Remarkable architectural decision ${adr.id} (${adr.title}) recorded for awareness.`,
++      draftDecision: adr.decision,
++      ...(blocking ? { blocks: ["task"] } : {}),
++    });
++  }
++}
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index abc124d..7d515ff 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -18,7 +18,8 @@ import { childBranch } from "../git/naming.js";
+ import { ensureChildWorktree, commitAll, removeWorktree } from "../git/index.js";
+ import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
+ import { runAgentStep } from "./step-runner.js";
+-import { writeQuestion } from "../steer.js";
++import { hasOpenTaskBlockingQuestion, writeQuestion } from "../steer.js";
++import { persistAdrs } from "./adrs.js";
+ import { runItemConsult } from "./consults.js";
+ import { mergeItem } from "./merge-path.js";
+ import { tickItemMachine } from "./item-machine.js";
+@@ -383,14 +384,15 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         };
+         await writeYamlAtomic(planPath, plan);
+ 
+-        // Write ADRs if specified (§8.4.2)
++        // Write full ADR records and route blocking/remarkable ones (§8.4.2, §18)
+         if (plan.adrs && project.adrFolder) {
+-          const adrDir = path.join(taskWt, project.adrFolder);
+-          await fs.promises.mkdir(adrDir, { recursive: true });
+-          for (const adr of plan.adrs) {
+-            const adrFile = path.join(adrDir, `${adr.id}.md`);
+-            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
+-          }
++          await persistAdrs({
++            taskWt,
++            taskDir,
++            adrFolder: project.adrFolder,
++            adrs: plan.adrs,
++            mode: pipeline.humanInvolvement,
++          });
+         }
+       },
+     });
+@@ -408,6 +410,17 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+       architectSessionId = planStepRes.sessionId;
+     }
+     await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
++
++    // A blocking ADR routed at plan time parks the task: halt before waves so
++    // the derive loop reports blocked and exits 10 (§18 blocking table).
++    if (await hasOpenTaskBlockingQuestion(taskDir)) {
++      return {
++        iteration,
++        status: "blocked",
++        plan,
++        architectSessionId,
++      };
++    }
+   }
+ 
+   // Check if PM edits are already completed
+diff --git a/plugins/software-factory/src/core/steer.ts b/plugins/software-factory/src/core/steer.ts
+index 207f45f..8f43240 100644
+--- a/plugins/software-factory/src/core/steer.ts
++++ b/plugins/software-factory/src/core/steer.ts
+@@ -8,7 +8,7 @@ import type {
+   SteerClassificationArtifact,
+ } from "./artifacts.js";
+ import type { PromptLibrary } from "./prompts.js";
+-import { writeYamlAtomic } from "./records/io.js";
++import { writeYamlAtomic, readYaml } from "./records/io.js";
+ import { defaultSchemaCache } from "./records/schema-cache.js";
+ 
+ /**
+@@ -121,6 +121,29 @@ export function questionBlocks(q: SteerItemArtifact, target: string): boolean {
+   return target === "task" && q.ref === "plan";
+ }
+ 
++/**
++ * True when an open question in the task mailbox blocks the task itself
++ * (§8.7). The plan step checks this after routing ADRs so a blocking decision
++ * halts the run (exit 10) instead of running the remaining waves.
++ */
++export async function hasOpenTaskBlockingQuestion(taskDir: string): Promise<boolean> {
++  const dir = path.join(taskDir, "steer", "tousertoreview");
++  if (!fs.existsSync(dir)) return false;
++  const names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith(".yaml"));
++  for (const name of names) {
++    const qPath = path.join(dir, name);
++    try {
++      const q = await readYaml<SteerItemArtifact>(qPath);
++      if (q && questionBlocks(q, "task")) return true;
++    } catch (err: any) {
++      if (err?.code !== "ENOENT") {
++        throw new Error(`Corrupt steer question file at ${qPath}: ${err?.message ?? err}`);
++      }
++    }
++  }
++  return false;
++}
++
+ /**
+  * Classifies an incoming pending message via `harness.complete` using the
+  * `steer-classify` system prompt and `steer-classification` schema (§8.8).
+diff --git a/plugins/software-factory/test/engine/adr-blocking-digest.test.ts b/plugins/software-factory/test/engine/adr-blocking-digest.test.ts
+new file mode 100644
+index 0000000..f72835f
+--- /dev/null
++++ b/plugins/software-factory/test/engine/adr-blocking-digest.test.ts
+@@ -0,0 +1,389 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runTask } from "../../src/core/engine.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml } from "../../src/core/records/io.js";
++import type {
++  PipelineConfig,
++  ProjectConfig,
++  StateArtifact,
++  SteerItemArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Blocking vs remarkable ADRs (docs/factory.v2.md §18; ADRs
++ * adr-humaninvolvement-config, adr-digest-mailbox, adr-human-stop,
++ * td-adr-md-truncated).
++ *
++ * Contract under test:
++ * - The ADR writer persists a complete markdown record: title plus Context,
++ *   Decision, Consequences, and the blocking classification.
++ * - `PlanAdr.blocking: true` follows the active mode's blocking table: it
++ *   creates a blocking `steer/tousertoreview` question (`blocks` includes the
++ *   task) and halts the run with exit 10. In autonomous mode the question uses
++ *   `human-stop`; principal/detailed may wait as `human-async`.
++ * - A remarkable ADR (`blocking: false`/absent) is reported in the digest with
++ *   `human-awareness` and empty blocks; it never blocks or halts the run.
++ * - dispositions.md keeps documenting the exit-10 human-stop contract.
++ */
++
++const ORCH = ".factory";
++
++const BLOCKING_ADR = {
++  id: "adr-blocking-choice",
++  title: "Blocking choice",
++  context: "The blocking context is significant",
++  decision: "Take the blocking decision",
++  consequences: "Blocking consequences follow",
++  blocking: true,
++} as const;
++
++const REMARKABLE_ADR = {
++  id: "adr-remarkable-choice",
++  title: "Remarkable choice",
++  context: "The remarkable context is informational",
++  decision: "Take the remarkable decision",
++  consequences: "Remarkable consequences follow",
++  blocking: false,
++} as const;
++
++/** A remarkable ADR may omit `blocking` entirely; only true is blocking. */
++const REMARKABLE_ADR_UNMARKED = {
++  id: "adr-unmarked-choice",
++  title: "Unmarked choice",
++  context: "The unmarked context is informational",
++  decision: "Take the unmarked decision",
++  consequences: "Unmarked consequences follow",
++} as const;
++
++interface AdrRun {
++  res: Awaited<ReturnType<typeof runTask>>;
++  deployedTaskDir: string;
++  deployedTaskWt: string;
++}
++
++describe("Blocking vs remarkable ADRs (§18)", () => {
++  let tmpRepo: TmpRepo;
++  const createdWorktreeRoots: string[] = [];
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    createdWorktreeRoots.length = 0;
++  });
++
++  afterEach(() => {
++    for (const root of createdWorktreeRoots) {
++      fs.rmSync(root, { recursive: true, force: true });
++    }
++    tmpRepo.cleanup();
++  });
++
++  function taskDirFor(task: string): string {
++    const dir = path.join(tmpRepo.dir, ORCH, task);
++    fs.mkdirSync(dir, { recursive: true });
++    fs.writeFileSync(path.join(dir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
++    tmpRepo.commit(`add ${task} intent`);
++    return dir;
++  }
++
++  async function mailbox(taskDir: string): Promise<SteerItemArtifact[]> {
++    const dir = path.join(taskDir, "steer", "tousertoreview");
++    if (!fs.existsSync(dir)) return [];
++    const names = fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
++    return Promise.all(names.map((n) => readYaml<SteerItemArtifact>(path.join(dir, n))));
++  }
++
++  function entriesFor(
++    entries: SteerItemArtifact[],
++    adr: { id: string; title: string }
++  ): SteerItemArtifact[] {
++    return entries.filter(
++      (q) =>
++        q.question.includes(adr.id) ||
++        q.question.includes(adr.title) ||
++        q.ref.includes(adr.id)
++    );
++  }
++
++  /**
++   * Runs a real task/repo fixture whose architect emits `adrs`, with every
++   * downstream step scripted so a non-halting path (remarkable ADRs only)
++   * finishes normally while a blocking path can halt earlier.
++   */
++  async function runAdrPlan(
++    task: string,
++    mode: NonNullable<PipelineConfig["humanInvolvement"]>,
++    adrs: Array<Record<string, unknown>>
++  ): Promise<AdrRun> {
++    taskDirFor(task);
++    const worktreeRoot = path.join(tmpRepo.dir + `-${task}-wt`);
++    fs.mkdirSync(worktreeRoot, { recursive: true });
++    createdWorktreeRoots.push(worktreeRoot);
++    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++    const harness = new FakeHarness();
++
++    const project: ProjectConfig = {
++      orchestrationFolder: ORCH,
++      adrFolder: "docs/adr",
++      worktreeRoot,
++    };
++    const pipeline: PipelineConfig = {
++      models: {
++        roles: {
++          workhorse: { model: "model-workhorse" },
++          "alt-workhorse": { model: "model-alt-workhorse" },
++          architect: { model: "model-architect" },
++          "alt-architect": { model: "model-alt-architect" },
++          simpler: { model: "model-simpler" },
++        },
++      },
++      agents: {
++        triage: { role: "workhorse" },
++        infra: { role: "workhorse" },
++        architect: { role: "architect" },
++        "plan-reviewer": { role: "alt-architect" },
++        pm: { role: "alt-workhorse" },
++        developer: { role: "workhorse" },
++        reviewer: { role: "alt-workhorse" },
++        "wave-close-up": { role: "alt-workhorse" },
++        "plan-close-up": { role: "alt-workhorse" },
++      },
++      flows: {
++        simple: { steps: [] },
++        story: {
++          dev: {
++            fixLoopTo: "develop",
++            steps: [
++              { id: "develop", agent: "developer", role: "workhorse" },
++              { id: "review", agent: "reviewer", role: "alt-workhorse" },
++            ],
++          },
++        },
++        spike: {},
++      },
++      humanInvolvement: mode,
++      reviewPolicy: {
++        default: [
++          "fix",
++          "optional",
++          "architect",
++          "human-awareness",
++          "human-async",
++          "human-stop",
++        ],
++      },
++      limits: {
++        maxParallelItems: 2,
++        maxParallelTurns: 4,
++        maxStepAttempts: 3,
++        maxFixRounds: 3,
++      },
++    };
++    const prompts = loadPromptLibrary({
++      builtinDir: path.resolve(import.meta.dir, "../../agents"),
++      overrideDirs: [],
++    });
++
++    harness.scriptOutcome(`${task}/runs/triage#a1`, {
++      ok: true,
++      data: { kind: "story", rationale: "ADR routing flow", citations: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/infra#a1`, {
++      ok: true,
++      data: {
++        setup: [],
++        gates: [{ id: "test", command: "true" }],
++        testRunner: { command: "true" },
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
++      ok: true,
++      data: {
++        iteration: 1,
++        milestones: [{ id: "m1", title: "M1" }],
++        itemOutlines: [
++          { slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1", deps: [] },
++        ],
++        adrs,
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: {
++        iteration: 1,
++        items: [
++          {
++            slug: "item-1",
++            outlineRef: "item-1",
++            kind: "dev",
++            title: "Item 1",
++            assignment: "Implement item 1",
++            milestone: "m1",
++            wave: 1,
++            deps: [],
++          },
++        ],
++      },
++    });
++    harness.scriptOutcome(`${task}/items/item-1/develop#a1`, (run) => {
++      fs.writeFileSync(path.join(run.cwd, "item-1.ts"), "export const item_1 = 1;\n");
++      return { ok: true, data: { status: "ok", summary: "Developed item-1" } };
++    });
++    harness.scriptOutcome(`${task}/items/item-1/review#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Approved", suggestions: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
++      ok: true,
++      data: {
++        wave: 1,
++        iteration: 1,
++        status: "complete",
++        mergedItems: ["item-1"],
++        summary: "Wave report",
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
++      ok: true,
++      data: {
++        id: "dec-wave-1",
++        context: "wave",
++        decision: "continue",
++        timestamp: new Date().toISOString(),
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
++      ok: true,
++      data: { iteration: 1, status: "complete", summary: "Plan close-up complete" },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
++      ok: true,
++      data: { iteration: 1, status: "complete", summary: "Iteration complete" },
++    });
++
++    const res = await runTask(
++      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
++      task,
++      { maxTicks: 30 }
++    );
++
++    return {
++      res,
++      deployedTaskDir: path.join(worktreeRoot, `topic_${task}`, ORCH, task),
++      deployedTaskWt: path.join(worktreeRoot, `topic_${task}`),
++    };
++  }
++
++  it("writes full ADR markdown with context, decision, consequences, and blocking status", async () => {
++    const { deployedTaskWt } = await runAdrPlan("adr-markdown", "autonomous", [
++      REMARKABLE_ADR_UNMARKED,
++    ]);
++
++    const remarkableMd = fs.readFileSync(
++      path.join(deployedTaskWt, "docs", "adr", `${REMARKABLE_ADR_UNMARKED.id}.md`),
++      "utf8"
++    );
++    expect(remarkableMd).toContain(`# ${REMARKABLE_ADR_UNMARKED.title}`);
++    expect(remarkableMd).toMatch(/^##\s+Context\s*$/m);
++    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.context);
++    expect(remarkableMd).toMatch(/^##\s+Decision\s*$/m);
++    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.decision);
++    expect(remarkableMd).toMatch(/^##\s+Consequences\s*$/m);
++    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.consequences);
++    expect(remarkableMd).toMatch(/^##\s+Blocking[\s\S]*?\b(false|no)\b/im);
++  }, 30000);
++
++  it("routes a blocking ADR to the mailbox with task blocks and halts with exit 10", async () => {
++    const { res, deployedTaskDir, deployedTaskWt } = await runAdrPlan(
++      "adr-blocking",
++      "autonomous",
++      [BLOCKING_ADR]
++    );
++
++    expect(res.status).toBe("blocked");
++    expect(res.exitCode).toBe(10);
++
++    const entries = await mailbox(deployedTaskDir);
++    const blocking = entriesFor(entries, BLOCKING_ADR);
++    expect(blocking).toHaveLength(1);
++    expect(blocking[0]!.disposition).toBe("human-stop");
++    expect(blocking[0]!.blocks ?? []).toContain("task");
++
++    const state = await readYaml<StateArtifact>(
++      path.join(deployedTaskDir, "state.yaml")
++    );
++    expect(state.status).toBe("blocked");
++
++    const blockingMd = fs.readFileSync(
++      path.join(deployedTaskWt, "docs", "adr", `${BLOCKING_ADR.id}.md`),
++      "utf8"
++    );
++    expect(blockingMd).toContain(`# ${BLOCKING_ADR.title}`);
++    expect(blockingMd).toContain(BLOCKING_ADR.decision);
++    expect(blockingMd).toMatch(/^##\s+Blocking[\s\S]*?\b(true|yes)\b/im);
++
++    // The exit-10 human-stop contract stays documented for reviewers.
++    const dispositions = fs.readFileSync(
++      path.resolve(import.meta.dir, "../../agents/criteria/dispositions.md"),
++      "utf8"
++    );
++    expect(dispositions).toMatch(/human-stop[\s\S]*?exit code 10/i);
++  }, 30000);
++
++  it("reports a remarkable ADR in the digest and lets the run complete", async () => {
++    const { res, deployedTaskDir } = await runAdrPlan("adr-remarkable", "autonomous", [
++      REMARKABLE_ADR_UNMARKED,
++    ]);
++
++    expect(res.status).toBe("done");
++    expect(res.exitCode).toBe(0);
++
++    const entries = await mailbox(deployedTaskDir);
++    const remarkable = entriesFor(entries, REMARKABLE_ADR_UNMARKED);
++    expect(remarkable).toHaveLength(1);
++    expect(remarkable[0]!.disposition).toBe("human-awareness");
++    expect(remarkable[0]!.blocks ?? []).toEqual([]);
++  }, 30000);
++
++  it("respects the active mode table for blocking and remarkable ADRs", async () => {
++    const expectations: Array<{
++      mode: NonNullable<PipelineConfig["humanInvolvement"]>;
++      blockingDispositions: string[];
++    }> = [
++      { mode: "autonomous", blockingDispositions: ["human-stop"] },
++      { mode: "principal", blockingDispositions: ["human-async"] },
++      { mode: "detailed", blockingDispositions: ["human-async", "human-stop"] },
++    ];
++
++    for (const { mode, blockingDispositions } of expectations) {
++      const { res, deployedTaskDir } = await runAdrPlan(
++        `adr-mode-${mode}`,
++        mode,
++        [BLOCKING_ADR, REMARKABLE_ADR]
++      );
++
++      // Both ADR classes are routed at plan time; the blocking decision parks
++      // the task regardless of which human disposition the mode selects.
++      expect(res.status).toBe("blocked");
++
++      const entries = await mailbox(deployedTaskDir);
++      const blocking = entriesFor(entries, BLOCKING_ADR);
++      expect(blocking).toHaveLength(1);
++      expect(blockingDispositions).toContain(blocking[0]!.disposition);
++      expect(blocking[0]!.blocks ?? []).toContain("task");
++
++      const remarkable = entriesFor(entries, REMARKABLE_ADR);
++      expect(remarkable).toHaveLength(1);
++      expect(remarkable[0]!.disposition).toBe("human-awareness");
++      expect(remarkable[0]!.blocks ?? []).toEqual([]);
++    }
++  }, 60000);
++});
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
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..9e63eeb
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/meta.yaml
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
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T12:31:17.483Z
+session: 01a1bb24-5d57-725d-b6bf-d0349e23e7cb
+endedAt: 2026-11-08T12:42:02.424Z
+usage:
+  inputTokens: 65357
+  outputTokens: 31219
+  costUsd: 0.013856
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-31-25-015Z_01a1bb24-5d57-725d-b6bf-d0349e23e7cb
diff --git a/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..851bc15
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,29 @@
+status: approved
+summary: 4 ADR tests green, gates pass, no weakening; blocking halts exit-10,
+  remarkable digest-only
+suggestions:
+  - detail: persistAdrs runs only inside initial architect-plan writeArtifact
+      (iteration.ts:387-396). architect-revise merges ADRs into plan-N.yaml
+      (iteration.ts:556-561) without markdown persistence or mailbox routing, so
+      a blocking ADR introduced or flipped during revise would update plan yaml
+      but never create docs/adr md or tousertoreview entry. Pre-existing gap
+      (old writer also plan-only) and developer-disclosed; no test covers
+      revise. Defer as tech debt or route on revise.
+    disposition: optional
+    id: revise-adr-reroute-gap
+    location:
+      file: plugins/software-factory/src/core/flows/iteration.ts
+      line: 556
+    summary: Revise-path ADRs not persisted or routed
+  - detail: renderAdrMarkdown falls back to Not recorded. when consequences
+      missing/blank (adrs.ts:30), but all fixtures provide consequences.
+      Markdown assertions cover unmarked remarkable (false) and autonomous
+      blocking (true) only; explicit blocking:false md and missing-consequences
+      fallback lack direct md assertions (mailbox covered). Consider one md
+      assertion for explicit-false/missing case to pin fallback.
+    disposition: optional
+    id: adr-md-edge-coverage
+    location:
+      file: plugins/software-factory/test/engine/adr-blocking-digest.test.ts
+      line: 285
+    summary: Missing md coverage for explicit-false/missing consequences
diff --git a/plugins/software-factory/agents/architect.md b/plugins/software-factory/agents/architect.md
index 1f9a74e..f986f5a 100644
--- a/plugins/software-factory/agents/architect.md
+++ b/plugins/software-factory/agents/architect.md
@@ -30,6 +30,6 @@ Lead system architect. Design iteration execution plans, resolve milestone depen
   - Isolate technical unknowns into spikes (`fact-finder`, `poc`, `test-assumptions`). Never build on unvalidated foundations.
   - Epics permitted in root task plans only (depth 1); each epic outline requires full `intent` text.
   - Tech debt must be categorized as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt require explicit resolutions.
-  - Major structural or architectural choices require ADR entries (`id`, `title`, `context`, `decision`, `consequences`).
+  - Major structural or architectural choices require ADR entries (`id`, `title`, `context`, `decision`, `consequences`, `blocking`). Mark `blocking: true` only when the active human-involvement table requires a human decision; otherwise omit `blocking` (remarkable: reported in the digest, never waits).
   - Flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
 - Output MUST be the structured yield matching the assigned architect step schema.
diff --git a/plugins/software-factory/agents/steps/architect-plan.md b/plugins/software-factory/agents/steps/architect-plan.md
index 2063844..b30506b 100644
--- a/plugins/software-factory/agents/steps/architect-plan.md
+++ b/plugins/software-factory/agents/steps/architect-plan.md
@@ -11,7 +11,7 @@ Design the iteration execution plan (`plan-N.yaml`) decomposing task intent into
 - Assumptions: document assumptions with rationale (`why`) and optional disposition if human confirmation is desired.
 - Epics (root task only): define child epics for major subsystems (depth 1 only); each epic outline requires complete `intent` text.
 - Tech debt: categorize technical debt as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt MUST include explicit resolutions.
-- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`) for non-trivial design choices.
+- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`, `blocking`) for non-trivial design choices. Set `blocking: true` only when the active human-involvement table needs a human decision; remarkable ADRs (absent/`false`) go to the digest and never wait.
 - Escalation: flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
 - Output: yield the plan matching `plan.schema.json`.
 
diff --git a/plugins/software-factory/config/schemas/plan.schema.json b/plugins/software-factory/config/schemas/plan.schema.json
index 83032cf..b2db19c 100644
--- a/plugins/software-factory/config/schemas/plan.schema.json
+++ b/plugins/software-factory/config/schemas/plan.schema.json
@@ -123,7 +123,11 @@
           "title": { "type": "string" },
           "context": { "type": "string" },
           "decision": { "type": "string" },
-          "consequences": { "type": "string" }
+          "consequences": { "type": "string" },
+          "blocking": {
+            "type": "boolean",
+            "description": "Needs a human decision per the active human-involvement mode; false/absent is remarkable (digest only)"
+          }
         },
         "additionalProperties": false
       }
diff --git a/plugins/software-factory/src/core/flows/adrs.ts b/plugins/software-factory/src/core/flows/adrs.ts
new file mode 100644
index 0000000..b5a04f6
--- /dev/null
+++ b/plugins/software-factory/src/core/flows/adrs.ts
@@ -0,0 +1,67 @@
+import fs from "node:fs";
+import path from "node:path";
+import type { PipelineConfig, PlanAdr } from "../artifacts.js";
+import { writeTextAtomic } from "../records/io.js";
+import { writeQuestion } from "../steer.js";
+
+/**
+ * Human disposition a blocking ADR raises under the active involvement mode
+ * (§18 blocking table). Blocking ADRs always park the task; the mode only
+ * selects whether the operator is stopped (`autonomous`) or consulted
+ * asynchronously (`principal`/`detailed`). Remarkable ADRs never reach this
+ * table: they are digest-only `human-awareness` entries.
+ */
+export function blockingAdrDisposition(
+  mode: PipelineConfig["humanInvolvement"]
+): "human-stop" | "human-async" {
+  return mode === "principal" || mode === "detailed" ? "human-async" : "human-stop";
+}
+
+/** Renders the complete ADR markdown record (§8.4.2, td-adr-md-truncated). */
+export function renderAdrMarkdown(adr: PlanAdr): string {
+  const blocking = adr.blocking === true;
+  return [
+    `# ${adr.title}`,
+    "## Context",
+    adr.context,
+    "## Decision",
+    adr.decision,
+    "## Consequences",
+    adr.consequences?.trim() || "Not recorded.",
+    "## Blocking",
+    blocking
+      ? "true — needs a human decision per the active human-involvement mode."
+      : "false — remarkable; reported in the digest and never waits.",
+    "",
+  ].join("\n\n");
+}
+
+/**
+ * Persists each ADR as full markdown and routes it through the human mailbox:
+ * blocking ADRs raise a task-blocking question under the mode's disposition,
+ * remarkable ADRs a digest-only `human-awareness` entry with no blocks.
+ */
+export async function persistAdrs(opts: {
+  taskWt: string;
+  taskDir: string;
+  adrFolder: string;
+  adrs: PlanAdr[];
+  mode: PipelineConfig["humanInvolvement"];
+}): Promise<void> {
+  if (opts.adrs.length === 0) return;
+  const adrDir = path.join(opts.taskWt, opts.adrFolder);
+  await fs.promises.mkdir(adrDir, { recursive: true });
+  for (const adr of opts.adrs) {
+    await writeTextAtomic(path.join(adrDir, `${adr.id}.md`), renderAdrMarkdown(adr));
+    const blocking = adr.blocking === true;
+    await writeQuestion(opts.taskWt, opts.taskDir, {
+      ref: adr.id,
+      disposition: blocking ? blockingAdrDisposition(opts.mode) : "human-awareness",
+      question: blocking
+        ? `Blocking architectural decision ${adr.id} (${adr.title}) needs a human decision.`
+        : `Remarkable architectural decision ${adr.id} (${adr.title}) recorded for awareness.`,
+      draftDecision: adr.decision,
+      ...(blocking ? { blocks: ["task"] } : {}),
+    });
+  }
+}
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index abc124d..7d515ff 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -18,7 +18,8 @@ import { childBranch } from "../git/naming.js";
 import { ensureChildWorktree, commitAll, removeWorktree } from "../git/index.js";
 import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
 import { runAgentStep } from "./step-runner.js";
-import { writeQuestion } from "../steer.js";
+import { hasOpenTaskBlockingQuestion, writeQuestion } from "../steer.js";
+import { persistAdrs } from "./adrs.js";
 import { runItemConsult } from "./consults.js";
 import { mergeItem } from "./merge-path.js";
 import { tickItemMachine } from "./item-machine.js";
@@ -383,14 +384,15 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
         };
         await writeYamlAtomic(planPath, plan);
 
-        // Write ADRs if specified (§8.4.2)
+        // Write full ADR records and route blocking/remarkable ones (§8.4.2, §18)
         if (plan.adrs && project.adrFolder) {
-          const adrDir = path.join(taskWt, project.adrFolder);
-          await fs.promises.mkdir(adrDir, { recursive: true });
-          for (const adr of plan.adrs) {
-            const adrFile = path.join(adrDir, `${adr.id}.md`);
-            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
-          }
+          await persistAdrs({
+            taskWt,
+            taskDir,
+            adrFolder: project.adrFolder,
+            adrs: plan.adrs,
+            mode: pipeline.humanInvolvement,
+          });
         }
       },
     });
@@ -408,6 +410,17 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
       architectSessionId = planStepRes.sessionId;
     }
     await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
+
+    // A blocking ADR routed at plan time parks the task: halt before waves so
+    // the derive loop reports blocked and exits 10 (§18 blocking table).
+    if (await hasOpenTaskBlockingQuestion(taskDir)) {
+      return {
+        iteration,
+        status: "blocked",
+        plan,
+        architectSessionId,
+      };
+    }
   }
 
   // Check if PM edits are already completed
diff --git a/plugins/software-factory/src/core/steer.ts b/plugins/software-factory/src/core/steer.ts
index 207f45f..8f43240 100644
--- a/plugins/software-factory/src/core/steer.ts
+++ b/plugins/software-factory/src/core/steer.ts
@@ -8,7 +8,7 @@ import type {
   SteerClassificationArtifact,
 } from "./artifacts.js";
 import type { PromptLibrary } from "./prompts.js";
-import { writeYamlAtomic } from "./records/io.js";
+import { writeYamlAtomic, readYaml } from "./records/io.js";
 import { defaultSchemaCache } from "./records/schema-cache.js";
 
 /**
@@ -121,6 +121,29 @@ export function questionBlocks(q: SteerItemArtifact, target: string): boolean {
   return target === "task" && q.ref === "plan";
 }
 
+/**
+ * True when an open question in the task mailbox blocks the task itself
+ * (§8.7). The plan step checks this after routing ADRs so a blocking decision
+ * halts the run (exit 10) instead of running the remaining waves.
+ */
+export async function hasOpenTaskBlockingQuestion(taskDir: string): Promise<boolean> {
+  const dir = path.join(taskDir, "steer", "tousertoreview");
+  if (!fs.existsSync(dir)) return false;
+  const names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith(".yaml"));
+  for (const name of names) {
+    const qPath = path.join(dir, name);
+    try {
+      const q = await readYaml<SteerItemArtifact>(qPath);
+      if (q && questionBlocks(q, "task")) return true;
+    } catch (err: any) {
+      if (err?.code !== "ENOENT") {
+        throw new Error(`Corrupt steer question file at ${qPath}: ${err?.message ?? err}`);
+      }
+    }
+  }
+  return false;
+}
+
 /**
  * Classifies an incoming pending message via `harness.complete` using the
  * `steer-classify` system prompt and `steer-classification` schema (§8.8).
diff --git a/plugins/software-factory/test/engine/adr-blocking-digest.test.ts b/plugins/software-factory/test/engine/adr-blocking-digest.test.ts
new file mode 100644
index 0000000..f72835f
--- /dev/null
+++ b/plugins/software-factory/test/engine/adr-blocking-digest.test.ts
@@ -0,0 +1,389 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runTask } from "../../src/core/engine.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readYaml } from "../../src/core/records/io.js";
+import type {
+  PipelineConfig,
+  ProjectConfig,
+  StateArtifact,
+  SteerItemArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Blocking vs remarkable ADRs (docs/factory.v2.md §18; ADRs
+ * adr-humaninvolvement-config, adr-digest-mailbox, adr-human-stop,
+ * td-adr-md-truncated).
+ *
+ * Contract under test:
+ * - The ADR writer persists a complete markdown record: title plus Context,
+ *   Decision, Consequences, and the blocking classification.
+ * - `PlanAdr.blocking: true` follows the active mode's blocking table: it
+ *   creates a blocking `steer/tousertoreview` question (`blocks` includes the
+ *   task) and halts the run with exit 10. In autonomous mode the question uses
+ *   `human-stop`; principal/detailed may wait as `human-async`.
+ * - A remarkable ADR (`blocking: false`/absent) is reported in the digest with
+ *   `human-awareness` and empty blocks; it never blocks or halts the run.
+ * - dispositions.md keeps documenting the exit-10 human-stop contract.
+ */
+
+const ORCH = ".factory";
+
+const BLOCKING_ADR = {
+  id: "adr-blocking-choice",
+  title: "Blocking choice",
+  context: "The blocking context is significant",
+  decision: "Take the blocking decision",
+  consequences: "Blocking consequences follow",
+  blocking: true,
+} as const;
+
+const REMARKABLE_ADR = {
+  id: "adr-remarkable-choice",
+  title: "Remarkable choice",
+  context: "The remarkable context is informational",
+  decision: "Take the remarkable decision",
+  consequences: "Remarkable consequences follow",
+  blocking: false,
+} as const;
+
+/** A remarkable ADR may omit `blocking` entirely; only true is blocking. */
+const REMARKABLE_ADR_UNMARKED = {
+  id: "adr-unmarked-choice",
+  title: "Unmarked choice",
+  context: "The unmarked context is informational",
+  decision: "Take the unmarked decision",
+  consequences: "Unmarked consequences follow",
+} as const;
+
+interface AdrRun {
+  res: Awaited<ReturnType<typeof runTask>>;
+  deployedTaskDir: string;
+  deployedTaskWt: string;
+}
+
+describe("Blocking vs remarkable ADRs (§18)", () => {
+  let tmpRepo: TmpRepo;
+  const createdWorktreeRoots: string[] = [];
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    createdWorktreeRoots.length = 0;
+  });
+
+  afterEach(() => {
+    for (const root of createdWorktreeRoots) {
+      fs.rmSync(root, { recursive: true, force: true });
+    }
+    tmpRepo.cleanup();
+  });
+
+  function taskDirFor(task: string): string {
+    const dir = path.join(tmpRepo.dir, ORCH, task);
+    fs.mkdirSync(dir, { recursive: true });
+    fs.writeFileSync(path.join(dir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
+    tmpRepo.commit(`add ${task} intent`);
+    return dir;
+  }
+
+  async function mailbox(taskDir: string): Promise<SteerItemArtifact[]> {
+    const dir = path.join(taskDir, "steer", "tousertoreview");
+    if (!fs.existsSync(dir)) return [];
+    const names = fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
+    return Promise.all(names.map((n) => readYaml<SteerItemArtifact>(path.join(dir, n))));
+  }
+
+  function entriesFor(
+    entries: SteerItemArtifact[],
+    adr: { id: string; title: string }
+  ): SteerItemArtifact[] {
+    return entries.filter(
+      (q) =>
+        q.question.includes(adr.id) ||
+        q.question.includes(adr.title) ||
+        q.ref.includes(adr.id)
+    );
+  }
+
+  /**
+   * Runs a real task/repo fixture whose architect emits `adrs`, with every
+   * downstream step scripted so a non-halting path (remarkable ADRs only)
+   * finishes normally while a blocking path can halt earlier.
+   */
+  async function runAdrPlan(
+    task: string,
+    mode: NonNullable<PipelineConfig["humanInvolvement"]>,
+    adrs: Array<Record<string, unknown>>
+  ): Promise<AdrRun> {
+    taskDirFor(task);
+    const worktreeRoot = path.join(tmpRepo.dir + `-${task}-wt`);
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    createdWorktreeRoots.push(worktreeRoot);
+    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    const harness = new FakeHarness();
+
+    const project: ProjectConfig = {
+      orchestrationFolder: ORCH,
+      adrFolder: "docs/adr",
+      worktreeRoot,
+    };
+    const pipeline: PipelineConfig = {
+      models: {
+        roles: {
+          workhorse: { model: "model-workhorse" },
+          "alt-workhorse": { model: "model-alt-workhorse" },
+          architect: { model: "model-architect" },
+          "alt-architect": { model: "model-alt-architect" },
+          simpler: { model: "model-simpler" },
+        },
+      },
+      agents: {
+        triage: { role: "workhorse" },
+        infra: { role: "workhorse" },
+        architect: { role: "architect" },
+        "plan-reviewer": { role: "alt-architect" },
+        pm: { role: "alt-workhorse" },
+        developer: { role: "workhorse" },
+        reviewer: { role: "alt-workhorse" },
+        "wave-close-up": { role: "alt-workhorse" },
+        "plan-close-up": { role: "alt-workhorse" },
+      },
+      flows: {
+        simple: { steps: [] },
+        story: {
+          dev: {
+            fixLoopTo: "develop",
+            steps: [
+              { id: "develop", agent: "developer", role: "workhorse" },
+              { id: "review", agent: "reviewer", role: "alt-workhorse" },
+            ],
+          },
+        },
+        spike: {},
+      },
+      humanInvolvement: mode,
+      reviewPolicy: {
+        default: [
+          "fix",
+          "optional",
+          "architect",
+          "human-awareness",
+          "human-async",
+          "human-stop",
+        ],
+      },
+      limits: {
+        maxParallelItems: 2,
+        maxParallelTurns: 4,
+        maxStepAttempts: 3,
+        maxFixRounds: 3,
+      },
+    };
+    const prompts = loadPromptLibrary({
+      builtinDir: path.resolve(import.meta.dir, "../../agents"),
+      overrideDirs: [],
+    });
+
+    harness.scriptOutcome(`${task}/runs/triage#a1`, {
+      ok: true,
+      data: { kind: "story", rationale: "ADR routing flow", citations: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/infra#a1`, {
+      ok: true,
+      data: {
+        setup: [],
+        gates: [{ id: "test", command: "true" }],
+        testRunner: { command: "true" },
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
+      ok: true,
+      data: {
+        iteration: 1,
+        milestones: [{ id: "m1", title: "M1" }],
+        itemOutlines: [
+          { slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1", deps: [] },
+        ],
+        adrs,
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
+      ok: true,
+      data: { status: "approved", summary: "Plan ok", suggestions: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
+      ok: true,
+      data: {
+        iteration: 1,
+        items: [
+          {
+            slug: "item-1",
+            outlineRef: "item-1",
+            kind: "dev",
+            title: "Item 1",
+            assignment: "Implement item 1",
+            milestone: "m1",
+            wave: 1,
+            deps: [],
+          },
+        ],
+      },
+    });
+    harness.scriptOutcome(`${task}/items/item-1/develop#a1`, (run) => {
+      fs.writeFileSync(path.join(run.cwd, "item-1.ts"), "export const item_1 = 1;\n");
+      return { ok: true, data: { status: "ok", summary: "Developed item-1" } };
+    });
+    harness.scriptOutcome(`${task}/items/item-1/review#a1`, {
+      ok: true,
+      data: { status: "approved", summary: "Approved", suggestions: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
+      ok: true,
+      data: {
+        wave: 1,
+        iteration: 1,
+        status: "complete",
+        mergedItems: ["item-1"],
+        summary: "Wave report",
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
+      ok: true,
+      data: {
+        id: "dec-wave-1",
+        context: "wave",
+        decision: "continue",
+        timestamp: new Date().toISOString(),
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
+      ok: true,
+      data: { iteration: 1, status: "complete", summary: "Plan close-up complete" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
+      ok: true,
+      data: { iteration: 1, status: "complete", summary: "Iteration complete" },
+    });
+
+    const res = await runTask(
+      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
+      task,
+      { maxTicks: 30 }
+    );
+
+    return {
+      res,
+      deployedTaskDir: path.join(worktreeRoot, `topic_${task}`, ORCH, task),
+      deployedTaskWt: path.join(worktreeRoot, `topic_${task}`),
+    };
+  }
+
+  it("writes full ADR markdown with context, decision, consequences, and blocking status", async () => {
+    const { deployedTaskWt } = await runAdrPlan("adr-markdown", "autonomous", [
+      REMARKABLE_ADR_UNMARKED,
+    ]);
+
+    const remarkableMd = fs.readFileSync(
+      path.join(deployedTaskWt, "docs", "adr", `${REMARKABLE_ADR_UNMARKED.id}.md`),
+      "utf8"
+    );
+    expect(remarkableMd).toContain(`# ${REMARKABLE_ADR_UNMARKED.title}`);
+    expect(remarkableMd).toMatch(/^##\s+Context\s*$/m);
+    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.context);
+    expect(remarkableMd).toMatch(/^##\s+Decision\s*$/m);
+    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.decision);
+    expect(remarkableMd).toMatch(/^##\s+Consequences\s*$/m);
+    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.consequences);
+    expect(remarkableMd).toMatch(/^##\s+Blocking[\s\S]*?\b(false|no)\b/im);
+  }, 30000);
+
+  it("routes a blocking ADR to the mailbox with task blocks and halts with exit 10", async () => {
+    const { res, deployedTaskDir, deployedTaskWt } = await runAdrPlan(
+      "adr-blocking",
+      "autonomous",
+      [BLOCKING_ADR]
+    );
+
+    expect(res.status).toBe("blocked");
+    expect(res.exitCode).toBe(10);
+
+    const entries = await mailbox(deployedTaskDir);
+    const blocking = entriesFor(entries, BLOCKING_ADR);
+    expect(blocking).toHaveLength(1);
+    expect(blocking[0]!.disposition).toBe("human-stop");
+    expect(blocking[0]!.blocks ?? []).toContain("task");
+
+    const state = await readYaml<StateArtifact>(
+      path.join(deployedTaskDir, "state.yaml")
+    );
+    expect(state.status).toBe("blocked");
+
+    const blockingMd = fs.readFileSync(
+      path.join(deployedTaskWt, "docs", "adr", `${BLOCKING_ADR.id}.md`),
+      "utf8"
+    );
+    expect(blockingMd).toContain(`# ${BLOCKING_ADR.title}`);
+    expect(blockingMd).toContain(BLOCKING_ADR.decision);
+    expect(blockingMd).toMatch(/^##\s+Blocking[\s\S]*?\b(true|yes)\b/im);
+
+    // The exit-10 human-stop contract stays documented for reviewers.
+    const dispositions = fs.readFileSync(
+      path.resolve(import.meta.dir, "../../agents/criteria/dispositions.md"),
+      "utf8"
+    );
+    expect(dispositions).toMatch(/human-stop[\s\S]*?exit code 10/i);
+  }, 30000);
+
+  it("reports a remarkable ADR in the digest and lets the run complete", async () => {
+    const { res, deployedTaskDir } = await runAdrPlan("adr-remarkable", "autonomous", [
+      REMARKABLE_ADR_UNMARKED,
+    ]);
+
+    expect(res.status).toBe("done");
+    expect(res.exitCode).toBe(0);
+
+    const entries = await mailbox(deployedTaskDir);
+    const remarkable = entriesFor(entries, REMARKABLE_ADR_UNMARKED);
+    expect(remarkable).toHaveLength(1);
+    expect(remarkable[0]!.disposition).toBe("human-awareness");
+    expect(remarkable[0]!.blocks ?? []).toEqual([]);
+  }, 30000);
+
+  it("respects the active mode table for blocking and remarkable ADRs", async () => {
+    const expectations: Array<{
+      mode: NonNullable<PipelineConfig["humanInvolvement"]>;
+      blockingDispositions: string[];
+    }> = [
+      { mode: "autonomous", blockingDispositions: ["human-stop"] },
+      { mode: "principal", blockingDispositions: ["human-async"] },
+      { mode: "detailed", blockingDispositions: ["human-async", "human-stop"] },
+    ];
+
+    for (const { mode, blockingDispositions } of expectations) {
+      const { res, deployedTaskDir } = await runAdrPlan(
+        `adr-mode-${mode}`,
+        mode,
+        [BLOCKING_ADR, REMARKABLE_ADR]
+      );
+
+      // Both ADR classes are routed at plan time; the blocking decision parks
+      // the task regardless of which human disposition the mode selects.
+      expect(res.status).toBe("blocked");
+
+      const entries = await mailbox(deployedTaskDir);
+      const blocking = entriesFor(entries, BLOCKING_ADR);
+      expect(blocking).toHaveLength(1);
+      expect(blockingDispositions).toContain(blocking[0]!.disposition);
+      expect(blocking[0]!.blocks ?? []).toContain("task");
+
+      const remarkable = entriesFor(entries, REMARKABLE_ADR);
+      expect(remarkable).toHaveLength(1);
+      expect(remarkable[0]!.disposition).toBe("human-awareness");
+      expect(remarkable[0]!.blocks ?? []).toEqual([]);
+    }
+  }, 60000);
+});

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

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
  "slug": "contracts-drift-fix",
  "kind": "dev",
  "title": "Producer type and schema drift",
  "assignment": "Schemas + TS only, no ingest/apply/runtime, no hydration, no routing. Own artifacts.ts + review-schema.ts + review.schema.json + wave-report output + plan-closeup + decisions schemas per adr-closeup-lifecycle-resolved (schema half). artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types (concernConfirms?: [{id,confirm:accept|reject,note?}], concernResolution?: {id,action:resolve|carry}). review-schema.ts + review.schema.json: add remarkable (fix additionalProperties failure). Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (fix developer-output capital-D bug). Triage/infra/pm-edit schemas still reject concerns (no change). Behavior/contract tests: structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions concernResolution, close-ups concernResolutions, architect concernConfirms all validate + typecheck with matching TS; lowercase detail validates and persists; reviewer remarkable passes; triage/infra/pm-edit reject. Verify: bun run typecheck + preflight. Budget ~140 prod lines.",
  "outlineRef": "contracts-drift-fix",
  "milestone": "m2-contracts-epic",
  "wave": 1,
  "scenarioRefs": [
    "m2-contracts-epic:1"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..f1150be
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,54 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (2 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+        - plugins/software-factory/test/contracts/concern-schemas.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 5 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/concern-schemas.test.ts
+        test/contracts/concern-artifact-types.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166351963-exb9u6798l.xml
+      junitCaseCount: 16
+      junitCaseIds:
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          and propagate to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern producer schemas.adds remarkable and lowercase detail to
+          reviewer, plan-reviewer, QA, and file review schemas
+        - Concern producer schemas.adds concernConfirms and concernResolution to
+          architect report decisions
+        - Concern producer schemas.adds concernConfirms to plan close-up outputs
+          while preserving concernResolutions
+        - Concern producer schemas.accepts structured concerns and remarkable
+          across every developer, fact-finder, and plan step
+        - Concern artifact types.exposes structured concerns and remarkable
+          decisions with strict vocabularies
+        - Concern artifact types.stores concern lifecycle metadata including
+          pending resolution and escalation
+        - Concern artifact types.adds dismiss to review dispositions without a
+          tech-debt value
+        - Concern artifact types.marks plan ADRs as blocking or remarkable
+        - Concern artifact types.adds human involvement modes, concern
+          thresholds, and canonical review policy to pipeline config
+        - Concern artifact types.types structured concerns and remarkable
+          decisions on every producer artifact
+        - Concern artifact types.types concern confirmations and decision
+          resolutions with strict vocabularies
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..2308ad5
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,61 @@
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
+  "slug": "contracts-drift-fix",
+  "kind": "dev",
+  "title": "Producer type and schema drift",
+  "assignment": "Schemas + TS only, no ingest/apply/runtime, no hydration, no routing. Own artifacts.ts + review-schema.ts + review.schema.json + wave-report output + plan-closeup + decisions schemas per adr-closeup-lifecycle-resolved (schema half). artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types (concernConfirms?: [{id,confirm:accept|reject,note?}], concernResolution?: {id,action:resolve|carry}). review-schema.ts + review.schema.json: add remarkable (fix additionalProperties failure). Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (fix developer-output capital-D bug). Triage/infra/pm-edit schemas still reject concerns (no change). Behavior/contract tests: structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions concernResolution, close-ups concernResolutions, architect concernConfirms all validate + typecheck with matching TS; lowercase detail validates and persists; reviewer remarkable passes; triage/infra/pm-edit reject. Verify: bun run typecheck + preflight. Budget ~140 prod lines.",
+  "outlineRef": "contracts-drift-fix",
+  "milestone": "m2-contracts-epic",
+  "wave": 1,
+  "scenarioRefs": [
+    "m2-contracts-epic:1"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..bf194ad
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/meta.yaml
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
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-08T19:23:16.026Z
+session: 01a1bc9d-7062-7698-8bc3-753918712099
+endedAt: 2026-11-08T19:32:34.291Z
+usage:
+  inputTokens: 125749
+  outputTokens: 48070
+  costUsd: 0.058982
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-962Z_01a1bc9d-7062-7698-8bc3-753918712099
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..236049f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,87 @@
+status: ok
+summary: "Authored test-first contract coverage for the producer type/schema
+  drift: (1) review/QA/plan-reviewer outputs must accept remarkable[] plus
+  lowercase concern detail (generated review-schema.ts and
+  config/schemas/review.schema.json currently reject remarkable via
+  additionalProperties:false); (2) architect decision outputs
+  (decisions.schema.json used by
+  architect-wave-report/consult-item/consult-nonitem) must accept
+  concernConfirms[] (id+confirm:accept|reject, optional note) and a singular
+  concernResolution {id, action:resolve|carry}; (3) plan-closeup schema (shared
+  by plan-close-up and architect-closeup) must accept concernConfirms[] while
+  retaining concernResolutions[] (resolve|carry|propagate); (4) TS artifacts
+  must type DeveloperOutput/FactFinder/Review/WaveCloseup/PlanCloseup/Decision
+  concerns as Concern[], add newConcerns/remarkable to ReviewArtifact, and add
+  ConcernConfirms/ConcernResolution types plus concernConfirms/concernResolution
+  fields. Also extended the untouched-schema guard to assert
+  triage/infra/pm-edit reject the new fields, and added regression coverage
+  across all developer steps
+  (develop/poc/test-assumptions/test-first/simple-implement/fix-round),
+  fact-finder research, architect plan/revise, and close-ups. Existing
+  production code is untouched; only the two test files changed."
+target:
+  selectors:
+    - test/contracts/concern-schemas.test.ts
+    - test/contracts/concern-artifact-types.test.ts
+  expectRed:
+    - Concern producer schemas.adds remarkable and lowercase detail to reviewer,
+      plan-reviewer, QA, and file review schemas
+    - Concern producer schemas.adds concernConfirms and concernResolution to
+      architect report decisions
+    - Concern producer schemas.adds concernConfirms to plan close-up outputs
+      while preserving concernResolutions
+    - Concern artifact types.types structured concerns and remarkable decisions
+      on every producer artifact
+    - Concern artifact types.types concern confirmations and decision
+      resolutions with strict vocabularies
+evidence:
+  - "Test infra proven: bun install completed; `bun test
+    test/contracts/concern-schemas.test.ts
+    test/contracts/concern-artifact-types.test.ts` runs 16 tests (11 pass, 5
+    fail) with the 5 target tests failing as assertion failures on current
+    production code."
+  - "JUnit check: ran the two files with `--reporter=junit
+    --reporter-outfile=/tmp/junit-target.xml`; parsed the XML and matched every
+    declared expectRed id to a `<failure>` case (none missing, none error/skip):
+    review/QA/plan-reviewer remarkable, decisions
+    concernConfirms+concernResolution, plan-closeup concernConfirms, producer
+    concern typing, and ConcernConfirms/ConcernResolution typing."
+  - "Red failure content verified: S1 reports missing inline remarkable[] for
+    qa/reviewer/review-file/plan-reviewer; S2 reports missing concernConfirms[]
+    and concernResolution for all three architect decision steps; S3 reports
+    missing concernConfirms[] for plan-closeup and architect-closeup; type tests
+    report missing concerns on FactFinder/WaveCloseup/PlanCloseup/Decision,
+    missing newConcerns on ReviewArtifact, string-typed DeveloperOutput
+    concerns, and missing ConcernConfirms/ConcernResolution exports."
+  - "`bun run typecheck` exits 0 with the new test code (no production changes)."
+  - "`bun test test/contracts/` runs 17 tests across 3 files: 12 pass, only the
+    5 declared target tests fail; existing state/concern contract tests remain
+    green."
+  - "`git status --short` shows only the two test files modified (no production
+    paths touched, no stub files needed)."
+concerns:
+  - Some required schema behavior already exists in the current base
+    (developer-output, fact-finder-output, plan.schema, wave-closeup and
+    plan-closeup already carry concerns/remarkable and lowercase detail), so the
+    new developer/fact-finder/plan/close-up schema test is regression coverage
+    that passes now; the declared red cases target the actual remaining drift
+    (TS interfaces, review remarkable, decisions
+    concernConfirms/concernResolution, plan-closeup concernConfirms).
+  - "Tests deliberately pin the assignment's API names: `ConcernConfirms`
+    (element type) and `ConcernResolution`, and the singular decision
+    `concernResolution.action` enum is resolve|carry with no propagate. Close-up
+    `concernResolutions[]` retains the existing resolve|carry|propagate
+    vocabulary."
+  - The singular `concernResolution` test shape is {id, action} per the
+    assignment; note is only required on concernConfirms and on close-up
+    concernResolutions.
+notes: "Implementation for the next step: artifacts.ts needs
+  ConcernConfirms/ConcernResolution interfaces,
+  DeveloperOutputArtifact.concerns: Concern[] (currently string[]),
+  ReviewArtifact.newConcerns/remarkable, and concerns/remarkable on
+  FactFinder/WaveCloseup/PlanCloseup/Decision plus concernConfirms on
+  PlanCloseup/Decision and concernResolution on Decision. review-schema.ts and
+  review.schema.json need remarkable[]; decisions.schema.json needs
+  concernConfirms[] and concernResolution; plan-closeup.schema.json needs
+  concernConfirms[]. Keep triage/infra/plan-edits schemas free of all concern
+  fields."
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..a3b5f35
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,113 @@
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
+        durationMs: 4109
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 85157
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-xieodZ/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2487340
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2487340
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2487340
+
+           390 pass
+           2 skip
+           0 fail
+           1815 expect() calls
+          Ran 392 tests across 65 files. [84.98s]
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
+        test/contracts/concern-schemas.test.ts
+        test/contracts/concern-artifact-types.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167420985-1nnc5tzz8iz.xml
+      junitCaseCount: 16
+      junitCaseIds:
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          and propagate to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern producer schemas.adds remarkable and lowercase detail to
+          reviewer, plan-reviewer, QA, and file review schemas
+        - Concern producer schemas.adds concernConfirms and concernResolution to
+          architect report decisions
+        - Concern producer schemas.adds concernConfirms to plan close-up outputs
+          while preserving concernResolutions
+        - Concern producer schemas.accepts structured concerns and remarkable
+          across every developer, fact-finder, and plan step
+        - Concern artifact types.exposes structured concerns and remarkable
+          decisions with strict vocabularies
+        - Concern artifact types.stores concern lifecycle metadata including
+          pending resolution and escalation
+        - Concern artifact types.adds dismiss to review dispositions without a
+          tech-debt value
+        - Concern artifact types.marks plan ADRs as blocking or remarkable
+        - Concern artifact types.adds human involvement modes, concern
+          thresholds, and canonical review policy to pipeline config
+        - Concern artifact types.types structured concerns and remarkable
+          decisions on every producer artifact
+        - Concern artifact types.types concern confirmations and decision
+          resolutions with strict vocabularies
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 99/300 production lines changed"
+    details:
+      changedLines:
+        added: 98
+        deleted: 1
+        total: 99
+        files:
+          - plugins/software-factory/config/schemas/decisions.schema.json
+          - plugins/software-factory/config/schemas/plan-closeup.schema.json
+          - plugins/software-factory/config/schemas/review.schema.json
+          - plugins/software-factory/src/core/artifacts.ts
+          - plugins/software-factory/src/core/records/review-schema.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..ce3b01c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,72 @@
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
+  "slug": "contracts-drift-fix",
+  "kind": "dev",
+  "title": "Producer type and schema drift",
+  "assignment": "Schemas + TS only, no ingest/apply/runtime, no hydration, no routing. Own artifacts.ts + review-schema.ts + review.schema.json + wave-report output + plan-closeup + decisions schemas per adr-closeup-lifecycle-resolved (schema half). artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types (concernConfirms?: [{id,confirm:accept|reject,note?}], concernResolution?: {id,action:resolve|carry}). review-schema.ts + review.schema.json: add remarkable (fix additionalProperties failure). Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (fix developer-output capital-D bug). Triage/infra/pm-edit schemas still reject concerns (no change). Behavior/contract tests: structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions concernResolution, close-ups concernResolutions, architect concernConfirms all validate + typecheck with matching TS; lowercase detail validates and persists; reviewer remarkable passes; triage/infra/pm-edit reject. Verify: bun run typecheck + preflight. Budget ~140 prod lines.",
+  "outlineRef": "contracts-drift-fix",
+  "milestone": "m2-contracts-epic",
+  "wave": 1,
+  "scenarioRefs": [
+    "m2-contracts-epic:1"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/contracts/concern-schemas.test.ts",
+    "test/contracts/concern-artifact-types.test.ts"
+  ],
+  "expectRed": [
+    "Concern producer schemas.adds remarkable and lowercase detail to reviewer, plan-reviewer, QA, and file review schemas",
+    "Concern producer schemas.adds concernConfirms and concernResolution to architect report decisions",
+    "Concern producer schemas.adds concernConfirms to plan close-up outputs while preserving concernResolutions",
+    "Concern artifact types.types structured concerns and remarkable decisions on every producer artifact",
+    "Concern artifact types.types concern confirmations and decision resolutions with strict vocabularies"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/artifacts.ts:313-325",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..ee54411
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
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
+status: ok
+startedAt: 2026-11-08T19:39:01.205Z
+session: 01a1bcab-da9e-710d-971b-834551bd0f4f
+endedAt: 2026-11-08T19:50:23.018Z
+usage:
+  inputTokens: 107935
+  outputTokens: 30431
+  costUsd: 0.047594
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-662Z_01a1bcab-da9e-710d-971b-834551bd0f4f.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..0e94700
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,55 @@
+status: ok
+summary: "Implemented the producer type/schema drift fix: added
+  remarkable/concern fields to review schemas and artifact types,
+  concernConfirms to architect wave-report (decisions) and plan close-up
+  schemas, concernResolution to decisions schema, and matching
+  ConcernConfirms/ConcernResolution/CloseupConcernResolution TS types.
+  DeveloperOutput now uses Concern[] instead of string[]. Target contract tests
+  are green and typecheck passes."
+target:
+  selectors:
+    - test/contracts/concern-schemas.test.ts
+    - test/contracts/concern-artifact-types.test.ts
+  expectRed:
+    - Concern producer schemas.adds remarkable and lowercase detail to reviewer,
+      plan-reviewer, QA, and file review schemas
+    - Concern producer schemas.adds concernConfirms and concernResolution to
+      architect report decisions
+    - Concern producer schemas.adds concernConfirms to plan close-up outputs
+      while preserving concernResolutions
+    - Concern artifact types.types structured concerns and remarkable decisions
+      on every producer artifact
+    - Concern artifact types.types concern confirmations and decision
+      resolutions with strict vocabularies
+evidence:
+  - bun test test/contracts/concern-schemas.test.ts
+    test/contracts/concern-artifact-types.test.ts -> 16 pass, 0 fail (all 5
+    previously-red target cases green)
+  - bun run typecheck -> exit 0
+  - bun test test/contracts test/cli/cli.test.ts -> 33 pass, 0 fail (includes
+    factory preflight validation cases)
+  - bun test test/engine/concerns-funnel.test.ts
+    test/engine/reviewer-triage.test.ts test/engine/plan-reviewer-triage.test.ts
+    test/engine/routing-architect-consult.test.ts test/prompts.test.ts
+    test/validation-seams-hooks.test.ts -> 66 pass, 0 fail
+  - bun test over remaining non-engine suites (checks/git/harness/root tests) ->
+    210 tests, 208 pass, 2 skip, 0 fail
+  - bun test over all 27 engine test files in two chunks -> 46 pass, 0 fail and
+    35 pass, 0 fail (no failures across the full 65-file suite)
+  - grep -rn '"Detail"' plugins/software-factory/config/schemas -> no matches;
+    lowercase detail validates and persists in developer, decisions, close-up,
+    and review producers
+concerns:
+  - TypeScript Concern.detail and Concern.severity remain required while the
+    JSON schemas treat them as optional and let the concern store apply
+    defaults; the new contract tests do not require loosening this, but it is
+    residual schema/TS strictness drift.
+  - "The test-first fixture used a @ts-expect-error directly above a multi-line
+    object literal; TypeScript reports nested excess-property errors on the
+    property line, making that directive 'unused'. The directive was moved to
+    the nested concerns property line (test-only, intent unchanged: capital-D
+    Detail must be rejected)."
+notes: "Production changes stay within the schema/type-only scope: no ingest,
+  apply, hydration, routing, or runtime behavior changed. Prod diff is 99
+  inserted lines across artifacts.ts, review-schema.ts, and the reviewed schema
+  JSON files, within the ~140-line budget."
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..e5263ae
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,91 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 5 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/concern-schemas.test.ts
+        test/contracts/concern-artifact-types.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794167425206-wg7pj48m2nq.xml
+      junitCaseCount: 16
+      junitCaseIds:
+        - Concern producer schemas.inlines the concern definition into every
+          producer schema without external refs
+        - Concern producer schemas.inlines the remarkable decision definition
+          with chosen, alternatives, and why
+        - Concern producer schemas.adds newConcerns to review and QA schemas
+          outside the triage suggestions
+        - Concern producer schemas.adds concernResolutions with resolve, carry,
+          and propagate to close-up schemas
+        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
+          untouched
+        - Concern producer schemas.adds remarkable and lowercase detail to
+          reviewer, plan-reviewer, QA, and file review schemas
+        - Concern producer schemas.adds concernConfirms and concernResolution to
+          architect report decisions
+        - Concern producer schemas.adds concernConfirms to plan close-up outputs
+          while preserving concernResolutions
+        - Concern producer schemas.accepts structured concerns and remarkable
+          across every developer, fact-finder, and plan step
+        - Concern artifact types.exposes structured concerns and remarkable
+          decisions with strict vocabularies
+        - Concern artifact types.stores concern lifecycle metadata including
+          pending resolution and escalation
+        - Concern artifact types.adds dismiss to review dispositions without a
+          tech-debt value
+        - Concern artifact types.marks plan ADRs as blocking or remarkable
+        - Concern artifact types.adds human involvement modes, concern
+          thresholds, and canonical review policy to pipeline config
+        - Concern artifact types.types structured concerns and remarkable
+          decisions on every producer artifact
+        - Concern artifact types.types concern confirmations and decision
+          resolutions with strict vocabularies
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (1 test files, 910 bytes)
+    details:
+      diff: "diff --git
+        a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+        b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+
+        index 7b8bae7..9d8733c 100644
+
+        ---
+        a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+
+        +++
+        b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+
+        @@ -387,10 +387,10 @@ const review: ReviewArtifact = {
+
+        \ // @ts-expect-error developer concerns are structured concerns, not
+        free-form strings
+
+        \ const stringConcerns: DeveloperOutputArtifact = { status: \"ok\",
+        summary: \"x\", concerns: [\"tech debt\"] };
+
+        \\ 
+
+        -// @ts-expect-error concern detail is lowercase; capital Detail is not
+        part of the contract
+
+        \ const capitalDetail: DeveloperOutputArtifact = {
+
+        \   status: \"ok\",
+
+        \   summary: \"x\",
+
+        +  // @ts-expect-error capital Detail is not part of the contract
+
+        \   concerns: [{ kind: \"risk\", summary: \"x\", Detail: \"wrong
+        casing\" }],
+
+        \ };
+
+        \ "
+      files:
+        - plugins/software-factory/test/contracts/concern-artifact-types.test.ts
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..3e9aa5a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1320 @@
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
+  "slug": "contracts-drift-fix",
+  "kind": "dev",
+  "title": "Producer type and schema drift",
+  "assignment": "Schemas + TS only, no ingest/apply/runtime, no hydration, no routing. Own artifacts.ts + review-schema.ts + review.schema.json + wave-report output + plan-closeup + decisions schemas per adr-closeup-lifecycle-resolved (schema half). artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types (concernConfirms?: [{id,confirm:accept|reject,note?}], concernResolution?: {id,action:resolve|carry}). review-schema.ts + review.schema.json: add remarkable (fix additionalProperties failure). Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (fix developer-output capital-D bug). Triage/infra/pm-edit schemas still reject concerns (no change). Behavior/contract tests: structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions concernResolution, close-ups concernResolutions, architect concernConfirms all validate + typecheck with matching TS; lowercase detail validates and persists; reviewer remarkable passes; triage/infra/pm-edit reject. Verify: bun run typecheck + preflight. Budget ~140 prod lines.",
+  "outlineRef": "contracts-drift-fix",
+  "milestone": "m2-contracts-epic",
+  "wave": 1,
+  "scenarioRefs": [
+    "m2-contracts-epic:1"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/artifacts.ts:313-325",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
+diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..f1150be
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,54 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (2 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/contracts/concern-artifact-types.test.ts
++        - plugins/software-factory/test/contracts/concern-schemas.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 5 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/contracts/concern-schemas.test.ts
++        test/contracts/concern-artifact-types.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166351963-exb9u6798l.xml
++      junitCaseCount: 16
++      junitCaseIds:
++        - Concern producer schemas.inlines the concern definition into every
++          producer schema without external refs
++        - Concern producer schemas.inlines the remarkable decision definition
++          with chosen, alternatives, and why
++        - Concern producer schemas.adds newConcerns to review and QA schemas
++          outside the triage suggestions
++        - Concern producer schemas.adds concernResolutions with resolve, carry,
++          and propagate to close-up schemas
++        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
++          untouched
++        - Concern producer schemas.adds remarkable and lowercase detail to
++          reviewer, plan-reviewer, QA, and file review schemas
++        - Concern producer schemas.adds concernConfirms and concernResolution to
++          architect report decisions
++        - Concern producer schemas.adds concernConfirms to plan close-up outputs
++          while preserving concernResolutions
++        - Concern producer schemas.accepts structured concerns and remarkable
++          across every developer, fact-finder, and plan step
++        - Concern artifact types.exposes structured concerns and remarkable
++          decisions with strict vocabularies
++        - Concern artifact types.stores concern lifecycle metadata including
++          pending resolution and escalation
++        - Concern artifact types.adds dismiss to review dispositions without a
++          tech-debt value
++        - Concern artifact types.marks plan ADRs as blocking or remarkable
++        - Concern artifact types.adds human involvement modes, concern
++          thresholds, and canonical review policy to pipeline config
++        - Concern artifact types.types structured concerns and remarkable
++          decisions on every producer artifact
++        - Concern artifact types.types concern confirmations and decision
++          resolutions with strict vocabularies
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..2308ad5
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,61 @@
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
++  "slug": "contracts-drift-fix",
++  "kind": "dev",
++  "title": "Producer type and schema drift",
++  "assignment": "Schemas + TS only, no ingest/apply/runtime, no hydration, no routing. Own artifacts.ts + review-schema.ts + review.schema.json + wave-report output + plan-closeup + decisions schemas per adr-closeup-lifecycle-resolved (schema half). artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types (concernConfirms?: [{id,confirm:accept|reject,note?}], concernResolution?: {id,action:resolve|carry}). review-schema.ts + review.schema.json: add remarkable (fix additionalProperties failure). Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (fix developer-output capital-D bug). Triage/infra/pm-edit schemas still reject concerns (no change). Behavior/contract tests: structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions concernResolution, close-ups concernResolutions, architect concernConfirms all validate + typecheck with matching TS; lowercase detail validates and persists; reviewer remarkable passes; triage/infra/pm-edit reject. Verify: bun run typecheck + preflight. Budget ~140 prod lines.",
++  "outlineRef": "contracts-drift-fix",
++  "milestone": "m2-contracts-epic",
++  "wave": 1,
++  "scenarioRefs": [
++    "m2-contracts-epic:1"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/artifacts.ts:313-325",
++    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/artifacts.ts:313-325",
++  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
++]
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
+diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..bf194ad
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/meta.yaml
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
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-08T19:23:16.026Z
++session: 01a1bc9d-7062-7698-8bc3-753918712099
++endedAt: 2026-11-08T19:32:34.291Z
++usage:
++  inputTokens: 125749
++  outputTokens: 48070
++  costUsd: 0.058982
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-962Z_01a1bc9d-7062-7698-8bc3-753918712099
+diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..236049f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,87 @@
++status: ok
++summary: "Authored test-first contract coverage for the producer type/schema
++  drift: (1) review/QA/plan-reviewer outputs must accept remarkable[] plus
++  lowercase concern detail (generated review-schema.ts and
++  config/schemas/review.schema.json currently reject remarkable via
++  additionalProperties:false); (2) architect decision outputs
++  (decisions.schema.json used by
++  architect-wave-report/consult-item/consult-nonitem) must accept
++  concernConfirms[] (id+confirm:accept|reject, optional note) and a singular
++  concernResolution {id, action:resolve|carry}; (3) plan-closeup schema (shared
++  by plan-close-up and architect-closeup) must accept concernConfirms[] while
++  retaining concernResolutions[] (resolve|carry|propagate); (4) TS artifacts
++  must type DeveloperOutput/FactFinder/Review/WaveCloseup/PlanCloseup/Decision
++  concerns as Concern[], add newConcerns/remarkable to ReviewArtifact, and add
++  ConcernConfirms/ConcernResolution types plus concernConfirms/concernResolution
++  fields. Also extended the untouched-schema guard to assert
++  triage/infra/pm-edit reject the new fields, and added regression coverage
++  across all developer steps
++  (develop/poc/test-assumptions/test-first/simple-implement/fix-round),
++  fact-finder research, architect plan/revise, and close-ups. Existing
++  production code is untouched; only the two test files changed."
++target:
++  selectors:
++    - test/contracts/concern-schemas.test.ts
++    - test/contracts/concern-artifact-types.test.ts
++  expectRed:
++    - Concern producer schemas.adds remarkable and lowercase detail to reviewer,
++      plan-reviewer, QA, and file review schemas
++    - Concern producer schemas.adds concernConfirms and concernResolution to
++      architect report decisions
++    - Concern producer schemas.adds concernConfirms to plan close-up outputs
++      while preserving concernResolutions
++    - Concern artifact types.types structured concerns and remarkable decisions
++      on every producer artifact
++    - Concern artifact types.types concern confirmations and decision
++      resolutions with strict vocabularies
++evidence:
++  - "Test infra proven: bun install completed; `bun test
++    test/contracts/concern-schemas.test.ts
++    test/contracts/concern-artifact-types.test.ts` runs 16 tests (11 pass, 5
++    fail) with the 5 target tests failing as assertion failures on current
++    production code."
++  - "JUnit check: ran the two files with `--reporter=junit
++    --reporter-outfile=/tmp/junit-target.xml`; parsed the XML and matched every
++    declared expectRed id to a `<failure>` case (none missing, none error/skip):
++    review/QA/plan-reviewer remarkable, decisions
++    concernConfirms+concernResolution, plan-closeup concernConfirms, producer
++    concern typing, and ConcernConfirms/ConcernResolution typing."
++  - "Red failure content verified: S1 reports missing inline remarkable[] for
++    qa/reviewer/review-file/plan-reviewer; S2 reports missing concernConfirms[]
++    and concernResolution for all three architect decision steps; S3 reports
++    missing concernConfirms[] for plan-closeup and architect-closeup; type tests
++    report missing concerns on FactFinder/WaveCloseup/PlanCloseup/Decision,
++    missing newConcerns on ReviewArtifact, string-typed DeveloperOutput
++    concerns, and missing ConcernConfirms/ConcernResolution exports."
++  - "`bun run typecheck` exits 0 with the new test code (no production changes)."
++  - "`bun test test/contracts/` runs 17 tests across 3 files: 12 pass, only the
++    5 declared target tests fail; existing state/concern contract tests remain
++    green."
++  - "`git status --short` shows only the two test files modified (no production
++    paths touched, no stub files needed)."
++concerns:
++  - Some required schema behavior already exists in the current base
++    (developer-output, fact-finder-output, plan.schema, wave-closeup and
++    plan-closeup already carry concerns/remarkable and lowercase detail), so the
++    new developer/fact-finder/plan/close-up schema test is regression coverage
++    that passes now; the declared red cases target the actual remaining drift
++    (TS interfaces, review remarkable, decisions
++    concernConfirms/concernResolution, plan-closeup concernConfirms).
++  - "Tests deliberately pin the assignment's API names: `ConcernConfirms`
++    (element type) and `ConcernResolution`, and the singular decision
++    `concernResolution.action` enum is resolve|carry with no propagate. Close-up
++    `concernResolutions[]` retains the existing resolve|carry|propagate
++    vocabulary."
++  - The singular `concernResolution` test shape is {id, action} per the
++    assignment; note is only required on concernConfirms and on close-up
++    concernResolutions.
++notes: "Implementation for the next step: artifacts.ts needs
++  ConcernConfirms/ConcernResolution interfaces,
++  DeveloperOutputArtifact.concerns: Concern[] (currently string[]),
++  ReviewArtifact.newConcerns/remarkable, and concerns/remarkable on
++  FactFinder/WaveCloseup/PlanCloseup/Decision plus concernConfirms on
++  PlanCloseup/Decision and concernResolution on Decision. review-schema.ts and
++  review.schema.json need remarkable[]; decisions.schema.json needs
++  concernConfirms[] and concernResolution; plan-closeup.schema.json needs
++  concernConfirms[]. Keep triage/infra/plan-edits schemas free of all concern
++  fields."
+diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..a3b5f35
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,113 @@
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
++        durationMs: 4109
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 85157
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-xieodZ/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
++          ----------------------------------------------------------------
++          Blocking Questions:
++            (none)
++          ----------------------------------------------------------------
++          Digest Questions:
++            (none)
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2487340
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2487340
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2487340
++
++           390 pass
++           2 skip
++           0 fail
++           1815 expect() calls
++          Ran 392 tests across 65 files. [84.98s]
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
++        test/contracts/concern-schemas.test.ts
++        test/contracts/concern-artifact-types.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167420985-1nnc5tzz8iz.xml
++      junitCaseCount: 16
++      junitCaseIds:
++        - Concern producer schemas.inlines the concern definition into every
++          producer schema without external refs
++        - Concern producer schemas.inlines the remarkable decision definition
++          with chosen, alternatives, and why
++        - Concern producer schemas.adds newConcerns to review and QA schemas
++          outside the triage suggestions
++        - Concern producer schemas.adds concernResolutions with resolve, carry,
++          and propagate to close-up schemas
++        - Concern producer schemas.leaves triage, infra, and plan-edit schemas
++          untouched
++        - Concern producer schemas.adds remarkable and lowercase detail to
++          reviewer, plan-reviewer, QA, and file review schemas
++        - Concern producer schemas.adds concernConfirms and concernResolution to
++          architect report decisions
++        - Concern producer schemas.adds concernConfirms to plan close-up outputs
++          while preserving concernResolutions
++        - Concern producer schemas.accepts structured concerns and remarkable
++          across every developer, fact-finder, and plan step
++        - Concern artifact types.exposes structured concerns and remarkable
++          decisions with strict vocabularies
++        - Concern artifact types.stores concern lifecycle metadata including
++          pending resolution and escalation
++        - Concern artifact types.adds dismiss to review dispositions without a
++          tech-debt value
++        - Concern artifact types.marks plan ADRs as blocking or remarkable
++        - Concern artifact types.adds human involvement modes, concern
++          thresholds, and canonical review policy to pipeline config
++        - Concern artifact types.types structured concerns and remarkable
++          decisions on every producer artifact
++        - Concern artifact types.types concern confirmations and decision
++          resolutions with strict vocabularies
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 99/300 production lines changed"
++    details:
++      changedLines:
++        added: 98
++        deleted: 1
++        total: 99
++        files:
++          - plugins/software-factory/config/schemas/decisions.schema.json
++          - plugins/software-factory/config/schemas/plan-closeup.schema.json
++          - plugins/software-factory/config/schemas/review.schema.json
++          - plugins/software-factory/src/core/artifacts.ts
++          - plugins/software-factory/src/core/records/review-schema.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..ce3b01c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,72 @@
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
++  "slug": "contracts-drift-fix",
++  "kind": "dev",
++  "title": "Producer type and schema drift",
++  "assignment": "Schemas + TS only, no ingest/apply/runtime, no hydration, no routing. Own artifacts.ts + review-schema.ts + review.schema.json + wave-report output + plan-closeup + decisions schemas per adr-closeup-lifecycle-resolved (schema half). artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types (concernConfirms?: [{id,confirm:accept|reject,note?}], concernResolution?: {id,action:resolve|carry}). review-schema.ts + review.schema.json: add remarkable (fix additionalProperties failure). Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (fix developer-output capital-D bug). Triage/infra/pm-edit schemas still reject concerns (no change). Behavior/contract tests: structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions concernResolution, close-ups concernResolutions, architect concernConfirms all validate + typecheck with matching TS; lowercase detail validates and persists; reviewer remarkable passes; triage/infra/pm-edit reject. Verify: bun run typecheck + preflight. Budget ~140 prod lines.",
++  "outlineRef": "contracts-drift-fix",
++  "milestone": "m2-contracts-epic",
++  "wave": 1,
++  "scenarioRefs": [
++    "m2-contracts-epic:1"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/artifacts.ts:313-325",
++    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/contracts/concern-schemas.test.ts",
++    "test/contracts/concern-artifact-types.test.ts"
++  ],
++  "expectRed": [
++    "Concern producer schemas.adds remarkable and lowercase detail to reviewer, plan-reviewer, QA, and file review schemas",
++    "Concern producer schemas.adds concernConfirms and concernResolution to architect report decisions",
++    "Concern producer schemas.adds concernConfirms to plan close-up outputs while preserving concernResolutions",
++    "Concern artifact types.types structured concerns and remarkable decisions on every producer artifact",
++    "Concern artifact types.types concern confirmations and decision resolutions with strict vocabularies"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/artifacts.ts:313-325",
++  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
++]
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
+diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..ee54411
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
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
++status: ok
++startedAt: 2026-11-08T19:39:01.205Z
++session: 01a1bcab-da9e-710d-971b-834551bd0f4f
++endedAt: 2026-11-08T19:50:23.018Z
++usage:
++  inputTokens: 107935
++  outputTokens: 30431
++  costUsd: 0.047594
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-662Z_01a1bcab-da9e-710d-971b-834551bd0f4f.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..0e94700
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,55 @@
++status: ok
++summary: "Implemented the producer type/schema drift fix: added
++  remarkable/concern fields to review schemas and artifact types,
++  concernConfirms to architect wave-report (decisions) and plan close-up
++  schemas, concernResolution to decisions schema, and matching
++  ConcernConfirms/ConcernResolution/CloseupConcernResolution TS types.
++  DeveloperOutput now uses Concern[] instead of string[]. Target contract tests
++  are green and typecheck passes."
++target:
++  selectors:
++    - test/contracts/concern-schemas.test.ts
++    - test/contracts/concern-artifact-types.test.ts
++  expectRed:
++    - Concern producer schemas.adds remarkable and lowercase detail to reviewer,
++      plan-reviewer, QA, and file review schemas
++    - Concern producer schemas.adds concernConfirms and concernResolution to
++      architect report decisions
++    - Concern producer schemas.adds concernConfirms to plan close-up outputs
++      while preserving concernResolutions
++    - Concern artifact types.types structured concerns and remarkable decisions
++      on every producer artifact
++    - Concern artifact types.types concern confirmations and decision
++      resolutions with strict vocabularies
++evidence:
++  - bun test test/contracts/concern-schemas.test.ts
++    test/contracts/concern-artifact-types.test.ts -> 16 pass, 0 fail (all 5
++    previously-red target cases green)
++  - bun run typecheck -> exit 0
++  - bun test test/contracts test/cli/cli.test.ts -> 33 pass, 0 fail (includes
++    factory preflight validation cases)
++  - bun test test/engine/concerns-funnel.test.ts
++    test/engine/reviewer-triage.test.ts test/engine/plan-reviewer-triage.test.ts
++    test/engine/routing-architect-consult.test.ts test/prompts.test.ts
++    test/validation-seams-hooks.test.ts -> 66 pass, 0 fail
++  - bun test over remaining non-engine suites (checks/git/harness/root tests) ->
++    210 tests, 208 pass, 2 skip, 0 fail
++  - bun test over all 27 engine test files in two chunks -> 46 pass, 0 fail and
++    35 pass, 0 fail (no failures across the full 65-file suite)
++  - grep -rn '"Detail"' plugins/software-factory/config/schemas -> no matches;
++    lowercase detail validates and persists in developer, decisions, close-up,
++    and review producers
++concerns:
++  - TypeScript Concern.detail and Concern.severity remain required while the
++    JSON schemas treat them as optional and let the concern store apply
++    defaults; the new contract tests do not require loosening this, but it is
++    residual schema/TS strictness drift.
++  - "The test-first fixture used a @ts-expect-error directly above a multi-line
++    object literal; TypeScript reports nested excess-property errors on the
++    property line, making that directive 'unused'. The directive was moved to
++    the nested concerns property line (test-only, intent unchanged: capital-D
++    Detail must be rejected)."
++notes: "Production changes stay within the schema/type-only scope: no ingest,
++  apply, hydration, routing, or runtime behavior changed. Prod diff is 99
++  inserted lines across artifacts.ts, review-schema.ts, and the reviewed schema
++  JSON files, within the ~140-line budget."
+diff --git a/plugins/software-factory/config/schemas/decisions.schema.json b/plugins/software-factory/config/schemas/decisions.schema.json
+index 47bda68..8477de2 100644
+--- a/plugins/software-factory/config/schemas/decisions.schema.json
++++ b/plugins/software-factory/config/schemas/decisions.schema.json
+@@ -69,6 +69,27 @@
+           "alternatives": { "type": "array", "items": { "type": "string" } }
+         }
+       }
++    },
++    "concernConfirms": {
++      "type": "array",
++      "description": "Architect confirmations for close-up concern resolutions",
++      "items": {
++        "type": "object", "required": ["id", "confirm"], "additionalProperties": false,
++        "properties": {
++          "id": { "type": "string" }, "note": { "type": "string" },
++          "confirm": { "type": "string", "enum": ["accept", "reject"] }
++        }
++      }
++    },
++    "concernResolution": {
++      "type": "object",
++      "description": "Direct concern resolution applied when the decision commits",
++      "required": ["id", "action"],
++      "additionalProperties": false,
++      "properties": {
++        "id": { "type": "string" }, "note": { "type": "string" },
++        "action": { "type": "string", "enum": ["resolve", "carry"] }
++      }
+     }
+   },
+   "additionalProperties": false
+diff --git a/plugins/software-factory/config/schemas/plan-closeup.schema.json b/plugins/software-factory/config/schemas/plan-closeup.schema.json
+index 3b82c0c..1dfc98b 100644
+--- a/plugins/software-factory/config/schemas/plan-closeup.schema.json
++++ b/plugins/software-factory/config/schemas/plan-closeup.schema.json
+@@ -49,6 +49,17 @@
+         }
+       }
+     },
++    "concernConfirms": {
++      "type": "array",
++      "description": "Architect confirmations for close-up concern resolutions",
++      "items": {
++        "type": "object", "required": ["id", "confirm"], "additionalProperties": false,
++        "properties": {
++          "id": { "type": "string" }, "note": { "type": "string" },
++          "confirm": { "type": "string", "enum": ["accept", "reject"] }
++        }
++      }
++    },
+     "concernResolutions": {
+       "type": "array",
+       "description": "Close-up resolutions for open concerns",
+diff --git a/plugins/software-factory/config/schemas/review.schema.json b/plugins/software-factory/config/schemas/review.schema.json
+index bb9769b..baf0785 100644
+--- a/plugins/software-factory/config/schemas/review.schema.json
++++ b/plugins/software-factory/config/schemas/review.schema.json
+@@ -44,6 +44,17 @@
+         "additionalProperties": false
+       }
+     },
++    "remarkable": {
++      "type": "array",
++      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
++      "items": {
++        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
++        "properties": {
++          "chosen": { "type": "string" }, "why": { "type": "string" },
++          "alternatives": { "type": "array", "items": { "type": "string" } }
++        }
++      }
++    },
+     "newConcerns": {
+       "type": "array",
+       "description": "New concerns discovered during review",
+diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
+index 5942405..6d07172 100644
+--- a/plugins/software-factory/src/core/artifacts.ts
++++ b/plugins/software-factory/src/core/artifacts.ts
+@@ -326,6 +326,27 @@ export interface RemarkableDecision {
+   why: string;
+ }
+ 
++/** Architect confirmation for a close-up concern resolution. */
++export interface ConcernConfirms {
++  id: string;
++  confirm: "accept" | "reject";
++  note?: string;
++}
++
++/** Decision-level resolution: resolve now or carry to the next architect turn. */
++export interface ConcernResolution {
++  id: string;
++  action: "resolve" | "carry";
++  note?: string;
++}
++
++/** Close-up proposals may also propagate a concern to the parent epic or saga. */
++export interface CloseupConcernResolution {
++  id: string;
++  action: "resolve" | "carry" | "propagate";
++  note?: string;
++}
++
+ export interface ConcernSource {
+   record: string;
+   agent: string;
+@@ -380,6 +401,8 @@ export interface ReviewArtifact {
+   status: "approved" | "changes_requested";
+   summary: string;
+   suggestions: ReviewSuggestion[];
++  newConcerns?: Concern[];
++  remarkable?: RemarkableDecision[];
+ }
+ 
+ export type DeveloperTarget =
+@@ -392,7 +415,8 @@ export interface DeveloperOutputArtifact {
+   summary: string;
+   target?: DeveloperTarget;
+   evidence?: string[];
+-  concerns?: string[];
++  concerns?: Concern[];
++  remarkable?: RemarkableDecision[];
+   notes?: string;
+ }
+ 
+@@ -402,6 +426,8 @@ export interface FactFinderOutputArtifact {
+   findings: string;
+   sources?: string[];
+   recommendations?: string[];
++  concerns?: Concern[];
++  remarkable?: RemarkableDecision[];
+ }
+ 
+ export interface WaveCloseupArtifact {
+@@ -414,6 +440,9 @@ export interface WaveCloseupArtifact {
+   debt?: string[];
+   summary: string;
+   recommendations?: string[];
++  concerns?: Concern[];
++  remarkable?: RemarkableDecision[];
++  concernResolutions?: CloseupConcernResolution[];
+ }
+ 
+ export interface PlanCloseupArtifact {
+@@ -424,6 +453,10 @@ export interface PlanCloseupArtifact {
+   completedMilestones?: string[];
+   remainingMilestones?: string[];
+   techDebt?: string[];
++  concerns?: Concern[];
++  remarkable?: RemarkableDecision[];
++  concernConfirms?: ConcernConfirms[];
++  concernResolutions?: CloseupConcernResolution[];
+ }
+ 
+ export type DecisionContext = "item" | "non-item" | "wave" | "plan-closeup";
+@@ -442,6 +475,10 @@ export interface DecisionArtifact {
+   question?: string;
+   planDelta?: string;
+   timestamp: string;
++  concerns?: Concern[];
++  remarkable?: RemarkableDecision[];
++  concernConfirms?: ConcernConfirms[];
++  concernResolution?: ConcernResolution;
+ }
+ 
+ export interface SteerItemArtifact {
+diff --git a/plugins/software-factory/src/core/records/review-schema.ts b/plugins/software-factory/src/core/records/review-schema.ts
+index 5a66e69..232a4c2 100644
+--- a/plugins/software-factory/src/core/records/review-schema.ts
++++ b/plugins/software-factory/src/core/records/review-schema.ts
+@@ -47,6 +47,23 @@ export function generateReviewSchema(
+           additionalProperties: false,
+         },
+       },
++      remarkable: {
++        type: "array",
++        description: "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
++        items: {
++          type: "object",
++          required: ["chosen", "alternatives", "why"],
++          additionalProperties: false,
++          properties: {
++            chosen: { type: "string" },
++            why: { type: "string" },
++            alternatives: {
++              type: "array",
++              items: { type: "string" },
++            },
++          },
++        },
++      },
+       newConcerns: {
+         type: "array",
+         description: "New concerns discovered during review",
+diff --git a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+index 343910b..9d8733c 100644
+--- a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
++++ b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+@@ -306,6 +306,159 @@ export const contract = {
+   badThreshold,
+   badRaise,
+ };
++`);
++    expect(errors).toEqual([]);
++  });
++
++  it("types structured concerns and remarkable decisions on every producer artifact", () => {
++    const errors = typeErrors(`
++import type {
++  Concern,
++  DecisionArtifact,
++  DeveloperOutputArtifact,
++  FactFinderOutputArtifact,
++  PlanCloseupArtifact,
++  ReviewArtifact,
++  WaveCloseupArtifact,
++} from "../../src/core/artifacts.js";
++
++const concern: Concern = {
++  kind: "risk",
++  summary: "Producer types drifted from the JSON schemas",
++  detail: "The TS interfaces lag the schema fields",
++  severity: "high",
++};
++const remarkable = {
++  chosen: "Fix the producer types",
++  alternatives: ["Leave the drift in place"],
++  why: "Producers must compile against the same contract they validate against",
++};
++
++const developer: DeveloperOutputArtifact = {
++  status: "ok",
++  summary: "Implemented the change",
++  concerns: [concern],
++  remarkable: [remarkable],
++};
++
++const factFinder: FactFinderOutputArtifact = {
++  status: "ok",
++  summary: "Investigated",
++  findings: "Schemas and types drifted",
++  concerns: [concern],
++  remarkable: [remarkable],
++};
++
++const wave: WaveCloseupArtifact = {
++  wave: 1,
++  iteration: 1,
++  status: "complete",
++  mergedItems: ["item-a"],
++  summary: "Wave merged",
++  concerns: [concern],
++  remarkable: [remarkable],
++};
++
++const plan: PlanCloseupArtifact = {
++  iteration: 1,
++  status: "complete",
++  summary: "Plan complete",
++  concerns: [concern],
++  remarkable: [remarkable],
++};
++
++const decision: DecisionArtifact = {
++  id: "d-1",
++  context: "wave",
++  decision: "continue",
++  timestamp: "2026-11-08T00:00:00.000Z",
++  concerns: [concern],
++  remarkable: [remarkable],
++};
++
++const review: ReviewArtifact = {
++  status: "changes_requested",
++  summary: "Drift found",
++  suggestions: [],
++  newConcerns: [concern],
++  remarkable: [remarkable],
++};
++
++// @ts-expect-error developer concerns are structured concerns, not free-form strings
++const stringConcerns: DeveloperOutputArtifact = { status: "ok", summary: "x", concerns: ["tech debt"] };
++
++const capitalDetail: DeveloperOutputArtifact = {
++  status: "ok",
++  summary: "x",
++  // @ts-expect-error capital Detail is not part of the contract
++  concerns: [{ kind: "risk", summary: "x", Detail: "wrong casing" }],
++};
++
++export const contract = {
++  developer,
++  factFinder,
++  wave,
++  plan,
++  decision,
++  review,
++  stringConcerns,
++  capitalDetail,
++};
++`);
++    expect(errors).toEqual([]);
++  });
++
++  it("types concern confirmations and decision resolutions with strict vocabularies", () => {
++    const errors = typeErrors(`
++import type {
++  ConcernConfirms,
++  ConcernResolution,
++  DecisionArtifact,
++  PlanCloseupArtifact,
++} from "../../src/core/artifacts.js";
++
++const accept: ConcernConfirms = { id: "c-1", confirm: "accept", note: "Confirmed after review" };
++const reject: ConcernConfirms = { id: "c-2", confirm: "reject" };
++const resolved: ConcernResolution = { id: "c-3", action: "resolve" };
++const carried: ConcernResolution = { id: "c-4", action: "carry" };
++
++const plan: PlanCloseupArtifact = {
++  iteration: 1,
++  status: "complete",
++  summary: "Plan complete",
++  concernConfirms: [accept, reject],
++};
++
++const decision: DecisionArtifact = {
++  id: "d-1",
++  context: "plan-closeup",
++  decision: "complete",
++  timestamp: "2026-11-08T00:00:00.000Z",
++  concernConfirms: [accept],
++  concernResolution: resolved,
++};
++
++// @ts-expect-error confirmations are accept or reject
++const badConfirm: ConcernConfirms = { id: "c-5", confirm: "dismiss" };
++// @ts-expect-error decision resolutions are resolve or carry
++const badAction: ConcernResolution = { id: "c-6", action: "propagate" };
++// @ts-expect-error confirmations require the concern id
++const missingConfirmId: ConcernConfirms = { confirm: "accept" };
++// @ts-expect-error resolutions require the concern id
++const missingResolutionId: ConcernResolution = { action: "carry" };
++
++export const contract = {
++  accept,
++  reject,
++  resolved,
++  carried,
++  plan,
++  decision,
++  badConfirm,
++  badAction,
++  missingConfirmId,
++  missingResolutionId,
++};
+ `);
+     expect(errors).toEqual([]);
+   });
+diff --git a/plugins/software-factory/test/contracts/concern-schemas.test.ts b/plugins/software-factory/test/contracts/concern-schemas.test.ts
+index a4802a1..6e9a367 100644
+--- a/plugins/software-factory/test/contracts/concern-schemas.test.ts
++++ b/plugins/software-factory/test/contracts/concern-schemas.test.ts
+@@ -367,9 +367,352 @@ describe("Concern producer schemas", () => {
+ 
+     for (const producer of untouched) {
+       const schema = producer.schema();
+-      for (const field of ["concerns", "newConcerns", "remarkable", "remarkableDecisions", "concernResolutions"]) {
++      for (const field of [
++        "concerns",
++        "newConcerns",
++        "remarkable",
++        "remarkableDecisions",
++        "concernResolutions",
++        "concernConfirms",
++        "concernResolution",
++      ]) {
+         expect(schema.properties?.[field]).toBeUndefined();
+       }
+     }
+   });
++
++  it("adds remarkable and lowercase detail to reviewer, plan-reviewer, QA, and file review schemas", () => {
++    const failures: string[] = [];
++    const producers: Producer[] = [
++      ...REVIEW_PRODUCERS,
++      {
++        name: "plan-reviewer",
++        schema: () =>
++          resolveStepSchema(pluginRoot, "plan-reviewer", "plan-review", [
++            "fix",
++            "optional",
++            "architect",
++            "dismiss",
++          ]),
++        base: { status: "approved", summary: "Plan is sound", suggestions: [] },
++      },
++    ];
++
++    for (const producer of producers) {
++      const schema = producer.schema();
++      const validate = validator(schema);
++      const label = producer.name;
++
++      const item = arrayItem(schema, "remarkable");
++      if (!item) {
++        failures.push(`${label}: missing inline remarkable[]`);
++        continue;
++      }
++      const required: string[] = item.required ?? [];
++      for (const key of ["chosen", "alternatives", "why"]) {
++        if (!required.includes(key)) failures.push(`${label}: remarkable.${key} must be required`);
++      }
++
++      if (
++        !validate({
++          ...producer.base,
++          remarkable: [
++            {
++              chosen: "Keep review output in one schema",
++              alternatives: ["A separate remarkable artifact"],
++              why: "One vocabulary keeps triage uniform",
++            },
++          ],
++        })
++      ) {
++        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
++      }
++      if (validate({ ...producer.base, remarkable: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
++        failures.push(`${label}: remarkable without alternatives accepted`);
++      }
++
++      const detailed = {
++        kind: "risk",
++        summary: "Lowercase detail",
++        detail: "carried through validation",
++      };
++      const output = { ...producer.base, newConcerns: [detailed] };
++      if (!validate(output)) {
++        failures.push(`${label}: lowercase concern detail rejected (${validationErrors(validate)})`);
++      } else if (output.newConcerns[0]?.detail !== "carried through validation") {
++        failures.push(`${label}: lowercase concern detail was not preserved`);
++      }
++      if (validate({ ...producer.base, newConcerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
++        failures.push(`${label}: capital-D Detail accepted`);
++      }
++
++      const refs = externalRefs(schema);
++      if (refs.length > 0) failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
++    }
++
++    expect(failures).toEqual([]);
++  });
++
++  it("adds concernConfirms and concernResolution to architect report decisions", () => {
++    const failures: string[] = [];
++    const steps = ["architect-wave-report", "architect-consult-item", "architect-consult-nonitem"];
++
++    for (const step of steps) {
++      const schema = resolveStepSchema(pluginRoot, "architect", step) as JsonSchema;
++      const validate = validator(schema);
++      const base = { decision: "continue" };
++
++      const confirms = arrayItem(schema, "concernConfirms");
++      if (!confirms) {
++        failures.push(`${step}: missing inline concernConfirms[]`);
++      } else {
++        const required: string[] = confirms.required ?? [];
++        if (!required.includes("id") || !required.includes("confirm")) {
++          failures.push(`${step}: concernConfirms must require id and confirm`);
++        }
++        const confirmValues = resolveRef(schema, confirms.properties?.confirm)?.enum ?? [];
++        if (["accept", "reject"].some((value) => !confirmValues.includes(value))) {
++          failures.push(`${step}: confirm enum must be accept|reject, got ${JSON.stringify(confirmValues)}`);
++        }
++
++        if (
++          !validate({
++            ...base,
++            concernConfirms: [
++              { id: "c-1", confirm: "accept" },
++              { id: "c-2", confirm: "reject", note: "Keep it open for the next iteration" },
++            ],
++          })
++        ) {
++          failures.push(`${step}: valid concern confirmations rejected (${validationErrors(validate)})`);
++        }
++        if (validate({ ...base, concernConfirms: [{ id: "c-3", confirm: "maybe" }] })) {
++          failures.push(`${step}: unknown confirm value accepted`);
++        }
++        if (validate({ ...base, concernConfirms: [{ confirm: "accept" }] })) {
++          failures.push(`${step}: confirmation without a concern id accepted`);
++        }
++      }
++
++      const resolution = resolveRef(schema, schema.properties?.concernResolution);
++      if (!resolution) {
++        failures.push(`${step}: missing concernResolution`);
++      } else {
++        const required: string[] = resolution.required ?? [];
++        if (!required.includes("id") || !required.includes("action")) {
++          failures.push(`${step}: concernResolution must require id and action`);
++        }
++        const actions = resolveRef(schema, resolution.properties?.action)?.enum ?? [];
++        if (["resolve", "carry"].some((action) => !actions.includes(action))) {
++          failures.push(`${step}: concernResolution action must include resolve|carry, got ${JSON.stringify(actions)}`);
++        }
++        if (actions.includes("propagate")) {
++          failures.push(`${step}: decision concernResolution must not propagate`);
++        }
++
++        if (!validate({ ...base, concernResolution: { id: "c-4", action: "resolve" } })) {
++          failures.push(`${step}: valid concern resolution rejected (${validationErrors(validate)})`);
++        }
++        if (!validate({ ...base, concernResolution: { id: "c-5", action: "carry" } })) {
++          failures.push(`${step}: valid carry resolution rejected (${validationErrors(validate)})`);
++        }
++        if (validate({ ...base, concernResolution: { id: "c-6", action: "propagate" } })) {
++          failures.push(`${step}: propagate action accepted for a decision resolution`);
++        }
++        if (validate({ ...base, concernResolution: { action: "resolve" } })) {
++          failures.push(`${step}: resolution without a concern id accepted`);
++        }
++      }
++
++      if (
++        !validate({
++          ...base,
++          concerns: [{ kind: "risk", summary: "Lowercase detail", detail: "stored as written" }],
++        })
++      ) {
++        failures.push(`${step}: lowercase concern detail rejected (${validationErrors(validate)})`);
++      }
++      if (validate({ ...base, concerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
++        failures.push(`${step}: capital-D Detail accepted`);
++      }
++    }
++
++    expect(failures).toEqual([]);
++  });
++
++  it("adds concernConfirms to plan close-up outputs while preserving concernResolutions", () => {
++    const failures: string[] = [];
++    const closeups: Producer[] = [
++      {
++        name: "plan-closeup",
++        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
++        base: { iteration: 1, status: "complete", summary: "Plan complete" },
++      },
++      {
++        name: "architect-closeup",
++        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
++        base: { iteration: 1, status: "complete", summary: "Plan complete" },
++      },
++    ];
++
++    for (const closeup of closeups) {
++      const schema = closeup.schema();
++      const validate = validator(schema);
++      const label = closeup.name;
++
++      const confirms = arrayItem(schema, "concernConfirms");
++      if (!confirms) {
++        failures.push(`${label}: missing inline concernConfirms[]`);
++      } else {
++        const required: string[] = confirms.required ?? [];
++        if (!required.includes("id") || !required.includes("confirm")) {
++          failures.push(`${label}: concernConfirms must require id and confirm`);
++        }
++        const confirmValues = resolveRef(schema, confirms.properties?.confirm)?.enum ?? [];
++        if (["accept", "reject"].some((value) => !confirmValues.includes(value))) {
++          failures.push(`${label}: confirm enum must be accept|reject, got ${JSON.stringify(confirmValues)}`);
++        }
++
++        if (
++          !validate({
++            ...closeup.base,
++            concernConfirms: [
++              { id: "c-1", confirm: "accept" },
++              { id: "c-2", confirm: "reject", note: "Carry into the next iteration" },
++            ],
++          })
++        ) {
++          failures.push(`${label}: valid concern confirmations rejected (${validationErrors(validate)})`);
++        }
++        if (validate({ ...closeup.base, concernConfirms: [{ id: "c-3", confirm: "maybe" }] })) {
++          failures.push(`${label}: unknown confirm value accepted`);
++        }
++        if (validate({ ...closeup.base, concernConfirms: [{ confirm: "accept" }] })) {
++          failures.push(`${label}: confirmation without a concern id accepted`);
++        }
++      }
++
++      const resolutions = arrayItem(schema, "concernResolutions");
++      if (!resolutions) {
++        failures.push(`${label}: missing inline concernResolutions[]`);
++      } else if (
++        !validate({
++          ...closeup.base,
++          concernResolutions: [
++            { id: "c-4", action: "resolve" },
++            { id: "c-5", action: "carry", note: "Needs an architect decision" },
++            { id: "c-6", action: "propagate" },
++          ],
++        })
++      ) {
++        failures.push(`${label}: close-up resolutions must remain validate-able (${validationErrors(validate)})`);
++      }
++
++      if (
++        !validate({
++          ...closeup.base,
++          concerns: [{ kind: "assumption", summary: "Lowercase detail", detail: "kept intact" }],
++        })
++      ) {
++        failures.push(`${label}: lowercase concern detail rejected (${validationErrors(validate)})`);
++      }
++      if (validate({ ...closeup.base, concerns: [{ kind: "assumption", summary: "Capital detail", Detail: "wrong field" }] })) {
++        failures.push(`${label}: capital-D Detail accepted`);
++      }
++    }
++
++    expect(failures).toEqual([]);
++  });
++
++  it("accepts structured concerns and remarkable across every developer, fact-finder, and plan step", () => {
++    const failures: string[] = [];
++    const producers: Producer[] = [
++      ...["develop", "poc", "test-assumptions", "test-first", "simple-implement", "fix-round"].map(
++        (step): Producer => ({
++          name: `developer/${step}`,
++          schema: () => resolveStepSchema(pluginRoot, "developer", step),
++          base: { status: "ok", summary: "Implemented the change" },
++        })
++      ),
++      {
++        name: "fact-finder/research",
++        schema: () => resolveStepSchema(pluginRoot, "fact-finder", "research"),
++        base: { status: "ok", summary: "Investigated", findings: "The API supports retries" },
++      },
++      {
++        name: "architect/architect-plan",
++        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-plan"),
++        base: { iteration: 1, milestones: [], itemOutlines: [] },
++      },
++      {
++        name: "architect/architect-revise",
++        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-revise"),
++        base: { iteration: 1, milestones: [], itemOutlines: [] },
++      },
++      {
++        name: "wave-closeup",
++        schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
++        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
++      },
++      {
++        name: "plan-closeup",
++        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
++        base: { iteration: 1, status: "complete", summary: "Plan complete" },
++      },
++    ];
++
++    for (const producer of producers) {
++      const schema = producer.schema();
++      const validate = validator(schema);
++      const label = producer.name;
++
++      const concernItem = arrayItem(schema, "concerns");
++      if (!concernItem) {
++        failures.push(`${label}: missing inline concerns[]`);
++        continue;
++      }
++      hasConcernShape(schema, concernItem, label, failures);
++
++      const detailed = {
++        kind: "risk",
++        summary: "Flaky gate",
++        detail: "Retries hide real failures",
++        severity: "high",
++      };
++      const output = { ...producer.base, concerns: [detailed] };
++      if (!validate(output)) {
++        failures.push(`${label}: concern with lowercase detail rejected (${validationErrors(validate)})`);
++      } else if (output.concerns[0]?.detail !== "Retries hide real failures") {
++        failures.push(`${label}: lowercase detail was not preserved`);
++      }
++      if (validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
++        failures.push(`${label}: capital-D Detail accepted`);
++      }
++
++      const remarkableItem = arrayItem(schema, "remarkable");
++      if (!remarkableItem) {
++        failures.push(`${label}: missing inline remarkable[]`);
++        continue;
++      }
++      if (
++        !validate({
++          ...producer.base,
++          remarkable: [
++            {
++              chosen: "Inline shared definitions",
++              alternatives: ["External $ref"],
++              why: "Every producer schema validates standalone",
++            },
++          ],
++        })
++      ) {
++        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
++      }
++      if (validate({ ...producer.base, remarkable: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
++        failures.push(`${label}: remarkable without alternatives accepted`);
++      }
++    }
++
++    expect(failures).toEqual([]);
++  });
+ });
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
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..a76fe58
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T19:50:25.159Z
+session: 01a1bcb6-5a13-7133-b0ef-c4a979e2a424
+endedAt: 2026-11-08T20:06:36.060Z
+usage:
+  inputTokens: 115240
+  outputTokens: 70051
+  costUsd: 0.032658
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-50-29-651Z_01a1bcb6-5a13-7133-b0ef-c4a979e2a424.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..a0d3134
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/contracts-drift-fix/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,31 @@
+status: approved
+summary: "contracts-drift-fix verified: 5 red tests credible on baseline, 16/16
+  targets + 17/17 contracts green, typecheck exit 0, full suite 390 pass/0 fail,
+  no test weakening, Detail lowercase byte-verified, untouched schemas reject
+  concern fields."
+suggestions:
+  - id: ts-json-required-drift
+    disposition: optional
+    summary: TS Concern.detail/severity required while JSON schemas keep them
+      optional (pre-existing)
+    detail: artifacts.ts Concern requires detail+severity but all JSON concern items
+      require only kind+summary (verified decisions req=[kind,summary]).
+      Pre-existing and developer-disclosed; schemas intentionally lenient with
+      store defaults. Consider aligning TS optionality or documenting the
+      contract in a follow-up.
+    location:
+      file: plugins/software-factory/src/core/artifacts.ts
+      line: 308
+  - id: resolution-note-superset
+    disposition: optional
+    summary: ConcernResolution allows optional note beyond assignment's {id,action}
+      shape (harmless superset)
+    detail: "Assignment specifies concernResolution {id, action:resolve|carry};
+      implementation adds note?: string in both artifacts.ts and
+      decisions.schema.json. Optional-only superset, consistent with
+      concernConfirms/close-up items, no test rejects it. Consider pinning note
+      acceptance/rejection explicitly in contract tests if the vocabulary should
+      be exact."
+    location:
+      file: plugins/software-factory/src/core/artifacts.ts
+      line: 337
diff --git a/plugins/software-factory/config/schemas/decisions.schema.json b/plugins/software-factory/config/schemas/decisions.schema.json
index 47bda68..8477de2 100644
--- a/plugins/software-factory/config/schemas/decisions.schema.json
+++ b/plugins/software-factory/config/schemas/decisions.schema.json
@@ -69,6 +69,27 @@
           "alternatives": { "type": "array", "items": { "type": "string" } }
         }
       }
+    },
+    "concernConfirms": {
+      "type": "array",
+      "description": "Architect confirmations for close-up concern resolutions",
+      "items": {
+        "type": "object", "required": ["id", "confirm"], "additionalProperties": false,
+        "properties": {
+          "id": { "type": "string" }, "note": { "type": "string" },
+          "confirm": { "type": "string", "enum": ["accept", "reject"] }
+        }
+      }
+    },
+    "concernResolution": {
+      "type": "object",
+      "description": "Direct concern resolution applied when the decision commits",
+      "required": ["id", "action"],
+      "additionalProperties": false,
+      "properties": {
+        "id": { "type": "string" }, "note": { "type": "string" },
+        "action": { "type": "string", "enum": ["resolve", "carry"] }
+      }
     }
   },
   "additionalProperties": false
diff --git a/plugins/software-factory/config/schemas/plan-closeup.schema.json b/plugins/software-factory/config/schemas/plan-closeup.schema.json
index 3b82c0c..1dfc98b 100644
--- a/plugins/software-factory/config/schemas/plan-closeup.schema.json
+++ b/plugins/software-factory/config/schemas/plan-closeup.schema.json
@@ -49,6 +49,17 @@
         }
       }
     },
+    "concernConfirms": {
+      "type": "array",
+      "description": "Architect confirmations for close-up concern resolutions",
+      "items": {
+        "type": "object", "required": ["id", "confirm"], "additionalProperties": false,
+        "properties": {
+          "id": { "type": "string" }, "note": { "type": "string" },
+          "confirm": { "type": "string", "enum": ["accept", "reject"] }
+        }
+      }
+    },
     "concernResolutions": {
       "type": "array",
       "description": "Close-up resolutions for open concerns",
diff --git a/plugins/software-factory/config/schemas/review.schema.json b/plugins/software-factory/config/schemas/review.schema.json
index bb9769b..baf0785 100644
--- a/plugins/software-factory/config/schemas/review.schema.json
+++ b/plugins/software-factory/config/schemas/review.schema.json
@@ -44,6 +44,17 @@
         "additionalProperties": false
       }
     },
+    "remarkable": {
+      "type": "array",
+      "description": "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
+      "items": {
+        "type": "object", "required": ["chosen", "alternatives", "why"], "additionalProperties": false,
+        "properties": {
+          "chosen": { "type": "string" }, "why": { "type": "string" },
+          "alternatives": { "type": "array", "items": { "type": "string" } }
+        }
+      }
+    },
     "newConcerns": {
       "type": "array",
       "description": "New concerns discovered during review",
diff --git a/plugins/software-factory/src/core/artifacts.ts b/plugins/software-factory/src/core/artifacts.ts
index 5942405..6d07172 100644
--- a/plugins/software-factory/src/core/artifacts.ts
+++ b/plugins/software-factory/src/core/artifacts.ts
@@ -326,6 +326,27 @@ export interface RemarkableDecision {
   why: string;
 }
 
+/** Architect confirmation for a close-up concern resolution. */
+export interface ConcernConfirms {
+  id: string;
+  confirm: "accept" | "reject";
+  note?: string;
+}
+
+/** Decision-level resolution: resolve now or carry to the next architect turn. */
+export interface ConcernResolution {
+  id: string;
+  action: "resolve" | "carry";
+  note?: string;
+}
+
+/** Close-up proposals may also propagate a concern to the parent epic or saga. */
+export interface CloseupConcernResolution {
+  id: string;
+  action: "resolve" | "carry" | "propagate";
+  note?: string;
+}
+
 export interface ConcernSource {
   record: string;
   agent: string;
@@ -380,6 +401,8 @@ export interface ReviewArtifact {
   status: "approved" | "changes_requested";
   summary: string;
   suggestions: ReviewSuggestion[];
+  newConcerns?: Concern[];
+  remarkable?: RemarkableDecision[];
 }
 
 export type DeveloperTarget =
@@ -392,7 +415,8 @@ export interface DeveloperOutputArtifact {
   summary: string;
   target?: DeveloperTarget;
   evidence?: string[];
-  concerns?: string[];
+  concerns?: Concern[];
+  remarkable?: RemarkableDecision[];
   notes?: string;
 }
 
@@ -402,6 +426,8 @@ export interface FactFinderOutputArtifact {
   findings: string;
   sources?: string[];
   recommendations?: string[];
+  concerns?: Concern[];
+  remarkable?: RemarkableDecision[];
 }
 
 export interface WaveCloseupArtifact {
@@ -414,6 +440,9 @@ export interface WaveCloseupArtifact {
   debt?: string[];
   summary: string;
   recommendations?: string[];
+  concerns?: Concern[];
+  remarkable?: RemarkableDecision[];
+  concernResolutions?: CloseupConcernResolution[];
 }
 
 export interface PlanCloseupArtifact {
@@ -424,6 +453,10 @@ export interface PlanCloseupArtifact {
   completedMilestones?: string[];
   remainingMilestones?: string[];
   techDebt?: string[];
+  concerns?: Concern[];
+  remarkable?: RemarkableDecision[];
+  concernConfirms?: ConcernConfirms[];
+  concernResolutions?: CloseupConcernResolution[];
 }
 
 export type DecisionContext = "item" | "non-item" | "wave" | "plan-closeup";
@@ -442,6 +475,10 @@ export interface DecisionArtifact {
   question?: string;
   planDelta?: string;
   timestamp: string;
+  concerns?: Concern[];
+  remarkable?: RemarkableDecision[];
+  concernConfirms?: ConcernConfirms[];
+  concernResolution?: ConcernResolution;
 }
 
 export interface SteerItemArtifact {
diff --git a/plugins/software-factory/src/core/records/review-schema.ts b/plugins/software-factory/src/core/records/review-schema.ts
index 5a66e69..232a4c2 100644
--- a/plugins/software-factory/src/core/records/review-schema.ts
+++ b/plugins/software-factory/src/core/records/review-schema.ts
@@ -47,6 +47,23 @@ export function generateReviewSchema(
           additionalProperties: false,
         },
       },
+      remarkable: {
+        type: "array",
+        description: "Remarkable decisions or tradeoffs with the chosen option, alternatives, and why",
+        items: {
+          type: "object",
+          required: ["chosen", "alternatives", "why"],
+          additionalProperties: false,
+          properties: {
+            chosen: { type: "string" },
+            why: { type: "string" },
+            alternatives: {
+              type: "array",
+              items: { type: "string" },
+            },
+          },
+        },
+      },
       newConcerns: {
         type: "array",
         description: "New concerns discovered during review",
diff --git a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
index 343910b..9d8733c 100644
--- a/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
+++ b/plugins/software-factory/test/contracts/concern-artifact-types.test.ts
@@ -306,6 +306,159 @@ export const contract = {
   badThreshold,
   badRaise,
 };
+`);
+    expect(errors).toEqual([]);
+  });
+
+  it("types structured concerns and remarkable decisions on every producer artifact", () => {
+    const errors = typeErrors(`
+import type {
+  Concern,
+  DecisionArtifact,
+  DeveloperOutputArtifact,
+  FactFinderOutputArtifact,
+  PlanCloseupArtifact,
+  ReviewArtifact,
+  WaveCloseupArtifact,
+} from "../../src/core/artifacts.js";
+
+const concern: Concern = {
+  kind: "risk",
+  summary: "Producer types drifted from the JSON schemas",
+  detail: "The TS interfaces lag the schema fields",
+  severity: "high",
+};
+const remarkable = {
+  chosen: "Fix the producer types",
+  alternatives: ["Leave the drift in place"],
+  why: "Producers must compile against the same contract they validate against",
+};
+
+const developer: DeveloperOutputArtifact = {
+  status: "ok",
+  summary: "Implemented the change",
+  concerns: [concern],
+  remarkable: [remarkable],
+};
+
+const factFinder: FactFinderOutputArtifact = {
+  status: "ok",
+  summary: "Investigated",
+  findings: "Schemas and types drifted",
+  concerns: [concern],
+  remarkable: [remarkable],
+};
+
+const wave: WaveCloseupArtifact = {
+  wave: 1,
+  iteration: 1,
+  status: "complete",
+  mergedItems: ["item-a"],
+  summary: "Wave merged",
+  concerns: [concern],
+  remarkable: [remarkable],
+};
+
+const plan: PlanCloseupArtifact = {
+  iteration: 1,
+  status: "complete",
+  summary: "Plan complete",
+  concerns: [concern],
+  remarkable: [remarkable],
+};
+
+const decision: DecisionArtifact = {
+  id: "d-1",
+  context: "wave",
+  decision: "continue",
+  timestamp: "2026-11-08T00:00:00.000Z",
+  concerns: [concern],
+  remarkable: [remarkable],
+};
+
+const review: ReviewArtifact = {
+  status: "changes_requested",
+  summary: "Drift found",
+  suggestions: [],
+  newConcerns: [concern],
+  remarkable: [remarkable],
+};
+
+// @ts-expect-error developer concerns are structured concerns, not free-form strings
+const stringConcerns: DeveloperOutputArtifact = { status: "ok", summary: "x", concerns: ["tech debt"] };
+
+const capitalDetail: DeveloperOutputArtifact = {
+  status: "ok",
+  summary: "x",
+  // @ts-expect-error capital Detail is not part of the contract
+  concerns: [{ kind: "risk", summary: "x", Detail: "wrong casing" }],
+};
+
+export const contract = {
+  developer,
+  factFinder,
+  wave,
+  plan,
+  decision,
+  review,
+  stringConcerns,
+  capitalDetail,
+};
+`);
+    expect(errors).toEqual([]);
+  });
+
+  it("types concern confirmations and decision resolutions with strict vocabularies", () => {
+    const errors = typeErrors(`
+import type {
+  ConcernConfirms,
+  ConcernResolution,
+  DecisionArtifact,
+  PlanCloseupArtifact,
+} from "../../src/core/artifacts.js";
+
+const accept: ConcernConfirms = { id: "c-1", confirm: "accept", note: "Confirmed after review" };
+const reject: ConcernConfirms = { id: "c-2", confirm: "reject" };
+const resolved: ConcernResolution = { id: "c-3", action: "resolve" };
+const carried: ConcernResolution = { id: "c-4", action: "carry" };
+
+const plan: PlanCloseupArtifact = {
+  iteration: 1,
+  status: "complete",
+  summary: "Plan complete",
+  concernConfirms: [accept, reject],
+};
+
+const decision: DecisionArtifact = {
+  id: "d-1",
+  context: "plan-closeup",
+  decision: "complete",
+  timestamp: "2026-11-08T00:00:00.000Z",
+  concernConfirms: [accept],
+  concernResolution: resolved,
+};
+
+// @ts-expect-error confirmations are accept or reject
+const badConfirm: ConcernConfirms = { id: "c-5", confirm: "dismiss" };
+// @ts-expect-error decision resolutions are resolve or carry
+const badAction: ConcernResolution = { id: "c-6", action: "propagate" };
+// @ts-expect-error confirmations require the concern id
+const missingConfirmId: ConcernConfirms = { confirm: "accept" };
+// @ts-expect-error resolutions require the concern id
+const missingResolutionId: ConcernResolution = { action: "carry" };
+
+export const contract = {
+  accept,
+  reject,
+  resolved,
+  carried,
+  plan,
+  decision,
+  badConfirm,
+  badAction,
+  missingConfirmId,
+  missingResolutionId,
+};
 `);
     expect(errors).toEqual([]);
   });
diff --git a/plugins/software-factory/test/contracts/concern-schemas.test.ts b/plugins/software-factory/test/contracts/concern-schemas.test.ts
index a4802a1..6e9a367 100644
--- a/plugins/software-factory/test/contracts/concern-schemas.test.ts
+++ b/plugins/software-factory/test/contracts/concern-schemas.test.ts
@@ -367,9 +367,352 @@ describe("Concern producer schemas", () => {
 
     for (const producer of untouched) {
       const schema = producer.schema();
-      for (const field of ["concerns", "newConcerns", "remarkable", "remarkableDecisions", "concernResolutions"]) {
+      for (const field of [
+        "concerns",
+        "newConcerns",
+        "remarkable",
+        "remarkableDecisions",
+        "concernResolutions",
+        "concernConfirms",
+        "concernResolution",
+      ]) {
         expect(schema.properties?.[field]).toBeUndefined();
       }
     }
   });
+
+  it("adds remarkable and lowercase detail to reviewer, plan-reviewer, QA, and file review schemas", () => {
+    const failures: string[] = [];
+    const producers: Producer[] = [
+      ...REVIEW_PRODUCERS,
+      {
+        name: "plan-reviewer",
+        schema: () =>
+          resolveStepSchema(pluginRoot, "plan-reviewer", "plan-review", [
+            "fix",
+            "optional",
+            "architect",
+            "dismiss",
+          ]),
+        base: { status: "approved", summary: "Plan is sound", suggestions: [] },
+      },
+    ];
+
+    for (const producer of producers) {
+      const schema = producer.schema();
+      const validate = validator(schema);
+      const label = producer.name;
+
+      const item = arrayItem(schema, "remarkable");
+      if (!item) {
+        failures.push(`${label}: missing inline remarkable[]`);
+        continue;
+      }
+      const required: string[] = item.required ?? [];
+      for (const key of ["chosen", "alternatives", "why"]) {
+        if (!required.includes(key)) failures.push(`${label}: remarkable.${key} must be required`);
+      }
+
+      if (
+        !validate({
+          ...producer.base,
+          remarkable: [
+            {
+              chosen: "Keep review output in one schema",
+              alternatives: ["A separate remarkable artifact"],
+              why: "One vocabulary keeps triage uniform",
+            },
+          ],
+        })
+      ) {
+        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
+      }
+      if (validate({ ...producer.base, remarkable: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
+        failures.push(`${label}: remarkable without alternatives accepted`);
+      }
+
+      const detailed = {
+        kind: "risk",
+        summary: "Lowercase detail",
+        detail: "carried through validation",
+      };
+      const output = { ...producer.base, newConcerns: [detailed] };
+      if (!validate(output)) {
+        failures.push(`${label}: lowercase concern detail rejected (${validationErrors(validate)})`);
+      } else if (output.newConcerns[0]?.detail !== "carried through validation") {
+        failures.push(`${label}: lowercase concern detail was not preserved`);
+      }
+      if (validate({ ...producer.base, newConcerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
+        failures.push(`${label}: capital-D Detail accepted`);
+      }
+
+      const refs = externalRefs(schema);
+      if (refs.length > 0) failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
+    }
+
+    expect(failures).toEqual([]);
+  });
+
+  it("adds concernConfirms and concernResolution to architect report decisions", () => {
+    const failures: string[] = [];
+    const steps = ["architect-wave-report", "architect-consult-item", "architect-consult-nonitem"];
+
+    for (const step of steps) {
+      const schema = resolveStepSchema(pluginRoot, "architect", step) as JsonSchema;
+      const validate = validator(schema);
+      const base = { decision: "continue" };
+
+      const confirms = arrayItem(schema, "concernConfirms");
+      if (!confirms) {
+        failures.push(`${step}: missing inline concernConfirms[]`);
+      } else {
+        const required: string[] = confirms.required ?? [];
+        if (!required.includes("id") || !required.includes("confirm")) {
+          failures.push(`${step}: concernConfirms must require id and confirm`);
+        }
+        const confirmValues = resolveRef(schema, confirms.properties?.confirm)?.enum ?? [];
+        if (["accept", "reject"].some((value) => !confirmValues.includes(value))) {
+          failures.push(`${step}: confirm enum must be accept|reject, got ${JSON.stringify(confirmValues)}`);
+        }
+
+        if (
+          !validate({
+            ...base,
+            concernConfirms: [
+              { id: "c-1", confirm: "accept" },
+              { id: "c-2", confirm: "reject", note: "Keep it open for the next iteration" },
+            ],
+          })
+        ) {
+          failures.push(`${step}: valid concern confirmations rejected (${validationErrors(validate)})`);
+        }
+        if (validate({ ...base, concernConfirms: [{ id: "c-3", confirm: "maybe" }] })) {
+          failures.push(`${step}: unknown confirm value accepted`);
+        }
+        if (validate({ ...base, concernConfirms: [{ confirm: "accept" }] })) {
+          failures.push(`${step}: confirmation without a concern id accepted`);
+        }
+      }
+
+      const resolution = resolveRef(schema, schema.properties?.concernResolution);
+      if (!resolution) {
+        failures.push(`${step}: missing concernResolution`);
+      } else {
+        const required: string[] = resolution.required ?? [];
+        if (!required.includes("id") || !required.includes("action")) {
+          failures.push(`${step}: concernResolution must require id and action`);
+        }
+        const actions = resolveRef(schema, resolution.properties?.action)?.enum ?? [];
+        if (["resolve", "carry"].some((action) => !actions.includes(action))) {
+          failures.push(`${step}: concernResolution action must include resolve|carry, got ${JSON.stringify(actions)}`);
+        }
+        if (actions.includes("propagate")) {
+          failures.push(`${step}: decision concernResolution must not propagate`);
+        }
+
+        if (!validate({ ...base, concernResolution: { id: "c-4", action: "resolve" } })) {
+          failures.push(`${step}: valid concern resolution rejected (${validationErrors(validate)})`);
+        }
+        if (!validate({ ...base, concernResolution: { id: "c-5", action: "carry" } })) {
+          failures.push(`${step}: valid carry resolution rejected (${validationErrors(validate)})`);
+        }
+        if (validate({ ...base, concernResolution: { id: "c-6", action: "propagate" } })) {
+          failures.push(`${step}: propagate action accepted for a decision resolution`);
+        }
+        if (validate({ ...base, concernResolution: { action: "resolve" } })) {
+          failures.push(`${step}: resolution without a concern id accepted`);
+        }
+      }
+
+      if (
+        !validate({
+          ...base,
+          concerns: [{ kind: "risk", summary: "Lowercase detail", detail: "stored as written" }],
+        })
+      ) {
+        failures.push(`${step}: lowercase concern detail rejected (${validationErrors(validate)})`);
+      }
+      if (validate({ ...base, concerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
+        failures.push(`${step}: capital-D Detail accepted`);
+      }
+    }
+
+    expect(failures).toEqual([]);
+  });
+
+  it("adds concernConfirms to plan close-up outputs while preserving concernResolutions", () => {
+    const failures: string[] = [];
+    const closeups: Producer[] = [
+      {
+        name: "plan-closeup",
+        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
+        base: { iteration: 1, status: "complete", summary: "Plan complete" },
+      },
+      {
+        name: "architect-closeup",
+        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
+        base: { iteration: 1, status: "complete", summary: "Plan complete" },
+      },
+    ];
+
+    for (const closeup of closeups) {
+      const schema = closeup.schema();
+      const validate = validator(schema);
+      const label = closeup.name;
+
+      const confirms = arrayItem(schema, "concernConfirms");
+      if (!confirms) {
+        failures.push(`${label}: missing inline concernConfirms[]`);
+      } else {
+        const required: string[] = confirms.required ?? [];
+        if (!required.includes("id") || !required.includes("confirm")) {
+          failures.push(`${label}: concernConfirms must require id and confirm`);
+        }
+        const confirmValues = resolveRef(schema, confirms.properties?.confirm)?.enum ?? [];
+        if (["accept", "reject"].some((value) => !confirmValues.includes(value))) {
+          failures.push(`${label}: confirm enum must be accept|reject, got ${JSON.stringify(confirmValues)}`);
+        }
+
+        if (
+          !validate({
+            ...closeup.base,
+            concernConfirms: [
+              { id: "c-1", confirm: "accept" },
+              { id: "c-2", confirm: "reject", note: "Carry into the next iteration" },
+            ],
+          })
+        ) {
+          failures.push(`${label}: valid concern confirmations rejected (${validationErrors(validate)})`);
+        }
+        if (validate({ ...closeup.base, concernConfirms: [{ id: "c-3", confirm: "maybe" }] })) {
+          failures.push(`${label}: unknown confirm value accepted`);
+        }
+        if (validate({ ...closeup.base, concernConfirms: [{ confirm: "accept" }] })) {
+          failures.push(`${label}: confirmation without a concern id accepted`);
+        }
+      }
+
+      const resolutions = arrayItem(schema, "concernResolutions");
+      if (!resolutions) {
+        failures.push(`${label}: missing inline concernResolutions[]`);
+      } else if (
+        !validate({
+          ...closeup.base,
+          concernResolutions: [
+            { id: "c-4", action: "resolve" },
+            { id: "c-5", action: "carry", note: "Needs an architect decision" },
+            { id: "c-6", action: "propagate" },
+          ],
+        })
+      ) {
+        failures.push(`${label}: close-up resolutions must remain validate-able (${validationErrors(validate)})`);
+      }
+
+      if (
+        !validate({
+          ...closeup.base,
+          concerns: [{ kind: "assumption", summary: "Lowercase detail", detail: "kept intact" }],
+        })
+      ) {
+        failures.push(`${label}: lowercase concern detail rejected (${validationErrors(validate)})`);
+      }
+      if (validate({ ...closeup.base, concerns: [{ kind: "assumption", summary: "Capital detail", Detail: "wrong field" }] })) {
+        failures.push(`${label}: capital-D Detail accepted`);
+      }
+    }
+
+    expect(failures).toEqual([]);
+  });
+
+  it("accepts structured concerns and remarkable across every developer, fact-finder, and plan step", () => {
+    const failures: string[] = [];
+    const producers: Producer[] = [
+      ...["develop", "poc", "test-assumptions", "test-first", "simple-implement", "fix-round"].map(
+        (step): Producer => ({
+          name: `developer/${step}`,
+          schema: () => resolveStepSchema(pluginRoot, "developer", step),
+          base: { status: "ok", summary: "Implemented the change" },
+        })
+      ),
+      {
+        name: "fact-finder/research",
+        schema: () => resolveStepSchema(pluginRoot, "fact-finder", "research"),
+        base: { status: "ok", summary: "Investigated", findings: "The API supports retries" },
+      },
+      {
+        name: "architect/architect-plan",
+        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-plan"),
+        base: { iteration: 1, milestones: [], itemOutlines: [] },
+      },
+      {
+        name: "architect/architect-revise",
+        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-revise"),
+        base: { iteration: 1, milestones: [], itemOutlines: [] },
+      },
+      {
+        name: "wave-closeup",
+        schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
+        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
+      },
+      {
+        name: "plan-closeup",
+        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
+        base: { iteration: 1, status: "complete", summary: "Plan complete" },
+      },
+    ];
+
+    for (const producer of producers) {
+      const schema = producer.schema();
+      const validate = validator(schema);
+      const label = producer.name;
+
+      const concernItem = arrayItem(schema, "concerns");
+      if (!concernItem) {
+        failures.push(`${label}: missing inline concerns[]`);
+        continue;
+      }
+      hasConcernShape(schema, concernItem, label, failures);
+
+      const detailed = {
+        kind: "risk",
+        summary: "Flaky gate",
+        detail: "Retries hide real failures",
+        severity: "high",
+      };
+      const output = { ...producer.base, concerns: [detailed] };
+      if (!validate(output)) {
+        failures.push(`${label}: concern with lowercase detail rejected (${validationErrors(validate)})`);
+      } else if (output.concerns[0]?.detail !== "Retries hide real failures") {
+        failures.push(`${label}: lowercase detail was not preserved`);
+      }
+      if (validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
+        failures.push(`${label}: capital-D Detail accepted`);
+      }
+
+      const remarkableItem = arrayItem(schema, "remarkable");
+      if (!remarkableItem) {
+        failures.push(`${label}: missing inline remarkable[]`);
+        continue;
+      }
+      if (
+        !validate({
+          ...producer.base,
+          remarkable: [
+            {
+              chosen: "Inline shared definitions",
+              alternatives: ["External $ref"],
+              why: "Every producer schema validates standalone",
+            },
+          ],
+        })
+      ) {
+        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
+      }
+      if (validate({ ...producer.base, remarkable: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
+        failures.push(`${label}: remarkable without alternatives accepted`);
+      }
+    }
+
+    expect(failures).toEqual([]);
+  });
 });

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

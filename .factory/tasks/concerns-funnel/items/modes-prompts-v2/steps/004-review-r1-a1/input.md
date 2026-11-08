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
  "slug": "modes-prompts-v2",
  "kind": "dev",
  "title": "Modes, thresholds, prompt wiring",
  "assignment": "Implement humanInvolvement + concerns thresholds: schema/loader/merge, PipelineConfig.humanInvolvement default autonomous + concerns {raiseAllowlist,minDigestSeverity,minBlockingSeverity}, commented autonomous/principal/detailed presets with blocking table in config/pipeline.default.yaml, terse agents/criteria/human-involvement.md fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria fragment and blocking-ADR routing; preflight green. Must precede all routing items. Verify: typecheck + preflightPrompts.",
  "outlineRef": "modes-prompts-v2",
  "milestone": "m2-triage-modes",
  "wave": 6,
  "deps": [
    "concerns-contracts-policy",
    "concerns-contracts-schemas",
    "concerns-contracts-types"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..5f11347
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,43 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/human-involvement-config.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 11 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/human-involvement-config.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794118253122-0zjdg8ynw62e.xml
+      junitCaseCount: 11
+      junitCaseIds:
+        - human-involvement pipeline configuration.defaults to autonomous mode
+          with concern raise/digest/blocking policy
+        - human-involvement pipeline configuration.layers humanInvolvement and
+          concern thresholds through project and task configs
+        - human-involvement pipeline configuration.applies overrides last and
+          supports null deletion of concern keys
+        - human-involvement pipeline configuration.schema accepts all modes and
+          thresholds, rejects unknown values, and stays closed at root
+        - human-involvement pipeline configuration.ships commented
+          autonomous/principal/detailed presets with a blocking table
+        - human-involvement pipeline configuration.registers a terse
+          human-involvement criteria fragment and loads it
+        - human-involvement pipeline configuration.registers concernsYaml and
+          humanInvolvementCriteria for the fragment matrix
+        - human-involvement pipeline configuration.preflight accepts the new
+          vars on matrix fragments and rejects them elsewhere
+        - human-involvement mode switching at prompt time.selects the active
+          mode section plus the shared ADR blocking table
+        - human-involvement mode switching at prompt time.renders empty
+          involvement criteria when no fragment is configured
+        - human-involvement mode switching at prompt time.lets callers provide
+          hydrated concernsYaml without dropping the criteria
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..54c907b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,54 @@
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
+  "slug": "modes-prompts-v2",
+  "kind": "dev",
+  "title": "Modes, thresholds, prompt wiring",
+  "assignment": "Implement humanInvolvement + concerns thresholds: schema/loader/merge, PipelineConfig.humanInvolvement default autonomous + concerns {raiseAllowlist,minDigestSeverity,minBlockingSeverity}, commented autonomous/principal/detailed presets with blocking table in config/pipeline.default.yaml, terse agents/criteria/human-involvement.md fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria fragment and blocking-ADR routing; preflight green. Must precede all routing items. Verify: typecheck + preflightPrompts.",
+  "outlineRef": "modes-prompts-v2",
+  "milestone": "m2-triage-modes",
+  "wave": 6,
+  "deps": [
+    "concerns-contracts-policy",
+    "concerns-contracts-schemas",
+    "concerns-contracts-types"
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
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..84968a1
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T06:03:06.593Z
+session: 01a1b9c0-dd79-76b1-baa8-02b05324a146
+endedAt: 2026-11-08T06:10:54.038Z
+usage:
+  inputTokens: 77003
+  outputTokens: 56479
+  costUsd: 0.064485
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-07-001Z_01a1b9c0-dd79-76b1-baa8-02b05324a146
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..a618e8c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,83 @@
+status: ok
+summary: "Authored test/human-involvement-config.test.ts (11 behavior tests, no
+  production changes) specifying: humanInvolvement default autonomous; concerns
+  {raiseAllowlist (8 concern-producing agents), minDigestSeverity: medium,
+  minBlockingSeverity: high}; schema acceptance/rejection and root closure;
+  project/task/override layering incl. null deletion; commented
+  autonomous/principal/detailed presets with a blocking table in
+  config/pipeline.default.yaml; a terse criteria.human-involvement fragment with
+  per-mode sections; loadCriteriaBundle exposure; KNOWN_VARS matrix registration
+  for concernsYaml + humanInvolvementCriteria; preflight acceptance on matrix
+  fragments and rejection elsewhere; and engine-rendered architect-plan prompts
+  that select the active mode's ADR blocking rules (with empty default and
+  caller-provided concernsYaml). All 11 tests are red on current code as
+  assertion/behavior failures; typecheck passes and existing
+  prompt/config/policy tests remain green."
+target:
+  selectors:
+    - test/human-involvement-config.test.ts
+  expectRed:
+    - human-involvement pipeline configuration.defaults to autonomous mode with
+      concern raise/digest/blocking policy
+    - human-involvement pipeline configuration.layers humanInvolvement and
+      concern thresholds through project and task configs
+    - human-involvement pipeline configuration.applies overrides last and
+      supports null deletion of concern keys
+    - human-involvement pipeline configuration.schema accepts all modes and
+      thresholds, rejects unknown values, and stays closed at root
+    - human-involvement pipeline configuration.ships commented
+      autonomous/principal/detailed presets with a blocking table
+    - human-involvement pipeline configuration.registers a terse
+      human-involvement criteria fragment and loads it
+    - human-involvement pipeline configuration.registers concernsYaml and
+      humanInvolvementCriteria for the fragment matrix
+    - human-involvement pipeline configuration.preflight accepts the new vars on
+      matrix fragments and rejects them elsewhere
+    - human-involvement mode switching at prompt time.selects the active mode
+      section plus the shared ADR blocking table
+    - human-involvement mode switching at prompt time.renders empty involvement
+      criteria when no fragment is configured
+    - human-involvement mode switching at prompt time.lets callers provide
+      hydrated concernsYaml without dropping the criteria
+evidence:
+  - bun test test/human-involvement-config.test.ts -> 0 pass, 11 fail; every
+    failure is an assertion/behavior failure, no collection or import errors
+  - bun test test/human-involvement-config.test.ts --reporter=junit
+    --reporter-outfile=/tmp/target-hi.xml; parseJunit reports collected=true, 11
+    cases, all status 'fail', 0 suite errors
+  - All declared expectRed ids exactly match parsed JUnit ids (verified
+    programmatically)
+  - bun run typecheck -> exit 0
+  - bun test test/prompts.test.ts test/config-layering.test.ts
+    test/review-policy.test.ts -> 29 pass, 0 fail
+  - git status --short -> only '?? test/human-involvement-config.test.ts' (no
+    production files touched)
+concerns:
+  - The mode-selection tests require the engine (runAgentStep) to inject
+    humanInvolvementCriteria centrally, selected from
+    pipeline.criteria['human-involvement'] by '## <mode>' headings plus the
+    shared blocking-table preamble; empty string when no fragment is configured.
+  - The tests require concernsYaml to default to an empty engine-supplied value
+    while caller-provided promptVars.concernsYaml wins.
+  - "The declared fragment matrix is:
+    review/qa/wave-close-up/plan-close-up/architect-plan/architect-revise/archi\
+    tect-resume/architect-wave-report/architect-closeup/architect-consult-item/\
+    architect-consult-nonitem get both vars; plan-review gets
+    humanInvolvementCriteria only; develop/triage/infra must not get them."
+  - "Default raiseAllowlist is defined as the concern-producing agents:
+    developer, fact-finder, architect, qa, reviewer, plan-reviewer,
+    wave-close-up, plan-close-up."
+notes: "Implementation guidance for the green step: (1) add humanInvolvement
+  enum + concerns object (raiseAllowlist array of strings,
+  minDigestSeverity/minBlockingSeverity low|medium|high,
+  additionalProperties:false) to config/schemas/pipeline.schema.json; (2) set
+  active defaults in config/pipeline.default.yaml and add commented
+  autonomous/principal/detailed presets with a markdown blocking table
+  mentioning ADRs; (3) add criteria.human-involvement ->
+  agents/criteria/human-involvement.md with a shared 'Blocking table (ADRs and
+  concerns)' section followed by '## autonomous', '## principal', '## detailed'
+  sections; (4) extend CriteriaBundle/loadCriteriaBundle with humanInvolvement;
+  (5) add PROMPT_VAR_DESCRIPTIONS + KNOWN_VARS entries per the matrix above; (6)
+  inject humanInvolvementCriteria and concernsYaml defaults in runAgentStep
+  before rendering, with caller promptVars taking precedence; (7) wire the new
+  placeholders into the matrix step fragments so preflight stays green."
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..54a7ad0
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,97 @@
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
+        durationMs: 4089
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 75706
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-PJIxO2/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2638422
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2638422
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2638422
+
+           314 pass
+           2 skip
+           0 fail
+           1303 expect() calls
+          Ran 316 tests across 56 files. [75.58s]
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
+        test/human-involvement-config.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794119975830-ftl1ov9b63v.xml
+      junitCaseCount: 11
+      junitCaseIds:
+        - human-involvement pipeline configuration.defaults to autonomous mode
+          with concern raise/digest/blocking policy
+        - human-involvement pipeline configuration.layers humanInvolvement and
+          concern thresholds through project and task configs
+        - human-involvement pipeline configuration.applies overrides last and
+          supports null deletion of concern keys
+        - human-involvement pipeline configuration.schema accepts all modes and
+          thresholds, rejects unknown values, and stays closed at root
+        - human-involvement pipeline configuration.ships commented
+          autonomous/principal/detailed presets with a blocking table
+        - human-involvement pipeline configuration.registers a terse
+          human-involvement criteria fragment and loads it
+        - human-involvement pipeline configuration.registers concernsYaml and
+          humanInvolvementCriteria for the fragment matrix
+        - human-involvement pipeline configuration.preflight accepts the new
+          vars on matrix fragments and rejects them elsewhere
+        - human-involvement mode switching at prompt time.selects the active
+          mode section plus the shared ADR blocking table
+        - human-involvement mode switching at prompt time.renders empty
+          involvement criteria when no fragment is configured
+        - human-involvement mode switching at prompt time.lets callers provide
+          hydrated concernsYaml without dropping the criteria
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 199/300 production lines changed"
+    details:
+      changedLines:
+        added: 177
+        deleted: 22
+        total: 199
+        files:
+          - plugins/software-factory/config/pipeline.default.yaml
+          - plugins/software-factory/config/schemas/pipeline.schema.json
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/prompt-vars.ts
+          - plugins/software-factory/src/core/prompts.ts
+          - plugins/software-factory/agents/criteria/human-involvement.md
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..bae607c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,70 @@
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
+  "slug": "modes-prompts-v2",
+  "kind": "dev",
+  "title": "Modes, thresholds, prompt wiring",
+  "assignment": "Implement humanInvolvement + concerns thresholds: schema/loader/merge, PipelineConfig.humanInvolvement default autonomous + concerns {raiseAllowlist,minDigestSeverity,minBlockingSeverity}, commented autonomous/principal/detailed presets with blocking table in config/pipeline.default.yaml, terse agents/criteria/human-involvement.md fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria fragment and blocking-ADR routing; preflight green. Must precede all routing items. Verify: typecheck + preflightPrompts.",
+  "outlineRef": "modes-prompts-v2",
+  "milestone": "m2-triage-modes",
+  "wave": 6,
+  "deps": [
+    "concerns-contracts-policy",
+    "concerns-contracts-schemas",
+    "concerns-contracts-types"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/human-involvement-config.test.ts"
+  ],
+  "expectRed": [
+    "human-involvement pipeline configuration.defaults to autonomous mode with concern raise/digest/blocking policy",
+    "human-involvement pipeline configuration.layers humanInvolvement and concern thresholds through project and task configs",
+    "human-involvement pipeline configuration.applies overrides last and supports null deletion of concern keys",
+    "human-involvement pipeline configuration.schema accepts all modes and thresholds, rejects unknown values, and stays closed at root",
+    "human-involvement pipeline configuration.ships commented autonomous/principal/detailed presets with a blocking table",
+    "human-involvement pipeline configuration.registers a terse human-involvement criteria fragment and loads it",
+    "human-involvement pipeline configuration.registers concernsYaml and humanInvolvementCriteria for the fragment matrix",
+    "human-involvement pipeline configuration.preflight accepts the new vars on matrix fragments and rejects them elsewhere",
+    "human-involvement mode switching at prompt time.selects the active mode section plus the shared ADR blocking table",
+    "human-involvement mode switching at prompt time.renders empty involvement criteria when no fragment is configured",
+    "human-involvement mode switching at prompt time.lets callers provide hydrated concernsYaml without dropping the criteria"
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
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..05340c9
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T06:19:23.717Z
+session: 01a1b9cf-c8da-76e1-9957-ebfc1baf2dab
+endedAt: 2026-11-08T06:39:36.774Z
+usage:
+  inputTokens: 101154
+  outputTokens: 31985
+  costUsd: 0.053907
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-762Z_01a1b9cf-c8da-76e1-9957-ebfc1baf2dab
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..73905c8
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,70 @@
+status: ok
+summary: "Implemented humanInvolvement mode + concern thresholds: added schema
+  properties and closed concerns object, default pipeline values (autonomous,
+  raise allowlist, medium digest / high blocking) with commented
+  autonomous/principal/detailed presets and ADR blocking table, registered a
+  1.1KB agents/criteria/human-involvement.md fragment, added
+  concernsYaml/humanInvolvementCriteria to KNOWN_VARS per the fragment matrix,
+  and wired step-runner to inject the active mode's criteria section plus
+  caller-provided hydrated concernsYaml. Target test file is fully green and
+  typecheck passes; full suite passes with an enlarged per-test timeout."
+target:
+  selectors:
+    - test/human-involvement-config.test.ts
+  expectRed:
+    - human-involvement pipeline configuration.defaults to autonomous mode with
+      concern raise/digest/blocking policy
+    - human-involvement pipeline configuration.layers humanInvolvement and
+      concern thresholds through project and task configs
+    - human-involvement pipeline configuration.applies overrides last and
+      supports null deletion of concern keys
+    - human-involvement pipeline configuration.schema accepts all modes and
+      thresholds, rejects unknown values, and stays closed at root
+    - human-involvement pipeline configuration.ships commented
+      autonomous/principal/detailed presets with a blocking table
+    - human-involvement pipeline configuration.registers a terse
+      human-involvement criteria fragment and loads it
+    - human-involvement pipeline configuration.registers concernsYaml and
+      humanInvolvementCriteria for the fragment matrix
+    - human-involvement pipeline configuration.preflight accepts the new vars on
+      matrix fragments and rejects them elsewhere
+    - human-involvement mode switching at prompt time.selects the active mode
+      section plus the shared ADR blocking table
+    - human-involvement mode switching at prompt time.renders empty involvement
+      criteria when no fragment is configured
+    - human-involvement mode switching at prompt time.lets callers provide
+      hydrated concernsYaml without dropping the criteria
+evidence:
+  - cd plugins/software-factory && bun test
+    test/human-involvement-config.test.ts -> 11 pass, 0 fail, 100 expect() calls
+  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit, exit code 0
+  - cd plugins/software-factory && TMPDIR=/tmp bun test --timeout 15000 -> 314
+    pass, 2 skip, 0 fail across 316 tests / 56 files
+  - cd plugins/software-factory && bun test test/prompts.test.ts
+    test/config-layering.test.ts test/contracts/concern-artifact-types.test.ts
+    -> 24 pass, 0 fail
+  - cd plugins/software-factory && bun test test/engine/qa-red-test.test.ts
+    test/engine/sessions-budget-simple.test.ts
+    test/engine/blocked-closeup-iteration.test.ts
+    test/engine/step-resilience.test.ts test/engine/crash-restart.test.ts -> 15
+    pass, 0 fail
+  - git diff --numstat + new criteria file -> 177 production lines changed
+    (budget 300)
+  - Default-timeout full suite runs showed only variable 5s per-test timeouts in
+    pre-existing engine tests (different file each run); each affected file
+    passes standalone, and the suite is green with --timeout 15000
+concerns:
+  - The project's pre-existing engine tests use a 5s per-test timeout and are
+    load-sensitive when the swarm runs suites concurrently; varying tests time
+    out on default gate runs but pass standalone, so gate retries or a
+    normalized timeout/load environment may be needed.
+  - concernsYaml is injected as an empty default here; actual concern-store
+    hydration belongs to the later routing/funnel items.
+  - Blocking-ADR enforcement is currently policy text/table only; mechanical
+    routing per mode is implemented by the dependent ADR-blocking/routing items.
+notes: step-runner now merges engine-supplied
+  humanInvolvementCriteria/concernsYaml before caller promptVars, so
+  caller-hydrated concerns win while the active mode criteria is always
+  retained. loadCriteriaBundle returns the full human-involvement text;
+  formatHumanInvolvementCriteria keeps shared sections plus only the active mode
+  section.
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..e58742d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,42 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 11 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/human-involvement-config.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794119984776-nw9dncpgiuo.xml
+      junitCaseCount: 11
+      junitCaseIds:
+        - human-involvement pipeline configuration.defaults to autonomous mode
+          with concern raise/digest/blocking policy
+        - human-involvement pipeline configuration.layers humanInvolvement and
+          concern thresholds through project and task configs
+        - human-involvement pipeline configuration.applies overrides last and
+          supports null deletion of concern keys
+        - human-involvement pipeline configuration.schema accepts all modes and
+          thresholds, rejects unknown values, and stays closed at root
+        - human-involvement pipeline configuration.ships commented
+          autonomous/principal/detailed presets with a blocking table
+        - human-involvement pipeline configuration.registers a terse
+          human-involvement criteria fragment and loads it
+        - human-involvement pipeline configuration.registers concernsYaml and
+          humanInvolvementCriteria for the fragment matrix
+        - human-involvement pipeline configuration.preflight accepts the new
+          vars on matrix fragments and rejects them elsewhere
+        - human-involvement mode switching at prompt time.selects the active
+          mode section plus the shared ADR blocking table
+        - human-involvement mode switching at prompt time.renders empty
+          involvement criteria when no fragment is configured
+        - human-involvement mode switching at prompt time.lets callers provide
+          hydrated concernsYaml without dropping the criteria
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..7ae79cf
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1357 @@
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
+  "slug": "modes-prompts-v2",
+  "kind": "dev",
+  "title": "Modes, thresholds, prompt wiring",
+  "assignment": "Implement humanInvolvement + concerns thresholds: schema/loader/merge, PipelineConfig.humanInvolvement default autonomous + concerns {raiseAllowlist,minDigestSeverity,minBlockingSeverity}, commented autonomous/principal/detailed presets with blocking table in config/pipeline.default.yaml, terse agents/criteria/human-involvement.md fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria fragment and blocking-ADR routing; preflight green. Must precede all routing items. Verify: typecheck + preflightPrompts.",
+  "outlineRef": "modes-prompts-v2",
+  "milestone": "m2-triage-modes",
+  "wave": 6,
+  "deps": [
+    "concerns-contracts-policy",
+    "concerns-contracts-schemas",
+    "concerns-contracts-types"
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
+diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..5f11347
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,43 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/human-involvement-config.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 11 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/human-involvement-config.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794118253122-0zjdg8ynw62e.xml
++      junitCaseCount: 11
++      junitCaseIds:
++        - human-involvement pipeline configuration.defaults to autonomous mode
++          with concern raise/digest/blocking policy
++        - human-involvement pipeline configuration.layers humanInvolvement and
++          concern thresholds through project and task configs
++        - human-involvement pipeline configuration.applies overrides last and
++          supports null deletion of concern keys
++        - human-involvement pipeline configuration.schema accepts all modes and
++          thresholds, rejects unknown values, and stays closed at root
++        - human-involvement pipeline configuration.ships commented
++          autonomous/principal/detailed presets with a blocking table
++        - human-involvement pipeline configuration.registers a terse
++          human-involvement criteria fragment and loads it
++        - human-involvement pipeline configuration.registers concernsYaml and
++          humanInvolvementCriteria for the fragment matrix
++        - human-involvement pipeline configuration.preflight accepts the new
++          vars on matrix fragments and rejects them elsewhere
++        - human-involvement mode switching at prompt time.selects the active
++          mode section plus the shared ADR blocking table
++        - human-involvement mode switching at prompt time.renders empty
++          involvement criteria when no fragment is configured
++        - human-involvement mode switching at prompt time.lets callers provide
++          hydrated concernsYaml without dropping the criteria
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..54c907b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,54 @@
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
++  "slug": "modes-prompts-v2",
++  "kind": "dev",
++  "title": "Modes, thresholds, prompt wiring",
++  "assignment": "Implement humanInvolvement + concerns thresholds: schema/loader/merge, PipelineConfig.humanInvolvement default autonomous + concerns {raiseAllowlist,minDigestSeverity,minBlockingSeverity}, commented autonomous/principal/detailed presets with blocking table in config/pipeline.default.yaml, terse agents/criteria/human-involvement.md fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria fragment and blocking-ADR routing; preflight green. Must precede all routing items. Verify: typecheck + preflightPrompts.",
++  "outlineRef": "modes-prompts-v2",
++  "milestone": "m2-triage-modes",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
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
+diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..84968a1
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T06:03:06.593Z
++session: 01a1b9c0-dd79-76b1-baa8-02b05324a146
++endedAt: 2026-11-08T06:10:54.038Z
++usage:
++  inputTokens: 77003
++  outputTokens: 56479
++  costUsd: 0.064485
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-03-07-001Z_01a1b9c0-dd79-76b1-baa8-02b05324a146
+diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..a618e8c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,83 @@
++status: ok
++summary: "Authored test/human-involvement-config.test.ts (11 behavior tests, no
++  production changes) specifying: humanInvolvement default autonomous; concerns
++  {raiseAllowlist (8 concern-producing agents), minDigestSeverity: medium,
++  minBlockingSeverity: high}; schema acceptance/rejection and root closure;
++  project/task/override layering incl. null deletion; commented
++  autonomous/principal/detailed presets with a blocking table in
++  config/pipeline.default.yaml; a terse criteria.human-involvement fragment with
++  per-mode sections; loadCriteriaBundle exposure; KNOWN_VARS matrix registration
++  for concernsYaml + humanInvolvementCriteria; preflight acceptance on matrix
++  fragments and rejection elsewhere; and engine-rendered architect-plan prompts
++  that select the active mode's ADR blocking rules (with empty default and
++  caller-provided concernsYaml). All 11 tests are red on current code as
++  assertion/behavior failures; typecheck passes and existing
++  prompt/config/policy tests remain green."
++target:
++  selectors:
++    - test/human-involvement-config.test.ts
++  expectRed:
++    - human-involvement pipeline configuration.defaults to autonomous mode with
++      concern raise/digest/blocking policy
++    - human-involvement pipeline configuration.layers humanInvolvement and
++      concern thresholds through project and task configs
++    - human-involvement pipeline configuration.applies overrides last and
++      supports null deletion of concern keys
++    - human-involvement pipeline configuration.schema accepts all modes and
++      thresholds, rejects unknown values, and stays closed at root
++    - human-involvement pipeline configuration.ships commented
++      autonomous/principal/detailed presets with a blocking table
++    - human-involvement pipeline configuration.registers a terse
++      human-involvement criteria fragment and loads it
++    - human-involvement pipeline configuration.registers concernsYaml and
++      humanInvolvementCriteria for the fragment matrix
++    - human-involvement pipeline configuration.preflight accepts the new vars on
++      matrix fragments and rejects them elsewhere
++    - human-involvement mode switching at prompt time.selects the active mode
++      section plus the shared ADR blocking table
++    - human-involvement mode switching at prompt time.renders empty involvement
++      criteria when no fragment is configured
++    - human-involvement mode switching at prompt time.lets callers provide
++      hydrated concernsYaml without dropping the criteria
++evidence:
++  - bun test test/human-involvement-config.test.ts -> 0 pass, 11 fail; every
++    failure is an assertion/behavior failure, no collection or import errors
++  - bun test test/human-involvement-config.test.ts --reporter=junit
++    --reporter-outfile=/tmp/target-hi.xml; parseJunit reports collected=true, 11
++    cases, all status 'fail', 0 suite errors
++  - All declared expectRed ids exactly match parsed JUnit ids (verified
++    programmatically)
++  - bun run typecheck -> exit 0
++  - bun test test/prompts.test.ts test/config-layering.test.ts
++    test/review-policy.test.ts -> 29 pass, 0 fail
++  - git status --short -> only '?? test/human-involvement-config.test.ts' (no
++    production files touched)
++concerns:
++  - The mode-selection tests require the engine (runAgentStep) to inject
++    humanInvolvementCriteria centrally, selected from
++    pipeline.criteria['human-involvement'] by '## <mode>' headings plus the
++    shared blocking-table preamble; empty string when no fragment is configured.
++  - The tests require concernsYaml to default to an empty engine-supplied value
++    while caller-provided promptVars.concernsYaml wins.
++  - "The declared fragment matrix is:
++    review/qa/wave-close-up/plan-close-up/architect-plan/architect-revise/archi\
++    tect-resume/architect-wave-report/architect-closeup/architect-consult-item/\
++    architect-consult-nonitem get both vars; plan-review gets
++    humanInvolvementCriteria only; develop/triage/infra must not get them."
++  - "Default raiseAllowlist is defined as the concern-producing agents:
++    developer, fact-finder, architect, qa, reviewer, plan-reviewer,
++    wave-close-up, plan-close-up."
++notes: "Implementation guidance for the green step: (1) add humanInvolvement
++  enum + concerns object (raiseAllowlist array of strings,
++  minDigestSeverity/minBlockingSeverity low|medium|high,
++  additionalProperties:false) to config/schemas/pipeline.schema.json; (2) set
++  active defaults in config/pipeline.default.yaml and add commented
++  autonomous/principal/detailed presets with a markdown blocking table
++  mentioning ADRs; (3) add criteria.human-involvement ->
++  agents/criteria/human-involvement.md with a shared 'Blocking table (ADRs and
++  concerns)' section followed by '## autonomous', '## principal', '## detailed'
++  sections; (4) extend CriteriaBundle/loadCriteriaBundle with humanInvolvement;
++  (5) add PROMPT_VAR_DESCRIPTIONS + KNOWN_VARS entries per the matrix above; (6)
++  inject humanInvolvementCriteria and concernsYaml defaults in runAgentStep
++  before rendering, with caller promptVars taking precedence; (7) wire the new
++  placeholders into the matrix step fragments so preflight stays green."
+diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..54a7ad0
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,97 @@
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
++        durationMs: 4089
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 75706
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-PJIxO2/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2638422
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2638422
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2638422
++
++           314 pass
++           2 skip
++           0 fail
++           1303 expect() calls
++          Ran 316 tests across 56 files. [75.58s]
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
++        test/human-involvement-config.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794119975830-ftl1ov9b63v.xml
++      junitCaseCount: 11
++      junitCaseIds:
++        - human-involvement pipeline configuration.defaults to autonomous mode
++          with concern raise/digest/blocking policy
++        - human-involvement pipeline configuration.layers humanInvolvement and
++          concern thresholds through project and task configs
++        - human-involvement pipeline configuration.applies overrides last and
++          supports null deletion of concern keys
++        - human-involvement pipeline configuration.schema accepts all modes and
++          thresholds, rejects unknown values, and stays closed at root
++        - human-involvement pipeline configuration.ships commented
++          autonomous/principal/detailed presets with a blocking table
++        - human-involvement pipeline configuration.registers a terse
++          human-involvement criteria fragment and loads it
++        - human-involvement pipeline configuration.registers concernsYaml and
++          humanInvolvementCriteria for the fragment matrix
++        - human-involvement pipeline configuration.preflight accepts the new
++          vars on matrix fragments and rejects them elsewhere
++        - human-involvement mode switching at prompt time.selects the active
++          mode section plus the shared ADR blocking table
++        - human-involvement mode switching at prompt time.renders empty
++          involvement criteria when no fragment is configured
++        - human-involvement mode switching at prompt time.lets callers provide
++          hydrated concernsYaml without dropping the criteria
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 199/300 production lines changed"
++    details:
++      changedLines:
++        added: 177
++        deleted: 22
++        total: 199
++        files:
++          - plugins/software-factory/config/pipeline.default.yaml
++          - plugins/software-factory/config/schemas/pipeline.schema.json
++          - plugins/software-factory/src/core/flows/step-runner.ts
++          - plugins/software-factory/src/core/prompt-vars.ts
++          - plugins/software-factory/src/core/prompts.ts
++          - plugins/software-factory/agents/criteria/human-involvement.md
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..bae607c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,70 @@
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
++  "slug": "modes-prompts-v2",
++  "kind": "dev",
++  "title": "Modes, thresholds, prompt wiring",
++  "assignment": "Implement humanInvolvement + concerns thresholds: schema/loader/merge, PipelineConfig.humanInvolvement default autonomous + concerns {raiseAllowlist,minDigestSeverity,minBlockingSeverity}, commented autonomous/principal/detailed presets with blocking table in config/pipeline.default.yaml, terse agents/criteria/human-involvement.md fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria fragment and blocking-ADR routing; preflight green. Must precede all routing items. Verify: typecheck + preflightPrompts.",
++  "outlineRef": "modes-prompts-v2",
++  "milestone": "m2-triage-modes",
++  "wave": 6,
++  "deps": [
++    "concerns-contracts-policy",
++    "concerns-contracts-schemas",
++    "concerns-contracts-types"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/human-involvement-config.test.ts"
++  ],
++  "expectRed": [
++    "human-involvement pipeline configuration.defaults to autonomous mode with concern raise/digest/blocking policy",
++    "human-involvement pipeline configuration.layers humanInvolvement and concern thresholds through project and task configs",
++    "human-involvement pipeline configuration.applies overrides last and supports null deletion of concern keys",
++    "human-involvement pipeline configuration.schema accepts all modes and thresholds, rejects unknown values, and stays closed at root",
++    "human-involvement pipeline configuration.ships commented autonomous/principal/detailed presets with a blocking table",
++    "human-involvement pipeline configuration.registers a terse human-involvement criteria fragment and loads it",
++    "human-involvement pipeline configuration.registers concernsYaml and humanInvolvementCriteria for the fragment matrix",
++    "human-involvement pipeline configuration.preflight accepts the new vars on matrix fragments and rejects them elsewhere",
++    "human-involvement mode switching at prompt time.selects the active mode section plus the shared ADR blocking table",
++    "human-involvement mode switching at prompt time.renders empty involvement criteria when no fragment is configured",
++    "human-involvement mode switching at prompt time.lets callers provide hydrated concernsYaml without dropping the criteria"
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
+diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..05340c9
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T06:19:23.717Z
++session: 01a1b9cf-c8da-76e1-9957-ebfc1baf2dab
++endedAt: 2026-11-08T06:39:36.774Z
++usage:
++  inputTokens: 101154
++  outputTokens: 31985
++  costUsd: 0.053907
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-19-24-762Z_01a1b9cf-c8da-76e1-9957-ebfc1baf2dab
+diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..73905c8
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,70 @@
++status: ok
++summary: "Implemented humanInvolvement mode + concern thresholds: added schema
++  properties and closed concerns object, default pipeline values (autonomous,
++  raise allowlist, medium digest / high blocking) with commented
++  autonomous/principal/detailed presets and ADR blocking table, registered a
++  1.1KB agents/criteria/human-involvement.md fragment, added
++  concernsYaml/humanInvolvementCriteria to KNOWN_VARS per the fragment matrix,
++  and wired step-runner to inject the active mode's criteria section plus
++  caller-provided hydrated concernsYaml. Target test file is fully green and
++  typecheck passes; full suite passes with an enlarged per-test timeout."
++target:
++  selectors:
++    - test/human-involvement-config.test.ts
++  expectRed:
++    - human-involvement pipeline configuration.defaults to autonomous mode with
++      concern raise/digest/blocking policy
++    - human-involvement pipeline configuration.layers humanInvolvement and
++      concern thresholds through project and task configs
++    - human-involvement pipeline configuration.applies overrides last and
++      supports null deletion of concern keys
++    - human-involvement pipeline configuration.schema accepts all modes and
++      thresholds, rejects unknown values, and stays closed at root
++    - human-involvement pipeline configuration.ships commented
++      autonomous/principal/detailed presets with a blocking table
++    - human-involvement pipeline configuration.registers a terse
++      human-involvement criteria fragment and loads it
++    - human-involvement pipeline configuration.registers concernsYaml and
++      humanInvolvementCriteria for the fragment matrix
++    - human-involvement pipeline configuration.preflight accepts the new vars on
++      matrix fragments and rejects them elsewhere
++    - human-involvement mode switching at prompt time.selects the active mode
++      section plus the shared ADR blocking table
++    - human-involvement mode switching at prompt time.renders empty involvement
++      criteria when no fragment is configured
++    - human-involvement mode switching at prompt time.lets callers provide
++      hydrated concernsYaml without dropping the criteria
++evidence:
++  - cd plugins/software-factory && bun test
++    test/human-involvement-config.test.ts -> 11 pass, 0 fail, 100 expect() calls
++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit, exit code 0
++  - cd plugins/software-factory && TMPDIR=/tmp bun test --timeout 15000 -> 314
++    pass, 2 skip, 0 fail across 316 tests / 56 files
++  - cd plugins/software-factory && bun test test/prompts.test.ts
++    test/config-layering.test.ts test/contracts/concern-artifact-types.test.ts
++    -> 24 pass, 0 fail
++  - cd plugins/software-factory && bun test test/engine/qa-red-test.test.ts
++    test/engine/sessions-budget-simple.test.ts
++    test/engine/blocked-closeup-iteration.test.ts
++    test/engine/step-resilience.test.ts test/engine/crash-restart.test.ts -> 15
++    pass, 0 fail
++  - git diff --numstat + new criteria file -> 177 production lines changed
++    (budget 300)
++  - Default-timeout full suite runs showed only variable 5s per-test timeouts in
++    pre-existing engine tests (different file each run); each affected file
++    passes standalone, and the suite is green with --timeout 15000
++concerns:
++  - The project's pre-existing engine tests use a 5s per-test timeout and are
++    load-sensitive when the swarm runs suites concurrently; varying tests time
++    out on default gate runs but pass standalone, so gate retries or a
++    normalized timeout/load environment may be needed.
++  - concernsYaml is injected as an empty default here; actual concern-store
++    hydration belongs to the later routing/funnel items.
++  - Blocking-ADR enforcement is currently policy text/table only; mechanical
++    routing per mode is implemented by the dependent ADR-blocking/routing items.
++notes: step-runner now merges engine-supplied
++  humanInvolvementCriteria/concernsYaml before caller promptVars, so
++  caller-hydrated concerns win while the active mode criteria is always
++  retained. loadCriteriaBundle returns the full human-involvement text;
++  formatHumanInvolvementCriteria keeps shared sections plus only the active mode
++  section.
+diff --git a/plugins/software-factory/agents/criteria/human-involvement.md b/plugins/software-factory/agents/criteria/human-involvement.md
+new file mode 100644
+index 0000000..fee7fdc
+--- /dev/null
++++ b/plugins/software-factory/agents/criteria/human-involvement.md
+@@ -0,0 +1,28 @@
++# Human involvement criteria
++
++Mode selects which ADR and concern decisions need a human decision. Everything
++else is either autonomous or digest-only; never block on items the table marks
++remarkable.
++
++## Blocking table (ADRs and concerns)
++
++| Mode | Blocking (needs human decision) | Remarkable (digest only) |
++| --- | --- | --- |
++| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
++| principal | stack/layer, external interfaces, config shapes | internal choices |
++| detailed | external-interface changes and major internal interfaces | minor internals |
++
++## autonomous
++
++Block only explicit high-severity ADRs/concerns that remain after all unblocked
++work is finished. Do not stop for internal choices; record them as remarkable.
++
++## principal
++
++Block stack/layer choices, external-interface changes, config-shape changes, and
++major class/role decisions. Record internal choices as remarkable only.
++
++## detailed
++
++Block external-interface changes and major internal-interface changes in
++addition to the principal set. Record minor internals as remarkable only.
+diff --git a/plugins/software-factory/config/pipeline.default.yaml b/plugins/software-factory/config/pipeline.default.yaml
+index 4f72155..419a1aa 100644
+--- a/plugins/software-factory/config/pipeline.default.yaml
++++ b/plugins/software-factory/config/pipeline.default.yaml
+@@ -375,6 +375,62 @@ reviewPolicy:
+     - human-awareness
+     - human-async
+ 
++# ==============================================================================
++# Human Involvement & Concerns (§18)
++# ==============================================================================
++# `humanInvolvement` selects how aggressively remarkable decisions and
++# blocking ADRs/concerns reach the human: autonomous (least), principal, or
++# detailed (most). The active mode selects its `## <mode>` section from
++# `agents/criteria/human-involvement.md` and the shared blocking table below.
++#
++# `concerns.raiseAllowlist` lists agents whose structured output may raise
++# concerns. `minDigestSeverity` is the lowest severity worth a human digest;
++# `minBlockingSeverity` is the lowest severity that can block an item. Arrays
++# replace wholesale across config layers; `null` deletes a concern key.
++humanInvolvement: autonomous
++
++concerns:
++  raiseAllowlist:
++    - developer
++    - fact-finder
++    - architect
++    - qa
++    - reviewer
++    - plan-reviewer
++    - wave-close-up
++    - plan-close-up
++  minDigestSeverity: medium
++  minBlockingSeverity: high
++
++# Presets — copy the desired mode block into `.factory/pipeline.yaml` (project)
++# or a task `pipeline.yaml` override:
++#
++# humanInvolvement: autonomous
++# concerns:
++#   raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
++#   minDigestSeverity: medium
++#   minBlockingSeverity: high
++#
++# humanInvolvement: principal
++# concerns:
++#   raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
++#   minDigestSeverity: low
++#   minBlockingSeverity: medium
++#
++# humanInvolvement: detailed
++# concerns:
++#   raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
++#   minDigestSeverity: low
++#   minBlockingSeverity: low
++#
++# ADR blocking table (which ADRs and concerns reach the human per mode):
++#
++# | Mode | Blocking (needs human decision) | Remarkable (digest only) |
++# | --- | --- | --- |
++# | autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
++# | principal | stack/layer, external interfaces, config shapes | internal choices |
++# | detailed | external-interface changes and major internal interfaces | minor internals |
++
+ # ==============================================================================
+ # Criteria (§5, §8.7)
+ # ==============================================================================
+@@ -397,6 +453,7 @@ criteria:
+   triage: agents/criteria/triage.md
+   dispositions: agents/criteria/dispositions.md
+   story-kinds: agents/criteria/story-kinds.md
++  human-involvement: agents/criteria/human-involvement.md
+ 
+ # ==============================================================================
+ # Prompts (§5, §10)
+diff --git a/plugins/software-factory/config/schemas/pipeline.schema.json b/plugins/software-factory/config/schemas/pipeline.schema.json
+index 2576fdc..6937794 100644
+--- a/plugins/software-factory/config/schemas/pipeline.schema.json
++++ b/plugins/software-factory/config/schemas/pipeline.schema.json
+@@ -199,6 +199,29 @@
+       "type": "string",
+       "default": "omp"
+     },
++    "humanInvolvement": {
++      "type": "string",
++      "enum": ["autonomous", "principal", "detailed"],
++      "default": "autonomous"
++    },
++    "concerns": {
++      "type": "object",
++      "properties": {
++        "raiseAllowlist": {
++          "type": "array",
++          "items": { "type": "string" }
++        },
++        "minDigestSeverity": {
++          "type": "string",
++          "enum": ["low", "medium", "high"]
++        },
++        "minBlockingSeverity": {
++          "type": "string",
++          "enum": ["low", "medium", "high"]
++        }
++      },
++      "additionalProperties": false
++    },
+     "reviewPolicy": {
+       "type": "object",
+       "properties": {
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index f5e0e00..dc26055 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -29,6 +29,7 @@ import { captureHead, enforceHead } from "../git/guard.js";
+ import { commitAll } from "../git/commit.js";
+ import { git } from "../git/exec.js";
+ import { appendJournal } from "../journal.js";
++import { loadCriteriaBundle, formatHumanInvolvementCriteria } from "../prompts.js";
+ import { registerActiveStep, unregisterActiveStep } from "../shutdown.js";
+ import { getClock, detectSuspend } from "../clock.js";
+ import type { Semaphore } from "../mutex.js";
+@@ -244,12 +245,21 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+ 
+   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
+   const fragment = stepFragment ?? `steps/${stepId}`;
++  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
++  const effectivePromptVars: Record<string, string> = {
++    humanInvolvementCriteria: formatHumanInvolvementCriteria(
++      criteriaBundle.humanInvolvement,
++      pipeline.humanInvolvement
++    ),
++    concernsYaml: "",
++    ...promptVars,
++  };
+   let promptText: string;
+   let agentDef: { body: string; tools: string[]; description: string };
+   try {
+     promptText = prompts.renderStepPrompt
+-      ? prompts.renderStepPrompt(fragment, promptVars, outputSchema)
+-      : prompts.render(fragment, promptVars);
++      ? prompts.renderStepPrompt(fragment, effectivePromptVars, outputSchema)
++      : prompts.render(fragment, effectivePromptVars);
+     agentDef = prompts.agentDefinition(agent);
+   } catch (err: any) {
+     const errorMsg = `Prompt or agent definition error for step ${stepId}: ${err?.message || err}`;
+diff --git a/plugins/software-factory/src/core/prompt-vars.ts b/plugins/software-factory/src/core/prompt-vars.ts
+index 89fef99..991d946 100644
+--- a/plugins/software-factory/src/core/prompt-vars.ts
++++ b/plugins/software-factory/src/core/prompt-vars.ts
+@@ -35,6 +35,8 @@ export const PROMPT_VAR_DESCRIPTIONS: Record<string, string> = {
+   triageCriteria: "Task triage hierarchy criteria file contents (criteria.triage)",
+   dispositionsCriteria: "Review dispositions criteria file contents filtered to allowed dispositions (criteria.dispositions)",
+   storyKindsCriteria: "Story and spike kinds criteria file contents (criteria.story-kinds)",
++  humanInvolvementCriteria: "Active human-involvement mode rules plus shared ADR/concern blocking table (criteria.human-involvement)",
++  concernsYaml: "Open concerns hydrated for this step, formatted as YAML",
+ };
+ 
+ /**
+@@ -55,11 +57,11 @@ export const KNOWN_VARS: Record<string, string[]> = {
+ 
+   "steps/test-first": ["assignment", "citations"],
+   "test-first": ["assignment", "citations"],
+-  "steps/qa": ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria"],
+-  qa: ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria"],
++  "steps/qa": ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
++  qa: ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
+ 
+-  "steps/review": ["assignment", "checks", "diff", "dispositionsCriteria"],
+-  review: ["assignment", "checks", "diff", "dispositionsCriteria"],
++  "steps/review": ["assignment", "checks", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
++  review: ["assignment", "checks", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
+ 
+   "steps/fix-round": ["assignment", "feedback", "checks", "diff"],
+   "fix-round": ["assignment", "feedback", "checks", "diff"],
+@@ -100,6 +102,8 @@ export const KNOWN_VARS: Record<string, string[]> = {
+     "debt",
+     "steering",
+     "limits",
++    "humanInvolvementCriteria",
++    "concernsYaml",
+   ],
+   "architect-plan": [
+     "task",
+@@ -110,19 +114,21 @@ export const KNOWN_VARS: Record<string, string[]> = {
+     "debt",
+     "steering",
+     "limits",
++    "humanInvolvementCriteria",
++    "concernsYaml",
+   ],
+ 
+-  "steps/architect-revise": ["plan", "planReview"],
+-  "architect-revise": ["plan", "planReview"],
++  "steps/architect-revise": ["plan", "planReview", "humanInvolvementCriteria", "concernsYaml"],
++  "architect-revise": ["plan", "planReview", "humanInvolvementCriteria", "concernsYaml"],
+ 
+-  "steps/architect-resume": ["plan", "waveReport", "steering"],
+-  "architect-resume": ["plan", "waveReport", "steering"],
++  "steps/architect-resume": ["plan", "waveReport", "steering", "humanInvolvementCriteria", "concernsYaml"],
++  "architect-resume": ["plan", "waveReport", "steering", "humanInvolvementCriteria", "concernsYaml"],
+ 
+-  "steps/architect-wave-report": ["plan", "waveReport", "debt", "steering"],
+-  "architect-wave-report": ["plan", "waveReport", "debt", "steering"],
++  "steps/architect-wave-report": ["plan", "waveReport", "debt", "steering", "humanInvolvementCriteria", "concernsYaml"],
++  "architect-wave-report": ["plan", "waveReport", "debt", "steering", "humanInvolvementCriteria", "concernsYaml"],
+ 
+-  "steps/architect-closeup": ["closeup", "plan", "intent"],
+-  "architect-closeup": ["closeup", "plan", "intent"],
++  "steps/architect-closeup": ["closeup", "plan", "intent", "humanInvolvementCriteria", "concernsYaml"],
++  "architect-closeup": ["closeup", "plan", "intent", "humanInvolvementCriteria", "concernsYaml"],
+ 
+   "steps/architect-consult-item": [
+     "item",
+@@ -130,6 +136,8 @@ export const KNOWN_VARS: Record<string, string[]> = {
+     "priorAttempts",
+     "diff",
+     "feedback",
++    "humanInvolvementCriteria",
++    "concernsYaml",
+   ],
+   "architect-consult-item": [
+     "item",
+@@ -137,20 +145,22 @@ export const KNOWN_VARS: Record<string, string[]> = {
+     "priorAttempts",
+     "diff",
+     "feedback",
++    "humanInvolvementCriteria",
++    "concernsYaml",
+   ],
+ 
+-  "steps/architect-consult-nonitem": ["task", "context", "feedback", "debt"],
+-  "architect-consult-nonitem": ["task", "context", "feedback", "debt"],
++  "steps/architect-consult-nonitem": ["task", "context", "feedback", "debt", "humanInvolvementCriteria", "concernsYaml"],
++  "architect-consult-nonitem": ["task", "context", "feedback", "debt", "humanInvolvementCriteria", "concernsYaml"],
+ 
+   // Close-up and review checkpoints
+-  "steps/wave-close-up": ["task", "waveReport", "infra"],
+-  "wave-close-up": ["task", "waveReport", "infra"],
++  "steps/wave-close-up": ["task", "waveReport", "infra", "humanInvolvementCriteria", "concernsYaml"],
++  "wave-close-up": ["task", "waveReport", "infra", "humanInvolvementCriteria", "concernsYaml"],
+ 
+-  "steps/plan-close-up": ["intent", "plan", "context"],
+-  "plan-close-up": ["intent", "plan", "context"],
++  "steps/plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
++  "plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
+ 
+-  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria"],
+-  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria"],
++  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
++  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
+ 
+   // System fragments
+   "system/steer-classify": [],
+diff --git a/plugins/software-factory/src/core/prompts.ts b/plugins/software-factory/src/core/prompts.ts
+index b8b6516..8ffa554 100644
+--- a/plugins/software-factory/src/core/prompts.ts
++++ b/plugins/software-factory/src/core/prompts.ts
+@@ -23,6 +23,7 @@ export interface CriteriaBundle {
+   triage?: string;
+   dispositions?: string;
+   storyKinds?: string;
++  humanInvolvement?: string;
+ }
+ 
+ /**
+@@ -42,6 +43,7 @@ export function loadCriteriaBundle(
+     ["triage", "triage"],
+     ["dispositions", "dispositions"],
+     ["story-kinds", "storyKinds"],
++    ["human-involvement", "humanInvolvement"],
+   ];
+   for (const [key, field] of mapping) {
+     const filePath = criteria[key];
+@@ -56,6 +58,31 @@ export function loadCriteriaBundle(
+   return bundle;
+ }
+ 
++/**
++ * Selects the active mode's `## <mode>` section from the human-involvement
++ * criteria file plus every shared section (notably the ADR blocking table).
++ * Inactive mode sections are dropped; empty input renders an empty string.
++ */
++const HUMAN_INVOLVEMENT_MODES = new Set(["autonomous", "principal", "detailed"]);
++
++export function formatHumanInvolvementCriteria(
++  criteria: string | undefined,
++  mode: PipelineConfig["humanInvolvement"] = "autonomous"
++): string {
++  if (!criteria || criteria.trim().length === 0) return "";
++  const active = mode ?? "autonomous";
++  const kept: string[] = [];
++  let keep = true;
++  for (const line of criteria.split("\n")) {
++    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1]?.toLowerCase();
++    if (heading !== undefined) {
++      keep = !HUMAN_INVOLVEMENT_MODES.has(heading) || heading === active;
++    }
++    if (keep) kept.push(line);
++  }
++  return kept.join("\n").trim();
++}
++
+ /**
+  * Formats the dispositions criteria section for review prompts (§8.7).
+  * Drops `human-stop` rows unless the agent's allowed dispositions include it.
+diff --git a/plugins/software-factory/test/human-involvement-config.test.ts b/plugins/software-factory/test/human-involvement-config.test.ts
+new file mode 100644
+index 0000000..f85b2d4
+--- /dev/null
++++ b/plugins/software-factory/test/human-involvement-config.test.ts
+@@ -0,0 +1,439 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import os from "node:os";
++import path from "node:path";
++import yaml from "yaml";
++import { createAjv } from "../src/core/config/ajv.js";
++import { loadPipelineConfig } from "../src/core/config/loader.js";
++import {
++  loadCriteriaBundle,
++  loadPromptLibrary,
++  preflightPrompts,
++} from "../src/core/prompts.js";
++import { KNOWN_VARS, PROMPT_VAR_DESCRIPTIONS } from "../src/core/prompt-vars.js";
++import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
++import { FakeHarness } from "../src/harness/fake/fake-harness.js";
++import { runAgentStep } from "../src/core/flows/step-runner.js";
++import { Repo } from "../src/core/git/repo.js";
++import type { PipelineConfig, ProjectConfig } from "../src/core/artifacts.js";
++
++/**
++ * Human-involvement modes + concern thresholds (docs/factory.v2.md §18,
++ * docs/adr/adr-humaninvolvement-config.md).
++ *
++ * Contract under test:
++ * - `humanInvolvement` is a top-level pipeline key (autonomous|principal|
++ *   detailed), defaulting to `autonomous`; `concerns` carries the raise
++ *   allowlist plus digest/blocking severity thresholds.
++ * - The default config ships commented presets for all three modes with a
++ *   blocking table (which ADRs/concerns reach the human per mode).
++ * - A terse `agents/criteria/human-involvement.md` fragment is registered under
++ *   `criteria.human-involvement`; the active mode selects its `## <mode>`
++ *   section plus the shared blocking table.
++ * - `concernsYaml` and `humanInvolvementCriteria` are registered in KNOWN_VARS
++ *   for the review/architect/close-up fragment matrix and supplied by the
++ *   engine when rendering those steps.
++ */
++
++const pluginRoot = path.resolve(import.meta.dir, "..");
++const defaultPipelinePath = path.join(pluginRoot, "config/pipeline.default.yaml");
++const agentsDir = path.join(pluginRoot, "agents");
++
++const MODES = ["autonomous", "principal", "detailed"] as const;
++
++/** Default concern policy: every agent whose output schema can raise concerns. */
++const DEFAULT_RAISE_ALLOWLIST = [
++  "developer",
++  "fact-finder",
++  "architect",
++  "qa",
++  "reviewer",
++  "plan-reviewer",
++  "wave-close-up",
++  "plan-close-up",
++];
++
++/**
++ * Fragment matrix: which engine steps receive which concern/involvement var.
++ * Reviewers triage raised concerns; architects mark ADRs blocking and consume
++ * funneled concerns; close-ups are funnel levels themselves.
++ */
++const FRAGMENT_MATRIX: Record<string, string[]> = {
++  review: ["humanInvolvementCriteria", "concernsYaml"],
++  qa: ["humanInvolvementCriteria", "concernsYaml"],
++  "plan-review": ["humanInvolvementCriteria"],
++  "wave-close-up": ["humanInvolvementCriteria", "concernsYaml"],
++  "plan-close-up": ["humanInvolvementCriteria", "concernsYaml"],
++  "architect-plan": ["humanInvolvementCriteria", "concernsYaml"],
++  "architect-revise": ["humanInvolvementCriteria", "concernsYaml"],
++  "architect-resume": ["humanInvolvementCriteria", "concernsYaml"],
++  "architect-wave-report": ["humanInvolvementCriteria", "concernsYaml"],
++  "architect-closeup": ["humanInvolvementCriteria", "concernsYaml"],
++  "architect-consult-item": ["humanInvolvementCriteria", "concernsYaml"],
++  "architect-consult-nonitem": ["humanInvolvementCriteria", "concernsYaml"],
++};
++
++const CRITERIA_FIXTURE = `# Human involvement criteria
++
++## Blocking table (ADRs and concerns)
++
++| Mode | Blocking (needs human decision) | Remarkable (digest only) |
++| --- | --- | --- |
++| autonomous | high-severity blockers still blocked after unblocked work | everything else |
++| principal | stack/layer, external interfaces, config shapes | internal choices |
++| detailed | external-interface changes and major internal interfaces | minor internals |
++
++## autonomous
++
++AUTONOMOUS-ADR-RULE: block only explicit high-severity blockers that remain after unblocked work is done.
++
++## principal
++
++PRINCIPAL-ADR-RULE: block stack/layer, external-interface, config-shape, and major-class-role decisions.
++
++## detailed
++
++DETAILED-ADR-RULE: additionally block external-interface changes and major internal-interface changes.
++`;
++
++function writePipelineLayers(
++  dir: string,
++  project: Record<string, unknown>,
++  task: Record<string, unknown>
++): { repoRoot: string; taskYamlPath: string } {
++  const factoryDir = path.join(dir, ".factory");
++  fs.mkdirSync(factoryDir, { recursive: true });
++  fs.writeFileSync(
++    path.join(factoryDir, "pipeline.yaml"),
++    yaml.stringify(project),
++    "utf8"
++  );
++  const taskYamlPath = path.join(factoryDir, "task-pipeline.yaml");
++  fs.writeFileSync(taskYamlPath, yaml.stringify(task), "utf8");
++  return { repoRoot: dir, taskYamlPath };
++}
++
++describe("human-involvement pipeline configuration", () => {
++  it("defaults to autonomous mode with concern raise/digest/blocking policy", () => {
++    const { config } = loadPipelineConfig({ skipStructuralValidation: true });
++
++    expect(config.humanInvolvement).toBe("autonomous");
++    expect(config.concerns).toBeDefined();
++    expect([...(config.concerns?.raiseAllowlist ?? [])].sort()).toEqual(
++      [...DEFAULT_RAISE_ALLOWLIST].sort()
++    );
++    expect(config.concerns?.minDigestSeverity).toBe("medium");
++    expect(config.concerns?.minBlockingSeverity).toBe("high");
++  });
++
++  it("layers humanInvolvement and concern thresholds through project and task configs", () => {
++    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "factory-mode-layers-"));
++    try {
++      const { repoRoot, taskYamlPath } = writePipelineLayers(
++        tmp,
++        {
++          humanInvolvement: "principal",
++          concerns: {
++            raiseAllowlist: ["developer", "reviewer"],
++            minDigestSeverity: "low",
++          },
++        },
++        {
++          humanInvolvement: "detailed",
++          concerns: { minBlockingSeverity: "medium" },
++        }
++      );
++
++      const { config } = loadPipelineConfig({
++        repoRoot,
++        taskYamlPath,
++        skipStructuralValidation: true,
++      });
++
++      // Task layer wins over project layer; project layer wins over defaults.
++      expect(config.humanInvolvement).toBe("detailed");
++      expect(config.concerns?.raiseAllowlist).toEqual(["developer", "reviewer"]);
++      expect(config.concerns?.minDigestSeverity).toBe("low");
++      expect(config.concerns?.minBlockingSeverity).toBe("medium");
++    } finally {
++      fs.rmSync(tmp, { recursive: true, force: true });
++    }
++  });
++
++  it("applies overrides last and supports null deletion of concern keys", () => {
++    const { config } = loadPipelineConfig({
++      skipStructuralValidation: true,
++      overrides: {
++        humanInvolvement: "principal",
++        concerns: {
++          raiseAllowlist: ["architect"],
++          minDigestSeverity: null,
++        },
++      },
++    });
++
++    expect(config.humanInvolvement).toBe("principal");
++    expect(config.concerns?.raiseAllowlist).toEqual(["architect"]);
++    expect(config.concerns && "minDigestSeverity" in config.concerns).toBe(false);
++    expect(config.concerns?.minBlockingSeverity).toBe("high");
++  });
++
++  it("schema accepts all modes and thresholds, rejects unknown values, and stays closed at root", () => {
++    const schema = JSON.parse(
++      fs.readFileSync(path.join(pluginRoot, "config/schemas/pipeline.schema.json"), "utf8")
++    );
++    const validate = createAjv().compile(schema);
++    const raw = yaml.parse(fs.readFileSync(defaultPipelinePath, "utf8"));
++
++    for (const mode of MODES) {
++      expect({ mode, ok: validate({ ...raw, humanInvolvement: mode }) }).toEqual({
++        mode,
++        ok: true,
++      });
++    }
++
++    expect(
++      validate({
++        ...raw,
++        concerns: {
++          raiseAllowlist: ["developer", "reviewer"],
++          minDigestSeverity: "medium",
++          minBlockingSeverity: "high",
++        },
++      })
++    ).toBe(true);
++
++    expect(validate({ ...raw, humanInvolvement: "sometimes" })).toBe(false);
++    expect(
++      validate({ ...raw, concerns: { minBlockingSeverity: "critical" } })
++    ).toBe(false);
++    expect(validate({ ...raw, concerns: { raiseAllowlist: "developer" } })).toBe(false);
++    expect(validate({ ...raw, unknownRootKey: true })).toBe(false);
++  });
++
++  it("ships commented autonomous/principal/detailed presets with a blocking table", () => {
++    const text = fs.readFileSync(defaultPipelinePath, "utf8");
++    const raw = yaml.parse(text);
++    expect(raw.humanInvolvement).toBe("autonomous");
++
++    // Strip YAML comment markers so preset bodies can be inspected as text.
++    const commented = text
++      .split("\n")
++      .filter((line) => /^\s*#/.test(line))
++      .map((line) => line.replace(/^\s*#\s?/, ""))
++      .join("\n");
++
++    for (const mode of MODES) {
++      expect(commented).toMatch(new RegExp(`humanInvolvement:\\s*${mode}\\b`));
++    }
++    expect(commented).toMatch(/\|\s*Mode\s*\|/i);
++    expect(commented).toMatch(/\|\s*Blocking\b/i);
++    for (const mode of MODES) {
++      expect(commented).toMatch(new RegExp(`\\|\\s*${mode}\\s*\\|`, "i"));
++    }
++    expect(commented).toMatch(/\bADR\b/);
++  });
++
++  it("registers a terse human-involvement criteria fragment and loads it", () => {
++    const { config } = loadPipelineConfig({ skipStructuralValidation: true });
++    const fragmentPath = config.criteria?.["human-involvement"];
++
++    expect(typeof fragmentPath).toBe("string");
++    expect(path.isAbsolute(fragmentPath!)).toBe(true);
++    expect(fs.existsSync(fragmentPath!)).toBe(true);
++
++    const text = fs.readFileSync(fragmentPath!, "utf8");
++    for (const mode of MODES) {
++      expect(text).toMatch(new RegExp(`^##\\s*${mode}\\b`, "m"));
++      expect(text).toMatch(new RegExp(`\\|\\s*${mode}\\s*\\|`, "i"));
++    }
++    expect(text).toMatch(/\|\s*Mode\s*\|/i);
++    expect(text).toMatch(/\|\s*Blocking\b/i);
++    expect(text).toMatch(/\bADR\b/);
++    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4096);
++
++    const bundle = loadCriteriaBundle(config.criteria) as Record<string, string | undefined>;
++    expect(typeof bundle.humanInvolvement).toBe("string");
++    expect(bundle.humanInvolvement).toContain("Blocking table");
++    expect(bundle.humanInvolvement).toContain("autonomous");
++  });
++
++  it("registers concernsYaml and humanInvolvementCriteria for the fragment matrix", () => {
++    for (const [fragment, vars] of Object.entries(FRAGMENT_MATRIX)) {
++      for (const key of [fragment, `steps/${fragment}`]) {
++        expect({ key, vars: KNOWN_VARS[key] }).toEqual({
++          key,
++          vars: expect.arrayContaining(vars),
++        });
++      }
++    }
++
++    // Non-consumers must not silently gain the vars: the matrix is selective.
++    for (const key of ["develop", "steps/develop", "triage", "steps/triage", "infra"]) {
++      expect(KNOWN_VARS[key]).not.toContain("humanInvolvementCriteria");
++      expect(KNOWN_VARS[key]).not.toContain("concernsYaml");
++    }
++
++    expect(PROMPT_VAR_DESCRIPTIONS.humanInvolvementCriteria).toBeTruthy();
++    expect(PROMPT_VAR_DESCRIPTIONS.concernsYaml).toBeTruthy();
++  });
++
++  it("preflight accepts the new vars on matrix fragments and rejects them elsewhere", () => {
++    const { config: pipeline } = loadPipelineConfig();
++    const lib = loadPromptLibrary({ builtinDir: agentsDir });
++
++    // The real pipeline stays green after the fragment/matrix wiring.
++    expect(preflightPrompts(lib, pipeline)).toEqual([]);
++
++    const matrixLib = loadPromptLibrary({
++      builtinDir: agentsDir,
++      overrides: {
++        review:
++          "Review {{assignment}} {{checks}} {{diff}} {{dispositionsCriteria}}\n" +
++          "{{humanInvolvementCriteria}}\n{{concernsYaml}}",
++      },
++    });
++    expect(preflightPrompts(matrixLib, pipeline)).toEqual([]);
++
++    const nonMatrixLib = loadPromptLibrary({
++      builtinDir: agentsDir,
++      overrides: {
++        develop: "Develop {{assignment}} {{target}} {{citations}} {{concernsYaml}}",
++      },
++    });
++    const errors = preflightPrompts(nonMatrixLib, pipeline);
++    expect(errors.some((e) => e.includes('Unknown placeholder "concernsYaml"'))).toBe(true);
++  });
++});
++
++describe("human-involvement mode switching at prompt time", () => {
++  let tmpRepo: TmpRepo;
++  let repoObj: Repo;
++  let project: ProjectConfig;
++  let worktreeRoot: string;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    worktreeRoot = path.join(tmpRepo.dir + "-wt");
++    fs.mkdirSync(worktreeRoot, { recursive: true });
++    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++    project = { orchestrationFolder: ".factory", worktreeRoot };
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  async function renderArchitectPlan(opts: {
++    mode: (typeof MODES)[number];
++    criteriaPath?: string;
++    promptVars?: Record<string, string>;
++  }): Promise<{ ok: boolean; prompt?: string; error?: string }> {
++    const task = `mode-${opts.mode}`;
++    const taskDir = path.join(tmpRepo.dir, ".factory", task);
++    const recordsDir = path.join(taskDir, "runs");
++    fs.mkdirSync(recordsDir, { recursive: true });
++
++    const prompts = loadPromptLibrary({
++      builtinDir: agentsDir,
++      overrides: {
++        "steps/architect-plan":
++          "ARCHITECT CRITERIA:\n{{humanInvolvementCriteria}}\nCONCERNS:\n{{concernsYaml}}\n",
++      },
++    });
++    const pipeline: PipelineConfig = {
++      models: {
++        roles: {
++          workhorse: { model: "model-workhorse" },
++          architect: { model: "model-architect" },
++          simpler: { model: "model-simpler" },
++        },
++      },
++      agents: { architect: { role: "architect" } },
++      flows: { simple: { steps: [] }, story: {}, spike: {} },
++      limits: {},
++      humanInvolvement: opts.mode,
++      ...(opts.criteriaPath
++        ? { criteria: { "human-involvement": opts.criteriaPath } }
++        : {}),
++    };
++
++    const harness = new FakeHarness();
++    harness.scriptOutcome(`${task}/runs/architect-plan#a1`, {
++      ok: true,
++      data: { iteration: 1, milestones: [], itemOutlines: [] },
++    });
++
++    const res = await runAgentStep({
++      task,
++      stepId: "architect-plan",
++      stepFragment: "steps/architect-plan",
++      agent: "architect",
++      cwd: tmpRepo.dir,
++      taskWt: tmpRepo.dir,
++      taskDir,
++      recordsDir,
++      repo: repoObj,
++      harness,
++      pipeline,
++      project,
++      prompts,
++      promptVars: opts.promptVars ?? {},
++    });
++
++    const runCall = harness.calls.find((call) => call.type === "run");
++    return {
++      ok: res.ok,
++      prompt: runCall && runCall.type === "run" ? runCall.run.prompt : undefined,
++      error: res.meta?.error,
++    };
++  }
++
++  it("selects the active mode section plus the shared ADR blocking table", async () => {
++    const criteriaPath = path.join(tmpRepo.dir, "human-involvement.md");
++    fs.writeFileSync(criteriaPath, CRITERIA_FIXTURE, "utf8");
++
++    const autonomous = await renderArchitectPlan({ mode: "autonomous", criteriaPath });
++    const detailed = await renderArchitectPlan({ mode: "detailed", criteriaPath });
++
++    expect({ ok: autonomous.ok, error: autonomous.error }).toEqual({
++      ok: true,
++      error: undefined,
++    });
++    expect({ ok: detailed.ok, error: detailed.error }).toEqual({
++      ok: true,
++      error: undefined,
++    });
++
++    expect(autonomous.prompt).toContain("Blocking table (ADRs and concerns)");
++    expect(autonomous.prompt).toContain("AUTONOMOUS-ADR-RULE");
++    expect(autonomous.prompt).not.toContain("DETAILED-ADR-RULE");
++
++    expect(detailed.prompt).toContain("Blocking table (ADRs and concerns)");
++    expect(detailed.prompt).toContain("DETAILED-ADR-RULE");
++    expect(detailed.prompt).not.toContain("AUTONOMOUS-ADR-RULE");
++  });
++
++  it("renders empty involvement criteria when no fragment is configured", async () => {
++    const run = await renderArchitectPlan({ mode: "autonomous" });
++
++    expect({ ok: run.ok, error: run.error }).toEqual({ ok: true, error: undefined });
++    expect(run.prompt).toBeDefined();
++    expect(run.prompt).not.toContain("ADR-RULE");
++  });
++
++  it("lets callers provide hydrated concernsYaml without dropping the criteria", async () => {
++    const criteriaPath = path.join(tmpRepo.dir, "human-involvement.md");
++    fs.writeFileSync(criteriaPath, CRITERIA_FIXTURE, "utf8");
++
++    const run = await renderArchitectPlan({
++      mode: "principal",
++      criteriaPath,
++      promptVars: { concernsYaml: "CALLER-CONCERNS: c-1 blocker" },
++    });
++
++    expect({ ok: run.ok, error: run.error }).toEqual({ ok: true, error: undefined });
++    expect(run.prompt).toContain("CALLER-CONCERNS: c-1 blocker");
++    expect(run.prompt).toContain("PRINCIPAL-ADR-RULE");
++  });
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
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..ce03838
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T06:39:44.705Z
+session: 01a1b9e2-6eae-71ac-a18d-cc5ae6bf3569
+endedAt: 2026-11-08T06:45:33.488Z
+usage:
+  inputTokens: 44412
+  outputTokens: 31432
+  costUsd: 0.011489
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T06-39-46-862Z_01a1b9e2-6eae-71ac-a18d-cc5ae6bf3569
diff --git a/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..1948f7e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/modes-prompts-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,37 @@
+status: approved
+summary: "dev item verified: 11/11 target green, typecheck clean, no weakening,
+  matrix + mode-switch behavior correct"
+suggestions:
+  - detail: FRAGMENT_MATRIX declares plan-review gets humanInvolvementCriteria only,
+      and implementation complies (prompt-vars.ts:162-163). Test uses
+      arrayContaining for presence plus negative checks only for
+      develop/triage/infra (test:272-275), so a future addition of concernsYaml
+      to plan-review would still pass. Add not.toContain(concernsYaml) for
+      plan-review keys.
+    disposition: optional
+    id: plan-review-concerns-negative
+    location:
+      file: plugins/software-factory/test/human-involvement-config.test.ts
+      line: 261
+    summary: "Harden matrix test: assert plan-review excludes concernsYaml"
+  - detail: Autonomous case asserts not DETAILED but not PRINCIPAL; detailed case
+      asserts not AUTONOMOUS but not PRINCIPAL; principal case asserts no
+      inactive absence. Implementation correctly filters (prompts.ts:68-84) but
+      tests would miss partial leakage of the unchecked mode. Assert both
+      inactive markers absent in each mode.
+    disposition: optional
+    id: mode-filter-both-inactives
+    location:
+      file: plugins/software-factory/test/human-involvement-config.test.ts
+      line: 392
+    summary: "Harden mode-switch tests: check both inactive markers absent"
+  - detail: Empty-fragment case only asserts not contains ADR-RULE (test:422). Any
+      non-marker garbage would also pass. Assert the criteria block renders
+      empty, e.g. prompt contains ARCHITECT CRITERIA followed by empty/concerns
+      boundary.
+    disposition: optional
+    id: empty-criteria-exact
+    location:
+      file: plugins/software-factory/test/human-involvement-config.test.ts
+      line: 417
+    summary: "Harden empty-criteria test: assert exact empty rendering"
diff --git a/plugins/software-factory/agents/criteria/human-involvement.md b/plugins/software-factory/agents/criteria/human-involvement.md
new file mode 100644
index 0000000..fee7fdc
--- /dev/null
+++ b/plugins/software-factory/agents/criteria/human-involvement.md
@@ -0,0 +1,28 @@
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
+## principal
+
+Block stack/layer choices, external-interface changes, config-shape changes, and
+major class/role decisions. Record internal choices as remarkable only.
+
+## detailed
+
+Block external-interface changes and major internal-interface changes in
+addition to the principal set. Record minor internals as remarkable only.
diff --git a/plugins/software-factory/config/pipeline.default.yaml b/plugins/software-factory/config/pipeline.default.yaml
index 4f72155..419a1aa 100644
--- a/plugins/software-factory/config/pipeline.default.yaml
+++ b/plugins/software-factory/config/pipeline.default.yaml
@@ -375,6 +375,62 @@ reviewPolicy:
     - human-awareness
     - human-async
 
+# ==============================================================================
+# Human Involvement & Concerns (§18)
+# ==============================================================================
+# `humanInvolvement` selects how aggressively remarkable decisions and
+# blocking ADRs/concerns reach the human: autonomous (least), principal, or
+# detailed (most). The active mode selects its `## <mode>` section from
+# `agents/criteria/human-involvement.md` and the shared blocking table below.
+#
+# `concerns.raiseAllowlist` lists agents whose structured output may raise
+# concerns. `minDigestSeverity` is the lowest severity worth a human digest;
+# `minBlockingSeverity` is the lowest severity that can block an item. Arrays
+# replace wholesale across config layers; `null` deletes a concern key.
+humanInvolvement: autonomous
+
+concerns:
+  raiseAllowlist:
+    - developer
+    - fact-finder
+    - architect
+    - qa
+    - reviewer
+    - plan-reviewer
+    - wave-close-up
+    - plan-close-up
+  minDigestSeverity: medium
+  minBlockingSeverity: high
+
+# Presets — copy the desired mode block into `.factory/pipeline.yaml` (project)
+# or a task `pipeline.yaml` override:
+#
+# humanInvolvement: autonomous
+# concerns:
+#   raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
+#   minDigestSeverity: medium
+#   minBlockingSeverity: high
+#
+# humanInvolvement: principal
+# concerns:
+#   raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
+#   minDigestSeverity: low
+#   minBlockingSeverity: medium
+#
+# humanInvolvement: detailed
+# concerns:
+#   raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
+#   minDigestSeverity: low
+#   minBlockingSeverity: low
+#
+# ADR blocking table (which ADRs and concerns reach the human per mode):
+#
+# | Mode | Blocking (needs human decision) | Remarkable (digest only) |
+# | --- | --- | --- |
+# | autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
+# | principal | stack/layer, external interfaces, config shapes | internal choices |
+# | detailed | external-interface changes and major internal interfaces | minor internals |
+
 # ==============================================================================
 # Criteria (§5, §8.7)
 # ==============================================================================
@@ -397,6 +453,7 @@ criteria:
   triage: agents/criteria/triage.md
   dispositions: agents/criteria/dispositions.md
   story-kinds: agents/criteria/story-kinds.md
+  human-involvement: agents/criteria/human-involvement.md
 
 # ==============================================================================
 # Prompts (§5, §10)
diff --git a/plugins/software-factory/config/schemas/pipeline.schema.json b/plugins/software-factory/config/schemas/pipeline.schema.json
index 2576fdc..6937794 100644
--- a/plugins/software-factory/config/schemas/pipeline.schema.json
+++ b/plugins/software-factory/config/schemas/pipeline.schema.json
@@ -199,6 +199,29 @@
       "type": "string",
       "default": "omp"
     },
+    "humanInvolvement": {
+      "type": "string",
+      "enum": ["autonomous", "principal", "detailed"],
+      "default": "autonomous"
+    },
+    "concerns": {
+      "type": "object",
+      "properties": {
+        "raiseAllowlist": {
+          "type": "array",
+          "items": { "type": "string" }
+        },
+        "minDigestSeverity": {
+          "type": "string",
+          "enum": ["low", "medium", "high"]
+        },
+        "minBlockingSeverity": {
+          "type": "string",
+          "enum": ["low", "medium", "high"]
+        }
+      },
+      "additionalProperties": false
+    },
     "reviewPolicy": {
       "type": "object",
       "properties": {
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index f5e0e00..dc26055 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -29,6 +29,7 @@ import { captureHead, enforceHead } from "../git/guard.js";
 import { commitAll } from "../git/commit.js";
 import { git } from "../git/exec.js";
 import { appendJournal } from "../journal.js";
+import { loadCriteriaBundle, formatHumanInvolvementCriteria } from "../prompts.js";
 import { registerActiveStep, unregisterActiveStep } from "../shutdown.js";
 import { getClock, detectSuspend } from "../clock.js";
 import type { Semaphore } from "../mutex.js";
@@ -244,12 +245,21 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
 
   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
   const fragment = stepFragment ?? `steps/${stepId}`;
+  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
+  const effectivePromptVars: Record<string, string> = {
+    humanInvolvementCriteria: formatHumanInvolvementCriteria(
+      criteriaBundle.humanInvolvement,
+      pipeline.humanInvolvement
+    ),
+    concernsYaml: "",
+    ...promptVars,
+  };
   let promptText: string;
   let agentDef: { body: string; tools: string[]; description: string };
   try {
     promptText = prompts.renderStepPrompt
-      ? prompts.renderStepPrompt(fragment, promptVars, outputSchema)
-      : prompts.render(fragment, promptVars);
+      ? prompts.renderStepPrompt(fragment, effectivePromptVars, outputSchema)
+      : prompts.render(fragment, effectivePromptVars);
     agentDef = prompts.agentDefinition(agent);
   } catch (err: any) {
     const errorMsg = `Prompt or agent definition error for step ${stepId}: ${err?.message || err}`;
diff --git a/plugins/software-factory/src/core/prompt-vars.ts b/plugins/software-factory/src/core/prompt-vars.ts
index 89fef99..991d946 100644
--- a/plugins/software-factory/src/core/prompt-vars.ts
+++ b/plugins/software-factory/src/core/prompt-vars.ts
@@ -35,6 +35,8 @@ export const PROMPT_VAR_DESCRIPTIONS: Record<string, string> = {
   triageCriteria: "Task triage hierarchy criteria file contents (criteria.triage)",
   dispositionsCriteria: "Review dispositions criteria file contents filtered to allowed dispositions (criteria.dispositions)",
   storyKindsCriteria: "Story and spike kinds criteria file contents (criteria.story-kinds)",
+  humanInvolvementCriteria: "Active human-involvement mode rules plus shared ADR/concern blocking table (criteria.human-involvement)",
+  concernsYaml: "Open concerns hydrated for this step, formatted as YAML",
 };
 
 /**
@@ -55,11 +57,11 @@ export const KNOWN_VARS: Record<string, string[]> = {
 
   "steps/test-first": ["assignment", "citations"],
   "test-first": ["assignment", "citations"],
-  "steps/qa": ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria"],
-  qa: ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria"],
+  "steps/qa": ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
+  qa: ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
 
-  "steps/review": ["assignment", "checks", "diff", "dispositionsCriteria"],
-  review: ["assignment", "checks", "diff", "dispositionsCriteria"],
+  "steps/review": ["assignment", "checks", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
+  review: ["assignment", "checks", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
 
   "steps/fix-round": ["assignment", "feedback", "checks", "diff"],
   "fix-round": ["assignment", "feedback", "checks", "diff"],
@@ -100,6 +102,8 @@ export const KNOWN_VARS: Record<string, string[]> = {
     "debt",
     "steering",
     "limits",
+    "humanInvolvementCriteria",
+    "concernsYaml",
   ],
   "architect-plan": [
     "task",
@@ -110,19 +114,21 @@ export const KNOWN_VARS: Record<string, string[]> = {
     "debt",
     "steering",
     "limits",
+    "humanInvolvementCriteria",
+    "concernsYaml",
   ],
 
-  "steps/architect-revise": ["plan", "planReview"],
-  "architect-revise": ["plan", "planReview"],
+  "steps/architect-revise": ["plan", "planReview", "humanInvolvementCriteria", "concernsYaml"],
+  "architect-revise": ["plan", "planReview", "humanInvolvementCriteria", "concernsYaml"],
 
-  "steps/architect-resume": ["plan", "waveReport", "steering"],
-  "architect-resume": ["plan", "waveReport", "steering"],
+  "steps/architect-resume": ["plan", "waveReport", "steering", "humanInvolvementCriteria", "concernsYaml"],
+  "architect-resume": ["plan", "waveReport", "steering", "humanInvolvementCriteria", "concernsYaml"],
 
-  "steps/architect-wave-report": ["plan", "waveReport", "debt", "steering"],
-  "architect-wave-report": ["plan", "waveReport", "debt", "steering"],
+  "steps/architect-wave-report": ["plan", "waveReport", "debt", "steering", "humanInvolvementCriteria", "concernsYaml"],
+  "architect-wave-report": ["plan", "waveReport", "debt", "steering", "humanInvolvementCriteria", "concernsYaml"],
 
-  "steps/architect-closeup": ["closeup", "plan", "intent"],
-  "architect-closeup": ["closeup", "plan", "intent"],
+  "steps/architect-closeup": ["closeup", "plan", "intent", "humanInvolvementCriteria", "concernsYaml"],
+  "architect-closeup": ["closeup", "plan", "intent", "humanInvolvementCriteria", "concernsYaml"],
 
   "steps/architect-consult-item": [
     "item",
@@ -130,6 +136,8 @@ export const KNOWN_VARS: Record<string, string[]> = {
     "priorAttempts",
     "diff",
     "feedback",
+    "humanInvolvementCriteria",
+    "concernsYaml",
   ],
   "architect-consult-item": [
     "item",
@@ -137,20 +145,22 @@ export const KNOWN_VARS: Record<string, string[]> = {
     "priorAttempts",
     "diff",
     "feedback",
+    "humanInvolvementCriteria",
+    "concernsYaml",
   ],
 
-  "steps/architect-consult-nonitem": ["task", "context", "feedback", "debt"],
-  "architect-consult-nonitem": ["task", "context", "feedback", "debt"],
+  "steps/architect-consult-nonitem": ["task", "context", "feedback", "debt", "humanInvolvementCriteria", "concernsYaml"],
+  "architect-consult-nonitem": ["task", "context", "feedback", "debt", "humanInvolvementCriteria", "concernsYaml"],
 
   // Close-up and review checkpoints
-  "steps/wave-close-up": ["task", "waveReport", "infra"],
-  "wave-close-up": ["task", "waveReport", "infra"],
+  "steps/wave-close-up": ["task", "waveReport", "infra", "humanInvolvementCriteria", "concernsYaml"],
+  "wave-close-up": ["task", "waveReport", "infra", "humanInvolvementCriteria", "concernsYaml"],
 
-  "steps/plan-close-up": ["intent", "plan", "context"],
-  "plan-close-up": ["intent", "plan", "context"],
+  "steps/plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
+  "plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
 
-  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria"],
-  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria"],
+  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
+  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria"],
 
   // System fragments
   "system/steer-classify": [],
diff --git a/plugins/software-factory/src/core/prompts.ts b/plugins/software-factory/src/core/prompts.ts
index b8b6516..8ffa554 100644
--- a/plugins/software-factory/src/core/prompts.ts
+++ b/plugins/software-factory/src/core/prompts.ts
@@ -23,6 +23,7 @@ export interface CriteriaBundle {
   triage?: string;
   dispositions?: string;
   storyKinds?: string;
+  humanInvolvement?: string;
 }
 
 /**
@@ -42,6 +43,7 @@ export function loadCriteriaBundle(
     ["triage", "triage"],
     ["dispositions", "dispositions"],
     ["story-kinds", "storyKinds"],
+    ["human-involvement", "humanInvolvement"],
   ];
   for (const [key, field] of mapping) {
     const filePath = criteria[key];
@@ -56,6 +58,31 @@ export function loadCriteriaBundle(
   return bundle;
 }
 
+/**
+ * Selects the active mode's `## <mode>` section from the human-involvement
+ * criteria file plus every shared section (notably the ADR blocking table).
+ * Inactive mode sections are dropped; empty input renders an empty string.
+ */
+const HUMAN_INVOLVEMENT_MODES = new Set(["autonomous", "principal", "detailed"]);
+
+export function formatHumanInvolvementCriteria(
+  criteria: string | undefined,
+  mode: PipelineConfig["humanInvolvement"] = "autonomous"
+): string {
+  if (!criteria || criteria.trim().length === 0) return "";
+  const active = mode ?? "autonomous";
+  const kept: string[] = [];
+  let keep = true;
+  for (const line of criteria.split("\n")) {
+    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1]?.toLowerCase();
+    if (heading !== undefined) {
+      keep = !HUMAN_INVOLVEMENT_MODES.has(heading) || heading === active;
+    }
+    if (keep) kept.push(line);
+  }
+  return kept.join("\n").trim();
+}
+
 /**
  * Formats the dispositions criteria section for review prompts (§8.7).
  * Drops `human-stop` rows unless the agent's allowed dispositions include it.
diff --git a/plugins/software-factory/test/human-involvement-config.test.ts b/plugins/software-factory/test/human-involvement-config.test.ts
new file mode 100644
index 0000000..f85b2d4
--- /dev/null
+++ b/plugins/software-factory/test/human-involvement-config.test.ts
@@ -0,0 +1,439 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import os from "node:os";
+import path from "node:path";
+import yaml from "yaml";
+import { createAjv } from "../src/core/config/ajv.js";
+import { loadPipelineConfig } from "../src/core/config/loader.js";
+import {
+  loadCriteriaBundle,
+  loadPromptLibrary,
+  preflightPrompts,
+} from "../src/core/prompts.js";
+import { KNOWN_VARS, PROMPT_VAR_DESCRIPTIONS } from "../src/core/prompt-vars.js";
+import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
+import { FakeHarness } from "../src/harness/fake/fake-harness.js";
+import { runAgentStep } from "../src/core/flows/step-runner.js";
+import { Repo } from "../src/core/git/repo.js";
+import type { PipelineConfig, ProjectConfig } from "../src/core/artifacts.js";
+
+/**
+ * Human-involvement modes + concern thresholds (docs/factory.v2.md §18,
+ * docs/adr/adr-humaninvolvement-config.md).
+ *
+ * Contract under test:
+ * - `humanInvolvement` is a top-level pipeline key (autonomous|principal|
+ *   detailed), defaulting to `autonomous`; `concerns` carries the raise
+ *   allowlist plus digest/blocking severity thresholds.
+ * - The default config ships commented presets for all three modes with a
+ *   blocking table (which ADRs/concerns reach the human per mode).
+ * - A terse `agents/criteria/human-involvement.md` fragment is registered under
+ *   `criteria.human-involvement`; the active mode selects its `## <mode>`
+ *   section plus the shared blocking table.
+ * - `concernsYaml` and `humanInvolvementCriteria` are registered in KNOWN_VARS
+ *   for the review/architect/close-up fragment matrix and supplied by the
+ *   engine when rendering those steps.
+ */
+
+const pluginRoot = path.resolve(import.meta.dir, "..");
+const defaultPipelinePath = path.join(pluginRoot, "config/pipeline.default.yaml");
+const agentsDir = path.join(pluginRoot, "agents");
+
+const MODES = ["autonomous", "principal", "detailed"] as const;
+
+/** Default concern policy: every agent whose output schema can raise concerns. */
+const DEFAULT_RAISE_ALLOWLIST = [
+  "developer",
+  "fact-finder",
+  "architect",
+  "qa",
+  "reviewer",
+  "plan-reviewer",
+  "wave-close-up",
+  "plan-close-up",
+];
+
+/**
+ * Fragment matrix: which engine steps receive which concern/involvement var.
+ * Reviewers triage raised concerns; architects mark ADRs blocking and consume
+ * funneled concerns; close-ups are funnel levels themselves.
+ */
+const FRAGMENT_MATRIX: Record<string, string[]> = {
+  review: ["humanInvolvementCriteria", "concernsYaml"],
+  qa: ["humanInvolvementCriteria", "concernsYaml"],
+  "plan-review": ["humanInvolvementCriteria"],
+  "wave-close-up": ["humanInvolvementCriteria", "concernsYaml"],
+  "plan-close-up": ["humanInvolvementCriteria", "concernsYaml"],
+  "architect-plan": ["humanInvolvementCriteria", "concernsYaml"],
+  "architect-revise": ["humanInvolvementCriteria", "concernsYaml"],
+  "architect-resume": ["humanInvolvementCriteria", "concernsYaml"],
+  "architect-wave-report": ["humanInvolvementCriteria", "concernsYaml"],
+  "architect-closeup": ["humanInvolvementCriteria", "concernsYaml"],
+  "architect-consult-item": ["humanInvolvementCriteria", "concernsYaml"],
+  "architect-consult-nonitem": ["humanInvolvementCriteria", "concernsYaml"],
+};
+
+const CRITERIA_FIXTURE = `# Human involvement criteria
+
+## Blocking table (ADRs and concerns)
+
+| Mode | Blocking (needs human decision) | Remarkable (digest only) |
+| --- | --- | --- |
+| autonomous | high-severity blockers still blocked after unblocked work | everything else |
+| principal | stack/layer, external interfaces, config shapes | internal choices |
+| detailed | external-interface changes and major internal interfaces | minor internals |
+
+## autonomous
+
+AUTONOMOUS-ADR-RULE: block only explicit high-severity blockers that remain after unblocked work is done.
+
+## principal
+
+PRINCIPAL-ADR-RULE: block stack/layer, external-interface, config-shape, and major-class-role decisions.
+
+## detailed
+
+DETAILED-ADR-RULE: additionally block external-interface changes and major internal-interface changes.
+`;
+
+function writePipelineLayers(
+  dir: string,
+  project: Record<string, unknown>,
+  task: Record<string, unknown>
+): { repoRoot: string; taskYamlPath: string } {
+  const factoryDir = path.join(dir, ".factory");
+  fs.mkdirSync(factoryDir, { recursive: true });
+  fs.writeFileSync(
+    path.join(factoryDir, "pipeline.yaml"),
+    yaml.stringify(project),
+    "utf8"
+  );
+  const taskYamlPath = path.join(factoryDir, "task-pipeline.yaml");
+  fs.writeFileSync(taskYamlPath, yaml.stringify(task), "utf8");
+  return { repoRoot: dir, taskYamlPath };
+}
+
+describe("human-involvement pipeline configuration", () => {
+  it("defaults to autonomous mode with concern raise/digest/blocking policy", () => {
+    const { config } = loadPipelineConfig({ skipStructuralValidation: true });
+
+    expect(config.humanInvolvement).toBe("autonomous");
+    expect(config.concerns).toBeDefined();
+    expect([...(config.concerns?.raiseAllowlist ?? [])].sort()).toEqual(
+      [...DEFAULT_RAISE_ALLOWLIST].sort()
+    );
+    expect(config.concerns?.minDigestSeverity).toBe("medium");
+    expect(config.concerns?.minBlockingSeverity).toBe("high");
+  });
+
+  it("layers humanInvolvement and concern thresholds through project and task configs", () => {
+    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "factory-mode-layers-"));
+    try {
+      const { repoRoot, taskYamlPath } = writePipelineLayers(
+        tmp,
+        {
+          humanInvolvement: "principal",
+          concerns: {
+            raiseAllowlist: ["developer", "reviewer"],
+            minDigestSeverity: "low",
+          },
+        },
+        {
+          humanInvolvement: "detailed",
+          concerns: { minBlockingSeverity: "medium" },
+        }
+      );
+
+      const { config } = loadPipelineConfig({
+        repoRoot,
+        taskYamlPath,
+        skipStructuralValidation: true,
+      });
+
+      // Task layer wins over project layer; project layer wins over defaults.
+      expect(config.humanInvolvement).toBe("detailed");
+      expect(config.concerns?.raiseAllowlist).toEqual(["developer", "reviewer"]);
+      expect(config.concerns?.minDigestSeverity).toBe("low");
+      expect(config.concerns?.minBlockingSeverity).toBe("medium");
+    } finally {
+      fs.rmSync(tmp, { recursive: true, force: true });
+    }
+  });
+
+  it("applies overrides last and supports null deletion of concern keys", () => {
+    const { config } = loadPipelineConfig({
+      skipStructuralValidation: true,
+      overrides: {
+        humanInvolvement: "principal",
+        concerns: {
+          raiseAllowlist: ["architect"],
+          minDigestSeverity: null,
+        },
+      },
+    });
+
+    expect(config.humanInvolvement).toBe("principal");
+    expect(config.concerns?.raiseAllowlist).toEqual(["architect"]);
+    expect(config.concerns && "minDigestSeverity" in config.concerns).toBe(false);
+    expect(config.concerns?.minBlockingSeverity).toBe("high");
+  });
+
+  it("schema accepts all modes and thresholds, rejects unknown values, and stays closed at root", () => {
+    const schema = JSON.parse(
+      fs.readFileSync(path.join(pluginRoot, "config/schemas/pipeline.schema.json"), "utf8")
+    );
+    const validate = createAjv().compile(schema);
+    const raw = yaml.parse(fs.readFileSync(defaultPipelinePath, "utf8"));
+
+    for (const mode of MODES) {
+      expect({ mode, ok: validate({ ...raw, humanInvolvement: mode }) }).toEqual({
+        mode,
+        ok: true,
+      });
+    }
+
+    expect(
+      validate({
+        ...raw,
+        concerns: {
+          raiseAllowlist: ["developer", "reviewer"],
+          minDigestSeverity: "medium",
+          minBlockingSeverity: "high",
+        },
+      })
+    ).toBe(true);
+
+    expect(validate({ ...raw, humanInvolvement: "sometimes" })).toBe(false);
+    expect(
+      validate({ ...raw, concerns: { minBlockingSeverity: "critical" } })
+    ).toBe(false);
+    expect(validate({ ...raw, concerns: { raiseAllowlist: "developer" } })).toBe(false);
+    expect(validate({ ...raw, unknownRootKey: true })).toBe(false);
+  });
+
+  it("ships commented autonomous/principal/detailed presets with a blocking table", () => {
+    const text = fs.readFileSync(defaultPipelinePath, "utf8");
+    const raw = yaml.parse(text);
+    expect(raw.humanInvolvement).toBe("autonomous");
+
+    // Strip YAML comment markers so preset bodies can be inspected as text.
+    const commented = text
+      .split("\n")
+      .filter((line) => /^\s*#/.test(line))
+      .map((line) => line.replace(/^\s*#\s?/, ""))
+      .join("\n");
+
+    for (const mode of MODES) {
+      expect(commented).toMatch(new RegExp(`humanInvolvement:\\s*${mode}\\b`));
+    }
+    expect(commented).toMatch(/\|\s*Mode\s*\|/i);
+    expect(commented).toMatch(/\|\s*Blocking\b/i);
+    for (const mode of MODES) {
+      expect(commented).toMatch(new RegExp(`\\|\\s*${mode}\\s*\\|`, "i"));
+    }
+    expect(commented).toMatch(/\bADR\b/);
+  });
+
+  it("registers a terse human-involvement criteria fragment and loads it", () => {
+    const { config } = loadPipelineConfig({ skipStructuralValidation: true });
+    const fragmentPath = config.criteria?.["human-involvement"];
+
+    expect(typeof fragmentPath).toBe("string");
+    expect(path.isAbsolute(fragmentPath!)).toBe(true);
+    expect(fs.existsSync(fragmentPath!)).toBe(true);
+
+    const text = fs.readFileSync(fragmentPath!, "utf8");
+    for (const mode of MODES) {
+      expect(text).toMatch(new RegExp(`^##\\s*${mode}\\b`, "m"));
+      expect(text).toMatch(new RegExp(`\\|\\s*${mode}\\s*\\|`, "i"));
+    }
+    expect(text).toMatch(/\|\s*Mode\s*\|/i);
+    expect(text).toMatch(/\|\s*Blocking\b/i);
+    expect(text).toMatch(/\bADR\b/);
+    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4096);
+
+    const bundle = loadCriteriaBundle(config.criteria) as Record<string, string | undefined>;
+    expect(typeof bundle.humanInvolvement).toBe("string");
+    expect(bundle.humanInvolvement).toContain("Blocking table");
+    expect(bundle.humanInvolvement).toContain("autonomous");
+  });
+
+  it("registers concernsYaml and humanInvolvementCriteria for the fragment matrix", () => {
+    for (const [fragment, vars] of Object.entries(FRAGMENT_MATRIX)) {
+      for (const key of [fragment, `steps/${fragment}`]) {
+        expect({ key, vars: KNOWN_VARS[key] }).toEqual({
+          key,
+          vars: expect.arrayContaining(vars),
+        });
+      }
+    }
+
+    // Non-consumers must not silently gain the vars: the matrix is selective.
+    for (const key of ["develop", "steps/develop", "triage", "steps/triage", "infra"]) {
+      expect(KNOWN_VARS[key]).not.toContain("humanInvolvementCriteria");
+      expect(KNOWN_VARS[key]).not.toContain("concernsYaml");
+    }
+
+    expect(PROMPT_VAR_DESCRIPTIONS.humanInvolvementCriteria).toBeTruthy();
+    expect(PROMPT_VAR_DESCRIPTIONS.concernsYaml).toBeTruthy();
+  });
+
+  it("preflight accepts the new vars on matrix fragments and rejects them elsewhere", () => {
+    const { config: pipeline } = loadPipelineConfig();
+    const lib = loadPromptLibrary({ builtinDir: agentsDir });
+
+    // The real pipeline stays green after the fragment/matrix wiring.
+    expect(preflightPrompts(lib, pipeline)).toEqual([]);
+
+    const matrixLib = loadPromptLibrary({
+      builtinDir: agentsDir,
+      overrides: {
+        review:
+          "Review {{assignment}} {{checks}} {{diff}} {{dispositionsCriteria}}\n" +
+          "{{humanInvolvementCriteria}}\n{{concernsYaml}}",
+      },
+    });
+    expect(preflightPrompts(matrixLib, pipeline)).toEqual([]);
+
+    const nonMatrixLib = loadPromptLibrary({
+      builtinDir: agentsDir,
+      overrides: {
+        develop: "Develop {{assignment}} {{target}} {{citations}} {{concernsYaml}}",
+      },
+    });
+    const errors = preflightPrompts(nonMatrixLib, pipeline);
+    expect(errors.some((e) => e.includes('Unknown placeholder "concernsYaml"'))).toBe(true);
+  });
+});
+
+describe("human-involvement mode switching at prompt time", () => {
+  let tmpRepo: TmpRepo;
+  let repoObj: Repo;
+  let project: ProjectConfig;
+  let worktreeRoot: string;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    worktreeRoot = path.join(tmpRepo.dir + "-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    project = { orchestrationFolder: ".factory", worktreeRoot };
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  async function renderArchitectPlan(opts: {
+    mode: (typeof MODES)[number];
+    criteriaPath?: string;
+    promptVars?: Record<string, string>;
+  }): Promise<{ ok: boolean; prompt?: string; error?: string }> {
+    const task = `mode-${opts.mode}`;
+    const taskDir = path.join(tmpRepo.dir, ".factory", task);
+    const recordsDir = path.join(taskDir, "runs");
+    fs.mkdirSync(recordsDir, { recursive: true });
+
+    const prompts = loadPromptLibrary({
+      builtinDir: agentsDir,
+      overrides: {
+        "steps/architect-plan":
+          "ARCHITECT CRITERIA:\n{{humanInvolvementCriteria}}\nCONCERNS:\n{{concernsYaml}}\n",
+      },
+    });
+    const pipeline: PipelineConfig = {
+      models: {
+        roles: {
+          workhorse: { model: "model-workhorse" },
+          architect: { model: "model-architect" },
+          simpler: { model: "model-simpler" },
+        },
+      },
+      agents: { architect: { role: "architect" } },
+      flows: { simple: { steps: [] }, story: {}, spike: {} },
+      limits: {},
+      humanInvolvement: opts.mode,
+      ...(opts.criteriaPath
+        ? { criteria: { "human-involvement": opts.criteriaPath } }
+        : {}),
+    };
+
+    const harness = new FakeHarness();
+    harness.scriptOutcome(`${task}/runs/architect-plan#a1`, {
+      ok: true,
+      data: { iteration: 1, milestones: [], itemOutlines: [] },
+    });
+
+    const res = await runAgentStep({
+      task,
+      stepId: "architect-plan",
+      stepFragment: "steps/architect-plan",
+      agent: "architect",
+      cwd: tmpRepo.dir,
+      taskWt: tmpRepo.dir,
+      taskDir,
+      recordsDir,
+      repo: repoObj,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      promptVars: opts.promptVars ?? {},
+    });
+
+    const runCall = harness.calls.find((call) => call.type === "run");
+    return {
+      ok: res.ok,
+      prompt: runCall && runCall.type === "run" ? runCall.run.prompt : undefined,
+      error: res.meta?.error,
+    };
+  }
+
+  it("selects the active mode section plus the shared ADR blocking table", async () => {
+    const criteriaPath = path.join(tmpRepo.dir, "human-involvement.md");
+    fs.writeFileSync(criteriaPath, CRITERIA_FIXTURE, "utf8");
+
+    const autonomous = await renderArchitectPlan({ mode: "autonomous", criteriaPath });
+    const detailed = await renderArchitectPlan({ mode: "detailed", criteriaPath });
+
+    expect({ ok: autonomous.ok, error: autonomous.error }).toEqual({
+      ok: true,
+      error: undefined,
+    });
+    expect({ ok: detailed.ok, error: detailed.error }).toEqual({
+      ok: true,
+      error: undefined,
+    });
+
+    expect(autonomous.prompt).toContain("Blocking table (ADRs and concerns)");
+    expect(autonomous.prompt).toContain("AUTONOMOUS-ADR-RULE");
+    expect(autonomous.prompt).not.toContain("DETAILED-ADR-RULE");
+
+    expect(detailed.prompt).toContain("Blocking table (ADRs and concerns)");
+    expect(detailed.prompt).toContain("DETAILED-ADR-RULE");
+    expect(detailed.prompt).not.toContain("AUTONOMOUS-ADR-RULE");
+  });
+
+  it("renders empty involvement criteria when no fragment is configured", async () => {
+    const run = await renderArchitectPlan({ mode: "autonomous" });
+
+    expect({ ok: run.ok, error: run.error }).toEqual({ ok: true, error: undefined });
+    expect(run.prompt).toBeDefined();
+    expect(run.prompt).not.toContain("ADR-RULE");
+  });
+
+  it("lets callers provide hydrated concernsYaml without dropping the criteria", async () => {
+    const criteriaPath = path.join(tmpRepo.dir, "human-involvement.md");
+    fs.writeFileSync(criteriaPath, CRITERIA_FIXTURE, "utf8");
+
+    const run = await renderArchitectPlan({
+      mode: "principal",
+      criteriaPath,
+      promptVars: { concernsYaml: "CALLER-CONCERNS: c-1 blocker" },
+    });
+
+    expect({ ok: run.ok, error: run.error }).toEqual({ ok: true, error: undefined });
+    expect(run.prompt).toContain("CALLER-CONCERNS: c-1 blocker");
+    expect(run.prompt).toContain("PRINCIPAL-ADR-RULE");
+  });
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

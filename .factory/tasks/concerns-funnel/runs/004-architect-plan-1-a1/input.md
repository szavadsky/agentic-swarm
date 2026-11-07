# Step: Architect Plan

## Goal
Design the iteration execution plan (`plan-N.yaml`) decomposing task intent into sequenced milestones, spike outlines, item outlines, and architectural decisions.

## Rules
- Milestone count within the configured limit (see `{
  "maxParallelItems": 4,
  "maxParallelTurns": 6,
  "stubMaxProdLines": 40,
  "maxStepAttempts": 2,
  "maxInterruptions": 3,
  "maxFixRounds": 3,
  "maxConsultsPerItem": 2,
  "maxSplitDepth": 1,
  "maxPlanReviewRounds": 2,
  "maxAmendmentsPerIteration": 3,
  "maxIterations": 6,
  "maxInfraRetries": 3,
  "gateRetries": 1,
  "gateTimeoutSec": 900,
  "storyMaxProdLines": 300,
  "simpleMaxProdLines": 20,
  "maxMilestones": 8,
  "maxItemsPerPlan": 50,
  "checkOutputBytes": 4000,
  "hydrationBytes": 40000
}`).
- Scenarios & interfaces: each milestone requires concrete Gherkin scenarios specifying observable behavior and directional interfaces defining key contracts.
- Progressive planning: plan only what is clear. If later milestones depend on earlier execution outcomes or spikes, mark them with `replanAfter: true`.
- Uncertainty to spikes: isolate technical risks or unverified external dependencies into spikes (`fact-finder`, `poc`, `test-assumptions`). Never design on unproven assumptions.
- Assumptions: document assumptions with rationale (`why`) and optional disposition if human confirmation is desired.
- Epics (root task only): define child epics for major subsystems (depth 1 only); each epic outline requires complete `intent` text.
- Tech debt: categorize technical debt as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt MUST include explicit resolutions.
- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`) for non-trivial design choices.
- Escalation: flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
- Infrastructure & quality gates: review declared gates, baseline status, and notes in `setup:
  - cd plugins/software-factory && bun install --frozen-lockfile
gates:
  - id: typecheck
    command: cd plugins/software-factory && bun run typecheck
  - id: test
    command: cd plugins/software-factory && bun test
testRunner:
  command: cd plugins/software-factory && bun test
  selectorArgs: []
  junitArg: --reporter=junit --reporter-outfile={path}
notes:
  - Only plugins/software-factory is a Bun package; the repo root has no
    package.json, so setup, gates and targeted test commands must cd into
    plugins/software-factory first.
  - "No lint/format gate exists in the repository: there is no
    eslint/biome/prettier config and no lint script; the project defines only
    typecheck (tsc --noEmit) and test (bun test)."
  - Bun test selectors are positional file/pattern filters, so selectorArgs is
    empty; -t filters test names only and would break the project's
    'test-file-or-pattern' target selectors. JUnit output was verified for both
    filtered and full runs.
  - "TMPDIR caveat: this host sets TMPDIR under
    <repo>.factory-wt/.factory-runtime/tmp. The full suite then has 2
    pre-existing failures in test/engine/head-guard.test.ts because step-runner
    resolves the task worktree by splitting taskDir on '/.factory', which also
    matches '/.factory-runtime'. With TMPDIR=/tmp the suite is green (271 pass,
    2 skip, 0 fail vs 269 pass, 2 skip, 2 fail inherited). Operator action:
    normalize TMPDIR for gate runs or fix the '/.factory' split; otherwise the
    test gate baseline records red."
  - "No orchestration-folder exclusion is needed for these gates: tsconfig
    includes only src/test/bin, bun test discovers only test files, and there is
    no linter; the committed .factory task folder is not scanned."


# Infra Operator Action Notes
- Only plugins/software-factory is a Bun package; the repo root has no package.json, so setup, gates and targeted test commands must cd into plugins/software-factory first.
- No lint/format gate exists in the repository: there is no eslint/biome/prettier config and no lint script; the project defines only typecheck (tsc --noEmit) and test (bun test).
- Bun test selectors are positional file/pattern filters, so selectorArgs is empty; -t filters test names only and would break the project's 'test-file-or-pattern' target selectors. JUnit output was verified for both filtered and full runs.
- TMPDIR caveat: this host sets TMPDIR under <repo>.factory-wt/.factory-runtime/tmp. The full suite then has 2 pre-existing failures in test/engine/head-guard.test.ts because step-runner resolves the task worktree by splitting taskDir on '/.factory', which also matches '/.factory-runtime'. With TMPDIR=/tmp the suite is green (271 pass, 2 skip, 0 fail vs 269 pass, 2 skip, 2 fail inherited). Operator action: normalize TMPDIR for gate runs or fix the '/.factory' split; otherwise the test gate baseline records red.
- No orchestration-folder exclusion is needed for these gates: tsconfig includes only src/test/bin, bun test discovers only test files, and there is no linter; the committed .factory task folder is not scanned.

# Gates Baseline
timestamp: 2026-11-07T19:10:39.077Z
gates:
  - id: typecheck
    command: cd plugins/software-factory && bun run typecheck
    status: pass
    durationMs: 3576
    details: $ tsc --noEmit
  - id: test
    command: cd plugins/software-factory && bun test
    status: fail
    durationMs: 127126
    details: |-
      bun test v1.4.3 (c6da4a4d3)
      ================================================================
      Task: status-test-task [ACTIVE]
      Kind: unclassified | Iteration: 1 | Wave: 1
      Worktree: (none - main checkout)
      Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-KBUTnF/.factory/pipeline.yaml
      Budget spent: $0.0000
      ----------------------------------------------------------------
      Waves & Items:
        Wave 1:
      ================================================================


      test/cli/cli.test.ts:
      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761
      [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761
      [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761

      test/engine/head-guard.test.ts:
      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
      127 |   const stderr = res.stderr;
      128 |   const code = res.code ?? 0;
      129 | 
      130 |   if (code !== 0 && !opts?.allowFail) {
      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                      ^
      GitError: git add -A failed with exit code 128:
      fatal: not a git repository (or any of the parent directories): .git

       command: "add -A",
          code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",

            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/exec.ts:131:11)
            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/commit.ts:23:13)
            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/mutex.ts:39:20)
      (fail) Engine: HEAD guard resilience (§7) > detects when an agent commits and resets --soft to before.sha, keeping changes staged [54.62ms]
      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
      127 |   const stderr = res.stderr;
      128 |   const code = res.code ?? 0;
      129 | 
      130 |   if (code !== 0 && !opts?.allowFail) {
      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                      ^
      GitError: git add -A failed with exit code 128:
      fatal: not a git repository (or any of the parent directories): .git

       command: "add -A",
          code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",

            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/exec.ts:131:11)
            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/commit.ts:23:13)
            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/mutex.ts:39:20)
      (fail) Engine: HEAD guard resilience (§7) > detects when an agent switches branch and restores original branch, keeping changes [44.71ms]

       269 pass
       2 skip
       2 fail
       1072 expect() calls
      Ran 273 tests across 50 files. [64.65s]`. If any gate mutates the worktree (`mutatesWorktree: true`) or has operator action notes (e.g. linter scanning orchestration folder), account for it in your plan (e.g. adding check flags, excluding folders, or addressing via tech debt/spikes).
- Output: yield the plan matching `plan.schema.json`.

## Task & Iteration
Task: concerns-funnel
Iteration: 1

## Intent
# concerns-funnel

Implement spec item 18 of `docs/factory.v2.md` in `plugins/software-factory`
(read it in full; it is the acceptance definition):
- structured `concerns[]` and remarkable decisions/tradeoffs in agent outputs;
- engine aggregation under the task folder (`concerns/`, stable fingerprint ids, dedup, status, source record);
- triage by the step's reviewer (workhorse class; architect output → plan-reviewer) with the review disposition
  vocabulary plus `dismiss` (logged with reason, kept);
- routing: blockers block dependent items + architect consult; `architect` → next architect turn;
  `human-*` → steer mailbox per policy; tech debt → plan tech-debt list;
- funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text
  than the code summarized; saga architect reviews epic-level items and steers or propagates;
- blocking vs non-blocking ADRs; remarkable items reported in a mailbox digest, never waiting;
- human-involvement mode presets `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect
  prompt fragments), shipped as commented default config examples; selectable per task;
- surfaced in wave/plan close-ups, `factory status`, state.yaml counts.
Update `plugins/software-factory/docs/ARCHITECTURE.md` (incl. the §1 row for item 18), README and config commentary.
Keep prompts terse (debloated). Behavior tests only. Expected scope: a couple of iterations at most.


## Context
citations:
  - file: docs/factory.v2.md
    lines: 89-103
    anchors:
      - 18. concerns + remarkable decisions funnel
      - concerns[]
      - human-involvement modes
      - "funnel: worker agents"
    summary: "Acceptance definition: structured concerns[] with
      kind/severity/affects, engine aggregation with fingerprint
      ids/dedup/status/source record, reviewer triage plus dismiss, routing
      (blocker→dependent item + architect consult, architect→next turn,
      human-*→mailbox, debt→plan), close-up/status counts, configurable
      dispositions, remarkable decisions/ADRs, funnel and
      autonomous/principal/detailed presets."
  - file: plugins/software-factory/docs/ARCHITECTURE.md
    lines: "39"
    anchors:
      - 18 concerns + remarkable decisions funnel
      - Deliberately not hand-built
      - review dispositions (§8.7)
    summary: "The §1 row that must be updated: item 18 currently marked deliberately
      unimplemented, with only review dispositions (§8.7) and steering mailbox
      (§8.8) in place."
  - file: plugins/software-factory/src/core/artifacts.ts
    lines: 313-325
    anchors:
      - DeveloperOutputArtifact
      - "concerns?: string[]"
    summary: Current developer output carries only free-form string concerns; needs
      the structured concern object (kind, summary, detail, location, severity,
      affects) plus remarkable decisions/ADR fields.
  - file: plugins/software-factory/src/core/records/review-schema.ts
    lines: 5-52
    anchors:
      - generateReviewSchema
      - allowedDispositions
      - "enum: dispositions"
    summary: Review JSON schema is generated from the agent's allowed disposition
      enum; triage-by-reviewer needs the vocabulary extended with `dismiss` and
      the allowed set filtered per reviewer/agent.
  - file: plugins/software-factory/src/core/flows/item-machine.ts
    lines: 628-647
    anchors:
      - reviewAllowed
      - formatDispositionsSection
      - dispositionsCriteria
    summary: Per-item review prompt wiring and allowed-disposition resolution; the
      natural insertion point for the step reviewer's concern triage and its
      disposition vocabulary.
  - file: plugins/software-factory/src/core/flows/iteration.ts
    lines: 439-485
    anchors:
      - plan-reviewer
      - ReviewArtifact
      - fixSuggestions
    summary: Plan review flow where architect output is reviewed by plan-reviewer;
      item 18 requires architect concerns/decisions to be triaged here rather
      than by the workhorse reviewer.
  - file: plugins/software-factory/src/core/steer.ts
    lines: 59-88
    anchors:
      - writeQuestion
      - sha256
      - q-${cleanRef}-${hash}
    summary: Existing stable-id mailbox write pattern (fingerprint-derived id,
      ref/disposition, blocks, status) to reuse for concern routing to human-*
      and for the mailbox digest.
  - file: plugins/software-factory/src/core/derive/task.ts
    lines: 167-205
    anchors:
      - Tech debt collection
      - accept-with-debt
      - disposition === "optional"
    summary: Debt is currently derived from plan techDebt, accept-with-debt
      decisions and optional review suggestions; routed tech-debt concerns and
      concern counts must be added to this derived state.
  - file: plugins/software-factory/src/cli/status.ts
    lines: 83-105
    anchors:
      - openSteerQuestions
      - Recorded Technical Debt
    summary: factory status currently surfaces open operator questions and debt; it
      must additionally show open/routed/resolved concern counts and
      remarkable-item digests.
  - file: plugins/software-factory/src/core/fingerprint.ts
    lines: 20-50
    anchors:
      - fingerprintText
      - fingerprintObject
      - canonicalJsonStringify
    summary: Existing normalization/fingerprint helpers usable for stable concern
      ids and dedup across steps/attempts/restarts.


## Infrastructure
setup:
  - cd plugins/software-factory && bun install --frozen-lockfile
gates:
  - id: typecheck
    command: cd plugins/software-factory && bun run typecheck
  - id: test
    command: cd plugins/software-factory && bun test
testRunner:
  command: cd plugins/software-factory && bun test
  selectorArgs: []
  junitArg: --reporter=junit --reporter-outfile={path}
notes:
  - Only plugins/software-factory is a Bun package; the repo root has no
    package.json, so setup, gates and targeted test commands must cd into
    plugins/software-factory first.
  - "No lint/format gate exists in the repository: there is no
    eslint/biome/prettier config and no lint script; the project defines only
    typecheck (tsc --noEmit) and test (bun test)."
  - Bun test selectors are positional file/pattern filters, so selectorArgs is
    empty; -t filters test names only and would break the project's
    'test-file-or-pattern' target selectors. JUnit output was verified for both
    filtered and full runs.
  - "TMPDIR caveat: this host sets TMPDIR under
    <repo>.factory-wt/.factory-runtime/tmp. The full suite then has 2
    pre-existing failures in test/engine/head-guard.test.ts because step-runner
    resolves the task worktree by splitting taskDir on '/.factory', which also
    matches '/.factory-runtime'. With TMPDIR=/tmp the suite is green (271 pass,
    2 skip, 0 fail vs 269 pass, 2 skip, 2 fail inherited). Operator action:
    normalize TMPDIR for gate runs or fix the '/.factory' split; otherwise the
    test gate baseline records red."
  - "No orchestration-folder exclusion is needed for these gates: tsconfig
    includes only src/test/bin, bun test discovers only test files, and there is
    no linter; the committed .factory task folder is not scanned."


# Infra Operator Action Notes
- Only plugins/software-factory is a Bun package; the repo root has no package.json, so setup, gates and targeted test commands must cd into plugins/software-factory first.
- No lint/format gate exists in the repository: there is no eslint/biome/prettier config and no lint script; the project defines only typecheck (tsc --noEmit) and test (bun test).
- Bun test selectors are positional file/pattern filters, so selectorArgs is empty; -t filters test names only and would break the project's 'test-file-or-pattern' target selectors. JUnit output was verified for both filtered and full runs.
- TMPDIR caveat: this host sets TMPDIR under <repo>.factory-wt/.factory-runtime/tmp. The full suite then has 2 pre-existing failures in test/engine/head-guard.test.ts because step-runner resolves the task worktree by splitting taskDir on '/.factory', which also matches '/.factory-runtime'. With TMPDIR=/tmp the suite is green (271 pass, 2 skip, 0 fail vs 269 pass, 2 skip, 2 fail inherited). Operator action: normalize TMPDIR for gate runs or fix the '/.factory' split; otherwise the test gate baseline records red.
- No orchestration-folder exclusion is needed for these gates: tsconfig includes only src/test/bin, bun test discovers only test files, and there is no linter; the committed .factory task folder is not scanned.

# Gates Baseline
timestamp: 2026-11-07T19:10:39.077Z
gates:
  - id: typecheck
    command: cd plugins/software-factory && bun run typecheck
    status: pass
    durationMs: 3576
    details: $ tsc --noEmit
  - id: test
    command: cd plugins/software-factory && bun test
    status: fail
    durationMs: 127126
    details: |-
      bun test v1.4.3 (c6da4a4d3)
      ================================================================
      Task: status-test-task [ACTIVE]
      Kind: unclassified | Iteration: 1 | Wave: 1
      Worktree: (none - main checkout)
      Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-KBUTnF/.factory/pipeline.yaml
      Budget spent: $0.0000
      ----------------------------------------------------------------
      Waves & Items:
        Wave 1:
      ================================================================


      test/cli/cli.test.ts:
      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761
      [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761
      [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761

      test/engine/head-guard.test.ts:
      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
      127 |   const stderr = res.stderr;
      128 |   const code = res.code ?? 0;
      129 | 
      130 |   if (code !== 0 && !opts?.allowFail) {
      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                      ^
      GitError: git add -A failed with exit code 128:
      fatal: not a git repository (or any of the parent directories): .git

       command: "add -A",
          code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",

            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/exec.ts:131:11)
            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/commit.ts:23:13)
            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/mutex.ts:39:20)
      (fail) Engine: HEAD guard resilience (§7) > detects when an agent commits and resets --soft to before.sha, keeping changes staged [54.62ms]
      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
      127 |   const stderr = res.stderr;
      128 |   const code = res.code ?? 0;
      129 | 
      130 |   if (code !== 0 && !opts?.allowFail) {
      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                      ^
      GitError: git add -A failed with exit code 128:
      fatal: not a git repository (or any of the parent directories): .git

       command: "add -A",
          code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",

            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/exec.ts:131:11)
            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/commit.ts:23:13)
            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/mutex.ts:39:20)
      (fail) Engine: HEAD guard resilience (§7) > detects when an agent switches branch and restores original branch, keeping changes [44.71ms]

       269 pass
       2 skip
       2 fail
       1072 expect() calls
      Ran 273 tests across 50 files. [64.65s]

## Tech Debt


## Steering Directives


## Limits
{
  "maxParallelItems": 4,
  "maxParallelTurns": 6,
  "stubMaxProdLines": 40,
  "maxStepAttempts": 2,
  "maxInterruptions": 3,
  "maxFixRounds": 3,
  "maxConsultsPerItem": 2,
  "maxSplitDepth": 1,
  "maxPlanReviewRounds": 2,
  "maxAmendmentsPerIteration": 3,
  "maxIterations": 6,
  "maxInfraRetries": 3,
  "gateRetries": 1,
  "gateTimeoutSec": 900,
  "storyMaxProdLines": 300,
  "simpleMaxProdLines": 20,
  "maxMilestones": 8,
  "maxItemsPerPlan": 50,
  "checkOutputBytes": 4000,
  "hydrationBytes": 40000
}

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1): Iteration number for this plan (minimum 1)
- milestones (array of object, required): Key delivery milestones for this iteration
  - id (string, required)
  - title (string, required)
  - scenarios (array of string, optional)
  - directionalInterfaces (array of string, optional)
  - replanAfter (boolean, optional)
- uncertainties (array of object, optional): Identified technical or domain uncertainties to resolve via spikes
  - id (string, required)
  - description (string, required)
  - spikeOutlines (array of string, optional)
- itemOutlines (array of object, required): Planned items/tasks to implement in this iteration
  - slug (string, required)
  - kind (string, required)
  - title (string, required)
  - description (string, optional)
  - milestoneId (string, optional)
  - deps (array of string, optional)
  - escalate (boolean, optional)
  - replanAfter (boolean, optional)
- assumptions (array of object, optional): Key assumptions made during planning
  - assumption (string, required)
  - why (string, required)
  - disposition (string, optional)
- epics (array of object, optional): Child epics to spawn (root tasks only)
  - slug (string, required)
  - intent (string, required)
- techDebt (array of object, optional): Technical debt identified, categorized as adjacent, impacting, or blocking
  - id (string, required)
  - description (string, required)
  - category (string, required, enum: ["adjacent","impacting","blocking"])
  - resolution (string, optional)
- adrs (array of object, optional): Architecture Decision Records documented for major design choices
  - id (string, required)
  - title (string, required)
  - context (string, required)
  - decision (string, required)
  - consequences (string, optional)

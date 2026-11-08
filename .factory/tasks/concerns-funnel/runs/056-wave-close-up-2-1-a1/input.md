# Step: Wave Close-Up

## Goal
Verify repository integrity and cleanliness on the merged task branch after all wave items finish. Audit gates against baseline and compile the wave outcome.

## Rules
- Tree hygiene: check for stray untracked junk, leftover temporary artifacts, or lingering merge conflict markers.
- Gate baseline: the engine ran all infra gates on the merged branch; judge regressions ONLY from the `Gate Diff (baseline vs now)` table below. Gates that were green at baseline must remain green; report any regressions in `failedItems`/`blockedItems` and the summary.
- No raw-text comparison: never infer fixes or regressions by comparing raw gate output text (timing, ordering, and truncation differ run to run). A gate counts as fixed ONLY when its table row shows now=pass after baseline=fail.
- Outcome compilation: yield the wave outcome matching `wave-closeup.schema.json`.
- Status semantics: `complete` (all items merged, tree clean, gates green), `has_failures` (some items failed but iteration can continue), `blocked` (wave cannot proceed without operator input).
- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes.

## Task & Wave
Task: concerns-funnel
Wave Report: Wave 1 completed. Merged items: hydration-fingerprint-caps, contracts-drift-fix, prompt-fragments

## Infrastructure Gates
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
    failingTests:
      - "Engine: HEAD guard resilience (§7).detects when an agent commits and
        resets --soft to before.sha, keeping changes staged"
      - "Engine: HEAD guard resilience (§7).detects when an agent switches
        branch and restores original branch, keeping changes"

## Gate Diff (baseline vs now)
| gate | baseline | now | verdict |
| --- | --- | --- | --- |
| typecheck | pass | pass | green (matches baseline) |
| test | fail | pass | IMPROVED (was failing at baseline) |

Judge regressions ONLY from this table: a gate counts as fixed only when its row shows now=pass after baseline=fail. Raw output text may differ for unrelated reasons (timing, ordering, truncation) — never infer fixes from text comparison.

## Output

Yield a structured JSON object matching this schema:
- wave (integer, required, min: 1)
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","has_failures","blocked"])
- mergedItems (array of string, required)
- failedItems (array of string, optional)
- blockedItems (array of string, optional)
- debt (array of string, optional)
- summary (string, required)
- recommendations (array of string, optional)

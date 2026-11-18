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
Task: omp-workspaces
Wave Report: Wave 2 completed. Merged items: usage-cache-tokens, transport-byte-stability, merge-setup-fix

## Infrastructure Gates
setup:
  - cd plugins/software-factory && bun install
gates:
  - id: typecheck
    command: bun --cwd=plugins/software-factory run typecheck
  - id: test
    command: bun --cwd=plugins/software-factory test
testRunner:
  command: bun --cwd=plugins/software-factory test
  selectorArgs: []
  junitArg: --reporter=junit --reporter-outfile={path}
notes:
  - "Baseline red (recorded as-is, reproducible in isolation): full `bun test`
    yields 663 pass / 2 skip / 1 fail; the failure is test/disk-space.test.ts:57
    'checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and
    tmpdir' (expected failingPaths.length 1, received 2) — environment-sensitive
    duplicate low-space paths, not investigated per clean-checkout rule."
  - No lint/format gate is configured (no eslint/biome/prettier configs in the
    repo). If one is added, exclude the orchestration folder `.factory/**` so
    harness artifacts cannot turn it red.
  - "Tests must run with cwd=plugins/software-factory: several tests resolve
    repo-relative fixtures (e.g. `agents/criteria/dispositions.md`) from cwd, so
    running `bun test` from the repo root fails. The runner uses `bun
    --cwd=plugins/software-factory`; selectors must be plugin-relative test file
    paths (e.g. `test/git/worktrees.test.ts`). Verified selector dry-run: `bun
    --cwd=plugins/software-factory test test/git/worktrees.test.ts
    --reporter=junit --reporter-outfile=<tmp>` ran 8 tests and wrote JUnit XML
    with per-file paths."
  - Live omp harness smoke test is opt-in via FACTORY_LIVE_OMP=1 and skipped by
    default; the full suite requires no omp binary or network.
  - Repository root has no package.json/Makefile/CI workflows; all
    Bun/TypeScript tooling and lockfile live in plugins/software-factory.


# Infra Operator Action Notes
- Baseline red (recorded as-is, reproducible in isolation): full `bun test` yields 663 pass / 2 skip / 1 fail; the failure is test/disk-space.test.ts:57 'checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir' (expected failingPaths.length 1, received 2) — environment-sensitive duplicate low-space paths, not investigated per clean-checkout rule.
- No lint/format gate is configured (no eslint/biome/prettier configs in the repo). If one is added, exclude the orchestration folder `.factory/**` so harness artifacts cannot turn it red.
- Tests must run with cwd=plugins/software-factory: several tests resolve repo-relative fixtures (e.g. `agents/criteria/dispositions.md`) from cwd, so running `bun test` from the repo root fails. The runner uses `bun --cwd=plugins/software-factory`; selectors must be plugin-relative test file paths (e.g. `test/git/worktrees.test.ts`). Verified selector dry-run: `bun --cwd=plugins/software-factory test test/git/worktrees.test.ts --reporter=junit --reporter-outfile=<tmp>` ran 8 tests and wrote JUnit XML with per-file paths.
- Live omp harness smoke test is opt-in via FACTORY_LIVE_OMP=1 and skipped by default; the full suite requires no omp binary or network.
- Repository root has no package.json/Makefile/CI workflows; all Bun/TypeScript tooling and lockfile live in plugins/software-factory.

# Gates Baseline
timestamp: 2026-11-09T23:10:13.280Z
gates:
  - id: typecheck
    command: bun --cwd=plugins/software-factory run typecheck
    status: pass
    durationMs: 5755
    details: $ tsc --noEmit
  - id: test
    command: bun --cwd=plugins/software-factory test
    status: fail
    durationMs: 244730
    details: >-
      bun test v1.4.4 (38afee6c8)

      Disk space check passed (threshold 2048 MB):
        worktreeRoot (/tmp/factory-test-repo-bobZ0J.factory-wt): 4992 MB free
        .factory-runtime/tmp (/tmp/factory-test-repo-bobZ0J.factory-wt/.factory-runtime/tmp): 4992 MB free
        repoRoot (/tmp/factory-test-repo-bobZ0J): 4992 MB free
        tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 95843 MB free
        /tmp (/tmp): 4992 MB free
      ================================================================

      Task: status-test-task [ACTIVE]

      Kind: unclassified | Iteration: 1 | Wave: 1

      Worktree: (none - main checkout)

      Config path: /tmp/factory-test-repo-3KaBfI/.factory/pipeline.yaml

      Budget spent: $0.0000

      ----------------------------------------------------------------

      Waves & Items:
        Wave 1:
      Concerns: open 0 | dismissed 0 | routed 0 | resolved 0

      ----------------------------------------------------------------

      Blocking Questions:
        (none)
      ----------------------------------------------------------------

      Digest Questions:
        (none)
      ================================================================



      test/config-worktree-layering.test.ts:

      [factory preflight] Preflight failed with 1 error(s):
        - Pipeline config loading failed: Invalid pipeline configuration:
      /limits/maxIterations: must be integer ({"type":"integer"})


      test/disk-space.test.ts:

      52 |       probe,

      53 |     });

      54 | 

      55 |     expect(res.ok).toBe(false);

      56 |     expect(res.minFreeDiskMb).toBe(2048);

      57 |     expect(res.failingPaths.length).toBe(1);
                                               ^
      error: expect(received).toBe(expected)


      Expected: 1

      Received: 2

            at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/plugins/software-factory/test/disk-space.test.ts:57:37)
      (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace verifies
      worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir [38.90ms]


      test/cli/cli.test.ts:

      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on
      host Slava-Yoga) taken over by PID 2660959

      [factory lock] Stale run lock for task "competing-takeover-task" (PID
      9999999 on host Slava-Yoga) taken over by PID 2660959

      [factory lock] Stale run lock for task "journal-worktree-task" (PID
      9999999 on host Slava-Yoga) taken over by PID 2660959

       663 pass
       2 skip
       1 fail
       3736 expect() calls
      Ran 666 tests across 101 files. [244.55s]
    failingTests:
      - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
        worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir

## Gate Diff (baseline vs now)
| gate | baseline | now | verdict |
| --- | --- | --- | --- |
| typecheck | pass | pass | green (matches baseline) |
| test | fail | fail | still failing (matches baseline; not a regression) |

Judge regressions ONLY from this table: a gate counts as fixed only when its row shows now=pass after baseline=fail. Raw output text may differ for unrelated reasons (timing, ordering, truncation) — never infer fixes from text comparison.

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

## Open Concerns


- Raise concerns with evidence; record concernResolutions with resolve/carry/propagate and condense stale detail.

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
- concerns (array of object, optional): Structured concerns raised at wave close-up
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)
- concernResolutions (array of object, optional): Close-up resolutions for open concerns
  - id (string, required)
  - note (string, optional)
  - action (string, required, enum: ["resolve","carry","propagate","dismiss"])

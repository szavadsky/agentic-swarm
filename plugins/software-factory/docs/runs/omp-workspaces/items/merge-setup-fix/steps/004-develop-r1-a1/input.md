# Step: Develop

## Goal
Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.

## Rules
- Target green: every test selector and case identified in `target` MUST pass cleanly.
- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.

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

## Target
{
  "selectors": [
    "test/engine/merge-setup.test.ts"
  ],
  "expectRed": [
    "merge-path infra.setup.runs setup in the child worktree before gates, and setup-created untracked files are not gate mutations",
    "merge-path infra.setup.runs setup before target-green checks in the child worktree",
    "merge-path infra.setup.fails the merge with gate-shaped evidence containing the setup command and output"
  ]
}

## Context & Citations
[
  "plugins/software-factory/src/core/flows/merge-path.ts :: mergeItem",
  "gates.ts:332-335 runInfraSetup temp-worktree path",
  "runner.ts:796-810 runInfraSetup temp-worktree path"
]

## Review Feedback
RETRY (gate flake, not prod regression — isolate before touching code): 1) Run ONLY the failing file in isolation from plugins/software-factory: `bun test test/engine/stranded-wave.test.ts`. Expect pass. That test never invokes mergeItem (item never becomes ready; infra has empty gates), so an isolated pass proves the full-suite timeout was load contention — do NOT rewrite prod code in that case. 2) Re-run the full `bun test` once; success = no NEW failing tests vs baseline (only the accepted disk-space env failure may remain). 3) ONLY if the isolated file also fails: treat as real regression — audit your merge-path diff for strict empty-setup parity (no-op before any journal/git/snapshot side effect, identical return paths when infra.setup is empty/missing) and fix minimally. Keep prod diff ~80 lines; preserve the new passing merge-setup tests.

Failing check: gates

Message: Gate regressions: test

Detail:
 task \"competing-takeover-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\n[factory lock] Stale run lock for task \"journal-worktree-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 278359\nkilled 1 dangling process\n\ntest/engine/stranded-wave.test.ts:\n(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]\n  ^ this test timed out after 5000ms.\n\n# Unhandled error between tests\n-------------------------------\n250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);\n251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);\n252 |     const journal = await readJournal(deployedTaskDir);\n253 |     // No done-ness reuse shadowed either consult: both decisions recorded.\n254 |     expect(journal.filter((e) => e.type === \"step_reused\" && String((e as { step?: string }).step ?? \"\").startsWith(\"consult-loop-1\")).length).toBe(0);\n255 |     expect(journal.filter((e) => e.type === \"decision_made\" && (e as { item?: string }).item === \"loop-1\").length).toBe(2);\n                                                                                                                         ^\nerror: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 0\n\n      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)\n-------------------------------\n\n\n 667 pass\n 2 skip\n 2 fail\n 1 error\n 3763 expect() calls\nRan 671 tests across 102 files. [253.72s]\n[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]",
    "failingTests": [
      "Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir",
      "Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)"
    ]
  }
]

Output tail:
7:37)
(fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir [37.70ms]

test/cli/cli.test.ts:
[factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
[factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
[factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 278359
killed 1 dangling process

test/engine/stranded-wave.test.ts:
(fail) Stranded-wave fix > second consult for the same item fires a fresh turn (no step_reused sham loop) [5057.05ms]
  ^ this test timed out after 5000ms.

# Unhandled error between tests
-------------------------------
250 |     const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
251 |     const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
252 |     const journal = await readJournal(deployedTaskDir);
253 |     // No done-ness reuse shadowed either consult: both decisions recorded.
254 |     expect(journal.filter((e) => e.type === "step_reused" && String((e as { step?: string }).step ?? "").startsWith("consult-loop-1")).length).toBe(0);
255 |     expect(journal.filter((e) => e.type === "decision_made" && (e as { item?: string }).item === "loop-1").length).toBe(2);
                                                                                                                         ^
error: expect(received).toBe(expected)

Expected: 2
Received: 0

      at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/plugins/software-factory/test/engine/stranded-wave.test.ts:255:116)
-------------------------------


 667 pass
 2 skip
 2 fail
 1 error
 3763 expect() calls
Ran 671 tests across 102 files. [253.72s]
[New failing tests: Stranded-wave fix.second consult for the same item fires a fresh turn (no step_reused sham loop)]

Budget: 83 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.

Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.

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


- Review the concerns above before starting; they constrain this step but are not part of the assignment.
- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
- summary (string, required): Concise summary of implementation actions and test results
- target (object, optional): Target test selectors, gate, or custom command for red/green verification
  - Option 1:
    - selectors (array of string, required)
    - expectRed (array of string, required, minItems: 1)
  - Option 2:
    - gate (string, required)
  - Option 3:
    - command (string, required)
    - customTarget (boolean, required)
- evidence (array of string, optional): List of executed checks and verification commands proving correctness
- concerns (array of object, optional): Structured concerns raised during implementation
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
- notes (string, optional): Optional developer notes, implementation observations, or comments

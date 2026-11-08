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
  "slug": "routing-blocker-derive-v2",
  "kind": "dev",
  "title": "Blocker derive",
  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
  "outlineRef": "routing-blocker-derive-v2",
  "milestone": "m3-routing",
  "wave": 8,
  "deps": [
    "modes-prompts-v2",
    "plan-reviewer-triage-v2",
    "reviewer-triage-v2"
  ],
  "escalate": true
}

## Target
{
  "selectors": [
    "test/engine/routing-blocker-derive.test.ts",
    "test/plan-scheduler.test.ts"
  ],
  "expectRed": [
    "plan/scheduler: blockedByConcern.blocks concern-affected items and their declared dependents in PM order",
    "plan/scheduler: blockedByConcern.unions concern blocking with the failure-blocked fixpoint over declared deps",
    "plan/scheduler: blockedByConcern.ignores refs naming no item and never blocks a done item",
    "derive/task: collectRoutedBlockers.collects affects of routed blocker concerns and ignores other statuses and kinds",
    "derive/task: collectRoutedBlockers.returns an empty set when the task has no concerns directory",
    "derive/wave: routed blocker integration.routes a concern-affected item and its declared dependents to blocked",
    "derive/wave: routed blocker integration.cascades transitively over declared deps only",
    "derive/item: routed blocker integration.blocks only the item named by a routed blocker",
    "derive/item: routed blocker integration.keeps a terminal item status over routed blocking",
    "derive/task: routed blocker scenario.blocks affected items and declared dependents, leaving non-dependents pending without writes",
    "derive/task: routed blocker scenario.derives the task blocked when every item is in the routed blocker cascade"
  ]
}

## Context & Citations
[]

## Review Feedback
Failing check: gates

Message: Gate regressions: test

Detail:
"bun test v1.4.3 (c6da4a4d3)\n================================================================\nTask: status-test-task [ACTIVE]\nKind: unclassified | Iteration: 1 | Wave: 1\nWorktree: (none - main checkout)\nConfig path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-nmAvPI/.factory/pipeline.yaml\nBudget spent: $0.0000\n----------------------------------------------------------------\nWaves & Items:\n  Wave 1:\n================================================================\n\n\ntest/cli/cli.test.ts:\n[factory lock] Stale run lock for task \"stale-lock-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 3934643\n[factory lock] Stale run lock for task \"competing-takeover-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 3934643\n[factory lock] Stale run lock for task \"journal-worktree-task\" (PID 9999999 on host Slava-Yoga) taken over by PID 3934643\nkilled 1 dangling process\n\ntest/engine/blocked-closeup-iteration.test.ts:\n(fail) Engine: Blocked close-up starts iteration N+1 (§8.4.1, Finding 6) > blocked close-up writes question, unblocks on answer, and starts iteration N+1 with answer hydrated [5087.10ms]\n  ^ this test timed out after 5000ms.\n\n 363 pass\n 2 skip\n 1 fail\n 1667 expect() calls\nRan 366 tests across 59 files. [121.24s]\n[New failing tests: Engine: Blocked close-up starts iteration N+1 (§8.4.1, Finding 6).blocked close-up writes question, unblocks on answer, and starts iteration N+1 with answer hydrated]",
    "failingTests": [
      "Engine: Blocked close-up starts iteration N+1 (§8.4.1, Finding 6).blocked close-up writes question, unblocks on answer, and starts iteration N+1 with answer hydrated"
    ],
    "improvements": [
      "Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged",
      "Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes"
    ]
  }
]

Output tail:
[typecheck] pass:
$ tsc --noEmit

[test] fail:
bun test v1.4.3 (c6da4a4d3)
================================================================
Task: status-test-task [ACTIVE]
Kind: unclassified | Iteration: 1 | Wave: 1
Worktree: (none - main checkout)
Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-nmAvPI/.factory/pipeline.yaml
Budget spent: $0.0000
----------------------------------------------------------------
Waves & Items:
  Wave 1:
================================================================


test/cli/cli.test.ts:
[factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3934643
[factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3934643
[factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3934643
killed 1 dangling process

test/engine/blocked-closeup-iteration.test.ts:
(fail) Engine: Blocked close-up starts iteration N+1 (§8.4.1, Finding 6) > blocked close-up writes question, unblocks on answer, and starts iteration N+1 with answer hydrated [5087.10ms]
  ^ this test timed out after 5000ms.

 363 pass
 2 skip
 1 fail
 1667 expect() calls
Ran 366 tests across 59 files. [121.24s]
[New failing tests: Engine: Blocked close-up starts iteration N+1 (§8.4.1, Finding 6).blocked close-up writes question, unblocks on answer, and starts iteration N+1 with answer hydrated]

Budget: 218 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.

Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.

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
- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
- notes (string, optional): Optional developer notes, implementation observations, or comments

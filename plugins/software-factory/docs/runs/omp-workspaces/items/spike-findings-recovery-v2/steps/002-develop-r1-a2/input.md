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
  "slug": "spike-findings-recovery-v2",
  "kind": "no-behavior",
  "title": "Recover wave-1 spike findings onto parent branch (v2)",
  "assignment": "Docs-only salvage retry (zero prod lines, no-behavior kind). Source branch topic/omp-workspaces--spike-findings-recovery holds the 5 approved files from the failed wave-2 recovery. Using read-only `git show <branch>:<path>` ONLY — NEVER checkout/switch/branch/merge and NEVER write to .factory/** engine paths — copy onto this item branch at identical repo-relative paths: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md, plus items/spike-findings-recovery/RECOVERY.md (if that path is not writable from this item worktree, place as items/spike-findings-recovery-v2/RECOVERY.md with a header noting the source path). Fix the `oMP` capitalization typo in omp-6-repo-rules.md to `omp`. Verify: all 5 files present, each spike doc contains probe-evidence + recommendations sections, RECOVERY.md maps each M1 scenario to evidence + followUps for iteration-2 planning. CRITICAL mergeability: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red td-baseline-disk baseline); omit target entirely or record a single passing selector target only. Minimal verification from cwd=plugins/software-factory (e.g. file-presence check); do not gate on full suite.",
  "outlineRef": "spike-findings-recovery-v2",
  "milestone": "m1-omp-de-risk",
  "wave": 3
}

## Target
tests

## Context & Citations
[]

## Review Feedback
Failing check: gates

Message: Gate regressions: typecheck

Detail:
# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'\n-------------------------------\n\n\ntest/engine/concerns-funnel.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/epic-saga-propagate.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'\n-------------------------------\n\n\ntest/engine/human-router-severity.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/reviewer-triage.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'\n-------------------------------\n\n\ntest/engine/amend-delta.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'\n-------------------------------\n\n\ntest/engine/head-guard.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\ntest/engine/fix-round-reentry.test.ts:\n\n# Unhandled error between tests\n-------------------------------\n-------------------------------\n\n\n 95 pass\n 94 fail\n 94 errors\n 545 expect() calls\nRan 189 tests across 106 files. [320.00ms]"
  }
]

Output tail:
-----------------


test/engine/hydration-fingerprint-caps.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts'
-------------------------------


test/engine/concerns-funnel.test.ts:

# Unhandled error between tests
-------------------------------
-------------------------------


test/engine/epic-saga-propagate.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/epic-saga-propagate.test.ts'
-------------------------------


test/engine/human-router-severity.test.ts:

# Unhandled error between tests
-------------------------------
-------------------------------


test/engine/reviewer-triage.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/reviewer-triage.test.ts'
-------------------------------


test/engine/amend-delta.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find package 'yaml' from '/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery-v2/plugins/software-factory/test/engine/amend-delta.test.ts'
-------------------------------


test/engine/head-guard.test.ts:

# Unhandled error between tests
-------------------------------
-------------------------------


test/engine/fix-round-reentry.test.ts:

# Unhandled error between tests
-------------------------------
-------------------------------


 95 pass
 94 fail
 94 errors
 545 expect() calls
Ran 189 tests across 106 files. [320.00ms]

Budget: 0 prod lines changed vs storyMaxProdLines 300 (kind no-behavior). Shrink the diff or escalate; do not re-verify green checks from scratch.

Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.

## Open Concerns
- id: rm-02fe59eb65
  kind: remarkable
  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
- id: rm-61c10c8318
  kind: remarkable
  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
- id: rm-63922d9635
  kind: remarkable
  summary: Configure omp via a generated YAML overlay per turn


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

# Step: Integrate

## Goal
Resolve git merge conflicts between the parent tip branch and the item branch. Deliver a cleanly merged tree with all tests and gates passing.

## Rules
- Conflict resolution: inspect conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Preserve the design intent of both sides.
- Zero markers: ensure no unresolved conflict markers remain in any file.
- Verification: run project gates and test runner via `bash` to verify clean compilation and passing test suites.
- NEVER issue git write commands (`git commit`, `merge`, `checkout`, `reset`, `stash`, `rebase`, `branch`, `add`, `push`). Fix file contents only; the engine stages, verifies, and commits the resolution.
- NEVER launch subagents or background tasks.
- Output: yield structured output matching `developer-output.schema.json` (`status: ok` when the tree is conflict-free and gates pass, `blocked`/`failed` otherwise, with verification in `evidence`).

## Item
routing-human-debt-v2

## Conflict Diff
diff --cc plugins/software-factory/src/core/derive/task.ts
index 37d1e24,4259339..0000000
--- a/plugins/software-factory/src/core/derive/task.ts
+++ b/plugins/software-factory/src/core/derive/task.ts
@@@ -17,8 -17,7 +17,12 @@@ import { deriveItemState, withRoutedBlo
  import { deriveWaveState, type DerivedWaveState } from "./wave.js";
  import { BudgetTracker } from "../budget.js";
  import { listConcerns } from "../concerns.js";
++<<<<<<< HEAD
 +import { isDebtConcern } from "../triage.js";
 +import { questionBlocks } from "../steer.js";
++=======
+ import { blockedByConcern } from "../plan/scheduler.js";
++>>>>>>> topic/concerns-funnel
  import { git } from "../git/exec.js";
  import { isAncestor } from "../git/commit.js";

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

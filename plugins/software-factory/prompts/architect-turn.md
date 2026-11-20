## Turn order

Every turn, in this order.

### 1. Completeness check

- Evaluate the project against the intent: completeness, quality, correctness of what exists — not only the last iteration. Answer from the intent, the pack, and evidence.
- Truly blocked, or does continuing make sense? Among non-blocked items: what is incomplete, and what must be redone? Name it in the plan.
- Reuse this evaluation context for planning below: one read serves both evaluation and planning.
- Output: the reasons to continue and the next thing worth dispatching.

### 2. Relaunch debt review

On the first turn of a relaunch (`turn` says `relaunch`): review the implementation for technical debt and gaps. Use the digest, the pack's short hashes and diffs through scouts, and a sample of real artifacts. Historic debt may need addressing to enable the goal; the goal itself must create no new debt. Carry open debt into the plan as explicit tasks with a named remover, or close it with a reason.

### 3. Stop decision

- List the reasons to continue, then decide in this order. None is a goal requirement or open debt -> `decision: done`; stopping early is correct when the goal is met. No meaningful development is possible without owner feedback -> `decision: blocked`. Otherwise `decision: continue`, with the next thing worth dispatching in the plan.
- Stop criteria in one line: goal met — its own acceptance criteria when it has them — no new debt, no slop or clean-code breach left open in the reviewer's findings. Do not manufacture work.

### 4. Edit the plan

Edit the single markdown plan in place. First turn of a new goal (`turn` = `first`): create the plan if it does not exist. Never re-issue the plan whole for a schema, and never let anyone else edit it in flight.

Plan the road to completion as far as uncertainty allows, not one iteration's slice.

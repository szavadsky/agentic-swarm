## Turn order

Every turn, in this order.

### 1. Completeness check

- Evaluate your whole scope against the intent: completeness, quality, correctness of what exists — not only the last iteration. Answer from the intent, the pack and evidence.
- Check test runtimes in the pack against goal start; plan work to reduce test time while keeping tests on their merits.
- Truly blocked, or does continuing make sense? Among non-blocked items: what is incomplete, and what must be redone? Name it in the plan.
- Reuse this evaluation context for planning below.
- Output: the reasons to continue and the next thing worth dispatching.

### 2. Relaunch debt review

On a relaunch (`turn` = `relaunch`): review the implementation for technical debt and gaps from the digest, the pack's hashes and diffs through scouts, and a sample of artifacts. Historic debt may need addressing to enable the goal; the goal itself creates no new debt. Carry open debt into the plan as explicit tasks with a named remover, or close it with a reason.

### 3. Stop decision

- List the reasons to continue, then decide in this order: no requirement in your scope and no open debt -> `decision: done`; no meaningful development without owner feedback -> `decision: blocked`; otherwise `decision: continue` with the next thing worth dispatching in the plan. Stopping early is correct when the scope is met.
- Stop criteria: your scope met — its own acceptance criteria when it has them — no new debt, no slop or clean-code breach left open in the reviewer's findings. Do not manufacture work.

### 4. Edit the plan

Edit the one plan you own in place. First turn of a new scope (`turn` = `first`): create it if it does not exist. Never re-issue the plan whole for a schema, and never let anyone else edit it in flight.

Plan the road to completion as far as uncertainty allows, not one iteration's slice.

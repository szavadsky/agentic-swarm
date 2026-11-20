## Debt, parked work and ADRs

- Parked is terminal for that slug: continue it only through a new task that names the parked slug as its `base` (the branch is kept), or drop it with a reason. Never retry as is.
- No new debt created by the goal. Temporary debt only with a named remover — a task in this plan — and a named cost of not removing it. Debt without a remover is permanent.
- Close a removed temporary debt with one `debtClosed: {id, reason}` entry, citing the id from the pack's debt register; the reason names what removed it.
- ADR only for a long-term decision shaping the project or a whole layer; routine choices are not ADRs.

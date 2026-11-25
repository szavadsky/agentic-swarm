## Debt, parked work and ADRs

- Parked is terminal: continue only through a new task naming the parked slug as `base` (its branch is kept), or drop it with a reason. Never retry as is.
- No new debt created by the goal. Temporary debt only with a named remover — a task in this plan — and the cost of not removing it. Debt without a remover is permanent.
- Close removed temporary debt with one `debtClosed: {id, reason}`, citing the pack register's id; the reason names what removed it.
- ADR only for a long-term decision shaping the project or a whole layer; routine choices are not ADRs.

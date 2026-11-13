# DOC1 — ideology document

Worktree `/home/slava/aiexp/agentic-swarm.wt/doc1`, branch `factory-v3-doc1`. Rules: `bootstrap/assignments/RULES.md` (its code rules do not apply here; nothing under `plugins/` changes).

## Why

A new operator or contributor must understand why the factory behaves as it does before touching it. The manifesto is the owner's authoritative text, written for its author; this document explains the same ideology to someone who was not there.

## You own

`docs/ideology.md` (new). Nothing else.

## Read first

`manifesto.md` whole — `## Intent` binds, `## Notes on implementation` are judgement, the decision log (lines 145-216) shows what was contested. `bootstrap/KERNEL0.md` §3 and §5 — how the principles appear in the first implementation. Advisory evidence: `manifesto.advice.md:9-51` (the v2 run census that motivates the economics), `bootstrap/context/repo-map.md` §6 (observed v2 failure modes).

## Build

`docs/ideology.md`, 120–180 lines:

- Opening, five lines: what the factory adds on top of a coding harness, and what it refuses to be.
- One section per principle. Each has four parts: the principle in one sentence; why — the cost or failure it answers, with the concrete number or incident where one exists; how it shows in the system — the mechanism, by name; what it forbids. Derive the list from Intent, do not copy its headings. It must cover: the escalation ladder; the iteration as the unit of architect attention; model economics at a ~50x price ratio; same context, same agent; the plan as the architect's markdown and the PM as paper-pusher; derived state; the funnel — only the remarkable travels up, and why separate stages see different things; uncertainty first and spikes; stopping and debt; steering by mailbox and autonomy by reversible assumption; flows as data; harness agnosticism; clean code as a result, not a procedure.
- Closing section "What was rejected and why": the v2 traits the manifesto names — ceremony launches, schema sprawl, nested retries, ADR spam, strict-schema plan re-issue — one line of evidence each.
- Glossary: link to the manifesto's glossary, do not repeat it.

Style: plain declarative prose for a technical reader. No marketing, no paragraph-by-paragraph restating of the manifesto, no invented facts: every number or incident carries a `file:line` reference into `manifesto.md`, `manifesto.advice.md` or `bootstrap/context/*.md`. Where Intent is silent, say so instead of filling in.

## Acceptance

- Every principle section has all four parts; every reference resolves to a line that says what is claimed.
- Nothing contradicts the manifesto's Intent; terms match its glossary (goal, launch, iteration, task, epic, saga, spike, wave, concern, remarkable, context pack).
- `rg -n "TODO|TBD" docs/ideology.md` prints nothing.

# INT — integrate S2 onto the merged base

Worktree `/home/slava/aiexp/agentic-swarm.wt/int`, branch `factory-v3-int` (created from `factory-v3`). Rules: `bootstrap/assignments/RULES.md`.

## Why

Slice S2 (task flow, merge queue, budgets) was built on branch `factory-v3-s2` from a `factory-v3` commit that already contains S0+S1+S3+S4 (skeleton, adapters, boundary, launch shell). S2 was allowed additive changes to the shared core (`src/kernel/{types,derive,next,store,record,tasks,config}.ts`). Kernel-0 exists only when it works with the rest.

## Read first

`bootstrap/KERNEL0.md` whole; the reports `bootstrap/reports/{S3,S4}.md` (already on `factory-v3`, merged) and `bootstrap/reports/S2.md` (on its branch: `git show factory-v3-s2:bootstrap/reports/S2.md`) — especially "changes to shared files", "what should happen next" and inputs one slice expects from another. Note the hand-integration already on the base: config `aliasSchema` carries both S3 `timeouts` and S4 strictness; the digest scout is optional without an alias; `firstTurn` means no architect step; `boundary.cause` reaches the summary. Do not re-litigate these; extend them only if S2's merge breaks them.

## Build

1. Merge `factory-v3-s2` into `factory-v3-int` with a merge commit (`git merge --no-ff`). Resolve conflicts by understanding both sides — a conflict in a shared type is a contract question, settle it once and apply it everywhere. Never drop a test to get green.
2. Close the cross-slice gaps the reports name: prompt variables the flow must pass, records the metrics count, config keys one slice reads and another defines, the session-store directory reaching the harness, real harnesses registered in the CLI.
3. One no-model E2E test that crosses all three slices in a single goal: `factory init` → `factory run` (fake harness: plan with three tasks — one merges, one is rejected in the last review round and parks, one depends on the parked one) → `factory steer` → second `factory run` (architect answers the steer, continues the parked work through a new slug with `base`, PM reconciles) → third run: architect says done. Assert derived state, mailbox outbox, summaries and metrics after each launch.
4. All nine scenarios of KERNEL0 §7 are present as tests and named so they can be found (`scenario 1` … `scenario 9`); list test file and name per scenario in the report.
5. `bootstrap/promote.sh` works on the result: run it with `FACTORY_PIN_ROOT` pointing into `/tmp`, fix the script or the package until it passes, remove the temporary pin.
6. Delete what the integration makes dead: duplicate helpers, unused exports, superseded tests, `bootstrap/drafts/` if still present.

## Acceptance

- `bun run typecheck` green; `bun test` green and under 90 seconds; scenarios 1–9 and the cross-slice test present.
- `rg -n "TODO|FIXME|as unknown as" plugins/software-factory/src` prints nothing new relative to `factory-v3`.
- `FACTORY_PIN_ROOT=/tmp/pin-check bootstrap/promote.sh` succeeds on your head commit.
- Report additionally lists: every conflict and how it was settled; kernel LOC by file; remaining gaps against KERNEL0 §2 left column, each with the smallest next step.

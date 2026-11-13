# INT — integrate the three slices

Worktree `/home/slava/aiexp/agentic-swarm.wt/int`, branch `factory-v3-int` (created from `factory-v3`). Rules: `bootstrap/assignments/RULES.md`.

## Why

Slices S2 (task flow, merge queue, budgets), S3 (boundary, prompts, mailbox, summary) and S4 (config, pre-flight, recovery, metrics, CLI) were built in parallel on branches `factory-v3-s2`, `factory-v3-s3`, `factory-v3-s4`, each from the same `factory-v3` commit. Each was allowed additive changes to the shared core (`src/kernel/{types,derive,next,store,record,tasks,config}.ts`). Kernel-0 exists only when they work together.

## Read first

`bootstrap/KERNEL0.md` whole; the three reports `bootstrap/reports/{S2,S3,S4}.md` (on their branches: `git show factory-v3-s2:bootstrap/reports/S2.md`, …) — especially "changes to shared files", "what should happen next" and inputs one slice expects from another.

## Build

1. Merge the three branches into `factory-v3-int` with merge commits (`git merge --no-ff`), smallest shared-file footprint first. Resolve conflicts by understanding both sides — a conflict in a shared type is a contract question, settle it once and apply it everywhere. Never drop a test to get green.
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

# Kernel-0 — intent for the initial implementation

Authority: `manifesto.md` `## Intent` wins over everything here. This file is the iteration-0 agent's direction for the minimum new version (manifesto §CRITICAL — bootstrap). Shapes are directional: keep the seams, change the details when the code says so and note it in `LOG.md`. Advisory detail lives in `manifesto.advice.md` (§4 interface shapes 92-232, §5 edge cases 233-301) — read the cited range, not the whole file.

## 1. What it is

The thinnest factory that runs one honest iteration of the manifesto loop on its own repository, executed from a pinned build. Everything else is built by the factory on itself, one iteration per launch.

Done when:
- the no-model E2E suite (§7) is green and is the promotion gate;
- a shakedown launch on a toy goal with free models merges at least one reviewed task and writes an iteration summary with metrics;
- rejected v2 modules are gone and `tsc --noEmit` + the suite are green.

## 2. Scope

| In kernel-0 (thin) | Built by the factory on itself (seed backlog, §9) |
|---|---|
| Launch = bounded iterations; iteration = one architect consult + orchestration to exhaustion/blocked | Escalation ladder: trivial and task paths, front agent classification, review auto-upscope |
| Architect turn at the boundary only: completeness check → edits one markdown plan → small outcome | Advisory plan review by a weaker model |
| PM turn: plan → task files, DAG; script reconciles (done frozen, rework = new slug, pending re-read at dispatch) | PM steer structuring, mid-run mailbox monitoring, holds |
| Task flow as data: implement → review (2 rounds, last round decides park or merge-with-debt), spike (not merged) | TDD / QA / security flows, follow-up options beyond one default, escalation implementer tier |
| One item budget (turn count) + no-progress over history | Per-iteration $ budget from a price table, cross-harness fallback |
| Worktree per task from the integration head at dispatch; serial squash-merge queue; gates on the merged result | Git hygiene check with agentic revision |
| One outcome schema; append-only records; pure `derive`/`next`; status and context pack derived from records | Concern calibration prompts, involvement presets, hierarchy level 2 / subarchitects |
| Deterministic context pack (index, links, size-capped) incl. evidence digest of the previous launch | Storage backends beyond the plain folder; session portability graph; acpx generic layer |
| Mailbox minimum: inbox read at each boundary → architect → processed + outbox; iteration summary always | Benchmark-goal harness, compaction-policy learning (advice §8 S5) |
| Harness layer: fake, opencode (free models), omp (architect); usage with cache fields; sessions outside worktrees and git; compaction at session end | Claude Code / Codex adapters |
| Three config layers with schema + pre-flight (models resolve, effort resolves, binaries present) | Usage + ideology documentation set (drafted by the factory, reviewed by the owner) |
| Absolute + per-harness concurrency limit | |

## 3. One launch

1. Pre-flight: load and validate the three configs; resolve aliases → harness/model/effort (`Caps`); take the goal lock; reconcile orphans (worktrees, half-written records) by calling `derive`.
2. Boundary (start of every iteration):
   1. scan `mailbox/inbox`;
   2. first iteration of a launch only: cheap scout distils the previous launch (records, journal, transcripts by path) into `digest.md` — cost by role, loops, failures, interventions, with paths;
   3. script writes the context pack: status by slug (merged / parked + root cause / pending), forwarded concerns, short hashes, infra commands, steers, links to plan / intent / digest;
   4. architect turn in the stable goal checkout: resume its session when one exists and is usable, else de novo; it edits `plan.md` in place and returns `decision: continue | done | blocked` plus remarkables and steer responses; steers move to `processed`, responses to `outbox`;
   5. compact the architect session at the end, before the process exits and only when `decision = continue`;
   6. `done | blocked` → iteration summary → exit.
3. PM turn: reads plan + existing task files, writes/updates `tasks/<slug>.md`. Script validates what is checkable (unique slugs, deps exist, no cycle, frozen tasks untouched) and gives the PM one repair turn; a second failure ends the iteration as blocked with a remarkable.
4. Dispatch loop: `next(derive(...))` until terminal or drain. Per task: worktree → implement → mechanical commit → checks → review (task + diff hashes only; never the implementer's session, edits or reasoning) → fix round or last-round decision → merge queue. Parked work waits for the next consult; independent work continues.
5. Iteration summary + metrics to `outbox` — always, even on crash recovery. Launch iteration limit reached → exit; else back to 2.

## 4. Shape

Code: `plugins/software-factory` on branch `factory-v3` (worktree `/home/slava/aiexp/agentic-swarm.wt/v3`; see `LOG.md` D1). Rejected modules are deleted first (slice P) — `core/flows/*`, `core/plan/*`, `core/artifacts.ts`, `config/schemas/*`, `core/brief.ts`, `core/loops.ts`, `core/engine.ts`, v2 step prompts and the tests coupled to them; they stay readable through `git show main:<path>`. The new core goes under `src/kernel/` and imports the kept leaf modules: `core/git/*`, `core/{proc,shutdown,mutex,clock,journal,runtime-tmp,disk-space}.ts`, `core/checks/*`, `core/prompts.ts` partials, `core/concerns.ts` + `fingerprint.ts`, `core/budget.ts`, `core/steer.ts` taken-move, `harness/*`. Surface of the kept modules: `context/kept-modules.md`.

```ts
// The only agent ↔ script surface. One schema for every step (advice:193-209 is the fuller shape).
type Outcome = {
  status: 'done' | 'blocked' | 'failed' | 'upscope'
  summary: string
  concerns?: { kind: 'debt' | 'risk' | 'uncertainty' | 'choice'; calibration: 'fyi' | 'architect' | 'owner'; text: string; evidence?: string }[]
  forward?: string[]                              // remarkables for the next stage, nothing else travels up
  verdict?: 'approve' | 'changes' | 'reject'      // review steps
  decision?: 'continue' | 'done' | 'blocked'      // architect step
}
// Append-only, one directory per turn; script-set fields around the agent's outcome.
type StepRecord = { seq: number; iteration: number; slug?: string; step: string; round: number; alias: string
  model: ModelRef; stop: Stop; usage: Usage; session?: SessionRef; commit?: string; checks?: CheckResult[]
  outcome?: Outcome; startedAt: string; endedAt?: string }
type TaskFile = { slug: string; title: string; flow: string; deps: string[]; scope?: string[]; tier?: string
  source: string /* plan heading it derives from */; body: string /* brief: why, done-when, seams, edge cases */ }
type TaskStatus = 'pending' | 'ready' | 'running' | 'merged' | 'finished' | 'parked' | 'cancelled'
type State = { goal: 'active' | 'done' | 'blocked'; iteration: number; terminal: boolean
  tasks: Record<string, { status: TaskStatus; cause?: string; turns: number; round: number }> }
type Action = { kind: 'step'; slug: string; step: string; round: number } | { kind: 'merge'; slug: string }
  | { kind: 'boundary' } | { kind: 'exit'; reason: string }

declare function derive(tasks: TaskFile[], records: StepRecord[]): State   // pure; crash recovery = call it again
declare function next(state: State, limits: Limits, running: ReadonlySet<string>): Action[]   // pure

// Harness: flows branch on Caps, never on harness id. Caps / Stop / Usage / SessionRef verbatim from advice:96-143.
interface Harness {
  id: string
  caps(model: ModelRef): Promise<Caps>
  turn(req: { model: ModelRef; effort?: string; cwd: string; system?: string; prompt: string; session?: SessionRef
    outcomePath?: string; timeouts: { idleMs: number; wallMs: number }; opaque?: unknown }): Promise<TurnResult>
  compact?(ref: SessionRef): Promise<SessionRef>   // absent capability = type error at the call site
}
type TurnResult = { stop: Stop; text: string; usage: Usage; session?: SessionRef; transcript?: string }
interface ArtifactStore { /* goal-dir reads/writes, append record, list records; folder backend only */ }
```

Outcome delivery, in order of preference per `Caps`: native structured output → file written by the agent at `outcomePath` → fenced block in the final message. One parser, one validator, one same-session repair turn; a second invalid outcome is `failed`. `infra` stops never consume item budget or review rounds.

On disk (defaults, all paths in config):
- repo config `.factory/repo.yaml` (tracked): base branch, gates (setup / typecheck / test), artifact root;
- process config: package default + optional repo override — flows, roles → prompt templates, review rounds, item budget, calibration text;
- run config (not tracked): aliases → harness + model + effort + fallbacks, concurrency, launch limits, session-store path, runs kept, worktree root;
- goal dir `<artifactRoot>/<goal>/` (plain folder, gitignored): `intent.md`, `plan.md`, `tasks/`, `records/`, `mailbox/{inbox,processed,outbox}/`, `iterations/<n>/{context-pack,digest,summary}.md`, `metrics.yaml`, `journal.ndjson`;
- session store outside the repo and worktrees: transcripts and raw agent I/O, last N launches kept;
- goal checkout (integration branch worktree) is stable across launches; task worktrees are disposable.

Prompts: one template per role (`architect`, `pm`, `implementer`, `reviewer`, `digest`) plus partials; stable text first, volatile last; undefined variable = error; rendered prompts snapshot-tested. Architect prompt content: manifesto §Iteration, §Stopping and debt, §Uncertainty and spikes, §Steering + advice §7 (344-374). Harness facts: `context/opencode-probe.md`, `context/omp-probe.md`.

## 5. Invariants from the first launch

- Architect is launched only at an iteration boundary; count of architect launches per iteration is 1.
- The architect never writes a schema-bound file; the PM never edits `plan.md`; nobody edits the plan in flight.
- Done tasks are frozen; slugs are immutable; rework is a new slug.
- Parked is terminal for a slug. The architect continues parked work through a new slug that may name the parked branch as its base — parked work is kept, never merged silently, never retried silently.
- State is never stored — it is derived; deleting everything but `tasks/` and `records/` loses nothing. Script steps (commit, checks, merge) write records like agent steps; `derive` reads nothing else.
- Every iteration emits exactly one summary; nothing else reaches the owner unless calibrated `owner`.
- One budget per item; no retry counter nested inside another.
- The factory executes from the pinned build; the tree being edited is never on the execution path.
- Sessions, transcripts, raw prompts never enter git.

## 6. Edge cases the kernel owns

Checklist = advice §5 (233-301) plus v2's observed failures (`context/repo-map.md` §6). Non-negotiable in kernel-0: fresh worktree gets its setup step before checks (v2 lost 4 spikes to a missing `node_modules`); idle timeout distinct from wall timeout; partial usage persisted on timeout/SIGTERM; merge conflict → one implementer attempt, then park; red base → report once at pre-flight, do not block unrelated merges silently; stop-reason classification fixed (`classify.ts:104`, `"aborted"`); prompt size capped — links to files, never pasted content.

Architect subagents (scouts) are pinned to a cheap model in the harness overlay — inline subagents inherit the parent's model otherwise — and their usage counts toward the architect turn.

## 7. Acceptance — no-model E2E suite (fake harness, temp git repo)

1. Happy path: plan with two dependent tasks → both merged → summary + metrics; second launch: architect says done → goal done.
2. Review rejects in the last round → task parked with cause, dependents pending, independent task merges, iteration terminal.
3. Kill mid-task, relaunch → orphans reconciled, no duplicate merge, same derived state.
4. Infra stop (rate / timeout) → retried without consuming item budget; budget exhaustion → parked.
5. Gate fails on the merged result → not merged, one fix round, then parked.
6. Steer in inbox → present in architect context → processed + response in outbox.
7. Plan edit between iterations: one pending task changed, one removed, one added; merged task frozen.
8. Drain: iteration limit hit → no new dispatch, in-flight finishes, summary written.
9. Alternating outcomes (A, B, A, B) → no-progress trips on history → parked, loop incident counted.

## 8. Build slices

- P prune + contract (one owner, first): delete the rejected modules and coupled tests, cut the kept modules loose from them, typecheck and remaining tests green; write the harness contract (`src/harness/types.ts`, §4) and move the fake harness onto it; write `context/kept-modules.md`.
- S0 skeleton ∥ S1 harness adapters. S0: `src/kernel/types.ts`, store, `derive`/`next` + unit tests, launch loop, minimal flow + boundary against the fake harness, scenario 1 green, `factory run` wired to the kernel. S1: omp adapter on the contract (usage cache fields, session store outside worktrees, compaction, stop fix, effort probe) and the new opencode adapter; live smokes opt-in.
- After S0, in parallel on disjoint files: S2 flow + merge queue + budgets (scenarios 2, 4, 5, 8, 9) · S3 boundary + prompts + PM reconcile + mailbox + summary (scenarios 6, 7) · S4 config + pre-flight + lock/orphans + metrics + CLI + promote (scenario 3).
- S5 integration: all slices on `factory-v3`, full suite and typecheck green, first promotion to the pinned directory, shakedown launch.

## 9. Seed backlog for the first self-run

The right column of §2, in the manifesto's priority order: uncertainties first (free-model reliability per role, compaction reuse), then edge-case layers, then user-visible slices (ladder, steering, docs). The self-run goal intent is `manifesto.md` plus a short delta naming this state; the architect, not this file, decides the order.

# Built vs INTENT — 2026-11-15 (after iteration 29)

Read-only assessment of `INTENT.md` against the code, tests and the self-run record.
No status lives here permanently; the plan and iteration summaries are authoritative.
Code references are to `plugins/software-factory` unless stated.

## Snapshot

- 29 self-run iterations, 88 merged tasks, 32 parks, ~$47.2 cumulative (`.factory/artifacts/self/metrics.yaml` in the v3 worktree).
- Landing gates at i29: 653 pass / 0 fail. This checkout at `9a19dba` runs 657 pass, 4 skip, 0 fail (99 files, 661 tests).
- Kernel: TypeScript, ~18.3k source lines, one orchestration script, state derived from task files plus append-only records.
- Current flow: launch → front/classify → boundary (pack, digest on relaunch, steers, architect, plan-edit guard, PM) → dispatch → per-task flow (implement/review/fix rounds) → gates → merge.
- Phase 1 is incomplete by the architect's own list: R6, R7/R8, R10, R11, R14, R18–R23 (i29 summary). Hierarchy and the rest of the intent are explicitly after Phase 1.

## Phase 1 requirements (Phase1.md)

| R | Status | Evidence |
|---|---|---|
| R1 stop/relaunch keeps going | built | `src/kernel/launch.ts:313-360` resumes the interrupted iteration; R1 proven by the operator interrupt-and-relaunch test (journal 2026-11-15). |
| R2 unresumable session logged + de novo, every harness | built | de-novo retry on resume death (`src/harness/fallback.ts`, `src/kernel/flow-context.ts:295-345`); `resume-hard-death` merged i20; `test/kernel/resume-iteration.test.ts`, `test/harness/*resume*`. |
| R3 bounded work, drain on budget | built | `limits.turns/wallMinutes/iterationUsd/turnMinutes`, per-alias idle/wall timeouts, signal drain, `repairTurns` cap; `test/kernel/budget-drain.test.ts`, `signals`, `turn-*`. |
| R4 2026-11-13 high-severity defects fixed with regression tests | built | M1 (B1–B5) merged i15–i17; repros `test/kernel/repro-e1.test.ts`, `repro-e4.test.ts`, `e5-repro.test.ts`, `gate-export.test.ts`, `base-red-signatures.test.ts`; B5 architect infra retry at `src/kernel/boundary.ts:223-249`. |
| R5 kernel ensures delivery | built | delivery guard + `prompts/delivery-repair.md`; `REPAIR_TURNS=3` (`src/kernel/agent.ts`); `m5-delivery-guard`/`delivery-guard-land` merged. |
| R6 no value-less mechanical checks | partial | `checks-audit` spike done; scope fence removed (`m5-scope-area`, i22); `gate-flake-rerun` merged i29. `checks-prune-land` pending: a fix round that declines every finding still parks `empty-diff`. |
| R7 trivial same-session | partial | trivial runs the implement step on the front's alias/model, but de novo in the task worktree (`src/kernel/flow-context.ts:279-290`; comment `src/kernel/flow.ts:449-453`). Same-session resume pending (`m4-trivial-session`; probe on branch `factory-task/self/m4-session-probe`). |
| R8 standalone task upscope | not built | `m4-standalone-upscope` pending; no review→`bigger` path in the flow. |
| R9 scope is an area, not a fence | built | `m5-scope-area` merged i22; `prompts/scope.md`, dispatch admits areas; scenario test two tasks sharing a file. |
| R10 end-of-wave steward + merge ladder + kept-land | not built | conflict resolution exists inside a task's own merge (`src/kernel/integrate.ts`, `merge-attempt.ts`); `m5-steward`, `m5-kept-land` pending; `continuation-conflict-land` parked i29. |
| R11 plan checker before architect, with repeat | not built | `m5-plan-checker` pending; v1 assets named in the plan are in git history. |
| R12 architect evaluates project against intent; plans the road | built | `m5-architect-horizon` merged i23; `prompts/architect.md` turn order 1–4. |
| R13 context pack is an index, no artificial cap | built | `pack-uncap` merged i22; `src/kernel/context-pack.ts`, `src/kernel/boundary.ts:160-189`. |
| R14 task-tier plan review, advisory, sampled | not built | `m5-plan-review` pending. |
| R15 prompts from one templating source | built | LiquidJS (`src/kernel/prompts.ts`), shared fragments, snapshot test; `m3-liquid-land`, `m3-debloat-land` merged. |
| R16 validation for schema-controlled files | built | `factory validate`, `src/schema-check.ts`, schema-validation gate; prompts name the command. LSP config `.omp/lsp.json` is untracked. |
| R17 kernel gates: format, lint, schema | built | `scripts/gates.sh` runs typecheck, tests, format, lint, schema on a clean export; Biome in `biome.json`. |
| R18 cost and work per model | built | `m6-record-metrics` merged i28; `src/kernel/metrics.ts`, `pricing.ts`; metrics.yaml carries per-model/per-alias/per-role turns, tokens, priced + list cost, edits, test runs, `costPerMergedTask`. The i29 architect still lists R18–R23 as one open block; the instrumentation requirement itself is in. |
| R19 concurrency per provider, throttle, fallback | partial | overall + `perHarness` admission (`src/kernel/config.ts:129`, `src/kernel/dispatch.ts:449`), same-harness fallback chain and quota retry (`src/harness/fallback.ts`). No per-provider-per-model quota, no cross-harness ladder: `m6-provider-concurrency` pending. |
| R20 compaction | partial | compaction at session end (`src/kernel/flow.ts:522-527`, `src/kernel/boundary.ts:216-219`, `src/kernel/merge-attempt.ts:185-186`), omp cache retention `short` (`src/harness/omp/overlay.ts`), acpx `compact: none`. Cost/TTL/skip-not-resumed proof: `m6-compaction` pending. |
| R21 done sees open debt; summary shows distance | partial | `src/kernel/summary.ts` lists distance, parks, debt; done does not refuse open debt. `m6-done-distance`, `pm-store-debt` pending. |
| R22 agy task work through acpx | partial | agy leg merged; `src/cli/harnesses.ts` still names pi/codex/agy and `src/harness/acpx` branches on the agent id. `acpx-config-only`/`-land` pending. |
| R23 steers do not interrupt; PM/architect routing | partial | mailbox, holds, steer answers and expiry (`src/kernel/mailbox.ts`, `src/kernel/boundary.ts:251-301`), PM steer turns (`src/kernel/pm.ts`). `steer-pm-routing`, `pm-stall-resolve` pending (no PM auto-resolve of 0-merge stalls). |

## Intent sections beyond Phase 1

| INTENT section | State | Evidence / gap |
|---|---|---|
| Saga and hierarchy (subarchitects, epic plans, depth 2, IRC) | scaffolding only | `src/kernel/register.ts` is a pure parser/validator for `## Architect register` with depth-2 rules; nothing calls it from `boundary.ts`. No subarchitect launch, epic plan files, epic status or depth config. Phase 1 defers this by design. |
| Architect role: frontier model, double as reviewer of net changes, DAG/milestones, uncertainty callouts | built at prompt level | `prompts/architect.md`; per-iteration evaluation and relaunch debt review; plan markdown + PM. |
| Plan review by weaker model, architect marks helpful/unhelpful | not built | `m5-plan-review` pending. |
| Plan checker as task-level gatekeeper | not built | `m5-plan-checker` pending. |
| Escalation implementer tier (Sonnet class) | partial/broken | tier field and `escalateTo` exist, PM ladder works; i28 park `tier-escalation` shows the implement turn re-resolves the role and drops the task's alias/model (`flow-context.ts:271-293`, `flow.ts:151-162`, `agent.ts:120`). |
| Model diversity: different models per flow step, switch on retry | partial | steps carry only a role (`src/kernel/types.ts:123-128`); `FollowUp` supports same-session / de-novo / different-model (`types.ts:131-135`, `flow-context.ts:208-215`). No per-step model assignment and no retry-switch policy planned yet; the new INTENT section is not in the plan. |
| Consults batched at iteration boundary | effectively built | architect is consulted only at the boundary; no separate consult mechanism. |
| Context economy: session reuse, compaction, pack, PM | built (compaction proof pending) | as R13/R20; digest at relaunch (`src/kernel/digest.ts`). |
| Funnel, concerns, remarkable, calibration | built | concern kinds and calibration (`src/core/concern-types.ts`, `src/kernel/types.ts:21`), forwarded into pack (`context-pack.ts:136-148`), guaranteed summary + outbox (`summary.ts:105-181`). |
| Uncertainty and spikes | built | `kind: spike`, review-only flow, finishes without merge (`src/kernel/derive-task.ts:80-95`, `progress.ts:27`). |
| Stopping and debt | partial | stop decision and iteration/round bounds built; debt register in pack; done-refusal and distance pending (R21). |
| Steering and autonomy | partial | mailbox, holds, calibration presets; intent-change steer carried into intent + plan by the operator/PM prompt, not a dedicated agent; PM auto-resolve pending. |
| Status reporting and dashboard | text only | `factory status` prints derived state and park causes; no HTML/JSON dashboard or localhost server anywhere in `src`. |
| Clean code: gates, ADRs, interfaces | partial | gates built; ADR is one line in `prompts/architect.md` with no decision-record mechanism/kind; interface/implementation separation is convention; complexity/file size are not enforced by `biome.json`; `scripts/gates.sh` contains shell logic despite "zero real logic in sh". |
| Config-driven flows, roles, prompts, schemas | built | `config/process.yaml` (flows `implement-review`, `just-implement`, `spike`; roles), templates in `prompts/`, schemas via zod/`schema-check.ts`, pre-flight in `preflight.ts`. Only these task flows exist; no ingestion/QA/security-review/computer-use task types. |
| Review retries and follow-up options | built | `reviewRounds` (2 default), last round `changes` merges with concerns as debt (`derive-task.ts:427-450`), `FollowUp` modes. |
| Concurrency per subscription, dispatch fallback | partial | R19. |
| Harness agnosticism | partial | omp (RPC, compact, overlay, subagents), opencode, acpx (pi, codex, agy), fake; `src/cli/harnesses.ts`. Claude Code, listed in INTENT as supported/tested, is absent from the registry. agy is code-branched until `acpx-config-land`. Harness rotation is operator run configs (`bootstrap/run/self*.yaml`), not a kernel feature. |
| Session portability directional graph | built | `portable` in `src/harness/types.ts`; `resumeSessionFor` (`flow-context.ts:295`). |
| Compaction cost rules (cache TTL, never compact cold) | partial | end-of-session compaction and `cacheRetention: short`; no test of TTL/cold-session cost yet (`m6-compaction`). |
| omp subarchitect as defined, addressable agent | not built | no subarchitect exists; IRC/agent addressing not used by the kernel. |
| Git hygiene: mechanical commits, short hashes | built | commit records with edit/wall data (`src/kernel/record.ts`, `core/git/commit.ts`), per-task worktrees (`worktree.ts`), integration branch. |
| Git hygiene: cleanliness heuristic | not built | no unusual-file/large-file check found. |
| Orchestration artifact storage interface, 3 backends | partial | `ArtifactStore` interface with one `FolderStore` (`src/kernel/store.ts:64`); separate-repo and same-repo backends absent. |
| Bootstrap: self-run, digest, pinned last-good, promote, metrics, fixed benchmark | built except benchmark cadence | `bootstrap/RUN-SELF.md`, `promote.sh`, `digest.ts`, per-iteration metrics. Benchmark kit exists (`bootstrap/benchmark/README.md`, `reset.sh`, `run/benchmark.yaml`) but there is no evidence of the fixed benchmark being re-run per iteration; baselines are the archived v2 run. |
| Sandbox assumption documented | not built | no sandbox/bubblewrap doc in the repo; only a journal mention. |
| Delivery: plugin + "run factory" skill | not built | operator docs only: `plugins/software-factory/README.md`, `bootstrap/RUN-SELF.md`; repo `skills/` contains an unrelated omp workflow skill. |
| omp key rotation / auto fallback | not in kernel | No key rotation or provider-key config in the kernel or run configs; fallbacks are model-level chains. omp may rotate provider keys internally. |
| Stack: TypeScript, linted, autoformatted, complexity/file-size, interfaces split | partial | TypeScript + Biome + gates; complexity/file-size not configured; interface split by convention. |

## Recent owner INTENT edits and their build impact

Three owner commits at 2026-11-15 (`f6a4ca9`, `c2da999`, `d63b1f9`, synced as `4fea0ec`):

- New **Model diversity level**: different models per step in one flow, switch model on retry, especially when the same multi-model harness can reuse the compacted transcript. Not planned or built beyond `FollowUp.different-model`; the i28 architect explicitly did not reroute planning for the new sections.
- **Role of agents/models** completed: frontier architect, saga via subarchitects, architect as reviewer of net changes, PM ownership, task-level roster, config-driven task types, merge agent, plan checker, triage. Aligns with existing prompt/config structure; subarchitect pieces remain future work.
- **acpx as the agnosticism enabler**: "an acpx-compatible harness can be added by config, no code". The code still branches on agent ids; `acpx-config-only` is the pending task.
- **omp auto rotation / auto fallback** for the two OpenCode Go keys. Single-key config today; not in the plan.

## Current friction (from the record)

- 15 pending, 32 cumulative parks. Three finished branches (`acpx-config-only`, `fake-script-keyed-merge`, `continuation-conflict-land`) parked i29 as `empty-diff` after a red check, then a no-change fix turn; `gate-flake-rerun` (i29) addresses the flake half, `checks-prune-land` the fix-round half.
- `checks-prune` has one deterministic red: a reviewer render outside `promptVars` misses the newly required `fix_dispositions` variable.
- Architect cost dominates: i29 $1.534 of $1.66; average $0.54 per merged task across the run.
- Load-sensitive tests remain: `dispatch admission` overlap window, `shakedown` ref-move window.
- Kept branches conflict with each move of the integration head. The resolve-in-first-turn change is committed on `factory-task/self/continuation-conflict` (379b8b9) but unmerged; i28 and i29 continuations both parked `empty-diff` after red checks. It needs the `continuation-conflict-land` no-base task plus a pin advance to take effect.

# Built vs INTENT — 2026-11-15 (after iteration 30)

Read-only assessment of `INTENT.md` against code at `main` `9fdac7e` and the self-run record.
Status is not kept here: iteration summaries, records and the plan in
`~/aiexp/agentic-swarm.wt/v3/.factory/artifacts/self/` are authoritative.
Code links are relative to the repo root, under `plugins/software-factory/` unless stated.

## Snapshot

- 30 self-run iterations, 416 turns, 100 merged tasks, 33 parks, 6 unstarted pending.
- Cumulative cost $50.25 priced ($70.01 at list prices); architect $39.56 = 78.7% over 30 launches.
  Iteration 30: 12 merged, $3.05, $0.254 per merged task, architect $2.06.
- Iteration 30 landed 12 tasks: acpx-config-land, fake-script-keyed-ship, continuation-conflict-ship,
  m4-trivial-session, flake-fix, validate-cmd, checks-prune-land, m4-standalone-upscope, pm-store-debt,
  m6-compaction, m6-done-distance, steer-pm-routing. Suite on this HEAD: 722 pass / 4 skip / 0 fail
  (726 tests, 103 files).
- Running pin `46b3f07` (iteration 30); `main` `9fdac7e` adds only run-config fallbacks.
- Operator goal `p1-trivial` completed: class `trivial`, `caps-fork-prune` implemented in the front's own
  session `01a1e101…` (R7 evidence), merged `f856fa0`, `goal-met`, no architect turn.
- Kernel: ~20.0k source lines, 75 kernel test files; single-level (one architect turn per iteration).

## Phase 1 requirements (Phase1.md)

| R | Status | Evidence / remaining gap |
|---|---|---|
| R1 stop in the middle, relaunch keeps going | built | i30 was SIGINT-interrupted mid-dispatch and relaunched with no new architect/digest; 3 interrupted turns closed `infra:crash` and re-dispatched ([resume-iteration.test.ts](plugins/software-factory/test/kernel/resume-iteration.test.ts), journal i30). Recovery re-runs whole turns; that is coarse but bounded. |
| R2 unresumable session logged + de novo, every harness | built | de-novo retry on resume death ([flow-context.ts:471](plugins/software-factory/src/kernel/flow-context.ts), `resume-hard-death`); `portable()` still only same-harness. |
| R3 bounded work, drain on budget | built | limits, signal drain, repair cap, per-item budget (`REPAIR_TURNS=3`, [agent.ts:73](plugins/software-factory/src/kernel/agent.ts)); [budget-drain.test.ts](plugins/software-factory/test/kernel/budget-drain.test.ts). |
| R4 2026-11-13 high-severity defects fixed with regression tests | built | M1 repros merged ([repro-e1.test.ts](plugins/software-factory/test/kernel/repro-e1.test.ts), [repro-e4.test.ts](plugins/software-factory/test/kernel/repro-e4.test.ts), [gate-export.test.ts](plugins/software-factory/test/kernel/gate-export.test.ts)). |
| R5 kernel ensures every agent delivers | built | delivery guard + repair template; 13 outcome-repair turns used in i30. |
| R6 no value-less mechanical checks | partial | A no-change fix round answering a `changes` review now defers to review, but a fix round that changes nothing after red checks still parks `empty-diff` ([derive-task.ts:464](plugins/software-factory/src/kernel/derive-task.ts), [derive-task.test.ts:133](plugins/software-factory/test/kernel/derive-task.test.ts)). |
| R7 trivial implements in the classifier's session | built | trivial implement turn resolves the front session ([flow-context.ts:471](plugins/software-factory/src/kernel/flow-context.ts), [flow.ts:526](plugins/software-factory/src/kernel/flow.ts)); tests [front-handoff.test.ts:107](plugins/software-factory/test/kernel/front-handoff.test.ts). Live proof: `p1-trivial` reused session `01a1e101…`, merged `f856fa0`, `goal-met`, no architect. |
| R8 standalone task upscales to bigger | built | review `upscope: yes` parks and rewrites front class to `bigger` ([flow.ts:327](plugins/software-factory/src/kernel/flow.ts)); [flow.test.ts:1219](plugins/software-factory/test/kernel/flow.test.ts). |
| R9 scope is an area, not a fence | built | [scope.md:1](plugins/software-factory/prompts/scope.md); no file-list enforcement. |
| R10 end-of-wave steward, kept-land, relaunch on new head | not built | Only per-task merge ([integrate.ts](plugins/software-factory/src/kernel/integrate.ts)). `m5-kept-land` was parked `empty-diff` in i30, so “a complete green kept branch lands without a new task” does not exist; no steward; continuation base-sync is the only relaunch piece that landed. |
| R11 plan checker before the architect, with repeat | not built | `boundary.ts` runs architect then PM with no checker step; `m5-plan-checker` pending. |
| R12 architect evaluates the project and plans the road | built | [architect.md](plugins/software-factory/prompts/architect.md); `m5-architect-horizon` merged i23. |
| R13 context pack is an uncapped index | built | [context-pack.ts](plugins/software-factory/src/kernel/context-pack.ts); `pack-uncap` merged i22. |
| R14 task-tier plan review, advisory, sampled | not built | No plan-review step or prompt; `m5-plan-review` pending. |
| R15 prompts from one templating source, debloated | partial | LiquidJS and shared partials are built, but the outcome shape, flow names and alias names are retyped in prompt text, rules are duplicated ([scope.md:1](plugins/software-factory/prompts/scope.md)), and the reviewer does not include the author prompt whole. |
| R16 validation command for schema-controlled files | built | absolute `validate_cmd` resolved per launch ([prompts.ts:249](plugins/software-factory/src/kernel/prompts.ts)), `factory validate` ([commands.ts:173](plugins/software-factory/src/cli/commands.ts)), schema gate ([schema-check.ts](plugins/software-factory/src/schema-check.ts)). |
| R17 kernel applies clean code to itself | built | typecheck, tests, format, lint, schema-validation in [gates.sh](plugins/software-factory/scripts/gates.sh). Stack thresholds are not lint-enforced (see below). |
| R18 cost and work per model | built | per-model/alias/role turns, tokens, priced+list cost, edits, test runs in `metrics.yaml` ([metrics.ts](plugins/software-factory/src/kernel/metrics.ts)). |
| R19 concurrency per provider, throttle, fallback | partial | admission is overall + per-harness ([dispatch.ts:450](plugins/software-factory/src/kernel/dispatch.ts)); fallbacks are same-harness model ids ([agent.ts:228](plugins/software-factory/src/kernel/agent.ts), [preflight-aliases.ts:162](plugins/software-factory/src/kernel/preflight-aliases.ts)), no cross-harness ladder; `m6-provider-concurrency` pending. |
| R20 compaction works as cost and context control | partial | compaction at session end for omp/opencode ([flow.ts:631](plugins/software-factory/src/kernel/flow.ts), [boundary.ts:311](plugins/software-factory/src/kernel/boundary.ts)); acpx declares `compact: "none"` ([acpx/harness.ts:40](plugins/software-factory/src/harness/acpx/harness.ts)); cache TTLs hardcoded ([sessions.ts:21](plugins/software-factory/src/kernel/sessions.ts)). |
| R21 done sees open debt; distance in every summary | built | done refused while debt is open ([derive.ts:129](plugins/software-factory/src/kernel/derive.ts)); Distance section ([summary.ts:254](plugins/software-factory/src/kernel/summary.ts)). Closure is still by `debt closed:` text. |
| R22 agy task-level work through acpx | built mechanism | acpx is now fully config-driven: no agent union or per-agent branches ([acpx/types.ts](plugins/software-factory/src/harness/acpx/types.ts), [turn.ts:41](plugins/software-factory/src/harness/acpx/turn.ts)), harnesses come from run config ([harnesses.ts:36](plugins/software-factory/src/cli/harnesses.ts)). No live agy task turn exists in the records (all self-run turns are omp/opencode). |
| R23 steers don't interrupt; PM/architect routing; stall only on lost value | partial | PM routing, task/spike auto-answer, holds and expiry are built ([pm.ts:634](plugins/software-factory/src/kernel/pm.ts), [boundary.ts:220](plugins/software-factory/src/kernel/boundary.ts)); no PM auto-resolve of a 0-merge stall (`pm-stall-resolve` pending). |

## What is being built now

Six tasks are unstarted in the plan; three name the parked `m5-kept-land` as a dependency:

| Task | Requirement | Depends on |
|---|---|---|
| `m5-kept-land` | R10 | — (parked empty-diff i30; no continuation yet) |
| `m5-plan-checker` | R11 | steer-pm-routing, m3-debloat-land, **m5-kept-land** |
| `m5-steward` | R10 | …, **m5-kept-land** |
| `pm-stall-resolve` | R23/R5 | …, **m5-kept-land** |
| `m5-plan-review` | R14 | m5-plan-checker |
| `m6-provider-concurrency` | R19 | …, pm-stall-resolve |
| `resume-repair` | R1/R2 | m5-plan-checker, pm-stall-resolve |

Operator goals: `p1-trivial` is live (implement done, awaiting checks/merge); `p1-task` (standalone-task
evidence) has not launched.

## INTENT beyond Phase 1

| Area | State | Evidence / gap |
|---|---|---|
| Saga and hierarchy | absent | [register.ts](plugins/software-factory/src/kernel/register.ts) parses an architect register to depth 2 but is unreachable ([reachability.test.ts:13](plugins/software-factory/test/reachability.test.ts)); no subarchitect launch, epic plan, depth config or upward brief. |
| Model diversity per flow step | partial | Flows are config data and roles map to aliases, but a step carries only a role ([types.ts:142](plugins/software-factory/src/kernel/types.ts)); the retry switch is de-novo, not on the compacted transcript ([flow-context.ts:446](plugins/software-factory/src/kernel/flow-context.ts)). |
| Config: three layers, no model in code | partial | Run config still mixes aliases, prices, limits, sessions and paths ([config.ts:145](plugins/software-factory/src/kernel/config.ts)); no opaque per-harness options in the alias; roles default to alias names ([flow-context.ts:242](plugins/software-factory/src/kernel/flow-context.ts)); task type is a hardcoded `task|spike` ([types.ts:59](plugins/software-factory/src/kernel/types.ts)); `effort: highest` is still resolved ([preflight-aliases.ts:100](plugins/software-factory/src/kernel/preflight-aliases.ts)); omp fixes `defaultThinkingLevel: "low"` ([overlay.ts:32](plugins/software-factory/src/harness/omp/overlay.ts)); prices remain a hand-typed table ([pricing.ts](plugins/software-factory/src/kernel/pricing.ts)). |
| Harness agnosticism | partial | acpx config-only is built; Claude Code is absent from the registry; OpenCode remains a bespoke CLI adapter, 864 lines across [src/harness/opencode/](plugins/software-factory/src/harness/opencode/harness.ts); portability is `from === to` ([types.ts:126](plugins/software-factory/src/harness/types.ts)); no live harness rotation in i30. |
| Context economy | partial | Same-session reuse and compaction for omp/opencode; acpx never compacts; cache TTLs not config; digest on relaunch built. |
| Funnel and concerns | partial | Concerns, remarkables and calibration are built; concerns have no id ([types.ts:17](plugins/software-factory/src/kernel/types.ts)), steer and debt closure parse text prefixes ([summary.ts:175](plugins/software-factory/src/kernel/summary.ts)). |
| Schemas and structured output | partial | Fixed kernel schemas for outcome/class/config; task frontmatter is hand-parsed ([tasks.ts:34](plugins/software-factory/src/kernel/tasks.ts)); no JSON Schema export, no working LSP config; `.omp/lsp.json` is untracked and maps nonexistent files. |
| Prompts | partial | LiquidJS + partials; reviewer is 3.4 KB and shares only the four partials ([reviewer.md](plugins/software-factory/prompts/reviewer.md)); rules duplicated across prompts; no duplicate-fragment linter; dead prompt API kept by tests. |
| Dashboard and status | absent | `factory status` prints text ([commands.ts:102](plugins/software-factory/src/cli/commands.ts)); no HTML/JSON artifact or localhost server. |
| Steering and autonomy | partial | Mailbox, routing, holds, expiry built; no intent-change agent; no autonomous/principal/detailed presets (one free-text `calibration`, [config.ts:89](plugins/software-factory/src/kernel/config.ts)); PM stall pending. |
| Stopping and debt | partial | Done refuses open debt; the architect prompt carries stop criteria; debt has no id and closure is textual. |
| Storage backends | partial | Only `FolderStore` ([store.ts:64](plugins/software-factory/src/kernel/store.ts)); the artifact interface exposes filesystem directories, so a GitHub/separate-repo backend cannot implement it. |
| Stack and lint | absent | Biome recommended preset has no complexity/file-size rule; largest modules `flow.ts` 852, `worktree.ts` 784 lines; [gates.sh](plugins/software-factory/scripts/gates.sh) is 80 lines of shell logic. |
| Bootstrap and delivery | partial | Pinned build, promotion, gates and metric per iteration built; benchmark not re-run; no sandbox document; no “run factory” skill. |
| Git hygiene | absent | No cleanliness heuristic for large/unusual files; `.gitignore` is the only floor. |

## Fixed since the i29 concerns register

- Trivial goals reuse the front session (R7): [flow.ts:526](plugins/software-factory/src/kernel/flow.ts); live in `p1-trivial`.
- Standalone tasks upscope to the architect (R8): [flow.ts:327](plugins/software-factory/src/kernel/flow.ts).
- The `empty-diff` loop is narrowed for review-answer fix rounds, not removed for red-check no-ops (R6).
- acpx is config-driven; adding an acpx harness no longer needs a code branch (R22).
- `factory validate` is an absolute rendered command, not a bare name (R16).
- Done refuses open debt and summaries open with the distance (R21); compaction timing/cost is tested (R20, omp/opencode only).
- Steer routing to PM/architect, task/spike auto-answers and expiry are built and tested (R23).

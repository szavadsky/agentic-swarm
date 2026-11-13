# Bootstrap log

Append-only. Two parts: **Decisions** (rebuttable by practice — overturn by adding a dated entry, never by editing history) and **Journal** (one entry per build step / launch). Authority order: `manifesto.md` Intent > owner steering in chat/mailbox > this log > `manifesto.advice.md`.

## Decisions

| # | Date | Decision | Why | Rebut when |
|---|---|---|---|---|
| D1 | 2026-11-12 | Rebuild the core in place: branch `factory-v3` of `plugins/software-factory` (worktree `../agentic-swarm.wt/v3`; the owner's `main` checkout is not switched). Rejected modules (`core/flows/*`, `core/plan/*`, `core/artifacts.ts`, `config/schemas/*`, old step prompts, coupled tests) are deleted first; the new core in `src/kernel/` imports the kept leaf modules (git, proc/mutex/journal, harness, checks runner, prompts partials, concerns, budget, mailbox). No new package, no copies, no shims; v2 stays readable via `git show main:<path>`. | Honors advice:56 (in place, on a branch) and the manifesto (design rejected, components reusable) at once. The target core (pure `derive`/`next`, one step-outcome record, advice:186-208) replaces `flows/*` + `plan/*` (~7k LOC); patching 12 architect call sites inside a 4k-line file (advice:78) is the part cheap models do worst and the part that would be deleted anyway. Deleting first keeps cheap implementers from imitating rejected code and makes the suite fast. | A v2 flow module turns out to be cheaper to patch than to replace → restore it from `main` and patch (advice §3 gives the call sites). |
| D2 | 2026-11-12 | Kernel-0 is a walking skeleton of the whole loop, thin at every stage (see `KERNEL0.md`). Escalation-ladder trivial/task paths, advisory plan review, hierarchy level 2, hygiene check, mid-run mailbox + PM steer structuring, extra storage backends, cross-harness fallback are built by the factory on itself. | Manifesto bootstrap rule: the factory is built by running itself; earliest honest self-run gives the earliest evidence. | Factory cannot make progress on itself because a deferred piece is missing → lift that piece into the kernel by hand, log it as a human intervention. |
| D3 | 2026-11-12 | Kernel-0 is built by foreman `task` agents that drive OpenCode free models for implementation and verify/repair the result themselves. Every free-model attempt is recorded (model, task size, outcome) in the Journal. | Owner preference (free models first); produces the "promote on measured failure" evidence before the factory exists. | Two consecutive free-model failures on the same slice → foreman implements directly; record it. |
| D4 | 2026-11-12 | Shakedown launches use a toy goal and a free model in the architect alias; Opus is used only once plumbing is proven by a green shakedown. | Architect tier is ~50x; plumbing bugs must not be paid for at that rate. | Free model cannot produce a usable plan at all → use the cheapest paid capable model for shakedown. |
| D5 | 2026-11-12 | Orchestrator artifacts live in `bootstrap/` (tracked): `README.md` handoff + runbook, `KERNEL0.md` initial intent, `LOG.md`, `context/*.md` scout briefs. Factory runtime artifacts follow the manifesto (plain folder, gitignored; sessions outside git). | The session will continue as a task-grade agent; state must be on disk, small, and ordered by authority. | — |
| D6 | 2026-11-12 | Kernel-0 gets every outcome as a file the agent writes at a path named in the prompt, same for all harnesses; fallback is a fenced block in the final message. Native structured output (omp `yield`, Claude Code, Codex) is backlog. | OpenCode 2.2.7 has no schema output (`context/opencode-probe.md` §5); one mechanism keeps flows free of harness branches. | Free models miss the file in more than ~1 of 10 turns → add the native path where `Caps` offers it. |
| D7 | 2026-11-12 | omp adapter drives one RPC process per turn (`--mode rpc`): prompt, read usage, explicit `compact` before exit when asked. Overlay per launch: `cacheRetention: short`, memory off, auto-learn off. | Verified: RPC resume + compact work, auto-compaction does not fire under RPC (`context/omp-probe.md`). | — |
| D8 | 2026-11-12 | Free-tier quota errors (`provider.free-limit`, HTTP 429, retry-after ~24 h but often passing a minute later) are `infra: quota`: retried, never charged to the item budget. Run-config aliases carry a fallback chain: OpenCode free → OpenCode Go subscription → Alibaba token plan (all zero marginal cost), paid tiers last. | Both probes hit the 429 intermittently. | Chain exhausts during a launch → drain and exit with a remarkable; do not silently wait. |
| D9 | 2026-11-12 | The self-run targets the `factory-v3` worktree; each goal has its own integration branch; the orchestrator merges it into `factory-v3` after independent verification, then promotes. Promotion is a bootstrap script (`bootstrap/promote.sh`), not a factory feature. | Pinned self-execution exists only because the factory edits itself; other target repositories never need it. | — |

## Open for the owner

Non-blocking; the stated assumption is in force until overruled.

- **Core rebuilt, not patched** (D1). The advice (56, 78) patches twelve architect call sites inside v2's flow modules; D1 deletes those modules and writes a small pure core on the kept leaf modules, still in place on a branch.
- **Architect spend bound for self-runs.** Assumption: one iteration per launch, one architect launch per iteration, stop and ask if a single launch's architect cost exceeds $5 (v2's largest single plan call was $2.86).
- **Benchmark goal.** Assumption: the smallest v2 baseline under `plugins/software-factory/docs/runs` that still exercises review and merge; chosen by a scout before phase D.
- **Superseded root documents** (`docs/adr/`, `docs/factory.v2.md`, `docs/dev-process.md`, `plugins/software-builder/`). Assumption: removed by a factory task at phase E, visible in the merge to `main` for the owner to veto.

## Owner steering

Verbatim, newest last; each with what it changed.

- 2026-11-12 (task statement): "convert manifesto.md (and advisory only manifesto.advice.md) to a working, tested during bootstrapping, usage and ideology (based on manifesto) documented system. Use opencode cli with free models (preferable) or task subagents to prepare for first bootstrap step, meanwhile define intent for initial implementation, then manifesto +- small changes become intent; keep babysitting iterations of bootstrapping. Note: at some point this session will be converted to task grade agent, so think and create artifacts (rebuttable by practice) now; collect context using subagents." → `README.md`, `KERNEL0.md`, D1–D9.
- 2026-11-12 (mid-build): "free model (deepseek v41 etc) are exactly same model that your task subagent is, just different billing. next task: assignment in file, launch cli see what will happen" → D10: the foreman layer of D3 is dropped. A slice is an assignment file under `bootstrap/assignments/`, executed directly by the OpenCode CLI on a free model (`opencode/deepseek-v4.1-flash-free#max`; on quota or context trouble `opencode-go/deepseek-v4.1-flash#max`), which reports into `bootstrap/reports/`. The orchestrator checks the stated acceptance itself and journals what happened. Event logs go to `~/.local/share/factory/bootstrap-runs/` (never git).

## Journal

### 2026-11-12 — context collection
- Scout briefs written: `context/repo-map.md` (v2 inventory, reuse classification, failure modes), `context/advice-digest.md` (build order A1–E2, technical recommendations, advice-vs-intent conflicts X1–X10), `context/opencode-probe.md`, `context/omp-probe.md`.
- Finding: `manifesto.md` has no `[REVIEW Mn]` / U / O labels; the N1–N19 decision log (`manifesto.md:145-200`) is the record of owner decisions. All items decided.

### 2026-11-12 — slice P (prune + contract) — done
- Commits `e5b41c4`, `1f80533`, `39cc69d` on `factory-v3`. src 26,059 → 8,964 LOC (90 → 50 files); tests 36,641 → 5,020 LOC, 700 tests / 154 s → 188 tests / 15 s; typecheck green.
- Deleted beyond the KERNEL0 list: `derive/*`, `triage`, `review-policy`, `sessions`, budget disk-scan, `concerns.reconcile` (all bound to v2 record shapes), `docs/OMP_ADAPTER.md`.
- `src/harness/types.ts` is the contract; `ModelRef = { id, effort? }` was invented there (the advice leaves it undefined). Fake harness is queue-scripted with file side effects and every stop kind.
- Free models: not used (judgement-heavy deletion).
- Stale by design until later slices: `docs/runs` and `.omp/lsp.json` reference deleted paths; `skills/factory-run-target`, `agents/skills/factory-selfhost` describe the v2 CLI.

### 2026-11-12 — slices S0 (skeleton, `factory-v3`) and S1 (harness adapters, `factory-v3-s1` in `../agentic-swarm.wt/s1`) — started in parallel
- S1 owns `src/harness/**`; S0 owns kernel, CLI, prompts, config. Contract additions announced to both: `TurnResult.model` (actual model), `TurnRequest.fallbacks`.
- Prompt drafts being written to `bootstrap/drafts/prompts/` with a free-model advisory review per prompt.

### 2026-11-12 — prompt drafts — done
- `bootstrap/drafts/prompts/`: `architect` (92 lines), `pm`, `implementer`, `reviewer`, `digest` (37–43 lines each), partials `_outcome`, `_calibration`, `_clean-code`, `VARIABLES.md` (inputs the kernel must supply, e.g. `baseline_checks`, `turn = first | relaunch | boundary`), `REVIEW.md`.
- Orchestrator review of `architect.md` applied: stop-decision order, once-per-iteration consult, cheap-recipient rule, architect-named immutable slugs, parked work continued only through a new slug with `base`, alias `escalation` instead of a model name, hierarchy text removed until the mechanism exists.
- Evidence for "weaker reviews stronger" (manifesto §Model economics; advice §8 S2): `opencode/minimax-m3.1-flash-free` reviewed each prompt from the recipient's seat; all five reviews produced accepted changes (24 findings changed the drafts, 1 ignored on fact), zero cost, no 429.

### 2026-11-12 — benchmark goal chosen (`context/benchmark.md`)
- Benchmark = v2's `omp-workspaces` goal verbatim: target is this repository at `572a6e0` plus the archived INTENT, iteration limit 1; 10 tasks in 3 waves. `modernize` rejected as a benchmark (50 items, 60 h, $13.2, red gates, network downloads).
- v2 baseline: 13 architect launches of 45; architect share 14.3% ($0.299 of $2.084); $0.417 per merged task (5 of 10 merged). v2 never recorded loop incidents or human interventions — journal proxies only.
- Reset recipe verified in `/tmp` (archive at `572a6e0`, offline install, typecheck green, v2 suite 664 pass / 160 s). This settles the "Benchmark goal" item under Open for the owner unless overruled.

### 2026-11-12 — slice S1 (harness adapters) — done on `factory-v3-s1`, not merged yet
- Commits `c45ced1`, `c7ff9ba`, `a74fbde`, `b35a6e6`. omp adapter 1,403 LOC (RPC per turn, explicit compact, overlay, subagent pin), opencode adapter 694 LOC, one retry + fallback policy; 193 tests pass, 2 live smokes opt-in.
- Live smokes, zero cost: omp 22.6 s (resume, compact, outcome file outside cwd, subagent ran on the pinned model); opencode 36.6 s (resume, export, compact, outcome file outside cwd). Usage shows cache reads on both.
- Contract: `TurnResult.model` required (model actually used), `TurnResult.attempts` optional (every retry/fallback hop), `TurnRequest.fallbacks` optional.
- Free-tier evidence: `opencode/longcat-2.5-free` returned `provider.free-limit` 429 three times in a row in the smoke and once mid-task for the foreman's one free-model attempt (discarded); `opencode/beam-free` served the fallback. Free quota is unreliable under load — fallbacks are not optional.
- Open risks handed to later slices: (1) persisting partial usage on SIGTERM needs a kernel hook; (2) opencode streams nothing during a long tool call, so idle timeouts must be sized for tool duration; (3) omp subagent usage is read from child session files — token counts exclude children provably, cost double-count unverified; (4) opencode has no system-prompt flag: `system` is prepended to the first prompt of a de-novo session.

### 2026-11-12 — first CLI dispatch (D10): assignment `DOC1` (ideology document)
- `bootstrap/dispatch.sh DOC1` → `opencode run` on `opencode/deepseek-v4.1-flash-free#max` in worktree `../doc1`. Chosen as the first file-assigned task because it needs nothing from the slices still in flight. S2–S4 assignments are written and go out the same way once S0 lands.

### 2026-11-12 — slice S0 (skeleton) — done; S1 merged into `factory-v3`
- S0 commits `9f841d4` … `8cd6d1a`; merge `2e23d8f`. Kernel 2,742 LOC in 21 files (largest 239 lines) — above the ~1.5k guess in KERNEL0; accepted: each stage is real and files follow the seams of the next slices. Suite after merge: 243 pass / 2 live-skipped / 0 fail in 21 s; typecheck green.
- Scenario 1 green twice on fresh repos, including "delete everything but `tasks/` and `records/` → same derived state".
- Deviations accepted: `Action` gains `park` and `finish`; records carry `actor`, `ok`, `cause`, `base`, `taskHash`; `alias`/`model` only on agent records.
- Merge needed one manual fix (human intervention 1 of the build): `package.json` conflict (ajv dropped by S1, zod added by S0) and `fallbacks: string[]` vs `ModelRef[]` in `kernel/agent.ts`.
- Free-model attempt inside S0: `opencode/longcat-2.5-free` wrote `store.ts` + its test in 467 s; accepted after fixes (wrong import paths, a wrong assumption about a return value), then hit the free usage limit before it could repair.

### 2026-11-12 — CLI dispatch of S2, S3, S4 (D10)
- Same model on two billing paths, to compare: S2 and S4 on `opencode/deepseek-v4.1-flash-free#max` (free tier, 200k context), S3 on `alibaba-token-plan/deepseek-v4.1-flash#max` (plan quota, 1M context). DOC1 already running on the free tier.

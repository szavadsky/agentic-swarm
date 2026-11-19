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
| D11 | 2026-11-12 | A reviewer sees the artifact, never how it was written: different model, clean worktree, review assignment in a file. Same-model same-session self-review does not count as a review round. | DOC1R evidence: a different free model checked 117 references and found 10 citation failures and 3 coverage gaps the writer never saw. | — |
| D12 | 2026-11-12 | Review tier is `opencode-go/muse-spark-1.3-contributor` (heavily subsidized on the contributor tier; sits alongside deepseek implementers). Free flash models (`-free`: deepseek, glm, mimo, minimax) are free only through OpenCode and rate-limited — run-config aliases and pre-flight treat the free tier as opencode-only, with the same model on the contributor plan as fallback. | Owner steer; both probes hit `provider.free-limit` 429s under load. | A cheaper equally-strong reviewer is measured on the review task → replace. |
| D13 | 2026-11-12 | Implementer/planner free models: `deepseek-v4.1-flash` and `minimax-m3.1-flash` families (free tier first, contributor plan as fallback). `longcat-2.5-free` is dropped as implementer — usable only as a "different model" reviewer or for mechanical pieces. Prompt-review evidence stands: minimax 5/5 useful, DOC1R 10/117 bad citations found. | Owner judgement; longcat is not a good coding model. | A measured benchmark overturns it. |
| D14 | 2026-11-12 | At most one OpenCode free-tier run at a time: `dispatch.sh` takes an `flock` slot for any `opencode/*-free*` or `big-pickle` model (queued runs wait on the lock instead of racing). Contributor/plan/subscription models are not slot-limited. | Owner steer; free-tier 429s correlate with concurrent load. | Sustained measurement shows 2 concurrent free runs stay clean → widen the slot to 2. |
| D15 | 2026-11-12 | Mechanical tier is `opencode-go/beam-free` (fastest smoke: 15 s, 1M ctx): lint-class fixes, report formatting, reference audits, replaying a dispatch script. Never an implementer or planner. | Owner steer; matches opencode-probe §7 "reviewer/fast" ranking for that lane. | A mechanical job beam mishandles twice → promote that job class to a flash model. |
| D16 | 2026-11-12 | Allowed billable models, value-for-money only. opencode-go (10x deepseek subsidy): `deepseek-v4.1-flash`, `muse-spark-1.3-contributor`, plus free models (`beam-free` etc.) — nothing else. alibaba-token-plan (no subsidy): only `qwen4-max-preview` (omp-only id, verified working, 1M ctx) — nothing else there, and never via the opencode CLI (its catalog lacks the id). Fallback order everywhere: free tier → opencode-go subsidy → qwen4-max-preview only when nothing subsidized fits. | Owner steer. | Subsidy landscape changes → re-map. |
| D17 | 2026-11-12 | Final model allowlist (supersedes the model lists in D12/D13/D15/D16, keeps their lanes). opencode-go: `deepseek-v4.1-flash#max`, `muse-spark-1.3-contributor` at highest per harness (`:max` on omp — verified live; `#xhigh` on opencode — `#max` rejected; codex unverified), `beam-free` (mechanical, no variant needed) — and NOTHING else, explicitly not `minimax-m3.1-flash`. opencode free tier: `deepseek-v4.1-flash-free#max`, `minimax-m3.1-flash-free#max`, `glm-5.3-flash-free#max`, `mimo-v2.6-flash-free` — and NOT `longcat-2.5-free` anywhere. alibaba (omp only): `qwen4-max-preview#xhigh` (= highest). Everything billable runs at its highest available level. Self-improvement runs must additionally cover: codex via opencode-go (muse + deepseek) and Claude via omp (opus architects, sonnet escalation) once ready. | Owner steer. | Catalog or subsidy change → re-verify variants, re-map. |
| D18 | 2026-11-12 | Harness lanes (manifesto, owner-authored): pi = task-flow implementer; omp/OpenCode = spikes (subagent expansion); omp = structured output in the orchestration folder with YAML/JSON LSP; codex via Go (muse/deepseek) + Claude via omp (Opus/Sonnet) legs in self-improvement runs. pi and codex adapters do not exist in kernel-0 → factory backlog for the self-run (pi probe brief first). Bootstrap runs rotate harnesses across iterations. | Owner steer; pi verified installed (omp-family CLI: `--mode rpc/json/text`, sessions). | Measured harness fit overturns a lane. |
| D19 | 2026-11-12 | Adapter policy (manifesto): custom adapter only when the harness offers substantially more than ACP (omp: RPC, yield, compaction, overlays). pi/codex go through acpx or plain ACP — no bespoke CLI wrappers. Kernel-0's custom opencode CLI adapter is grandfathered (it predates the policy and carries session export + compaction the protocol path hasn't proven); the self-run may replace it with acpx on measured parity. | Owner steer. | acpx proves insufficient for a harness → custom adapter with the measured gap named. |

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
- 2026-11-12 (session downgrade + schedule): "this session has been switched to task level model. opus / claude models no longer available till 5h claude expiry window at midnight. you can continue bootstrep preparation, use reviwer (would be muse, quite a smart model but not an opus), and simply wait being blocked by a task and launch first bootstapping step at midnight" → preparation continues on free/subscription models only (no Claude anywhere until the window); review work goes to Muse (D12); the first self-run launch waits for the Opus window at 2026-11-13 00:00 EST, and only after a green shakedown.
- 2026-11-12 (reviewer model): "opencode-go muse-spark-1.3-contributor - hevily susidized by open code/contributor tier and make it perfect fit alongside deepseek. Deepseek and several good models (flash: glm/deepseek/mimo/minimax are available only through open code for free, but some rate limits)" → D12: review tier is `opencode-go/muse-spark-1.3-contributor`; the free tier is opencode-only with rate limits, so fallback chains name the same model on the contributor plan.

- 2026-11-12 (free-model roles): "I believbe longcat-2.5-free is not a good coding model. migh be ok \"different model reviwer\" deepseek v4.1 and minimal 3.1 flash are good" → D13: deepseek-v4.1-flash and minimax-m3.1-flash become the free implementer/planner models; longcat-2.5-free is reviewer/mechanical only; opencode-probe's "longcat = implementer" recommendation is superseded.

- 2026-11-12 (free-tier concurrency): "limit concurrency with free models to avoid 429" → D14: one free-tier slot in `dispatch.sh` via `flock`; extra free-tier dispatches queue behind it. Subscription/plan models unaffected.

- 2026-11-12 (mechanical tier): "beam-free is perfect for mechanical (through open code go)" → D15: `opencode-go/beam-free` is the mechanical tier; `longcat-2.5-free` keeps the different-model-reviewer lane only.

- 2026-11-12 (provider value): "do not use alibaba token plan expept qwen4 max. Open code go provide 10x subsidy on deepseek, alibaba - no subsidy. in open go use only only deepseel v41 and muse 1.3 contributor + free models, no others ar evalue for money" → D16: opencode-go = deepseek-v4.1 + muse-1.3-contributor + free only; alibaba = `qwen3.8-max` only (no qwen4 id exists). All three run configs rewritten: alibaba fallbacks dropped; `shakedown-plan.yaml` primaries are now opencode-go deepseek/beam with cross-fallbacks.

- 2026-11-12 (qwen4 id): "alibaba-token-plan/qwen4-max-preview in omp only, works" → D16 corrected: the alibaba flagship is `qwen4-max-preview`, reachable only through omp (verified: catalog entry + `QWEN4_OK` reply in 25 s); the opencode CLI catalog has no `qwen4*` id and rejects it. My earlier `qwen3.8-max` reading was wrong. Lesson: omp and opencode catalogs differ — verify a model id on the harness that will run it.
- 2026-11-12 (model allowlist): "Do not use: opencode-go/minimax-m3.1-flash, use opencode-go/muse-spark-1.3-contributor:max, use muse/deepseek/glm/miminax and qwen4 only on highest available level (max for muse and deepseek), do not use opencode/longcat-2.5-free; reviwer agent is already configured. restate models you will configure. Make sure subsequent self improvement run include codex (open code go: muse/deepseek) and claude (opus/sonnet as architects/escalation) when will ne ready" → D17: hard allowlist (muse/deepseek/glm/minimax/qwen4 at highest level; muse: `:max` on omp (verified live), `#xhigh` on opencode (`#max` rejected), codex unverified; mimo has no variants); longcat and go-minimax banned; reviewer agent left as configured; future self-improvement runs must span codex (go muse/deepseek) + Claude (opus/sonnet).
- 2026-11-12 (harness roles): "to be clear: omp, codex, pi, and open code are configured to use open code go subscription, omp furher configured to use claude sub. I forgot to mention that pi shall also be supported and tested by harness rotation during boostrapping change manifesto how to build moreover, I recommend to use pi as task flow implementer harness (minimal and great). Not so gret for spikes without adding a subagent expension, omp/opencode might be better of the shelf as spikes more likely to use spikes. omp is also great for any structured output in orchestration folder, lsp must be configured for yaml/json there, not sure if other harnesses support. add to manifest." → D18 + manifesto edit (Harness agnosticism + Bootstrap models/harness, committed on main as `ebb2808`, synced to factory-v3 as `6d64b74`).
- 2026-11-12 (adapter policy): "note: custom harness adapter only if harness support way more then though acp (like omp), otherwise acpx or at least acp" → D19 + manifesto line (main `d10f5bb`, synced to factory-v3). Consequence: pi/codex adapters are acpx/ACP work, not CLI-wrapper work; the pi probe must check ACP/acpx support first.
- 2026-11-13 (beam effort): "one minor for next launch: beam free shall be with max effort" → all `beam-free` aliases run at `effort: max` (verified variant exists on both opencode and opencode-go). Applied to `self.yaml` (digest) and `self-acpx.yaml` (pm/digest/implementer) in `f7e93f7`; takes effect from iteration 12 (iteration 11 already launched on the previous config).
- 2026-11-13 (PM retry ladder): "also PM failues shall be deterministically retried and escalated to higher model witrh broader mandate by factory" → steered via mailbox (`steer-pm-ladder.md`): kernel-owned ladder — deterministic de-novo retry with restated contract, then escalation to a higher tier with broader mandate (may block with a precise architect question), top-tier double failure blocks with trace. The hand promotion of PM to deepseek stands as the run-config state; the ladder removes the owner from the next occurrence.
- 2026-11-13 (project review): "review status of the porject, execution histories manifest vs as build and what is left, add to manifesto [AI Review] inlines where intent is unclear or incorrect , and a separate section Fable proposal of how to improve or clarify what to do" → in progress: four read-only evidence reports (manifesto vs as-built, execution history, session forensics, kernel edge cases) feed additive `[AI Review]` inlines and a `Fable proposal` section in `manifesto.md`. Owner text is not reworded.
- 2026-11-13 (review scope): "also add what remains to build, bugs and unhandled edge cases, proposals for handling strategy" → same manifesto edit gains three parts: remaining to build, bugs and unhandled edge cases, handling strategy per item.
- 2026-11-13 (review method): "hmm. single agent without split doing all forensiocs? You are highest reasoner and delegating to task grade agents reasoning before even gettng facts? swark to get facts, reason, DIY key document write up" → method changed: the two agents that were selecting and wording inlines and tables were stopped; a swarm of narrow agents gathers facts only (park autopsies, zero-yield turns, scope compliance, architect anatomy, infra and quota, review rounds, reproductions of the high-severity defects); the orchestrator reasons over the facts and writes the manifesto inlines, tables and proposal itself.
- 2026-11-13 (review verdict): owner answers on the six launch questions — hierarchy "I do not understand question. Complex enough system (with separate layers) require focused architect. It is part of requirement that must be bluid. I will add to intent: extra requirement (dashboard) that would certainly require separate focus" → hierarchy is required, built after B1–B5; dashboard requirement awaited; bugs_first "yes" → B1–B5 as milestone 1, test first; launch "wait" → not launched yet; scope "yes + agentic conflict resolution (see v1)" → P2 adopted with the v1 ladder (`bootstrap/context/factory.v2.md` l.109, copied from main), current one-attempt implementer merge kept as first rung; debt "No NEW technical debt = clean code, coverage rules are satisfied. No known bugs; comprehensive testing. Worksmanship aligned with intent." → done = maintainable, shippable, tested; outer_loop "do not understand. reask with more details, specific examples" → D9 stands, re-ask pending. Steer written to `mailbox/inbox/steer-review-decisions-14.md`.
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

### 2026-11-12 — DOC1 (ideology doc) — written by CLI, merged
- `opencode/deepseek-v4.1-flash-free#max`, 476 s, 25 steps, 60 tool calls, exit 0, zero errors, zero cost. `docs/ideology.md` 149 lines (limit 120–180), 13 principle sections + rejected-list + glossary pointer, 114 file:line references, no TODOs. Mechanical check passed.
- Review round: assignment `DOC1R` on `opencode/minimax-m3.1-flash-free` (different model, sees the document, not how it was written). `dispatch.sh` gained same-session follow-up (`SESSION` + `MESSAGE`) so review findings go back to the writer's session; review round on DOC1 will be the first test of that loop.
- Merged as `cbc5b7f` before the review because nothing else touches `docs/`; findings will amend it.

### 2026-11-12 — DOC1R review: verdict `changes`
- `opencode/minimax-m3.1-flash-free`, 218 s, 17 steps, 26 tool calls, exit 0, zero cost. Read all 117 references mechanically: 107 ok, 10 failed (every citation resolves, but the cited line does not carry the claim — overstated Intent, invented mechanism, joined citation). Coverage complete; reader test names three real gaps (merge path absent, parked-work owner unnamed, no operator surface).
- The writer's session resumed via `dispatch.sh` same-session follow-up (`SESSION` + `MESSAGE`) to amend `docs/ideology.md`.
- Lesson (becomes D11 in the REV review assignment): a reviewer sees the artifact, not how it was written. Enforcement worked only because the reviewer was a different model in a clean worktree; same-model same-session self-review is not a substitute.

### 2026-11-12 — session downgraded to task-grade; Opus window at midnight
- No Claude/Opus models until 2026-11-13 00:00 EST. Preparation needs none: S2/S3/S4, INT, REV (Muse) and the free-model shakedown all run at zero/subscription cost. A wake job is scheduled for 00:00; the first self-run launch (goal-self, Opus architect) starts after it, and only on a green shakedown.
- Reviewer from here on: `opencode-go/muse-spark-1.3-contributor`, 1M context (D12); REV assignment updated to name it.

### 2026-11-12 — free-model roles decided (D13)
- `opencode-probe.md` §7 ranked longcat-2.5-free as the implementer and beam-free as the reviewer. D13 supersedes that: deepseek-v4.1-flash / minimax-m3.1-flash for implementation and planning (free tier → contributor/plan fallback), longcat only as a different-model reviewer or for tiny mechanical pieces alongside beam. Advisory/digest roles keep minimax. No running slice used longcat critically: S0's one longcat attempt (store.ts) was already repaired by the foreman.

### 2026-11-12 — free-tier concurrency capped (D14)
- Four concurrent dispatches were in flight (S2 free, S3 alibaba, S4 free, DOC1R free) when the owner limited free-tier concurrency. The rule lands in `dispatch.sh` itself (an `flock` slot, queued not racing) so it survives this session. From here: dispatch sequence is free-tier one at a time; parallelize across billing paths (alibaba-token-plan, opencode-go) instead.

### 2026-11-12 — mechanical tier (D15) + live queue state
- `opencode-go/beam-free` owns mechanical work. Model map now: implementer/planner = deepseek-v4.1 / minimax-m3.1 flash (D13); reviewer = muse-spark-1.3-contributor (D12); different-model reviewer = longcat-2.5-free (D13); mechanical = beam-free (D15). No change to running slices: none of them assigned roles to these models yet except by the opencode-probe recommendation, which S2–S4 never read (they read only RULES.md + assignment + KERNEL0).

### 2026-11-12 — session downgrade killed all dispatches; S3 resumed and done
- The task-grade switch cancelled bg_98/99/100 (S2/S3/S4 at 25 min in) and the midnight wake. Opencode sessions survived: resumed in-session via `dispatch.sh` SESSION+MESSAGE (S3: `ses_e2d85ff08ffe…`, first resumed before a `dispatch.sh` bug fix, needed a second resume).
- `dispatch.sh` follow-up: the D14 slot edit dropped the `logs=`/`mkdir` lines → `logs: unbound variable` killed the first three resumes (commits `e80db86` fixed, re-committed Bootstrap docs). All dispatch failures are in the bootstrap-run logs, never in git.
- S3 verified myself: typecheck green; 273 tests, 271 pass, 2 live skips, 0 fail, 23.7 s; scenarios 6/7 as named tests; scenario 1 green twice; `bootstrap/reports/S3.md` lists shared-file changes (Timeouts in types/config, cancel in derive/record) and handoffs to S4 (adapter constructors need sessionsDir; digest alias needed for pre-flight). 7 commits on `factory-v3-s3`, clean worktree.
- `alibaba-token-plan/deepseek-v4.1-flash#max` for S3: first run 567 events/233 tools, continuation only 4 steps/3 tools to confirm completion. S2/S4 resumes launched (free tier, flock-serialized).

### 2026-11-12 — S3 merged into `factory-v3` (`a67189f`)
- Fast-forward-shaped merge, no conflicts. Suite on the integration branch: 273 pass / 2 skip / 0 fail, 22 s; typecheck green. S2/S4 branches predate the merge — the INT assignment now merges them into a `factory-v3` that already contains S3, which shrinks its conflict surface to S2↔S4 shared-core changes.

### 2026-11-12 — free tier truly exhausted; S2/S4 moved to subscription
- Both free-tier resumes failed with `provider.free-limit` 429, retryAfter 80,035 s (~22 h), steps=0. First 429 with a full-day retry window that also blocks the immediate retry — the earlier "passes a minute later" behavior is gone. S2 and S4 resumed in-session on `opencode-go/deepseek-v4.1-flash#max` (same weights, subscription billing); sessions `ses_e2d85ffacf…` / `ses_e2d85ffaaf…`.
- Lesson for D8/D14: the `flock` slot limits our own concurrency but not the account-wide free quota the probes share. Next free-tier availability unknown — assume none until the retry window passes; run everything billable meanwhile.

### 2026-11-12 — S4 done, merged; S3↔S4 integration fixed by hand (human intervention 2)
- S4 (`opencode-go/deepseek-v4.1-flash#max` after free-tier 429): 20 steps/23 tools in continuation, 232 s, exit 0. Verified myself on its branch first: typecheck green, 269 tests / 0 fail. Run configs written (`bootstrap/run/shakedown.yaml`: free minimax architect + beam PM/digest + deepseek implementer + minimax reviewer, plan fallbacks; `self.yaml`: Opus architect via omp). Live gate (`FACTORY_LIVE=1`) passed against real CLIs per the report — not re-run by me.
- Merge into `factory-v3` (`fb21bf8`): one conflict in `config.ts` — S3's `timeouts` field vs S4's `min(1)`+`strict` tightening; resolved as S4's shape plus S3's field (plus an import union). Then 7 red tests, all S3↔S4 contract seams, fixed in `27dbb55`:
  1. Digest scout is observability: a missing `digest` alias now skips the scout (derived table still written) instead of failing the launch — S4's pre-flight deliberately doesn't require the alias. Healed scenario3 ×2 and e2e.
  2. `firstTurn` means "no architect step on record", not "no records" — S4's baseline record broke the old check and the architect prompt mislabeled `first` as `boundary`. Real bug, one-line fix.
  3. `boundary.cause` is threaded through `writeIterationFacts` into the summary (`boundary: …` remarkable) — the PM-double-failure cause was computed and dropped.
  4. Four S3 test expectations updated to S4's exit-code contract (done=0, blocked=2, iteration-limit=3).
- Suite on `factory-v3`: 297 pass / 4 skip / 0 fail, 26 s. INT's job shrinks to merging S2 only.

### 2026-11-12 — provider value constraint (D16)
- `alibaba-token-plan/deepseek-v4.1-flash` appeared as a fallback in all run configs and as the S3 dispatch model. D16 kills that: alibaba carries no subsidy, so only its flagship (`qwen3.8-max`, read as the owner's "qwen4 max" — verified no `qwen4*` model id exists) may ever be used there. Subsidized work goes to opencode-go deepseek-v4.1-flash / muse-spark-1.3-contributor / free models.
- `bootstrap/run/{shakedown,self}.yaml`: alibaba fallback lines removed (free → opencode-go deepseek). `shakedown-plan.yaml` (free tier dead): primaries opencode-go deepseek (architect/implementer/reviewer, fallback muse) and beam-free (pm/digest, fallback deepseek). Pre-flight re-validation happens at shakedown launch via S4's live gate.

### 2026-11-12 — D16 corrected: alibaba flagship is `qwen4-max-preview` (omp-only)
- The owner named the exact id; I verified it through omp (catalog hit, live reply). Consequence: any future use of the alibaba flagship must go through the omp harness adapter, never opencode. Run configs are unaffected (none names an alibaba model now). Added to the S4/pre-flight backlog implicitly: model existence must be probed per harness, not assumed from one catalog.

### 2026-11-12 — model allowlist finalized (D17)
- Verified highest variants: deepseek-v4.1(-free) `#max`, minimax-m3.1-flash-free `#max`, glm-5.3-flash-free `#max`, muse-spark-1.3-contributor `:max` (omp) / `#xhigh` (opencode), qwen4-max-preview `#xhigh`, mimo-v2.6-flash-free (no variants). Banned: `opencode-go/minimax-m3.1-flash`, `opencode/longcat-2.5-free` (D13's longcat reviewer lane is dead — reviewer agent already configured, presumably muse).
- Run configs need one edit: none names go-minimax or longcat (checked: only free `-free` primaries + go-deepseek fallbacks), so they already comply. Future self-improvement runs: add a codex leg (opencode-go muse/deepseek) and a Claude leg (opus architects, sonnet escalation) — recorded here, executed when the factory runs itself.

### 2026-11-12 — S2 done on subscription; INT dispatched
- S2 (`opencode-go/deepseek-v4.1-flash#max`, resumed session): 136 steps / 196 tools, 1843 s, exit 0, zero errors. Verified myself: typecheck green, 271 pass / 2 skip / 0 fail (29.9 s). All 5 scenarios (2,4,5,8,9) + merge-crash recovery + base continuation + scope exclusion. Report names exact INT seams: `runDispatch` must replace S4's serial drain in `launch.ts`; `process.flows` passed to every `derive`; `attempts` populated in S3's `agent.ts`; metrics count `no-progress:` parks.
- Codex probe: bare `muse-spark-1.3-contributor` works via codex (provider from `~/.codex/config.toml`, 1.5 s); the `opencode-go/…` prefixed spelling is rejected. Codex default reasoning is already `max` in that config. So muse-at-max is confirmed on all three harnesses with three spellings (omp `:max`, opencode `#xhigh`, codex bare id + config effort).
- INT dispatched on `opencode-go/deepseek-v4.1-flash#max` (bg_115) — merges S2 onto the S3+S4 base, wires the four seams, writes the cross-slice test, verifies scenarios 1–9 + promote.sh.

### 2026-11-12 — INT done, kernel-0 merged (`d6ba3fd`)
- INT (`opencode-go/deepseek-v4.1-flash#max`): first attempt died on transport ECONNRESET at 108 s; resumed in-session, then 118 steps / 166 tools, 1505 s, exit 0. Verified myself: typecheck green, 323 pass / 4 skip / 0 fail (35 s), scenarios 1–9 all named + cross-slice E2E (`integration-e2e`), promote.sh green on the head, no new `as unknown as`.
- Merge into `factory-v3` needed `--no-ff` (bootstrap-only commits had landed meanwhile); no conflicts. Suite on the integration head: same 327 green.
- Kernel-0 stands at 5.5k LOC in 33 files (largest 309 lines) — 3.7x the KERNEL0 guess, all of it wired and tested. Three honest gaps named with smallest next steps (journal.ndjson never written; implementer/reviewer sessions uncompacted; edited pending task reuses old branch) → seed backlog for the first self-run, not blockers.
- REV dispatched on `opencode-go/muse-spark-1.3-contributor#xhigh` — the configured reviewer tier (D12/D17), first real test of muse as adversarial reviewer.

### 2026-11-12 — REV (muse) verdict: do not launch yet; FIX dispatched
- REV (`opencode-go/muse-spark-1.3-contributor#xhigh`): 55 steps / 108 tools, 2811 s, exit 0. First real muse run: the review is strong — 4 proven findings with repros (merge-crash sealer loses merged/parked distinction; infra ends the whole dispatch; red base written never read; no rogue-agent containment), a §5 suspected list, and verified passes (no unbounded loops, architect exactly 1/iteration, repair/round bounds all finite).
- Triage: fix 1–4 + §5's gitignore/turnsUsed/empty-scope now (FIX.md on `opencode-go/deepseek-v4.1-flash#max`, bg_118); stall exit / $ brake / overflow path / taskHash / dedup / splits → factory self-run backlog. FIX acceptance includes the hostile shakedown as a test (red base + kill in the merge window), which is REV's required gate.
- Muse as reviewer: validated. Findings are concrete (file:line + repro + smallest fix), the verdict is falsifiable, and §6–§8 show it checked what works too. D12 stands.

### 2026-11-12 — harness roles in manifesto (D18)
- Owner-authored change, applied in spirit: four harnesses on the Go subscription (omp additionally on Claude sub); pi supported + rotation-tested; pi = implementer, omp/OpenCode = spikes, omp = orchestration structured output with YAML/JSON LSP; codex + Claude legs in self-improvement; muse effort spellings per harness.
- Kernel-0 consequence: no pi/codex adapters exist (only omp + opencode). The self-run builds them; a pi probe (same shape as `context/omp-probe.md`) is the first step. FIX slice is unaffected (kernel bugs, harness-agnostic).

### 2026-11-12 — adapter policy (D19)
- The owner's rule lands in Harness agnosticism: omp earns its custom adapter (RPC/yield/compaction/overlays); everything else rides acpx or plain ACP. This re-scopes the self-run's pi/codex work: no new CLI parsers — an acpx client (or ACP client) plus per-harness capability discovery. The opencode CLI adapter stays (grandfathered, proven), replaceable only on measured acpx parity.

### 2026-11-12 — FIX done, merged (`5c89c3c`); kernel-0 complete
- FIX (`opencode-go/deepseek-v4.1-flash#max`): 157 steps / 177 tools, 1904 s, exit 0. All four REV findings repaired with regression tests + hostile shakedown test (red base + kill in merge window → merged-not-parked, unrelated merges, base attribution). Verified myself: typecheck green; suite 331 pass / 4 skip / 0 fail (39 s) — one transient failure on my first run did not reproduce in two re-runs (flaky, likely settle timing; watch).
- Merge into `factory-v3` clean, no conflicts. Suite on the head: same 335 green.
- REV's gate is satisfied: findings 1–3 fixed, two-test coverage added, hostile shakedown exists as a test. Next: promote → live shakedown on the toy goal (phase C) → midnight self-run (phase D).

### 2026-11-12 — phase C shakedown GREEN (first live launch)
- Pin `4c6a5c190fa4`, toy goal `kv`, run config `shakedown-plan.yaml` (opencode-go deepseek primaries, beam PM/digest — free tier dead). 41 min wall, exit 3 (iteration-limit, expected). 3/3 tasks merged (store-core, cli-surface, readme-usage), 0 parked, 0 pending.
- Plan quality (deepseek architect stand-in): risk-ordered (persistence first), real seams (`run(argv,env)`, Store API, atomic temp+fsync+rename, 0600), reversible assumptions with intent line refs. Debt recorded with file:line evidence (3 items). Base-gate handling worked: TS2688 on missing node_modules → `bun install` → green, recorded.
- Independent verification (not the factory's own gates): integration head in a copy — 24 tests green, typecheck green, real CLI set/get/del/list + exit codes 0/1 correct.
- Metrics: 10 agent + 18 script turns; tokens in 406k / cached 5.7M / out 57k / reasoning 128k; cost not reported (usage records lack cost from opencode-go — S4 metrics gap, backlog).
- Deviation noted: shakedown ran on subsidized models, not free (free tier quota-exhausted). D4's "free-model architect" shakedown is unproven; the plan-quota run is the evidence we have.
- Phase D (self-run, goal-self, Opus architect) is unblocked for the midnight window.

### 2026-11-13 — phase D: self-run iteration 1 launched (bg_120)
- Opus window verified live (`OPUS_OK` via omp). Pin `29936476b4b7` (335 green). Goal `self` in the v3 worktree, intent = manifesto + delta; repo config committed (`7bdc277`) with setup + typecheck/test gates on `plugins/software-factory`.
- Run config `self.yaml`: architect Opus 5.5 high via omp (fallback go-deepseek), implementer free deepseek → go-deepseek, reviewer free minimax → go-deepseek, PM/digest beam-free → go-deepseek, escalation Sonnet, scouts pinned go-deepseek.
- Escalation rule in force: stop and ask if this launch's architect cost exceeds $5.

### 2026-11-13 — self-run iteration 1: 0 merged, architect diagnosed the red base ($1.25)
- 11 min, exit 0. The architect's turn ended before writing the plan — but with verified findings: (1) my gate form `bun run typecheck --cwd X` is wrong ("Script not found"; correct: `bun run --cwd X typecheck`); (2) REAL factory bug: `test/helpers/tmp-repo.ts` cleanup sweeps every `preflight-probe-*` in tmpdir, deleting the baseline's own live worktree — the suite deletes itself when run under the factory (my direct runs passed only because no baseline existed concurrently).
- Architect cost $1.25 (under the $5 bound). Remarkables already direct iteration 2: gates-hermetic first, measurement milestone (cost-pricing, prompt-size, metrics-incidents), acpx-probe spike (D18/D19), prune candidates, no `just-implement` flow yet, benchmark report command.
- Human intervention 3 (blocks next launch): fixed both by hand — gate forms in `.factory/repo.yaml`, tmp sweep now deletes only dirs older than the process. Relaunched as iteration 2 (bg_122).

### 2026-11-13 — self-run iteration 2: transient double-crash, no architect turn
- 5 min, exit 0, status blocked-by-user. Architect turn crashed twice in 0.4 s total (Opus then deepseek fallback, zero usage both) — `infra: crash` with no error text anywhere. Base still red on test (the tmp-sweep fix landed in cd8a1ef, AFTER this launch's base commit... no: base was cd8a1ef which HAS the fix; test still exit 1 — unexplained, possibly the same transient).
- Diagnosis (30 min, all exonerated): overlay (same hash as iteration 1, Opus works with it directly), resume path (turn was de novo), exact RPC spawn (ready in 1.3 s), adapter direct / with real cwd+400KB prompt / full-fidelity with outcomePath+fallbacks (all `done` in 4–8 s). Verdict: transient environmental failure at 05:19, cause unknown — compounded by the factory defect that crash stops swallow stderr.
- Steered via mailbox (`steer-crash-detail.md`): infra stops from launch failures must preserve truncated stderr in the end record; same for opencode if applicable; regression test with a bogus binary. Relaunched as iteration 3 (bg_123). If it crashes identically, the transient theory dies and I patch stderr capture by hand to see the error.

### 2026-11-13 — iteration 3 crashed identically; stderr fix by hand (intervention 4), relaunched
- Same 0.4 s double-crash, third launch in a row (iterations 2–3; iteration 1 worked). Transient theory dead. Also realized my tmp-sweep fix was wrong: it compares against the TEST process's birth, but the baseline dir is created by the older parent factory process — the base stayed red because of it. Corrected to sweep only dirs older than an hour.
- Catch-22 resolved by hand (blocks launch AND diagnosis): `Stop.infra` gains `details?` (same shape as `refusal.details`); omp classify preserves truncated stderr / signal / a no-evidence marker; two classify tests updated. Suite green (335). Promoted, relaunched as iteration 4 (bg_124) — its crash records will carry the real error if it crashes again.
- The mailbox steer (`steer-crash-detail.md`) is now half-done by me: the opencode side + regression test remain for the factory.

### 2026-11-13 — iteration 4: root cause found via stderr detail; resume fixed by hand (intervention 5)
- The `details` field worked on first use: `Error: Session "01a1d348-..." not found`. Every launch uses a FRESH `<goal>/<launch-id>/` session dir, but the architect ref points at iteration 1's session in its own launch dir — cross-launch resume can never work, omp exits before ready, both attempts crash in 0.4 s. Deterministic since iteration 2. (The opencode adapter never hits this: its sessions live in opencode's global sqlite.)
- Fix by hand (blocks every launch): `SessionRef.dir?` = harness-managed session home, stamped by the omp adapter; resume uses the home dir; a pruned/missing session retries de novo once instead of crashing; `compact()` uses the home dir too. Suite green (335). Promoted, relaunched as iteration 5 (bg_125). Iteration 5 runs de novo (the stored ref predates `dir`) with the full context pack, then resume works from iteration 6.
- Base is GREEN now (hour-cutoff tmp sweep works) — iteration 4's only failure was the resume crash.

### 2026-11-13 — iteration 5: 7 merged + 1 spike, then a truncated outcome killed the launch (intervention 6)
- 85 min. Resume fix worked: Opus architect ran, PM + dispatch followed. Merged: sync-base, base-follow, cost-pricing, crash-detail-opencode, flow-just-implement, prompt-refs, prompt-size. Spike finished: acpx-probe. Ready: empty-diff-skip, metrics-incidents, prune-checks, prune-docs, subagent-usage, tier-escalation. Pending: benchmark-report, budget-drain, overflow-denovo, prune-git. NO summary (launch died before writing it).
- Killer: a reviewer's outcome.yaml is truncated JSON mid-string (`00090-i5-prune-docs-review-r1`). `store.listRecords` re-reads outcome.yaml with raw `readYaml` and only tolerates ENOENT — the YAMLParseError propagated through derive and killed the launch. (`started.yaml` was already parse-tolerant; outcome/end were not.)
- Fix by hand (any malformed outcome kills any launch): rehydration skips malformed outcome.yaml (repair flow owns validity at write time) and degrades torn end.yaml to an orphan; two regression tests. Suite green, promoted, relaunched as iteration 6 (bg_126) — record 00090 rehydrates as an orphan and the review redispatches.

### 2026-11-13 — iteration 6: architect reviewed, PM flaked on beam; goal line merged (`c18e5fd`)
- 15 min, $2.00, status blocked-by-user. Architect (Opus) verified iteration-5's claims, named 7 debt items in merged work, answered the crash-detail steer. PM turn failed: beam-free wrote no outcome, then failed repair confused ("Correct only the outcome" vs unfinished PM work). Iteration 5's PM ran on the SAME beam-free and succeeded — one failure is flake, not incapacity; beam stays, promote on second failure.
- Owner-attention merge done by hand: `factory/self` (7 merges + spike) into `factory-v3`. Conflicts exactly as the architect predicted (classify.ts, turn.ts, LOG.md) but its advice (take factory/self) was half-wrong: my resume-dir fix and rehydration tolerance live only on factory-v3. Resolution per hunk: factory's shared `harness/details.ts` (with secret scrubbing — better than my omp-local `truncate`, deleted) + its `code` field; my resume-dir/de-novo-retry kept (no conflict); LOG kept HEAD. One duplicate import from my resolution script, fixed. Suite on the merge: 369 tests (factory added 32), 0 fail. Promoted, relaunched as iteration 7 (bg_128).

### 2026-11-13 — iteration 7 stillborn: stale pin + test reaching outside the package (intervention 7)
- bg_128's chain masked promote's failure: `./bootstrap/promote.sh 2>&1 | tail -2 && ...` — tail's exit 0 hides promote's 1 (my command bug; `set -o pipefail` from here on). The run executed on the STALE pin (no `prices` in schema) and died on config validation in 44 s.
- Real defect: factory's `pricing.test.ts` reads `../../../../bootstrap/run/self.yaml` — passes in the worktree, fails in promote's package-only export (ENOENT). Fixed by hand (blocks promotion): inlined an equivalent run-config shape into the test (plus fallback coverage the original lacked); verified the real self.yaml fully priced by hand. `factory doctor` (validate a real run file's price coverage) → backlog.
- Committed, promoting with pipefail, relaunching as iteration 7 (bg_129).

### 2026-11-13 — iteration 7: 14 merged, 2 parked, launch killed at the end (recovered clean)
- 2.4 h wall, stop=interrupted, exit 130 (SIGINT/SIGTERM from outside — likely harness timeout; kill landed after dispatch settled, summary + all records intact). Merged 14: acpx-doc, prune-docs, base-follow-fixes, opencode-cache-write, empty-diff-skip, subagent-usage, metrics-incidents, acpx-adapter, cost-unknown, refusal-scrub, omp-resume-test, budget-drain, pack-path-single, benchmark-report. Parked: prune-checks (no-progress, implement r2 repeated r1), tier-escalation (upscope with a precise interface diagnosis: flow.ts drops target alias/model, agent.ts re-resolves by role). Pending: docs-truth, overflow-denovo, prune-git.
- Verified on the integration head in a detached worktree: typecheck green, 419 tests (+50), 0 fail. Merged to factory-v3 (`67c5e24`) with NO conflicts. Promoted, relaunched as iteration 8 (bg_130).
- Note: `docs/adr`, `plugins/software-builder` and other rejected material are now deleted by prune-docs (visible in this merge for owner veto per the Open item).

### 2026-11-13 — promote failed again: same outside-package disease, second instance (intervention 8)
- `acpx-preflight.test.ts` reads `bootstrap/run/self-acpx.yaml` (package suite reaching outside the package — same class as pricing.test.ts). In the export the config is missing → null alias → fail. Pipefail correctly stopped the chain this time (no stale-pin run). Fixed by hand: config text inlined into the tmp repo; plus a guard in `live-run-configs.test.ts` (skip when bootstrap/ is absent) and a repo-wide sweep — no other outside reads (the `src/cli` hits are comments).
- Pattern for the architect: package tests must be hermetic to the package; real-bootstrap validation belongs to `factory doctor` (backlog). Committed, promoting, relaunching iteration 8 (bg_131).

### 2026-11-13 — iteration 8: 1 merged; export-based gates (architect's proposal)
- 16 min, $1.05, status in-progress. Architect turn ended early waiting on scouts (no plan edit); PM + dispatch ran docs-truth round 2 → merged. Parked 2 unchanged, pending 2.
- Owner-attention acted on: plan rules don't stop outside-package test reads (broken twice). Took the architect's stronger option over its default: `plugins/software-factory/scripts/gates.sh` copies the package working tree to a bare tmp dir and runs install+typecheck+test there; `.factory/repo.yaml` gates now call it (50 s all-in, verified). Task gates and promote gates can no longer diverge. Merged docs-truth (`1a950b1`), promoted, relaunched as iteration 9 (bg_132).

### 2026-11-13 — iteration 9: 3 merged + 1 spike; steady state ($2.10)
- 65 min, exit 3. Merged: acpx-session-loss, harness-hygiene, benchmark-kit (bench reset script + target-repo.yaml + run/benchmark.yaml now exist). Spike: hierarchy-probe. Parked: prune-checks (still), tier-escalation (still), +2 empty-diff (prune-checks-types, turn-target — the latter's diagnosis unified the resolver anyway). Pending 16.
- turn-target's debt note claiming acpx-preflight.test.ts still reads bootstrap/ is stale — the inlined fix is in the tree and the export gate passes. No action.
- Debt worth naming: benchmark-kit confirms the preflight-probe-* prefix collides with test-helper purges (my hour-cutoff is a band-aid; real fix = rename the scratch prefix in baseline.ts) → factory task. Merged clean (`9929a99`), promoting, iteration 10 running (bg_133).

### 2026-11-13 — iteration 10: 0 merged, PM failed 2nd time → promoted to deepseek
- 12 min, $1.99, status blocked-by-user. Architect diagnosed the iteration-9 empty-diff parks: `base:` continuations branch from stale tips lacking gates.sh → exit 127 → misclassified as empty-diff. Planned `turn-land`/`prune-checks-land` (merge kept branches, not `base:`) + `parked-base-sync` fix. PM failed identically to iteration 6 (beam-free, done, no outcome after repair).
- Second beam PM failure → promoted per the logged rule: PM alias is now `opencode-go/deepseek-v4.1-flash#high` (fallback free deepseek). Digest stays beam (it succeeds). Committed (`12e46c8`), promoted, iteration 11 running (bg_135).

### 2026-11-13 — beam-free at max effort (owner steer)
- Every remaining beam alias (digest in self.yaml; pm/digest/implementer in self-acpx.yaml) now sets `effort: max`. No code change, no re-promote needed (run config is read at launch); iteration 11 is unaffected (already running), iteration 12 picks it up.

### 2026-11-13 — PM retry ladder steered (owner steer)
- The factory now owes the ladder as a kernel feature (retry de-novo → escalate tier → block with trace), planned by the architect at the next boundary that reads the inbox. My `12e46c8` promotion stays; iteration 11 tests whether deepseek PM holds.

### 2026-11-13 — iteration 11: 18 merged incl pm-ladder; deepseek PM held ($2.67)
- 6.2 h, exit 3. Deepseek PM derived 25+ task files for $0.03 — the promotion worked. Merged 18: pm-ladder (answers steer-pm-ladder: escalateTo field, base-failed climbs, only escalated rung blocks with a question, rollback between rungs, repair ask removed; self.yaml pm.escalateTo = escalation/sonnet), turn-land, prune-checks-land, parked-base-sync, session-end-compact (sessions compact at end — resume era begins), pm-frozen, empty-diff-cause, overflow-denovo, limits-usd-typed, steer-holds, +8 more. Parked 7 (front-ladder + harness-rotation upscoped with precise interface diagnoses; 5 others). Pending 10.
- Merged clean (`550b275`), 401 tests green, promoted. Iteration 12 running (bg_137) — first launch with beam-max digest + pm-ladder in the kernel.
- Launch hygiene note: bg_135's result dumped promote's full suite log; bg_137 redirects to /tmp/self-i12.log instead.

### 2026-11-13 — iteration 12: 6 merged, 8 parked; infra-no-climb reversal ($2.27)
- 2.4 h, exit 3. Merged: brake-priced, front-land, compact-shared, incident-surfaces, register-guards, sweep-land. Parked 8 (pm-ladder-tidy + prune-sweep + doc-drift upscoped with in-scope work complete — scope friction, not failure; front-ladder/harness-rotation still parked with land tasks planned). Pending 13.
- Architect reversed a default with cost reasoning: a PM rung ending on infra no longer climbs to escalation (~13x price for trouble a stronger model doesn't fix); refusal/invalid still climb. Reversible in run config.
- Merged clean (`4ec622e`), 420 tests green, promoted. Iteration 13 running (bg_138) with both logs redirected.

### 2026-11-13 — project review started (owner steer)
- Session switched to the economy-reasoner mode: discovery delegated, orchestrator keeps intent and judgment.
- Four read-only agents running against iterations 1–12 (iteration 13 is live and excluded): manifesto-vs-built matrix, execution history, session forensics, kernel edge-case review. Orchestrator's own line-anchored reading of the manifesto is done (37 inline candidates).
- Output will land as additive edits in `manifesto.md` on main, then synced to factory-v3.

### 2026-11-13 — iteration 13: 5 merged, 9 parked; one park caused by the orchestrator ($2.20)
- 2.6 h, exit 3. Merged: git-helpers-prune, front-handoff, pm-infra-stop, steer-guards, front-status. Pending 11. Architect spend is $1.48 of $2.20 (67%), third iteration in a row whose review says "the plan drew the scope too tight".
- **My fault:** rotation-threaded parked on `containment: HEAD moved outside the worktree` (records 00559/00560, ended 22:42:55Z). The HEAD that moved was mine: `676a296` (review-steer log) committed on factory-v3 at 22:37:36Z while the turn was live. The check at `src/kernel/worktree.ts:296-302` blames any change to the repo root's HEAD or status on the running turn.
- Rule from now: no edits and no commits in this worktree while a run is live. Journal, merge and manifesto sync happen between runs only. The kernel defect (operator change blamed on a task) goes into the review as a bug with handling.
- Merge of iteration 13 and the relaunch are held until the review's evidence agents finish reading this tree, so their file:line citations stay valid.

### 2026-11-13 — review method corrected (owner steer)
- Wrong split, mine: one agent carried all session forensics, and two task-grade agents were asked to judge and word the inlines and tables before the forensics facts were in. Both assembly agents stopped before producing output.
- New split: narrow fact agents in parallel, structured outputs, no judgment; reasoning and the write-up stay with the orchestrator. Iteration 13 is merged into factory-v3 (`b4a2d9f`, 436 tests, 0 fail); iteration 14 stays unlaunched until the review is committed.

### 2026-11-13 — project review delivered
- `manifesto.md` gained 40 `[AI Review R01–R40]` inlines and a `## Fable proposal` section (where the project stands, P1–P13, remaining work W1–W24, bugs B1–B28 with handling, handling strategy, seven owner decisions). Additive only: 210 insertions, 0 deletions (main `382cad6`, synced here).
- Evidence: `bootstrap/reports/review-2026-11-13/` — `REVIEW.md` (digest written by the orchestrator), four broad reports, `facts/` from twelve narrow agents, `repro/` with the tests that reproduce the defects, `salvage/`.
- Verified before writing: four of five high-severity defects reproduced by test, the fifth (containment) observed in iteration 13; one reported high-severity defect (blocked goal never reads a steer) was already fixed by `front-status`; one forensic claim (round-two outcome path) was not confirmed and was dropped.
- Salvage: `rotation-threaded` lost its uncommitted work to the park my commit caused (20 paths). The diff is saved as `salvage/rotation-threaded.patch`.
- Iteration 14 is not launched. Its first work would be the hierarchy chain, which the proposal recommends deferring; it waits for the owner's decisions.

### 2026-11-13 — journal corrections (records win)
- Iteration 9 cost was $2.63, not $2.10 ($2.10 was the architect alone). Iteration 5 cost was $3.33; its summary exists, written by the relaunch recovery.
- beam-free at max effort took effect in iteration 11's digest, not from iteration 12.
- Iteration 12 had one new park (`pm-ladder-tidy`). `doc-drift` was never dispatched, `prune-sweep` parked in iteration 11, and `front-ladder` was retired by `front-land` in iteration 12.
- Iteration 13 had one new park (`rotation-threaded`); the other eight in its summary were carried over.
- From now on iteration lines in this journal are taken from `metrics.yaml` and the records, not from the summary's first screen.

### 2026-11-13 — review figures corrected after delivery
- **My error:** I copied `facts/architect-anatomy.md` into the evidence folder and quoted from it while its agent was still writing. The final file shows four review lines in the manifesto overstated or narrowed the architect figures: 74% of the bill, not 75%; $1.58 per turn that ran, not $1.19 per launch; 0.7 to 7.3 million cache-read tokens per turn, not 0.7 to 3.2; 15 to 42 requests, known for four turns only; $6.28 is 30% of the money, not a third.
- Corrected in place in my own review text (R05, R30, Where the project stands, P4); no owner line changed. Table of old and new values: `reports/review-2026-11-13/REVIEW.md`, "Corrections after delivery". Final fact file replaces the partial copy.
- Rule: a fact file is quoted only after its agent has reported completion.
- No run was live during these commits.
- Second correction, same entry: the manifesto matrix is 104 rows with 24 partial, not 103 with 23. One row (cache TTL, manifesto l.119) fell out of my count because its quote contains pipe characters; four rows are rules with no code to check. Fixed in the manifesto status line and `REVIEW.md`.

### 2026-11-13 — review verdict applied, launch held on owner's "wait"
- Owner answers: hierarchy required (dashboard requirement coming); B1–B5 first, test first; scope-as-prediction yes with agentic conflict resolution ("see v1" = `docs/factory.v2.md` l.109 wave-end merge ladder, copied into this tree as `bootstrap/context/factory.v2.md`); done = shippable and covered; landing/promotion stays manual until re-asked. Steer file `steer-review-decisions-14.md` in the goal inbox. Launch answer was "wait": steer is inside the tree and will be picked up by the next boundary; no run live.
- Revision note, owner's phrase "see v1": the v2 doc line points at the v1 checker/committer role (workhorse-class, trivial conflicts, architect escalation with status pointer + worktree/branch); the steer names that line, not a v1 document. Verbatim answers preserved in the Owner steering entry above.

### 2026-11-14 — INTENT.md replaces manifesto.md; Phase 1 staged
- Owner: `whatuserwant.md` is the authoritative intent. Consolidated into `INTENT.md` (current state only, latest input wins); `manifesto.md` deleted (history in git). Review W/B tables preserved in `bootstrap/reports/review-2026-11-13/WORKLIST.md`.
- `Phase1.md`: single-level factory works as intended before hierarchy — M1 safety (B1–B5), M2 relaunch keeps going, M3 prompts from one source (templating engine, debloat), M4 trivial same-session + standalone upscope, M5 no file fences + end-of-wave steward + plan checker with repeat, M6 cost/measurement/done. Live acceptance includes goals `p1-trivial` and `p1-task`.
- Campaign order (owner): Phase 1 → a couple of standalone tasks → everything in INTENT.md until complete. Runbook: `bootstrap/SELF-IMPROVE.md`. Every landed iteration merges into `main`.
- Goal `self` intent switched to the Phase 1 stage (copy: `bootstrap/goal-self/intent.md`). Inbox: verdict steer withdrawn (`bootstrap/context/steer-review-decisions-14.superseded.md`), replaced by `steer-intent-phase1.md` (reverses the iteration-13 de-novo trivial assumption; scopes name areas, not files).

### 2026-11-14 — iteration 14: 0 merged; plan rewrite blocked by stale plan + truncated pack ($0.95)
- One architect turn, one PM turn, 3 turns total. The architect read the steer, sent 4 scouts, ended with `status: failed` and no plan edit (Friction 5 again; iteration 8 had the same shape). Pack was truncated at 8000 bytes (`packTruncated: true`) while the stale plan was 78 KB / 430 lines. PM derived from the stale plan; nothing dispatched.
- Facts confirmed: package code unchanged since `b4a2d9f`; `repro-e4` fails (B4 open), `repro-e3` passes (E3 fixed).
- Operator acts: old plan archived to `bootstrap/context/plan-pre-phase1.md`; `plan.md` replaced by a stub naming M1–M6; steer `steer-plan-first` (write the plan first; no scouts before; mixed repro polarity; M5 gains the post-turn guard + pack-cap items). Phase1.md M5 extended with both items.
- New tooling note: the campaign uses checkpoint/rewind for post-run triage and subagents for log forensics (owner instruction, multi-day horizon).

### 2026-11-14 — iteration 15: plan rewritten to Phase 1, 4 M1/B fixes merged ($1.42)
- 2h17m, exit 3. Architect rewrote plan.md in-turn (128 lines, Phase 1) after reading the four scouts' results via agent://; PM cancelled the six pre-Phase-1 epic rows (records 00569–00574). This closes iteration 14's failure: the earlier architect ended its turn to "wait" for background scouts, and a turn end ends the invocation.
- Merged 4 on factory/self: m1-boundary-infra (B5), m1-containment (B1+B15), m1-second-goal (B3), m1-red-base (B2+B26). Spike m4-session-probe finished. Parked 1: m1-drain (B4), cause upscope — launch.ts:301 never passes the launch's DrainController and KernelRuntime has no field for it; repro-e4 still red.
- Owner rulings applied: (1) context pack is an index with no artificial byte cap — any cap never drops pointers (plan, INTENT.md, digest, debt, records, worktree/branch); the 8000-byte capPack tail cut dropped the pack's last sections in iteration 14. (2) The kernel ensures every agent delivers: a turn ending without its deliverable gets one repair ask, its text a config prompt template with per-agent shape, then a named-cause failure. Both in INTENT.md; Phase1 M5 carries the build items.

### 2026-11-14 — iteration 16: B4 drain merged ($1.01); two operator errors
- 56 min, exit 3. Merged m1-drain-admit: dispatch stops admitting on the first signal, repro-e4 green in-suite (B4 closed). 22 pending for M2–M6; 11 cancelled, including the six epic rows and m5-architect-guard renamed to m5-delivery-guard for the widened INTENT. Base gate green at 5651e3a.
- Operator error 1: commit 772681d mid-run. rotation-threaded parked with cause `containment: HEAD moved outside the worktree` — B1's fix correctly blamed the operator instead of the task, but the no-writes-mid-run rule is right and stays.
- Operator error 2: mid-run steer steer-agy-acpx created a goal hold; dispatch stopped after m1-drain-admit, and m1-gate-signatures/m1-gate-export stayed undispatched. Steering happens between runs only.
- INTENT additions: the architect plans the road to completion with explicit deferrals and evaluates the project against intent rather than the last iteration; an omp subarchitect is an explicitly defined transient-plugin agent reachable over IRC. Phase 1 M6 gains the agy/acpx leg; M5 prompt framing updated.

### 2026-11-14 — operator role narrowed to requirements, operation, recovery (owner steer)
- Owner: this session was doing the architect's job during runs. It gives requirements (which subset of the intent is Phase 1), operates, recovers from major issues, and reports bugs/incidents as steers. It does not prescribe milestones or plans. The architect evaluates the project against the intent — mechanical solidity and agentic behavior — and may spike into previous sessions.
- `Phase1.md` rewritten as requirements R1–R23 plus the evidence wanted; M1–M6, their order and fix directions withdrawn. Goal intent and `SELF-IMPROVE.md` rewritten to match. Earlier operator steers that prescribed how (plan length, scout order, file coverage, prompt sentences, scheduling) withdrawn as prescriptions.
- `INTENT.md`: steers do not interrupt work (PM handles task-specific/redo/small-task steers; architect for intent amendments and architecture decisions; a steer may stall the run when pending work lost its value or an unplanned priority is asked); delivery guard and context pack reworded to the owner's statements; mechanical checks on agent output named as a loop cause; operator role, architect's concern and build order in the bootstrap notes.
- Edits were staged outside the repository while iteration 17 ran and applied at its landing.

### 2026-11-14 — iteration 17: 7 merges, exit 1 on quota ($2.48); landed to main
- 2h36m. Merged on factory/self: m1-gate-export-land, m1-repro-hermetic, agy-acpx-leg, m1-gate-signatures-fix, m2-pm-files, m2-mailbox, m2-session-fallback. m2-turn-failures implement hit provider.go-limit (OpenCode Go weekly); relaunch-safe, task left ready.
- Operator rewrite (staged during the run, applied at landing e115ef8): INTENT steer/delivery/pack/loop-cause/bootstrap edits; Phase1.md as requirements R1–R23; SELF-IMPROVE runbook narrowed to operator role; goal intent no longer plans. Run config: reviewer on agy first, codex switchable (commit 18e3fb8).
- Landed to main as 685cc25. Gates 507 pass 0 fail.

### 2026-11-14 — iteration 18: 0 merges, exit 1 on quota, $1.16 spent
- ~10 min: digest (beam-free, $0), architect (opus) started project-vs-requirements evaluation with 3 scouts on the new Phase1.md; PM died on provider.free-limit 429. Three scouts' findings did not land.
- factory/self == factory-v3 == 18e3fb8: nothing to merge. Base gates green.
- Incidents: (1) Go weekly wall (i17) and free-limit wall (i18) both hit — relaunch without a spendable leg burns the architect turn first. (2) Foreign launch provenance (broker 216198): launcher is unauthenticated; consider a launch token if operator-only launches are desired.

### 2026-11-14 — owner intent additions (main b57dcaf, synced to factory-v3)
- Harness adapters: NO CODE — leverage acpx naming (and opaque config) in config, that is it.
- Hierarchy (subagent): with omp, subagent context shall also be compacted for the next launch.

### 2026-11-15 — iteration 19: 3 merged, exit 0, $0.875
- 3h05m, stop=iteration-limit, base gates green at 891a610b8e. Merged on factory/self: m2-turn-failures (1a200e0), m2-resume-iteration (6a51409), m3-gate-hygiene (7ab3562). Parked: 13, all historical. Pending: 16 (m3-debloat, M4 x2, M5 x7, M6 x4, doc-drift).
- m3-liquid implement parked upscope (LiquidJS renders all role prompts; homegrown renderer deletion needs architect authorization — forward carries the two-edit plan). 16 agent + 31 script turns; 0 loop incidents, 0 merge conflicts.
- All task turns ran the launch-loaded config (beam-free implement, inkling-free review, $0); architect opus $0.875. The stale "implementer-alias-no-fallback / Go wall" owner-attention line in the summary is obsolete (refers to self-acpx.yaml, not the loaded file).
- Incidents: (1) mid-run rewrite of self-quota.yaml (19:21) to omp-ernie+agy content — harmless to this run (config loads once), superseded at landing by the staged owner-ordered ladder; (2) TEMP REVERT of the m2-resume condition in the launch tree (untraceable origin, matches no commit) — discarded, never committed; (3) repo.yaml +3 new gates leaked into the launch tree but were never merged — reverted here, reported as a wiring gap; (4) foreign launch broker again (295962).

### 2026-11-15 — i19 landing gates (post-merge 22385c3)
- typecheck + tests: 537 pass, 0 fail. New m3 gates from repo root: format=0 (biome, 206 files, no fixes), lint=0 (840 warnings, 0 errors), schema-validation=0 (395 files valid; .factory/run.yaml absent — expected, no such file in this goal).

### 2026-11-15 — run config: owner-ordered task ladder (applies at next launch)
- Task work strongest→weakest per owner: omp/muse (`opencode-go/muse-spark-1.3-contributor`) → agy/gemini (`gemini-3.8-flash`, high) → omp/deepseek (`opencode-go/deepseek-v4.1-flash`) → omp/ernie 5.5 (`openrouter/baidu/ernie-5.5-flash-preview:free`).
- Same-harness fallback rule forced the split: omp implementer/reviewer carry muse → deepseek → ernie in one chain; agy holds a switchable `reviewer-agy` alias (cross-harness fallback needs the kernel change already in the plan).
- Beam and inkling are mechanical tiers only (digest in this file). Reviewer is task-grade (muse same-family review; different context and focus: dev vs review) per the new INTENT line.
- Replaces the whole prior `self-quota.yaml` content. omp route proven spendable: owner confirms this session runs muse max in omp, with multiple keys auto-rotating as fallbacks. The Go weekly wall hit the opencode CLI route, not omp.

### 2026-11-15 — iteration 20: 4 merged, exit 3, $2.41
- 80 min, stop=iteration-limit, base gates green at b217254. Merged on factory/self: m3-liquid-land (5edf562), gates-wire (b6e8b01), gates-baseline-debt (42decf4), resume-hard-death (988ebb4). Spike checks-audit finished (R6 evidence). Parked: 17 (3 empty-diff on completed green work — m5-pack-plan, m3-debloat, turn-timeout-settle; 1 upscope derive-budget-gaps; rest historical).
- OMP ladder first spend: 19/19 implement+review turns on omp muse-spark-1.3-contributor:max, 0 fallback hops, 0 quota hits. Costs: architect $1.9874, implementer $0.3587, reviewer $0.0594, pm $0, digest unknown (beam-free 429'd, iteration proceeded).
- Debt closed: plan restructured to real deps (R1–R23 rows tasked, incl. R6/R23/acpx NO CODE/cross-harness); i19 wiring incident resolved by gates-wire. Forward: interrupt-and-relaunch test unblocked (resume-hard-death merged); p1 goals not ready (R7/R8 pending).
- Merge c4eaf11 into factory-v3. Gates 550/0 (first red was a missing bun install in the landing checkout — environment, fixed by install).

### 2026-11-15 — operator interrupt-and-relaunch test: R1 PROVEN
- Interrupt: SIGINT mid-dispatch (derive-budget-land implement r2 running, queue non-empty) → drain → exit 130, stop=interrupted, summary iterations/21/summary.md written.
- Relaunch, identical command (/tmp/self-i21b.log): first records are 00860 (m3-debloat-land implement r1) and 00861 (pack-plan-land implement r1), both iteration: 21, base 1d58e69, on the omp muse ladder. No new digest or architect records (only 00848/00849 from the first launch). Resume of the interrupted iteration confirmed.
- Base red at 1d58e696 (format + lint exit 1) recorded once by the run as pre-existing; journaled here as an incident for the architect.

### 2026-11-15 — iteration 21: 1 merged (m3-debloat-land), exit 3, $1.58
- First segment 31.5 min, exit 130 interrupted (operator SIGINT); resumed segment 15 min, exit 3. R1 proven: relaunch resumed iteration 21 with no new digest/architect (records 00860/00861, iteration 21, base 1d58e69).
- Merged: m3-debloat-land (ac5fa11). Parked new: derive-budget-land (empty-diff r2); pack-plan-land upscope — 8K cap removal built (capPack/maxBytes deleted, uncapped), parked on the over-cap test case outside scope (agent.test.ts); follow-up named in debt.
- Architect $1.4320 single turn; digest unpriced (beam 429). Base red format+lint at 1d58e696 pre-existing, not attributed. File-fence root cause verified in running prompts (m5-scope-area planned).
- Operator error: journaled R1 proof mid-run; containment flagged twice (00862, 00866, ok=true, tasks continued). Rule restated: no writes mid-run, journal included.
- Merge 37ff1e2. Gates 567/0 (first red: empty node_modules in landing checkout — environment, fixed by bun install, second time).

### 2026-11-15 — iteration 22: 5 merged, exit 3, $1.80 — 8K cap dead, file fence removed
- 80 min, stop=iteration-limit, base red format+lint at a48ec00 pre-existing. Merged on factory/self: base-green (4217086), review-findings-carry (9b7ba7d), derive-budget-finish (fc1173e), pack-uncap (239c4b8), m5-scope-area (40a9a6b). Pending: 17 (M4x2, M5x3, M6x4, +8).
- pack-uncap verified at landing: 0 occurrences of capPack/maxBytes/MAX_BYTES in src/kernel/context-pack.ts.
- OMP ladder green: 17/17 task turns on omp (muse/ernie), 0 fallback hops; only the digest died on beam-free 429 (mechanical tier, iteration proceeded).
- Notable parks: turn-timeout-land (base conflict flow.ts); steer-hold-nopark on an order/load-dependent E2E flake (584/1 full vs 58 pass isolated) — steered as an incident.
- Base-green verified at landing: format=0 (208 files), lint=0 (887 warnings, 0 errors). Merge 44bad3e. Gates 567/0.

### 2026-11-15 — iteration 23: 5 merged, exit 3, $4.05
- 2h04m, stop=iteration-limit, base gates green at 775f9a9. Merged on factory/self: delivery-guard-land (f654239), e2e-flake (08867c3), steer-hold-land (a45c415), m5-architect-horizon (e0f7da9), turn-timeout-cancel (1470416). Pending: 14 (M4x2, M5x3, M6x4, +5).
- OMP ladder green: 10/10 implement turns on omp, 0 fallback hops; digest died on beam-free 429 again (mechanical tier, iteration proceeded).
- Costs: architect $3.2482 (highest single-turn spend of the campaign — flag, under the $5 stop line), implementer $0.7356 (incl escalation $0.3540), reviewer $0.0652, pm $0.
- Debt closed: over-cap test + packTruncated flag; format baseline debts. i22 flake incident closed by e2e-flake.
- New incidents steered: acpx-config-only (empty-diff r1 after red checks); checks-prune (full-suite-only red after green targeted suites — third flake-shape case).
- Merge 4448ace. Gates 580/0.

### 2026-11-15 — iteration 24: 0 merged, exit 3, $1.76 (first 0-merge since i18; watch, not stop)
- 35 min, stop=iteration-limit, base gates green at e3c7641. factory/self == factory-v3: nothing to merge. 6 records: digest $0 (beam leg worked this time), architect $1.7125, PM $0 (ernie), fake-script-keyed implement/commit/park.
- fake-script-keyed parked FAILED: per-file + 1 full suite green (622/0), but the turn-timeout budget cut the turn before the done-when's rerun-each-20 stress + 5x full-suite + gates evidence finished. Plan gates acpx-config-land and checks-prune-land behind it; park ended the dispatchable set honestly.
- i23 incidents still open: acpx-config-only (empty-diff after red), checks-prune (full-suite-only failure). Parked: 25. Pending: 17 (M4x2, M5x3, M6x4, gate-flake-rerun, acpx-config-land, checks-prune-land, pm-store-debt, resume-repair, steer-pm-routing, retired doc-drift).
- Assumption recorded: gate-flake-rerun adds bounded gate re-run (evidence records 00990/00992/00996/00997) — planning, no INTENT contradiction. Forward: fake-script-keyed first, then checks-prune-land, acpx-config-land, gate-flake-rerun; PM cancel retired doc-drift; p1 goals not ready (R7/R8 wait on acpx-config-land via m4-trivial-session).
- OMP ladder green (muse:max, ernie), 0 fallbacks, 0 quota hits. Inbox empty (steer-i24 processed).

### 2026-11-15 — iteration 25: 0 merged, exit 3, $0.53 — STOP RULE (2nd consecutive 0-merge)
- 16 min, stop=iteration-limit, base gates green at f1516c0. factory/self == factory-v3: nothing to merge. 7 records: digest $0 (beam worked), architect $0.5190, PM $0 (ernie), fake-script-keyed-land base-advance/commit/implement/park.
- fake-script-keyed-land parked FAILED: implement r1's outcome was invalid YAML (agent emitted a nested `summary:` inside the `summary: >` block; "Nested mappings are not allowed in compact mappings, line 2 col 10"); 1 outcome-repair turn did not save it. Kept branch work survives (f20fce0 + land branch).
- Kept-work note: i24 parked the 13-file f20fce0 tip on budget; i25 parked its -land continuation on a malformed outcome. Two parks, same gate task, different causes — neither is a code defect in the work itself.
- Ladder green (muse/ernie), 0 fallbacks, 0 quota. Assumptions: none. Owner attention: none. Inbox was empty.
- STOP: 0-merge count = 2 (i24 budget-cut park, i25 malformed-outcome park). Journal + steer + pin refresh only; NO relaunch until owner decides.

### 2026-11-15 — operator unblock after i24+i25: 4 h turn walls live, PM/repair ruling steered
- Owner ruling: (1) up to 3 repair turns, keeping the exact verification message; (2) the PM resolves 0-merge iterations automatically — authority to raise per-item timeouts and order extra repairs within the whole-item budget. Steered as steer-i26-zeromerge.md (binding requirements; rest is the architect's).
- Verified in code before acting: timeouts are a per-alias run-config knob (config.ts:117, defaults 60m wall/20m idle, types.ts:167-170), no preflight value check; repairs hardcoded to exactly 1 (agent.ts:273-303); the repair prompt already embeds the full validator message with line/col (outcome.ts parseOutcome → delivery-repair findings); task schema has no timeout/retry fields and the PM prompt has no budget authority (architect work).
- Correction to the i24 triage: turn 01004 ended stop=done after 14m52s — the agent stopped itself and declared its done-when unproven, not a wall-clock kill. The 1 h wall stands as genuinely restrictive for 20x-rerun tasks regardless.
- bootstrap/run/self-quota.yaml: wallMs 14400000 (4 h) on architect/implementer/reviewer/escalation; validated through the kernel loader (idle 1200000 default retained). Takes effect on the relaunch.

### 2026-11-15 — iteration 26: 1 merged (repair-turns), exit 3, $1.47 — 0-merge streak broken
- 52 min, stop=iteration-limit, base gates green at 945a9e8. Merged on factory/self: repair-turns (7dc3631, 696 lines + 388-line agent.test.ts). Pending: 18 (fake-script-keyed-final, pm-stall-resolve, acpx-config-land, checks-prune-land, M4x2, M5x3, M6x4, +4).
- Owner ruling part 1 BUILT and verified at landing: REPAIR_TURNS=3 (agent.ts:67), task-file repairTurns override, loop capped by item budget, exact verification message kept. Part 2 (PM auto-resolve) planned as pm-stall-resolve; budget accounting recorded (whole-item = itemTurns, repairs charged to it).
- OMP ladder green, 0 fallbacks, 0 quota. Costs: architect $1.3757, implementer $0.0754, reviewer $0.0178. Steer-i26-zeromerge processed.
- Notable parks: checks-prune failed; acpx-config-only empty-diff-after-red (i23 incidents still open). Debt: doc-drift retirement loop (plan names the slug so PM cancel reads it as carried — third request).
- Merge 1c2a97c. Gates 620/0. Stop-watch reset.

### 2026-11-15 — iteration 27: 1 merged (continuation-carry), exit 3, $0.77
- 32 min, stop=iteration-limit, base gates green at fdb1d1b. Merged on factory/self: continuation-carry (e9f035e: derive-task +44, flow +10, types +4, 423 lines of tests) — creation base-advance records now carry the head tree; the remover for the continuation empty-diff park.
- Parked 28; new notable: fake-script-keyed-final empty-diff (implement 01020 no code change needed, foreground stress 660/0 in 257s, checks 01023 green; parked on continuation-first-turn vs post-advance comparison — the shape continuation-carry removes; Debt opened names it the kernel's 4th park-that-discards-finished-work pattern) and fake-script-keyed-review base-conflict (resume-iteration.test.ts).
- Repair machinery live but untriggered: incidents show 1 outcome-repair turn, no multi-attempt implement. REPAIR_TURNS=3 stands ready, unproven.
- Legs: implement+review omp muse (task-grade, same-family); PM ernie :free; digest beam $0 worked. 0 fallbacks, 0 quota. Costs: architect $0.7388, implementer $0.0207, reviewer $0.0059.
- Merge 7a2505d. Gates 638/0.

### 2026-11-15 — owner INTENT.md update synced (main, uncommitted text carried)
- Sections changed (owner's words, carried verbatim): preamble (dropped "Authoritative owner intent; replaces manifesto.md"); Intent line (added observable; "no size ceiling"); Model economics moved up under Intent; new "Context and focus is as important as model tier/diveristy" (smaller-model degradation on complex/contradictory context, focus over tier; same-model review incl. smaller-reviewing-larger; smarter actor must make results AND motivation understandable to small actors); new "Role of agents/models" stub (one line, owner still editing).
- Sync: cp main→v3, blob 17bbf30d verified equal both sides. Owner text on MAIN left uncommitted (standing instruction still open). Intent-change steer names the sections for the architect.

### 2026-11-15 — iteration 28: 1 merged (m6-record-metrics), exit 3, $2.03
- 67 min, stop=iteration-limit, base gates green at 483bee7. Merged on factory/self: m6-record-metrics (912f163, 17 files: per-model cost/work recording). Pending: 16 (acpx-config-land, checks-prune-land, gate-flake-rerun, M4x2, M5x3, M6x3, pm-stall-resolve, pm-store-debt, resume-repair, steer-pm-routing).
- Owner INTENT steer (steer-i28-intent) processed: plan now requires task files carry the bullet's why. New sections did not otherwise reroute planning.
- doc-drift retired: plan no longer names the slug, PM cancel path closed the loop.
- Legs: implement+review omp muse:max, PM ernie, digest beam $0 worked. 0 fallbacks, 0 quota. Costs: architect $1.7562, implementer $0.2547, reviewer $0.0188.
- Notable parks steered: fake-script-keyed-apply (budget-vs-evidence, 3rd instance); continuation-conflict (architect-created task empty-diffed).
- Merge eb531de. Gates 648/0. No owner INTENT changes (be9affe all sides).

### 2026-11-15 — iteration 29: 1 merged (gate-flake-rerun), exit 3, $1.66
- 63 min, stop=iteration-limit, base gates green at a384e68. Merged on factory/self: gate-flake-rerun (4abb81d, 7 files: bounded gate re-run). Pending: 15.
- Budget-vs-evidence steer landed in planning: plan rule added (no done-when asks for proof longer than one foreground tool call; suite proof is the script checks step), no-base continuations created, gate-flake-rerun moved first. Steer-i29-parks processed.
- Parked 32; new: fake-script-keyed-merge + continuation-conflict-land, both empty-diff-after-red-checks (same shape as acpx-config-only).
- Legs: implement+review omp muse:max, PM ernie, digest beam $0 worked. 0 fallbacks, 0 quota. Costs: architect $1.5341, implementer $0.0929, reviewer $0.0285.
- Phase 1 open: R6, R7/R8, R10, R11, R14, R18-R23. Forward: merge/conflict-land first, then acpx-config-land, checks-prune-land, pm-stall-resolve, gate-flake-rerun; advance pin after continuation-conflict-land (base-conflict removal needs the running pin).
- Merge 0da85c8. Gates 653/0.

### 2026-11-15 — owner INTENT.md update synced (3 commits, all committed on main)
- f6a4ca9, c2da999, d63b1f9 "owner edit to Intent", HEAD blob 19138d0. Synced byte-for-byte, hash verified. Sections: Model diversity level (different models per flow step; switch on retry, esp. in reused-compact harness); Role of agents/models completed (architect = frontier models, decides what-to-do without new debt, saga via subarchitects, doubles as reviewer of net changes; iteration job = full DAG/milestones + uncertainty callouts; reviewer frontier-or-task with fresh context; task-level roster incl. DeepSeek v41/Muse/Ember/Luna/Haiku/Gemini Flash/Hydrogen; PM owns plan implementation/artefacts/DAG/splits/steers, not technical; task types spike/dev, config-driven flows, kernel knows spike-vs-dev; merge agent; plan checker as task-level gatekeeper; triage pointer); Escalation ladder retitled (triage); Iteration (mid-iteration consult line replaced by bounded plan-checker repeats); compaction note (cold-retry savings, compacted-session reuse); Saga "consults"→"concerns"; Steering config-driven = criteria in config via templates; config layers reword (task types via model aliases, local harness/model/fallbacks, omp transient); acpx-no-code enabler line; Operating sandbox out of scope; Reuse-from-v2 + loop-cause lines deleted (only over-prescription line kept); LSP rule = validation command first, LSP if supported, harness-agnostic artefact config, test at least omp; bootstrap legs (claude = architect/escalation only; multi-architect omp-vs-codex test matrix; use free models when available; shift config as soon as a combination is supported); omp rotation/fallback as kernel-fallback test; new Stack section (TS linted/formatted/complexity+interface-separated; minimize .sh; ZERO real logic in sh).
- Intent-change steer names the sections for the architect.

### 2026-11-15 — iteration 30: 12 merged, exit 3, $3.05 (interrupted + relaunched idempotently)
- First segment SIGINT-interrupted mid-dispatch (session branching, unintended); relaunched identical command: lock takeover, recovery closed 3 interrupted records as infra:crash, NO new digest/architect, crash-closed turns (01122, 01132, 01134) re-dispatched as fresh r1 turns, no orphans/duplicates. Relaunched segment 2h51m. R1 holds on a real unintended interrupt; recovery is whole-turn re-execution (coarse, full re-run cost — owner's early-Phase-1 bug item stands).
- Merged on factory/self (dc956fc..afcaf51): acpx-config-land, fake-script-keyed-ship, continuation-conflict-ship, m4-trivial-session (R7), flake-fix, validate-cmd, checks-prune-land, m4-standalone-upscope (R8), pm-store-debt, m6-compaction, m6-done-distance, steer-pm-routing. Spike artefact-lsp finished. Pending: 6 (m5-plan-checker, m5-plan-review, m5-steward, m6-provider-concurrency, pm-stall-resolve, resume-repair).
- REPAIR_TURNS=3 used live: 13 outcome-repair turns. Legs: all task turns omp muse:max; digest beam $0; 0 fallbacks, 0 quota. Per merged task $0.254.
- Owner's incomplete-iteration bug IS routed: resume-repair.md + pm-stall-resolve.md exist with deps. Assumption: Model-diversity + Stack treated as after-Phase-1 (Phase1.md unchanged); new code follows Stack now; reversible.
- p1-trivial/p1-task UNBLOCKED (both m4 rows merged). Operator launches next per runbook order.
- Merge 35100f4. Gates 657/0.

### 2026-11-15 — owner INTENT.md agentic review synced (committed on main)
- a419e2e + 76cc54f "Interactice agentic review of AGENTS.md", HEAD blob 34b52d4. Synced byte-for-byte incl. new bootstrap/context/built-vs-intent.md. Sections: preamble Concerns-exception rule; model-economics (plan reviewer is config; prices via harness/OpenRouter+cache, nothing hardcoded; concurrency cross-ref); polished Context-and-focus (+consequence: planning/review may go to task tier), Model diversity (config aliases), Role of agents (schema demarcation: kernel's fixed schemas, task types name theirs); Iteration (finishes within one launch; bounded plan-checker repeats folded in); compaction reword; shared architect/subarchitect fragments; reviewer prompt includes author prompt whole (plan reviewer incl.); consolidated intent-change rule (latest wins, diff+steer record); config layers by concern (aliases-only process config, nothing hardcoded); copy-paste linter + dead-fragment checks; harness rewords (direct layer only on measured ACP loss); sandbox documented/out-of-scope; LSP rule polished; bootstrap legs rewritten (plan reviewer muse:max; explicit effort, no `highest` keyword; cross-harness retry testing); Stack scoping (lint-enforced for factory code, preference for targets); glossary iteration; ~20-item Concerns and contradictions register (file:line evidence; delete-on-fix rule).
- Intent-change steer names the sections for the architect.

### 2026-11-15 — p1-trivial first launch died on quota (config, not the goal)
- exit 1 infra, 0 iterations, $0: front turn (record 00002, pm alias, ernie :free:high via omp) hit 429 free-models-per-day-high-balance (retry-after ~3h) on all attempts, 0 tokens, no outcome. No classification happened.
- Root cause: pm alias had no fallbacks — a single point of quota failure for every goal start (front turns use the pm alias). Fix in operator territory: fallbacks [deepseek-v4.1-flash, muse-spark-1.3-contributor] added to the pm alias; loader-validated (effort inherited per alias, muse+deepseek list high). Relaunching p1-trivial on the fixed config.

### 2026-11-15 — p1-trivial DONE (R7 proven live), $0.034
- exit 0, done, 18 min. Class trivial; front (00004) and implement (00005) share omp session 01a1e101-3851-73b8-83a8-5f2bf247ac9e; no architect, no reviewer. Front hit ernie 429s, pm fallbacks fired to deepseek (fix verified live).
- Merged caps-fork-prune (f856fa0): Caps.fork 0 occurrences in src/harness (type + 4 adapters + 1 test line). 6 files, +1/-7.
- Debt opened (correct): INTENT.md:255 "Caps advertises fork" now stale — task did not touch owner file; owner's call to reword.
- First launch died on quota (pm alias fallback-less); fixed (5661911), relaunched, done. Merge c929f42. Gates 722/0.

### 2026-11-16 — p1-task DONE (standalone path proven live), $0.037
- exit 0, done, 19 min. Class task (omp-cache-retention); front→implement→commit→checks→review→commit→merge-checks→merge→front-stop (10 records), no architect. Implement+review omp muse:max (task-grade, same-family); front deepseek via pm fallbacks.
- Merged omp-cache-retention (8536b12): TTL as run-config key (sessions.retention short/long, default short) through overlay/runtime/turn + tests (overlay, resume, config, live-run-configs). 17 files, +117/-10. No parks, no debt.
- Merge 0a30c65. Gates 722/0.

### 2026-11-16 — owner INTENT.md updates synced (2 commits)
- 2a7f2b9 (361d26ca): consolidation pass — header/path/wording fixes; "Roles of agents and models" retitle; architect-reviewer→plan-reviewer; Haiku "limited use"; plan checker "checks/net positive gain"; standalone review "repeats the shared definition"; iteration/relaunch rewords; top architect; task reviewer task-tier; behavior spelling; decision-vs-block config-driven reword; config-layer, stack and glossary changes (+Front agent, Boundary, Park/kept branch, Operator, Pin; .sh pruning).
- 195157e (4aed788, edited mid-landing): specify-every-specifiable-task-now (+saga down-to-epics); Merge agent→Steward (merge agent) with Iteration cross-ref; trivial/task iteration definition (front classification + implementation, no architect); compaction reload scoped to same agent's next turn; new-iteration vs interrupt-resume split (resume doesn't involve the architect); architect-involvement rule (decision-needed only; intent amendments carried first, PM marks precluded tasks blocked/mooted, may end iteration early; urgent mid-iteration pull is the exception); next-iteration (not next-launch) architect view.
- Both synced byte-for-byte, hashes verified. Intent-change steer names the sections for the architect.

### 2026-11-16 — iteration 31: 5 merged, exit 3, $3.80
- 102 min, stop=iteration-limit, base gates green at cbf483a. Merged on factory/self: gate-fix-empty (5a9e12f), prompt-dead-api (0ab0ff7), checks-evidence (b32152c), m5-kept-land-ship (3ec4015), review-session-resume (c09da05). 69 records. Pending: 10 (m5-plan-checker, m5-plan-review, m5-steward, m6-provider-concurrency, pm-stall-resolve, prompt-debloat, prompt-schema-render, resume-repair, reviewer-author-prompt, steer-intent-moot).
- Owner INTENT steer processed: m5-plan-checker rewritten as gatekeeper (verdict progress|architect); new plan section P (5 prompt tasks); owner-concerns assumption (concerns without Phase1.md requirement stay after Phase 1 — reversible); LSP rollout retired from Phase 1 (R16 met by validation command).
- Legs: implement+review omp muse:max (20 turns); PM ernie→deepseek fallback fired once ($0.035); digest beam $0 unpriced. 1 fallback hop, 0 quota. Costs: architect $3.2125 (2nd $3+ turn), implementer $0.4884, reviewer $0.0629, pm $0.0350.
- Parked: prices-openrouter (empty-diff after red schema check); prompt-single-defs (item budget exhausted, 8 turns).
- Merge ec30d9c. Gates 728/0.

### 2026-11-16 — owner INTENT.md review synced (2 commits)
- d4ddb0e "owner: INTENT.md review — wording decisions, Observed lines, concerns as of i30" + 7eb8fb8 "owner: INTENT.md — debt evaluation is the architect's, agentically". HEAD blob ad51159. Synced byte-for-byte, hash verified.
- Sections: language-agnostic rule; realistic cost doctrine (measure where feasible, no exact accounting beyond self-improvement analysis; street pricing/subsidies alter structure; reported cost misleads); relaunch digest still runs → PM as steer; any-model review incl. author's own; PM environment notes; red-gate agentic judgement by reviewer; local config holds machine/subscription specifics; per-subscription concurrency + serial merges + parallel gates in isolated worktrees (+serialized integration tests); debt evaluation is the architect's (agentically); clean-code wording; Observed lines (overlay defaultThinkingLevel low in code; 237 compactions unrecorded cost; acpx never compacts; 0/409 turns off omp/OpenCode; same-model implement+review every iteration); concerns refreshed as-of-i30 with hierarchy-enablement section.
- Intent-change steer names the sections for the architect.

### 2026-11-16 — reboot killed i32 pre-dispatch; reviewer rotated to agy; relaunching
- Unrelated computer reboot ~12 min before the check wiped /tmp and killed PID 556919. i32 never wrote a record (last record i31's 01303) or iterations/32 — relaunch starts the iteration fresh; stale-lock takeover (if any) is the idempotence evidence.
- Rotation (operator run-config territory): reviewer role omp/muse → agy/gemini-3.8-flash:high (4 h wall kept). Why: owner's Observed line (0 of 409 turns on agy despite a paid subscription); agy is supported (adapter merged i17, CLI proven) + live; 2nd in the owner ladder (task-grade rule kept); exercises cross-harness diversity (implement omp/muse, review agy/gemini). omp muse chain kept as reviewer-omp switchback. No fallbacks on the agy alias (same-harness rule, single model).
- Owner INTENT 49cd78f synced (d1fa4e7, committed on MAIN, hash verified) + steered.

### 2026-11-16 — i32 landed: 10 merges, 1 park; staged applied; rotation next
- Exit 3 (iteration-limit), 4h57m wall. factory/self +10: schema-gate-tree, prompt-defs-structure, prices-openrouter-land, prompt-defs-dedupe (r1 changes → r2 merged), m5-steward (R10), pm-stall-resolve (owner-ruling-2), m5-plan-checker, m6-provider-concurrency, resume-repair, steer-intent-moot. 1 park: prompt-schema-render (01367) — exported gates 828/2; F1 fixed in-tree (frontVars fixture missing class_flows); F2 = agent.test.ts:574 delivery-guard (schema-rendered repair prompt still contains verdict: lines) missed in-turn because gate output went through tail -25 (steered as observation).
- Legs: digest beam-free:max quota-failed 3/3 (429, zero usage), no run impact, no fallback configured (standing-rule gap, closed at rotation). Architect omp/opus-5-5:high $1.47 (1 infra retry absorbed). PM omp/ernie-free $0. Implements 10 omp/muse-spark:max. Reviews 9/9 +2 r2 agy/gemini-3.8-flash:high unpriced — rotation spent every review. Cost $2.82 kernel ($1.47 architect + $1.35 implementer), list $7.90, 26 turns; informational only ($5 rule dropped per owner).
- Applied staged (guards passed, MAIN unchanged d1fa4e7): INTENT acpx-justification line + fallbacks-with-effort delta; runbook $5 clause dropped.
- Steers for i33: opencode-adapter justify-or-generic (improvements-vs-acpx shape); gate-truncation observation (01367 tail -25).

### 2026-11-16 — rotation for i33: all six harnesses, fallbacks on every alias
- Probes (all live, 2026-11-16): beam-free + Go/muse via opencode CLI (i32 quota-fail was transient; 2nd Go sub unblocked); pi, codex, claude via acpx incl. --model routing (pi default opencode-go/deepseek-v4.1-flash; codex catalog deepseek+muse bare slugs; claude ids incl. opus, effort key `effort`); agy spent all i32 reviews.
- New map: architect claude-code/opus:high (fb sonnet, fb2 omp/opus proven chain), pm omp/ernie-free (fb Go/deepseek, Go/muse), digest opencode/beam-free:max (fb Go/deepseek via CLI — mandatory fallback closed), implementer pi/Go-deepseek:xhigh (fb pi-Go/muse, fb2 opencode/Go-deepseek = owner pi→opencode target), reviewer codex/deepseek:high (fb codex-muse), escalation omp/sonnet (fb omp-Go/muse). agy binding kept, alias returns in a later rotation.
- i32 built the fallback intent in-tree without being asked: fallbackSchema {harness?, model, effort?, subscription?} (cross-harness + effort-bearing), prices → priceIds (OpenRouter matching), concurrency object. Config migrated to the new schema, loader-validated.

### 2026-11-16 — i33 landed: 3 merges, 1 park; first cross-harness fallback fired
- Exit 3 (iteration-limit), 2h42m wall. factory/self +3: prompt-schema-render-land (01432's F2 at agent.test.ts:574 consumed; verdict-shape removal completed), opencode-acpx (bespoke src/harness/opencode/* deleted, -1954 lines; opencode now via generic acpx raw `opencode acp`), gate-handoff (kernel tests gate-names/fail lines — answers the tail-25 incident structurally). 1 park: reviewer-author-prompt (01432) — failed, r2 landed no change (tree clean at r1 commit), all 3 r1 findings remain.
- Rotation verdict (all legs spent except agy): digest opencode/beam:max DONE first try $0 (i32 quota-fail transient); architect claude-code/opus:high attempt1 done, then 2 infra crashes (opus + sonnet, same session, cause `crash`, details `agent connected`) → omp/opus fb2 DONE $1.14 — first cross-harness fallback fired, saved the turn; PM omp/ernie $0; implements 7/7 pi/Go-deepseek:xhigh (unpriced); reviews 6/6 codex/deepseek:high (~$0.001-0.002 each via OpenRouter matching; 3 changes r1 → 2 revised approve r2); steward skipped mechanically (no conflicts → agy 0 turns). Cost $1.1471 partial (8 unpriced), list $0.28, 16 agent + 30 script turns.
- Landing incident (operator-caused): merged tree red 1/849 — `resolves every model id: self-quota.yaml`: bare `opus` (my i33 rotation) matches no OpenRouter id. Fixed in operator territory: priceIds opus/sonnet → anthropic/claude-opus/sonnet-5-5. Lesson: loader-validate is not enough for run-config edits — also run the 100 ms live-run-configs test file from now on.
- Opencode binding effort levels wrong as merged ([low..max]); live only none/high/default. Operator corrected live config to high (digest + opencode fallbacks); steered for the other shipped configs.
- Steers for i34: arch-crash observation (01390); opencode-effort observation.

### 2026-11-16 — rotation for i34: wheel turns (omp-arch, codex-impl, pi-review, agy-PM)
- Map: architect omp/opus:high (fb claude-code/opus = reverse cross-harness test, fb2 claude-code/sonnet), pm agy/gemini:high (fb pi-Go/deepseek; agy guaranteed spend after i33's 0 turns), digest opencode/beam:high (fb Go/deepseek; high is opencode-acp's real max — `set effort max` rejected live), implementer codex/deepseek:max (fb codex-muse; max catalog-supported + set-verified), reviewer pi/Go-deepseek:xhigh (fb pi-Go/muse; mirror keeps cross-harness review), escalation omp/sonnet (fb omp-Go/muse), steward pi/Go-deepseek:high (fb pi-Go/muse).
- opencode binding levels corrected to live truth [none, high, default] (merged [low..max] rejected by installed 2.2.7; steered for other shipped configs). Loader + price-coverage green before commit (new lesson applied).

### 2026-11-16 — i34 landed: 4 merges, 1 park; acpx debt closed; agy spends priced
- Exit 3 (iteration-limit), 3h02m wall. factory/self +4, all closing opencode-acpx debt: acpx-compact (server compaction via acpx), acpx-crash-exit (crash details captured — answers 01390's truncated `agent connected`), acpx-preflight-live (effort levels learned live; `levels` removed from all six run configs + schema), acpx-pi-usage (delta usage scheme for pi's usage-less reports). 1 park: reviewer-author-land (01454) — budget exhausted after 8 turns on the escalation alias (PM climbed from parked 01432; 3x omp/sonnet $0.44).
- Rotation verdict (wheel-turned; nothing rested): digest opencode/beam $0 DONE on the generic acpx route (production proof); architect omp/opus $2.12 single attempt, claude-code fb unneeded; PM AGY/gemini $0.92 priced (5.47M tokens matched to google/gemini-3.8-flash — agy spends real money); implements 6 codex/deepseek:max ~$0.001-0.002 each + 3 escalation omp/sonnet; reviews 7/7 pi/Go-deepseek unpriced (pi reports no usage; delta scheme now in-tree for future turns); steward skipped again (no conflicts, 2nd iteration). NO fallbacks fired, 0 infra retries, 0 outcome-repairs. Cost $3.48 partial (7 unpriced), list $1.24, 19 agent + 39 script turns.
- Flag for owner: INTENT.md:290 still names OPENCODE_PATH, removed from code by opencode-acpx — factory proceeds without edit; needs owner intent sync on MAIN (standing rule applies at next landing).
- No steers for i35: no incidents, no new observations; park 01454 is routine budget-exhaustion.

### 2026-11-16 — rotation for i35: wheel turns back (A-shape: claude-arch, pi-impl, codex-review, omp-PM)
- Map: architect claude-code/opus:high (fb sonnet, fb2 omp/opus proven chain — 2nd data point on claude reliability after i33's crashes), pm omp/ernie-free (fb Go x2), digest opencode/beam:high (fb Go/deepseek), implementer pi/Go-deepseek:xhigh (fb pi-Go/muse, fb2 opencode/Go-deepseek = pi→opencode target), reviewer codex/deepseek:max (fb codex-muse; max = highest supported, production-proven i34), escalation omp/sonnet (fb omp-Go/muse), steward agy/gemini:high (fb pi-Go/deepseek; agy gambles after spending $0.92 in i34). Harness block untouched (levels-free + compact flags as merged). Loader + price-coverage green before commit.

### 2026-11-16 — i35 landed: 1 merge, 1 park; claude-architect double-crashed again
- Exit 3 (iteration-limit), 51m wall — thinnest iteration yet (5 agent + 8 script turns). factory/self +1: scouts-check-consumer (answered the operator steer in-iteration: checkScouts moved from architect-harness to omp; scouts-with-no-omp = pre-flight error). 1 park: reviewer-author-review (01498) — item budget exhausted after 8 turns with no implement/review records (reviewer-author family now parked 3 iterations running: 01432 → 01454 → 01498 — watch item).
- Legs: digest opencode/beam $0 DONE (generic acpx 2nd production proof); architect claude-code/opus attempt1 done-but-discarded ($2.63, 22910 out, outcome-repair) → attempt2 opus INFRA CRASH exit 5 → attempt3 sonnet INFRA CRASH exit 5 → omp/opus fb2 DONE $0.44 (2nd outing, 2nd double-crash, 2nd fallback save; crash details now captured via acpx-crash-exit); PM omp/ernie $0; implementer 1 turn pi/Go-deepseek $0.0263; reviewer 1 turn codex:max $0.0015; steward skipped 3rd iteration (agy 0 turns). Cost $3.10 partial, list $0.19. 2 fallback hops, 1 outcome-repair, 0 conflicts.
- PATTERN (reported to owner): claude-code as primary architect is 2/2 on double infra-crashes (i33, i35), ~$3 wasted per outing before the omp fallback delivers for <$1.50. i36 B-shape routes architect back to omp (already planned); claude-primary suspended pending owner call. Crash evidence in-tree (record 01495 attempts + acpx-crash-exit details).
- Landing operator actions (per task + debt): scouts block restored (validated vs omp at pre-flight from the new pin), stale comment dropped, answered steer removed from inbox. No steers for i36.

### 2026-11-16 — rotation for i36: B-shape (omp-arch, codex-impl, pi-review, agy-PM); claude-primary suspended
- Map: architect omp/opus:high (fb claude-code/opus, fb2 claude-code/sonnet — fallback only), pm agy/gemini:high (fb pi-Go/deepseek), digest opencode/beam:high (fb Go/deepseek), implementer codex/deepseek:max (fb codex-muse), reviewer pi/Go-deepseek:xhigh (fb pi-Go/muse), escalation omp/sonnet (fb omp-Go/muse), steward pi/Go-deepseek:high (fb pi-Go/muse), scouts ernie restored. Loader + price-coverage green before commit.

### 2026-11-16 — i36 landed: 4 merges, 0 parks, queue EMPTIED; claude forensics in
- Exit 3 (iteration-limit), 3h53m wall. factory/self +4: compact-hot-end, reviewer-author-apply (r1 changes 01517 → r2 approve 01526 — the 4-name saga ENDS: prompt → land → review → apply), m5-plan-review (r1 changes 01533 → r2 approve 01538 + debt), prompt-debloat (r1 approve 01546). ZERO parks, pending 0 — queue emptied for the first time.
- Legs: digest opencode/beam $0 DONE; architect omp/opus $1.44 single attempt, fb unneeded; PM agy/gemini $0.53 priced; implements 6 codex/deepseek:max ~$0.01; reviews 6/6 pi/Go-deepseek:xhigh $0.16 PRICED (delta usage scheme works — first priced pi turns); steward stub skipped 4th (no conflicts). Cost ~$2.14 FULLY priced (no unpriced turns). 0 infra retries, 0 fallback hops, 1 minor outcome-repair, 0 conflicts, 0 gate flakes.
- Forensics (owner-ordered, task agent): claude "crashes" (01390, 01495) all completed per acpx journals (end_turn + turn_result completed); classifyAcpxTurn judges exit facts alone, never reads journals; i35 attempt1 $2.63 discarded on all-refused Edit/Write (permission loop). Steered with evidence; cheapest proof supplied (exit-5-after-end_turn stub).
- Applied staged review-round-trip INTENT line (guards passed, MAIN unchanged 74cb1c05) + steered. Operator fix: claude-code binding gains --approve-all (agy precedent).
- Steers for i37: review-reply (intent-change) + crash-verdict (observation). Budget steer still awaiting owner word — NOT steered.

### 2026-11-16 — rotation for i37: B-shape repeats + claude-code --approve-all (forensics fix)
- Same map as i36 (claude-primary reinstatement awaits owner call): architect omp/opus (fb claude-opus/sonnet), pm agy, digest opencode/beam, implementer codex:max, reviewer pi:xhigh (+ plan-reviewer pi from m5-plan-review), escalation omp/sonnet, steward pi, scouts ernie. New: claude-code binding gains args [--approve-all] (agy precedent) — answers the i35 attempt1 all-refused cascade ($2.63) at the operator level; kernel journal-blindness steered. Loader + price-coverage green before commit.

### 2026-11-16 — i37 landed: 4 merges, 0 parks; both steers became tasks
- Exit 3 (iteration-limit), 2h26m wall. factory/self +4: acpx-completed-exit (parsed end_turn frame now wins over later nonzero acpx exit — exactly the forensics recommendation; crash-verdict steer consumed), state-decl-single, review-reply (author change-and/or-reply path in prompts + derive-task + flow-context — the staged intent line consumed), plan-roles-required. ZERO parks, pending 0.
- Legs: digest opencode/beam $0 DONE; architect omp/opus $2.71 single attempt, 55k out (planning-heavy from the emptied queue, as predicted), fb unneeded; plan-reviewer pi/Go-deepseek $0.045 (NEW role live first time); PM agy/gemini $0.45 priced; implements codex:max ~$0.001; reviews pi:xhigh ~$0.018, all 3 approve r1; steward stub skipped 5th (no conflicts). Cost $3.28 across 12 priced turns. 0 infra retries, 0 fallback hops, 0 conflicts, 0 gate flakes; 1 minor outcome-repair.
- No steers for i38: no incidents, no new observations. Budget steer still awaiting owner word — NOT steered (3rd iteration).

### 2026-11-16 — rotation for i38: B-shape repeats a third time (comment-only)
- Same map (claude-primary reinstatement still awaiting owner call; acpx-completed-exit fix in pin 9b5a0f2a4a34, verifiable only by a future claude-primary outing). Loader + price-coverage green before commit.

### 2026-11-16 — i38 landed: FIRST 0-merge (stop counter 1/2); Go monthly quota exhausted
- Exit 3 (iteration-limit), 34m wall. factory/self +0 commits — nothing to merge. 2 parks: child-group-scope + child-group-scope-land (both `failed: invalid outcome: no outcome after repair`); plan-review-missing + plancheck failed the same way; 12 outcome-repair turns; pending 0; inbox empty.
- ROOT CAUSE (external, proven by live probe): OpenCode Go MONTHLY limit exhausted (resets in ~14d). Every Go turn (all codex implements, all pi reviews/plancheck/planreview) got 429 `exceeded retry limit` delivered as agent text with end_turn/completed — trusted as done by the new completed-exit logic (journal e.g. eebf7b65: codex reconnect 4/5→5/5 429). Non-Go legs all worked: digest beam $0, architect omp/opus $1.21, PM agy $0.66 (2 turns). Cost $1.88 partial.
- Secondary kernel issue (steered): 429-as-completed-text should classify quota/infra with a fallback hop, not done + wasted repairs. The completed-exit fix has a hole: transport 429 arrives as completed text, not an error frame.
- Gates skipped this landing: 0 code delta since green pin 9b5a0f2a4a34 (factory/self == factory-v3); no promote (pin unchanged). Rotation reroutes OFF Go for ~14d (see next entry).
- Steer for i39: 429-as-completed observation. Budget steer still awaiting owner word — NOT steered (4th iteration).

### 2026-11-16 — rotation for i39: EMERGENCY off-Go (quota resets in ~14d)
- Map: architect omp/opus (fb claude x2), pm agy/gemini (fb omp/ernie), digest opencode/beam (fb opencode/hy4-flash-free, probed live 9.5s), implementer agy/gemini (fb omp/ernie), reviewer omp/ernie (fb agy/gemini), plan-reviewer + plan-checker agy/gemini (fb omp/ernie; checker mirrors reviewer per coverage test), escalation omp/sonnet (fb omp/ernie), steward omp/ernie (fb agy/gemini), scouts ernie. Zero Go ids in aliases. hy4 maps to the $0 beam price row.
- Evidence: pi settings show Go-only provider (pi-opencode-go-provider extension, 3 Go models); codex config.toml Go-only auth; `pi models` 429s with "monthly, resets in 13d 23h". pi + codex sit out; bindings kept for the revert. muse-vs-deepseek paused.

### 2026-11-16 — i39 landed: 1 merge, stop counter RESET; off-Go reroute verified
- Exit 3 (iteration-limit), 1h53m wall. factory/self +1: child-group-sentinel — NOT 0-merge, stop counter resets to 0. 1 park: acpx-zero-usage (review-rejected round 2: r1 findings 1-4 resolved, review cited failing-test evidence — review working as designed, not a failure). Pending 0; inbox empty; 429 steer consumed with outbox receipt.
- Legs (emergency rotation verified): digest beam $0; architect omp/opus $1.12 single attempt; PM agy $0.35; planreview agy $0.86; plancheck agy $0.70; implements 4 agy/gemini ($6.21 — real subscription money); reviews 4 ernie $0; steward skipped 6th (no conflicts). 0 Go turns — reroute held; no agy rate-limit hits. Cost $9.23 fully priced (informational only). 1 routine infra retry, 0 fallback hops, 3 outcome-repairs, 0 conflicts, 0 gate flakes.
- No steers for i40: no incidents. Budget steer still awaiting owner word — NOT steered (5th iteration).

### 2026-11-16 — rotation for i40: off-Go map repeats (comment-only bump)
- Same emergency map, verified in i39. Price-coverage green before commit.

### 2026-11-16 — i40 landed: 2 merges, 0 parks; Phase-1 evidence goals ordered
- Exit 3 (iteration-limit), 1h27m wall. factory/self +2: shutdown-sleep-drop, acpx-zero-usage-land (fresh task, no base — converges the i39-parked chain; reversible assumption recorded). ZERO parks, pending 0, inbox empty.
- Legs: digest beam $0; architect omp/opus $1.05 (attempt1 infra crash out0 → attempt2 done 18k out, same-model retry); planreview+plancheck agy ($0.68+$0.87); PM agy $0.30; implements 2 agy; review 01649: ernie INFRA QUOTA 3x (attempt1 14075 out, then 2x out0) → cross-harness fallback hop to agy/gemini DONE (9154 out) — fallback chain worked as designed (reviewer $1.08). Steward stub skipped 6th. Cost $9.53 fully priced (implementer $5.55). 3 infra retries, 1 fallback hop, 1 outcome-repair, 0 conflicts, 0 gate flakes.
- WATCH: ernie-free hit infra quota 3x (first time) — off-Go map's reviewer/fallback workhorse is rate-sensitive; fallback saved it. Reroute to agy-primary review if it repeats.
- Architect forward: Phase 1 live evidence owed — (1) steward agent turn (colliding tasks), (2) each steer class handled once (mid-dispatch injection). "The factory is ready for both now... running them after this iteration lands." Operator launches next (p1-trivial/p1-task precedent), then i41 self.
- No steers for i41: no incidents. Budget steer still awaiting owner word — NOT steered (6th iteration).

### 2026-11-16 — p1-steward landed: negative result (serialization kills same-file collision)
- Exit 3 (iteration-limit), 52m. 2 tasks planned correctly (stop-rule-label, stop-rule-owner-note, deps:[]) — PM split worked. BOTH MERGED sequentially (2625ff2, d93e0f6); 0 parks; disk carries owner-note variant only (doc-only, acceptable).
- STEWARD EVIDENCE NOT PRODUCED: record 00016 script stub `skipped: no conflicts` — no agent turn. Root: kernel serializes same-scope tasks (dispatch.ts:525,542 overlapsRunning); owner-note started 0.9s after label merged, branch already contained the variant. Same-file collision unreachable by design. Plancheck debt opened (sequential-not-arbitrated). Steered as observation; v2 design awaited in forward.
- INTENT synced MAIN 2984165 → V3 (16db7d78 verified): review-bounds + binary-config lines now in the factory tree.
- Steers for i41: review-bounds (intent-change) + binary-config (intent-change) + steward-serialization (observation).
- No promote (doc-only landing; pin unchanged c92247c216ca).

### 2026-11-16 — p1-steers landed: exit 0, all 4 steer classes evidenced
- Exit 0, done, 2 iterations, 1h42m wall. i1: 3 merged (rotation, steers, colliding), 0 parks; i2: single architect turn ($0.29), goal done. Receipts: s1 task-specific (amended pending colliding, steer-routes 00016), s2 redo (discarded review 00018, re-dispatched rotation post-merge 00030-32, steer-routes 00029), s3 spike (quota-terminology-check implement+commit+checks+review, 3 variants audited, no code change), s4 stall (AGREED, nothing pending to cancel — all merged; stall handling shown, cancellation unexercised). Legs: arch omp/opus $0.34+$0.29; PM agy $2.59 (6 turns); impl 6 agy $8.01; reviews 5 ernie $0; planreview agy $0.36. Total ~$11.60. 1 infra retry, 3 outcome-repairs, 1 benign merged-gate note (00020), 0 conflicts, 0 flakes.
- Caveat for the record: s4 proved stall AGREEMENT, not pending-cancellation (race lost: work finished first). Steer-class evidence complete per Phase1.md wording; cancellation path unexercised.
- Owner INTENT revision da194dc synced MAIN→V3 (80bc3917 verified) + steered (owner's commit-message words).
- Steers for i41: review-bounds + binary-config + steward-serialization (from p1-steward landing) + intent3 (owner revision) + alias-bug (owner ruling).
- No promote (doc-only landing; pin unchanged c92247c216ca).

### 2026-11-16 — rotation for i41: A-shape + omp-Go legs (sub B live, verified)
- Map: architect claude-code/opus:high (fb sonnet, fb2 omp/opus — reinstated per owner call, approve-all + crash fix in pin), pm agy/gemini (fb omp-Go/deepseek:max), digest omp/Go-hy4:xhigh (fb opencode/hy4:high), implementer omp-Go/muse:max (fb omp-Go/deepseek:max; muse 2nd data point), reviewer omp-Go/deepseek:max (fb omp-Go/muse:max), plan-reviewer + plan-checker agy (fb omp/ernie), escalation omp/sonnet (fb omp-Go/muse:max), steward omp/ernie (fb agy). priceIds gains Go-hy4 ($0 row).
- @free joins the mechanical alternation after the pre-flight alias fix (steered as bug). pi/codex/opencode Go legs at sub-A reset (~13d). Loader + price-coverage green before commit.

### 2026-11-16 — i41 landed: 2 merges; claude fix VERIFIED; @free unblocked
- Exit 3 (iteration-limit), 1h57m wall. factory/self +2: preflight-omp-alias (@-aliases skip catalog+effort — @free UNBLOCKED next iteration), admit-overlap (same-scope serialization REMOVED — steward v2 path open). 3 parks: merge-check-skip (failed, 9 suite failures), validate-parity + repair-finding (containment — r2 modified records/01676 outcome.yaml outside worktree; correctly contained). Pending 5 (owner-revision queue: binary-config-only, park-amend, review-last-call, steward-ladder, turn-budget-drop). Inbox empty (all 5 steers consumed).
- FIX VERIFIED: architect claude/opus SINGLE attempt done, $1.88, zero crashes (approve-all + completed-exit work; 2-crash streak broken). Digest omp/Go-hy4:xhigh done $0 (new leg works). Implements 8 omp-Go/muse $0.25; reviews 3 omp-Go/deepseek $0.14; PM+plan roles agy $2.88. Cost $5.15 total (informational). 0 infra retries, 0 fallback hops, 7 outcome-repairs, 0 conflicts/flakes. Steward r1 01692 stub again.
- Operator runbook fix (debt): SELF-IMPROVE.md:97 serialization line updated for admit-overlap (checks-evidence.md:23 is architect material, left).
- Forward: (1) steward v2 colliding launch — running next on the new pin; (2) operator config (iterationUsd + subscription names + explicit efforts) — subscription map + escalation effort at i42 rotation, iterationUsd value asked of owner; (3) re-run p1-trivial/p1-task after park-amend merges — deferred (pending).

### 2026-11-17 — p1-steward-v2 landed: STEWARD EVIDENCE PRODUCED
- Exit 3 (iteration-limit), 53m. Implements 00006/00007 started 0.3s apart (concurrent dispatch — admit-overlap proof); real conflict on SELF-IMPROVE.md:69 → merge-attempt 00014 → park 00017 (conflict) → STEWARD AGENT TURN 00018 (ernie/high, done, 2 attempts, merge commit 6b90907 keeping own variant) → merge 00021. Both tasks merged (37922aa, 76b95b0), 0 parks pending, cost $1.99 (steward $0.00 ernie). Phase-1 steward evidence COMPLETE. Gates 925/0.
- No promote (doc-only landing; pin unchanged 24934e2389f4).

### 2026-11-17 — rotation for i42: @free digest + ernie↔hy4 PM/review/QA + subscriptions
- Map: architect claude/opus (fb sonnet, fb2 omp/opus; verified clean i41), pm omp/ernie (fb opencode/hy4), digest omp/@free literal, no effort key (fb opencode/hy4; alias-pricing limitation steered), implementer omp-Go/deepseek:max (fb omp-Go/muse:max; flip of i41), reviewer omp/ernie (fb opencode/hy4), qa omp/ernie (fb opencode/hy4; NEW alias, dormant — no kernel qa role yet), plan-reviewer + plan-checker agy (fb omp/ernie), escalation omp/sonnet:high (fb omp-Go/muse:max; explicit effort per forward ask), steward omp/ernie (fb agy).
- Subscriptions named on every alias; per-pool caps: opencode-go 2 (2 keys), openrouter-free 1 (i40 ernie quota evidence). iterationUsd stays off (owner: 0). priceIds gains @free → $0 ernie row.
- i43 flips PM/review/QA to hy4-first/ernie-fallback per the rotation directive.

### 2026-11-17 — i42 pre-flight refusal: named subscriptions require pools (fixed)
- First i42 launch refused exit 1 (nothing written): every subscription name must have a limits.concurrency.perSubscription entry — bare labels are invalid. Fixed: claude 1 (architect single-threaded + rare escalation), antigravity 2 (4 agy primaries, no rate hits at 3 so far — gentle), opencode-free 1 (fallbacks only). Kept: go 2 (2 keys), openrouter-free 1 (i40 quota evidence).

### 2026-11-17 — i42 landed: 11 merges, 0 parks; owner-revision queue crushed
- Exit 3 (iteration-limit), 5h11m wall (30 agent turns + ernie-timeout latency + 6433s gates over 25 runs). factory/self +11: park-amend, review-last-call, binary-config-only, turn-budget-drop, record-seal, omp-alias-model, steward-ladder, validate-parity-land, repair-finding-land, merge-check-skip-land, omp-alias-effort. ZERO parks, pending 0, inbox empty (alias-pricing steer consumed).
- Legs: digest omp/@free DONE $0 single attempt (alias works in production); architect claude/opus single attempt done, 2nd clean outing — fix HOLDS; PM omp/ernie $0; implements 13 omp-Go/deepseek $1.39 (fb never needed); reviews 12/12 opencode/hy4 $0 — review 1 (01705) ernie TIMED OUT (OpenRouter stream stall) → hy4 fallback delivered, reviews 2-12 went STRAIGHT to hy4 (post-failure tier latch, mechanism unidentified — steered as observation); plan roles agy $1.51; steward + PM the only 2 ernie turns. Cost $2.91 partial, list $4.11. 3 outcome-repairs, 1 benign merged-gate note, 0 conflicts/flakes.
- Forwards both stale (record-seal + steward-ladder merged; v2 evidence already produced). QA alias dormant (no kernel role yet, as predicted).
- park-amend merged → firing deferred ask: re-run p1-trivial + p1-task on the new pin, then i43.

### 2026-11-17 — p1-trivial re-run: exit 0, done, 0 iterations (4m, no drift)

### 2026-11-17 — p1-task re-run: exit 0, done, 0 iterations (4m, no drift)

### 2026-11-17 — rotation for i43: hy4-first PM/review/QA + Go-hy4 digest + agy implementer
- Map: architect claude/opus (fb sonnet, fb2 omp/opus), pm opencode/hy4 (fb omp/ernie), digest omp-Go/hy4:xhigh (fb opencode/hy4), implementer agy/gemini (fb omp-Go/deepseek:max; cycle muse41 → deepseek42 → agy43), reviewer opencode/hy4 (fb omp/ernie), qa opencode/hy4 (fb omp/ernie; dormant — no kernel role), plan-rev+check agy (fb omp/ernie), esc omp/sonnet:high (fb omp-Go/muse), steward omp/ernie (fb agy). Subs + caps kept. Loader + price-coverage green before commit.

### 2026-11-17 — i43 landed: 3 merges, 0 parks; latch fixed same-iteration
- Exit 3 (iteration-limit), 2h49m wall. factory/self +3: quota-pool-latch (replaces workingTier sticky latch — only quota stops exhaust pools; timeout/rate/crash hop per-turn; answers the tier-latch steer same-iteration), gate-fix-bound, validate-steps. ZERO parks, pending 0, inbox empty.
- Legs: digest omp/Go-hy4:xhigh DONE $0; architect claude/opus single attempt done (3rd clean outing — fix HOLDS 3/3); PM opencode/hy4 $0; implements 3+ agy/gemini ($12.33 of $14.53); reviews 6/6 opencode/hy4 $0 (3 changes r1 → 3 approve r2, textbook); plan roles agy $2.20. ZERO ernie turns (hy4-first held, no fallback needed). Cost $14.53 partial, list $15.08. 1 merged-gate failure + 1 flake (green at merge; 01818/01829/01834 merge-checks r2), 0 infra retries, 0 conflicts.
- Steer→fix receipt: tier-latch confirmed real (runtime.workingTier pinned alias to winning fallback for whole launch); quota-pool-latch replaces it.
- Forwards: (1) re-run p1-trivial/p1-task after these 3 merge (regression; Phase-1-done declaration expected after) — running next; (2) INTENT Q2 operator config stale 2/3 (subscriptions + efforts done i42; iterationUsd off per owner 0) — owner's call whether Q2 needs a refresh.
- Owner gates line (6e7a55bb) synced MAIN→V3 (326da37e verified) + steered for i44.

### 2026-11-17 — p1-trivial regression r3: exit 0, done, 0 iterations (5m, no drift)

### 2026-11-17 — p1-task regression r3: exit 0, done, 0 iterations (5m, no drift)

### 2026-11-17 — rotation for i44: flip-backs (ernie-first, @free digest, muse implementer)
- Map: architect claude/opus (fb sonnet, fb2 omp/opus), pm omp/ernie (fb opencode/hy4), digest omp/@free (fb opencode/hy4), implementer omp-Go/muse:max (fb omp-Go/deepseek:max; cycle agy43 → muse44), reviewer omp/ernie (fb opencode/hy4), qa omp/ernie dormant (fb opencode/hy4), plan-rev+check agy (fb omp/ernie), esc omp/sonnet:high (fb omp-Go/muse), steward omp/ernie (fb agy). Subs + caps kept. Loader + price-coverage green before commit.

### 2026-11-17 — i44 landed: 1 merge; ernie daily quota; gates flake
- Exit 3 (iteration-limit), 2h37m wall. factory/self +1: gates-hermetic. 1 park: gates-fast (01862, failed — substantial progress: parallel gate run 73.6s wall 1018/1, zero-usage test 28s→0.95s, new scripts/run-tests.ts runner wired; but 3 kernel files still >10s serially, no final green under 90s — needs continuation). Pending 0, inbox empty (gates-fast steer consumed with receipt).
- Legs: digest omp/@free resolved to ernie primary DONE $0 (alias transparent in production); architect claude/opus single attempt done (4th clean outing — fix holds 4/4); PM omp/ernie $0; implements 3 omp-Go/muse ($0.09); reviews: r1 ernie 429 QUOTA 3x (free-models-per-day exhausted, retry-after ~6.5h) → hy4 fallback delivered; r2 straight to hy4. Plan roles agy. Steward stub skipped 7th. 12 agent + 13 script turns.
- Landing gates: 1 fail/1022 first run, green on the allowed rerun (unnamed flake — first-run tail didn't name it; rerun showed zero fail markers). Proceeding per runbook.
- Phase-1-done NOT declared (gates-fast parked; needs its continuation to merge).

### 2026-11-17 — rotation for i45: hy4-first flip + Go-hy4 digest + deepseek implementer
- Map: architect claude/opus (fb sonnet, fb2 omp/opus), pm opencode/hy4 (fb omp/ernie), digest omp-Go/hy4:xhigh (fb opencode/hy4), implementer omp-Go/deepseek:max (fb omp-Go/muse:max; cycle muse44 → deepseek45), reviewer opencode/hy4 (fb omp/ernie), qa opencode/hy4 dormant (fb omp/ernie), plan-rev+check agy (fb omp/ernie), esc omp/sonnet:high (fb omp-Go/muse), steward omp/ernie (fb agy). Subs + caps kept. Loader + price-coverage green before commit.

### 2026-11-17 — i45 landed: 3 merges; gates-fast delta CLOSED
- Exit 3 (iteration-limit), 3h43m wall. factory/self +3: m1-drain-wiring, harness-rotation-resolve, gates-fast-land (the parked continuation LANDS — gates-fast delta item closed, landing gates green). 6 parks: 01902 acpx-zero-usage (empty-diff after red checks), 01905 fake-script-keyed (failed, needs --rerun-each proof), 01908 checks-prune (upscope/base-drift), 01925 harness-rotation-resume (conflict, superseded), 01929 m1-drain-admission (empty-diff, already on head), 01945 gates-fast (conflict, superseded by -land). Pending 0, inbox empty.
- Legs: architect opus single attempt (5th clean outing — fix holds 5/5); digest Go-hy4 $0; implementer 14 turns Go/deepseek $0.84; reviewer 6 turns hy4 $0 (hy4-first held); PM hy4 $0; plan roles agy $0.19; escalation 2 turns sonnet $0.36; steward stub + 3 agent arbitrations incl 01946 gemini-after-ernie-429 ($0.10). Ernie: ONE quota hit (daily recovered). Cost $1.62 partial, list $2.27. 2 infra retries, 1 fallback hop, 6 outcome-repairs, 2 conflicts, 2 merged-gate failures, 2 flakes, 2 loop incidents.
- Readiness: Phase-1-done declaration expected now (no operator launch needed) — may land i46. Uncertainty surfaced: 47-park pile-up may need architectural cancel-vs-keep guidance (architect's call, not steered).

### 2026-11-17 — rotation for i46: flip-backs (ernie-first, @free digest, agy implementer)
- Map: architect claude/opus (fb sonnet, fb2 omp/opus), pm omp/ernie (fb opencode/hy4), digest omp/@free (fb opencode/hy4), implementer agy/gemini (fb omp-Go/deepseek:max; cycle deepseek45 → agy46), reviewer omp/ernie (fb opencode/hy4), qa omp/ernie dormant (fb opencode/hy4), plan-rev+check agy (fb omp/ernie), esc omp/sonnet:high (fb omp-Go/muse), steward omp/ernie (fb agy). Subs + caps kept. Loader + price-coverage green before commit.

### 2026-11-17 — i46 landed: 2 merges; ernie still exhausted, fallbacks held
- Exit 3 (iteration-limit), 1h20m wall. factory/self +2: git-optional-locks (--no-optional-locks race fix), gates-fast (run-tests follow-up + base-sync-resolve test + git exec). 2 new parks: gate-fail-names (lint), followup-plan-bound (gates format/tests/typecheck + infra flakes). PM CANCELLED 12 retired slugs. Parks total 48. Pending 0, inbox empty. Phase-1-done NOT declared — blocked on the 2 parks landing.
- Legs: architect opus 1 turn clean (6th clean outing); ernie ZERO turns (daily quota STILL exhausted, digest end.yaml proof) — all ernie-first aliases latched (digest/pm/reviewer→hy4 $0, steward→gemini $0.07); pm 2 escalation sonnet turns $0.63; implementer 10 turns agy/gemini $4.44 with 4 failures; plan roles agy $0.14. Cost $5.28 partial (highest lately — priced agy implementer). 2 infra retries, 1 fallback hop, 6 outcome-repairs.
- Owner directive: new goal `delta` (everything not yet done in INTENT.md) starts next; self pauses. Map kept as-is (fallbacks proved working).

### 2026-11-17 — goal `delta` init (owner directive): everything not yet done in INTENT.md
- Fresh orchestration subfolder, factory iteration 1, self-quota map unchanged, inbox EMPTY (no steers at all — architect assesses status alone). Intent delegates assessment (INTENT.md minus built+evidenced) and defines done (declared complete with evidence pointers; 0-merge-because-done = success). Self goal pauses. Loop till satisfied; recovery-only steers.

### 2026-11-17 — delta-i1 landed: INTERRUPTED (exit 130/SIGINT, unknown cause), 1 merge
- 2h58m wall, status stopped-with-debt, graceful summary. Interrupter unknown: single 'interrupted' line, no owner message, wrapper had no deadline, tree clean. factory/delta +1: evidence-docs (R6 checks-evidence + doc drift). 6 parks: compact-agy-cc (review-rejected), boundary-contain (failed/regressions), cleanliness + delivery-repair-config (gates-tests), gate-handoff-log (failed, missing checks_* vars), env-allowlist (empty-diff after red tests). Pending 47, debt 0, inbox empty.
- Legs: architect opus 1 turn $4.67 clean (7th clean outing); implementer 27 turns ALL agy/gemini $16.58 with 14 failures; planreview 1 gemini $0.06; pm+reviewer 9 turns ALL hy4 $0 (ernie ZERO turns, 3rd day exhausted); no escalation/steward/digest. Cost $21.32 partial (highest ever). 2 infra retries, 1 fallback hop, 14 outcome-repairs, 1 merged-gate failure, 2 flakes, 1 loop.
- Architect: 50-task A-J plan stands; asks deferred (2 operator launches at milestone A; canary goals after compact+harness-opaque). INTENT concern lines fixed on head — deletion is owner's call, not operated.
- Operator call: relaunch i2 per standing directive; unknown kill flagged to owner (veto = hold).

### 2026-11-18 — delta i1-resume landed: 2nd SIGINT (infra), 3 merges
- Exit 130/SIGINT SECOND kill, 5h12m wall, stopped-with-debt, graceful summary. Kill 03:23 EST (owner asleep → infra, not manual); still no signal in logs. factory/delta +3: gate-names (milestone-A orphan recovery), gate-identity, omp-zero-glitch. Parks 13 (+7): kept-land-live empty-diff, metrics-attrib failed no-outcome-after-repair, harness-opaque gates-format, gate-mutex-drop failed, lint-ratchet BLOCKED infra-broken (biome overrides replace-not-merge), plancheck-bound failed BROKE pm.ts (milestone-A!), outcome-ids gates-tests. Pending 39. Milestone A STILL OPEN (gate-names+evidence-docs landed; plancheck-bound+env-allowlist parked).
- Legs (cumulative i1): NO architect turn (resume); ernie BACK 13 turns $0; hy4 9 $0; gemini 70 turns $42.5 list (disregarded); deepseek 1 ($0.19). Implementer failures 27 cumulative (no-outcome persists); reviewer 12 change-requests. In-flight at kill: presets-commit, portability-graph-commit, quota-persist-checks, saga-omp-spike. Inbox: park-friction + digest-1 queued (protocol-outcome consumed).
- INTENT synced MAIN→V3 (fb5b2b): idempotent-restart + canonical-location notes now visible to factory. Next launch resumes i1 again (true i2 gated on completion).
- Operator call: 2nd kill flagged; 3rd kill → stop-and-report, no blind relaunch.

### 2026-11-18 — delta i1-resume-2 landed: clean exit, 7 merges, no 3rd kill
- Exit 3 (iteration-limit), 3h10m wall, status in-progress. NO third SIGINT. factory/delta +7: presets, task-schema, urgent-steer, artifact-lsp, task-types, roles-aliases, fallback-alias (cumulative 11). +5 parks (18 total): portability-graph (empty-diff r2), quota-persist (empty-diff after red tests), saga-omp-spike (failed, doc-only no PoC), task-leave-explicit (failed — pure no-outcome, touched nothing), resume-friction-1 (review-REJECTED — friction-investigation spike produced no report artifact; the investigation exhibited the friction). Pending 29 (was 39), debt 1 (resume-friction-1 report).
- Milestone A STILL OPEN (gate-names+evidence-docs merged; plancheck-bound parked after breaking pm.ts; env-allowlist parked) — architect's Phase-1-done gated on plancheck-bound.
- Legs cumulative: NO new architect turn (resume); gemini 74t $43.47 list (disregarded); deepseek 10t $1.25 fallback-active; hy4 16t $0; ernie 21t $0; opus 1t $4.67. Implementer 28 failure + 2 glitch, 28 outcome-repairs, reviewer 13 change-requests — no-outcome persists. Inbox: park-friction + resume-friction STILL queued (architect-routed, no architect on resume); digest-1 second file queued.
- Incidents: 9 infra retries, 4 fallback hops, 28 outcome-repairs, 1 merged-gate failure, 6 flakes, 4 empty-diff parks, 4 loops, 0 conflicts. 460 files +8235/-2103, 410 test runs/82 gates.
- Next launch resumes i1 AGAIN (true i2 gated on i1 completing).

### 2026-11-18 — delta i1-resume-3 landed: boundary-only 13min, 0 merges (1st 0-merge)
- Exit 3 (iteration-limit), 757s wall, status in-progress. Boundary-only: baseline 00363 → digest 00364 ($0) → pm 00365 (digest-1-94d8fd1f→spike gate-red-repair-loop-spike) → pm 00367 (resume2-friction→spike resume2-friction-spike) → plancheck-r2 00369 (agy/gemini $0.075, FAILED, verdict ARCHITECT: execution stalled, mechanical follow-ups insufficient, needs architect reassessment of lint-ratchet/gates/containment + review friction) → NO dispatch records. 0 merges, 0 parks, 0 implement/reviewer turns; metrics untouched.
- Pending 29→31 (2 new spikes), parks 18, debt 2 (+plancheck r2). Milestone A still open. Inbox 6 files (2 routed with holds). Segment cost ~$0.08.
- STALL RISK: plancheck demands architect but resumes have no architect turn. Next launch resume-vs-advance uncertain; a repeat = 2nd consecutive 0-merge → stop-and-report.
- Gates skipped: tree unchanged since last green (1106/0), nothing merged.

### 2026-11-18 — delta decisive run: 2ND consecutive 0-merge → STOP-AND-REPORT
- Exit 3 (iteration-limit), 19min wall. 0 merges (factory/delta empty). Dispatched 2 spikes (resume2/resume3-friction-spike, records 00376-00387) → BOTH PARKED review-rejected (no report artifact — 2nd+3rd consecutive no-report spikes). Pending 31 (flat), parks 20 (+2), debt 5 (+3). No plancheck repeat, no architect turn, still iteration 1. Segment cost ~$0.21.
- STUCK MECHANISM: spike→no-report→park→debt loop with the spike-report mechanism itself missing (debt item); plancheck-r2 ARCHITECT verdict unaddressable on resume (resume skips architect by design, launch.ts:439-441); pending flat, debt growing, zero forward motion across 2 segments. No operator force-advance exists (state derived from tasks/records; factory decides resume-vs-advance).
- Cumulative: 11 merges, 20 parks, 31 pending, 5 debt; milestone A 2/4 (Phase-1-done gated on plancheck-bound recovery).
- Operator: STOP — no relaunch. Gates skipped (tree unchanged). Awaiting owner decision.

### 2026-11-18 — goal `repair` init (owner directive): emergency repair of delta stall
- Fresh orchestration subfolder, factory iteration 1, self-quota map unchanged, inbox: 2 owner-ordered 5-why reports (5why-resume-trap, 5why-spike-report). Findings: resume re-pins i1 on a standing predicate while holds wait for a boundary resume skips (A-F trap, launch.ts/dispatch.ts/derive.ts); spike done-when demands a records/ report no channel can write (implementer contract forbids, store doesn't own, flow changeRequests:0); FolderStore.listTasks quarantines on read without taskTypes. Operator DIY: restored 4 quarantined task files + 2 holds (probe perturbation undone); no code surgery, no hand-written holds. Delta + self paused. Loop repair till its architect declares complete, then back to delta.

### 2026-11-18 — repair-i1 landed: 0 merges (fresh-goal 1st), 5-whys verified, M1 rework
- Exit 3 (iteration-limit), 29min wall, status in-progress. 0 merges. 1 park: store-read-pure review-rejected with 6 concrete rework findings (readHolds still writes; sweep quarantines config-gap; no preflight findings threading; sweep before lock + hardcoded iter 0; taskTypes {} default kept; no regression test). 4 pending: dispatch-pass-signals, resume-gate, spike-report-contracts, spike-report-gate. 1 debt (plancheck r1). Inbox consumed (both 5-whys).
- Architect opus 1 turn $0.74 re-verified BOTH 5-whys against 2c454364 — all hold; 3 milestones 5 tasks. Assumptions: spike report at .factory/spikes/<slug>.md + synthetic gate + sealed report.md (reversible const); holds out of derive (resumeVerdict gate in launch); unconfigured type = pre-flight refusal. Goal NOT complete — M1 rework + M2/M3 remain.
- Legs: opus 1t $0.74 (8th clean shaping); gemini 4t $1.30; hy4 3t $0 (ernie leg touched once → hy4). Cost ~$2.05. Incidents: 2 infra retries, 1 fallback hop, 2 outcome-repairs, 1 gate flake; impl 2 failures, plancheck 1 failure.
- Gates skipped: tree unchanged (nothing merged).

### 2026-11-18 — repair-i2 landed: 1 merge (M1 task-side), store-read-pure dropped
- Exit 3 (iteration-limit), 1h53m wall, status in-progress, TRUE i2 (fresh architect turn). factory/repair +1: task-read-pure (listTasks keeps signature + pure, typed findings scan, pre-flight refuses unconfigured type, sweep after lock — M1 task-side LANDS). 2 NEW parks (3 total): hold-read-pure (empty-diff after red tests), spike-report-gate (empty-diff after red lint). store-read-pure (i1 park) DROPPED by architect (wrong direction: 55-file interface widening) → replaced by task+hold-read-pure. Pending 3: dispatch-pass-signals, resume-gate, spike-report-contracts. Debt 1 (plancheck r1, superseded). Inbox empty.
- Legs: architect opus 1 turn unpriced clean (9th clean shaping); implementer gemini $8.91; plancheck $0.11; planreview $0.06; pm/reviewer/digest $0 (hy4/free, ernie untouched). Cost $9.07 partial ($9.07/merge).
- Friction: no-outcome PERSISTS (9 i2 repairFindings same signature + 1 plancheck evidence-schema); 3 gate flakes (task-read-pure x2, hold-read-pure x1); task-read-pure merged WITH 6 debt items (type-mismatch call sites, lint violations, ?? {} remnants x2, test-coverage gap, uncommitted-test-fix, readHolds still mutates). Assumptions sound (spike path reversible const; holds-out-of-derive resumeVerdict; unconfigured=refusal).
- Goal NOT complete — M1 hold-side rework + M2 (resume-gate) + M3 (spike-report) remain. No stop pressure (merge resets counter).

### 2026-11-18 — repair-i3 landed: 4 merges (M1 complete, M3 check+seal); resume-gate remains
- Exit 3 (iteration-limit), 2h16m wall, status in-progress. factory/repair +4: task-read-residue, spike-report-check, hold-read-pure-2, spike-report-seal. 2 parks (dispatch-pass-signals gates format/tests/typecheck, spike-report-contracts gates-tests). 3 cancelled (hold-read-pure, spike-report-gate, store-read-pure). M1 read-pure task+hold+residue LANDS; M3 spike-report check+seal land, contracts parked on prompt-snapshot infra. Pending 1: resume-gate (M2, the crux). Inbox empty.
- Legs: architect opus 1t unpriced clean (10th clean shaping); implementer 18t gemini $9.95; ESCALATION 2 turns sonnet $1.60; plancheck $0.17; planreview $0.06; pm/reviewer/digest $0 hy4. Cost ~$10.18 partial.
- Friction: no-outcome DOWN to 2 (from 9); 5 failure + 4 change-request launchKinds; 1705 pre-existing lint warnings (recurring debt note); prompt-snapshot pre-existing infra failures.
- Goal NOT complete — resume-gate remains. No stop pressure.

### 2026-11-18 — repair-i4 landed: 1 merge; ENOSPC infra (operator purged /tmp)
- Exit 3 (iteration-limit), 32min wall, status in-progress. factory/repair +1: dispatch-pass-signals-2. 3 NEW parks (5 total): resume-gate (FAILED gates-tests ENOSPC — the crux, infra-blocked), spike-report-contracts-2 (FAILED ENOSPC), test-tmp-hygiene (FAILED ENOSPC — the hygiene task itself died on the full disk). Pending 0, debt 1 (plancheck r1, superseded). Inbox empty.
- ROOT CAUSE: /tmp tmpfs 96% full (9.4G/9.8G, 68k leaked factory-hermetic/acpx-stub/factory-test-repo dirs + 38 stale 225M factory-gates copies) — every gates.sh run copies the package into /tmp, so all gates red as infra. Architect explicitly asked OPERATOR to purge before next launch. Operator purged (96%→15%, 8.4G free); node-compile-cache + small tool dirs left alone.
- Legs: architect opus unpriced clean (11th shaping); implementer agy/gemini $1.71; plancheck $0.04; planreview $0.02; pm/reviewer/digest $0 hy4/free. Cost $1.77 partial ($1.77/merge). No no-outcome spike noted.
- Goal NOT complete — resume-gate must re-drive after /tmp purge. No stop pressure (merge resets counter).

### 2026-11-18 — repair-i5 landed: resume-gate-2 (M2 crux LANDS); pending 0, no declaration
- Exit 3 (iteration-limit), 1h02m wall, status in-progress. factory/repair +1: resume-gate-2 (M2 THE CRUX LANDS). 3 NEW parks (8 total): spike-report-contracts-3 (failed, pre-existing test failures incl scenario8), tmp-hygiene-2 (gates format/tests), tmp-preflight (empty-diff after red lint). Pending 0, debt 1 (plancheck r1, superseded). Inbox empty. /tmp healthy 16% (purge held).
- Legs: architect opus 1t unpriced clean (12th shaping); implementer 9t gemini $8.17; escalation 1t sonnet $1.12; plancheck $0.04; planreview $0.07; pm/reviewer/digest hy4 $0. Cost $9.39 partial ($9.39/merge).
- Friction: 4 outcome-repairs; launches impl 3 failure + plancheck 1 + planreview 1 + reviewer 1 change-request + digest 1 glitch; 2 infra retries, 1 fallback hop, 1 loop incident.
- Goal NOT complete (no declaration; M3 contracts + hygiene + debt remain). No stop pressure.

### 2026-11-18 — repair-i6 landed: 3 merges, all mechanisms built; declaration expected next
- Exit 3 (iteration-limit), 55min wall, status in-progress. factory/repair +3: spike-report-contracts-4, tmp-hygiene-3, tmp-preflight-2. 0 parks, pending 0, debt 1 (plancheck r1, superseded). Inbox empty. M3 contracts + M4 hygiene LAND; all mechanisms built (M1 read-pure, M2 resume-gate, M3 check+seal+contracts, M4 hygiene+preflight).
- CORRECTION (operator owned): architect found all 3 i5 parks were implementer misattributing its own reds — contracts-3 claimed pre-existing scenario8 failures with NO checks run on a green base. My repair5 steer item 1 (pre-existing-red-first) was based on that false claim. Lesson: verify pre-existing-red claims against base-gate evidence before steering on them.
- Legs: opus 1t unpriced clean (13th shaping); implementer $1.29; plancheck $0.08; planreview $0.07; pm/reviewer/digest $0. Cost $1.44 partial ($0.48/merge). Incidents: 2 infra retries, 1 fallback hop, 2 outcome-repairs, 1 digest glitch, plancheck+planreview 1 failure each.
- Goal NOT complete (no declaration yet — expected next segment). No stop pressure.

### 2026-11-18 — repair-i7 landed: ARCHITECT DECLARED DONE (verified) → back to delta
- Exit 3 (iteration-limit), 9min wall, 2 agent turns (digest $0 + architect opus ~$0.11 list). Decision: done (record 00288) with per-mechanism evidence: (1) spike-report check/seal/contracts-4 (spike-report.ts checkSpikeReport, record.ts appendFinish 0444 seal, spikeFinding in boundary/context-pack, spike-report-general.md; test spike-report-check.test.ts); (2) resume-escape (dispatch-pass-signals-2 + resume-gate-2 resume/resume-refused records, resumeAttempts bound, refuses on empty-prior/architect-plancheck/all-held, empty-resume in-launch escalation; tests resume-gate/resume-verdict/dispatch.test.ts); (3) read-pure (task-read-pure/residue, hold-read-pure-2; pure listTasks/readHolds, sweeps after lock, pre-flight refusal, createFolderStore requires taskTypes; tests task/hold-read-pure.test.ts); enabling tmp-hygiene-3 + tmp-preflight-2 with tests. Every merge passed merge checks (00061-00283), all review-approved; HEAD base gates green. 0 merges/0 parks/pending 0 this segment (0-merge-because-done = success).
- Assumption accepted: sealed report at <goal>/finish/<slug>/report.md (equivalent location). Wart (non-invalidating): summary debt text stale vs rejected store-read-pure direction (both debt records closed).
- Explicitly NOT built (owner-attention, architect's scope call): (a) pre-existing-red-claim-must-cite-base-gate rule (agy/gemini false-claimed 4x + 18 no-outcome repairs i6); (b) outcome-protocol reminder — offered as follow-up goal; delta resumes as-is.
- Remarkable: delta may resume (quarantine-restore + trap covered; delta must run under process config with taskTypes.spike — package default does).
- Incidents i7: 2 infra retries, 1 fallback hop, 0 outcome-repairs. Inbox empty. Gates skipped (tree unchanged). DONE CLAUSE SATISFIED.

### 2026-11-18 — delta post-repair: M2 WORKS (true i2), then crash on ancient line
- Exit 1 (TypeError), 393s wall, pin 5c446e69. M2 VERIFIED ON REAL STATE: 00395 resume-REFUSED → advanced to TRUE i2 (00396 merge attempt ok:false conflict types.ts, 00397 digest). Then i2's first boundary crashed at context-pack.ts:378 `for (const forwarded of rec.outcome.forward)` — `forward` undefined. ANCIENT unguarded line (kernel-0 skeleton), NOT new repair code. Trigger: 2 schemaless old outcomes (00107 gate-names review-r2: concerns but no forward; 00156 omp-zero-glitch implement-r1: status+summary+concerns only). WHY NOW: i2's first boundary scans ALL 397 records (delta-i1 boundary ran at ~3 records; repair/self young).
- Delta state INTACT: no new merges, records complete, tasks 62 files, holds 5, inbox 9→6 (3 steers+3 holds consumed pre-crash). 0 merges (1st post-repair 0-merge, no stop). Legs/cost minimal (~6min, digest+boundary-prep).
- FIX PATH: harden forwardedConcerns (`?? []` on forward + concerns) + regression test with schemaless old record; relaunch repair goal with crash steer.

### 2026-11-18 — repair-i8 landed: outcome-read-defaults (M5, deeper than steer); 557-file churn
- Exit 3 (iteration-limit), 41min wall, status in-progress. factory/repair +1: outcome-read-defaults. 0 parks, pending 0, debt 2 (plancheck r1 stale texts). Inbox empty (crash-forward consumed). Architect verified crash steer at HEAD and went DEEPER: root cause store.ts:441 reads outcome.yaml as Outcome without outcomeSchema parse so .default([]) never applies; 8 unguarded sites; fix at store read boundary (lenient normalizer, M5), not ?? [] per consumer. Delta M2 liveness confirmed (00395 resume-refused → i2).
- DEBT OPENED: merge spans 557 files (biome rewraps of generated docs/runs/modernize/* snapshots + README/process.yaml/bunfig.toml reformats + README glob corruption tasks/*.md→tasks/_.md); forwarded as separate task BUT no task file exists (pending 0) — cleanup may evaporate. Owner attention REPEAT: pre-existing-red-claim rule plan-level only, delta-resumes-as-is default, proposed follow-up goal.
- Legs: opus 1t unpriced clean (14th shaping); gemini 6t $2.34; hy4 4t $0. Cost $2.34 partial ($2.34/merge). Incidents: 2 infra retries, 1 fallback hop, 3 outcome-repairs, 1 gate flake; digest 1 glitch, impl/plancheck/planreview 1 failure each, reviewer 1 change-request.
- Goal NOT complete (no DONE re-declaration; expected next). No stop pressure.

### 2026-11-18 — repair-i9 landed: churn cleanup (556-file revert); redeclaration expected next
- Exit 3 (iteration-limit), 25min wall, status in-progress. factory/repair +1: merge-churn-revert (the 557-file churn cleanup FILED FOR REAL and LANDED; forensics: ad-hoc prettier run rewrapped 537 generated docs/runs/modernize files — biome doesn't cover docs — + README/bunfig/process.yaml/front.md/fake-index; review approved). 0 parks, pending 0, debt 2 (plancheck r1 stale texts). Inbox empty.
- Owner attention: follow-up goal NAMED 'base-gate-attribution' (a: base-gate status in implementer block; b: uncited pre-existing-red claim = reviewer finding; c: out-of-scope diff = reviewer finding; d: outcome-delivery reminder) — all four out of repair scope; default delta resumes without them.
- Legs: architect opus 1t unpriced clean (15th shaping); implementer 2t gemini $0.46; plancheck $0.02; planreview $0.04; digest+pm hy4 $0. Cost $0.52 partial ($0.52/merge). Incidents: 2 infra retries, 1 fallback hop, 2 outcome-repairs, 0 flakes; digest 1 glitch, impl 2 failure, plancheck 1 failure, reviewer 1 change-request.
- Landing gates: 1/1154 flake, green on the allowed rerun. Goal NOT complete (no DONE re-declaration; expected next). No stop pressure.

### 2026-11-18 — repair-i10 landed: DONE RE-DECLARED (verified) → back to delta
- Exit 3 (iteration-limit), 7min wall, 2 turns (digest 00333 $0 + architect 00334 opus unpriced, 16th shaping). Decision: done, status: done, with full per-mechanism evidence: spike-report check/seal/contracts-4 (gate reads .factory/spikes/<slug>.md, absent→gate-fix turn, 0444 seal, spikeFinding feeds boundary/pack; test spike-report-check.test.ts); resume-escape (bounded recorded attempts, refuse on empty-prior/architect-plancheck/all-held, in-launch escalation; tests; proven live delta 00395); read-pure + M5 store-boundary normalizer (tests task/hold-read-pure, store.test.ts); tmp-hygiene-3 + tmp-preflight-2 (tests gates-cleanup/tmp-headroom/preflight.test.ts). Churn verified gone (diff shows only store.ts + store.test.ts + .prettierignore; README glob restored; 554 files removed). 0 merges/0 parks/pending 0 (0-merge-because-done). Debt 2 = stale plancheck-r1 texts.
- Owner attention: follow-up 'base-gate-attribution' (4 items) named, out of scope; default delta resumes without it.
- Incidents i10: 2 infra retries, 1 fallback hop, 0 outcome-repairs, 0 flakes. Segment ~$0. Gates skipped (tree unchanged). DONE CLAUSE SATISFIED (re-verified).

### 2026-11-19 — delta i3 landed: 11 merges, infra-stop (transient ECONNRESET), milestone A 3/4
- Exit 1 stop=infra, 6h41m wall, status stopped-with-debt, factory says relaunch-to-retry. factory/delta +11: cleanliness-land, acpx-compact-flake, metrics-attrib-land, plancheck-bound-v2, retry-alternate, task-leave-v2, consult-gate, gate-handoff-land, delivery-repair-v2, spike-route, park-recover (cumulative 22). +6 parks (26 total): kept-land-fix (blocked, deterministic-red needs architect clarification), harness-opaque-land (review-rejected, kept diff not on head), lint-ratchet-v2 (no-outcome-after-repair), base-gate-attribution (conflict VARIABLES.md — absorbed follow-up parked), quota-persist-v2, qa-step (containment: wrote finish/park-history-spike/report.md outside worktree — spike-report channel vs containment friction). Spikes finished: park-history-spike, saga-omp-spike-v2. Pending 36, debt 5 (stale pre-pause texts).
- Milestone A 3/4: plancheck-bound-v2 MERGED; env-allowlist-v2 pending BUT dep harness-opaque-land now PARKED → needs recovery path. Architect: Phase-1-done ready once env-allowlist-v2 merges. Milestone R: retry-alternate + spike-route + park-recover merged; no-outcome-forensics-spike ready (not dispatched).
- ECONNRESET cause: deepseek-via-omp leg (opencode-go backend fetch socket closed) on 00443 outcome-ids-v2 + 00464 gate-mutex-v2 implement turns (launchKind glitch/crash); 00443 also had 3 agy infra-stops first (sub dead). Transient infra, first ECONNRESET signature (distinct from 2x SIGINT). Both crashed tasks back to ready.
- Legs i3: opus 1t unpriced (17th shaping); gemini 10t $6.02; deepseek 19t $2.74; hy4 23t $0; planreview $0.06. Cost ~$8.82 + opus. 53 agent + 107 script turns. Incidents: 6 infra retries, 3 fallback hops, 11 outcome-repairs, 2 merge conflicts (types.ts, VARIABLES.md), 1 merged-gate failure, 1 flake, 0 empty-diff. Inbox: 4 digest-1 + no-outcome-forensics.md (park-friction/repair-closure/stall-loop consumed; live steer held).
- INTENT synced MAIN→V3 (d858a5: wasted-turn def + warm starts). Goal reminder appended to delta intent (both copies): stats-start-investigations principle. Assumptions: scouts-not-spikes answered steer asks; lint biome temp debt; Phase-1 readiness. No stop pressure (11 merges; <8h).

### 2026-11-19 — delta i4 landed: 13 merges, MILESTONE A 4/4, ECONNRESET fix live next pin
- Exit 1 stop=infra (2nd consecutive same-signature ECONNRESET: 00633 config-compose implement, glitch, deepseek-via-omp fetch socket), 5h05m wall, status stopped-with-debt. factory/delta +13: base-gate-land, alternates-default, harness-opaque-replay, compact-agy-land, infra-continue, kept-land-decide, env-allowlist-v2, quota-persist-land, portability-land, spike-report-single, relaunch-idempotent, step-diversity, artifact-single-audit (cumulative 35). 4 NEW parks (11 derived after 24 cancels): gate-mutex-v2 (conflict baseline.ts), outcome-ids-v2 (conflict VARIABLES.md/commands/agent), lint-ratchet-v3 (gates lint), qa-step-v2 (containment finish/-outside-worktree — SAME M3-channel friction as qa-step). Pending 36→26, debt 6 (opened 8, closed 5 incl 3 stale spike-report debts).
- MILESTONE A 4/4 (env-allowlist-v2 merged) — Phase-1-done declaration expected next segment. Milestone S added+mostly merged (infra-continue, spike-report-single, alternates-default, relaunch-idempotent, artifact-single-audit; waste-accounting pending). 24 CANCELLED (incl outcome-in-session-repair + outcome-protocol-spike — superseded by retry-alternate). Spikes finished: warm-start-spike verdict NO — CANCEL per-area warm starters (addressable <$20/297 tasks ~$0.02-0.07/task; no harness fork capability; per-task compaction already captures it; cheaper lever = extend context-pack code map + A/B). no-outcome-forensics-spike still ready, not dispatched.
- infra-continue (the ECONNRESET fix: retryable + in-iteration re-dispatch + steward/stall-PM/plancheck before infra-stop) MERGED this segment, live next pin. Pre-fix recurrence; relaunch justified, 3rd stop ON fixed pin → genuine stop-and-report.
- Legs: opus 1t unpriced (18th shaping); deepseek 26t $1.96; ERNIE BACK 15t $0; hy4 8t $0; reviewer 20t $0. Cost ~$1.96+opus. 0 failures (1 impl glitch, 1 planreview glitch, reviewer 1 glitch + 6 change-requests). Incidents: 4 merge conflicts, 3 merged-gate failures, 0 flakes, 0 empty-diff. Inbox: 4 digest-1 + no-outcome-forensics (i3-friction consumed).
- Assumptions: kept-land record-per-event; alternates-default implementer-b omp-deepseek default, agy stays primary per INTENT Bootstrap (owner may change). Warm-start CANCEL needs owner acknowledgment (gate self-executes per intent unless overridden).

### 2026-11-19 — delta i5 landed: 0-merge blocked-by-user, fix-trial PASSED, Phase-1 view stated
- Exit 3 (iteration-limit), 31min wall, status BLOCKED-BY-USER. 0 merges, 0 parks, pending 26, debt 3 (INTENT:318 claude-compact stale; gate-handoff-land + metrics-attrib-land frozen base: refs). NO infra-stop — fix-trial PASSED (no ECONNRESET on fixed pin).
- PM LADDER EXHAUSTED: rungs 1-2 hy4 PM + 3-4 sonnet escalation, all stuck on validateTaskGraph frozen-base findings (gate-handoff-land→gate-handoff-log, kept-land-fix→kept-land-live, metrics-attrib-land→metrics-attrib; merged/frozen files, PM reconcile restores byte-for-byte); records 00757-00764, no dispatch.
- ARCHITECT (00754 opus, 19th shaping): i4 relaunch review + 'considers Phase 1 done on merged evidence' (milestone A complete; remarkable line, not formal decision); pin-mapping note (launch.yaml lacks pin field); operator remark: promote after outcome-ids-land/fresh-base/hold-no-self merge (already every-landing practice).
- BLOCK NEEDS: (1) direction decision outside PM derive (frozen-slug base: refs — next boundary architect can rule: exempt/amend/unfreeze); (2) INTENT:318 owner edit (claude-code compact fixed-half drop; debt default = proceed, drop at next concerns edit).
- Legs: opus 1t unpriced, sonnet esc 2t $0.53, hy4 3t $0, ernie 1t $0 (planreview; plan-review-missing hit ernie 429). Cost $0.53. 7 agent + 11 script turns. Incidents: 6 infra retries, 2 fallback hops, 0 outcome-repairs, 3 merge conflicts (VARIABLES.md, baseline.ts + commands/agent), 0 flakes. Inbox: ONLY no-outcome-forensics.md (4 digest-1 + i4-friction consumed). no-outcome-forensics-spike ready, NOT dispatched (3rd segment).
- 1st 0-merge since i4's 13 → NO stop pressure. Gates skipped (tree unchanged).

### 2026-11-19 — delta quota-stop landed: 2ND consecutive 0-merge → STOP-AND-REPORT
- Exit 1 stop=infra, 58min wall, iteration-5 RESUME (no architect turn). QUOTA SOURCE: AGY/Antigravity individual quota ('Resets in 130h', ~5.4d) — steward turn 00796 base-gate-attribution died after 3 agy attempts with ZERO usage → infra stop. Steward chain (omp/ernie primary → agy fallback) has NO working leg when ernie 429s. 1st quota signature (NOT 3rd consecutive same-failure; ECONNRESET chain broken by clean i5).
- 0 merges, 1 NEW park (config-compose, conflict after 2 full rounds implement/commit/checks/review + merge attempt 00784-00794), pending 26→25. PM LADDER EXHAUSTED AGAIN (rungs x2, 00768-00783, frozen-base findings unruled — no architect on resume). No Phase-1 declaration. Plan roles degrade via flaky ernie + missing-review path (00755: agy quota x3 then omp). Implement survives via deepseek fallback (config-compose 2 rounds ran). PM/review/digest on hy4 $0 (10 turns).
- Legs: hy4 bulk $0, deepseek ~$0.13, ernie intermittent, agy HARD DEAD 130h, opus 0 (resume). Cost minimal. Incidents: quota infra-stop, PM-ladder-exhausted x2 segments, 1 conflict park. Debt: frozen-base needs architect ruling (next boundary); INTENT:318 owner edit still open; config-compose README prices drift pre-existing.
- Operator: STOP — no relaunch (2nd stuck 0-merge; predicted boundary ruling did not materialize — resume, no architect). Gates skipped (tree unchanged). Run-config fix for dead agy legs follows (operator writ); implementer-primary flip stays owner call.

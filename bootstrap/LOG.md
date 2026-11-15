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

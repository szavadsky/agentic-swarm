# Advice digest — bootstrap context

Read 2026-11-12. Sources: `manifesto.md` (216 lines, HEAD 9de772c), `manifesto.advice.md` (397 lines). Claims VERIFIED by reading unless marked INFERRED; repo pointers spot-checked: `plugins/software-factory/config/schemas/plan.schema.json`, 21 schema files, `docs/runs/modernize`, `agents/steps/architect-plan.md`, `core/{brief,journal,steer,sessions,loops,mutex}.ts`, `plan/{apply,scheduler,limits}.ts`, `harness/omp/ndjson.ts:88`, `harness/omp/classify.ts:104`.

**Source discrepancy (VERIFIED).** The promised `[REVIEW Mn]` bullets and `## Review` section with U1-U17/O1-O15 do not exist. `rg -uu 'U17|O15|M10'` finds nothing repo-wide; all three git revisions of `manifesto.md` (9de772c, 8317533, da2f43f) lack them; `manifesto.md:202-216` contains only `## AI REVIEW — open after propagation` plus the N19 glossary. `manifesto.md:204` and `manifesto.advice.md:3` confirm all review items were decided and folded into the N1-N19 log (`manifesto.md:145-200`). Source counts: U=0/17, O=0/15, M=0/10. Below: the actual 9 uncertainties, 20 decisions, 10 derivable contradictions. Do not search for U/O/M labels.

## 1. Bootstrap-relevant advice

- **Baseline to beat** (advice:11-24): last "modernize" run = 50 items, 33 merged, 261 launches, 37.6M input tokens, $11.01; architect role 81 launches / $5.22 / 47% (wave reports ~34, consults ~25, revises ~10, close-ups 4, plans 5); one $2.86 Opus plan call exceeded all developers ($2.31). The old "158 launches" headline missed 103 item-level launches. Token counts are uncached only (`ndjson.ts:88` sums `u.input`); hit rate unmeasurable until A1.
- **Iteration 0** (manifesto:129-132): the ingesting agent prepares the minimum new version on a branch of `plugins/software-factory`, copies the last promoted build to a pinned dir, runs only from there. Pin = last build that passed the no-model E2E suite; never the tree being edited. Session store outside worktrees and git, last N runs.
- **First measurable launch cut line**: after D1 + D2 (advice:58), i.e. all rows A1-D2 below. Do not cut earlier: until D1, the boundary turn re-emits the whole plan through `plan.schema.json`, the re-issue Intent rejects (advice:74; manifesto:32).
- **Suggested order** (advice:60-77; S/M = size): A1 usage cache fields + persist partial usage on timeout/SIGTERM (S) → A2 sessions/transcripts outside worktree, last N (M) → A3 goal checkout + sessions outside disposable worktree root (M) → B0 `parked/awaiting-architect` status + `isIterationTerminal` + scheduler + brief root causes + no-model E2E (S) → B1 architect only at iteration boundary (M, core) → B2 history-based no-progress + one turn budget per item (S) → B3 review 2 rounds, last decides park or merge-with-debt (M) → B4 waves re-owned by PM as dispatch sets (M) → B5 rewrite `agents/steps/architect-plan.md`; delete revise/wave-report/close-up/consult fragments (M) → B6 PM derives task files, DAG, dispatch sets; splits/merges; deterministic reconcile (M) → C1 task path without architect (S) → C2 one front agent classify+scope+context pack+infra (M) → D1 drop schema plan, light validator (M) → D2 re-derive architect session ref from last ok record `meta.session` (M) → E1 absolute + per-harness concurrency (S) → E2 mailbox PM lifecycle/outbox (M).
- **Minimal kernel** (INFERRED from the order and B0 dependency): B0 park state, B1 architect queue, B5 one-turn architect, B6 PM, D1 markdown plan + validator, D2 session recovery, A2/A3 durable session store, A1 cache-aware usage for metrics. The advice cut line also requires C1/C2; E1/E2 can land right after the first launch if dispatch/steering stays serial. B1 cannot land before B0.
- **B1 mechanics** (advice:78): do not delete the twelve call sites one by one. Replace each with "enqueue a brief item, park the work" (parkable only after B0); the boundary drains the queue into one brief. `earlyBoundary` is off by default and does not exist in source (VERIFIED: no grep hit); record idle task-minutes as a tuning metric.
- **Defer** (advice:382-388): hierarchy level 2, extra storage backends, a flow DSL, compatibility shims for the old plugin (lift files), ADR machinery, ceremony launches (wave report/close-up/plan review), schema-per-output. Spikes: S2 advisory plan review before B5; S4 free/Go model reachability before launching on them; S3 adapters when a second harness starts; S5 compaction policy during bootstrap (advice:375-380).
- **Self-run loop, one iteration per launch** (manifesto:130-132; advice:56,240): set launch iteration limit 1 (INFERRED: "one iteration at a time", and a launch is bounded by the iteration limit, manifesto:208). Fixed benchmark goal re-run every iteration, baselines in `plugins/software-factory/docs/runs`; each launch a cheap scout distils previous artifacts/transcripts into an evidence digest (cost by role, loops, failures, interventions, paths); architect reads digest, drills by path; pin the scout model because inline subagents inherit the parent's. First architect turn of a relaunch carries debt review; same goal = same goal directory (advice:241; manifesto:56).
- **Metrics from launch 1** (manifesto:132): architect launches, architect cost share, cost per merged task, loop incidents, human interventions; add idle task-minutes (advice:78). Exit rule: two consecutive iterations with no merge, no landed spike finding, no material plan change → exit for owner (advice:239).

## 2. Uncertainties actually in source (U1-U17 absent)

All rows carry `*Confirm:*` / `Open:` markers in `manifesto.md:145-200`; none blocks the first bootstrap iteration. 9 rows = 7 *Confirm* readings + 1 Open sub-question + N15 (resolved).

| # | Source | Uncertainty | Blocks 1st iteration? |
|---|---|---|---|
| U1 | manifesto:150 | "that shall be exception" = mid-iteration consult is the measured exception | No — default is boundary consult; exception off (manifesto:19,26) |
| U2 | manifesto:150 | "separate completeness check for subepics" = one check per sub-epic by its own architect | No — depth-1 is the norm; subarchitect work deferred (manifesto:36) |
| U3 | manifesto:159 | "how exactly to order is case to" = "case by case" | No — factory build order is advice §3 |
| U4 | manifesto:176 | "if weaker prompt can read" = the weaker model's prompt can read the plan | No — advisory review is S2, optional at boundary |
| U5 | manifesto:176 | Open: what "consider" binds — must the architect answer each finding or only read them? | No — implement non-blocking read-and-consider; N2b spans ignore→clarify→change (manifesto:196); revisit after S2 |
| U6 | manifesto:178 | "in v1 PM owns DAG/tasks based on plan" = model to keep, not a v1 defect | No — N4b confirms PM ownership (manifesto:197) |
| U7 | manifesto:197 | "more formal larhing" = "more formal shape" | No — PM is paper-pusher; architect intent governs |
| U8 | manifesto:199 | "reviwer context is not ed" = reviewer sees neither edits nor reasoning about them | No — binding reviewer-context rule; encode now (advice:264) |
| U9 | manifesto:189,200 | N15 was unanswered, then confirmed: highest supported effort resolved at pre-flight | No — resolved |

## 3. Owner options/decisions (O1-O15 absent; N1-N19+1 are actual)

Markers: `manifesto.md:204` says all items decided; `*Confirm*` readings are U4-U8 above. "Kernel impact" = what the first build must contain.

| # | Option / decision | Marker | Kernel impact |
|---|---|---|---|
| O1 | N1: iteration runs to exhaustion when a spike lands; no early exit | decided, manifesto:19,175 | Scheduler does not treat landed spike as terminal; dependents idle to boundary |
| O2 | N2/N2b: weaker model reviews plan as advisory, not veto; consider = ignore/clarify/change; answer-each still open | decided, manifesto:23,176,196; U5 open | Optional boundary review step; no schema, no gate |
| O3 | N3: in-flight work finishes and parks unmerged; consult waits for unblocked DAG remainder | decided, manifesto:63,177 | Park state + architect queue (B0/B1) |
| O4 | N4/N4b: PM owns DAG/tasks/dispatch sets, splits/merges, resolves what determinism cannot; paper-pusher | decided, manifesto:32,178,197 | PM step + plan→task derivation (B6) |
| O5 | N5: one markdown plan; PM derives task files/waves/DAG; architect never maintains schemas | decided, manifesto:22,179 | Plan schema only transitional; D1 |
| O6 | N6: park, report by root cause, autonomous preset continues | decided, manifesto:180; advice §5 | Brief root causes; preset branch |
| O7 | N7: historic debt may be addressed; no new debt created by the goal | decided, manifesto:56,181 | Debt review in architect prompt; debt ledger (advice:229,367) |
| O8 | N8: on per-iteration budget hit, drain — no new dispatch | decided, manifesto:58,182 | Budget checked at dispatch admission (advice:281) |
| O9 | N9/N9b: compaction = transcript trimming, not handoff; learn reuse during bootstrap; per-review-iteration rules config-driven | decided, manifesto:31,183,198 | Continuity/compaction hooks; session store; config |
| O10 | N10: session store outside worktrees/git, last N; scout-distilled digest | decided, manifesto:130,184 | Session-store path in run config; digest step |
| O11 | N11: subarchitect owns his iteration status; dispatch stays in one script; main architect picks set; register in saga plan | decided, manifesto:38,185 | Architect register; status ownership |
| O12 | N12/N12b: same-model reviewer with different focus is valid; pairing per task-type flow; no wave review; reviewer sees neither edits nor reasoning | decided, manifesto:43-45,186,199 | Reviewer prompt/context builder; flow config |
| O13 | N13: import everything reasonable; intent/principles/observation decide | decided, manifesto:5,187 | None (scope rule) |
| O14 | N14: interface plus plain folder first; other storage backends later | decided, manifesto:125,188 | Artifact-storage interface + folder backend |
| O15 | N15: highest supported effort, resolved at pre-flight | confirmed, manifesto:140,200 | `ModelProbe.effort` per-model probe at pre-flight (advice:148 gap) |
| O16 | N16: pinned last-good, no-model E2E promotion gate, metrics, fixed benchmark | agreed, manifesto:132,190 | Launch pinning + E2E gate + metrics |
| O17 | N17: repo conventions win | agreed, manifesto:71,191 | Prompts/defaults only |
| O18 | N18: opaque harness config passed at launch | agreed, manifesto:84,192 | Harness config passthrough |
| O19 | N19 glossary: goal/launch/iteration/saga/epic/task/milestone/spike/wave/PM/reviewer/concern/remarkable/context pack | decided, manifesto:206-216 | Type/naming contract |
| O20 | OpenCode free models first; promote on measured failure | decided, manifesto:139,193 | Default aliases/front agent on OpenCode |

## 4. M1-M10 status and the 10 actual contradictions

No M-labelled review bullets exist (see discrepancy). The derivable review-like findings, each with resolution:

| # | Wrong / contradictory | Resolution |
|---|---|---|
| X1 | advice:78 spike-triggered `earlyBoundary` ends the iteration; manifesto:19 says a landed spike does not end it | Do not implement for spikes now; dependents idle to boundary. Manifesto wins. |
| X2 | advice:78 steer-triggered `earlyBoundary` ends the iteration; manifesto:63 says the consult waits for the unblocked DAG to exhaust | Keep `earlyBoundary` off; enabling any early boundary is an owner decision, not a bootstrap default. |
| X3 | advice:294 compacts implementer/reviewer only when parked/blocked; advice:292 says compact at end of implement turn to cover the fix gap; manifesto:31 says compact at end of session for review/next iteration | Compact at end of any session with likely reuse (implement turn when a fix round may follow); config tunes reuse, does not forbid. |
| X4 | advice:56 "copy the last green build" vs manifesto:132 "pinned last-good ... promote after the no-model E2E suite passes" | Pin = last promoted build only; never a dev/green tree. |
| X5 | advice:74 keeps whole-plan schema re-issue until D1; manifesto:32 forbids whole-plan re-issue | Make D1 a prerequisite of the first measured launch (cut line already implies it). |
| X6 | advice:263 follow-up offers compacted session or de novo; manifesto:78 also requires "different model" | Keep all three follow-up options in flow config. |
| X7 | advice:147 says resume is cwd-bound (`SessionRef.cwd`); advice:295 says Claude Code resumes by id from any dir, Codex needs `--cd`, OpenCode is location-bound | Make cwd a per-harness requirement/probe, not a universal invariant. |
| X8 | advice:148: quota/rate/overload share one transient bucket, overflow has no pattern, classifier tests `stopReason === "abort"` while streams emit `"aborted"` (VERIFIED classify.ts:104) | Fix Stop classification in S1 before trusting infra-vs-task accounting. |
| X9 | advice:21 deletes close-up as a launch but advice:86 keeps `closeup-N.yaml` + ok record because v2 counts iterations from them | Keep the record, not the launch; derive keeps counting. |
| X10 | advice:148 says `Caps.effort` has no per-model probe; manifesto:140 requires pre-flight effort resolution | Move effort off `Caps` to the optional `ModelProbe.effort`; pre-flight refuses a configured effort the probe does not list. |

## 5. Concrete technical recommendations (advice §4-§6)

- **Harness contract**: `Caps` per model probed at pre-flight (resume, compact none/local/server, fork, subagents none/spawn/steer, structuredOutput none/native, usage.cache/cost); flows branch on `Caps`, never harness id; effort is not on `Caps` — the optional `probe` returns `ModelProbe.effort` (`string[]` or `null`) — and optional ops (`compact`/`fork`/`import`) sit on a separate object so a missing capability is a type error (advice:96-149).
- **Stop union**: `done`/`cancelled`/`refusal`/`truncated(max-tokens|turn-limit)`/`infra(quota|rate|auth|crash|overflow|timeout)`; infra never consumes review rounds or item budget; refusal/truncated are task-side (advice:132-146).
- **SessionRef**: harness, id, cwd, model, `lastRequestStartedAt` (hot/cold from request start, not turn end), retentionTier short/long, compacted (read from session-file `compaction` entries) (advice:140-148).
- **Functional core**: pure `derive(plan, records) -> State` + `next(state, limits) -> Action[]`; shell appends records; crash recovery = call `derive` again; no state file to corrupt (advice:186-191).
- **One step-outcome schema**: status done/blocked/failed/upscope, summary, concerns(kind/calibration/text/evidence), forward, shell-set commit/artifacts/checks; replaces 21 v2 schemas; brief takes only forwarded + blocked-by-* (advice:193-208).
- **Brief/summary**: brief = derived status (merged / blocked root causes / pending after-states) + forwarded concerns + short hashes + queue; summary = assumed/remarkable/debt opened+closed/status (advice:219-231).
- **Retry/fallback**: `cockatiel` 4 `Policy.wrap(retry, circuitBreaker, timeout, bulkhead)`, cool-down per alias, one bulkhead per harness + global = E1; no `p-queue` (single number pretending per-harness, frees slots on abort) — use keyed mutex/bulkheads (advice:309,328).
- **Schemas**: `zod` 4 `z.toJSONSchema` as single source, `Ajv2020`; `yaml` 2 document API for node-pointed validator errors and comment-preserving PM patches (advice:310-311).
- **Durability**: memoised steps keyed (slug, step, round) on existing `core/journal.ts`; no Temporal/Restate/DBOS/Inngest (server/DB required) (advice:312).
- **Mailbox**: Maildir writer contract — private tmp dir on same fs, `rename()` into inbox; readers need size-stability for foreign files; content-hash idempotence; PM output = steer id, targets, effect info/hold/invalidate, summary; lifecycle new→structured→processed (advice:275-277,313).
- **Merge queue**: integrate onto current head in scratch worktree, gate there, move integration ref with `git update-ref`, sync the checkout; one serial queue, batch slow gates and bisect; `git merge-tree --write-tree` pre-check; conflict → one implementer merge attempt then park; never rebase; squash-merge per task; GitHub merge queue org-only, bors archived → build (advice:269-271,314).
- **Dispatch/worktrees**: branch from integration head at dispatch, not plan time; no stacked branches; no concurrent overlapping `scope` (advisory + merge backstop); serialize checks when infra not parallel-safe; `gc.auto=0` + `repo.writeLock` already; idle timeout ≠ wall timeout; always non-interactive; reconcile orphans at startup (advice:251-256).
- **Accounting**: per-turn usage with cache fields + alias; keep in/cacheRead/cacheWrite5m/cacheWrite1h/out/reasoningOut disjoint (Anthropic input excludes cache reads; OTel GenAI includes them); `models.dev` price table; OTel GenAI field names; persist partial usage on timeout/SIGTERM; subscription cost from price table; circuit breaker per alias; cross-harness fallback restarts de novo unless graph edge (advice:280-285,316-317).
- **Compaction/cache**: validator → compact → store ref, before process exit; omp `providers.cacheRetention` enum auto/short/long/none — set `short` (default `auto` keeps 1 h on Anthropic OAuth, doubles write price); hot iff `now - lastRequestStartedAt < ttl`; omp compacts Claude server-side with portable summary text, OpenAI gets same-provider placeholder; Claude Code `/compact` is client-side; no idle warming; compact at end of implement turn for the fix gap; compaction is trimming, never the handoff (advice:288-296; manifesto:118).
- **Harness facts**: omp RPC JSONL is richer than ACP (compact, `navigate_tree` with summary, fork, subagent IRC steering, host tools) — special-case it; acpx is the generic ACP layer, reaches omp as `acpx --agent 'omp acp'`, no session fork; omp resume asks to re-root if session dir missing and fails without TTY; Claude Code resumes by id from any dir; Codex needs `--cd`; OpenCode sessions are location-owned (deleted-dir behavior undocumented); inline subagents inherit parent model, so pin the scout model (advice:290-295,342; manifesto:115-118).
- **Structured output**: strict tool/yield schema only for small simple outputs; native structured output where available (Claude Code, Codex), else written files; strict formats degrade reasoning (advice:397, arXiv 2408.02442); the plan stays markdown (manifesto:22,105-107).
- **Prompts**: stable text first (role/rules/flow), volatile last (task/hashes); providers cache by prefix; fail on undefined template variable; snapshot rendered prompts in no-model tests (advice:299-300).
- **Anti-patterns**: schema-per-output, ceremony launches, nested retry budgets (v2 had six ~3 counters), raw transcripts as architect input, resuming a cold session to compact it, `p-queue` (advice:320-328).
- **Tooling**: `write-file-atomic` (works on Bun) or tmp+rename; avoid `proper-lockfile`; `gitleaks` + `pre-commit check-added-large-files`; bubblewrap or `@anthropic-ai/sandbox-runtime`; keep v2 `Semaphore`/`KeyedMutex`, ajv, model fallbacks; no `liquidjs` (partial resolver exists) (advice:342).
- **Target-project patterns**: walking skeleton/tracer bullet; Mikado for refactors; strangler fig/branch by abstraction; expand-contract; characterization tests; contract tests at seams; `fast-check` property tests; StrykerJS incremental with `@hughescr/stryker-bun-runner` scoped to changed modules; feature flag instead of long-lived slice branch (advice:330-341).
- **Architect direction** (advice:346-373): intent+why (2 lines), Done-when observable, interface shape only if another task depends, non-obvious edge cases, ordering/do-not-touch, named approach with exit, unknowns/spike; no file-by-file steps, code bodies, line counts, test lists; task = one implementer session/one seam/one diff/one Done-when; `tier: sonnet` only for PoC or different-failure escalation; temporary debt needs a named remover + cost; stop bias = list reasons to continue, stop if none is goal requirement/open debt.

## 6. Advice vs `## Intent` conflicts — manifesto wins

- Spike-triggered early boundary (advice:78) vs manifesto:19 → drop for now; dependents idle to the boundary (X1).
- Steer-triggered early boundary (advice:78) vs manifesto:63 → consult waits for the unblocked DAG to exhaust; exception remains measured/off by default (X2).
- Compaction narrowing (advice:294) vs manifesto:31 and advice:292 → compact at end of every session with likely reuse; config tunes, does not forbid (X3).
- "Last green build" pinning (advice:56) vs manifesto:132 → pin only the last promoted build after no-model E2E (X4).
- Pre-D1 whole-plan schema re-issue (advice:74) vs manifesto:32 → D1 is a launch prerequisite, not an option (X5).
- Follow-up options compacted/de novo only (advice:263) vs manifesto:78's "different model" → keep all three in config (X6).
- No other Intent conflicts found: advisory plan review (advice:84), PM paper-pusher (B6), one architect launch per iteration, compact-at-end, reviewer focus, and the harness capability layer all align.

## 7. Follow-up
**7.1 In-place, not a new package.** advice:56: "Launch: edit `plugins/software-factory` in place on a branch, copy the last green build to a pinned directory, and run iteration 0 only from there — never from the tree being edited." advice:78: B1 is the core change. Do not delete the twelve call sites one at a time. Introduce one file-backed architect queue and replace each site with "enqueue a brief item, park the work" — parkable only after B0. advice:388: "Compatibility shims for the old plugin; lift files, do not wrap them." Verdict: evolve v2 on a branch; no new package; do not rebuild v2 (§3 list, advice:383).
**7.1b Functional core.** advice:186-191 gives the target API `derive(plan: Plan, records: Records): State` and `next(state: State, limits: Limits): Action[]`, "pure and idempotent"; it does not label the work new code or name v2. §3's "Where today" maps it to existing `derive/item.ts`, `derive/wave.ts` (B0), `derive/*`, `step-runner.ts` (D2), `plan/apply.ts` (D1) → in-place refactor of existing v2 modules (INFERRED: the section itself is unlabelled).
**7.2 TOC.**
| Section | Lines | Content |
|---|---|---|
| §1-§2 | 9-51 | Evidence (run census, cost/token gaps, architect census) and target loop (front agent → architect → dispatch → merge → brief). |
| §3 | 52-91 | Iteration-0 minimum on v2: A1-E2 table, suggested order, cut line after D1+D2, B1 call-site mapping. |
| §4 | 92-232 | Interface shapes: Harness 94-150; Continuity/architect chain 151-166; PM task file 167-185; Functional core 186-192; Step outcome 193-209; Run config 210-218; Brief/summary 219-232. |
| §5 | 233-301 | Edge cases: boundary 235-242; plan 243-249; dispatch/worktrees 250-257; implement/review 258-267; merge 268-273; mailbox 274-278; accounting 279-286; sessions/compaction 287-297; prompts 298-301. |
| §6-§10 | 302-397 | Practical knowledge 302-343; architect's shoes 344-374; factory spikes 375-381; traps 382-389; sources 390-397. |
**7.3 Harness contract (verbatim excerpt; Caps 96-104, Stop 132-137, Usage 138-139, SessionRef 140-143).**
```ts
type Caps = {
  resume: boolean
  compact: 'none' | 'local' | 'server'
  fork: boolean
  subagents: 'none' | 'spawn' | 'steer'
  structuredOutput: 'none' | 'native'
  effort: string[]                       // levels this model accepts on this harness
  usage: { cache: boolean; cost: boolean }
}
type Stop =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'refusal'; details?: string }                 // task-side: the model declined
  | { kind: 'truncated'; cause: 'max-tokens' | 'turn-limit' }  // task-side: turn cut short
  | { kind: 'infra'; cause: 'quota' | 'rate' | 'auth' | 'crash' | 'overflow' | 'timeout' }
type Usage = { in: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number;
                out: number; reasoningOut: number; costUsd?: number }
type SessionRef = { harness: string; id: string; cwd: string; model: ModelRef;
                    lastRequestStartedAt: string; retentionTier: 'short' | 'long';
                    compacted: boolean }
```

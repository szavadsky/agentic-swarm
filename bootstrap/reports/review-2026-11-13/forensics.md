# Self-run forensics — records and transcripts, iterations 1–12

Read-only pass. Worktree `/home/slava/aiexp/agentic-swarm.wt/v3` (factory/self), records `.factory/artifacts/self/records/`, sessions `~/.local/share/factory/sessions/self/`. Iteration 13 (48 records, one without `end.yaml`, record `00559`) is live and excluded from every count.

## Method / how the numbers were computed

| Quantity | Source and computation |
|---|---|
| Record universe | 559 record dirs; 511 with `started.yaml` and `iteration <= 12` (13 are `i0` baseline). 172 `actor: agent` turns, 339 script steps. Parsed with PyYAML from `started.yaml` / `end.yaml` / `outcome.yaml`. |
| Turn wall time | `end.yaml.endedAt − started.yaml.startedAt`. Script steps (`commit`, `checks`, `merge-checks`, `merge`, `park`, …) hold **zero-length** windows (§5-16), so script durations are unusable and gate time is measured from the gap *before* the record plus the `Ran N tests … [Xs]` line inside `end.yaml.checks[].output`. |
| Iteration span | `max(endedAt) − min(startedAt)` over the iteration's records; iterations are one launch each (`limits.iterations: 1`, `bootstrap/run/self.yaml:52`). |
| Parallelism | `Σ agent turn walls ÷ span`; concurrency histogram from a sweep over interval endpoints. |
| Tokens / cost | `end.yaml.usage` (sum of attempts) as recorded; "est" re-prices the same counters with the run config table (`self.yaml:42-48`) where the recorded `costUsd` is 0 and the model is priced. |
| Transcripts | 88 of 168 turn transcripts still on disk (80 pruned, §5-12). 91 `.export.json` sessions map to records by the `transcript:` path (90 parseable; 1 is an omp `.jsonl`). Tool timing from `messages[].content[].time{ran,completed}`; windows clipped to each record's `[startedAt, endedAt]`. 243 further sessions are unreferenced 429-rejection attempts (§5-14). |
| Scope overlap | Task frontmatter `scope:` globs from `.factory/artifacts/self/tasks/*.md`; two globs overlap when their literal prefixes nest (the kernel's `scopesOverlap` is the same shape, `dispatch.ts:39-58`). |

---

## 1. Per-role turn statistics (i1–i12, 172 turns)

| Role | n | wall | mean / med / max | out tok | cache-read | reasoning tok | cost recorded | cost est | outcome kinds |
|---|---|---|---|---|---|---|---|---|---|
| architect | 12 | 64.5 m | 5.4 / 5.9 / 11.3 m | 356 k | 24.2 M | 52 k | **$14.30** | $14.30 | done 7, failed 2, **no outcome 3** (all infra/crash) |
| pm | 12 | 24.1 m | 2.0 / 1.8 / 5.4 m | 60 k | 9.6 M | 83 k | $0 | $0.06 | done 9, failed 3 |
| digest | 11 | 35.6 m | 3.2 / 2.8 / 7.6 m | 107 k | 16.0 M | 129 k | $0 | $0.03 | done 11 |
| implementer | 75 | **648.6 m** | 8.6 / 7.0 / 33.8 m | 810 k | 261 M | 1.25 M | $0 | $3.04 | done 70, **upscope 5** |
| reviewer | 62 | 389.1 m | 6.3 / 6.1 / 15.9 m | 364 k | 90 M | 1.04 M | $0 | $1.59 | done 62 (one of them stop=infra, one stop=cancelled) |

- Total agent wall 1162 m inside 12 launches spanning 05:02→20:05Z (15.1 h calendar, 5 retained launches).
- **94 % of turns carry `costUsd: 0`** (162/172). Only the 9 opus architect turns are priced in the record; implementer/reviewer spend is priced only at aggregation (`pricing.ts:57-70`), so record-level cost is unusable (§5-6).
- Turn-level measured split inside record windows (85 turns with a surviving transcript): tool execution 147 m (23 %), model latency 497 m (77 %). Implementer 26 % tool / 74 % model; reviewer 19 % / 81 %.
- 36 of 172 turns ran with `session.compacted: true` (architect 9 of 12, implementer 20 — long sessions reused across rounds).

---

## 2. Wall-time anatomy — why i11 took 6.2 h for 18 merges and i9 65 min for 3

| it | span | Σ agent | union(agent) | kernel/gate gap | parallelism | merges | turns | test-gate min measured | merges/turn |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 87.2 m | 189.8 | 85.8 | 1.4 | **2.18** | 7 | 29 | 14.2 | 0.24 |
| 7 | 143.5 | 251.6 | 139.0 | 4.5 | 1.75 | 14 | 38 | 24.2 | 0.37 |
| 9 | 62.9 | 136.3 | 62.9 | 0.0 | **2.17** | 3 | 18 | 7.4 | 0.17 |
| 11 | **368.8** | 394.6 | 347.9 | 20.9 | **1.07** | 18 | 50 | 28.1 | 0.36 |
| 12 | 143.2 | 132.4 | 132.4 | 10.8 | 0.92 | 6 | 18 | 9.8 | 0.33 |

Per-merge serial cost is the **same** in both iterations: i9 62.9/3 = 21.0 m, i11 368.8/18 = 20.5 m. The 5.9× span difference is turn count (2.8×) times collapsed parallelism (2.17× → 1.07×).

1. **Serialization by scope overlap, not by dependency.** The dispatcher refuses to start a step whose scope globs overlap a running task (`dispatch.ts:288, 295`). In i11 **173 of 210 task pairs (82 %) overlap**; in i9 only 1 of 15 (7 %). Cause: `test/kernel/**` is in **17 of 21** i11 scopes (i9: 1 of 6). Concurrency histogram: i11 sat at concurrency 1 for 309 of 369 min; i9 at ≤1 for 19 min, 3-wide for 30 min.
2. **Two full gate runs per merge, serialized per repo.** `commit → checks` gap median **47.2 s** (n=69) and `checks/commit/debt → merge-checks` median **50.0 s** (n=42–49); gates are mutexed on the repo root (`gates.ts:22`). i11 ran 42 gate records = 24 `checks` + 18 `merge-checks`; measured `bun test` time 28.1 m plus typecheck ≈ 33 m of serial wall charged to no-ops (§5-16).
3. **Three failed 33.8 / 13.5 / 10.2 m implement turns produced no code** (i11 `front-ladder` 00430, `prune-sweep` 00351, `harness-rotation` 00440 — all `upscope`).
4. **Idle inside iteration** is small (i11 20.9 m of 369): the launch was busy the whole time, just one task at a time. Biggest single gaps are dispatch/queue gaps ≤ 0.9 m.
5. **Model latency dominates the turns themselves** (§1): implementer mean 8.6 m of which ~6.4 m is provider time.
6. i9's 3 merges came from 6 tasks with disjoint scopes (`benchmark-kit`, `hierarchy-probe`, `acpx-session-loss`, `harness-hygiene`, `turn-target`, `prune-checks-types`); three could sit in flight together. i9 spent **26 of its 63 m** on the two tasks that were then parked (§4-3/4-4): `00250` 4.4 m + `00259` 4.5 m + `00266` 11.7 m + `00280` 5.5 m.
7. No drain/limit produced i11's stop: the launch ran to a boundary with 18 merges, 3 parks and 13 pending tasks. i9 stopped at 63 m because its 6 tasks were finished, 2 of them parked. `[INFERENCE]` nothing throttled i11; it was slow, not cut short.

---

## 3. Loops and waste (each finding cites record id / transcript)

Aggregate loop signals first — they are smaller than they feel:

| Signal | Count | Computation |
|---|---|---|
| Identical tool call repeated in one session (max) | **4×** (`00272` read `/tmp/probe-bench.out`) | 88 transcripts, normalised `(name,input)` |
| Implement turns that committed nothing | **3 of 75** (`00092`, `00259`, `00280`) | consecutive `implement` commit shas per task |
| Tasks needing a second review round | 13 of 49 reviewed tasks (review r1 49, r2 13, no r3) | `review` records by `round` |
| Turns with ≥1 retry | **145 of 172** (120 with 4 attempts, 12 with 8) | `attempts[]` length |
| Retry stops by cause | quota **432**, crash 8, cancelled 1 | `attempts[].stop.cause` |
| Turns that fell back to the paid model | **136 of 172** (free→go deepseek 132, opus→go 3, beam→go 1) | start model ≠ end model |
| Valid outcome discarded on infra/cancelled stop | **2** (`00090`, `00222`) | `outcome` present + `stop.kind ∉ {done}` |
| Context-overflow parks / `truncated` stops | **0** — the overflow path never fired; compaction did (36 turns) | `stop.kind` histogram |
| Thinking loops (≥3 reasoning-only messages in a row) | **0** | message walk |
| Orphan 429 sessions | 243 | session files with `outcome: failed`, 0 tools |

Worst turns (record window; transcript tool counts are per session, shared by resumed rounds):

1. **`00430-i11-front-ladder-implement-r1` — 33.8 m, upscope, zero code.** 159 tool calls, 11 gate invocations (6 full suites); the implementer built the front ladder, then proved the schema it needed (`stepTarget` without `iteration`) sits outside its scope and reverted. Transcript `sessions/self/20261113T112949324Z-35961b/opencode/ses_*.export.json` (title "Front ladder implementation"). Two-liner: 24 % tool time, 76 % model time; the diagnosis was correct and repeated 10 min later by `harness-rotation` (§4-7).
2. **`00240-i9-benchmark-kit-implement-r1` — 30.3 m, merged.** 16.8 m tool time (55 %) with four 170–194 s shell calls (bun install/setup, benchmark script runs); model produced 17 k output tokens over 117 calls. A setup/benchmark-heavy task, not a model problem.
3. **`00320-i11-prune-git-review-r1` — 15.9 m, review.** 10.5 m tool (66 %), **6 full package suites** plus three ~190 s shell runs: the reviewer re-ran the whole gate after each of its own checks. Reviewer gate discipline is the largest avoidable cost inside review turns.
4. **`00443` + `00448-i11-steer-holds` — 24.5 m + 5.0 m, merged after 2 rounds.** 174 tool calls in r1 (23 of them test/gate commands, 12 full or near-full suites), 6 gate runs, 52 repeated `cd …/plugins/software-factory` prefixes; r2 cost only 5 m because it inherited r1's exploration.
5. **`00242-i9-hierarchy-probe-implement-r1` — 15.6 m, merged.** 92 tool calls, 2 full gates; hierarchy probe needed many small kernel experiments.
6. **`00119-i7-acpx-adapter-implement-r1` — 19.6 m, merged.** Transcript pruned (i7 cluster dropped); record shows 4 attempts, 29.8 k output tokens, 11.0 M cache-read.
7. **`00026-i5-acpx-probe-implement-r1` — 19.2 m, spike finished.** Three quota rejections (429) before the paid fallback produced anything; that pattern is on 120 turns.
8. **`00494-i12-pm-ladder-tidy-implement-r1` — 17.9 m, upscope.** Built the PM infra-stop variant, then parked because making the iteration end as infra needs `launch.ts` (`BoundaryResult` has no `stop` field). Correct diagnosis, expensive discovery — same class as #1.
9. **`00467` + `00472-i12-front-land` — 16.9 m + 6.6 m, merged.** 156 tool calls in one session shared by both rounds (the 34 m session window spans r1, r2 and the gap between them, §5-13).
10. **`00415-i11-usage-unknown-implement-r2` — 2.5 m record / 22.8 m session** with only 2.3 m of tools: 20.5 m of pure provider latency for 6 single-file test runs. Evidence that session windows inflate when a round is resumed (§5-13), and that provider latency, not tooling, is the binding cost on this tier.

Waste not in the table above:
- **Seven of twelve iterations produced ≤1 merge**: i1 0 (plan never written, `00002`), i2/i3/i4 0 (omp resume crash, §5-2), i6 0 (PM no outcome), i8 1, i10 0 (PM no outcome). Total wall in those seven: ≈58 m plus the relaunch/architect re-plan cost.
- **Rework after parks**: 6 of 8 parked tasks were re-done later (`prune-checks`→`prune-checks-land`; `prune-checks-types`/`turn-target`→`prune-checks-land`/`turn-land`; `tier-escalation`→`pm-ladder`; `prune-sweep`→`sweep-land`; `front-ladder`/`harness-rotation`→`front-land`; `pm-ladder-tidy`→`pm-infra-stop`, live in i13). At ~15–20 m of serial implement+review+2 gates per redo, ≈1.5–2 h of the 6.2 h in i11-i12 was second attempts `[INFERENCE: aggregate; per-task evidence in §4]`.
- **Agents reaching outside their worktree**: 47 writes land outside *both* the task worktree and the goal dir — probe scripts/tests under `/tmp` and `/tmp/opencode` (reviewer/implementer experiments, the documented convention); the mandated `outcome.yaml`/task-file writes in the goal dir are allowed; plus one failed `edit` of a non-existent path `~/.local/share/agentic-swarm.wt/v3/…/preflight.ts` (`00378`) and one **git mutation of the live goal dir**: `00290` ran `git checkout -- .factory/artifacts/self/tasks/acpx-probe.md` in the run worktree (§5-5).

---

## 4. Park autopsy — all 8 parks (i7–i12)

| # | Record | Task (iter) | Recorded cause | Truth seen in record/transcript | Park correct? | Kernel behaviour that would have avoided it |
|---|---|---|---|---|---|---|
| 1 | `00108` (i7) | prune-checks | `no-progress: implement r2 repeats r1 (da0b719d)` | r1 was productive (`00084` review: "deletion-only diff, 4839 lines, 14 files"; verdict *changes* for scope reasons). r2 correctly changed nothing (`00092`: "Round 2 changed no source … already satisfies the done-when") and gates were green (`00097` checks pass, 06:57Z). The task then sat unmerged when i5 closed. | **No** — punished a correct no-op | Re-review (or auto-approve) when tree is unchanged **and** gates are green and the last verdict was `changes`; carry the task across launches instead of re-deriving it in a later iteration |
| 2 | `00210` (i7) | tier-escalation | `upscope: … flow.ts:151-162 passes only role: target.role … agent.ts:120 re-resolves` | Matches the code of the day; `resolveRole` still had no target plumbing until `turn-land` merged (`3a2b177`, i11) | **Yes** | Plan-scope rule: a task whose observable is produced by a module owns that module (only written down in the i13 plan, `plan.md:5`) |
| 3 | `00265` (i9) | prune-checks-types | `empty-diff: implement r1 committed no changes` | r1 **did** commit (`7395981`, 100 lines deleted from `src/core/checks/types.ts`; `git diff 77af4d5..7395981` non-empty). Gates were red with `package: exit 127 bash: … gates.sh: No such file or directory` (`00258`, `00264`). The retry (`00259`, transcript) verified the work, wrote `status: done`, and said in its summary: "the only outstanding issue is the gate command's missing script at this task's base". Cause was the pre-run branch tip `77af4d5` (committed 01:36Z) which predates `gates.sh` (`d405fd4`, 05:10Z). | **No** — wrong cause | (a) gate `exit 127`/ENOENT ⇒ infra, not task red; (b) sync a `base:` continuation to the integration head (done later, `c3ecf6f`); (c) stamp the red-gate names on `checks` records so the park cause can say `after red checks` |
| 4 | `00286` (i9) | turn-target | `empty-diff: implement r1 committed no changes` | Same 127 pattern (`00279`, `00285`); the diff was real: 13 files, +253/−69 (`dc95ddf`). Architect later wrote it plainly: "Parked only because its base lacked `scripts/gates.sh`; never reviewed" (`plan.md:76`). | **No** | as #3 |
| 5 | `00353` (i11) | prune-sweep | `upscope: … reachability walker still lists four files outside this task's scope` | Verified: `src/cli/index.ts`, `src/harness/fake/{index,fake-harness}.ts`, `src/kernel/register.ts` still exist and are imported only by tests; scope was `src/core/**` | **Yes** — scope too tight | Do not set a done-when whose closure (reachability) crosses the declared scope; scope by reachable set, not by directory |
| 6 | `00432` (i11) | front-ladder | `upscope: … needs the iteration to reach resolveRole; dispatch.ts:102 computes iteration yet calls stepTarget without it` | Verified in today's code (`flow-context.ts:82,116` take no iteration; `flow.ts:146` passes only the step) | **Yes** | Interface pre-flight: the plan names the interface a task consumes, and a diff that cannot reach it fails at plan time rather than after 33.8 m |
| 7 | `00442` (i11) | harness-rotation | `upscope: … `rotation … resolveRole` … outside the scope` | Duplicate of #6, discovered **10 min after** it parked, in the same iteration | **Yes but redundant** | Architect reads sibling parks inside the iteration; PM/plan marks tasks blocked on the same interface once |
| 8 | `00496` (i12) | pm-ladder-tidy | `upscope: … ending the iteration as infra needs launch.ts (`BoundaryResult` has no stop field)` | Verified: `launch.ts` sets `ended="infra"` only for front/dispatch stops; probe recorded `stop=iteration-limit` and `status: blocked-by-user` (i12 summary:52) | **Yes** — scope too tight | Same as #5; i13's `pm-infra-stop` widens scope to `launch.ts` (`plan.md:5`) |

Park cause distribution in records: upscope 5, empty-diff 2, no-progress 1. Only 3 of 8 parks are loop signals; **5 are plan/scope errors and 2 are misdiagnosed infra failures**.

---

## 5. Misclassification and silent failure

1. **Gate script missing ⇒ recorded as empty diff.** `00258/00264` (prune-checks-types) and `00279/00285` (turn-target) record `package: exit 127`; the resulting parks (`00265`, `00286`) say "committed no changes". Two code gaps: `derive-task.ts:99-104` (checks branch) resets the phase without setting `gateFix`/`gateFailure`, and only 13 `end.yaml` files in the whole run carry a `cause` (all `park` and `pm-reconcile`; no `checks` record does), so `redChecksText` (`derive-task.ts:96-108`), which reads `rec.cause`, can never render the `after red checks:` suffix that `derive-task.ts:245` promises.
2. **Stale omp resume crashes the architect, silently, three times.** `00006` (i2), `00009` (i3), `00012` (i4): 2 attempts each, both `stop.kind: infra, cause: crash`, wall 0.4 s, **no session, no usage, no outcome**. Only `00012` kept the detail: `Error: Session "01a1d348-…" not found` — the session id of the i1 architect (`00002`). Boundaries report "architect turn produced no decision: no outcome" and the summaries are filed `status: blocked-by-user` (i2/i3/i4 `summary.md:3,34`). Three iterations lost to one stale resume.
3. **PM failures filed as owner blocks.** i6 (`00101`) and i10 (`00290`) record `status: failed, summary: "invalid outcome: no outcome after repair"` (a kernel-written placeholder), and the boundary cause is "PM turn did not complete: failed: invalid outcome: no outcome after repair" with summary status `blocked-by-user`. `00290`'s transcript shows why: it read the already-corrupt `tasks/acpx-probe.md` (see #5), issued a `read` whose path was a shell one-liner, believed it had damaged the file, spent the turn trying `git checkout` (the file is untracked) and never wrote an outcome; the repair attempt (200 output tokens) failed the same way. A model/harness failure ends up as an owner decision and the launch stops.
4. **A valid outcome is thrown away when the stop is infra/cancelled.** `00090` (i5 prune-docs review) wrote `status: done, verdict: continue` yet `end.yaml` says `stop: infra, cause: crash, ok: false`; `derive-task.ts:194-195` skips infra stops, so the review was re-run 7 h later as `00114` (i7). `00222` (i7 docs-truth review r2) wrote a `done` verdict, then the paid fallback turn was `cancelled`; re-reviewed in i8 as `00230`. Both tasks merged an iteration late.
5. **Frozen task file corrupted by the PM; three "restored" records restore nothing.** `pm-reconcile` records `00106` (i7), `00228` (i8) and `00238` (i9) all say `frozen task "acpx-probe" was edited; restored`. The write itself is in `00239`'s transcript, message 15: a `write` to `tasks/acpx-probe.md` whose content ends with the model's own chatter ("Wait, kind should be in frontmatter… Let me rewrite file correctly."), duplicating the frontmatter block. Today the file still ends with that chatter plus raw tokens (`<|end|><|start|>start of thinking<|channel|>…`, lines 24-32) and its mtime is `10:28:18.832Z` — 5 ms **before** `00238` started, so the record's "restored" did not rewrite the file. Mechanism `[INFERENCE]`: `pm.ts:299` snapshots the task dir from disk at `runPm` start, so a corrupt file is snapshotted as if it were the original. The i10 PM then burned its turn trying to undo it (#3). Goal artifacts are untracked by git, so there is no recovery path.
6. **Cost is not in the records.** 162/172 turns store `costUsd: 0`; the paid `opencode-go/deepseek-v4.1-flash` runs are priced only at aggregation (`pricing.ts:57-70`, "a harness `0` is unreported"). True spend ≈ **$19.02** (recorded $14.30 + $4.72 unpriced), and per-turn cost is unavailable for every implementer/reviewer turn.
7. **Three architect turns with zero usage** (`00006/9/12`) also make iteration cost look smaller: `metrics.yaml` marks them `unpricedTurns: 1` for i2/i3/i4 and reports $0.023/$0/$0.
8. **Prompt/pack measurement half-wired.** `promptBytes` exists on 132 of 172 agent turns and only from i7 on; `packBytes` exists on **15** turns (i7–i8 only), all `packTruncated: true` at 8000 — the field silently stopped being written after i8.
9. **Iteration status never leaves `in-progress`.** `iterations/1,8,9,11,12/summary.md:3` say `in-progress` (i12 finished 20:05Z, i13 started 20:07Z); `metrics.yaml` mirrors it for i9/i11/i12.
10. **"Parked by root cause" is cumulative, not per iteration.** i11's summary reprints i7's `tier-escalation` and i9's two `empty-diff` parks (i11 `summary.md` §Parked); i8–i10 do the same. Per-iteration park attribution from summaries is wrong by construction.
11. **Second-round turns are given the first round's outcome path.** 8 cases: `00268`→`00256`, `00239`→`00237`, `00448`→`00443`, `00415`→`00410`, `00378`→`00373`, `00331`→`00313`, `00321`→`00305`, `00472`→`00467`. `00268`'s transcript first rewrites `00256/outcome.yaml` **verbatim** (msg 34) before noticing its own path (msg 61) — one wasted action and a live risk of rewriting history.
12. **Transcripts are pruned while records still point at them.** `keepRuns: 5` (`self.yaml:56`) retains 5 session clusters; **80 of 168** agent turns reference missing files (all of i5 and i7, plus `00090`). Any post-hoc audit of i5/i7 is records-only.
13. **Sessions are reused across rounds and iterations, so session-level wall/tokens are not per-turn.** 20 transcripts map to 45 records (`00015` i5 architect shares the session with `00100`, `00104`, `00226`, `00236` — i5 through i9); `00415`'s 22.8 m session window covers `00410` too. Only `end.yaml.usage` is per-turn (it is the delta, per `harness/opencode/usage.ts`).
14. **243 orphan retry sessions.** Every 429 rejection writes its own export (0 tokens, ~180 ms) that no record references; records only keep the attempt rows.
15. **Retry ladders restart from the exhausted tier.** 12 turns show 8 attempts: 3 quota rejects → one paid attempt → 3 quota rejects on the *free* model again → one paid attempt (`00020` i5 sync-base review, `00109` i7 acpx-doc). `attemptIncidents` (`metrics.ts:169-190`) documents that a call after a non-infra stop is the separate repair turn, so attempts 5-8 are the repair re-running the ladder from the bottom `[INFERENCE: the record does not mark attempt boundaries beyond stop kind]`. Nothing makes the model choice sticky.
16. **`checks`/`merge`/`commit` records are zero-length in time.** 119 of 168 `checks`/`merge-checks`/`merge` records and **all 136** `commit` records have `startedAt ≈ endedAt` (< 10 ms; max 0.21 s), e.g. `00300`: 11:48:49.683→.684 with a 59 s suite inside. All gate wall time is therefore invisible to any duration-based metric, and `metrics.yaml` cannot report it.
17. Minor: `00272` (review) read the same `/tmp/probe-bench.out` 4×; `00262` wrote+edited its own `outcome.yaml` 3×; `00108`'s park record was written 30 min after the last work record (i5→i7 boundary), so "when did this park happen" is iteration-of-derivation, not iteration-of-failure.

---

## 6. Ranked: bug / unhandled edge case | evidence | frequency | proposed handling

| # | Bug or edge case | Evidence | Freq | Handling |
|---|---|---|---|---|
| 1 | Branch-check red gate loses its cause; a broken gate command (`exit 127`) is treated as the task's fault and parks as `empty-diff` | `derive-task.ts:99-104, 96-108, 245`; `00258/00264/00279/00285`; `00265/00286` | 5 gate records, 2 parks, 2 tasks redone | Classify gate start-up errors (`127`, ENOENT, timeout-at-spawn) as infra with the command named; stamp `cause: gates:<names>` on `checks` records and set `gateFailure` in the checks branch |
| 2 | Model/harness failure filed as `blocked-by-user`, stopping the launch | i2/i3/i4 (`00006/9/12`), i6 (`00101`), i10 (`00290`) summaries `status: blocked-by-user` | 5 of 12 iterations | Add `blocked-by-infra` to `BoundaryResult`/summary; auto-retry the boundary turn next launch, or escalate the role ladder |
| 3 | Stale session resume crashes a turn with no fallback and no detail | `00012` detail `Session "01a1d348-…" not found`; `00006/00009` no detail, 0.4 s, 2 attempts | 3 turns / 3 iterations | Verify the session exists before resume; on `not found` start fresh in the same attempt; always persist `details` on both attempts |
| 4 | A valid outcome is discarded when `stop.kind` is infra/cancelled | `00090` (verdict continue, stop infra), `00222` (verdict done, stop cancelled) | 2 turns, each +1 iteration of delay | Accept a schema-valid outcome regardless of end-of-session stop; record the stop as a soft incident |
| 5 | Frozen task files can be written by the PM; the restore replays a snapshot taken from the corrupted disk state; goal artifacts are untracked | `00106/00228/00238` (`restored`), `tasks/acpx-probe.md:24-32`, mtime 10:28:18.832Z vs `00238` 10:28:18.837Z, `pm.ts:299` | 3 detections, 1 lost iteration (i10) | Snapshot from a last-known-good source (git or a run manifest), verify the restore byte-for-byte, and make the goal artifact dir tracked or checksummed; enforce read-only on frozen slugs at the tool layer |
| 6 | Scope-overlap scheduling turns the run serial: `test/kernel/**` collides across tasks | `dispatch.ts:288,295`; 82 % of i11 pairs overlap, 17/21 scopes contain `test/kernel/**`; concurrency 1 for 309/369 min | every multi-task iteration (i11, i12 100 %) | Per-module test paths in `scope:` (e.g. `test/kernel/pm.test.ts`) or a per-task test shard; make the plan's serial-chain risk explicit in the digest |
| 7 | Second-round turns get the previous round's outcome path | 8 pairs, e.g. `00268`→`00256` (prompt text vs `meta.round`), transcript msg 34 rewrites r1's file | 8 of 21 mapped r2 turns | Create the record dir/outcome path before rendering the prompt, or assert the rendered path contains `meta.round` |
| 8 | Per-record cost is harness-reported and 0 for priced models | 162/172 records `costUsd: 0`; `pricing.ts:57-70`; est $4.72 unpriced | all implementer/reviewer/pm/digest turns | Write `priceUsage()` back into `end.yaml`; keep harness value as `harnessCostUsd` |
| 9 | Retry ladder restarts at the exhausted free tier (incl. the repair attempt) | `00020`, `00109` (8 attempts: free×3 → paid → free×3 → paid); 432 quota stops | 12 turns with 8 attempts, 120 with 4 | Sticky per-turn tier: once a tier 429s, skip it for the rest of the launch; make the repair reuse the successful rung |
| 10 | Gate/script steps have zero-length timestamps; gate time invisible | `00300` (1 ms record, 59 s suite inside); 119 of 168 checks/merge and all 136 commit records < 10 ms | all script steps | Stamp `startedAt` before the gate run and `endedAt` after; add `wallMs` to `checks` records |
| 11 | Transcript retention prunes files records still reference | 80/168 missing (`sessions.keepRuns: 5`); i5 and i7 fully lost | 80 turns | Retain by reference (mark referenced transcripts), or copy a per-turn slice into the record dir |
| 12 | Sessions reused across rounds ⇒ session-level wall/tokens unattributable | 20 paths → 45 records; architect session i5→i9 | 45 records | One session per turn (or per attempt) for opencode, or slice the export by turn timestamps |
| 13 | `packBytes`/`packTruncated` stopped being recorded after i8; `promptBytes` only from i7 | 15 records with `packBytes`, all i7–i8, all truncated at 8000; 132/172 with `promptBytes` | measurement gap i9+ | Assert both fields in a boundary test and in `summary.ts` parity checks |
| 14 | Summaries/metrics never leave `in-progress`; park sections are cumulative | `iterations/{1,8,9,11,12}/summary.md:3`; i11 reprints i7/i9 parks | 5 iterations, all summaries | Derive summary status from the launch result; slice parks by `startedAt` iteration |
| 15 | No-progress park fires on a correct no-op fix turn | `00108` vs `00092` ("already satisfies the done-when") + `00097` green | 1 park (task re-done later) | If tree unchanged, gates green, last verdict `changes` ⇒ re-review once instead of park |
| 16 | A `base:` worktree is only synced when it is created; an existing one is reused at its old tip | `worktree.ts:207-222` (the `mergeRef` sync sits inside `if (!registered.includes(wtPath))`); `parked-base-sync` task text: "sync only when the worktree is created" | all `base:` continuations, incl. the i9 pair | Advance a reused, clean worktree to the integration head before the turn; include the goal dir in the containment snapshot |
| 17 | Agents can issue shell writes/git mutations against the live goal dir | `00290`: `git checkout -- .factory/artifacts/self/tasks/acpx-probe.md` in the run worktree (succeeded) | 1 observed | Read-only mount or path allowlist enforced by the harness for non-owner roles, not by prompt text |
| 18 | Control-token/format leakage accepted into file content | `tasks/acpx-probe.md:31` contains `<|end|><|start|>…<|channel|>` and a raw tool-call XML fragment | 1 file, 3 PM turns | Reject tool inputs containing control markers; scrub and re-ask |

---

## 7. Harness × model × role (i1–i12), and what never ran

Turns by the harness recorded on the turn (`end.session.harness`), the final model of the attempt chain, and the role alias. "no-outcome" = turn ended without a schema-valid outcome; "invalid outcome" = kernel wrote `status: failed` after a failed repair; "infra" = `stop.kind: infra`.

| harness | model (final) | role | n | cost rec | cost est | done | failed | no outcome | infra | cancelled |
|---|---|---|---|---|---|---|---|---|---|---|
| opencode | opencode-go/deepseek-v4.1-flash | implementer | 74 | $0 | $3.02 | 69 (+5 upscope) | 0 | 0 | 0 | 0 |
| opencode | opencode-go/deepseek-v4.1-flash | reviewer | 58 | $0 | $1.57 | 58 | 0 | 0 | 0 | 1† |
| opencode | opencode-go/deepseek-v4.1-flash | pm | 2 | $0 | $0.02 | 2 | 0 | 0 | 0 | 0 |
| opencode | opencode-go/deepseek-v4.1-flash | digest | 1 | $0 | $0.01 | 1 | 0 | 0 | 0 | 0 |
| opencode | opencode/beam-free | pm | 10 | $0 | $0 | 7 | **3** | 0 | 0 | 0 |
| opencode | opencode/beam-free | digest | 10 | $0 | $0 | 10 | 0 | 0 | 0 | 0 |
| opencode | opencode/deepseek-v4.1-flash-free | implementer | 1 | $0 | $0 | 1 | 0 | 0 | 0 | 0 |
| opencode | opencode/minimax-m3.1-flash-free | reviewer | 3 | $0 | $0 | 3 | 0 | 0 | 1* | 0 |
| omp | anthropic/claude-opus-5-5 | architect | 9 | $14.30 | — | 7 | **2** | 0 | 0 | 0 |
| — (no session written) | opencode-go/deepseek-v4.1-flash | architect | 3 | $0 | $0 | 0 | 0 | **3** | **3** | 0 |

Columns `done`/`failed` count the *outcome* status; `no outcome`/`infra`/`cancelled` count the *stop* kind, so they can overlap. \* `00090` (minimax-start) wrote `status: done` yet stopped `infra` (§5-4). † `00222` wrote `status: done` after falling back to the paid model, then was `cancelled` with the run.

Failure rates: opencode 159 turns → 3 invalid outcome (1.9 %), 1 infra (0.6 %), 1 cancelled (0.6 %), 0 missing outcome. omp 9 → 2 invalid outcome (22 %). Harness-less 3 → 3 missing outcome + infra (100 %). Final attempt model: 136 of 172 turns ended on the paid `opencode-go` deepseek, 33 stayed on their primary (9 opus, 10+10 beam-free, 3 minimax, 1 free deepseek) and 3 never reached a model. The free tier only ever contributed retries, never a completed turn after the first few minutes of a launch.

**Harness adapters present in `plugins/software-factory/src/harness/`** (`cli/harnesses.ts:23-30` registers five ids):

| Adapter | Registered id | Live turns in the self-run |
|---|---|---|
| `opencode` | opencode | 159 |
| `omp` | omp | 9 (+3 crashed attempts with no session) |
| `acpx` (agent `pi`) | pi | **0** — configured only in `bootstrap/run/self-acpx.yaml:23-26` |
| `acpx` (agent `codex`) | codex | **0** — configured only in `self-acpx.yaml:27-30` |
| `fake` | fake (tests) | 0 by design |

**Configured models/aliases that never ran a live turn:**

| Config | Alias / model | Status |
|---|---|---|
| `self.yaml:9-13` | `escalation` → omp / `anthropic/claude-sonnet-5-5` | **0 turns** — `escalateTo: escalation` landed with `pm-ladder` (`5cc0f96`, i11) but no live PM rung escalated; the one ladder stop (i12) was an infra stop (`pm-ladder-tidy`) |
| `self.yaml:36-37` | `scouts.model` = `opencode-go/deepseek-v4.1-flash` | **0 factory turns** — scouts run as omp subagents inside architect turns (`OmpHarness({subagentModel: context.scouts})`), never as a record |
| `self.yaml:8` | architect fallback `opencode-go/deepseek-v4.1-flash` | attempted 3×, all crashed before producing tokens (`00006/00009/00012`) |
| `self-acpx.yaml:23-30` | `implementer` = pi / `opencode-go/beam-free`; `reviewer` = codex / `deepseek-v4.1-flash` | **0 turns** — no self iteration used `self-acpx.yaml` |
| `benchmark.yaml` | `architect` = opencode / `opencode-go/deepseek-v4.1-flash` (plus its implementer/reviewer/pm/digest) | **0 turns** — benchmark runs are a separate goal, not this run |

Net: of 5 registered harnesses, 2 ran; of the 6 aliases in the two self run configs, 5 ran and `escalation` never did; the acpx/pi/codex rotation path the manifesto and LOG D18/D19 ask for was exercised **only** by the `acpx-probe` spike (i5, `00026`, and the acpx tasks that followed), never by a live factory turn.

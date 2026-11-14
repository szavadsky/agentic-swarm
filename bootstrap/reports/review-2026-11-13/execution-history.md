# Execution history — software-factory bootstrap + self-run (evidence report)

Scope: pre-self phases and iterations 1–12 of goal `self`. Iteration 13 is live and excluded from every total.
Sources: `bootstrap/LOG.md` (append-only; line numbers valid at read time — the file grew from 281 to 287 lines during the review, all lines cited here are before the review section and stayed stable), `.factory/artifacts/self/{metrics.yaml,intent.md,plan.md,iterations/N/summary.md,records/*,tasks/*}`, `git log --first-parent factory-v3`.
Costs/wall are from `metrics.yaml` + record timestamps (UTC→EST, UTC−5); where LOG disagrees the delta is named in §8.
Record ids are `records/<id>`; each claim traces to one of these, a LOG line, a summary, or a commit hash.

---

## 1. Timeline

### 1.1 Bootstrap (2026-11-12, before the self-run)

| Phase | Window (EST) | Wall | Cost | Output | Event |
|---|---|---|---|---|---|
| Manifesto + decisions | 13:55–19:24 | ~4 h | n/a | `manifesto.md` (`da2f43f`,`8317533`,`9de772c`), KERNEL0, D1–D9 (`aaf2225`) | worktree `.wt/v3` created 19:22 |
| Slice P (prune) | 19:38 | — | free (judgement) | `e5b41c4`,`1f80533`,`39cc69d` | src 26,059→8,964 LOC; tests 700/154 s → 188/15 s (LOG:69) |
| S0 skeleton + S1 adapters | 19:38–20:14 | 36 m | free + subscription | `2e23d8f` merge S1 | H1: package.json + `ModelRef` conflict fixed by hand (LOG:103) |
| DOC1 + DOC1R | 20:19–20:29 | 12 m (476 s + 218 s) | $0 | `cbc5b7f`, `79f4477` | 117 refs; reviewer found 10 bad citations (LOG:109-117) |
| S2 / S3 / S4 | 20:08–21:23 | ~1 h | plan/sub, unmetered | `a67189f` (S3, 20:47), `fb21bf8` (S4, 20:56), `27dbb55` (integration 21:03), S2 last 21:23 | free tier 429 retryAfter 80,035 s → subscription (LOG:141-144); H2: S3↔S4 seams + 7 red tests fixed by hand |
| INT | 21:03–21:51 | 25 m + retry | subscription | `d6ba3fd` | kernel-0, 327 tests; ECONNRESET at 108 s then resumed |
| REV (muse) | 21:55–22:39 | 47 m (2811 s) | muse, unmetered | `7428f3d` | verdict "do not launch": 4 proven findings |
| FIX | 22:39–23:13 | 32 m (1904 s) | subscription | `5c89c3c` | 335 tests; hostile shakedown test |
| Shakedown (phase C) | 23:14–23:56 | 41 m | "not reported" (LOG:197) | toy goal `kv`, `4c6a5c1` pin | 3/3 merged, 0 parked, exit 3; 24 tests re-verified by hand |

Bootstrap spend is unmetered: free-tier runs are $0, subscription/muse runs carry no cost records; v2's only comparable figure is $2.084 per run, $0.417 per merged task (LOG:86).

### 1.2 Self-run iterations

| It | Window (EST) | Wall m | Cost $ | Merged | Parks (new) | Pending end | Stop status | Notable |
|---|---|---|---|---|---|---|---|---|
| 1 | 00:02–00:13 | 11.3 | 1.2505 | 0 | 0 | 0 | in-progress, exit 0; architect turn ended, no plan (00002 `failed`) | diagnosed wrong gate form + tmp-sweep self-delete |
| 2 | 00:14–00:19 | 4.6 | 0.0226 | 0 | 0 | 0 | blocked-by-user | omp resume crash ×2, 0.4 s, no stderr (00006) |
| 3 | 00:22–00:25 | 3.6 | 0 | 0 | 0 | 0 | blocked-by-user | identical crash; steer-crash-detail mailed |
| 4 | 00:29–00:30 | 1.0 | 0 | 0 | 0 | 0 | blocked-by-user | stderr detail works: `Session "…" not found` |
| 5 | 00:33–02:00 | 87.2 | 3.3301 | 7 | 0 | 10 | stopped-with-debt; torn outcome killed launch (00090) | 18-task plan, acpx spike; 52 infra retries |
| 6 | 02:00–02:14 | 13.4 | 1.9987 | 0 | 0 | 10 | blocked-by-user; PM no outcome (00101) | goal line merged by hand `3098ad0` (3 conflict files) |
| 7 | 02:20–04:43 | 143.5 | 1.8375 | 14 | 2 | 3 | stopped-with-debt; SIGINT exit 130 after records settled | first attempt stillborn on stale pin (44 s); 66 infra retries |
| 8 | 04:55–05:09 | 13.9 | 1.0504 | 1 | 0 | 2 | architect failed waiting on scouts, no plan edit (00226) | export gates by hand `d405fd4` |
| 9 | 05:12–06:15 | 62.9 | 2.6279 | 3 | 2 | 16 | exit 3 (iteration limit) | 20 tasks derived; 2 empty-diff parks |
| 10 | 06:18–06:28 | 10.3 | 1.9865 | 0 | 0 | 16 | blocked-by-user; PM 2nd failure (00290) | PM alias promoted `12e46c8` |
| 11 | 06:30–12:39 | 368.8 | 2.6694 | 18 | 3 | 10 | exit 3 | pm-ladder merged; steer processed (only count in `humanInterventions`); 108 retries |
| 12 | 12:42–15:05 | 143.2 | 2.2726 | 6 | 1 | 13 | exit 3 | 10 M15 tasks filed; front-land + sweep-land retire 2 parks |
| 13 | 15:08–… | ≥137 | — | 5 (in flight) | 0 | — | running (`676a296` base; `factory/self` 5 ahead) | excluded: `pm-infra-stop`, `front-handoff`, `front-status`, `git-helpers-prune`, `steer-guards` |

Stop statuses: 4 launches ended without a boundary (i2–i4 blocked, 0 work), 2 `stopped-with-debt` (i5 torn outcome, i7 SIGINT), 3 `blocked-by-user` from a failed role turn (i6, i10 PM; i8 architect), 3 clean iteration-limit exits (i9, i11, i12), i1 exit 0 with no plan.

---

## 2. Totals (12 iterations; iteration 13 excluded)

| Metric | Value | Source |
|---|---|---|
| Launches / measured iterations | 13 / 12 | `metrics.yaml` totals `iterations: 12` |
| Wall (factory time) | 863.7 min = 14 h 24 m | record `startedAt/endedAt` per iteration |
| Wall (span i1 start → i12 end) | 903 min = 15 h 03 m | 05:02Z → 20:05Z |
| Cost | $19.0461 | `metrics.yaml` totals `usage.costUsd` |
| Cost per merged task | $0.389 | 19.0461 / 49 |
| Tokens | 422.5 M (402.3 M cache read; 2.58 M reasoning out) | totals `tokens` |
| Agent turns | 172 | totals `turns` |
| Merged tasks | 49 (54 merge steps − 5 in flight) | totals `merged`, record step counts |
| Merge conflicts inside the factory | 0 | totals `incidents.mergeConflicts: 0` |
| Parked tasks | 8 (8 park records) | records 108/210/265/286/353/432/442/496 |
| Pending at i12 end | 13 | `iterations/12/summary.md` Outcome |
| Infra retries / fallback hops | 288 / 149 | totals `incidents` |
| Outcome-repair turns | 21 | totals `incidents.outcomeRepairs` |
| Loop incidents | 3 (i7 1, i9 2) | totals `loopIncidents` |
| `humanInterventions` as measured | 1 | `launch.ts:265` counts processed mailbox steers only |

**Cost by role** (`metrics.yaml` totals.roles)

| Role | Turns | Cost $ | Share | Note |
|---|---|---|---|---|
| architect (opus 5.5 high) | 12 | 14.3026 | 75.1 % | 1 per launch, independent of output |
| implementer (free deepseek, fallback go-deepseek) | 75 | 3.0393 | 16.0 % | |
| reviewer (free minimax, fallback go-deepseek) | 62 | 1.5905 | 8.4 % | |
| pm (beam → go-deepseek from i11) | 12 | 0.0627 | 0.3 % | $0.03 for 25+ task files in i11 |
| digest (beam, max effort from i11) | 11 | 0.0509 | 0.3 % | |
| unpriced turns | 4 | — | — | pi/acpx-style zero usage |

**Parks by root cause** (8 events, 8 slugs)

| Cause | Count | Tasks |
|---|---|---|
| upscope (scope too tight; implementer finished in-scope work or proved the seam unreachable) | 5 | tier-escalation (210), prune-sweep (353), front-ladder (432), harness-rotation (442), pm-ladder-tidy (496) |
| empty-diff (stale `base:` tip → gates.sh missing → exit 127 → gate-fix turn commits nothing) | 2 | prune-checks-types (265), turn-target (286) |
| no-progress (r2 repeats r1; done-when contradicted the review finding) | 1 | prune-checks (108) |

**Test-count trend** (LOG lines; package gate)

188 (P, LOG:69) → 243 (S0, LOG:100) → 273 (S3, LOG:139) → 297 (S4, LOG:152) → 327 (INT, LOG:173) → 335 (FIX, LOG:190) → 369 (+32 from i5 work, LOG:233) → 419 (i7, LOG:242) → 401 (i11 after `prune-sweep` deleted dead-code tests, LOG:270) → 420 (i12, LOG:276); `pm-ladder-tidy` gate reports 424 pass / 4 skip (record 00496). Suite time 15 s → ~39 s; `gates.sh` export gate ~50 s all-in (LOG:251).

Comparison to v2 baseline: $0.417 per merged task vs $0.389 now, but architect share 14.3 % → 75.1 % (LOG:86).

Dead weight left by the run: 65 `factory-task/self/*` branches, 6 worktrees (532 MB), 42 MB session transcripts under `~/.local/share/factory/sessions/self`; no cleanup or retention task exists in the plan.

Metrics gap: totals `costPerMergedTask` is `null` although 49 tasks merged — the field the goal's own measurement milestone introduced is never populated.

---

## 3. Orchestrator / owner interventions (complete list)

Everything below is work the factory did not do for itself. "Covered" = a merged task now removes the cause; "config" = operator-owned file the factory has no authority over by design (D9).

| # | Intervention | Times | Evidence | Covered now? |
|---|---|---|---|---|
| 1 | H1: S0 merge conflict (package.json deps, `fallbacks: string[]` vs `ModelRef[]`) | 1 | LOG:103 | n/a (bootstrap slice) |
| 2 | H2: S3↔S4 integration — `config.ts` conflict resolved by hand, then 7 red seam tests fixed (`27dbb55`) | 1 | LOG:145-153 | n/a (bootstrap slice) |
| 3 | D14 flock edit broke `dispatch.sh` (`logs: unbound variable`); fixed and re-committed | 1 | LOG:132-134, `e80db86` | n/a (bootstrap script) |
| 4 | Free tier exhausted mid-flight: S2/S4 resumed on subscription, model/billing switched | 1 event / 2 slices | LOG:141-144 | no factory notion of quota-aware rescheduling; D8 fallback chain only |
| 5 | Model/allowlist config edits (D16 alibaba removal, qwen4 correction, D17 allowlist) | 3 | LOG:154-163 | config, not factory |
| 6 | H3: gate command forms in `.factory/repo.yaml` + tmp-sweep fix | 1 | LOG:209, `cd8a1ef` | partial: `probe-scratch-path` merged i11 (scratch prefix); gate form is config |
| 7 | H4: `Stop.infra.details` + omp classify keeps stderr | 1 | LOG:216-219, `c9b776b` | yes: `crash-detail-opencode` i5, `stop-details-visible` i11, `harness-hygiene` i9 |
| 8 | H5: `SessionRef.dir` resume home + de-novo retry on pruned session | 1 | LOG:221-225, `d559405` | partial: `omp-resume-test` i7 tests the hand fix; nothing generalizes it |
| 9 | H6: rehydration tolerates malformed outcome/end (torn YAML killed a launch) | 1 | LOG:226-230, `e7d908d` | **no task exists** (plan has no rehydration/torn-outcome item) |
| 10 | H7: `pricing.test.ts` read `bootstrap/run/self.yaml`; inlined + pipefail habit | 1 | LOG:235-239, `2ab4046`, `0afa8b7` | partial: export gate makes the class fail its own gate; `factory doctor` named as backlog once (LOG:247) and never planned |
| 11 | H8: `acpx-preflight.test.ts` same outside-package read; guard + repo sweep | 1 | LOG:245-248, `745c467` | partial: same as 10 |
| 12 | Export-gate change: `scripts/gates.sh` package export + `.factory/repo.yaml` rewired | 1 | LOG:251-252, `d405fd4` | config; plan rule plan.md:12 records it |
| 13 | PM alias promotion to go-deepseek after 2nd beam failure | 1 | LOG:258-259, `12e46c8` | yes: `pm-ladder` i11, `pm-frozen` i11, `pm-infra-stop` (i13, in flight) |
| 14 | beam `effort: max` on every alias | 1 | LOG:262-263, `f7e93f7` | config |
| 15 | Merge goal line `factory/self` → `factory-v3` | 6 | `3098ad0`, `67c5e24`, `1a950b1`, `9929a99`, `550b275`, `4ec622e` | **no** — D9 makes this operator work; i6 needed hunk-level resolution of 3 files |
| 16 | Promote a pinned build before each launch (`bootstrap/promote.sh`) | ≥12 (one per changed build; 5 pins retained) | `~/.local/share/factory/pins/` | **no** — documented in `operator-docs` (pending), not automated |
| 17 | Independent verification of each merge (suite + scenarios by hand) | 6 | "Merged clean … N tests green" / "Verified on the integration head" lines (e.g. LOG:242, 270, 276) | **no** — D9 by design |
| 18 | Relaunch after every fix | 12 | relaunch sentence under each iteration heading (e.g. LOG:209, 238, 247, 276) | **no** — one iteration per launch, by design |
| 19 | Kill a stalled launch | 1 | i7 exit 130 (LOG:240) | **no** — `limits` has no wall-clock bound |
| 20 | Write mailbox steers (surrogate for owner steering) | 2 | `mailbox/processed/{steer-crash-detail,steer-pm-ladder}.md` | yes: `crash-detail-opencode`, `pm-ladder` |
| 21 | Repo config authored/edited (`.factory/repo.yaml`) | 2 | `7bdc277`, `bfd1465` | config |

Counts: 8 numbered hand fixes (2 bootstrap + 6 self-run), 1 extra hand change (export gates), 2 run-config changes (PM alias, beam effort), 2 repo-config edits, 6 goal-line merges, ≥12 promotes, 6 verifications, 12 relaunches, 1 kill, 2 steers = 52 human acts against 49 factory merges. The architect calls all of this "the owner" (e.g. 00015, 00104, 00226) — the factory cannot distinguish orchestrator from owner, and its only inbound channel is the mailbox (2 messages used).

---

## 4. Owner steering ledger audit (14 implementation steers, LOG:39-61)

| # | Steer (date) | Decision | As built | Verdict | Evidence |
|---|---|---|---|---|---|
| S1 | Task statement 11-12: build the system, document usage + ideology, keep babysitting | — | code + ideology doc exist; usage doc owed | partial | `docs/ideology.md`; `operator-docs` pending (plan.md:368) |
| S2 | "assignment in file, launch CLI" | D10 | bootstrap dispatch.sh used for DOC1…FIX; factory generalizes it (task files + worktrees) | yes | LOG:96-105; tasks/*.md |
| S3 | session downgrade, launch at midnight | — | first launch 00:02 EST | yes | LOG:201 |
| S4 | reviewer = muse-contributor | D12 | REV ran on muse; factory reviewer is allowlisted free minimax | yes | LOG:176-180 |
| S5 | longcat not a coding model | D13 | no longcat in any alias; D17 bans it | yes | `bootstrap/run/*.yaml` |
| S6 | limit free-tier concurrency | D14 | flock lives in `bootstrap/dispatch.sh:18` only; kernel has no slot (grep: no flock) → 288 infra retries | partial | `dispatch.sh:18`; totals `infraRetries: 288` |
| S7 | beam = mechanical tier | D15 | beam used as PM (failed twice) and digest, not mechanical | partial | 00101, 00290; promoted `12e46c8` |
| S8 | no alibaba except qwen4; go = deepseek+muse+free | D16 | no alibaba model in any config | yes | `bootstrap/run/self.yaml` |
| S9 | qwen4-max-preview omp-only | D16 fix | recorded, unused; no config names it | yes | LOG:158-160 |
| S10 | allowlist + codex and Claude legs "when ready" | D17 | allowlist honored; Claude legs live (opus architect, sonnet escalation); codex leg exists only in the never-used `self-acpx.yaml` — 0 codex/pi turns | partial | records: `harness: omp` ×10, `opencode` ×174 |
| S11 | harness roles: pi = task implementer, rotation tested | D18 | rotation parked (442), `rotation-threaded` pending; pi/codex never ran | no | plan.md:277-282, 195; 00442 |
| S12 | custom adapter only if it beats ACP (D19) | D19 | acpx adapter merged; pi/codex path is acpx | yes (code) / unproven (live) | `src/harness/acpx/`; `acpx-adapter` merged i7 |
| S13 | beam at max effort | — | applied; digest at max from i11, not i12 as the journal says | yes | 00292 (i11 digest, `effort: max`) vs LOG:263 |
| S14 | PM failures retried deterministically then escalated | mailbox steer-pm-ladder | ladder merged; at i12 end an infra rung still left the launch `iteration-limit` | partial | `pm-ladder` i11, 00494/00496 park; `pm-infra-stop` i13 |

Tally: yes 8, partial 5, no 1. The two steers aimed at *harness breadth* (S10 codex leg, S11 pi/rotation) are the ones not honored; everything model-policy shaped was honored within one iteration.

---

## 5. Recurring failure modes (ranked by count, then cost)

| # | Mode | Count | Where | Cost / damage | Status |
|---|---|---|---|---|---|
| 1 | Infra retries / fallback hops (free-tier 429, transient crashes) | 288 retries, 149 hops | i11 108/54, i7 66/33, i5 52/27, i9 30/15, i12 30/15 | tokens only (402 M cache reads); 3 launches killed i2–i4 | diagnosable since H4; no kernel throttle (S6 partial) |
| 2 | Architect turn without a plan edit | 5 of 13 turns (i1 no plan, i2–i4 no turn, i8 no edit) | 00002, none for i2–i4, 00226 | $2.28 architect + 3 launches + 34.4 min | fixed for crashes (H4/H5); i8 class (scout wait) unhandled, no task |
| 3 | PM turn without usable outcome | 3 of 13 (i6 00101, i7-r1 00105 invalid YAML, i10 00290) | 2 iterations produced zero work | $4.00 + 23.7 min | `pm-ladder`, `pm-frozen` i11; `pm-infra-stop` i13 |
| 4 | Upscope parks (plan scope too tight) | 5 of 8 parks | 210, 353, 432, 442, 496 | 11 implement + 1 review turns on parked work (56.0 M tk = 13 % of run); one park serial-blocked 13 tasks (plan.md:5) | 3/5 landers merged by i12 end (front-land, sweep-land, turn-land); `pm-infra-stop` i13, `rotation-threaded` pending |
| 5 | Empty-diff parks from stale `base:` tips | 2 parks + 4 exit-127 gate runs (00258/00264/00279/00285) | i9 parks 265/286; diagnosis 00289 | 2 tasks × 2 rounds + one replan iteration | `parked-base-sync`, `empty-diff-cause`, `turn-land`, `prune-checks-land` all merged i11 |
| 6 | Malformed/torn outcome kills the launch | 1 launch (00090) + 21 outcome repairs | i5 | 87 min iteration ended without summary | hand fix only (e7d908d); no task |
| 7 | Stale pin / promote failure masked by shell chain | 1 stillborn launch (44 s) + 2 outside-package test instances | i7, `2ab4046`, `745c467` | one wasted launch; 2 hand fixes | `pipefail` habit; `factory doctor` never planned |
| 8 | No-progress repeat | 1 park (108) + 1 incident | prune-checks | 2 implement rounds | fixed via `prune-checks-types` → `prune-checks-land` |
| 9 | Launch stall, no wall bound | 1 (i7 SIGINT, exit 130) | `limits` = concurrency 3, iterations 1; `iterationUsd` exists but is unset; no wall-clock bound | records settled; summary recovered | manual kill; no task |

Reading: dollar damage is concentrated in modes 2 and 3 (architect/PM turns that produced no work) — $6.28 of $19.05 (33 %) in iterations with 0–1 merges (i1, i2, i3, i4, i6, i10 = $5.26; i8 +$1.05). Task-level parks cost tokens and wall, not dollars, because implementers and reviewers are free models.

---

## 6. What is left per the plan

### 6.1 Pending tasks at i12 end (13; `iterations/12/summary.md`)

`doc-drift`, `epic-consult`, `epic-derive`, `epic-packs`, `epic-plumbing`, `epic-pm`, `epic-reporting`, `intent-evidence`, `operator-docs`, `plan-review`, `review-upscope`, `rotation-threaded`, `steer-guards`.
All 13 have task files and zero records at i12 end (verified: no records match). `steer-guards` and `rotation-threaded` were dispatched in i13.

### 6.2 Parked tasks (8) and their land/retry cover

| Park | It | Cause | Cover | State at i12 end |
|---|---|---|---|---|
| prune-checks | 7 | no-progress | `prune-checks-types` → `prune-checks-land` | merged i11 |
| tier-escalation | 7 | upscope | `turn-target` → `turn-land` (lands the chained branch) | merged i11 |
| prune-checks-types | 9 | empty-diff | `prune-checks-land` | merged i11 |
| turn-target | 9 | empty-diff | `turn-land` | merged i11 |
| front-ladder | 11 | upscope | `front-land` | merged i12 |
| prune-sweep | 11 | upscope | `sweep-land` | merged i12 |
| harness-rotation | 11 | upscope (branch empty) | `rotation-threaded` | **pending** |
| pm-ladder-tidy | 12 | upscope | `pm-infra-stop` | planned i13 (merged in flight) |

6 of 8 parks are retired by merged landers; the remaining two are open work items, not dead branches.

### 6.3 Debt register (plan.md, iteration-13 relaunch review) — 6 open

PM infra stop does not end the iteration + `compactArchitect` re-export → `pm-infra-stop`; front `pm` fallback resolved through `tier` → `rotation-threaded`; front-session resume unreachable / pack handoff a brief line → `front-handoff`; front-landed goal derives `active` → `front-status`; test-only exports in `src/core/git/*` → `git-helpers-prune`. All five remover tasks are M16 tasks; four merged in i13, one pending.

### 6.4 Open owner decisions (`LOG:28-35`)

4 items, all still listed as "assumption in force", none closed by an owner ack or veto:
1. Core rebuilt not patched (D1) — executed; item is stale.
2. Architect spend bound $5/launch — never breached (max architect iteration $2.51 at i5; max launch total $3.33).
3. Benchmark goal — chosen (`context/benchmark.md`); **the benchmark run itself has never been launched** (operator job, ~7 h, noted as a blocker for done at `iterations/9/summary.md`).
4. Superseded root documents — removed by `prune-docs` (i7, `67c5e24`); owner veto window is passing unnoticed.

### 6.5 Milestones

| Milestone | Tasks | State |
|---|---|---|
| M1 Foundation, M2 Measurement, M3 Prune, M4 spike, M5 acpx, M6 flow promises, M7 i5 debt, M8 i7 debt | 3+6+7+1+2+6+7+7 | all merged |
| M9 Context/rotation | 2 | `session-end-compact` merged; `harness-rotation` retired into pending `rotation-threaded` |
| M10 Steering/ladder | 4 | `steer-holds`, `front-ladder`→`front-land` merged; `review-upscope`, `plan-review` pending |
| M11 Hierarchy level 2 | 8 | spike + `epic-register` only; 6 epic tasks pending (largest unbuilt block) |
| M12 Delivery | 3 | `benchmark-kit` merged; `operator-docs`, `intent-evidence` pending; benchmark run not done |
| M13 i9 debt, M14 PM ladder | 5+1 | all merged |
| M15 i11 parks/debt | 10 | 8 merged; `doc-drift`, `rotation-threaded` pending |
| M16 i12 debt | 4 | created i13; 4 merged in flight |

### 6.6 Done condition and distance

Explicit done-condition: `intent.md:19-21` — four clauses. `plan.md` has no global equivalent (only M3's per-milestone "Goal done-when" at plan.md:21).
1. "every manifesto Intent section implemented + evidence table" — 13 Intent sections (manifesto.md:6-91); evidence table = `intent-evidence` (pending), usage doc = `operator-docs` (pending); Saga/hierarchy and Harness agnosticism sections are not implemented (6+1 tasks).
2. "benchmark run and compared with v2 baseline" — kit exists; run never launched; 0 % of this clause.
3. "nothing rejected remains" — prunes merged, `sweep-land` landed a reachability test; effectively met pending review.
4. "no open debt" — false: 6 register items, 13 pending tasks, 2 open parks.

Distance: ~14 task-sized items (13 pending, of which `rotation-threaded` is the open park for harness-rotation, plus `pm-infra-stop` for pm-ladder-tidy) across 3 milestones (M11 6, M12 2, M9 1, M10 2) plus one operator benchmark run of ~7 h. At the observed landing rate that is ≥2 iterations, dominated by the M11 epic chain and by the benchmark clause no factory task can satisfy.

---

## 7. Convergence judgment

| It | Planned (new dispatches) | Merged | Pending end | Parks cum. | Debt opened/closed (summary) |
|---|---|---|---|---|---|
| 1–4 | 0 | 0 | 0 | 0 | 4 / 4 (i1 tmp-sweep; i2–i4 the same scout-cost item repeated) |
| 5 | 11 | 7 | 10 | 0 | 22 / 1 |
| 6 | 0 (9 planned, 0 filed) | 0 | 10 | 0 | 1 / 1 |
| 7 | 15 | 14 | 3 | 2 | 30 / 2 |
| 8 | 0 | 1 | 2 | 2 | 2 / 1 |
| 9 | 6 | 3 | 16 | 4 | 14 / 3 |
| 10 | 0 | 0 | 16 | 4 | 1 / 2 |
| 11 | 21 | 18 | 10 | 7 | 34 / 1 |
| 12 | 7 | 6 | 13 | 8 | 8 / 6 |
| **Σ** | **59 task slugs dispatched** | **49** | **13** | **8** | **116 / 21** |

Unit economics: $/merge 0.48 (i5) → 0.13 (i7) → 0.88 (i9) → 0.15 (i11) → 0.38 (i12); min/merge 12.5 → 10.3 → 21.0 → 20.5 → 23.9. No improving trend; cost is dominated by one architect turn per launch, so $/merge tracks merges-per-architect-hour, not learning.

Landing is real when the PM works: i7, i11 and i12 delivered 38 of 49 merges (78 %) in 3 of 12 iterations; i5 added 7. Generation outpaces landing:
- task ledger: 76 planned = 49 merged (64 %) + 8 parked (11 %) + 13 pending (17 %) + 2 spikes + 4 new;
- pending never returns below 10 after the first big plan (i9 onward: 16, 16, 10, 13);
- review debt opened 116 vs closed 21 in summary bookkeeping (inflated by repeats), while the authoritative register shrank 11 open (i5) → 6 (i13) — i.e. closure happens, but only through lander tasks, one per park, after the architect has already opened the next batch (i11 opened 34, closed 1; i12 8/6).

Verdict: **locally converging, globally diverging.** Each iteration's parks are converted into landers and merged (6/8 retired, 0 merge conflicts, 0 merged-gate failures), and the original M1–M8 programme is essentially complete. But the review step manufactures the next plan: M15 was created by i11's review, M16 by i12's, and M11 (epics) has been open since i9 with 0 of 6 build tasks started. Net pending is flat-to-rising and the done-condition's benchmark clause has had zero progress in 13 launches. On current shape the run needs ≥2 more iterations for M11+M12+M9/M10 plus a separate operator benchmark run; it will not reach "no open debt" by continuing to review its own merges at 10–30 findings per iteration.

---

## 8. Data-integrity deltas found (journal vs records)

| Claim | Source | Reality |
|---|---|---|
| i9 "steady state ($2.10)" | LOG:253 | $2.6279 total (metrics i9); $2.10 is architect only |
| i5 cost $2.5091 | iterations/5/summary.md Metrics | $3.3301 (metrics i5); summary priced architect only |
| "iteration 11 is unaffected (already running), iteration 12 picks it up" (beam max) | LOG:263 | i11 digest ran at `effort: max` (00292), 14 min after `f7e93f7` |
| "doc-drift upscoped with in-scope work complete" + "prune-sweep … upscoped" listed as i12 parks | LOG:274 | doc-drift has 0 records ever (never dispatched); prune-sweep parked in i11 (00353); i12 had exactly 1 new park (00496) |
| "front-ladder/harness-rotation still parked with land tasks planned" | LOG:274 | front-ladder was retired by `front-land`, merged in the same iteration |
| `humanInterventions` = 1 | metrics totals | `launch.ts:265` counts processed steers, not the ~50 operator acts in §3 |
| "NO summary" for i5 | LOG:226 | `iterations/5/summary.md` exists (written by the relaunch recovery, `launch.ts:230`), with the wrong cost line above |

These do not change the merge/park ledger (which reconciles exactly: 76 task files = 49 merged + 8 parked + 13 pending + 2 spikes + 4 M16), but they make the journal unsafe as the sole record: four of the seven entries misdescribe task state or cost.

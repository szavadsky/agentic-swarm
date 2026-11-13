# Architect turn anatomy — goal `self`, iterations 1–13

13 architect records (`records/*-architect-r1`), one per iteration; `metrics.yaml` shows `architect.launches: 1` for every iteration. 10 turns executed, 3 crashed before their first token (iterations 2–4). Priced architect cost **$15.7865 = 74.3%** of the run total $21.2508 (`metrics.yaml:1985-2214`), mean $1.58 per executed turn.

## What a turn consists of

- **One prompt**, 9,826 B / 125 lines (9,935 B in iteration 11, which added a steer), fixed sections: bounds; `## Turn order` = 1 completeness check, 2 relaunch debt review, 3 stop decision, 4 edit the plan; the plan bullet schema; the outcome schema (transcript T, user message 1).
- **Fixed inputs**: `intent.md` (21 lines); `iterations/<n>/context-pack.md` (8,000 B cap; 92/89/80/90 lines at iterations 10–13); `digest.md` (52/60/57/59 lines); the whole plan (216→430 lines); the previous iteration summary.
- **Reads**: pack, digest and prior summary first; then the specific record outcomes behind failed/parked tasks, then code and git evidence. 30 code-read calls in the four surviving turns.
- **Optional scouts**: 1 in iteration 10 (`HierarchySeams`, 2m55s, killed as redundant after completing), 2 in iteration 8 (`IntentGap`, `DebtCheck`), 1 documented in iteration 1 (`MeasurementSurface`).
- **Plan edit**: 1–2 `edit` calls with line-range patches; the first attempt was refused in 4 of 10 edit calls because the anchor line had been shown truncated, then re-issued.
- **Outcome**: one `write` of `records/<id>/outcome.yaml` (3.7–4.5 KB), then the session compacts (compaction event at the end of each of iterations 10–13).

Token shape is cache-read dominated: the resumed session re-sends its history on every request. Iteration 10 made 42 assistant requests: 68,479 fresh input vs 3,234,790 cache-read. Iterations 11–13 made 15/29/29 requests: 32–60 fresh input vs 0.74–1.94M cache-read.

## 1. Per-turn table

| iteration | record | wall min | cost $ | in (fresh) | cache-read | out | session | subagents | tool calls | files read | plan.md +/− (net) | tasks +/− | plan edit at end | stop |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `00002-i1-architect-r1` | 8.1 | 1.2505 | 345,000 | 3,578,918 | 41,678 | new `01a1d348` | 1 (+IntentCoverage pending) | — | — | +12/−0 (stub 0→12) | +0/−0 | stub only | done |
| 2 | `00006-i2-architect-r1` | 0.0 | 0.0000* | 0 | 0 | 0 | resume `01a1d348` → crash | 0 | — | — | 0 (12→12) | +0/−0 | no | infra crash |
| 3 | `00009-i3-architect-r1` | 0.0 | 0.0000* | 0 | 0 | 0 | resume `01a1d348` → crash | 0 | — | — | 0 (12→12) | +0/−0 | no | infra crash |
| 4 | `00012-i4-architect-r1` | 0.0 | 0.0000* | 0 | 0 | 0 | resume `01a1d348` → crash ("Session not found") | 0 | — | — | 0 (12→12) | +0/−0 | no | infra crash |
| 5 | `00015-i5-architect-r1` | 9.7 | 2.5091 | 538,511 | 7,333,396 | 76,376 | new `01a1d36c` | unknown (0 documented) | — | — | unknown (12→?) | +18/−0 | yes | done |
| 6 | `00100-i6-architect-r1` | 8.6 | 1.9987 | 70 | 2,494,682 | 43,721 | resumed `01a1d36c` | unknown (0 documented) | — | — | unknown | +9/−0 | yes | done |
| 7 | `00104-i7-architect-r1` | 3.3 | 0.8293 | 44 | 1,105,763 | 13,159 | resumed `01a1d36c` | unknown (0 documented) | — | — | unknown | +0/−0 | yes | done |
| 8 | `00226-i8-architect-r1` | 5.3 | 1.0348 | 113,294 | 1,927,050 | 23,486 | resumed `01a1d36c` | 2 | — | — | 0 (unchanged) | +0/−0 | no | done |
| 9 | `00236-i9-architect-r1` | 11.3 | 2.0985 | 54 | 1,821,856 | 53,868 | resumed `01a1d36c` | unknown (0 documented) | — | — | unknown (→216) | +19/−0 | yes | done |
| 10 | `00289-i10-architect-r1` | 7.7 | 1.9865 | 68,479 | 3,234,790 | 49,475 | new `01a1d4a3` | 1 | 45 | 9 + 7 rec | +98/−11 (net +87; 216→303) | +14/−0 | yes | done |
| 11 | `00293-i11-architect-r1` | 4.0 | 0.8885 | 32 | 739,301 | 17,293 | resumed `01a1d4a3` | 0 | 15 | 13 + 1 rec | +24/−5 (net +19; 303→322) | +1/−0 | yes | done |
| 12 | `00458-i12-architect-r1` | 6.4 | 1.7067 | 60 | 1,937,737 | 36,869 | resumed `01a1d4a3` | 0 | 30 | 10 + 4 rec | +76/−9 (net +67; 322→389) | +10/−0 | yes | done |
| 13 | `00513-i13-architect-r1` | 6.3 | 1.4839 | 60 | 1,728,480 | 30,899 | resumed `01a1d4a3` | 0 | 35 | 11 + 5 rec | +50/−9 (net +41; 389→430) | +4/−0 (+8 register items) | yes | done |

Legend. Wall = `endedAt − startedAt` (record YAML). Cost = `metrics.yaml` `roles.architect.usage.costUsd`, equal to record `usage.costUsd`; `*` = attempts produced no usage and no cost (metrics counts 3 unpriced architect turns). Session = record `session.id`; new/resumed relative to the previous architect turn. Subagents = `task`/scout spawns, "documented" = named in outcome/summary. Tool calls and files are from transcript T only: "—" = no surviving transcript. Files = distinct literal paths named + record directories (`rec`). Plan +/− = inserted lines / existing lines replaced by a `PUT` op; no standalone deletions occurred. Tasks +/− = new task bullets / cancelled bullets; merged milestones collapsed are not counted as cancellations.

Turn notes (record evidence):
- Iteration 1: 2 attempts in one turn (345,000 then 6 fresh input); outcome `failed`; plan left as a 12-line header + gate-rules stub (`records/00002-i1-architect-r1/outcome.yaml:1-2`; `iterations/2/digest.md:40`).
- Iterations 2–4: both attempts (Opus, then `opencode-go/deepseek-v4.1-flash`) crashed in 0.4 s with zero usage; iteration 4's stop carries `Error: Session "01a1d348-..." not found` (`records/00012-i4-architect-r1/end.yaml`; `bootstrap/LOG.md:213,218,223`).
- Iteration 5: 18 tasks in six milestones (`records/00015-i5-architect-r1/outcome.yaml:2`); archived session dir `20261113T053254201Z-21dfa4` is absent.
- Iteration 6: +9 tasks (2 acpx + 7 M7 debt removers); M1 collapsed to one line (`records/00100-i6-architect-r1/outcome.yaml:17-25`).
- Iteration 7: 0 new tasks; strategy rewritten, 2 rules added, iteration-7 debt register (`records/00104-i7-architect-r1/outcome.yaml:20-28`).
- Iteration 8: no plan edit; ended waiting on 2 scouts (`iterations/8/summary.md:6`); outcome `failed`.
- Iteration 9: +19 tasks (3 new + M8 7 + M9 2 + M10 4 + M12 3); M2/M4/M5/M7 collapsed (16 merged bullets removed) (`records/00236-i9-architect-r1/outcome.yaml:12-22`).
- Iteration 10: +14 tasks (7 land/M13, 7 M11); scout spawned and killed (`records/00289-i10-architect-r1/outcome.yaml:10-22`).
- Iteration 11: +1 task `pm-ladder` (M14) (`records/00293-i11-architect-r1/outcome.yaml:12`).
- Iteration 12: +10 tasks (M15) (`records/00458-i12-architect-r1/outcome.yaml:17-21`).
- Iteration 13: +4 tasks (M16) plus 6 open and 2 closed debt-register items (`records/00513-i13-architect-r1/outcome.yaml:18-22`; `plan.md:418-430`).

## 2. Reads vs plan writes (surviving transcript, iterations 10–13)

Transcript T is one resumed session covering 4 turns and 125 tool calls.

| turn | calls | records+summaries+code reads | share | plan reads | edit calls (applied) | outcome writes |
|---|---|---|---|---|---|---|
| 10 | 45 | 19 (+4 scout-result reads) | 42% (51%) | 14 | 3 (2) | 1 |
| 11 | 15 | 8 | 53% | 5 | 1 (1) | 1 |
| 12 | 30 | 16 | 53% | 9 | 4 (2) | 1 |
| 13 | 35 | 13 (+2 notes reads) | 37% | 13 | 2 (1) | 1 |
| all | 125 | 56 (+4 scout) | 45% (48%) | 41 | 10 (6) | 4 |

The completeness check (records, summaries, code) is 56 of 125 calls; plan reads are 41; applied plan writes are 6 (4.8% of calls; 10 edit attempts = 8%, four refused on truncated anchors). Remaining calls: 4 scout-result reads, 1 scout spawn, 1 scout kill, 4 outcome writes, 6 misc bash, 2 reads of turn-made notes.

Most-read paths across the four turns (mentions in `read` paths and bash command text): `plan.md` 51; `bootstrap/context/hierarchy-probe.md` 8; `iterations/11/summary.md` 7; `src/kernel/pm.ts` 4; `iterations/12/summary.md` 4. A turn-created scratch file `/tmp/debt11.txt` also has 4 mentions.

Observed step sequences (from T):
- Iteration 10: wc/cat `intent.md`, `plan.md`, pack, digest → read plan/pack/digest → pull the `turn-target` and `prune-checks-types` records → `git log`/`git merge-tree` on both kept branches → read `worktree.ts`, `derive-task.ts`, `preflight.ts` → spawn `HierarchySeams` scout → read its result 4 times → read plan ranges → 2 applied plan patches → kill the scout → write the outcome.
- Iteration 11: read pack, digest, iteration-10 summary and the `steer-pm-ladder` file → read `pm.ts`, `boundary.ts`, `config.ts`, `summary.ts`, `types.ts` and run config → read plan ranges → 1 plan patch → write outcome.
- Iteration 12: read pack, digest and iteration-11 summary → extract iteration-11 debt into `/tmp/debt11.txt` → read `pm.ts`, `config.ts`, `flow-context.ts`, `metrics.ts`, `cli/index.ts` → 2 refused + 2 applied plan patches (one big, one 2-line ordering fix) → write outcome.
- Iteration 13: read pack, digest, iteration-12 summary and 5 record outcomes (saving debt to `/tmp/i12debt.txt`) → verify `metrics.ts`, `derive.ts`, `launch.ts`, `cli/index.ts`, `reachability.test.ts`, `architect-session.ts` → read plan ranges → 1 refused + 1 applied plan patch → write outcome.

## 3. plan.md size and structure

`plan.md` is gitignored (`.factory/artifacts/.gitignore:2`), so `git log -p` has no history for it: plan changes come from record outcomes and iteration summaries, plus the edit patches in transcript T for iterations 10–13. Sizes below are established only where stated.

| iteration | lines at end | basis |
|---|---|---|
| 1 | 12 | `iterations/2/digest.md:40` (12 lines / 965 B) |
| 2 | 12 | `iterations/3/digest.md:44` |
| 3 | 12 | `iterations/4/digest.md:51` |
| 4 | 12 | `iterations/5/digest.md:49` |
| 5 | unknown | first full plan: 18 tasks / 6 milestones (`records/00015-i5-architect-r1/outcome.yaml:2`); no snapshot |
| 6 | unknown | +9 tasks; no snapshot |
| 7 | unknown | rules + debt register; no snapshot |
| 8 | unknown (unchanged from 7) | `iterations/8/summary.md:6` |
| 9 | 216 | `wc -l` at iteration-10 start (T, 11:20:40) |
| 10 | 303 | patch arithmetic (+87 from 216); iteration-11 compaction lists debt registers ending at line 303 |
| 11 | 322 | `wc -l plan.md` = 322 in an iteration-11 opencode export; patch arithmetic matches |
| 12 | 389 | patch arithmetic (+67 from 322); iteration-13 compaction says the file ends after line 389 |
| 13 | 430 | patch arithmetic (+41 from 389); `wc -l plan.md` = 430 now |

Section structure today (430 lines):

| lines | n | heading |
|---|---|---|
| 1–6 | 6 | preamble: title, authority, strategy-iteration-13 paragraph |
| 7–14 | 8 | `## Rules every task carries` |
| 15–16 | 2 | `## M1 — Foundation — merged: sync-base, base-follow, crash-detail-opencode.` |
| 17–18 | 2 | `## M2 — Measurement — merged: cost-pricing, prompt-size, subagent-usage, metrics-incidents, budget-drain, benchmark-report.` |
| 19–57 | 39 | `## M3 — Prune` (7 task bullets) |
| 58–59 | 2 | `## M4 — Harness layer — finished spike: acpx-probe.` |
| 60–61 | 2 | `## M5 — acpx adapter (pi, codex) — merged: acpx-doc, acpx-adapter.` |
| 62–96 | 35 | `## M6 — Flow-layer promises the kernel does not keep` (6 tasks) |
| 97–98 | 2 | `## M7 — Iteration-5 review debt — merged: ...` |
| 99–137 | 39 | `## M8 — Iteration-7 review debt` (7 tasks) |
| 138–165 | 28 | `## M13 — Iteration-9 debt` (5 tasks) |
| 166–180 | 15 | `## M14 — PM retry ladder (steer steer-pm-ladder)` (1 task) |
| 181–241 | 61 | `## M15 — Iteration-11 parks and review debt` (10 tasks) |
| 242–268 | 27 | `## M16 — Iteration-12 park and review debt` (4 tasks) |
| 269–283 | 15 | `## M9 — Context economy and harness rotation` (2 tasks) |
| 284–309 | 26 | `## M10 — Steering and the escalation ladder` (4 tasks) |
| 310–360 | 51 | `## M11 — Hierarchy level 2` (8 tasks) |
| 361–377 | 17 | `## M12 — Delivery` (3 tasks) |
| 378–383 | 6 | `## Historic debt register (relaunch review, iteration 5)` |
| 384–389 | 6 | `## Historic debt register (relaunch review, iteration 6)` |
| 390–395 | 6 | `## Historic debt register (relaunch review, iteration 7)` |
| 396–401 | 6 | `## Historic debt register (relaunch review, iteration 9)` |
| 402–407 | 6 | `## Historic debt register (relaunch review, iteration 10)` |
| 408–411 | 4 | `## Historic debt register (relaunch review, iteration 11)` |
| 412–417 | 6 | `## Historic debt register (relaunch review, iteration 12)` |
| 418–430 | 13 | `## Historic debt register (relaunch review, iteration 13)` (6 open, 2 closed) |

Milestone order in the file is not numeric: M13–M16 sit between M8 and M9; the plan is append-ordered by iteration.

## 4. Turns that produced no plan edit

Transcripts for these five turns are pruned; each pair of lines gives the record/summary facts instead. No turn here wrote a full plan: iteration 1 left only a 12-line stub; iterations 2–4 and 8 wrote nothing.

- **Iteration 1** — `records/00002-i1-architect-r1`: outcome `failed` after 8.1 min and 2 attempts; summary says the turn ended before the plan was written and leaves plan.md as header + gate rules (12 lines).
- **Iteration 1** — transcript pruned; the outcome is the only record: it lists verified gate/measurement findings and names scout `MeasurementSurface`; no milestones or task bullets existed, so the PM wrote 0 task files (`iterations/2/digest.md:25-26`).
- **Iteration 2** — `records/00006-i2-architect-r1`: 0.0 min, stop `infra/crash`, 0 usage, no outcome file; both attempts died before the first token.
- **Iteration 2** — plan stayed at 12 lines; iteration status `blocked-by-user`; the summary records "no architect outcome recorded" (`iterations/2/summary.md:6`).
- **Iteration 3** — `records/00009-i3-architect-r1`: identical 0.0 min double crash, 0 usage; "no error text anywhere" until the stderr fix (`bootstrap/LOG.md:217-218`).
- **Iteration 3** — plan unchanged at 12 lines; iteration `blocked-by-user` (`iterations/4/digest.md:51`).
- **Iteration 4** — `records/00012-i4-architect-r1`: 0.0 min crash whose `details` name the missing session `01a1d348-...`; the resume ref pointed at iteration 1's session in another launch dir (`bootstrap/LOG.md:223`).
- **Iteration 4** — no edit; plan 12 lines; iteration `blocked-by-user`.
- **Iteration 8** — `iterations/8/summary.md:6`: "This turn did not edit the plan. It ended while waiting on two read-only scouts (IntentGap, DebtCheck) before the planned edits were made."
- **Iteration 8** — 5.3 min, outcome `failed`, plan unchanged from iteration 7; its next-dispatch list (new slugs continuing tier-escalation/prune-checks) was left for the next architect (`iterations/8/summary.md:38`).

## 5. Method and caveats

- Sources: `records/<id>/{started,end}.yaml` (wall, usage, stop, session), `metrics.yaml` (priced cost per role/iteration), iteration summaries/digests, and transcript T = `~/.local/share/factory/sessions/self/20261113T111726633Z-fb7b07/omp/sessions/2026-11-13T11-20-36-055Z_01a1d4a3-53d7-7668-849d-bb90e117c038.jsonl`.
- Transcript survival: only T exists (iterations 10–13, one resumed omp session). Every record transcript path for iterations 1–9 points to a deleted file; per-turn call/file counts there are unknown, and subagent counts come from outcome/summary text only.
- Plan sizes for iterations 10–13 were reconstructed by applying each successful `edit` patch in order to the iteration-10 start snapshot; the arithmetic lands exactly on 216 (iteration-10 `wc -l`), 322 (iteration-11 `wc -l`), 389 (iteration-13 compaction) and 430 (current file).
- Tool-call classification: one call, one category, priority plan-read > records > summary > code > notes > other; a bash call that mixes targets is counted once. "Files read" counts distinct literal paths named, not every file touched by a shell loop.
- Costs are `metrics.yaml` priced values; iterations 2–4 have no usage and no cost (the 3 unpriced architect turns). Wall includes the end-of-turn compaction.
- Iterations 1 and 8 each had a second, small attempt (6–8 fresh input, ~150–255K cache-read) inside the same turn; they are one architect launch, not two turns.

# Debt ledger — self goal, iterations 1-13

## 1. Totals

| measure | count |
|---|---|
| raw items: summary `Debt opened` bullets | 120 |
| raw items: plan register open clauses | 58 |
| raw items, total | 178 |
| repeats removed (net) | 57 |
| unique items | 121 |
| closed in a later iteration | 89 |
| closed in the same iteration | 14 |
| still open after iteration 13 | 18 |

Unique by category: behavior 58, doc 27, structure 19, test 12, scope 5.

By remover state: merged 96, pending 7, parked 3, none 15. Of the 15 `none`, 7 were closed by decision or an owner fix and 8 have no remover and remain open.

Counting basis: `awk` over `.factory/artifacts/self/iterations/*/summary.md` `## Debt opened` (122 bullet lines, minus 2 `none` placeholders); register clauses at `.factory/artifacts/self/plan.md:380,386,392,398,404,410,414,418-430`. Summary `Debt closed` non-`none` bullets total 21.

## 2. By iteration

| iteration | unique items opened | by category | closed later | closed same | still open after iteration 13 | sources |
|---|---|---|---|---|---|---|
| 1 | 1 | behavior 1 | 1 | 0 | 0 | iterations/1/summary.md:26 |
| 2 | 1 | behavior 1 | 1 | 0 | 0 | iterations/2/summary.md:25 |
| 3 | 0 | — | 0 | 0 | 0 | iterations/3/summary.md:25 |
| 4 | 0 | — | 0 | 0 | 0 | iterations/4/summary.md:24 |
| 5 | 32 | behavior 17, test 2, doc 8, structure 5 | 27 | 5 | 0 | iterations/5/summary.md:24-49; plan.md:380 |
| 6 | 2 | behavior 1, structure 1 | 2 | 0 | 0 | plan.md:386 |
| 7 | 21 | behavior 7, test 4, doc 5, structure 5 | 20 | 0 | 1 | iterations/7/summary.md:31-71 |
| 8 | 1 | scope 1 | 1 | 0 | 0 | iterations/8/summary.md:28-29 |
| 9 | 10 | behavior 1, test 1, doc 5, structure 1, scope 2 | 2 | 5 | 3 | iterations/9/summary.md:29-42; plan.md:398 |
| 10 | 3 | behavior 3 | 3 | 0 | 0 | plan.md:404 |
| 11 | 31 | behavior 17, test 3, doc 8, structure 3 | 24 | 1 | 6 | iterations/11/summary.md:44-91; plan.md:410 |
| 12 | 12 | behavior 7, doc 1, structure 3, scope 1 | 8 | 2 | 2 | iterations/12/summary.md:46-55; plan.md:414 |
| 13 | 7 | behavior 3, test 2, structure 1, scope 1 | 0 | 1 | 6 | iterations/13/summary.md:47-53; plan.md:418-430 |

## 3. Unique items still open after iteration 13 (18)

| iteration opened | opened by task | category | item | remover (state) |
|---|---|---|---|---|
| 7 | docs-truth (summary 7:31-71) | doc | README says benchmark prints per-role rows it lacks | `operator-docs` (pending) |
| 9 | hierarchy-probe (summary 9:29-42) | doc | KERNEL0 citations omit bootstrap/ prefix | none |
| 9 | hierarchy-probe (summary 9:29-42) | doc | Section 5 'no register read' contradicts Section 2 and 7.8 | none |
| 9 | hierarchy-probe (summary 9:29-42) | scope | Completeness claim unverifiable before hierarchy suite exists | none |
| 11 | parked-base-sync (summary 11:44-91) | doc | types.ts base comment still says parked branch tip | `doc-drift` (pending) |
| 11 | probe-scratch-path (summary 11:44-91) | doc | tmp-repo sweep rationale comment now stale | `doc-drift` (pending) |
| 11 | pm-ladder (summary 11:44-91) | doc | VARIABLES and summary comment describe old PM ask | `doc-drift` (pending) |
| 11 | usage-unknown (summary 11:44-91) | doc | README prices section lacks zero-counter exception | `doc-drift` (pending) |
| 11 | steer-holds (summary 11:44-91) | doc | VARIABLES misses steers and holds_dir | `doc-drift` (pending) |
| 11 | steer-holds (summary 11:44-91) | doc | README goal tree and steering text omit holds path | `doc-drift` (pending) |
| 12 | review (i12 register) plan:414 | behavior | Rotation unreachable; portability checked against static harness | `rotation-threaded` (parked) |
| 12 | front-land (summary 12:46-55) | structure | frontTarget passes alias name as tier argument | `rotation-threaded` (parked) |
| 13 | steer-guards (summary 13:47-53) | test | Mid-run hold re-read failure branch untested | none |
| 13 | steer-guards (summary 13:47-53) | behavior | restoreTurn creates empty plan.md where none existed | none |
| 13 | steer-guards (summary 13:47-53) | test | Boundary-to-dispatch handoff has no end-to-end test | none |
| 13 | front-status (summary 13:47-53) | behavior | Cancelled or pending front task still derives terminal blocked | none |
| 13 | front-status (summary 13:47-53) | behavior | Steer after front goal done is never consumed | none |
| 13 | rotation-threaded (summary 13:47-53) | scope | Front turn still resolves without iteration; rotating alias refused | `rotation-threaded` (parked) |

## 4. The 10 oldest open items

| iteration opened | opened by task | category | item | remover (state) |
|---|---|---|---|---|
| 7 | docs-truth (summary 7:31-71) | doc | README says benchmark prints per-role rows it lacks | `operator-docs` (pending) |
| 9 | hierarchy-probe (summary 9:29-42) | doc | KERNEL0 citations omit bootstrap/ prefix | none |
| 9 | hierarchy-probe (summary 9:29-42) | doc | Section 5 'no register read' contradicts Section 2 and 7.8 | none |
| 9 | hierarchy-probe (summary 9:29-42) | scope | Completeness claim unverifiable before hierarchy suite exists | none |
| 11 | parked-base-sync (summary 11:44-91) | doc | types.ts base comment still says parked branch tip | `doc-drift` (pending) |
| 11 | probe-scratch-path (summary 11:44-91) | doc | tmp-repo sweep rationale comment now stale | `doc-drift` (pending) |
| 11 | pm-ladder (summary 11:44-91) | doc | VARIABLES and summary comment describe old PM ask | `doc-drift` (pending) |
| 11 | usage-unknown (summary 11:44-91) | doc | README prices section lacks zero-counter exception | `doc-drift` (pending) |
| 11 | steer-holds (summary 11:44-91) | doc | VARIABLES misses steers and holds_dir | `doc-drift` (pending) |
| 11 | steer-holds (summary 11:44-91) | doc | README goal tree and steering text omit holds path | `doc-drift` (pending) |

## 5. Method and caveats

- Method: parsed every `## Debt opened` bullet and every plan register open clause; a register clause bundling several defects was split, and repeats were matched on task plus substance.
- Raw counts are net: 120 summary bullets plus 58 register clauses = 178, unique 121, so 57 repeats removed; splitting bundles means this is not a literal duplicate-line count.
- The earlier 116/21 count differs from my 120 summary bullets; two iteration-5 bullets name the later `prune-docs` task and the prior count convention is unknown. Closed 21 matches the non-`none` `Debt closed` bullets.
- Closed means a merged remover landed or a summary/register closed-with-reason entry exists; reasoned closures are dated to the registering review, and a merged remover is credited even where later prose names residue.
- States after iteration 13: iteration-13 Outcome merged/pending lists, plus park record 00560 for `rotation-threaded`; `parked` means not merged by iteration 13.
- Excluded as new items: `Parked by root cause` prose, architect narratives, and `Closed with reason` entries (used only as closure evidence).


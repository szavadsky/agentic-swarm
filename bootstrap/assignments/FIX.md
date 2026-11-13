# FIX — repair the four proven REV findings

Worktree `/home/slava/aiexp/agentic-swarm.wt/fix`, branch `factory-v3-fix`. Rules: `bootstrap/assignments/RULES.md`.

## Why

Adversarial review `bootstrap/reports/REV.md` (read it whole first — it is your spec, 87 lines) proved four defects in kernel-0 and returned the verdict "do not launch yet". You fix exactly those four plus three small behavior items from its §5, with the reviewer's repros as your tests.

## You own

`plugins/software-factory/src/kernel/**`, `test/kernel/**`, `prompts/**` as needed, and your report. Shared-core rules don't apply (nothing else builds in parallel now), but keep changes minimal and focused: no refactors, no dead-code cleanup, no file splits — the self-run does those.

## Fixes (REV § references are authoritative; the one-line direction here only)

1. Merge-crash sealer (REV §1): `recoverLaunch` seals the open merge before `recoverOpenMerge` can match it, so a crash in the ref-move window parks already-merged work. Widen the match (commit-carrying merge records sealed as infra-crash complete instead of parking) or exempt them from the sealer — whichever fits the code. Route one `merge-recovery` case through the real `recoverLaunch` so production and test stop diverging.
2. Infra stops the whole dispatch (REV §2): confine an infra stop to the faulted slug for the iteration; the dispatch ends infra only when nothing remains dispatchable. Add the two-task scenario-4 variant (one slug infra-parked, the independent slug merges).
3. Red base is written, never read (REV §3): thread base gate state into the context pack and the implementer vars (fix the mislabeled `baseline_checks`), and compare merged-result gates against the base before parking `gates:` — pre-existing red must neither tax tasks nor block unrelated merges (KERNEL0 §6).
4. Rogue-agent containment (REV §4): after each agent turn's settle, assert the worktree HEAD is still the task branch and nothing changed outside the worktree; violation parks the slug. The prompt already threatens this — make the threat true. Test with the reviewer's repro (outside write + branch switch).
5. Three small §5 items: `ensureLayout` writes a `.gitignore` for the artifact root; `turnsUsed` excludes architect/PM/infra records from `iterationTurns`; empty `scope` is rejected by `validateTaskGraph` (not silently skipped by overlap checks).

## Not this slice

Stall exit, $ brake, overflow de-novo path, empty-diff review skip, `taskHash` enforcement, usage-helper dedup, file splits, `attempts` readers — these go to the factory's own backlog, untouched here.

## Acceptance

- The four repros from REV §§1–4 become regression tests and pass; `bun run typecheck` green; full `bun test` green with no test dropped and total time still under 90 s.
- Hostile shakedown as a test, not a manual run: a toy goal whose base is deliberately red, a kill between the merge ref-move and the end record, relaunch → merged work is reported merged (not parked), the unrelated task merges, the summary attributes the pre-existing red to the base.
- Report per RULES.md, plus for each fix: the REV finding number, files changed, and the regression test name.

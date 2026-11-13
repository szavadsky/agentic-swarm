# Advisory reviews

- Model: `opencode/minimax-m3.1-flash-free` (free tier), one review per prompt on 2026-11-12; scratch `/tmp/prompt-review`; no 429, no fallback needed. Every review was useful; `changed` means the draft was edited.

## architect — useful
- Deferred milestone invisible to completeness/stop -> changed: blocks `done` until it holds tasks.
- `decision: continue` never stated; steer hold vs goal blocked -> changed: continue named; steer holds the task only.
- Clean-code bar unreadable from the prompt -> changed: stop bar cites the reviewer's findings.
- Tier and scope rules had no plan slot -> changed: scope item 4, tier item 9.
- "Never dispatch" vs scouts; no diff/round source -> changed: implementation-only dispatch; pack carries hashes/rounds.
- File-level overlap unverifiable -> changed: module granularity.

## pm — useful
- Validator loop self-contradictory -> changed: `repair` carries the script's findings; script ends a second failure.
- `deps` from bullet position vs field -> changed: explicit ordering statements only.
- Required `scope` underivable -> changed: no task plus concern when the plan states none.
- One file per bullet vs split/merge -> changed: one file per derived task.
- Revision brief empty; `-r2` collision; frozen set undefined -> changed: plan names the rework slug; frozen terminal statuses.
- Write scope excluded the outcome -> changed: outcome is the sole other write; no concern files.

## implementer — useful
- No gate baseline -> changed: `baseline_checks` input; pre-existing red reported.
- Outcome outside worktree; setup ambiguity -> changed: sole outside write; run setup when deps missing, fail once.
- Out-of-scope findings; red-test vs git bounds -> changed: concern for the architect; revert own hunk, no stash.
- Stale gates; upscope tree state -> changed: re-run after fixes; state committable/discard.
- Task fields unanchored; scouts undefined -> changed: file is authoritative; ignored for scouts (harness supplies them).

## reviewer — useful
- No worktree input -> changed: `worktree`, `git -C`.
- Debt remover invisible -> changed: check the named remover only.
- Approve/last-round conflict -> changed: approve allows a recorded deficit; `changes` unavailable last round.
- Answers unseen -> ignored: KERNEL contract is task + diff only; the implementer fixes findings instead.
- Outside-scope defect loops -> changed: forward as an architect task; evidence source -> read-only runs; diff range -> whole task.
- Early reject unreachable -> changed: must-not-merge bar before the last round.

## digest — useful
- Launch scope undefined; no-previous-launch case -> changed: previous launch only; write `no previous launch`.
- Record shape and loop key -> changed: StepRecord fields; `(slug, step)` across rounds.
- Grouping conflict; 80-line cap -> changed: one row per role/alias; precedence rule.
- Unrecorded retries; sampled counts -> changed: recorded only; sample scope marked partial.

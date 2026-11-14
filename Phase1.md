# Phase 1 — the single-level factory works as INTENT.md says

Phase 1 is what must work before hierarchy: trivial, standalone task and bigger (one architect) run as intended — resumable, cheap, merging without fences. Hierarchy, dashboard and the harness legs come after (Phase 2 = everything else in `INTENT.md`).

Bug ids (B…) and work rows (W…): `bootstrap/reports/review-2026-11-13/WORKLIST.md`; repro tests: `bootstrap/reports/review-2026-11-13/repro/`. Every bug fix starts from its repro test, which moves into the package suite.

Milestones run in this order; within a milestone, tasks run in parallel.

## M1 — Safety (test first)
- B1 containment: check only paths the task can reach; outside changes are incidents, not the turn's fault. With B15 (agents writing the goal directory / committing in the integration checkout).
- B2 red base: match inherited red by failing test/signature, never cache infra as base-red, split typecheck and tests gates. With B26 (baseline the integration head, not the base branch).
- B3 second goal: recovery touches its own goal only; lock per repo; repo id in checkout path.
- B4 drain on first signal: dispatch stops admitting at once.
- B5 boundary infra: infra result, boundary-turn retry, exit 1 with cause — never `blocked-by-user`.

## M2 — Relaunch keeps going
- Relaunch after a stop mid-iteration resumes that iteration's dispatch; no architect turn until the iteration is exhausted.
- A session that cannot be resumed → error record, de-novo start, on every adapter (B11).
- Valid outcome kept whatever the stop kind (B7). Timeouts and crashes consume the turn budget (B12). Wall-clock bound per turn and per iteration (W3). One task's exception never ends the launch (B19). Gate that cannot start is infra, not `empty-diff` (B6).
- Mailbox and PM files: dedupe steers by file, not text (B13); malformed hold/task file quarantined, never wedging launches (B14); unanswered steer doesn't hold forever (B17); PM cannot write frozen tasks, restore from a clean snapshot (B8); pending task with commits never silently cancelled (B24).

## M3 — Prompts from one source
- Adopt an established templating engine (LiquidJS unless the architect records a reason for Eta/Nunjucks); migrate every prompt; delete the homegrown renderer.
- Single definitions, included, never copied: scope definition (front, PM, reviewer), calibration, outcome, clean-code, remarkable ("what is achieved" / "what is of concern").
- Debloat every prompt per `/home/slava/aiexp/software-builder.dev/plugins/prompt-engineering/skills/prompt-debloat`; the prompt snapshot test follows.
- Agents that write schema-controlled files (front, PM, reviewer) get a validation command in the prompt (or LSP where the harness has it).
- Kernel hygiene in the gate: autoformat check, lint, schema validation of every config and schema-enforced file.

## M4 — Trivial and standalone task as intended
- Trivial: the front's session implements. After classification the kernel creates the task worktree/branch and sends a follow-up prompt into the same session with its location; merge after gates; no architect, no reviewer.
- Standalone task: the reviewer gets the task scope through the shared scope include and answers whether the real scope is substantially higher and needs architecture input; yes → park with cause `upscope`, class becomes `bigger`, the next launch runs the architect. Tasks inside an architect plan never take this path.

## M5 — Integration without fences
- Scope is a predicted, non-overlapping area, not a file list: architect and PM prompts stop asking for files; dispatch schedules on the predicted area only; nothing checks touched files. Removes B9/B18 by construction.
- End-of-wave steward: conflict-free and green → merge; conflicts or red → workhorse steward merges, resolves, runs gates, fixes the obvious, records concerns, decides holds; unresolvable → architect pointer (status + worktree + branch). Unmerged tasks relaunch on the new branch state. Steward session compacted at end, resumed when needed.
- Plan checker before the architect, with repeat (v1 `plan-completeness-checker` + `goal_flow.py` loop): read-only, evidence per plan item; concerns → follow-up execution (bounded rounds) before the architect turn; residual concerns go into the pack.
- Architect prompt opens with "review what has been done: completeness, quality, correctness".
- Plan review: after the architect turn a task-tier reviewer writes advisory findings into the next pack; the architect records whether each was helpful.
- A kept branch that is complete and green lands at the next boundary without a new task.

## M6 — Cost, measurement, done
- Per record: model, tokens (prefix assumed cached when not reported), priced cost, list-price equivalent for subscriptions, turns, work (edits, test runs). `costPerMergedTask`, real gate/commit timestamps, operator-act counter (B21, W14, W15).
- Concurrency: overall + per provider (+ model) limits in run config; dispatch admits within quota and falls back stickily — no restart at an exhausted tier (B10, W13).
- Compaction verified: happens at session end inside TTL, its cost recorded, skipped for sessions never resumed; a fix-up or next-iteration resume shows dropped reasoning and fewer input tokens (B20).
- Done sees open debt; every summary opens with the distance (pending, parks, open debt), parks listed per iteration, status derived from the launch result (B22, B27, W4).

## Done when
- `bun run typecheck`, lint/format check and `bun test` green on `factory-v3`; merged to `main`.
- Live self-iteration evidence (records/summaries): a SIGINT mid-dispatch + relaunch continued without an architect turn; the steward ran (a conflict resolved or a task ported) or was skipped for zero conflicts; the plan checker ran before the architect; a plan review was read and sampled; per-model cost and work appear in `metrics.yaml`.
- Live trivial goal `p1-trivial` merged: classified trivial, implemented in the front's session (same session id in records), no architect or reviewer turn. Intent: *remove the unused `Caps.fork` flag from `plugins/software-factory/src/harness` (types and every adapter); gates green.*
- Live standalone task goal `p1-task` merged through implement→review, no architect turn. Intent: *make the omp cache TTL (`short` by default) a run-config key passed to the omp adapter; tested.*
- Upscope covered by a scenario test (a live upscope is a bonus).

## Not Phase 1
Hierarchy (W11), dashboard and status funnel, intent-change agent, OpenCode → acpx, pi/codex/Claude Code/agy legs and rotation (W9), portability graph (W24), tier escalation (W12), artifact backends, human-involvement presets (W23), cleanliness heuristic (W22), isolation/sandbox and operator docs (W10, W17, B16, B25), retention (B23), benchmark (W8), delivery as plugin, more agent types.

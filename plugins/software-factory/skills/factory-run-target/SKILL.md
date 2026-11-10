---
name: factory-run-target
description: Run a software-factory pipeline on a target project: INTENT, launch, steer, inspect, merge.
---

# software-factory: run a pipeline on a target project

CLI: `bun <plugin>/bin/factory.ts` with `--repo <target>`. Commands: `run`, `status`, `steer`, `preflight`.

## 1. Write INTENT

- File: `<target>/.factory/tasks/<slug>/INTENT.md` (uncommitted ok).
- Keep short: goal + scope + done-criteria. Engine triages kind (saga/item/simple) itself.

## 2. First-run rule

- Main checkout must be **clean except INTENT.md** or preflight fails (`cleanliness.ts`).
- First run creates branch `topic/<slug>` + worktree `<repo>.factory-wt/topic_<slug>` + commits INTENT there.

## 3. Launch

- `factory run <slug>` (or `factory run path/INTENT.md`). One run per task (lock); SIGTERM = clean stop, step interrupted, resumable.
- Optional caps: `--max-iterations N`. Model roles override (task level): `<taskdir>/pipeline.yaml` with `models.roles.<architect|workhorse|...>.model` + `fallbacks` (layers: `config/pipeline.default.yaml` < repo `.factory/pipeline.yaml` < task `pipeline.yaml`).

## 4. Drive

- `factory status <slug>` — items, waves, spend, open questions.
- `factory steer <slug> "text"` — directive/answer to root mailbox; engine routes (epic children poll root; blocked questions forward as `q-epic-*`).
- Human gates: consult verdicts (`proceed|adjust|stop`), questions (`factory steer <slug> "answer to <qid>: ..."`).

## 5. Inspect

- Task dir: `.factory/tasks/<slug>/` in the **task worktree**: `state.yaml`, `journal.ndjson`, `runs/` (per-step `input.md`+`output.yaml`+`meta.yaml`), `closeup-*.yaml`, `steer/`.
- Records commit before each turn: full trace survives crashes (`restart recovery`).

## 6. Finish

- Items merge via gated path (target-green ratchet); task branch merges to main when waves complete.
- Merge manually after verifying tests green on the task branch; push both repos.

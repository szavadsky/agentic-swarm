# Self-improve plugin

The operator side of a self-improvement campaign: run the factory on its own
repository, one bounded iteration at a time, and keep the owner's intent and
the record facts straight.

It ships two things:

- `skills/run-self-improve/SKILL.md` — the operator runbook: role, stages, the
  iteration loop, fact-only triage, steers, recovery, operator launches and
  pitfalls. A harness that reads only `SKILL.md` gets the whole flow.
- `config/process.yaml` — a process-layer overlay that puts the previous-run
  assessment (`prompts/assess-run.md`) before the architect, on every consult
  after a goal's first.

## Install

Install the plugin with the harness's plugin manager, then copy the overlay and
prompt into the repo the campaign runs on:

```bash
mkdir -p "$REPO/.factory/prompts"
cp config/process.yaml "$REPO/.factory/process.yaml"
cp prompts/assess-run.md "$REPO/.factory/prompts/assess-run.md"
```

The overlay names the `assess` alias, so bind it in the self-run's run config —
on a cheap model, never the architect's. The run layer, worktree root, session
root and model choices stay machine-specific and live outside this plugin.

The installed flows validate with `factory validate .factory/process.yaml` and
render with `factory prompts --dry-run --repo <repo>`; the test suite runs the
same install and launches the assessment on the fake harness.

# Sandbox assumption

The factory is built to run inside a sandbox — bubblewrap, a container or a
VM. Nothing in this package creates or enforces that sandbox. The assumption is
documented so an operator can supply one and so a failure that comes from a
shared host reads as an isolation bug, not a logic bug.

Building the sandbox, and sandboxing individual harnesses, is out of scope.

## Why the whole process needs one

- Agent turns execute arbitrary commands in task worktrees.
- `setup` and every gate run repository commands on task branches.
- The run layer keeps sessions, worktrees, locks and temp files outside the
  repo; two runs on one host share `os.tmpdir()` and the checkout's parent
  unless the operator separates them.
- A harness can reach any provider key or file visible to the factory process.

## What must be inside

- The target checkout and the run layer's `worktreeRoot` (default
  `../.factory-worktrees/<repo-id>`), plus `sessions.dir` (default
  `<worktreeRoot>/.sessions`). Pre-flight refuses a root inside the repo or a
  root it cannot write.
- A private temp directory: set `TMPDIR` for `run`. The kernel checks free
  space there against `limits.minTmpFreeBytes` (default 2 GiB) and gives each
  gate its own worktree-relative `env` directories.
- Only the intended network: harness providers, and the OpenRouter model list
  when prices are fetched live; gate and setup commands need whatever their
  builds need.
- No host credentials except names in the run config's `envAllowlist` and an
  acpx harness entry's `options.env`. Every child starts from a fixed base
  environment (`PATH`, `HOME`, temp dirs, bun/node caches, git optional locks,
  locale), not the factory's environment.

## Observed isolation failures

- Package tests and a live run shared temp state: preflight-probe worktrees
  collided with test-helper purges. The helper now sweeps only entries older
  than an hour, but separate temp roots remain the real fix.
- An operator commit during a live iteration changed the checkout under a
  running turn and parked a task: containment treats outside changes as
  interference. One checkout, one live run.

## Operating check

Before a launch:

1. `pgrep -af "factory.ts run"` prints nothing for the same checkout.
2. The checkout is clean; no edits or commits land while the run is live.
3. `TMPDIR`, `worktreeRoot` and `sessions.dir` are private to this run and
   outside the repo.
4. Entries in `envAllowlist` are the credentials the harnesses actually need,
   nothing more.

See [../../README.md](../../README.md) for the config layers and
[SKILL.md](SKILL.md) for the run walkthrough.

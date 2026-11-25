# Sandbox

The run supports one process-level sandbox, configured in the run layer. It
wraps every child a launch starts, pre-flight's probes and base gates included:
`git`, setup and gate commands, and the harness processes (omp RPC, acpx
dispatcher and prompt children). The factory process and its in-process
artifact writes stay outside; the wrapper's binary is checked before the
sandbox is entered.

```yaml
sandbox:
  binary: /usr/bin/bwrap
  args:
    - --ro-bind
    - /
    - /
    - --dev
    - /dev
    - --proc
    - /proc
    - --unshare-all
    - --share-net
    - --die-with-parent
    - --bind
    - /home/operator/.local/share/factory/worktrees
    - /home/operator/.local/share/factory/worktrees
```

- `binary` is required; pre-flight refuses a missing or non-executable wrapper
  with `sandbox.binary`. `args` are passed verbatim, then `--`, then the
  child's original argv. A bwrap profile therefore ends with its writable
  binds; a wrapper that takes its program after `--` works unchanged.
- Bind the paths the run writes: the target checkout, `worktreeRoot`,
  `sessions.dir` and `TMPDIR`. Git's commit signing writes a temporary file
  under `TMPDIR`, and a read-only temp root fails the commit with
  `could not create temporary file`; bind `TMPDIR` read-write.
- Harness state directories are writable only when the profile binds them:
  omp needs `~/.omp`, an acpx dispatcher needs `~/.acpx`, and a raw acpx agent
  needs its own state directory (`~/.codex`, `~/.claude`, `~/.pi`, …). The
  path sets the spike recorded in
  `factory-task/full/sandbox-spike` `.factory/spikes/sandbox-spike.md` are the
  starting point.
- `--unshare-all --share-net` keeps model APIs reachable; this is write
  containment, not a read boundary. `--die-with-parent` prevents a dead
  factory from orphaning a model-spending child.
- A run without a `sandbox` block behaves exactly as before; both
  configurations are covered by the test suite.
- Per-flow or per-agent wrappers are not built: the run has one wrapper, and a
  harness that needs extra writable folders adds them to its profile.

See [config.md](config.md) for the run layer and [SKILL.md](SKILL.md) for the
run walkthrough.

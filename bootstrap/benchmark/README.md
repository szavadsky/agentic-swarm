# Benchmark kit — omp-workspaces

The fixed benchmark is the archived v2 run `plugins/software-factory/docs/runs/omp-workspaces`:
target `agentic-swarm@572a6e0` plus the archived INTENT (commit tree `1379b0f`),
one iteration per launch. `bootstrap/context/benchmark.md` §2–4 has the evidence
and the v2 baseline rows; §3 is the comparison table.

## Reset

Once, in this checkout, install the factory's dependencies (the run line uses
this checkout's `bin/factory.ts`):

```bash
bun install --cwd plugins/software-factory --frozen-lockfile
bootstrap/benchmark/reset.sh /tmp/bench-omp
```

`<dest>` is the benchmark root and the only path the script deletes:

```
<dest>/target    git repo: the 572a6e0 tree plus .factory/tasks/omp-workspaces/INTENT.md
                 (tree 1379b0f), .factory/repo.yaml from target-repo.yaml, and a goal
                 initialized with the archived intent
<dest>/runtime   session store and worktrees, outside the target repo
```

The script asserts the tree hash, runs the target's gates offline (install,
typecheck, test), and prints the `factory run` line. It refuses to delete `$HOME`,
this checkout, a filesystem or one-level path, or a `<dest>` whose launch lock is
still live.

## Run

Copy the printed line. `bootstrap/run/benchmark.yaml` is the cheap tier of
`self.yaml`: the free implementer, reviewer, PM and digest aliases unchanged,
the architect pinned to the subsidized deepseek tier, prices for the ids it can
use, `limits.iterations: 1`, and both runtime dirs under `<dest>`.

Runs are serial: one launch at a time reuses `<dest>/runtime` and the target's
base branch. After the launch, `factory benchmark --repo <dest>/target --goal
omp-workspaces` prints the rows to compare with the v2 baseline.

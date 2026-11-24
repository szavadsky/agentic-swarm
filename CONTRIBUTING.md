# Contributing

An agentic software factory: an orchestration layer above coding harnesses.
The product lives in `plugins/software-factory` (TypeScript, Bun). Read
`docs/ideology.md` before changing design, `INTENT.md` for the binding intent,
and `bootstrap/SELF-IMPROVE.md` for the operator runbook.

## Setup

Requires Bun and git. Nothing machine-specific (subscriptions, harnesses,
quota, paths outside the repo) is needed to build or test.

```bash
bun install --cwd plugins/software-factory --frozen-lockfile --silent
```

## Build / self-build

There is no compile step — the factory runs from source with Bun.
Self-build stays pinned: promote one commit to the pin the runs execute from
(typecheck + the no-model suite, on a clean export; the result is written to
`<pin>/gate.yaml`, and only an all-pass pin becomes `current`):

```bash
./bootstrap/promote.sh   # promotes HEAD; promotes a rev if given one
```

Running the factory from a pin, one bounded iteration per launch:

```bash
bun run $HOME/.local/share/factory/pins/current/bin/factory.ts run \
  --repo <path-to-this-repo> --goal self \
  --run-config <path-to-this-repo>/bootstrap/run/self.yaml --iterations 1
```

A launch reads its own pin's `gate.yaml` and refuses a pin whose record is
missing or red; `--pin-gate-override <reason>` launches it anyway and records
the reason in the run's records (see `bootstrap/RUN-SELF.md`).

## Gates

Run from the repository root; the wrapper copies the package to a bare temp
dir, installs, and runs the named gate, so what passes here passes at promote:

```bash
plugins/software-factory/scripts/gates.sh plugins/software-factory all
# or one gate at a time:
plugins/software-factory/scripts/gates.sh plugins/software-factory typecheck
plugins/software-factory/scripts/gates.sh plugins/software-factory tests
plugins/software-factory/scripts/gates.sh plugins/software-factory format
plugins/software-factory/scripts/gates.sh plugins/software-factory lint
plugins/software-factory/scripts/gates.sh plugins/software-factory schema-validation
```

Equivalents inside `plugins/software-factory/`:

```bash
cd plugins/software-factory
bun run typecheck        # tsc --noEmit
bun run test:gate        # bun scripts/run-tests.ts
bun run format           # biome format .
bun run lint             # bun scripts/lint.ts && bun scripts/check-file-size.ts
bun run schema-validation  # bun src/schema-check.ts
```

`bun test` runs the whole suite directly.

Typecheck, tests, format, lint and schema-validation all run green at head.
Lint gates only on errors: warnings do not gate until `lint-warnings` raises
the fixed rules to error. A red the recorded base gates do not list is yours
to fix.

## Conventions

Repository conventions win over generic guidance. In this repo:

- Clean code is a result, not a stage: test real behavior (including edge
  cases and failure paths, never implementation mirrors or happy-path-only
  tests), and cover stated failure paths.
- Comments only for a non-trivial *why*: self-documenting names over comments,
  public interface apart from implementation.
- Smallest correct change at the seam; no speculative abstraction, no dead
  weight (delete, don't comment out), no TODOs, stubs, placeholders or fake
  success.
- Errors fail loudly at the boundary; never swallow (`catch {}` is forbidden).
- Gates are the repo's own: `gates.sh` above, plus the `.factory/repo.yaml`
  gate list. Document existing commands; do not invent new gates.
- Do not edit inside a running factory launch (`bootstrap/RUN-SELF.md`).
- Sessions, transcripts and run records never enter git.

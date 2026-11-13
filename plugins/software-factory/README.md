# Software Factory

The factory is being rebuilt in place on branch `factory-v3`; the v2 orchestrator (`core/flows`,
`core/plan`, `core/engine`, the 21 JSON schemas and the step prompts that used them) has been
removed. Direction for the rebuild: `bootstrap/KERNEL0.md`; decisions: `bootstrap/LOG.md`.

## Layout

| Path | Contents |
|---|---|
| `src/harness/types.ts` | Kernel harness contract: `ModelRef`, `Caps`, `Stop`, `Usage`, `SessionRef`, `TurnRequest`, `TurnResult`, `Harness`. |
| `src/harness/fake/` | Scripted `FakeHarness` implementing that contract. |
| `src/harness/omp/` | v2 omp adapter, still on its private contract (`src/harness/omp/contract.ts`) until S1. |
| `src/core/git/` | Worktrees, commits, head guard, merge, naming, diff/status. |
| `src/core/{proc,shutdown,mutex,clock,journal,runtime-tmp,disk-space}.ts` | Process, lifecycle, and runtime primitives. |
| `src/core/checks/` | Deterministic setup/gates/JUnit runner. |
| `src/core/{prompts,records}`, `src/core/concerns.ts`, `src/core/{budget,steer}.ts`, `src/core/config/{ajv,roles}.ts` | Prompt partials, atomic IO, concern store, budgets, mailbox, role resolution. |
| `src/cli/` | Argument dispatch and run lock. The `run` command returns with the kernel. |

Kept-module API, gotchas and test locations: `bootstrap/context/kept-modules.md`.

## Commands

```bash
cd plugins/software-factory
bun install
bun run typecheck
bun test
```

No factory command is wired yet; S0 adds `factory run` against `src/kernel/`.

## History

The rejected v2 modules remain readable from the main branch:

```bash
git show main:plugins/software-factory/src/core/engine.ts
git show main:plugins/software-factory/config/schemas/plan.schema.json
```

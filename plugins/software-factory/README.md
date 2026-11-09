# Software Factory v2

Software Factory v2 is an autonomous, deterministic software development orchestrator built on Bun and TypeScript. It coordinates multi-agent workflows (Triage, Architect, PM, Developer, QA, Reviewer) across isolated git worktrees using a strict derive-act-commit loop.

---

## 1. Prerequisites & Installation

### Requirements
- **Bun** (≥ 1.2.0)
- **Git** (≥ 2.40.0)
- **Oh-My-Pi CLI (`omp`)** (v18.17.0+) installed and authenticated on the system path (or referenced via `OMP_PATH`).

### Installation
From the plugin directory:
```bash
cd plugins/software-factory
bun install
```

---

## 2. Quick Start

### Step 1: Initialize your repository
In your target project repository:
```bash
bun run --cwd /path/to/plugins/software-factory factory init --repo .
```
This generates `.factory/project.yaml` from `config/project.template.yaml` and commits it to git.

### Step 2: Define a Task Intent
Create a new task directory with `INTENT.md` under `.factory/tasks/<task-name>/`:
```markdown
# modernize-auth

Migrate authentication middleware to use JWT verification with public key caching.
- Preserve all existing integration test suites.
- Introduce unit tests for cache eviction and token expiration edge cases.
```

### Step 3: Run Preflight Checks
Verify repository cleanliness, configuration validity, prompt templates, and harness readiness:
```bash
bun run --cwd /path/to/plugins/software-factory factory preflight modernize-auth --repo .
```

### Step 4: Execute the Factory Run
Launch the autonomous orchestrator:
```bash
bun run --cwd /path/to/plugins/software-factory factory run modernize-auth --repo .
```
Exit codes:
- `0`: Task completed successfully (`done`).
- `10`: Execution paused pending operator answer to a `tousertoreview` question (`blocked`).
- `1`: Failure or unrecoverable error.

### Step 5: Check Status & Steer
Inspect the progress tree, waves, item statuses, and open operator questions:
```bash
bun run --cwd /path/to/plugins/software-factory factory status modernize-auth --repo .
```

To provide guidance, answers, or directives:
```bash
bun run --cwd /path/to/plugins/software-factory factory steer modernize-auth --repo . "Prioritize Redis cache implementation"
```

---

## 3. Configuration Hierarchy

Configuration layers in three tiers:
1. **Base Pipeline**: `config/pipeline.default.yaml` defines default model roles, story kinds, agent roles, checks, and limits.
2. **Project Pipeline Overrides**: `<repo>/.factory/pipeline.yaml` (optional project-wide overrides).
3. **Task-Specific Overrides**: `<repo>/{orchestrationFolder}/{task}/pipeline.yaml` (task-specific overrides).

Merging semantics:
- Objects are deeply merged.
- Arrays are replaced.
- Explicit `null` values delete the corresponding key.

Canonical schemas are located in `config/schemas/` (`pipeline.schema.json`, `project.schema.json`, `state.schema.json`, etc.).

---

## 4. CLI Command Reference

| Command | Usage | Description |
|---|---|---|
| `init` | `factory init [--repo <path>]` | Initializes `.factory/project.yaml` from template and commits to git. |
| `preflight` | `factory preflight <task> [--repo <path>]` | Verifies repository cleanliness, configs, prompt templates, schemas, and harness binary. |
| `run` | `factory run <task\|path/INTENT.md> [--repo <path>] [--max-iterations N]` | Drives the task derive-act-commit loop to completion. |
| `status` | `factory status <task> [--repo <path>]` | Compact summary of task state, items, waves, budgets, and open review questions. |
| `steer` | `factory steer <task> "<text>" [--repo <path>]` | Submits operator directives/answers to the root task mailbox. |

---

## 5. Concerns & human involvement

Every agent output may raise structured `concerns[]` and `remarkable[]` decisions. The engine aggregates them into an engine-owned `concerns/` store on the task branch (`c-*.yaml`, `rm-*.yaml`), dedupes by fingerprint, and funnels them through review triage, close-ups and the steer mailbox; the full contract is in ARCHITECTURE §8.11.

`humanInvolvement` selects the noise level (`autonomous`, `principal`, `detailed`). Set it per task in `{orchestrationFolder}/{task}/pipeline.yaml`; task layers are root-only, so epic children do not inherit them. Example overrides:

```yaml
# principal: block on stack/layer, external interfaces and config shapes
humanInvolvement: principal
concerns:
  raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
  minDigestSeverity: low
  minBlockingSeverity: medium

# detailed: also block external-interface and major internal-interface changes
humanInvolvement: detailed
concerns:
  minDigestSeverity: low
  minBlockingSeverity: low
```

`factory status <task>` prints concern counts and splits the mailbox into blocking and informational entries:

```
Concerns: open 2 | dismissed 0 | routed 1 | resolved 4
Blocking Questions:
  * [q-concern-c-1a2b3c4d5e] ref: item | disposition: human-async
Digest Questions:
  * [q-escalated-rm-6f7g8h9i0j] ref: c-1a2b3c4d5e | disposition: human-awareness
```

## 6. Documentation & Architecture

- **Architecture Specification**: `docs/ARCHITECTURE.md` (§0–§14; concerns funnel in §8.11)
- **Harness Adapter**: `docs/OMP_ADAPTER.md` (CLI templates, overlay keys, NDJSON parsing, error classification)
- **End-to-End Validation**: `docs/FIRE_TEST.md` (Live verification on sample targets)

## 7. Testing

Run unit tests:
```bash
bun test
```

Run opt-in live smoke test against real `omp` binary:
```bash
FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts
```

Run TypeScript typecheck:
```bash
bun run typecheck
```

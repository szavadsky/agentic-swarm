# OMP Harness Adapter Specification

This document specifies the integration between the Software-Factory v2 orchestrator and the Oh-My-Pi (`omp`) CLI agent runner (`v18.17.0+`), grounded in empirical verification from the OMP architecture spikes (`local://spike-omp.md`, `local://spike-omp2.md`).

---

## 1. Overview & Topology

The software factory runs as an external TypeScript/Bun process (`src/core/engine.ts`). Each agent turn is executed as an independent `omp` subprocess via `Bun.spawn`:

- **Stateless Subprocess Execution**: The orchestrator manages git worktrees, step records, and schema validation. OMP processes run headless in `--mode json`.
- **Session Continuity**: Multi-turn roles (e.g. Architect, Triage) persist conversational context across independent process invocations using `--session-dir <dir>` and `--resume <sessionId>`.
- **Structured Output**: Delivered via the built-in `yield` tool or JSON extraction from model text, followed by Ajv schema enforcement.
- **Fail-Fast & Repair**: Invalid outputs return `{ ok: false, data: rawOutput }`, feeding the engine's structural repair pipeline (`src/core/records/repair.ts`).

---

## 2. Launch Command Templates

### 2.1 Fresh Turn
```bash
omp --cwd <worktreePath> \
    --config <runtimeDir>/omp-overlay.yaml \
    --mode json \
    --model @<roleName> \
    --session-dir <runtimeDir>/sessions \
    --tools <tool1,tool2,...,yield> \
    --system-prompt <runtimeDir>/system-prompts/<agent>-<ts>.md \
    -p @<runtimeDir>/prompts/prompt-<ts>.txt
```

### 2.2 Resumed Turn (Architect / Continuous Context)
```bash
omp --cwd <worktreePath> \
    --config <runtimeDir>/omp-overlay.yaml \
    --mode json \
    --model @<roleName> \
    --session-dir <runtimeDir>/sessions \
    --resume <sessionId> \
    --tools <tool1,tool2,...,yield> \
    --system-prompt <runtimeDir>/system-prompts/<agent>-<ts>.md \
    -p @<runtimeDir>/prompts/prompt-<ts>.txt
```

### 2.3 Stateless Small JSON Completion / Repair (`complete()`)
```bash
omp -p @<runtimeDir>/prompts/complete-<ts>.txt \
    --no-session \
    --tools= \
    --config <runtimeDir>/omp-overlay.yaml \
    --mode json \
    --model @<roleName>
```

---

## 3. Configuration Overlay (`omp-overlay.yaml`)

Generated dynamically on each run under `<runtimeDir>/omp-overlay.yaml` from the effective (root + task layered) `PipelineConfig.models.roles`.
`<runtimeDir>` is placed strictly outside the main repository checkout (resolving to `{worktreeRoot}/.factory-runtime/` via `resolveRuntimeDir` and `project.yaml`):
```yaml
modelRoles:
  workhorse: opencode-go/deepseek-v4.1-flash:max
  alt-workhorse: opencode-go/muse-spark-1.3-contributor:max
  task-reviewer: opencode-go/muse-spark-1.3-contributor:max
  architect: anthropic/claude-opus-5-5:max
  alt-architect: opencode-go/muse-spark-1.3-contributor:max
  simpler: google-antigravity/gemini-3.8-flash:high
  task-escalation: anthropic/claude-sonnet-5-5:max

retry:
  modelFallback: true
  maxRetries: 3
  usageAwareFallback: true
  fallbackChains:
    workhorse:
      - opencode-go/muse-spark-1.3-contributor:max
    alt-workhorse:
      - opencode-go/deepseek-v4.1-flash:max
    architect:
      - opencode-go/muse-spark-1.3-contributor:max
    simpler:
      - opencode-go/deepseek-v4.1-flash:max

# Critical unattended settings for headless execution:
eval:
  autoBackground:
    enabled: false        # Prevent cells from moving to background jobs
title:
  generator: none         # Disable async title generation calls
checkpoint:
  enabled: false          # Disable interactive git checkpoint reminders
advisor:
  enabled: false          # Disable passive advisor prompts
bash:
  gitGuard: false         # Disable interactive prompt on git clean/reset
  allowCompoundCommands: true
mnemopi:
  polyphonicRecall: false # Disable ambient long-term memory prompts
  enhancedRecall: false
  proactiveLinking: false
update:
  auto: false             # Disable background update checks
```

---

## 4. Structured Output Extraction & NDJSON Protocol

Stdout emits streaming NDJSON objects (`--mode json`):

1. **Session Initialization (`session`)**:
   `{"type":"session","id":"01a1b3dc-...","timestamp":"2026-11-07T...","cwd":"..."}`
   Captured immediately for transcript tracking (`traceRef`).
2. **Turn Completion (`turn_end`)**:
   Contains `message.content`, `message.usage` (`input`, `output`, `cacheRead`, `cost.total`), and `stopReason`.
3. **Structured Yield**:
   When `--tools` includes `yield`, model invocations emit `toolCall` events with name `yield` and `arguments.data`. Captured as primary candidate data.
4. **Text JSON Extraction**:
   If no tool call occurred, extracts JSON (or fenced ` ```json ` blocks) from the **last assistant turn's text** (overwriting intermediate turns rather than concatenating transcript text).
5. **StopReason Honor**:
   Turns ending with `stopReason: "abort"` or `stopReason: "error"` are classified as failures even if the process exit code is 0.
6. **Schema Enforcement**:
   Validates candidate data against `AgentRun.outputSchema`. On schema violation, returns `{ ok: false, error: ajvError, data: rawOutput, transient: false }`, allowing the engine's `validateAndRepair` pipeline to repair structure.
---

## 5. Failure Classification Matrix

| Category | Indicators | Engine Action |
|---|---|---|
| **Transient Error** (`transient: true`) | Process timeout; killed by `SIGTERM` (143) / `SIGKILL` (137); HTTP 429, 500, 502, 503, 504; socket hangup; `ECONNRESET`; `ETIMEDOUT`; `overloaded`; `quota exceeded`. | Retried via `maxInfraRetries` with backoff; does not consume item fix rounds. |
| **Session Lost** (`sessionLost: true`) | `resumeRequested === true` and session transcript not found or OMP prints `Session "..." not found`. | Triggers engine rehydration from artifacts (`src/core/sessions.ts`). |
| **Agent / Model Failure** (`transient: false`) | Exit code 1; invalid arguments; model refusal; stopReason `abort`. | Advances step fix rounds or triggers consult. |

---

## 6. Process Lifecycle, Timeouts & Run Lock

### 6.1 Per-Step & Completion Timeouts
- **`AgentRun.timeoutSec`**: Honors per-step timeout configured in pipeline steps (e.g. `timeoutSec: 120`). When omitted, falls back to `defaultTimeoutMs` (300,000ms / 5m).
- **`complete()` Timeout**: Spawns `omp -p` with an active timer; on timeout, fires `SIGTERM` followed by `SIGKILL` (3s grace) and terminates the process with an explicit timeout rejection.

### 6.2 Atomic Run Lock (`acquireRunLock`)
- Lock files live at `<runtimeDir>/locks/<task>.lock` outside git tracking.
- Acquired atomically using `fs.openSync(lockPath, "wx")`.
- On `EEXIST`:
  - If the lock was created by another host (`host !== os.hostname()`), acquisition is safely refused (`null`).
  - If the PID is alive on the current host, acquisition is refused (`null`).
  - If the PID is dead on the current host, the lock is taken over atomically via a temporary file write and `fs.renameSync(tmpPath, lockPath)`.
  - Takeovers emit a console warning notice and append a `lock_takeover` audit event to `{taskDir}/journal.ndjson`.
  - `release()` removes the lock file only if the lock still belongs to the active process PID and host.

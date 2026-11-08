# OMP Harness Adapter Specification

This document specifies the integration between the Software-Factory v2 orchestrator and the Oh-My-Pi (`omp`) CLI agent runner (`v18.17.0+`), grounded in empirical verification from the OMP architecture spikes (`local://spike-omp.md`, `local://spike-omp2.md`).

---

## 1. Overview & Topology

The software factory runs as an external TypeScript/Bun process (`src/core/engine.ts`). Each agent turn is executed as an independent `omp` subprocess via `Bun.spawn` (`src/harness/omp/harness.ts`):

- **Stateless Subprocess Execution**: The orchestrator manages git worktrees, step records, and schema validation. OMP processes run headless in `--mode json`.
- **Session Continuity**: Multi-turn roles (e.g. Architect, Triage) persist conversational context across independent process invocations using `--session-dir <dir>` and `--resume <sessionId>`. The engine persists the id to `meta.yaml` at turn start via `onSession` (`src/core/flows/step-runner.ts:438-460`) and resumes it after restarts; `--session-dir` is always passed, `--resume` only when an id is known (`src/harness/omp/harness.ts:201-213`).
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
    --tools=<tool1,tool2,...,yield> \
    --system-prompt <runtimeDir>/system-prompts/<agent>-<ts>-<rand>.md \
    -p @<runtimeDir>/prompts/prompt-<ts>-<rand>.txt
```
(`yield` is appended when a schema is present; prompt files are unlinked after exit. `src/harness/omp/harness.ts:175-223`.)

### 2.2 Resumed Turn (Architect / Continuous Context)
```bash
omp --cwd <worktreePath> \
    --config <runtimeDir>/omp-overlay.yaml \
    --mode json \
    --model @<roleName> \
    --session-dir <runtimeDir>/sessions \
    --resume <sessionId> \
    --tools=<tool1,tool2,...,yield> \
    --system-prompt <runtimeDir>/system-prompts/<agent>-<ts>-<rand>.md \
    -p @<runtimeDir>/prompts/prompt-<ts>-<rand>.txt
```
(OMP loads history from disk; the factory sends only the new turn prompt — or a short nudge on timeout/interrupted resume. No history reconstruction. `src/harness/omp/harness.ts:201-213`, `src/core/flows/step-runner.ts:372-373,759-766`.)

### 2.3 Stateless Small JSON Completion / Repair (`complete()`)
```bash
omp -p @<runtimeDir>/prompts/complete-<ts>-<rand>.txt \
    --no-session \
    --tools= \
    --config <runtimeDir>/omp-overlay.yaml \
    --mode json \
    --model @<roleName>
```
(Single combined system+prompt+schema file; no `--session-dir`/`--resume`. `src/harness/omp/harness.ts:471-490`.)

---

## 3. Configuration Overlay (`omp-overlay.yaml`)

Regenerated on every turn under `<runtimeDir>/omp-overlay.yaml` from the effective (root + task layered) `PipelineConfig.models.roles` (`src/harness/omp/harness.ts:125-136`, `src/harness/omp/overlay.ts:26-100`). Generation is deterministic for a given pipeline (no timestamps/randomness); roles that fail resolution are left unmapped for preflight to catch.
`<runtimeDir>` is placed strictly outside the main repository checkout (resolving to `{worktreeRoot}/.factory-runtime/` via `resolveRuntimeDir` and `project.yaml`).

Every child process spawned by the factory (omp turns, gates, checks, git) runs with `TMPDIR` (and `TMP`/`TEMP`) set to `{worktreeRoot}/.factory-runtime/tmp/` on disk — created at run start (`initFactoryRuntimeTmp`), prior-run entries purged at start, restored on run end (`src/core/runtime-tmp.ts`). Git inherits it via `runProcess`; omp sets it explicitly per spawn. This prevents test runners (e.g. pytest) and git from filling OS tmpfs mounts.
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
  enabled: true           # Mounts checkpoint/rewind agent tools (agents opt in via tools list)
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
   Captured immediately for transcript tracking (`traceRef`); also streamed to the engine via `onSession` so the id is committed to `meta.yaml` before the turn finishes.
2. **Turn Completion (`turn_end`)**:
   Assistant-role messages only: accumulates `content` text parts, `toolCall` yield parts, `message.usage` (`input`, `output`, `cost.total`; streamed via `onUsage`), and `stopReason`. Non-assistant turns are ignored.
3. **Structured Yield**:
   When `--tools` includes `yield`, model invocations emit `turn_end.toolCall`, `agent_end` toolCall, `tool_execution_start` (`args.data`), or `tool_execution_end` (`result.details.data`) events with name `yield` (or `*:yield`). Captured as primary candidate data (later events overwrite earlier ones).
4. **Text JSON Extraction**:
   If no tool call occurred, extracts JSON (direct parse → fenced block → outermost `{...}`/`[...]`) from the **last assistant turn's text** (overwriting intermediate turns rather than concatenating transcript text; per-turn text head/tail-truncated to 256 KiB). Candidate stays raw text when extraction fails.
5. **Memory-Bounded Streaming**:
   `OmpNdjsonParser` stream-parses lines without buffering raw event trees (`rawEvents` is never accumulated in memory). Lines over 64 KiB mentioning tool execution/result without `yield` are fast-skipped before parsing. Stderr is captured via `HeadTailBuffer` capped at 64 KiB preserving head and tail diagnostics. Non-JSON lines (e.g. `Wall time: ...`) are skipped; errors capped at 50 × 2 KiB.
6. **StopReason Honor**:
   Turns ending with `stopReason: "abort"` or `"error"` are classified as failures even if the process exit code is 0, as is any other non-`stop`/`toolUse` stop reason on exit 0 without yield data.
7. **Schema Enforcement**:
   Validates candidate data against `AgentRun.outputSchema`. On schema violation, returns `{ ok: false, error: ajvError, data: rawOutput, transient: false }`, allowing the engine's `validateAndRepair` pipeline to repair structure. `complete()` instead throws on schema mismatch.
## 5. Failure Classification Matrix

| Category | Indicators | Engine Action |
|---|---|---|
| **Transient Error** (`transient: true`) | Process timeout (`timedOut`, 143); killed by `SIGKILL` (137); rate-limit/quota/overloaded, HTTP 429/500/502/503/504, `ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND`, socket hangup, connection reset, fetch failed, network error, temporary failure, service unavailable, bad gateway, gateway timeout, internal server error, context deadline exceeded (`src/harness/omp/classify.ts`). Suspend detected during the turn also forces transient. | Retried via `maxInfraRetries` / `maxInfraRetriesExpensive` with backoff; timeout on a resumable session first retries with the finalize nudge under `limits.timeoutNudgeSec`; exhaustion escalates to a stable-id question; does not consume item fix rounds. |
| **Session Lost** (`sessionLost: true`) | `resumeRequested === true` and transcript missing: `Session "…" not found`, no/unknown session, failed to load session, cannot resume, session file not found. | Fresh session (`resume: undefined`) with the full prompt; journaled `session_lost_rehydrated`. Only `sessionLost` triggers the fresh-session fallback. |
| **Agent / Model Failure** (`transient: false`) | Exit code 1; invalid arguments; model refusal; stopReason `abort`/`error` (or other unexpected stop on exit 0 without yield). | Step ends `rejected` (consult via bounds/no-progress); transient-timeout path does not apply. |
| **Launch / Config Error** (`launchError: true`) | Bad tool/flag/config: `Unknown tool(s) in --tools: …` (exit 2), `Built-in tool(s) unavailable in this session: …` (singular or plural), `no such tool`, unknown/invalid/unrecognized flags, failed flag/option/config parsing (`src/harness/omp/classify.ts` `LAUNCH_ERROR_PATTERNS`). | Not transient and not an agent failure: no attempts consumed, no repair, no consult — the step-runner throws and the run fails fast with the error surfaced (fix config/prompts and restart; resume continues from records). Run-start `validateTools` probe catches bad names before any turn. |

---

## 6. Process Lifecycle, Timeouts & Run Lock

- **Process Group Isolation**: All `omp` invocations are spawned with `detached: true` creating independent process groups (`PGID = proc.pid`).
- **Group Termination on Timeout**: Per-step timeout (`AgentRun.timeoutSec` or harness `defaultTimeoutMs`, 2700s) fires `SIGTERM` to the child's process group (`-proc.pid`), followed by `SIGKILL` after 3s. This terminates all grandchildren (e.g. bash loops, sleep commands) and never touches the orchestrator's process group.
- **Suspend-aware active timers**: timeouts measure monotonic active time (`src/core/clock.ts`), so machine sleep never burns the budget; a suspend spanning a turn journals `system_suspend_detected` and forces transient classification. Same mechanism guards gates, checks, and `complete()`.
- **Factory Process Signals (SIGINT/SIGTERM)**: The orchestrator installs process signal handlers that terminate all active child process groups (500ms grace) and mark running steps with `status: "interrupted"` cleanly in `meta.yaml` and `journal.ndjson`, preserving session id and usage; exits 130 (SIGINT) / 143 (SIGTERM).
- **Transcript / Stdout Size Guard**: An engine-side guard tracks per-step stdout and transcript size; if size exceeds `limits.stepTranscriptWarningBytes` (default 5 MiB), a `step_transcript_size_warning` audit event is recorded to `journal.ndjson`.
- **`complete()` Timeout**: Spawns `omp -p` detached with an active timer; on timeout, fires `SIGTERM` followed by `SIGKILL` to its process group and throws an explicit timeout error. Non-zero exit, abort/error stop, or schema mismatch also throw.
- **Run-Start Tool Probe** (`OmpHarness.validateTools`): before the first turn, the engine unions `pipeline.tools.structuredOutput` with every agent's resolved tools (`agents.<name>.tools` override → frontmatter `tools` → `pipeline.tools.defaults`) and runs one cheap `--no-session --tools=<union>` turn. omp's tool-error stderr (`Built-in tool(s) unavailable…`, `Unknown tool(s) in --tools: …`, parsed by `parseUnknownToolNames`: split/trim/strip periods/dedupe/union) names unknown tools; a non-empty result throws `Unknown omp tool names … (from pipeline.tools/agents — fix config or agent frontmatter)` before any agent turn runs.
### 6.2 Atomic Run Lock (`acquireRunLock`)
- Lock files live at `{worktreeRoot}/.factory-runtime/locks/<task>.lock` outside git tracking.
- Acquired atomically using `fs.openSync(lockPath, "wx")`.
- On `EEXIST`:
  - If the lock was created by another host (`host !== os.hostname()`), acquisition is safely refused (`null`).
  - If the PID is alive on the current host, acquisition is refused (`null`).
  - If the PID is dead on the current host (or the file is corrupt), the lock is taken over via an exclusive `.takeover` marker plus atomic rename.
  - Takeovers emit a console warning notice and append a `lock_takeover` audit event to `{taskDir}/journal.ndjson`.
  - `release()` removes the lock file only if the lock still belongs to the active process PID and host.

---

## 7. Prompt-cache safety

Resumed turns are true additive appends: `--resume` + `--session-dir`, new turn (or short nudge) only, no history reconstruction, no transcript rewriting. System-prompt file content is byte-stable per agent (`extractAgentBody`); only transport filenames embed timestamps. Overlay generation is deterministic per pipeline. Stateless `complete()` uses `--no-session`.
- Resumed turns: `src/harness/omp/harness.ts:208-213`, `src/core/flows/step-runner.ts:372-373,759-766` — safe.
- System-prompt stability: `src/harness/omp/harness.ts:178-185`, `src/core/prompts.ts:218-313`, `src/core/prompt-vars.ts:12-40` — safe (unknown only if omp keyed cache by path rather than content).
- No transcript rewriting: `src/harness/omp/harness.ts:100-170,354-355` — safe.
- `complete()`: `src/harness/omp/harness.ts:471-490` — safe (no cache expectation).
- Overlay: `src/harness/omp/overlay.ts:26-100`, `src/harness/omp/harness.ts:125-136` — safe.
- Cross-process resume / sessionLost fallback (`src/core/sessions.ts:113-138`, `src/core/flows/step-runner.ts:654-690,832-854`) starts a cold session — expected break, keep as is.

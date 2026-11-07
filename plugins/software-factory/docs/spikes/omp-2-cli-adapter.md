# Software-Factory v2: Follow-Up OMP Architecture Spike Report (Phase 2)

This report details empirical verification of stateless per-turn harness mechanics for the Software-Factory v2 orchestrator, testing against `omp v18.17.0` (compiled Bun binary running on Linux x86_64 WSL2). All observations are grounded in live test executions using cheap models (`opencode-go/deepseek-v4.1-flash` and `opencode-go/muse-spark-1.3-contributor`) in isolated throwaway environments under `/tmp`.

---

## 1. Root Agent Definition & Execution

### Verdict: **VERIFIED**

Running a custom agent definition as the root session role (`omp -p`) is fully supported via CLI arguments, provided the orchestrator maps frontmatter fields to CLI parameters.

### Mechanism & Options

1. **No `--agent` CLI Flag**: The OMP CLI does **not** provide a `--agent` flag for root sessions (agent discovery files in `agents/*.md` are only resolved for subagents).
2. **`--system-prompt` File Resolution**:
   - Source: `resolvePromptInput` in `packages/coding-agent/src/system-prompt.ts`.
   - Behavior: If the argument is a single line without newlines, OMP checks if the file exists on disk and loads its full text. If not a file, it treats the argument as literal prompt text.
   - Frontmatter handling: `--system-prompt <path>` passes the file contents directly to the LLM system prompt. It does **not** parse YAML frontmatter to restrict tools.
3. **`--tools` Allowlist Enforcement**:
   - Frontmatter `tools:` must be extracted by the orchestrator and passed explicitly via `--tools <comma-separated-tools>`.
   - **Empirical Proof of Tool Restriction**:
     - Tested `--tools=read,glob,grep` with instructions to invoke `bash` and `write`.
     - `write` was strictly refused (`"This write tool is limited to xd:// device transport..."`).
     - `bash`, `edit`, and regular filesystem mutations were completely inaccessible.
4. **`--cwd <worktree>`**:
   - Empirically verified: `omp --cwd /tmp/spike-worktree -p ...` binds the session root, file tools, and bash commands to `/tmp/spike-worktree`.
   - Commits and files created during the turn land strictly inside that git worktree.

### Exact Launch Command Template
```bash
omp --cwd /tmp/worktrees/task-1 \
    --system-prompt /path/to/plugins/software-factory/agents/worker.md \
    --tools read,edit,write,grep,glob,bash,yield \
    --model @workhorse \
    -p "Instructions for task 1"
```

---

## 2. Structured Final Output & Machine-Readable Protocol

### Verdict: **VERIFIED**

While the OMP CLI has no `--output-schema` flag for root sessions, `--mode json` provides a structured, streaming NDJSON protocol on stdout. Furthermore, adding `yield` to `--tools` allows root sessions to yield structured payloads directly.

### Machine-Readable Protocol (`--mode json`)

When launched with `--mode json`, stdout emits one JSON object per line.

#### Key Lifecycle Events:
1. **Session Announcement (Line 1)**:
   ```json
   {"type":"session","version":3,"id":"01a1b3d1-c014-7017-8cc3-c796734c2f17","timestamp":"2026-11-07T02:23:50.292Z","cwd":"/tmp/spike-omp2-test"}
   ```
   *The orchestrator captures `id` immediately from line 1.*
2. **Turn Completion (`turn_end`)**:
   ```json
   {
     "type": "turn_end",
     "message": {
       "role": "assistant",
       "content": [
         {"type": "thinking", "thinking": "..."},
         {"type": "text", "text": "{\"status\":\"OK\",\"count\":42}"}
       ],
       "usage": {
         "input": 12884,
         "output": 23,
         "cacheRead": 896,
         "cacheWrite": 0,
         "totalTokens": 13803,
         "cost": {
           "input": 0.0019326,
           "output": 0.0000138,
           "total": 0.001949
         }
       },
       "stopReason": "stop"
     }
   }
   ```
3. **Session Termination (`agent_end`)**:
   ```json
   {"type":"agent_end","messages":[...],"isTerminal":true,"yielded":true}
   ```

### Extracting Required Metrics:
- **(a) Final Assistant Text**:
  ```ts
  const text = turnEndEvent.message.content
    .filter(c => c.type === "text")
    .map(c => c.text)
    .join("");
  ```
- **(b) Failure / Abort vs Success**:
  - Process exit code `0` + `turnEndEvent.message.stopReason === "stop"` -> **SUCCESS**.
  - Process exit code `143` -> **KILLED BY SIGTERM** (partial session flushed, recoverable).
  - Process exit code `1` or `turnEndEvent.message.stopReason === "abort"` -> **ABORT / FAILURE**.
- **(c) Token Usage & Cost per Turn**:
  Directly available on `turnEndEvent.message.usage`:
  - `usage.input`, `usage.output`, `usage.cacheRead`, `usage.totalTokens`
  - `usage.cost.total` (exact USD cost).

### Root `yield` Tool Behavior
- Passing `--tools=...,yield` mounts the `yield` tool on the root session.
- When the model calls `yield({ data: { ... } })`:
  - The session immediately terminates (`isTerminal: true`, `yielded: true`).
  - Structured output is captured in `toolCall.arguments.data`.
  - Note: OMP host-side JSON schema validation is not wired to root sessions (only subagents); the orchestrator must validate the extracted `data` with its own ArkType/Zod schema.

---

## 3. Session Resume Across Stateless Turns

### Verdict: **VERIFIED**

A persistent session (such as the Architect or Triage) can be maintained across independent process invocations using `--session-dir` and `--resume <id>`.

### Working Multi-Turn Execution Sequence

#### Turn 1: Fresh Session Initialization
```bash
omp -p --session-dir /path/to/sessions \
    --mode json \
    --model opencode-go/deepseek-v4.1-flash \
    "My secret number is 445566. Remember it."
```
- Line 1 emits: `{"type":"session","id":"01a1b3d1-fddf-7418-8334-d4ae0447f974", ...}`.
- Transcript file created: `/path/to/sessions/2026-11-07T02-24-06-111Z_01a1b3d1-fddf-7418-8334-d4ae0447f974.jsonl` (initial size: 6,979 bytes).

#### Turn 2: Resumed Session (Context Retention)
```bash
omp -p --session-dir /path/to/sessions \
    --resume 01a1b3d1-fddf-7418-8334-d4ae0447f974 \
    --mode json \
    --model opencode-go/deepseek-v4.1-flash \
    "What was my secret number? Reply with NUMBER=<num>"
```
- Line 1 announces the identical session ID.
- The **same transcript file is appended** on disk (size grew to 15,354 bytes).
- Model responded: `NUMBER=445566` (100% conversational memory retained).

#### Turn 3: Model Switch on Resume
```bash
omp -p --session-dir /path/to/sessions \
    --resume 01a1b3d1-fddf-7418-8334-d4ae0447f974 \
    --mode json \
    --model opencode-go/muse-spark-1.3-contributor \
    "Repeat my secret number and state your model"
```
- Model switched cleanly to `muse-spark-1.3-contributor` while retaining context (`Secret number: 445566`).

### Working Directory Persistence
- The original session's `cwd` is permanently recorded in the session JSONL header.
- Resuming without `--cwd` retains the original working directory automatically.

---

## 4. Model Roles, Aliases, Fallbacks & Unattended Config

### Verdict: **VERIFIED**

A standalone YAML overlay loaded via `--config` configures custom roles, thinking levels, automatic fallback chains, and disables interactive prompts.

### Complete Unattended Configuration Overlay (`orchestrator-overlay.yml`)

```yaml
modelRoles:
  workhorse: opencode-go/deepseek-v4.1-flash:max
  alt-workhorse: opencode-go/muse-spark-1.3-contributor:max
  architect: anthropic/claude-opus-5-5:max
  simpler: google-antigravity/gemini-3.8-flash:high
  fallback-test: invalid-provider/nonexistent-model:max

retry:
  modelFallback: true
  maxRetries: 3
  usageAwareFallback: true
  fallbackChains:
    fallback-test:
      - opencode-go/deepseek-v4.1-flash:max
    workhorse:
      - opencode-go/muse-spark-1.3-contributor:max

# Critical settings for unattended headless runs (never block on prompts):
eval:
  autoBackground:
    enabled: false        # Prevent long cells auto-backgrounding into bg_N
title:
  generator: none         # Disable async title-generation model calls
checkpoint:
  enabled: false         # Disable git checkpoint reminders
advisor:
  enabled: false         # Disable passive background advisor prompts
bash:
  gitGuard: false         # Disable interactive confirmations on git clean/reset
  allowCompoundCommands: true
mnemopi:
  polyphonicRecall: false # Disable ambient long-term memory prompts
  enhancedRecall: false
  proactiveLinking: false
update:
  auto: false             # Disable background update checks
```

### Empirical Fallback Proof
- Ran: `omp -p --no-session --config orchestrator-overlay.yml --mode json --model @fallback-test "Reply FALLBACK_OK"`.
- Primary invalid model failed immediately.
- Event emitted:
  ```json
  {"type":"retry_fallback_succeeded","model":"opencode-go/deepseek-v4.1-flash:max","role":"fallback-test"}
  ```
- Assistant output: `FALLBACK_OK` (cost: $0.002048).
- Verified: `@role` aliases resolve, `:max` suffix sets thinking effort, and fallback chains execute transparently.

---

## 5. Small Completion Without Eval & SDK Feasibility

### Verdict: **VERIFIED — CLI `--tools=` Wins Over Standalone SDK Import**

### Investigation of `import { createAgentSession } from "@oh-my-pi/pi-coding-agent"`
- Attempting to import `@oh-my-pi/pi-coding-agent` in a standalone Bun script outside `omp` fails:
  ```
  FAILED to resolve @oh-my-pi/pi-coding-agent: Cannot find module '@opentelemetry/api'
  ```
- Resolving from the local monorepo source fails on native `.node` addon version mismatches (`pi-natives`).
- The OMP package is not published as a standalone self-contained npm module; only the compiled single-binary `omp` executable bundles all native addons and dependencies hermetically.

### Best Pattern for Stateless Small Completions
Use `omp -p --no-session --tools= --mode json --model @simpler`:
```bash
omp -p --no-session --tools= --mode json --model opencode-go/deepseek-v4.1-flash \
  "Extract data into valid JSON matching schema: { status: string, count: number }. Input: Status is ready, count is 55. Output only valid JSON."
```

#### Empirical Measurements:
- **Token Efficiency**: Dropping tools (`--tools=`) stripped all tool prompt templates, reducing input context from **13,803 tokens to 4,216 tokens (70% reduction)**.
- **Latency & Cost**: Completed in 3.1s; cost dropped from $0.0020 to $0.0006.
- **Authentication**: Fully inherits existing credentials from `~/.omp/agent/auth.db` without requiring separate API keys in the Bun process.

---

## 6. Parallelism, Robustness & Fault Handling

### Verdict: **VERIFIED**

### 1. Concurrent Execution Across 4 Worktrees
- Tested 4 simultaneous `omp -p` processes running concurrently in separate worktrees (`/tmp/spike-wt1` through `wt4`).
- Results:
  - Exit codes: `0 0 0 0`.
  - All 4 target files written accurately.
  - Zero SQLite lock contention on `~/.omp/agent/models.db` or `agent.db`.
  - Zero session directory conflicts.

### 2. Startup Overhead
- Pure binary execution (`omp --version`): **12 milliseconds (0.012s)**.
- Harness bootstrap to `turn_start` in `--mode json`: **~0.8s to 1.2s**.

### 3. Exit Codes & SIGTERM Behavior
| Scenario | Exit Code | Observed Behavior |
|---|---|---|
| **Clean Completion** | `0` | Full output emitted, session file persisted. |
| **Model / Arg Error** | `1` | Stderr contains error description. |
| **Killed by SIGTERM** | `143` | `[Stopped by SIGTERM]` emitted. **Partial session flushed to disk**. Prints recovery command: `[Recovery] Main: omp --resume <id>`. |

*Note: OMP has no top-level CLI `--timeout` flag; process deadlines must be enforced by the orchestrator process via `AbortSignal.timeout(ms)` or `timeout <N>s`.*

---

## 7. Prompt Size Capacity

### Verdict: **VERIFIED**

Tested with a **43 KB prompt document** (500 lines of repetitive context with an embedded secret token):

1. **`@file` Syntax (`omp -p @/path/to/prompt.txt`)**:
   - Responded: `TOKEN=LARGE_PROMPT_TOKEN_12345`.
2. **Direct CLI Argument (`omp -p "$(cat prompt.txt)"`)**:
   - Responded: `TOKEN=LARGE_PROMPT_TOKEN_12345`. Linux `ARG_MAX` (2MB+) easily handles 40KB+ arguments.
3. **Stdin Pipe (`cat prompt.txt | omp -p`)**:
   - Responded: `TOKEN=LARGE_PROMPT_TOKEN_12345`.

All three mechanisms work reliably without truncation.

---

## 8. Recommended OMP Adapter Implementation

The Factory orchestrator runs as a standalone **TypeScript/Bun CLI process**. It treats OMP as a stateless subagent worker invoked via `Bun.spawn`.

### Architecture Flow

```
┌──────────────────────────────────────────────────────────────────┐
│              Software Factory Core (Bun Orchestrator)            │
│  - Pipeline State Machine & YAML Artifact Validation             │
│  - Engine-Managed Worktrees (git worktree add -b topic/...)      │
│  - Schema Validation (ArkType / Zod) & JSON Repair               │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                   Bun.spawn(["omp", ...])
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                     OMP Execution Engine                         │
│                                                                  │
│  (a) Fresh Turn:                                                 │
│      omp --cwd <worktree>                                        │
│          --session-dir <sessionsDir>                             │
│          --config <overlayYaml>                                  │
│          --mode json                                             │
│          --model @workhorse                                      │
│          --tools read,edit,write,bash,yield                      │
│          --system-prompt <agentDefFile>                          │
│          -p <promptTextOrAtFile>                                 │
│                                                                  │
│  (b) Resumed Turn (Architect / Dialogue):                        │
│      omp --cwd <worktree>                                        │
│          --session-dir <sessionsDir>                             │
│          --resume <sessionId>                                    │
│          --config <overlayYaml>                                  │
│          --mode json                                             │
│          --model @architect                                      │
│          --tools read,yield                                      │
│          -p <followUpPrompt>                                     │
│                                                                  │
│  (c) Small JSON Completion / Repair:                             │
│      omp --no-session                                            │
│          --tools=                                                │
│          --config <overlayYaml>                                  │
│          --mode json                                             │
│          --model @simpler                                        │
│          -p <repairPrompt>                                       │
└──────────────────────────────────────────────────────────────────┘
```

### TypeScript Adapter Implementation Helper

```ts
import { spawn } from "bun";

export interface OmpRunOptions {
  cwd: string;
  prompt: string;
  model: string;
  tools?: string[];
  systemPromptFile?: string;
  resumeSessionId?: string;
  sessionDir?: string;
  configOverlayPath: string;
  timeoutMs?: number;
}

export interface OmpRunResult {
  sessionId: string;
  transcriptPath?: string;
  text: string;
  yieldData?: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  exitCode: number;
}

export async function runOmpTurn(opts: OmpRunOptions): Promise<OmpRunResult> {
  const args = [
    "omp",
    "--cwd", opts.cwd,
    "--config", opts.configOverlayPath,
    "--mode", "json",
    "--model", opts.model,
  ];

  if (opts.sessionDir) {
    args.push("--session-dir", opts.sessionDir);
  }
  if (opts.resumeSessionId) {
    args.push("--resume", opts.resumeSessionId);
  }
  if (opts.tools) {
    args.push(`--tools=${opts.tools.join(",")}`);
  } else {
    args.push("--tools=");
  }
  if (opts.systemPromptFile) {
    args.push("--system-prompt", opts.systemPromptFile);
  }

  // Pass prompt via positional arg or @file
  args.push("-p", opts.prompt);

  const proc = spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Timeout handler
  let timer: NodeJS.Timeout | undefined;
  if (opts.timeoutMs) {
    timer = setTimeout(() => proc.kill("SIGTERM"), opts.timeoutMs);
  }

  let sessionId = "";
  let sessionTimestamp = "";
  let finalAssistantText = "";
  let yieldData: unknown = undefined;
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "session") {
          sessionId = event.id;
          sessionTimestamp = event.timestamp;
        } else if (event.type === "turn_end" && event.message?.role === "assistant") {
          const parts = event.message.content || [];
          finalAssistantText = parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("");
          
          if (event.message.usage) {
            usage.inputTokens += event.message.usage.input || 0;
            usage.outputTokens += event.message.usage.output || 0;
            usage.cacheReadTokens += event.message.usage.cacheRead || 0;
            usage.totalTokens += event.message.usage.totalTokens || 0;
            usage.costUsd += event.message.usage.cost?.total || 0;
          }
        } else if (event.type === "agent_end") {
          // Check for yield tool call
          for (const msg of event.messages || []) {
            for (const part of msg.content || []) {
              if (part.type === "toolCall" && part.name === "yield") {
                yieldData = part.arguments?.data;
              }
            }
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  }

  const exitCode = await proc.exited;
  if (timer) clearTimeout(timer);

  const transcriptPath = opts.sessionDir && sessionId && sessionTimestamp
    ? `${opts.sessionDir}/${sessionTimestamp.replace(/[:.]/g, "-")}_${sessionId}.jsonl`
    : undefined;

  return {
    sessionId,
    transcriptPath,
    text: finalAssistantText,
    yieldData,
    usage,
    exitCode,
  };
}
```

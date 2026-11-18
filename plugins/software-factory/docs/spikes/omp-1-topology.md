# Software-Factory v2: Empirical OMP Mechanics Spike Report

This report presents empirical findings from running live verification against `omp v18.17.0` (compiled Bun binary running on Linux x86_64 WSL2). All observations are grounded in live test runs executed against cheap model targets (`opencode-go/deepseek-v4.1-flash`) in throwaway environments under `/tmp`.

---

## 1. Headless Launch (`omp -p`) with Eval JS Kernel

### Verdict: **VERIFIED**

An automated headless launch via `omp -p` can execute an `eval` JS cell that dynamically imports an external TypeScript/JavaScript module (by absolute path) and invokes the prelude `agent()` helper directly from within that module.

### Working Snippet & Command

**Orchestrator Module (`/path/to/orchestrator.ts`)**:
```ts
export async function runOrchestrator(agentFn?: any) {
  // Global agent is available on globalThis inside the eval worker
  const resolvedAgent = agentFn || (globalThis as any).agent;
  console.log(`[orchestrator] globalThis.agent exists: ${typeof (globalThis as any).agent === "function"}`);

  // Launch subagent (perCallModel must be enabled if specifying model)
  const handle = await resolvedAgent("Reply with exactly: SUBAGENT_OK", {
    model: "opencode-go/deepseek-v4.1-flash",
  });

  const result = await handle.wait();
  console.log(`[orchestrator] Subagent ${handle.id} finished: ${JSON.stringify(result)}`);
  return { id: handle.id, output: result };
}
```

**Headless CLI Execution**:
```bash
omp -p --no-session \
  --config /path/to/extra-config.yml \
  --model opencode-go/deepseek-v4.1-flash \
  --tools=eval,write,read \
  'Call eval with language="js", timeout=0, and code="
const mod = await import(\"/path/to/orchestrator.ts\");
const res = await mod.runOrchestrator();
console.log(\"FINAL:\", JSON.stringify(res));
"'
```

### Observed Behavior & Evidence
- **TypeScript Import**: Bun evaluates the cell directly; `await import("/abs/path.ts")` loads TypeScript directly without prior bundling or transpile steps.
- **Prelude Visibility**: `globalThis.agent` is globally visible inside the imported module (`[orchestrator] globalThis.agent exists: true`).
- **Cell Timeout (`timeout: 0`)**: `params.timeout === 0` disables the per-cell deadline (`packages/coding-agent/src/tools/eval.ts`).
- **Auto-Backgrounding Gotcha**: If `eval.autoBackground.enabled: true` is configured in `~/.omp/agent/config.yml` (which is common), cells running longer than `eval.autoBackground.thresholdMs` (default 60s) are automatically converted into background jobs `bg_N`. To prevent backgrounding during automated runs, set `eval.autoBackground.enabled: false` via the `--config` overlay or pass `--wait-async` to the CLI.
- **Process Exit & Reporting**: `omp -p` prints model assistant text and eval console logs to stdout, outputs `Wall time: X.XX seconds`, and exits with code 0 on completion.

---

## 2. Alternative Host: OMP Extension (`--extension path.ts`)

### Verdict: **VERIFIED**

An extension loaded via `--extension <path>` provides access to `pi.pi.createAgentSession` and `pi.pi.runSubprocess`. However, `pi.pi.runStructuredSubagent` is **not exported** on `pi.pi`.

### Working Snippet & Inspection

**Extension Definition (`inspect-ext.ts`)**:
```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
  // Key availability on pi.pi:
  // pi.pi.createAgentSession -> FUNCTION (AVAILABLE)
  // pi.pi.runSubprocess       -> FUNCTION (AVAILABLE)
  // pi.pi.runStructuredSubagent -> UNDEFINED (NOT EXPORTED)

  pi.registerTool({
    name: "factory_launch",
    label: "Factory Subagent Launch",
    description: "Launch controlled agent sessions",
    parameters: pi.typebox.Type.Object({
      task: pi.typebox.Type.String(),
    }),
    async execute(id, params, signal, onUpdate, ctx) {
      // ctx provides ExtensionContext
      return { content: [{ type: "text", text: "OK" }] };
    },
  });
}
```

### Capability Matrix: `createAgentSession` vs `runStructuredSubagent`

| Capability | `pi.pi.createAgentSession` | `eval` prelude `agent()` |
|---|---|---|
| **Model Override per Launch** | Yes (`modelPattern` or `model`) | Yes (requires `task.perCallModel: on`) |
| **Output Schema Validation** | Yes (`outputSchema`, `outputSchemaMode`) | Yes (`schema`, `schemaMode`) |
| **Custom Agent / System Prompt** | Yes (`systemPrompt: string \| fn`) | Yes (`agent: "<name>"`) |
| **Tool Allowlist** | Yes (`toolNames: [...]`, `restrictToolNames: true`) | No (inherits session tools; `tools` in `agent()` only accepts eval-defined kernel tools) |
| **Custom Working Directory (`cwd`)** | Yes (`cwd: "/path/to/worktree"`) | No (`cwd` not accepted) |
| **IRC Identity & Registry** | Yes (`agentId`, `agentName`, `agentRegistry`) | Yes (inherits global registry, assigns auto/custom id) |

### Gotchas
- Parameter definition syntax: `pi.typebox.Type.String()` (not `pi.typebox.String()`), or use `pi.zod.z.string()`.
- `runStructuredSubagent` is internal to `task/structured-subagent.ts` and not exposed on the `pi.pi` facade. Any extension driving full session lifecycle must use `pi.pi.createAgentSession`.

---

## 3. Per-Launch Model Override & Configuration Overlays

### Verdict: **VERIFIED**

Per-call model overrides for `agent()` (including `@role:level` aliases and model IDs) require explicit enablement.

### Rules & Configuration

1. **Required Settings**:
   ```yaml
   task:
     perCallModel: on         # Must be "on" or "eval" (default is "off")
     perCallModelAllow:       # Whitelist of allowed providers/models
       - opencode-go/deepseek-v4.1-flash
       - opencode-go/muse-spark-1.3-contributor:max
   ```
2. **Provenance Restriction (Critical Gotcha)**:
   - Project-local `.omp/config.yml` **CANNOT** turn on `task.perCallModel`.
   - Empirically observed error when set in `.omp/config.yml`:
     `ToolError: Per-call model is disabled for eval calls (task.perCallModel: off, project: on). Omit model to use the agent's configured model.`
   - Reason: OMP enforces `perCallModelAllowNotProject` (only user/operator config can enable per-call model overrides).
3. **Passing without editing `~/.omp/agent/config.yml`**:
   - **CLI Flag**: `omp --config /path/to/overlay.yml` — **WORKS**.
   - **Environment Variable**: `PI_CONFIG_FILES=/path/to/overlay.yml` — **WORKS**.
4. **Agent Argument Gotcha**:
   - When `task.perCallModel: off`, calling `agent(..., { model: undefined })` throws `model must be a string`. The `model` property must be completely omitted from the options object.

---

## 4. Custom Agent Definitions from Plugin Folders

### Verdict: **VERIFIED**

OMP dynamically discovers agent definitions from arbitrary plugin folders outside `~/.omp`.

### Working Structure & Manifest

**Directory Layout**:
```
/path/to/plugins/software-factory/
├── package.json
└── agents/
    └── custom-worker.md
```

**`package.json`**:
```json
{
  "name": "software-factory",
  "version": "1.0.0",
  "omp": {
    "name": "software-factory"
  }
}
```

**`agents/custom-worker.md`**:
```markdown
---
name: custom-worker
description: Custom worker for software factory tasks
tools:
  - read
  - write
model: opencode-go/deepseek-v4.1-flash
---
You are a custom software factory worker. Complete the assigned task.
```

### Launch Command
```bash
omp -p --no-session \
  --plugin-dir /path/to/plugins/software-factory \
  --model opencode-go/deepseek-v4.1-flash \
  --tools=eval \
  'Call eval with code="const h = await agent(\"Do task\", { agent: \"custom-worker\" }); await h.wait();"'
```

### Observed Behavior
- `discoverAgents` loads `<plugin-dir>/agents/*.md` with top precedence.
- Calling `agent("...", { agent: "custom-worker" })` successfully dispatches to the agent and injects its frontmatter prompt and model configuration.

---

## 5. Isolation: `isolated: true` vs Engine-Created Git Worktrees

### Verdict: **VERIFIED — Engine-Managed Worktrees Strongly Recommended**

Empirical comparison between OMP's built-in `isolated: true` and engine-created Git worktrees:

### A. Built-in `isolated: true` Behavior
- **Branch Naming**: Hardcoded to `omp/task/<agentId>`. The caller has **no control** over base branch or target branch name.
- **No `cwd` Support**: Eval `agent()` does not accept `cwd`.
- **`merge: false` Trap**: Passing `merge: false` alone still merges/applies the diff to the parent working tree. You must pass `apply: false` to keep changes off the parent worktree.
- **Branch on `apply: false`**: Creates branch `omp/task/<agentId>` with the commits and prints:
  `Isolation: changes captured on branch 'omp/task/<agentId>' (apply=false). Not merged.`
- **Failure / Rejection Trap (Critical)**: In `packages/coding-agent/src/task/isolation-runner.ts`, if the subagent fails or rejects (`exitCode !== 0`), `commitToBranch` is completely skipped! **No branch commits are captured on failure/rejection**, and the temporary isolation worktree is deleted.

### B. Engine-Created Git Worktree (`git worktree add -b topic/x/y /path`)
- **Execution Command**:
  ```bash
  git worktree add -b topic/my-feature /tmp/my-worktree master
  omp --cwd /tmp/my-worktree -p --no-session --model ... "instructions"
  ```
- **Observed Behavior**:
  - `omp --cwd <dir>` starts the entire agent process inside that worktree.
  - All file edits, writes, and git commands execute inside `/tmp/my-worktree` on branch `topic/my-feature`.
  - **Full Retention**: Whether the subagent succeeds, fails, throws, or is rejected, 100% of untracked files, modified files, and commits remain preserved inside `/tmp/my-worktree`.
  - The orchestrator has total control over branch naming (`topic/wave-1/task-2`), base commits, review diffs, cherry-picking, and worktree deletion.

---

## 6. Structured Output & Yield Semantics

### Verdict: **VERIFIED**

### Schema Enforcement
When launching an agent with `schema` and `schemaMode: "strict"`:
```js
const schema = {
  type: "object",
  properties: {
    status: { type: "string" },
    count: { type: "number" }
  },
  required: ["status", "count"]
};

const handle = await agent("Call yield with data: { status: 'ready', count: 42 }", {
  schema,
  schemaMode: "strict"
});

const res = await handle.wait();
// res is a PARSED JavaScript object directly:
// typeof res === "object", res.status === "ready", res.count === 42
```
- The caller receives a parsed JavaScript object directly (not a JSON string).

### Yield Error Propagation
When a subagent calls `yield({ error: "fatal subagent error: bad data" })`:
- `await handle.wait()` **rejects and throws an Error**.
- The thrown exception's `message` is verbatim the string provided to `yield({ error })`:
  `Error: fatal subagent error: bad data`
- Stack trace originates in `resolveHandleSnapshot` in the host bridge.

### Critical Gotchas
- **Do not pass `"yield"` in `tools`**: Eval `agent("...", { tools: ["yield"] })` throws:
  `Unknown eval tool(s): yield. Define them with @tool (Python) or tool(fn, {…}) (JS) in an eval cell first.`
  The `tools` array in eval `agent()` is reserved for eval-defined kernel tools. The built-in `yield` tool is automatically provided to structured subagents.

---

## 7. IRC Peer Messaging & Lifecycle

### Verdict: **VERIFIED**

### Live Peer Messaging & Context Retention
- Subagents keep full conversational memory across turns.
- In our test:
  1. Agent `ComplexCarp` was spawned: `"Remember secret code 777888. Reply CODE_STORED"`.
  2. First turn yielded `"CODE_STORED"`.
  3. Turn 2 message was sent: `handle.send("What was the secret code? Reply with CODE=<num>")`.
  4. Agent woke up (`receipts: [{ outcome: "woken" }]`), remembered context, and replied `"CODE=777888"`.

### Crucial Tool Dependency for `handle.send()`
- `AgentHandle.send()` in eval is implemented by delegating to the session's `write` tool with path `agent://<id>`.
- If the root session was launched with `--tools=eval` (omitting `write`), `handle.send()` throws:
  `ToolError: Tool is registered but not available in this session: write`
- **Fix**: The root session must include `write` in its tool list (`--tools=eval,write,read`).

### Parking & Revival Semantics (7-minute TTL)
- Subagents transition to `idle` upon yielding.
- `AgentLifecycleManager` arms a timer based on `task.agentIdleTtlMs` (default 420,000ms / 7 minutes).
- **While Idle (< 7 min)**: The `AgentSession` remains live in memory. Incoming messages immediately cancel the timer and run the turn in-memory.
- **When Parked (> 7 min)**: The in-memory `AgentSession` is disposed to free RAM, while its JSONL transcript is retained on disk.
- **Revival on Message**: Sending a message to `agent://<id>` for a parked agent triggers `ensureLive(id)`, which invokes `persisted-revive.ts` to reload the session from disk, restore messages and state, re-attach the IRC turn monitor, and execute the turn.

---

## 8. `completion()` Small-Model Helper for JSON Repair

### Verdict: **VERIFIED**

The prelude `completion()` helper provides lightweight, stateless LLM calls with schema enforcement for repair and extraction.

### Working Snippet
```js
const brokenJson = "{ status: 'repaired', count: 99, notes: unquoted_value_here }";

const repairSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    count: { type: "number" },
    notes: { type: "string" }
  },
  required: ["status", "count", "notes"]
};

const handle = await completion("Extract and repair data into the requested schema: " + brokenJson, {
  model: "smol", // maps to @smol role
  schema: repairSchema
});

const result = await handle.wait();
// Returns parsed object directly:
// { status: "repaired", count: 99, notes: "unquoted_value_here" }
```

### Observed Behavior
- `model: "smol"` accepted (maps to `@smol` configured model, e.g. `ling-3.1-flash` or `deepseek-flash`).
- Automatically forces internal structured tool `respond`, validates output against `schema`, and returns a parsed JavaScript object.
- Tolerates single quotes and unquoted literals in the input, resolving them to valid typed properties.

---

## 9. Session Traces & Subagent Transcripts

### Verdict: **VERIFIED**

### Storage Hierarchy
Session traces are stored deterministically under `~/.omp/agent/sessions/`:
```
~/.omp/agent/sessions/<project-slug>/
├── <timestamp>_<sessionId>.jsonl        # Root session transcript
└── <timestamp>_<sessionId>/             # Subagent directory
    ├── <agentName-or-Id>.jsonl          # Subagent full JSONL transcript
    ├── <agentName-or-Id>.md             # Subagent final output markdown
    ├── local/                           # local:// shared scratch artifacts
    └── <n>.<tool>.log                   # Spilled tool call logs & outputs
```

### Locating Traces Programmatically
Given a root `sessionManager`:
- Session file: `session.sessionManager.getSessionFile()` (e.g. `.../2026-11-07T01-41-40_abc.jsonl`).
- Subagent directory: `sessionFile.replace(/\.jsonl$/, "")`.
- Individual subagent transcript: `path.join(subagentDir, `${agentId}.jsonl`)`.
- Individual subagent output: `path.join(subagentDir, `${agentId}.md`)`.

---

## 10. Recommended Adapter Shape

### Evaluation of Options

1. **Option A: Pure Eval-Kernel Host (`omp -p` running an eval loop)**
   - *Pros*: Built-in IRC handle management (`agent()`, `handle.send()`), prelude `completion()`, `judge()`.
   - *Cons*: Cannot control subagent `cwd` (no git worktrees per worker); relies on `isolated: true` which discards branch commits on failure/rejection; vulnerable to eval auto-backgrounding; tool permissions tightly coupled to root session.
2. **Option B: Pure OMP Extension (`--extension factory.ts`)**
   - *Pros*: Hooks into OMP lifecycle, can call `createAgentSession`.
   - *Cons*: Requires authoring custom CLI/TUI interactions inside OMP's extension API; `runStructuredSubagent` is not exported on `pi.pi`; couples orchestration logic to OMP internal packages.
3. **Option C: Hybrid External Bun CLI + OMP Headless Adapter (RECOMMENDED)**

### Recommended Design: External Bun CLI + OMP Headless CLI Adapter

The factory orchestrator should run as an **independent Bun process** (harness-agnostic core), using an **OMP CLI adapter** for execution:

```
┌─────────────────────────────────────────────────────────────┐
│             Software-Factory Core (Bun CLI)                 │
│  - State machine & YAML artifact pipeline                   │
│  - Git worktree manager (git worktree add -b topic/...)      │
│  - Small-model repair completions (via @smol or direct API) │
└──────────────────────────────┬──────────────────────────────┘
                               │
               Spawns via Process / CLI per Task
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    OMP Worker Instances                     │
│                                                             │
│  Worker Task:                                               │
│    omp --cwd /tmp/worktree/task-1                           │
│        --plugin-dir /path/to/plugins/software-factory        │
│        --config /tmp/run-config.yml                         │
│        --model @workhorse                                   │
│        -p "Complete task..."                                │
│                                                             │
│  Architect IRC Daemon (when steering/dialogue needed):      │
│    omp -p --tools=eval,write,read                           │
│        --config /tmp/run-config.yml                         │
│        "Eval script keeping architect IRC session alive"    │
└─────────────────────────────────────────────────────────────┘
```

### Why this shape wins:
1. **True Git Isolation & Retention**: Engine creates worktrees (`git worktree add -b topic/wave-1/task-2 /tmp/worktrees/task-2 master`). OMP runs with `--cwd /tmp/worktrees/task-2`. All commits and rejected edits are 100% retained regardless of exit status.
2. **Per-Launch Model Control**: Each launch passes exact `--model <role-or-id>` directly on the CLI without fighting `task.perCallModel` provenance barriers.
3. **Agent Discovery**: Uses `--plugin-dir /path/to/plugins/software-factory` to cleanly load custom agents (`agents/*.md`).
4. **Crash & State Resilience**: The orchestrator state is preserved in YAML files on disk. If any individual OMP worker hangs or crashes, the orchestrator detects the process exit code, retries or repairs, and continues without losing the entire swarm state.
5. **Architect Continuity**: When iterative steering is needed, the orchestrator keeps an architect process alive or uses `omp --mode rpc` / resume (`-r`) to hold dialogue context.

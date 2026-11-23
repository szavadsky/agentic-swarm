import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeAtFileEnd } from "../setup/tmp-cleanup.js";
import { stubJsonOptions } from "./acpx-stub-script.js";

/** Bound on the stub's startup wait, so a failed spawn reports instead of hanging. */
const READY_TIMEOUT_MS = 30_000;

export interface AcpxStub {
  binary: string;
  cleanup(): void;
  /** argv of every acpx invocation, in order. */
  invocations(): string[][];
  /** Named sessions still open in the stub's state directory. */
  sessionNames(): string[];
  /** Forgets a named record, like acpx's TTL or `sessions close`. */
  closeSession(name: string): void;
  /** Waits until the stub process has started, failing with a diagnostic. */
  waitForReady(): Promise<void>;
}

export interface AcpxStubModel {
  id: string;
  effort: string[];
}

export interface AcpxStubBehavior {
  usage?: Record<string, number> | null;
  sessionUsage?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  } | null;
  reply?: string;
  sessionInfoError?: {
    httpStatusCode?: number;
    message?: string;
    additionalDetails?: string;
    willRetry?: boolean;
  } | null;
}

export interface AcpxStubOptions {
  /** Prompt result usage frame; absent means the result carries none. */
  usage?: Record<string, number>;
  /**
   * Tokens one prompt adds to the stub session. When set, `/session` answers
   * The agent's cumulative report; absent leaves the command unimplemented.
   */
  sessionUsage?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  /** How `/session` answers: the cumulative report, or an ACP error. */
  sessionCommand?: "ok" | "fail";
  /** Tokens a successful `/compact` adds before the next usage read. */
  compactUsage?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  /** Banner text emitted as an earlier agent message before the reply. */
  banner?: string;
  /** Delay before a prompt turn's result frames, simulating a long turn. */
  promptDelayMs?: number;
  /** ACP `usage_update` cost payload; absent means the update carries none. */
  cost?: { amount: number; currency: string };
  /**
   * What `/compact` answers: success text, a small-session -32603, or a
   * different adapter failure. The command itself carries no marker, so this
   * is the stub's switch.
   */
  compact?: "ok" | "nothing" | "fail";
  /** Models the stub agent advertises; absent keeps the old no-model behavior. */
  models?: AcpxStubModel[];
  /** Model used when the invocation carries no `--model`. */
  defaultModel?: string;
  /** Live effort option id; defaults to `effort`. */
  effortConfigId?: string;
  /** Stop reason on the prompt result; defaults to `end_turn`. */
  stopReason?: string;
  /** Exit code after the prompt's frames; defaults to 0. */
  promptExitCode?: number;
  /** Emit no prompt result frame, leaving the exit facts as the only evidence. */
  omitPromptResult?: boolean;
  /** Emit this ACP error frame after the prompt result. */
  errorAfterResult?: { code: number; message: string };
  /** Keep the process alive after the prompt result, so a wall timeout wins. */
  hangAfterResult?: boolean;
  /** session_info_update adapter error frame emitted during prompt */
  sessionInfoError?: {
    httpStatusCode?: number;
    message?: string;
    additionalDetails?: string;
    willRetry?: boolean;
  };
  /** Per-model option overrides when invocation includes --model */
  modelBehaviors?: Record<string, AcpxStubBehavior>;
  /** Prompt-phase child writes its environment here as JSON; env-filter tests read it. */
  envFile?: string;
}

export function createAcpxStub(opts: AcpxStubOptions = {}): AcpxStub {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acpx-stub-"));
  const logPath = path.join(dir, "invocations.ndjson");
  const readyPath = path.join(dir, "ready");
  const stateDir = path.join(dir, "state");
  const binary = path.join(dir, "acpx-stub.js");
  const js = stubJsonOptions(opts);
  const script = `#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
const readyPath = ${JSON.stringify(readyPath)};
const stateDir = ${JSON.stringify(stateDir)};
const envFile = ${js.envFileJs};
fs.mkdirSync(stateDir, { recursive: true });
fs.appendFileSync(logPath, JSON.stringify(args) + "\\n");
fs.writeFileSync(readyPath, "ready");

// Synchronous: process.exit() right after an async pipe write can drop the frame.
const emit = (frame) => fs.writeSync(1, JSON.stringify(frame) + "\\n");
const flag = (names) => {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) return args[index + 1];
  }
  return undefined;
};
const session = flag(["-s", "--session"]);
const prompt = args[args.length - 1] ?? "";
const marker = (name) => {
  const match = new RegExp("\\\\[\\\\[" + name + ":([^\\\\]]*)\\\\]\\\\]").exec(prompt);
  return match ? match[1] : undefined;
};
const modelFlag = flag(["--model"]);
const behaviors = ${js.modelBehaviorsJs};
const activeBehavior = (modelFlag && behaviors && behaviors[modelFlag]) ? behaviors[modelFlag] : {};

const mode = marker("mode");
const textMarker = marker("text");
const defaultReply = "reply" in activeBehavior ? activeBehavior.reply : "PONG";
const reply = textMarker !== undefined ? textMarker : defaultReply;
const usage = "usage" in activeBehavior ? activeBehavior.usage : ${js.usageJs};
const sessionUsage = "sessionUsage" in activeBehavior ? activeBehavior.sessionUsage : ${js.sessionUsageJs};
const sessionInfoError = "sessionInfoError" in activeBehavior ? activeBehavior.sessionInfoError : ${js.sessionInfoErrorJs};
const sessionCommand = ${js.sessionCommandJs};
const compactUsage = ${js.compactUsageJs};
const banner = ${js.bannerJs};
const promptDelayMs = ${js.promptDelayJs};
const cost = ${js.costJs};
const compactMode = ${js.compactJs};
const models = ${js.modelsJs};
const defaultModel = ${js.defaultModelJs};
const effortConfigId = ${js.effortConfigIdJs};
const stopReason = ${js.stopReasonJs};
const promptExitCode = ${js.promptExitCodeJs};
const omitPromptResult = ${js.omitPromptResultJs};
const errorAfterResult = ${js.errorAfterResultJs};
const hangAfterResult = ${js.hangAfterResultJs};
const sessionFile = (name) => path.join(stateDir, "session-" + name);
const sessionUsageFile = (name) => path.join(stateDir, "usage-" + name);
const addSessionUsage = (name, amount) => {
  if (!amount) return;
  let totals = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  try {
    totals = JSON.parse(fs.readFileSync(sessionUsageFile(name), "utf8"));
  } catch {}
  totals.in += amount.input;
  totals.out += amount.output;
  totals.cacheRead += amount.cacheRead ?? 0;
  totals.cacheWrite += amount.cacheWrite ?? 0;
  fs.writeFileSync(sessionUsageFile(name), JSON.stringify(totals));
};
const noSession = () =>
  emit({
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32002,
      message: "⚠ No acpx session found (searched up to " + process.cwd() + ").\\nCreate one: acpx sessions new --name " + session,
      data: { acpxCode: "NO_SESSION", origin: "cli", sessionId: "unknown" },
    },
  });

if (args.includes("sessions") && args.includes("new")) {
  const name = flag(["--name"]) ?? "default";
  const requested = flag(["--model"]) ?? defaultModel ?? models?.[0]?.id;
  if (requested && models && !models.some((model) => model.id === requested)) {
    emit({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message:
          'Cannot apply --model "' + requested +
          '": the ACP agent did not advertise that model. Available models: ' +
          models.map((model) => model.id).join(", ") + ".",
        data: { acpxCode: "RUNTIME" },
      },
    });
    process.exit(1);
  }
  const chosen = models?.find((model) => model.id === requested);
  const configOptions = [];
  if (models) {
    configOptions.push({
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: requested,
      options: models.map((model) => ({ value: model.id, name: model.id })),
    });
  }
  if (chosen) {
    configOptions.push({
      id: effortConfigId,
      name: "Effort",
      category: "thought_level",
      type: "select",
      currentValue: chosen.effort[0] ?? "",
      options: chosen.effort.map((value) => ({ value, name: value })),
    });
  }
  fs.writeFileSync(sessionFile(name), JSON.stringify({
    schema: "acpx.session.v1",
    acpxRecordId: "rec-" + name,
    acpSessionId: "sess-" + name,
    cwd: process.cwd(),
    name,
    closed: false,
    acpx: { config_options: configOptions },
  }));
  emit({ action: "session_ensured", created: true, acpxRecordId: "rec-" + name, acpxSessionId: "sess-" + name, name });
  process.exit(0);
}
if (args.includes("sessions") && args.includes("show")) {
  const name = args[args.length - 1];
  if (!name || !fs.existsSync(sessionFile(name))) {
    noSession();
    process.exit(4);
  }
  fs.writeSync(1, fs.readFileSync(sessionFile(name), "utf8") + "\\n");
  process.exit(0);
}
if (args.includes("sessions") && args.includes("close")) {
  const name = args[args.length - 1];
  fs.rmSync(sessionFile(name), { force: true });
  emit({ action: "session_closed", acpxRecordId: "rec-" + name });
  process.exit(0);
}
if (args.includes("set")) {
  if (!session || !fs.existsSync(sessionFile(session))) {
    noSession();
    process.exit(4);
  }
  const at = args.indexOf("set");
  // The raw route places -s <name> between set and the pair; a positional
  // agent places it before set.
  const pair = args[at + 1] === "-s" ? args.slice(at + 3, at + 5) : args.slice(at + 1, at + 3);
  fs.writeFileSync(path.join(stateDir, "config-" + session), pair[0] + "=" + pair[1]);
  emit({ action: "config_set", configId: pair[0], value: pair[1] });
  process.exit(0);
}

// Only prompt-phase invocations reach here; setup commands exited above.
if (envFile) fs.writeFileSync(envFile, JSON.stringify(process.env));
if (process.env.ACPX_STUB_PID_FILE) fs.writeFileSync(process.env.ACPX_STUB_PID_FILE, String(process.pid));

if (mode === "no_session" || !session || !fs.existsSync(sessionFile(session))) {
  noSession();
  process.exit(4);
}
if (mode === "bad_model") {
  emit({ jsonrpc: "2.0", id: null, error: { code: -32603, message: 'Cannot apply --model "nope": the ACP agent did not advertise that model. Available models: a, b. key sk-abcdefghijklmnop', data: { acpxCode: "RUNTIME" } } });
  process.exit(1);
}
if (mode === "quota") {
  emit({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Insufficient balance to run this request", data: { service: "session", errorName: "provider.quota", acpxCode: "RUNTIME" } } });
  process.exit(1);
}
if (mode === "bare") {
  fs.writeSync(2, "boom api_key=supersecretvalue\\n");
  process.exit(3);
}
if (mode === "hang") {
  await new Promise(() => {});
}

const sessionId = "sess-" + session;
const startPrompt = () => {
  emit({ jsonrpc: "2.0", id: 1, method: "session/load", params: { sessionId, cwd: process.cwd() } });
  emit({ jsonrpc: "2.0", id: 1, result: { sessionId } });
  emit({ jsonrpc: "2.0", id: 7, method: "session/prompt", params: { sessionId, prompt: [{ type: "text", text: prompt }] } });
};
const chunk = (text, messageId) => {
  const update = { sessionUpdate: "agent_message_chunk", content: { type: "text", text } };
  if (messageId) update.messageId = messageId;
  emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
};

// A slash command is the whole prompt: answer it with the adapter's frames.
if (prompt === "/session") {
  if (!session || !fs.existsSync(sessionFile(session))) {
    noSession();
    process.exit(4);
  }
  if (sessionCommand === "fail") {
    emit({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error", data: { details: "session command failed" } } });
    process.exit(1);
  }
  const hasUsageFile = fs.existsSync(sessionUsageFile(session));
  if (!sessionUsage && !hasUsageFile) {
    emit({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error", data: { details: "no session usage configured" } } });
    process.exit(1);
  }
  const totals = hasUsageFile
    ? JSON.parse(fs.readFileSync(sessionUsageFile(session), "utf8"))
    : { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  startPrompt();
  chunk(
    "Session: " + sessionId + "\\n" +
      "Session file: " + path.join(stateDir, "agent-" + session + ".jsonl") + "\\n" +
      "Messages: 1\\n" +
      "Cost: 0\\n" +
      "Tokens: in " + totals.in + ", out " + totals.out +
      ", cache read " + totals.cacheRead + ", cache write " + totals.cacheWrite +
      ", total " + (totals.in + totals.out + totals.cacheRead + totals.cacheWrite),
    "msg_session",
  );
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason: "end_turn" } });
  process.exit(0);
}
if (prompt === "/compact") {
  if (compactMode === "nothing") {
    emit({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error", data: { details: "agent compact failed: Nothing to compact (session too small)" } } });
    process.exit(1);
  }
  if (compactMode === "fail") {
    emit({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error", data: { details: "agent compact failed: summarizer unavailable" } } });
    process.exit(1);
  }
  startPrompt();
  addSessionUsage(session, compactUsage);
  chunk("Compaction completed.\\nTokens before: 55832", "msg_compact");
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason: "end_turn" } });
  process.exit(0);
}

if (promptDelayMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, promptDelayMs));
}
startPrompt();
addSessionUsage(session, sessionUsage);
if (sessionInfoError) {
  emit({
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "session_info_update",
        _meta: {
          fakeagent: {
            error: sessionInfoError,
          },
        },
      },
    },
  });
}
if (banner) {
  chunk(banner, undefined);
  emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "available_commands_update", availableCommands: [] } } });
}
if (reply) {
  chunk(reply.slice(0, 1), "msg_stub");
  chunk(reply.slice(1), "msg_stub");
}

if (mode === "cancelled") {
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason: "cancelled", usage: null } });
  process.exit(0);
}

if (omitPromptResult) {
  process.exit(promptExitCode);
}
if (usage) {
  emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "usage_update", used: 5927, size: 950000, ...(cost ? { cost } : {}) } } });
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason, usage } });
} else {
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason } });
}
if (errorAfterResult) {
  emit({ jsonrpc: "2.0", id: null, error: errorAfterResult });
}
if (hangAfterResult) {
  await new Promise(() => {});
}
process.exit(promptExitCode);
`;

  fs.writeFileSync(binary, script, { mode: 0o755 });

  const stub: AcpxStub = {
    binary,
    cleanup: () => {
      unregisterCleanup();
      fs.rmSync(dir, { recursive: true, force: true });
    },
    sessionNames: () => {
      if (!fs.existsSync(stateDir)) return [];
      return fs
        .readdirSync(stateDir)
        .filter((name) => name.startsWith("session-"))
        .map((name) => name.slice("session-".length))
        .sort();
    },
    closeSession: (name: string) =>
      fs.rmSync(path.join(stateDir, `session-${name}`), { force: true }),
    waitForReady: async () => {
      // Monotonic: the cache test's fake clock freezes Date.
      const start = performance.now();
      while (!fs.existsSync(readyPath)) {
        if (performance.now() - start > READY_TIMEOUT_MS) {
          throw new Error(
            `acpx-stub did not start within ${READY_TIMEOUT_MS}ms`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    invocations: () => {
      if (!fs.existsSync(logPath)) return [];
      return fs
        .readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
    },
  };

  const unregisterCleanup = removeAtFileEnd(() => stub.cleanup());
  return stub;
}

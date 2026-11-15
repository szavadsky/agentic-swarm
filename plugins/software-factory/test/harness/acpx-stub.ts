import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AcpxStub {
  binary: string;
  cleanup(): void;
  /** argv of every acpx invocation, in order. */
  invocations(): string[][];
  /** Forgets a named record, like acpx's TTL or `sessions close`. */
  closeSession(name: string): void;
}

export interface AcpxStubOptions {
  /** Overrides the codex prompt usage frame. */
  codexUsage?: Record<string, number>;
  /** Overrides the agy prompt usage frame. */
  agyUsage?: Record<string, number>;
}

/**
 * A stub acpx executable that replays the probe's JSON-RPC frames. It keeps a
 * named-session record in its own state dir, so a missing `-s` is a real
 * NO_SESSION failure for both `set` and the prompt, and a second turn can only
 * resume by name. It logs argv and never writes the outcome file: a test that
 * cares about the outcome path asserts the prompt the stub received.
 */
export function createAcpxStub(opts: AcpxStubOptions = {}): AcpxStub {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acpx-stub-"));
  const logPath = path.join(dir, "invocations.ndjson");
  const stateDir = path.join(dir, "state");
  const binary = path.join(dir, "acpx-stub.js");
  const usage = JSON.stringify(
    opts.codexUsage ?? {
      totalTokens: 5927,
      inputTokens: 5923,
      cachedReadTokens: 0,
      outputTokens: 4,
      thoughtTokens: 0,
    },
  );
  // The live agy turn reported exactly this shape and no cost.
  const agyUsage = JSON.stringify(
    opts.agyUsage ?? {
      totalTokens: 8862,
      inputTokens: 8783,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
      outputTokens: 79,
      thoughtTokens: 77,
    },
  );

  const script = `#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
const stateDir = ${JSON.stringify(stateDir)};
fs.mkdirSync(stateDir, { recursive: true });
fs.appendFileSync(logPath, JSON.stringify(args) + "\\n");

const agent = args.includes("--agent") ? "agy" : args.includes("pi") ? "pi" : "codex";
const emit = (frame) => process.stdout.write(JSON.stringify(frame) + "\\n");
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
const mode = marker("mode");
const reply = marker("text") ?? "PONG";
const sessionFile = (name) => path.join(stateDir, "session-" + name);
const noSession = () =>
  emit({
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32002,
      message: "⚠ No acpx session found (searched up to " + process.cwd() + ").\\nCreate one: acpx " + agent + " sessions new --name " + session,
      data: { acpxCode: "NO_SESSION", origin: "cli", sessionId: "unknown" },
    },
  });

if (args.includes("sessions") && args.includes("new")) {
  const name = flag(["--name"]) ?? "default";
  fs.writeFileSync(sessionFile(name), "1");
  emit({ action: "session_ensured", created: true, acpxRecordId: "rec-" + name, acpxSessionId: "sess-" + name, name });
  process.exit(0);
}
if (args.includes("set")) {
  if (!session || !fs.existsSync(sessionFile(session))) {
    noSession();
    process.exit(4);
  }
  const at = args.indexOf("set");
  fs.writeFileSync(path.join(stateDir, "config-" + session), args[at + 1] + "=" + args[at + 2]);
  emit({ action: "config_set", configId: args[at + 1], value: args[at + 2] });
  process.exit(0);
}

// Only prompt-phase invocations reach here; setup commands exited above.
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
  process.stderr.write("boom api_key=supersecretvalue\\n");
  process.exit(3);
}
if (mode === "hang") {
  await new Promise(() => {});
}

const sessionId = "sess-" + session;
emit({ jsonrpc: "2.0", id: 1, method: "session/load", params: { sessionId, cwd: process.cwd() } });
emit({ jsonrpc: "2.0", id: 1, result: { sessionId } });
emit({ jsonrpc: "2.0", id: 7, method: "session/prompt", params: { sessionId, prompt: [{ type: "text", text: prompt }] } });

const chunk = (text, messageId) => {
  const update = { sessionUpdate: "agent_message_chunk", content: { type: "text", text } };
  if (messageId) update.messageId = messageId;
  emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
};

if (agent === "pi") {
  chunk("pi v1.5.2\\n---\\n\\n## Skills\\n", undefined);
  emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "available_commands_update", availableCommands: [] } } });
  chunk(reply, undefined);
} else {
  chunk(reply.slice(0, 1), "msg_stub");
  chunk(reply.slice(1), "msg_stub");
}

if (mode === "cancelled") {
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason: "cancelled", usage: null } });
  process.exit(0);
}

if (agent === "codex") {
  emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "usage_update", used: 5927, size: 950000 } } });
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason: "end_turn", usage: ${usage} } });
} else if (agent === "agy") {
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason: "end_turn", usage: ${agyUsage} } });
} else {
  emit({ jsonrpc: "2.0", id: 7, result: { stopReason: "end_turn" } });
}
`;

  fs.writeFileSync(binary, script, { mode: 0o755 });

  return {
    binary,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
    closeSession: (name: string) =>
      fs.rmSync(path.join(stateDir, `session-${name}`), { force: true }),
    invocations: () => {
      if (!fs.existsSync(logPath)) return [];
      return fs
        .readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
    },
  };
}

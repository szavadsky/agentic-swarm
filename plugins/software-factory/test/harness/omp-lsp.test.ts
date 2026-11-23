import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRealHarnesses } from "../../src/cli/harnesses.js";
import { OmpHarness } from "../../src/harness/omp/harness.js";
import { turnLspConfigPath } from "../../src/harness/omp/lsp.js";
import { writeArtifactLsp } from "../../src/kernel/artifact-lsp.js";

const FAKE_OMP = `#!/usr/bin/env bun
const fs = require("node:fs");
const readline = require("node:readline");
const argv = process.argv.slice(2);
if (process.env.FAKE_OMP_ARGV) fs.appendFileSync(process.env.FAKE_OMP_ARGV, JSON.stringify(argv) + "\\n");
if (argv[0] === "models") {
  process.stdout.write(JSON.stringify({ models: [] }) + "\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\\n");
let stats = { tokens: { input: 0, output: 0 }, cost: 0 };
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  if (frame.type === "prompt") {
    process.stdout.write(JSON.stringify({
      type: "message_end",
      message: { role: "assistant", usage: { input: 10, output: 5 }, stopReason: "stop" }
    }) + "\\n");
    if (frame.message === "quick") {
      stats = { tokens: { input: 1, output: 1 }, cost: 0.001 };
      process.stdout.write(JSON.stringify({
        type: "prompt_result", id: frame.id, agentInvoked: true,
        status: "completed", sessionSettled: true,
      }) + "\\n");
    }
  } else if (frame.type === "abort") {
    process.exit(0);
  } else {
    const data = frame.type === "get_last_assistant_text"
      ? { text: "done" }
      : frame.type === "get_session_stats"
        ? stats
        : { tokens: { input: 0, output: 0 }, cost: 0 };
    process.stdout.write(JSON.stringify({
      id: frame.id, type: "response", command: frame.type, success: true, data,
    }) + "\\n");
  }
});
setInterval(() => {}, 1000);
`;

function fixture(lspConfig?: string): {
  harness: OmpHarness;
  dir: string;
  cwd: string;
  argvFile: string;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-lsp-"));
  const binary = path.join(dir, "fake-omp.js");
  fs.writeFileSync(binary, FAKE_OMP, { mode: 0o755 });
  const argvFile = path.join(dir, "argv.jsonl");
  process.env.FAKE_OMP_ARGV = argvFile;
  const cwd = path.join(dir, "worktree");
  fs.mkdirSync(cwd, { recursive: true });
  return {
    harness: new OmpHarness({
      binary,
      sessionDir: path.join(dir, "sessions"),
      // The fake records argv through the parent env; a child inherits a name
      // only when declared, like a run config's allowlist.
      envAllowlist: ["FAKE_OMP_ARGV"],
      readyTimeoutMs: 5_000,
      lspConfig,
    }),
    dir,
    cwd,
    argvFile,
    cleanup: () => {
      delete process.env.FAKE_OMP_ARGV;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function argv(file: string): string[] {
  return JSON.parse(
    fs.readFileSync(file, "utf8").trim().split("\n").at(-1)!,
  ) as string[];
}

describe("omp artifact LSP", () => {
  ompArtifactLSPPart1();
  ompArtifactLSPPart2();
  ompArtifactLSPSession();
});

/** One JSON-RPC frame from the YAML language server. */
interface LspFrame {
  id?: number | string;
  method?: string;
  params?: {
    items?: { section?: string; scopeUri?: string }[];
    uri?: string;
    diagnostics?: { message?: string }[];
  };
  result?: unknown;
}

/** Minimal LSP client speaking Content-Length frames to the YAML server. */
class YamlLspClient {
  private buffer = Buffer.alloc(0);
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  private readonly settings: Record<string, unknown>;
  private readonly fileUri: string;
  private readonly goalUri: string;

  constructor(
    command: string,
    args: string[],
    settings: Record<string, unknown>,
    fileUri: string,
    goalUri: string,
  ) {
    this.settings = settings;
    this.fileUri = fileUri;
    this.goalUri = goalUri;
    this.proc = Bun.spawn([command, ...args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.reader =
      this.proc.stdout.getReader() as unknown as ReadableStreamDefaultReader<Uint8Array>;
  }

  private send(message: Record<string, unknown>): void {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    this.proc.stdin.write(
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
    this.proc.stdin.flush();
  }

  private async nextFrame(): Promise<LspFrame | undefined> {
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd >= 0) {
        const header = this.buffer.subarray(0, headerEnd).toString("ascii");
        const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1]);
        const bodyStart = headerEnd + 4;
        if (this.buffer.length >= bodyStart + length) {
          const body = this.buffer
            .subarray(bodyStart, bodyStart + length)
            .toString("utf8");
          this.buffer = this.buffer.subarray(bodyStart + length);
          return JSON.parse(body) as LspFrame;
        }
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const read = this.reader.read();
      const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 5_000);
      });
      let result: Awaited<typeof read> | undefined;
      try {
        result = await Promise.race([read, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!result) return undefined;
      if (result.done) return undefined;
      this.buffer = Buffer.concat([this.buffer, Buffer.from(result.value)]);
    }
  }

  /**
   * Reads frames, answering config requests, until the server publishes
   * diagnostics for the file: a non-empty report returns at once; otherwise
   * the latest (empty) report arrives once the schema lookup settles and the
   * capped sweep returns it.
   */
  async diagnostics(): Promise<{ message?: string }[]> {
    let latest: { message?: string }[] = [];
    for (let count = 0; count < 30; count++) {
      const frame = await this.nextFrame();
      if (!frame) return latest;
      if (frame.method === "workspace/configuration") {
        const items = frame.params?.items ?? [];
        const result = items.map((item) => {
          if (item.section === "yaml" || item.section === "[yaml]")
            return this.settings["yaml"];
          return {};
        });
        this.send({ id: frame.id, result });
        continue;
      }
      if (
        frame.method === "textDocument/publishDiagnostics" &&
        frame.params?.uri === this.fileUri
      ) {
        latest = frame.params.diagnostics ?? [];
        if (latest.length > 0) return latest;
      }
    }
    return latest;
  }

  /** Opens the file with `text`, awaiting the server's diagnostics. */
  async open(text: string): Promise<{ message?: string }[]> {
    this.send({
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: this.fileUri,
          languageId: "yaml",
          version: 1,
          text,
        },
      },
    });
    return this.diagnostics();
  }

  /** Replaces the open document with `text`, awaiting re-validated diagnostics. */
  async change(text: string): Promise<{ message?: string }[]> {
    this.send({
      method: "textDocument/didChange",
      params: {
        textDocument: { uri: this.fileUri, version: 2 },
        contentChanges: [{ text }],
      },
    });
    return this.diagnostics();
  }

  async close(): Promise<void> {
    this.send({ method: "exit" });
    this.proc.kill();
    await this.proc.exited;
  }

  async start(): Promise<void> {
    this.send({
      id: 1,
      method: "initialize",
      params: {
        processId: null,
        rootUri: this.goalUri,
        capabilities: { workspace: { configuration: true } },
        workspaceFolders: [{ uri: this.goalUri, name: "goal" }],
      },
    });
    await this.nextFrame();
    this.send({ method: "initialized", params: {} });
    this.send({
      method: "workspace/didChangeConfiguration",
      params: { settings: this.settings },
    });
  }
}

interface LspServerConfig {
  command: string;
  args: string[];
  settings: Record<string, unknown>;
}

function lspServer(installed: string): LspServerConfig {
  const parsed = JSON.parse(fs.readFileSync(installed, "utf8")) as {
    servers: Record<string, LspServerConfig>;
  };
  return parsed.servers["factory-artifacts"]!;
}

async function runOmpTurnWithLsp(
  f: ReturnType<typeof fixture>,
  config: string,
): Promise<string> {
  const result = await f.harness.turn({
    model: { id: "provider/model" },
    cwd: f.cwd,
    prompt: "quick",
    timeouts: { idleMs: 5_000, wallMs: 20_000 },
  });
  expect(result.stop.kind).toBe("done");
  expect(argv(f.argvFile)).not.toContain("--no-lsp");
  const installed = turnLspConfigPath(f.cwd);
  expect(fs.readFileSync(installed, "utf8")).toBe(
    fs.readFileSync(config, "utf8"),
  );
  return installed;
}

function ompArtifactLSPSession() {
  it.skipIf(!Bun.which("yaml-language-server"))(
    "validates a broken outcome.yaml with the generated artifact LSP config through an omp session",
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-lsp-session-"));
      const goalDir = path.join(root, "goal");
      const recordDir = path.join(goalDir, "records", "r1");
      fs.mkdirSync(recordDir, { recursive: true });
      fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n");
      const outcomePath = path.join(recordDir, "outcome.yaml");
      fs.writeFileSync(outcomePath, "status: banana\nsummary: hi\n");
      const { config } = await writeArtifactLsp(goalDir);
      const f = fixture(config);
      let client: YamlLspClient | undefined;
      try {
        const installed = await runOmpTurnWithLsp(f, config);
        const server = lspServer(installed);
        client = new YamlLspClient(
          server.command,
          server.args,
          server.settings,
          pathToFileURL(outcomePath).href,
          pathToFileURL(goalDir).href,
        );
        await client.start();
        const broken = await client.open("status: banana\nsummary: hi\n");
        expect(broken.length).toBeGreaterThan(0);
        expect(broken[0]?.message).toContain("done");
        expect(broken[0]?.message).toContain("upscope");
        const valid = await client.change("status: done\nsummary: ok\n");
        expect(valid).toEqual([]);
      } finally {
        await client?.close();
        f.cleanup();
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    30_000,
  );
}

function ompArtifactLSPPart1() {
  it("installs the config into the turn cwd and drops --no-lsp", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-lsp-src-"));
    const config = path.join(dir, "lsp.json");
    const content =
      '{"servers":{"factory":{"command":"yaml-language-server"}}}\n';
    fs.writeFileSync(config, content);
    const f = fixture(config);
    try {
      const result = await f.harness.turn({
        model: { id: "provider/model" },
        cwd: f.cwd,
        prompt: "quick",
        timeouts: { idleMs: 5_000, wallMs: 20_000 },
      });
      expect(result.stop.kind).toBe("done");
      const args = argv(f.argvFile);
      expect(args).not.toContain("--no-lsp");
      const installed = turnLspConfigPath(f.cwd);
      expect(fs.readFileSync(installed, "utf8")).toBe(content);
    } finally {
      f.cleanup();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
}

function ompArtifactLSPPart2() {
  it("passes the launch's config through the real harness factory", async () => {
    const f = fixture();
    const source = path.join(f.dir, "canonical.json");
    const content =
      '{"servers":{"factory":{"command":"yaml-language-server"}}}\n';
    fs.writeFileSync(source, content);
    try {
      const harnesses = createRealHarnesses({
        sessionDir: path.join(f.dir, "factory-sessions"),
        harnesses: { omp: { binary: path.join(f.dir, "fake-omp.js") } },
        envAllowlist: ["FAKE_OMP_ARGV"],
        lsp: { config: source },
      });
      const result = await harnesses.omp!.turn({
        model: { id: "provider/model" },
        cwd: f.cwd,
        prompt: "quick",
        timeouts: { idleMs: 5_000, wallMs: 20_000 },
      });
      expect(result.stop.kind).toBe("done");
      expect(argv(f.argvFile)).not.toContain("--no-lsp");
      expect(fs.readFileSync(turnLspConfigPath(f.cwd), "utf8")).toBe(content);
    } finally {
      f.cleanup();
    }
  }, 30_000);

  it("keeps --no-lsp and installs nothing when the run config disables LSP", async () => {
    const f = fixture();
    try {
      const result = await f.harness.turn({
        model: { id: "provider/model" },
        cwd: f.cwd,
        prompt: "quick",
        timeouts: { idleMs: 5_000, wallMs: 20_000 },
      });
      expect(result.stop.kind).toBe("done");
      expect(argv(f.argvFile)).toContain("--no-lsp");
      expect(fs.existsSync(turnLspConfigPath(f.cwd))).toBe(false);
    } finally {
      f.cleanup();
    }
  }, 30_000);
}

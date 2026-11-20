import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRealHarnesses } from "../../src/cli/harnesses.js";
import { OmpHarness } from "../../src/harness/omp/harness.js";
import { turnLspConfigPath } from "../../src/harness/omp/lsp.js";

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
});

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

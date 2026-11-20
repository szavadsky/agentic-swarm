import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { renderPromptVariables } from "../../src/kernel/prompt-vars.js";

async function runVariables(args: string[]): Promise<{
  code: number;
  out: string;
  err: string;
}> {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...parts: unknown[]) => {
    logs.push(parts.map(String).join(" "));
  };
  console.error = (...parts: unknown[]) => {
    errors.push(parts.map(String).join(" "));
  };
  try {
    const code = await dispatch(["variables", ...args]);
    return { code, out: logs.join("\n"), err: errors.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

describe("factory variables", () => {
  it("writes the reference the prompt tests compare", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-variables-"));
    try {
      const out = path.join(root, "prompts", "VARIABLES.md");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const result = await runVariables(["--out", out]);
      expect(result.code).toBe(0);
      expect(result.err).toBe("");
      expect(result.out).toContain(path.resolve(out));
      expect(fs.readFileSync(out, "utf8")).toBe(renderPromptVariables());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires an output file", async () => {
    const result = await runVariables([]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("variables requires --out <file>");
  });
});

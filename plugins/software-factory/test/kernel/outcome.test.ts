import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fencedOutcome,
  parseOutcome,
  readDeliveredOutcome,
  validateExpectation,
} from "../../src/kernel/outcome.js";

describe("outcome delivery", () => {
  it("parses YAML and JSON with zod defaults", () => {
    expect(parseOutcome("status: done\nsummary: landed\n").concerns).toEqual([]);
    const json = parseOutcome('{"status":"blocked","summary":"missing key","forward":["ask owner"]}');
    expect(json.status).toBe("blocked");
    expect(json.forward).toEqual(["ask owner"]);
  });

  it("rejects an invalid outcome with field findings", () => {
    expect(() => parseOutcome("status: nope\nsummary: x\n")).toThrow(/status/);
  });

  it("prefers the prompt-named file over a fenced block", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-outcome-"));
    const file = path.join(dir, "outcome.yaml");
    fs.writeFileSync(file, "status: done\nsummary: file\n");
    const delivered = readDeliveredOutcome(file, "```yaml\nstatus: done\nsummary: message\n```");
    expect(delivered?.source).toBe("file");
    expect(delivered?.outcome.summary).toBe("file");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to the last fenced block when the file is absent or malformed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-outcome-"));
    const file = path.join(dir, "outcome.yaml");
    const message = "done\n```yaml\nstatus: done\nsummary: fence\n```\n";
    expect(readDeliveredOutcome(file, message)?.source).toBe("fenced");
    fs.writeFileSync(file, "status: not-a-status\n");
    expect(readDeliveredOutcome(file, message)?.outcome.summary).toBe("fence");
    expect(fencedOutcome("no block")).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("enforces the per-step contract", () => {
    const done = parseOutcome("status: done\nsummary: x\n");
    expect(validateExpectation(done, "architect")).toHaveLength(1);
    expect(validateExpectation(done, "review")).toHaveLength(1);
    expect(validateExpectation(parseOutcome("status: failed\nsummary: x\n"), "review")).toEqual([]);
  });
});

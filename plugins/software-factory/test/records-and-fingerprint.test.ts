import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fingerprintText, fingerprintObject } from "../src/core/fingerprint.js";
import {
  formatStepRecordDirName,
  parseStepRecordDirName,
  startStepRecord,
  finishStepRecord,
  readStepRecord,
} from "../src/core/records/step-record.js";

describe("Fingerprint & step record I/O (§6.1, §12.2)", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-records-test-"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("normalizes text and generates consistent sha1 fingerprint", () => {
    const textA = "  Hello   World \r\n Line 2  ";
    const textB = "hello world\nline 2";

    const hashA = fingerprintText(textA);
    const hashB = fingerprintText(textB);

    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(40);
  });

  it("produces deterministic fingerprint for objects regardless of key order", () => {
    const objA = { b: 2, a: 1, c: { y: 2, x: 1 } };
    const objB = { a: 1, c: { x: 1, y: 2 }, b: 2 };

    expect(fingerprintObject(objA)).toBe(fingerprintObject(objB));
  });

  it("formats and parses step record directory names", () => {
    const dirName = formatStepRecordDirName(3, "develop", 2);
    expect(dirName).toBe("003-develop-a2");

    const parsed = parseStepRecordDirName(dirName);
    expect(parsed).toEqual({ seq: 3, name: "develop", attempt: 2 });
    expect(parseStepRecordDirName("invalid-dir")).toBeNull();
  });

  it("manages step record lifecycle from started to final meta with output and checks", async () => {
    const recordDir = path.join(tempDir, "001-develop-a1");

    // 1. Start step record
    const startedMeta = await startStepRecord({
      recordDir,
      meta: {
        seq: 1,
        name: "develop",
        attempt: 1,
        agent: "developer",
        role: "workhorse",
        models: ["deepseek-v4.1-flash"],
      },
      inputPrompt: "Implement user authentication feature.",
    });

    expect(startedMeta.status).toBe("started");

    // 2. Finish step record
    const outputData = {
      status: "ok",
      summary: "Authentication implemented",
      evidence: ["tests pass"],
    };

    const checksData = {
      checks: [
        {
          id: "gates",
          status: "pass" as const,
        },
      ],
    };

    const finalMeta = await finishStepRecord({
      recordDir,
      status: "ok",
      outputData,
      checksData,
      usage: { inputTokens: 500, outputTokens: 200, costUsd: 0.02 },
    });

    expect(finalMeta.status).toBe("ok");
    expect(finalMeta.endedAt).toBeDefined();

    // 3. Read step record
    const record = await readStepRecord(recordDir);
    expect(record.meta.status).toBe("ok");
    expect(record.input).toBe("Implement user authentication feature.");
    expect((record.output as any).status).toBe("ok");
    expect(record.checks?.checks[0]?.id).toBe("gates");
  });
});

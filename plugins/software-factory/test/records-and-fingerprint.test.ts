import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "yaml";
import { fingerprintText, fingerprintObject } from "../src/core/fingerprint.js";
import {
  parseStepRecordDirName,
  startStepRecord,
  finishStepRecord,
  findOkCommittedRecord,
  getNextStepAttempt,
} from "../src/core/records/step-record.js";
import { validateAndRepair, checkLeafValuePresence } from "../src/core/records/repair.js";
import { generateReviewSchema } from "../src/core/records/review-schema.js";

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

  it("parses step record directory names", () => {
    const parsed = parseStepRecordDirName("003-develop-a2");
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
      traceRef: "transcript:abc123",
    });

    expect(finalMeta.status).toBe("ok");
    expect(finalMeta.endedAt).toBeDefined();
    expect(finalMeta.traceRef).toBe("transcript:abc123");

    // 3. Read back the committed record files directly.
    const meta = yaml.parse(fs.readFileSync(path.join(recordDir, "meta.yaml"), "utf8"));
    expect(meta.status).toBe("ok");
    expect(fs.readFileSync(path.join(recordDir, "input.md"), "utf8")).toBe(
      "Implement user authentication feature."
    );
    const output = yaml.parse(fs.readFileSync(path.join(recordDir, "output.yaml"), "utf8"));
    expect(output.status).toBe("ok");
    const checks = yaml.parse(fs.readFileSync(path.join(recordDir, "checks.yaml"), "utf8"));
    expect(checks.checks[0]?.id).toBe("gates");
  });
});

describe("Repair validator reuse & leaf guard word boundaries (§6.4)", () => {
  it("rejects enum tokens hidden inside unrelated words (whole-word match)", () => {
    expect(checkLeafValuePresence({ d: "fix" }, "apply the test fixture").ok).toBe(false);
    expect(checkLeafValuePresence({ s: "ok" }, "this is a token stream").ok).toBe(false);
    expect(checkLeafValuePresence({ s: "approved" }, "change is unapproved").ok).toBe(false);
    // Punctuation / case still count as a whole-word hit.
    expect(checkLeafValuePresence({ s: "approved" }, "Overall APPROVED. Good progress.").ok).toBe(true);
    expect(checkLeafValuePresence({ d: "fix" }, "disposition: fix, see line 3").ok).toBe(true);
    // Multi-word values keep substring matching.
    expect(
      checkLeafValuePresence({ summary: "off-by-one error" }, "Found off-by-one error here").ok
    ).toBe(true);
  });

  it("validates twice against freshly parsed copies of the same $id schema", async () => {
    // Step-runner JSON.parses the schema file on every call; the shared Ajv
    // instance must reuse the compiled validator instead of throwing
    // "schema with key or id ... already exists" on the second call.
    const parseSchema = () =>
      JSON.parse(
        JSON.stringify({
          $id: "https://factory.test/records-twice.schema.json",
          type: "object",
          required: ["status"],
          properties: { status: { type: "string" } },
          additionalProperties: false,
        })
      );
    const rawOutput = JSON.stringify({ status: "ok" });

    const first = await validateAndRepair({ rawOutput, schema: parseSchema() });
    expect(first.ok).toBe(true);

    const second = await validateAndRepair({ rawOutput, schema: parseSchema() });
    expect(second.ok).toBe(true);
  });

  it("review status allows only approved|changes_requested (no commented)", async () => {
    const schema = generateReviewSchema(["fix"]);
    const valid = await validateAndRepair({
      rawOutput: JSON.stringify({ status: "approved", summary: "s", suggestions: [] }),
      schema,
    });
    expect(valid.ok).toBe(true);
    const commented = await validateAndRepair({
      rawOutput: JSON.stringify({ status: "commented", summary: "s", suggestions: [] }),
      schema,
    });
    expect(commented.ok).toBe(false);
  });
});

describe("Orchestration step record done-ness and attempt derivation (§8.4, §12.2)", () => {
  let testRunsDir: string;

  beforeAll(() => {
    testRunsDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-orch-records-test-"));
  });

  afterAll(() => {
    fs.rmSync(testRunsDir, { recursive: true, force: true });
  });

  it("getNextStepAttempt returns 1 when no records exist", () => {
    expect(getNextStepAttempt(testRunsDir, "plan-review-1-1", 3)).toBe(1);
    expect(getNextStepAttempt(path.join(testRunsDir, "nonexistent"), "plan-review-1-1", 3)).toBe(1);
  });

  it("getNextStepAttempt increments attempt on rejected step", async () => {
    const recDir = path.join(testRunsDir, "001-plan-review-1-1-a1");
    fs.mkdirSync(recDir, { recursive: true });
    fs.writeFileSync(
      path.join(recDir, "meta.yaml"),
      yaml.stringify({ seq: 1, name: "plan-review-1-1", attempt: 1, status: "rejected" })
    );

    expect(getNextStepAttempt(testRunsDir, "plan-review-1-1", 3)).toBe(2);

    // Subsequent rejected attempt increments again
    const recDir2 = path.join(testRunsDir, "002-plan-review-1-1-a2");
    fs.mkdirSync(recDir2, { recursive: true });
    fs.writeFileSync(
      path.join(recDir2, "meta.yaml"),
      yaml.stringify({ seq: 2, name: "plan-review-1-1", attempt: 2, status: "rejected" })
    );

    expect(getNextStepAttempt(testRunsDir, "plan-review-1-1", 3)).toBe(3);
  });

  it("getNextStepAttempt does not count interrupted until maxInterruptions", () => {
    const stepDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-interrupted-test-"));
    try {
      // First interruption
      const r1 = path.join(stepDir, "001-arch-revise-1-1-a1");
      fs.mkdirSync(r1, { recursive: true });
      fs.writeFileSync(
        path.join(r1, "meta.yaml"),
        yaml.stringify({ seq: 1, name: "arch-revise-1-1", attempt: 1, status: "interrupted" })
      );
      expect(getNextStepAttempt(stepDir, "arch-revise-1-1", 3)).toBe(1);

      // Second interruption
      const r2 = path.join(stepDir, "002-arch-revise-1-1-a1");
      fs.mkdirSync(r2, { recursive: true });
      fs.writeFileSync(
        path.join(r2, "meta.yaml"),
        yaml.stringify({ seq: 2, name: "arch-revise-1-1", attempt: 1, status: "interrupted" })
      );
      expect(getNextStepAttempt(stepDir, "arch-revise-1-1", 3)).toBe(1);

      // Third interruption reaches maxInterruptions (3) -> increments attempt
      const r3 = path.join(stepDir, "003-arch-revise-1-1-a1");
      fs.mkdirSync(r3, { recursive: true });
      fs.writeFileSync(
        path.join(r3, "meta.yaml"),
        yaml.stringify({ seq: 3, name: "arch-revise-1-1", attempt: 1, status: "interrupted" })
      );
      expect(getNextStepAttempt(stepDir, "arch-revise-1-1", 3)).toBe(2);
    } finally {
      fs.rmSync(stepDir, { recursive: true, force: true });
    }
  });

  it("getNextStepAttempt does not consume attempt on harness error", () => {
    const stepDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-error-test-"));
    try {
      const r1 = path.join(stepDir, "001-step-err-a1");
      fs.mkdirSync(r1, { recursive: true });
      fs.writeFileSync(
        path.join(r1, "meta.yaml"),
        yaml.stringify({ seq: 1, name: "step-err", attempt: 1, status: "error" })
      );
      expect(getNextStepAttempt(stepDir, "step-err", 3)).toBe(1);
    } finally {
      fs.rmSync(stepDir, { recursive: true, force: true });
    }
  });

  it("findOkCommittedRecord finds ok record and reuses output", async () => {
    const stepDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-find-ok-test-"));
    try {
      expect(await findOkCommittedRecord(stepDir, "rev-1")).toBeNull();

      const r1 = path.join(stepDir, "001-rev-1-a1");
      fs.mkdirSync(r1, { recursive: true });
      fs.writeFileSync(
        path.join(r1, "meta.yaml"),
        yaml.stringify({ seq: 1, name: "rev-1", attempt: 1, status: "rejected" })
      );
      expect(await findOkCommittedRecord(stepDir, "rev-1")).toBeNull();

      const r2 = path.join(stepDir, "002-rev-1-a2");
      fs.mkdirSync(r2, { recursive: true });
      fs.writeFileSync(
        path.join(r2, "meta.yaml"),
        yaml.stringify({ seq: 2, name: "rev-1", attempt: 2, status: "ok", session: "sess-abc" })
      );
      fs.writeFileSync(
        path.join(r2, "output.yaml"),
        yaml.stringify({ status: "approved", summary: "Looks great" })
      );

      const found = await findOkCommittedRecord(stepDir, "rev-1");
      expect(found).not.toBeNull();
      expect(found?.name).toBe("rev-1");
      expect(found?.attempt).toBe(2);
      expect(found?.seq).toBe(2);
      expect(found?.meta.session).toBe("sess-abc");
      expect((found?.output as any)?.status).toBe("approved");
      expect((found?.output as any)?.summary).toBe("Looks great");
    } finally {
      fs.rmSync(stepDir, { recursive: true, force: true });
    }
  });
});

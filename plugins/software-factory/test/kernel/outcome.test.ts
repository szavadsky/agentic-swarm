import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expectationForStep,
  fencedOutcome,
  KERNEL_TURN_STEPS,
  parseOutcome,
  readDeliveredOutcome,
  validateExpectation,
} from "../../src/kernel/outcome.js";

describe("outcome delivery", () => {
  it("parses YAML and JSON with zod defaults", () => {
    expect(parseOutcome("status: done\nsummary: landed\n").concerns).toEqual(
      [],
    );
    const json = parseOutcome(
      '{"status":"blocked","summary":"missing key","forward":["ask owner"]}',
    );
    expect(json.status).toBe("blocked");
    expect(json.forward).toEqual(["ask owner"]);
  });

  it("rejects an invalid outcome with field findings", () => {
    expect(() => parseOutcome("status: nope\nsummary: x\n")).toThrow(/status/);
  });

  it("reads the retired continue route as a replace, and refuses unknown actions", () => {
    const legacy = parseOutcome(
      [
        "status: done",
        "summary: continued the park",
        "stallRoutes:",
        "  - slug: alpha",
        "    action: continue",
        "    reason: retry with direction",
      ].join("\n"),
    );
    expect(legacy.stallRoutes).toEqual([
      { slug: "alpha", action: "replace", reason: "retry with direction" },
    ]);
    expect(() =>
      parseOutcome(
        [
          "status: done",
          "summary: routed the park",
          "stallRoutes:",
          "  - slug: alpha",
          "    action: redo",
          "    reason: unknown",
        ].join("\n"),
      ),
    ).toThrow(/action/);
  });

  it("prefers the prompt-named file over a fenced block", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-outcome-"));
    const file = path.join(dir, "outcome.yaml");
    fs.writeFileSync(file, "status: done\nsummary: file\n");
    const delivered = readDeliveredOutcome(
      file,
      "```yaml\nstatus: done\nsummary: message\n```",
    );
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
    expect(
      validateExpectation(
        parseOutcome("status: failed\nsummary: x\n"),
        "review",
      ),
    ).toEqual([]);
  });

  it("refuses changes on the last review call", () => {
    const changes = parseOutcome(
      "status: done\nsummary: fixed\nverdict: changes\n",
    );
    expect(validateExpectation(changes, "review")).toEqual([]);
    expect(validateExpectation(changes, "review", { lastCall: false })).toEqual(
      [],
    );
    expect(validateExpectation(changes, "review", { lastCall: true })).toEqual([
      'verdict "changes" is not available on the last review call: approve with concerns, or reject',
    ]);
    expect(
      validateExpectation(
        parseOutcome("status: failed\nsummary: broke\nverdict: changes\n"),
        "review",
        { lastCall: true },
      ),
    ).toEqual([]);
  });

  it("maps steps to expectations from the flow catalog and kernel turn steps", () => {
    const flows = {
      "implement-review": {
        steps: [
          { id: "implement", prompt: "implementer", alias: "implementer" },
          {
            id: "review",
            prompt: "reviewer",
            alias: "reviewer",
            review: true,
            changeRequests: 2,
          },
        ],
      },
    };
    expect(expectationForStep(undefined, flows)).toBe("any");
    expect(expectationForStep("implement", flows)).toBe("any");
    expect(expectationForStep("review", flows)).toBe("review");
    expect(expectationForStep("architect", flows)).toBe("architect");
    expect(expectationForStep("pm", flows)).toBe("any");
    expect(expectationForStep("digest", flows)).toBe("any");
    expect(expectationForStep("planreview", flows)).toBe("any");
    expect(expectationForStep("plancheck", flows)).toBe("any");
    expect(expectationForStep("steward", flows)).toBe("any");
    expect(expectationForStep("front", flows)).toBe("any");
    expect(KERNEL_TURN_STEPS.architect).toBe("architect");
    expect(KERNEL_TURN_STEPS.pm).toBe("any");
  });

  it("fails loud on a step no flow configures", () => {
    expect(() => expectationForStep("reveiw", {})).toThrow(
      'step "reveiw" is not configured in the repo\'s flows',
    );
    expect(() => expectationForStep("merge-attempt", {})).toThrow(
      'step "merge-attempt" is not configured in the repo\'s flows',
    );
    expect(() => expectationForStep("debt", {})).toThrow(
      'step "debt" is not configured in the repo\'s flows',
    );
    expect(() => expectationForStep("constructor", {})).toThrow(
      'step "constructor" is not configured in the repo\'s flows',
    );
    expect(() => expectationForStep("toString", {})).toThrow(
      'step "toString" is not configured in the repo\'s flows',
    );
  });
});

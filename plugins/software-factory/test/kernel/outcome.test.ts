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
  registerOutcomeDeliveryPart1();
  registerOutcomeDeliveryPart2();
  registerOutcomeDeliveryPart3();
  registerOutcomeDeliveryPart4();
  registerOutcomeDeliveryPart5();
  registerOutcomeDeliveryPart6();
  registerOutcomeDeliveryPart7();
});

function registerOutcomeDeliveryPart1(): void {
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

  it("parses a steer route that names one architect", () => {
    const routed = parseOutcome(
      [
        "status: done",
        "summary: routed the steer",
        "steerRoutes:",
        "  - steer: s1",
        "    route:",
        "      architect: auth",
      ].join("\n"),
    );
    expect(routed.steerRoutes).toEqual([
      { steer: "s1", route: { architect: "auth" } },
    ]);
    expect(() =>
      parseOutcome(
        [
          "status: done",
          "summary: routed the steer",
          "steerRoutes:",
          "  - steer: s1",
          "    route:",
          '      architect: ""',
        ].join("\n"),
      ),
    ).toThrow(/route/);
  });
}

function registerOutcomeDeliveryPart2(): void {
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
}

function registerOutcomeDeliveryPart3(): void {
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
}

function registerOutcomeDeliveryPart4(): void {
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
}

function registerOutcomeDeliveryPart5(): void {
  it("refuses a debtClosed id that no ingested concern has", () => {
    const records = [
      {
        seq: 1,
        iteration: 1,
        slug: "a",
        step: "review",
        round: 1,
        actor: "agent" as const,
        startedAt: new Date(0).toISOString(),
        outcome: {
          status: "done" as const,
          summary: "approved with debt",
          concerns: [
            {
              kind: "debt" as const,
              calibration: "architect" as const,
              text: "cache invalidation needs a follow-up task",
              id: "00001-i1-a-review-r1#1",
            },
          ],
          forward: [],
        },
      },
    ];
    const close = (id: string) =>
      parseOutcome(
        `status: done\nsummary: closed\ndecision: continue\ndebtClosed: [{id: ${JSON.stringify(id)}, reason: "shim removed"}]\n`,
      );

    expect(
      validateExpectation(close("00001-i1-a-review-r1#1"), "architect", {
        records,
      }),
    ).toEqual([]);
    // The id names no ingested debt concern: the close would be a silent no-op.
    expect(
      validateExpectation(close("00001-i1-a-review-r1#9"), "architect", {
        records,
      }),
    ).toEqual([
      "unknown debt id: 00001-i1-a-review-r1#9: no ingested debt concern has that id",
    ]);
    // The outcome's own record is in the tree once it is written, but its
    // concerns get their ids at ingest: a debt cannot be closed before it is
    // recorded, so the current record's ids stay unknown.
    expect(
      validateExpectation(close("00001-i1-a-review-r1#1"), "architect", {
        records,
        excludeRecordId: "00001-i1-a-review-r1",
      }),
    ).toEqual([
      "unknown debt id: 00001-i1-a-review-r1#1: no ingested debt concern has that id",
    ]);
    // Without records the id cannot be resolved, so only the step contract runs.
    expect(validateExpectation(close("anything"), "architect")).toEqual([]);
  });
}

function registerOutcomeDeliveryPart6(): void {
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
}

function registerOutcomeDeliveryPart7(): void {
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
}

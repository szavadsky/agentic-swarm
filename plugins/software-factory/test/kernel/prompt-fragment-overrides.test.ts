import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { loadConfigs, packageRoot } from "../../src/kernel/config.js";
import type { TurnTarget } from "../../src/kernel/flow-context.js";
import { resumeNote } from "../../src/kernel/flow-context-sessions.js";
import type { Steer } from "../../src/kernel/mailbox.js";
import { mergeConflictAsk } from "../../src/kernel/merge-conflict.js";
import {
  planCheckLadderNote,
  pmLadderNote,
  stallLadderNote,
  steerInjectionNote,
  steerLadderNote,
} from "../../src/kernel/pm/prompts.js";
import { dryRunPrompts } from "../../src/kernel/prompt-dry-run.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { sagaReminderVar } from "../../src/kernel/saga-reminder.js";

const OVERRIDDEN_FRAGMENTS = [
  "bootstrap-assignment",
  "digest-steer",
  "gate-last-call",
  "merge-conflict",
  "pm-ladder",
  "pm-steer-inject",
  "resume",
  "saga-reminder",
  "standalone-upscope",
] as const;

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-fragment-overrides-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeOverride(name: string, body: string): void {
  const dir = path.join(root, ".factory/prompts");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), body, "utf8");
}

describe("prompt fragment overrides", () => {
  it("honours repo overrides for every kernel and CLI prompt fragment", () => {
    for (const name of OVERRIDDEN_FRAGMENTS) {
      writeOverride(name, `custom-${name}-marker\n`);
    }

    const configs = loadConfigs(root);
    const renders = new Map(
      dryRunPrompts(configs, root).map((render) => [render.name, render.text]),
    );
    for (const name of OVERRIDDEN_FRAGMENTS) {
      expect(renders.get(name)).toContain(`custom-${name}-marker`);
    }

    const prompts = loadPrompts(configs.process, root);
    const target: TurnTarget = {
      prompt: "pm",
      alias: "pm-strong",
      harness: new FakeHarness({ id: "fake" }),
      model: { id: "m1" },
      tiers: [],
      tierOffset: 0,
    };
    expect(
      pmLadderNote(
        prompts,
        { alias: "pm-strong", mandate: "escalated-first" },
        target,
        [],
      ),
    ).toBe("custom-pm-ladder-marker");
    const steer: Steer = {
      id: "s1",
      file: "001-s1.md",
      relPath: "mailbox/inbox/001-s1.md",
      text: "recheck api",
      hash: "abc123",
      urgent: false,
    };
    expect(steerInjectionNote(prompts, steer)).toBe(
      "custom-pm-steer-inject-marker",
    );
    expect(mergeConflictAsk(prompts, "abcdef123456", ["a.ts"])).toBe(
      "custom-merge-conflict-marker",
    );
    expect(sagaReminderVar(prompts, 25, 20)).toBe(
      "custom-saga-reminder-marker\n\n",
    );
    expect(resumeNote(prompts, "relaunch", { branch: "feat/x" })).toBe(
      "\ncustom-resume-marker",
    );
    expect(packageRoot.length).toBeGreaterThan(0);
  });
});

function sampleTarget(): TurnTarget {
  return {
    prompt: "pm",
    alias: "pm-strong",
    harness: new FakeHarness({ id: "fake" }),
    model: { id: "m1" },
    tiers: [],
    tierOffset: 0,
  };
}

describe("pm-ladder modes", () => {
  it("renders plan and steer contracts from prompts/pm-ladder.md", () => {
    const prompts = loadPrompts(loadConfigs(packageRoot).process, packageRoot);
    const target = sampleTarget();
    const planText = pmLadderNote(
      prompts,
      { alias: "pm-strong", mandate: "escalated-retry" },
      target,
      ["missing task"],
    );
    expect(planText).toContain("The PM ladder escalated to alias");
    expect(planText).toContain("derive the task files from the plan again");
    expect(planText).toContain("This is a fresh retry on alias");
    expect(planText).toContain("Restated PM contract:");
    expect(planText).toContain("Write task files under the tasks directory");
    expect(planText).toContain("Findings:\n- missing task");

    const steerText = steerLadderNote(
      prompts,
      { alias: "pm-strong", mandate: "escalated-first" },
      target,
      [],
    );
    expect(steerText).toContain("route the steers again from their text");
    expect(steerText).toContain("Restated PM steer contract:");
    expect(steerText).toContain("Route each pending steer");
  });

  it("renders stall and plan-check contracts from prompts/pm-ladder.md", () => {
    const prompts = loadPrompts(loadConfigs(packageRoot).process, packageRoot);
    const target = sampleTarget();
    const stallText = stallLadderNote(
      prompts,
      { alias: "pm-strong", mandate: "retry" },
      target,
      [],
    );
    expect(stallText).toContain("This is a fresh retry on alias");
    expect(stallText).toContain("Restated PM stall contract:");
    expect(stallText).toContain("Route every parked slug in stallRoutes");

    const planCheckText = planCheckLadderNote(
      prompts,
      { alias: "pm-strong", mandate: "escalated-first" },
      target,
      ["unfixed item"],
    );
    expect(planCheckText).toContain(
      "route the checker's follow-ups again from their brief",
    );
    expect(planCheckText).toContain("Restated PM plan-check contract:");
    expect(planCheckText).toContain("Route every follow-up in planCheckRoutes");
    expect(planCheckText).toContain("Findings:\n- unfixed item");
  });
});

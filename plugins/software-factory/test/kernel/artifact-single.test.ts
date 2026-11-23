import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  stateOf,
  writeTask,
} from "./e2e-helpers.js";

const PLAN = `# Milestone 1

## probe
Spike the probe question; the answer is a report.
Keep the finding short.
Done when: the finding is written.
`;

const SPIKE = `---
slug: probe
title: Probe the question
kind: spike
flow: spike
deps: []
scope: [probe]
source: Milestone 1 / probe
---

Answer the probe question.

Done when: the finding is written.
`;

const REPORT = "# Finding\nA probe answer.\n";
const STEER = "Keep the finding short.\n";
const SUMMARY = "iterations/1/summary.md";

/** Every non-blank file under the goal's artifact directory, by relative path. */
function artifactTexts(goalDir: string): Array<{ rel: string; text: string }> {
  const out: Array<{ rel: string; text: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const text = fs.readFileSync(full, "utf8");
        // A blank file carries no content that could appear twice.
        if (text.trim() !== "")
          out.push({ rel: path.relative(goalDir, full), text });
      }
    }
  };
  walk(goalDir);
  return out;
}

/** Groups of artifact paths that carry byte-identical content. */
function duplicateContents(goalDir: string): string[] {
  const groups = new Map<string, string[]>();
  for (const { rel, text } of artifactTexts(goalDir)) {
    const hash = createHash("sha256").update(text).digest("hex");
    groups.set(hash, [...(groups.get(hash) ?? []), rel]);
  }
  return [...groups.values()]
    .filter((paths) => paths.length > 1)
    .map((paths) => paths.sort().join(" == "))
    .sort();
}

function readGoal(goalDir: string, rel: string): string {
  return fs.readFileSync(path.join(goalDir, rel), "utf8");
}

describe("artifact single location", () => {
  it("writes no artifact content at two paths in one iteration with a spike and a steer", async () => {
    const goal = makeGoal();
    try {
      const scope1 = await writesNoArtifactContentAtTwoPathsPart1(goal);
      await writesNoArtifactContentAtTwoPathsPart2(goal, scope1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

async function writesNoArtifactContentAtTwoPathsPart1(
  goal: ReturnType<typeof makeGoal>,
) {
  const store = createFolderStore(goal.goalDir, undefined, {});
  await store.ensureLayout();
  await postSteer(store, "s1", STEER);

  const harness = new FakeHarness({ id: "fake" });
  // No plan before launch: no PM steer turn; the architect edits the plan
  // (the steer's constraint) and answers the steer.
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("Keep the finding short");
    fs.writeFileSync(goal.planPath, PLAN, "utf8");
    ctx.writeOutcome(
      outcome({
        summary: "answered the steer",
        decision: "continue",
        forward: ["steer s1: short it is"],
      }),
    );
    return fakeTurnResult(req);
  });
  // PM: files the plan's one spike as a task.
  harness.script((req, ctx) => {
    writeTask(goal.goalDir, SPIKE);
    ctx.writeOutcome(outcome({ summary: "filed the probe spike" }));
    return fakeTurnResult(req);
  });
  // Spike implement: the report lands in the worktree, and the checks step
  // commits it as the spike's only copy.
  harness.script((req, ctx) => {
    const file = path.join(req.cwd!, spikeReportPath("probe"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, REPORT, "utf8");
    ctx.writeOutcome(outcome({ summary: "wrote the finding" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "finding holds", verdict: "approve" }));
    return fakeTurnResult(req);
  });

  // One full iteration: the boundary answers the steer, the spike commits
  // its report and finishes; the goal keeps running for a second iteration.
  await expectLaunch(3, goal.repo, harness);

  expect((await stateOf(goal.goalDir)).tasks.probe!.status).toBe("finished");
  const finish = (await store.listRecords()).find(
    (record) => record.step === "finish" && record.slug === "probe",
  )!;

  return { finish };
}

async function writesNoArtifactContentAtTwoPathsPart2(
  goal: ReturnType<typeof makeGoal>,
  scope: Awaited<ReturnType<typeof writesNoArtifactContentAtTwoPathsPart1>>,
) {
  const { finish } = scope;
  expect(finish.report).toBe(`${finish.commit}:${spikeReportPath("probe")}`);
  expect(fs.existsSync(path.join(goal.goalDir, "finish/probe/report.md"))).toBe(
    false,
  );
  expect(
    fs.existsSync(path.join(goal.goalDir, "mailbox/processed/s1.md")),
  ).toBe(true);
  expect(readGoal(goal.goalDir, "mailbox/outbox/steer-s1.md")).toContain(
    "short it is",
  );

  // The outbox entries reference the one copy instead of repeating it.
  expect(readGoal(goal.goalDir, SUMMARY)).toContain("- spikes finished: probe");
  expect(readGoal(goal.goalDir, "mailbox/outbox/iteration-1-summary.md")).toBe(
    `${SUMMARY}\n`,
  );
  expect(readGoal(goal.goalDir, "metrics.yaml")).toContain("totals:");
  expect(readGoal(goal.goalDir, "mailbox/outbox/metrics.yaml")).toBe(
    "metrics.yaml\n",
  );

  expect(duplicateContents(goal.goalDir)).toEqual([]);
}

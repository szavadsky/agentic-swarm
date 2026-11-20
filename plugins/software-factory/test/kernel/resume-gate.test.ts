// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { expectDispatch } from "./e2e-helpers.js";
import {
  digestTaskTurn,
  drainedAfterAlpha,
  outcome,
  queueDigestSteer,
  silenceWarn,
} from "./resume-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";
import { causeText } from "./helpers.js";

const RUN = (iterations: string) => [
  "run",
  "--repo",
  "",
  "--goal",
  "demo",
  "--iterations",
  iterations,
];

function args(repoDir: string, iterations: string): string[] {
  const out = RUN(iterations);
  out[2] = repoDir;
  return out;
}

function stillGoing(harness: FakeHarness, turns: number): FakeHarness {
  for (let i = 0; i < turns; i++) {
    harness.script((req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "still going", decision: "continue" }),
      );
      return fakeTurnResult(req);
    });
  }
  return harness;
}

describe("resume gate — recorded, bounded attempts", () => {
  it("delta state: refuses the resume with a cause, runs the boundary in-launch, never re-resumes", async () => {
    const { repo, goalDir } = await drainedAfterAlpha();
    const restoreWarn = silenceWarn();
    try {
      const store = createFolderStore(goalDir, undefined, {});
      // Delta's stuck state: iteration 1 interrupted with beta ready, beta
      // held by a pending steer, and the iteration's latest plan-check is
      // architect.
      await postSteer(store, "s1", "Hold beta until the architect looks.");
      fs.mkdirSync(path.join(goalDir, "mailbox/holds"), { recursive: true });
      fs.writeFileSync(
        path.join(goalDir, "mailbox/holds/s1.yaml"),
        "slugs: [beta]\ngoal: false\n",
        "utf8",
      );
      await store.appendRecord(
        { iteration: 1, step: "plancheck", round: 1, actor: "agent" },
        {
          ok: true,
          outcome: {
            status: "done",
            summary: "plan needs the architect",
            concerns: [],
            forward: [],
            planCheck: { verdict: "architect", evidence: [], followUps: [] },
          },
        },
      );
      const before = derive(await store.listTasks(), await store.listRecords());
      expect(before.interrupted).toBe(true);
      expect(before.iteration).toBe(1);
      expect(before.tasks.beta!.status).toBe("ready");

      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
      stillGoing(second, 4);
      await expectDispatch(3, args(repo.dir, "1"), {
        harnesses: { fake: second },
      });

      const records = await store.listRecords();
      const refused = records.filter((r) => r.step === "resume-refused");
      expect(refused).toHaveLength(1);
      expect(refused[0]!.iteration).toBe(1);
      expect(causeText(refused[0]!.cause)).toContain("architect");
      expect(records.some((r) => r.step === "resume")).toBe(false);
      // The front turn is skipped (plan.md exists): the boundary runs at
      // iteration 2 within the same launch, which has a budget of one pass.
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.iteration === 1 && r.slug === "beta"),
      ).toHaveLength(0);

      // A second launch stands on iteration 2: iteration 1 is never resumed.
      const third = new FakeHarness({ id: "fake" });
      queueDigestSteer(third);
      stillGoing(third, 4);
      await expectDispatch(3, args(repo.dir, "1"), {
        harnesses: { fake: third },
      });
      const after = await store.listRecords();
      expect(
        after.filter((r) => r.step === "resume" && r.iteration === 1),
      ).toHaveLength(0);
      expect(
        after.filter((r) => r.step === "resume-refused" && r.iteration === 1),
      ).toHaveLength(1);
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);

  it("a healthy resume records its attempt and, when its plan-check summons the architect, does not consume the pass budget", async () => {
    const { repo, goalDir, taskDir } = await drainedAfterAlpha();
    const restoreWarn = silenceWarn();
    try {
      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second, digestTaskTurn(taskDir, "beta"));
      second.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta added" }));
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "needs the architect",
            planCheck: { verdict: "architect", evidence: [], followUps: [] },
          }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });
      // One pass of budget: the resume does not count, so the boundary runs.
      await expectDispatch(0, args(repo.dir, "1"), {
        harnesses: { fake: second },
      });

      const store = createFolderStore(goalDir, undefined, {});
      const records = await store.listRecords();
      const resumes = records.filter((r) => r.step === "resume");
      expect(resumes).toHaveLength(1);
      expect(resumes[0]!.iteration).toBe(1);
      expect(resumes[0]!.outcome?.summary).toBe(
        "resume attempt 1 of iteration 1",
      );
      expect(records.some((r) => r.step === "resume-refused")).toBe(false);
      expect(
        records
          .filter((r) => r.slug === "beta")
          .every((r) => r.iteration === 1),
      ).toBe(true);
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ),
      ).toHaveLength(1);
      expect(derive(await store.listTasks(), records).goal).toBe("done");
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);
});

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  launch,
  makeGoal,
  outcome,
  scriptDigest,
  simpleTask,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";

import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

describe("boundary context pack", () => {
  it("writes the pack where the architect record measures it", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(
          outcome({ summary: "planned nothing yet", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      await launch(goal.repo, harness);

      const records = await createFolderStore(goal.goalDir).listRecords();
      const architect = records.find((r) => r.step === "architect");
      expect(architect).toBeDefined();
      const packPath = path.join(goal.goalDir, contextPackRelPath(1));
      const written = fs.readFileSync(packPath);
      expect(written.length).toBeGreaterThan(0);
      expect(architect?.packBytes).toBe(written.length);
      const pack = fs.readFileSync(packPath, "utf8");
      expect(pack).toContain(
        `- run config: ${path.join(goal.repo.dir, ".factory/run.yaml")}`,
      );
      expect(pack).toContain("## Open records (started, no end)\n- none");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("never truncates the status table with a hundred parked tasks", async () => {
    const goal = makeGoal();
    try {
      const store = createFolderStore(goal.goalDir);
      const slugs: string[] = [];
      for (let i = 0; i < 100; i++) {
        const slug = `bulk-${String(i).padStart(3, "0")}`;
        slugs.push(slug);
        writeTask(goal.goalDir, simpleTask(slug, `${slug}.txt`));
        await store.appendRecord(scriptMeta(1, "park", { slug }), {
          ok: true,
          cause: "seeded terminal for pack size",
        });
      }
      const harness = new FakeHarness({ id: "fake" });
      scriptDigest(harness, goal.goalDir, 2);
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(
          outcome({ summary: "planned nothing yet", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      await launch(goal.repo, harness);

      const records = await createFolderStore(goal.goalDir).listRecords();
      const architect = records.find((r) => r.step === "architect");
      expect(architect).toBeDefined();
      const pack = fs.readFileSync(
        path.join(goal.goalDir, contextPackRelPath(architect!.iteration)),
        "utf8",
      );
      expect(pack.length).toBeGreaterThan(8000);
      for (const slug of slugs) expect(pack).toContain(`| ${slug} |`);
      expect(pack).toContain(
        `- plan (architect edits this): ${path.join(goal.goalDir, "plan.md")}`,
      );
      expect(pack).toContain(
        `- intent: ${path.join(goal.goalDir, "intent.md")}`,
      );
      expect(pack).toContain(
        `- previous-launch digest: ${path.join(goal.goalDir, "iterations/2/digest.md")}`,
      );
      expect(pack).toContain(
        "## Debt register (debt-kind concerns; drill into the source records)\n- none recorded",
      );
      expect(pack).toContain("## Open records (started, no end)\n- none");
      expect(pack).toContain(
        `- run config: ${path.join(goal.repo.dir, ".factory/run.yaml")}`,
      );
      expect(architect?.packBytes).toBe(Buffer.byteLength(pack, "utf8"));
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("lists started-without-end records as open and names the run config", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        PLAN,
        "utf8",
      );
      const closed = await runtime.store.startRecord({
        iteration: 1,
        slug: "alpha",
        step: "implement",
        round: 1,
        actor: "agent",
      });
      await closed.finish({ ok: true });
      const open = await runtime.store.startRecord({
        iteration: 1,
        slug: "beta",
        step: "implement",
        round: 1,
        actor: "agent",
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "planned nothing yet", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      const runPath = runtime.configs.files?.run;
      expect(runPath).toBe(path.join(repo.dir, ".factory/run.yaml"));
      const boundary = await runBoundary(runtime, {
        relaunch: false,
        runConfigPath: runPath,
      });
      expect(boundary.decision).toBe("continue");
      const packRel = contextPackRelPath(boundary.iteration);
      expect(boundary.packPath).toBe(packRel);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, packRel),
        "utf8",
      );
      expect(pack).toContain(`- ${open.dir}`);
      expect(pack).not.toContain(closed.dir);
      expect(pack).toContain(`- run config: ${runPath}`);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("lists legacy records whose end.yaml still carries packTruncated", async () => {
    const goal = makeGoal();
    try {
      const store = createFolderStore(goal.goalDir);
      const turn = await store.startRecord({
        iteration: 1,
        slug: "alpha",
        step: "architect",
        round: 1,
        actor: "agent",
      });
      await turn.finish({ packBytes: 782 });
      // Pre-uncap records committed end.yaml with the retired flag; listRecords
      // must neither throw on nor drop the unknown key.
      const endPath = path.join(turn.dir, "end.yaml");
      const raw = fs.readFileSync(endPath, "utf8");
      fs.writeFileSync(
        endPath,
        `${raw + (raw.endsWith("\n") ? "" : "\n")}packTruncated: true\n`,
        "utf8",
      );
      const records = await store.listRecords();
      expect(records.length).toBe(1);
      const [record] = records;
      expect(record?.packBytes).toBe(782);
      expect(
        (record as unknown as { packTruncated?: unknown })?.packTruncated,
      ).toBe(true);
    } finally {
      cleanup(goal);
    }
  });
});

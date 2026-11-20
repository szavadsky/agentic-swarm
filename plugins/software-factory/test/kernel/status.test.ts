import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { statusGoal } from "../../src/cli/commands.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { Usage } from "../../src/harness/types.js";
import {
  DASHBOARD_REL_PATH,
  renderDashboard,
} from "../../src/kernel/dashboard.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  buildStatus,
  readStatus,
  renderStatus,
  STATUS_REL_PATH,
  writeStatus,
} from "../../src/kernel/status.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { RecordStart } from "../../src/kernel/types.js";
import { testPriceSource } from "../helpers/price-source.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

function usage(costUsd: number, input: number, output: number): Usage {
  return {
    in: input,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: output,
    reasoningOut: 0,
    costUsd,
  };
}

const AGENT: RecordStart = {
  iteration: 1,
  step: "implement",
  round: 1,
  actor: "agent",
  alias: "implementer",
  model: { id: "fake" },
};

const SCRIPT: RecordStart = {
  ...AGENT,
  actor: "script",
  alias: undefined,
  model: undefined,
};

async function writeTasks(
  store: ReturnType<typeof createFolderStore>,
): Promise<void> {
  await store.writeTask(task("merged1", { title: "Merge one", epic: "core" }));
  await store.writeTask(task("parked1"));
  await store.writeTask(task("open1"));
  await store.writeTask(task("pending1", { deps: ["parked1"] }));
  await store.writeTask(task("spike1", { kind: "spike" }));
}

async function writeArchitect(
  store: ReturnType<typeof createFolderStore>,
): Promise<void> {
  await store.appendRecord(
    { ...AGENT, step: "architect", alias: "architect" },
    {
      usage: usage(0.1, 100, 50),
      outcome: {
        status: "done",
        summary: "planned",
        concerns: [
          {
            kind: "risk",
            calibration: "owner",
            text: "owner must confirm the API",
            evidence: "plan.md",
          },
        ],
        forward: [],
      },
    },
  );
}

async function writeMergedTask(
  store: ReturnType<typeof createFolderStore>,
): Promise<void> {
  await store.appendRecord(
    { ...AGENT, slug: "merged1", step: "implement" },
    {
      usage: usage(0.5, 1000, 200),
      edits: { files: 2, added: 10, removed: 3 },
      outcome: {
        status: "done",
        summary: "implemented",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "cache invalidation needs a follow-up",
            evidence: "src/cache.ts",
          },
        ],
        forward: [],
      },
    },
  );
  await store.appendRecord(
    { ...SCRIPT, step: "merge", slug: "merged1" },
    { ok: true, commit: "abc123" },
  );
}

async function writeTerminalTasks(
  store: ReturnType<typeof createFolderStore>,
): Promise<void> {
  await store.appendRecord(
    { ...SCRIPT, step: "park", slug: "parked1" },
    { ok: true, cause: { kind: "review-rejected", detail: "missing test" } },
  );
  await store.appendRecord(
    { ...SCRIPT, step: "finish", slug: "spike1" },
    { ok: true, commit: "def456" },
  );
}

/** A goal with one merged task, one parked task, one ready and one blocked. */
async function fixtureStore(): Promise<{
  root: string;
  store: ReturnType<typeof createFolderStore>;
  status: ReturnType<typeof buildStatus>;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-status-"));
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  await store.ensureLayout();
  await writeTasks(store);
  await writeArchitect(store);
  await writeMergedTask(store);
  await writeTerminalTasks(store);
  const tasks = await store.listTasks();
  const records = await store.listRecords();
  const status = buildStatus({
    goal: "demo",
    state: derive(tasks, records),
    tasks,
    records,
    updatedAt: "2026-01-02T03:04:05.000Z",
  });
  return { root, store, status };
}

describe("status tasks and distance", () => {
  it("groups tasks, names distance and keeps the epic grouping", async () => {
    const { root, status } = await fixtureStore();
    try {
      expect(status.goal).toBe("demo");
      expect(status.status).toBe("active");
      expect(status.iteration).toBe(1);
      expect(status.iterations).toBe(1);
      expect(status.updatedAt).toBe("2026-01-02T03:04:05.000Z");

      expect(status.tasks.open.map((t) => t.slug)).toEqual([
        "open1",
        "pending1",
      ]);
      expect(status.tasks.merged.map((t) => t.slug)).toEqual(["merged1"]);
      expect(status.tasks.parked.map((t) => t.slug)).toEqual(["parked1"]);
      expect(status.tasks.finished.map((t) => t.slug)).toEqual(["spike1"]);
      expect(status.tasks.cancelled).toEqual([]);
      const merged = status.tasks.merged[0]!;
      expect(merged).toMatchObject({
        title: "Merge one",
        epic: "core",
        commit: "abc123",
        record: "records/00003-i1-merged1-merge-r1",
      });

      expect(status.distance.pending).toEqual(["open1", "pending1"]);
      expect(status.distance.parks).toEqual(["parked1"]);
      expect(status.epics).toEqual({ core: ["merged1"] });

      const text = renderStatus(status);
      expect(text.endsWith("\n")).toBe(true);
      expect(JSON.parse(text)).toEqual(status);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("status concerns and metrics", () => {
  it("lists open debt with its record and cost and work by role and model", async () => {
    const { root, status } = await fixtureStore();
    try {
      const debt = {
        id: "00002-i1-merged1-implement-r1#1",
        text: "cache invalidation needs a follow-up",
        evidence: "src/cache.ts",
        calibration: "architect" as const,
        source: "merged1 implement r1",
        iteration: 1,
        record: "records/00002-i1-merged1-implement-r1",
      };
      expect(status.distance.openDebt).toEqual([debt]);
      expect(status.concerns.map((c) => c.record)).toEqual([
        "records/00001-i1-architect-r1",
        "records/00002-i1-merged1-implement-r1",
      ]);
      expect(status.concerns[0]).toMatchObject({
        id: "00001-i1-architect-r1#1",
        kind: "risk",
        calibration: "owner",
      });

      expect(status.cost.totalUsd).toBeCloseTo(0.6, 10);
      expect(status.cost.unpricedTurns).toBe(0);
      expect(status.cost.perMergedTask).toBeCloseTo(0.6, 10);
      expect(status.cost.byRole.architect).toEqual({
        turns: 1,
        tokens: 150,
        costUsd: 0.1,
        unpricedTurns: 0,
      });
      expect(status.cost.byRole.implementer!.costUsd).toBeCloseTo(0.5, 10);
      expect(status.cost.byModel.fake!.costUsd).toBeCloseTo(0.6, 10);

      expect(status.work.turns).toBe(2);
      expect(status.work.edits).toBe(2);
      expect(status.work.byRole.implementer).toEqual({
        turns: 1,
        edits: 2,
        addedLines: 10,
        removedLines: 3,
        testRuns: 0,
      });
      expect(status.work.byModel.fake!.edits).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("status file", () => {
  it("writes the file readStatus returns and rejects a corrupt one", async () => {
    const { root, store } = await fixtureStore();
    try {
      const written = await writeStatus({
        store,
        flows: {},
        priceSource: {
          cachePath: path.join(root, "no-prices.json"),
          fetchModels: async () => {
            throw new Error("prices disabled in test");
          },
        },
      });
      expect(written).toBe(STATUS_REL_PATH);
      const stored = await readStatus(store);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      const slugs = (tasks: { slug: string }[]) => tasks.map((t) => t.slug);
      expect(slugs(parsed.tasks.merged)).toEqual(["merged1"]);
      expect(parsed.epics).toEqual({ core: ["merged1"] });
      expect(parsed.cost.totalUsd).toBeCloseTo(0.6, 10);

      const file = path.join(store.goalDir, STATUS_REL_PATH);
      expect(fs.readFileSync(file, "utf8")).toBe(stored!);

      const dashboard = fs.readFileSync(
        path.join(store.goalDir, DASHBOARD_REL_PATH),
        "utf8",
      );
      expect(dashboard).toBe(renderDashboard(parsed));
      expect(dashboard).toContain("Merge one");
      expect(dashboard).toContain('href="records/00003-i1-merged1-merge-r1/"');

      fs.writeFileSync(file, "{not json", "utf8");
      await expect(readStatus(store)).rejects.toThrow(
        `${file} is not valid JSON`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

interface StatusSnapshot {
  tasks: {
    open: { slug: string; turns: number }[];
    merged: { slug: string }[];
  };
  cost: { totalUsd: number | null };
  work: { turns: number };
}

function snapshot(text: string): StatusSnapshot {
  return JSON.parse(text) as StatusSnapshot;
}

describe("status before the kernel runs", () => {
  it("derives --json output when no launch has written status.json", async () => {
    const repo = createTmpRepo();
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\n",
      );
      const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
      fs.mkdirSync(goalDir, { recursive: true });

      const plain = await statusGoal(repo.dir, "demo");
      expect(plain.statusJson).toBeUndefined();

      const json = await statusGoal(repo.dir, "demo", {
        json: true,
        priceSource: testPriceSource(repo.dir),
      });
      const parsed = JSON.parse(json.statusJson!);
      expect(parsed.goal).toBe("demo");
      expect(parsed.status).toBe("active");
      expect(parsed.tasks.open).toEqual([]);
      expect(parsed.distance).toEqual({ pending: [], parks: [], openDebt: [] });
      expect(parsed.epics).toBeUndefined();
      expect(parsed.cost).toEqual({
        totalUsd: null,
        unpricedTurns: 0,
        perMergedTask: null,
        byRole: {},
        byModel: {},
      });
      expect(fs.existsSync(path.join(goalDir, STATUS_REL_PATH))).toBe(false);
      expect(fs.existsSync(path.join(goalDir, DASHBOARD_REL_PATH))).toBe(false);
    } finally {
      repo.cleanup();
    }
  });
});

describe("status refresh points", () => {
  it("rewrites the snapshot and dashboard after an agent launch and after its finish", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const launched: { json: string; dashboard: string }[] = [];
      const capture = () =>
        launched.push({
          json: fs.readFileSync(path.join(goalDir, STATUS_REL_PATH), "utf8"),
          dashboard: fs.readFileSync(
            path.join(goalDir, DASHBOARD_REL_PATH),
            "utf8",
          ),
        });
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        capture();
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req, { usage: usage(0.01, 10, 5) });
      });
      harness.script((req, ctx) => {
        capture();
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req, { usage: usage(0.02, 20, 5) });
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(launched).toHaveLength(2);
      const atImplement = logLaunch(launched[0]!.json);
      expect(atImplement).toEqual({ open: ["task"], turns: 0, merged: [] });
      const atReview = logLaunch(launched[1]!.json);
      expect(atReview).toEqual({ open: ["task"], turns: 1, merged: [] });
      for (const atLaunch of launched) {
        expect(atLaunch.dashboard).toBe(
          renderDashboard(JSON.parse(atLaunch.json)),
        );
      }

      const finishedJson = fs.readFileSync(
        path.join(goalDir, STATUS_REL_PATH),
        "utf8",
      );
      const finished = snapshot(finishedJson);
      expect(finished.tasks!.open[0]!.turns).toBe(2);
      expect(finished.cost!.totalUsd).toBeCloseTo(0.03, 10);
      expect(finished.work!.turns).toBe(2);
      expect(
        fs.readFileSync(path.join(goalDir, DASHBOARD_REL_PATH), "utf8"),
      ).toBe(renderDashboard(JSON.parse(finishedJson)));
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

function logLaunch(text: string): {
  open: string[];
  turns: number;
  merged: string[];
} {
  const parsed = snapshot(text);
  return {
    open: parsed.tasks!.open.map((t) => t.slug),
    turns: parsed.tasks!.open[0]!.turns,
    merged: parsed.tasks!.merged.map((t) => t.slug),
  };
}

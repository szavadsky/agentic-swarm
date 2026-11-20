import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireRunLock } from "../../src/cli/lock.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { runGoal } from "../../src/kernel/launch.js";
import {
  holdsDir,
  quarantineDir,
  readHolds,
  sweepHolds,
} from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { testPriceSource } from "../helpers/price-source.js";
import { cleanup, expectDispatch, makeGoal, outcome } from "./e2e-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { drainedAfterAlpha, queueDigestSteer } from "./resume-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";
import { causeText } from "./helpers.js";

const MALFORMED = "slugs: [unclosed\n";
const UNKNOWN_SLUG = "slugs: [ghost]\ngoal: false\n";
const VALID = "slugs: [alpha]\ngoal: false\n";

function writeHold(dir: string, name: string, text: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), text, "utf8");
}

/** Every path under the mailbox with its bytes: equal snapshots mean byte-identical. */
function snapshot(dir: string): Record<string, string | null> {
  if (!fs.existsSync(dir)) return {};
  const out: Record<string, string | null> = {};
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const full = path.join(dir, rel);
    out[rel] = fs.statSync(full).isDirectory()
      ? null
      : fs.readFileSync(full, "utf8");
  }
  return out;
}

function holdQuarantineRecords(
  records: Awaited<
    ReturnType<ReturnType<typeof createFolderStore>["listRecords"]>
  >,
) {
  return records.filter((r) => r.step === "hold-quarantine");
}

describe("hold read pure", () => {
  registerHoldReadPurePart1();
  registerHoldReadPurePart2();
  registerHoldReadPurePart3();
  registerHoldReadPurePart4();
});

async function runSweepsBothHoldsExactlyOnceOnlyPart1(
  goal: ReturnType<typeof makeGoal>,
) {
  const store = createFolderStore(goal.goalDir, undefined, {});
  const dir = holdsDir(store);
  writeHold(dir, "s1.yaml", MALFORMED);
  writeHold(dir, "s2.yaml", UNKNOWN_SLUG);
  const before = snapshot(dir);

  const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "nothing to plan", decision: "done" }));
    return fakeTurnResult(req);
  });
  const run = () =>
    runGoal({
      repo: goal.repo.dir,
      goal: "demo",
      iterations: 1,
      harnesses: { fake: harness },
      baseGates: false,
      priceSource: testPriceSource(goal.repo.dir),
    });

  // Another live holder of the run lock: the launch refuses and sweeps nothing.
  const configs = loadConfigs(goal.repo.dir, { iterations: 1 });
  const paths = resolveGoalPaths(configs, goal.repo.dir, "demo");
  const held = acquireRunLock(goal.repo.dir, "goal-demo", {
    runtimeDir: path.join(paths.worktreeRoot, ".factory-runtime"),
  });
  expect(held).not.toBeNull();
  try {
    await expect(run()).rejects.toThrow(/already running/);
  } finally {
    held?.release();
  }
  expect(snapshot(dir)).toEqual(before);
  expect(fs.existsSync(quarantineDir(store))).toBe(false);
  expect(holdQuarantineRecords(await store.listRecords())).toEqual([]);

  await run();

  expect(fs.readdirSync(dir)).toEqual([]);
  expect(fs.readdirSync(quarantineDir(store)).sort()).toEqual([
    "s1.yaml",
    "s2.yaml",
  ]);
  const records = holdQuarantineRecords(await store.listRecords());

  return { records };
}

async function runSweepsBothHoldsExactlyOnceOnlyPart2(
  scope: Awaited<ReturnType<typeof runSweepsBothHoldsExactlyOnceOnlyPart1>>,
) {
  const { records } = scope;
  expect(records).toHaveLength(2);
  expect(records.map((r) => causeText(r.cause)).join("\n")).toContain(
    "s1.yaml",
  );
  expect(records.map((r) => causeText(r.cause)).join("\n")).toContain(
    "s2.yaml",
  );
}

function registerHoldReadPurePart1(): void {
  it("readHolds reports a malformed and an unknown-slug hold without touching the mailbox", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-hold-read-"));
    try {
      const store = createFolderStore(path.join(root, "goal"), undefined, {});
      await store.ensureLayout();
      const dir = holdsDir(store);
      writeHold(dir, "s1.yaml", MALFORMED);
      writeHold(dir, "s2.yaml", UNKNOWN_SLUG);
      writeHold(dir, "s3.yaml", VALID);

      const before = snapshot(store.mailboxDir);
      const read = await readHolds(store, { knownSlugs: ["alpha"] });

      expect(read.holds).toEqual([
        { steer: "s3", slugs: ["alpha"], goal: false },
      ]);
      expect(read.findings).toEqual([
        {
          file: path.join("mailbox", "holds", "s1.yaml"),
          kind: "malformed",
          reason: expect.stringContaining("not valid YAML"),
        },
        {
          file: path.join("mailbox", "holds", "s2.yaml"),
          kind: "unknown-slug",
          reason: "unknown slug(s): ghost",
        },
      ]);
      expect(snapshot(store.mailboxDir)).toEqual(before);
      expect(fs.existsSync(quarantineDir(store))).toBe(false);
      expect(await store.listRecords()).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerHoldReadPurePart2(): void {
  it("sweepHolds parks both findings once and leaves valid holds in place", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-hold-sweep-"));
    try {
      const store = createFolderStore(path.join(root, "goal"), undefined, {});
      await store.ensureLayout();
      const dir = holdsDir(store);
      writeHold(dir, "s1.yaml", MALFORMED);
      writeHold(dir, "s2.yaml", UNKNOWN_SLUG);
      writeHold(dir, "s3.yaml", VALID);

      await sweepHolds(store, 4, ["alpha"]);
      await sweepHolds(store, 5, ["alpha"]);

      expect(fs.readdirSync(dir)).toEqual(["s3.yaml"]);
      expect(fs.readdirSync(quarantineDir(store)).sort()).toEqual([
        "s1.yaml",
        "s2.yaml",
      ]);
      const records = holdQuarantineRecords(await store.listRecords());
      expect(records.map((r) => r.iteration)).toEqual([4, 4]);
      expect(records[0]?.ok).toBe(false);
      expect(causeText(records[0]?.cause)).toContain(
        'malformed hold "s1.yaml"',
      );
      expect(causeText(records[1]?.cause)).toContain(
        'unknown-slug hold "s2.yaml"',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerHoldReadPurePart3(): void {
  it("sweepHolds keeps a hold whose slug is an unconfigured-type task", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-hold-type-"));
    try {
      const store = createFolderStore(path.join(root, "goal"), undefined, {});
      await store.ensureLayout();
      fs.writeFileSync(
        path.join(store.tasksDir, "pending.md"),
        "---\nslug: pending\ntitle: Pending\ntype: unknown\n---\nDone when: test.\n",
        "utf8",
      );
      const dir = holdsDir(store);
      writeHold(dir, "s1.yaml", "slugs: [pending]\ngoal: false\n");
      writeHold(dir, "s2.yaml", UNKNOWN_SLUG);

      await sweepHolds(store, 1, []);

      expect(fs.readdirSync(dir)).toEqual(["s1.yaml"]);
      expect(fs.readdirSync(quarantineDir(store))).toEqual(["s2.yaml"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("run sweeps both holds exactly once, only after taking the run lock", async () => {
    const goal = makeGoal();
    try {
      const scope1 = await runSweepsBothHoldsExactlyOnceOnlyPart1(goal);
      await runSweepsBothHoldsExactlyOnceOnlyPart2(scope1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
}

function registerHoldReadPurePart4(): void {
  it("a malformed hold refuses resume, and the launch then sweeps it", async () => {
    const { repo, goalDir } = await drainedAfterAlpha();
    try {
      const dir = path.join(goalDir, "mailbox/holds");
      writeHold(dir, "s1.yaml", MALFORMED);

      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
      second.script((req, ctx) => {
        fs.appendFileSync(
          path.join(goalDir, "plan.md"),
          "\n## architect edit on relaunch\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no changes" }));
        return fakeTurnResult(req);
      });
      await expectDispatch(
        1,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: second } },
      );

      const store = createFolderStore(goalDir, undefined, {});
      const records = await store.listRecords();
      // Not a resume: the architect ran in a fresh iteration 2.
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ),
      ).toHaveLength(1);
      expect(fs.existsSync(path.join(dir, "s1.yaml"))).toBe(false);
      expect(holdQuarantineRecords(records)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  }, 120_000);
}

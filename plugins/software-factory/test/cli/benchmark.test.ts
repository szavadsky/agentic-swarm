// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { dispatch } from "../../src/cli/dispatch.js";
import type { Usage } from "../../src/harness/types.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { ArtifactStore, StepRecord } from "../../src/kernel/types.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { rec, script, cause } from "../kernel/helpers.js";

interface FixtureGoal {
  repo: TmpRepo;
  goalDir: string;
  store: ArtifactStore;
}

function fixtureGoal(): FixtureGoal {
  const repo = createTmpRepo();
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\n",
  );
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(goalDir, { recursive: true });
  return { repo, goalDir, store: createFolderStore(goalDir, undefined, {}) };
}

/** Writes one record directory exactly as the store lays it out on disk. */
function writeRecord(goalDir: string, record: StepRecord): void {
  const slug = record.slug ? `-${record.slug}` : "";
  const dir = path.join(
    goalDir,
    "records",
    `${String(record.seq).padStart(5, "0")}-i${record.iteration}${slug}-${record.step}-r${record.round}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  const started = {
    seq: record.seq,
    iteration: record.iteration,
    step: record.step,
    round: record.round,
    actor: record.actor,
    startedAt: record.startedAt,
    ...(record.slug !== undefined ? { slug: record.slug } : {}),
    ...(record.alias !== undefined ? { alias: record.alias } : {}),
    ...(record.model !== undefined ? { model: record.model } : {}),
  };
  const ended = {
    endedAt: record.endedAt,
    ...(record.usage !== undefined ? { usage: record.usage } : {}),
    ...(record.attempts !== undefined ? { attempts: record.attempts } : {}),
    ...(record.stop !== undefined ? { stop: record.stop } : {}),
    ...(record.ok !== undefined ? { ok: record.ok } : {}),
    ...(record.cause !== undefined ? { cause: record.cause } : {}),
  };
  fs.writeFileSync(
    path.join(dir, "started.yaml"),
    yaml.stringify(started),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "end.yaml"), yaml.stringify(ended), "utf8");
}

function usage(costUsd: number, tin: number, out: number): Usage {
  return {
    in: tin,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out,
    reasoningOut: 0,
    costUsd,
  };
}

async function benchmark(
  fixture: FixtureGoal,
  goal = "demo",
): Promise<{ code: number; out: string; err: string }> {
  const lines: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) =>
    errors.push(args.map(String).join(" "));
  try {
    const code = await dispatch([
      "benchmark",
      "--repo",
      fixture.repo.dir,
      "--goal",
      goal,
    ]);
    return { code, out: lines.join("\n"), err: errors.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe("benchmark command", () => {
  it("prints every benchmark row with its unit from fixture records", async () => {
    const fixture = fixtureGoal();
    try {
      const records: StepRecord[] = [
        rec(1, {
          iteration: 1,
          step: "architect",
          slug: undefined,
          alias: "architect",
          usage: usage(1.5, 1_000_000, 100_000),
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:20:00.000Z",
        }),
        rec(2, {
          iteration: 1,
          slug: "alpha",
          alias: "implementer",
          usage: usage(0.5, 2_000_000, 200_000),
          attempts: [
            {
              model: { id: "model-a" },
              stop: { kind: "infra", cause: "quota" },
              usage: usage(0, 0, 0),
            },
            {
              model: { id: "model-b" },
              stop: { kind: "done" },
              usage: usage(0, 0, 0),
            },
          ],
          startedAt: "2026-01-01T00:30:00.000Z",
          endedAt: "2026-01-01T01:30:00.000Z",
        }),
        script(3, {
          iteration: 1,
          slug: "alpha",
          step: "merge",
          ok: true,
          startedAt: "2026-01-01T01:31:00.000Z",
          endedAt: "2026-01-01T02:00:00.000Z",
        }),
        script(4, {
          iteration: 1,
          slug: "alpha",
          step: "merge",
          ok: false,
          cause: cause("conflict: alpha.txt"),
          startedAt: "2026-01-01T02:01:00.000Z",
          endedAt: "2026-01-01T02:10:00.000Z",
        }),
        script(5, {
          iteration: 1,
          slug: "beta",
          step: "park",
          ok: true,
          cause: cause("review rejected: out of scope"),
          startedAt: "2026-01-01T03:00:00.000Z",
          endedAt: "2026-01-01T03:05:00.000Z",
        }),
      ];
      for (const record of records) writeRecord(fixture.goalDir, record);
      await writeMetrics(fixture.store, {
        iteration: 1,
        status: "goal-met",
        records,
        prices: {},
        humanInterventions: 1,
      });

      const { code, out } = await benchmark(fixture);
      expect(code).toBe(0);
      expect(out).toContain("goal demo: 1 iteration(s)");
      expect(out).toContain("| launches | 2 | launches |");
      expect(out).toContain("| architect launches | 1 | launches |");
      expect(out).toContain("| tokens in/out | 3.00 / 0.30 | Mtok |");
      expect(out).toContain("| cost | $2.0000 | USD |");
      expect(out).toContain("| architect share | 75.0% | % of cost |");
      expect(out).toContain("| cost per merged | $2.0000 | USD/merged task |");
      expect(out).toContain("| loop incidents | 0 | events |");
      expect(out).toContain("| human interventions | 1 | events |");
      expect(out).toContain("| wall | 3 h 5 m | h m |");
      expect(out).toContain("| merged/parked | 1 / 1 | tasks |");
      expect(out).toContain("loop incidents: none");
    } finally {
      fixture.repo.cleanup();
    }
  });

  it("prints metrics.loopIncidents as the loop row and excludes other incident classes", async () => {
    const fixture = fixtureGoal();
    try {
      const records: StepRecord[] = [
        rec(1, {
          iteration: 1,
          step: "architect",
          slug: undefined,
          alias: "architect",
          usage: usage(0.1, 100, 10),
        }),
        rec(2, {
          iteration: 1,
          slug: "alpha",
          alias: "implementer",
          usage: usage(0.2, 200, 20),
          attempts: [
            {
              model: { id: "model-a" },
              stop: { kind: "infra", cause: "quota" },
              usage: usage(0, 0, 0),
            },
            {
              model: { id: "model-a" },
              stop: { kind: "done" },
              usage: usage(0, 0, 0),
            },
          ],
        }),
        script(3, {
          iteration: 1,
          slug: "alpha",
          step: "park",
          ok: true,
          cause: cause("no-progress: implement r2 repeats r1 (deadbeef)"),
        }),
        script(4, {
          iteration: 1,
          slug: "beta",
          step: "park",
          ok: true,
          cause: cause("empty-diff: implement r1 committed no changes"),
        }),
        script(5, {
          iteration: 1,
          slug: "gamma",
          step: "park",
          ok: true,
          cause: cause("overflow"),
        }),
        // A spike produces knowledge: its empty finish is not an empty-diff park.
        script(6, { iteration: 1, slug: "probe", step: "finish", ok: true }),
      ];
      for (const record of records) writeRecord(fixture.goalDir, record);
      await writeMetrics(fixture.store, {
        iteration: 1,
        status: "in-progress",
        records,
        prices: {},
      });

      const metrics = yaml.parse(
        (await fixture.store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.totals.loopIncidents).toBe(2);
      expect(metrics.totals.incidents).toMatchObject({
        infraRetries: 1,
        noProgressParks: 1,
        emptyDiffParks: 1,
        overflowParks: 1,
      });

      const { code, out } = await benchmark(fixture);
      expect(code).toBe(0);
      expect(out).toContain(
        `| loop incidents | ${metrics.totals.loopIncidents} | events |`,
      );
      expect(out).toContain(
        "loop incidents: no-progress parks 1, empty-diff parks 1",
      );
      expect(out).not.toContain("overflow parks");
    } finally {
      fixture.repo.cleanup();
    }
  });

  it("marks cost-derived rows partial and never reports an unpriced turn as $0", async () => {
    const fixture = fixtureGoal();
    try {
      const records: StepRecord[] = [
        rec(1, {
          iteration: 1,
          step: "architect",
          slug: undefined,
          alias: "architect",
          usage: usage(1.0, 1_000, 100),
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:10:00.000Z",
        }),
        rec(2, {
          iteration: 1,
          slug: "alpha",
          alias: "implementer",
          model: { id: "mystery/model" },
          usage: usage(0, 2_000, 200),
          startedAt: "2026-01-01T00:10:00.000Z",
          endedAt: "2026-01-01T00:20:00.000Z",
        }),
        script(3, {
          iteration: 1,
          slug: "alpha",
          step: "merge",
          ok: true,
          startedAt: "2026-01-01T00:20:00.000Z",
          endedAt: "2026-01-01T00:30:00.000Z",
        }),
      ];
      for (const record of records) writeRecord(fixture.goalDir, record);
      await writeMetrics(fixture.store, {
        iteration: 1,
        status: "goal-met",
        records,
        prices: {},
      });

      const { code, out } = await benchmark(fixture);
      expect(code).toBe(0);
      expect(out).toContain(
        "| cost | $1.0000 (partial; 1 unpriced turn) | USD |",
      );
      expect(out).toContain(
        "| architect share | 100.0% (partial) | % of cost |",
      );
      expect(out).toContain(
        "| cost per merged | $1.0000 (partial) | USD/merged task |",
      );
      expect(out).toContain("| wall | 30 m | h m |");
      expect(out).toContain("| merged/parked | 1 / 0 | tasks |");
    } finally {
      fixture.repo.cleanup();
    }
  });

  it("prints n/a wall and no merged cost when the goal has no records", async () => {
    const fixture = fixtureGoal();
    try {
      await writeMetrics(fixture.store, {
        iteration: 1,
        status: "goal-met",
        records: [],
        prices: {},
      });

      const { code, out } = await benchmark(fixture);
      expect(code).toBe(0);
      expect(out).toContain("| wall | n/a (no records) | h m |");
      expect(out).toContain(
        "| cost per merged | n/a (no merged tasks) | USD/merged task |",
      );
      expect(out).toContain("| merged/parked | 0 / 0 | tasks |");
      expect(out).toContain("loop incidents: none");
    } finally {
      fixture.repo.cleanup();
    }
  });

  it("fails loudly at the missing goal directory before reading metrics", async () => {
    const fixture = fixtureGoal();
    try {
      const missing = path.join(fixture.repo.dir, ".factory/artifacts/absent");
      const { code, err } = await benchmark(fixture, "absent");
      expect(code).toBe(1);
      expect(err).toContain(`goal "absent" has no directory at ${missing}`);
      expect(err).not.toContain("metrics.yaml");
    } finally {
      fixture.repo.cleanup();
    }
  });

  it("fails loudly when the goal has no metrics file", async () => {
    const fixture = fixtureGoal();
    try {
      const { code, err } = await benchmark(fixture);
      expect(code).toBe(1);
      expect(err).toContain("has no metrics.yaml");
      expect(err).toContain("run the goal first");
    } finally {
      fixture.repo.cleanup();
    }
  });

  it("fails loudly on a metrics file written before incident counts existed", async () => {
    const fixture = fixtureGoal();
    try {
      await fixture.store.writeFile(
        "metrics.yaml",
        yaml.stringify({
          iterations: [],
          totals: {
            turns: 0,
            usage: usage(0, 0, 0),
            merged: [],
            parked: [],
            architect: { launches: 0 },
          },
        }),
      );

      const { code, err } = await benchmark(fixture);
      expect(code).toBe(1);
      expect(err).toContain("has no incident counts");
      expect(err).toContain("re-run the goal");
    } finally {
      fixture.repo.cleanup();
    }
  });

  it("documents the benchmark command in help", async () => {
    const original = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) =>
      lines.push(args.map(String).join(" "));
    try {
      expect(await dispatch(["benchmark", "--help"])).toBe(0);
      expect(lines.join("\n")).toContain(
        "factory benchmark --repo <path> --goal <name>",
      );
    } finally {
      console.log = original;
    }
  });
});

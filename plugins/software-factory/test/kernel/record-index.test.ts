// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { writeYamlAtomic } from "../../src/core/records/io.js";
import { derive } from "../../src/kernel/derive.js";
import {
  createFolderStore,
  sealRecord,
  unsealRecord,
} from "../../src/kernel/store.js";
import type {
  RecordEnd,
  RecordedOutcome,
  RecordStart,
  StepRecord,
  TaskFile,
} from "../../src/kernel/types.js";
import { task } from "./helpers.js";

const STEPS = ["implement", "checks", "review", "merge"] as const;
const SLUGS = 50;
const CYCLES = 25;
const RECORD_COUNT = SLUGS * CYCLES * STEPS.length;

function outcome(summary: string): RecordedOutcome {
  return { status: "done", summary, concerns: [], forward: [] };
}

interface Fixture {
  name: string;
  started: RecordStart & { seq: number; startedAt: string };
  end: RecordEnd & { endedAt: string };
  record: StepRecord;
}

/** One synthetic record per seq: 50 slugs run implement, checks, review, merge. */
function fixture(seq: number): Fixture {
  const index = seq - 1;
  const slug = `t${index % SLUGS}`;
  const step = STEPS[Math.floor(index / SLUGS) % STEPS.length]!;
  const iteration = 1 + Math.floor(index / (SLUGS * STEPS.length));
  const startedAt = new Date(seq * 1000).toISOString();
  const endedAt = new Date(seq * 1000 + 500).toISOString();
  const actor: StepRecord["actor"] =
    step === "checks" || step === "merge" ? "script" : "agent";
  const delivered =
    step === "implement"
      ? outcome(`implemented ${slug}`)
      : step === "review"
        ? { ...outcome(`reviewed ${slug}`), verdict: "approve" as const }
        : undefined;
  const end: RecordEnd & { endedAt: string } = {
    endedAt,
    ...(delivered ? { outcome: delivered } : {}),
    ...(step === "checks" ? { ok: true, checks: [] } : {}),
    ...(step === "merge" ? { ok: true, commit: `${slug}-c${iteration}` } : {}),
  };
  const started = {
    seq,
    iteration,
    slug,
    step,
    round: 1,
    actor,
    startedAt,
  };
  return {
    name: `${String(seq).padStart(5, "0")}-i${iteration}-${slug}-${step}-r1`,
    started,
    end,
    record: { ...started, ...end },
  };
}

/** Writes the fixture directories with the three files a record may carry. */
function seed(recordsDir: string): StepRecord[] {
  fs.mkdirSync(recordsDir, { recursive: true });
  const records: StepRecord[] = [];
  for (let seq = 1; seq <= RECORD_COUNT; seq++) {
    const entry = fixture(seq);
    const dir = path.join(recordsDir, entry.name);
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "started.yaml"),
      yaml.stringify(entry.started),
      "utf8",
    );
    if (entry.end.outcome) {
      fs.writeFileSync(
        path.join(dir, "outcome.yaml"),
        yaml.stringify(entry.end.outcome),
        "utf8",
      );
    }
    fs.writeFileSync(
      path.join(dir, "end.yaml"),
      yaml.stringify(entry.end),
      "utf8",
    );
    records.push(entry.record);
  }
  return records;
}

function tasks(): TaskFile[] {
  return Array.from({ length: SLUGS }, (_, index) =>
    task(`t${index}`, { title: `task ${index}` }),
  );
}

/** Counts readFile calls inside one records directory while the spy is live. */
function countRecordReads(recordsDir: string): {
  readonly count: number;
  restore: () => void;
} {
  const original = fs.promises.readFile;
  let count = 0;
  const spy = spyOn(fs.promises, "readFile").mockImplementation(((
    file: Parameters<typeof fs.promises.readFile>[0],
    options?: Parameters<typeof fs.promises.readFile>[1],
  ) => {
    if (
      typeof file === "string" &&
      file.startsWith(`${recordsDir}${path.sep}`)
    ) {
      count += 1;
    }
    return original(file as never, options as never);
  }) as unknown as typeof fs.promises.readFile);
  return {
    get count() {
      return count;
    },
    restore: () => spy.mockRestore(),
  };
}

function start(over: Partial<RecordStart> = {}): RecordStart {
  return {
    iteration: 1,
    slug: "auth.login",
    step: "implement",
    round: 1,
    actor: "agent",
    ...over,
  };
}

describe("record index", () => {
  let goalDir: string;
  let recordsDir: string;

  beforeEach(() => {
    goalDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-index-"));
    recordsDir = path.join(goalDir, "records");
  });

  afterEach(() => {
    fs.rmSync(goalDir, { recursive: true, force: true });
  });

  it("reads 5,000 sealed records once and derives the same state from cache", async () => {
    const expected = seed(recordsDir);
    const store = createFolderStore(goalDir, undefined, {});
    const reads = countRecordReads(recordsDir);
    try {
      const cold = await store.listRecords();
      expect(cold).toEqual(expected);
      expect(reads.count).toBe(RECORD_COUNT * 3);

      const coldState = derive(tasks(), cold);
      expect(coldState).toEqual(derive(tasks(), expected));

      const warm = await store.listRecords();
      expect(warm).toEqual(expected);
      expect(reads.count).toBe(RECORD_COUNT * 3);
      expect(JSON.stringify(derive(tasks(), warm))).toBe(
        JSON.stringify(coldState),
      );

      // A second store in the same process reuses the sealed parses.
      const other = createFolderStore(goalDir, undefined, {});
      expect(await other.listRecords()).toEqual(expected);
      expect(reads.count).toBe(RECORD_COUNT * 3);

      // A later pass reads only the record appended since the last one.
      await store.appendRecord(start({ slug: "extra" }), {
        ok: true,
        outcome: outcome("appended"),
      });
      const appended = await store.listRecords();
      expect(appended).toHaveLength(RECORD_COUNT + 1);
      expect(appended.at(-1)!.slug).toBe("extra");
      expect(reads.count).toBe(RECORD_COUNT * 3 + 3);
      const advanced = derive([...tasks(), task("extra")], appended);
      expect(advanced.tasks.extra!.turns).toBe(1);
      expect(advanced.tasks.extra!.phase).toBe("checks");
      await store.listRecords();
      expect(reads.count).toBe(RECORD_COUNT * 3 + 3);
    } finally {
      reads.restore();
    }
  }, 60_000);

  it("does not cache a record before its end is sealed", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());
    await writeYamlAtomic(turn.outcomePath, outcome("unfinished"));

    const [open] = await store.listRecords();
    expect(open!.endedAt).toBeUndefined();
    expect(open!.outcome!.summary).toBe("unfinished");

    await turn.finish({ ok: true, outcome: outcome("finished") });
    const [closed] = await store.listRecords();
    expect(closed!.endedAt).toBeDefined();
    expect(closed!.outcome!.summary).toBe("finished");
  });

  it("re-reads a sealed record the kernel reopens and rewrites", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());
    await turn.finish({ ok: true, outcome: outcome("first") });
    expect((await store.listRecords())[0]!.outcome!.summary).toBe("first");

    const rewritten = outcome("rewritten");
    await unsealRecord(turn.dir);
    await writeYamlAtomic(turn.outcomePath, rewritten);
    await sealRecord(turn.dir);

    const [record] = await store.listRecords();
    expect(record!.outcome).toEqual(rewritten);
  });
});

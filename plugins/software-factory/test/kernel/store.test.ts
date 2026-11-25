import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import { forwardedConcerns } from "../../src/kernel/context-pack.js";
import { openDebts } from "../../src/kernel/derive.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { cause } from "./helpers.js";
import { start, task } from "./store-fixtures.js";

let goalDir: string;

describe("createFolderStore", () => {
  beforeEach(() => {
    goalDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-store-"));
  });

  afterEach(() => {
    fs.rmSync(goalDir, { recursive: true, force: true });
  });
  registerCreateFolderStorePart1();
  registerCreateFolderStorePart2();
  registerCreateFolderStorePart3();
  registerCreateFolderStorePart4();
  registerCreateFolderStorePart5();
  registerCreateFolderStorePart6();
  registerCreateFolderStorePart7();
  registerCreateFolderStorePart8();
  registerCreateFolderStorePart9();
  registerCreateFolderStorePart10();
  registerCreateFolderStorePart11();
  registerCreateFolderStorePart12();
  registerCreateFolderStorePart13();
});

function registerCreateFolderStorePart1(): void {
  it("creates the goal layout", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    await store.ensureLayout();
    for (const rel of [
      "tasks",
      "records",
      "mailbox/inbox",
      "mailbox/processed",
      "mailbox/outbox",
      "iterations",
    ]) {
      expect(fs.statSync(path.join(goalDir, rel)).isDirectory()).toBe(true);
    }
    expect(store.goalDir).toBe(goalDir);
    expect(store.tasksDir).toBe(path.join(goalDir, "tasks"));
    expect(store.recordsDir).toBe(path.join(goalDir, "records"));
    expect(store.mailboxDir).toBe(path.join(goalDir, "mailbox"));
    expect(store.iterationsDir).toBe(path.join(goalDir, "iterations"));
  });
}

function registerCreateFolderStorePart2(): void {
  it("writes a .gitignore at the artifact root so goal records stay out of git", async () => {
    const repo = createTmpRepo();
    try {
      const artifactRoot = path.join(repo.dir, ".factory/artifacts");
      const store = createFolderStore(
        path.join(artifactRoot, "demo"),
        artifactRoot,
        {},
      );
      await store.ensureLayout();
      await store.writeFile("records/00001/started.yaml", "seq: 1\n");
      expect(fs.existsSync(path.join(artifactRoot, ".gitignore"))).toBe(true);
      expect(repo.git(["status", "--porcelain"]).stdout).toBe("");

      repo.writeFile(".factory/artifacts/.gitignore", "existing\n");
      const other = createFolderStore(
        path.join(artifactRoot, "other"),
        artifactRoot,
        {},
      );
      await other.ensureLayout();
      expect(
        fs.readFileSync(path.join(artifactRoot, ".gitignore"), "utf8"),
      ).toBe("existing\n");
    } finally {
      repo.cleanup();
    }
  });

  it("reads, writes and lists goal-relative files", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    expect(await store.readFile("missing.txt")).toBeNull();
    expect(await store.listDir("missing")).toEqual([]);

    await store.writeFile("notes/hello.txt", "hello");
    await store.writeFile("notes/alpha.txt", "alpha");
    expect(await store.readFile("notes/hello.txt")).toBe("hello");
    expect(await store.listDir("notes")).toEqual(["alpha.txt", "hello.txt"]);
  });
}

function registerCreateFolderStorePart3(): void {
  it("resolves a task file's type through the store's process config", async () => {
    const store = createFolderStore(goalDir, undefined, {
      spike: {
        flow: "spike",
        kind: "spike",
        schema: "outcome",
        useWhen: "a question only evidence answers",
      },
    });
    await store.writeTask({ ...task(), type: "spike" });
    const [parsed] = await store.listTasks();
    expect(parsed).toMatchObject({
      slug: "auth.login",
      type: "spike",
      kind: "spike",
      flow: "spike",
    });
    expect(await store.readTask("auth.login")).toMatchObject({
      type: "spike",
      kind: "spike",
    });
  });

  it("round-trips task files sorted by slug", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const login = task();
    const base = task({
      slug: "api.base",
      title: "Base",
      kind: "spike",
      flow: "spike",
      body: "spike body",
    });
    await store.writeTask(login);
    await store.writeTask(base);

    const tasks = await store.listTasks();
    expect(tasks.map((t) => t.slug)).toEqual(["api.base", "auth.login"]);
    expect(tasks[0]).toMatchObject(base);
    expect(tasks[1]).toMatchObject(login);

    expect(await store.readTask("auth.login")).toMatchObject(login);
    expect(await store.readTask("missing")).toBeNull();
  });
}

function registerCreateFolderStorePart4(): void {
  it("writes started.yaml before returning and shows the unfinished record", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());

    expect(turn.dir).toBe(
      path.join(goalDir, "records", "00001-i1-auth.login-implement-r1"),
    );
    expect(turn.outcomePath).toBe(path.join(turn.dir, "outcome.yaml"));
    expect(turn.meta.seq).toBe(1);
    expect(turn.meta.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fs.existsSync(path.join(turn.dir, "started.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(turn.dir, "end.yaml"))).toBe(false);
    expect(
      await readYaml<{ seq: number }>(path.join(turn.dir, "started.yaml")),
    ).toMatchObject({
      seq: 1,
      startedAt: turn.meta.startedAt,
    });

    const records = await store.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.seq).toBe(1);
    expect(records[0]!.startedAt).toBe(turn.meta.startedAt);
    expect(records[0]!.endedAt).toBeUndefined();
    expect(records[0]!.outcome).toBeUndefined();
  });

  it("round-trips the architect that owns a record", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start({ architect: "auth" }));
    expect(turn.meta.architect).toBe("auth");
    const records = await store.listRecords();
    expect(records[0]!.architect).toBe("auth");
  });
}

function registerCreateFolderStorePart5(): void {
  it("finishes atomically: outcome.yaml, then end.yaml with endedAt", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());
    const outcome = {
      status: "done" as const,
      summary: "landed",
      concerns: [],
      forward: [],
    };
    const finished = await turn.finish({ stop: { kind: "done" }, outcome });

    expect(finished.seq).toBe(1);
    expect(finished.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(finished.stop).toEqual({ kind: "done" });
    expect(finished.outcome).toEqual(outcome);
    expect(await readYaml(path.join(turn.dir, "outcome.yaml"))).toEqual(
      outcome,
    );

    const endRaw = fs.readFileSync(path.join(turn.dir, "end.yaml"), "utf8");
    expect(endRaw).not.toContain("undefined");
    expect(endRaw).not.toContain("usage");
    const end = await readYaml<{
      endedAt: string;
      stop: unknown;
      outcome: unknown;
    }>(path.join(turn.dir, "end.yaml"));
    expect(end.endedAt).toBe(finished.endedAt!);
    expect(end.stop).toEqual({ kind: "done" });
    expect(end.outcome).toEqual(outcome);

    expect(
      fs.readdirSync(turn.dir).filter((name) => name.includes(".tmp")),
    ).toEqual([]);
    for (const name of ["started.yaml", "outcome.yaml", "end.yaml"]) {
      expect(fs.statSync(path.join(turn.dir, name)).mode & 0o777).toBe(0o444);
    }

    const records = await store.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.endedAt).toBe(finished.endedAt!);
    expect(records[0]!.outcome).toEqual(outcome);
  });
}

function registerCreateFolderStorePart6(): void {
  it("increments seq from the highest existing record dir", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const first = await store.appendRecord(start(), { stop: { kind: "done" } });
    const reviewOutcome = {
      status: "done" as const,
      summary: "looks good",
      concerns: [],
      forward: [] as string[],
    };
    const second = await store.appendRecord(
      start({ step: "review", alias: "reviewer" }),
      { stop: { kind: "done" }, outcome: reviewOutcome },
    );
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    const listed = await store.listRecords();
    expect(listed.map((r) => r.seq)).toEqual([1, 2]);
    expect(listed[1]!.step).toBe("review");
    expect(second.outcome).toEqual(reviewOutcome);
    expect(second.endedAt!).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    fs.mkdirSync(
      path.join(goalDir, "records", "00007-i2-auth.login-implement-r1"),
      {
        recursive: true,
      },
    );
    const third = await store.startRecord(start({ iteration: 2 }));
    expect(third.meta.seq).toBe(8);
    expect(third.dir).toBe(
      path.join(goalDir, "records", "00008-i2-auth.login-implement-r1"),
    );
  });
}

function registerCreateFolderStorePart7(): void {
  it("skips record dirs without a parseable started.yaml", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    await store.startRecord(start());

    fs.mkdirSync(path.join(goalDir, "records", "00002-empty"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(goalDir, "records", "00003-scalar"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(goalDir, "records", "00003-scalar", "started.yaml"),
      "just a string",
    );
    fs.mkdirSync(path.join(goalDir, "records", "00004-bad"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(goalDir, "records", "00004-bad", "started.yaml"),
      "key: [unclosed",
    );
    fs.writeFileSync(
      path.join(goalDir, "records", "00005-file"),
      "not a directory",
    );

    const records = await store.listRecords();
    expect(records.map((r) => r.seq)).toEqual([1]);
  });
}

function registerCreateFolderStorePart8(): void {
  it("reads outcome.yaml when present and prefers it over end.yaml", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());
    await turn.finish({
      stop: { kind: "done" },
      outcome: {
        status: "failed",
        summary: "stale",
        concerns: [],
        forward: [],
      },
    });
    const rewritten = {
      status: "done" as const,
      summary: "fresh",
      concerns: [],
      forward: [],
    };
    await writeYamlAtomic(path.join(turn.dir, "outcome.yaml"), rewritten);

    const records = await store.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.outcome).toEqual(rewritten);
  });

  it("survives a truncated agent-written outcome.yaml (rehydrates without outcome)", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());
    // Truncated JSON mid-string, as a cut-off reviewer turn leaves it.
    await fs.promises.writeFile(
      path.join(turn.dir, "outcome.yaml"),
      '{\n  "status": "done",\n  "summary": "Deletions match the done-when exactly (docs/adr 22 files, docs/factory',
    );
    const records = await store.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.outcome).toBeUndefined();
    expect(records[0]!.seq).toBe(turn.meta.seq);
  });
}

function registerCreateFolderStorePart9(): void {
  it("degrades a torn end.yaml to an orphan instead of throwing", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());
    await fs.promises.writeFile(
      path.join(turn.dir, "end.yaml"),
      "stop: {kind: [unclosed\n",
    );
    const records = await store.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.stop).toBeUndefined();
  });
}

function registerCreateFolderStorePart10(): void {
  it("normalizes missing concerns/forward in outcome.yaml on read", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());

    // Outcome without concerns or forward
    const incompleteOutcome = {
      status: "done",
      summary: "incomplete",
    };
    await writeYamlAtomic(
      path.join(turn.dir, "outcome.yaml"),
      incompleteOutcome,
    );

    // Outcome with concerns but no forward
    const turn2 = await store.startRecord(start());
    const concernsOnlyOutcome = {
      status: "done",
      summary: "concerns only",
      concerns: [
        { kind: "debt" as const, calibration: "fyi" as const, text: "fixme" },
      ],
    };
    await writeYamlAtomic(
      path.join(turn2.dir, "outcome.yaml"),
      concernsOnlyOutcome,
    );

    const records = await store.listRecords();
    expect(records).toHaveLength(2);

    const r1 = records.find((r) => r.seq === turn.meta.seq)!;
    expect(r1.outcome!.concerns).toEqual([]);
    expect(r1.outcome!.forward).toEqual([]);

    const r2 = records.find((r) => r.seq === turn2.meta.seq)!;
    expect(r2.outcome!.concerns).toEqual([
      {
        ...concernsOnlyOutcome.concerns[0]!,
        id: `${path.basename(turn2.dir)}#1`,
      },
    ]);
    expect(r2.outcome!.forward).toEqual([]);
  });
}

function registerCreateFolderStorePart11(): void {
  it("assigns every ingested concern the record id, overwriting one the agent wrote", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(start());
    await writeYamlAtomic(path.join(turn.dir, "outcome.yaml"), {
      status: "done",
      summary: "two concerns",
      concerns: [
        {
          kind: "debt",
          calibration: "architect",
          text: "first",
          id: "agent-written#7",
        },
        { kind: "risk", calibration: "owner", text: "second" },
      ],
      forward: [],
    });

    const [record] = await store.listRecords();
    const recordId = path.basename(turn.dir);
    expect(record!.outcome!.concerns.map((concern) => concern.id)).toEqual([
      `${recordId}#1`,
      `${recordId}#2`,
    ]);
  });
}

function registerCreateFolderStorePart12(): void {
  it("assigns ids to an outcome that rides on a script step's end.yaml", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    const turn = await store.startRecord(
      start({ actor: "script", step: "park" }),
    );
    await turn.finish({
      ok: true,
      cause: cause("round limit"),
      outcome: {
        status: "done",
        summary: "script outcome",
        concerns: [{ kind: "debt", calibration: "fyi", text: "left a shim" }],
        forward: [],
      },
    });

    const [record] = await store.listRecords();
    expect(record!.outcome!.concerns[0]!.id).toBe(
      `${path.basename(turn.dir)}#1`,
    );
  });
}

function registerCreateFolderStorePart13(): void {
  it("verifies context pack, open debts and summary builder do not throw on seeded records", async () => {
    const store = createFolderStore(goalDir, undefined, {});
    await store.ensureLayout();
    await store.appendRecord(start(), { stop: { kind: "done" } });
    const records = await store.listRecords();

    forwardedConcerns(records);
    openDebts(records);
    await writeIterationSummary(store, {
      iteration: 1,
      state: {
        goal: "active",
        iteration: 1,
        terminal: false,
        interrupted: false,
        tasks: {},
        epics: {},
      },
      records,
    });
  });
}

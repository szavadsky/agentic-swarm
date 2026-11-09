import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as deriveTaskModule from "../../src/core/derive/task.js";
import { deriveItemState, type DerivedItemState } from "../../src/core/derive/item.js";
import { deriveWaveState } from "../../src/core/derive/wave.js";
import type { StoredConcernArtifact } from "../../src/core/artifacts.js";

/**
 * Routed blockers are pure derive data (adr-routing-derived-state): a `routed`
 * concern of kind `blocker` names the items it affects (`affects`), and derive
 * marks the named items plus their declared dependents blocked. Derivation
 * never writes: no concern, decision, mailbox, or state files change.
 */

type CollectRoutedBlockers = (taskDir: string) => Promise<Set<string>>;

/**
 * Test-first seam: while `derive/task.ts` does not yet export the collector,
 * an inert fallback keeps module collection alive so the behavioural
 * assertions fail as assertion failures (target-red), not import errors.
 */
const collectRoutedBlockers: CollectRoutedBlockers =
  (deriveTaskModule as unknown as { collectRoutedBlockers?: CollectRoutedBlockers })
    .collectRoutedBlockers ?? (async () => new Set<string>());

type ItemDeriveOpts = Parameters<typeof deriveItemState>[0] & {
  blockedBy?: Iterable<string>;
};
type WaveDeriveOpts = Parameters<typeof deriveWaveState>[0] & {
  blockedBy?: Iterable<string>;
};

const tmpDirs: string[] = [];

function makeTaskDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-routed-blocker-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function routedBlockedSlugs(taskDir: string): Promise<Set<string>> {
  return collectRoutedBlockers(taskDir);
}

function writeItem(
  taskDir: string,
  slug: string,
  opts: { wave?: number; deps?: string[] } = {}
): void {
  const dir = path.join(taskDir, "items", slug);
  fs.mkdirSync(dir, { recursive: true });
  const deps = opts.deps ?? [];
  const depsYaml =
    deps.length === 0 ? "deps: []" : `deps:\n${deps.map((d) => `  - ${d}`).join("\n")}`;
  fs.writeFileSync(
    path.join(dir, "assignment.yaml"),
    [
      `slug: ${slug}`,
      "kind: dev",
      `title: ${slug}`,
      "assignment: Do the work",
      `wave: ${opts.wave ?? 1}`,
      depsYaml,
    ].join("\n") + "\n",
    "utf8"
  );
}
function writeStepRecord(
  taskDir: string,
  slug: string,
  opts: { name: string; status: string }
): void {
  const dir = path.join(taskDir, "items", slug, "steps", `001-${opts.name}-a1`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "input.md"), "prompt\n", "utf8");
  fs.writeFileSync(
    path.join(dir, "meta.yaml"),
    [
      "seq: 1",
      `name: ${opts.name}`,
      "attempt: 1",
      "agent: developer",
      "role: workhorse",
      "models: [test]",
      `status: ${opts.status}`,
      "startedAt: 2026-01-01T00:00:00.000Z",
      "endedAt: 2026-01-01T00:00:01.000Z",
    ].join("\n") + "\n",
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "output.yaml"), "status: ok\nsummary: done\n", "utf8");
}


function writeConcern(
  taskDir: string,
  concern: Pick<StoredConcernArtifact, "id" | "kind" | "summary" | "status"> &
    Partial<StoredConcernArtifact>
): void {
  const dir = path.join(taskDir, "concerns");
  fs.mkdirSync(dir, { recursive: true });
  const record = {
    detail: concern.summary,
    // Routed blocking defaults to high (concerns.minBlockingSeverity).
    severity: "high",
    source: { record: "test-first", agent: "test" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...concern,
  };
  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(record, null, 2), "utf8");
}

function derivedItem(partial: Partial<DerivedItemState> & { slug: string }): DerivedItemState {
  return {
    kind: "dev",
    title: partial.slug,
    wave: 1,
    deps: [],
    status: "pending",
    branch: `topic/routing-blocker--${partial.slug}`,
    records: [],
    currentAttempt: 1,
    currentFixRound: 1,
    isEscalated: false,
    freshSeries: false,
    interruptionCount: 0,
    consultCount: 0,
    suggestionFingerprints: [],
    decisionFingerprints: [],
    failingCheckFingerprints: [],
    ...partial,
  };
}

/** Reads every file under `root` so a test can prove derive is write-free. */
function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(root, full)] = fs.readFileSync(full, "utf8");
    }
  };
  walk(root);
  return out;
}

describe("derive/task: collectRoutedBlockers", () => {
  it("collects affects of routed blocker concerns and ignores other statuses and kinds", async () => {
    const taskDir = makeTaskDir();
    writeConcern(taskDir, {
      id: "c-routed-blocker",
      kind: "blocker",
      status: "routed",
      summary: "Schema migration is pending",
      affects: ["item-b", "item-c"],
    });
    writeConcern(taskDir, {
      id: "c-open-blocker",
      kind: "blocker",
      status: "open",
      summary: "Not triaged yet",
      affects: ["item-open"],
    });
    writeConcern(taskDir, {
      id: "c-routed-risk",
      kind: "risk",
      status: "routed",
      summary: "Routed risk",
      affects: ["item-risk"],
    });
    writeConcern(taskDir, {
      id: "c-resolved-blocker",
      kind: "blocker",
      status: "resolved",
      summary: "Already handled",
      affects: ["item-resolved"],
    });
    writeConcern(taskDir, {
      id: "c-dismissed-blocker",
      kind: "blocker",
      status: "dismissed",
      summary: "Dismissed by the reviewer",
      affects: ["item-dismissed"],
    });

    const blocked = await routedBlockedSlugs(taskDir);
    expect(blocked).toBeInstanceOf(Set);
    expect([...blocked].sort()).toEqual(["item-b", "item-c"]);
  });

  it("returns an empty set when the task has no concerns directory", async () => {
    const taskDir = makeTaskDir();

    expect([...(await routedBlockedSlugs(taskDir))]).toEqual([]);

    // The same derive seam starts reporting once a routed blocker is stored.
    writeConcern(taskDir, {
      id: "c-late-blocker",
      kind: "blocker",
      status: "routed",
      summary: "Discovered after the first derive",
      affects: ["late-item"],
    });
    expect([...(await routedBlockedSlugs(taskDir))].sort()).toEqual(["late-item"]);
  });
});

describe("derive/wave: routed blocker integration", () => {
  it("routes a concern-affected item and its declared dependents to blocked", () => {
    const items = [
      derivedItem({ slug: "seed", wave: 8 }),
      derivedItem({ slug: "dependent", wave: 8, deps: ["seed"] }),
      derivedItem({ slug: "independent", wave: 8, deps: [] }),
    ];

    const wave = deriveWaveState({
      wave: 8,
      items,
      blockedBy: new Set(["seed"]),
    } as WaveDeriveOpts);

    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["dependent", "seed"]);
    expect(wave.runnable.map((i) => i.slug)).toEqual(["independent"]);
  });

  it("cascades transitively over declared deps only", () => {
    const items = [
      derivedItem({ slug: "seed", wave: 8 }),
      derivedItem({ slug: "child", wave: 8, deps: ["seed"] }),
      derivedItem({ slug: "grandchild", wave: 8, deps: ["child"] }),
      derivedItem({ slug: "side", wave: 8, deps: [] }),
    ];

    const wave = deriveWaveState({
      wave: 8,
      items,
      blockedBy: new Set(["seed"]),
    } as WaveDeriveOpts);

    expect(wave.blocked.map((i) => i.slug).sort()).toEqual(["child", "grandchild", "seed"]);
    expect(wave.runnable.map((i) => i.slug)).toEqual(["side"]);
  });

  it("ignores running/ready seeds and does not cascade from them", () => {
    const items = [
      derivedItem({ slug: "running-seed", wave: 8, status: "running" }),
      derivedItem({ slug: "ready-seed", wave: 8, status: "ready" }),
      derivedItem({ slug: "running-dependent", wave: 8, deps: ["running-seed"] }),
      derivedItem({ slug: "ready-dependent", wave: 8, deps: ["ready-seed"] }),
    ];

    const wave = deriveWaveState({
      wave: 8,
      items,
      blockedBy: new Set(["running-seed", "ready-seed"]),
    } as WaveDeriveOpts);

    expect(wave.blocked.map((i) => i.slug)).toEqual([]);
    expect(wave.running.map((i) => i.slug)).toEqual(["running-seed"]);
    expect(wave.ready.map((i) => i.slug)).toEqual(["ready-seed"]);
  });
});

describe("derive/item: routed blocker integration", () => {
  it("blocks only the item named by a routed blocker", async () => {
    const taskDir = makeTaskDir();
    writeItem(taskDir, "affected");
    writeItem(taskDir, "unaffected");
    const blockedBy = new Set(["affected"]);

    const affected = await deriveItemState({
      taskDir,
      itemSlug: "affected",
      parentBranch: "topic/routing-blocker",
      taskWt: taskDir,
      blockedBy,
    } as ItemDeriveOpts);
    const unaffected = await deriveItemState({
      taskDir,
      itemSlug: "unaffected",
      parentBranch: "topic/routing-blocker",
      taskWt: taskDir,
      blockedBy,
    } as ItemDeriveOpts);

    expect(affected.status).toBe("blocked");
    expect(unaffected.status).toBe("pending");
  });

  it("keeps a terminal item status over routed blocking", async () => {
    const taskDir = makeTaskDir();
    writeItem(taskDir, "abandoned");
    writeItem(taskDir, "blocked-one");
    const decisionsDir = path.join(taskDir, "decisions");
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(decisionsDir, "001-abandon.yaml"),
      JSON.stringify({
        id: "decision-abandon",
        context: "item",
        item: "abandoned",
        decision: "abandon",
        rationale: "No longer needed",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      "utf8"
    );
    const blockedBy = new Set(["abandoned", "blocked-one"]);

    const abandoned = await deriveItemState({
      taskDir,
      itemSlug: "abandoned",
      parentBranch: "topic/routing-blocker",
      taskWt: taskDir,
      blockedBy,
    } as ItemDeriveOpts);
    const blockedOne = await deriveItemState({
      taskDir,
      itemSlug: "blocked-one",
      parentBranch: "topic/routing-blocker",
      taskWt: taskDir,
      blockedBy,
    } as ItemDeriveOpts);

    expect(abandoned.status).toBe("failed");
    expect(blockedOne.status).toBe("blocked");
  });

  it("does not retro-block running/ready items named by a routed blocker", async () => {
    const taskDir = makeTaskDir();
    writeItem(taskDir, "in-flight");
    writeItem(taskDir, "finished");
    const blockedBy = new Set(["in-flight", "finished"]);
    writeStepRecord(taskDir, "in-flight", { name: "develop", status: "started" });
    writeStepRecord(taskDir, "finished", { name: "review", status: "ok" });

    const inFlight = await deriveItemState({
      taskDir,
      itemSlug: "in-flight",
      parentBranch: "topic/routing-blocker",
      taskWt: taskDir,
      blockedBy,
    } as ItemDeriveOpts);
    const finished = await deriveItemState({
      taskDir,
      itemSlug: "finished",
      parentBranch: "topic/routing-blocker",
      taskWt: taskDir,
      blockedBy,
    } as ItemDeriveOpts);

    expect(inFlight.status).toBe("running");
    expect(finished.status).toBe("ready");
  });
});

describe("derive/task: routed blocker scenario", () => {
  it("blocks affected items and declared dependents, leaving non-dependents pending without writes", async () => {
    const taskDir = makeTaskDir();
    writeItem(taskDir, "blocker-source", { wave: 1 });
    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
    writeItem(taskDir, "transitive", { wave: 3, deps: ["dependent"] });
    writeItem(taskDir, "independent", { wave: 3 });
    writeConcern(taskDir, {
      id: "c-routed-blocker",
      kind: "blocker",
      status: "routed",
      summary: "Upstream schema migration blocks the wave",
      affects: ["blocker-source"],
    });

    const before = snapshotTree(taskDir);
    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker", taskWt: taskDir });
    const after = snapshotTree(taskDir);

    expect(state.itemMap["blocker-source"]?.status).toBe("blocked");
    expect(state.itemMap["dependent"]?.status).toBe("blocked");
    expect(state.itemMap["transitive"]?.status).toBe("blocked");
    expect(state.itemMap["independent"]?.status).toBe("pending");

    expect(state.waves.find((w) => w.wave === 2)?.blocked.map((i) => i.slug)).toContain("dependent");
    const wave3 = state.waves.find((w) => w.wave === 3);
    expect(wave3?.blocked.map((i) => i.slug)).toContain("transitive");
    expect(wave3?.runnable.map((i) => i.slug)).toContain("independent");

    // Pure derive: no concern/decision/mailbox/state file is written or changed.
    expect(after).toEqual(before);
  });

  it("derives the task blocked when every item is in the routed blocker cascade", async () => {
    const taskDir = makeTaskDir();
    writeItem(taskDir, "blocker-source", { wave: 1 });
    writeItem(taskDir, "dependent", { wave: 2, deps: ["blocker-source"] });
    writeConcern(taskDir, {
      id: "c-routed-blocker",
      kind: "blocker",
      status: "routed",
      summary: "Blocked until the operator answers",
      affects: ["blocker-source"],
    });

    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker", taskWt: taskDir });

    expect(state.itemMap["dependent"]?.status).toBe("blocked");
    expect(state.status).toBe("blocked");
  });

  it("leaves running/ready seeds and their dependents schedulable at task level", async () => {
    const taskDir = makeTaskDir();
    writeItem(taskDir, "running-seed", { wave: 1 });
    writeItem(taskDir, "ready-seed", { wave: 1 });
    writeItem(taskDir, "running-dependent", { wave: 1, deps: ["running-seed"] });
    writeItem(taskDir, "ready-dependent", { wave: 1, deps: ["ready-seed"] });
    writeStepRecord(taskDir, "running-seed", { name: "develop", status: "started" });
    writeStepRecord(taskDir, "ready-seed", { name: "review", status: "ok" });
    writeConcern(taskDir, {
      id: "c-routed-blocker",
      kind: "blocker",
      status: "routed",
      summary: "Late-arriving blocker names in-flight work",
      affects: ["running-seed", "ready-seed"],
    });

    const state = await deriveTaskModule.deriveTaskState({ taskDir, task: "routing-blocker", taskWt: taskDir });

    expect(state.itemMap["running-seed"]?.status).toBe("running");
    expect(state.itemMap["ready-seed"]?.status).toBe("ready");
    expect(state.itemMap["running-dependent"]?.status).toBe("pending");
    expect(state.itemMap["ready-dependent"]?.status).toBe("pending");
    expect(state.waves.find((w) => w.wave === 1)?.blocked.map((i) => i.slug)).toEqual([]);
  });
});

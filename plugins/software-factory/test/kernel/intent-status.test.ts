import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { derive } from "../../src/kernel/derive.js";
import { collectStatus } from "../../src/kernel/status.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  INTENT_STATUS_FILE,
  readLatestIntentStatus,
  writeIntentStatus,
} from "../../src/kernel/summary/intent-status.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { task } from "./helpers.js";

const SECTIONS = [
  {
    slug: "StatusAndDashboard",
    section: "Status reporting and dashboard",
    status: "works" as const,
    note: "intent view reads the artifact",
  },
  { slug: "Sandbox", status: "not-built" as const },
  { slug: "Steering", status: "friction" as const, note: "debounce" },
];

type Store = ReturnType<typeof createFolderStore>;

async function newStore(): Promise<{ root: string; store: Store }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-intent-"));
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  await store.ensureLayout();
  return { root, store };
}

function artifactText(store: Store): string {
  return fs.readFileSync(
    path.join(store.goalDir, "iterations/1", INTENT_STATUS_FILE),
    "utf8",
  );
}

/** One architect record; the summary reads its intent status from this outcome. */
async function appendArchitect(
  store: Store,
  intentStatus?: (typeof SECTIONS)[number][],
): Promise<void> {
  await store.appendRecord(
    {
      iteration: 1,
      step: "architect",
      round: 1,
      actor: "agent",
      alias: "architect",
      model: { id: "fake" },
    },
    {
      outcome: {
        status: "done",
        summary: "planned the iteration",
        concerns: [],
        forward: [],
        decision: "continue",
        ...(intentStatus ? { intentStatus } : {}),
      },
    },
  );
}

async function appendMerge(store: Store, iteration: number): Promise<void> {
  await store.appendRecord(
    { iteration, step: "merge", round: 1, actor: "script", slug: "a" },
    { ok: true, commit: "abc123" },
  );
}

async function writeSummary(store: Store): Promise<void> {
  const records = await store.listRecords();
  await writeIterationSummary(store, {
    iteration: 1,
    state: derive(await store.listTasks(), records),
    records,
    status: "in-progress",
  });
}

function collect(store: Store): ReturnType<typeof collectStatus> {
  return collectStatus({
    store,
    flows: {},
    priceSource: {
      fetchModels: async () => {
        throw new Error("prices disabled in test");
      },
    },
  });
}

describe("intent status artifact writes", () => {
  it("writes the architect's sections with the iteration summary", async () => {
    const { root, store } = await newStore();
    try {
      await store.writeTask(task("a"));
      await appendArchitect(store, SECTIONS);
      await writeSummary(store);

      expect(JSON.parse(artifactText(store))).toEqual({
        iteration: 1,
        sections: SECTIONS,
      });
      expect(
        fs.existsSync(path.join(store.goalDir, "iterations/1/summary.md")),
      ).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes an empty artifact when the architect reports no sections", async () => {
    const { root, store } = await newStore();
    try {
      await store.writeTask(task("a"));
      await appendArchitect(store);
      await writeSummary(store);

      expect(JSON.parse(artifactText(store))).toEqual({
        iteration: 1,
        sections: [],
      });
      expect(await readLatestIntentStatus(store, 1)).toEqual({
        iteration: 1,
        sections: [],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("intent status artifact reads", () => {
  it("reads the newest artifact at or below the iteration", async () => {
    const { root, store } = await newStore();
    try {
      await writeIntentStatus(store, 1, [SECTIONS[1]!]);
      await writeIntentStatus(store, 2, SECTIONS);

      expect(await readLatestIntentStatus(store, 3)).toEqual({
        iteration: 2,
        sections: SECTIONS,
      });
      expect(await readLatestIntentStatus(store, 2)).toEqual({
        iteration: 2,
        sections: SECTIONS,
      });

      await store.iterations.write(2, INTENT_STATUS_FILE, "{not json");
      await expect(readLatestIntentStatus(store, 2)).rejects.toThrow(
        `iterations/2/${INTENT_STATUS_FILE} is not a valid intent status artifact`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("intent status collection", () => {
  it("collects the latest artifact into the status snapshot", async () => {
    const { root, store } = await newStore();
    try {
      await store.writeTask(task("a"));
      await writeIntentStatus(store, 1, [SECTIONS[1]!]);
      await writeIntentStatus(store, 2, SECTIONS);
      await appendMerge(store, 2);

      const status = await collect(store);

      expect(status.iteration).toBe(2);
      expect(status.intentStatus).toEqual({ iteration: 2, sections: SECTIONS });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads a pre-slug artifact by its section heading", async () => {
    const { root, store } = await newStore();
    try {
      const artifact = {
        iteration: 1,
        sections: [
          {
            section: "Sandbox",
            status: "not-built" as const,
            note: "no bwrap",
          },
        ],
      };
      await store.iterations.write(
        1,
        INTENT_STATUS_FILE,
        JSON.stringify(artifact),
      );
      await appendMerge(store, 1);

      const status = await collect(store);

      expect(status.intentStatus).toEqual(artifact);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves intentStatus absent until an artifact exists", async () => {
    const { root, store } = await newStore();
    try {
      await store.writeTask(task("a"));
      await appendMerge(store, 1);

      const status = await collect(store);

      expect(status.intentStatus).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

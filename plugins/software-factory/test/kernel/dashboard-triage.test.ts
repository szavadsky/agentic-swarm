import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordedConcernId } from "../../src/core/concerns.js";
import { renderDashboard } from "../../src/kernel/dashboard.js";
import { createFolderStore, recordDirName } from "../../src/kernel/store.js";
import { writeStatus } from "../../src/kernel/status.js";
import type { StatusDocument } from "../../src/kernel/status.js";
import type { Outcome } from "../../src/kernel/types.js";

const FIXTURE = path.join(
  import.meta.dir,
  "..",
  "fixtures",
  "dashboard",
  "status.json",
);

function fixture(): StatusDocument {
  return JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as StatusDocument;
}

function outcome(patch: Partial<Outcome> = {}): Outcome {
  return {
    status: "done",
    summary: "ok",
    concerns: [],
    forward: [],
    ...patch,
  } as Outcome;
}

function offlinePrices(root: string) {
  return {
    cachePath: path.join(root, "no-prices.json"),
    fetchModels: async () => {
      throw new Error("prices disabled in test");
    },
  };
}

type TriageStore = ReturnType<typeof createFolderStore>;

const TRIAGE_AGENT = {
  iteration: 1,
  round: 1,
  actor: "agent" as const,
  alias: "fake",
  model: { id: "fake" },
};

const TRIAGE_STOP = {
  reason: "infra" as const,
  cause:
    "infrastructure stop during iteration 1: task: auth: provider.no-route",
};

interface TriageFixture {
  root: string;
  store: TriageStore;
  architectRecord: string;
}

/** Records open and filtered concerns; returns the architect record's directory. */
async function writeTriageConcerns(store: TriageStore): Promise<string> {
  const architect = await store.appendRecord(
    { ...TRIAGE_AGENT, step: "architect" },
    {
      ok: true,
      outcome: outcome({
        concerns: [
          { kind: "risk", calibration: "fyi", text: "FYI note <hidden>" },
          {
            kind: "risk",
            calibration: "owner",
            text: "Open risk <shown>",
            evidence: "plan.md",
          },
          {
            kind: "uncertainty",
            calibration: "architect",
            text: "Answered risk <gone>",
          },
        ],
      }),
    },
  );
  const implement = await store.appendRecord(
    { ...TRIAGE_AGENT, step: "implement", slug: "task" },
    {
      ok: true,
      outcome: outcome({
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "Open debt <shown>",
            evidence: "src/a.ts",
          },
          {
            kind: "debt",
            calibration: "architect",
            text: "Closed debt <gone>",
          },
        ],
      }),
    },
  );
  const closedId = `${recordDirName(implement.seq, implement)}#2`;
  await store.appendRecord(
    { ...TRIAGE_AGENT, step: "architect" },
    {
      ok: true,
      outcome: outcome({ debtClosed: [{ id: closedId, reason: "removed" }] }),
    },
  );
  await store.appendRecord(
    { ...TRIAGE_AGENT, step: "plan-check" },
    {
      ok: true,
      outcome: outcome({
        planCheck: {
          verdict: "progress",
          evidence: [],
          followUps: [],
          concerns: [
            {
              id: recordedConcernId({
                kind: "uncertainty",
                text: "Answered risk <gone>",
              }),
              action: "resolve",
              reason: "checked",
            },
          ],
        },
      }),
    },
  );
  return recordDirName(architect.seq, architect);
}

/** One waiting, one processed, one routed and one answered steer. */
async function writeTriageSteers(store: TriageStore): Promise<void> {
  await store.mailbox.publish("s-waiting.md", "wait\n");
  await store.mailbox.publish("s-processed.md", "processed\n");
  await store.mailbox.move(
    "inbox",
    "s-processed.md",
    "processed",
    "s-processed.md",
  );
  await store.appendRecord(
    { ...TRIAGE_AGENT, step: "steer-routes", actor: "script" },
    {
      ok: true,
      outcome: outcome({
        steerRoutes: [
          { steer: "s-answered", route: "task", answer: "Filed <as> & done" },
          { steer: "s-routed", route: "architect" },
        ],
      }),
    },
  );
}

/** A goal store with the triage records, mailbox and one launch stop. */
async function triageFixture(): Promise<TriageFixture> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-dashboard-"));
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
  await store.ensureLayout();
  const architectRecord = await writeTriageConcerns(store);
  await writeTriageSteers(store);
  await writeStatus(
    { store, flows: {}, priceSource: offlinePrices(root) },
    TRIAGE_STOP,
  );
  return { root, store, architectRecord };
}

interface StoredTriageStatus {
  openConcerns: { text: string }[];
  steers: { id: string; state: string }[];
  stop?: typeof TRIAGE_STOP;
}

async function triageStored(store: TriageStore): Promise<StoredTriageStatus> {
  return JSON.parse(
    (await store.readFile("status.json"))!,
  ) as StoredTriageStatus;
}

describe("dashboard triage", () => {
  it("shows only open non-FYI concerns with their record links", () => {
    const html = renderDashboard(fixture());

    expect(html).toContain("owner must confirm");
    expect(html).toContain("Cache invalidation needs &lt;follow-up&gt;");
    expect(html).toContain('href="records/00001-i1-architect-r1/"');
    expect(html).toContain('title="c-5f1c0f0a11"');
    expect(html).not.toContain("FYI: the fixture records an fyi note");
  });

  it("hides the stop badge for a done or blocked stop", () => {
    for (const reason of ["done", "blocked"] as const) {
      const html = renderDashboard({ ...fixture(), stop: { reason } });
      expect(html).not.toContain('class="badge stop-');
      expect(html).not.toContain("stopped:");
    }
  });

  it("shows each steer's state and answer", () => {
    const html = renderDashboard(fixture());

    expect(html).toContain('<span class="badge steer-waiting">waiting</span>');
    expect(html).toContain('<span class="badge steer-routed">routed</span>');
    expect(html).toContain(
      '<span class="badge steer-answered">answered</span>',
    );
    expect(html).toContain("Filed as &lt;task&gt; &amp; done");
    expect(html).toContain('href="records/00009-i2-architect-r1/"');
  });
});

it("lists the store's open non-FYI concerns with their record links", async () => {
  const found = await triageFixture();
  try {
    const stored = await triageStored(found.store);
    expect(stored.openConcerns.map((concern) => concern.text).sort()).toEqual([
      "Open debt <shown>",
      "Open risk <shown>",
    ]);
    const html = (await found.store.readFile("dashboard.html"))!;
    expect(html).toContain("Open risk &lt;shown&gt;");
    expect(html).toContain("Open debt &lt;shown&gt;");
    expect(html).not.toContain("FYI note &lt;hidden&gt;");
    expect(html).not.toContain("Answered risk &lt;gone&gt;");
    expect(html).not.toContain("Closed debt &lt;gone&gt;");
    expect(html).toContain(`href="records/${found.architectRecord}/"`);
  } finally {
    fs.rmSync(found.root, { recursive: true, force: true });
  }
}, 30_000);

it("shows the mailbox steers with state and answer", async () => {
  const found = await triageFixture();
  try {
    const stored = await triageStored(found.store);
    expect(stored.steers.map((steer) => [steer.id, steer.state])).toEqual([
      ["s-answered", "answered"],
      ["s-processed", "processed"],
      ["s-routed", "routed"],
      ["s-waiting", "waiting"],
    ]);
    const html = (await found.store.readFile("dashboard.html"))!;
    expect(html).toContain('<span class="badge steer-waiting">waiting</span>');
    expect(html).toContain(
      '<span class="badge steer-processed">processed</span>',
    );
    expect(html).toContain('<span class="badge steer-routed">routed</span>');
    expect(html).toContain(
      '<span class="badge steer-answered">answered</span>',
    );
    expect(html).toContain("Filed &lt;as&gt; &amp; done");
  } finally {
    fs.rmSync(found.root, { recursive: true, force: true });
  }
}, 30_000);

it("shows the launch stop reason in the header badge", async () => {
  const found = await triageFixture();
  try {
    expect((await triageStored(found.store)).stop).toEqual(TRIAGE_STOP);
    const html = (await found.store.readFile("dashboard.html"))!;
    expect(html).toContain(
      '<span class="badge stop-infra">stopped: infrastructure stop</span>',
    );
    expect(html).toContain(TRIAGE_STOP.cause);
  } finally {
    fs.rmSync(found.root, { recursive: true, force: true });
  }
}, 30_000);

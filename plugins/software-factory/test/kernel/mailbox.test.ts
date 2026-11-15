import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatSteers,
  formatSteerTurn,
  holdsDir,
  markProcessed,
  postSteer,
  quarantineDir,
  readHolds,
  scanInbox,
  steerResponses,
  writeOutbox,
} from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";

async function setup(): Promise<{
  root: string;
  store: ReturnType<typeof createFolderStore>;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-mailbox-"));
  const store = createFolderStore(path.join(root, "goal"));
  await store.ensureLayout();
  return { root, store };
}

describe("mailbox", () => {
  it("writes an inbox file by tmp + rename", async () => {
    const { root, store } = await setup();
    try {
      const rel = await postSteer(store, "s1", "Please keep the API stable.");
      expect(rel).toBe("mailbox/inbox/s1.md");
      expect(fs.readFileSync(path.join(store.goalDir, rel), "utf8")).toBe(
        "Please keep the API stable.\n",
      );
      expect(fs.readdirSync(path.join(store.goalDir, "mailbox/.tmp"))).toEqual(
        [],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores an inbox file whose size is still changing", async () => {
    const { root, store } = await setup();
    const file = path.join(store.goalDir, "mailbox/inbox/growing.md");
    try {
      fs.writeFileSync(file, "first\n", "utf8");
      const timer = setInterval(
        () => fs.appendFileSync(file, "more\n", "utf8"),
        10,
      );
      const during = await scanInbox(store, { settleMs: 60 });
      clearInterval(timer);
      expect(during).toEqual([]);

      const after = await scanInbox(store, { settleMs: 20 });
      expect(after.map((s) => s.id)).toEqual(["growing"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("identifies a steer by file name: identical text under a new name is a new steer", async () => {
    const { root, store } = await setup();
    try {
      await postSteer(store, "s1", "One decision, please.");
      const [first] = await scanInbox(store, { settleMs: 0 });
      expect(first?.id).toBe("s1");
      await writeOutbox(store, first!.id, `# Steer ${first!.id}\n\nAccepted.`);
      await markProcessed(store, first!);
      await markProcessed(store, first!); // crash replay: already moved

      // Same text, different file name: a second steer the architect must answer.
      await postSteer(store, "s2", "One decision, please.");
      const steers = await scanInbox(store, { settleMs: 0 });
      expect(steers.map((s) => s.id)).toEqual(["s2"]);
      expect(
        fs.existsSync(path.join(store.goalDir, "mailbox/inbox/s2.md")),
      ).toBe(true);

      // Same file name again: a replay of the processed steer, archived silently.
      await postSteer(store, "s1", "One decision, please.");
      expect(
        (await scanInbox(store, { settleMs: 0 })).map((s) => s.id),
      ).toEqual(["s2"]);
      expect(
        fs.existsSync(path.join(store.goalDir, "mailbox/inbox/s1.md")),
      ).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads one hold per steer and ignores files that are not hold YAML", async () => {
    const { root, store } = await setup();
    try {
      const dir = holdsDir(store);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "s1.yaml"),
        "slugs: [alpha, beta]\ngoal: false\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(dir, "s2.yaml"),
        "slugs: []\ngoal: true\n",
        "utf8",
      );
      fs.writeFileSync(path.join(dir, "notes.txt"), "not a hold\n", "utf8");
      fs.writeFileSync(
        path.join(dir, ".draft.yaml"),
        "slugs: [ghost]\ngoal: false\n",
        "utf8",
      );

      expect(await readHolds(store)).toEqual([
        { steer: "s1", slugs: ["alpha", "beta"], goal: false },
        { steer: "s2", slugs: [], goal: true },
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("quarantines a malformed hold with a record instead of wedging the launch", async () => {
    const { root, store } = await setup();
    try {
      const dir = holdsDir(store);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "s1.yaml"),
        "slugs: alpha\ngoal: false\n",
        "utf8",
      );
      fs.writeFileSync(path.join(dir, "s2.yaml"), "slugs: [unclosed\n", "utf8");
      fs.writeFileSync(
        path.join(dir, "s3.yaml"),
        "slugs: []\ngoal: true\n",
        "utf8",
      );

      expect(await readHolds(store)).toEqual([
        { steer: "s3", slugs: [], goal: true },
      ]);
      const quarantine = quarantineDir(store);
      expect(fs.readdirSync(quarantine).sort()).toEqual(["s1.yaml", "s2.yaml"]);
      expect(
        fs.readFileSync(path.join(quarantine, "s1.yaml"), "utf8"),
      ).toContain("slugs: alpha");
      expect(fs.existsSync(path.join(dir, "s1.yaml"))).toBe(false);

      const records = (await store.listRecords()).filter(
        (r) => r.step === "hold-quarantine",
      );
      expect(records).toHaveLength(2);
      expect(records[0]?.ok).toBe(false);
      expect(records[0]?.cause).toContain('"s1.yaml"');
      expect(records[1]?.cause).toContain('"s2.yaml"');

      // A later read has nothing left to quarantine and appends no second record.
      expect(await readHolds(store)).toEqual([
        { steer: "s3", slugs: [], goal: true },
      ]);
      expect(
        (await store.listRecords()).filter((r) => r.step === "hold-quarantine"),
      ).toHaveLength(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses steer answers only from steer <id>: lines", async () => {
    const responses = steerResponses(
      {
        status: "done",
        summary: "s",
        concerns: [],
        forward: [
          "steer s1: keep names",
          "unrelated remark",
          "steer plan.x: split it",
          "steer unknown: ignored without a pending steer",
        ],
      },
      ["s1", "plan.x"],
    );
    expect([...responses.entries()]).toEqual([
      ["s1", "keep names"],
      ["plan.x", "split it"],
    ]);
    expect(formatSteers([])).toBe("none");
    const { root, store } = await setup();
    try {
      await postSteer(store, "s3", "line one\nline two");
      const steers = await scanInbox(store, { settleMs: 0 });
      expect(formatSteers(steers)).toBe("- s3 (mailbox/inbox/s3.md): line one");
      expect(formatSteerTurn(steers)).toBe(
        "- s3 (mailbox/inbox/s3.md):\n  line one\n  line two",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("answers steer ids containing spaces, colons and quotes", async () => {
    const responses = steerResponses(
      {
        status: "done",
        summary: "s",
        concerns: [],
        forward: [
          "steer my steer: keep names",
          "steer a:b: split it",
          'steer we"ird: quoted too',
          "steer a: wrong split for a:b must not win",
        ],
      },
      ["my steer", "a:b", 'we"ird', "a"],
    );
    expect(responses.get("my steer")).toBe("keep names");
    expect(responses.get("a:b")).toBe("split it");
    expect(responses.get('we"ird')).toBe("quoted too");
    // The longest id wins: "a:b: split it" answers a:b, not a.
    expect(responses.get("a")).toBe("wrong split for a:b must not win");
  });

  it("quarantines a hold naming an unknown slug", async () => {
    const { root, store } = await setup();
    try {
      const dir = holdsDir(store);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "s1.yaml"),
        "slugs: [alpha, ghost]\ngoal: false\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(dir, "s2.yaml"),
        "slugs: [alpha]\ngoal: false\n",
        "utf8",
      );
      expect(
        await readHolds(store, { iteration: 3, knownSlugs: ["alpha"] }),
      ).toEqual([{ steer: "s2", slugs: ["alpha"], goal: false }]);
      expect(fs.readdirSync(quarantineDir(store))).toEqual(["s1.yaml"]);
      const records = (await store.listRecords()).filter(
        (r) => r.step === "hold-quarantine",
      );
      expect(records).toHaveLength(1);
      expect(records[0]?.iteration).toBe(3);
      expect(records[0]?.cause).toContain('"s1.yaml"');
      expect(records[0]?.cause).toContain("ghost");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("records quarantines in the caller's iteration, not the max record", async () => {
    const { root, store } = await setup();
    try {
      await store.appendRecord(
        { iteration: 5, step: "architect", round: 1, actor: "agent" },
        { ok: true },
      );
      const dir = holdsDir(store);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "s9.yaml"), "slugs: [oops\n", "utf8");
      expect(await readHolds(store, { iteration: 9 })).toEqual([]);
      const records = (await store.listRecords()).filter(
        (r) => r.step === "hold-quarantine",
      );
      expect(records).toHaveLength(1);
      expect(records[0]?.iteration).toBe(9);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

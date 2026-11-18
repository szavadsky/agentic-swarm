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
  const store = createFolderStore(path.join(root, "goal"), undefined, {});
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

  it("reads the urgent flag from frontmatter and keeps the header out of the steer text", async () => {
    const { root, store } = await setup();
    try {
      await postSteer(
        store,
        "s1",
        "---\nurgent: true\n---\nStop the rollout and consult me.",
      );
      await postSteer(store, "s2", "Take your time with this one.");
      // A leading rule that parses as prose is not frontmatter: keep it as text.
      await postSteer(store, "s3", "---\nTake your time.\n---\nBody");
      // Malformed YAML is not metadata either; the steer still reaches the PM.
      await postSteer(store, "s4", "---\nurgent: [\n---\nBody");
      // Prose with a colon parses as a mapping but carries no recognized key.
      await postSteer(store, "s5", "---\nNote: take your time.\n---\nBody");
      // A recognized key still needs its boolean value to count as metadata.
      await postSteer(store, "s6", '---\nurgent: "yes"\n---\nBody');
      const steers = await scanInbox(store, { settleMs: 0 });
      expect(
        steers.map((steer) => ({
          id: steer.id,
          urgent: steer.urgent,
          text: steer.text,
        })),
      ).toEqual([
        { id: "s1", urgent: true, text: "Stop the rollout and consult me.\n" },
        { id: "s2", urgent: false, text: "Take your time with this one.\n" },
        {
          id: "s3",
          urgent: false,
          text: "---\nTake your time.\n---\nBody\n",
        },
        { id: "s4", urgent: false, text: "---\nurgent: [\n---\nBody\n" },
        {
          id: "s5",
          urgent: false,
          text: "---\nNote: take your time.\n---\nBody\n",
        },
        {
          id: "s6",
          urgent: false,
          text: '---\nurgent: "yes"\n---\nBody\n',
        },
      ]);
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

      expect(await readHolds(store)).toEqual({
        holds: [
          { steer: "s1", slugs: ["alpha", "beta"], goal: false },
          { steer: "s2", slugs: [], goal: true },
        ],
        findings: [],
      });
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
});

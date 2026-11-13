import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatSteers,
  markProcessed,
  postSteer,
  scanInbox,
  steerResponses,
  writeOutbox,
} from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";

async function setup(): Promise<{ root: string; store: ReturnType<typeof createFolderStore> }> {
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
      expect(fs.readFileSync(path.join(store.goalDir, rel), "utf8")).toBe("Please keep the API stable.\n");
      expect(fs.readdirSync(path.join(store.goalDir, "mailbox/.tmp"))).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores an inbox file whose size is still changing", async () => {
    const { root, store } = await setup();
    const file = path.join(store.goalDir, "mailbox/inbox/growing.md");
    try {
      fs.writeFileSync(file, "first\n", "utf8");
      const timer = setInterval(() => fs.appendFileSync(file, "more\n", "utf8"), 10);
      const during = await scanInbox(store, { settleMs: 60 });
      clearInterval(timer);
      expect(during).toEqual([]);

      const after = await scanInbox(store, { settleMs: 20 });
      expect(after.map((s) => s.id)).toEqual(["growing"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("is idempotent by content hash across a replay", async () => {
    const { root, store } = await setup();
    try {
      await postSteer(store, "s1", "One decision, please.");
      const [first] = await scanInbox(store, { settleMs: 0 });
      expect(first?.id).toBe("s1");
      await writeOutbox(store, first!.id, `# Steer ${first!.id}\n\nAccepted.`);
      await markProcessed(store, first!);
      await markProcessed(store, first!); // crash replay: already moved

      await postSteer(store, "s2", "One decision, please.");
      expect(await scanInbox(store, { settleMs: 0 })).toEqual([]);
      expect(fs.existsSync(path.join(store.goalDir, "mailbox/inbox/s2.md"))).toBe(false);
      const processed = fs.readdirSync(path.join(store.goalDir, "mailbox/processed")).sort();
      expect(processed).toHaveLength(2);
      expect(processed[0]).toBe("s1.md");
      expect(processed[1]).toMatch(/^s2\.[0-9a-f]{8}\.md$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses steer answers only from steer <id>: lines", async () => {
    const responses = steerResponses({
      status: "done",
      summary: "s",
      concerns: [],
      forward: ["steer s1: keep names", "unrelated remark", "steer plan.x: split it"],
    });
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
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
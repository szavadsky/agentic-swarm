import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { postSteer, scanInbox } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";

describe("repro E10: duplicate steer content archived silently", () => {
  it("archives a new steer whose content hash matches an already processed steer", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-repro-e10-"));
    try {
      const store = createFolderStore(path.join(root, "goal"));
      await store.ensureLayout();
      const text = "Please keep the API stable.\n";
      fs.writeFileSync(
        path.join(store.goalDir, "mailbox", "processed", "s0.md"),
        text,
        "utf8"
      );
      await postSteer(store, "s2", text.trim());

      const steers = await scanInbox(store, { settleMs: 0 });
      expect(steers).toEqual([]);
      expect(fs.readdirSync(path.join(store.goalDir, "mailbox", "inbox"))).toEqual([]);
      const suffix = createHash("sha1").update(text, "utf8").digest("hex").slice(0, 8);
      const processed = fs.readdirSync(
        path.join(store.goalDir, "mailbox", "processed")
      ).sort();
      expect(processed).toEqual(["s0.md", `s2.${suffix}.md`]);
      // The only outbox writer is the boundary answer path, driven by the
      // Steer[] list scanInbox returns; the duplicate never gets a reply.
      expect(fs.readdirSync(path.join(store.goalDir, "mailbox", "outbox"))).toEqual([]);
      expect(await scanInbox(store, { settleMs: 0 })).toEqual([]);
      console.log("E10 steers:", JSON.stringify(steers), "processed:", processed.join(","), "outbox:", JSON.stringify(fs.readdirSync(path.join(store.goalDir, "mailbox", "outbox"))));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

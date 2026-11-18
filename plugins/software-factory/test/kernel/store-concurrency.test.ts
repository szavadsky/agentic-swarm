import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFolderStore } from "../../src/kernel/store.js";

describe("record store under concurrent dispatch", () => {
  it("allocates unique sequence numbers for concurrent turns", async () => {
    const goalDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-store-race-"),
    );
    try {
      const store = createFolderStore(goalDir, undefined, {});
      await store.ensureLayout();
      const turns = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          store.startRecord({
            iteration: 1,
            slug: `task-${i}`,
            step: "implement",
            round: 1,
            actor: "agent",
            alias: "implementer",
            model: { id: "fake" },
          }),
        ),
      );
      const seqs = turns.map((t) => t.meta.seq);
      expect(new Set(seqs).size).toBe(20);
      expect(Math.min(...seqs)).toBe(1);
      expect(Math.max(...seqs)).toBe(20);
      await Promise.all(turns.map((t) => t.finish({ ok: true })));
      expect((await store.listRecords()).length).toBe(20);
    } finally {
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  }, 20_000);
});

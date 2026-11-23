import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drainHeldNotes, postSteer } from "../../src/kernel/mailbox.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";

function tempGoal(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "steer-held-note-"));
}

type TestStore = ReturnType<typeof createFolderStore>;

function outbox(store: TestStore, steer: string): string | null {
  return fs.existsSync(
    path.join(store.goalDir, "mailbox/outbox", `steer-${steer}.md`),
  )
    ? fs.readFileSync(
        path.join(store.goalDir, "mailbox/outbox", `steer-${steer}.md`),
        "utf8",
      )
    : null;
}

async function route(
  store: TestStore,
  steer: string,
  to: "architect" | { architect: string },
): Promise<void> {
  await store.appendRecord(scriptMeta(1, "steer-routes", { round: 1 }), {
    ok: true,
    outcome: {
      status: "done",
      summary: `steer routes: ${steer}`,
      concerns: [],
      forward: [],
      steerRoutes: [{ steer, route: to }],
    },
  });
}

describe("drainHeldNotes", () => {
  it("writes one provisional note per routed steer and keeps the inbox file", async () => {
    const goalDir = tempGoal();
    try {
      const store = createFolderStore(goalDir, undefined, {});
      await postSteer(store, "s1", "Keep the public API names stable.");
      await route(store, "s1", "architect");

      await drainHeldNotes(store);
      const note = outbox(store, "s1");
      expect(note).toContain("Held, not yet processed");
      expect(note).toContain("Source: mailbox/inbox/s1.md");
      expect(fs.existsSync(path.join(goalDir, "mailbox/inbox/s1.md"))).toBe(
        true,
      );

      await drainHeldNotes(store);
      expect(outbox(store, "s1")).toBe(note);
    } finally {
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("leaves a steer the stop never routed pending without an answer", async () => {
    const goalDir = tempGoal();
    try {
      const store = createFolderStore(goalDir, undefined, {});
      await postSteer(store, "s1", "Keep the public API names stable.");

      await drainHeldNotes(store);
      expect(outbox(store, "s1")).toBeNull();
      expect(fs.existsSync(path.join(goalDir, "mailbox/inbox/s1.md"))).toBe(
        true,
      );
    } finally {
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps an answer that landed before its mark-processed", async () => {
    const goalDir = tempGoal();
    try {
      const store = createFolderStore(goalDir, undefined, {});
      await postSteer(store, "s1", "Keep the public API names stable.");
      await route(store, "s1", { architect: "main" });
      fs.mkdirSync(path.join(goalDir, "mailbox/outbox"), { recursive: true });
      fs.writeFileSync(
        path.join(goalDir, "mailbox/outbox/steer-s1.md"),
        "# Steer s1\n\nnames stay, internals only\n\nSource: mailbox/inbox/s1.md\n",
        "utf8",
      );

      await drainHeldNotes(store);
      expect(outbox(store, "s1")).not.toContain("Held, not yet processed");
      expect(outbox(store, "s1")).toContain("names stay, internals only");
    } finally {
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  }, 60_000);
});

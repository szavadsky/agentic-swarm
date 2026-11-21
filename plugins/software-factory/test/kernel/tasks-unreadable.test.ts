import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { derive } from "../../src/kernel/derive.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { parseTaskFile } from "../../src/kernel/tasks.js";
import { causeText } from "./helpers.js";
import { TEXT } from "./tasks-fixtures.js";

describe("unreadable task files", () => {
  registerUnreadableTaskFilesPart1();
  registerUnreadableTaskFilesPart2();
});

function registerUnreadableTaskFilesPart1(): void {
  it("quarantines one, reports it, and still lists the readable tasks", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-task-quarantine-"),
    );
    try {
      const store = createFolderStore(path.join(root, "goal"), undefined, {});
      await store.ensureLayout();
      fs.writeFileSync(
        path.join(store.tasksDir, "broken.md"),
        "half-written\n",
        "utf8",
      );
      await store.writeTask(parseTaskFile(TEXT, "auth.token-refresh"));

      await store.sweepTasks(1);
      const tasks = await store.listTasks();
      expect(tasks.map((candidate) => candidate.slug)).toEqual([
        "auth.token-refresh",
      ]);

      const quarantined = path.join(store.tasksDir, "quarantine", "broken.md");
      expect(fs.existsSync(path.join(store.tasksDir, "broken.md"))).toBe(false);
      expect(fs.readFileSync(quarantined, "utf8")).toBe("half-written\n");

      const report = (await store.listRecords()).find(
        (record) => record.step === "task-quarantine",
      );
      expect(report?.ok).toBe(false);
      expect(report?.iteration).toBe(1);
      expect(report?.slug).toBe("broken");
      expect(causeText(report?.cause)).toContain(
        'task "broken" has no --- frontmatter ---',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerUnreadableTaskFilesPart2(): void {
  it("leaves a terminal slug's unreadable file in place and reports it once", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-task-terminal-"),
    );
    try {
      const store = createFolderStore(path.join(root, "goal"), undefined, {});
      await store.ensureLayout();
      const terminal = [
        { slug: "merged-task", step: "merge" },
        { slug: "finished-spike", step: "finish" },
        { slug: "cancelled-task", step: "cancel" },
      ];
      for (const { slug, step } of terminal) {
        await store.appendRecord(
          { iteration: 1, slug, step, round: 1, actor: "script" },
          { ok: true, commit: "c0ffee" },
        );
        fs.writeFileSync(
          path.join(store.tasksDir, `${slug}.md`),
          "torn write\n",
          "utf8",
        );
      }
      await store.sweepTasks(1);

      expect(await store.listTasks()).toEqual([]);

      const state = derive([], await store.listRecords());
      expect(state.tasks["merged-task"]!.status).toBe("merged");
      expect(state.tasks["finished-spike"]!.status).toBe("finished");
      expect(state.tasks["cancelled-task"]!.status).toBe("cancelled");

      for (const { slug } of terminal) {
        expect(
          fs.readFileSync(path.join(store.tasksDir, `${slug}.md`), "utf8"),
        ).toBe("torn write\n");
        expect(
          fs.existsSync(path.join(store.tasksDir, "quarantine", `${slug}.md`)),
        ).toBe(false);
      }
      const reports = (await store.listRecords()).filter(
        (record) => record.step === "task-quarantine",
      );
      expect(reports).toHaveLength(terminal.length);
      expect(
        reports.map((record) => causeText(record.cause)).join("\n"),
      ).toContain("left in tasks/");

      await store.listTasks();
      expect(
        (await store.listRecords()).filter(
          (record) => record.step === "task-quarantine",
        ),
      ).toHaveLength(terminal.length);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

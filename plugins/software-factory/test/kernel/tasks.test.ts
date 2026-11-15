import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  doneWhen,
  isValidTaskSlug,
  materialHash,
  parseTaskFile,
  renderTaskFile,
  validateTaskGraph,
} from "../../src/kernel/tasks.js";
import { cleanup, makeGoal, outcome, writePlan } from "./e2e-helpers.js";
import { task } from "./helpers.js";

const TEXT = `---
slug: auth.token-refresh
title: Refresh tokens
kind: task
flow: implement-review
deps: [auth.session-store]
scope: [auth]
tier: default
source: Milestone auth / refresh
---

Why: rotate without a re-login.
Done when: refresh rotates the token.
`;

describe("task files", () => {
  it("parses and renders the frontmatter plus brief", () => {
    const parsed = parseTaskFile(TEXT, "auth.token-refresh");
    expect(parsed.slug).toBe("auth.token-refresh");
    expect(parsed.deps).toEqual(["auth.session-store"]);
    expect(parsed.scope).toEqual(["auth"]);
    expect(doneWhen(parsed.body)).toBe("Done when: refresh rotates the token.");
    const round = parseTaskFile(renderTaskFile(parsed), parsed.slug);
    expect(round).toEqual(parsed);
  });

  it("rejects a file whose declared slug disagrees with its name", () => {
    expect(() => parseTaskFile(TEXT, "other-slug")).toThrow(
      /slugs are immutable/,
    );
  });

  it("hashes material fields, not cosmetic body prose", () => {
    const base = parseTaskFile(TEXT, "auth.token-refresh");
    const cosmetic = {
      ...base,
      body: `${base.body.replace(/\n/g, "  \n")}\n\nmore notes`,
    };
    expect(materialHash(cosmetic)).toBe(materialHash(base));
    expect(materialHash({ ...base, deps: [] })).not.toBe(materialHash(base));
    expect(
      materialHash({ ...base, body: "Done when: something else" }),
    ).not.toBe(materialHash(base));
    expect(materialHash({ ...base, base: "auth.old" })).not.toBe(
      materialHash(base),
    );
  });

  it("accepts namespaced slugs only", () => {
    expect(isValidTaskSlug("auth.token-refresh")).toBe(true);
    expect(isValidTaskSlug("a.b-c")).toBe(true);
    expect(isValidTaskSlug("Upper")).toBe(false);
    expect(isValidTaskSlug("a..b")).toBe(false);
  });

  it("finds missing deps, self deps, cycles, duplicates and bad bases", () => {
    const findings = validateTaskGraph(
      [
        task("a", { deps: ["b"] }),
        task("b", { deps: ["a"] }),
        task("c", { deps: ["missing"] }),
        task("d", { deps: ["d"] }),
        task("a"),
      ],
      { parked: new Set() },
    );
    expect(findings.some((f) => f.includes("cycle"))).toBe(true);
    expect(findings.some((f) => f.includes("missing task"))).toBe(true);
    expect(findings.some((f) => f.includes("itself"))).toBe(true);
    expect(findings.some((f) => f.includes("declared twice"))).toBe(true);
  });

  it("requires a base to name a parked task when a parked set is supplied", () => {
    const tasks = [
      task("old", { scope: ["old-area"] }),
      task("new", { base: "old", scope: ["new-area"] }),
    ];
    expect(validateTaskGraph(tasks, { parked: new Set() })).toContain(
      'task "new" continues "old", which is not parked',
    );
    expect(validateTaskGraph(tasks, { parked: new Set(["old"]) })).toEqual([]);
  });

  it("rejects a task with no scope", () => {
    const findings = validateTaskGraph([task("narrow", { scope: [] })]);
    expect(findings).toContain(
      'task "narrow" has no scope: declare the predicted area it works in',
    );
  });
});

describe("unreadable task files", () => {
  it("quarantines one, reports it, and still lists the readable tasks", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-task-quarantine-"),
    );
    try {
      const store = createFolderStore(path.join(root, "goal"));
      await store.ensureLayout();
      fs.writeFileSync(
        path.join(store.tasksDir, "broken.md"),
        "half-written\n",
        "utf8",
      );
      await store.writeTask(parseTaskFile(TEXT, "auth.token-refresh"));

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
      expect(report?.cause).toContain(
        'task "broken" has no --- frontmatter ---',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves a terminal slug's unreadable file in place and reports it once", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-task-terminal-"),
    );
    try {
      const store = createFolderStore(path.join(root, "goal"));
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

      expect(await store.listTasks()).toEqual([]);

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
      expect(reports.map((record) => record.cause).join("\n")).toContain(
        "left in tasks/",
      );

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

  it("does not reject a launch while a half-written task file exists", async () => {
    const goal = makeGoal();
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      fs.mkdirSync(goal.tasksDir, { recursive: true });
      fs.writeFileSync(
        path.join(goal.tasksDir, "broken.md"),
        "half-written task body with no frontmatter\n",
        "utf8",
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "the plan needs nothing yet",
            decision: "blocked",
          }),
        );
        return fakeTurnResult(req);
      });

      const run = () =>
        runGoal({
          repo: goal.repo.dir,
          goal: "demo",
          iterations: 1,
          harnesses: { fake: harness },
          baseGates: false,
        });
      expect((await run()).stop).toBe("blocked");
      expect(
        fs.readFileSync(
          path.join(goal.tasksDir, "quarantine", "broken.md"),
          "utf8",
        ),
      ).toContain("half-written");
      // The next launch must find no unreadable file left to wedge it.
      expect((await run()).stop).toBe("blocked");
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

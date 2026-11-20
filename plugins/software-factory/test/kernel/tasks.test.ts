// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { derive } from "../../src/kernel/derive.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  doneWhen,
  isValidTaskSlug,
  materialHash,
  parseTaskFile,
  renderTaskFile,
  validateTaskFlows,
  validateTaskGraph,
} from "../../src/kernel/tasks.js";
import type { TaskStatus } from "../../src/kernel/types.js";
import { task, causeText } from "./helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

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

const TYPES = {
  development: {
    flow: "implement-review",
    kind: "development" as const,
    schema: "outcome",
  },
  spike: { flow: "spike", kind: "spike" as const, schema: "outcome" },
};

const TYPED = `---
slug: auth.probe
title: Probe the token store
type: spike
deps: []
scope: [auth]
---

Done when: the finding names the store.
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

  it("parses, renders and hashes the owning epic", () => {
    const withEpic = TEXT.replace("tier: default", "epic: auth\ntier: default");
    const parsed = parseTaskFile(withEpic, "auth.token-refresh");
    expect(parsed.epic).toBe("auth");
    expect(renderTaskFile(parsed)).toContain("epic: auth");
    const round = parseTaskFile(renderTaskFile(parsed), parsed.slug);
    expect(round.epic).toBe("auth");
    expect(materialHash({ ...parsed, epic: "billing" })).not.toBe(
      materialHash(parsed),
    );
    expect(parseTaskFile(TEXT, "auth.token-refresh").epic).toBeUndefined();
  });

  it("requires an epic's tasks to be namespaced under it", () => {
    expect(
      validateTaskGraph([task("auth.login", { epic: "auth", scope: ["x"] })]),
    ).toEqual([]);
    expect(
      validateTaskGraph([
        task("billing.login", { epic: "auth", scope: ["x"] }),
      ]),
    ).toContain(
      'task "billing.login" names epic "auth": an epic\'s tasks are named "auth.<name>"',
    );
    expect(
      validateTaskGraph([task("auth.login", { epic: "Auth", scope: ["x"] })]),
    ).toContain(
      'task "auth.login" names epic "Auth": an epic id is [a-z0-9-]+',
    );
  });

  it("resolves a task type into its flow and kind and renders only the type", () => {
    const parsed = parseTaskFile(TYPED, "auth.probe", TYPES);
    expect(parsed.type).toBe("spike");
    expect(parsed.kind).toBe("spike");
    expect(parsed.flow).toBe("spike");
    const rendered = renderTaskFile(parsed);
    expect(rendered).toContain("type: spike");
    expect(rendered).not.toContain("kind:");
    expect(rendered).not.toContain("flow:");
    expect(parseTaskFile(rendered, "auth.probe", TYPES)).toEqual(parsed);
  });

  it("refuses a type the process config does not define", () => {
    expect(() => parseTaskFile(TYPED, "auth.probe")).toThrow(
      'task "auth.probe" has type "spike": type "spike" is not configured',
    );
    expect(() => parseTaskFile(TYPED, "auth.probe", TYPES)).not.toThrow();
  });

  it("refuses a type named after an inherited object key", () => {
    for (const type of ["constructor", "toString", "__proto__"]) {
      const text = TYPED.replace("type: spike", `type: ${type}`);
      expect(() => parseTaskFile(text, "auth.probe", TYPES)).toThrow(
        `task "auth.probe" has type "${type}": type "${type}" is not configured`,
      );
    }
  });

  it("refuses a file that names a type and a legacy field", () => {
    const mixed = TYPED.replace("type: spike", "type: spike\nkind: spike");
    expect(() => parseTaskFile(mixed, "auth.probe", TYPES)).toThrow(
      'task "auth.probe" names type "spike" and legacy kind: the type supplies flow and kind',
    );
  });

  it("reads a legacy kind as development or spike", () => {
    expect(parseTaskFile(TEXT, "auth.token-refresh").kind).toBe("development");
    const spike = TEXT.replace("kind: task", "kind: spike").replace(
      "flow: implement-review",
      "flow: spike",
    );
    expect(parseTaskFile(spike, "auth.token-refresh").kind).toBe("spike");
  });

  it("hashes the task type, so a retype is material", () => {
    const legacy = parseTaskFile(TEXT, "auth.token-refresh");
    const typed = parseTaskFile(
      TEXT.replace("kind: task\nflow: implement-review", "type: development"),
      "auth.token-refresh",
      TYPES,
    );
    expect(typed.kind).toBe("development");
    expect(materialHash(typed)).not.toBe(materialHash(legacy));
  });

  it("rejects a file whose declared slug disagrees with its name", () => {
    expect(() => parseTaskFile(TEXT, "other-slug")).toThrow(
      /slugs are immutable/,
    );
  });

  it("parses an optional repairTurns override and round-trips it", () => {
    const withOverride = TEXT.replace(
      "source: Milestone auth / refresh",
      "source: Milestone auth / refresh\nrepairTurns: 1",
    );
    const parsed = parseTaskFile(withOverride, "auth.token-refresh");
    expect(parsed.repairTurns).toBe(1);
    const round = parseTaskFile(renderTaskFile(parsed), parsed.slug);
    expect(round.repairTurns).toBe(1);
    expect(
      parseTaskFile(TEXT, "auth.token-refresh").repairTurns,
    ).toBeUndefined();
    expect(materialHash({ ...parsed, repairTurns: 5 })).toBe(
      materialHash(parsed),
    );
  });

  it("rejects a non-integer repairTurns override", () => {
    const bad = TEXT.replace(
      "source: Milestone auth / refresh",
      "source: Milestone auth / refresh\nrepairTurns: many",
    );
    expect(() => parseTaskFile(bad, "auth.token-refresh")).toThrow(
      /repairTurns/,
    );
  });

  it("parses an optional turnMinutes override and round-trips it", () => {
    const withOverride = TEXT.replace(
      "source: Milestone auth / refresh",
      "source: Milestone auth / refresh\nturnMinutes: 45",
    );
    const parsed = parseTaskFile(withOverride, "auth.token-refresh");
    expect(parsed.turnMinutes).toBe(45);
    const round = parseTaskFile(renderTaskFile(parsed), parsed.slug);
    expect(round.turnMinutes).toBe(45);
    expect(
      parseTaskFile(TEXT, "auth.token-refresh").turnMinutes,
    ).toBeUndefined();
    expect(materialHash({ ...parsed, turnMinutes: 5 })).toBe(
      materialHash(parsed),
    );
  });

  it("rejects a non-positive turnMinutes override", () => {
    const bad = TEXT.replace(
      "source: Milestone auth / refresh",
      "source: Milestone auth / refresh\nturnMinutes: 0",
    );
    expect(() => parseTaskFile(bad, "auth.token-refresh")).toThrow(
      /turnMinutes/,
    );
    const words = TEXT.replace(
      "source: Milestone auth / refresh",
      "source: Milestone auth / refresh\nturnMinutes: soon",
    );
    expect(() => parseTaskFile(words, "auth.token-refresh")).toThrow(
      /turnMinutes/,
    );
  });

  it("parses an optional revision and round-trips it", () => {
    expect(parseTaskFile(TEXT, "auth.token-refresh").revision).toBe(0);
    const amended = TEXT.replace(
      "source: Milestone auth / refresh",
      "source: Milestone auth / refresh\nrevision: 2",
    );
    const parsed = parseTaskFile(amended, "auth.token-refresh");
    expect(parsed.revision).toBe(2);
    expect(parseTaskFile(renderTaskFile(parsed), parsed.slug)).toEqual(parsed);
    expect(
      renderTaskFile(parseTaskFile(TEXT, "auth.token-refresh")),
    ).not.toContain("revision:");
  });

  it("rejects a negative or fractional revision", () => {
    for (const value of ["-1", "1.5", "two"]) {
      const bad = TEXT.replace(
        "source: Milestone auth / refresh",
        `source: Milestone auth / refresh\nrevision: ${value}`,
      );
      expect(() => parseTaskFile(bad, "auth.token-refresh")).toThrow(
        /revision/,
      );
    }
  });

  it("refuses the undeclared after alias", () => {
    const legacy = TEXT.replace(
      "deps: [auth.session-store]",
      "after: [auth.session-store]",
    );
    expect(() => parseTaskFile(legacy, "auth.token-refresh")).toThrow(
      '"after" is not accepted: use "deps"',
    );
  });

  it("defaults the fields the schema allows to be absent", () => {
    const minimal = `---
slug: auth.token-refresh
title: Refresh tokens
---

Done when: refresh rotates the token.
`;
    const parsed = parseTaskFile(minimal, "auth.token-refresh");
    expect(parsed.kind).toBe("development");
    expect(parsed.flow).toBe("implement-review");
    expect(parsed.deps).toEqual([]);
    expect(parsed.scope).toEqual([]);
    expect(parsed.source).toBe("");
    expect(parsed.revision).toBe(0);
    expect(parsed.tier).toBeUndefined();
    expect(parsed.base).toBeUndefined();
  });

  it("hashes the revision, so an amend is material", () => {
    const base = parseTaskFile(TEXT, "auth.token-refresh");
    expect(materialHash({ ...base, revision: 1 })).not.toBe(materialHash(base));
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
    const findings = validateTaskGraph([
      task("a", { deps: ["b"] }),
      task("b", { deps: ["a"] }),
      task("c", { deps: ["missing"] }),
      task("d", { deps: ["d"] }),
      task("a"),
    ]);
    expect(findings.some((f) => f.includes("cycle"))).toBe(true);
    expect(findings.some((f) => f.includes("missing task"))).toBe(true);
    expect(findings.some((f) => f.includes("itself"))).toBe(true);
    expect(findings.some((f) => f.includes("declared twice"))).toBe(true);
  });

  it("exempts a terminal continuation from base findings", () => {
    // delta i5: three continuations of bases the plan cancelled as landed.
    // Two continuations are merged, one parked; the cancelled files remain.
    const tasks = [
      task("gate-handoff-log", { scope: ["flow"] }),
      task("gate-handoff-land", { scope: ["flow"], base: "gate-handoff-log" }),
      task("kept-land-live", { scope: ["integrate"] }),
      task("kept-land-fix", { scope: ["integrate"], base: "kept-land-live" }),
      task("metrics-attrib", { scope: ["metrics"] }),
      task("metrics-attrib-land", {
        scope: ["metrics"],
        base: "metrics-attrib",
      }),
    ];
    const status = new Map<string, TaskStatus>([
      ["gate-handoff-log", "cancelled"],
      ["gate-handoff-land", "merged"],
      ["kept-land-live", "cancelled"],
      ["kept-land-fix", "parked"],
      ["metrics-attrib", "cancelled"],
      ["metrics-attrib-land", "merged"],
    ]);
    expect(validateTaskGraph(tasks, { status })).toEqual([]);
  });

  it("names the base's state on a live continuation", () => {
    const tasks = [
      task("old", { scope: ["old-area"] }),
      task("new", { scope: ["new-area"], base: "old" }),
    ];
    const parked = new Map<string, TaskStatus>([
      ["old", "parked"],
      ["new", "ready"],
    ]);
    expect(validateTaskGraph(tasks, { status: parked })).toEqual([]);
    for (const state of ["merged", "cancelled", "finished"] as const) {
      expect(
        validateTaskGraph(tasks, { status: new Map(parked).set("old", state) }),
      ).toEqual([`task "new" continues "old", which is ${state}`]);
    }
  });

  it("counts a task with no state entry as live", () => {
    const tasks = [
      task("old", { scope: ["old-area"] }),
      task("new", { scope: ["new-area"], base: "old" }),
    ];
    expect(validateTaskGraph(tasks, { status: new Map() })).toEqual([
      'task "new" continues "old", which is not parked',
    ]);
    // A live continuation of a base the state records as cancelled names that
    // state even after the base's task file is gone.
    expect(
      validateTaskGraph([tasks[1]!], {
        status: new Map([["old", "cancelled"]]),
      }),
    ).toEqual(['task "new" continues "old", which is cancelled']);
  });

  it("still checks duplicates, scope and cycles on terminal tasks", () => {
    const findings = validateTaskGraph(
      [
        task("a", { scope: [], deps: ["b"] }),
        task("a", { scope: [], deps: ["b"] }),
        task("b", { scope: ["b"], deps: ["a"] }),
      ],
      {
        status: new Map([
          ["a", "merged"],
          ["b", "merged"],
        ]),
      },
    );
    expect(findings).toContain(
      'task "a" has no scope: declare the predicted area it works in',
    );
    expect(findings.some((f) => f.includes("declared twice"))).toBe(true);
    expect(findings.some((f) => f.includes("cycle"))).toBe(true);
  });

  it("rejects a task with no scope", () => {
    const findings = validateTaskGraph([task("narrow", { scope: [] })]);
    expect(findings).toContain(
      'task "narrow" has no scope: declare the predicted area it works in',
    );
  });

  it("rejects an unknown kind with the kernel finding", () => {
    const bad = TEXT.replace("kind: task", "kind: banana");
    expect(() => parseTaskFile(bad, "auth.token-refresh")).toThrow(
      'task "auth.token-refresh" has kind "banana": expected "development" or "spike" (legacy "task" reads as development)',
    );
  });

  it("rejects an unknown flow with the dispatcher text", () => {
    const flows = {
      "implement-review": {
        steps: [
          { id: "implement", prompt: "implementer", alias: "implementer" },
        ],
      },
    };
    expect(validateTaskFlows([task("a", { scope: ["x"] })], flows)).toEqual([]);
    expect(
      validateTaskFlows(
        [task("a", { scope: ["x"], flow: "no-such-flow" })],
        flows,
      ),
    ).toEqual([
      'task "a" uses flow "no-such-flow": flow "no-such-flow" is not configured',
    ]);
    expect(
      validateTaskFlows(
        [task("a", { scope: ["x"], flow: "constructor" })],
        flows,
      ),
    ).toEqual([
      'task "a" uses flow "constructor": flow "constructor" is not configured',
    ]);
  });
});

describe("unreadable task files", () => {
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
});

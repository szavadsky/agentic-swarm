import { describe, expect, it } from "bun:test";
import { doneWhen, materialHash } from "../../src/kernel/task-material.js";
import {
  isValidTaskSlug,
  parseTaskFile,
  renderTaskFile,
  validateTaskFlows,
  validateTaskGraph,
} from "../../src/kernel/tasks.js";
import type { TaskStatus } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import { TEXT, TYPED, TYPES } from "./tasks-fixtures.js";

describe("task files", () => {
  taskFilesPart1();
  taskFilesPart2();
  taskFilesPart3();
  taskFilesPart4();
  taskFilesPart5();
  taskFilesPart6();
  taskFilesPart7();
  taskFilesPart8();
  taskFilesPart9();
  taskFilesPart10();
  taskFilesPart11();
});

function taskFilesPart1() {
  it("parses and renders the frontmatter plus brief", () => {
    const parsed = parseTaskFile(TEXT, "auth.token-refresh");
    expect(parsed.slug).toBe("auth.token-refresh");
    expect(parsed.deps).toEqual(["auth.session-store"]);
    expect(parsed).not.toHaveProperty("scope");
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
}

function taskFilesPart2() {
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
}

function taskFilesPart3() {
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
}

function taskFilesPart4() {
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
}

function taskFilesPart5() {
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
}

function taskFilesPart6() {
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
    expect(parsed).not.toHaveProperty("scope");
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
}

function taskFilesPart7() {
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
}

function taskFilesPart8() {
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
}

function taskFilesPart9() {
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

  it("still checks duplicates and cycles on terminal tasks", () => {
    const findings = validateTaskGraph(
      [
        task("a", { deps: ["b"] }),
        task("a", { deps: ["b"] }),
        task("b", { deps: ["a"] }),
      ],
      {
        status: new Map([
          ["a", "merged"],
          ["b", "merged"],
        ]),
      },
    );
    expect(findings.some((f) => f.includes("declared twice"))).toBe(true);
    expect(findings.some((f) => f.includes("cycle"))).toBe(true);
  });

  it("accepts a task with no scope and drops a legacy scope", () => {
    expect(validateTaskGraph([task("narrow")])).toEqual([]);
    const parsed = parseTaskFile(TEXT, "auth.token-refresh");
    expect(parsed).not.toHaveProperty("scope");
    const rendered = renderTaskFile(parsed);
    expect(rendered).not.toContain("scope:");
    expect(parseTaskFile(rendered, parsed.slug)).toEqual(parsed);
  });
}

function taskFilesPart10() {
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
}
function taskFilesPart11() {
  it("parses environment notes and keeps them through an amend rewrite", () => {
    const amended = TEXT.replace(
      "source: Milestone auth / refresh",
      [
        "source: Milestone auth / refresh",
        "revision: 1",
        "envNotes:",
        "  - bun install needs the network",
        "  - auth.test.ts flakes on its first run",
      ].join("\n"),
    );
    const parsed = parseTaskFile(amended, "auth.token-refresh");
    expect(parsed.envNotes).toEqual([
      "bun install needs the network",
      "auth.test.ts flakes on its first run",
    ]);
    expect(parsed.revision).toBe(1);
    const round = parseTaskFile(renderTaskFile(parsed), parsed.slug);
    expect(round.envNotes).toEqual(parsed.envNotes);
    expect(materialHash({ ...parsed, envNotes: undefined })).toBe(
      materialHash(parsed),
    );
  });

  it("renders no environment-notes key for a task without them", () => {
    const parsed = parseTaskFile(TEXT, "auth.token-refresh");
    expect(parsed.envNotes).toBeUndefined();
    expect(renderTaskFile(parsed)).not.toContain("envNotes");
  });

  it("rejects a blank environment note", () => {
    const bad = TEXT.replace(
      "source: Milestone auth / refresh",
      "source: Milestone auth / refresh\nenvNotes:\n  - '  '",
    );
    expect(() => parseTaskFile(bad, "auth.token-refresh")).toThrow(
      'frontmatter "envNotes" must be a list of non-empty strings',
    );
  });
}

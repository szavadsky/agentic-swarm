import { describe, expect, it } from "bun:test";
import {
  type EpicRow,
  sagaPassPlan,
  subarchitectRows,
} from "../../src/kernel/register.js";

function epicRow(epic: string, patch: Partial<EpicRow> = {}): EpicRow {
  return {
    epic,
    architect: "subarchitect",
    plan: `epics/${epic}.md`,
    scope: `${epic}/**`,
    opened: 1,
    ...patch,
  };
}

describe("saga pass plan", () => {
  const epics = [
    epicRow("beta"),
    epicRow("alpha"),
    epicRow("billing", { architect: "main", plan: "plan.md" }),
    epicRow("old", { closed: { iteration: 2, reason: "done" } }),
  ];

  it("runs the first iteration top-down only", () => {
    const plan = sagaPassPlan({
      started: false,
      epics,
      epicDone: () => false,
    });
    expect(plan.kind).toBe("first");
    expect(plan.checkerEpics).toEqual([]);
    expect(plan.reportEpics).toEqual([]);
    expect(plan.direction).toBe(true);
  });

  it("checks every active epic bottom-to-top and reports the ones still owing work", () => {
    const plan = sagaPassPlan({
      started: true,
      epics,
      epicDone: (epic) => epic === "beta",
    });
    expect(plan.kind).toBe("middle");
    expect(plan.checkerEpics.map((row) => row.epic)).toEqual(["alpha", "beta"]);
    expect(plan.reportEpics.map((row) => row.epic)).toEqual(["alpha"]);
    expect(plan.direction).toBe(true);
  });

  it("makes the goal's last iteration bottom-up only", () => {
    const plan = sagaPassPlan({
      started: true,
      epics,
      epicDone: () => true,
    });
    expect(plan.kind).toBe("done");
    expect(plan.reportEpics.map((row) => row.epic)).toEqual(["alpha", "beta"]);
    expect(plan.direction).toBe(false);
  });

  it("keeps a goal with no active subarchitect epic out of the done shape", () => {
    const plan = sagaPassPlan({
      started: true,
      epics: [epicRow("billing", { architect: "main", plan: "plan.md" })],
      epicDone: () => true,
    });
    expect(plan.kind).toBe("middle");
    expect(plan.checkerEpics).toEqual([]);
    expect(plan.direction).toBe(true);
  });
});

describe("subarchitect rows", () => {
  it("keeps active subarchitect rows in epic order", () => {
    expect(
      subarchitectRows([
        epicRow("beta"),
        epicRow("alpha"),
        epicRow("billing", { architect: "main", plan: "plan.md" }),
        epicRow("old", { closed: { iteration: 2, reason: "done" } }),
      ]).map((row) => row.epic),
    ).toEqual(["alpha", "beta"]);
  });
});

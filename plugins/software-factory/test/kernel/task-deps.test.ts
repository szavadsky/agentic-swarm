import { describe, expect, it } from "bun:test";
import { deadDepFindings } from "../../src/kernel/task-deps.js";
import { validateTaskGraph } from "../../src/kernel/tasks.js";
import type { TaskFile, TaskStatus } from "../../src/kernel/types.js";
import { task } from "./helpers.js";

/** Derived statuses for a dependency-edge fixture. */
function statusOf(entries: [string, TaskStatus][]): Map<string, TaskStatus> {
  return new Map(entries);
}

/** A `b` waiting on `a`, optionally with a task continuing `a`. */
function depChain(withContinuation = false): TaskFile[] {
  const tasks = [
    task("a", { scope: ["a"] }),
    task("b", { scope: ["b"], deps: ["a"] }),
  ];
  if (!withContinuation) return tasks;
  return [...tasks, task("a-next", { scope: ["a-next"], base: "a" })];
}

describe("dead dependency edges", () => {
  deadDepPart1();
  deadDepPart2();
  deadDepPart3();
});

function deadDepPart1(): void {
  it("refuses a dependency on a park no continuation can land", () => {
    expect(
      deadDepFindings(
        depChain(),
        statusOf([
          ["a", "parked"],
          ["b", "pending"],
        ]),
      ),
    ).toEqual([
      'task "b" depends on "a", which is parked with no landed continuation; a parked dependency is satisfied only by one that landed',
    ]);
  });

  it("refuses the continuation that depends on its own park", () => {
    const tasks = [
      task("a", { scope: ["a"] }),
      task("a-next", { scope: ["a-next"], base: "a", deps: ["a"] }),
    ];
    expect(
      deadDepFindings(
        tasks,
        statusOf([
          ["a", "parked"],
          ["a-next", "pending"],
        ]),
      ),
    ).toEqual([
      'task "a-next" depends on "a", which is parked with no landed continuation; a parked dependency is satisfied only by one that landed',
    ]);
  });

  it("refuses a parked task amended onto a dead dependency", () => {
    expect(
      deadDepFindings(
        depChain(),
        statusOf([
          ["a", "parked"],
          ["b", "parked"],
        ]),
      ),
    ).toHaveLength(1);
  });
}

function deadDepPart2(): void {
  it("accepts a dependency a continuation still retires", () => {
    expect(
      deadDepFindings(
        depChain(true),
        statusOf([
          ["a", "parked"],
          ["a-next", "merged"],
          ["b", "pending"],
        ]),
      ),
    ).toEqual([]);
    expect(
      deadDepFindings(
        depChain(true),
        statusOf([
          ["a", "cancelled"],
          ["a-next", "pending"],
          ["b", "pending"],
        ]),
      ),
    ).toEqual([]);
  });

  it("refuses a dependency on cancelled work with no continuation", () => {
    expect(
      deadDepFindings(
        depChain(),
        statusOf([
          ["a", "cancelled"],
          ["b", "pending"],
        ]),
      ),
    ).toEqual([
      'task "b" depends on "a", which is cancelled with no continuation that can land; the edge can never be satisfied',
    ]);
  });

  it("exempts history and graphs with no derived state", () => {
    expect(
      deadDepFindings(
        depChain(),
        statusOf([
          ["a", "parked"],
          ["b", "merged"],
        ]),
      ),
    ).toEqual([]);
    // Without derived statuses every file is live, so a park is not known yet.
    expect(validateTaskGraph(depChain())).toEqual([]);
  });
}

function deadDepPart3(): void {
  it("refuses a cancelled dependency only its own dependent continues", () => {
    const tasks = [
      task("a", { scope: ["a"] }),
      task("a-next", { scope: ["a-next"], base: "a", deps: ["a"] }),
      task("a-beyond", { scope: ["a-beyond"], base: "a-next" }),
    ];
    expect(
      deadDepFindings(
        tasks,
        statusOf([
          ["a", "cancelled"],
          ["a-next", "pending"],
          ["a-beyond", "pending"],
        ]),
      ),
    ).toEqual([
      'task "a-next" depends on "a", which is cancelled with no continuation that can land; the edge can never be satisfied',
    ]);
  });
}

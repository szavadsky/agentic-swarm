import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import { reportView } from "../../src/kernel/report-view.js";
import type { ReportView } from "../../src/kernel/types.js";
import { cause, rec, script, task } from "./helpers.js";

function park(slug: string, seq: number) {
  return script(seq, {
    slug,
    step: "park",
    ok: true,
    cause: cause("gates: unit"),
  });
}

/** A live park, a park retired by a base continuation, a merge and a ready task. */
function continuationView(): ReportView {
  const tasks = [
    task("base"),
    task("base-next", { base: "base" }),
    task("live"),
    task("open"),
  ];
  const records = [
    park("base", 1),
    script(2, { slug: "base-next", step: "merge", ok: true, commit: "abc" }),
    park("live", 3),
  ];
  return reportView({ tasks, state: derive(tasks, records), records });
}

function debtRecords() {
  return [
    rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "retry window drops head names",
            id: "00001#1",
          },
          {
            kind: "debt",
            calibration: "fyi",
            text: "nit: rename the helper",
            id: "00001#2",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    }),
  ];
}

function debtView(records: ReturnType<typeof debtRecords>): ReportView {
  const tasks = [task("a")];
  return reportView({ tasks, state: derive(tasks, records), records });
}

describe("report view tasks", () => {
  it("groups the derived tasks and keeps a base continuation apart from live work", () => {
    const view = continuationView();

    expect(view.tasks.map((row) => row.slug)).toEqual([
      "base",
      "base-next",
      "live",
      "open",
    ]);
    expect(view.tasks[0]).toMatchObject({
      title: "base",
      status: "parked",
      kind: "development",
      cause: cause("gates: unit"),
      supersededBy: "base-next",
      record: "records/00001-i1-base-park-r1",
    });
    expect(view.groups.allParked.map((row) => row.slug)).toEqual([
      "base",
      "live",
    ]);
    expect(view.groups.parked.map((row) => row.slug)).toEqual(["live"]);
    expect(view.groups.superseded.map((row) => row.slug)).toEqual(["base"]);
    expect(view.groups.open.map((row) => row.slug)).toEqual(["open"]);
    expect(view.distance).toMatchObject({
      pending: ["open"],
      parks: ["live"],
    });
  });

  it("reports a running task apart from the waiting list a boundary names", () => {
    const tasks = [task("busy"), task("waiting")];
    const view = reportView({
      tasks,
      state: derive(tasks, []),
      running: ["busy"],
    });

    expect(view.tasks[0]!.status).toBe("running");
    expect(view.groups.open.map((row) => row.slug)).toEqual([
      "busy",
      "waiting",
    ]);
    expect(view.distance.pending).toEqual(["waiting"]);
  });
});

describe("report view listings", () => {
  it("lists only the requested slugs and reads a task file without state", () => {
    const state = derive([task("known")], []);
    const listed = reportView({
      state,
      tasks: [
        task("known"),
        task("unnamed", { title: "Unnamed", kind: "spike" }),
      ],
      slugs: ["known", "unnamed"],
    });

    // A task file without derived state still reads as waiting, from its own file.
    expect(listed.tasks[1]).toMatchObject({
      slug: "unnamed",
      title: "Unnamed",
      status: "pending",
      kind: "spike",
    });
    expect(listed.tasks.map((row) => row.slug)).toEqual(["known", "unnamed"]);
  });

  it("reads a derived task with no file from its state", () => {
    const state = derive([task("known")], []);
    const orphan = reportView({ state, tasks: [], slugs: ["known"] });

    expect(orphan.tasks[0]).toMatchObject({
      slug: "known",
      title: "known",
      status: "ready",
      kind: "development",
    });
  });
});

describe("report view distance", () => {
  it("keeps material debt only, with the record its id names", () => {
    expect(debtView(debtRecords()).distance.openDebt).toEqual([
      {
        id: "00001#1",
        text: "retry window drops head names",
        calibration: "architect",
        source: "a review r1",
        iteration: 1,
        record: "records/00001",
      },
    ]);
  });

  it("drops debt a recorded id closure settled", () => {
    const closure = rec(2, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "closed the retry debt",
        concerns: [],
        forward: [],
        debtClosed: [
          { id: "00001#1", reason: "head names reconciled at the writer" },
        ],
        decision: "continue",
      },
    });

    expect(debtView([...debtRecords(), closure]).distance.openDebt).toEqual([]);
  });
});

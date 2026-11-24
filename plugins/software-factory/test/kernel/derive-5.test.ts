import { describe, expect, it } from "bun:test";
import {
  derive,
  materialOpenDebts,
  openDebts,
} from "../../src/kernel/derive.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

const doneCheck = (seq: number): StepRecord =>
  script(seq, {
    step: "checks",
    ok: true,
    checks: [],
    startedAt: new Date(seq).toISOString(),
  });

const review = (
  seq: number,
  verdict: "approve" | "changes" | "reject",
  round = 1,
): StepRecord =>
  rec(seq, {
    step: "review",
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: `review r${round}`,
      concerns: [],
      forward: [],
      verdict,
    },
  });

const implement = (
  seq: number,
  round = 1,
  patch: Partial<StepRecord> = {},
): StepRecord =>
  rec(seq, {
    step: "implement",
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: "implemented",
      concerns: [],
      forward: [],
    },
    ...patch,
  });

function registerDerivePart36(): void {
  it("closes every round that raised the debt from one id", () => {
    const text = "retry window drops head names";
    const first = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          { kind: "debt", calibration: "architect", text, id: "00001#1" },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const again = rec(2, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          { kind: "debt", calibration: "architect", text, id: "00002#1" },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const close = rec(3, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "closed",
        concerns: [],
        forward: [],
        debtClosed: [{ id: "00001#1", reason: "head names reconciled" }],
        decision: "continue",
      },
    });
    expect(openDebts([first, again, close])).toEqual([]);
  });
}

function registerDerivePart37(): void {
  it("closes only the debt the id names, not a longer one that quotes it", () => {
    const short = "rename the writer helper";
    const long = "rename the writer helper and the reader helper too";
    const first = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: short,
            id: "00001#1",
          },
          { kind: "debt", calibration: "architect", text: long, id: "00001#2" },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const close = rec(2, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "closed the short one",
        concerns: [],
        forward: [],
        debtClosed: [{ id: "00001#1", reason: "writer helper renamed" }],
        decision: "continue",
      },
    });
    expect(openDebts([first, close])).toEqual([
      {
        id: "00001#2",
        text: long,
        calibration: "architect",
        source: "a review r1",
        iteration: 1,
        seq: 1,
      },
    ]);
  });
}

function registerDerivePart38(): void {
  it("lists an open fyi debt with its id and closes it without blocking done", () => {
    const fyi = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "note",
        concerns: [
          {
            kind: "debt",
            calibration: "fyi",
            text: "nit: rename the helper",
            id: "00001#1",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    expect(materialOpenDebts([fyi])).toEqual([]);
    expect(openDebts([fyi])).toEqual([
      {
        id: "00001#1",
        text: "nit: rename the helper",
        calibration: "fyi",
        source: "a review r1",
        iteration: 1,
        seq: 1,
      },
    ]);

    const closed = rec(2, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "renamed",
        concerns: [],
        forward: [],
        debtClosed: [{ id: "00001#1", reason: "helper renamed" }],
        verdict: "approve",
      },
    });
    expect(openDebts([fyi, closed])).toEqual([]);
  });
}

function registerDerivePart39(): void {
  it("lands done with fyi debt or an uncited close still open", () => {
    const fyi = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "note",
        concerns: [{ kind: "debt", calibration: "fyi", text: "nit: rename" }],
        forward: [],
        verdict: "approve",
      },
    });
    const done = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    expect(derive([task("a")], [fyi, done]).goal).toBe("done");

    const debtText = "cache invalidation needs a follow-up task";
    const material = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [{ kind: "debt", calibration: "architect", text: debtText }],
        forward: [],
        verdict: "approve",
      },
    });
    const shortClose = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "goal met",
        concerns: [],
        forward: ["debt closed: tests"],
        decision: "done",
      },
    });
    // The fragment closes nothing, so the register keeps the debt.
    expect(openDebts([material, shortClose]).map((debt) => debt.text)).toEqual([
      debtText,
    ]);
    const state = derive([task("a")], [material, shortClose]);
    expect(state.goal).toBe("done");
    expect(state.terminal).toBe(true);
  });
}

function registerDerivePart40(): void {
  it("lands a front-stop done with owner debt still open", () => {
    const debt = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt",
            calibration: "owner",
            text: "public API needs a compatibility shim removal",
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
    const stop = script(2, {
      slug: undefined,
      step: "front-stop",
      outcome: {
        status: "done",
        summary: "front done",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    expect(derive([task("a")], [debt, stop]).goal).toBe("done");
  });
}

function registerDerivePart41(): void {
  it("keeps the earlier done when a later turn closes the debt", () => {
    const debtText = "cache invalidation needs a follow-up task";
    const debt = rec(1, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [{ kind: "debt", calibration: "architect", text: debtText }],
        forward: [],
        verdict: "approve",
      },
    });
    const done = rec(2, {
      slug: undefined,
      step: "architect",
      iteration: 1,
      outcome: {
        status: "done",
        summary: "goal met with debt listed",
        concerns: [],
        forward: [],
        decision: "done",
      },
    });
    expect(derive([task("a")], [debt, done]).goal).toBe("done");
    const close = rec(3, {
      slug: "a",
      step: "review",
      outcome: {
        status: "done",
        summary: "closed the debt",
        concerns: [],
        forward: [`debt closed: ${debtText}`],
        verdict: "approve",
      },
    });
    const records = [debt, done, close];
    expect(openDebts(records)).toEqual([]);
    // A close that records no decision needs no second done.
    expect(derive([task("a")], records).goal).toBe("done");
  });
}

function registerDerivePart42(): void {
  it("counts only a continuation's own turns, not its base's", () => {
    const tasks = [task("a"), task("b", { base: "a" })];
    const records = [
      implement(1),
      doneCheck(2),
      review(3, "changes", 1),
      implement(4, 2),
      implement(5, 1, { slug: "b" }),
    ];
    const state = derive(tasks, records);
    expect(state.tasks.a!.turns).toBe(3);
    expect(state.tasks.b!.turns).toBe(1);
  });
}

describe("derive", () => {
  registerDerivePart36();

  registerDerivePart37();

  registerDerivePart38();

  registerDerivePart39();

  registerDerivePart40();

  registerDerivePart41();

  registerDerivePart42();
});

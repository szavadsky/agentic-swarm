import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { holdsDir, postSteer, readHolds } from "../../src/kernel/mailbox.js";
import { cause, causeText, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { editPlan, writeHold, writePlan } from "./steer-holds-helpers.js";

/** The boundary's steer turn: route each pending steer before the architect. */
function routesSteers(
  routes: { steer: string; route: "architect" | "stall" }[],
): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: `routed ${routes.map((entry) => entry.steer).join(", ")}`,
        steerRoutes: routes,
      }),
    );
    return fakeTurnResult(req);
  };
}

async function answersSteerFileNamedSpacesOrColonPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  const inbox = path.join(runtime.store.goalDir, "mailbox/inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(
    path.join(inbox, "my steer:1.md"),
    "Hold alpha until I answer.\n",
    "utf8",
  );
  writeHold(runtime, "my steer:1", ["alpha"]);

  harness.script(routesSteers([{ steer: "my steer:1", route: "architect" }]));
  harness.script((req, ctx) => {
    expect(req.prompt).toContain(
      "- my steer:1 (mailbox/inbox/my steer:1.md): Hold alpha until I answer.",
    );
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "answered the oddly named steer",
        decision: "continue",
        forward: ["steer my steer:1: hold is released"],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });

  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  expect(
    fs.existsSync(
      path.join(runtime.store.goalDir, "mailbox/inbox/my steer:1.md"),
    ),
  ).toBe(false);
  expect(
    fs.existsSync(
      path.join(runtime.store.goalDir, "mailbox/processed/my steer:1.md"),
    ),
  ).toBe(true);

  return { runtime };
}

async function answersSteerFileNamedSpacesOrColonPart2(
  scope: Awaited<ReturnType<typeof answersSteerFileNamedSpacesOrColonPart1>>,
) {
  const { runtime } = scope;
  expect(
    fs.readFileSync(
      path.join(runtime.store.goalDir, "mailbox/outbox/steer-my steer:1.md"),
      "utf8",
    ),
  ).toContain("hold is released");
  expect(
    fs.existsSync(path.join(holdsDir(runtime.store), "my steer:1.yaml")),
  ).toBe(false);
}

async function expiresUnansweredSteerWhoseIdPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  // A naive writer may drop any file name; the id is the file name, quotes included.
  const inbox = path.join(runtime.store.goalDir, "mailbox/inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(
    path.join(inbox, 'we"ird.md'),
    "Hold alpha until I answer.\n",
    "utf8",
  );
  writeHold(runtime, 'we"ird', ["alpha"], true);

  const ignoreSteer: FakeTurnHandler = (req, ctx) => {
    expect(req.prompt).toContain(
      '- we"ird (mailbox/inbox/we"ird.md): Hold alpha until I answer.',
    );
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({ summary: "ignored the steer", decision: "continue" }),
    );
    return fakeTurnResult(req);
  };
  const unchanged: FakeTurnHandler = (req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  };

  harness.script(routesSteers([{ steer: 'we"ird', route: "stall" }]));
  harness.script(ignoreSteer);
  harness.script(unchanged);
  const first = await runBoundary(runtime, { relaunch: false });
  expect(first.decision).toBe("continue");
  expect(fs.existsSync(path.join(holdsDir(runtime.store), 'we"ird.yaml'))).toBe(
    true,
  );

  harness.script(ignoreSteer);
  harness.script(unchanged);
  const second = await runBoundary(runtime, { relaunch: false });
  expect(second.decision).toBe("continue");

  // The quoted id round-trips, so the second boundary recognizes the first
  // presentation and expires the hold instead of presenting forever.
  expect(
    fs.existsSync(path.join(runtime.store.goalDir, 'mailbox/inbox/we"ird.md')),
  ).toBe(true);

  return { runtime };
}

async function expiresUnansweredSteerWhoseIdPart2(
  scope: Awaited<ReturnType<typeof expiresUnansweredSteerWhoseIdPart1>>,
) {
  const { runtime } = scope;
  expect(fs.existsSync(path.join(holdsDir(runtime.store), 'we"ird.yaml'))).toBe(
    false,
  );
  const records = await runtime.store.listRecords();
  expect(records.filter((r) => r.step === "steer-presented")).toHaveLength(1);
  const expired = records.filter((r) => r.step === "steer-unanswered");
  expect(expired).toHaveLength(1);
  expect(expired[0]?.outcome?.concerns[0]?.evidence).toBe(
    'mailbox/inbox/we"ird.md',
  );
}

async function rePresentsUnansweredSteerThenPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await postSteer(runtime.store, "s1", "Hold alpha until I answer.");
  writeHold(runtime, "s1", ["alpha"], true);

  const ignoreSteer: FakeTurnHandler = (req, ctx) => {
    expect(req.prompt).toContain(
      "- s1 (mailbox/inbox/s1.md): Hold alpha until I answer.",
    );
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({ summary: "ignored the steer", decision: "continue" }),
    );
    return fakeTurnResult(req);
  };
  const unchanged: FakeTurnHandler = (req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  };

  // First unanswered boundary: the steer is recorded, its hold still gates.
  harness.script(routesSteers([{ steer: "s1", route: "stall" }]));
  harness.script(ignoreSteer);
  harness.script(unchanged);
  const first = await runBoundary(runtime, { relaunch: false });
  expect(first.decision).toBe("continue");
  expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
    true,
  );
  const presented = (await runtime.store.listRecords()).find(
    (r) => r.step === "steer-presented",
  );
  expect(presented?.ok).toBe(false);
  expect(presented?.slug).toBe("s1");
  expect(causeText(presented?.cause)).toContain('"s1"');
  expect(
    (await runtime.store.listRecords()).some(
      (r) => r.step === "steer-unanswered",
    ),
  ).toBe(false);

  // Second unanswered boundary: re-presented again, then the hold expires.
  harness.script(ignoreSteer);
  harness.script(unchanged);
  const second = await runBoundary(runtime, { relaunch: false });
  expect(second.decision).toBe("continue");

  return { harness, runtime, unchanged };
}

async function rePresentsUnansweredSteerThenPart2(
  scope: Awaited<ReturnType<typeof rePresentsUnansweredSteerThenPart1>>,
) {
  const { runtime, harness, unchanged } = scope;
  expect(
    fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md")),
  ).toBe(true);
  expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
    false,
  );
  expect((await readHolds(runtime.store)).holds).toEqual([]);
  const expired = (await runtime.store.listRecords()).find(
    (r) => r.step === "steer-unanswered",
  );
  expect(expired?.ok).toBe(false);
  expect(expired?.slug).toBe("s1");
  expect(causeText(expired?.cause)).toContain('"s1"');
  expect(expired?.outcome?.concerns[0]?.calibration).toBe("architect");
  expect(expired?.outcome?.concerns[0]?.text).toContain("s1");
  expect(expired?.outcome?.concerns[0]?.evidence).toBe("mailbox/inbox/s1.md");

  // Third boundary: the architect finally answers the still-pending steer.
  harness.script((req, ctx) => {
    expect(req.prompt).toContain(
      "- s1 (mailbox/inbox/s1.md): Hold alpha until I answer.",
    );
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "answered it",
        decision: "continue",
        forward: ["steer s1: hold is released"],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(unchanged);
  const third = await runBoundary(runtime, { relaunch: false });
  expect(third.decision).toBe("continue");
  expect(
    fs.existsSync(path.join(runtime.store.goalDir, "mailbox/processed/s1.md")),
  ).toBe(true);
}

async function rePresentsUnansweredSteerThenPart3(
  scope: Awaited<ReturnType<typeof rePresentsUnansweredSteerThenPart1>>,
) {
  const { runtime } = scope;
  expect(
    fs.readFileSync(
      path.join(runtime.store.goalDir, "mailbox/outbox/steer-s1.md"),
      "utf8",
    ),
  ).toContain("hold is released");
  const records = await runtime.store.listRecords();
  expect(records.filter((r) => r.step === "steer-presented")).toHaveLength(1);
  expect(records.filter((r) => r.step === "steer-unanswered")).toHaveLength(1);
}

function registerMidRunSteerHoldsPart3(): void {
  it("re-presents an unanswered steer, then expires its hold with a concern", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await rePresentsUnansweredSteerThenPart1(repo, goal);
      await rePresentsUnansweredSteerThenPart2(scope1);
      await rePresentsUnansweredSteerThenPart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("expires an unanswered steer whose id contains a quote", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await expiresUnansweredSteerWhoseIdPart1(repo, goal);
      await expiresUnansweredSteerWhoseIdPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("answers a steer file named with spaces or a colon and deletes its hold", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await answersSteerFileNamedSpacesOrColonPart1(repo, goal);
      await answersSteerFileNamedSpacesOrColonPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart4(): void {
  it("tracks unanswered steers by record data, not cause text", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await postSteer(runtime.store, "s1", "Hold alpha until I answer.");
      writeHold(runtime, "s1", ["alpha"]);
      // The slug says s1 was presented; the cause names a different steer and
      // must be ignored, proving the id travels as data.
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "steer-presented",
          round: 1,
          actor: "script",
          slug: "s1",
        },
        {
          ok: false,
          cause: cause(
            'unanswered steer "s2" in mailbox/inbox/s1.md; the next boundary presents it again before its hold expires',
          ),
        },
      );

      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Hold alpha until I answer.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "ignored the steer", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "steer-presented")).toHaveLength(
        1,
      );
      const expired = records.filter((r) => r.step === "steer-unanswered");
      expect(expired).toHaveLength(1);
      expect(expired[0]?.slug).toBe("s1");
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("mid-run steer holds", () => {
  registerMidRunSteerHoldsPart3();

  registerMidRunSteerHoldsPart4();
});

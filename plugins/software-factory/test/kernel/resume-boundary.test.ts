import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { Cause, Outcome } from "../../src/kernel/types.js";
import { expectDispatch } from "./e2e-helpers.js";
import { whenTurn } from "./s2-helpers.js";
import { cause } from "./helpers.js";
import {
  digestScoutTurn,
  digestSteerId,
  outcome,
  queueDigestSteer,
  setupRepo,
  silenceWarn,
  turnsBeforeFirstTask,
} from "./resume-helpers.js";

/** The architect's ruling the injected live finding expects. */
const RULING = "ruled: beta keeps the cancelled base; the edge is history";

function taskText(
  slug: string,
  opts: {
    kind?: string;
    flow?: string;
    deps?: string[];
    base?: string;
    scope?: string[];
  } = {},
): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: ${slug}`,
    `kind: ${opts.kind ?? "task"}`,
    `flow: ${opts.flow ?? "implement-review"}`,
    `deps: [${(opts.deps ?? []).join(", ")}]`,
    ...(opts.base ? [`base: ${opts.base}`] : []),
    `scope: [${(opts.scope ?? [`${slug}.txt`]).join(", ")}]`,
    `source: fixture / ${slug}`,
    "---",
    "",
    `Do ${slug}.`,
    "Done when: it works.",
    "",
  ].join("\n");
}

function writeFile(dir: string, name: string, text: string): void {
  fs.writeFileSync(path.join(dir, name), text, "utf8");
}

/**
 * Delta i5's frozen-base history: merged and parked continuations whose bases
 * the plan cancelled afterwards. `graph-history-exempt` makes those edges
 * history, so they raise no finding. A live continuation of a cancelled base
 * (variant B) is the underivable finding no PM turn can derive away.
 */
async function deltaI5Goal(liveFinding: boolean): Promise<{
  repo: ReturnType<typeof setupRepo>["repo"];
  goalDir: string;
  taskDir: string;
  store: ReturnType<typeof createFolderStore>;
}> {
  const scope1 = await deltaI5GoalPart1(liveFinding);
  return await deltaI5GoalPart2(liveFinding, scope1);
}

/** Routes the resume's digest steer to a spike, with the task it created. */
function digestSpikeTurn(taskDir: string): FakeTurnHandler {
  return (req, ctx) => {
    const id = digestSteerId(req);
    writeFile(
      taskDir,
      "digest-spike.md",
      taskText("digest-spike", {
        kind: "spike",
        flow: "spike",
        scope: ["digest.txt"],
      }).replace("source: fixture / digest-spike", `source: "steer: ${id}"`),
    );
    ctx.writeOutcome(
      outcome({
        summary: `digest steer ${id} routed to a spike`,
        steerRoutes: [{ steer: id, route: "spike" }],
      }),
    );
    return fakeTurnResult(req);
  };
}

function writesTaskFile(slug: string, file: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${slug}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${slug} added ${file}` }));
    return fakeTurnResult(req);
  };
}

function writesSpikeReport(slug: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "digest.txt"), "digest\n", "utf8");
    const report = path.join(req.cwd!, spikeReportPath(slug));
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(
      report,
      "# Finding\n\nThe digest is already recorded.\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: `${slug} reported` }));
    return fakeTurnResult(req);
  };
}

function approves(slug: string): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: `${slug} approved`, verdict: "approve" }),
    );
    return fakeTurnResult(req);
  };
}

function scriptTaskTurns(
  harness: FakeHarness,
  slug: string,
  implement: FakeTurnHandler,
): void {
  harness.script(implement, { when: whenTurn({ slug, step: "implement" }) });
  harness.script(approves(slug), { when: whenTurn({ slug, step: "review" }) });
}

describe("resume boundary — architect routing has an outlet", () => {
  it("variant A: a clean frozen-base resume dispatches a task turn with no agent first", async () => {
    const { repo, store } = await deltaI5Goal(false);
    const restoreWarn = silenceWarn();
    try {
      const scope1 = await variantCleanFrozenBaseResumePart1(repo, store);
      await variantCleanFrozenBaseResumePart2(scope1);
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);

  it("variant B: an underivable live finding runs the architect boundary in the same launch", async () => {
    const { repo, goalDir, taskDir, store } = await deltaI5Goal(true);
    const restoreWarn = silenceWarn();
    try {
      const scope1 = await variantBUnderivableLiveFindingRunsPart1(
        taskDir,
        goalDir,
        repo,
        store,
      );
      await variantBUnderivableLiveFindingRunsPart2(store, scope1);
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);
});

async function variantCleanFrozenBaseResumePart1(
  repo: Awaited<ReturnType<typeof deltaI5Goal>>["repo"],
  store: Awaited<ReturnType<typeof deltaI5Goal>>["store"],
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptTaskTurns(harness, "alpha", writesTaskFile("alpha", "alpha.txt"));
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );

  await expectDispatch(
    0,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
    { harnesses: { fake: harness } },
  );

  const records = await store.listRecords();
  const state = derive(await store.listTasks(), records);
  // The frozen-base history stays history; the live ready work dispatched.
  expect(state.goal).toBe("done");
  expect(state.tasks["handoff-land"]!.status).toBe("merged");
  expect(state.tasks["kept-land-fix"]!.status).toBe("parked");
  expect(state.tasks["metrics-attrib-land"]!.status).toBe("merged");
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.slug !== undefined && r.iteration === 2,
    ).length,
  ).toBeGreaterThan(0);

  return { records, harness };
}

async function variantCleanFrozenBaseResumePart2(
  scope: Awaited<ReturnType<typeof variantCleanFrozenBaseResumePart1>>,
) {
  const { records, harness } = scope;
  // Script-only: no digest scout and no PM turn before alpha's task turn.
  expect(turnsBeforeFirstTask(harness)).toEqual([]);
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "digest" && r.iteration === 2,
    ),
  ).toHaveLength(0);
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "pm" && r.iteration === 2,
    ),
  ).toHaveLength(0);
  expect(records.filter((r) => r.step === "pm-validate")).toHaveLength(0);
}

async function variantBUnderivableLiveFindingRunsPart1(
  taskDir: string,
  goalDir: string,
  repo: Awaited<ReturnType<typeof deltaI5Goal>>["repo"],
  store: Awaited<ReturnType<typeof deltaI5Goal>>["store"],
) {
  const harness = new FakeHarness({ id: "fake" });
  queueDigestSteer(harness, digestSpikeTurn(taskDir));
  harness.script(digestScoutTurn(goalDir, 2), {
    when: whenTurn({ step: "digest" }),
  });
  // The boundary the architect route/finding summons: the architect rules
  // and edits the plan, then the derive ladder reports the same finding.
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(
        path.join(goalDir, "plan.md"),
        `\n## Ruling\n\n${RULING}\n`,
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: RULING, decision: "continue" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "nothing to file" }));
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        whenTurn({ step: "pm" })(req) &&
        req.prompt.includes("pending steers: `none`") &&
        req.prompt.includes("stalled parks: `none`"),
    },
  );
  scriptTaskTurns(harness, "alpha", writesTaskFile("alpha", "alpha.txt"));
  scriptTaskTurns(harness, "digest-spike", writesSpikeReport("digest-spike"));

  await expectDispatch(
    3,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
    { harnesses: { fake: harness } },
  );

  const records = await store.listRecords();

  return { records };
}

async function variantBUnderivableLiveFindingRunsPart2(
  store: Awaited<ReturnType<typeof deltaI5Goal>>["store"],
  scope: Awaited<ReturnType<typeof variantBUnderivableLiveFindingRunsPart1>>,
) {
  const { records } = scope;
  expect(
    records
      .filter(
        (r) =>
          r.actor === "agent" && r.step === "architect" && r.iteration === 2,
      )
      .map((r) => r.outcome?.summary),
  ).toContain(RULING);
  // The PM ladder reported the pre-existing finding instead of spending
  // rungs on it: no rung failure, and the boundary recorded its cause.
  expect(records.filter((r) => r.step === "pm-validate")).toHaveLength(0);
  expect(await store.readFile("iterations/2/summary.md")).toContain(
    "PM ladder routed to the architect",
  );
  expect(await store.readFile("iterations/2/summary.md")).toContain(
    'task "beta" continues "gone", which is cancelled',
  );
  // A resume that only ruled counts as the pass's progress: with one pass
  // of budget the launch does not refund it and consult a third iteration.
  expect(await store.readFile("iterations/3/summary.md")).toBeNull();
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "architect" && r.iteration === 3,
    ),
  ).toHaveLength(0);
}

async function deltaI5GoalPart1(liveFinding: boolean) {
  const s = setupRepo();
  writeFile(
    s.goalDir,
    "plan.md",
    "# Plan\n\n## alpha\nCreate alpha.\n\n## beta\nCreate beta.\n",
  );
  const writeTask = (slug: string, opts: Parameters<typeof taskText>[1]) =>
    writeFile(s.taskDir, `${slug}.md`, taskText(slug, opts));
  // Frozen history: both continuations are terminal, their bases cancelled.
  writeTask("handoff-log", {});
  writeTask("handoff-land", { base: "handoff-log" });
  writeTask("kept-live", {});
  writeTask("kept-land-fix", { base: "kept-live" });
  writeTask("metrics-attrib", {});
  writeTask("metrics-attrib-land", { base: "metrics-attrib" });
  writeTask("alpha", {});
  if (liveFinding) {
    writeTask("gone", {});
    writeTask("gamma", {});
    writeTask("beta", { base: "gone", deps: ["gamma"] });
  }

  const store = createFolderStore(s.goalDir, undefined, {});
  const script = (
    iteration: number,
    step: string,
    slug: string,
    ok: boolean,
    cause?: Cause,
  ) =>
    store.appendRecord(
      { iteration, step, round: 1, actor: "script", slug },
      ok ? { ok } : { ok, cause },
    );
  const architect = (iteration: number, summary: string) =>
    store.appendRecord(
      { iteration, step: "architect", round: 1, actor: "agent" },
      {
        ok: true,
        outcome: outcome({ summary, decision: "continue" }) as Outcome,
      },
    );

  await architect(1, "iteration one boundary");

  return { s, store, script, architect };
}

async function deltaI5GoalPart2(
  liveFinding: boolean,
  scope: Awaited<ReturnType<typeof deltaI5GoalPart1>>,
) {
  const { script, architect, s, store } = scope;
  await script(
    1,
    "cancel",
    "handoff-log",
    false,
    cause("landed as handoff-land"),
  );
  await script(1, "merge", "handoff-land", true);
  await script(
    1,
    "cancel",
    "kept-live",
    false,
    cause("replaced by kept-land-fix"),
  );
  await script(
    1,
    "park",
    "kept-land-fix",
    false,
    cause("kept for a later base"),
  );
  await script(
    1,
    "cancel",
    "metrics-attrib",
    false,
    cause("landed as metrics-attrib-land"),
  );
  await script(1, "merge", "metrics-attrib-land", true);
  if (liveFinding) {
    await script(1, "cancel", "gone", false, cause("spent"));
    await script(1, "park", "gamma", false, cause("needs the base ruling"));
  }
  // The interrupted iteration opened with a boundary and died before dispatch.
  await architect(2, "iteration two boundary");
  return { ...s, store };
}

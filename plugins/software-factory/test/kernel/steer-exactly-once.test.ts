import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { LiveAgents } from "../../src/harness/types.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { collectSteerRoutes, postSteer } from "../../src/kernel/mailbox.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { KernelRuntime, Outcome } from "../../src/kernel/types.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  simpleTask,
  writePlan as writeLaunchPlan,
  writeTask as writeLaunchTask,
} from "./e2e-helpers.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import {
  approver,
  implementer,
  inboxHas,
  outboxOf,
  stateOf,
  writePlan,
} from "./steer-helpers.js";

const PLAN = [
  "# Milestone 1",
  "",
  "## alpha",
  "Create alpha.txt.",
  "Done when: alpha.txt exists.",
  "",
].join("\n");

const INBOX = "mailbox/inbox/s1.md";
const OUTBOX = "mailbox/outbox/steer-s1.md";

function goalFile(goalDir: string, rel: string): string | null {
  const file = path.join(goalDir, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** The drop a steer writer makes: tmp + rename into the inbox. */
function post(goalDir: string, text: string): Promise<void> {
  return createFolderStore(goalDir, undefined, {}).mailbox.publish(
    "s1.md",
    text,
  );
}

/** A `steer-routes` record a PM turn committed before it died. */
async function commitRoutes(
  runtime: KernelRuntime,
  routes: NonNullable<Outcome["steerRoutes"]>,
): Promise<void> {
  await runtime.store.appendRecord(
    scriptMeta(1, "steer-routes", { round: 1 }),
    {
      ok: true,
      outcome: {
        status: "done",
        summary: "steer routes: s1",
        concerns: [],
        forward: [],
        steerRoutes: routes,
      },
    },
  );
}

/** A dispatchable goal whose only steer already has a committed route. */
async function routedSteerScope(routes: NonNullable<Outcome["steerRoutes"]>) {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 1 } },
  });
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await postSteer(runtime.store, "s1", "Keep alpha small.");
  await commitRoutes(runtime, routes);

  let calls = 0;
  harness.script(
    (req, ctx) => {
      calls += 1;
      ctx.writeOutcome(
        outcome({
          summary: "s1 claimed a second time",
          steerRoutes: [{ steer: "s1", route: "architect" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  harness.script(implementer("alpha.txt"), {
    when: whenTurn({ slug: "alpha", step: "implement" }),
  });
  harness.script(approver("alpha is correct"), {
    when: whenTurn({ slug: "alpha", step: "review" }),
  });
  return { runtime, repo, pmCalls: () => calls };
}

function routedSteerIsNotClaimedAgain(): void {
  it("does not claim a steer whose non-task route is already committed", async () => {
    const { runtime, repo, pmCalls } = await routedSteerScope([
      { steer: "s1", route: "architect" },
    ]);
    try {
      const dispatched = await runDispatch(runtime, { iteration: 1 });

      expect(dispatched.reason).toBe("boundary");
      expect(pmCalls()).toBe(0);
      // The file waits for the architect who answers it, not for a PM turn.
      expect(inboxHas(runtime, "s1")).toBe(true);
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "mailbox/outbox/steer-s1.md"),
        ),
      ).toBe(false);
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function storedTaskAnswerIsDelivered(): void {
  it("delivers a committed task answer from the inbox without a PM claim", async () => {
    const { runtime, repo, pmCalls } = await routedSteerScope([
      { steer: "s1", route: "task", answer: "alpha stays small" },
    ]);
    try {
      const dispatched = await runDispatch(runtime, { iteration: 1 });

      expect(dispatched.reason).toBe("boundary");
      expect(pmCalls()).toBe(0);
      expect(outboxOf(runtime, "s1")).toContain("alpha stays small");
      expect(inboxHas(runtime, "s1")).toBe(false);
      expect(await runtime.store.mailbox.files("processed")).toContain("s1.md");
      expect(
        collectSteerRoutes(await runtime.store.listRecords()).get("s1")?.route,
      ).toBe("task");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** The first launch: the steer routes to the architect, then infra stops the harness. */
function scriptStoppedLaunch(harness: FakeHarness): void {
  const infra = (req: Parameters<typeof fakeTurnResult>[0]) =>
    fakeTurnResult(req, {
      stop: { kind: "infra", cause: "crash", details: "session lost" },
    });
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          status: "blocked",
          summary: "s1 needs the architect",
          steerRoutes: [{ steer: "s1", route: "architect" }],
        }),
      );
      return infra(req);
    },
    { when: (req) => fakeTurnIdentity(req).step === "pm" },
  );
  // The alias's one tier retries de novo after an infra stop: bind both calls.
  harness.script(infra, {
    when: (req) => fakeTurnIdentity(req).step === "architect",
  });
  harness.script(infra, {
    when: (req) => fakeTurnIdentity(req).step === "architect",
  });
}

/** The relaunch: the architect consumes the committed route and answers once. */
function scriptAnsweringLaunch(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "names stay",
          decision: "done",
          steerAnswers: [{ steer: "s1", answer: "names stay, internals only" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => fakeTurnIdentity(req).step === "architect" },
  );
}

function relaunchAnswersOneSteerOnce(): void {
  it("shows one claim and one outbox answer per steer across a relaunch", async () => {
    const goal = makeGoal();
    try {
      writeLaunchPlan(goal.goalDir, PLAN);
      writeLaunchTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
      await post(goal.goalDir, "Keep the public API names stable.\n");

      const stopped = new FakeHarness({ id: "fake" });
      scriptStoppedLaunch(stopped);
      await expectLaunch(1, goal.repo, stopped);

      // The route outlived the stopped turn: the provisional note replaced it
      // and the steer waits in the inbox for its architect.
      expect(goalFile(goal.goalDir, OUTBOX) ?? "").toContain(
        "Held, not yet processed",
      );
      expect(goalFile(goal.goalDir, INBOX)).not.toBeNull();

      const resumed = new FakeHarness({ id: "fake" });
      scriptAnsweringLaunch(resumed);
      await expectLaunch(0, goal.repo, resumed);

      const answer = goalFile(goal.goalDir, OUTBOX) ?? "";
      expect(answer).toContain("names stay, internals only");
      expect(answer).not.toContain("Held, not yet processed");
      expect(goalFile(goal.goalDir, INBOX)).toBeNull();
      expect(
        fs
          .readdirSync(path.join(goal.goalDir, "mailbox/outbox"))
          .filter((file) => file === "steer-s1.md"),
      ).toHaveLength(1);

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      expect(
        records.filter(
          (record) => record.step === "pm" && record.actor === "agent",
        ),
      ).toHaveLength(1);
      expect(
        records.filter(
          (record) =>
            record.step === "steer-routes" &&
            record.outcome?.steerRoutes?.some((entry) => entry.steer === "s1"),
        ),
      ).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
}

/** Watch cadence and settle window for the mid-PM injection test. */
const WATCH_TICK_MS = 20;
const DEBOUNCE_SECONDS = 0.03;

/** A promise and the setter that settles it. */
function deferred<T>() {
  let mark!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    mark = resolve;
  });
  return { promise, mark };
}

async function within<T>(
  promise: Promise<T>,
  ms: number,
  failure: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(failure)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** A plan and one task; an optional live handle lets the watch inject. */
async function injectedScope(opts: { live?: () => LiveAgents } = {}) {
  const { repo, goal } = setupFlowRepo({
    limits: {
      concurrency: { overall: 1 },
      steerDebounceSeconds: DEBOUNCE_SECONDS,
    },
  });
  const harness = new FakeHarness({
    id: "fake",
    ...(opts.live ? { live: opts.live } : {}),
  });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  return { repo, runtime, harness };
}

/**
 * An injected steer routed to the architect stays in the inbox for its own
 * consumer; the committed route is its claim, so no later pass runs a second
 * PM turn for it.
 */
function injectedSteerIsClaimedOnce(): void {
  it("claims an injected steer once when it routes to the architect", async () => {
    const injected: string[] = [];
    const injectedOnce = deferred<string>();
    const agents: LiveAgents = {
      list: async () => [],
      steer: async () => {},
      steerSession: async (message) => {
        injected.push(message);
        injectedOnce.mark(message);
      },
    };
    const { repo, runtime, harness } = await injectedScope({
      live: () => agents,
    });
    try {
      let pmCalls = 0;
      let maxActive = 0;
      let active = 0;

      harness.script(
        async (req, ctx) => {
          pmCalls += 1;
          active += 1;
          maxActive = Math.max(maxActive, active);
          try {
            if (pmCalls > 1) {
              // A second claim is the bug; answer s2 so the run completes and
              // the assertions name the duplicate instead of a timeout.
              ctx.writeOutcome(
                outcome({
                  summary: "s2 claimed a second time",
                  steerRoutes: [{ steer: "s2", route: "architect" }],
                }),
              );
              return fakeTurnResult(req);
            }
            expect(req.prompt).toContain("s1");
            expect(req.prompt).not.toContain("Add a beta note.");
            await postSteer(runtime.store, "s2", "Add a beta note.");
            const message = await within(
              injectedOnce.promise,
              10_000,
              "the running PM turn was not steered",
            );
            expect(message).toContain("s2");
            expect(message).toContain("Add a beta note.");
            // A task route is accepted only when its answer is backed by a
            // task-file change; the amendment is the route's write.
            fs.appendFileSync(
              path.join(runtime.store.tasksDir, "alpha.md"),
              "\nPM amendment: s1 keeps alpha small.\n",
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "routed s1 and s2",
                steerRoutes: [
                  { steer: "s1", route: "task", answer: "alpha kept small" },
                  { steer: "s2", route: "architect" },
                ],
              }),
            );
            return fakeTurnResult(req);
          } finally {
            active -= 1;
          }
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Keep alpha small.");
        }),
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(approver("alpha is correct"), {
        when: whenTurn({ slug: "alpha", step: "review" }),
      });

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        steerWatchTickMs: WATCH_TICK_MS,
      });

      expect(dispatched.reason).toBe("boundary");
      expect(pmCalls).toBe(1);
      expect(maxActive).toBe(1);
      expect(injected).toHaveLength(1);
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "steer-routes")).toHaveLength(1);
      expect(collectSteerRoutes(records).get("s2")?.route).toBe("architect");
      // The routed steer stays queued for the architect, not for a second PM.
      expect(inboxHas(runtime, "s2")).toBe(true);
      expect(outboxOf(runtime, "s1")).toContain("alpha kept small");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/**
 * An injected steer whose PM turn commits no route stays in the inbox: the
 * turn already ran, so no later pass claims it and no route is recorded.
 */
function injectedSteerStaysSeenWithoutRoutes(): void {
  it("keeps an injected steer in the inbox when the PM turn routes nothing", async () => {
    const injectedOnce = deferred<string>();
    const agents: LiveAgents = {
      list: async () => [],
      steer: async () => {},
      steerSession: async (message) => {
        injectedOnce.mark(message);
      },
    };
    const { repo, runtime, harness } = await injectedScope({
      live: () => agents,
    });
    try {
      let pmCalls = 0;
      harness.script(
        async (req, ctx) => {
          pmCalls += 1;
          await postSteer(runtime.store, "s2", "Add a beta note.");
          const message = await within(
            injectedOnce.promise,
            10_000,
            "the running PM turn was not steered",
          );
          expect(message).toContain("s2");
          expect(message).toContain("Add a beta note.");
          ctx.writeOutcome(
            outcome({
              summary: "no routes committed",
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }), fallback: true },
      );
      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Keep alpha small.");
        }),
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(approver("alpha is correct"), {
        when: whenTurn({ slug: "alpha", step: "review" }),
      });

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        steerWatchTickMs: WATCH_TICK_MS,
      });

      expect(dispatched.reason).toBe("boundary");
      expect(pmCalls).toBe(1);
      expect(inboxHas(runtime, "s1")).toBe(true);
      expect(inboxHas(runtime, "s2")).toBe(true);
      expect(
        (await runtime.store.listRecords()).filter(
          (r) => r.step === "steer-routes",
        ),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("a steer is claimed exactly once", () => {
  routedSteerIsNotClaimedAgain();
  storedTaskAnswerIsDelivered();
  injectedSteerIsClaimedOnce();
  injectedSteerStaysSeenWithoutRoutes();
});

describe("a relaunch answers a routed steer once", () => {
  relaunchAnswersOneSteerOnce();
});

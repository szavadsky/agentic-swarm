import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import {
  approver,
  tasks as flowTasks,
  writePlan,
} from "./steer-holds-helpers.js";

const TICK_MS = 20;

/** Resolves the promise, or throws the named failure after `ms`. */
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

/** The batch's one PM turn: every steer reached it and is routed. */
function steerTurnPm(
  ids: string[],
  texts: string[],
  ran?: () => void,
): FakeTurnHandler {
  return (req, ctx) => {
    for (const text of texts) expect(req.prompt).toContain(text);
    ctx.writeOutcome(
      outcome({
        summary: `routed ${ids.join(", ")}`,
        steerRoutes: ids.map((steer) => ({ steer, route: "architect" })),
      }),
    );
    ran?.();
    return fakeTurnResult(req);
  };
}

describe("steers dropped inside one debounce", () => {
  it("claims three steers across three dispatch passes as one PM turn", async () => {
    const DEBOUNCE_MS = 4000;
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1 },
        steerDebounceSeconds: DEBOUNCE_MS / 1000,
      },
    });
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    writePlan(runtime);
    const slugs = ["alpha", "beta", "gamma"];
    for (const slug of slugs) {
      await writeTask(runtime, task(slug, { scope: [`${slug}.txt`] }));
    }
    const steers = slugs.map((slug) => `Keep ${slug} unmerged.`);
    const droppedAt: number[] = [];
    let markPmRan!: () => void;
    const pmRan = new Promise<void>((resolve) => {
      markPmRan = resolve;
    });

    try {
      harness.script(
        async (req, ctx) => {
          const slug = path.basename(req.cwd!);
          droppedAt.push(Date.now());
          await postSteer(runtime.store, `s-${slug}`, `Keep ${slug} unmerged.`);
          if (droppedAt.length === slugs.length) {
            // The batch's PM turn must run while the last task is still live:
            // only the watch can bring it in before this turn ends.
            await within(
              pmRan,
              20_000,
              "the batch's PM turn did not run while the last turn was live",
            );
          }
          fs.writeFileSync(
            path.join(req.cwd!, `${slug}.txt`),
            `${slug}\n`,
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "implement" }), fallback: true },
      );
      harness.script(approver("approved"), {
        when: whenTurn({ step: "review" }),
        fallback: true,
      });
      harness.script(
        steerTurnPm(
          slugs.map((slug) => `s-${slug}`),
          steers,
          markPmRan,
        ),
        { when: whenTurn({ step: "pm" }) },
      );

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
        steerWatchTickMs: TICK_MS,
      });

      expect(dispatched.reason).toBe("boundary");
      const pm = harness.calls.filter(
        (call) => fakeTurnIdentity(call).step === "pm",
      );
      expect(pm).toHaveLength(1);
      for (const text of steers) expect(pm[0]!.prompt).toContain(text);
      expect(droppedAt).toHaveLength(slugs.length);
      expect(droppedAt[droppedAt.length - 1]! - droppedAt[0]!).toBeLessThan(
        DEBOUNCE_MS,
      );
      const merged = (await flowTasks(runtime)).tasks;
      for (const slug of slugs) expect(merged[slug]!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("holds a pass with nothing in flight until the batch's window closes", async () => {
    const DEBOUNCE_MS = 1000;
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1 },
        steerDebounceSeconds: DEBOUNCE_MS / 1000,
      },
    });
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    writePlan(runtime);
    const ids = ["alpha", "beta", "gamma"].map((slug) => `s-${slug}`);
    const steers = ["alpha", "beta", "gamma"].map(
      (slug) => `Keep ${slug} unmerged.`,
    );
    const droppedAt: number[] = [];

    try {
      harness.script(steerTurnPm(ids, steers), {
        when: whenTurn({ step: "pm" }),
      });

      droppedAt.push(Date.now());
      await postSteer(runtime.store, ids[0]!, steers[0]!);

      const dispatched = runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
        steerWatchTickMs: TICK_MS,
      });

      await sleep(200);
      droppedAt.push(Date.now());
      await postSteer(runtime.store, ids[1]!, steers[1]!);
      await sleep(200);
      droppedAt.push(Date.now());
      await postSteer(runtime.store, ids[2]!, steers[2]!);

      expect((await dispatched).reason).toBe("boundary");
      const pm = harness.calls.filter(
        (call) => fakeTurnIdentity(call).step === "pm",
      );
      expect(pm).toHaveLength(1);
      for (const text of steers) expect(pm[0]!.prompt).toContain(text);
      expect(droppedAt[droppedAt.length - 1]! - droppedAt[0]!).toBeLessThan(
        DEBOUNCE_MS,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { expectDispatch } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { makeRuntime, whenTurn } from "./s2-helpers.js";
import {
  outcome,
  setupRepo,
  scriptInterruptedFirstLaunch,
  silenceWarn,
  RESUME_ASK,
} from "./resume-helpers.js";

/** A repo override that proves the fragment is rendered from config. */
const CONFIGURED_RESUME =
  "- resume: CONFIGURED RESUME for {{ branch }}; assess status first, keep going\n";

describe("relaunch after an interrupted turn", () => {
  it("relaunches the interrupted turn in its worktree with the configured resume prompt and no digest", async () => {
    const { repo, goalDir, taskDir } = setupRepo();
    const controller = createDrainController();
    const restoreWarn = silenceWarn();
    try {
      await hardDeathFirstLaunch(goalDir, taskDir, controller, repo);
      const interrupted = await hardDeathOrphan(repo, true);
      const relaunched = await hardDeathRelaunch(goalDir, repo, {
        ...interrupted,
        configured: true,
      });
      expect(relaunched.prompt).toContain(
        "CONFIGURED RESUME for factory-task/demo/beta",
      );
      await expectHardDeathRelaunch(relaunched, interrupted.session);
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);

  it("relaunches an interrupted turn with no stored session in the same worktree", async () => {
    const { repo, goalDir, taskDir } = setupRepo();
    const controller = createDrainController();
    const restoreWarn = silenceWarn();
    try {
      await hardDeathFirstLaunch(goalDir, taskDir, controller, repo);
      const interrupted = await hardDeathOrphan(repo, false);
      const relaunched = await hardDeathRelaunch(goalDir, repo, {
        ...interrupted,
        configured: false,
      });
      expect(relaunched.prompt).toContain(RESUME_ASK);
      await expectHardDeathRelaunch(relaunched, undefined);
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);
});

/** Runs the first launch to a clean SIGINT during alpha's review. */
async function hardDeathFirstLaunch(
  goalDir: string,
  taskDir: string,
  controller: ReturnType<typeof createDrainController>,
  repo: ReturnType<typeof setupRepo>["repo"],
): Promise<void> {
  const first = new FakeHarness({ id: "fake" });
  scriptInterruptedFirstLaunch(first, goalDir, taskDir, controller);
  await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
    harnesses: { fake: first },
    signals: controller,
  });
}

interface InterruptedTurn {
  /** The worktree the dying turn was working in. */
  wtPath: string;
  session?: SessionRef;
}

/** Leaves beta's implement turn open with half its work written, as a kill mid-turn does. */
async function hardDeathOrphan(
  repo: ReturnType<typeof setupRepo>["repo"],
  withSession: boolean,
): Promise<InterruptedTurn> {
  const runtime = await makeRuntime(repo, "demo", {
    fake: new FakeHarness({ id: "fake" }),
  });
  const beta = (await runtime.store.listTasks()).find(
    (task) => task.slug === "beta",
  );
  if (!beta) throw new Error("the first launch filed no beta task");
  const ensured = await ensureTaskWorktree(runtime, beta);
  if (ensured.error) throw new Error(ensured.error);
  fs.writeFileSync(path.join(ensured.path, "beta.txt"), "half\n", "utf8");
  const session: SessionRef = {
    harness: "fake",
    id: "session-beta-1",
    cwd: ensured.path,
    model: { id: "fake-impl" },
    lastRequestStartedAt: new Date().toISOString(),
    retentionTier: "short",
    compacted: false,
  };
  await runtime.store.startRecord({
    iteration: 1,
    slug: "beta",
    step: "implement",
    round: 1,
    actor: "agent",
    alias: "implementer",
    model: { id: "fake-impl" },
    ...(withSession ? { session } : {}),
  });
  const orphans = (await runtime.store.listRecords()).filter((r) => !r.endedAt);
  expect(orphans).toHaveLength(1);
  return { wtPath: ensured.path, ...(withSession ? { session } : {}) };
}

interface RelaunchScope extends InterruptedTurn {
  configured: boolean;
}

/**
 * Relaunches the goal. The beta implement turn asserts the relaunch itself:
 * same worktree with the half-written file, the resume fragment (repo override
 * or builtin), and the recorded session, or none.
 */
async function hardDeathRelaunch(
  goalDir: string,
  repo: ReturnType<typeof setupRepo>["repo"],
  scope: RelaunchScope,
): Promise<{
  store: ReturnType<typeof createFolderStore>;
  records: Awaited<
    ReturnType<ReturnType<typeof createFolderStore>["listRecords"]>
  >;
  prompt: string;
}> {
  if (scope.configured) {
    const dir = path.join(repo.dir, ".factory/prompts");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "resume.md"), CONFIGURED_RESUME, "utf8");
  }
  const second = new FakeHarness({ id: "fake" });
  let prompt = "";
  second.script(
    (req, ctx) => {
      prompt = req.prompt;
      expect(req.cwd).toBe(scope.wtPath);
      expect(fs.readFileSync(path.join(req.cwd!, "beta.txt"), "utf8")).toBe(
        "half\n",
      );
      expect(req.prompt).toContain(
        scope.configured
          ? "CONFIGURED RESUME for factory-task/demo/beta"
          : RESUME_ASK,
      );
      expect(req.session).toEqual(scope.session);
      fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "beta finished" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
  second.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "beta approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "review" }) },
  );
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  await expectDispatch(
    0,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
    { harnesses: { fake: second } },
  );
  const store = createFolderStore(goalDir, undefined, {});
  return { store, records: await store.listRecords(), prompt };
}

/** The interrupt relaunch runs in the same iteration with no digest and no PM post. */
async function expectHardDeathRelaunch(
  scope: Awaited<ReturnType<typeof hardDeathRelaunch>>,
  session: SessionRef | undefined,
): Promise<void> {
  const { store, records } = scope;
  const state = derive(await store.listTasks(), records);
  expect(state.goal).toBe("done");
  expect(state.tasks.beta!.status).toBe("merged");
  const sealed = records.find(
    (r) =>
      r.slug === "beta" && r.step === "implement" && r.stop?.kind === "infra",
  );
  expect(sealed?.stop).toEqual({ kind: "infra", cause: "crash" });
  expect(sealed?.ok).toBe(false);
  expect(sealed?.session).toEqual(session);
  expect(
    records.filter((r) => r.slug === "beta").every((r) => r.iteration === 1),
  ).toBe(true);
  // The interrupt relaunch runs no digest and posts nothing to the PM.
  expect(records.filter((r) => r.step === "digest")).toHaveLength(0);
  expect(await store.readFile("iterations/1/digest.md")).toBeNull();
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "pm" && r.iteration === 1,
    ),
  ).toHaveLength(1);
  const routes = records.filter((r) => r.step === "steer-routes");
  expect(
    routes.some((r) =>
      (r.outcome?.steerRoutes ?? []).some((entry) =>
        entry.steer.startsWith("digest-1-"),
      ),
    ),
  ).toBe(false);
}

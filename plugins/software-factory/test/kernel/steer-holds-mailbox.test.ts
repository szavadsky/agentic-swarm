import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { type DispatchResult, runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, quarantineDir } from "../../src/kernel/mailbox.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  approver,
  implementer,
  tasks,
  writePlan,
} from "./steer-holds-helpers.js";

async function runGrowingSteerFirstPass(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  harness: FakeHarness,
  inbox: string,
  file: string,
): Promise<string> {
  let writer: ReturnType<typeof setInterval> | undefined;
  let appends = 0;
  try {
    // The file must keep growing until the whole first dispatch resolves:
    // any pair of passes that sees the same content may claim the steer.
    writer = setInterval(() => {
      if (!fs.existsSync(file)) return;
      fs.appendFileSync(file, " unmerged until I answer.", "utf8");
      appends += 1;
    }, 5);

    harness.script(
      implementer("alpha.txt", () => {
        fs.mkdirSync(inbox, { recursive: true });
        fs.writeFileSync(file, "Keep alpha", "utf8");
      }),
    );
    harness.script(approver("alpha is correct"));

    let first: DispatchResult;
    try {
      first = await runDispatch(runtime, { iteration: 1, seenSteers: [] });
    } finally {
      clearInterval(writer);
    }
    expect(first.reason).toBe("boundary");
    // The half-written steer is not claimed on that pass: no PM turn yet and
    // the drop stays in the inbox for a later reader.
    expect(
      (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm",
      ),
    ).toHaveLength(0);
    expect(fs.existsSync(file)).toBe(true);
    expect(appends).toBeGreaterThan(0);

    const full = fs.readFileSync(file, "utf8").trim();
    expect(full).toContain("Keep alpha unmerged until I answer.");
    return full;
  } finally {
    if (writer) clearInterval(writer);
  }
}

async function runSettledSteerSecondPass(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  harness: FakeHarness,
  full: string,
): Promise<void> {
  harness.script((req, ctx) => {
    expect(req.prompt).toContain(full);
    ctx.writeOutcome(outcome({ summary: "structured the settled steer" }));
    return fakeTurnResult(req);
  });

  const second = await runDispatch(runtime, {
    iteration: 2,
    seenSteers: [],
  });
  expect(second.reason).toBe("boundary");
  expect(
    (await runtime.store.listRecords()).filter(
      (record) => record.step === "pm",
    ),
  ).toHaveLength(1);
  expect(
    harness.calls.filter((call) => call.prompt.includes("Keep alpha")),
  ).toHaveLength(1);
}

function registerMidRunSteerHoldsPart1(): void {
  it("does not claim a fresh steer that is still growing across the settle interval", async () => {
    const { repo, goal } = setupFlowRepo({
      // The settle window must outlast the writer's cadence.
      limits: { concurrency: { overall: 1 }, steerDebounceSeconds: 0.02 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

      const inbox = path.join(runtime.store.goalDir, "mailbox/inbox");
      const file = path.join(inbox, "s1.md");
      const full = await runGrowingSteerFirstPass(
        runtime,
        harness,
        inbox,
        file,
      );
      await runSettledSteerSecondPass(runtime, harness, full);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart2(): void {
  it("ignores a malformed hold left in the mailbox, leaves it for the launch sweep, and dispatches normally", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));
      const dir = holdsDir(runtime.store);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "s1.yaml"),
        "slugs: alpha\ngoal: maybe\n",
        "utf8",
      );

      harness.script(implementer("alpha.txt"));
      harness.script(approver("alpha is correct"));
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
      });
      expect(dispatched.reason).toBe("boundary");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("merged");
      // Dispatch never sweeps: the file stays and no record is written.
      expect(fs.existsSync(path.join(dir, "s1.yaml"))).toBe(true);
      expect(fs.existsSync(quarantineDir(runtime.store))).toBe(false);
      expect(
        (await runtime.store.listRecords()).some(
          (r) => r.step === "hold-quarantine",
        ),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("mid-run steer holds", () => {
  registerMidRunSteerHoldsPart1();

  registerMidRunSteerHoldsPart2();
});

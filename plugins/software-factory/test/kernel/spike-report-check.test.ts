import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { git } from "../../src/core/git/exec.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  checkSpikeReport,
  SPIKE_REPORT_CHECK,
  spikeReportPath,
} from "../../src/kernel/spike-report.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { stateOf } from "./continuation-helpers.js";

const spike = (slug: string) =>
  task(slug, { kind: "spike", flow: "spike", scope: ["spike area"] });

/** Scripts an implement turn: writes the report (or nothing) and reports done. */
function implementTurn(
  harness: FakeHarness,
  slug: string,
  summary: string,
  report?: string,
): void {
  harness.script((req, ctx) => {
    if (report !== undefined) {
      const file = path.join(req.cwd!, spikeReportPath(slug));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, report, "utf8");
    }
    ctx.writeOutcome(outcome({ summary }));
    return fakeTurnResult(req);
  });
}

function approveTurn(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "finding holds", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

async function stepsOf(
  runtime: KernelRuntime,
  slug: string,
): Promise<StepRecord[]> {
  return (await runtime.store.listRecords()).filter(
    (r) => r.slug === slug && r.endedAt,
  );
}

const names = (records: StepRecord[]) =>
  records.filter((r) => r.step !== "commit").map((r) => r.step);

describe("spike report check", () => {
  it("sends a spike that committed no report to a gate-fix turn, not review", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      implementTurn(harness, "no-report", "looked around");
      implementTurn(harness, "no-report", "wrote it down", "# Finding\nA.\n");
      approveTurn(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, spike("no-report"));
      await runDispatch(runtime, { iteration: 1 });

      const records = await stepsOf(runtime, "no-report");
      expect(names(records)).toEqual([
        "implement",
        "checks",
        "implement",
        "checks",
        "review",
        "finish",
      ]);
      const [red, green] = records.filter((r) => r.step === "checks");
      expect(red!.ok).toBe(false);
      const missing = red!.checks!.find((c) => c.name === SPIKE_REPORT_CHECK);
      expect(missing!.ok).toBe(false);
      expect(missing!.summary).toContain(spikeReportPath("no-report"));
      expect(
        green!.checks!.find((c) => c.name === SPIKE_REPORT_CHECK)!.ok,
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks after the gate-fix rounds run out and names the report path", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      for (const n of [1, 2, 3, 4]) {
        implementTurn(
          harness,
          "never",
          `attempt ${n}`,
          n === 4 ? "  \n\t\n" : undefined,
        );
      }
      scriptStallLeave(harness, ["never"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, spike("never"));
      await runDispatch(runtime, { iteration: 1 });

      const parked = (await stateOf(runtime)).tasks.never!;
      expect(parked.status).toBe("parked");
      expect(parked.cause).toBe(
        `gates: ${SPIKE_REPORT_CHECK} (${spikeReportPath("never")})`,
      );
      expect(names(await stepsOf(runtime, "never"))).not.toContain("review");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("lets a spike with a non-empty committed report reach review", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      implementTurn(harness, "reported", "done", "# Finding\nB.\n");
      approveTurn(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, spike("reported"));
      await runDispatch(runtime, { iteration: 1 });

      const records = await stepsOf(runtime, "reported");
      expect(names(records)).toEqual([
        "implement",
        "checks",
        "review",
        "finish",
      ]);
      const checks = records.find((r) => r.step === "checks")!;
      expect(checks.ok).toBe(true);
      expect(checks.checks!.map((c) => c.name)).toContain(SPIKE_REPORT_CHECK);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("adds no spike-report check to a development task", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "dev.txt"), "dev\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "built" }));
        return fakeTurnResult(req);
      });
      approveTurn(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("dev", { scope: ["dev.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const checks = (await stepsOf(runtime, "dev")).filter(
        (r) => r.step === "checks",
      );
      expect(checks.length).toBeGreaterThan(0);
      for (const record of checks) {
        expect(record.checks!.map((c) => c.name)).not.toContain(
          SPIKE_REPORT_CHECK,
        );
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("checkSpikeReport", () => {
  const slug = "probe";
  const reportPath = spikeReportPath(slug);

  async function commitFile(dir: string, content: string): Promise<string> {
    const file = path.join(dir, reportPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    await git(dir, ["add", "-A"]);
    await git(dir, ["commit", "-m", "report"]);
    return (await git(dir, ["rev-parse", "HEAD"])).stdout.trim();
  }

  it("is red for a whitespace-only committed report", async () => {
    const { repo } = setupFlowRepo();
    try {
      const commit = await commitFile(repo.dir, " \n\t\n");
      const check = await checkSpikeReport(repo.dir, slug, commit);
      expect(check.ok).toBe(false);
      expect(check.summary).toBe(`report is blank at ${reportPath}`);
    } finally {
      cleanupFlowRepo(repo);
    }
  });

  it("reads the commit's tree, not the working directory", async () => {
    const { repo } = setupFlowRepo();
    try {
      const base = (await git(repo.dir, ["rev-parse", "HEAD"])).stdout.trim();
      const file = path.join(repo.dir, reportPath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "# Finding\nuncommitted\n", "utf8");
      const check = await checkSpikeReport(repo.dir, slug, base);
      expect(check.ok).toBe(false);
      expect(check.summary).toBe(`no report committed at ${reportPath}`);
    } finally {
      cleanupFlowRepo(repo);
    }
  });

  it("fails loudly when git cannot read the commit", async () => {
    const { repo } = setupFlowRepo();
    try {
      await expect(
        checkSpikeReport(repo.dir, slug, "not-a-commit"),
      ).rejects.toThrow(/show/);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
});

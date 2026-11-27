import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { validateFile } from "../../src/cli/commands.js";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { DASHBOARD_REL_PATH } from "../../src/kernel/dashboard.js";
import { derive } from "../../src/kernel/derive.js";
import { writeStatus } from "../../src/kernel/status.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { prepareIntegrationCheckout } from "../../src/kernel/worktree.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { writeRecordOutcome } from "./outcome-fixtures.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";
import { writePlan } from "./steer-helpers.js";

const REPO_INTENT = [
  "# Repo Intent",
  "",
  "## Core",
  "",
  "- [[KernelCore]] Deterministic orchestration.",
  "- [[ctxOnly:ModelEconomics]] Cost model context.",
].join("\n");

const POINTER_NOTE = [
  "# Goal: full",
  "",
  "Review intent file (`INTENT.md` at the repo root, source of truth) and build everything specified.",
  "",
  "Footnote: `GAPS.md` lists known gaps.",
].join("\n");

function architectOutcomeYaml(slug: string): string {
  return [
    "status: done",
    "summary: planned against repo intent",
    "decision: done",
    "concerns: []",
    "forward: []",
    "intentStatus:",
    `  - slug: ${slug}`,
    "    status: works",
  ].join("\n");
}

describe("factory validate on a pointer intent", () => {
  it("validates referenced file slugs and rejects unknown ones", async () => {
    const repo = createTmpRepo();
    try {
      repo.writeFile(".factory/repo.yaml", "baseBranch: main\n");
      repo.writeFile("INTENT.md", REPO_INTENT);
      repo.commit("add repo intent", [".factory/repo.yaml", "INTENT.md"]);

      const goalDir = path.join(repo.dir, ".factory", "artifacts", "demo");
      fs.mkdirSync(goalDir, { recursive: true });
      fs.writeFileSync(path.join(goalDir, "intent.md"), POINTER_NOTE, "utf8");

      const validFile = writeRecordOutcome(
        repo.dir,
        ".factory",
        "architect",
        architectOutcomeYaml("KernelCore"),
      );
      expect(
        (await validateFile(validFile, { step: "architect" })).findings,
      ).toEqual([]);

      const unknownFile = writeRecordOutcome(
        repo.dir,
        ".factory",
        "architect",
        architectOutcomeYaml("Nope"),
      );
      const unknownFindings = (
        await validateFile(unknownFile, { step: "architect" })
      ).findings;
      expect(unknownFindings).toHaveLength(1);
      expect(unknownFindings[0]).toContain('unknown intent slug "Nope"');
      expect(unknownFindings[0]).toContain("INTENT.md");
    } finally {
      repo.cleanup();
    }
  });

  it("reports a missing referenced file in factory validate", async () => {
    const repo = createTmpRepo();
    try {
      repo.writeFile(".factory/repo.yaml", "baseBranch: main\n");
      repo.commit("add repo config", [".factory/repo.yaml"]);

      const goalDir = path.join(repo.dir, ".factory", "artifacts", "demo");
      fs.mkdirSync(goalDir, { recursive: true });
      fs.writeFileSync(
        path.join(goalDir, "intent.md"),
        "# Goal\n\nBuild as specified in `docs/MISSING.md`.\n",
        "utf8",
      );

      const file = writeRecordOutcome(
        repo.dir,
        ".factory",
        "architect",
        architectOutcomeYaml("KernelCore"),
      );
      const findings = (await validateFile(file, { step: "architect" }))
        .findings;
      expect(findings).toHaveLength(1);
      expect(findings[0]).toContain("docs/MISSING.md");
    } finally {
      repo.cleanup();
    }
  });

  it("prefers the goal checkout over the base repo when a goal worktree exists", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      repo.writeFile("INTENT.md", "# Repo Intent\n\nNo slugs on base yet.\n");
      repo.commit("add unannotated intent", ["INTENT.md"]);

      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await prepareIntegrationCheckout(runtime);

      fs.writeFileSync(
        path.join(runtime.paths.goalCheckout, "INTENT.md"),
        REPO_INTENT,
        "utf8",
      );
      repo.git(["add", "INTENT.md"], { cwd: runtime.paths.goalCheckout });
      repo.git(["commit", "-m", "annotate intent on goal branch"], {
        cwd: runtime.paths.goalCheckout,
      });
      fs.writeFileSync(path.join(goalDir, "intent.md"), POINTER_NOTE, "utf8");

      const file = writeRecordOutcome(
        repo.dir,
        ".factory",
        "architect",
        architectOutcomeYaml("KernelCore"),
      );
      expect(
        (await validateFile(file, { step: "architect" })).findings,
      ).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
});

describe("architect boundary and dashboard on a pointer intent", () => {
  it("repairs an unknown slug, accepts a referenced slug and renders it on the dashboard", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      repo.writeFile("INTENT.md", REPO_INTENT);
      repo.commit("add repo intent", ["INTENT.md"]);

      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(path.join(goalDir, "intent.md"), POINTER_NOTE, "utf8");
      writePlan(runtime);

      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "tried unknown slug",
            decision: "done",
            intentStatus: [{ slug: "UnknownSlug", status: "works" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain('unknown intent slug "UnknownSlug"');
        ctx.writeOutcome(
          outcome({
            summary: "verified against INTENT.md",
            decision: "done",
            intentStatus: [
              {
                slug: "KernelCore",
                section: "Core",
                status: "works",
                note: "deterministic loop",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("done");
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === "architect",
        ),
      ).toHaveLength(2);

      const records = await runtime.store.listRecords();
      const tasks = await runtime.store.listTasks();
      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state: derive(tasks, records),
        records,
        decision: "done",
      });
      await writeStatus({
        store: runtime.store,
        flows: runtime.configs.process.flows,
        priceSource: {
          fetchModels: async () => {
            throw new Error("prices disabled in test");
          },
        },
      });

      const html = fs.readFileSync(
        path.join(goalDir, DASHBOARD_REL_PATH),
        "utf8",
      );
      expect(html).toContain('<code class="slug">KernelCore</code>');
      expect(html).toContain("badge intent-works");
      expect(html).toContain("deterministic loop");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

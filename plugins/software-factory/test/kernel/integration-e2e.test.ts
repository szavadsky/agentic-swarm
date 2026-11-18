import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { GoalMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import {
  cleanup,
  expectDispatch,
  outcome,
  scriptDigest,
  stateOf,
} from "./e2e-helpers.js";

const PLAN_1 = `# Milestone 1

## alpha
Create alpha.txt.
Done when: alpha.txt exists.

## beta
Create beta.txt with the first direction.
Done when: beta.txt exists.

## gamma
Depends on beta landing; create gamma.txt.
Done when: gamma.txt exists.
`;

const PLAN_2 = `# Milestone 1

## alpha
Merged; alpha.txt stays.

## beta2
Continue the parked beta work on its kept branch; beta2.txt completes it.
Done when: beta2.txt exists beside beta.txt.

## gamma
Depends on beta2 landing; create gamma.txt.
Done when: gamma.txt exists.
`;

function task(
  slug: string,
  file: string,
  opts: { deps?: string[]; base?: string; body?: string } = {},
): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: Create ${file}`,
    "kind: task",
    "flow: implement-review",
    `deps: [${(opts.deps ?? []).join(", ")}]`,
    `scope: [${file}]`,
    ...(opts.base ? [`base: ${opts.base}`] : []),
    "source: plan",
    "---",
    "",
    opts.body ?? `Create ${file}.`,
    "",
    `Done when: ${file} exists.`,
    "",
  ].join("\n");
}

const ALPHA = task("alpha", "alpha.txt");
const BETA = task("beta", "beta.txt");
const GAMMA_1 = task("gamma", "gamma.txt", { deps: ["beta"] });
const BETA_2 = task("beta2", "beta2.txt", { base: "beta" });
const GAMMA_2 = task("gamma", "gamma.txt", { deps: ["beta2"] });

function write(goalDir: string, rel: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(goalDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(goalDir, rel), text, "utf8");
}

function writeTask(goalDir: string, slug: string, text: string): void {
  write(goalDir, `tasks/${slug}.md`, text);
}

function summaryOf(goalDir: string, iteration: number): string {
  return fs.readFileSync(
    path.join(goalDir, `iterations/${iteration}/summary.md`),
    "utf8",
  );
}

async function metricsOf(goalDir: string): Promise<GoalMetrics> {
  return yaml.parse(
    fs.readFileSync(path.join(goalDir, "metrics.yaml"), "utf8"),
  ) as GoalMetrics;
}

function runYaml(repoDir: string): string {
  const base = path.basename(repoDir);
  return [
    "aliases:",
    "  architect: { harness: fake, model: fake-architect }",
    "  pm: { harness: fake, model: fake-pm }",
    "  implementer: { harness: fake, model: fake-impl }",
    "  reviewer: { harness: fake, model: fake-review }",
    "  steward: { harness: fake, model: fake-steward }",
    "  plan-checker: { harness: fake, model: fake-check }",
    "  plan-reviewer: { harness: fake, model: fake-plan-review }",
    "  digest: { harness: fake, model: fake-digest }",
    "limits: { iterations: 1, concurrency: { overall: 1 } }",
    `worktreeRoot: ../${base}-wt`,
    `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
    "",
  ].join("\n");
}

describe("cross-slice E2E — init, steer and three launches through S2/S3/S4", () => {
  it("merges, parks, continues with base, answers the steer and ends done", async () => {
    const repo = createTmpRepo();
    const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
    const goal = {
      repo,
      goalDir,
      planPath: path.join(goalDir, "plan.md"),
      tasksDir: path.join(goalDir, "tasks"),
    };
    try {
      repo.writeFile(".factory/run.yaml", runYaml(repo.dir));
      const intentPath = path.join(repo.dir, "INTENT.md");
      fs.writeFileSync(
        intentPath,
        "# Goal\n\nBuild alpha, beta and gamma.\n",
        "utf8",
      );
      repo.commit("factory config and intent");

      // factory init through the CLI
      const initCode = await dispatch(
        ["init", "--repo", repo.dir, "--goal", "demo", "--intent", intentPath],
        {},
      );
      expect(initCode).toBe(0);
      expect(fs.existsSync(path.join(repo.dir, ".factory/repo.yaml"))).toBe(
        true,
      );
      expect(
        fs.readFileSync(path.join(goalDir, "intent.md"), "utf8"),
      ).toContain("Build alpha");
      fs.writeFileSync(
        path.join(goalDir, "class.yaml"),
        "class: bigger\n",
        "utf8",
      );

      // Launch 1: alpha merges, beta is rejected on review, gamma waits.
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        expect(req.prompt).toContain("- turn: `first`");
        write(goalDir, "plan.md", PLAN_1);
        ctx.writeOutcome(
          outcome({
            summary: "planned alpha, beta, gamma",
            decision: "continue",
          }),
        );
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        for (const [slug, text] of [
          ["alpha", ALPHA],
          ["beta", BETA],
          ["gamma", GAMMA_1],
        ] as const) {
          writeTask(goalDir, slug, text);
        }
        ctx.writeOutcome(outcome({ summary: "filed three tasks" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        write(req.cwd!, "alpha.txt", "alpha\n");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        write(req.cwd!, "beta.txt", "beta v1\n");
        ctx.writeOutcome(outcome({ summary: "beta v1" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "beta needs the second direction",
            verdict: "changes",
          }),
        );
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        write(req.cwd!, "beta.txt", "beta v2\n");
        ctx.writeOutcome(outcome({ summary: "beta v2" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "not salvageable", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });

      await expectDispatch(3, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: first },
      });

      let state = await stateOf(goalDir);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks.beta!.cause).toContain("review rejected");
      expect(state.tasks.gamma!.status).toBe("pending");
      expect(summaryOf(goalDir, 1)).toContain(
        "review rejected: not salvageable",
      );
      expect(summaryOf(goalDir, 1)).toContain("- merged: alpha");
      expect(
        fs.existsSync(
          path.join(goalDir, "mailbox/outbox/iteration-1-summary.md"),
        ),
      ).toBe(true);
      const one = await metricsOf(goalDir);
      expect(one.iterations.map((i) => i.n)).toEqual([1]);
      expect(one.iterations[0]!.turns).toBe(10);
      expect(one.iterations[0]!.merged).toEqual(["alpha"]);
      expect(one.iterations[0]!.parked).toEqual(["beta"]);
      const betaTip = repo
        .git(["rev-parse", "factory-task/demo/beta"])
        .stdout.trim();

      // factory steer through the CLI
      const steerPath = path.join(repo.dir, "steer-source.md");
      fs.writeFileSync(
        steerPath,
        "Keep the parked beta branch; finish it as beta2.\n",
        "utf8",
      );
      expect(
        await dispatch(
          ["steer", "--repo", repo.dir, "--goal", "demo", steerPath],
          {},
        ),
      ).toBe(0);
      const inbox = fs.readdirSync(path.join(goalDir, "mailbox/inbox"));
      expect(inbox.length).toBe(1);
      const steerId = path.basename(inbox[0]!, ".md");

      // Launch 2: architect answers the steer, PM reconciles, beta2 continues
      // beta's kept branch, gamma follows beta2.
      const second = new FakeHarness({ id: "fake" });
      scriptDigest(second, goalDir, 2);
      second.script((req, ctx) => {
        expect(req.prompt).toContain("- turn: `relaunch`");
        expect(req.prompt).toContain(steerId);
        expect(req.prompt).toContain("Keep the parked beta branch");
        write(goalDir, "plan.md", PLAN_2);
        ctx.writeOutcome(
          outcome({
            summary: "answered the steer, beta2 continues beta",
            decision: "continue",
            forward: [`steer ${steerId}: keep the branch, finish it as beta2`],
          }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        expect(req.prompt).toContain("beta | parked");
        writeTask(goalDir, "beta2", BETA_2);
        writeTask(goalDir, "gamma", GAMMA_2);
        ctx.writeOutcome(
          outcome({ summary: "filed beta2 and re-pointed gamma" }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        expect(fs.readFileSync(path.join(req.cwd!, "beta.txt"), "utf8")).toBe(
          "beta v2\n",
        );
        write(req.cwd!, "beta2.txt", "beta2\n");
        ctx.writeOutcome(
          outcome({ summary: "beta2 completed on beta's branch" }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta2 approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        expect(fs.existsSync(path.join(req.cwd!, "beta2.txt"))).toBe(true);
        write(req.cwd!, "gamma.txt", "gamma\n");
        ctx.writeOutcome(outcome({ summary: "gamma implemented on beta2" }));
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "gamma approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      const integrationBefore = repo
        .git(["rev-parse", "factory/demo"])
        .stdout.trim();
      await expectDispatch(3, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: second },
      });

      state = await stateOf(goalDir);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks.beta2!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("merged");
      expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
        "beta v2",
      );
      expect(repo.git(["show", "factory/demo:beta2.txt"]).stdout.trim()).toBe(
        "beta2",
      );
      expect(repo.git(["show", "factory/demo:gamma.txt"]).stdout.trim()).toBe(
        "gamma",
      );
      const records = await createFolderStore(
        goalDir,
        undefined,
        {},
      ).listRecords();
      const betaMerge = records.find(
        (r) => r.slug === "beta" && r.step === "merge",
      );
      expect(betaMerge).toBeUndefined();
      const continuation = records.find(
        (r) => r.slug === "beta2" && r.step === "implement",
      );
      expect(continuation?.base).toBe(integrationBefore);
      expect(continuation?.base).not.toBe(betaTip);
      const pack = fs.readFileSync(
        path.join(goalDir, "iterations/2/context-pack.md"),
        "utf8",
      );
      expect(pack).toContain(
        `previous iteration summary: ${path.join(goalDir, "iterations/1/summary.md")}`,
      );
      expect(pack).toContain(`- ${steerId}: mailbox/inbox/`);
      expect(fs.readdirSync(path.join(goalDir, "mailbox/inbox"))).toEqual([]);
      expect(fs.readdirSync(path.join(goalDir, "mailbox/processed"))).toContain(
        `${steerId}.md`,
      );
      expect(
        fs.readFileSync(
          path.join(goalDir, `mailbox/outbox/steer-${steerId}.md`),
          "utf8",
        ),
      ).toContain("finish it as beta2");
      expect(summaryOf(goalDir, 2)).toContain("merged: beta2, gamma");
      const two = await metricsOf(goalDir);
      expect(two.iterations.map((i) => i.n)).toEqual([1, 2]);
      expect(two.iterations[1]!.turns).toBe(9);
      expect(two.iterations[1]!.humanInterventions).toBe(1);
      expect(two.iterations[1]!.merged).toEqual(["beta2", "gamma"]);
      expect(two.totals.merged).toEqual(["alpha", "beta2", "gamma"]);

      // Launch 3: architect says done.
      const third = new FakeHarness({ id: "fake" });
      scriptDigest(third, goalDir, 3);
      third.script((req, ctx) => {
        expect(req.prompt).toContain("- turn: `relaunch`");
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });

      await expectDispatch(0, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: third },
      });

      state = await stateOf(goalDir);
      expect(state.goal).toBe("done");
      expect(state.tasks.beta2!.status).toBe("merged");
      expect(summaryOf(goalDir, 3)).toContain("status: goal-met");
      expect(
        fs.existsSync(
          path.join(goalDir, "mailbox/outbox/iteration-3-summary.md"),
        ),
      ).toBe(true);
      const three = await metricsOf(goalDir);
      expect(three.iterations.map((i) => i.n)).toEqual([1, 2, 3]);
      expect(three.iterations[2]!.turns).toBe(2);
      expect(three.totals.parked).toEqual(["beta"]);
      expect(three.totals.loopIncidents).toBe(0);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
});

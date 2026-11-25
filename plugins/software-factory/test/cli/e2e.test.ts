import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { testPriceSource } from "../helpers/price-source.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { scriptKernelRoleFallbacks } from "../kernel/fake-defaults.js";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "../..");

const PLAN = `# Milestone 1 — alpha

## alpha
Create alpha.txt.
Done when: alpha.txt exists.
`;

const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.

Done when: alpha.txt exists.
`;

function outcome(value: Record<string, unknown>) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

function runYaml(repo: TmpRepo): string {
  const base = path.basename(repo.dir);
  return [
    "aliases:",
    "  architect: { harness: fake, model: fake-architect }",
    "  pm: { harness: fake, model: fake-pm }",
    "  digest: { harness: fake, model: fake-digest }",
    "  implementer: { harness: fake, model: fake-impl }",
    "  implementer-b: { harness: fake, model: fake-impl-b }",
    "  researcher: { harness: fake, model: fake-research }",
    "  reviewer: { harness: fake, model: fake-review }",
    "  qa: { harness: fake, model: fake-qa }",
    "  steward: { harness: fake, model: fake-steward }",
    "  plan-checker: { harness: fake, model: fake-check }",
    "  intent: { harness: fake, model: fake-intent }",
    "  plan-reviewer: { harness: fake, model: fake-plan-review }",
    "  pack-preparer: { harness: fake, model: fake-pack-prep }",
    "limits: { iterations: 1, concurrency: { overall: 1 } }",
    `worktreeRoot: ../${base}-wt`,
    `sessions: { dir: ../${base}-sessions, keepRuns: 2, retention: short }`,
    "",
  ].join("\n");
}

function inboxIds(goalDir: string): string[] {
  const dir = path.join(goalDir, "mailbox", "inbox");
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((n) => !n.startsWith("."))
        .map((n) => path.basename(n, ".md"))
    : [];
}

async function capturedLog(
  fn: () => Promise<number>,
): Promise<{ code: number; out: string }> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    return { code: await fn(), out: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

function alphaRun(goalDir: string, taskDir: string): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: "steers go to the architect",
        steerRoutes: inboxIds(goalDir).map((id) => ({
          steer: id,
          route: "architect",
        })),
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    const ids = inboxIds(goalDir);
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
    ctx.writeOutcome(
      outcome({
        summary: "planned alpha",
        decision: "continue",
        forward: ids.map((id) => `steer ${id}: acknowledged, keep alpha first`),
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed alpha" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha added" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  scriptKernelRoleFallbacks(harness);
  return harness;
}

function doneHarness(): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  scriptKernelRoleFallbacks(harness);
  return harness;
}

describe("CLI end to end — init, steer, run, status", () => {
  cLIEndEndInitSteerRunStatusPart1();
  cLIEndEndInitSteerRunStatusPart2();
});

async function initializesSteersRunsReportsClosesPart1(
  repo: TmpRepo,
  intentSource: string,
  base: string,
) {
  expect(
    await dispatch([
      "init",
      "--repo",
      repo.dir,
      "--goal",
      "demo",
      "--intent",
      intentSource,
    ]),
  ).toBe(0);
  const repoConfig = yaml.parse(repo.readFile(".factory/repo.yaml"));
  expect(repoConfig.baseBranch).toBe("main");
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  expect(fs.readFileSync(path.join(goalDir, "intent.md"), "utf8")).toContain(
    "Create alpha.txt",
  );
  expect(fs.existsSync(path.join(goalDir, "tasks"))).toBe(true);
  expect(fs.existsSync(path.join(goalDir, "records"))).toBe(true);
  // This goal is a bigger one: the class file stands in for the front
  // consult, so the launch still reaches the architect boundary.
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");

  expect(
    await dispatch([
      "init",
      "--repo",
      repo.dir,
      "--goal",
      "demo",
      "--intent",
      intentSource,
    ]),
  ).toBe(0);
  const otherIntent = path.join(path.dirname(repo.dir), `${base}-other.md`);
  fs.writeFileSync(otherIntent, "# Other goal\n", "utf8");
  const originalError = console.error;
  const errors: string[] = [];
  console.error = (...args: unknown[]) =>
    errors.push(args.map(String).join(" "));

  return { goalDir, otherIntent, originalError, errors };
}

async function initializesSteersRunsReportsClosesPart2(
  repo: TmpRepo,
  steerSource: string,
  scope: Awaited<ReturnType<typeof initializesSteersRunsReportsClosesPart1>>,
) {
  const { otherIntent, originalError, errors, goalDir } = scope;
  try {
    expect(
      await dispatch([
        "init",
        "--repo",
        repo.dir,
        "--goal",
        "demo",
        "--intent",
        otherIntent,
      ]),
    ).toBe(1);
  } finally {
    console.error = originalError;
  }
  expect(errors.join("\n")).toContain("intent already exists");
  expect(fs.readFileSync(path.join(goalDir, "intent.md"), "utf8")).toContain(
    "Create alpha.txt",
  );

  repo.writeFile(".factory/run.yaml", runYaml(repo));
  // The operator declares the repo's gates; init only writes the empty shape.
  const repoConfigPath = path.join(repo.dir, ".factory/repo.yaml");
  const repoConfig = yaml.parse(fs.readFileSync(repoConfigPath, "utf8"));
  repoConfig.gates = [{ id: "alpha", command: "true", serial: [] }];
  fs.writeFileSync(repoConfigPath, yaml.stringify(repoConfig));
  expect(
    await dispatch([
      "steer",
      "--repo",
      repo.dir,
      "--goal",
      "demo",
      steerSource,
    ]),
  ).toBe(0);
  expect(inboxIds(goalDir)).toHaveLength(1);
  const steerId = inboxIds(goalDir)[0]!;

  const taskDir = path.join(goalDir, "tasks");
  const run = await capturedLog(async () =>
    dispatch(["run", "--repo", repo.dir, "--goal", "demo"], {
      harnesses: { fake: alphaRun(goalDir, taskDir) },
      priceSource: testPriceSource(repo.dir),
    }),
  );
  expect(run.code).toBe(3);
  expect(run.out).toContain("stop=iteration-limit");

  return { ...scope, steerId };
}

async function initializesSteersRunsReportsClosesPart3(
  repo: TmpRepo,
  scope: Awaited<ReturnType<typeof initializesSteersRunsReportsClosesPart2>>,
) {
  const { goalDir, steerId } = scope;
  expect(fs.readdirSync(path.join(goalDir, "mailbox/processed"))).toContain(
    `${steerId}.md`,
  );
  const answer = fs.readFileSync(
    path.join(goalDir, "mailbox/outbox", `steer-${steerId}.md`),
    "utf8",
  );
  expect(answer).toContain("acknowledged");

  const metrics = yaml.parse(
    fs.readFileSync(path.join(goalDir, "metrics.yaml"), "utf8"),
  );
  expect(metrics.iterations[0].humanInterventions).toBe(1);
  expect(metrics.iterations[0].merged).toEqual(["alpha"]);

  const status = await capturedLog(async () =>
    dispatch(["status", "--repo", repo.dir, "--goal", "demo"]),
  );
  expect(status.code).toBe(0);
  expect(status.out).toContain("goal demo: active (iteration 1)");
  expect(status.out).toContain("alpha: merged");
  expect(status.out).toContain("iterations/1/summary.md");

  // The kernel's status.json is the data behind the text view: the same
  // merged task, the iteration's cost and work, and --json prints it.
  const statusJson = await capturedLog(async () =>
    dispatch(["status", "--repo", repo.dir, "--goal", "demo", "--json"], {
      priceSource: testPriceSource(repo.dir),
    }),
  );
  expect(statusJson.code).toBe(0);
  const snapshot = JSON.parse(statusJson.out);
  expect(snapshot.goal).toBe("demo");
  expect(snapshot.status).toBe("active");
  expect(snapshot.iteration).toBe(1);
  expect(snapshot.tasks.merged.map((t: { slug: string }) => t.slug)).toEqual([
    "alpha",
  ]);
  expect(snapshot.cost.byRole.implementer.turns).toBe(1);
  expect(snapshot.work.byModel["fake-impl"].edits).toBeGreaterThanOrEqual(1);
  expect(
    fs.readFileSync(path.join(goalDir, "status.json"), "utf8").trim(),
  ).toBe(statusJson.out.trim());
}

async function initializesSteersRunsReportsClosesPart4(
  repo: TmpRepo,
  scope: Awaited<ReturnType<typeof initializesSteersRunsReportsClosesPart2>>,
) {
  const { goalDir } = scope;
  const close = await capturedLog(async () =>
    dispatch(["run", "--repo", repo.dir, "--goal", "demo"], {
      harnesses: { fake: doneHarness() },
      priceSource: testPriceSource(repo.dir),
    }),
  );
  expect(close.code).toBe(0);
  const finalStatus = await capturedLog(async () =>
    dispatch(["status", "--repo", repo.dir, "--goal", "demo"]),
  );
  expect(finalStatus.out).toContain("goal demo: done (iteration 2)");
  expect(finalStatus.out).toContain("iterations/2/summary.md");

  const store = createFolderStore(goalDir, undefined, {});
  expect(
    (await store.listRecords()).filter(
      (r) => r.step === "merge" && r.ok === true,
    ),
  ).toHaveLength(1);
}

function cLIEndEndInitSteerRunStatusPart1() {
  it("initializes, steers, runs, reports and closes a goal with the fake harness", async () => {
    const repo = createTmpRepo();
    const base = path.basename(repo.dir);
    const intentSource = path.join(path.dirname(repo.dir), `${base}-intent.md`);
    const steerSource = path.join(path.dirname(repo.dir), `${base}-steer.md`);
    fs.writeFileSync(intentSource, "# Goal\n\nCreate alpha.txt.\n", "utf8");
    fs.writeFileSync(
      steerSource,
      "Please land alpha before anything else.\n",
      "utf8",
    );
    try {
      const scope1 = await initializesSteersRunsReportsClosesPart1(
        repo,
        intentSource,
        base,
      );
      const scope2 = await initializesSteersRunsReportsClosesPart2(
        repo,
        steerSource,
        scope1,
      );
      await initializesSteersRunsReportsClosesPart3(repo, scope2);
      await initializesSteersRunsReportsClosesPart4(repo, scope2);
    } finally {
      repo.cleanup();
    }
  }, 60_000);
}

function cLIEndEndInitSteerRunStatusPart2() {
  it("steer reads the body from stdin", async () => {
    const repo = createTmpRepo();
    try {
      expect(
        await dispatch(["init", "--repo", repo.dir, "--goal", "demo"]),
      ).toBe(0);
      repo.writeFile(".factory/run.yaml", runYaml(repo));
      const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
      const proc = Bun.spawn(
        [
          "bun",
          path.join(PACKAGE_ROOT, "bin/factory.ts"),
          "steer",
          "--repo",
          repo.dir,
          "--goal",
          "demo",
          "-",
        ],
        { cwd: PACKAGE_ROOT, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
      );
      proc.stdin.write("Use Rust for the parser.\n");
      proc.stdin.end();
      expect(await proc.exited).toBe(0);
      const files = fs
        .readdirSync(path.join(goalDir, "mailbox/inbox"))
        .filter((n) => !n.startsWith("."));
      expect(files).toHaveLength(1);
      expect(
        fs.readFileSync(path.join(goalDir, "mailbox/inbox", files[0]!), "utf8"),
      ).toBe("Use Rust for the parser.\n");
    } finally {
      repo.cleanup();
    }
  }, 30_000);
}

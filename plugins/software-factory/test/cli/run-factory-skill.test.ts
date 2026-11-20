// biome-ignore-all lint/complexity: walkthrough reads as one operator transcript
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { CliDeps } from "../../src/cli/dispatch.js";
import { testPriceSource } from "../helpers/price-source.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { scriptKernelRoleFallbacks } from "../kernel/fake-defaults.js";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "../..");
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills/run-factory");

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
    "  plan-reviewer: { harness: fake, model: fake-plan-review }",
    "  pack-preparer: { harness: fake, model: fake-pack-prep }",
    "limits: { iterations: 1, concurrency: { overall: 1 } }",
    `worktreeRoot: ../${base}-wt`,
    `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
    "",
  ].join("\n");
}

function inboxIds(goalDir: string): string[] {
  const dir = path.join(goalDir, "mailbox", "inbox");
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((name) => !name.startsWith("."))
        .map((name) => path.basename(name, ".md"))
    : [];
}

function alphaRun(goalDir: string, taskDir: string): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  // A fresh goal starts at the front turn: classify bigger and hand the
  // architect a pack, exactly as the packaged process config expects.
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(goalDir, "class.yaml"),
      "class: bigger\n",
      "utf8",
    );
    const packPath = path.join(goalDir, "iterations/1/context-pack.md");
    fs.mkdirSync(path.dirname(packPath), { recursive: true });
    fs.writeFileSync(packPath, "# FRONT PACK\n\n- alpha only\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "classified bigger" }));
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

interface Captured {
  code: number;
  out: string;
}

/** Capture both streams: dispatch reports argument errors on stderr. */
async function captured(fn: () => Promise<number>): Promise<Captured> {
  const log = console.log;
  const error = console.error;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) =>
    lines.push(args.map(String).join(" "));
  try {
    return { code: await fn(), out: lines.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** The walkthrough fence, as shell lines. */
function walkthroughLines(): string[] {
  const skill = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const block = skill.match(/```bash run-factory-walkthrough\n([\s\S]*?)\n```/);
  if (!block) throw new Error("SKILL.md has no run-factory-walkthrough block");
  return block[1]!
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** One shell line to argv; double quotes keep a path together. */
function argvFor(line: string, repo: string): string[] {
  const tokens = line.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
  return tokens
    .map((token) => (token.startsWith('"') ? token.slice(1, -1) : token))
    .map((token) => token.replaceAll("$REPO", repo));
}

function cliArgs(argv: string[]): string[] {
  if (argv[0] !== "bun" || argv[1] !== "bin/factory.ts") {
    throw new Error(
      `walkthrough line is not a factory CLI call: ${argv.join(" ")}`,
    );
  }
  return argv.slice(2);
}

describe("run-factory skill", () => {
  it("ships kernel and config resources and a linked sandbox page", () => {
    expect(fs.existsSync(path.join(SKILL_DIR, "kernel.md"))).toBe(true);
    expect(fs.existsSync(path.join(SKILL_DIR, "config.md"))).toBe(true);
    expect(fs.existsSync(path.join(PACKAGE_ROOT, "docs", "sandbox.md"))).toBe(
      true,
    );

    // A skill is only usable when its bundled links resolve from its directory.
    const skill = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
    const links = [...skill.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map(
      (match) => match[1]!,
    );
    for (const link of links) {
      expect(fs.existsSync(path.resolve(SKILL_DIR, link))).toBe(true);
    }
    expect(links).toContain("kernel.md");
    expect(links).toContain("config.md");
  });

  it("runs the skill walkthrough from a fresh checkout on the fake harness", async () => {
    const repo = createTmpRepo();
    const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
    const taskDir = path.join(goalDir, "tasks");
    fs.writeFileSync(
      path.join(repo.dir, "INTENT.md"),
      "# Goal\n\nCreate alpha.txt.\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(repo.dir, "notes.md"),
      "Please land alpha before anything else.\n",
      "utf8",
    );
    repo.writeFile(".factory/run.yaml", runYaml(repo));
    const deps = (): CliDeps => ({
      harnesses: { fake: alphaRun(goalDir, taskDir) },
      priceSource: testPriceSource(repo.dir),
    });
    const runs: Array<{ args: string[]; result: Captured }> = [];
    try {
      for (const line of walkthroughLines()) {
        const args = cliArgs(argvFor(line, repo.dir));
        const result = await captured(() => dispatch(args, deps()));
        runs.push({ args, result });
      }

      const init = runs.find((run) => run.args[0] === "init")!;
      expect(init.result.code).toBe(0);
      expect(
        fs.readFileSync(path.join(goalDir, "intent.md"), "utf8"),
      ).toContain("Create alpha.txt");
      for (const dir of ["tasks", "records", "mailbox/inbox", "iterations"]) {
        expect(fs.existsSync(path.join(goalDir, dir))).toBe(true);
      }

      const steer = runs.find((run) => run.args[0] === "steer")!;
      expect(steer.result.code).toBe(0);
      const steerId = fs
        .readdirSync(path.join(goalDir, "mailbox/processed"))
        .find((name) => name.endsWith(".md"))!
        .replace(/\.md$/, "");
      expect(
        fs.readFileSync(
          path.join(goalDir, "mailbox/outbox", `steer-${steerId}.md`),
          "utf8",
        ),
      ).toContain("acknowledged");

      const run = runs.find((entry) => entry.args[0] === "run")!;
      expect(run.result.code).toBe(3);
      expect(run.result.out).toContain("stop=iteration-limit");
      expect(fs.existsSync(path.join(goalDir, "plan.md"))).toBe(true);
      expect(fs.existsSync(path.join(taskDir, "alpha.md"))).toBe(true);
      expect(fs.existsSync(path.join(goalDir, "iterations/1/summary.md"))).toBe(
        true,
      );
      expect(
        fs.readdirSync(path.join(goalDir, "mailbox/processed")).length,
      ).toBe(1);

      const status = runs.find(
        (entry) => entry.args[0] === "status" && !entry.args.includes("--json"),
      )!;
      expect(status.result.code).toBe(0);
      expect(status.result.out).toContain("goal demo: active (iteration 1)");
      expect(status.result.out).toContain("alpha: merged");
      expect(status.result.out).toContain("iterations/1/summary.md");

      const statusJson = runs.find(
        (entry) => entry.args[0] === "status" && entry.args.includes("--json"),
      )!;
      expect(statusJson.result.code).toBe(0);
      const snapshot = JSON.parse(statusJson.result.out);
      expect(snapshot.goal).toBe("demo");
      expect(snapshot.status).toBe("active");
      expect(
        snapshot.tasks.merged.map((task: { slug: string }) => task.slug),
      ).toEqual(["alpha"]);
      expect(
        fs.readFileSync(path.join(goalDir, "status.json"), "utf8").trim(),
      ).toBe(statusJson.result.out.trim());
      const dashboard = fs.readFileSync(
        path.join(goalDir, "dashboard.html"),
        "utf8",
      );
      expect(dashboard).toContain("demo");
      expect(dashboard).toContain("alpha");
      expect(dashboard).toContain('href="status.json"');

      const benchmark = runs.find((entry) => entry.args[0] === "benchmark")!;
      expect(benchmark.result.code).toBe(0);
      expect(benchmark.result.out).toContain("goal demo: 1 iteration(s)");
      expect(benchmark.result.out).toContain("| merged/parked | 1 / 0 |");

      // The skill says a bounded launch ending in 3 is continued by the same
      // command; the second launch closes the goal.
      const close = await captured(() =>
        dispatch(run.args, {
          harnesses: { fake: doneHarness() },
          priceSource: testPriceSource(repo.dir),
        }),
      );
      expect(close.code).toBe(0);
      const finalStatus = await captured(() =>
        dispatch(["status", "--repo", repo.dir, "--goal", "demo"]),
      );
      expect(finalStatus.code).toBe(0);
      expect(finalStatus.out).toContain("goal demo: done (iteration 2)");

      const closed = JSON.parse(
        fs.readFileSync(path.join(goalDir, "status.json"), "utf8"),
      );
      expect(closed.status).toBe("done");
      expect(closed.iterations).toBe(2);
      expect(
        fs.readFileSync(path.join(goalDir, "dashboard.html"), "utf8"),
      ).toContain("badge goal-done");
    } finally {
      repo.cleanup();
    }
  }, 60_000);
});

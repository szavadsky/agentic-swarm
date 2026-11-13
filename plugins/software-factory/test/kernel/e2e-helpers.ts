import fs from "node:fs";
import path from "node:path";
import { expect } from "bun:test";
import { dispatch } from "../../src/cli/index.js";
import { FakeHarness, fakeTurnResult, type FakeTurnHandler } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { derive } from "../../src/kernel/derive.js";
import type { State } from "../../src/kernel/types.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

export interface E2EGoal {
  repo: TmpRepo;
  goalDir: string;
  planPath: string;
  tasksDir: string;
}

export interface GoalOptions {
  runYaml?: string;
  repoYaml?: string;
  /** `null` leaves the goal without a class so the front turn runs; default is a bigger-class goal. */
  classYaml?: string | null;
}

const DEFAULT_RUN_YAML = [
  "aliases:",
  "  architect: { harness: fake, model: fake-architect }",
  "  pm: { harness: fake, model: fake-pm }",
  "  implementer: { harness: fake, model: fake-impl }",
  "  reviewer: { harness: fake, model: fake-review }",
  "  digest: { harness: fake, model: fake-digest }",
  "limits: { iterations: 1, concurrency: 1 }",
  "",
].join("\n");

const DEFAULT_REPO_YAML = [
  "baseBranch: main",
  "artifactRoot: .factory/artifacts",
  "setup: []",
  "gates: []",
  "",
].join("\n");

export function outcome(patch: Record<string, unknown> = {}) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...patch };
}

export function makeGoal(opts: GoalOptions = {}): E2EGoal {
  const repo = createTmpRepo();
  repo.writeFile(".factory/repo.yaml", opts.repoYaml ?? DEFAULT_REPO_YAML);
  repo.writeFile(".factory/run.yaml", opts.runYaml ?? DEFAULT_RUN_YAML);
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(path.join(goalDir, "intent.md"), "# Goal\n\nBuild the demo.\n", "utf8");
  if (opts.classYaml !== null) {
    fs.writeFileSync(path.join(goalDir, "class.yaml"), opts.classYaml ?? "class: bigger\n", "utf8");
  }
  return { repo, goalDir, planPath: path.join(goalDir, "plan.md"), tasksDir: path.join(goalDir, "tasks") };
}

export async function launch(
  repo: TmpRepo,
  harness: FakeHarness,
  iterations = 1
): Promise<number> {
  return dispatch(["run", "--repo", repo.dir, "--goal", "demo", "--iterations", String(iterations)], {
    harnesses: { fake: harness },
  });
}

export function cleanup(goal: E2EGoal): void {
  const worktreeRoot = path.resolve(goal.repo.dir, "..", ".factory-worktrees", path.basename(goal.repo.dir));
  goal.repo.cleanup();
  fs.rmSync(worktreeRoot, { recursive: true, force: true });
}

export async function stateOf(goalDir: string): Promise<State> {
  const store = createFolderStore(goalDir);
  return derive(await store.listTasks(), await store.listRecords());
}

export function writePlan(goalDir: string, text: string): void {
  fs.writeFileSync(path.join(goalDir, "plan.md"), text, "utf8");
}

export function writeTask(goalDir: string, text: string): void {
  const slug = /^slug:\s*(\S+)/m.exec(text)?.[1];
  if (!slug) throw new Error("task text has no slug");
  fs.mkdirSync(path.join(goalDir, "tasks"), { recursive: true });
  fs.writeFileSync(path.join(goalDir, "tasks", `${slug}.md`), text, "utf8");
}

/** Scripts the optional digest scout: it annotates the table the script already wrote. */
export function scriptDigest(harness: FakeHarness, goalDir: string, iteration: number): void {
  harness.script((req, ctx) => {
    const digest = path.join(goalDir, `iterations/${iteration}/digest.md`);
    expect(fs.existsSync(digest)).toBe(true);
    fs.appendFileSync(digest, "\n## Loops\n- none\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "digest scout done" }));
    return fakeTurnResult(req);
  });
}

/** Standard task text with one observable file. */
export function simpleTask(
  slug: string,
  file: string,
  opts: { deps?: string[]; title?: string; body?: string; flow?: string; kind?: string } = {}
): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: ${opts.title ?? `Create ${file}`}`,
    `kind: ${opts.kind ?? "task"}`,
    `flow: ${opts.flow ?? "implement-review"}`,
    `deps: [${(opts.deps ?? []).join(", ")}]`,
    `scope: [${file}]`,
    "source: plan",
    "---",
    "",
    opts.body ?? `Create ${file}.`,
    "",
    `Done when: ${file} exists.`,
    "",
  ].join("\n");
}

export function implementerTurn(file: string, extra?: (cwd: string) => void): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    extra?.(req.cwd!);
    ctx.writeOutcome(outcome({ summary: `${file} created` }));
    return fakeTurnResult(req);
  };
}
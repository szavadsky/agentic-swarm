import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import {
  FakeHarness,
  fakeTurnIdentity,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import type { PriceSource } from "../../src/kernel/openrouter.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { State } from "../../src/kernel/types.js";
import { testPriceSource } from "../helpers/price-source.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { scriptKernelRoleFallbacks } from "./fake-defaults.js";

export interface E2EGoal {
  repo: TmpRepo;
  goalDir: string;
  planPath: string;
  tasksDir: string;
}

export interface GoalOptions {
  runYaml?: string;
  repoYaml?: string;
  /** Process-layer override; the package defaults fill every other key. */
  processYaml?: string;
  /** `null` leaves the goal without a class so the front turn runs; default is a bigger-class goal. */
  classYaml?: string | null;
}

export const DEFAULT_RUN_YAML = [
  "aliases:",
  "  architect: { harness: fake, model: fake-architect }",
  "  pm: { harness: fake, model: fake-pm }",
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
  "  digest: { harness: fake, model: fake-digest }",
  "limits: { iterations: 1, concurrency: { overall: 1 } }",
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
  if (opts.processYaml !== undefined)
    repo.writeFile(".factory/process.yaml", opts.processYaml);
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nBuild the demo.\n",
    "utf8",
  );
  if (opts.classYaml !== null) {
    fs.writeFileSync(
      path.join(goalDir, "class.yaml"),
      opts.classYaml ?? "class: bigger\n",
      "utf8",
    );
  }
  return {
    repo,
    goalDir,
    planPath: path.join(goalDir, "plan.md"),
    tasksDir: path.join(goalDir, "tasks"),
  };
}

export async function launch(
  repo: TmpRepo,
  harness: FakeHarness,
  iterations = 1,
): Promise<number> {
  scriptKernelRoleFallbacks(harness);
  return dispatch(launchArgs(repo, iterations), {
    harnesses: { fake: harness },
    priceSource: testPriceSource(repo.dir),
  });
}

function launchArgs(repo: TmpRepo, iterations: number): string[] {
  return [
    "run",
    "--repo",
    repo.dir,
    "--goal",
    "demo",
    "--iterations",
    String(iterations),
  ];
}

/**
 * Hermetic prices for CLI-driven tests: the repo's own (usually missing)
 * cache, never the network. An explicit `priceSource` in `deps` wins.
 */
function hermeticPriceSource(argv: string[]): PriceSource {
  let repo = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo" && argv[i + 1]) {
      repo = argv[i + 1]!;
      i += 1;
    } else if (arg?.startsWith("--repo=")) {
      repo = arg.slice("--repo=".length);
    }
  }
  return testPriceSource(repo);
}
export async function expectDispatch(
  expected: number,
  argv: string[],
  deps: Parameters<typeof dispatch>[1],
): Promise<void> {
  for (const harness of Object.values(deps?.harnesses ?? {})) {
    if (harness instanceof FakeHarness) scriptKernelRoleFallbacks(harness);
  }
  const lines: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
    realLog(...args);
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
    realError(...args);
  };
  let code: number;
  try {
    code = await dispatch(argv, {
      priceSource: hermeticPriceSource(argv),
      ...deps,
    });
  } finally {
    console.log = realLog;
    console.error = realError;
  }
  if (code !== expected) {
    throw new Error(
      `launch exit code ${code}, expected ${expected}; launch output:\n${lines.join("\n") || "(none)"}`,
    );
  }
}

export async function expectLaunch(
  expected: number,
  repo: TmpRepo,
  harness: FakeHarness,
  iterations = 1,
): Promise<void> {
  await expectDispatch(expected, launchArgs(repo, iterations), {
    harnesses: { fake: harness },
  });
}

export function cleanup(goal: E2EGoal): void {
  const worktreeRoot = path.resolve(
    goal.repo.dir,
    "..",
    ".factory-worktrees",
    path.basename(goal.repo.dir),
  );
  goal.repo.cleanup();
  fs.rmSync(worktreeRoot, { recursive: true, force: true });
}

export async function stateOf(goalDir: string): Promise<State> {
  const store = createFolderStore(goalDir, undefined, {});
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

/** The boundary's steer turn: route each pending steer to the architect. */
export function scriptSteerRoutes(
  harness: FakeHarness,
  steers: readonly string[],
): void {
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: "steers go to the architect",
        steerRoutes: steers.map((steer) => ({ steer, route: "architect" })),
      }),
    );
    return fakeTurnResult(req);
  });
}

/** Scripts the optional digest scout: it annotates the table the script already wrote. */
export function scriptDigest(
  harness: FakeHarness,
  goalDir: string,
  iteration: number,
): void {
  harness.script(
    (req, ctx) => {
      const digest = path.join(goalDir, `iterations/${iteration}/digest.md`);
      expect(fs.existsSync(digest)).toBe(true);
      fs.appendFileSync(digest, "\n## Loops\n- none\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "digest scout done" }));
      return fakeTurnResult(req);
    },
    { when: (req) => fakeTurnIdentity(req).step === "digest" },
  );
}

/** Standard task text with one observable file. */
export function simpleTask(
  slug: string,
  file: string,
  opts: {
    deps?: string[];
    title?: string;
    body?: string;
    flow?: string;
    kind?: string;
  } = {},
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

export function implementerTurn(
  file: string,
  extra?: (cwd: string) => void,
): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    extra?.(req.cwd!);
    ctx.writeOutcome(outcome({ summary: `${file} created` }));
    return fakeTurnResult(req);
  };
}

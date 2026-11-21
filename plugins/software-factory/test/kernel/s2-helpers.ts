import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { Repo } from "../../src/core/git/repo.js";
import {
  type FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { TurnRequest } from "../../src/harness/types.js";
import {
  loadConfigs,
  resolveGoalPaths,
  toLimits,
} from "../../src/kernel/config.js";
import { writePriceCache } from "../../src/kernel/openrouter.js";
import type { PriceTable } from "../../src/kernel/pricing.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createArtifactStore } from "../../src/kernel/store-backend.js";
import type {
  KernelRuntime,
  Outcome,
  TaskFile,
} from "../../src/kernel/types.js";
import { prepareIntegrationCheckout } from "../../src/kernel/worktree.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { scriptKernelRoleFallbacks } from "./fake-defaults.js";

export interface FlowRepoOptions {
  gates?: {
    id: string;
    command: string;
    serial?: string[];
    env?: Record<string, string>;
    format?: { junit?: string; pattern?: "pytest" | "jest" | "cargo" };
    timeoutSec?: number;
  }[];
  setup?: string[];
  /** Raw `.factory/process.yaml` override. */
  process?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  /** Seed for the repo-local price cache, for harnesses that report no cost. */
  priceTable?: PriceTable;
  aliases?: Record<
    string,
    {
      harness: string;
      model: string;
      effort?: string;
      subscription?: string;
      escalateTo?: string;
      rotate?: {
        harness: string;
        model: string;
        effort?: string;
      }[];
      fallbacks?: (
        | { alias: string }
        | {
            harness?: string;
            model: string;
            effort?: string;
            subscription?: string;
          }
      )[];
      timeouts?: { idleMs: number; wallMs: number };
    }
  >;
  goal?: string;
  /** `.factory/repo.yaml` identity for commits the engine authors. */
  identity?: { name: string; email: string };
}

export interface FlowRepo {
  repo: TmpRepo;
  goalDir: string;
  goal: string;
}

/** Repo-local price cache; `setupFlowRepo` seeds it when given a table. */
export function priceCachePath(repoDir: string): string {
  return path.join(repoDir, ".factory", "price-cache.json");
}

export function outcome(patch: Record<string, unknown> = {}): Outcome {
  return {
    status: "done",
    summary: "ok",
    concerns: [],
    forward: [],
    ...patch,
  } as Outcome;
}

/**
 * Binds a scripted fake turn to the request it serves. The slug and step are
 * derived from the request's record path on every call; omitted fields match
 * anything. Concurrent tests bind every turn this way so call order under
 * load cannot hand a turn the wrong handler.
 */
export function whenTurn(want: {
  slug?: string;
  step?: string;
}): (req: TurnRequest) => boolean {
  return (req) => {
    const identity = fakeTurnIdentity(req);
    if (want.slug !== undefined && identity.slug !== want.slug) return false;
    if (want.step !== undefined && identity.step !== want.step) return false;
    return true;
  };
}

/** The full boundary and flow vocabulary every direct-runtime fixture wires. */
const DEFAULT_ALIASES: NonNullable<FlowRepoOptions["aliases"]> = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  digest: { harness: "fake", model: "fake-digest" },
  implementer: { harness: "fake", model: "fake-impl" },
  "implementer-b": { harness: "fake", model: "fake-impl-b" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  qa: { harness: "fake", model: "fake-qa" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

export function setupFlowRepo(opts: FlowRepoOptions = {}): FlowRepo {
  const goal = opts.goal ?? "demo";
  const repo = createTmpRepo();
  const gates = opts.gates ?? [{ id: "readme", command: "test -f README.md" }];
  repo.writeFile(
    ".factory/repo.yaml",
    yaml.stringify({
      baseBranch: "main",
      artifactRoot: ".factory/artifacts",
      setup: opts.setup ?? [],
      gates: gates.map((g) => ({
        id: g.id,
        command: g.command,
        ...(g.serial ? { serial: g.serial } : {}),
        ...(g.env ? { env: g.env } : {}),
        ...(g.format ? { format: g.format } : {}),
        ...(g.timeoutSec !== undefined ? { timeoutSec: g.timeoutSec } : {}),
      })),
      ...(opts.identity ? { identity: opts.identity } : {}),
    }),
  );
  // The package default flow includes QA; a test that narrows its aliases
  // keeps the neutral QA binding rather than failing pre-flight for it.
  const aliases = opts.aliases
    ? {
        qa: opts.aliases.qa ?? opts.aliases.reviewer ?? DEFAULT_ALIASES.qa!,
        ...opts.aliases,
      }
    : DEFAULT_ALIASES;
  repo.writeFile(
    ".factory/run.yaml",
    yaml.stringify({
      aliases,
      limits: {
        iterations: 1,
        concurrency: { overall: 1 },
        ...(opts.limits ?? {}),
      },
    }),
  );
  if (opts.priceTable) {
    writePriceCache(priceCachePath(repo.dir), opts.priceTable);
  }
  if (opts.process) {
    repo.writeFile(".factory/process.yaml", yaml.stringify(opts.process));
  }
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts", goal);
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nTest goal.\n",
    "utf8",
  );
  return { repo, goalDir, goal };
}

export async function makeRuntime(
  repo: TmpRepo,
  goal: string,
  harnesses: Record<string, FakeHarness>,
): Promise<KernelRuntime> {
  for (const harness of Object.values(harnesses))
    scriptKernelRoleFallbacks(harness);
  const configs = loadConfigs(repo.dir);
  // A test repo written before QA may name only its reviewer; the package
  // default flow still needs the alias, so mirror the reviewer's binding.
  if (!configs.run.aliases.qa && configs.run.aliases.reviewer) {
    configs.run.aliases.qa = configs.run.aliases.reviewer;
  }
  const paths = resolveGoalPaths(configs, repo.dir, goal);
  const store = createArtifactStore(paths, {});
  await store.ensureLayout();
  const runtime: KernelRuntime = {
    paths,
    configs,
    repo: new Repo({
      mainRoot: repo.dir,
      worktreeRoot: paths.worktreeRoot,
      identity: configs.repo.identity,
    }),
    store,
    harnesses: new Map(Object.entries(harnesses)),
    prompts: loadPrompts(configs.process, repo.dir, {
      aliases: configs.run.aliases,
      run: configs.run,
    }),
    limits: toLimits(configs),
    exhaustedPools: new Map(),
    // Hermetic prices: the repo-local cache, never the network.
    priceSource: {
      cachePath: priceCachePath(repo.dir),
      fetchModels: async () => {
        throw new Error("price fetch disabled in tests");
      },
    },
  };
  await prepareIntegrationCheckout(runtime);
  return runtime;
}

export async function writeTask(
  runtime: KernelRuntime,
  task: TaskFile,
): Promise<void> {
  await runtime.store.writeTask(task);
}

export function goalCheckout(repo: TmpRepo, goal: string): string {
  return resolveGoalPaths(loadConfigs(repo.dir), repo.dir, goal).goalCheckout;
}

export function cleanupFlowRepo(repo: TmpRepo): void {
  const worktreeRoot = path.resolve(
    repo.dir,
    "..",
    ".factory-worktrees",
    path.basename(repo.dir),
  );
  try {
    repo.cleanup();
  } finally {
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
  }
}

/**
 * A two-party rendezvous for concurrency assertions. Each of the two
 * concurrent turns awaits the returned gate after recording itself active;
 * the first arrival blocks until the peer arrives (or the timeout fires), so
 * the overlap the max-concurrency assertion measures no longer depends on
 * scheduling luck under load. Late arrivals pass straight through.
 */
export function twoPartyBarrier(timeoutMs = 10_000): () => Promise<void> {
  const shared = { arrived: 0 };
  return async () => {
    shared.arrived += 1;
    const start = Date.now();
    while (shared.arrived < 2) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `two-party barrier timed out with ${shared.arrived}/2 turns arrived`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
}

/** A handler that writes one file per task and approves its review. */
export function filePerTaskHandler(
  counter: { active: number; max: number },
  delayMs = 20,
  barrier?: () => Promise<void>,
) {
  return async (
    req: Parameters<FakeHarness["turn"]>[0],
    ctx: { writeOutcome(value: unknown): void },
  ) => {
    counter.active += 1;
    counter.max = Math.max(counter.max, counter.active);
    try {
      if (barrier) await barrier();
      else await new Promise((resolve) => setTimeout(resolve, delayMs));
      const slug = path.basename(req.cwd!);
      if (req.prompt.startsWith("You review")) {
        ctx.writeOutcome(
          outcome({ summary: `${slug} review`, verdict: "approve" }),
        );
      } else {
        fs.writeFileSync(
          path.join(req.cwd!, `${slug}.txt`),
          `${slug}\n`,
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      }
      return fakeTurnResult(req);
    } finally {
      counter.active -= 1;
    }
  };
}

/**
 * Scripts one stall-PM turn that leaves every listed slug parked. For
 * dispatches that stall on purpose: the turn answers, the reasons land in
 * the stall-routes record, and dispatch ends at the boundary as today.
 */
export function scriptStallLeave(
  harness: FakeHarness,
  slugs: string[],
  reason = "left for the architect",
): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: `stall leaves ${slugs.join(", ")} parked`,
          stallRoutes: slugs.map((slug) => ({ slug, action: "leave", reason })),
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

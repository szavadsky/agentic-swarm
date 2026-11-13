import fs from "node:fs";
import path from "node:path";
import { git } from "../core/git/exec.js";
import { compactArchitect, resumableSession } from "./architect-session.js";
import { runAgentTurn } from "./agent.js";
import { recordedBaseGates } from "./baseline.js";
import { contextPackRelPath, forwardedConcerns, renderContextPack, shallowCodeMap } from "./context-pack.js";
import { derive } from "./derive.js";
import { writeLaunchDigest } from "./digest.js";
import { resolveRole } from "./flow-context.js";
import { integrationHead } from "./worktree.js";
import {
  formatSteers,
  markProcessed,
  scanInbox,
  steerResponses,
  writeOutbox,
} from "./mailbox.js";
import { runPm, type PmRung } from "./pm.js";
import type { GoalDecision, KernelRuntime, Outcome } from "./types.js";

export interface BoundaryResult {
  iteration: number;
  decision: GoalDecision;
  cause?: string;
  outcome?: Outcome;
  packPath?: string;
}

function previousSummary(goalDir: string, iteration: number): string | undefined {
  if (iteration <= 0) return undefined;
  const rel = `iterations/${iteration}/summary.md`;
  return fs.existsSync(path.join(goalDir, rel)) ? path.join(goalDir, rel) : undefined;
}

function rungTrace(rungs: PmRung[]): string {
  return rungs
    .map((rung) => `rung ${rung.round} ${rung.alias} (${rung.model}): ${rung.failure}`)
    .join("; ");
}

async function taskSnapshot(goalDir: string): Promise<Map<string, string>> {
  const dir = path.join(goalDir, "tasks");
  const out = new Map<string, string>();
  if (!fs.existsSync(dir)) return out;
  for (const name of (await fs.promises.readdir(dir)).sort()) {
    if (name.endsWith(".md")) out.set(name, await fs.promises.readFile(path.join(dir, name), "utf8"));
  }
  return out;
}

function snapshotDiff(before: Map<string, string>, after: Map<string, string>): string | null {
  const names = new Set([...before.keys(), ...after.keys()]);
  for (const name of [...names].sort()) {
    if (before.get(name) !== after.get(name)) return name;
  }
  return null;
}

async function codeMap(checkout: string): Promise<string[]> {
  try {
    const listed = await git(checkout, ["ls-files"], { allowFail: true });
    if (listed.code !== 0) return [];
    return shallowCodeMap(listed.stdout.split("\n").filter(Boolean));
  } catch {
    return [];
  }
}

/**
 * One architect consult: digest on a relaunch, inbox, deterministic pack,
 * architect turn (plan edited in place), steer answers, then the PM turn and
 * its validation. Called at every iteration start, never mid-iteration.
 */
export async function runBoundary(
  runtime: KernelRuntime,
  opts: { relaunch: boolean }
): Promise<BoundaryResult> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const state = derive(tasks, records, runtime.configs.process.flows);
  const iteration = state.iteration + 1;
  // Script records (baseline, checks) may exist before the first architect turn;
  // "first" means no architect turn has run yet, not an empty record store.
  const firstTurn = !records.some((r) => r.step === "architect");
  const turn = firstTurn ? "first" : opts.relaunch ? "relaunch" : "boundary";

  fs.mkdirSync(runtime.paths.sessionsDir, { recursive: true });
  const digestRel =
    opts.relaunch && records.length > 0
      ? await writeLaunchDigest(runtime, iteration, records)
      : null;
  const digestPath = digestRel ? path.join(runtime.store.goalDir, digestRel) : undefined;

  const steers = await scanInbox(runtime.store);
  const head = await integrationHead(runtime);
  const packRel = contextPackRelPath(iteration);
  const previous = previousSummary(runtime.store.goalDir, state.iteration);

  const pack = renderContextPack({
    goal: path.basename(runtime.paths.goalDir),
    iteration,
    intentPath: path.join(runtime.store.goalDir, "intent.md"),
    planPath: path.join(runtime.store.goalDir, "plan.md"),
    checkout: runtime.paths.goalCheckout,
    integrationBranch: runtime.paths.integrationBranch,
    headHash: head,
    recordsDir: runtime.store.recordsDir,
    tasksDir: runtime.store.tasksDir,
    previousSummary: previous,
    digestPath,
    tasks,
    state,
    codeMap: await codeMap(runtime.paths.goalCheckout),
    steers,
    setup: runtime.configs.repo.setup,
    gates: runtime.configs.repo.gates,
    baseGates: recordedBaseGates(records),
    forwarded: forwardedConcerns(records),
  });
  await runtime.store.writeFile(packRel, pack);

  const tasksBefore = await taskSnapshot(runtime.store.goalDir);
  const session = await resumableSession(runtime, records);

  const result = await runAgentTurn(runtime, {
    target: resolveRole(runtime, "architect"),
    cwd: runtime.paths.goalCheckout,
    meta: { iteration, step: "architect", round: 1 },
    vars: {
      turn,
      iteration: String(iteration),
      intent_path: path.join(runtime.store.goalDir, "intent.md"),
      plan_path: path.join(runtime.store.goalDir, "plan.md"),
      checkout: runtime.paths.goalCheckout,
      pack_path: path.join(runtime.store.goalDir, packRel),
      digest_path: digestPath ?? "",
      steers: formatSteers(steers),
    },
    expectation: "architect",
    session,
    settle: async (_record, outcome, live) => {
      if (!live || outcome?.decision !== "continue") return {};
      const compacted = await compactArchitect(runtime, live);
      return compacted ? { session: compacted } : {};
    },
  });

  const responses = result.outcome ? steerResponses(result.outcome) : new Map<string, string>();
  for (const steer of steers) {
    const answer = responses.get(steer.id);
    if (!answer) continue;
    await writeOutbox(
      runtime.store,
      steer.id,
      `# Steer ${steer.id}\n\n${answer}\n\nSource: ${steer.relPath}`
    );
    await markProcessed(runtime.store, steer);
  }

  const touched = snapshotDiff(tasksBefore, await taskSnapshot(runtime.store.goalDir));
  if (touched) {
    return {
      iteration,
      decision: "blocked",
      cause: `architect modified task file ${touched}; only the PM writes tasks`,
      outcome: result.outcome,
      packPath: packRel,
    };
  }

  const decision = result.outcome?.decision;
  if (!decision) {
    const cause = `architect turn produced no decision: ${result.outcome?.summary ?? "no outcome"}`;
    return {
      iteration,
      decision: "blocked",
      cause,
      outcome: result.outcome,
      packPath: packRel,
    };
  }

  if (decision !== "continue") {
    return { iteration, decision, outcome: result.outcome, packPath: packRel };
  }

  const planPath = path.join(runtime.store.goalDir, "plan.md");
  if (!fs.existsSync(planPath)) {
    return {
      iteration,
      decision: "blocked",
      cause: `architect continued but ${planPath} does not exist`,
      outcome: result.outcome,
      packPath: packRel,
    };
  }

  const pm = await runPm(runtime, {
    iteration,
    state,
    planPath,
    cwd: runtime.paths.goalCheckout,
  });
  if (pm.status === "asked") {
    return {
      iteration,
      decision: "blocked",
      cause: `PM escalated and asked: ${pm.outcome.summary}`,
      outcome: result.outcome,
      packPath: packRel,
    };
  }
  if (pm.status === "exhausted") {
    return {
      iteration,
      decision: "blocked",
      cause: `PM ladder exhausted: ${rungTrace(pm.rungs)}`,
      outcome: result.outcome,
      packPath: packRel,
    };
  }
  return {
    iteration,
    decision,
    outcome: result.outcome,
    packPath: packRel,
  };
}
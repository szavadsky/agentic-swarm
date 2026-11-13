import fs from "node:fs";
import path from "node:path";
import { runAgentTurn } from "./agent.js";
import { forwardedConcerns, renderContextPack } from "./context-pack.js";
import { derive } from "./derive.js";
import { integrationHead } from "./worktree.js";
import { formatSteers, markProcessed, scanInbox, steerResponses, writeOutbox } from "./mailbox.js";
import { PmValidationError, runPm } from "./pm.js";
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

async function compactArchitect(
  runtime: KernelRuntime,
  session: NonNullable<import("./types.js").StepRecord["session"]>
): Promise<void> {
  const harness = runtime.harnesses.get(session.harness);
  if (!harness?.compact) return;
  try {
    const caps = await harness.caps(session.model);
    if (caps.compact !== "none") await harness.compact(session);
  } catch {
    // Compaction is cache hygiene, not a gate: a failure must not end the iteration.
  }
}

/**
 * One architect consult: inbox, deterministic pack, architect turn (plan edited
 * in place), steers answered, then the PM turn and its validation. Called at
 * every iteration start, never mid-iteration.
 */
export async function runBoundary(
  runtime: KernelRuntime,
  opts: { relaunch: boolean }
): Promise<BoundaryResult> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const state = derive(tasks, records);
  const iteration = state.iteration + 1;
  const steers = await scanInbox(runtime.store);
  const head = await integrationHead(runtime);
  const packRel = `iterations/${iteration}/context-pack.md`;
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
    tasks,
    state,
    steers,
    setup: runtime.configs.repo.setup,
    gates: runtime.configs.repo.gates,
    forwarded: forwardedConcerns(records, Math.max(1, state.iteration)),
  });
  await runtime.store.writeFile(packRel, pack);

  const lastArchitect = records
    .filter((r) => r.step === "architect" && r.session && r.session.cwd === runtime.paths.goalCheckout)
    .sort((a, b) => a.seq - b.seq)
    .at(-1);

  const result = await runAgentTurn(runtime, {
    role: "architect",
    cwd: runtime.paths.goalCheckout,
    meta: { iteration, step: "architect", round: 1 },
    vars: {
      turn: opts.relaunch ? "relaunch" : "boundary",
      iteration: String(iteration),
      intent_path: path.join(runtime.store.goalDir, "intent.md"),
      plan_path: path.join(runtime.store.goalDir, "plan.md"),
      checkout: runtime.paths.goalCheckout,
      pack_path: path.join(runtime.store.goalDir, packRel),
      digest_path: "",
      steers: formatSteers(steers),
    },
    expectation: "architect",
    session: lastArchitect?.session,
  });

  const decision = result.outcome?.decision;
  if (!decision) {
    const cause = `architect turn produced no decision: ${result.outcome?.summary ?? "no outcome"}`;
    return { iteration, decision: "blocked", cause, outcome: result.outcome, packPath: packRel };
  }

  const responses = result.outcome ? steerResponses(result.outcome) : new Map<string, string>();
  for (const steer of steers) {
    await markProcessed(runtime.store, steer);
    const answer = responses.get(steer.id);
    await writeOutbox(
      runtime.store,
      steer.id,
      answer
        ? `# Steer ${steer.id}\n\n${answer}\n\nSource: ${steer.relPath}`
        : `# Steer ${steer.id}\n\nNo response recorded in the architect outcome.\n\nSource: ${steer.relPath}`
    );
  }

  if (decision !== "continue") {
    return { iteration, decision, outcome: result.outcome, packPath: packRel };
  }

  if (result.record.session) await compactArchitect(runtime, result.record.session);

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

  try {
    await runPm(runtime, {
      iteration,
      state,
      planPath,
      cwd: runtime.paths.goalCheckout,
    });
  } catch (err) {
    if (!(err instanceof PmValidationError)) throw err;
    return {
      iteration,
      decision: "blocked",
      cause: `PM validation failed twice: ${err.findings.join("; ")}`,
      outcome: result.outcome,
      packPath: packRel,
    };
  }
  return { iteration, decision, outcome: result.outcome, packPath: packRel };
}

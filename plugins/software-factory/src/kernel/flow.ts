import { commitAll } from "../core/git/commit.js";
import { runAgentTurn } from "./agent.js";
import { runGates, formatFailingChecks } from "./gates.js";
import { mergeTask } from "./integrate.js";
import { appendChecks, appendFinish, appendPark, formatConcerns, scriptMeta } from "./record.js";
import { materialHash } from "./tasks.js";
import { ensureTaskWorktree, headSha, taskBranchName, taskWorktreePath } from "./worktree.js";
import type {
  Action,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";

function lastReview(records: StepRecord[], slug: string): StepRecord | undefined {
  return records
    .filter((r) => r.slug === slug && r.step === "review" && r.outcome)
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
}

function lastChecks(records: StepRecord[], slug: string): StepRecord | undefined {
  return records
    .filter((r) => r.slug === slug && r.step === "checks")
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
}

function firstImplement(records: StepRecord[], slug: string): StepRecord | undefined {
  return records
    .filter((r) => r.slug === slug && r.step === "implement" && r.base)
    .sort((a, b) => a.seq - b.seq)
    .at(0);
}

function promptVars(
  runtime: KernelRuntime,
  task: TaskFile,
  worktree: string,
  records: StepRecord[],
  round: number
): Record<string, string> {
  const review = lastReview(records, task.slug);
  const checks = lastChecks(records, task.slug);
  const latest = (review?.seq ?? -1) > (checks?.seq ?? -1) ? review : checks;
  const findings =
    latest === review && review?.outcome
      ? formatConcerns(review.outcome)
      : checks?.checks
        ? formatFailingChecks(checks.checks)
        : "";
  return {
    task_path: `${runtime.store.tasksDir}/${task.slug}.md`,
    worktree,
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands:
      runtime.configs.repo.gates.map((g) => `- ${g.id}: ${g.command}`).join("\n") || "none",
    baseline_checks: checks?.checks ? formatFailingChecks(checks.checks) || "none" : "none",
    findings,
    round: String(round),
  };
}

export interface StepDeps {
  runtime: KernelRuntime;
  task: TaskFile;
  state: TaskState;
  iteration: number;
  step: string;
}

async function runImplement(deps: StepDeps): Promise<void> {
  const { runtime, task, state, iteration } = deps;
  const records = await runtime.store.listRecords();
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) {
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, ensured.error);
    return;
  }
  if (ensured.setup && !ensured.setup.ok) {
    const cause = `worktree setup failed: ${ensured.setup.error ?? "unknown"}`;
    await runtime.store.appendRecord(scriptMeta(iteration, "setup", { slug: task.slug, round: state.round }), {
      ok: false,
      cause,
    });
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, cause);
    return;
  }

  const first = firstImplement(records, task.slug);
  const base = first?.base ?? ensured.startPoint;
  const result = await runAgentTurn(runtime, {
    role: "implementer",
    cwd: ensured.path,
    meta: {
      iteration,
      slug: task.slug,
      step: "implement",
      round: state.round,
      base,
      taskHash: materialHash(task),
    },
    vars: promptVars(runtime, task, ensured.path, records, state.round),
    expectation: "any",
    settle: async () => {
      const commit = await commitAll(
        runtime.repo,
        ensured.path,
        `factory: ${task.slug} implement r${state.round}`
      );
      return commit ? { commit } : {};
    },
  });

  if (result.outcome?.status === "done") {
    const checks = await runGates(runtime, ensured.path);
    await appendChecks(runtime.store, { iteration, slug: task.slug, round: state.round }, checks);
  }
}

async function runReview(deps: StepDeps): Promise<void> {
  const { runtime, task, state, iteration } = deps;
  const records = await runtime.store.listRecords();
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) {
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, ensured.error);
    return;
  }
  const first = firstImplement(records, task.slug);
  const base = first?.base ?? ensured.startPoint;
  const head = await headSha(ensured.path);
  const flow = runtime.limits.flows[task.flow];
  if (!flow) throw new Error(`flow "${task.flow}" is not configured`);

  await runAgentTurn(runtime, {
    role: "reviewer",
    cwd: ensured.path,
    meta: {
      iteration,
      slug: task.slug,
      step: "review",
      round: state.round,
      base,
      taskHash: materialHash(task),
    },
    vars: {
      task_path: `${runtime.store.tasksDir}/${task.slug}.md`,
      worktree: ensured.path,
      base_hash: base,
      head_hash: head,
      round: String(state.round),
      max_rounds: String(flow.reviewRounds),
      prior_findings: lastReview(records, task.slug)?.outcome
        ? formatConcerns(lastReview(records, task.slug)!.outcome!)
        : "",
    },
    expectation: "review",
    settle: async () => {
      const commit = await commitAll(
        runtime.repo,
        ensured.path,
        `factory: ${task.slug} review r${state.round}`
      );
      return commit ? { commit } : {};
    },
  });
}

/** Executes one dispatch action; every script step writes its own record. */
export async function executeTaskAction(
  runtime: KernelRuntime,
  task: TaskFile,
  action: Action,
  iteration: number,
  state: TaskState
): Promise<void> {
  if (action.kind === "step") {
    const deps = { runtime, task, state, iteration, step: action.step };
    if (action.step === "implement") await runImplement(deps);
    else if (action.step === "review") await runReview(deps);
    else throw new Error(`flow step "${action.step}" has no kernel implementation`);
  } else if (action.kind === "merge") {
    await mergeTask(runtime, task, iteration, state.round);
  } else if (action.kind === "finish") {
    await appendFinish(runtime.store, { iteration, slug: task.slug, round: state.round }, state.commit);
  } else if (action.kind === "park") {
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, action.cause);
  }
}

export { taskBranchName, taskWorktreePath };

import type {
  GoalStatus,
  State,
  StepRecord,
  TaskFile,
  TaskPhase,
  TaskState,
  TaskStatus,
} from "./types.js";

/** Dependency edges are satisfied by merged work and by landed spike findings. */
function depsSatisfied(task: TaskFile, statuses: ReadonlyMap<string, TaskStatus>): boolean {
  return task.deps.every((dep) => {
    const status = statuses.get(dep);
    return status === "merged" || status === "finished";
  });
}

function bySeq(a: StepRecord, b: StepRecord): number {
  return a.seq - b.seq || a.startedAt.localeCompare(b.startedAt);
}

interface Reducer {
  phase: TaskPhase;
  round: number;
  verdict?: TaskState["verdict"];
  commit?: string;
  cause?: string;
  stopped: boolean;
}

/**
 * Pure, idempotent state derived from task files plus append-only records —
 * the whole crash-recovery story is calling this again. Unfinished records
 * (started, no end) are orphans: they contribute nothing, so the same step is
 * redispatched after the worktree is reconciled.
 */
export function derive(tasks: TaskFile[], records: StepRecord[]): State {
  const sorted = [...records].sort(bySeq);
  let iteration = 0;
  let goal: GoalStatus = "active";
  for (const rec of sorted) {
    iteration = Math.max(iteration, rec.iteration);
    if (rec.actor === "agent" && rec.step === "architect" && rec.endedAt && rec.outcome?.decision) {
      goal = rec.outcome.decision === "done" ? "done" : rec.outcome.decision === "blocked" ? "blocked" : "active";
    }
  }

  const statuses = new Map<string, TaskStatus>();
  const reducedBySlug = new Map<string, ReturnType<typeof reducePhase>>();
  const terminalBySlug = new Map<string, Terminal>();
  for (const task of tasks) {
    const recs = sorted.filter((r) => r.slug === task.slug);
    const completed = recs.filter((r) => r.endedAt);
    const terminal = terminalFromRecords(task, recs);
    const reduced = reducePhase(task, completed);
    reducedBySlug.set(task.slug, reduced);
    terminalBySlug.set(task.slug, terminal ?? { status: reduced.stopped ? "parked" : "pending" });
    // Terminal facts are order-independent; readiness is resolved below.
    if (terminal || reduced.stopped) {
      statuses.set(task.slug, terminal?.status ?? "parked");
    }
  }

  const taskStates: Record<string, TaskState> = {};
  for (const task of tasks) {
    const turns = sorted.filter(
      (r) => r.slug === task.slug && r.endedAt && r.actor === "agent" && r.stop?.kind !== "infra"
    ).length;
    const reduced = reducedBySlug.get(task.slug)!;
    const terminal = terminalBySlug.get(task.slug)!;
    const status: TaskStatus = statuses.get(task.slug) ?? (depsSatisfied(task, statuses) ? "ready" : "pending");
    statuses.set(task.slug, status);
    taskStates[task.slug] = {
      status,
      cause: terminal.cause ?? reduced.cause,
      turns,
      round: reduced.round,
      kind: task.kind,
      flow: task.flow,
      phase: status === "merged" || status === "finished" || status === "parked" || status === "cancelled" ? "done" : reduced.phase,
      commit: terminal.commit ?? reduced.commit,
      verdict: reduced.verdict,
    };
  }

  return {
    goal,
    iteration,
    terminal: goal !== "active",
    tasks: taskStates,
  };
}

interface Terminal {
  status: TaskStatus;
  cause?: string;
  commit?: string;
}

/** Script/outcome terminal facts: parked, merged, finished. */
function terminalFromRecords(task: TaskFile, recs: StepRecord[]): Terminal | null {
  let out: Terminal | null = null;
  for (const rec of recs) {
    if (!rec.endedAt) continue;
    if (rec.step === "park") {
      out = { status: "parked", cause: rec.cause ?? "parked without a recorded cause" };
    } else if (rec.step === "cancel") {
      out = { status: "cancelled", cause: rec.cause ?? "cancelled without a recorded cause" };
    } else if (rec.step === "merge" && rec.ok === true) {
      out = { status: task.kind === "spike" ? "finished" : "merged", commit: rec.commit };
    } else if (rec.step === "finish" && rec.ok === true) {
      out = { status: "finished", commit: rec.commit };
    } else if (rec.step === "merge" && rec.ok === false) {
      out = null;
    } else if (rec.step === "implement" || rec.step === "review") {
      const status = rec.outcome?.status;
      if (status === "blocked" || status === "upscope") {
        out = {
          status: "parked",
          cause: `${status}: ${rec.outcome?.summary ?? "no summary"}`,
        };
      } else if (rec.step === "review" && rec.outcome?.verdict === "reject") {
        out = { status: "parked", cause: `review rejected: ${rec.outcome.summary}` };
      } else if (rec.stop?.kind === "refusal") {
        out = { status: "parked", cause: `refused: ${rec.stop.details ?? "no details"}` };
      }
    }
  }
  return out;
}

/**
 * Phase reducer over completed agent steps. Script checks records are merged
 * into the sequence: a red check after an implement turn sends the task back
 * to implementation without consuming a review round.
 */
function reducePhase(task: TaskFile, recs: StepRecord[]): Reducer {
  const state: Reducer = { phase: "implement", round: 1, stopped: false };
  for (const rec of recs) {
    if (rec.actor !== "agent" && rec.step === "checks") {
      state.phase = rec.ok === false ? "implement" : "review";
      continue;
    }
    if (rec.step === "merge" && rec.ok === false) {
      state.phase = task.kind === "spike" ? "finish" : "merge";
      continue;
    }
    if (rec.actor !== "agent" || rec.slug !== task.slug) continue;
    if (rec.stop?.kind === "infra" || rec.stop?.kind === "truncated" || rec.stop?.kind === "cancelled") {
      // The turn did not count as a normal step; repeat the phase already in force.
      if (rec.step === "implement") state.phase = "implement";
      if (rec.step === "review") state.phase = "review";
      continue;
    }
    const outcome = rec.outcome;
    const refusal = rec.stop?.kind === "refusal" ? rec.stop : undefined;
    if (outcome?.status === "blocked" || outcome?.status === "upscope" || refusal) {
      state.stopped = true;
      state.cause = outcome
        ? `${outcome.status}: ${outcome.summary}`
        : `refused: ${refusal?.details ?? "no details"}`;
      continue;
    }
    if (rec.step === "implement") {
      state.round = rec.round;
      state.commit = rec.commit ?? state.commit;
      // A failed attempt retries implementation; a done one faces its checks.
      state.phase = outcome?.status === "failed" ? "implement" : "review";
    } else if (rec.step === "review") {
      state.round = rec.round;
      state.verdict = outcome?.verdict;
      if (outcome?.status === "failed") {
        state.phase = "review";
      } else if (outcome?.verdict === "approve") {
        state.phase = task.kind === "spike" ? "finish" : "merge";
      } else if (outcome?.verdict === "changes") {
        state.phase = "implement";
        state.round = rec.round + 1;
      } else {
        state.phase = "review";
      }
    }
  }
  return state;
}


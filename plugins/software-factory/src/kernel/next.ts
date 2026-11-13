import type { Action, Limits, State } from "./types.js";

/**
 * Pure dispatch decision. Actions are ordered by dependency-independent slug
 * order; the shell executes them serially (S2 adds concurrency) and re-derives
 * after every record. `running` guards against dispatching a task twice.
 */
export function next(state: State, limits: Limits, running: ReadonlySet<string>): Action[] {
  if (state.terminal) {
    return [{ kind: "exit", reason: `goal ${state.goal}` }];
  }

  const actions: Action[] = [];
  for (const slug of Object.keys(state.tasks).sort()) {
    if (running.has(slug)) continue;
    const task = state.tasks[slug]!;
    if (task.status === "merged" || task.status === "finished" || task.status === "parked" || task.status === "cancelled") {
      continue;
    }
    if (task.status !== "ready") continue;

    const flow = limits.flows[task.flow];
    if (!flow) {
      actions.push({ kind: "park", slug, cause: `flow "${task.flow}" is not configured` });
      continue;
    }

    if (task.phase === "implement" && task.round > flow.reviewRounds) {
      actions.push({
        kind: "park",
        slug,
        cause: `review round limit reached after verdict "${task.verdict ?? "none"}" (${flow.reviewRounds} rounds)`,
      });
      continue;
    }
    if ((task.phase === "implement" || task.phase === "review") && task.turns >= limits.itemTurns) {
      actions.push({
        kind: "park",
        slug,
        cause: `item budget exhausted after ${task.turns} turns`,
      });
      continue;
    }

    switch (task.phase) {
      case "implement":
        actions.push({ kind: "step", slug, step: "implement", round: task.round });
        break;
      case "review":
        actions.push({ kind: "step", slug, step: "review", round: task.round });
        break;
      case "merge":
        actions.push({ kind: "merge", slug });
        break;
      case "finish":
        actions.push({ kind: "finish", slug });
        break;
      default:
        break;
    }
  }

  if (actions.length > 0) return actions;
  if (running.size > 0) return [];
  return [{ kind: "boundary" }];
}

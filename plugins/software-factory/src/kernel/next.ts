// biome-ignore-all lint/complexity: split-rest
import { agentSteps, reviewRoundLimit } from "./review.js";
import type { Action, Limits, State } from "./types.js";

function park(slug: string, cause: string): Action {
  return { kind: "park", slug, cause };
}

/**
 * Pure dispatch decision. Actions are ordered by slug; the dispatcher admits
 * them against concurrency and drain limits and re-derives after every
 * record. `running` guards against dispatching a task twice.
 */
export function next(
  state: State,
  limits: Limits,
  running: ReadonlySet<string>,
): Action[] {
  if (state.terminal) {
    return [{ kind: "exit", reason: `goal ${state.goal}` }];
  }

  const actions: Action[] = [];
  for (const slug of Object.keys(state.tasks).sort()) {
    if (running.has(slug)) continue;
    const task = state.tasks[slug]!;
    if (
      task.status === "merged" ||
      task.status === "finished" ||
      task.status === "parked" ||
      task.status === "cancelled"
    ) {
      continue;
    }
    if (task.status !== "ready") continue;

    if (task.park) {
      actions.push(park(slug, task.park));
      continue;
    }
    if (task.loop) {
      const loop = task.loop;
      actions.push(
        park(
          slug,
          `no-progress: ${loop.step} r${loop.round} repeats r${loop.firstRound} (${loop.fingerprint.slice(0, 8)})`,
        ),
      );
      continue;
    }

    const flow = limits.flows[task.flow];
    if (!flow) {
      actions.push(park(slug, `flow "${task.flow}" is not configured`));
      continue;
    }

    if (task.phase === "checks") {
      actions.push({ kind: "checks", slug });
      continue;
    }
    if (task.phase === "merge") {
      actions.push({ kind: "merge", slug });
      continue;
    }
    if (task.phase === "resolve") {
      actions.push({ kind: "step", slug, step: "resolve", round: task.round });
      continue;
    }
    if (task.phase === "finish") {
      actions.push({ kind: "finish", slug });
      continue;
    }
    if (task.phase === "done" || task.phase === "parked") {
      actions.push(
        park(slug, `stuck: no next action for phase "${task.phase}"`),
      );
      continue;
    }

    const step = agentSteps(flow).find((s) => s.id === task.phase);
    if (!step) {
      actions.push(
        park(slug, `flow "${task.flow}" has no step "${task.phase}"`),
      );
      continue;
    }
    if (step.review) {
      const roundLimit = reviewRoundLimit(step);
      if (task.round > roundLimit) {
        actions.push(
          park(
            slug,
            `review round limit reached after verdict "${task.verdict ?? "none"}" (${roundLimit} rounds)`,
          ),
        );
        continue;
      }
    }
    actions.push({ kind: "step", slug, step: step.id, round: task.round });
  }

  if (actions.length > 0) return actions;
  if (running.size > 0) return [];
  return [{ kind: "boundary" }];
}

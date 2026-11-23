/**
 * The `after` topology of a flow: edges, ready steps and topological order.
 * A flow that names no `after` is a plain linear flow; in a flow that names
 * any, a step without one runs after the previous list step. All steps share
 * the task's worktree, so ready steps keep sequential, topological execution
 * in list order; checks and the merge stay at the flow's end.
 */
import type { FlowDefinition, FlowStep } from "./types.js";

/** Agent steps of the flow: `checks` and `resolve` stay at the flow's end. */
export function dagAgentSteps(flow: FlowDefinition): FlowStep[] {
  return flow.steps.filter(
    (step) => step.id !== "checks" && step.id !== "resolve",
  );
}

/**
 * The `after` edges of a flow, aligned with its agent steps: an explicit
 * list, or the previous step for a step that names none in a DAG flow.
 */
export function dagEdges(flow: FlowDefinition): string[][] {
  const agent = dagAgentSteps(flow);
  const explicit = agent.some((step) => step.after !== undefined);
  const idSet = new Set(agent.map((step) => step.id));
  return agent.map((step, index) => {
    const preds = step.after ?? (explicit ? [agent[index - 1]?.id ?? ""] : []);
    return preds.filter(
      (pred) => pred !== step.id && pred !== "" && idSet.has(pred),
    );
  });
}

/**
 * The topological ordering of a flow's agent steps: Kahn's algorithm with
 * list order as the tiebreak. A validated flow is a DAG, so this totally
 * orders its steps; ready steps keep sequential execution in list order.
 */
export function topoOrder(flow: FlowDefinition): FlowStep[] {
  const agent = dagAgentSteps(flow);
  const edges = dagEdges(flow);
  const index = new Map(agent.map((step, i) => [step.id, i]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const step of agent) {
    indegree.set(step.id, 0);
    dependents.set(step.id, []);
  }
  for (let i = 0; i < agent.length; i += 1) {
    const step = agent[i]!;
    const pre = new Set(edges[i]!);
    indegree.set(step.id, pre.size);
    for (const pred of pre) dependents.get(pred)!.push(step.id);
  }
  const byId = new Map(agent.map((step) => [step.id, step]));
  const order: FlowStep[] = [];
  const free = agent.filter((step) => indegree.get(step.id) === 0);
  while (free.length > 0) {
    free.sort((a, b) => index.get(a.id)! - index.get(b.id)!);
    const step = free.shift()!;
    order.push(step);
    for (const dependent of dependents.get(step.id)!) {
      indegree.set(dependent, indegree.get(dependent)! - 1);
      if (indegree.get(dependent) === 0) free.push(byId.get(dependent)!);
    }
  }
  return order;
}

/**
 * Whether every predecessor of `step` completed after `step`'s own last turn,
 * so it is ready to run. `lastRound` maps a completed step id to the round it
 * completed in; a predecessor that never completed is never ready. A step
 * never completed is ready when every predecessor completed in the current
 * round; a step completed already is ready again only in a later round, whose
 * predecessors must all have completed again since.
 */
export function dagReady(
  step: FlowStep,
  lastRound: ReadonlyMap<string, number>,
  currentRound: number,
): boolean {
  const last = lastRound.get(step.id);
  // A step that completed in the current round is not ready again; it — and
  // every step downstream of it — waits for the next round.
  if (last !== undefined && last >= currentRound) return false;
  if (last === undefined && currentRound > 1) return false;
  for (const pred of step.after ?? []) {
    if (pred === step.id) continue;
    const round = lastRound.get(pred);
    if (round === undefined) return false;
    if (last === undefined ? round < currentRound : round < last) return false;
  }
  return true;
}

/** The first ready step of a flow at a given round, or undefined. */
export function firstReadyStep(
  flow: FlowDefinition,
  lastRound: ReadonlyMap<string, number>,
  currentRound: number,
): FlowStep | undefined {
  for (const step of topoOrder(flow)) {
    if (dagReady(step, lastRound, currentRound)) return step;
  }
  return undefined;
}

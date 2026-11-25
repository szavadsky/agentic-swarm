/** The steer turn's route, answer and hold validation. */

import {
  formatSteerRoute,
  isArchitectRoute,
  type Steer,
} from "../../mailbox.js";
import type {
  KernelRuntime,
  Outcome,
  State,
  SteerRoute,
  TaskFile,
} from "../../types.js";
import {
  architectHoldProblem,
  selfHoldProblem,
  stallHoldProblem,
} from "../holds.js";
import {
  type PlanSnapshot,
  reconcileTurn,
  scopeWriteFindings,
} from "../reconcile.js";
import type { PmScope, SteerRouteEntry } from "../types.js";
import { scopeEpic, steerEpicOf } from "../scope.js";
import { steerWriteFindings } from "./steer-writes.js";

export async function validateSteerTurn(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    state: State;
    round: number;
    claim: Steer[];
    scope?: PmScope;
  },
  plansBefore: readonly PlanSnapshot[],
  taskSnapshot: Map<string, string>,
  outcome: Outcome | undefined,
): Promise<string[]> {
  const { findings, texts, tasks, parseFindings } = await reconcileTurn(
    runtime,
    opts,
    plansBefore,
    taskSnapshot,
  );
  const routes = outcome?.steerRoutes ?? [];
  const claimed = new Set(opts.claim.map((steer) => steer.id));
  const scan = scanSteerRoutes(routes, claimed);
  findings.push(...scan.findings);
  findings.push(
    ...steerScopeFindings(runtime, opts.scope ?? { kind: "goal" }, opts.claim),
  );
  findings.push(...unroutedSteerFindings(opts.claim, scan.routeOf));
  findings.push(
    ...(await steerRouteDetailFindings(runtime, routes, claimed, tasks)),
  );
  findings.push(
    ...scopeWriteFindings(
      opts.scope ?? { kind: "goal" },
      taskSnapshot,
      texts,
      tasks,
    ),
  );
  if (parseFindings.length === 0) {
    findings.push(
      ...steerWriteFindings(
        routes,
        claimed,
        scan.routeOf,
        taskSnapshot,
        texts,
        tasks,
      ),
    );
  }
  return [...new Set(findings)];
}

/**
 * A steer claimed by the wrong scope: the live sink refuses a foreign steer,
 * and a claim that still carries one is rejected here, so no path lets a PM
 * route another epic's steer or the goal's.
 */
function steerScopeFindings(
  runtime: KernelRuntime,
  scope: PmScope,
  claim: readonly Steer[],
): string[] {
  const epic = scopeEpic(scope);
  const epicOf = steerEpicOf(runtime, claim);
  const mine =
    epic === undefined
      ? "the goal PM routes only goal-level steers"
      : `the PM for epic ${epic} routes only epic ${epic} steers`;
  const findings: string[] = [];
  for (const steer of claim) {
    const owner = epicOf.get(steer.id);
    if (owner === epic) continue;
    const theirs = owner === undefined ? "goal-level" : `epic ${owner}'s`;
    findings.push(`steer "${steer.id}" is ${theirs}; ${mine}`);
  }
  return findings;
}

/** Each claimed steer is routed once, and only claimed steers are routed. */
function scanSteerRoutes(
  routes: readonly SteerRouteEntry[],
  claimed: ReadonlySet<string>,
): { routeOf: Map<string, SteerRoute>; findings: string[] } {
  const seen = new Set<string>();
  const routeOf = new Map<string, SteerRoute>();
  const findings: string[] = [];
  for (const entry of routes) {
    if (seen.has(entry.steer)) {
      findings.push(
        `steer "${entry.steer}" is routed twice; route each claimed steer once`,
      );
      continue;
    }
    seen.add(entry.steer);
    routeOf.set(entry.steer, entry.route);
    if (!claimed.has(entry.steer)) {
      findings.push(
        `steer "${entry.steer}" was not claimed this turn; route only the pending steers from this turn`,
      );
    }
  }
  return { routeOf, findings };
}

function unroutedSteerFindings(
  claim: readonly Steer[],
  routeOf: ReadonlyMap<string, SteerRoute>,
): string[] {
  const findings: string[] = [];
  for (const steer of claim) {
    if (!routeOf.has(steer.id)) {
      findings.push(
        `steer "${steer.id}" has no route; route each claimed steer as task|spike|intent|architect|stall or {architect: id}`,
      );
    }
  }
  return findings;
}

/** The answer and hold each route must carry, and the self-hold guard. */
async function steerRouteDetailFindings(
  runtime: KernelRuntime,
  routes: readonly SteerRouteEntry[],
  claimed: ReadonlySet<string>,
  tasks: readonly TaskFile[],
): Promise<string[]> {
  const findings: string[] = [];
  for (const entry of routes) {
    if (!claimed.has(entry.steer)) continue;
    findings.push(...steerAnswerFindings(entry));
    findings.push(...(await steerHoldFindings(runtime, entry, tasks)));
  }
  return findings;
}

/** Only a task route answers now; every other route carries no answer. */
function steerAnswerFindings(entry: SteerRouteEntry): string[] {
  const answer = entry.answer?.trim() ?? "";
  if (entry.route === "task") {
    return answer
      ? []
      : [
          `steer "${entry.steer}" routed task needs an answer; the PM answers a task steer in the outbox now`,
        ];
  }
  return answer
    ? [
        `steer "${entry.steer}" routed ${formatSteerRoute(entry.route)} must not carry an answer; only task answers now`,
      ]
    : [];
}

async function steerHoldFindings(
  runtime: KernelRuntime,
  entry: SteerRouteEntry,
  tasks: readonly TaskFile[],
): Promise<string[]> {
  const findings: string[] = [];
  if (entry.route === "stall") {
    const problem = await stallHoldProblem(runtime, entry.steer);
    if (problem) findings.push(problem);
  }
  if (entry.route === "intent" || isArchitectRoute(entry.route)) {
    const label = entry.route === "intent" ? "intent" : "architect";
    const problem = await architectHoldProblem(runtime, entry.steer, label);
    if (problem) findings.push(problem);
  }
  const selfHeld = await selfHoldProblem(runtime, entry.steer, tasks);
  if (selfHeld) findings.push(selfHeld);
  return findings;
}

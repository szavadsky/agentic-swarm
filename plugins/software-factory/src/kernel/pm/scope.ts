/** Which PMs a saga runs: one per epic with a plan, plus the goal's top PM. */

import type { Steer } from "../mailbox.js";
import { goalPlan, type PlanFile, resolvePlan } from "../plan-file.js";
import type { KernelRuntime } from "../types.js";
import type { PmScope } from "./types.js";

/** The goal-level PM, the scope a depth-1 goal has and every saga's top turn. */
export const GOAL_PM_SCOPE: PmScope = { kind: "goal" };

/** The plan file one PM scope owns. */
export function scopePlanFile(
  runtime: KernelRuntime,
  scope: PmScope,
): PlanFile {
  return scope.kind === "epic"
    ? resolvePlan(runtime.store.goalDir, { kind: "epic", epic: scope.epic })
    : goalPlan(runtime.store.goalDir);
}

/** The epic a scope names, or undefined for the goal. */
export function scopeEpic(scope: PmScope): string | undefined {
  return scope.kind === "epic" ? scope.epic : undefined;
}

/** A stable map key for a scope: the epic name, empty for the goal. */
export function pmScopeKey(scope: PmScope): string {
  return scopeEpic(scope) ?? "";
}

/**
 * The PMs a saga runs below the top: one per active epic whose plan exists,
 * in epic order. Depth 1 has no epic PMs, so the single PM keeps the goal.
 */
export function epicPmScopes(runtime: KernelRuntime): PmScope[] {
  if ((runtime.configs.process.hierarchy?.depth ?? 1) !== 2) return [];
  return runtime.store.plans
    .existing()
    .flatMap((plan) =>
      plan.scope.kind === "epic"
        ? [{ kind: "epic" as const, epic: plan.scope.epic }]
        : [],
    );
}

/**
 * Every active epic the register names, plan or not: a steer may belong to an
 * epic whose plan the top-down pass has not written yet.
 */
function registeredEpicNames(runtime: KernelRuntime): Set<string> {
  if ((runtime.configs.process.hierarchy?.depth ?? 1) !== 2) return new Set();
  return new Set(
    runtime.store.plans
      .registered()
      .flatMap((plan) => (plan.scope.kind === "epic" ? [plan.scope.epic] : [])),
  );
}

/** The epic a steer belongs to, when a PM owns that epic's plan. */
function steeredEpic(
  steer: Steer,
  epics: ReadonlySet<string>,
): string | undefined {
  return steer.epic !== undefined && epics.has(steer.epic)
    ? steer.epic
    : undefined;
}

/**
 * The PM scope one steer belongs to: its frontmatter epic when that epic has a
 * PM, otherwise the goal. The same rule `steerScopeGroups` batches by, so a
 * live turn can tell whether an arriving steer is its own.
 */
export function steerScopeOf(runtime: KernelRuntime, steer: Steer): PmScope {
  const epic = steerEpicOf(runtime, [steer]).get(steer.id);
  return epic === undefined ? GOAL_PM_SCOPE : { kind: "epic", epic };
}

/**
 * The scope of each steer in a batch: its frontmatter epic when that epic has
 * a PM, otherwise the goal. An epic steer never falls through to another epic.
 */
export function steerEpicOf(
  runtime: KernelRuntime,
  steers: readonly Steer[],
): Map<string, string> {
  const epics = registeredEpicNames(runtime);
  const out = new Map<string, string>();
  for (const steer of steers) {
    const epic = steeredEpic(steer, epics);
    if (epic !== undefined) out.set(steer.id, epic);
  }
  return out;
}

export interface SteerScopeGroup {
  scope: PmScope;
  steers: Steer[];
}

/**
 * One batch grouped by the PM that routes it, goal first then epics in order.
 * Empty groups are dropped: a batch never spends a PM turn on nothing.
 */
export function steerScopeGroups(
  runtime: KernelRuntime,
  steers: readonly Steer[],
): SteerScopeGroup[] {
  const epicOf = steerEpicOf(runtime, steers);
  const goal: SteerScopeGroup = { scope: GOAL_PM_SCOPE, steers: [] };
  const epics = new Map<string, SteerScopeGroup>();
  for (const steer of steers) {
    const epic = epicOf.get(steer.id);
    if (epic === undefined) {
      goal.steers.push(steer);
      continue;
    }
    const group = epics.get(epic) ?? {
      scope: { kind: "epic", epic },
      steers: [],
    };
    group.steers.push(steer);
    epics.set(epic, group);
  }
  const ordered = [...epics.keys()].sort().map((epic) => epics.get(epic));
  return [goal, ...ordered].filter(
    (group): group is SteerScopeGroup =>
      group !== undefined && group.steers.length > 0,
  );
}

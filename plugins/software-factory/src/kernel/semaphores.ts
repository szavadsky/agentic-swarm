/**
 * The run's named semaphores: the declarations merged from the three config
 * layers, the names one turn holds, and one registry per config bundle so a
 * gate and a live turn naming the same semaphore share its counts.
 */

import { Semaphores } from "../core/semaphores.js";
import type { SemaphoreDeclaration } from "../core/semaphores-types.js";
import type {
  ConfigLayer,
  MergedSemaphores,
  SemaphoreConflict,
} from "./semaphores-types.js";
import type { ConfigBundle } from "./types.js";

/** The layers in precedence order: an earlier declaration owns a name. */
function layers(
  configs: ConfigBundle,
): [ConfigLayer, readonly SemaphoreDeclaration[] | undefined][] {
  return [
    ["repo", configs.repo?.semaphores],
    ["process", configs.process?.semaphores],
    ["run", configs.run?.semaphores],
  ];
}

/**
 * The declarations every layer contributes. Names are global, so the same
 * name declared in two layers is one semaphore; a differing max is a conflict
 * pre-flight refuses instead of letting one layer silently win.
 */
export function mergeSemaphoreDeclarations(
  configs: ConfigBundle,
): MergedSemaphores {
  const declarations: SemaphoreDeclaration[] = [];
  const byName = new Map<string, number>();
  const conflicts: SemaphoreConflict[] = [];
  for (const [layer, list] of layers(configs)) {
    for (const declaration of list ?? []) {
      const previousMax = byName.get(declaration.name);
      if (previousMax === undefined) {
        byName.set(declaration.name, declaration.max);
        declarations.push(declaration);
      } else if (previousMax !== declaration.max) {
        conflicts.push({
          name: declaration.name,
          max: declaration.max,
          previousMax,
          layer,
        });
      }
    }
  }
  return { declarations, conflicts };
}

const registries = new WeakMap<ConfigBundle, Semaphores>();

/**
 * The config bundle's one registry. Gates and every turn of a launch resolve
 * it from the same bundle, which is what makes a gate and a live turn on one
 * name wait for each other; a conflicting declaration is a config defect
 * pre-flight already refused, so reaching one here fails loudly.
 */
export function semaphoresFor(configs: ConfigBundle): Semaphores {
  const existing = registries.get(configs);
  if (existing !== undefined) return existing;
  const { declarations, conflicts } = mergeSemaphoreDeclarations(configs);
  const conflict = conflicts[0];
  if (conflict !== undefined) {
    throw new Error(
      `semaphore "${conflict.name}" is declared with max ${conflict.max} in the ${conflict.layer} layer and max ${conflict.previousMax} elsewhere`,
    );
  }
  const registry = new Semaphores(declarations);
  registries.set(configs, registry);
  return registry;
}

/**
 * The names one turn on `tier` holds, one per distinct name: the run's
 * overall semaphore, the step's, the harness's and the subscription's. A
 * subscription is a quota pool first, so it bounds the turn only when the run
 * also declares a semaphore under that name.
 */
export function turnSemaphoreNames(
  configs: ConfigBundle,
  step: readonly string[] | undefined,
  tier: { harness: { id: string }; subscription?: string },
): string[] {
  const names: string[] = [];
  const overall = configs.run?.limits?.overallSemaphore;
  if (overall !== undefined) names.push(overall);
  for (const name of step ?? []) names.push(name);
  const harness = configs.run?.harnesses?.[tier.harness.id]?.semaphore;
  if (harness !== undefined) names.push(harness);
  if (
    tier.subscription !== undefined &&
    isDeclared(configs, tier.subscription)
  ) {
    names.push(tier.subscription);
  }
  return names;
}

function isDeclared(configs: ConfigBundle, name: string): boolean {
  return mergeSemaphoreDeclarations(configs).declarations.some(
    (declaration) => declaration.name === name,
  );
}

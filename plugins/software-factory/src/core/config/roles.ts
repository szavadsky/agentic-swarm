import type {
  FlowStep,
  RoleDefinition,
  AgentConfig,
} from "../artifacts.js";

export interface ResolvedRole {
  role: string;
  models: string[];
}

/**
 * Resolves a role name to its canonical role and deduplicated list of models:
 * - Follows alias chains (e.g. task-reviewer -> alt-workhorse -> model)
 * - Throws descriptive error on alias cycles
 * - Iteratively expands fallbacks breadth-first, deduplicating while preserving primary first
 */
export function resolveRole(
  roleName: string,
  rolesConfig: Record<string, RoleDefinition>
): ResolvedRole {
  const visitedAliases = new Set<string>();
  let currentName = roleName;
  const aliasChain: string[] = [currentName];

  // Resolve alias chain
  while (true) {
    const roleDef = rolesConfig[currentName];
    if (!roleDef) {
      // Role not in config: assume it directly specifies a model name
      return { role: currentName, models: [currentName] };
    }

    if ("alias" in roleDef) {
      if (visitedAliases.has(currentName)) {
        aliasChain.push(roleDef.alias);
        throw new Error(
          `Role alias cycle detected: ${aliasChain.join(" -> ")}`
        );
      }
      visitedAliases.add(currentName);
      currentName = roleDef.alias;
      aliasChain.push(currentName);
    } else {
      break;
    }
  }

  const concreteDef = rolesConfig[currentName];
  if (!concreteDef || !("model" in concreteDef)) {
    return { role: currentName, models: [currentName] };
  }

  // Primary model
  const primaryModel = concreteDef.model;
  const models: string[] = [primaryModel];
  // One shared visited set across roles and models: every role name resolved
  // so far (including alias-chain names) plus every emitted model. Mutual
  // fallbacks (workhorse <-> alt-workhorse) terminate via this set, with no
  // recursion and no catch-all.
  const visited = new Set<string>([...aliasChain, primaryModel]);

  // Breadth-first fallback expansion. Alias cycles reached through fallbacks
  // throw (same as top-level resolution); fallback loops are cut by `visited`.
  const queue: string[] = [...(concreteDef.fallbacks ?? [])];
  while (queue.length > 0) {
    const fb = queue.shift()!;
    if (visited.has(fb)) continue;

    const def = rolesConfig[fb];
    if (!def) {
      // Direct model string
      visited.add(fb);
      models.push(fb);
      continue;
    }

    // Follow the alias chain to its canonical target (cycle => throw).
    const chain: string[] = [fb];
    const chainSeen = new Set<string>([fb]);
    let target = fb;
    let targetDef: RoleDefinition | undefined = def;
    while (targetDef && "alias" in targetDef) {
      target = targetDef.alias;
      chain.push(target);
      if (chainSeen.has(target)) {
        throw new Error(`Role alias cycle detected: ${chain.join(" -> ")}`);
      }
      chainSeen.add(target);
      targetDef = rolesConfig[target];
    }

    if (!targetDef || !("model" in targetDef)) {
      // Alias chain ends at a direct model id
      if (!visited.has(target)) {
        visited.add(target);
        models.push(target);
      }
      for (const name of chain) visited.add(name);
      continue;
    }
    if (visited.has(target)) {
      // Canonical role already expanded; remember the alias names and skip.
      for (const name of chain) visited.add(name);
      continue;
    }
    for (const name of chain) visited.add(name);
    if (!visited.has(targetDef.model)) {
      visited.add(targetDef.model);
      models.push(targetDef.model);
    }
    for (const next of targetDef.fallbacks ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return {
    role: currentName,
    models,
  };
}

export interface StepRoleSelectionParams {
  step: FlowStep;
  isEscalated?: boolean;
  fixRound?: number;
  baseProducerRole?: string;
  /**
   * The producer step's retryRole for this kind, or null/undefined when the
   * producer does not rotate on retry. The reviewer alt-swap only applies
   * when the producer really rotated.
   */
  producerRetryRole?: string | null;
  rolesConfig: Record<string, RoleDefinition>;
  agentsConfig?: Record<string, AgentConfig>;
}

/**
 * Step role selection function covering escalation (§12.4) and alt-on-retry pair swap (§12.4):
 * - Escalated items: if step.escalatable is true, role is "task-escalation"
 * - Alt on retry (fixRound >= 2):
 *   - Developer with retryRole runs `retryRole` (e.g. alt-workhorse)
 *   - When the producer really rotated (producerRetryRole set), reviewing steps
 *     resolving to the same primary model swap to the producer's base role (workhorse)
 */
export function resolveStepRole(params: StepRoleSelectionParams): ResolvedRole {
  const {
    step,
    isEscalated = false,
    fixRound = 1,
    baseProducerRole = "workhorse",
    producerRetryRole = null,
    rolesConfig,
    agentsConfig,
  } = params;

  // 1. Escalation: escalatable steps use task-escalation on escalated tasks/items
  if (isEscalated && step.escalatable) {
    if (rolesConfig["task-escalation"]) {
      return resolveRole("task-escalation", rolesConfig);
    }
  }

  // Determine standard role for this step
  const defaultAgentRole = agentsConfig?.[step.agent]?.role ?? step.agent;
  const configuredRole = step.role ?? defaultAgentRole;

  // 2. Producer step retry rotation (fixRound >= 2)
  if (fixRound >= 2 && step.retryRole) {
    return resolveRole(step.retryRole, rolesConfig);
  }

  // 3. Reviewer step pair-swap on retry rotation (fixRound >= 2)
  // Only when the producer really rotated: the caller passes the producer
  // step's actual retryRole (null when the producer has none). Assuming a
  // rotation that never happened would collapse the producer/reviewer split.
  if (fixRound >= 2 && !step.retryRole && producerRetryRole) {
    const devResolved = resolveRole(producerRetryRole, rolesConfig);
    const devPrimary = devResolved.models[0];

    const reviewerResolved = resolveRole(configuredRole, rolesConfig);
    const reviewerPrimary = reviewerResolved.models[0];

    // If reviewer resolves to the same primary model as the developer's rotated role,
    // swap the reviewer to the producer's base role
    if (devPrimary && reviewerPrimary && devPrimary === reviewerPrimary) {
      return resolveRole(baseProducerRole, rolesConfig);
    }
  }

  // 4. Default role
  return resolveRole(configuredRole, rolesConfig);
}

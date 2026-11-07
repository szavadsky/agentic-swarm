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
 * - Recursively expands fallbacks in order, deduplicating while preserving primary first
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
  const seenModels = new Set<string>([primaryModel]);

  // Recursively expand fallbacks
  function collectFallbacks(fallbacks?: string[], visitedRoles = new Set<string>()) {
    if (!fallbacks) return;
    for (const fb of fallbacks) {
      // fb could be a role name in rolesConfig or a direct model string
      if (rolesConfig[fb]) {
        if (visitedRoles.has(fb)) continue;
        visitedRoles.add(fb);

        // Resolve that role's models
        try {
          const resolved = resolveRole(fb, rolesConfig);
          for (const m of resolved.models) {
            if (!seenModels.has(m)) {
              seenModels.add(m);
              models.push(m);
            }
          }
        } catch {
          // If fallback has an alias cycle, ignore or skip to be resilient
        }
      } else {
        if (!seenModels.has(fb)) {
          seenModels.add(fb);
          models.push(fb);
        }
      }
    }
  }

  collectFallbacks(concreteDef.fallbacks, new Set([currentName]));

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
  producerRetryRole?: string;
  rolesConfig: Record<string, RoleDefinition>;
  agentsConfig?: Record<string, AgentConfig>;
}

/**
 * Step role selection function covering escalation (§12.4) and alt-on-retry pair swap (§12.4):
 * - Escalated items: if step.escalatable is true, role is "task-escalation"
 * - Alt on retry (fixRound >= 2):
 *   - Developer with retryRole runs `retryRole` (e.g. alt-workhorse)
 *   - Reviewing steps resolving to the same primary model swap to producer's base role (workhorse)
 */
export function resolveStepRole(params: StepRoleSelectionParams): ResolvedRole {
  const {
    step,
    isEscalated = false,
    fixRound = 1,
    baseProducerRole = "workhorse",
    producerRetryRole = "alt-workhorse",
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
  // If developer rotated to retryRole, check if this reviewing step shares that model
  if (fixRound >= 2) {
    const devRotatedRole = step.retryRole ? null : (producerRetryRole || "alt-workhorse");
    if (devRotatedRole) {
      const devResolved = resolveRole(devRotatedRole, rolesConfig);
      const devPrimary = devResolved.models[0];

      const reviewerResolved = resolveRole(configuredRole, rolesConfig);
      const reviewerPrimary = reviewerResolved.models[0];

      // If reviewer resolves to the same primary model as the developer's rotated role,
      // swap the reviewer to the producer's base role
      if (devPrimary && reviewerPrimary && devPrimary === reviewerPrimary) {
        return resolveRole(baseProducerRole, rolesConfig);
      }
    }
  }

  // 4. Default role
  return resolveRole(configuredRole, rolesConfig);
}

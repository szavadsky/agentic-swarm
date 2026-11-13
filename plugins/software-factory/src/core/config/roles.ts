/** A role is either a concrete model with fallbacks or an alias to another role. */
export type RoleDefinition =
  | { model: string; fallbacks?: string[] }
  | { alias: string };

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

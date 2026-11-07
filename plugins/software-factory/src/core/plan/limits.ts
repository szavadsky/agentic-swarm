import { validateSlug } from "../git/naming.js";
import { defaultSchemaCache } from "../records/schema-cache.js";
import type {
  PlanArtifact,
  PlanEditsArtifact,
  PipelineLimits,
  PlanItemOutline,
} from "../artifacts.js";

/**
 * Detects cycles in a dependency graph where each node maps to its dependency slugs.
 * Returns the cycle path as an array of slugs if a cycle exists, or null otherwise.
 */
function findCycle(graph: Map<string, string[]>): string[] | null {
  const visited = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];

  for (const node of graph.keys()) {
    if (visited.get(node) === "visited") continue;

    const cycle = dfs(node);
    if (cycle) return cycle;
  }

  function dfs(curr: string): string[] | null {
    visited.set(curr, "visiting");
    stack.push(curr);

    const neighbors = graph.get(curr) ?? [];
    for (const neighbor of neighbors) {
      if (!graph.has(neighbor)) continue; // Dependency outside this graph

      const state = visited.get(neighbor);
      if (state === "visiting") {
        const cycleStartIndex = stack.indexOf(neighbor);
        return [...stack.slice(cycleStartIndex), neighbor];
      }
      if (!state) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      }
    }

    stack.pop();
    visited.set(curr, "visited");
    return null;
  }

  return null;
}

/**
 * Validates a proposed architectural plan against pipeline limits, schema, and structural invariants (§8.4, §9).
 *
 * Rules:
 * - Conforms to plan.schema.json
 * - Milestones count <= limits.maxMilestones (default 8)
 * - Unique milestone IDs
 * - Total items/outlines <= limits.maxItemsPerPlan (default 50)
 * - Unique, valid slugs (per git/naming rules; reserved slugs like 'simple' forbidden)
 * - Kinds exist in allowed kinds list
 * - Referenced milestone IDs in item outlines exist
 * - Item outline dependencies are acyclic and cannot depend on self
 * - Epics permitted in root tasks only; epic slugs valid and unique
 */
export function validatePlan(
  plan: PlanArtifact,
  ctx: {
    limits: PipelineLimits;
    kinds: string[];
    isRootTask: boolean;
    existingItems: string[];
  }
): string[] {
  const errors: string[] = [];

  // 1. Schema validation
  try {
    const validator = defaultSchemaCache.getValidator("plan");
    const valid = validator(plan);
    if (!valid && validator.errors) {
      for (const err of validator.errors) {
        errors.push(`Schema error at ${err.instancePath || "/"}: ${err.message}`);
      }
    }
  } catch (err) {
    errors.push(`Plan schema validation error: ${(err as Error).message}`);
  }

  if (!plan || typeof plan !== "object") {
    return errors;
  }

  // 2. Milestones count & uniqueness
  const maxMilestones = ctx.limits?.maxMilestones ?? 8;
  const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];

  if (milestones.length === 0) {
    errors.push("Plan must contain at least one milestone");
  } else if (milestones.length > maxMilestones) {
    errors.push(
      `Plan exceeds maximum milestones limit of ${maxMilestones} (got ${milestones.length})`
    );
  }

  const seenMilestoneIds = new Set<string>();
  for (const m of milestones) {
    if (!m.id) {
      errors.push("Milestone must have a non-empty id");
      continue;
    }
    if (seenMilestoneIds.has(m.id)) {
      errors.push(`Duplicate milestone id: "${m.id}"`);
    } else {
      seenMilestoneIds.add(m.id);
    }
  }

  // 3. Item outlines count & limits
  const maxItems = ctx.limits?.maxItemsPerPlan ?? 50;
  const outlines: PlanItemOutline[] = Array.isArray(plan.itemOutlines)
    ? plan.itemOutlines
    : [];
  const existingCount = Array.isArray(ctx.existingItems) ? ctx.existingItems.length : 0;
  const totalItems = outlines.length + existingCount;

  if (totalItems > maxItems) {
    errors.push(
      `Plan exceeds maximum items limit of ${maxItems} (got ${totalItems})`
    );
  }

  // 4. Slugs uniqueness, format & kind validation
  const existingSlugs = new Set<string>(ctx.existingItems ?? []);
  const seenSlugs = new Set<string>();
  const outlineGraph = new Map<string, string[]>();

  for (const outline of outlines) {
    if (!outline.slug) {
      errors.push("Item outline must have a non-empty slug");
      continue;
    }

    if (!validateSlug(outline.slug)) {
      errors.push(`Invalid outline slug "${outline.slug}"`);
    }

    if (seenSlugs.has(outline.slug)) {
      errors.push(`Duplicate item outline slug: "${outline.slug}"`);
    } else if (existingSlugs.has(outline.slug)) {
      errors.push(`Item slug "${outline.slug}" already exists in task history`);
    } else {
      seenSlugs.add(outline.slug);
    }

    if (outline.kind && !ctx.kinds.includes(outline.kind)) {
      errors.push(
        `Unknown item kind "${outline.kind}" for outline "${outline.slug}"`
      );
    }

    if (outline.milestoneId && !seenMilestoneIds.has(outline.milestoneId)) {
      errors.push(
        `Outline "${outline.slug}" references unknown milestone "${outline.milestoneId}"`
      );
    }

    if (outline.deps && Array.isArray(outline.deps)) {
      if (outline.deps.includes(outline.slug)) {
        errors.push(`Outline "${outline.slug}" cannot depend on itself`);
      }
      outlineGraph.set(outline.slug, outline.deps);
    } else {
      outlineGraph.set(outline.slug, []);
    }
  }

  // Check outline deps existence & cycles
  for (const [slug, deps] of outlineGraph.entries()) {
    for (const dep of deps) {
      if (!seenSlugs.has(dep) && !existingSlugs.has(dep)) {
        errors.push(`Outline "${slug}" has unknown dependency "${dep}"`);
      }
    }
  }

  const outlineCycle = findCycle(outlineGraph);
  if (outlineCycle) {
    errors.push(
      `Circular dependency detected in plan outlines: ${outlineCycle.join(" -> ")}`
    );
  }

  // 5. Epics validation (root task only, valid and unique slugs)
  const epics = Array.isArray(plan.epics) ? plan.epics : [];
  if (epics.length > 0) {
    if (!ctx.isRootTask) {
      errors.push("Epics are only allowed in root task plans");
    }

    for (const epic of epics) {
      if (!epic.slug) {
        errors.push("Epic must have a non-empty slug");
        continue;
      }

      if (!validateSlug(epic.slug)) {
        errors.push(`Invalid epic slug "${epic.slug}"`);
      }

      if (seenSlugs.has(epic.slug)) {
        errors.push(`Duplicate slug "${epic.slug}" (collides with item outline)`);
      } else if (existingSlugs.has(epic.slug)) {
        errors.push(`Epic slug "${epic.slug}" already exists in task history`);
      } else {
        seenSlugs.add(epic.slug);
      }

      if (!epic.intent || !epic.intent.trim()) {
        errors.push(`Epic "${epic.slug}" must have non-empty intent text`);
      }
    }
  }

  return errors;
}

/**
 * Validates a proposed plan edits artifact produced by PM against plan, limits, and historical execution (§8.4, §9).
 *
 * Rules:
 * - Conforms to plan-edits.schema.json
 * - Matches plan iteration
 * - Amendment index <= limits.maxAmendmentsPerIteration
 * - Total items <= limits.maxItemsPerPlan
 * - Unique, valid slugs (no reserved 'simple', no '--')
 * - No collisions with existing items
 * - Kinds exist in allowed kinds list; epics allowed only in root task
 * - outlineRef must be specified and must exist in plan.itemOutlines
 * - Dependencies must be acyclic and strictly on earlier waves (dep.wave < item.wave)
 * - Dependencies cannot reference self and must exist in edits or existing items
 */
export function validateEdits(
  edits: PlanEditsArtifact,
  ctx: {
    plan: PlanArtifact;
    limits: PipelineLimits;
    kinds: string[];
    isRootTask: boolean;
    existing: { slug: string; status: string; wave?: string | number }[];
  }
): string[] {
  const errors: string[] = [];

  // 1. Schema validation
  try {
    const validator = defaultSchemaCache.getValidator("plan-edits");
    const valid = validator(edits);
    if (!valid && validator.errors) {
      for (const err of validator.errors) {
        errors.push(`Schema error at ${err.instancePath || "/"}: ${err.message}`);
      }
    }
  } catch (err) {
    errors.push(`Plan edits schema validation error: ${(err as Error).message}`);
  }

  if (!edits || typeof edits !== "object") {
    return errors;
  }

  // 2. Iteration match
  if (ctx.plan && edits.iteration !== ctx.plan.iteration) {
    errors.push(
      `Edits iteration (${edits.iteration}) does not match plan iteration (${ctx.plan.iteration})`
    );
  }

  // 3. Amendment limit
  if (
    edits.amendmentIndex !== undefined &&
    ctx.limits?.maxAmendmentsPerIteration !== undefined
  ) {
    if (edits.amendmentIndex > ctx.limits.maxAmendmentsPerIteration) {
      errors.push(
        `Amendment index ${edits.amendmentIndex} exceeds maximum allowed amendments per iteration (${ctx.limits.maxAmendmentsPerIteration})`
      );
    }
  }

  const items = Array.isArray(edits.items) ? edits.items : [];
  const existingList = Array.isArray(ctx.existing) ? ctx.existing : [];
  const existingMap = new Map(existingList.map((e) => [e.slug, e]));

  // 4. Total items limit
  const maxItems = ctx.limits?.maxItemsPerPlan ?? 50;
  const totalItems = items.length + existingList.length;
  if (totalItems > maxItems) {
    errors.push(
      `Total items (${totalItems}) exceeds maximum items limit of ${maxItems}`
    );
  }

  // Set of valid plan outline slugs
  const outlineSlugs = new Set<string>(
    (ctx.plan?.itemOutlines ?? []).map((o) => o.slug)
  );

  const seenSlugs = new Set<string>();
  const editsWaveMap = new Map<string, number>();
  const depGraph = new Map<string, string[]>();

  // Map existing waves
  const existingWaveMap = new Map<string, number>();
  for (const ex of existingList) {
    const w = ex.wave !== undefined ? Number(ex.wave) : 0;
    existingWaveMap.set(ex.slug, Number.isNaN(w) ? 0 : w);
  }

  // Pre-populate waves for all items in edits
  for (const item of items) {
    if (item.slug && item.wave !== undefined) {
      editsWaveMap.set(item.slug, item.wave);
    }
  }

  // 5. Item-level validation
  for (const item of items) {
    if (!item.slug) {
      errors.push("Item must have a non-empty slug");
      continue;
    }

    if (!validateSlug(item.slug)) {
      errors.push(`Invalid item slug "${item.slug}"`);
    }

    if (seenSlugs.has(item.slug)) {
      errors.push(`Duplicate item slug: "${item.slug}"`);
    } else if (existingMap.has(item.slug)) {
      const ex = existingMap.get(item.slug)!;
      errors.push(
        `Item slug "${item.slug}" already exists in task history with status "${ex.status}"`
      );
    } else {
      seenSlugs.add(item.slug);
    }

    // Kind validation
    if (!ctx.kinds.includes(item.kind)) {
      errors.push(`Unknown item kind "${item.kind}" for item "${item.slug}"`);
    }

    // Epics in root task only
    if (item.kind === "epic") {
      if (!ctx.isRootTask) {
        errors.push(`Epic item "${item.slug}" is only allowed in root tasks`);
      }
      const epicExistsInPlan = ctx.plan?.epics?.some(
        (e) => e.slug === item.slug || (item.outlineRef && e.slug === item.outlineRef)
      );
      if (!epicExistsInPlan) {
        errors.push(
          `Epic item "${item.slug}" has no corresponding epic definition in plan.epics`
        );
      }
    }

    // outlineRef exists
    if (!item.outlineRef) {
      errors.push(`Item "${item.slug}" is missing required outlineRef`);
    } else if (!outlineSlugs.has(item.outlineRef)) {
      errors.push(
        `Item "${item.slug}" references unknown outlineRef "${item.outlineRef}"`
      );
    }

    // Wave number validation
    if (item.wave === undefined || item.wave < 1) {
      errors.push(`Item "${item.slug}" must have wave >= 1 (got ${item.wave})`);
    }

    // Dependencies validation: acyclic and only on earlier waves
    if (item.deps && Array.isArray(item.deps)) {
      depGraph.set(item.slug, item.deps);

      for (const depSlug of item.deps) {
        if (depSlug === item.slug) {
          errors.push(`Item "${item.slug}" cannot depend on itself`);
          continue;
        }

        const inEdits = editsWaveMap.has(depSlug);
        const inExisting = existingMap.has(depSlug);

        if (!inEdits && !inExisting) {
          errors.push(
            `Item "${item.slug}" references unknown dependency "${depSlug}"`
          );
          continue;
        }

        const depWave = inEdits
          ? editsWaveMap.get(depSlug)!
          : existingWaveMap.get(depSlug)!;

        if (depWave >= item.wave) {
          errors.push(
            `Dependency "${depSlug}" (wave ${depWave}) must be in an earlier wave than item "${item.slug}" (wave ${item.wave})`
          );
        }
      }
    } else {
      depGraph.set(item.slug, []);
    }
  }

  // 6. Cycle detection across edits dependency graph
  const editsCycle = findCycle(depGraph);
  if (editsCycle) {
    errors.push(
      `Circular dependency detected in edits items: ${editsCycle.join(" -> ")}`
    );
  }

  return errors;
}

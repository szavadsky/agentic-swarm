import { formatSteerRoute, steerProvenance } from "../../mailbox.js";
import type { SteerRoute, TaskFile } from "../../types.js";
import type { SteerRouteEntry } from "../types.js";

/** What the task files a steer turn wrote may and may not claim. */
export function steerWriteFindings(
  routes: readonly SteerRouteEntry[],
  claimed: ReadonlySet<string>,
  routeOf: ReadonlyMap<string, SteerRoute>,
  taskSnapshot: Map<string, string>,
  texts: Map<string, string>,
  tasks: readonly TaskFile[],
): string[] {
  const changed = changedTaskSlugs(taskSnapshot, texts);
  const created = [...texts.keys()].filter((slug) => !taskSnapshot.has(slug));
  const bySlug = new Map(tasks.map((task) => [task.slug, task]));
  const createdTasks = created
    .map((slug) => bySlug.get(slug))
    .filter((task): task is TaskFile => task !== undefined);
  const createdProvenance = new Set(
    createdTasks
      .map((task) => steerProvenance(task.source))
      .filter((id): id is string => id !== undefined),
  );
  return [
    ...createdTaskProvenanceFindings(createdTasks, claimed, routeOf),
    ...spikeTaskFindings(routes, claimed, createdProvenance),
    ...taskSteerFindings(routes, claimed, createdProvenance, changed, created),
  ];
}

function changedTaskSlugs(
  taskSnapshot: Map<string, string>,
  texts: Map<string, string>,
): string[] {
  return [...taskSnapshot]
    .filter(
      ([slug, original]) => texts.has(slug) && texts.get(slug) !== original,
    )
    .map(([slug]) => slug);
}

/** A created task names a claimed steer, routed task or spike. */
function createdTaskProvenanceFindings(
  createdTasks: readonly TaskFile[],
  claimed: ReadonlySet<string>,
  routeOf: ReadonlyMap<string, SteerRoute>,
): string[] {
  const findings: string[] = [];
  for (const task of createdTasks) {
    const provenance = steerProvenance(task.source);
    if (!provenance) {
      findings.push(
        `new task "${task.slug}" has no provenance steer: <id>; a steer creates tasks only with source steer: <claimed>`,
      );
      continue;
    }
    if (!claimed.has(provenance)) {
      findings.push(
        `new task "${task.slug}" names unknown steer "${provenance}"; provenance must be a claimed steer`,
      );
      continue;
    }
    const route = routeOf.get(provenance);
    if (route !== "task" && route !== "spike") {
      const routed = route === undefined ? "none" : formatSteerRoute(route);
      findings.push(
        `new task "${task.slug}" names steer "${provenance}" routed ${routed}; only task and spike steers create tasks`,
      );
    }
  }
  return findings;
}

/** A spike steer writes exactly one task carrying its provenance. */
function spikeTaskFindings(
  routes: readonly SteerRouteEntry[],
  claimed: ReadonlySet<string>,
  createdProvenance: ReadonlySet<string>,
): string[] {
  const findings: string[] = [];
  for (const entry of routes) {
    if (!claimed.has(entry.steer) || entry.route !== "spike") continue;
    if (!createdProvenance.has(entry.steer)) {
      findings.push(
        `spike steer "${entry.steer}" created no task; a spike writes one standalone task with source steer: ${entry.steer}`,
      );
    }
  }
  return findings;
}

/** A task steer changes a file; other routes change none. */
function taskSteerFindings(
  routes: readonly SteerRouteEntry[],
  claimed: ReadonlySet<string>,
  createdProvenance: ReadonlySet<string>,
  changed: readonly string[],
  created: readonly string[],
): string[] {
  const hasTask = routes.some(
    (entry) => claimed.has(entry.steer) && entry.route === "task",
  );
  const hasSpike = routes.some(
    (entry) => claimed.has(entry.steer) && entry.route === "spike",
  );
  if (hasTask) {
    const taskProvenance = new Set(
      routes
        .filter((entry) => claimed.has(entry.steer) && entry.route === "task")
        .map((entry) => entry.steer),
    );
    const rework = [...createdProvenance].some((id) => taskProvenance.has(id));
    if (changed.length === 0 && !rework) {
      return [
        "task steers changed no task file; amend the pending task or write a rework task with source steer: <id>",
      ];
    }
  }
  if (!hasTask && !hasSpike && (changed.length > 0 || created.length > 0)) {
    return [
      "task files changed but no steer routed to task or spike; intent, architect and stall steers write no task file",
    ];
  }
  return [];
}

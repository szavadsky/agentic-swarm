import { parseTaskFile } from "../../tasks.js";
import type {
  KernelRuntime,
  PlanCheckFollowUp,
  PlanCheckRouteEntry,
  State,
  TaskFile,
  TaskTypeDefinition,
} from "../../types.js";

interface DepFix {
  depFixed: Set<string>;
  findings: string[];
}

/**
 * A missing-dep follow-up may drop its dead deps from its own slug: the one
 * edit besides an amend a plan-check turn may make.
 */
export function depFixFindings(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State },
  taskSnapshot: Map<string, string>,
  texts: Map<string, string>,
  followUpOf: ReadonlyMap<string, PlanCheckFollowUp>,
): DepFix {
  const depFixed = new Set<string>();
  const findings: string[] = [];
  for (const [slug, original] of taskSnapshot) {
    const now = texts.get(slug);
    if (now === undefined || now === original) continue;
    const followUp = followUpOf.get(slug);
    if (
      followUp?.kind !== "missing-dep" ||
      !onlyDepsChanged(original, now, slug, runtime.configs.process.taskTypes)
    ) {
      continue;
    }
    const before = parseTaskFile(
      original,
      slug,
      runtime.configs.process.taskTypes,
    );
    const after = parseTaskFile(now, slug, runtime.configs.process.taskTypes);
    const dropped = before.deps.filter((dep) => !after.deps.includes(dep));
    const added = after.deps.filter((dep) => !before.deps.includes(dep));
    if (added.length > 0) {
      findings.push(
        `task "${slug}" adds dependencies (${added.join(", ")}); a missing-dep follow-up drops dead deps only`,
      );
      continue;
    }
    const live = dropped.filter(
      (dep) =>
        taskSnapshot.has(dep) && opts.state.tasks[dep]?.status !== "cancelled",
    );
    if (live.length > 0) {
      findings.push(
        `task "${slug}" drops live dependencies (${live.join(", ")}); only deps on missing or cancelled tasks go`,
      );
      continue;
    }
    depFixed.add(slug);
  }
  return { depFixed, findings };
}

/** A leave route writes nothing whatever the checker asked for. */

/**
 * A missing-dep follow-up may also write the dead dep as a new task carrying
 * its name; that task claims the blocked slug it unblocks.
 */
export function depRewriteFindings(
  created: readonly string[],
  followUps: readonly PlanCheckFollowUp[],
  actionOf: ReadonlyMap<string, PlanCheckRouteEntry["action"]>,
  credits: Map<string, string[]>,
): { depRewrites: Set<string>; findings: string[] } {
  const depRewrites = new Set<string>();
  const findings: string[] = [];
  for (const slug of created) {
    const depClaim = followUps.find(
      (item) => item.kind === "missing-dep" && item.dep === slug,
    );
    if (!depClaim) continue;
    depRewrites.add(slug);
    if (actionOf.get(depClaim.slug) !== "continue") {
      findings.push(
        `new task "${slug}" rewrites the dead dep of "${depClaim.slug}", which was left for the architect`,
      );
      continue;
    }
    addCredit(credits, depClaim.slug, slug);
  }
  return { depRewrites, findings };
}

export function addCredit(
  credits: Map<string, string[]>,
  slug: string,
  by: string,
): void {
  const list = credits.get(slug) ?? [];
  list.push(by);
  credits.set(slug, list);
}

/**
 * Whether two task texts differ only in their dependency list. An
 * unparseable side is not a dep fix: the caller reports the edit as is.
 */
function onlyDepsChanged(
  before: string,
  after: string,
  slug: string,
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): boolean {
  let oldTask: TaskFile;
  let newTask: TaskFile;
  try {
    oldTask = parseTaskFile(before, slug, taskTypes);
    newTask = parseTaskFile(after, slug, taskTypes);
  } catch {
    return false;
  }
  const { deps: _oldDeps, ...oldRest } = oldTask;
  const { deps: _newDeps, ...newRest } = newTask;
  return (
    JSON.stringify(oldRest) === JSON.stringify(newRest) &&
    JSON.stringify([...oldTask.deps].sort()) !==
      JSON.stringify([...newTask.deps].sort())
  );
}

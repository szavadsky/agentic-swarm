import fs from "node:fs";
import path from "node:path";
import { type EpicRow, parseArchitectRegister } from "./register.js";

/**
 * One architect's plan scope: the goal's own plan, or one epic's. The register
 * maps every active epic to a plan; this module is the only place a plan path
 * is built, so no consumer hardcodes `plan.md`.
 */
export type PlanScope = { kind: "goal" } | { kind: "epic"; epic: string };

export interface PlanFile {
  scope: PlanScope;
  /** Goal-relative path: `plan.md` for the goal, `epics/<epic>.md` for an epic. */
  rel: string;
  /** Absolute path under the goal directory. */
  path: string;
}

/** The goal's own plan, relative path and absolute path. */
export function goalPlan(goalDir: string): PlanFile {
  return resolvePlan(goalDir, { kind: "goal" });
}

/** Maps a scope to its plan file; an epic's plan is always `epics/<epic>.md`. */
export function resolvePlan(goalDir: string, scope: PlanScope): PlanFile {
  const rel = scope.kind === "goal" ? "plan.md" : `epics/${scope.epic}.md`;
  return { scope, rel, path: path.join(goalDir, rel) };
}

function activePlans(goalDir: string, epics: readonly EpicRow[]): PlanFile[] {
  const plans = [goalPlan(goalDir)];
  const seen = new Set([plans[0]!.rel]);
  for (const row of epics) {
    // Closed epics are history and a main-owned epic plans in `plan.md`.
    if (row.closed !== undefined || row.architect !== "subarchitect") continue;
    const plan = resolvePlan(goalDir, { kind: "epic", epic: row.epic });
    if (seen.has(plan.rel)) continue;
    seen.add(plan.rel);
    plans.push(plan);
  }
  return plans;
}

/**
 * Every plan the goal's register names, the goal plan first. A goal without a
 * register (depth 1, or before the first architect turn) has only its own
 * plan. Read-only: this resolves paths, never creates a file.
 */
export function registeredPlans(goalDir: string): PlanFile[] {
  const goal = goalPlan(goalDir);
  if (!fs.existsSync(goal.path)) return [goal];
  const parsed = parseArchitectRegister(fs.readFileSync(goal.path, "utf8"), {
    depth: 2,
    tasks: [],
    // Resolution reports no findings; an absent plan is simply not derivable.
    exists: () => true,
  });
  return activePlans(goalDir, parsed.epics);
}

/** The plans that exist on disk, in register order. */
export function existingPlans(plans: readonly PlanFile[]): PlanFile[] {
  return plans.filter((plan) => fs.existsSync(plan.path));
}

/**
 * Every plan file on disk: `plan.md` first, then every `epics/*.md`. This is
 * the ownership view, not the register view: a consult snapshots it so a
 * subarchitect that writes a foreign plan (or the main that writes an epic
 * plan) is rolled back even when the register does not name that file.
 */
export function planFilesOnDisk(goalDir: string): PlanFile[] {
  const plans = [goalPlan(goalDir)];
  let names: string[];
  try {
    names = fs.readdirSync(path.join(goalDir, "epics"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return plans;
    throw err;
  }
  for (const name of names.sort()) {
    if (!name.endsWith(".md")) continue;
    plans.push(resolvePlan(goalDir, { kind: "epic", epic: name.slice(0, -3) }));
  }
  return plans;
}

/** Whether a goal-relative path is an architect plan: `plan.md` or `epics/<epic>.md`. */
export function isPlanPath(rel: string): boolean {
  return rel === "plan.md" || /^epics\/[a-z0-9-]+\.md$/.test(rel);
}

/** A top-level task bullet: `- <slug> — ...`; the em dash is the plan's. */
const TASK_BULLET = /^-\s+(\S+)\s+—/u;

export interface PlanBullet {
  slug: string;
  /** 1-based line of the bullet's first line. */
  line: number;
  /**
   * The bullet's own lines as written: its top-level line plus every indented
   * line that follows it. Prose, headings and the next top-level line end it.
   */
  text: string;
}

/**
 * The task bullets one plan carries, by slug. Prose mentions and nested
 * bullets (`  - done: …`) name no task, so a rule about "the bullet" reads the
 * same lines the plan-checker's slug scan does.
 */
export function planBullets(text: string): Map<string, PlanBullet> {
  const bullets = new Map<string, PlanBullet>();
  let open: { slug: string; line: number; lines: string[] } | undefined;
  const emit = (): void => {
    if (open) {
      bullets.set(open.slug, {
        slug: open.slug,
        line: open.line,
        text: open.lines.join("\n"),
      });
    }
  };
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = TASK_BULLET.exec(line);
    if (match) {
      open = { slug: match[1]!, line: index + 1, lines: [line] };
      emit();
      continue;
    }
    if (!open) continue;
    if (line.trim() === "" || /^\s+\S/u.test(line)) {
      open.lines.push(line);
      emit();
      continue;
    }
    open = undefined;
  }
  return bullets;
}

/**
 * The plan's explicit leave decisions: a line `cancelled: <slug> — reason`.
 * Absence of a bullet says nothing, so no cancellation is ever inferred from
 * the plan mentioning a task less. A line without the em dash and a reason is
 * prose, not a decision.
 */
export function planCancellations(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*cancelled:\s+(\S+)\s+—\s*(\S.*?)\s*$/u.exec(line);
    if (match) out.set(match[1]!, match[2]!);
  }
  return out;
}

/**
 * A nested list item per plan for a prompt: `- goal: <abs>` or
 * ``- epic `auth`: <abs>``. The continuation indent keeps every line inside the
 * turn block's list item when the template supplies the first line's indent.
 */
export function formatPlanList(plans: readonly PlanFile[]): string {
  if (plans.length === 0) return "- none";
  return plans
    .map((plan) =>
      plan.scope.kind === "goal"
        ? `- goal: ${plan.path}`
        : `- epic \`${plan.scope.epic}\`: ${plan.path}`,
    )
    .join("\n  ");
}

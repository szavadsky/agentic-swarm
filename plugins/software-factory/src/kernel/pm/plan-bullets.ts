/**
 * The plan-bullet baseline: the text a derive turn wrote task files from, kept
 * so a later architect edit to an open task's bullet is visible instead of
 * silently dropped. Task files are immutable outside amend, so the edit can
 * only be answered in the plan.
 */
import type { SessionRef } from "../../harness/types.js";
import { planBullets, planCancellations } from "../plan-file.js";
import {
  type KernelRuntime,
  normalizeSlug,
  type PlanReviewFinding,
  type State,
  type TaskFile,
  type TaskStatus,
} from "../types.js";
import { pmScopeKey } from "./scope.js";
import type { PmScope } from "./types.js";

/** The iteration file a derive turn writes its plan texts to. */
const PLAN_BULLET_FILE = "plan-bullets.json";

/** One plan's current text. Only plans a derive turn reads are baselined. */
interface PlanText {
  /** Goal-relative path: `plan.md` or `epics/<epic>.md`. */
  rel: string;
  text: string;
}

/** Per plan, the bullet block each slug was derived from, the plan text and the session. */
interface BulletBaseline {
  plans: Record<string, Record<string, string>>;
  texts?: Record<string, string>;
  /** The goal PM's session, kept for baselines written before per-scope sessions. */
  session?: SessionRef;
  /** One compacted session per PM scope: the epic name, empty for the goal. */
  sessions?: Record<string, SessionRef>;
}

/** A task file that exists; a terminal `status` makes its bullet history. */
interface OpenTask {
  slug: string;
  status?: TaskStatus;
}

/** An open task's bullet no longer matches the text its file was derived from. */
interface BulletEdit {
  slug: string;
  /** The plan that carries the bullet now; the baseline plan when it is gone. */
  plan: string;
  /** The plan the derived bullet lived in. */
  baselinePlan: string;
  /** The derived bullet block, kept until the architect acts. */
  before: string;
  missing: boolean;
  /** The current bullet's line, when it is still in a plan. */
  line?: number;
}

function history(status: TaskStatus): boolean {
  return status === "merged" || status === "finished" || status === "cancelled";
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Every open task file, with the state a terminal status would hide it. */
function openTasks(tasks: readonly TaskFile[], state: State): OpenTask[] {
  return tasks.map((task) => ({
    slug: task.slug,
    status: state.tasks[task.slug]?.status,
  }));
}

/** Every task file that existed before a turn, by the status it derives to. */
export function openTaskTexts(
  texts: ReadonlyMap<string, string>,
  state: State,
): OpenTask[] {
  return [...texts.keys()].map((slug) => ({
    slug,
    status: state.tasks[slug]?.status,
  }));
}

/** Every plan on disk, by goal-relative path: the ownership view for lookup. */
async function readPlanTexts(runtime: KernelRuntime): Promise<PlanText[]> {
  const out: PlanText[] = [];
  for (const plan of runtime.store.plans.filesOnDisk()) {
    const text = await runtime.store.plans.read(plan.scope);
    if (text !== null) out.push({ rel: plan.rel, text });
  }
  return out;
}

function currentBullets(
  plans: readonly PlanText[],
): Map<string, { rel: string; text: string; line: number }> {
  const out = new Map<string, { rel: string; text: string; line: number }>();
  for (const plan of plans) {
    for (const [slug, bullet] of planBullets(plan.text)) {
      if (out.has(slug)) continue;
      out.set(slug, { rel: plan.rel, text: bullet.text, line: bullet.line });
    }
  }
  return out;
}

function baselineBullet(
  baseline: BulletBaseline,
  slug: string,
): { rel: string; text: string } | undefined {
  for (const rel of Object.keys(baseline.plans).sort()) {
    const text = baseline.plans[rel]?.[slug];
    if (text !== undefined) return { rel, text };
  }
  return undefined;
}

/**
 * The open tasks whose bullet changed since the baseline: the in-place edits a
 * task file cannot carry. New bullets have no baseline entry, terminal tasks
 * are history, and a plan `cancelled:` line is the sanctioned leave, so none
 * of those is an edit.
 */
function bulletEdits(
  plans: readonly PlanText[],
  tasks: readonly OpenTask[],
  baseline: BulletBaseline | null,
): BulletEdit[] {
  if (!baseline) return [];
  const current = currentBullets(plans);
  const cancelled = new Set(
    plans.flatMap((plan) => [...planCancellations(plan.text).keys()]),
  );
  const edits: BulletEdit[] = [];
  for (const task of tasks) {
    if (task.status !== undefined && history(task.status)) continue;
    if (cancelled.has(task.slug)) continue;
    const before = baselineBullet(baseline, task.slug);
    if (!before) continue;
    const now = current.get(task.slug);
    if (now === undefined) {
      edits.push({
        slug: task.slug,
        plan: before.rel,
        baselinePlan: before.rel,
        before: before.text,
        missing: true,
      });
    } else if (normalize(now.text) !== normalize(before.text)) {
      edits.push({
        slug: task.slug,
        plan: now.rel,
        baselinePlan: before.rel,
        before: before.text,
        missing: false,
        line: now.line,
      });
    }
  }
  return edits.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** The plan-return findings the kernel raises for those edits. */
function bulletEditFindings(edits: readonly BulletEdit[]): PlanReviewFinding[] {
  return edits.map((edit) => ({
    planLine: edit.missing
      ? `${edit.plan} (removed bullet "${edit.slug}")`
      : `${edit.plan}:${edit.line} (${edit.slug})`,
    finding: `${
      edit.missing
        ? `task "${edit.slug}" bullet was removed from ${edit.plan}`
        : `task "${edit.slug}" bullet was edited in place`
    } while its task file is open; task file is immutable outside amend; cancel and re-slug, or continue via \`base\``,
  }));
}

/** A merged task's bullet collapsed to its one line: `<slug> — merged`. */
const COLLAPSED_MERGED_BULLET = /^-\s+\S+\s+—\s+merged\.?$/iu;

/** Whether a merged bullet is already the one line the plan keeps. */
function collapsedMergedBullet(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.length === 1 && COLLAPSED_MERGED_BULLET.test(lines[0]!.trim());
}

/**
 * The merged task bullets one plan still carries in full. A merged bullet's
 * history lives in the records; the plan keeps only its one-line collapse.
 */
export function staleMergedFindings(
  planRel: string,
  text: string,
  merged: ReadonlySet<string>,
): PlanReviewFinding[] {
  const findings: PlanReviewFinding[] = [];
  for (const [raw, bullet] of planBullets(text)) {
    const slug = normalizeSlug(raw);
    if (!merged.has(slug) || collapsedMergedBullet(bullet.text)) continue;
    findings.push({
      planLine: `${planRel}:${bullet.line} (${slug})`,
      finding: `merged task "${slug}" is still carried in full; collapse it to the one line \`- ${slug} — merged.\` and keep its what and done-when in the records`,
    });
  }
  return findings;
}

/**
 * The kernel findings a plan review carries for the current plan texts: an
 * open bullet edited in place, and a merged bullet still carried in full. A
 * `plan` rel narrows them to one plan; absent covers every plan.
 */
export async function planBulletEditFindings(
  runtime: KernelRuntime,
  tasks: readonly TaskFile[],
  state: State,
  plan?: string,
): Promise<PlanReviewFinding[]> {
  const current = openTasks(tasks, state);
  const plans = await readPlanTexts(runtime);
  const edits = bulletEdits(
    plans,
    current,
    await latestBulletBaseline(runtime),
  );
  const merged = new Set(
    current.filter((task) => task.status === "merged").map((task) => task.slug),
  );
  const narrowed =
    plan === undefined ? plans : plans.filter((p) => p.rel === plan);
  return [
    ...bulletEditFindings(
      plan === undefined ? edits : edits.filter((edit) => edit.plan === plan),
    ),
    ...narrowed.flatMap((p) => staleMergedFindings(p.rel, p.text, merged)),
  ];
}

function parseBaseline(text: string): BulletBaseline {
  const raw: unknown = JSON.parse(text);
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("plans" in raw) ||
    typeof raw.plans !== "object" ||
    raw.plans === null
  ) {
    throw new Error(`${PLAN_BULLET_FILE}: expected an object with plans`);
  }
  return raw as BulletBaseline;
}

function iterationNumbers(names: readonly string[]): number[] {
  return names
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .sort((a, b) => b - a);
}

/** The newest baseline; null before the first derive turn wrote one. */
async function latestBulletBaseline(
  runtime: KernelRuntime,
): Promise<BulletBaseline | null> {
  for (const iteration of iterationNumbers(
    await runtime.store.listDir("iterations"),
  )) {
    const text = await runtime.store.iterations.read(
      iteration,
      PLAN_BULLET_FILE,
    );
    if (text !== null) return parseBaseline(text);
  }
  return null;
}

/** A baseline's plan texts; an older baseline without them rebuilds from bullets. */
function baselinePlans(baseline: BulletBaseline): PlanText[] {
  if (baseline.texts) {
    return Object.entries(baseline.texts).map(([rel, text]) => ({ rel, text }));
  }
  return Object.keys(baseline.plans)
    .sort()
    .map((rel) => ({
      rel,
      text: Object.values(baseline.plans[rel] ?? {}).join("\n"),
    }));
}

/**
 * The plans the newest derive turn at or before `currentIteration` wrote task files
 * from, with that iteration, or null when no earlier derive turn exists.
 */
export async function previousPlanBaseline(
  runtime: KernelRuntime,
  currentIteration: number,
): Promise<{
  iteration: number;
  plans: PlanText[];
  session?: SessionRef;
  sessions?: Record<string, SessionRef>;
} | null> {
  for (const iteration of iterationNumbers(
    await runtime.store.listDir("iterations"),
  )) {
    if (iteration > currentIteration) continue;
    const text = await runtime.store.iterations.read(
      iteration,
      PLAN_BULLET_FILE,
    );
    if (text === null) continue;
    const baseline = parseBaseline(text);
    return {
      iteration,
      plans: baselinePlans(baseline),
      ...(baseline.session ? { session: baseline.session } : {}),
      ...(baseline.sessions ? { sessions: baseline.sessions } : {}),
    };
  }
  return null;
}

function sortedEntries(
  entries: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const slug of Object.keys(entries).sort()) out[slug] = entries[slug]!;
  return out;
}

/** One plan's entries: current text, except a drifted slug keeps its old text. */
function planEntries(
  plan: PlanText,
  keep: ReadonlyMap<string, { rel: string; text: string }>,
  previous: BulletBaseline | null,
): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [slug, bullet] of planBullets(plan.text)) {
    const kept = keep.get(slug);
    // A drifted bullet keeps its old text in its old plan, so the finding
    // stands until the architect cancels, re-slugs or reverts it.
    if (kept && kept.rel !== plan.rel) continue;
    entries[slug] = kept ? kept.text : bullet.text;
  }
  for (const [slug, text] of Object.entries(previous?.plans[plan.rel] ?? {})) {
    if (entries[slug] !== undefined) continue;
    if (keep.get(slug)?.rel === plan.rel) entries[slug] = text;
  }
  return sortedEntries(entries);
}

function baselineOf(
  plans: readonly PlanText[],
  keep: ReadonlyMap<string, { rel: string; text: string }>,
  previous: BulletBaseline | null,
): BulletBaseline {
  const out: BulletBaseline = { plans: {} };
  for (const plan of [...plans].sort((a, b) => a.rel.localeCompare(b.rel))) {
    out.plans[plan.rel] = planEntries(plan, keep, previous);
  }
  return out;
}

/**
 * Stores the bullets this derive turn wrote task files from. A drifted slug
 * keeps its earlier text: the finding must survive until the architect acts,
 * and a second derive must not absorb the edit it could not apply.
 */
export async function storePlanBulletBaseline(
  runtime: KernelRuntime,
  iteration: number,
  plans: readonly PlanText[],
  tasks: readonly OpenTask[],
  session?: SessionRef,
  scope: PmScope = { kind: "goal" },
): Promise<void> {
  const previous = await latestBulletBaseline(runtime);
  const keep = new Map(
    bulletEdits(plans, tasks, previous).map((edit) => [
      edit.slug,
      { rel: edit.baselinePlan, text: edit.before },
    ]),
  );
  // One saga runs one PM per epic plus the top, so each PM updates only its
  // own plan's bullets and session; the other scopes' entries are preserved.
  const baseline = mergeBaseline(
    runtime,
    previous,
    baselineOf(plans, keep, previous),
    plans,
    session,
    scope,
  );
  await runtime.store.iterations.write(
    iteration,
    PLAN_BULLET_FILE,
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
}

/** This scope's fresh entries merged over the previous baseline, pruned to plans on disk. */
function mergeBaseline(
  runtime: KernelRuntime,
  previous: BulletBaseline | null,
  fresh: BulletBaseline,
  plans: readonly PlanText[],
  session: SessionRef | undefined,
  scope: PmScope,
): BulletBaseline {
  const onDisk = new Set(
    runtime.store.plans.filesOnDisk().map((plan) => plan.rel),
  );
  const kept = <T>(entries: Record<string, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [rel, value] of Object.entries(entries)) {
      if (onDisk.has(rel)) out[rel] = value;
    }
    return out;
  };
  const merged: BulletBaseline = {
    plans: { ...kept(previous?.plans ?? {}), ...fresh.plans },
  };
  const texts = {
    ...kept(previous?.texts ?? {}),
    ...Object.fromEntries(plans.map((plan) => [plan.rel, plan.text])),
  };
  if (Object.keys(texts).length > 0) merged.texts = texts;
  const sessions = { ...(previous?.sessions ?? {}) };
  if (session) sessions[pmScopeKey(scope)] = session;
  if (Object.keys(sessions).length > 0) merged.sessions = sessions;
  const goalSession = sessions[""];
  if (goalSession) merged.session = goalSession;
  return merged;
}

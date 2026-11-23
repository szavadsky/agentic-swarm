import { makeCause } from "../cause.js";
import { PLAN_CHECK_STEP } from "../plan-check.js";
import { appendCancel } from "../record.js";
import { doneWhen } from "../task-material.js";
import { parseTaskFile } from "../tasks.js";
import type {
  KernelRuntime,
  PlanCheckFollowUp,
  StallDecision,
  State,
  StepRecord,
  TaskFile,
  TaskTypeDefinition,
} from "../types.js";
import { PLAN_CHECK_ROUTES_STEP, STALL_ROUTES_STEP } from "./steps.js";

/**
 * Amends one iteration has already spent per slug: an accepted stall route or
 * a plan-check `continue` on the checker's amend follow-up. A failed turn's
 * routes are rolled back, so only committed decisions count.
 */
export function amendsUsed(
  records: readonly StepRecord[],
  iteration: number,
): Map<string, number> {
  const used = new Map<string, number>();
  let kinds = new Map<string, PlanCheckFollowUp["kind"]>();
  for (const rec of [...records].sort((a, b) => a.seq - b.seq)) {
    if (!rec.endedAt || rec.iteration !== iteration) continue;
    if (rec.step === PLAN_CHECK_STEP) {
      kinds = followUpKinds(rec);
      continue;
    }
    spendCommitted(rec, kinds, used);
  }
  return used;
}

function followUpKinds(
  rec: StepRecord,
): Map<string, PlanCheckFollowUp["kind"]> {
  return new Map(
    (rec.outcome?.planCheck?.followUps ?? []).map((item) => [
      item.slug,
      item.kind,
    ]),
  );
}

/** A committed continue/amend or stall amend spends one amend for its slug. */
function spendCommitted(
  rec: StepRecord,
  kinds: ReadonlyMap<string, PlanCheckFollowUp["kind"]>,
  used: Map<string, number>,
): void {
  const spend = (slug: string): void => {
    used.set(slug, (used.get(slug) ?? 0) + 1);
  };
  if (rec.step === PLAN_CHECK_ROUTES_STEP) {
    for (const entry of rec.outcome?.planCheckRoutes ?? []) {
      if (entry.action === "continue" && kinds.get(entry.slug) === "amend") {
        spend(entry.slug);
      }
    }
  } else if (rec.step === STALL_ROUTES_STEP) {
    for (const entry of rec.outcome?.stallRoutes ?? []) {
      if (entry.action === "amend") spend(entry.slug);
    }
  }
}

/**
 * How the checker's follow-up kind maps onto the decider's vocabulary: an
 * unmerged park still continues as a task, and a dead dep is the mechanical
 * fix a replace carries.
 */
export function planCheckDecision(
  kind: PlanCheckFollowUp["kind"],
): StallDecision {
  return kind === "missing-dep" || kind === "unmerged" ? "replace" : kind;
}
/** The revision a task file declares, or undefined when it does not parse. */
function declaredRevision(
  text: string | undefined,
  slug: string,
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): number | undefined {
  if (text === undefined) return undefined;
  try {
    return parseTaskFile(text, slug, taskTypes).revision;
  } catch {
    return undefined;
  }
}
interface DecisionInput {
  turn: "stall" | "plan-check";
  slugs: string[];
  decisionOf: ReadonlyMap<string, StallDecision>;
  state: State;
  before: ReadonlyMap<string, string>;
  texts: ReadonlyMap<string, string>;
  bySlug: ReadonlyMap<string, TaskFile>;
  taskTypes: Record<string, TaskTypeDefinition> | undefined;
  created: readonly TaskFile[];
  /**
   * Claims a mechanical fix already made, by slug: a dead-dep drop on the
   * blocked task, or the new task that carries the dead dep's name.
   */
  credits: ReadonlyMap<string, readonly string[]>;
  /** Slugs whose file edit a credit owns: the dead-dep drop. */
  fixed: ReadonlySet<string>;
  /** Amends this iteration already spent, per slug. */
  amendsUsed: ReadonlyMap<string, number>;
  /** `limits.parkAmends`: amends one slug may spend per iteration. */
  parkAmends: number;
}

/**
 * One PM turn's decisions over its slugs, checked against the task files the
 * turn left. `amend` edits the slug's own file and bumps its revision;
 * `cancel` and `leave` write nothing; `replace` writes exactly one task that
 * continues the kept branch (or, when that branch conflicts with the head, a
 * fresh task keeping the same done-when); `split` writes at least two, each
 * naming the slug as its base. The kernel owns the consequences the files
 * cannot carry: the cancel record, and derive's cut at the park a revision
 * amended past.
 */
export function decisionFindings(input: DecisionInput): string[] {
  const overBound = new Set<string>();
  const findings = [
    ...boundDecisionFindings(input, overBound),
    ...editDecisionFindings(input),
    ...unchangedAmendFindings(input, overBound),
  ];
  const claimedBy = new Map<string, string[]>();
  findings.push(...createdTaskFindings(input, claimedBy));
  findings.push(...claimFindings(input, claimedBy));
  return findings;
}

/** A frozen or spent slug cannot be amended or cancelled again. */
function boundDecisionFindings(
  input: DecisionInput,
  overBound: Set<string>,
): string[] {
  const findings: string[] = [];
  for (const slug of input.slugs) {
    const decision = input.decisionOf.get(slug);
    if (decision !== "amend" && decision !== "cancel") continue;
    const status = input.state.tasks[slug]?.status;
    if (
      status === "merged" ||
      status === "finished" ||
      status === "cancelled"
    ) {
      findings.push(
        `slug "${slug}" is ${status}; ${decision} is refused: merged or finished work is history and a cancelled slug is spent`,
      );
    }
    if (decision === "amend") {
      findings.push(...amendBudgetFindings(input, slug, overBound));
    }
  }
  return findings;
}

/** An amend past `limits.parkAmends` is refused for that slug. */
function amendBudgetFindings(
  input: DecisionInput,
  slug: string,
  overBound: Set<string>,
): string[] {
  const used = input.amendsUsed.get(slug) ?? 0;
  if (used < input.parkAmends) return [];
  overBound.add(slug);
  return [
    `slug "${slug}" already spent ${used} of ${input.parkAmends} amend(s) this iteration (limits.parkAmends); amend is refused: leave it for the architect, or replace, split or cancel it`,
  ];
}

/** Only an amend may edit a task file, and it must bump its revision. */
function editDecisionFindings(input: DecisionInput): string[] {
  const findings: string[] = [];
  for (const [slug, original] of input.before) {
    const problem = taskEditProblem(input, slug, original);
    if (problem) findings.push(problem);
  }
  return findings;
}

function taskEditProblem(
  input: DecisionInput,
  slug: string,
  original: string,
): string | undefined {
  if (input.texts.get(slug) === original) return undefined;
  if (input.fixed.has(slug)) return undefined;
  const decision = input.decisionOf.get(slug);
  if (decision === undefined) {
    return `task "${slug}" was edited; a ${input.turn} turn never edits a slug it does not amend`;
  }
  if (decision !== "amend") {
    return `task "${slug}" was edited; a ${input.turn} turn never edits a slug it does not amend, and ${decision} keeps this file as it was`;
  }
  const was = declaredRevision(original, slug, input.taskTypes);
  const now = input.bySlug.get(slug)?.revision;
  if (was !== undefined && now === was + 1) return undefined;
  return `task "${slug}" is amended; an amend bumps "revision" from ${was ?? "the parked value"} to ${was === undefined ? "the next integer" : was + 1}, not ${now ?? "absent"}`;
}

/** An amend that writes no change is not an amend. */
function unchangedAmendFindings(
  input: DecisionInput,
  overBound: ReadonlySet<string>,
): string[] {
  const findings: string[] = [];
  for (const slug of input.slugs) {
    if (input.decisionOf.get(slug) !== "amend" || overBound.has(slug)) continue;
    if (input.texts.get(slug) === input.before.get(slug)) {
      findings.push(
        `slug "${slug}" is amended but its file is unchanged; write the amended brief and bump "revision"`,
      );
    }
  }
  return findings;
}

/** A new task continues its base, or claims a replace park's done-when. */
function createdTaskFindings(
  input: DecisionInput,
  claimedBy: Map<string, string[]>,
): string[] {
  const findings: string[] = [];
  const replaced = input.slugs.filter(
    (slug) => input.decisionOf.get(slug) === "replace",
  );
  for (const made of [...input.created].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    findings.push(
      ...(made.base !== undefined
        ? baseTaskFindings(input, made, made.base, claimedBy)
        : freshTaskFindings(input, made, replaced, claimedBy)),
    );
  }
  return findings;
}

function baseTaskFindings(
  input: DecisionInput,
  made: TaskFile,
  base: string,
  claimedBy: Map<string, string[]>,
): string[] {
  const decision = input.decisionOf.get(base);
  if (!input.slugs.includes(base)) {
    return [
      `new task "${made.slug}" continues "${base}", which is not in this ${input.turn}`,
    ];
  }
  if (decision !== "replace" && decision !== "split") {
    return [
      `new task "${made.slug}" continues "${base}", which was routed ${decision ?? "not at all"}; only replace and split write new tasks`,
    ];
  }
  claimTask(claimedBy, base, made.slug);
  const baseTask = input.bySlug.get(base);
  if (
    decision === "replace" &&
    baseTask &&
    doneWhen(made.body) !== doneWhen(baseTask.body)
  ) {
    return [
      `new task "${made.slug}" changes the done-when; a replace keeps its base's done-when`,
    ];
  }
  return [];
}

/**
 * A fresh (rule-10) task continues a replace park without a base: it matches
 * the parked done-when instead. A split part names its base: the parts divide
 * the done-when, so no fresh task can claim one.
 */
function freshTaskFindings(
  input: DecisionInput,
  made: TaskFile,
  replaced: readonly string[],
  claimedBy: Map<string, string[]>,
): string[] {
  const candidates = replaced
    .filter((slug) => (claimedBy.get(slug) ?? []).length === 0)
    .filter((slug) => {
      const base = input.bySlug.get(slug);
      return base !== undefined && doneWhen(made.body) === doneWhen(base.body);
    })
    .sort();
  if (candidates.length === 0) {
    return [
      `new task "${made.slug}" names no base and matches no replace slug's done-when; name the parked slug as base or keep its done-when`,
    ];
  }
  claimTask(claimedBy, candidates[0]!, made.slug);
  return [];
}

function claimTask(
  claimedBy: Map<string, string[]>,
  slug: string,
  by: string,
): void {
  const list = claimedBy.get(slug) ?? [];
  list.push(by);
  claimedBy.set(slug, list);
}

/** Each slug's claims must match its decision's write contract. */
function claimFindings(
  input: DecisionInput,
  claimedBy: ReadonlyMap<string, readonly string[]>,
): string[] {
  const findings: string[] = [];
  for (const slug of input.slugs) {
    const claims = [
      ...(claimedBy.get(slug) ?? []),
      ...(input.credits.get(slug) ?? []),
    ];
    findings.push(
      ...claimCountFindings(slug, input.decisionOf.get(slug)!, claims),
    );
  }
  return findings;
}

function claimCountFindings(
  slug: string,
  decision: StallDecision,
  claims: readonly string[],
): string[] {
  if (decision === "replace") return replaceClaimFindings(slug, claims);
  if (decision === "split") return splitClaimFindings(slug, claims);
  if (decision === "cancel" || decision === "leave") {
    return noWriteClaimFindings(slug, decision, claims);
  }
  return [];
}

function replaceClaimFindings(
  slug: string,
  claims: readonly string[],
): string[] {
  if (claims.length === 0) {
    return [
      `slug "${slug}" is replaced but has no task; write one with base: ${slug}`,
    ];
  }
  return claims.length > 1
    ? [
        `slug "${slug}" has ${claims.length} tasks (${claims.join(", ")}); replace writes exactly one`,
      ]
    : [];
}

function splitClaimFindings(slug: string, claims: readonly string[]): string[] {
  if (claims.length >= 2) return [];
  const count = claims.length === 0 ? "nothing" : `${claims.length} task`;
  return [
    `slug "${slug}" is split into ${count}; split writes at least two, each with base: ${slug}`,
  ];
}

function noWriteClaimFindings(
  slug: string,
  decision: StallDecision,
  claims: readonly string[],
): string[] {
  if (claims.length === 0) return [];
  const action = decision === "cancel" ? "cancelled" : "left";
  return [
    `slug "${slug}" was ${action} but gained ${claims.join(", ")}; ${decision} writes no task`,
  ];
}
/** A cancelled park becomes a kernel cancel record: the slug stays spent. */
export async function cancelRoutes(
  runtime: KernelRuntime,
  iteration: number,
  state: State,
  cancellations: readonly { slug: string; cause: string }[],
): Promise<void> {
  for (const { slug, cause } of cancellations) {
    await appendCancel(
      runtime.store,
      {
        iteration,
        slug,
        round: state.tasks[slug]?.round ?? 1,
        architect: state.tasks[slug]?.epic,
      },
      makeCause("note", cause),
    );
  }
}

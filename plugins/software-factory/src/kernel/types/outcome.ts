/** Outcome, concern, steer and review schemas and their inferred types (KERNEL0 §4). */

import { z } from "zod";

export const concernSchema = z.object({
  kind: z.enum(["debt", "risk", "uncertainty", "choice"]),
  calibration: z.enum(["fyi", "architect", "owner"]),
  text: z.string().min(1),
  evidence: z.string().optional(),
});

/** One ingested concern's kernel-assigned id: `<recordId>#<n>`, 1-based in the record's outcome. */
export type ConcernId = string;

/** A concern as the kernel read it back from a record: ingest assigns `id`, agents never write one. */
export type RecordedConcern = Concern & { id?: ConcernId };

/** One debt's closure: the id the kernel assigned, and what removed the debt. */
export const debtClosedEntrySchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
});

/** One steer's answer: the pending steer's id, and the architect's answer. */
export const steerAnswerSchema = z.object({
  steer: z.string().min(1),
  answer: z.string().min(1),
});

/** One fix turn's answer to a prior review finding, by its numbered position. */
export const replySchema = z.object({
  finding: z.number().int().positive(),
  reply: z.string().min(1),
});
/**
 * Where the PM's steer turn sends one steer: handled now, a new task, carried
 * into the goal's intent by the intent agent, an architect (the goal architect,
 * or `{architect: id}` for one scope), or drain-then-architect.
 */
export const steerRouteSchema = z.union([
  z.enum(["task", "spike", "intent", "architect", "stall"]),
  z
    .object({ architect: z.string().min(1) })
    .strict()
    .describe("one architect's scope: `main` or an epic id"),
]);
export type SteerRoute = z.infer<typeof steerRouteSchema>;

export const steerRouteEntrySchema = z.object({
  steer: z.string().min(1),
  route: steerRouteSchema,
  /** The PM's answer for a `task` steer; absent for every other route. */
  answer: z.string().optional(),
});

/**
 * Strips markdown code ticks and surrounding whitespace from a slug.
 * Empty after stripping is rejected by the schema.
 */
export function normalizeSlug(raw: string): string {
  return raw.replace(/^[\s`]+|[\s`]+$/g, "");
}

/** Schema that normalises a slug string at the schema boundary. */
export const outcomeSlugSchema = z.preprocess(
  (val) => (typeof val === "string" ? normalizeSlug(val) : val),
  z.string().min(1),
);

/** Schema that normalises an optional slug string at the schema boundary. */
const optionalOutcomeSlugSchema = z.preprocess(
  (val) => (typeof val === "string" ? normalizeSlug(val) : val),
  z.string().min(1).optional(),
);

/**
 * What the decider does with one parked slug: amend keeps the slug (a new
 * revision of its file), cancel spends it, replace and split continue the kept
 * branch under new slugs, leave defers to the architect.
 */
export const stallDecisionSchema = z.enum([
  "amend",
  "cancel",
  "replace",
  "split",
  "leave",
]);
export type StallDecision = z.infer<typeof stallDecisionSchema>;

export const stallRouteEntrySchema = z.object({
  slug: outcomeSlugSchema,
  action: stallDecisionSchema,
  reason: z.string().min(1),
});
export type StallRouteEntry = z.infer<typeof stallRouteEntrySchema>;

/** One plan item's check result: what the checker inspected and what it showed. */
export const planCheckEvidenceSchema = z.object({
  item: outcomeSlugSchema,
  status: z.enum(["done", "missing", "below-standard", "unverifiable"]),
  evidence: z.string().min(1),
});
export type PlanCheckEvidence = z.infer<typeof planCheckEvidenceSchema>;

/**
 * One follow-up the checker names without new direction. A parked slug gets
 * the decider's four decisions — amend under the same slug, cancel, replace
 * with one new task, split into several; a dead dep or unmerged work keeps its
 * mechanical fix.
 */
export const planCheckFollowUpSchema = z.object({
  kind: z.enum([
    "amend",
    "cancel",
    "replace",
    "split",
    "missing-dep",
    "unmerged",
  ]),
  /** The slug this follow-up acts on: a parked task, or the pending task a dead dep blocks. */
  slug: outcomeSlugSchema,
  /** A missing-dep follow-up's dead dependency; absent for every other kind. */
  dep: optionalOutcomeSlugSchema,
  reason: z.string().min(1),
});
export type PlanCheckFollowUp = z.infer<typeof planCheckFollowUpSchema>;

/**
 * What the checker decided about one open concern: it answered the concern in
 * its own check (`resolve`), or a follow-up it emits does the work (`task`,
 * naming that follow-up's slug). Anything the checker leaves out is
 * unresolved and reaches the architect.
 */
export const planCheckConcernSchema = z.object({
  /** The concern's id from the checker's brief. */
  id: z.string().min(1),
  action: z.enum(["resolve", "task"]),
  /** A `task` concern's follow-up slug; absent for `resolve`. */
  slug: optionalOutcomeSlugSchema,
  reason: z.string().min(1),
});
export type PlanCheckConcern = z.infer<typeof planCheckConcernSchema>;

/**
 * The checker's report: the kernel resumes dispatch on `progress` and
 * consults the architect on `architect`. One enum, because the kernel
 * branches on it.
 */
export const planCheckSchema = z.object({
  verdict: z.enum(["progress", "architect"]),
  evidence: z.array(planCheckEvidenceSchema).default([]),
  followUps: z.array(planCheckFollowUpSchema).default([]),
  concerns: z.array(planCheckConcernSchema).default([]),
});
export type PlanCheck = z.infer<typeof planCheckSchema>;
export type PlanCheckVerdict = PlanCheck["verdict"];

/**
 * One plan-check follow-up the PM routed: `continue` carries the checker's
 * kind out now (amend, cancel, replace, split, a dead-dep drop), `leave` keeps
 * it for the architect.
 */
export const planCheckRouteEntrySchema = z.object({
  slug: outcomeSlugSchema,
  action: z.enum(["continue", "leave"]),
  reason: z.string().min(1),
});
export type PlanCheckRouteEntry = z.infer<typeof planCheckRouteEntrySchema>;

/** One architect mark on a plan-review finding: whether the advisory review helped. */
export const planReviewMarkSchema = z.object({
  finding: z.number().int().positive(),
  mark: z.enum(["helpful", "unhelpful"]),
});
export type PlanReviewMark = z.infer<typeof planReviewMarkSchema>;

/** One plan-review finding: the plan line it concerns and what would satisfy it. */
export const planReviewFindingSchema = z.object({
  planLine: z.string().min(1).describe("the plan line or bullet it concerns"),
  finding: z.string().min(1).describe("what fails and what would satisfy it"),
});
export type PlanReviewFinding = z.infer<typeof planReviewFindingSchema>;

/**
 * A plan review's findings: technical concerns first, then plan-and-dependency
 * notes. No verdict, no last call — the review advises, the architect decides.
 * The kernel numbers them in this order for the architect's marks.
 */
export const planReviewOutcomeSchema = z.object({
  technical: z
    .array(planReviewFindingSchema)
    .default([])
    .describe(
      "technical concerns: impractical direction, a real bug, a foundation the plan assumes and the repo lacks",
    ),
  planNotes: z
    .array(planReviewFindingSchema)
    .default([])
    .describe(
      "plan and dependency notes: an unactionable bullet, missing coverage, ordering",
    ),
});
export type PlanReviewOutcome = z.infer<typeof planReviewOutcomeSchema>;

/**
 * One intent section's status in the architect's summary: what works, what
 * is not built yet, or where the owner meets friction.
 */
export const intentStatusEntrySchema = z.object({
  section: z.string().min(1).describe("intent section heading"),
  status: z.enum(["works", "not-built", "friction"]),
  note: z.string().optional().describe("short evidence or friction detail"),
});
export type IntentStatusEntry = z.infer<typeof intentStatusEntrySchema>;

/** The only agent ↔ script surface; one schema for every step. Field
 * descriptions render into the outcome prompt skeleton, so they are the
 * prompt-facing wording; comments below keep kernel-only behavior. */
export const outcomeSchema = z.object({
  status: z
    .enum(["done", "blocked", "failed", "upscope"])
    .describe("upscope on task steps only"),
  summary: z.string().describe("one paragraph"),
  intentStatus: z
    .array(intentStatusEntrySchema)
    .optional()
    .describe(
      "architect step only: one entry per intent section — works, not built or friction — which the kernel writes to the dashboard's intent status",
    ),
  concerns: z.array(concernSchema).default([]),
  // Parse-only: old records close debts and answer steers here, and no prompt
  // asks for a line; `debtClosed` and `steerAnswers` are the protocol. Kept
  // required because every delivery defaults it empty.
  forward: z.array(z.string()).default([]),
  // Kernel-recorded debts are closed by the id the record ingest assigned, not
  // by quoting the debt text.
  debtClosed: z
    .array(debtClosedEntrySchema)
    .optional()
    .describe(
      "close one open debt by the id in the pack's debt register; reason says what removed it",
    ),
  // The architect answers every pending steer from its pack's steer list.
  steerAnswers: z
    .array(steerAnswerSchema)
    .optional()
    .describe(
      "one {steer, answer} per pending steer, steer id from the steer list",
    ),
  // A fix turn answers its prior review with one entry per numbered finding;
  // the summary stays free text. Derive parks an empty fix with no replies.
  replies: z
    .array(replySchema)
    .optional()
    .describe(
      "fix turns only: one {finding, reply} per numbered prior finding; finding is its 1-based position",
    ),
  verdict: z
    .enum(["approve", "changes", "reject"])
    .optional()
    .describe("review steps only"),
  decision: z
    .enum(["continue", "done", "blocked"])
    .optional()
    .describe("architect step only"),
  // The top's per-iteration direction choice at hierarchy depth 2: only these
  // epics get the written top-down pass after its turn. A steer harness hosts
  // live children for every active epic before the choice; absent keeps every
  // active epic.
  epicConsults: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "architect step only: the epics that get this iteration's written top-down direction pass; a steer harness hosts every active epic live before the choice; absent consults every active epic",
    ),
  // `yes` parks with cause upscope and (standalone only) rewrites the front
  // class to bigger; `no` and absent keep the normal verdict path.
  upscope: z
    .enum(["yes", "no"])
    .optional()
    .describe("standalone review escalation: answer with the verdict"),
  // Absent on a legacy steer turn means every steer goes to the architect.
  steerRoutes: z
    .array(steerRouteEntrySchema)
    .optional()
    .describe("PM steer turns only: one route per claimed steer"),
  // The kernel resumes amend/replace/split slugs, cancels `cancel` slugs and
  // records `leave` reasons for the next boundary.
  stallRoutes: z
    .array(stallRouteEntrySchema)
    .optional()
    .describe("PM stall turns only: one entry per parked slug"),
  // The kernel branches on the verdict.
  planCheck: planCheckSchema.optional().describe("plan-checker turns only"),
  // Findings reach the architect before the PM; no verdict is taken here.
  planReview: planReviewOutcomeSchema
    .optional()
    .describe("plan-review turns only: technical findings and plan notes"),
  // The kernel resumes amended/continued follow-ups, cancels a cancel
  // follow-up and records `leave` reasons for the next boundary.
  planCheckRoutes: z
    .array(planCheckRouteEntrySchema)
    .optional()
    .describe("plan-check PM turns only: one entry per checker follow-up"),
  planReviewMarks: z
    .array(planReviewMarkSchema)
    .optional()
    .describe("architect step only: one mark per plan-review finding"),
});

export type Concern = z.infer<typeof concernSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
/** One record's outcome as ingested: the same shape, its concerns carrying kernel ids. */
export type RecordedOutcome = Omit<Outcome, "concerns"> & {
  concerns: RecordedConcern[];
};
export type ReviewVerdict = NonNullable<Outcome["verdict"]>;

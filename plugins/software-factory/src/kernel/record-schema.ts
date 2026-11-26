/**
 * The published shape of one step record: the merged `started.yaml`/`end.yaml`
 * view `factory records` prints and the store reads. The type is the contract;
 * this schema is the copy editors and query consumers validate against.
 */

import { z } from "zod";
import { CACHE_TTLS } from "../harness/types.js";
import type { StepRecord } from "./types/records.js";
import { concernSchema, outcomeSchema } from "./types/outcome.js";
import { causeSchema } from "./types/state.js";

const modelRefSchema = z.object({
  id: z.string().min(1),
  effort: z.string().optional(),
});

const usageSchema = z.object({
  in: z.number(),
  cacheRead: z.number(),
  cacheWrite5m: z.number(),
  cacheWrite1h: z.number(),
  out: z.number(),
  reasoningOut: z.number(),
  costUsd: z.number().optional(),
  listCostUsd: z.number().optional(),
  harnessCostUsd: z.number().optional(),
});

const stopSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("done") }),
  z.object({ kind: z.literal("cancelled") }),
  z.object({
    kind: z.literal("refusal"),
    details: z.string().optional(),
  }),
  z.object({
    kind: z.literal("truncated"),
    cause: z.enum(["max-tokens", "turn-limit"]),
  }),
  z.object({
    kind: z.literal("infra"),
    cause: z.enum([
      "quota",
      "rate",
      "network",
      "auth",
      "crash",
      "overflow",
      "timeout",
      "unavailable",
      "glitch",
    ]),
    details: z.string().optional(),
  }),
]);

const sessionRefSchema = z.object({
  harness: z.string().min(1),
  id: z.string().min(1),
  cwd: z.string(),
  model: modelRefSchema,
  lastRequestStartedAt: z.string(),
  retentionTier: z.enum(CACHE_TTLS),
  compacted: z.boolean(),
  cumulativeUsage: usageSchema.optional(),
  dir: z.string().optional(),
});

const turnAttemptSchema = z.object({
  model: modelRefSchema,
  stop: stopSchema,
  usage: usageSchema,
  harness: z.string().optional(),
});

const servedUsageSchema = z.object({
  model: modelRefSchema,
  usage: usageSchema,
});

const checkResultSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  summary: z.string(),
  output: z.string(),
  fingerprint: z.string(),
  attribution: z.enum(["new", "inherited"]).optional(),
  advisory: z.boolean().optional(),
  details: z.unknown().optional(),
  flaky: z.array(z.string()).optional(),
  skipped: z.boolean().optional(),
  mutatesWorktree: z.boolean().optional(),
  improvements: z.array(z.string()).optional(),
});

const workEditsSchema = z.object({
  files: z.number().int(),
  added: z.number().int(),
  removed: z.number().int(),
});

const recordedConcernSchema = concernSchema.extend({
  /** The kernel's ingest id; agents never write one. */
  id: z.string().min(1).optional(),
});

const recordedOutcomeSchema = outcomeSchema.extend({
  concerns: z.array(recordedConcernSchema),
});

/**
 * One record: its start fields, the settled fields `end.yaml` commits, and the
 * agent outcome. Strict: a key here that the store does not read is drift.
 */
export const stepRecordSchema: z.ZodType<StepRecord> = z
  .object({
    seq: z.number().int(),
    iteration: z.number().int(),
    slug: z.string().optional(),
    step: z.string().min(1),
    round: z.number().int(),
    actor: z.enum(["agent", "script"]),
    architect: z.string().optional(),
    alias: z.string().optional(),
    model: modelRefSchema.optional(),
    attempts: z.array(turnAttemptSchema).optional(),
    served: z.array(servedUsageSchema).optional(),
    repairFindings: z.array(z.string()).optional(),
    asks: z.enum(["outcome", "unfinished", "rescue"]).array().optional(),
    repairFindingsResolved: z.boolean().optional(),
    launchKind: z
      .enum(["glitch", "change-request", "qa-finding", "failure"])
      .optional(),
    cachedPrefix: z.boolean().optional(),
    taskHash: z.string().optional(),
    revision: z.number().int().optional(),
    base: z.string().optional(),
    stop: stopSchema.optional(),
    usage: usageSchema.optional(),
    compactUsage: usageSchema.optional(),
    session: sessionRefSchema.optional(),
    commit: z.string().optional(),
    report: z.string().optional(),
    diff: z.string().optional(),
    checkoutWrites: z.array(z.string()).optional(),
    promptBytes: z.number().int().optional(),
    packBytes: z.number().int().optional(),
    /** Pre-uncap history: the retired context-pack truncation flag. */
    packTruncated: z.boolean().optional(),
    transcript: z.string().optional(),
    tree: z.string().optional(),
    headTree: z.string().optional(),
    outside: z.array(z.string()).optional(),
    checks: z.array(checkResultSchema).optional(),
    edits: workEditsSchema.optional(),
    testRuns: z.number().int().optional(),
    wallMs: z.number().int().optional(),
    outcome: recordedOutcomeSchema.optional(),
    ok: z.boolean().optional(),
    cause: causeSchema.optional(),
    startedAt: z.string(),
    endedAt: z.string().optional(),
  })
  .strict();

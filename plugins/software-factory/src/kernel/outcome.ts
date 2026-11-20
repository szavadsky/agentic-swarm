// biome-ignore-all lint/complexity: split-rest
import fs from "node:fs";
import yaml from "yaml";
import type { z } from "zod";
import { knownDebtIds } from "./derive.js";
import { qaReportOf } from "./qa.js";
import {
  type FlowDefinition,
  type FlowStep,
  type KernelStep,
  type Outcome,
  outcomeSchema,
  type StepRecord,
} from "./types.js";

export type OutcomeExpectation = "any" | "review" | "qa" | "architect";

export class OutcomeInvalidError extends Error {
  constructor(public readonly findings: string[]) {
    super(findings.join("; "));
    this.name = "OutcomeInvalidError";
  }
}

function zodFindings(error: unknown): string[] {
  const issues = (
    error as { issues?: { path: (string | number)[]; message: string }[] }
  ).issues;
  if (!issues) return [(error as Error).message];
  return issues.map(
    (issue) => `${issue.path.join(".") || "outcome"}: ${issue.message}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A recorded outcome from before the park decision vocabulary spells the
 * acted-on park `continue`. It wrote one continuation task, which the current
 * vocabulary calls a replace, so the retired spelling reads as one: recorded
 * outcomes stay valid under the current schema, and no live prompt offers it.
 */
function migrateStallRoutes(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.stallRoutes)) return raw;
  return {
    ...raw,
    stallRoutes: raw.stallRoutes.map((route) =>
      isRecord(route) && route.action === "continue"
        ? { ...route, action: "replace" }
        : route,
    ),
  };
}

/** Parses one YAML/JSON outcome body; zod is the only validator. */
export function parseOutcome(
  text: string,
  schema: z.ZodType<Outcome> = outcomeSchema,
): Outcome {
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    throw new OutcomeInvalidError([
      `not valid YAML: ${(err as Error).message}`,
    ]);
  }
  try {
    return schema.parse(migrateStallRoutes(raw));
  } catch (err) {
    throw new OutcomeInvalidError(zodFindings(err));
  }
}

/** Last fenced ```yaml / ```json block in a message, per LOG D6 fallback. */
export function fencedOutcome(text: string): string | null {
  const blocks = [...text.matchAll(/```(?:yaml|yml|json)?\s*\n([\s\S]*?)```/g)];
  const last = blocks.at(-1);
  return last?.[1] ?? null;
}

export interface OutcomeSource {
  outcome: Outcome;
  /** Where it came from; `file` is the prompt-named path. */
  source: "file" | "fenced";
}

/**
 * Reads the outcome the agent wrote at `outcomePath`, then the final message's
 * fenced block. Throws OutcomeInvalidError only when a block was found but is
 * invalid; missing output is an empty finding list the caller turns into a
 * repair turn.
 */
export function readDeliveredOutcome(
  outcomePath: string,
  message: string,
  schema: z.ZodType<Outcome> = outcomeSchema,
): OutcomeSource | null {
  if (fs.existsSync(outcomePath)) {
    const text = fs.readFileSync(outcomePath, "utf8");
    try {
      return { outcome: parseOutcome(text, schema), source: "file" };
    } catch (err) {
      if (!(err instanceof OutcomeInvalidError)) throw err;
      // A malformed file still gets the fenced fallback.
      const fenced = fencedOutcome(message);
      if (fenced !== null)
        return { outcome: parseOutcome(fenced, schema), source: "fenced" };
      throw err;
    }
  }
  const fenced = fencedOutcome(message);
  if (fenced === null) return null;
  return { outcome: parseOutcome(fenced, schema), source: "fenced" };
}

/**
 * The one outcome field each expectation gates: a review delivers a verdict, a
 * QA step its nested accept-or-changes report, the architect step a decision,
 * `any` delivers any only if it chooses. The validator enforces the field and
 * the repair ask renders just that one, so a bare done is never asked for a
 * verdict.
 */
export function expectationField(
  expectation: OutcomeExpectation,
): "verdict" | "qa" | "decision" | undefined {
  if (expectation === "review") return "verdict";
  if (expectation === "qa") return "qa";
  if (expectation === "architect") return "decision";
  return undefined;
}

/**
 * Kernel turn steps that run outside any configured flow, mapped to the outcome
 * expectation they enforce.
 */
export const KERNEL_TURN_STEPS = {
  architect: "architect",
  digest: "any",
  front: "any",
  intent: "any",
  packprep: "any",
  plancheck: "any",
  planreturn: "any",
  planreview: "any",
  pm: "any",
  steward: "any",
  subarchitect: "architect",
} as const satisfies Record<KernelStep, OutcomeExpectation>;

export type KernelTurnStep = keyof typeof KERNEL_TURN_STEPS;

/**
 * Maps a flow step id or kernel turn step to its outcome expectation: the
 * architect consult gates a decision, review steps a verdict, QA steps their
 * accept-or-changes report, kernel turn steps their expectation, and every
 * other configured step accepts any outcome. An id that is neither a flow step
 * nor a kernel turn step is an error, never an unenforced contract.
 */
export function expectationForStep(
  step: string | undefined,
  flows: Record<string, FlowDefinition>,
): OutcomeExpectation {
  if (!step) return "any";
  if (Object.hasOwn(KERNEL_TURN_STEPS, step)) {
    return KERNEL_TURN_STEPS[step as KernelTurnStep];
  }
  const found = flowStepFor(step, flows);
  if (!found) {
    throw new Error(`step "${step}" is not configured in the repo's flows`);
  }
  if (found.review || found.adjudicate !== undefined) return "review";
  if (found.qa) return "qa";
  return "any";
}

/** The first configured step with this id; step ids are kernel flow vocabulary. */
export function flowStepFor(
  step: string,
  flows: Record<string, FlowDefinition>,
): FlowStep | undefined {
  for (const flow of Object.values(flows)) {
    const found = flow.steps.find((s) => s.id === step);
    if (found) return found;
  }
  return undefined;
}

export interface ExpectationOptions {
  /** A review's or QA's last call: a change request is not accepted then. */
  lastCall?: boolean;
  /**
   * Records read before this turn, so a `debtClosed` id can be checked against
   * the ids ingest assigned. Absent when no record tree is reachable (a
   * standalone outcome file): the id check cannot run then.
   */
  records?: readonly StepRecord[];
  /**
   * The record this outcome belongs to, when `records` contains it: its
   * concerns are ingested only when the turn seals it, so its own ids are not
   * closable from this outcome.
   */
  excludeRecordId?: string;
}

/** Per-step contract the schema alone cannot express. */
export function validateExpectation(
  outcome: Outcome,
  expectation: OutcomeExpectation,
  opts: ExpectationOptions = {},
): string[] {
  const findings: string[] = [];
  const field = expectationField(expectation);
  if (field === "decision" && !outcome.decision) {
    findings.push("decision is required: continue | done | blocked");
  }
  if (
    field === "verdict" &&
    !outcome.verdict &&
    outcome.status !== "failed" &&
    outcome.status !== "blocked"
  ) {
    findings.push(
      "verdict is required on a completed review: approve | changes | reject",
    );
  }
  if (
    field === "verdict" &&
    opts.lastCall &&
    outcome.verdict === "changes" &&
    outcome.status !== "failed" &&
    outcome.status !== "blocked"
  ) {
    findings.push(
      'verdict "changes" is not available on the last review call: approve with concerns, or reject',
    );
  }
  if (field === "qa") {
    const qa = qaReportOf(outcome);
    if (!qa && outcome.status !== "failed" && outcome.status !== "blocked") {
      findings.push(
        "qa verdict is required on a completed QA turn: accept | changes",
      );
    }
    if (
      qa?.verdict === "changes" &&
      qa.findings.length === 0 &&
      outcome.status !== "failed" &&
      outcome.status !== "blocked"
    ) {
      findings.push("qa verdict changes needs at least one finding");
    }
    if (
      qa?.verdict === "changes" &&
      opts.lastCall &&
      outcome.status !== "failed" &&
      outcome.status !== "blocked"
    ) {
      findings.push(
        'qa verdict "changes" is not available on the last acceptance call: accept with concerns, or return blocked/failed',
      );
    }
  }
  const records = opts.records;
  if (records && outcome.debtClosed) {
    const known = knownDebtIds(records);
    // The outcome's own record is in the tree once its file is written, but
    // its ids exist from the next ingest on: a closure cites an earlier record.
    if (opts.excludeRecordId) {
      const own = `${opts.excludeRecordId}#`;
      for (const id of known) if (id.startsWith(own)) known.delete(id);
    }
    for (const entry of outcome.debtClosed) {
      if (!known.has(entry.id)) {
        findings.push(
          `unknown debt id: ${entry.id}: no ingested debt concern has that id`,
        );
      }
    }
  }
  return findings;
}

/** The synthetic outcome after failed repairs; an invalid outcome past repair is failed (KERNEL0 §4). */
export function failedOutcome(findings: string[]): Outcome {
  return {
    status: "failed",
    summary: `invalid outcome: ${findings.join("; ")}`,
    concerns: [],
    forward: [],
  };
}

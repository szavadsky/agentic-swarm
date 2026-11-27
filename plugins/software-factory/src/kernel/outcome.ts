import fs from "node:fs";
import yaml from "yaml";
import type { z } from "zod";
import { knownDebtIds } from "./derive.js";
import { issueText } from "./findings.js";
import { DECIDE_STEP } from "./pending-signal.js";
import { qaReportOf } from "./qa.js";
import {
  type FlowDefinition,
  type FlowStep,
  type Outcome,
  outcomeSchema,
} from "./types.js";
import { migrateStallRoutes } from "./types/outcome.js";
import {
  type ExpectationOptions,
  KERNEL_TURN_STEPS,
  type KernelTurnStep,
  type OutcomeExpectation,
  type OutcomeSource,
} from "./outcome-types.js";
export type { OutcomeExpectation, OutcomeSource } from "./outcome-types.js";

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
  return issues.map((issue) => issueText(issue, "outcome"));
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

export { KERNEL_TURN_STEPS } from "./outcome-types.js";

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
  // A decide turn answers through a review verdict; it is no configured flow step.
  if (step === DECIDE_STEP) return "review";
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

/** A decision turn must decide. */
function decisionFindings(
  field: string | undefined,
  outcome: Outcome,
): string[] {
  if (field !== "decision" || outcome.decision) return [];
  return ["decision is required: continue | done | blocked"];
}

/** A completed review must carry a verdict, and its last call cannot request changes. */
function verdictFindings(
  field: string | undefined,
  outcome: Outcome,
  lastCall: boolean,
): string[] {
  if (field !== "verdict") return [];
  const completed = outcome.status !== "failed" && outcome.status !== "blocked";
  const findings: string[] = [];
  if (!outcome.verdict && completed) {
    findings.push(
      "verdict is required on a completed review: approve | changes | reject",
    );
  }
  if (lastCall && outcome.verdict === "changes" && completed) {
    findings.push(
      'verdict "changes" is not available on the last review call: approve with concerns, or reject',
    );
  }
  return findings;
}

/** A completed QA turn must report a verdict with its findings. */
function qaFindings(
  field: string | undefined,
  outcome: Outcome,
  lastCall: boolean,
): string[] {
  if (field !== "qa") return [];
  const qa = qaReportOf(outcome);
  const completed = outcome.status !== "failed" && outcome.status !== "blocked";
  const findings: string[] = [];
  if (!qa && completed) {
    findings.push(
      "qa verdict is required on a completed QA turn: accept | changes",
    );
  }
  if (qa?.verdict !== "changes" || !completed) return findings;
  if (qa.findings.length === 0) {
    findings.push("qa verdict changes needs at least one finding");
  }
  if (lastCall) {
    findings.push(
      'qa verdict "changes" is not available on the last acceptance call: accept with concerns, or return blocked/failed',
    );
  }
  return findings;
}

/** Closed debt ids must name an ingested, closable concern. */
function debtFindings(outcome: Outcome, opts: ExpectationOptions): string[] {
  const records = opts.records;
  if (!records || !outcome.debtClosed) return [];
  const known = knownDebtIds(records);
  // The outcome's own record is in the tree once its file is written, but its
  // ids exist from the next ingest on: a closure cites an earlier record.
  if (opts.excludeRecordId) {
    const own = `${opts.excludeRecordId}#`;
    for (const id of known) if (id.startsWith(own)) known.delete(id);
  }
  return outcome.debtClosed
    .filter((entry) => !known.has(entry.id))
    .map(
      (entry) =>
        `unknown debt id: ${entry.id}: no ingested debt concern has that id`,
    );
}

/** Only review steps may mark a concern `dismiss: immaterial`. */
function dismissFindings(
  expectation: OutcomeExpectation,
  outcome: Outcome,
): string[] {
  if (expectation === "review") return [];
  if (outcome.concerns.some((c) => c.dismiss !== undefined)) {
    return ["concerns[].dismiss is only allowed on review steps"];
  }
  return [];
}

/** Per-step contract the schema alone cannot express. */
export function validateExpectation(
  outcome: Outcome,
  expectation: OutcomeExpectation,
  opts: ExpectationOptions = {},
): string[] {
  const field = expectationField(expectation);
  const lastCall = opts.lastCall === true;
  return [
    ...decisionFindings(field, outcome),
    ...verdictFindings(field, outcome, lastCall),
    ...qaFindings(field, outcome, lastCall),
    ...debtFindings(outcome, opts),
    ...dismissFindings(expectation, outcome),
  ];
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

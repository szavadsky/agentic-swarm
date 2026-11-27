/**
 * Filled outcome examples rendered from a kernel outcome schema and the step's
 * expectation. A prompt shows one complete outcome for the step and one valid
 * alternative, so the agent copies a working shape instead of interpreting a
 * skeleton. Every value comes from the same schema `factory validate` reads.
 */
import yaml from "yaml";
import { z } from "zod";
import { type JsonNode, resolveNode } from "./json-schema.js";
import { expectationField, type OutcomeExpectation } from "./outcome.js";
import { type Outcome, outcomeSchema } from "./types.js";
import type { OutcomeExamples } from "./outcome-example-types.js";

/** The unconditional outcome fields every turn delivers. */
const BASE_OUTCOME_FIELDS = [
  "status",
  "summary",
  "concerns",
  "steerAnswers",
  "debtClosed",
];

/**
 * Reporting fields a prompt's turns deliver beyond the base shape and the one
 * field its expectation gates: the PM routes steers, stalls and plan-check
 * follow-ups, and the checker reports a plan check. An ask-only field arrives
 * through `extraFields`, so an unasked step's example does not show it.
 */
const PROMPT_OUTCOME_FIELDS: Record<string, string[]> = {
  architect: [
    "planReviewMarks",
    "intentStatus",
    "epicConsults",
    "statusReviewAnswers",
  ],
  "architect-review-return": ["planReviewMarks"],
  implementer: ["replies"],
  "pack-preparer": ["packBriefs"],
  pm: ["steerRoutes", "stallRoutes", "planCheckRoutes"],
  "plan-checker": ["planCheck"],
  "review-architect": ["planReview"],
};

/** Sample prose per schema leaf; the path includes `[]` for an array's items. */
const SAMPLE_TEXT: Readonly<Record<string, string>> = {
  summary: "the requested work is complete and the gates pass",
  "intentStatus[].slug": "KernelCore",
  "intentStatus[].section": "KernelCore",
  "intentStatus[].note": "every flow step renders a filled outcome example",
  "concerns[].text": "the retry path has no test without a live harness",
  "concerns[].evidence": "test/prompts.test.ts",
  "steerAnswers[].steer": "s1",
  "steerAnswers[].answer": "the API stays stable",
  "replies[].reply": "fixed in the code; the test covers it",
  "statusReviewAnswers[].answer":
    "the task merged in iteration 2; record 00042 carries the review verdict",
  "packBriefs[].summary": "the checker's follow-ups all landed; no plan change",
  "steerRoutes[].steer": "s1",
  "steerRoutes[].answer": "the API stays stable",
  "stallRoutes[].slug": "alpha",
  "stallRoutes[].reason": "the parked cause no longer applies",
  "planCheck.evidence[].item": "outcome-examples",
  "planCheck.evidence[].evidence": "test/prompts.test.ts",
  "planCheck.followUps[].slug": "alpha",
  "planCheck.followUps[].dep": "beta",
  "planCheck.followUps[].reason": "dependency beta is parked",
  "planReview.technical[].planLine":
    "- `outcome-examples` — render a filled outcome example per step",
  "planReview.technical[].finding":
    "the plan assumes a prompt helper the repo lacks; name the helper or drop the assumption",
  "planReview.planNotes[].planLine":
    "Done when: every flow step's example passes `validate`",
  "planReview.planNotes[].finding":
    "the done-when names no command; name `bun test test/prompts.test.ts`",
  "planCheckRoutes[].slug": "alpha",
  "planCheckRoutes[].reason": "the follow-up retries the turn",
  "epicConsults[]": "alpha",
  "qa.findings[]": "the done-when needs a failing case in test/prompts.test.ts",
};

/** Enum leaves whose first value is not the illustrative one. */
const SAMPLE_ENUM: Readonly<Record<string, string>> = {
  "planCheck.followUps[].kind": "missing-dep",
  upscope: "no",
};

/**
 * Arrays whose example is empty: a `debtClosed` entry cites an id only ingest
 * can assign, so any sample id fails `validate` where the outcome is written.
 * The key stays visible; the entry prose is in plan-rules.
 */
const EMPTY_SAMPLE_ARRAYS: ReadonlySet<string> = new Set(["debtClosed"]);

interface JsonRoot extends JsonNode {
  $defs?: Record<string, JsonNode>;
}

/** One enum leaf: the illustrative override when the schema allows it. */
function enumSample(node: JsonNode, path: string): unknown {
  const override = SAMPLE_ENUM[path];
  if (override !== undefined && node.enum?.includes(override)) return override;
  return node.enum?.[0];
}

function unionSample(
  node: JsonNode,
  defs: Record<string, JsonNode>,
  path: string,
): unknown {
  const [first] = node.anyOf ?? [];
  if (!first) throw new Error(`schema union at ${path} has no branch`);
  return sampleNode(first, defs, path);
}

function arraySample(
  node: JsonNode,
  defs: Record<string, JsonNode>,
  path: string,
): unknown {
  if (EMPTY_SAMPLE_ARRAYS.has(path)) return [];
  if (!node.items) throw new Error(`schema array at ${path} has no items`);
  return [sampleNode(node.items, defs, `${path}[]`)];
}

function objectSample(
  node: JsonNode,
  defs: Record<string, JsonNode>,
  path: string,
): unknown {
  if (!node.properties) {
    throw new Error(`schema object at ${path} has no properties`);
  }
  const sample: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.properties)) {
    sample[key] = sampleNode(value, defs, `${path}.${key}`);
  }
  return sample;
}

function scalarSample(node: JsonNode, path: string): unknown {
  if (node.type === "integer" || node.type === "number") return 1;
  if (node.type === "boolean") return true;
  if (node.type === "string") {
    const leaf = path.split(".").at(-1)?.replace("[]", "") ?? "value";
    return SAMPLE_TEXT[path] ?? `example ${leaf}`;
  }
  throw new Error(`schema node at ${path} has no sample value`);
}

/** One sample value for a schema node; arrays hold one item, objects every key. */
function sampleNode(
  raw: JsonNode,
  defs: Record<string, JsonNode>,
  path: string,
): unknown {
  const node = resolveNode(raw, defs);
  if (node.enum) return enumSample(node, path);
  if (node.anyOf) return unionSample(node, defs, path);
  if (node.type === "array") return arraySample(node, defs, path);
  if (node.type === "object") return objectSample(node, defs, path);
  return scalarSample(node, path);
}

/** The top-level fields a prompt's step writes, in schema order. */
function exampleFields(
  prompt: string,
  expectation: OutcomeExpectation,
  extraFields: readonly string[] = [],
): Set<string> {
  const gated = expectationField(expectation);
  return new Set([
    ...BASE_OUTCOME_FIELDS,
    ...(PROMPT_OUTCOME_FIELDS[prompt] ?? []),
    ...(gated ? [gated] : []),
    ...extraFields,
  ]);
}

/** One schema's filled sample for a step, narrowed to the fields it writes. */
function sampleOutcome(
  prompt: string,
  expectation: OutcomeExpectation,
  schema: z.ZodType<Outcome>,
  extraFields: readonly string[] = [],
): Record<string, unknown> {
  const root = z.toJSONSchema(schema) as JsonRoot;
  if (root.type !== "object" || !root.properties) {
    throw new Error("outcome example needs a top-level object schema");
  }
  const fields = exampleFields(prompt, expectation, extraFields);
  const defs = root.$defs ?? {};
  const sample: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(root.properties)) {
    if (fields.has(key)) sample[key] = sampleNode(value, defs, key);
  }
  if (expectation === "qa") {
    sample.qa = { verdict: "accept", findings: [] };
  }
  if (expectation !== "review" && Array.isArray(sample.concerns)) {
    sample.concerns = (sample.concerns as Record<string, unknown>[]).map(
      ({ dismiss: _dismiss, ...concern }) => concern,
    );
  }
  return sample;
}

/**
 * A filled example and its alternative for one step. A review shows the other
 * verdict, QA the other QA verdict and the architect the other decision; every
 * other step's alternative is the same outcome delivered as the final message's
 * fenced block.
 */
export function outcomeExamples(
  prompt: string,
  expectation: OutcomeExpectation,
  schema: z.ZodType<Outcome> = outcomeSchema,
  extraFields: readonly string[] = [],
): OutcomeExamples {
  const sample = sampleOutcome(prompt, expectation, schema, extraFields);
  const alternative = structuredClone(sample);
  if (expectation === "review") alternative.verdict = "changes";
  if (expectation === "architect") alternative.decision = "done";
  if (expectation === "qa") {
    alternative.qa = {
      verdict: "changes",
      findings: [SAMPLE_TEXT["qa.findings[]"]],
    };
  }
  return {
    // Validate without parsing away the kept shape: `parse` adds schema
    // defaults, and the legacy `forward` field must not be shown.
    primary: validatedSample(schema, sample),
    alternative: validatedSample(schema, alternative),
  };
}

/** A sample the schema accepts, rendered as the sample itself. */
function validatedSample(
  schema: z.ZodType<Outcome>,
  sample: Record<string, unknown>,
): Outcome {
  schema.parse(sample);
  return sample as Outcome;
}

function fence(outcome: Outcome): string {
  return `\`\`\`yaml\n${yaml.stringify(outcome, { lineWidth: 0 }).trimEnd()}\n\`\`\``;
}

/** The alternative's label: another gated value, or the fenced-block channel. */
function alternativeLabel(expectation: OutcomeExpectation): string {
  if (expectation === "review") return "The other verdict is also valid:";
  if (expectation === "qa") return "The other QA verdict is also valid:";
  if (expectation === "architect") return "The other decision is also valid:";
  return "The same outcome as the last fenced YAML block of your final message is also valid:";
}

/** The `outcome_schema` prompt variable: two filled, valid outcome examples. */
export function outcomeExampleVar(
  prompt: string,
  expectation: OutcomeExpectation,
  schema: z.ZodType<Outcome> = outcomeSchema,
  extraFields: readonly string[] = [],
): string {
  const { primary, alternative } = outcomeExamples(
    prompt,
    expectation,
    schema,
    extraFields,
  );
  return [
    "A complete outcome for this step:",
    "",
    fence(primary),
    "",
    alternativeLabel(expectation),
    "",
    fence(alternative),
  ].join("\n");
}

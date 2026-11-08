import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createAjv } from "../../src/core/config/ajv.js";
import { resolveStepSchema } from "../../src/core/flows/step-runner.js";

/**
 * Contract tests for concern/remarkable producer schemas (docs/factory.v2.md §18).
 *
 * Every agent output that can raise concerns must carry the shared definitions
 * inline (no cross-file `$ref`) so Ajv can validate the schema standalone:
 *   - concerns[] on developers, fact-finders, plans, decisions, and close-ups
 *   - newConcerns[] on review/QA outputs (triage stays in suggestions[])
 *   - remarkable decisions on outputs that report tradeoffs
 *   - concernResolutions[] on wave/plan close-ups
 *
 * Severity and detail stay optional in JSON; the runtime concern store applies
 * defaults. `kind` is a strict enum so an unknown kind fails validation before
 * any engine-side write.
 */

const pluginRoot = path.resolve(import.meta.dir, "../..");
const CONCERN_KINDS = ["tech-debt", "assumption", "blocker", "risk", "question"];

type JsonSchema = Record<string, any>;

interface Producer {
  name: string;
  schema: () => JsonSchema;
  base: JsonSchema;
}

function validator(schema: JsonSchema) {
  return createAjv().compile(schema);
}

function resolveRef(schema: JsonSchema, node: any): any {
  if (!node || typeof node !== "object") return node;
  const ref = node.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return node;
  let target: any = schema;
  for (const part of ref.slice(2).split("/")) target = target?.[part];
  return target ? { ...target, ...node, $ref: undefined } : node;
}

function arrayItem(schema: JsonSchema, property: string): any {
  const prop = resolveRef(schema, schema.properties?.[property]);
  if (!prop || prop.type !== "array") return undefined;
  return resolveRef(schema, prop.items);
}

function externalRefs(node: any, refs: string[] = []): string[] {
  if (!node || typeof node !== "object") return refs;
  if (Array.isArray(node)) {
    for (const child of node) externalRefs(child, refs);
    return refs;
  }
  if (typeof node.$ref === "string" && !node.$ref.startsWith("#/")) {
    refs.push(node.$ref);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== "$ref") externalRefs(value, refs);
  }
  return refs;
}

function validationErrors(validate: any): string {
  return (validate.errors ?? [])
    .map((e: any) => `${e.instancePath || "/"} ${e.message}`)
    .join("; ");
}

function hasConcernShape(schema: JsonSchema, item: any, label: string, failures: string[]) {
  const required: string[] = item?.required ?? [];
  if (!required.includes("kind")) failures.push(`${label}: kind must be required`);
  if (!required.includes("summary")) failures.push(`${label}: summary must be required`);
  if (required.includes("detail")) failures.push(`${label}: detail must be optional at schema level`);
  if (required.includes("severity")) failures.push(`${label}: severity must be optional at schema level`);

  const kinds = resolveRef(schema, item?.properties?.kind)?.enum ?? [];
  const sortedKinds = [...kinds].sort();
  if (sortedKinds.length !== CONCERN_KINDS.length || !CONCERN_KINDS.every((k) => sortedKinds.includes(k))) {
    failures.push(`${label}: kind enum must be ${CONCERN_KINDS.join("|")}, got ${JSON.stringify(kinds)}`);
  }

  const severity = resolveRef(schema, item?.properties?.severity);
  if (!severity) {
    failures.push(`${label}: severity property must be declared but optional`);
  } else {
    const severities: string[] = [...(severity.enum ?? [])].sort();
    if (severities.length !== 3 || !["high", "low", "medium"].every((s) => severities.includes(s))) {
      failures.push(`${label}: severity enum must be low|medium|high, got ${JSON.stringify(severity.enum)}`);
    }
  }
}

const CONCERN_PRODUCERS: Producer[] = [
  {
    name: "developer-output",
    schema: () => resolveStepSchema(pluginRoot, "developer", "develop"),
    base: { status: "ok", summary: "Implemented the change" },
  },
  {
    name: "fact-finder-output",
    schema: () => resolveStepSchema(pluginRoot, "fact-finder", "research"),
    base: { status: "ok", summary: "Investigated", findings: "The API supports retries" },
  },
  {
    name: "plan",
    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-plan"),
    base: { iteration: 1, milestones: [], itemOutlines: [] },
  },
  {
    name: "decisions",
    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-wave-report"),
    base: { decision: "continue" },
  },
  {
    name: "wave-closeup",
    schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
    base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
  },
  {
    name: "plan-closeup",
    schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
    base: { iteration: 1, status: "complete", summary: "Plan complete" },
  },
  {
    name: "architect-closeup",
    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
    base: { iteration: 1, status: "complete", summary: "Plan complete" },
  },
];

const REVIEW_PRODUCERS: Producer[] = [
  {
    name: "qa",
    schema: () => resolveStepSchema(pluginRoot, "qa", "qa", ["fix", "optional", "architect", "dismiss"]),
    base: { status: "approved", summary: "Tests are sound", suggestions: [] },
  },
  {
    name: "reviewer",
    schema: () => resolveStepSchema(pluginRoot, "reviewer", "review", ["fix", "optional", "architect", "dismiss"]),
    base: { status: "approved", summary: "Change is sound", suggestions: [] },
  },
  {
    name: "review-file",
    schema: () =>
      JSON.parse(fs.readFileSync(path.resolve(pluginRoot, "config/schemas/review.schema.json"), "utf8")),
    base: { status: "approved", summary: "Change is sound", suggestions: [] },
  },
];

describe("Concern producer schemas", () => {
  it("inlines the concern definition into every producer schema without external refs", () => {
    const failures: string[] = [];

    for (const producer of CONCERN_PRODUCERS) {
      const schema = producer.schema();
      const validate = validator(schema);
      const label = producer.name;

      const item = arrayItem(schema, "concerns");
      if (!item) {
        failures.push(`${label}: missing inline concerns[]`);
        continue;
      }
      hasConcernShape(schema, item, label, failures);

      if (!validate({ ...producer.base, concerns: [{ kind: "blocker", summary: "Dependency missing" }] })) {
        failures.push(`${label}: minimal concern rejected (${validationErrors(validate)})`);
      }
      if (
        !validate({
          ...producer.base,
          concerns: [
            {
              kind: "risk",
              summary: "Flaky gate",
              detail: "Retries hide real failures",
              severity: "high",
              location: { file: "src/core/example.ts", line: 3 },
              affects: ["item-a"],
            },
          ],
        })
      ) {
        failures.push(`${label}: fully populated concern rejected (${validationErrors(validate)})`);
      }
      if (validate({ ...producer.base, concerns: [{ kind: "bug", summary: "Unknown kind" }] })) {
        failures.push(`${label}: unknown concern kind accepted`);
      }
      if (validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Severity", severity: "critical" }] })) {
        failures.push(`${label}: unknown concern severity accepted`);
      }
      if (validate({ ...producer.base, concerns: [{ kind: "risk" }] })) {
        failures.push(`${label}: concern without summary accepted`);
      }

      const refs = externalRefs(schema);
      if (refs.length > 0) {
        failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("inlines the remarkable decision definition with chosen, alternatives, and why", () => {
    const failures: string[] = [];

    for (const producer of CONCERN_PRODUCERS) {
      const schema = producer.schema();
      const validate = validator(schema);
      const label = producer.name;

      let remarkableProperty: string | undefined;
      for (const [property, raw] of Object.entries(schema.properties ?? {})) {
        const item = (() => {
          const prop = resolveRef(schema, raw);
          return prop?.type === "array" ? resolveRef(schema, prop.items) : undefined;
        })();
        const required: string[] = item?.required ?? [];
        if (["chosen", "alternatives", "why"].every((key) => required.includes(key))) {
          remarkableProperty = property;
          break;
        }
      }

      if (!remarkableProperty) {
        failures.push(`${label}: missing inline remarkable decision array`);
        continue;
      }

      const remarkable = [{ chosen: "Inline shared schema definitions", alternatives: ["Cross-file $ref"], why: "Ajv validates each producer schema standalone" }];
      if (!validate({ ...producer.base, [remarkableProperty]: remarkable })) {
        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
      }
      if (validate({ ...producer.base, [remarkableProperty]: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
        failures.push(`${label}: remarkable decision without alternatives accepted`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("adds newConcerns to review and QA schemas outside the triage suggestions", () => {
    const failures: string[] = [];

    for (const producer of REVIEW_PRODUCERS) {
      const schema = producer.schema();
      const validate = validator(schema);
      const label = producer.name;

      const item = arrayItem(schema, "newConcerns");
      if (!item) {
        failures.push(`${label}: missing inline newConcerns[]`);
        continue;
      }
      hasConcernShape(schema, item, label, failures);

      if (!validate({ ...producer.base, newConcerns: [{ kind: "assumption", summary: "Assumed atomic writes" }] })) {
        failures.push(`${label}: valid new concern rejected (${validationErrors(validate)})`);
      }
      if (validate({ ...producer.base, newConcerns: [{ kind: "bug", summary: "Unknown kind" }] })) {
        failures.push(`${label}: unknown new-concern kind accepted`);
      }
      if (
        validate({
          ...producer.base,
          newConcerns: [{ kind: "risk", summary: "Severity", severity: "critical" }],
        })
      ) {
        failures.push(`${label}: unknown new-concern severity accepted`);
      }
      if (validate({ ...producer.base, newConcerns: [{ kind: "risk" }] })) {
        failures.push(`${label}: new concern without summary accepted`);
      }
      if (
        !validate({
          ...producer.base,
          suggestions: [{ id: "s-1", disposition: "dismiss", summary: "Duplicate of an existing concern" }],
        })
      ) {
        failures.push(
          `${label}: dismiss without detail must pass the JSON schema; the concern store enforces detail`
        );
      }

      const refs = externalRefs(schema);
      if (refs.length > 0) {
        failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("adds concernResolutions with resolve, carry, and propagate to close-up schemas", () => {
    const failures: string[] = [];
    const closeups: Producer[] = [
      {
        name: "wave-closeup",
        schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
      },
      {
        name: "plan-closeup",
        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
        base: { iteration: 1, status: "complete", summary: "Plan complete" },
      },
      {
        name: "architect-closeup",
        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
        base: { iteration: 1, status: "complete", summary: "Plan complete" },
      },
    ];

    for (const closeup of closeups) {
      const schema = closeup.schema();
      const validate = validator(schema);
      const label = closeup.name;

      const item = arrayItem(schema, "concernResolutions");
      if (!item) {
        failures.push(`${label}: missing inline concernResolutions[]`);
        continue;
      }
      const required: string[] = item.required ?? [];
      if (!required.includes("id") || !required.includes("action")) {
        failures.push(`${label}: concernResolutions must require id and action`);
      }
      const actions = resolveRef(schema, item.properties?.action)?.enum ?? [];
      if (["resolve", "carry", "propagate"].some((action) => !actions.includes(action))) {
        failures.push(`${label}: action enum must be resolve|carry|propagate, got ${JSON.stringify(actions)}`);
      }

      if (
        !validate({
          ...closeup.base,
          concernResolutions: [
            { id: "c-1", action: "resolve" },
            { id: "c-2", action: "carry", note: "Needs an architect decision" },
            { id: "c-3", action: "propagate" },
          ],
        })
      ) {
        failures.push(`${label}: valid concern resolutions rejected (${validationErrors(validate)})`);
      }
      if (validate({ ...closeup.base, concernResolutions: [{ id: "c-4", action: "dismiss" }] })) {
        failures.push(`${label}: dismiss action accepted for a close-up resolution`);
      }
      if (validate({ ...closeup.base, concernResolutions: [{ action: "resolve" }] })) {
        failures.push(`${label}: resolution without concern id accepted`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("leaves triage, infra, and plan-edit schemas untouched", () => {
    const untouched: Producer[] = [
      { name: "triage", schema: () => resolveStepSchema(pluginRoot, "triage", "triage"), base: {} },
      { name: "infra", schema: () => resolveStepSchema(pluginRoot, "infra", "infra"), base: {} },
      { name: "plan-edits", schema: () => resolveStepSchema(pluginRoot, "pm", "pm-edits"), base: {} },
    ];

    for (const producer of untouched) {
      const schema = producer.schema();
      for (const field of [
        "concerns",
        "newConcerns",
        "remarkable",
        "remarkableDecisions",
        "concernResolutions",
        "concernConfirms",
        "concernResolution",
      ]) {
        expect(schema.properties?.[field]).toBeUndefined();
      }
    }
  });

  it("adds remarkable and lowercase detail to reviewer, plan-reviewer, QA, and file review schemas", () => {
    const failures: string[] = [];
    const producers: Producer[] = [
      ...REVIEW_PRODUCERS,
      {
        name: "plan-reviewer",
        schema: () =>
          resolveStepSchema(pluginRoot, "plan-reviewer", "plan-review", [
            "fix",
            "optional",
            "architect",
            "dismiss",
          ]),
        base: { status: "approved", summary: "Plan is sound", suggestions: [] },
      },
    ];

    for (const producer of producers) {
      const schema = producer.schema();
      const validate = validator(schema);
      const label = producer.name;

      const item = arrayItem(schema, "remarkable");
      if (!item) {
        failures.push(`${label}: missing inline remarkable[]`);
        continue;
      }
      const required: string[] = item.required ?? [];
      for (const key of ["chosen", "alternatives", "why"]) {
        if (!required.includes(key)) failures.push(`${label}: remarkable.${key} must be required`);
      }

      if (
        !validate({
          ...producer.base,
          remarkable: [
            {
              chosen: "Keep review output in one schema",
              alternatives: ["A separate remarkable artifact"],
              why: "One vocabulary keeps triage uniform",
            },
          ],
        })
      ) {
        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
      }
      if (validate({ ...producer.base, remarkable: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
        failures.push(`${label}: remarkable without alternatives accepted`);
      }

      const detailed = {
        kind: "risk",
        summary: "Lowercase detail",
        detail: "carried through validation",
      };
      const output = { ...producer.base, newConcerns: [detailed] };
      if (!validate(output)) {
        failures.push(`${label}: lowercase concern detail rejected (${validationErrors(validate)})`);
      } else if (output.newConcerns[0]?.detail !== "carried through validation") {
        failures.push(`${label}: lowercase concern detail was not preserved`);
      }
      if (validate({ ...producer.base, newConcerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
        failures.push(`${label}: capital-D Detail accepted`);
      }

      const refs = externalRefs(schema);
      if (refs.length > 0) failures.push(`${label}: external $refs must be inlined, found ${refs.join(", ")}`);
    }

    expect(failures).toEqual([]);
  });

  it("adds concernConfirms and concernResolution to architect report decisions", () => {
    const failures: string[] = [];
    const steps = ["architect-wave-report", "architect-consult-item", "architect-consult-nonitem"];

    for (const step of steps) {
      const schema = resolveStepSchema(pluginRoot, "architect", step) as JsonSchema;
      const validate = validator(schema);
      const base = { decision: "continue" };

      const confirms = arrayItem(schema, "concernConfirms");
      if (!confirms) {
        failures.push(`${step}: missing inline concernConfirms[]`);
      } else {
        const required: string[] = confirms.required ?? [];
        if (!required.includes("id") || !required.includes("confirm")) {
          failures.push(`${step}: concernConfirms must require id and confirm`);
        }
        const confirmValues = resolveRef(schema, confirms.properties?.confirm)?.enum ?? [];
        if (["accept", "reject"].some((value) => !confirmValues.includes(value))) {
          failures.push(`${step}: confirm enum must be accept|reject, got ${JSON.stringify(confirmValues)}`);
        }

        if (
          !validate({
            ...base,
            concernConfirms: [
              { id: "c-1", confirm: "accept" },
              { id: "c-2", confirm: "reject", note: "Keep it open for the next iteration" },
            ],
          })
        ) {
          failures.push(`${step}: valid concern confirmations rejected (${validationErrors(validate)})`);
        }
        if (validate({ ...base, concernConfirms: [{ id: "c-3", confirm: "maybe" }] })) {
          failures.push(`${step}: unknown confirm value accepted`);
        }
        if (validate({ ...base, concernConfirms: [{ confirm: "accept" }] })) {
          failures.push(`${step}: confirmation without a concern id accepted`);
        }
      }

      const resolution = resolveRef(schema, schema.properties?.concernResolution);
      if (!resolution) {
        failures.push(`${step}: missing concernResolution`);
      } else {
        const required: string[] = resolution.required ?? [];
        if (!required.includes("id") || !required.includes("action")) {
          failures.push(`${step}: concernResolution must require id and action`);
        }
        const actions = resolveRef(schema, resolution.properties?.action)?.enum ?? [];
        if (["resolve", "carry"].some((action) => !actions.includes(action))) {
          failures.push(`${step}: concernResolution action must include resolve|carry, got ${JSON.stringify(actions)}`);
        }
        if (actions.includes("propagate")) {
          failures.push(`${step}: decision concernResolution must not propagate`);
        }

        if (!validate({ ...base, concernResolution: { id: "c-4", action: "resolve" } })) {
          failures.push(`${step}: valid concern resolution rejected (${validationErrors(validate)})`);
        }
        if (!validate({ ...base, concernResolution: { id: "c-5", action: "carry" } })) {
          failures.push(`${step}: valid carry resolution rejected (${validationErrors(validate)})`);
        }
        if (validate({ ...base, concernResolution: { id: "c-6", action: "propagate" } })) {
          failures.push(`${step}: propagate action accepted for a decision resolution`);
        }
        if (validate({ ...base, concernResolution: { action: "resolve" } })) {
          failures.push(`${step}: resolution without a concern id accepted`);
        }
      }

      if (
        !validate({
          ...base,
          concerns: [{ kind: "risk", summary: "Lowercase detail", detail: "stored as written" }],
        })
      ) {
        failures.push(`${step}: lowercase concern detail rejected (${validationErrors(validate)})`);
      }
      if (validate({ ...base, concerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
        failures.push(`${step}: capital-D Detail accepted`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("adds concernConfirms to plan close-up outputs while preserving concernResolutions", () => {
    const failures: string[] = [];
    const closeups: Producer[] = [
      {
        name: "plan-closeup",
        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
        base: { iteration: 1, status: "complete", summary: "Plan complete" },
      },
      {
        name: "architect-closeup",
        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
        base: { iteration: 1, status: "complete", summary: "Plan complete" },
      },
    ];

    for (const closeup of closeups) {
      const schema = closeup.schema();
      const validate = validator(schema);
      const label = closeup.name;

      const confirms = arrayItem(schema, "concernConfirms");
      if (!confirms) {
        failures.push(`${label}: missing inline concernConfirms[]`);
      } else {
        const required: string[] = confirms.required ?? [];
        if (!required.includes("id") || !required.includes("confirm")) {
          failures.push(`${label}: concernConfirms must require id and confirm`);
        }
        const confirmValues = resolveRef(schema, confirms.properties?.confirm)?.enum ?? [];
        if (["accept", "reject"].some((value) => !confirmValues.includes(value))) {
          failures.push(`${label}: confirm enum must be accept|reject, got ${JSON.stringify(confirmValues)}`);
        }

        if (
          !validate({
            ...closeup.base,
            concernConfirms: [
              { id: "c-1", confirm: "accept" },
              { id: "c-2", confirm: "reject", note: "Carry into the next iteration" },
            ],
          })
        ) {
          failures.push(`${label}: valid concern confirmations rejected (${validationErrors(validate)})`);
        }
        if (validate({ ...closeup.base, concernConfirms: [{ id: "c-3", confirm: "maybe" }] })) {
          failures.push(`${label}: unknown confirm value accepted`);
        }
        if (validate({ ...closeup.base, concernConfirms: [{ confirm: "accept" }] })) {
          failures.push(`${label}: confirmation without a concern id accepted`);
        }
      }

      const resolutions = arrayItem(schema, "concernResolutions");
      if (!resolutions) {
        failures.push(`${label}: missing inline concernResolutions[]`);
      } else if (
        !validate({
          ...closeup.base,
          concernResolutions: [
            { id: "c-4", action: "resolve" },
            { id: "c-5", action: "carry", note: "Needs an architect decision" },
            { id: "c-6", action: "propagate" },
          ],
        })
      ) {
        failures.push(`${label}: close-up resolutions must remain validate-able (${validationErrors(validate)})`);
      }

      if (
        !validate({
          ...closeup.base,
          concerns: [{ kind: "assumption", summary: "Lowercase detail", detail: "kept intact" }],
        })
      ) {
        failures.push(`${label}: lowercase concern detail rejected (${validationErrors(validate)})`);
      }
      if (validate({ ...closeup.base, concerns: [{ kind: "assumption", summary: "Capital detail", Detail: "wrong field" }] })) {
        failures.push(`${label}: capital-D Detail accepted`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("accepts structured concerns and remarkable across every developer, fact-finder, and plan step", () => {
    const failures: string[] = [];
    const producers: Producer[] = [
      ...["develop", "poc", "test-assumptions", "test-first", "simple-implement", "fix-round"].map(
        (step): Producer => ({
          name: `developer/${step}`,
          schema: () => resolveStepSchema(pluginRoot, "developer", step),
          base: { status: "ok", summary: "Implemented the change" },
        })
      ),
      {
        name: "fact-finder/research",
        schema: () => resolveStepSchema(pluginRoot, "fact-finder", "research"),
        base: { status: "ok", summary: "Investigated", findings: "The API supports retries" },
      },
      {
        name: "architect/architect-plan",
        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-plan"),
        base: { iteration: 1, milestones: [], itemOutlines: [] },
      },
      {
        name: "architect/architect-revise",
        schema: () => resolveStepSchema(pluginRoot, "architect", "architect-revise"),
        base: { iteration: 1, milestones: [], itemOutlines: [] },
      },
      {
        name: "wave-closeup",
        schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
      },
      {
        name: "plan-closeup",
        schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
        base: { iteration: 1, status: "complete", summary: "Plan complete" },
      },
    ];

    for (const producer of producers) {
      const schema = producer.schema();
      const validate = validator(schema);
      const label = producer.name;

      const concernItem = arrayItem(schema, "concerns");
      if (!concernItem) {
        failures.push(`${label}: missing inline concerns[]`);
        continue;
      }
      hasConcernShape(schema, concernItem, label, failures);

      const detailed = {
        kind: "risk",
        summary: "Flaky gate",
        detail: "Retries hide real failures",
        severity: "high",
      };
      const output = { ...producer.base, concerns: [detailed] };
      if (!validate(output)) {
        failures.push(`${label}: concern with lowercase detail rejected (${validationErrors(validate)})`);
      } else if (output.concerns[0]?.detail !== "Retries hide real failures") {
        failures.push(`${label}: lowercase detail was not preserved`);
      }
      if (validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Capital detail", Detail: "wrong field" }] })) {
        failures.push(`${label}: capital-D Detail accepted`);
      }

      const remarkableItem = arrayItem(schema, "remarkable");
      if (!remarkableItem) {
        failures.push(`${label}: missing inline remarkable[]`);
        continue;
      }
      if (
        !validate({
          ...producer.base,
          remarkable: [
            {
              chosen: "Inline shared definitions",
              alternatives: ["External $ref"],
              why: "Every producer schema validates standalone",
            },
          ],
        })
      ) {
        failures.push(`${label}: valid remarkable decision rejected (${validationErrors(validate)})`);
      }
      if (validate({ ...producer.base, remarkable: [{ chosen: "Incomplete", why: "Missing alternatives" }] })) {
        failures.push(`${label}: remarkable without alternatives accepted`);
      }
    }

    expect(failures).toEqual([]);
  });
});

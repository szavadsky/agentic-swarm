/**
 * The pin gate: one `gate.yaml` per pinned build, written by promote after it
 * gates the clean export. A launch reads its own pin and refuses a pin with no
 * record, an unreadable one, or a red gate; the override flag buys the launch
 * only by recording its reason in the run's records.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";

/** The record promote writes at the pin build's root. */
export const PIN_GATE_FILE = "gate.yaml";

const verdictSchema = z.enum(["pass", "fail"]);

/**
 * One pin's gate result. The writer serialises JSON, which is YAML, so the
 * reader parses it with the same parser as every other artifact.
 *
 * `typecheck` and `tests` are the original two gates; `format`, `lint` and
 * `schemaValidation` were added when promote began running every declared
 * gate. They are optional so a pin built before them still reads as a record
 * of the gates it did run rather than as a malformed file.
 */
export const pinGateSchema = z
  .object({
    rev: z.string().min(1),
    typecheck: verdictSchema,
    tests: verdictSchema,
    format: verdictSchema.optional(),
    lint: verdictSchema.optional(),
    schemaValidation: verdictSchema.optional(),
    at: z.iso.datetime(),
  })
  .strict();

export type PinGate = z.infer<typeof pinGateSchema>;

/** Every verdict key, in the order a red gate names them. */
type PinGateVerdictKey = Exclude<keyof PinGate, "rev" | "at">;
const VERDICT_KEYS: readonly PinGateVerdictKey[] = [
  "typecheck",
  "tests",
  "format",
  "lint",
  "schemaValidation",
];

/** The pins root promote writes under; a relocated root names it in FACTORY_PIN_ROOT. */
export function pinsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(
    env.FACTORY_PIN_ROOT ??
      path.join(os.homedir(), ".local/share/factory/pins"),
  );
}

/**
 * The pin build a package directory is, or undefined when it is no pin. A
 * build sits directly under the pins root; the sibling `current` symlink
 * promote maintains also marks a root relocated without the environment.
 */
export function pinBuildOf(
  packageDir: string,
  pinsDir: string = pinsRoot(),
): string | undefined {
  const build = path.resolve(packageDir);
  const parent = path.dirname(build);
  if (parent === path.resolve(pinsDir)) return build;
  const current = fs.lstatSync(path.join(parent, "current"), {
    throwIfNoEntry: false,
  });
  return current?.isSymbolicLink() ? build : undefined;
}

type GateRead = { ok: true; gate: PinGate } | { ok: false; problem: string };

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** One pin's recorded gate, or why the file cannot be trusted. */
function readGate(build: string): GateRead {
  const file = path.join(build, PIN_GATE_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return {
        ok: false,
        problem: "gate.yaml is missing (a pin built before the gate record)",
      };
    return {
      ok: false,
      problem: `gate.yaml is unreadable: ${(err as Error).message}`,
    };
  }
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    return {
      ok: false,
      problem: `gate.yaml is invalid: ${(err as Error).message}`,
    };
  }
  const parsed = pinGateSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      problem: `gate.yaml is invalid: ${describeIssues(parsed.error)}`,
    };
  const name = path.basename(build);
  // A build is named by its rev; a record copied from another pin must not pass.
  if (/^[0-9a-f]{7,40}$/.test(name) && parsed.data.rev !== name)
    return {
      ok: false,
      problem: `gate.yaml records rev ${parsed.data.rev}, not this build ${name}`,
    };
  return { ok: true, gate: parsed.data };
}

/** The one remedy both refusals name: re-promote, or override with a reason. */
const REMEDY =
  "Re-promote the revision, or pass --pin-gate-override <reason> to run it anyway.";

/**
 * Why this pin may not launch, or undefined when its recorded gate is
 * all-pass. The text names the pin, the failing gates and both remedies.
 */
export function pinRefusal(build: string): string | undefined {
  const read = readGate(build);
  if (!read.ok) return `pin ${build} cannot launch: ${read.problem}. ${REMEDY}`;
  const gate = read.gate;
  const red = VERDICT_KEYS.filter((key) => gate[key] === "fail");
  if (red.length === 0) return undefined;
  const failed = red.map((key) => `${key} fail`).join(", ");
  const recorded = `recorded ${gate.at}, rev ${gate.rev}`;
  return `pin ${build} cannot launch: gate red: ${failed} (${recorded}). ${REMEDY}`;
}

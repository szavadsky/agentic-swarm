/**
 * The infra turn's artifact: the gate commands the kernel runs, and the status
 * the turn observed for each. Repo-config gates always win; discovery fills in
 * only when the repo configured none.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import type { GateConfig, KernelRuntime } from "./types.js";

/** Goal-relative path of the infra turn's output. */
export const INFRA_FILE = "infra.yaml";

export const infraGateSchema = z
  .object({
    name: z.string().min(1),
    command: z.string().min(1),
    speed: z.enum(["fast", "slow"]),
    status: z.enum(["green", "yellow", "red"]),
    flaky: z.boolean().optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();

/** The infra turn's output shape; `factory schemas` exports it for editors. */
export const infraSchema = z
  .object({ gates: z.array(infraGateSchema) })
  .strict()
  .refine(
    (report) =>
      new Set(report.gates.map((gate) => gate.name)).size ===
      report.gates.length,
    "gate names must not repeat",
  );

export type InfraGate = z.infer<typeof infraGateSchema>;
export type InfraReport = { gates: InfraGate[] };

/** A pack gate: the runnable command plus the status the infra turn observed. */
export interface PackGate {
  id: string;
  command: string;
  speed?: InfraGate["speed"];
  status?: InfraGate["status"];
  flaky?: boolean;
  notes?: string;
}

/** An infra artifact that does not parse as `infra.yaml`; the path names it. */
export class InfraError extends Error {}

export function infraPath(goalDir: string): string {
  return path.join(goalDir, INFRA_FILE);
}

/** The infra turn's report, or undefined when it wrote none. */
export function readInfra(goalDir: string): InfraReport | undefined {
  const file = infraPath(goalDir);
  if (!fs.existsSync(file)) return undefined;
  let raw: unknown;
  try {
    raw = yaml.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new InfraError(`${file}: not valid YAML: ${(err as Error).message}`);
  }
  const parsed = infraSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new InfraError(
      `${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
  }
  return parsed.data;
}

/** The gates a discovered report supplies, as the kernel runs them. */
function discoveredGates(report: InfraReport): GateConfig[] {
  return report.gates.map((gate) => ({
    id: gate.name,
    command: gate.command,
    serial: [],
  }));
}

/**
 * The gates the kernel runs: repo-config gates when any are configured, else
 * the infra turn's discovery. A configured gate is never replaced by a
 * discovered one.
 */
export function resolveGates(
  goalDir: string,
  configured: readonly GateConfig[],
): readonly GateConfig[] {
  if (configured.length > 0) return configured;
  const report = readInfra(goalDir);
  return report ? discoveredGates(report) : [];
}

/** The configured and discovered gates with the observed status merged in. */
export function packGates(
  goalDir: string,
  configured: readonly GateConfig[],
): PackGate[] {
  const report = readInfra(goalDir);
  const observed = new Map(
    (report?.gates ?? []).map((gate) => [gate.name, gate]),
  );
  const gates =
    configured.length > 0
      ? configured
      : discoveredGates(report ?? { gates: [] });
  return gates.map((gate) => {
    const status = observed.get(gate.id);
    return {
      id: gate.id,
      command: gate.command,
      ...(status
        ? {
            speed: status.speed,
            status: status.status,
            ...(status.flaky !== undefined ? { flaky: status.flaky } : {}),
            ...(status.notes !== undefined ? { notes: status.notes } : {}),
          }
        : {}),
    };
  });
}

/** The observed status facts of one gate, in the order prompts read them. */
function statusFacts(gate: PackGate): string[] {
  return [gate.status, gate.speed, gate.flaky ? "flaky" : undefined].filter(
    (fact): fact is string => fact !== undefined,
  );
}

/**
 * The gate list a prompt carries: one `- id: command` line per gate, with the
 * infra turn's status appended when it reported one. `none` when empty.
 */
export function gateCommandsText(
  goalDir: string,
  configured: readonly GateConfig[],
): string {
  return (
    packGates(goalDir, configured)
      .map((gate) => {
        const facts = statusFacts(gate);
        return `- ${gate.id}: ${gate.command}${
          facts.length > 0 ? ` — ${facts.join(", ")}` : ""
        }`;
      })
      .join("\n") || "none"
  );
}

/** One-line notes: the pack is an index, and a note is never a file dump. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The pack's `## Infra` section: setup, then each resolved gate with the
 * status, speed and flakiness the infra turn observed, and its notes.
 */
export function renderInfraSection(
  setup: readonly string[],
  gates: readonly PackGate[],
): string {
  const lines = [
    "## Infra",
    `- setup: ${setup.length ? setup.join(" && ") : "none"}`,
  ];
  for (const gate of gates) {
    const facts = statusFacts(gate);
    lines.push(
      `- gate ${gate.id}: ${gate.command}${
        facts.length > 0 ? ` — ${facts.join(", ")}` : ""
      }`,
    );
    if (gate.notes !== undefined)
      lines.push(`  - notes: ${oneLine(gate.notes)}`);
  }
  return lines.join("\n");
}

/** Marks the kernel's appended section so a second pass never duplicates it. */
const ATTACH_MARKER = "<!-- factory-infra -->";

/**
 * Appends the infra report to the pack the front wrote, so the architect reads
 * the gates and their status before its turn. A goal with no infra artifact
 * keeps the front's pack untouched.
 */
export async function attachInfraToPack(
  runtime: KernelRuntime,
  packPath: string,
): Promise<void> {
  if (!fs.existsSync(packPath)) return;
  const report = readInfra(runtime.store.goalDir);
  // Nothing to add when the turn found no gates: the front's pack already
  // carries the configured commands in its prompt.
  if (!report || report.gates.length === 0) return;
  const rel = path.relative(runtime.store.goalDir, packPath);
  const pack = await runtime.store.readFile(rel);
  if (pack === null || pack.includes(ATTACH_MARKER)) return;
  const section = [
    ATTACH_MARKER,
    renderInfraSection(
      runtime.configs.repo.setup,
      packGates(runtime.store.goalDir, runtime.configs.repo.gates),
    ),
    "",
  ].join("\n");
  await runtime.store.writeFile(rel, `${pack.trimEnd()}\n\n${section}`);
}

/** Escalation, fallback, pool, portability, registration, scout and tmp-headroom checks. */

import fs from "node:fs";
import path from "node:path";
import { OMP_ID } from "../../harness/omp/types.js";
import { formatFindings } from "../findings.js";
import type { Finding } from "../findings.js";
import {
  fallbackChangesPrimary,
  fallbackTierSubscription,
} from "../flow-context-targets.js";
import { FRONT_TRIVIAL_FLOW } from "../front.js";
import { BOUNDARY_STEPS, BUILTIN_INGESTION_IDS } from "../types.js";
import type {
  AliasConfig,
  BuiltinIngestionId,
  ConfigBundle,
  FallbackModelConfig,
  FlowDefinition,
  ProcessConfig,
} from "../types.js";

/** Free bytes the temp filesystem must hold when `limits.minTmpFreeBytes` is unset. */
export const DEFAULT_MIN_TMP_FREE_BYTES = 2 * 1024 * 1024 * 1024;

export class PreflightError extends Error {
  readonly findings: Finding[];
  readonly report: string;

  constructor(findings: Finding[]) {
    const report = formatFindings(
      `pre-flight refused this launch (${findings.length} violation(s)):`,
      findings,
    );
    super(report);
    this.name = "PreflightError";
    this.findings = findings;
    this.report = report;
  }
}

/**
 * Whether `tmpdir` has `minBytes` free. A full temp filesystem is an
 * infrastructure loss, not a task failure: the launch refuses before it writes
 * anything, so the cause names the operator action.
 */
export function tmpHeadroom(
  tmpdir: string,
  statfs: (path: string) => ReturnType<typeof fs.statfsSync>,
  minBytes: number,
): { ok: true } | { ok: false; cause: string } {
  try {
    const stats = statfs(tmpdir);
    const free = BigInt(stats.bavail) * BigInt(stats.bsize);
    if (free >= BigInt(minBytes)) return { ok: true };
    return {
      ok: false,
      cause: `temporary directory "${tmpdir}" has insufficient headroom: ${free} bytes free, need ${minBytes} bytes. operator: purge ${tmpdir}`,
    };
  } catch (e) {
    return {
      ok: false,
      cause: `failed to stat "${tmpdir}": ${(e as Error).message}`,
    };
  }
}

/**
 * An alias's `escalateTo` must name a configured alias and its chain must end:
 * a missing name or a cycle would only fail mid-turn, after the plan spent.
 */
export function escalationFindings(
  aliases: Record<string, AliasConfig>,
  file: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [name, alias] of Object.entries(aliases)) {
    if (!alias.escalateTo) continue;
    if (alias.escalateTo === "default") {
      findings.push({
        file,
        key: `aliases.${name}.escalateTo`,
        message: `escalateTo "default" is reserved for "no tier override"; it would re-run the PM's own alias`,
      });
      continue;
    }
    if (!aliases[alias.escalateTo]) {
      findings.push({
        file,
        key: `aliases.${name}.escalateTo`,
        message: `escalateTo "${alias.escalateTo}" names no run-config alias`,
      });
      continue;
    }
    const seen = new Set<string>([name]);
    let current: string | undefined = alias.escalateTo;
    while (current) {
      if (seen.has(current)) {
        findings.push({
          file,
          key: `aliases.${name}.escalateTo`,
          message: `escalateTo chain forms a cycle: ${[...seen, current].join(" -> ")}`,
        });
        break;
      }
      seen.add(current);
      current = aliases[current]?.escalateTo;
    }
  }
  return findings;
}

/**
 * A fallback may name another alias, so its ladder is that alias's chain. A
 * missing name or a cycle would only fail while resolving a turn, after the
 * plan spent, so pre-flight refuses either here. Every alias is a walk root,
 * so an edge another root already reached is walked again; key and message
 * identify it, and it is reported once.
 */
export function fallbackAliasFindings(
  aliases: Record<string, AliasConfig>,
  file: string,
): Finding[] {
  const findings: Finding[] = [];
  const walk = (name: string, path: readonly string[]): void => {
    for (const [index, fallback] of (
      aliases[name]!.fallbacks ?? []
    ).entries()) {
      if (!("alias" in fallback)) continue;
      const target = fallback.alias;
      const key = `aliases.${name}.fallbacks.${index}.alias`;
      if (!aliases[target]) {
        findings.push({
          file,
          key,
          message: `fallback alias "${target}" names no run-config alias`,
        });
        continue;
      }
      const at = path.indexOf(target);
      if (at !== -1) {
        findings.push({
          file,
          key,
          message: `fallback alias chain forms a cycle: ${[...path.slice(at), target].join(" -> ")}`,
        });
        continue;
      }
      walk(target, [...path, target]);
    }
  };
  for (const name of Object.keys(aliases)) walk(name, [name]);
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    unique.set(`${finding.key}\u0000${finding.message}`, finding);
  }
  return [...unique.values()];
}

/**
 * Exactly the aliases process config names, each with the step that names it:
 * every boundary step, every architecture reviewer, every architecture and PM
 * flow step, every flow step, every step alternate and every different-model
 * follow-up. Nothing is derived from a role name, so a renamed alias is the
 * only requirement.
 */
/** Every alias one flow names, with its step context. */
function noteFlowAliases(
  note: (alias: string, ref: string) => void,
  name: string,
  flow: FlowDefinition,
): void {
  for (const step of flow.steps) {
    if (step.alias) note(step.alias, `flow "${name}" step "${step.id}"`);
    for (const alternate of step.alternates ?? []) {
      note(alternate, `flow "${name}" step "${step.id}" alternates`);
    }
    if (step.followUp?.mode === "different-model" && step.followUp.alias) {
      note(step.followUp.alias, `flow "${name}" step "${step.id}" follow-up`);
    }
  }
}

/** Every alias the architecture flow names, with its step context. */
function noteArchitectureAliases(
  note: (alias: string, ref: string) => void,
  process: ProcessConfig,
): void {
  for (const alias of process.architecture.reviewers) {
    note(alias, "architecture reviewer");
  }
  for (const flow of process.architecture.flows ?? []) {
    for (const step of flow.steps) {
      if (step.alias) note(step.alias, `architecture flow step "${step.id}"`);
    }
  }
}

/** Every alias a config-only PM flow step names. */
function notePmAliases(
  note: (alias: string, ref: string) => void,
  process: ProcessConfig,
): void {
  for (const step of process.pm?.steps ?? []) {
    if (step.alias) note(step.alias, `pm flow step "${step.id}"`);
  }
}

/** Every alias a non-built-in ingestion step names. */
function noteIngestionAliases(
  note: (alias: string, ref: string) => void,
  process: ProcessConfig,
): void {
  for (const step of process.ingestion ?? []) {
    if (!BUILTIN_INGESTION_IDS.includes(step.id as BuiltinIngestionId)) {
      note(step.alias ?? "pm", `ingestion step "${step.id}"`);
    }
  }
}

export function requiredAliases(process: ProcessConfig): Map<string, string> {
  const refs = new Map<string, string>();
  const note = (alias: string, ref: string): void => {
    if (!refs.has(alias)) refs.set(alias, ref);
  };
  for (const step of BOUNDARY_STEPS) {
    note(process.boundary[step].alias, `boundary step "${step}"`);
  }
  noteArchitectureAliases(note, process);
  notePmAliases(note, process);
  for (const [name, flow] of Object.entries(process.flows)) {
    noteFlowAliases(note, name, flow);
  }
  noteIngestionAliases(note, process);
  return refs;
}

/**
 * The front's trivial class implements in the front's own session, so no step
 * in that flow ever follows up: a `different-model` or `de-novo` follow-up
 * there would read as applied and change nothing. Pre-flight refuses it
 * rather than let the config claim a follow-up the turn ignores.
 */
export function trivialFollowUpFindings(
  process: ProcessConfig,
  file: string,
): Finding[] {
  const flowName = FRONT_TRIVIAL_FLOW;
  const flow = process.flows[flowName];
  if (!flow) return [];
  return flow.steps
    .filter((step) => step.followUp !== undefined)
    .map((step) => ({
      file,
      key: `flows.${flowName}.steps.${step.id}.followUp`,
      message: `step "${step.id}" of flow "${flowName}" declares a follow-up, but a trivial task implements in the front's session and never follows up`,
    }));
}

function registeredMessage(
  harness: string,
  registered: ReadonlySet<string>,
): string {
  return `harness "${harness}" is not registered (registered: ${[...registered].join(", ") || "none"})`;
}

/** Whether a binary is executable, by absolute path or through PATH. */
export function isExecutable(value: string | undefined): boolean {
  if (!value) return false;
  if (!value.includes(path.sep)) return Bun.which(value) !== null;
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * A configured sandbox must be present on the machine before any child can
 * start: a missing wrapper would otherwise surface mid-turn, after pre-flight.
 */
export function sandboxFindings(
  configs: ConfigBundle,
  file: string,
): Finding[] {
  const sandbox = configs.run.sandbox;
  if (!sandbox || isExecutable(sandbox.binary)) return [];
  return [
    {
      file,
      key: "sandbox.binary",
      message: `sandbox binary "${sandbox.binary}" is not executable or not on PATH`,
    },
  ];
}

/**
 * A portability edge names the harness a session may cross from and to. An
 * endpoint no harness registers is a typo that would otherwise parse clean and
 * mean "no edge", so the crossing it was declared to allow would restart de
 * novo with no finding.
 */
export function portabilityFindings(
  configs: ConfigBundle,
  file: string,
  registered: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const [index, edge] of (configs.run.portability ?? []).entries()) {
    for (const side of ["from", "to"] as const) {
      const harness = edge[side];
      if (registered.has(harness)) continue;
      findings.push({
        file,
        key: `portability.${index}.${side}`,
        message: registeredMessage(harness, registered),
      });
    }
  }
  return findings;
}

/**
 * An alias, rotation entry or explicit fallback tier naming a harness a launch
 * does not register can never run. The check reads only the run config and the
 * registered ids, so `validate` reports it and pre-flight skips that branch's
 * model probe.
 */
export function harnessRegistrationFindings(
  configs: ConfigBundle,
  file: string,
  registered: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];
  const check = (key: string, harness: string): void => {
    if (registered.has(harness)) return;
    findings.push({
      file,
      key,
      message: registeredMessage(harness, registered),
    });
  };
  for (const [name, alias] of Object.entries(configs.run.aliases)) {
    check(`aliases.${name}.harness`, alias.harness);
    for (const [index, entry] of (alias.rotate ?? []).entries()) {
      check(`aliases.${name}.rotate.${index}.harness`, entry.harness);
    }
    for (const [index, fallback] of (alias.fallbacks ?? []).entries()) {
      if ("alias" in fallback || fallback.harness === undefined) continue;
      check(`aliases.${name}.fallbacks.${index}.harness`, fallback.harness);
    }
  }
  return findings;
}

/**
 * Whether some alias, rotation entry or literal fallback tier runs on omp.
 * `scouts` is a subagent pin only the omp adapter reads.
 */
export function runsOnOmp(aliases: Record<string, AliasConfig>): boolean {
  for (const alias of Object.values(aliases)) {
    const primaries =
      alias.rotate && alias.rotate.length > 0
        ? alias.rotate.map((entry) => entry.harness)
        : [alias.harness];
    if (primaries.includes(OMP_ID)) return true;
    for (const fallback of alias.fallbacks ?? []) {
      if ("model" in fallback && fallback.harness === OMP_ID) return true;
    }
  }
  return false;
}

/**
 * `scouts` configures a model no harness reads when no alias, rotation entry
 * or fallback tier runs on omp: the pin would parse clean and start nothing.
 */
export function scoutsConsumerFindings(
  configs: ConfigBundle,
  file: string,
): Finding[] {
  if (!configs.run.scouts || runsOnOmp(configs.run.aliases)) return [];
  return [
    {
      file,
      key: "scouts",
      message: `scouts configures a subagent model, but no harness consumes it: no alias or fallback runs on harness "${OMP_ID}"`,
    },
  ];
}

function poolMessage(subscription: string): string {
  return `subscription "${subscription}" names no limits.concurrency.perSubscription pool`;
}

/** One literal fallback tier's pool declarations against the configured pools. */
function fallbackPoolFindings(
  fallback: FallbackModelConfig,
  alias: AliasConfig,
  rotation: readonly { harness: string; model: string }[],
  known: ReadonlySet<string>,
  file: string,
  tierKey: string,
): Finding[] {
  const findings: Finding[] = [];
  const changesPrimary = [alias, ...rotation].some((primary) =>
    fallbackChangesPrimary(fallback, primary),
  );
  const sharesPool = fallback.sharesPool === true;
  if (sharesPool && alias.subscription === undefined) {
    findings.push({
      file,
      key: `${tierKey}.sharesPool`,
      message: "sharesPool: true needs the alias to name a subscription",
    });
  }
  if (
    changesPrimary &&
    alias.subscription !== undefined &&
    fallback.subscription === undefined &&
    !sharesPool
  ) {
    findings.push({
      file,
      key: `${tierKey}.subscription`,
      message: `fallback changes harness or model from the alias primary, so it cannot inherit subscription "${alias.subscription}"; name its own subscription or set sharesPool: true`,
    });
  }
  const subscription = fallbackTierSubscription(
    fallback,
    alias.subscription,
    changesPrimary,
  );
  if (subscription !== undefined && !known.has(subscription)) {
    findings.push({
      file,
      key: `${tierKey}.subscription`,
      message: poolMessage(subscription),
    });
  }
  return findings;
}

/**
 * Every pool an alias or one of its literal fallback tiers draws on must exist
 * in `limits.concurrency.perSubscription`; an unknown name would only fail
 * while resolving a turn, after the plan spent. A tier that changes the
 * primary's harness or model cannot inherit the alias's pool silently.
 */
export function subscriptionPoolFindings(
  aliases: Record<string, AliasConfig>,
  pools: Record<string, number>,
  file: string,
): Finding[] {
  const findings: Finding[] = [];
  const known = new Set(Object.keys(pools));
  for (const [name, alias] of Object.entries(aliases)) {
    const key = `aliases.${name}`;
    if (alias.subscription !== undefined && !known.has(alias.subscription)) {
      findings.push({
        file,
        key: `${key}.subscription`,
        message: poolMessage(alias.subscription),
      });
    }
    const rotation = alias.rotate ?? [];
    for (const [index, fallback] of (alias.fallbacks ?? []).entries()) {
      if (!("model" in fallback)) continue;
      findings.push(
        ...fallbackPoolFindings(
          fallback,
          alias,
          rotation,
          known,
          file,
          `${key}.fallbacks.${index}`,
        ),
      );
    }
  }
  return findings;
}

/** Escalation, fallback, follow-up and tmp-headroom checks. */

import fs from "node:fs";
import { formatFindings } from "../findings.js";
import type { Finding } from "../findings.js";
import { FRONT_CLASS_FLOWS } from "../front.js";
import { BOUNDARY_STEPS } from "../types.js";
import type { AliasConfig, FlowDefinition, ProcessConfig } from "../types.js";

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
 * every boundary step, every architecture reviewer, every flow step, every step
 * alternate and every different-model follow-up. Nothing is derived from a role
 * name, so a renamed alias is the only requirement.
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

export function requiredAliases(process: ProcessConfig): Map<string, string> {
  const refs = new Map<string, string>();
  const note = (alias: string, ref: string): void => {
    if (!refs.has(alias)) refs.set(alias, ref);
  };
  for (const step of BOUNDARY_STEPS) {
    note(process.boundary[step].alias, `boundary step "${step}"`);
  }
  for (const alias of process.architecture.reviewers) {
    note(alias, "architecture reviewer");
  }
  for (const [name, flow] of Object.entries(process.flows)) {
    noteFlowAliases(note, name, flow);
  }
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
  const flowName = FRONT_CLASS_FLOWS.trivial;
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

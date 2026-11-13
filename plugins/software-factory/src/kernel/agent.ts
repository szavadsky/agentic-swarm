import type { Harness, ModelRef, SessionRef, Stop } from "../harness/types.js";
import { addUsage } from "../harness/usage.js";
import { contextPackRelPath, isPackTruncated } from "./context-pack.js";
import { renderRolePrompt } from "./prompts.js";
import {
  OutcomeInvalidError,
  failedOutcome,
  readDeliveredOutcome,
  validateExpectation,
  type OutcomeExpectation,
} from "./outcome.js";
import { DEFAULT_TIMEOUTS, type KernelRuntime, type Outcome, type RecordEnd, type RecordStart, type StepRecord } from "./types.js";

export { DEFAULT_TIMEOUTS } from "./types.js";

export interface AgentTurnSpec {
  role: string;
  cwd: string;
  /** iteration/slug/step/round/taskHash/base; actor, alias, model are resolved here. */
  meta: Omit<RecordStart, "actor" | "alias" | "model">;
  vars: Record<string, string>;
  expectation: OutcomeExpectation;
  session?: SessionRef;
  timeouts?: { idleMs: number; wallMs: number };
  /**
   * Runs after the turn and before the end record commits. `settle` sees the
   * accepted outcome and the live session, so it can compact and return the
   * compacted ref that must be stored (mechanical commits ignore the extras).
   */
  settle?: (
    record: StepRecord,
    outcome: Outcome | undefined,
    session: SessionRef | undefined
  ) => Promise<RecordEnd>;
}

export interface AgentTurnResult {
  record: StepRecord;
  /** Absent when an infra/refusal/cancelled stop ended the turn before delivery. */
  outcome?: Outcome;
  text: string;
}

export interface ResolvedRoleAlias {
  alias: string;
  harness: Harness;
  model: ModelRef;
  effort?: string;
  fallbacks?: string[];
  timeouts?: { idleMs: number; wallMs: number };
}

/** Resolves a role to its run-config alias and harness; shared with the boundary. */
export function resolveRoleAlias(runtime: KernelRuntime, role: string): ResolvedRoleAlias {
  const roleConfig = runtime.configs.process.roles[role];
  if (!roleConfig) throw new Error(`process config has no role "${role}"`);
  const aliasName = roleConfig.alias ?? role;
  const alias = runtime.configs.run.aliases[aliasName];
  if (!alias) {
    throw new Error(`run config has no alias "${aliasName}" (needed by role "${role}")`);
  }
  const harness = runtime.harnesses.get(alias.harness);
  if (!harness) {
    throw new Error(`no harness "${alias.harness}" registered for alias "${aliasName}"`);
  }
  return {
    alias: aliasName,
    harness,
    model: { id: alias.model, ...(alias.effort ? { effort: alias.effort } : {}) },
    effort: alias.effort,
    fallbacks: alias.fallbacks,
    timeouts: alias.timeouts,
  };
}

/** Roles that run the boundary consult; only they see the iteration's pack. */
const PACK_ROLES = new Set(["architect", "pm"]);

/**
 * The pack is the boundary consult's shared context: the architect reads it,
 * the PM derives tasks from the plan it produced in the same iteration. The
 * measurement is the rendered artifact, so a cap clip is visible.
 */
async function measurePack(
  runtime: KernelRuntime,
  spec: AgentTurnSpec
): Promise<{ bytes: number; truncated: boolean } | undefined> {
  if (!PACK_ROLES.has(spec.role)) return undefined;
  const pack = await runtime.store.readFile(contextPackRelPath(spec.meta.iteration));
  if (pack === null) return undefined;
  return { bytes: Buffer.byteLength(pack, "utf8"), truncated: isPackTruncated(pack) };
}

function repairPrompt(outcomePath: string, findings: string[]): string {
  return [
    "Your outcome was not accepted.",
    "",
    ...findings.map((f) => `- ${f}`),
    "",
    `Write a corrected outcome to ${outcomePath} (YAML or JSON).`,
    "Required shape:",
    "status: done | blocked | failed | upscope",
    "summary: one paragraph",
    "concerns: []  # optional entries {kind, calibration, text, evidence}",
    "forward: []",
    "verdict: approve | changes | reject  # review steps only",
    "decision: continue | done | blocked  # architect steps only",
    "",
    "Correct only the outcome. Do not do other work.",
  ].join("\n");
}

/**
 * One agent step: outcome path in the prompt (LOG D6), file first, fenced-block
 * fallback, one same-session repair turn, then a second invalid outcome is
 * `failed`. The end record is written only after `settle` (mechanical commit),
 * so a crash leaves an orphan that `derive` redispatches.
 */
export async function runAgentTurn(runtime: KernelRuntime, spec: AgentTurnSpec): Promise<AgentTurnResult> {
  const { alias, harness, model, effort, fallbacks, timeouts: aliasTimeouts } = resolveRoleAlias(runtime, spec.role);
  const started = await runtime.store.startRecord({
    ...spec.meta,
    actor: "agent",
    alias,
    model,
  });
  const outcomePath = started.outcomePath;
  const prompt = renderRolePrompt(runtime.prompts, runtime.configs.process, spec.role, {
    ...spec.vars,
    outcome_path: outcomePath,
  });
  // The rendered role prompt is the cost driver; a repair ask is small and
  // replaces it in the same session, so the record carries the first ask.
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const pack = await measurePack(runtime, spec);
  const timeouts = spec.timeouts ?? aliasTimeouts ?? DEFAULT_TIMEOUTS;

  const request = {
    model,
    effort,
    cwd: spec.cwd,
    prompt,
    session: spec.session,
    outcomePath,
    timeouts,
    fallbacks: fallbacks?.map((id) => ({ id, effort })),
  };
  let result = await harness.turn(request);
  let lastResult = result;
  let attempts = [...(result.attempts ?? [])];
  let stop: Stop = result.stop;
  let usage = result.usage;
  let session = result.session;
  let text = result.text;
  let outcome: Outcome | null = null;
  let findings: string[] = [];

  const collect = (): void => {
    try {
      const delivered = readDeliveredOutcome(outcomePath, text);
      if (delivered) {
        outcome = delivered.outcome;
        findings = validateExpectation(outcome, spec.expectation);
      }
    } catch (err) {
      if (!(err instanceof OutcomeInvalidError)) throw err;
      findings = err.findings;
    }
  };
  collect();

  if (findings.length === 0 && !outcome && stop.kind !== "infra" && stop.kind !== "refusal" && stop.kind !== "cancelled") {
    findings = ["no outcome written to the outcome path and no fenced YAML block in the final message"];
  }

  if (findings.length > 0 && stop.kind !== "infra" && stop.kind !== "refusal" && stop.kind !== "cancelled") {
    const repair = await harness.turn({
      ...request,
      prompt: repairPrompt(outcomePath, findings),
      session,
    });
    lastResult = repair;
    attempts = [...attempts, ...(repair.attempts ?? [])];
    stop = repair.stop;
    usage = addUsage(usage, repair.usage);
    session = repair.session ?? session;
    text = repair.text;
    outcome = null;
    findings = [];
    collect();
    if (!outcome && (stop.kind === "infra" || stop.kind === "refusal" || stop.kind === "cancelled")) {
      // An infrastructure interruption of the repair turn consumes no outcome.
    } else if (findings.length > 0 || !outcome) {
      outcome = failedOutcome(findings.length > 0 ? findings : ["no outcome after repair"]);
    }
  }

  const settled = spec.settle ? await spec.settle(started.meta, outcome ?? undefined, session) : {};
  const actualModel = (lastResult as typeof lastResult & { model?: ModelRef }).model ?? model;
  const record = await started.finish({
    ...settled,
    promptBytes,
    ...(pack ? { packBytes: pack.bytes, packTruncated: pack.truncated } : {}),
    ...(actualModel ? { model: actualModel } : {}),
    stop,
    usage,
    ...(attempts.length > 0 ? { attempts } : {}),
    ...(lastResult.transcript ? { transcript: lastResult.transcript } : {}),
    session: settled.session ?? session,
    outcome: outcome ?? undefined,
  });
  return { record, outcome: outcome ?? undefined, text };
}

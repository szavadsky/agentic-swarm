import type { Harness, ModelRef, SessionRef, Stop, Usage } from "../harness/types.js";
import { renderRolePrompt } from "./prompts.js";
import {
  OutcomeInvalidError,
  failedOutcome,
  readDeliveredOutcome,
  validateExpectation,
  type OutcomeExpectation,
} from "./outcome.js";
import type { KernelRuntime, Outcome, RecordEnd, RecordStart, StepRecord } from "./types.js";

export const DEFAULT_TIMEOUTS = { idleMs: 10 * 60_000, wallMs: 60 * 60_000 };

export interface AgentTurnSpec {
  role: string;
  cwd: string;
  /** iteration/slug/step/round/taskHash/base; actor, alias, model are resolved here. */
  meta: Omit<RecordStart, "actor" | "alias" | "model">;
  vars: Record<string, string>;
  expectation: OutcomeExpectation;
  session?: SessionRef;
  timeouts?: { idleMs: number; wallMs: number };
  /** Runs after the turn, before the end record commits (e.g. mechanical commit). */
  settle?: (record: StepRecord) => Promise<RecordEnd>;
}

export interface AgentTurnResult {
  record: StepRecord;
  /** Absent when an infra/refusal/cancelled stop ended the turn before delivery. */
  outcome?: Outcome;
  text: string;
}

function addUsage(a: Usage, b: Usage): Usage {
  return {
    in: a.in + b.in,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
    out: a.out + b.out,
    reasoningOut: a.reasoningOut + b.reasoningOut,
    costUsd: (a.costUsd ?? 0) + (b.costUsd ?? 0) || undefined,
  };
}

function resolveAlias(runtime: KernelRuntime, role: string): {
  alias: string;
  harness: Harness;
  model: ModelRef;
  effort?: string;
  fallbacks?: string[];
} {
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
  };
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
  const { alias, harness, model, effort, fallbacks } = resolveAlias(runtime, spec.role);
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
  const timeouts = spec.timeouts ?? DEFAULT_TIMEOUTS;

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

  const settled = spec.settle ? await spec.settle(started.meta) : {};
  const actualModel = (lastResult as typeof lastResult & { model?: ModelRef }).model ?? model;
  const record = await started.finish({
    ...settled,
    ...(actualModel ? { model: actualModel } : {}),
    stop,
    usage,
    session,
    outcome: outcome ?? undefined,
  });
  return { record, outcome: outcome ?? undefined, text };
}

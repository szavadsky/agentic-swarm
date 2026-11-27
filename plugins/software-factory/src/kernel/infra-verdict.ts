/**
 * Gate timeout and cannot-start adjudication: routes persistent infra gate
 * failures to a resumable infra turn, returning either a `red` verdict
 * (unstamped so normal gate adjudication runs) or an `infra` verdict stop.
 */
import fs from "node:fs";
import type { CheckResult } from "../core/checks/types.js";
import type { InfraCause, SessionRef } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import { resumableSession } from "./architect-session.js";
import { formatStop } from "./cause.js";
import { resolveTurn } from "./flow-context-targets.js";
import type { TurnTarget } from "./flow-types.js";
import { isInfraCheck, newGateFailures, runGates } from "./gates.js";
import { gateFlakeTests } from "./gates.js";
import { appendGateFlake } from "./record.js";
import {
  gateCommandsText,
  INFRA_FILE,
  InfraError,
  type InfraReport,
  infraPath,
  readInfra,
  readInfraRaw,
  resolveGates,
} from "./infra.js";
import type { InfraAdjudicationResult } from "./infra-types.js";
import {
  runBoundaryTurn,
  runContainedBoundaryTurn,
} from "./integration-lock.js";
import type { KernelRuntime, Outcome, StepRecord } from "./types.js";

/** True when a failing check timed out under the kernel's wall clock. */
export function isTimeoutGate(check: {
  ok: boolean;
  summary: string;
}): boolean {
  return !check.ok && check.summary.toLowerCase().includes("timed out");
}

/**
 * Infra gate evidence the kernel itself owns: the gate's own wall timeout and
 * the shell's cannot-execute codes. Gate output is not evidence — a failing
 * task may print anything, so output is never consulted.
 */
export function isInfraGate(check: {
  ok: boolean;
  summary: string;
  details?: unknown;
}): boolean {
  if (check.ok) return false;
  if (isTimeoutGate(check)) return true;
  if (/exit 12[67]/.test(check.summary)) return true;
  if (
    typeof check.details === "object" &&
    check.details !== null &&
    (check.details as { kind?: unknown }).kind === "infra"
  )
    return true;
  return false;
}

/** Stamps timed-out and unstartable gates as infra before adjudication or finish. */
export function markInfraGates(checks: CheckResult[]): void {
  for (const check of checks) {
    if (!check.ok && isInfraGate(check)) {
      check.details = {
        ...(typeof check.details === "object" && check.details
          ? check.details
          : {}),
        kind: "infra",
      };
    }
  }
}

/** Strips any infra stamp so a `red` verdict enters normal gate adjudication. */
function clearInfraStamp(check: CheckResult): CheckResult {
  const details =
    typeof check.details === "object" && check.details !== null
      ? { ...(check.details as Record<string, unknown>) }
      : {};
  delete details.kind;
  details.verdict = "red";
  return { ...check, details };
}

function clearInfraStamps(
  checks: readonly CheckResult[],
  targets: ReadonlySet<string>,
): CheckResult[] {
  return checks.map((check) =>
    targets.has(check.name) ? clearInfraStamp(check) : check,
  );
}

function infraTurnTarget(runtime: KernelRuntime): TurnTarget {
  const step = runtime.configs.process.ingestion?.find(
    (entry) => entry.id === "infra",
  );
  const prompt = step?.prompt ?? "infra";
  const alias = step?.alias ?? "pm";
  return {
    ...resolveTurn(runtime, prompt, alias, undefined),
    deliverable: step?.deliverable ?? "gate commands and incident verdict",
  };
}

async function infraResumableSession(
  runtime: KernelRuntime,
  records: readonly StepRecord[],
  target: TurnTarget,
): Promise<SessionRef | undefined> {
  const session = await resumableSession(
    runtime,
    records,
    (record) => record.step === "infra" && record.actor === "agent",
    target,
    "the infra turn",
  );
  if (session?.dir !== undefined && !fs.existsSync(session.dir)) {
    return undefined;
  }
  return session;
}

function validateInfraIncident(runtime: KernelRuntime) {
  return (outcome: Outcome): string[] => {
    if (outcome.status !== "done") return [];
    const file = infraPath(runtime.store.goalDir);
    let report: InfraReport | undefined;
    try {
      report = readInfra(runtime.store.goalDir);
    } catch (err) {
      if (err instanceof InfraError) return [err.message];
      throw err;
    }
    if (!report) {
      return [`infra incident turn wrote no ${INFRA_FILE} at ${file}`];
    }
    if (!report.incident) {
      return [
        `${file}: incident is required on an infra incident turn (verdict: infra | red)`,
      ];
    }
    return [];
  };
}

function formatIncidentEvidence(
  runtime: KernelRuntime,
  source: "checks" | "merge-checks" | "goal-head",
  worktree: string,
  infraChecks: readonly CheckResult[],
  opts: { slug?: string; round?: number },
): string {
  const commands = new Map(
    resolveGates(runtime.store.goalDir, runtime.configs.repo.gates).map((g) => [
      g.id,
      g.command,
    ]),
  );
  const header = opts.slug
    ? `${source} on task "${opts.slug}" round ${opts.round ?? 1} in ${worktree}`
    : `${source} in ${worktree}`;
  const parts = [`source: ${header}`];
  for (const check of infraChecks) {
    const command = commands.get(check.name);
    const kind = isTimeoutGate(check)
      ? "timed out twice"
      : "could not start / infra failure";
    const lines = [
      `- gate \`${check.name}\`${command ? ` (\`${command}\`)` : ""}: ${check.summary} (${kind})`,
    ];
    if (check.output.trim()) {
      lines.push(`  output:\n${check.output.trim()}`);
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n");
}

function infraTurnVars(
  runtime: KernelRuntime,
  iteration: number,
  evidence: string,
): Record<string, string> {
  return {
    iteration: String(iteration),
    intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    checkout: runtime.paths.goalCheckout,
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands: gateCommandsText(
      runtime.store.goalDir,
      runtime.configs.repo.gates,
    ),
    infra_path: infraPath(runtime.store.goalDir),
    incident_evidence: evidence,
    current_infra: readInfraRaw(runtime.store.goalDir),
  };
}

async function runContainedInfraTurn(
  runtime: KernelRuntime,
  iteration: number,
  lock: boolean,
  turn: () => ReturnType<typeof runAgentTurn>,
) {
  const meta = { iteration, step: "infra" as const };
  return lock
    ? runBoundaryTurn(runtime, meta, turn)
    : runContainedBoundaryTurn(runtime, meta, turn);
}

async function runInfraIncidentTurn(
  runtime: KernelRuntime,
  iteration: number,
  evidence: string,
  lock: boolean,
) {
  const target = infraTurnTarget(runtime);
  const records = await runtime.store.listRecords();
  const session = await infraResumableSession(runtime, records, target);
  const baseRound =
    records.filter(
      (r) =>
        r.iteration === iteration && r.step === "infra" && r.actor === "agent",
    ).length + 1;
  const vars = infraTurnVars(runtime, iteration, evidence);
  const call = (resumed: SessionRef | undefined, round: number) =>
    runContainedInfraTurn(runtime, iteration, lock, () =>
      runAgentTurn(runtime, {
        target,
        cwd: runtime.paths.goalCheckout,
        meta: { iteration, step: "infra", round },
        vars,
        expectation: "any",
        session: resumed,
        validate: validateInfraIncident(runtime),
      }),
    );
  let result = await call(session, baseRound);
  const stop = result.record.stop;
  const lostResume =
    session !== undefined &&
    !result.outcome &&
    stop?.kind === "infra" &&
    stop.cause !== "overflow";
  if (lostResume) {
    result = await call(undefined, baseRound + 1);
  }
  return result;
}

function infraStopCause(checks: readonly CheckResult[]): InfraCause {
  return checks.some(isTimeoutGate) ? "timeout" : "crash";
}

function infraStopDetails(
  checks: readonly CheckResult[],
  handling: string,
): string {
  const names = checks.map((c) => `${c.name} (${c.summary})`).join(", ");
  return `infra verdict (${handling}): ${names}`;
}

function turnFailureCause(
  result: Awaited<ReturnType<typeof runInfraIncidentTurn>>,
): { cause: InfraCause; details: string } {
  const stop = result.record.stop;
  if (!result.outcome) {
    return {
      cause: stop?.kind === "infra" ? stop.cause : "crash",
      details: `infra incident turn produced no outcome (${formatStop(stop)})`,
    };
  }
  return {
    cause: "crash",
    details: `infra incident turn ended ${result.outcome.status}: ${result.outcome.summary}`,
  };
}

/**
 * Re-runs a subset of gates once on the same tree, recording a `gate-flake`
 * when any flips green. Timed-out targets keep their fresh result even if the
 * retry also ends in infra; normal red targets keep their original red if the
 * re-run hits infra.
 */
export async function rerunGateSubset(
  runtime: KernelRuntime,
  cwd: string,
  tree: string,
  checks: CheckResult[],
  targets: ReadonlySet<string>,
  opts: {
    meta?: {
      iteration: number;
      slug: string;
      round: number;
      architect?: string;
    };
    replaceInfraFor?: ReadonlySet<string>;
  } = {},
): Promise<CheckResult[]> {
  if (targets.size === 0) return checks;
  const rerun = await runGates(runtime, cwd, { only: targets });
  markInfraGates(rerun);
  const fresh = new Map(rerun.map((check) => [check.name, check]));
  const flipped = checks.filter(
    (check) =>
      targets.has(check.name) &&
      !check.ok &&
      fresh.get(check.name)?.ok === true,
  );
  if (flipped.length > 0 && opts.meta) {
    await appendGateFlake(runtime.store, opts.meta, {
      tree,
      flakes: flipped.map((check) => ({
        gate: check.name,
        tests: gateFlakeTests(check),
      })),
      checks: flipped,
    });
  }
  return checks.map((check) => {
    const next = fresh.get(check.name);
    if (!next) return check;
    if (
      !next.ok &&
      isInfraCheck(next) &&
      !opts.replaceInfraFor?.has(check.name)
    ) {
      return check;
    }
    return next;
  });
}

/**
 * Routes persistent gate timeouts and cannot-start failures to the infra
 * agent. A `red` verdict clears any infra stamp so normal gate adjudication
 * runs; an `infra` verdict preserves the infra stamp and returns an infra
 * stop without parking `"gate could not start"`.
 */
export async function adjudicateInfraChecks(
  runtime: KernelRuntime,
  iteration: number,
  source: "checks" | "merge-checks" | "goal-head",
  worktree: string,
  checks: CheckResult[],
  preexisting: ReadonlySet<string>,
  opts: { slug?: string; round?: number; lock: boolean },
): Promise<InfraAdjudicationResult> {
  const red = newGateFailures(checks, preexisting);
  if (red.length === 0 || !red.every(isInfraCheck)) {
    return { checks };
  }
  const evidence = formatIncidentEvidence(runtime, source, worktree, red, opts);
  const result = await runInfraIncidentTurn(
    runtime,
    iteration,
    evidence,
    opts.lock,
  );
  if (!result.outcome && result.record.stop?.kind === "cancelled") {
    return { checks, cancelled: true };
  }
  if (!result.outcome || result.outcome.status !== "done") {
    return { checks, infra: turnFailureCause(result) };
  }
  let report: InfraReport | undefined;
  try {
    report = readInfra(runtime.store.goalDir);
  } catch (err) {
    if (err instanceof InfraError) {
      return { checks, infra: { cause: "crash", details: err.message } };
    }
    throw err;
  }
  const incident = report?.incident;
  if (!incident) {
    return {
      checks,
      infra: {
        cause: "crash",
        details: "infra incident turn wrote no incident verdict",
      },
    };
  }
  if (incident.verdict === "red") {
    const names = new Set(red.map((check) => check.name));
    return {
      checks: clearInfraStamps(checks, names),
      incident,
    };
  }
  return {
    checks,
    incident,
    infra: {
      cause: infraStopCause(red),
      details: infraStopDetails(red, incident.handling ?? "escalate"),
    },
  };
}

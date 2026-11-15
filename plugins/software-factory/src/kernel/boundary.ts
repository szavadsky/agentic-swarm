import fs from "node:fs";
import path from "node:path";
import { git } from "../core/git/exec.js";
import type { SessionRef } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import {
  missingPlanFinding,
  resumableSession,
  snapshotPlan,
} from "./architect-session.js";
import { recordedBaseGates } from "./baseline.js";
import {
  contextPackRelPath,
  forwardedConcerns,
  renderContextPack,
  shallowCodeMap,
  summaryRelPath,
} from "./context-pack.js";
import { derive } from "./derive.js";
import { writeLaunchDigest } from "./digest.js";
import { compactSession, resolveRole } from "./flow-context.js";
import {
  expireHold,
  formatSteers,
  markProcessed,
  scanInbox,
  steerResponses,
  writeOutbox,
} from "./mailbox.js";
import { type PmRung, runPm } from "./pm.js";
import { scriptMeta } from "./record.js";
import type { GoalDecision, KernelRuntime, Outcome } from "./types.js";
import { integrationHead } from "./worktree.js";

export interface BoundaryResult {
  iteration: number;
  decision: GoalDecision;
  cause?: string;
  /** A PM rung ended on infrastructure: the launch ends as infra, never dispatches. */
  stop?: { cause: string; details?: string };
  outcome?: Outcome;
  packPath?: string;
  /** Inbox steer ids the architect saw; dispatch must not steer them again. */
  seenSteers: string[];
}

export interface BoundaryOptions {
  relaunch: boolean;
  /** The front turn's iteration; the boundary runs in it instead of starting a new one. */
  iteration?: number;
  /** Goal-relative pack the front prepared; the scripted pack is not rendered. */
  frontPack?: string;
  /** Absolute path of the run config the launch loaded; the pack names it. */
  runConfigPath?: string;
}

function previousSummary(
  goalDir: string,
  iteration: number,
): string | undefined {
  if (iteration <= 0) return undefined;
  const rel = summaryRelPath(iteration);
  return fs.existsSync(path.join(goalDir, rel))
    ? path.join(goalDir, rel)
    : undefined;
}

function rungTrace(rungs: PmRung[]): string {
  return rungs
    .map(
      (rung) =>
        `rung ${rung.round} ${rung.alias} (${rung.model}): ${rung.failure}`,
    )
    .join("; ");
}

/** Today's infra cause: the classified cause plus the scrubbed error tail. */
function infraCause(stop: { cause: string; details?: string }): string {
  return stop.details ? `${stop.cause}: ${stop.details}` : stop.cause;
}

/**
 * The steer id in a `steer-presented`/`steer-unanswered` cause. JSON keeps an
 * id containing a quote or backslash unambiguous, and a plain id encodes to
 * the same quoted text older records carry, so those still read.
 */
function recordedSteerId(cause: string): string | undefined {
  const token = /^unanswered steer ("(?:[^"\\]|\\.)*")/.exec(cause)?.[1];
  if (!token) return undefined;
  try {
    const id: unknown = JSON.parse(token);
    return typeof id === "string" ? id : undefined;
  } catch {
    // A hand-edited cause names no steer; it must not wedge the launch.
    return undefined;
  }
}

async function taskSnapshot(goalDir: string): Promise<Map<string, string>> {
  const dir = path.join(goalDir, "tasks");
  const out = new Map<string, string>();
  if (!fs.existsSync(dir)) return out;
  for (const name of (await fs.promises.readdir(dir)).sort()) {
    if (name.endsWith(".md"))
      out.set(name, await fs.promises.readFile(path.join(dir, name), "utf8"));
  }
  return out;
}

function snapshotDiff(
  before: Map<string, string>,
  after: Map<string, string>,
): string | null {
  const names = new Set([...before.keys(), ...after.keys()]);
  for (const name of [...names].sort()) {
    if (before.get(name) !== after.get(name)) return name;
  }
  return null;
}

async function codeMap(checkout: string): Promise<string[]> {
  try {
    const listed = await git(checkout, ["ls-files"], { allowFail: true });
    if (listed.code !== 0) return [];
    return shallowCodeMap(listed.stdout.split("\n").filter(Boolean));
  } catch {
    return [];
  }
}

/**
 * Record directories with `started.yaml` and no `end.yaml`: turns cut off
 * before they committed, as absolute paths the architect can drill into.
 */
async function openRecords(store: KernelRuntime["store"]): Promise<string[]> {
  const open: string[] = [];
  for (const name of await store.listDir("records")) {
    const dir = path.join(store.recordsDir, name);
    if (
      fs.existsSync(path.join(dir, "started.yaml")) &&
      !fs.existsSync(path.join(dir, "end.yaml"))
    )
      open.push(dir);
  }
  return open;
}

/**
 * One architect consult: digest on a relaunch, inbox, deterministic pack,
 * architect turn (plan edited in place), steer answers, then the PM turn and
 * its validation. Called at every iteration start, never mid-iteration.
 */
export async function runBoundary(
  runtime: KernelRuntime,
  opts: BoundaryOptions,
): Promise<BoundaryResult> {
  const tasks = await runtime.store.listTasks();
  const records = await runtime.store.listRecords();
  const state = derive(tasks, records, runtime.configs.process.flows);
  const iteration = opts.iteration ?? state.iteration + 1;
  // Script records (baseline, checks) may exist before the first architect turn;
  // "first" means no architect turn has run yet, not an empty record store.
  const firstTurn = !records.some((r) => r.step === "architect");
  const turn = firstTurn ? "first" : opts.relaunch ? "relaunch" : "boundary";

  fs.mkdirSync(runtime.paths.sessionsDir, { recursive: true });
  const digestRel =
    opts.relaunch && records.length > 0
      ? await writeLaunchDigest(runtime, iteration, records)
      : null;
  const digestPath = digestRel
    ? path.join(runtime.store.goalDir, digestRel)
    : undefined;

  const steers = await scanInbox(runtime.store);
  const seenSteers = steers.map((steer) => steer.id);
  const packRel = opts.frontPack ?? contextPackRelPath(iteration);

  if (!opts.frontPack) {
    const head = await integrationHead(runtime);
    const previous = previousSummary(runtime.store.goalDir, iteration - 1);
    const pack = renderContextPack({
      goal: path.basename(runtime.paths.goalDir),
      iteration,
      intentPath: path.join(runtime.store.goalDir, "intent.md"),
      planPath: path.join(runtime.store.goalDir, "plan.md"),
      checkout: runtime.paths.goalCheckout,
      integrationBranch: runtime.paths.integrationBranch,
      headHash: head,
      recordsDir: runtime.store.recordsDir,
      tasksDir: runtime.store.tasksDir,
      previousSummary: previous,
      digestPath,
      tasks,
      state,
      codeMap: await codeMap(runtime.paths.goalCheckout),
      steers,
      setup: runtime.configs.repo.setup,
      gates: runtime.configs.repo.gates,
      baseGates: recordedBaseGates(records),
      forwarded: forwardedConcerns(records),
      runConfigPath: opts.runConfigPath,
      openRecords: await openRecords(runtime.store),
    });
    await runtime.store.writeFile(packRel, pack);
  }

  const tasksBefore = await taskSnapshot(runtime.store.goalDir);
  const session = await resumableSession(runtime, records);
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  // The guard inside the turn owns the plan-edit rule and its repair ask; the
  // post-turn check below is the same rule as a backstop for a halted turn
  // that kept its continue decision, so both compare against these pre-turn bytes.
  const planBefore = snapshotPlan(planPath);

  const architectTurn = (resume: SessionRef | undefined) =>
    runAgentTurn(runtime, {
      target: resolveRole(runtime, "architect"),
      cwd: runtime.paths.goalCheckout,
      meta: { iteration, step: "architect", round: 1 },
      vars: {
        turn,
        iteration: String(iteration),
        intent_path: path.join(runtime.store.goalDir, "intent.md"),
        plan_path: path.join(runtime.store.goalDir, "plan.md"),
        checkout: runtime.paths.goalCheckout,
        pack_path: path.join(runtime.store.goalDir, packRel),
        digest_path: digestPath ?? "",
        steers: formatSteers(steers),
      },
      expectation: "architect",
      session: resume,
      settle: async (_record, outcome, live) => {
        if (!live || outcome?.decision !== "continue") return {};
        const compacted = await compactSession(runtime, live);
        return compacted ? { session: compacted } : {};
      },
    });

  let result = await architectTurn(session);
  // An infra death is not a goal decision. Retry once de novo: the prompt is
  // self-contained, and a session that dies on resume must not be resumed
  // again. A second infra death ends the launch as infra, never blocked-by-user.
  const infraDied = (turnResult: typeof result): boolean =>
    turnResult.record.stop?.kind === "infra" && !turnResult.outcome?.decision;
  // A resumed session that overflowed already spent runAgentTurn's de-novo
  // retry; a second overflow is terminal because the prompt itself does not fit.
  const stopBeforeRetry = result.record.stop;
  const overflowTerminal =
    session !== undefined &&
    stopBeforeRetry?.kind === "infra" &&
    stopBeforeRetry.cause === "overflow";
  if (!overflowTerminal && infraDied(result))
    result = await architectTurn(undefined);
  const architectStop = result.record.stop;
  if (architectStop?.kind === "infra" && !result.outcome?.decision) {
    return {
      iteration,
      decision: "blocked",
      cause: `architect turn stopped on infrastructure: ${infraCause(architectStop)}`,
      stop: { cause: architectStop.cause, details: architectStop.details },
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }

  const responses = result.outcome
    ? steerResponses(result.outcome)
    : new Map<string, string>();
  // A steer stays pending when the architect does not answer, so every later
  // boundary presents it again. The first unanswered boundary only records
  // that fact; the second expires the hold and reports the unanswered steer.
  const priorRecords = await runtime.store.listRecords();
  const unansweredAt = (step: string): Set<string> =>
    new Set(
      priorRecords
        .filter((record) => record.step === step && record.cause)
        .map((record) => recordedSteerId(record.cause!))
        .filter((id): id is string => Boolean(id)),
    );
  const presented = unansweredAt("steer-presented");
  const expired = unansweredAt("steer-unanswered");
  for (const steer of steers) {
    const answer = responses.get(steer.id);
    if (answer) {
      await writeOutbox(
        runtime.store,
        steer.id,
        `# Steer ${steer.id}\n\n${answer}\n\nSource: ${steer.relPath}`,
      );
      await markProcessed(runtime.store, steer);
      continue;
    }
    if (expired.has(steer.id)) continue;
    if (!presented.has(steer.id)) {
      await runtime.store.appendRecord(
        scriptMeta(iteration, "steer-presented"),
        {
          ok: false,
          cause: `unanswered steer ${JSON.stringify(steer.id)} in ${steer.relPath}; the next boundary presents it again before its hold expires`,
        },
      );
      continue;
    }
    await expireHold(runtime.store, steer.id);
    await runtime.store.appendRecord(
      scriptMeta(iteration, "steer-unanswered"),
      {
        ok: false,
        cause: `unanswered steer ${JSON.stringify(steer.id)} in ${steer.relPath}; hold expired after one boundary`,
        outcome: {
          status: "done",
          summary: `steer ${steer.id} was left unanswered at two boundaries; its hold expired`,
          concerns: [
            {
              kind: "debt",
              calibration: "architect",
              text: `steer ${steer.id} is unanswered after a second boundary; its hold expired and held work resumed`,
              evidence: steer.relPath,
            },
          ],
          forward: [],
        },
      },
    );
  }

  const touched = snapshotDiff(
    tasksBefore,
    await taskSnapshot(runtime.store.goalDir),
  );
  if (touched) {
    return {
      iteration,
      decision: "blocked",
      cause: `architect modified task file ${touched}; only the PM writes tasks`,
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }

  const decision = result.outcome?.decision;
  if (!decision) {
    const cause = `architect turn produced no decision: ${result.outcome?.summary ?? "no outcome"}`;
    return {
      iteration,
      decision: "blocked",
      cause,
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }

  if (decision !== "continue") {
    return {
      iteration,
      decision,
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }

  const planFinding = missingPlanFinding(planPath, decision, planBefore);
  if (planFinding) {
    return {
      iteration,
      decision: "blocked",
      cause: planFinding,
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }

  const pm = await runPm(runtime, {
    iteration,
    state,
    planPath,
    cwd: runtime.paths.goalCheckout,
  });
  if (pm.status === "asked") {
    return {
      iteration,
      decision: "blocked",
      cause: `PM escalated and asked: ${pm.outcome.summary}`,
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }
  if (pm.status === "infra") {
    const rung = pm.rungs.at(-1);
    const where = rung
      ? ` at rung ${rung.round} ${rung.alias} (${rung.model})`
      : "";
    return {
      iteration,
      decision: "blocked",
      cause: `PM ladder stopped on infrastructure${where}: ${infraCause(pm.stop)}`,
      stop: { cause: pm.stop.cause, details: pm.stop.details },
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }
  if (pm.status === "exhausted") {
    return {
      iteration,
      decision: "blocked",
      cause: `PM ladder exhausted: ${rungTrace(pm.rungs)}`,
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }
  return {
    iteration,
    decision,
    outcome: result.outcome,
    packPath: packRel,
    seenSteers,
  };
}

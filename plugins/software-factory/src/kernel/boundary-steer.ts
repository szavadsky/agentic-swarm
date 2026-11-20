// biome-ignore-all lint/complexity: split-flow-dispatch
/**
 * The steered half of the hierarchy: the architect's live session hosts one
 * named subarchitect per epic, and the script steers this iteration's consult
 * over IRC. Prepared before the architect turn because the prompt must name the
 * children, and collected after it closes because a child's outcome is a real
 * epic consult.
 */
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { LiveAgents, SessionRef, SubagentInfo } from "../harness/types.js";
import { missingPlanFinding, snapshotPlan } from "./architect-session.js";
import type { EpicConsult, ConsultFailure } from "./boundary-consult.js";
import { epicJobDone, parseRegister } from "./boundary-context.js";
import { makeCause } from "./cause.js";
import { compactSession, subarchitectTarget } from "./flow-context.js";
import {
  KERNEL_TURN_STEPS,
  OutcomeInvalidError,
  readDeliveredOutcome,
  validateExpectation,
} from "./outcome.js";
import { type PlanFile, resolvePlan } from "./plan-file.js";
import { scriptMeta } from "./record.js";
import type { EpicRow } from "./register.js";
import type { KernelRuntime, State, StepRecord, TaskFile } from "./types.js";

/** The agent id every steered subarchitect is launched under. */
const SUBARCHITECT_AGENT = "subarchitect";

/** The name the architect and the script address one epic's child by. */
function subarchitectName(epic: string): string {
  return `epic-${epic.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

/** One epic's consult, handed to a live child of the architect's session. */
interface SteeredConsult {
  epic: string;
  plan: PlanFile;
  planBefore: string | null;
  name: string;
  outcomePath: string;
  /** The full consult the script steers over IRC. */
  prompt: string;
  promptBytes: number;
  child?: SubagentInfo;
}

/**
 * The live host's contract: one named child per epic that already has a plan to
 * review, the architect prompt's launch block and the agent definition, and the
 * start/stop pairing around the owning turn.
 */
export interface SteeredHosting {
  consults: SteeredConsult[];
  agents: { name: string; markdown: string }[];
  /** The architect prompt's block: one launch row per child, empty without children. */
  block: string;
  /** Starts the IRC monitor; a child is steered when the registry admits it. */
  start(agents: LiveAgents): void;
  /** Ends the monitor after the owning turn closes and reports why a child was not steered. */
  stop(): Promise<string[]>;
}

/** Steers each expected child once, retrying until the registry admits it or the turn closes. */
async function monitorSteers(
  agents: LiveAgents,
  consults: readonly SteeredConsult[],
  cancelled: () => boolean,
): Promise<string[]> {
  const pending = new Map(consults.map((consult) => [consult.name, consult]));
  const failures: string[] = [];
  const note = (line: string) => {
    if (failures.length < 20) failures.push(line);
  };
  while (pending.size > 0 && !cancelled()) {
    let listed: SubagentInfo[];
    try {
      listed = await agents.list();
    } catch (error) {
      note(`list: ${(error as Error).message}`);
      await sleep(250);
      continue;
    }
    for (const child of listed) {
      const consult = pending.get(child.id);
      if (!consult) continue;
      consult.child = child;
      try {
        await agents.steer(child.id, consult.prompt);
        pending.delete(child.id);
      } catch (error) {
        // The child exists but is not admitted yet; the next poll retries.
        note(`steer ${child.id}: ${(error as Error).message}`);
      }
    }
    if (pending.size > 0) await sleep(250);
  }
  for (const consult of pending.values()) {
    note(`no live child ${consult.name}`);
  }
  return failures.slice(-5);
}

/**
 * Prepares the steered consults for the epics that already have a plan to
 * review. A malformed register is left to the post-turn parse, which turns it
 * into a finding; no child is launched for epics whose job is already done.
 */
export async function steeredHosting(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    turn: string;
    packRel: string;
    goalPlanFile: PlanFile;
    digestPath?: string;
    tasks: readonly TaskFile[];
    state: State;
    records: readonly StepRecord[];
  },
): Promise<SteeredHosting | undefined> {
  if (!fs.existsSync(opts.goalPlanFile.path)) return undefined;
  let register: { epics: EpicRow[] };
  try {
    register = parseRegister(opts.goalPlanFile, 2, opts.tasks, opts.state);
  } catch {
    return undefined;
  }
  const rows = register.epics.filter(
    (row) =>
      row.closed === undefined &&
      row.architect === "subarchitect" &&
      !epicJobDone(opts.state, row.epic) &&
      opts.records.some(
        (record) =>
          record.step === "subarchitect" &&
          record.architect === row.epic &&
          record.endedAt,
      ),
  );
  if (rows.length === 0) return undefined;
  const target = subarchitectTarget(runtime, opts.iteration);
  const outcomeDir = path.join(runtime.paths.sessionsDir, "subarchitect");
  fs.mkdirSync(outcomeDir, { recursive: true });
  const consults = rows.map((row): SteeredConsult => {
    const plan = resolvePlan(runtime.store.goalDir, {
      kind: "epic",
      epic: row.epic,
    });
    const outcomePath = path.join(
      outcomeDir,
      `i${opts.iteration}-${row.epic}.yaml`,
    );
    fs.rmSync(outcomePath, { force: true });
    const prompt = runtime.prompts.render(target.prompt, {
      turn: opts.turn,
      iteration: String(opts.iteration),
      epic: row.epic,
      intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
      plan_path: plan.path,
      parent_plan_path: opts.goalPlanFile.path,
      checkout: runtime.paths.goalCheckout,
      pack_path: runtime.store.pathOf({ area: "goal", rel: opts.packRel }),
      digest_path: opts.digestPath ?? "",
      outcome_path: outcomePath,
    });
    return {
      epic: row.epic,
      plan,
      planBefore: snapshotPlan(plan.path),
      name: subarchitectName(row.epic),
      outcomePath,
      prompt,
      promptBytes: Buffer.byteLength(prompt, "utf8"),
    };
  });
  let cancelled = false;
  let running: Promise<string[]> | undefined;
  return {
    consults,
    agents: [
      {
        name: SUBARCHITECT_AGENT,
        markdown: runtime.prompts.render("subarchitect-agent", {}),
      },
    ],
    block: `${runtime.prompts.render("architect-subarchitects", {
      subarchitects: consults
        .map(
          (consult) =>
            `- epic \`${consult.epic}\` — agent \`${SUBARCHITECT_AGENT}\`, name \`${consult.name}\``,
        )
        .join("\n"),
    })}\n`,
    start(agents) {
      // One monitor per hosting: a repair turn reuses the same live process,
      // and a second monitor would steer the same child twice.
      if (running !== undefined) return;
      running = monitorSteers(agents, consults, () => cancelled);
    },
    async stop() {
      if (running === undefined) {
        return [`no live handle for ${consults.length} subarchitect(s)`];
      }
      // The owning process has closed, but a child admitted just before the
      // close still gets its steer: give the monitor a few poll intervals,
      // then cancel and report whatever it could not reach.
      const early = await Promise.race([
        running,
        sleep(5_000).then(() => undefined),
      ]);
      if (early !== undefined) return early;
      cancelled = true;
      return await running;
    },
  };
}

/** The child transcript next to the parent's, for a child that finished between polls. */
function parentChildFile(
  transcript: string | undefined,
  name: string,
): string | undefined {
  if (!transcript) return undefined;
  const file = path.join(path.dirname(transcript), `${name}.jsonl`);
  return fs.existsSync(file) ? file : undefined;
}

/**
 * Reads what the steered children delivered. A child that wrote no valid
 * outcome is not recorded: the written-report consult then runs for that epic,
 * so a silent child never makes an epic look planned. A `continue` with an
 * unchanged epic plan fails the iteration exactly as the report consult does.
 */
export async function collectSteered(
  runtime: KernelRuntime,
  hosting: SteeredHosting,
  opts: { iteration: number; parent?: SessionRef; transcript?: string },
): Promise<{ delivered: Map<string, EpicConsult>; failure?: ConsultFailure }> {
  const delivered = new Map<string, EpicConsult>();
  const target = subarchitectTarget(runtime, opts.iteration);
  for (const consult of hosting.consults) {
    let source: ReturnType<typeof readDeliveredOutcome>;
    try {
      source = readDeliveredOutcome(consult.outcomePath, "");
    } catch (error) {
      if (!(error instanceof OutcomeInvalidError)) throw error;
      source = null;
    }
    if (!source) {
      fs.rmSync(consult.outcomePath, { force: true });
      continue;
    }
    // A closure cites an id ingest assigned to an earlier record, so the check
    // needs the record tree; a child's invalid outcome falls back to the report
    // turn, which can repair it in-session.
    const debtRecords = source.outcome.debtClosed?.length
      ? await runtime.store.listRecords()
      : undefined;
    const findings = validateExpectation(
      source.outcome,
      KERNEL_TURN_STEPS.subarchitect,
      debtRecords ? { records: debtRecords } : {},
    );
    if (findings.length > 0) {
      fs.rmSync(consult.outcomePath, { force: true });
      continue;
    }
    const decision = source.outcome.decision;
    if (decision === "continue") {
      const finding = missingPlanFinding(
        consult.plan.path,
        decision,
        consult.planBefore,
        "subarchitect",
      );
      if (finding) {
        return { delivered, failure: { cause: `${consult.epic}: ${finding}` } };
      }
    }
    // The child's context is compacted before the next launch revives it by
    // name; the session id is the child transcript the child itself wrote.
    const childFile =
      consult.child?.sessionFile ??
      parentChildFile(opts.transcript, consult.name);
    let session: SessionRef | undefined;
    if (childFile) {
      const ref: SessionRef = {
        harness: target.harness.id,
        id: childFile,
        cwd: runtime.paths.goalCheckout,
        model: opts.parent?.model ?? target.model,
        lastRequestStartedAt: new Date().toISOString(),
        retentionTier: opts.parent?.retentionTier ?? "short",
        dir: path.dirname(childFile),
        compacted: false,
      };
      const compacted = await compactSession(runtime, ref);
      session = compacted?.session ?? ref;
    }
    await runtime.store.appendRecord(
      {
        iteration: opts.iteration,
        step: "subarchitect",
        round: 1,
        actor: "agent",
        architect: consult.epic,
        alias: target.alias,
        model: opts.parent?.model ?? target.model,
      },
      {
        stop: { kind: "done" },
        outcome: source.outcome,
        ...(session ? { session } : {}),
        ...(childFile ? { transcript: childFile } : {}),
        promptBytes: consult.promptBytes,
      },
    );
    delivered.set(consult.epic, {
      epic: consult.epic,
      plan: consult.plan,
      changed: snapshotPlan(consult.plan.path) !== consult.planBefore,
    });
    fs.rmSync(consult.outcomePath, { force: true });
  }
  return { delivered };
}

/** Reports a steer failure as a script record, the shape the launch digests. */
export async function recordSteerFailures(
  runtime: KernelRuntime,
  iteration: number,
  failures: string[],
): Promise<void> {
  if (failures.length === 0) return;
  await runtime.store.appendRecord(
    scriptMeta(iteration, "subarchitect-steer"),
    {
      ok: false,
      cause: makeCause(
        "steer",
        `steered subarchitect(s) not reached: ${failures.join("; ")}`,
      ),
    },
  );
}

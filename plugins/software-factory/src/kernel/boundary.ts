// biome-ignore-all lint/complexity: split-flow-dispatch
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
  type ConcernAudience,
  type ContextPackInput,
  contextDataRelPath,
  contextPackRelPath,
  epicContextPackRelPath,
  epicSummaryRelPath,
  forwardedConcerns,
  readyAging,
  recordsForAudience,
  renderContextData,
  renderContextPack,
  type SpikeFinding,
  shallowCodeMap,
  summaryRelPath,
} from "./context-pack.js";
import { derive, OPEN_TASK_STATUSES, openDebts } from "./derive.js";
import { writeLaunchDigest } from "./digest.js";
import {
  boundaryTarget,
  compactSession,
  stepTarget,
  subarchitectTarget,
} from "./flow-context.js";
import { runKeptLand } from "./integrate.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { type EpicRow, parseArchitectRegister } from "./register.js";
import {
  collectSteerRoutes,
  expireHold,
  formatPmAnswers,
  formatSteers,
  type Hold,
  markProcessed,
  readHolds,
  type Steer,
  scanInbox,
  selfHeldSlugs,
  steerProvenance,
  steerResponses,
  writeOutbox,
} from "./mailbox.js";
import { next } from "./next.js";
import {
  goalPlan,
  type PlanFile,
  planFilesOnDisk,
  registeredPlans,
  resolvePlan,
} from "./plan-file.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { PACK_PREP_STEP, runPackPreparer } from "./pack-prep.js";
import {
  consultGate,
  latestPlanCheck,
  openWork,
  PLAN_CHECK_STEP,
  runPlanCheckRound,
} from "./plan-check.js";
import {
  latestPlanReview,
  PLAN_REVIEW_STEP,
  PLAN_RETURN_STEP,
  runArchitectReturn,
  runPlanReview,
} from "./plan-review.js";
import {
  type PlanSnapshot,
  type PmRung,
  restorePlans,
  runPm,
  snapshotPlans,
} from "./pm.js";
import { scriptMeta } from "./record.js";
import { spikeFinding } from "./spike-report.js";
import { MAIN_ARCHITECT } from "./tasks.js";
import { summaryWaste } from "./waste-summary.js";
import type {
  ArtifactStore,
  GoalDecision,
  KernelRuntime,
  Outcome,
  State,
  StepRecord,
  TaskFile,
} from "./types.js";
import { formatCause, makeCause } from "./cause.js";
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
  /**
   * Write this consult's launch digest. Defaults to `relaunch`; a resume that
   * already ran its digest passes false so the evidence is not gathered twice.
   */
  digest?: boolean;
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

/** The previous summary's waste section, so the next consult's pack carries it. */
function previousWaste(goalDir: string, iteration: number): string | undefined {
  if (iteration <= 0) return undefined;
  const file = path.join(goalDir, summaryRelPath(iteration));
  if (!fs.existsSync(file)) return undefined;
  return summaryWaste(fs.readFileSync(file, "utf8"));
}

/** The previous iteration's summary for one epic, when it has one. */
function previousEpicSummary(
  goalDir: string,
  iteration: number,
  epic: string,
): string | undefined {
  if (iteration <= 0) return undefined;
  const rel = epicSummaryRelPath(iteration, epic);
  return fs.existsSync(path.join(goalDir, rel))
    ? path.join(goalDir, rel)
    : undefined;
}

/** Every registered plan's text: the ownership view a debt register reads. */
function ownedPlanText(runtime: KernelRuntime): string {
  return registeredPlans(runtime.store.goalDir)
    .filter((file) => fs.existsSync(file.path))
    .map((file) => fs.readFileSync(file.path, "utf8"))
    .join("\n");
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

function spikeLinkedTasks(tasks: TaskFile[], steerId: string): TaskFile[] {
  return tasks.filter((task) => steerProvenance(task.source) === steerId);
}

/**
 * Expires a hold naming a task its own steer created. Such a hold can never
 * lapse: a spike steer is answered only when that task ends, so the hold waits
 * for the steer while the task waits for the hold. A pre-fix PM wrote these;
 * the boundary clears one before dispatch reads holds again, and the spike it
 * created can then run and answer its steer.
 */
async function expireSelfHolds(
  runtime: KernelRuntime,
  tasks: readonly TaskFile[],
  iteration: number,
): Promise<void> {
  let holds: Hold[];
  try {
    ({ holds } = await readHolds(runtime.store));
  } catch (err) {
    console.warn(
      `[factory] holds unreadable for self-hold expiry: ${(err as Error).message}`,
    );
    return;
  }
  for (const hold of holds) {
    const own = selfHeldSlugs(hold.steer, hold.slugs, tasks);
    if (own.length === 0) continue;
    await expireHold(runtime.store, hold.steer);
    await runtime.store.appendRecord(
      scriptMeta(iteration, "hold-self-expire", { slug: hold.steer }),
      {
        ok: false,
        cause: makeCause(
          "steer",
          `${JSON.stringify(hold.steer)} hold named task(s) it creates: ${own.join(", ")}; hold expired so the task can run`,
        ),
      },
    );
  }
}

function spikeTerminal(state: State, linked: TaskFile[]): boolean {
  if (linked.length === 0) return false;
  return linked.every((task) => {
    const status = state.tasks[task.slug]?.status;
    return (
      status === "merged" ||
      status === "finished" ||
      status === "parked" ||
      status === "cancelled"
    );
  });
}

async function spikeAnswer(
  store: ArtifactStore,
  records: StepRecord[],
  state: State,
  linked: TaskFile[],
): Promise<string> {
  const parts = await Promise.all(
    linked.map(async (task) => {
      const finding = await spikeFinding(store, records, task.slug);
      if (finding) return `${task.slug}: ${finding}`;
      const cause = state.tasks[task.slug]?.cause;
      return cause
        ? `${task.slug}: ${formatCause(cause)}`
        : `${task.slug}: no outcome recorded`;
    }),
  );
  return parts.join("; ");
}

async function spikeFindings(
  store: ArtifactStore,
  records: StepRecord[],
  tasks: TaskFile[],
): Promise<SpikeFinding[]> {
  const findings: SpikeFinding[] = [];
  for (const task of tasks) {
    if (task.kind !== "spike") continue;
    const finding = await spikeFinding(store, records, task.slug);
    if (finding) findings.push({ slug: task.slug, finding });
  }
  return findings;
}

/**
 * The dead-alias cause for every ready task whose next action is an agent
 * step. Tier selection is admission's own predicate, so the pack names the
 * cause dispatch would book instead of guessing it from the alias config.
 */
function unavailableAliases(
  runtime: KernelRuntime,
  tasks: readonly TaskFile[],
  state: State,
  records: readonly StepRecord[],
  iteration: number,
): Map<string, string> {
  const causes = new Map<string, string>();
  const bySlug = new Map(tasks.map((task) => [task.slug, task]));
  for (const action of next(state, runtime.limits, new Set())) {
    if (action.kind !== "step") continue;
    const task = bySlug.get(action.slug);
    const taskState = state.tasks[action.slug];
    if (!task || !taskState) continue;
    const target = stepTarget(
      runtime,
      task,
      taskState,
      action.step,
      iteration,
      records,
    );
    if (target.unavailable !== undefined)
      causes.set(action.slug, target.unavailable);
  }
  return causes;
}

/** The plan one epic's subarchitect owns. */
function epicPlan(goalDir: string, epic: string): PlanFile {
  return resolvePlan(goalDir, { kind: "epic", epic });
}

/**
 * Whether the top architect may leave an epic's subarchitect out: its derived
 * epic state is done, which needs no subarchitect veto and no open task. A task
 * that becomes ready or parked brings the consult back; a merely registered
 * epic with no turn yet has no state entry and is not done.
 */
function epicJobDone(state: State, epic: string): boolean {
  return state.epics[epic]?.done === true;
}

/**
 * The register as the boundary reads it. Depth 1 never reads one, so today's
 * single-architect goal is unchanged. History never blocks an edit: only an
 * open task naming an unknown or closed epic is a finding. Plan presence is
 * checked after the consult because the first turn creates the epic plan.
 */
function parseRegister(
  plan: PlanFile,
  depth: 1 | 2,
  tasks: readonly TaskFile[],
  state: State,
): { epics: EpicRow[]; findings: string[] } {
  if (depth === 1) return { epics: [], findings: [] };
  const rows = tasks.flatMap((task) => {
    const status = state.tasks[task.slug]?.status;
    if (status === undefined || !OPEN_TASK_STATUSES.has(status)) return [];
    return [{ slug: task.slug, ...(task.epic ? { epic: task.epic } : {}) }];
  });
  return parseArchitectRegister(fs.readFileSync(plan.path, "utf8"), {
    depth,
    tasks: rows,
    exists: () => true,
  });
}

/**
 * Rolls back every plan a turn changed or created beyond the one it owns and
 * names what it restored. A plan that appeared during the turn is deleted, so
 * a consult cannot seed a second scope's plan behind its owner's back.
 */
async function discardForeignPlanWrites(
  runtime: KernelRuntime,
  snapshot: readonly PlanSnapshot[],
  keepRel: string,
): Promise<string[]> {
  const restored = await restorePlans(snapshot, (plan) => plan.rel === keepRel);
  const known = new Set(snapshot.map((entry) => entry.plan.rel));
  for (const plan of planFilesOnDisk(runtime.store.goalDir)) {
    if (plan.rel === keepRel || known.has(plan.rel)) continue;
    fs.rmSync(plan.path, { force: true });
    restored.push(plan.rel);
  }
  return restored.sort();
}

/** A consult that must stop the iteration, with the infra facts when it has them. */
interface ConsultFailure {
  cause: string;
  stop?: { cause: string; details?: string };
}

/** One epic that ran its subarchitect this iteration. */
interface EpicConsult {
  epic: string;
  plan: PlanFile;
  /** The epic plan changed during the turn; the architecture flow reviews it. */
  changed: boolean;
}

/**
 * Writes one subarchitect's pack: its epic's tasks and the concerns raised in
 * them, plus the goal-level facts both levels share. A task's concern never
 * appears in another epic's pack or in the top architect's.
 */
async function writeEpicPack(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    epic: string;
    tasks: readonly TaskFile[];
    state: State;
    records: readonly StepRecord[];
    planText: string;
    runConfigPath?: string;
  },
): Promise<string> {
  const epicTasks = opts.tasks.filter((task) => task.epic === opts.epic);
  const plan = epicPlan(runtime.store.goalDir, opts.epic);
  const audience: ConcernAudience = { kind: "epic", epic: opts.epic };
  const openForEpic = (await openRecords(runtime.store)).filter((dir) =>
    epicTasks.some((task) => path.basename(dir).includes(`-${task.slug}-`)),
  );
  const input: ContextPackInput = {
    goal: path.basename(runtime.paths.goalDir),
    iteration: opts.iteration,
    epic: opts.epic,
    intentPath: path.join(runtime.store.goalDir, "intent.md"),
    planPath: plan.path,
    checkout: runtime.paths.goalCheckout,
    integrationBranch: runtime.paths.integrationBranch,
    headHash: await integrationHead(runtime),
    recordsDir: runtime.store.recordsDir,
    tasksDir: runtime.store.tasksDir,
    previousSummary: previousEpicSummary(
      runtime.store.goalDir,
      opts.iteration - 1,
      opts.epic,
    ),
    tasks: [...epicTasks],
    state: opts.state,
    spikeFindings: await spikeFindings(
      runtime.store,
      [...opts.records],
      [...epicTasks],
    ),
    codeMap: await codeMap(runtime.paths.goalCheckout),
    steers: [],
    setup: runtime.configs.repo.setup,
    gates: runtime.configs.repo.gates,
    baseGates: recordedBaseGates([...opts.records]),
    forwarded: forwardedConcerns([...opts.records], {
      tasks: opts.tasks,
      audience,
    }),
    debts: openDebts(
      recordsForAudience(opts.records, opts.tasks, audience),
      opts.planText,
    ),
    openRecords: openForEpic,
    ...(opts.runConfigPath ? { runConfigPath: opts.runConfigPath } : {}),
  };
  const rel = epicContextPackRelPath(opts.iteration, opts.epic);
  await runtime.store.writeFile(rel, renderContextPack(input));
  return rel;
}

/**
 * One subarchitect turn for one epic: its own resumable session on the
 * architect alias, its own plan, and its own pack. It may edit only its epic
 * plan; a foreign plan write is rolled back and recorded, and a task write
 * blocks the iteration like the main architect's.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: one consult, its ownership reconcile and its failure handling
async function runEpicConsult(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    epic: string;
    packRel: string;
    goalPlanFile: PlanFile;
    digestPath?: string;
    records: readonly StepRecord[];
    turn: string;
  },
): Promise<{ consult?: EpicConsult; failure?: ConsultFailure }> {
  const plan = epicPlan(runtime.store.goalDir, opts.epic);
  const target = subarchitectTarget(runtime, opts.iteration);
  const planBefore = snapshotPlan(plan.path);
  const plansBefore = snapshotPlans(planFilesOnDisk(runtime.store.goalDir));
  const tasksBefore = await taskSnapshot(runtime.store.goalDir);
  const session = await resumableSession(
    runtime,
    opts.records,
    (record) =>
      record.step === "subarchitect" && record.architect === opts.epic,
    target,
  );
  const result = await runBoundaryTurn(
    runtime,
    { iteration: opts.iteration, step: "subarchitect" },
    () =>
      runAgentTurn(runtime, {
        target,
        cwd: runtime.paths.goalCheckout,
        meta: {
          iteration: opts.iteration,
          step: "subarchitect",
          round: 1,
          architect: opts.epic,
        },
        vars: {
          turn: opts.turn,
          iteration: String(opts.iteration),
          epic: opts.epic,
          intent_path: path.join(runtime.store.goalDir, "intent.md"),
          plan_path: plan.path,
          parent_plan_path: opts.goalPlanFile.path,
          checkout: runtime.paths.goalCheckout,
          pack_path: path.join(runtime.store.goalDir, opts.packRel),
          digest_path: opts.digestPath ?? "",
        },
        expectation: KERNEL_TURN_STEPS.subarchitect,
        session,
        settle: async (_record, outcome, live) => {
          if (!live || outcome?.decision === undefined) return {};
          // Every decided consult's session is compacted at its end, `done`
          // included: a task that reopens the epic later reuses the context.
          const compacted = await compactSession(runtime, live);
          if (!compacted) return {};
          return {
            session: compacted.session,
            ...(compacted.usage ? { compactUsage: compacted.usage } : {}),
          };
        },
      }),
  );
  const restored = await discardForeignPlanWrites(
    runtime,
    plansBefore,
    plan.rel,
  );
  if (restored.length > 0) {
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "subarchitect-reconcile", {
        architect: opts.epic,
      }),
      {
        ok: false,
        cause: makeCause(
          "invalid-outcome",
          `subarchitect ${opts.epic} wrote plan(s) it does not own: ${restored.join(", ")}; restored`,
        ),
      },
    );
  }
  const touched = snapshotDiff(
    tasksBefore,
    await taskSnapshot(runtime.store.goalDir),
  );
  if (touched) {
    return {
      failure: {
        cause: `subarchitect ${opts.epic} modified task file ${touched}; only the PM writes tasks`,
      },
    };
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra" && !result.outcome?.decision) {
    return {
      failure: {
        cause: `subarchitect ${opts.epic} stopped on infrastructure: ${infraCause(stop)}`,
        stop: { cause: stop.cause, details: stop.details },
      },
    };
  }
  const decision = result.outcome?.decision;
  if (!decision) {
    return {
      failure: {
        cause: `subarchitect ${opts.epic} produced no decision: ${result.outcome?.summary ?? "no outcome"}`,
      },
    };
  }
  if (decision === "continue") {
    const finding = missingPlanFinding(
      plan.path,
      decision,
      planBefore,
      "subarchitect",
    );
    if (finding) return { failure: { cause: `${opts.epic}: ${finding}` } };
  }
  return {
    consult: {
      epic: opts.epic,
      plan,
      changed: snapshotPlan(plan.path) !== planBefore,
    },
  };
}

/**
 * One architect consult: digest on a relaunch, inbox, deterministic pack,
 * architect turn (plan edited in place), steer answers, then the PM turn and
 * its validation. A boundary with open work runs the plan checker first and
 * returns `continue` when its follow-ups resume dispatch, so a consult is not
 * unconditional. Called at every iteration start, never mid-iteration.
 */
export async function runBoundary(
  runtime: KernelRuntime,
  opts: BoundaryOptions,
): Promise<BoundaryResult> {
  const tasks = await runtime.store.listTasks();
  let records = await runtime.store.listRecords();
  let state = derive(tasks, records, runtime.configs.process.flows);
  const iteration = opts.iteration ?? state.iteration + 1;
  // R10: kept green branches land before the pack renders, so the pack shows
  // the result and the PM plans from landed state. No new task, no agent turn.
  await runKeptLand(runtime, iteration);
  records = await runtime.store.listRecords();
  state = derive(tasks, records, runtime.configs.process.flows);
  // A steer's hold must never gate the task its own route created: the steer
  // is answered only when that spike ends, so the pair can never finish. Clear
  // one a pre-fix PM left before the pack and the next dispatch read holds.
  await expireSelfHolds(runtime, tasks, iteration);
  const plan = goalPlan(runtime.store.goalDir);
  const steers = await scanInbox(runtime.store);
  const gate = consultGate({
    plan: fs.existsSync(plan.path),
    open: openWork(state),
    steerWaiting: steers.length > 0,
    records,
    bound: runtime.limits.planCheckRounds,
  });
  if (gate === "check") {
    // The checker runs before the architect, so a mechanical follow-up costs
    // one task-tier round instead of a consult. `planCheckRounds` bounds the
    // rounds one consult owns, wherever they ran.
    const round =
      records.filter(
        (record) =>
          record.iteration === iteration &&
          record.actor === "agent" &&
          record.step === PLAN_CHECK_STEP &&
          record.endedAt,
      ).length + 1;
    const checked = await runBoundaryTurn(
      runtime,
      { iteration, step: PLAN_CHECK_STEP },
      () => runPlanCheckRound(runtime, { iteration, round, state }),
    );
    if (checked.status === "architect")
      return {
        iteration,
        decision: "continue",
        cause: `PM ladder routed to the architect: ${checked.findings.join("; ")}`,
        seenSteers: [],
      };
    if (checked.continued.length > 0)
      return { iteration, decision: "continue", seenSteers: [] };
    records = await runtime.store.listRecords();
    state = derive(tasks, records, runtime.configs.process.flows);
  }
  // Script records (baseline, checks) may exist before the first architect turn;
  // "first" means no architect turn has run yet, not an empty record store.
  const firstTurn = !records.some((r) => r.step === "architect");
  const turn = firstTurn ? "first" : opts.relaunch ? "relaunch" : "boundary";

  fs.mkdirSync(runtime.paths.sessionsDir, { recursive: true });
  const digestRel =
    (opts.digest ?? opts.relaunch) && records.length > 0
      ? await runBoundaryTurn(runtime, { iteration, step: "digest" }, () =>
          writeLaunchDigest(runtime, iteration, records),
        )
      : null;
  const digestPath = digestRel
    ? path.join(runtime.store.goalDir, digestRel)
    : undefined;

  const seenSteers = steers.map((steer) => steer.id);
  const packRel = opts.frontPack ?? contextPackRelPath(iteration);
  const pmRoutes = collectSteerRoutes(records);

  // PM-handled steers never reach the architect. A `task` steer still in the
  // inbox is a crash between the PM's answer and its mark-processed: answer it
  // from the stored route now. A `spike` steer whose standalone tasks all
  // landed is answered from their outcomes; a spike still in flight stays
  // pending but out of the pack. Only architect, stall and unrouted (legacy or
  // idle-arrival) steers are presented.
  const forArchitect: Steer[] = [];
  for (const steer of steers) {
    const routed = pmRoutes.get(steer.id);
    if (routed?.route === "task") {
      if (routed.answer) {
        await writeOutbox(
          runtime.store,
          steer.id,
          `# Steer ${steer.id}\n\n${routed.answer}\n\nSource: ${steer.relPath}`,
        );
        await markProcessed(runtime.store, steer);
        await expireHold(runtime.store, steer.id);
        continue;
      }
      forArchitect.push(steer);
      continue;
    }
    if (routed?.route === "spike") {
      const linked = spikeLinkedTasks(tasks, steer.id);
      if (linked.length > 0 && spikeTerminal(state, linked)) {
        await writeOutbox(
          runtime.store,
          steer.id,
          `# Steer ${steer.id}\n\n${await spikeAnswer(runtime.store, records, state, linked)}\n\nSource: ${steer.relPath}`,
        );
        await markProcessed(runtime.store, steer);
        await expireHold(runtime.store, steer.id);
        continue;
      }
      if (linked.length > 0) continue;
      forArchitect.push(steer);
      continue;
    }
    forArchitect.push(steer);
  }
  const pmAnswers = formatPmAnswers(pmRoutes);

  if (!opts.frontPack) {
    const head = await integrationHead(runtime);
    const previous = previousSummary(runtime.store.goalDir, iteration - 1);
    const waste = previousWaste(runtime.store.goalDir, iteration - 1);
    const { holds } = await readHolds(runtime.store).catch((err) => {
      console.warn(
        `[factory] pending-steer holds unreadable: ${(err as Error).message}`,
      );
      return { holds: [] };
    });
    // The first iteration has no segment to report on. Later packs list every
    // ready task that started no turn in the segment just ended, so the
    // architect sees a starved or deadlocked task instead of a bare "ready".
    const aged =
      iteration > 1
        ? readyAging({
            tasks,
            state,
            records,
            segment: iteration - 1,
            pendingSteers: steers.map((steer) => steer.id),
            holds,
            unavailableAliases: unavailableAliases(
              runtime,
              tasks,
              state,
              records,
              iteration,
            ),
          })
        : undefined;
    // A debt any active plan owns leaves the register, whichever architect wrote it.
    const planText = ownedPlanText(runtime);
    const packInput: ContextPackInput = {
      goal: path.basename(runtime.paths.goalDir),
      iteration,
      intentPath: path.join(runtime.store.goalDir, "intent.md"),
      planPath: plan.path,
      checkout: runtime.paths.goalCheckout,
      integrationBranch: runtime.paths.integrationBranch,
      headHash: head,
      recordsDir: runtime.store.recordsDir,
      tasksDir: runtime.store.tasksDir,
      previousSummary: previous,
      previousWaste: waste,
      digestPath,
      tasks,
      state,
      spikeFindings: await spikeFindings(runtime.store, records, tasks),
      codeMap: await codeMap(runtime.paths.goalCheckout),
      steers: forArchitect,
      holds,
      pmAnswers,
      setup: runtime.configs.repo.setup,
      gates: runtime.configs.repo.gates,
      baseGates: recordedBaseGates(records),
      forwarded: forwardedConcerns(records, {
        tasks,
        audience: { kind: "goal" },
      }),
      debts: openDebts(
        recordsForAudience(records, tasks, { kind: "goal" }),
        planText,
      ),
      runConfigPath: opts.runConfigPath,
      openRecords: await openRecords(runtime.store),
      planCheck: latestPlanCheck(records),
      planReview: latestPlanReview(records),
      agedReady: aged,
    };
    const dataRel = contextDataRelPath(iteration);
    await runtime.store.writeFile(dataRel, renderContextData(packInput));
    // After the first iteration a cheap agent turns the full status into the
    // index. The script render is the first iteration's pack, when no front
    // wrote one, and every failed preparer's fallback.
    const prepFailure =
      iteration > 1
        ? await runBoundaryTurn(
            runtime,
            { iteration, step: PACK_PREP_STEP },
            () => runPackPreparer(runtime, { iteration, packRel, dataRel }),
          )
        : undefined;
    if (iteration === 1 || prepFailure !== undefined) {
      await runtime.store.writeFile(packRel, renderContextPack(packInput));
      if (prepFailure !== undefined) {
        await runtime.store.appendRecord(
          scriptMeta(iteration, "packprep-fallback"),
          {
            ok: false,
            launchKind: "glitch",
            cause: makeCause(
              "invalid-outcome",
              `pack preparer failed: ${prepFailure}; the script render is this iteration's pack`,
            ),
          },
        );
      }
    }
  }

  const tasksBefore = await taskSnapshot(runtime.store.goalDir);
  const plansBefore = snapshotPlans(planFilesOnDisk(runtime.store.goalDir));
  const session = await resumableSession(
    runtime,
    records,
    (record) => record.step === "architect",
    boundaryTarget(runtime, "architect", iteration),
  );
  // The guard inside the turn owns the plan-edit rule and its repair ask; the
  // post-turn check below is the same rule as a backstop for a halted turn
  // that kept its continue decision, so both compare against these pre-turn bytes.
  const planBefore = snapshotPlan(plan.path);
  const depth = runtime.configs.process.hierarchy?.depth ?? 1;

  const architectTurn = (resume: SessionRef | undefined) =>
    runBoundaryTurn(runtime, { iteration, step: "architect" }, () =>
      runAgentTurn(runtime, {
        // Resolved per attempt: a quota death exhausts the alias, so the
        // de-novo retry must see the pool the first call recorded.
        target: boundaryTarget(runtime, "architect", iteration),
        cwd: runtime.paths.goalCheckout,
        meta: {
          iteration,
          step: "architect",
          round: 1,
          architect: MAIN_ARCHITECT,
        },
        vars: {
          turn,
          iteration: String(iteration),
          intent_path: path.join(runtime.store.goalDir, "intent.md"),
          plan_path: plan.path,
          checkout: runtime.paths.goalCheckout,
          pack_path: path.join(runtime.store.goalDir, packRel),
          digest_path: digestPath ?? "",
          steers: formatSteers(forArchitect),
          depth: String(depth),
        },
        expectation: KERNEL_TURN_STEPS.architect,
        session: resume,
        settle: async (_record, outcome, live) => {
          if (!live || outcome?.decision !== "continue") return {};
          const compacted = await compactSession(runtime, live);
          if (!compacted) return {};
          return {
            session: compacted.session,
            ...(compacted.usage ? { compactUsage: compacted.usage } : {}),
          };
        },
      }),
    );

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

  // The main architect owns `plan.md`; an epic plan belongs to its
  // subarchitect. A foreign write is rolled back as a finding, not kept, so
  // the review below sees exactly the plans their owners changed.
  const restoredPlans = await discardForeignPlanWrites(
    runtime,
    plansBefore,
    plan.rel,
  );
  if (restoredPlans.length > 0) {
    await runtime.store.appendRecord(
      scriptMeta(iteration, "architect-reconcile", { round: 1 }),
      {
        ok: false,
        cause: makeCause(
          "invalid-outcome",
          `architect wrote plan(s) a subarchitect owns: ${restoredPlans.join(", ")}; restored`,
        ),
      },
    );
  }

  const responses = result.outcome
    ? steerResponses(
        result.outcome,
        forArchitect.map((steer) => steer.id),
      )
    : new Map<string, string>();
  // A steer stays pending when the architect does not answer, so every later
  // boundary presents it again. The first unanswered boundary only records
  // that fact; the second expires the hold and reports the unanswered steer.
  // The steer id travels on the record's slug, never parsed from cause text.
  const priorRecords = await runtime.store.listRecords();
  const unansweredAt = (step: string): Set<string> =>
    new Set(
      priorRecords
        .filter((record) => record.step === step && record.slug)
        .map((record) => record.slug as string),
    );
  const presented = unansweredAt("steer-presented");
  const expired = unansweredAt("steer-unanswered");
  for (const steer of forArchitect) {
    const answer = responses.get(steer.id);
    if (answer) {
      await writeOutbox(
        runtime.store,
        steer.id,
        `# Steer ${steer.id}\n\n${answer}\n\nSource: ${steer.relPath}`,
      );
      await markProcessed(runtime.store, steer);
      await expireHold(runtime.store, steer.id);
      continue;
    }
    if (expired.has(steer.id)) continue;
    if (!presented.has(steer.id)) {
      await runtime.store.appendRecord(
        scriptMeta(iteration, "steer-presented", { slug: steer.id }),
        {
          ok: false,
          cause: makeCause(
            "steer",
            `unanswered steer ${JSON.stringify(steer.id)} in ${steer.relPath}; the next boundary presents it again before its hold expires`,
          ),
        },
      );
      continue;
    }
    await expireHold(runtime.store, steer.id);
    await runtime.store.appendRecord(
      scriptMeta(iteration, "steer-unanswered", { slug: steer.id }),
      {
        ok: false,
        cause: makeCause(
          "steer",
          `unanswered steer ${JSON.stringify(steer.id)} in ${steer.relPath}; hold expired after one boundary`,
        ),
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

  const planFinding = missingPlanFinding(plan.path, decision, planBefore);
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

  // Depth 2: the register the main architect just wrote names one subarchitect
  // per active epic. Each consult runs before the review and the PM, so the PM
  // derives tasks from every plan this iteration. A row owned by `main` stays
  // in `plan.md`; an epic whose subarchitect said `done` and whose tasks are
  // terminal is left out until a task reopens it.
  const register = parseRegister(plan, depth, tasks, state);
  if (register.findings.length > 0) {
    return {
      iteration,
      decision: "blocked",
      cause: `architect register: ${register.findings.join("; ")}`,
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }
  const activeSubarchitects = register.epics
    .filter(
      (row) => row.closed === undefined && row.architect === "subarchitect",
    )
    .sort((a, b) => a.epic.localeCompare(b.epic));
  // The top architect's turn just landed; its record is part of the brief
  // each subarchitect reads, so read the log again instead of the pre-turn view.
  const consultRecords = await runtime.store.listRecords();
  const planText = ownedPlanText(runtime);
  const consults: EpicConsult[] = [];
  for (const row of activeSubarchitects) {
    if (epicJobDone(state, row.epic)) continue;
    const prior = consultRecords.some(
      (record) =>
        record.step === "subarchitect" &&
        record.architect === row.epic &&
        record.endedAt,
    );
    const epicTurn = !prior ? "first" : opts.relaunch ? "relaunch" : "boundary";
    const epicPackRel = await writeEpicPack(runtime, {
      iteration,
      epic: row.epic,
      tasks,
      state,
      records: consultRecords,
      planText,
      ...(opts.runConfigPath ? { runConfigPath: opts.runConfigPath } : {}),
    });
    const consult = await runEpicConsult(runtime, {
      iteration,
      epic: row.epic,
      packRel: epicPackRel,
      goalPlanFile: plan,
      ...(digestPath ? { digestPath } : {}),
      records: consultRecords,
      turn: epicTurn,
    });
    if (consult.failure) {
      return {
        iteration,
        decision: "blocked",
        cause: consult.failure.cause,
        ...(consult.failure.stop ? { stop: consult.failure.stop } : {}),
        outcome: result.outcome,
        packPath: packRel,
        seenSteers,
      };
    }
    if (consult.consult) consults.push(consult.consult);
  }
  // The first consult creates an epic plan; a row that never gets one is a
  // register defect, not a plan the PM can derive tasks from.
  for (const row of activeSubarchitects) {
    const epic = epicPlan(runtime.store.goalDir, row.epic);
    if (fs.existsSync(epic.path)) continue;
    return {
      iteration,
      decision: "blocked",
      cause: `epic "${row.epic}" plan "${epic.rel}" does not exist after its consult; the subarchitect creates it`,
      outcome: result.outcome,
      packPath: packRel,
      seenSteers,
    };
  }

  // Every plan that changed this consult gets a review; an unchanged plan is
  // not re-read. The goal plan is always changed on a continue (the guard
  // above); an epic plan only when its subarchitect's turn edited it.
  const changedPlans: Array<{ plan: PlanFile; architect?: string }> = [];
  if (snapshotPlan(plan.path) !== planBefore) changedPlans.push({ plan });
  for (const consult of consults) {
    if (!consult.changed) continue;
    changedPlans.push({ plan: consult.plan, architect: consult.epic });
  }

  // R14: each changed plan gets a second reading, and when it raises technical
  // concerns its owner answers them before the PM derives tasks. The review is
  // advisory: neither step can block the iteration. Both turns run in the
  // integration checkout under the merge lock; pre-flight requires the
  // reviewer alias, so the review step cannot be skipped.
  const policy = runtime.configs.process.architecture.architectReturn;
  for (const entry of changedPlans) {
    const review = await runBoundaryTurn(
      runtime,
      { iteration, step: PLAN_REVIEW_STEP },
      () =>
        runPlanReview(runtime, {
          iteration,
          packRel,
          plan: entry.plan,
          ...(entry.architect ? { architect: entry.architect } : {}),
        }),
    );
    if (
      review.findings &&
      review.findings.technical.length > 0 &&
      policy === "on-technical-concerns"
    ) {
      const findings = review.findings;
      await runBoundaryTurn(
        runtime,
        { iteration, step: PLAN_RETURN_STEP },
        () =>
          runArchitectReturn(runtime, {
            iteration,
            packRel,
            plan: entry.plan,
            findings,
            reviewers: review.reviewers,
            ...(entry.architect ? { architect: entry.architect } : {}),
          }),
      );
    }
  }

  const pm = await runBoundaryTurn(runtime, { iteration, step: "pm" }, () =>
    runPm(runtime, {
      iteration,
      state,
      cwd: runtime.paths.goalCheckout,
    }),
  );
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
  if (pm.status === "architect") {
    // The PM's usable writes stay and dispatch may start them; the findings
    // no rung can fix travel as this iteration's cause, which the next
    // consult's architect reads in the previous summary. The goal stays
    // active, so no operator block is recorded.
    return {
      iteration,
      decision: "continue",
      cause: `PM ladder routed to the architect: ${pm.findings.join("; ")}`,
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

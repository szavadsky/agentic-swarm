/**
 * The subarchitect consult: one epic's pack and one turn on the architect
 * alias, its ownership reconcile, and the failure it reports instead of a
 * consult. The main architect's pack and turn stay in `boundary.ts`; both use
 * the ownership reconcile here.
 */
import path from "node:path";
import type { SessionRef } from "../harness/types.js";
import { runAgentTurn } from "./agent.js";
import {
  missingPlanFinding,
  planOwnerSelector,
  resumableSession,
  snapshotPlan,
} from "./architect-session.js";
import { recordedBaseGates } from "./baseline.js";
import {
  discardForeignPlanWrites,
  epicPlan,
  infraCause,
  openRecords,
  previousEpicSummary,
  recordedPackHashes,
  snapshotDiff,
  spikeFindings,
  taskSnapshot,
} from "./boundary-context.js";
import type {
  ConsultFailure,
  EpicConsult,
  EpicConsultOptions,
  EpicPackOptions,
} from "./boundary-types.js";
import { makeCause } from "./cause.js";
import {
  type ConcernAudience,
  type ContextPackInput,
  epicContextPackRelPath,
  forwardedConcerns,
  recordsForAudience,
  renderContextPack,
} from "./context-pack.js";
import { openDebts } from "./derive.js";
import { compactSession, subarchitectTarget } from "./flow-context.js";
import { packGates } from "./infra.js";
import { contextCodeMap } from "./ingestion.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import type { PlanFile } from "./plan-file.js";
import { type PlanSnapshot, snapshotPlans } from "./pm.js";
import { scriptMeta } from "./record.js";
import type { KernelRuntime, StepRecord, TaskFile } from "./types.js";
import { integrationHead } from "./worktree.js";

/** The epic's pack input: its tasks, its plan, and the goal's shared facts. */
async function epicPackInput(
  runtime: KernelRuntime,
  opts: EpicPackOptions,
  epicTasks: readonly TaskFile[],
  plan: PlanFile,
  openForEpic: readonly string[],
): Promise<ContextPackInput> {
  const audience: ConcernAudience = { kind: "epic", epic: opts.epic };
  return {
    goal: path.basename(runtime.paths.goalDir),
    iteration: opts.iteration,
    epic: opts.epic,
    intentPath: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    planPath: plan.path,
    checkout: runtime.paths.goalCheckout,
    integrationBranch: runtime.paths.integrationBranch,
    headHash: await integrationHead(runtime),
    ...(await recordedPackHashes(runtime.store, opts.records, opts.iteration)),
    recordsDir: runtime.store.pathOf({ area: "records" }),
    tasksDir: runtime.store.tasks.dir,
    previousSummary: await previousEpicSummary(
      runtime.store,
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
    codeMap: await contextCodeMap(runtime),
    steers: [...(opts.steers ?? [])],
    setup: runtime.configs.repo.setup,
    gates: packGates(runtime.store.goalDir, runtime.configs.repo.gates),
    baseGates: recordedBaseGates([...opts.records]),
    forwarded: forwardedConcerns([...opts.records], {
      tasks: opts.tasks,
      audience,
    }),
    debts: openDebts(
      recordsForAudience(opts.records, opts.tasks, audience),
      opts.planText,
    ),
    openRecords: [...openForEpic],
    ...(opts.runConfigPath ? { runConfigPath: opts.runConfigPath } : {}),
  };
}

export async function writeEpicPack(
  runtime: KernelRuntime,
  opts: EpicPackOptions,
): Promise<string> {
  const epicTasks = opts.tasks.filter((task) => task.epic === opts.epic);
  const plan = epicPlan(runtime.store.goalDir, opts.epic);
  const open = await openRecords(runtime.store);
  const openForEpic = open.filter((dir) =>
    epicTasks.some((task) => path.basename(dir).includes(`-${task.slug}-`)),
  );
  const input = await epicPackInput(
    runtime,
    opts,
    epicTasks,
    plan,
    openForEpic,
  );
  const rel = epicContextPackRelPath(opts.iteration, opts.epic);
  await runtime.store.writeFile(rel, renderContextPack(input));
  return rel;
}

interface ConsultSetup {
  planBefore: string | undefined;
  plansBefore: PlanSnapshot[];
  tasksBefore: Map<string, string>;
  session?: SessionRef;
}

async function prepareConsult(
  runtime: KernelRuntime,
  opts: EpicConsultOptions,
  plan: PlanFile,
  target: ReturnType<typeof subarchitectTarget>,
): Promise<ConsultSetup> {
  const session = await resumableSession(
    runtime,
    opts.records,
    planOwnerSelector(opts.epic),
    target,
    `the subarchitect "${opts.epic}"`,
  );
  return {
    planBefore: snapshotPlan(plan.path) ?? undefined,
    plansBefore: await snapshotPlans(
      runtime,
      runtime.store.plans.filesOnDisk(),
    ),
    tasksBefore: await taskSnapshot(runtime.store),
    session,
  };
}

/** Every decided consult's session is compacted at its end, `done` included. */
async function compactDecidedConsult(
  runtime: KernelRuntime,
  outcome: StepRecord["outcome"],
  live: SessionRef | undefined,
) {
  if (!live || outcome?.decision === undefined) return {};
  const compacted = await compactSession(runtime, live);
  if (!compacted) return {};
  return {
    session: compacted.session,
    ...(compacted.usage ? { compactUsage: compacted.usage } : {}),
  };
}

async function runSubarchitectTurn(
  runtime: KernelRuntime,
  opts: EpicConsultOptions,
  plan: PlanFile,
  session: SessionRef | undefined,
) {
  const target = subarchitectTarget(runtime);
  return runBoundaryTurn(
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
          pass: opts.pass,
          iteration: String(opts.iteration),
          epic: opts.epic,
          intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
          plan_path: plan.path,
          parent_plan_path: opts.goalPlanFile.path,
          checkout: runtime.paths.goalCheckout,
          pack_path: runtime.store.pathOf({ area: "goal", rel: opts.packRel }),
          digest_path: opts.digestPath ?? "",
        },
        expectation: KERNEL_TURN_STEPS.subarchitect,
        session,
        settle: (_record, outcome, live) =>
          compactDecidedConsult(runtime, outcome, live),
      }),
  );
}

/** A foreign plan write is rolled back and recorded, never kept. */
export async function reconcileForeignPlans(
  runtime: KernelRuntime,
  plansBefore: readonly PlanSnapshot[],
  ownedRels: readonly string[],
  iteration: number,
  step: string,
  writer: string,
  architect?: string,
  round?: number,
): Promise<void> {
  const restored = await discardForeignPlanWrites(
    runtime,
    [...plansBefore],
    ownedRels,
  );
  if (restored.length === 0) return;
  await runtime.store.appendRecord(
    scriptMeta(iteration, step, {
      ...(architect ? { architect } : {}),
      ...(round !== undefined ? { round } : {}),
    }),
    {
      ok: false,
      cause: makeCause(
        "invalid-outcome",
        `${writer} wrote plan(s) it does not own: ${restored.join(", ")}; restored`,
      ),
    },
  );
}

/** What the consult reports when its turn did not produce a usable decision. */
function consultFailure(
  opts: EpicConsultOptions,
  plan: PlanFile,
  planBefore: string | undefined,
  result: Awaited<ReturnType<typeof runSubarchitectTurn>>,
  touched: string | null,
): ConsultFailure | undefined {
  if (touched) {
    return {
      cause: `subarchitect ${opts.epic} modified task file ${touched}; only the PM writes tasks`,
    };
  }
  const stop = result.record.stop;
  if (stop?.kind === "infra" && !result.outcome?.decision) {
    return {
      cause: `subarchitect ${opts.epic} stopped on infrastructure: ${infraCause(stop)}`,
      stop: { cause: stop.cause, details: stop.details },
    };
  }
  const decision = result.outcome?.decision;
  if (!decision) {
    return {
      cause: `subarchitect ${opts.epic} produced no decision: ${result.outcome?.summary ?? "no outcome"}`,
    };
  }
  if (decision === "continue" && opts.pass === "direction") {
    const finding = missingPlanFinding(
      plan.path,
      decision,
      planBefore ?? null,
      "subarchitect",
    );
    if (finding) return { cause: `${opts.epic}: ${finding}` };
  }
  return undefined;
}

/**
 * One subarchitect turn for one epic: its own resumable session on the
 * architect alias, its own plan, and its own pack. It may edit only its epic
 * plan; a foreign plan write is rolled back and recorded, and a task write
 * blocks the iteration like the main architect's.
 */
export async function runEpicConsult(
  runtime: KernelRuntime,
  opts: EpicConsultOptions,
): Promise<{ consult?: EpicConsult; failure?: ConsultFailure }> {
  const plan = epicPlan(runtime.store.goalDir, opts.epic);
  const target = subarchitectTarget(runtime);
  const setup = await prepareConsult(runtime, opts, plan, target);
  const result = await runSubarchitectTurn(runtime, opts, plan, setup.session);
  await reconcileForeignPlans(
    runtime,
    setup.plansBefore,
    [plan.rel],
    opts.iteration,
    "subarchitect-reconcile",
    `subarchitect ${opts.epic}`,
    opts.epic,
  );
  const touched = snapshotDiff(
    setup.tasksBefore,
    await taskSnapshot(runtime.store),
  );
  const failure = consultFailure(opts, plan, setup.planBefore, result, touched);
  if (failure) return { failure };
  return {
    consult: {
      epic: opts.epic,
      plan,
      changed: snapshotPlan(plan.path) !== setup.planBefore,
      ...(result.outcome ? { outcome: result.outcome } : {}),
    },
  };
}

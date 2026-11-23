/**
 * The goal-start step sequence declared in process config: the branch, the
 * front classifier, then extra prompt steps in list order. Built-in ids bind
 * to kernel execution; a custom id runs one agent turn under the goal
 * checkout's integration lock. A bigger goal's code map is the scout's, not a
 * `git ls-files` dump in every pack.
 */
import fs from "node:fs";
import { git } from "../core/git/exec.js";
import { runAgentTurn } from "./agent.js";
import { frontClassTypesVar } from "./front.js";
import { shallowCodeMap } from "./context-pack.js";
import { FrontClassError, readFrontClass } from "./flow-context.js";
import { resolveTurn, type TurnTarget } from "./flow-context-targets.js";
import { runBoundaryTurn } from "./integration-lock.js";
import { scriptMeta } from "./record.js";
import type {
  IngestionStepConfig,
  IngestionWhenClass,
  KernelRuntime,
  StepRecord,
} from "./types.js";

export const CODE_MAP_FILE = "code-map.md";

/** The goal-relative code-map artifact the scout step writes and packs read. */
function codeMapFile(runtime: KernelRuntime): string {
  return runtime.store.pathOf({ area: "goal", rel: CODE_MAP_FILE });
}

/** The steps process config declares; absent reads as the kernel default. */
function ingestionSteps(runtime: KernelRuntime): IngestionStepConfig[] {
  return (
    runtime.configs.process.ingestion ?? [{ id: "branch" }, { id: "front" }]
  );
}

function isStepFinished(
  step: IngestionStepConfig,
  records: StepRecord[],
  runtime: KernelRuntime,
): boolean {
  if (step.id === "branch") {
    return records.some(
      (r) =>
        r.step === "branch" &&
        r.endedAt &&
        (r.outcome?.status === "done" || r.ok === true),
    );
  }
  if (step.id === "front") {
    try {
      if (readFrontClass(runtime) === null) return false;
    } catch (err) {
      if (err instanceof FrontClassError) throw err;
      return false;
    }
    return records.some(
      (r) => r.step === "front" && r.endedAt && r.outcome?.status === "done",
    );
  }
  return records.some(
    (r) => r.step === step.id && r.endedAt && r.outcome?.status === "done",
  );
}

function shouldSkipStep(
  step: IngestionStepConfig,
  goalClass: IngestionWhenClass | undefined,
): boolean {
  return (
    goalClass !== undefined &&
    step.when !== undefined &&
    !step.when.includes(goalClass)
  );
}

export interface IngestionResult {
  /** A failing step's cause; absent when every step completed. */
  cause?: string;
  /** Which step failed. */
  step?: string;
  /** The step ended blocked on input only the user can supply, not as infra. */
  blocked?: boolean;
}

/** The goal-branch step records the integration checkout it stands on: the
 * launch created the checkout before this; the step observes it. */
async function runBranchStep(
  runtime: KernelRuntime,
  iteration: number,
): Promise<void> {
  let on: string;
  try {
    const current = await git(
      runtime.paths.goalCheckout,
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { allowFail: true },
    );
    on =
      current.code === 0 && current.stdout.trim()
        ? current.stdout.trim()
        : "(detached HEAD)";
  } catch {
    on = "(unreadable)";
  }
  const ok = on === runtime.paths.integrationBranch;
  await runtime.store.appendRecord(scriptMeta(iteration, "branch"), {
    ok,
    outcome: {
      status: ok ? "done" : "failed",
      summary: `integration checkout on ${on}; goal branch ${runtime.paths.integrationBranch}`,
      concerns: [],
      forward: [],
    },
  });
}

function gateCommands(runtime: KernelRuntime): string {
  return (
    runtime.configs.repo.gates
      .map((gate) => `- ${gate.id}: ${gate.command}`)
      .join("\n") || "none"
  );
}

/** The template variables one ingestion agent step reads. */
function ingestionStepVars(
  runtime: KernelRuntime,
  iteration: number,
  packPath: string,
  extra: { codeMapPath: string },
): Record<string, string> {
  return {
    iteration: String(iteration),
    intent_path: runtime.store.pathOf({ area: "goal", rel: "intent.md" }),
    plan_path: runtime.store.plans.path,
    tasks_dir: runtime.store.tasks.dir,
    class_path: runtime.store.pathOf({ area: "goal", rel: "class.yaml" }),
    pack_path: packPath,
    checkout: runtime.paths.goalCheckout,
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands: gateCommands(runtime),
    class_types: frontClassTypesVar(runtime.configs.process.taskTypes),
    code_map_path: extra.codeMapPath,
  };
}

async function runGenericIngestionStep(
  runtime: KernelRuntime,
  iteration: number,
  step: IngestionStepConfig,
): Promise<IngestionResult> {
  const packPath = await runtime.store.localPath({
    area: "iterations",
    rel: `${iteration}/context-pack.md`,
  });
  const alias = step.alias ?? "pm";
  const codeMapPath = codeMapFile(runtime);
  const target: TurnTarget = {
    ...resolveTurn(runtime, step.prompt!, alias, undefined, iteration),
    ...(step.deliverable ? { deliverable: step.deliverable } : {}),
  };
  const result = await runBoundaryTurn(
    runtime,
    { iteration, step: step.id },
    () =>
      runAgentTurn(runtime, {
        target,
        cwd: runtime.paths.goalCheckout,
        meta: { iteration, step: step.id, round: 1 },
        vars: ingestionStepVars(runtime, iteration, packPath, {
          codeMapPath,
        }),
        expectation: "any",
      }),
  );
  if (!result.outcome) {
    const stop = result.record.stop;
    const detail =
      stop && "cause" in stop ? `: ${(stop as { cause: string }).cause}` : "";
    return {
      cause: `ingestion step "${step.id}" produced no outcome (${stop?.kind ?? "no stop"}${detail})`,
      step: step.id,
    };
  }
  if (result.outcome.status !== "done") {
    return {
      cause: `ingestion step "${step.id}" ended ${result.outcome.status}: ${result.outcome.summary}`,
      step: step.id,
      blocked: result.outcome.status === "blocked",
    };
  }
  return {};
}

/** The artifact a finished step promised but did not write; none when present. */
function missingDeliverable(
  step: IngestionStepConfig,
  runtime: KernelRuntime,
): string | undefined {
  if (step.id !== "scout") return undefined;
  const file = codeMapFile(runtime);
  if (fs.existsSync(file)) return undefined;
  return `ingestion step "scout" wrote no code map at ${file}`;
}

/** The scout-written entries, one per line; empty when no scout wrote one. */
function parseCodeMap(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

/** The scout's entries from the artifact, or an empty list when it is absent. */
function readScoutedCodeMap(
  runtime: KernelRuntime,
  records: StepRecord[],
): string[] {
  const wantsMap = ingestionSteps(runtime).some((s) => s.id === "scout");
  if (!wantsMap) return [];
  const file = codeMapFile(runtime);
  if (!fs.existsSync(file)) return [];
  const scouted = records.some(
    (r) => r.step === "scout" && r.endedAt && r.outcome?.status === "done",
  );
  if (!scouted) return [];
  return parseCodeMap(fs.readFileSync(file, "utf8"));
}

/**
 * The code map the packs carry: the scout's when a scout step is in the
 * sequence and has written one, else the shallow index of the checkout. A
 * non-bigger goal reads the scout's line only when a scout turn ran for it.
 */
export async function contextCodeMap(
  runtime: KernelRuntime,
): Promise<string[]> {
  const scouted = readScoutedCodeMap(
    runtime,
    await runtime.store.listRecords(),
  );
  if (scouted.length > 0) return scouted;
  try {
    const listed = await git(runtime.paths.goalCheckout, ["ls-files"], {
      allowFail: true,
    });
    if (listed.code !== 0) return [];
    return shallowCodeMap(listed.stdout.split("\n").filter(Boolean));
  } catch {
    return [];
  }
}

interface StepListRun {
  records: StepRecord[];
  failure?: IngestionResult;
}

/** Runs one list of unfinished steps in order, stopping at the first failure. */
async function runStepList(
  runtime: KernelRuntime,
  iteration: number,
  steps: IngestionStepConfig[],
  records: StepRecord[],
): Promise<StepListRun> {
  let current = records;
  for (const step of steps) {
    if (isStepFinished(step, current, runtime)) continue;
    const {
      cause,
      step: failedStep,
      blocked,
    } = await runGenericIngestionStep(runtime, iteration, step);
    if (cause) {
      return {
        records: current,
        failure: { cause, step: failedStep, blocked },
      };
    }
    const missing = missingDeliverable(step, runtime);
    if (missing !== undefined) {
      return { records: current, failure: { cause: missing, step: step.id } };
    }
    current = await runtime.store.listRecords();
  }
  return { records: current };
}

/**
 * Runs the configured steps in list order, skipping the ones a previous pass
 * already finished and the class-gated ones this goal skips. The classifier
 * names the class the later gates read; the scout writes the code map the
 * packs carry. `runFront` itself is not invoked here: the caller runs the
 * classifier and leaves the post-classification step list to this module.
 */
export async function runIngestionSteps(
  runtime: KernelRuntime,
  iteration: number,
  // Callers that already carry a class (`runFront` on a pre-classified goal)
  // resume the steps; callers that still need the classifier only record the
  // goal-branch fact now.
  resumeClass = false,
): Promise<IngestionResult> {
  const steps = ingestionSteps(runtime);
  let records = await runtime.store.listRecords();
  const frontIndex = steps.findIndex((step) => step.id === "front");
  const branch = steps[0];
  if (branch?.id === "branch" && !isStepFinished(branch, records, runtime)) {
    await runBranchStep(runtime, iteration);
    records = await runtime.store.listRecords();
  }
  // Steps before the classifier run without a `when`: the schema rejects one
  // there because the class does not exist until the classifier runs.
  const before = await runStepList(
    runtime,
    iteration,
    steps.slice(0, frontIndex).filter((step) => step.id !== "branch"),
    records,
  );
  if (before.failure) return before.failure;
  let goalClass: IngestionWhenClass | undefined;
  try {
    goalClass = readFrontClass(runtime)?.class;
  } catch (err) {
    if (err instanceof FrontClassError) {
      return { cause: err.message, step: "front" };
    }
    throw err;
  }
  // Nothing class-gated runs before the classifier, and a fresh classifier's
  // steps run on the call that follows it, never an earlier one.
  if (goalClass === undefined || !resumeClass) return {};
  const after = await runStepList(
    runtime,
    iteration,
    steps
      .slice(frontIndex + 1)
      .filter((step) => !shouldSkipStep(step, goalClass)),
    before.records,
  );
  return after.failure ?? {};
}

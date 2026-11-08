import fs from "node:fs";
import path from "node:path";
import type {
  DecisionArtifact,
  PlanArtifact,
  PlanCloseupArtifact,
  PipelineConfig,
  ProjectConfig,
  StateArtifact,
  StateItemInfo,
  StepMetaArtifact,
  SteerItemArtifact,
  TriageArtifact,
} from "../artifacts.js";
import { readYaml, writeYamlAtomic } from "../records/io.js";
import { deriveItemState, type DerivedItemState } from "./item.js";
import { deriveWaveState, type DerivedWaveState } from "./wave.js";
import { BudgetTracker } from "../budget.js";
import { listConcerns } from "../concerns.js";
import { isDebtConcern } from "../triage.js";
import { questionBlocks } from "../steer.js";
import { git } from "../git/exec.js";
import { isAncestor } from "../git/commit.js";

export interface DerivedTaskState {
  task: string;
  kind?: string;
  status: "active" | "blocked" | "done" | "failed";
  iteration: number;
  currentWave?: number;
  plan?: PlanArtifact;
  items: DerivedItemState[];
  itemMap: Record<string, DerivedItemState>;
  waves: DerivedWaveState[];
  debt: string[];
  budgetSpentUsd: number;
  hasOpenSteerQuestions: boolean;
  openSteerQuestions: SteerItemArtifact[];
  lastCloseup?: PlanCloseupArtifact;
  toStateArtifact(): StateArtifact;
}

/**
 * Derives comprehensive task state from disk and git (§6.3 Invariant 4).
 * Pure derivation; state.yaml is a materialized view never read for decisions.
 */
export async function deriveTaskState(opts: {
  taskDir: string;
  task: string;
  parentBranch?: string;
  taskWt?: string;
  pipeline?: PipelineConfig;
  project?: ProjectConfig;
}): Promise<DerivedTaskState> {
  const { taskDir, task, taskWt, pipeline, project } = opts;
  const parentBranch = opts.parentBranch ?? `topic/${task}`;

  // 1. Triage
  let triage: TriageArtifact | undefined;
  const triagePath = path.join(taskDir, "triage.yaml");
  if (fs.existsSync(triagePath)) {
    try {
      triage = await readYaml<TriageArtifact>(triagePath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt triage file at ${triagePath}: ${err?.message ?? err}`);
      }
    }
  }

  // 2. Iteration count from existing closeup-*.yaml (§8.4)
  let existingCloseupsCount = 0;
  let lastCloseup: PlanCloseupArtifact | undefined;
  if (fs.existsSync(taskDir)) {
    const entries = await fs.promises.readdir(taskDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.startsWith("closeup-") && ent.name.endsWith(".yaml")) {
        existingCloseupsCount++;
        const cuPath = path.join(taskDir, ent.name);
        try {
          const cu = await readYaml<PlanCloseupArtifact>(cuPath);
          if (!lastCloseup || (cu.iteration && cu.iteration >= (lastCloseup.iteration ?? 0))) {
            lastCloseup = cu;
          }
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt closeup file at ${cuPath}: ${err?.message ?? err}`);
          }
        }
      }
    }
  }

  const iteration = existingCloseupsCount + 1;

  // 3. Plan for current iteration
  let plan: PlanArtifact | undefined;
  const planPath = path.join(taskDir, "plan", `plan-${iteration}.yaml`);
  if (fs.existsSync(planPath)) {
    try {
      plan = await readYaml<PlanArtifact>(planPath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt plan file at ${planPath}: ${err?.message ?? err}`);
      }
    }
  }

  // 4. Steer mailbox questions
  const openSteerQuestions: SteerItemArtifact[] = [];
  const steerDir = path.join(taskDir, "steer", "tousertoreview");
  if (fs.existsSync(steerDir)) {
    const sentries = await fs.promises.readdir(steerDir, { withFileTypes: true });
    for (const sent of sentries) {
      if (!sent.isFile() || !sent.name.endsWith(".yaml")) continue;
      const qPath = path.join(steerDir, sent.name);
      try {
        const q = await readYaml<SteerItemArtifact>(qPath);
        if (q && q.status === "open") {
          openSteerQuestions.push(q);
        }
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt steer question file at ${qPath}: ${err?.message ?? err}`);
        }
      }
    }
  }

  // 5. Items
  const items: DerivedItemState[] = [];
  const itemMap: Record<string, DerivedItemState> = {};
  const itemsDir = path.join(taskDir, "items");
  if (fs.existsSync(itemsDir)) {
    const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
    for (const ent of itemEntries) {
      if (!ent.isDirectory()) continue;
      const itState = await deriveItemState({
        taskDir,
        itemSlug: ent.name,
        parentBranch,
        taskWt,
        pipeline,
        project,
      });
      items.push(itState);
      itemMap[ent.name] = itState;
    }
  }

  // Sort items deterministically by wave then slug
  items.sort((a, b) => (a.wave !== b.wave ? a.wave - b.wave : a.slug.localeCompare(b.slug)));

  // 6. Waves
  const waves: DerivedWaveState[] = [];
  const maxWave = items.reduce((max, it) => Math.max(max, it.wave), 1);
  let currentWave: number | undefined;

  for (let w = 1; w <= maxWave; w++) {
    const waveState = deriveWaveState({ wave: w, items });
    waves.push(waveState);
    if (currentWave === undefined && !waveState.isComplete) {
      currentWave = w;
    }
  }
  if (currentWave === undefined && waves.length > 0) {
    currentWave = waves[waves.length - 1]!.wave;
  }

  // 7. Tech debt collection
  const debtSet = new Set<string>();
  if (plan?.techDebt) {
    for (const d of plan.techDebt) {
      debtSet.add(d.description);
    }
  }
  // From decisions: accept-with-debt
  const decisionsDir = path.join(taskDir, "decisions");
  if (fs.existsSync(decisionsDir)) {
    const dentries = await fs.promises.readdir(decisionsDir, { withFileTypes: true });
    for (const dent of dentries) {
      if (!dent.isFile() || !dent.name.endsWith(".yaml")) continue;
      const dPath = path.join(decisionsDir, dent.name);
      try {
        const d = await readYaml<DecisionArtifact>(dPath);
        if (d && d.decision === "accept-with-debt" && d.debt) {
          debtSet.add(d.debt);
        }
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt decision file at ${dPath}: ${err?.message ?? err}`);
        }
      }
    }
  }
  // From concerns: debt predicate (routed/resolved tech-debt, routed optional)
  for (const concern of await listConcerns(taskDir)) {
    if (!isDebtConcern(concern)) continue;
    const item = concern.source?.item ?? concern.affects?.[0];
    debtSet.add(item ? `[${item}] ${concern.summary}` : concern.summary);
  }
  // From review suggestions with disposition optional
  for (const it of items) {
    for (const rec of it.records) {
      if (rec.output && typeof rec.output === "object" && "suggestions" in (rec.output as any)) {
        const suggestions = (rec.output as any).suggestions as Array<{ disposition?: string; summary?: string }>;
        for (const sug of suggestions ?? []) {
          if (sug.disposition === "optional" && sug.summary) {
            debtSet.add(`[${it.slug}] ${sug.summary}`);
          }
        }
      }
    }
  }

  // 8. Budget spent
  const budgetTracker = new BudgetTracker();
  await budgetTracker.reconcileFromDisk(taskDir);
  const budgetSpentUsd = budgetTracker.getTaskSpend().costUsd;

  // 9. Overall task status determination (§6.3 Invariant 4)
  let status: "active" | "blocked" | "done" | "failed" = "active";

  const hasTaskLevelOpenQuestion = openSteerQuestions.some((q) =>
    questionBlocks(q, "task")
  );

  if (hasTaskLevelOpenQuestion) {
    status = "blocked";
  } else if (lastCloseup?.status === "complete") {
    status = "done";
  } else if (lastCloseup?.status === "blocked") {
    // Finding 6: An answered blocked close-up starts iteration N+1
    const closeupQuestion = openSteerQuestions.find(
      (q) => questionBlocks(q, "task") || q.id === `closeup-${iteration}`
    );
    if (closeupQuestion && closeupQuestion.status === "open") {
      status = "blocked";
    } else {
      // Closed/answered -> active to start iteration N+1
      status = "active";
    }
  } else if (items.length > 0 && items.every((it) => it.status === "blocked")) {
    // human-async parks an item, not the task; only mixed/other blocks halt it.
    const blockedByNonAsync = items.some(
      (it) => it.status === "blocked" && it.openSteerQuestion?.disposition !== "human-async"
    );
    if (blockedByNonAsync) status = "blocked";
  } else if (items.length > 0 && items.some((it) => it.status === "failed")) {
    status = "failed";
  } else if (triage?.kind === "simple") {
    // Finding 2 & 3: Simple task completion requires merged commit on parent
    const simpleAssignmentPath = path.join(taskDir, "items", "simple", "assignment.yaml");
    if (fs.existsSync(simpleAssignmentPath)) {
      // Converted to item: defer to items state
      if (items.length > 0 && items.every((it) => it.status === "merged")) {
        status = "done";
      } else if (items.some((it) => it.status === "failed")) {
        status = "failed";
      } else if (items.some((it) => it.status === "blocked")) {
        status = "blocked";
      } else {
        status = "active";
      }
    } else {
      // Direct simple flow: check newest simple-implement record has meta.status === "ok"
      // AND topic/{task}--simple has commits that are an ancestor of task HEAD
      const runsDir = path.join(taskDir, "runs");
      let newestSimpleOk = false;
      if (fs.existsSync(runsDir)) {
        const rEntries = (await fs.promises.readdir(runsDir))
          .filter((r) => r.includes("simple-implement"))
          .sort();
        if (rEntries.length > 0) {
          const lastSimpleDir = path.join(runsDir, rEntries[rEntries.length - 1]!);
          const metaPath = path.join(lastSimpleDir, "meta.yaml");
          if (fs.existsSync(metaPath)) {
            try {
              const meta = await readYaml<StepMetaArtifact>(metaPath);
              if (meta && meta.status === "ok") {
                newestSimpleOk = true;
              }
            } catch (err: any) {
              if (err?.code !== "ENOENT") {
                throw new Error(`Corrupt meta file at ${metaPath}: ${err?.message ?? err}`);
              }
            }
          }
        }
      }
      let isScratchMerged = false;
      if (newestSimpleOk && taskWt) {
        try {
          const scratchBranch = `topic/${task}--simple`;
          const scratchShaRes = await git(taskWt, ["rev-parse", scratchBranch], { allowFail: true });
          const taskHeadRes = await git(taskWt, ["rev-parse", "HEAD"], { allowFail: true });
          if (scratchShaRes.code === 0 && taskHeadRes.code === 0) {
            const scratchSha = scratchShaRes.stdout.trim();
            const taskHeadSha = taskHeadRes.stdout.trim();
            if (scratchSha && taskHeadSha) {
              const isAnc = await isAncestor(taskWt, scratchSha, taskHeadSha);
              if (isAnc) {
                isScratchMerged = true;
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (newestSimpleOk && isScratchMerged) {
        status = "done";
      }
    }
  } else if (items.length > 0 && items.every((it) => it.status === "merged")) {
    status = "active";
  }

  const toStateArtifact = (): StateArtifact => {
    const itemsRecord: Record<string, StateItemInfo> = {};
    for (const it of items) {
      itemsRecord[it.slug] = {
        kind: it.kind,
        status: it.status,
        branch: it.branch,
        attempts: it.currentAttempt,
        fixRounds: it.currentFixRound,
        mergedAt: it.mergedAt,
      };
    }
    return {
      task,
      kind: triage?.kind,
      status,
      iteration,
      currentWave,
      items: itemsRecord,
      debt: Array.from(debtSet),
      budgetSpentUsd,
      lastUpdated: new Date().toISOString(),
    };
  };

  return {
    task,
    kind: triage?.kind,
    status,
    iteration,
    currentWave,
    plan,
    items,
    itemMap,
    waves,
    debt: Array.from(debtSet),
    budgetSpentUsd,
    hasOpenSteerQuestions: openSteerQuestions.length > 0,
    openSteerQuestions,
    lastCloseup,
    toStateArtifact,
  };
}

/**
 * Materializes state.yaml for humans (§6.3 Invariant 4).
 * Never read for decisions.
 */
export async function materializeStateYaml(taskDir: string, state: StateArtifact): Promise<void> {
  const statePath = path.join(taskDir, "state.yaml");
  await writeYamlAtomic(statePath, state);
}

/**
 * Derives current task state and refreshes state.yaml (ToySmoke: state.yaml
 * must refresh after every step, since a whole iteration runs within one tick).
 * Never read for decisions.
 */
export async function refreshStateYaml(opts: {
  taskDir: string;
  task: string;
  parentBranch: string;
  taskWt: string;
  pipeline: PipelineConfig;
}): Promise<DerivedTaskState> {
  const state = await deriveTaskState(opts);
  await materializeStateYaml(opts.taskDir, state.toStateArtifact());
  return state;
}

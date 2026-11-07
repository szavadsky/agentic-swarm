import fs from "node:fs";
import path from "node:path";
import type {
  DecisionArtifact,
  PlanArtifact,
  PlanCloseupArtifact,
  StateArtifact,
  StateItemInfo,
  SteerItemArtifact,
  TriageArtifact,
} from "../artifacts.js";
import { readYaml, writeYamlAtomic } from "../records/io.js";
import { deriveItemState, type DerivedItemState } from "./item.js";
import { deriveWaveState, type DerivedWaveState } from "./wave.js";
import { BudgetTracker } from "../budget.js";

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
}): Promise<DerivedTaskState> {
  const { taskDir, task, taskWt } = opts;
  const parentBranch = opts.parentBranch ?? `topic/${task}`;

  // 1. Triage
  let triage: TriageArtifact | undefined;
  const triagePath = path.join(taskDir, "triage.yaml");
  if (fs.existsSync(triagePath)) {
    try {
      triage = await readYaml<TriageArtifact>(triagePath);
    } catch {
      // ignore
    }
  }

  // 2. Iteration count from existing closeup-*.yaml (§8.4)
  let existingCloseupsCount = 0;
  let lastCloseup: PlanCloseupArtifact | undefined;
  try {
    const entries = await fs.promises.readdir(taskDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.startsWith("closeup-") && ent.name.endsWith(".yaml")) {
        existingCloseupsCount++;
        try {
          const cu = await readYaml<PlanCloseupArtifact>(path.join(taskDir, ent.name));
          if (!lastCloseup || (cu.iteration && cu.iteration >= (lastCloseup.iteration ?? 0))) {
            lastCloseup = cu;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // taskDir might not exist yet
  }

  const iteration = existingCloseupsCount + 1;

  // 3. Plan for current iteration
  let plan: PlanArtifact | undefined;
  const planPath = path.join(taskDir, "plan", `plan-${iteration}.yaml`);
  if (fs.existsSync(planPath)) {
    try {
      plan = await readYaml<PlanArtifact>(planPath);
    } catch {
      // ignore
    }
  }

  // 4. Steer mailbox questions
  const openSteerQuestions: SteerItemArtifact[] = [];
  const steerDir = path.join(taskDir, "steer", "tousertoreview");
  if (fs.existsSync(steerDir)) {
    try {
      const sentries = await fs.promises.readdir(steerDir, { withFileTypes: true });
      for (const sent of sentries) {
        if (!sent.isFile() || !sent.name.endsWith(".yaml")) continue;
        try {
          const q = await readYaml<SteerItemArtifact>(path.join(steerDir, sent.name));
          if (q.status === "open") {
            openSteerQuestions.push(q);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  // 5. Items
  const items: DerivedItemState[] = [];
  const itemMap: Record<string, DerivedItemState> = {};
  const itemsDir = path.join(taskDir, "items");
  if (fs.existsSync(itemsDir)) {
    try {
      const itemEntries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
      for (const ent of itemEntries) {
        if (!ent.isDirectory()) continue;
        const itState = await deriveItemState({
          taskDir,
          itemSlug: ent.name,
          parentBranch,
          taskWt,
        });
        items.push(itState);
        itemMap[ent.name] = itState;
      }
    } catch {
      // ignore
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
    try {
      const dentries = await fs.promises.readdir(decisionsDir, { withFileTypes: true });
      for (const dent of dentries) {
        if (!dent.isFile() || !dent.name.endsWith(".yaml")) continue;
        try {
          const d = await readYaml<DecisionArtifact>(path.join(decisionsDir, dent.name));
          if (d.decision === "accept-with-debt" && d.debt) {
            debtSet.add(d.debt);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
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

  // 9. Overall task status determination
  let status: "active" | "blocked" | "done" | "failed" = "active";

  const hasTaskLevelOpenQuestion = openSteerQuestions.some(
    (q) => q.ref === "plan" || q.ref === task || q.blocks?.includes("task")
  );

  if (hasTaskLevelOpenQuestion) {
    status = "blocked";
  } else if (lastCloseup?.status === "complete") {
    status = "done";
  } else if (lastCloseup?.status === "blocked" || (items.length > 0 && items.every((it) => it.status === "blocked"))) {
    status = "blocked";
  } else if (triage?.kind === "simple") {
    // For simple flow: if scratch branch was merged into task branch, it's done
    // Check if task has any commits or if simple scratch is done
    if (taskWt) {
      // If task worktree has commits beyond root or marked done
      const runsDir = path.join(taskDir, "runs");
      if (fs.existsSync(runsDir)) {
        const rEntries = await fs.promises.readdir(runsDir);
        const hasSimpleComplete = rEntries.some((r) => r.includes("simple-implement") && !r.includes("started"));
        if (hasSimpleComplete) {
          status = "done";
        }
      }
    }
  } else if (items.length > 0 && items.every((it) => it.status === "merged")) {
    // If all items are merged but close-up hasn't marked complete yet
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

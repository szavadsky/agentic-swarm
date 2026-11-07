import fs from "node:fs";
import path from "node:path";
import type {
  AssignmentArtifact,
  DecisionArtifact,
  FlowKindConfig,
  ReviewArtifact,
  StateItemInfo,
  StepMetaArtifact,
  SteerItemArtifact,
} from "../artifacts.js";
import { readYaml } from "../records/io.js";
import { parseStepRecordDirName } from "../records/step-record.js";
import { git } from "../git/exec.js";
import { childBranch } from "../git/naming.js";

export interface ItemStepRecordInfo {
  dirName: string;
  seq: number;
  name: string;
  attempt: number;
  meta: StepMetaArtifact;
  output?: unknown;
  checks?: unknown;
}

export interface DerivedItemState {
  slug: string;
  kind: string;
  title: string;
  wave: number;
  deps: string[];
  status: "pending" | "running" | "ready" | "merged" | "failed" | "blocked" | "superseded";
  assignment?: AssignmentArtifact;
  branch: string;
  records: ItemStepRecordInfo[];
  currentStepId?: string;
  currentAttempt: number;
  currentFixRound: number;
  isEscalated: boolean;
  interruptionCount: number;
  guidanceText?: string;
  openSteerQuestion?: SteerItemArtifact;
  mergedAt?: string;
  lastFailingCheckFingerprint?: string;
  suggestionFingerprints: string[];
  decisionFingerprints: string[];
}

/**
 * Derives state of a single item from assignment, step records, decisions, steering, and git (§6, §8).
 */
export async function deriveItemState(opts: {
  taskDir: string;
  itemSlug: string;
  parentBranch: string;
  taskWt?: string;
  kindConfig?: FlowKindConfig;
}): Promise<DerivedItemState> {
  const { taskDir, itemSlug, parentBranch, taskWt } = opts;
  const itemDir = path.join(taskDir, "items", itemSlug);
  const assignmentPath = path.join(itemDir, "assignment.yaml");

  let assignment: AssignmentArtifact | undefined;
  if (fs.existsSync(assignmentPath)) {
    try {
      assignment = await readYaml<AssignmentArtifact>(assignmentPath);
    } catch {
      // ignore
    }
  }

  const kind = assignment?.kind ?? "dev";
  const title = assignment?.title ?? itemSlug;
  const wave = assignment?.wave ? Number(assignment.wave) : 1;
  const deps = assignment?.deps ?? [];
  const branch = childBranch(parentBranch, itemSlug);

  // 1. Read step records
  const stepsDir = path.join(itemDir, "steps");
  const records: ItemStepRecordInfo[] = [];
  let interruptionCount = 0;

  if (fs.existsSync(stepsDir)) {
    const entries = await fs.promises.readdir(stepsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const parsed = parseStepRecordDirName(ent.name);
      if (!parsed) continue;

      const recordDir = path.join(stepsDir, ent.name);
      const metaPath = path.join(recordDir, "meta.yaml");
      if (!fs.existsSync(metaPath)) continue;

      let meta: StepMetaArtifact;
      try {
        meta = await readYaml<StepMetaArtifact>(metaPath);
      } catch {
        continue;
      }

      let output: unknown;
      const outputPath = path.join(recordDir, "output.yaml");
      if (fs.existsSync(outputPath)) {
        try {
          output = await readYaml(outputPath);
        } catch {
          // ignore
        }
      }

      let checks: unknown;
      const checksPath = path.join(recordDir, "checks.yaml");
      if (fs.existsSync(checksPath)) {
        try {
          checks = await readYaml(checksPath);
        } catch {
          // ignore
        }
      }

      if (meta.status === "interrupted") {
        interruptionCount++;
      }

      records.push({
        dirName: ent.name,
        seq: parsed.seq,
        name: parsed.name,
        attempt: parsed.attempt,
        meta,
        output,
        checks,
      });
    }
  }

  // Sort records by sequence number
  records.sort((a, b) => a.seq - b.seq);

  // 2. Read decisions affecting this item
  const decisionsDir = path.join(taskDir, "decisions");
  let isEscalated = false;
  let isAbandoned = false;
  let isSplit = false;
  let isAcceptedWithDebt = false;
  let guidanceText: string | undefined;
  const decisionFingerprints: string[] = [];

  if (fs.existsSync(decisionsDir)) {
    const dentries = await fs.promises.readdir(decisionsDir, { withFileTypes: true });
    for (const dent of dentries) {
      if (!dent.isFile() || !dent.name.endsWith(".yaml")) continue;
      try {
        const d = await readYaml<DecisionArtifact>(path.join(decisionsDir, dent.name));
        const affectsItem = dent.name.includes(itemSlug) || d.id.includes(itemSlug) || (d as any).item === itemSlug;
        if (affectsItem) {
          if (d.decision === "escalate") {
            isEscalated = true;
          } else if (d.decision === "abandon") {
            isAbandoned = true;
          } else if (d.decision === "split") {
            isSplit = true;
          } else if (d.decision === "accept-with-debt") {
            isAcceptedWithDebt = true;
          } else if (d.decision === "retry-with-guidance") {
            guidanceText = d.text;
          }
          if (d.decision) {
            decisionFingerprints.push(d.decision);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 3. Read steering questions
  let openSteerQuestion: SteerItemArtifact | undefined;
  const steerDir = path.join(taskDir, "steer", "tousertoreview");
  if (fs.existsSync(steerDir)) {
    const sentries = await fs.promises.readdir(steerDir, { withFileTypes: true });
    for (const sent of sentries) {
      if (!sent.isFile() || !sent.name.endsWith(".yaml")) continue;
      try {
        const q = await readYaml<SteerItemArtifact>(path.join(steerDir, sent.name));
        if (
          q.status === "open" &&
          (q.ref === itemSlug || q.ref.endsWith(`/${itemSlug}`))
        ) {
          openSteerQuestion = q;
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Check if merged in git
  let isMerged = false;
  let mergedAt: string | undefined;
  if (taskWt) {
    try {
      const branchShaRes = await git(taskWt, ["rev-parse", branch], { allowFail: true });
      const headShaRes = await git(taskWt, ["rev-parse", "HEAD"], { allowFail: true });
      const branchSha = branchShaRes.stdout.trim();
      const headSha = headShaRes.stdout.trim();

      if (branchSha && headSha && branchSha !== headSha) {
        const res = await git(
          taskWt,
          ["merge-base", "--is-ancestor", branch, "HEAD"],
          { allowFail: true }
        );
        if (res.code === 0) {
          isMerged = true;
          const logRes = await git(taskWt, ["log", "-1", "--format=%cI", branch], { allowFail: true });
          if (logRes.code === 0 && logRes.stdout.trim()) {
            mergedAt = logRes.stdout.trim();
          }
        }
      }
    } catch {
      // branch might not exist or error
    }
  }

  // 5. Compute fix round and attempt counts
  let currentAttempt = 1;
  let currentFixRound = 1;
  const suggestionFingerprints: string[] = [];

  for (const r of records) {
    if (r.meta.attempt && r.meta.status !== "interrupted") {
      currentAttempt = Math.max(currentAttempt, r.meta.attempt);
    }
    // Check if review suggested fix
    if (r.output && typeof r.output === "object" && "suggestions" in (r.output as any)) {
      const review = r.output as ReviewArtifact;
      const fixSuggestions = review.suggestions?.filter((s) => s.disposition === "fix");
      if (fixSuggestions && fixSuggestions.length > 0) {
        currentFixRound++;
      }
    }
  }

  // 6. Determine status
  let status: DerivedItemState["status"] = "pending";
  if (isMerged) {
    status = "merged";
  } else if (isAbandoned) {
    status = "failed";
  } else if (isSplit) {
    status = "superseded";
  } else if (openSteerQuestion) {
    status = "blocked";
  } else if (isAcceptedWithDebt) {
    status = "ready";
  } else if (records.length === 0) {
    status = "pending";
  } else {
    // Look at the latest record
    const lastRecord = records[records.length - 1]!;
    if (lastRecord.meta.status === "started") {
      status = "running";
    } else if (lastRecord.meta.status === "ok") {
      // Check if last step was the terminal step in the flow
      const defaultStepsForKind: Record<string, string[]> = {
        dev: ["test-first", "develop", "qa", "review"],
        "no-behavior": ["develop", "qa", "review"],
        "test-only": ["test-first", "qa", "review"],
        simple: ["develop"],
        "fact-finder": ["fact-finder"],
        poc: ["poc"],
        "test-assumptions": ["test-assumptions"],
      };
      const configuredSteps = opts.kindConfig?.steps.map((s) => s.id);
      const flowSteps =
        configuredSteps && configuredSteps.length > 0
          ? configuredSteps
          : (defaultStepsForKind[kind] ?? ["develop", "review"]);
      const lastFlowStepId = flowSteps[flowSteps.length - 1];
      if (lastFlowStepId && lastRecord.name === lastFlowStepId) {
        // Last step was completed! Check if any review requested changes
        if (lastRecord.output && typeof lastRecord.output === "object" && "suggestions" in (lastRecord.output as any)) {
          const rev = lastRecord.output as ReviewArtifact;
          const hasFix = rev.suggestions?.some((s) => s.disposition === "fix");
          if (!hasFix) {
            status = "ready";
          } else {
            status = "running";
          }
        } else {
          status = "ready";
        }
      } else {
        status = "running";
      }
    } else if (lastRecord.meta.status === "rejected" || lastRecord.meta.status === "error" || lastRecord.meta.status === "interrupted") {
      status = "running";
    }
  }

  return {
    slug: itemSlug,
    kind,
    title,
    wave,
    deps,
    status,
    assignment,
    branch,
    records,
    currentStepId: records[records.length - 1]?.name,
    currentAttempt,
    currentFixRound,
    isEscalated,
    interruptionCount,
    guidanceText,
    openSteerQuestion,
    mergedAt,
    suggestionFingerprints,
    decisionFingerprints,
  };
}

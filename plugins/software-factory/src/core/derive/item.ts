import fs from "node:fs";
import path from "node:path";
import type {
  AssignmentArtifact,
  DecisionArtifact,
  FlowKindConfig,
  PipelineConfig,
  ReviewArtifact,
  StateItemInfo,
  StepMetaArtifact,
  SteerItemArtifact,
} from "../artifacts.js";
import { readYaml } from "../records/io.js";
import { parseStepRecordDirName } from "../records/step-record.js";
import { git } from "../git/exec.js";
import { childBranch } from "../git/naming.js";
import { isAncestor } from "../git/commit.js";
import { fingerprintSuggestions, fingerprintCheckFailure } from "../loops.js";
import { getDefaultFlowForKind } from "../flows/item-machine.js";

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
  freshSeries: boolean;
  interruptionCount: number;
  guidanceText?: string;
  openSteerQuestion?: SteerItemArtifact;
  mergedAt?: string;
  consultCount: number;
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
  childWt?: string;
  pipeline?: PipelineConfig;
  kindConfig?: FlowKindConfig;
}): Promise<DerivedItemState> {
  const { taskDir, itemSlug, parentBranch, taskWt, childWt, pipeline } = opts;
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

  // 0. Epic items: status comes from the recorded child close-up (§8.6).
  // A finished epic (done) is ready for the merge path; blocked/failed map directly.
  let epicChildStatus: "done" | "blocked" | "failed" | undefined;
  if (kind === "epic") {
    const childCloseupPath = path.join(itemDir, "child-closeup.yaml");
    if (fs.existsSync(childCloseupPath)) {
      try {
        const cc = await readYaml<{ status?: string }>(childCloseupPath);
        if (cc.status === "done" || cc.status === "blocked" || cc.status === "failed") {
          epicChildStatus = cc.status;
        }
      } catch {
        // ignore
      }
    }
  }

  // 1. Read step records from child worktree (if it exists) or task worktree
  let stepsDir = path.join(itemDir, "steps");
  let effectiveChildWt = childWt;
  if (!effectiveChildWt && taskWt) {
    const candidatePath = path.join(path.dirname(taskWt), branch.replace(/\//g, "_"));
    if (fs.existsSync(candidatePath)) {
      effectiveChildWt = candidatePath;
    }
  }

  if (effectiveChildWt) {
    const orchFolder = taskDir.includes("/.factory") ? ".factory" : path.basename(path.dirname(taskDir));
    const childStepsDir = path.join(effectiveChildWt, orchFolder, path.basename(taskDir), "items", itemSlug, "steps");
    if (fs.existsSync(childStepsDir)) {
      stepsDir = childStepsDir;
    }
  }

  const records: ItemStepRecordInfo[] = [];
  let interruptionCount = 0;
  let lastFailingCheckFingerprint: string | undefined;

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
          if (checks && typeof checks === "object" && "checks" in checks) {
            const checkList = (checks as any).checks as Array<{ ok?: boolean; summary?: string }>;
            const failing = checkList?.find((c) => !c.ok);
            if (failing && failing.summary) {
              lastFailingCheckFingerprint = fingerprintCheckFailure(failing.summary);
            }
          }
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

  // 2. Read decisions affecting this item (exact match only, §8.5, Finding 10 & 16)
  const decisionsDir = path.join(taskDir, "decisions");
  let isEscalated = false;
  let isAbandoned = false;
  let isSplit = false;
  let isAcceptedWithDebt = false;
  let guidanceText: string | undefined;
  const decisionFingerprints: string[] = [];
  let consultCount = 0;
  let latestDecision: (DecisionArtifact & { item?: string; afterRecord?: string }) | undefined;
  let latestDecisionSeq = 0;

  if (fs.existsSync(decisionsDir)) {
    const dentries = (await fs.promises.readdir(decisionsDir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const dent of dentries) {
      if (!dent.isFile() || !dent.name.endsWith(".yaml")) continue;
      try {
        const decisionPath = path.join(decisionsDir, dent.name);
        const d = await readYaml<DecisionArtifact & { item?: string; afterRecord?: string }>(decisionPath);
        // Match exact item only
        if (d.item === itemSlug) {
          consultCount++;
          const seqMatch = /^(\d{3})-/.exec(dent.name);
          const seqNum = seqMatch ? parseInt(seqMatch[1]!, 10) : 0;
          if (seqNum >= latestDecisionSeq) {
            latestDecisionSeq = seqNum;
            latestDecision = d;
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
          (q.ref === itemSlug || q.ref === `${taskDir.split("/").pop()}/${itemSlug}`)
        ) {
          openSteerQuestion = q;
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Check if merged in git (Finding 15: requires own commits and ancestor of task HEAD)
  let isMerged = false;
  let mergedAt: string | undefined;
  if (taskWt) {
    try {
      const branchShaRes = await git(taskWt, ["rev-parse", branch], { allowFail: true });
      const headShaRes = await git(taskWt, ["rev-parse", "HEAD"], { allowFail: true });
      const branchSha = branchShaRes.stdout.trim();
      const headSha = headShaRes.stdout.trim();

      if (branchSha && headSha) {
        // Check for a merge commit with the item branch as second parent (§7, Finding 15)
        const mergesRes = await git(taskWt, ["log", "--merges", "--format=%P", "-n", "100", "HEAD"], { allowFail: true });
        if (mergesRes.code === 0) {
          const lines = mergesRes.stdout.split("\n");
          for (const line of lines) {
            const parents = line.trim().split(/\s+/);
            if (parents.length >= 2 && parents[1] === branchSha) {
              isMerged = true;
              break;
            }
          }
        }
        if (isMerged) {
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

  // 5. Compute fix round and attempt counts, scoped to the current series.
  // A retry-with-guidance/escalate decision starts a fresh series: only records
  // written after the decision count toward attempts and fix rounds (§8.5).
  // Ordering is durable: the decision records the newest item record dir name
  // at decision time (afterRecord, committed content); record dir names sort
  // lexicographically by zero-padded seq, so string comparison orders the series.
  let currentAttempt = 1;
  let currentFixRound = 1;
  const suggestionFingerprints: string[] = [];

  const retryDecision = Boolean(
    latestDecision &&
    (latestDecision.decision === "retry-with-guidance" || latestDecision.decision === "escalate")
  );
  const seriesStart = retryDecision ? (latestDecision!.afterRecord ?? "") : "";
  const seriesRecords = seriesStart
    ? records.filter((r) => r.dirName > seriesStart)
    : records;

  for (const r of seriesRecords) {
    if (r.meta.attempt && r.meta.status !== "interrupted") {
      currentAttempt = Math.max(currentAttempt, r.meta.attempt);
    }
    // Check if review suggested fix
    if (r.output && typeof r.output === "object" && "suggestions" in (r.output as any)) {
      const review = r.output as ReviewArtifact;
      const fixSuggestions = review.suggestions?.filter((s) => s.disposition === "fix");
      if (fixSuggestions && fixSuggestions.length > 0) {
        currentFixRound++;
        suggestionFingerprints.push(fingerprintSuggestions(fixSuggestions));
      }
    }
  }

  // A decision is fresh while no item record exists past its afterRecord pointer.
  const newestDirName = records.length > 0 ? records[records.length - 1]!.dirName : "";
  const decisionIsFresh = Boolean(
    latestDecision && (!latestDecision.afterRecord || newestDirName <= latestDecision.afterRecord)
  );
  if (latestDecision) {
    const d = latestDecision.decision;
    if (d === "retry-with-guidance" || d === "escalate") {
      // Guidance hydrates the fresh series; persist=true keeps it beyond that.
      if (decisionIsFresh || latestDecision.persist) {
        guidanceText = latestDecision.text;
      }
      // Escalation sticks once granted.
      if (d === "escalate") {
        isEscalated = true;
      }
    } else if (decisionIsFresh) {
      if (d === "abandon") {
        isAbandoned = true;
      } else if (d === "split") {
        isSplit = true;
      } else if (d === "accept-with-debt") {
        isAcceptedWithDebt = true;
      }
    }
  }

  // 6. Determine status from flow configuration (Finding 8: shared source of truth)
  let status: DerivedItemState["status"] = "pending";
  if (isMerged) {
    status = "merged";
  } else if (epicChildStatus === "failed") {
    status = "failed";
  } else if (epicChildStatus === "blocked") {
    status = "blocked";
  } else if (epicChildStatus === "done") {
    status = "ready";
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
      const kindFlow = opts.kindConfig ?? (pipeline ? getDefaultFlowForKind(kind, pipeline) : undefined);
      const configuredSteps = kindFlow?.steps.map((s) => s.id) ?? ["develop", "review"];
      const lastFlowStepId = configuredSteps[configuredSteps.length - 1];

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
    } else if (
      lastRecord.meta.status === "rejected" ||
      lastRecord.meta.status === "error" ||
      lastRecord.meta.status === "interrupted"
    ) {
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
    freshSeries: retryDecision && decisionIsFresh,
    interruptionCount,
    guidanceText,
    openSteerQuestion,
    mergedAt,
    consultCount,
    lastFailingCheckFingerprint,
    suggestionFingerprints,
    decisionFingerprints,
  };
}

import fs, { type Dirent } from "node:fs";
import path from "node:path";
import type {
  AssignmentArtifact,
  DecisionArtifact,
  FlowKindConfig,
  PipelineConfig,
  ProjectConfig,
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
import { questionBlocks } from "../steer.js";
import { listConcerns } from "../concerns.js";

export interface ItemStepRecordInfo {
  dirName: string;
  seq: number;
  name: string;
  attempt: number;
  fixRound: number | null;
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
  /** Failing-check fingerprints for the current decision series, oldest→newest. */
  failingCheckFingerprints: string[];
  suggestionFingerprints: string[];
  decisionFingerprints: string[];
}

/**
 * Whether an open steer question blocks the given item slug (§8.7, §8.8).
 * `human-awareness` is informational and never blocks. An explicit `blocks`
 * list (including `[]`) is authoritative. Files predating the `blocks` field
 * block only when their disposition is blocking (`human-async`/`human-stop`)
 * and the ref addresses this item.
 */
export function steerQuestionBlocksSlug(
  q: SteerItemArtifact,
  slug: string,
  refMatches: boolean
): boolean {
  if (!q || q.status !== "open") return false;
  if (q.disposition === "human-awareness") return false;
  if (Array.isArray(q.blocks)) return q.blocks.includes(slug);
  return refMatches && (q.disposition === "human-async" || q.disposition === "human-stop");
}
/**
 * Applies routed concern blocking (adr-routing-derived-state): a pending item
 * named by a routed blocker concern derives `blocked`. Pending-only matches
 * the §8.2 blocked-by-failure precedent and avoids retro-blocking in-flight
 * (running/ready) work, keeping deriveTaskState consistent with
 * deriveWaveState/blockedByConcern which seed pending items only.
 */
export function withRoutedBlocking(
  state: DerivedItemState,
  blockedBy?: ReadonlySet<string>
): DerivedItemState {
  if (!blockedBy?.has(state.slug)) {
    return state;
  }
  if (state.status === "blocked") {
    return state;
  }
  // Only pending items are seeded: retro-blocking running/ready work would
  // break the wave merge path. The wave-level fixpoint cascades dependents
  // transitively, so running seeds still propagate through their deps.
  if (state.status !== "pending") {
    return state;
  }
  return { ...state, status: "blocked" };
}

/**
 * Derives state of a single item from assignment, step records, decisions, steering, and git (§6, §8).
 */
export async function deriveItemState(opts: {
  taskDir: string;
  itemSlug: string;
  parentBranch: string;
  taskWt: string;
  childWt?: string;
  pipeline?: PipelineConfig;
  project?: ProjectConfig;
  kindConfig?: FlowKindConfig;
  rootTaskDir?: string;
  /** Slugs named by routed blocker concerns (adr-routing-derived-state). */
  blockedBy?: Iterable<string>;
}): Promise<DerivedItemState> {
  const { taskDir, itemSlug, parentBranch, taskWt, childWt, pipeline, project } = opts;
  const itemDir = path.join(taskDir, "items", itemSlug);
  const assignmentPath = path.join(itemDir, "assignment.yaml");

  let assignment: AssignmentArtifact | undefined;
  if (fs.existsSync(assignmentPath)) {
    try {
      assignment = await readYaml<AssignmentArtifact>(assignmentPath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt assignment file at ${assignmentPath}: ${err?.message ?? err}`);
      }
    }
  }

  const kind = assignment?.kind ?? "dev";
  const title = assignment?.title ?? itemSlug;
  const wave = assignment?.wave ? Number(assignment.wave) : 1;
  const deps = assignment?.deps ?? [];
  const branch = childBranch(parentBranch, itemSlug, { allowReserved: itemSlug === "simple" });

  // 0. Epic items: status comes from the recorded child close-up (§8.6).
  // A finished epic (done) is ready for the merge path; blocked/failed map directly.
  let epicChildStatus: "done" | "blocked" | "failed" | undefined;
  if (kind === "epic") {
    const childCloseupPath = path.join(itemDir, "child-closeup.yaml");
    if (fs.existsSync(childCloseupPath)) {
      try {
        const cc = await readYaml<{ status?: string }>(childCloseupPath);
        if (cc && (cc.status === "done" || cc.status === "blocked" || cc.status === "failed")) {
          epicChildStatus = cc.status;
        }
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt child-closeup file at ${childCloseupPath}: ${err?.message ?? err}`);
        }
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
    const relTaskDir = path.relative(taskWt, taskDir);
    const childStepsDir = path.join(effectiveChildWt, relTaskDir, "items", itemSlug, "steps");
    if (fs.existsSync(childStepsDir)) {
      stepsDir = childStepsDir;
    }
  }

  const records: ItemStepRecordInfo[] = [];
  const recordFailingFingerprints = new Map<string, string>();
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
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt step record meta at ${metaPath}: ${err?.message ?? err}`);
        }
        continue;
      }
      let output: unknown;
      const outputPath = path.join(recordDir, "output.yaml");
      if (fs.existsSync(outputPath)) {
        try {
          output = await readYaml(outputPath);
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt step record output at ${outputPath}: ${err?.message ?? err}`);
          }
        }
      }

      let checks: unknown;
      const checksPath = path.join(recordDir, "checks.yaml");
      if (fs.existsSync(checksPath)) {
        try {
          checks = await readYaml(checksPath);
          if (checks && typeof checks === "object" && "checks" in checks) {
            // checks.yaml entries use {id, status: pass|fail|skipped, message}
            // (legacy shape {ok, summary} is tolerated for old records).
            const checkList = (checks as any).checks as Array<{
              id?: string;
              status?: string;
              message?: string;
              ok?: boolean;
              summary?: string;
            }>;
            const failing = checkList?.find((c) => c && (c.status === "fail" || c.ok === false));
            const failingText = failing
              ? (`${failing.id ?? ""} ${failing.message ?? failing.summary ?? ""}`.trim() || undefined)
              : undefined;
            if (failing && failingText) {
              const fp = fingerprintCheckFailure(failingText);
              recordFailingFingerprints.set(ent.name, fp);
              lastFailingCheckFingerprint = fp;
            }
          }
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt step record checks at ${checksPath}: ${err?.message ?? err}`);
          }
        }
      }

      records.push({
        dirName: ent.name,
        seq: parsed.seq,
        name: parsed.name,
        attempt: parsed.attempt,
        fixRound: parsed.fixRound ?? meta.fixRound ?? null,
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
        if (d && d.item === itemSlug) {
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
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          throw new Error(`Corrupt decision file at ${path.join(decisionsDir, dent.name)}: ${err?.message ?? err}`);
        }
      }
    }
  }

  // 3. Read steering questions
  let openSteerQuestion: SteerItemArtifact | undefined;
  const steerDirs = [path.join(taskDir, "steer", "tousertoreview")];
  if (opts.rootTaskDir && path.resolve(opts.rootTaskDir) !== path.resolve(taskDir)) {
    steerDirs.push(path.join(opts.rootTaskDir, "steer", "tousertoreview"));
  }
  for (const steerDir of steerDirs) {
    if (fs.existsSync(steerDir)) {
      const sentries = await fs.promises.readdir(steerDir, { withFileTypes: true });
      for (const sent of sentries) {
        if (!sent.isFile() || !sent.name.endsWith(".yaml")) continue;
        try {
          const qPath = path.join(steerDir, sent.name);
          const q = await readYaml<SteerItemArtifact>(qPath);
          if (q && questionBlocks(q, itemSlug)) {
            openSteerQuestion = q;
            break;
          }
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt steer question file at ${path.join(steerDir, sent.name)}: ${err?.message ?? err}`);
          }
        }
      }
      if (openSteerQuestion) break;
    }
  }

  // Routed-concern id set for the terminal-step gate below (live store:
  // the step-runner ingest commits concerns before derive runs, so a
  // concern created by the step under derivation is already visible).
  let routedConcernIds = new Set<string>();
  try {
    routedConcernIds = new Set((await listConcerns(taskDir)).map((c) => c.id));
  } catch {
    routedConcernIds = new Set();
  }

  // Answered-question visibility for the terminal-step gate below: an
  // answered blocking-capable question addressing this item forces a
  // feedback re-run in the item-machine tick, so derive must hold the item
  // `running` until that re-run lands (mirrors the tick's
  // answeredAsyncFeedback scan; digest answers never re-run).
  let answeredBlockingQuestion = false;
  for (const steerDir of steerDirs) {
    if (!fs.existsSync(steerDir)) continue;
    let sentries: Dirent[];
    try {
      sentries = await fs.promises.readdir(steerDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sent of sentries) {
      if (!sent.isFile() || !sent.name.endsWith(".yaml")) continue;
      try {
        const q = await readYaml<SteerItemArtifact>(path.join(steerDir, sent.name));
        if (!q || q.status !== "answered" || !q.answer) continue;
        if (q.disposition !== "human-async" && q.disposition !== "human-stop") continue;
        const addresses =
          q.blocks?.includes(itemSlug) ||
          (!Array.isArray(q.blocks) &&
            (q.ref === itemSlug ||
              q.ref === `${path.basename(taskDir)}/${itemSlug}` ||
              (opts.rootTaskDir ? q.ref === `${path.basename(opts.rootTaskDir)}/${itemSlug}` : false)));
        if (addresses) {
          answeredBlockingQuestion = true;
          break;
        }
      } catch {
        // Corrupt mailbox files are the open-scan's error; ignore here.
      }
    }
    if (answeredBlockingQuestion) break;
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
      // git inspect failure
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
    } else if (d === "abandon" || d === "split") {
      // Terminal and sticky: the LATEST decision revokes by replacement, so no
      // freshness check — a stray post-decision record never resurrects the item.
      if (d === "abandon") {
        isAbandoned = true;
      } else {
        isSplit = true;
      }
    } else if (decisionIsFresh && d === "accept-with-debt") {
      isAcceptedWithDebt = true;
    }
  }

  // Interruptions count within the current decision series only (like attempts):
  // a fresh retry series resets the interruption budget along with attempts.
  const interruptionCount = seriesRecords.filter((r) => r.meta.status === "interrupted").length;

  // 6. Determine status from flow configuration (Finding 8: shared source of truth)
  let status: DerivedItemState["status"] = "pending";
  if (isMerged) {
    status = "merged";
  } else if (isAbandoned) {
    // The LATEST abandon/split decision overrides a recorded epic child
    // close-up: consult beats a stale child-closeup.yaml (§8.5/§8.6).
    status = "failed";
  } else if (isSplit) {
    status = "superseded";
  } else if (epicChildStatus === "failed") {
    status = "failed";
  } else if (epicChildStatus === "blocked") {
    status = "blocked";
  } else if (epicChildStatus === "done") {
    status = "ready";
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
        // Last step was completed! Check if any review requested changes.
        // `fix` keeps the item mid-flow; `human-async`/`human-stop` do too,
        // but ONLY when they actually block this item: a routed concern-id
        // disposition blocks only if the router wrote an open blocking
        // question for it (severity downgrade/suppression keeps the item
        // moving), and a digest (`human-awareness`, empty blocks) never
        // blocks. Raw (non-concern) human dispositions always block until
        // the operator answers (the question file persists the block even
        // after answering — the item-machine consumes the answer as
        // feedback and re-runs).
        if (lastRecord.output && typeof lastRecord.output === "object" && "suggestions" in (lastRecord.output as any)) {
          const rev = lastRecord.output as ReviewArtifact;
          const hasFix = (rev.suggestions ?? []).some((s) => {
            if (s.disposition === "fix") return true;
            if (s.disposition !== "human-async" && s.disposition !== "human-stop") return false;
            // Concern-id dispositions route through triage: an open blocking
            // question already forced `blocked` above, so reaching here
            // means downgraded/suppressed (ready) — unless an answered
            // blocking question still awaits its feedback re-run.
            if (s.id && routedConcernIds.has(s.id)) return answeredBlockingQuestion;
            return true;
          });
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

  // Failing-check fingerprints for the current series (oldest→newest), for the
  // no-progress detector (§12.2): same failure twice short-circuits to consult.
  const failingCheckFingerprints = seriesRecords
    .map((r) => recordFailingFingerprints.get(r.dirName))
    .filter((fp): fp is string => typeof fp === "string");

  return withRoutedBlocking(
    {
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
      failingCheckFingerprints,
      suggestionFingerprints,
      decisionFingerprints,
    },
    opts.blockedBy ? new Set(opts.blockedBy) : undefined
  );
}

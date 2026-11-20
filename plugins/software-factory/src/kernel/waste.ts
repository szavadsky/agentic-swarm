import { countOutcomeRepairs } from "../harness/usage.js";
import { formatCause } from "./cause.js";
import { recordDirName } from "./store.js";
import { KERNEL_STEPS } from "./types.js";
import type { Cause, CauseKind, StepRecord } from "./types.js";

/**
 * Why a turn was wasted. Rebutted reviews are not a reason: a change review
 * asked to improve is the accepted tax, counted apart from waste.
 */
export interface WasteCounts {
  /** The implementer spent tokens and landed nothing. */
  implementerFailure: number;
  /** The outcome/verdict protocol failed: refusal, truncation, invalid outcome. */
  structureProtocol: number;
  /** A containment breach refused the turn's work. */
  structureContainment: number;
  /** Outcome-repair calls were needed before the turn delivered. */
  structureOutcomeChannel: number;
  /** Infra stopped the turn or a gate could not run. */
  structureInfra: number;
  /** A gate red rejected the turn, the same tree then passed. */
  flakyTestRejection: number;
}

export type WasteReason = keyof WasteCounts;

/** Stable reason order for every table, line and metric. */
export const WASTE_REASONS: readonly WasteReason[] = [
  "implementerFailure",
  "structureProtocol",
  "structureContainment",
  "structureOutcomeChannel",
  "structureInfra",
  "flakyTestRejection",
];

export const WASTE_REASON_LABEL: Record<WasteReason, string> = {
  implementerFailure: "complete implementer failure",
  structureProtocol: "structure: protocol",
  structureContainment: "structure: containment",
  structureOutcomeChannel: "structure: outcome channel",
  structureInfra: "structure: infra",
  flakyTestRejection: "flaky-test rejection",
};

export function emptyWasteCounts(): WasteCounts {
  return {
    implementerFailure: 0,
    structureProtocol: 0,
    structureContainment: 0,
    structureOutcomeChannel: 0,
    structureInfra: 0,
    flakyTestRejection: 0,
  };
}

/** One wasted turn; the record names the turn and the evidence names its proof. */
export interface WasteEntry {
  reason: WasteReason;
  /** Goal-relative record directory of the wasted turn. */
  record: string;
  role: string;
  alias: string;
  slug?: string;
  step: string;
  round: number;
  /** Goal-relative record directory that proves the classification. */
  evidence: string;
  detail: string;
}

/** A review turn whose verdict was `changes`: accepted tax, never waste. */
export interface RebuttedReview {
  record: string;
  role: string;
  alias: string;
  slug?: string;
  step: string;
  round: number;
  summary: string;
}

export interface WasteAccounting {
  /** Wasted turns in this iteration: one entry per turn. */
  turns: number;
  counts: WasteCounts;
  entries: WasteEntry[];
  /** Review turns whose verdict was `changes`; counted apart from waste. */
  rebuttedReviews: RebuttedReview[];
}

export function emptyWasteAccounting(): WasteAccounting {
  return {
    turns: 0,
    counts: emptyWasteCounts(),
    entries: [],
    rebuttedReviews: [],
  };
}

export interface WasteInput {
  /** The iteration's records, in any order. */
  records: readonly StepRecord[];
  /** The role a step's prompt names, for the per-role counts. */
  roleOf(step: string): string;
}

interface Candidate {
  reason: WasteReason;
  /** Lower wins when one turn has several failure facts. */
  priority: number;
  evidence: StepRecord;
  detail: string;
}

const PRIORITY = {
  infra: 10,
  protocol: 20,
  containment: 30,
  implementerFailure: 40,
  outcomeChannel: 50,
  flakyRejection: 60,
} as const;

function isAgentTurn(rec: StepRecord): boolean {
  return rec.actor === "agent" && rec.endedAt !== undefined;
}

function recordPath(rec: StepRecord): string {
  return `records/${recordDirName(rec.seq, rec)}`;
}

/** One line, so a long model summary never breaks the section or the pack. */
function summaryLine(text: string, max = 160): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

function stopDetail(rec: StepRecord): string {
  if (!rec.stop) return "no recorded stop";
  if (rec.stop.kind === "infra") {
    return `infra: ${rec.stop.cause}${rec.stop.details ? ` (${rec.stop.details})` : ""}`;
  }
  if (rec.stop.kind === "refusal") {
    return `refusal${rec.stop.details ? `: ${rec.stop.details}` : ""}`;
  }
  if (rec.stop.kind === "truncated") return `truncated: ${rec.stop.cause}`;
  return rec.stop.kind;
}

/** A task-flow turn: not a boundary role and not a review carrying a verdict. */
function isTaskTurn(rec: StepRecord, role: string): boolean {
  return (
    !(KERNEL_STEPS as readonly string[]).includes(rec.step) &&
    !/review/i.test(role) &&
    rec.outcome?.verdict === undefined
  );
}

/** The step/round a park's detail names, when the producer wrote one. */
function namedTurn(
  rec: StepRecord,
): { step: string; round: number } | undefined {
  const match = /^([a-z][\w-]*) r(\d+)\b/i.exec(rec.cause?.detail ?? "");
  if (!match) return undefined;
  return { step: match[1]!, round: Number(match[2]) };
}

/** The turn a park ended: the named step/round, else the slug's latest turn. */
function turnForPark(
  ordered: readonly StepRecord[],
  park: StepRecord,
): StepRecord | undefined {
  const candidates = ordered.filter(
    (rec) =>
      isAgentTurn(rec) &&
      rec.slug === park.slug &&
      rec.seq < park.seq &&
      (rec.revision ?? 0) === (park.revision ?? 0),
  );
  const named = namedTurn(park);
  if (named) {
    const exact = candidates.filter(
      (rec) => rec.step === named.step && rec.round === named.round,
    );
    if (exact.length > 0) return exact.at(-1);
  }
  return candidates.at(-1);
}

interface ParkRule {
  reason: WasteReason;
  priority: number;
  /** Gates parks only waste a productive turn; a review's merge gate does not. */
  productiveOnly?: boolean;
}

const PARK_RULES: Partial<Record<CauseKind, ParkRule>> = {
  infra: { reason: "structureInfra", priority: PRIORITY.infra },
  "infra-repeat": { reason: "structureInfra", priority: PRIORITY.infra },
  overflow: { reason: "structureInfra", priority: PRIORITY.infra },
  setup: { reason: "structureInfra", priority: PRIORITY.infra },
  "invalid-outcome": {
    reason: "structureProtocol",
    priority: PRIORITY.protocol,
  },
  refused: { reason: "structureProtocol", priority: PRIORITY.protocol },
  containment: {
    reason: "structureContainment",
    priority: PRIORITY.containment,
  },
  "outside-change": {
    reason: "structureContainment",
    priority: PRIORITY.containment,
  },
  "empty-diff": {
    reason: "implementerFailure",
    priority: PRIORITY.implementerFailure,
  },
  "no-progress": {
    reason: "implementerFailure",
    priority: PRIORITY.implementerFailure,
  },
  failed: {
    reason: "implementerFailure",
    priority: PRIORITY.implementerFailure,
    productiveOnly: true,
  },
  gates: {
    reason: "implementerFailure",
    priority: PRIORITY.implementerFailure,
    productiveOnly: true,
  },
};

function parkRule(cause: Cause | undefined): ParkRule | undefined {
  return cause ? PARK_RULES[cause.kind] : undefined;
}

/** The closest gate record of one step for a slug/revision on one side of a turn. */
function nearestGate(
  ordered: readonly StepRecord[],
  turn: StepRecord,
  side: "before" | "after",
  step: "checks" | "merge-checks" = "checks",
): StepRecord | undefined {
  return ordered
    .filter(
      (rec) =>
        rec.actor === "script" &&
        rec.step === step &&
        rec.endedAt !== undefined &&
        rec.slug === turn.slug &&
        (rec.revision ?? 0) === (turn.revision ?? 0) &&
        (side === "before" ? rec.seq < turn.seq : rec.seq > turn.seq),
    )
    .at(side === "before" ? -1 : 0);
}

/** The gate that preceded a fix turn: the closest of task checks and merge checks. */
function gateBeforeFix(
  ordered: readonly StepRecord[],
  turn: StepRecord,
): StepRecord | undefined {
  const merged = nearestGate(ordered, turn, "before", "merge-checks");
  const checks = nearestGate(ordered, turn, "before", "checks");
  if (!merged) return checks;
  if (!checks) return merged;
  return merged.seq > checks.seq ? merged : checks;
}

/**
 * A fix turn that committed nothing after red gates. Green on the same tree
 * later proves the red was flaky; red again is a complete implementer failure.
 */
function zeroDiffFix(
  ordered: readonly StepRecord[],
  turn: StepRecord,
  role: string,
): Candidate | undefined {
  if (!isTaskTurn(turn, role) || turn.edits?.files !== 0) return undefined;
  const before = gateBeforeFix(ordered, turn);
  if (!before || before.ok !== false) return undefined;
  const gate = before.step as "checks" | "merge-checks";
  const after = nearestGate(ordered, turn, "after", gate);
  if (!after) return undefined;
  if (after.ok === true) {
    return {
      reason: "flakyTestRejection",
      priority: PRIORITY.flakyRejection,
      evidence: after,
      detail: `fixed nothing after red ${gate}; the same tree passed ${gate} (${recordPath(before)} then ${recordPath(after)})`,
    };
  }
  return {
    reason: "implementerFailure",
    priority: PRIORITY.implementerFailure,
    evidence: after,
    detail: `fixed nothing after red ${gate}; the next ${gate} stayed red (${recordPath(after)})`,
  };
}

/** A park's turn: the script record names the waste and where it was proven. */
function parkCandidate(
  ordered: readonly StepRecord[],
  park: StepRecord,
  roleOf: (step: string) => string,
): { turn: StepRecord; candidate: Candidate } | undefined {
  const rule = parkRule(park.cause);
  if (!rule) return undefined;
  const turn = turnForPark(ordered, park);
  if (!turn) return undefined;
  if (rule.productiveOnly && !isTaskTurn(turn, roleOf(turn.step))) {
    return undefined;
  }
  return {
    turn,
    candidate: {
      reason: rule.reason,
      priority: rule.priority,
      evidence: park,
      detail: summaryLine(
        park.cause ? formatCause(park.cause) : "no recorded cause",
      ),
    },
  };
}

function addOwnCandidate(
  candidates: Map<number, Candidate>,
  rec: StepRecord,
  candidate: Candidate | undefined,
): void {
  if (!candidate) return;
  const previous = candidates.get(rec.seq);
  if (!previous || candidate.priority < previous.priority) {
    candidates.set(rec.seq, candidate);
  }
}

function ownCandidate(rec: StepRecord, role: string): Candidate | undefined {
  if (rec.stop?.kind === "infra" && !rec.outcome) {
    return {
      reason: "structureInfra",
      priority: PRIORITY.infra,
      evidence: rec,
      detail: summaryLine(stopDetail(rec)),
    };
  }
  if (
    (rec.stop?.kind === "refusal" || rec.stop?.kind === "truncated") &&
    !rec.outcome
  ) {
    return {
      reason: "structureProtocol",
      priority: PRIORITY.protocol,
      evidence: rec,
      detail: summaryLine(stopDetail(rec)),
    };
  }
  if (
    isTaskTurn(rec, role) &&
    (rec.outcome?.status === "failed" || rec.outcome?.status === "blocked")
  ) {
    return {
      reason: "implementerFailure",
      priority: PRIORITY.implementerFailure,
      evidence: rec,
      detail: `outcome ${rec.outcome.status}: ${summaryLine(rec.outcome.summary)}`,
    };
  }
  const repairs =
    (rec.repairFindings?.length ?? 0) + countOutcomeRepairs(rec.attempts);
  if (repairs > 0) {
    return {
      reason: "structureOutcomeChannel",
      priority: PRIORITY.outcomeChannel,
      evidence: rec,
      detail:
        rec.repairFindings && rec.repairFindings.length > 0
          ? summaryLine(`outcome repair: ${rec.repairFindings[0]!}`)
          : `${repairs} outcome-repair call(s)`,
    };
  }
  return undefined;
}

/** Every waste candidate in the iteration, deduped by priority per turn. */
function collectCandidates(
  ordered: readonly StepRecord[],
  roleOf: (step: string) => string,
): Map<number, Candidate> {
  const candidates = new Map<number, Candidate>();
  for (const rec of ordered) {
    if (!isAgentTurn(rec) || rec.outcome?.verdict === "changes") continue;
    addOwnCandidate(candidates, rec, ownCandidate(rec, roleOf(rec.step)));
  }
  for (const park of ordered) {
    if (park.actor !== "script" || park.step !== "park" || !park.endedAt) {
      continue;
    }
    const found = parkCandidate(ordered, park, roleOf);
    if (found) addOwnCandidate(candidates, found.turn, found.candidate);
  }
  for (const rec of ordered) {
    if (!isAgentTurn(rec) || rec.outcome?.verdict === "changes") continue;
    addOwnCandidate(
      candidates,
      rec,
      zeroDiffFix(ordered, rec, roleOf(rec.step)),
    );
  }
  return candidates;
}

function entryOf(
  turn: StepRecord,
  candidate: Candidate,
  roleOf: (step: string) => string,
): WasteEntry {
  const role = roleOf(turn.step);
  return {
    reason: candidate.reason,
    record: recordPath(turn),
    role,
    alias: turn.alias ?? role,
    ...(turn.slug ? { slug: turn.slug } : {}),
    step: turn.step,
    round: turn.round,
    evidence: recordPath(candidate.evidence),
    detail: candidate.detail,
  };
}

function wasteEntries(
  ordered: readonly StepRecord[],
  candidates: Map<number, Candidate>,
  roleOf: (step: string) => string,
): WasteEntry[] {
  return [...candidates.entries()]
    .sort(([left], [right]) => left - right)
    .map(([seq, candidate]) => {
      const turn = ordered.find((rec) => rec.seq === seq)!;
      return entryOf(turn, candidate, roleOf);
    });
}

function rebuttedOf(
  ordered: readonly StepRecord[],
  wasted: ReadonlySet<string>,
  roleOf: (step: string) => string,
): RebuttedReview[] {
  return ordered
    .filter(
      (rec) =>
        isAgentTurn(rec) &&
        rec.outcome?.verdict === "changes" &&
        !wasted.has(recordPath(rec)),
    )
    .map((review) => {
      const role = roleOf(review.step);
      return {
        record: recordPath(review),
        role,
        alias: review.alias ?? role,
        ...(review.slug ? { slug: review.slug } : {}),
        step: review.step,
        round: review.round,
        summary: summaryLine(review.outcome?.summary ?? "no summary"),
      };
    });
}

/**
 * The iteration's wasted turns by reason, per role and alias input. A review
 * whose verdict is `changes` is a rebutted review unless a structure failure
 * (park, stop) also names it; rebutted reviews are counted apart, never as waste.
 */
export function wasteAccounting(input: WasteInput): WasteAccounting {
  const ordered = [...input.records].sort((a, b) => a.seq - b.seq);
  const entries = wasteEntries(
    ordered,
    collectCandidates(ordered, input.roleOf),
    input.roleOf,
  );
  const counts = emptyWasteCounts();
  for (const entry of entries) counts[entry.reason] += 1;
  const wasted = new Set(entries.map((entry) => entry.record));
  return {
    turns: entries.length,
    counts,
    entries,
    rebuttedReviews: rebuttedOf(ordered, wasted, input.roleOf),
  };
}

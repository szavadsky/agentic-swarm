/** Code map, calibration and forwarded concerns. */

import type { ConcernKind } from "../../core/concern-types.js";
import { hostOs } from "../../core/os/index.js";
import { concernFingerprint, recordedConcernId } from "../../core/concerns.js";
import { indexDismissals, isConcernDismissed } from "../concern-dismissal.js";
import { baseContinuations } from "../derive/shared.js";
import type { StepRecord, TaskFile } from "../types.js";
import type { ConcernScope, ForwardedConcern } from "./types.js";
import { epicByTask, visibleToAudience } from "./debt.js";

/**
 * A package with at least this many files is one unhelpful row, so the index
 * shows its subdirectories instead.
 */
const PACKAGE_SPLIT_MIN_FILES = 20;

interface CodeMapEntry {
  count: number;
  directory: boolean;
}

/**
 * Groups repository-relative paths into a shallow index. A directory keeps
 * its trailing slash and file count; a file is its bare path, so a slash
 * alone tells the two apart. The architect gets shapes and paths, never file
 * bodies; scouting reads them. Every group is kept: the pack preparer decides
 * what the index shows.
 */
export function shallowCodeMap(paths: string[]): string[] {
  const os = hostOs();
  const clean = paths
    .map((raw) => os.repoPath(raw))
    .filter((path) => {
      if (!path) return false;
      const top = os.repoPathParts(path)[0];
      return top !== "node_modules" && top !== ".git";
    });

  const packageCounts = new Map<string, number>();
  for (const path of clean) {
    const parts = os.repoPathParts(path);
    if (parts.length < 3) continue;
    const pkg = os.joinRepoPath(...parts.slice(0, 2));
    packageCounts.set(pkg, (packageCounts.get(pkg) ?? 0) + 1);
  }

  const entries = new Map<string, CodeMapEntry>();
  const count = (label: string, directory: boolean): void => {
    const entry = entries.get(label) ?? { count: 0, directory };
    entry.count += 1;
    entries.set(label, entry);
  };
  for (const path of clean) {
    const parts = os.repoPathParts(path);
    if (parts.length === 1) {
      count("(root)", true);
      continue;
    }
    const pkg = os.joinRepoPath(...parts.slice(0, 2));
    const split =
      parts.length > 2 &&
      (packageCounts.get(pkg) ?? 0) >= PACKAGE_SPLIT_MIN_FILES;
    const depth = split ? 3 : 2;
    if (parts.length <= depth) {
      count(path, false);
    } else {
      count(`${os.joinRepoPath(...parts.slice(0, depth))}/`, true);
    }
  }
  return [...entries.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, entry]) =>
      entry.directory
        ? `${label} — ${entry.count} file${entry.count === 1 ? "" : "s"}`
        : label,
    );
}

function calibrationRank(calibration: string): number {
  return calibration === "owner" ? 2 : calibration === "architect" ? 1 : 0;
}

/**
 * A forwarded `forward` string's identity. The kept fingerprint function hashes
 * the kind string; the kernel's kinds are the manifesto's four
 * (`debt|risk|uncertainty|choice`), so the stored v2 enum is only a type-level
 * stand-in here.
 */
function forwardFingerprint(text: string): string {
  return concernFingerprint({ kind: "forward" as ConcernKind, summary: text });
}

/** When each task slug last merged, by slug. */
function mergedAt(records: readonly StepRecord[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const rec of records) {
    if (rec.step !== "merge" || !rec.ok || !rec.slug) continue;
    merged.set(rec.slug, Math.max(merged.get(rec.slug) ?? -1, rec.seq));
  }
  return merged;
}

/** When each non-dismissed concern was last raised; FYI entries never travel. */
function raisedAt(
  records: readonly StepRecord[],
  dismissals: ReturnType<typeof indexDismissals>,
): Map<string, number> {
  const raised = new Map<string, number>();
  for (const rec of records) {
    for (const concern of rec.outcome?.concerns ?? []) {
      if (concern.calibration === "fyi") continue;
      if (isConcernDismissed(dismissals, rec, concern)) continue;
      raised.set(recordedConcernId(concern), rec.seq);
    }
  }
  return raised;
}

/**
 * Latest verified merge sequence for `slug` or any task continuing it
 * transitively through `base`, strictly after `afterSeq`.
 */
function followUpMergeSeq(
  slug: string,
  afterSeq: number,
  merged: ReadonlyMap<string, number>,
  continuations: ReadonlyMap<string, readonly string[]>,
): number | undefined {
  let latest: number | undefined;
  const pending = [slug];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const seq = merged.get(current);
    if (seq !== undefined && seq > afterSeq) {
      latest = latest === undefined ? seq : Math.max(latest, seq);
    }
    for (const next of continuations.get(current) ?? []) {
      pending.push(next);
    }
  }
  return latest;
}

/**
 * When each concern was last answered: a checker's own check, or the merge of
 * the follow-up task it named (or its `base:` continuation). An answer names a
 * concern once, so the first record wins; a later answer only moves the
 * position forward.
 */
function answeredAt(
  records: readonly StepRecord[],
  merged: ReadonlyMap<string, number>,
  continuations: ReadonlyMap<string, readonly string[]>,
): Map<string, number> {
  const answered = new Map<string, number>();
  for (const rec of records) {
    for (const entry of rec.outcome?.planCheck?.concerns ?? []) {
      const seq =
        entry.action === "resolve"
          ? rec.seq
          : entry.slug
            ? followUpMergeSeq(entry.slug, rec.seq, merged, continuations)
            : undefined;
      if (seq === undefined) continue;
      answered.set(entry.id, Math.max(answered.get(entry.id) ?? -1, seq));
    }
  }
  return answered;
}

/**
 * The concerns a checker answered: raised before the answer, never after it,
 * so a later raise of the same id is open again.
 */
function resolvedConcernIds(
  records: readonly StepRecord[],
  dismissals: ReturnType<typeof indexDismissals>,
  tasks: readonly TaskFile[] = [],
): Set<string> {
  const raised = raisedAt(records, dismissals);
  const answered = answeredAt(
    records,
    mergedAt(records),
    baseContinuations(tasks),
  );
  return new Set(
    [...answered.entries()]
      .filter(([id, seq]) => seq > (raised.get(id) ?? -1))
      .map(([id]) => id),
  );
}

/** The pack audience's filter: a subarchitect's concerns go upward only. */
function audienceFilter(scope: ConcernScope): (record: StepRecord) => boolean {
  const bySlug = epicByTask(scope.tasks ?? []);
  return (record) => {
    if (scope.audience === undefined) return true;
    // A subarchitect's concerns are its brief upward, never its own input.
    if (scope.audience.kind === "epic" && record.step === "subarchitect")
      return false;
    return visibleToAudience(record, bySlug, scope.audience);
  };
}

/** Folds one concern into the deduplicated set, the higher calibration winning. */
function addForwarded(
  byFingerprint: Map<string, ForwardedConcern>,
  concern: ForwardedConcern,
): void {
  const existing = byFingerprint.get(concern.id);
  if (!existing) {
    byFingerprint.set(concern.id, { ...concern, occurrences: 1 });
    return;
  }
  existing.occurrences = (existing.occurrences ?? 1) + 1;
  if (
    calibrationRank(concern.calibration) >=
    calibrationRank(existing.calibration)
  ) {
    existing.calibration = concern.calibration;
    existing.kind = concern.kind;
    existing.text = concern.text;
    existing.evidence = concern.evidence;
  }
  existing.source = concern.source;
}

/**
 * Collects forwarded concerns from the records an audience may read,
 * deduplicated by the kept concern fingerprint. The same text raised every
 * round is one line with a count; an owner calibration outranks an architect
 * one. FYI entries and debt-kind concerns do not travel here; the debt
 * register owns debt. A concern a checker answered, or whose follow-up task
 * merged after it was raised, does not travel either. Without an audience,
 * every record counts: the depth-1 pack's single architect.
 */
export function forwardedConcerns(
  records: readonly StepRecord[],
  scope: ConcernScope = {},
): ForwardedConcern[] {
  const visible = audienceFilter(scope);
  const dismissals = indexDismissals(records);
  const resolved = resolvedConcernIds(records, dismissals, scope.tasks);
  const byFingerprint = new Map<string, ForwardedConcern>();
  for (const rec of records) {
    if (!rec.outcome || !visible(rec)) continue;
    for (const concern of recordConcerns(rec, dismissals)) {
      if (!resolved.has(concern.id)) addForwarded(byFingerprint, concern);
    }
  }
  return [...byFingerprint.values()];
}

/**
 * One record's concerns and forward lines as they travel: non-FYI, non-debt
 * non-dismissed concerns keep their kind, a forwarded remark travels as its
 * own `forward` entry. The debt register, not this section, lists debt-kind
 * concerns.
 */
function recordConcerns(
  rec: StepRecord,
  dismissals: ReturnType<typeof indexDismissals>,
): ForwardedConcern[] {
  if (!rec.outcome) return [];
  const source = `${rec.slug ?? rec.architect ?? "goal"} ${rec.step} r${rec.round}`;
  const concerns = rec.outcome.concerns
    .filter(
      (concern) =>
        concern.calibration !== "fyi" &&
        concern.kind !== "debt" &&
        !isConcernDismissed(dismissals, rec, concern),
    )
    .map((concern) => ({
      id: recordedConcernId(concern),
      source,
      calibration: concern.calibration,
      kind: concern.kind,
      text: concern.text,
      evidence: concern.evidence,
    }));
  const forwards = rec.outcome.forward.map((text) => ({
    id: forwardFingerprint(text),
    source,
    calibration: "architect",
    kind: "forward",
    text,
  }));
  return [...concerns, ...forwards];
}

/**
 * Every open concern, deduplicated by identity: the forwarded set without the
 * free-text `forward` lines, which are remarks, not concerns the PM judges,
 * and without debt, which its register owns.
 */
export function openConcerns(
  records: readonly StepRecord[],
  tasks?: readonly TaskFile[],
): ForwardedConcern[] {
  return forwardedConcerns(records, tasks ? { tasks } : {}).filter(
    (concern) => concern.kind !== "forward",
  );
}

/** The ids of every open concern: a hold named by one is a live block. */
export function openConcernIds(
  records: readonly StepRecord[],
  tasks?: readonly TaskFile[],
): Set<string> {
  return new Set(openConcerns(records, tasks).map((concern) => concern.id));
}

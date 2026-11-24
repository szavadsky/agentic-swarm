/** Code map, calibration and forwarded concerns. */

import type { ConcernKind } from "../../core/concern-types.js";
import { concernFingerprint } from "../../core/concerns.js";
import type { StepRecord } from "../types.js";
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
  const clean = paths
    .map((raw) => raw.replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter((path) => {
      if (!path) return false;
      const top = path.split("/")[0];
      return top !== "node_modules" && top !== ".git";
    });

  const packageCounts = new Map<string, number>();
  for (const path of clean) {
    const parts = path.split("/");
    if (parts.length < 3) continue;
    const pkg = `${parts[0]}/${parts[1]}`;
    packageCounts.set(pkg, (packageCounts.get(pkg) ?? 0) + 1);
  }

  const entries = new Map<string, CodeMapEntry>();
  const count = (label: string, directory: boolean): void => {
    const entry = entries.get(label) ?? { count: 0, directory };
    entry.count += 1;
    entries.set(label, entry);
  };
  for (const path of clean) {
    const parts = path.split("/");
    if (parts.length === 1) {
      count("(root)", true);
      continue;
    }
    const pkg = `${parts[0]}/${parts[1]}`;
    const split =
      parts.length > 2 &&
      (packageCounts.get(pkg) ?? 0) >= PACKAGE_SPLIT_MIN_FILES;
    const depth = split ? 3 : 2;
    if (parts.length <= depth) {
      count(path, false);
    } else {
      count(`${parts.slice(0, depth).join("/")}/`, true);
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
 * The kept fingerprint function hashes the kind string; the kernel's kinds are
 * the manifesto's four (`debt|risk|uncertainty|choice`), so the stored v2 enum
 * is only a type-level stand-in here. Same text and evidence, same identity.
 */
function fingerprintOf(kind: string, text: string, evidence?: string): string {
  return concernFingerprint({
    kind: kind as ConcernKind,
    summary: text,
    ...(evidence ? { location: { file: evidence } } : {}),
  });
}

/**
 * Collects forwarded concerns from the records an audience may read,
 * deduplicated by the kept concern fingerprint. The same text raised every
 * round is one line with a count; an owner calibration outranks an architect
 * one. FYI entries do not travel here; the debt register lists them. Without
 * an audience, every record counts: the depth-1 pack's single architect.
 */
export function forwardedConcerns(
  records: StepRecord[],
  scope: ConcernScope = {},
): ForwardedConcern[] {
  const bySlug = epicByTask(scope.tasks ?? []);
  const visible = (record: StepRecord): boolean => {
    if (scope.audience === undefined) return true;
    // A subarchitect's concerns are its brief upward, never its own input.
    if (scope.audience.kind === "epic" && record.step === "subarchitect")
      return false;
    return visibleToAudience(record, bySlug, scope.audience);
  };
  const byFingerprint = new Map<string, ForwardedConcern>();
  const add = (concern: ForwardedConcern, fingerprint: string): void => {
    const existing = byFingerprint.get(fingerprint);
    if (!existing) {
      byFingerprint.set(fingerprint, { ...concern, occurrences: 1 });
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
  };

  for (const rec of records) {
    if (!rec.outcome || !visible(rec)) continue;
    for (const concern of rec.outcome.concerns) {
      if (concern.calibration === "fyi") continue;
      const source = `${rec.slug ?? rec.architect ?? "goal"} ${rec.step} r${rec.round}`;
      const fingerprint = fingerprintOf(
        concern.kind,
        concern.text,
        concern.evidence,
      );
      add(
        {
          source,
          calibration: concern.calibration,
          kind: concern.kind,
          text: concern.text,
          evidence: concern.evidence,
        },
        fingerprint,
      );
    }
    for (const forwarded of rec.outcome.forward) {
      const source = `${rec.slug ?? rec.architect ?? "goal"} ${rec.step} r${rec.round}`;
      const fingerprint = fingerprintOf("forward", forwarded);
      add(
        { source, calibration: "architect", kind: "forward", text: forwarded },
        fingerprint,
      );
    }
  }
  return [...byFingerprint.values()];
}

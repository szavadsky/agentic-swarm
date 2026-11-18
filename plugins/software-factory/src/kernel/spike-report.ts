import type { CheckResult } from "../core/checks/types.js";
import { fingerprintText } from "../core/fingerprint.js";
import { GitError, git } from "../core/git/exec.js";
import type { ArtifactStore, StepRecord } from "./types.js";
import path from "node:path";
import fs from "node:fs";

/** Check name a spike's task gates carry for its report. */
export const SPIKE_REPORT_CHECK = "spike-report";

/** Where a spike commits its finding: the one destination the check reads. */
export function spikeReportPath(slug: string): string {
  return `.factory/spikes/${slug}.md`;
}

/**
 * Returns the sealed spike report for a slug, or null if it does not exist.
 */
export async function spikeReport(
  store: ArtifactStore,
  slug: string,
): Promise<string | null> {
  const reportPath = path.join(store.goalDir, `finish/${slug}/report.md`);
  try {
    return await fs.promises.readFile(reportPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * A spike's finding: its sealed report, else the implement outcome's summary
 * for a legacy spike that sealed none; undefined when neither exists.
 */
export async function spikeFinding(
  store: ArtifactStore,
  records: StepRecord[],
  slug: string,
): Promise<string | undefined> {
  const report = await spikeReport(store, slug);
  if (report !== null) return report.trim();
  const own = records
    .filter((record) => record.slug === slug && record.outcome)
    .sort((a, b) => b.seq - a.seq);
  const outcome =
    own.find((record) => record.step === "implement")?.outcome ??
    own[0]?.outcome;
  return outcome?.summary || undefined;
}

/** What `git show <commit>:<path>` prints when the path is not in the commit's tree. */
const ABSENT_FROM_TREE = /does not exist in|exists on disk, but not in/;

/**
 * The spike's report as a synthetic gate: red unless `commit` carries a
 * non-blank file at the report path. It reads the commit's tree, never the
 * working directory, so an uncommitted report cannot pass. Any git failure
 * other than an absent path throws; it is not a verdict on the spike.
 */
export async function checkSpikeReport(
  worktree: string,
  slug: string,
  commit: string,
): Promise<CheckResult> {
  const reportPath = spikeReportPath(slug);
  const shown = await git(worktree, ["show", `${commit}:${reportPath}`], {
    allowFail: true,
  });
  if (shown.code !== 0 && !ABSENT_FROM_TREE.test(shown.stderr)) {
    throw new GitError(
      `show ${commit}:${reportPath}`,
      shown.code,
      shown.stderr,
      shown.stdout,
    );
  }
  const problem =
    shown.code !== 0
      ? "no report committed"
      : shown.stdout.trim() === ""
        ? "report is blank"
        : undefined;
  const summary = problem ? `${problem} at ${reportPath}` : "pass";
  return {
    name: SPIKE_REPORT_CHECK,
    ok: problem === undefined,
    summary,
    output: problem
      ? `${summary}: write the finding to ${reportPath} and commit it.`
      : "",
    fingerprint: fingerprintText(`${SPIKE_REPORT_CHECK}:${summary}`, {
      lowercase: false,
    }),
  };
}

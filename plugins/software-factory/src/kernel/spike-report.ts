import type { CheckResult } from "../core/checks/types.js";
import { fingerprintText } from "../core/fingerprint.js";
import { GitError, git } from "../core/git/exec.js";

/** Check name a spike's task gates carry for its report. */
export const SPIKE_REPORT_CHECK = "spike-report";

/** Where a spike commits its finding: the one destination the check reads. */
export function spikeReportPath(slug: string): string {
  return `.factory/spikes/${slug}.md`;
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

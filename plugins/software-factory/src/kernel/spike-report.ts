import type { CheckResult } from "../core/checks/types.js";
import { fingerprintText } from "../core/fingerprint.js";
import { GitError, git } from "../core/git/exec.js";
import { readGoalFile } from "./store.js";
import { builtinPrompts } from "./prompts.js";
import type { PromptLibrary } from "./prompts.js";
import type { ArtifactStore, StepRecord } from "./types.js";

/** Check name a spike's task gates carry for its report. */
export const SPIKE_REPORT_CHECK = "spike-report";

/** Where a spike commits its finding: the one destination the finding has. */
export function spikeReportPath(slug: string): string {
  return `.factory/spikes/${slug}.md`;
}

/** What `git show <commit>:<path>` prints when the path is not in the commit's tree. */
const ABSENT_FROM_TREE = /does not exist in|exists on disk, but not in/;

/** The finish record's reference to the one copy: `<commit>:<report path>`. */
export function spikeReportRef(commit: string, slug: string): string {
  return `${commit}:${spikeReportPath(slug)}`;
}

/**
 * The report text a commit carries at the spike path, or null when that tree
 * does not carry it. Any other git failure throws; it is not a verdict on the
 * spike.
 */
export async function committedSpikeReport(
  repoDir: string,
  ref: string,
): Promise<string | null> {
  const shown = await git(repoDir, ["show", ref], {
    allowFail: true,
    stripNewline: false,
  });
  if (shown.code !== 0) {
    if (ABSENT_FROM_TREE.test(shown.stderr)) return null;
    throw new GitError(`show ${ref}`, shown.code, shown.stderr, shown.stdout);
  }
  return shown.stdout;
}

/**
 * A spike's finding: the report its finish record references, read from that
 * commit; else a legacy `finish/` copy; else the implement outcome's summary
 * for a legacy spike that sealed none; undefined when neither exists.
 */
export async function spikeFinding(
  store: ArtifactStore,
  records: StepRecord[],
  slug: string,
): Promise<string | undefined> {
  const report = await spikeReport(store, records, slug);
  if (report !== null) return report.trim();
  const own = records
    .filter((record) => record.slug === slug && record.outcome)
    .sort((a, b) => b.seq - a.seq);
  const outcome =
    own.find((record) => record.step === "implement")?.outcome ??
    own[0]?.outcome;
  return outcome?.summary || undefined;
}

/** The finished report a spike's records name, or null when none is readable. */
async function spikeReport(
  store: ArtifactStore,
  records: StepRecord[],
  slug: string,
): Promise<string | null> {
  const ref = records
    .filter(
      (record) =>
        record.slug === slug && record.step === "finish" && record.report,
    )
    .sort((a, b) => b.seq - a.seq)[0]?.report;
  if (ref !== undefined) {
    const report = await committedSpikeReport(store.goalDir, ref);
    if (report !== null) return report;
  }
  return legacySpikeReport(store, slug);
}

/**
 * A pre-canonical spike's sealed copy under `finish/`; null when it has none.
 * New finishes never write one, so this reads history, not a fallback target.
 */
async function legacySpikeReport(
  store: ArtifactStore,
  slug: string,
): Promise<string | null> {
  return readGoalFile(store.goalDir, `finish/${slug}/report.md`);
}

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
  prompts: PromptLibrary = builtinPrompts(),
): Promise<CheckResult> {
  const reportPath = spikeReportPath(slug);
  const report = await committedSpikeReport(
    worktree,
    spikeReportRef(commit, slug),
  );
  const problem =
    report === null
      ? "no report committed"
      : report.trim() === ""
        ? "report is blank"
        : undefined;
  const summary = problem ? `${problem} at ${reportPath}` : "pass";
  return {
    name: SPIKE_REPORT_CHECK,
    ok: problem === undefined,
    summary,
    output: problem
      ? prompts
          .render("spike-report-gate", { summary, report_path: reportPath })
          .trimEnd()
      : "",
    fingerprint: fingerprintText(`${SPIKE_REPORT_CHECK}:${summary}`, {
      lowercase: false,
    }),
  };
}

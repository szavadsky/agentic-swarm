import fs from "node:fs";
import path from "node:path";
import { git } from "../git/exec.js";
import { numstat } from "../git/diff.js";
import { readYaml } from "../records/io.js";
import type { ChecksResultArtifact, CheckItemResult } from "../artifacts.js";
import { tailCap } from "../checks/types.js";

export interface ConsultFailureContext {
  /** Committed branch diffstat (parentBranch..HEAD numstat), one line per file. */
  diffstat: string;
  /** Failing check summaries from the record's checks.yaml. */
  failingCheckSummaries: string[];
  /** Hydrated feedback block: last failing check id + message + detail + output tail. */
  feedbackText: string;
}

const MAX_DIFFSTAT_LINES = 100;
const MAX_OUTPUT_TAIL_BYTES = 2000;

/**
 * Builds grounded failure context for architect consults (PsPost5 items 2/3,
 * ShPost3 consult-blindness): the committed branch diffstat on the same base
 * as checks (never bare unstaged `git diff`, which is empty post-commit),
 * failing check summaries from checks.yaml, and a hydrated feedback block.
 *
 * `checks` entries carry `details` (object or string) and `output` tail when
 * persisted by the widened checks.yaml writer.
 */
export async function buildConsultFailureContext(opts: {
  wt: string;
  base: string;
  recordDir: string;
  fallbackError?: string;
}): Promise<ConsultFailureContext> {
  const { wt, base, recordDir } = opts;

  // 1. Committed diffstat on the same base the checks ran against.
  let diffstat = "";
  try {
    const stats = await numstat(wt, `${base}..HEAD`);
    const lines = stats.map((s) => `${s.path} +${s.added}/-${s.deleted}`);
    const shown = lines.slice(0, MAX_DIFFSTAT_LINES);
    if (lines.length > MAX_DIFFSTAT_LINES) {
      shown.push(`... and ${lines.length - MAX_DIFFSTAT_LINES} more files`);
    }
    diffstat = shown.join("\n");
    if (!diffstat) {
      // Fall back to worktree-vs-HEAD (uncommitted) so a zero-diff consult
      // still shows pending work rather than an empty section.
      const pending = await git(wt, ["diff", "--stat", "HEAD"], { allowFail: true });
      diffstat = pending.stdout.trim();
    }
  } catch {
    diffstat = "";
  }

  // 2. Failing check summaries from checks.yaml.
  const failingCheckSummaries: string[] = [];
  let failingEntries: CheckItemResult[] = [];
  const checksPath = path.join(recordDir, "checks.yaml");
  if (fs.existsSync(checksPath)) {
    try {
      const artifact = await readYaml<ChecksResultArtifact>(checksPath);
      const list = Array.isArray(artifact?.checks) ? artifact.checks : [];
      failingEntries = list.filter((c) => c && c.status === "fail");
      for (const c of failingEntries) {
        failingCheckSummaries.push(`[${c.id}] ${c.message ?? "(no message)"}`);
      }
    } catch {
      // Corrupt checks.yaml: fall through to generic feedback.
    }
  }

  // 3. Hydrated feedback: last failing check id + message + detail + output tail.
  let feedbackText = "";
  const last = failingEntries[failingEntries.length - 1];
  if (last) {
    const parts = [`Failing check: ${last.id}`, `Message: ${last.message ?? "(no message)"}`];
    if (last.details !== undefined && last.details !== "") {
      const detailText =
        typeof last.details === "string" ? last.details : JSON.stringify(last.details, null, 2);
      if (detailText) parts.push(`Detail:\n${tailCap(detailText, MAX_OUTPUT_TAIL_BYTES)}`);
    }
    if (last.output) {
      parts.push(`Output tail:\n${tailCap(last.output, MAX_OUTPUT_TAIL_BYTES)}`);
    }
    feedbackText = parts.join("\n\n");
  } else if (opts.fallbackError) {
    feedbackText = opts.fallbackError;
  } else {
    feedbackText = "Step failed repeatedly";
  }

  return { diffstat, failingCheckSummaries, feedbackText };
}

/** The preflight entry point. */

import { checkBase, resolveBaseCommit } from "../baseline.js";
import { configFilePaths } from "../config.js";
import { resolveGoalFollowTarget } from "../goal-base.js";
import { checkScouts } from "../preflight-aliases.js";
import { PreflightError } from "./checks.js";
import {
  aliasContext,
  baseBranchFindings,
  resolveAliases,
  uniqueFindings,
} from "./config.js";
import { launchBinaries, nonModelFindings } from "./non-model.js";
import type { PreflightInput, PreflightResult } from "./types.js";

/**
 * Validates configs, aliases, models, effort levels, fallbacks, binaries, the
 * roots and the base branch — collecting every violation into one report. A red
 * base is recorded and warned once; it never aborts.
 */
export async function preflight(
  input: PreflightInput,
): Promise<PreflightResult> {
  const { configs, paths, store } = input;
  const files = configs.files ?? configFilePaths(paths.repoRoot);

  const binaries = input.binaries;
  const registered: ReadonlySet<string> = new Set(input.harnesses.keys());
  const nonModel = await nonModelFindings({
    configs,
    files,
    // A launch builds only the harnesses it registers, so an unregistered bare
    // alias is the registration finding; it has no executable to check.
    binaries: binaries
      ? launchBinaries(configs.run.aliases, registered, binaries)
      : undefined,
    roots: paths,
    store,
    harnesses: registered,
  });
  const findings = [...nonModel.findings];

  const ctx = aliasContext(input, files, findings, nonModel.unavailable);
  await resolveAliases(ctx, configs.run.aliases);
  await checkScouts(ctx, configs);

  const base = await baseBranchFindings(paths, configs, files);
  findings.push(...base.findings);

  const all = uniqueFindings(findings);
  if (all.length > 0) throw new PreflightError(all);

  const result: PreflightResult = {};
  if (base.baseCommit && input.baseGates !== false) {
    const target = await resolveGoalFollowTarget(
      paths.repoRoot,
      paths.integrationBranch,
      configs.repo.baseBranch,
    );
    if (target) {
      result.base = await checkBase(
        configs,
        store,
        paths.repoRoot,
        target.branch,
        target.commit,
      );
    } else {
      const integrationCommit = await resolveBaseCommit(
        paths.repoRoot,
        paths.integrationBranch,
      );
      if (integrationCommit) {
        result.base = await checkBase(
          configs,
          store,
          paths.repoRoot,
          paths.integrationBranch,
          integrationCommit,
        );
      }
    }
  }
  return result;
}

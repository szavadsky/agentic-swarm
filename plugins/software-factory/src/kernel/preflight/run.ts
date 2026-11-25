/** The preflight entry point. */

import { checkBase } from "../baseline.js";
import { loadCanaryProven, provenRotation } from "../canary.js";
import { configFilePaths } from "../config.js";
import { checkScouts } from "../preflight-aliases.js";
import type { PreflightInput, PreflightResult } from "./types.js";
import {
  aliasContext,
  baseBranchFindings,
  resolveAliases,
  uniqueFindings,
  usedHarnesses,
} from "./config.js";
import { PreflightError } from "./checks.js";
import { nonModelFindings } from "./non-model.js";

/**
 * Validates configs, aliases, models, effort levels, fallbacks, binaries, the
 * roots and the base branch — collecting every violation into one report. A red
 * base is recorded and warned once; it never aborts.
 */
/** Narrow every alias's rotation to the combinations with a passing canary
 * record. A combination with no record has never been proven, so rotation
 * never picks it; when none are proven the alias keeps its own primary.
 */
export function filterUnprovenRotation(
  aliases: Record<
    string,
    {
      harness: string;
      model: string;
      rotate?: { harness: string; model: string }[];
    }
  >,
  proven: ReadonlySet<string>,
): void {
  for (const alias of Object.values(aliases)) {
    alias.rotate = provenRotation(alias.rotate, proven)?.map((entry) => ({
      ...entry,
    }));
  }
}

export async function preflight(
  input: PreflightInput,
): Promise<PreflightResult> {
  const { configs, paths, store } = input;
  const files = configs.files ?? configFilePaths(paths.repoRoot);
  const proven = await loadCanaryProven(input.paths);
  filterUnprovenRotation(configs.run.aliases, proven);

  const used = usedHarnesses(configs.run.aliases);
  const binaries = input.binaries;
  const nonModel = await nonModelFindings({
    configs,
    files,
    // A launch builds only the harnesses it registers, so an unregistered bare
    // alias is the registration finding; it has no executable to check.
    binaries: binaries
      ? Object.fromEntries(
          [...used]
            .filter((harness) => input.harnesses.has(harness))
            .map((harness) => [harness, binaries[harness]]),
        )
      : undefined,
    roots: paths,
    store,
    harnesses: new Set(input.harnesses.keys()),
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
    result.base = await checkBase(
      configs,
      store,
      paths.repoRoot,
      configs.repo.baseBranch,
      base.baseCommit,
    );
  }
  return result;
}

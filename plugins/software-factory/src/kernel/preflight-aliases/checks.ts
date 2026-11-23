/** The public alias, portability and scout checks. */

import { OMP_ID } from "../../harness/omp/types.js";
import type { AliasConfig, ConfigBundle } from "../types.js";
import type { AliasContext } from "./types.js";
import {
  add,
  checkAliasIdentity,
  checkEffort,
  checkPrimaryModel,
  checkRotation,
  checkedModel,
} from "./models.js";
import { checkFallbacks } from "./tiers.js";

export async function checkAlias(
  ctx: AliasContext,
  name: string,
  alias: AliasConfig,
): Promise<void> {
  const key = `aliases.${name}`;
  if (!checkAliasIdentity(ctx, key, alias)) return;
  await checkPrimaryModel(ctx, key, alias);
  await checkRotation(ctx, key, alias);
  await checkFallbacks(ctx, key, alias);
}

/**
 * `scouts` is a subagent model pin only the omp adapter reads, so it is valid
 * only while some alias or fallback tier runs on omp.
 */
function runsOnOmp(aliases: Record<string, AliasConfig>): boolean {
  for (const alias of Object.values(aliases)) {
    const primaries =
      alias.rotate && alias.rotate.length > 0
        ? alias.rotate.map((entry) => entry.harness)
        : [alias.harness];
    if (primaries.includes(OMP_ID)) return true;
    for (const fallback of alias.fallbacks ?? []) {
      if ("model" in fallback && fallback.harness === OMP_ID) return true;
    }
  }
  return false;
}

/**
 * A portability edge names the harness a session may cross from and to. An
 * endpoint no harness registers is a typo that would otherwise parse clean and
 * mean "no edge", so the crossing it was declared to allow would restart de
 * novo with no finding.
 */
export function checkPortability(
  ctx: AliasContext,
  configs: ConfigBundle,
): void {
  const registered = [...ctx.harnesses.keys()].join(", ") || "none";
  for (const [index, edge] of (configs.run.portability ?? []).entries()) {
    for (const side of ["from", "to"] as const) {
      const harness = edge[side];
      if (ctx.harnesses.has(harness)) continue;
      add(
        ctx,
        `portability.${index}.${side}`,
        `harness "${harness}" is not registered (registered: ${registered})`,
      );
    }
  }
}

export async function checkScouts(
  ctx: AliasContext,
  configs: ConfigBundle,
): Promise<void> {
  const scouts = configs.run.scouts;
  if (!scouts) return;
  if (!runsOnOmp(configs.run.aliases)) {
    add(
      ctx,
      "scouts",
      `scouts configures a subagent model, but no harness consumes it: no alias or fallback runs on harness "${OMP_ID}"`,
    );
    return;
  }
  if (!ctx.harnesses.has(OMP_ID) || ctx.unavailable.has(OMP_ID)) return;
  const checked = await checkedModel(
    ctx,
    "scouts",
    OMP_ID,
    scouts.model,
    "model",
  );
  if (!checked) return;
  checkEffort(
    ctx,
    "scouts",
    OMP_ID,
    scouts.model,
    scouts.effort ?? checked.modelEffort,
    checked.effort,
  );
}

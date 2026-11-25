/** The public alias and scout checks. */

import { OMP_ID } from "../../harness/omp/types.js";
import type { AliasConfig, ConfigBundle } from "../types.js";
import { runsOnOmp } from "../preflight/checks.js";
import type { AliasContext } from "./types.js";
import { checkEffort, checkPrimaryModel, checkedModel } from "./models.js";
import { checkFallbacks } from "./tiers.js";

export async function checkAlias(
  ctx: AliasContext,
  name: string,
  alias: AliasConfig,
): Promise<void> {
  const key = `aliases.${name}`;
  if (!ctx.harnesses.has(alias.harness)) return;
  await checkPrimaryModel(ctx, key, alias);
  await checkFallbacks(ctx, key, alias);
}

export async function checkScouts(
  ctx: AliasContext,
  configs: ConfigBundle,
): Promise<void> {
  const scouts = configs.run.scouts;
  if (!scouts) return;
  if (!runsOnOmp(configs.run.aliases)) return;
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

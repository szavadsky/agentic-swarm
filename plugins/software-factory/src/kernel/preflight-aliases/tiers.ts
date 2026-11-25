/** Fallback tier checks. */

import type { AliasConfig, FallbackModelConfig } from "../types.js";
import type { AliasContext } from "./types.js";
import { checkEffort, checkedModel } from "./models.js";

/** A fallback without a harness runs on the rotated primary. */
function fallbackHarnesses(
  fallback: FallbackModelConfig,
  rotation: readonly { harness: string }[],
  alias: AliasConfig,
): string[] {
  if (fallback.harness !== undefined) return [fallback.harness];
  if (rotation.length > 0) {
    return [...new Set(rotation.map((entry) => entry.harness))];
  }
  return [alias.harness];
}

/** Checks one fallback model's own effort; it never inherits the alias's. */
async function checkTierModel(
  ctx: AliasContext,
  tierKey: string,
  fallback: FallbackModelConfig,
  tierHarness: string,
): Promise<void> {
  if (ctx.unavailable.has(tierHarness)) return;
  const tier = await checkedModel(
    ctx,
    tierKey,
    tierHarness,
    fallback.model,
    "fallback",
  );
  if (!tier) return;
  checkEffort(
    ctx,
    tierKey,
    tierHarness,
    fallback.model,
    fallback.effort ?? tier.modelEffort,
    tier.effort,
  );
}

/**
 * Checks one fallback tier's harness and models. A tier on an unregistered
 * harness can run nothing, so its models are not probed.
 */
async function checkFallbackTier(
  ctx: AliasContext,
  tierKey: string,
  fallback: FallbackModelConfig,
  alias: AliasConfig,
  rotation: readonly { harness: string; model: string }[],
): Promise<void> {
  if (fallback.harness !== undefined && !ctx.harnesses.has(fallback.harness)) {
    return;
  }
  const tierHarnesses = fallbackHarnesses(fallback, rotation, alias);
  for (const tierHarness of tierHarnesses) {
    await checkTierModel(ctx, tierKey, fallback, tierHarness);
  }
}

export async function checkFallbacks(
  ctx: AliasContext,
  key: string,
  alias: AliasConfig,
): Promise<void> {
  const rotation = alias.rotate ?? [];
  for (const [index, fallback] of (alias.fallbacks ?? []).entries()) {
    // A named alias is checked under its own key, its whole ladder included.
    if ("alias" in fallback) continue;
    await checkFallbackTier(
      ctx,
      `${key}.fallbacks.${index}`,
      fallback,
      alias,
      rotation,
    );
  }
}

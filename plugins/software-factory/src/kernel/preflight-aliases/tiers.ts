/** Fallback tier checks. */

import type { AliasConfig, FallbackModelConfig } from "../types.js";
import type { AliasContext } from "./types.js";
import { add, checkedModel, registryMessage, resolveEffort } from "./models.js";

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

/** Checks one fallback model on one harness, stamping effort for single tiers. */
async function checkTierModel(
  ctx: AliasContext,
  tierKey: string,
  fallback: FallbackModelConfig,
  alias: AliasConfig,
  tierHarness: string,
  singleTier: boolean,
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
  // Each tier carries its own effort: explicit, else the alias's, else a
  // suffix declared on that model, resolved against the tier's live values. A
  // rotating fallback without a fixed effort inherits the rotated entry's
  // effort at resolution, so nothing is stamped here.
  if (fallback.effort === undefined) {
    if (singleTier) {
      fallback.effort = await resolveEffort(
        ctx,
        tierKey,
        tierHarness,
        { id: fallback.model },
        alias.effort ?? tier.modelEffort,
        tier.effort,
      );
    }
    return;
  }
  const resolved = await resolveEffort(
    ctx,
    tierKey,
    tierHarness,
    { id: fallback.model },
    fallback.effort,
    tier.effort,
  );
  if (singleTier) fallback.effort = resolved;
}

/** Checks one fallback tier, its harness and its quota pool. */
async function checkFallbackTier(
  ctx: AliasContext,
  tierKey: string,
  fallback: FallbackModelConfig,
  alias: AliasConfig,
  rotation: readonly { harness: string }[],
): Promise<void> {
  if (fallback.harness !== undefined && !ctx.harnesses.has(fallback.harness)) {
    add(ctx, `${tierKey}.harness`, registryMessage(ctx, fallback.harness));
    return;
  }
  const tierSubscription = fallback.subscription ?? alias.subscription;
  if (
    tierSubscription !== undefined &&
    !ctx.subscriptions.has(tierSubscription)
  ) {
    add(
      ctx,
      `${tierKey}.subscription`,
      `subscription "${tierSubscription}" names no limits.concurrency.perSubscription pool`,
    );
  }
  const tierHarnesses = fallbackHarnesses(fallback, rotation, alias);
  const singleTier = tierHarnesses.length === 1;
  for (const tierHarness of tierHarnesses) {
    await checkTierModel(
      ctx,
      tierKey,
      fallback,
      alias,
      tierHarness,
      singleTier,
    );
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

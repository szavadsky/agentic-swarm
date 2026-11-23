/** Fallback tier checks. */

import {
  fallbackChangesPrimary,
  fallbackTierSubscription,
} from "../flow-context-targets.js";
import type { AliasConfig, FallbackModelConfig } from "../types.js";
import type { AliasContext } from "./types.js";
import { add, checkEffort, checkedModel, registryMessage } from "./models.js";

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
 * Checks one fallback tier, its harness and its quota pool. A tier that
 * changes the primary's harness or model cannot inherit the alias's
 * subscription; it must name its own or declare `sharesPool`.
 */
async function checkFallbackTier(
  ctx: AliasContext,
  tierKey: string,
  fallback: FallbackModelConfig,
  alias: AliasConfig,
  rotation: readonly { harness: string; model: string }[],
): Promise<void> {
  if (fallback.harness !== undefined && !ctx.harnesses.has(fallback.harness)) {
    add(ctx, `${tierKey}.harness`, registryMessage(ctx, fallback.harness));
    return;
  }
  const changesPrimary = [alias, ...rotation].some((primary) =>
    fallbackChangesPrimary(fallback, primary),
  );
  const sharesPool = fallback.sharesPool === true;
  if (sharesPool && alias.subscription === undefined) {
    add(
      ctx,
      `${tierKey}.sharesPool`,
      "sharesPool: true needs the alias to name a subscription",
    );
  }
  if (
    changesPrimary &&
    alias.subscription !== undefined &&
    fallback.subscription === undefined &&
    !sharesPool
  ) {
    add(
      ctx,
      `${tierKey}.subscription`,
      `fallback changes harness or model from the alias primary, so it cannot inherit subscription "${alias.subscription}"; name its own subscription or set sharesPool: true`,
    );
  }
  const tierSubscription = fallbackTierSubscription(
    fallback,
    alias.subscription,
    changesPrimary,
  );
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

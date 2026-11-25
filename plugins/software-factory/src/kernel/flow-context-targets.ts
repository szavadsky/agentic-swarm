/**
 * Turn targeting: the alias chain (fallbacks, quota pools) and the
 * kernel/architecture boundary targets resolved from process config.
 */
import type { Harness, ModelRef } from "../harness/types.js";
import type { ResolvedTier, TurnTarget } from "./flow-types.js";
import { poolExhausted } from "./quota-pools.js";
import type {
  BoundaryStep,
  FallbackModelConfig,
  KernelRuntime,
  RepairSpec,
  TurnSpec,
} from "./types.js";

/** Pool key for quota tracking: explicit subscription, or harness+model when none. */
export function tierPoolKey(tier: {
  harness: Harness | string;
  model: ModelRef | string;
  subscription?: string;
}): string {
  if (tier.subscription) return tier.subscription;
  const harnessId =
    typeof tier.harness === "string" ? tier.harness : tier.harness.id;
  const modelId = typeof tier.model === "string" ? tier.model : tier.model.id;
  return `${harnessId}+${modelId}`;
}

/**
 * Whether a literal fallback runs on a harness or model other than the given
 * primary. An unnamed harness is the primary's, so only the model can differ.
 */
export function fallbackChangesPrimary(
  fallback: Pick<FallbackModelConfig, "harness" | "model">,
  primary: { harness: string; model: string },
): boolean {
  return (
    fallback.model !== primary.model ||
    (fallback.harness !== undefined && fallback.harness !== primary.harness)
  );
}

/**
 * The pool a literal fallback draws on: its own subscription, the alias's when
 * it keeps the primary's harness and model or declares `sharesPool`, and none
 * (so the key is harness+model) when it changes either without declaring.
 */
export function fallbackTierSubscription(
  fallback: FallbackModelConfig,
  aliasSubscription: string | undefined,
  changesPrimary: boolean,
): string | undefined {
  if (fallback.subscription !== undefined) return fallback.subscription;
  if (changesPrimary && fallback.sharesPool !== true) return undefined;
  return aliasSubscription;
}

/**
 * Names an alias whose every tier is exhausted, with each dead pool and the
 * stored time it may serve again. Dispatch defers the work under this cause
 * instead of calling a tier already known dead.
 */
export function noLiveTierCause(
  runtime: KernelRuntime,
  aliasName: string,
  chain: readonly ResolvedTier[],
): string {
  const pools = [...new Set(chain.map((tier) => tierPoolKey(tier)))].map(
    (pool) => {
      const stored = runtime.exhaustedPools.get(pool);
      if (stored === undefined) return pool;
      return stored.probing === true
        ? `${pool} probe in flight`
        : `${pool} resets at ${new Date(stored.resetAt).toISOString()}`;
    },
  );
  return `alias "${aliasName}" has no live tier: its quota pools are exhausted (${pools.join("; ")})`;
}

/**
 * A turn target on a named alias. `resolveTurn` takes the prompt from the
 * configured step; callers that already hold it use this directly.
 */
function targetForAlias(
  runtime: KernelRuntime,
  prompt: string,
  aliasName: string,
): TurnTarget {
  const alias = runtime.configs.run.aliases[aliasName];
  if (!alias)
    throw new Error(
      `run config has no alias "${aliasName}" (needed by prompt "${prompt}")`,
    );
  const chain = resolveChain(runtime, aliasName);
  const available = chain.filter(
    (tier) => !poolExhausted(runtime.exhaustedPools, tierPoolKey(tier)),
  );
  const exhausted = available.length === 0;
  const first = available[0] ?? chain[chain.length - 1]!;
  const offset = exhausted ? chain.length : chain.indexOf(first);
  return {
    prompt,
    alias: aliasName,
    harness: first.harness,
    model: first.model,
    effort: first.effort,
    subscription: first.subscription,
    tiers: available,
    tierOffset: offset,
    timeouts: alias.timeouts,
    opaque: first.opaque,
    ...(exhausted
      ? { unavailable: noLiveTierCause(runtime, aliasName, chain) }
      : {}),
  };
}

/** Tiers accumulated for one chain, deduplicated across nested alias ladders. */
interface ChainTiers {
  seen: Set<string>;
  tiers: ResolvedTier[];
}

/** Adds one tier unless an earlier tier already names the same harness, model and effort. */
function pushTier(
  runtime: KernelRuntime,
  out: ChainTiers,
  owner: string,
  harnessId: string,
  modelId: string,
  effort: string | undefined,
  subscription: string | undefined,
): void {
  const key = `${harnessId}\u0000${modelId}\u0000${effort ?? ""}`;
  if (out.seen.has(key)) return;
  out.seen.add(key);
  const harness = runtime.harnesses.get(harnessId);
  if (!harness)
    throw new Error(
      `no harness "${harnessId}" registered for alias "${owner}"`,
    );
  out.tiers.push({
    harness,
    model: { id: modelId, ...(effort ? { effort } : {}) },
    ...(effort ? { effort } : {}),
    ...(subscription ? { subscription } : {}),
    opaque: runtime.configs.run.harnesses?.[harnessId]?.acpx,
  });
}

/**
 * Appends one alias's ladder to `out`: its primary, then each fallback in
 * order. A literal fallback carries its own effort and, when it keeps the
 * primary's harness and model or declares `sharesPool`, its subscription to
 * this alias's; one that changes either without declaring draws on no
 * subscription and is keyed `harness+model`. A fallback that names another
 * alias contributes that alias's whole ladder, so each of its tiers keeps the
 * named alias's own defaults and quota pools. An alias already on `path` is a
 * cycle, refused at pre-flight and never walked twice here.
 */
function collectTiers(
  runtime: KernelRuntime,
  aliasName: string,
  path: readonly string[],
  out: ChainTiers,
): void {
  const alias = runtime.configs.run.aliases[aliasName]!;
  pushTier(
    runtime,
    out,
    aliasName,
    alias.harness,
    alias.model,
    alias.effort,
    alias.subscription,
  );
  for (const fallback of alias.fallbacks ?? []) {
    if ("alias" in fallback) {
      const target = fallback.alias;
      if (!runtime.configs.run.aliases[target])
        throw new Error(
          `fallback alias "${target}" names no run-config alias (needed by alias "${aliasName}")`,
        );
      if (path.includes(target))
        throw new Error(
          `fallback alias chain forms a cycle: ${[...path, target].join(" -> ")}`,
        );
      collectTiers(runtime, target, [...path, target], out);
      continue;
    }
    const tierHarness = fallback.harness ?? alias.harness;
    const changesPrimary = fallbackChangesPrimary(fallback, {
      harness: alias.harness,
      model: alias.model,
    });
    pushTier(
      runtime,
      out,
      aliasName,
      tierHarness,
      fallback.model,
      fallback.effort,
      fallbackTierSubscription(fallback, alias.subscription, changesPrimary),
    );
  }
}

/**
 * The alias's full fallback chain, primary first, deduplicated by harness,
 * model and effort. A fallback names a model on another harness, or another
 * alias whose ladder is reused as-is.
 */
function resolveChain(
  runtime: KernelRuntime,
  aliasName: string,
): ResolvedTier[] {
  const out: ChainTiers = { seen: new Set(), tiers: [] };
  collectTiers(runtime, aliasName, [aliasName], out);
  return out.tiers;
}

/**
 * Resolves a configured prompt and alias. `aliasOverride` is a task tier or a
 * PM rung (`default` means no override); flows branch on the resolved alias,
 * never on a harness id.
 */
export function resolveTurn(
  runtime: KernelRuntime,
  prompt: string,
  aliasName: string,
  aliasOverride?: string,
): TurnTarget {
  const override =
    aliasOverride && aliasOverride !== "default" ? aliasOverride : undefined;
  return targetForAlias(runtime, prompt, override ?? aliasName);
}

/** A step's repair ask; absent fields stay absent so the kernel default applies. */
export function repairFields(
  spec: RepairSpec,
): Pick<TurnTarget, "repairPrompt" | "unfinishedPrompt" | "deliverable"> {
  return {
    repairPrompt: spec.repairPrompt,
    unfinishedPrompt: spec.unfinishedPrompt,
    deliverable: spec.deliverable,
  };
}

/** Resolves one kernel boundary step from process config. */
export function boundaryTarget(
  runtime: KernelRuntime,
  step: BoundaryStep,
  aliasOverride?: string,
): TurnTarget {
  const spec: TurnSpec | undefined = runtime.configs.process.boundary[step];
  if (!spec) throw new Error(`process config has no boundary step "${step}"`);
  return {
    ...resolveTurn(runtime, spec.prompt, spec.alias, aliasOverride),
    ...repairFields(spec),
  };
}

/**
 * The epic architect's consult: the configured subarchitect prompt on the
 * architect boundary step's alias, so depth 2 needs no second run-config
 * alias. A missing prompt is a config defect, never a silent depth-1 turn.
 */
export function subarchitectTarget(runtime: KernelRuntime): TurnTarget {
  const spec = runtime.configs.process.hierarchy?.subarchitect;
  if (!spec)
    throw new Error(
      "process config has no hierarchy.subarchitect prompt for hierarchy depth 2",
    );
  return {
    ...resolveTurn(
      runtime,
      spec.prompt,
      runtime.configs.process.boundary.architect.alias,
      undefined,
    ),
    ...repairFields(spec),
  };
}

/**
 * Resolves one architecture-flow turn: the reviewers supply the review alias,
 * the architect boundary step supplies the return alias. The architecture
 * block owns the prompts, so the plan review is a flow, not a kernel constant.
 */
export function architectureTarget(
  runtime: KernelRuntime,
  turn: "planReview" | "planReturn",
  alias: string,
): TurnTarget {
  const spec = runtime.configs.process.architecture[turn];
  if (!spec)
    throw new Error(`process config has no architecture ${turn} prompt`);
  return {
    ...resolveTurn(runtime, spec.prompt, alias, undefined),
    ...repairFields(spec),
  };
}

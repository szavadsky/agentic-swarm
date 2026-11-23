/**
 * Turn targeting: the alias chain (rotation, fallbacks, quota pools) and the
 * kernel/architecture boundary targets resolved from process config.
 */
import type { Harness, ModelRef } from "../harness/types.js";
import { poolExhausted } from "./quota-pools.js";
import type {
  AliasConfig,
  BoundaryStep,
  FallbackModelConfig,
  KernelRuntime,
  RepairSpec,
  Timeouts,
  TurnSpec,
} from "./types.js";

/** One resolved fallback tier: the harness, model, effort and quota pool one call draws on. */
export interface ResolvedTier {
  harness: Harness;
  model: ModelRef;
  effort?: string;
  subscription?: string;
  /** Harness configuration passed through `TurnRequest.opaque`. */
  opaque?: unknown;
}

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

/** Everything one turn needs to run: the resolved prompt, alias, harness, model and its own limits. */
export interface TurnTarget {
  /** Prompt template the turn renders; the role the agent acts as. */
  prompt: string;
  alias: string;
  /** Repair template the step named; absent renders `delivery-repair`. */
  repairPrompt?: string;
  /** Product the step named; absent derives from the turn's expectation. */
  deliverable?: string;
  harness: Harness;
  model: ModelRef;
  effort?: string;
  subscription?: string;
  /**
   * Effective fallback chain, primary first: tiers whose quota pool is recorded
   * in `exhaustedPools` are dropped, so `[0]` mirrors the fields above. Empty
   * when every tier is exhausted: no call may run, and `unavailable` says why.
   */
  tiers: ResolvedTier[];
  /**
   * Why no tier can serve this turn: every tier's quota pool is exhausted.
   * `harness`, `model` and `opaque` name the chain's last tier for bookkeeping,
   * but a turn must not call it; dispatch defers the work under this cause.
   */
  unavailable?: string;
  /** Chain index `tiers[0]` had in the alias's configured chain before exhausted tiers were dropped; the chain length when none is left. */
  tierOffset: number;
  timeouts?: Timeouts;
  /** Harness configuration passed through `TurnRequest.opaque`. */
  opaque?: unknown;
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
      const resetAt = runtime.exhaustedPools.get(pool);
      return resetAt === undefined
        ? pool
        : `${pool} resets at ${new Date(resetAt).toISOString()}`;
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
  iteration?: number,
): TurnTarget {
  const alias = runtime.configs.run.aliases[aliasName];
  if (!alias)
    throw new Error(
      `run config has no alias "${aliasName}" (needed by prompt "${prompt}")`,
    );
  const chain = resolveChain(runtime, aliasName, iteration);
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

/**
 * The alias's primary entry for an iteration: its rotate entry when one is
 * configured, else the alias's own harness, model and effort. Iteration N
 * selects `rotate[N % rotate.length]`, so iteration 1 starts at index 1.
 */
function primaryEntry(
  alias: AliasConfig,
  iteration: number | undefined,
): { harness: string; model: string; effort?: string } {
  const rotate = alias.rotate ?? [];
  if (iteration === undefined || rotate.length === 0)
    return {
      harness: alias.harness,
      model: alias.model,
      ...(alias.effort ? { effort: alias.effort } : {}),
    };
  const entry = rotate[iteration % rotate.length]!;
  const effort = entry.effort ?? alias.effort;
  return {
    harness: entry.harness,
    model: entry.model,
    ...(effort ? { effort } : {}),
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
 * Appends one alias's ladder to `out`: its primary for the iteration, then
 * each fallback in order. A literal fallback carries its own effort and, when it
 * keeps the primary's harness and model or declares `sharesPool`, its
 * subscription to this alias's; one that changes either without declaring
 * draws on no subscription and is keyed `harness+model`. A fallback that names
 * another alias contributes that alias's whole ladder on the same iteration,
 * so each of its tiers keeps the named alias's own defaults and quota pools. An
 * alias already on `path` is a cycle, refused at pre-flight and never walked
 * twice here.
 */
function collectTiers(
  runtime: KernelRuntime,
  aliasName: string,
  iteration: number | undefined,
  path: readonly string[],
  out: ChainTiers,
): void {
  const alias = runtime.configs.run.aliases[aliasName]!;
  const primary = primaryEntry(alias, iteration);
  pushTier(
    runtime,
    out,
    aliasName,
    primary.harness,
    primary.model,
    primary.effort,
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
      collectTiers(runtime, target, iteration, [...path, target], out);
      continue;
    }
    const tierHarness = fallback.harness ?? primary.harness;
    const changesPrimary = fallbackChangesPrimary(fallback, {
      harness: primary.harness,
      model: primary.model,
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
  iteration?: number,
): ResolvedTier[] {
  const out: ChainTiers = { seen: new Set(), tiers: [] };
  collectTiers(runtime, aliasName, iteration, [aliasName], out);
  return out.tiers;
}

/**
 * Resolves a configured prompt and alias for an iteration. `aliasOverride` is
 * a task tier or a PM rung (`default` means no override); flows branch on the
 * resolved alias, never on a harness id. An alias with `rotate` resolves the
 * iteration's entry as its primary; omitting the iteration resolves the
 * alias's own primary, for callers that need only its identity.
 */
export function resolveTurn(
  runtime: KernelRuntime,
  prompt: string,
  aliasName: string,
  aliasOverride?: string,
  iteration?: number,
): TurnTarget {
  const override =
    aliasOverride && aliasOverride !== "default" ? aliasOverride : undefined;
  return targetForAlias(runtime, prompt, override ?? aliasName, iteration);
}

/** A step's repair ask; absent fields stay absent so the kernel default applies. */
export function repairFields(
  spec: RepairSpec,
): Pick<TurnTarget, "repairPrompt" | "deliverable"> {
  return {
    repairPrompt: spec.repairPrompt,
    deliverable: spec.deliverable,
  };
}

/** Resolves one kernel boundary step from process config. */
export function boundaryTarget(
  runtime: KernelRuntime,
  step: BoundaryStep,
  iteration?: number,
  aliasOverride?: string,
): TurnTarget {
  const spec: TurnSpec | undefined = runtime.configs.process.boundary[step];
  if (!spec) throw new Error(`process config has no boundary step "${step}"`);
  return {
    ...resolveTurn(runtime, spec.prompt, spec.alias, aliasOverride, iteration),
    ...repairFields(spec),
  };
}

/**
 * The epic architect's consult: the configured subarchitect prompt on the
 * architect boundary step's alias, so depth 2 needs no second run-config
 * alias. A missing prompt is a config defect, never a silent depth-1 turn.
 */
export function subarchitectTarget(
  runtime: KernelRuntime,
  iteration: number,
): TurnTarget {
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
      iteration,
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
  iteration: number,
): TurnTarget {
  const spec = runtime.configs.process.architecture[turn];
  if (!spec)
    throw new Error(`process config has no architecture ${turn} prompt`);
  return {
    ...resolveTurn(runtime, spec.prompt, alias, undefined, iteration),
    ...repairFields(spec),
  };
}

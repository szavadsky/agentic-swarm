import type { Caps, Harness, ModelProbe, ModelRef } from "../harness/types.js";
import type { Finding } from "./findings.js";
import type { AliasConfig, ConfigBundle, ConfigFiles } from "./types.js";

/** Tells pre-flight whether a harness lists a model; omitted for fake harnesses. */
export type ModelCatalog = (harness: string, model: string) => Promise<boolean>;

export interface AliasContext {
  findings: Finding[];
  files: ConfigFiles;
  harnesses: ReadonlyMap<string, Harness>;
  catalog?: ModelCatalog;
  unavailable: ReadonlySet<string>;
  /** Quota-pool names `limits.concurrency.perSubscription` caps. */
  subscriptions: ReadonlySet<string>;
  capsCache: Map<string, Promise<Caps>>;
  modelCache: Map<string, Promise<boolean>>;
  probeCache: Map<string, Promise<ModelProbe>>;
}

function add(
  ctx: AliasContext,
  key: string,
  message: string,
  file = ctx.files.run,
): void {
  ctx.findings.push({ file, key, message });
}

async function modelListed(
  ctx: AliasContext,
  harness: string,
  model: string,
): Promise<boolean> {
  if (!ctx.catalog) return true;
  const key = `${harness}\u0000${model}`;
  let pending = ctx.modelCache.get(key);
  if (!pending) {
    pending = ctx.catalog(harness, model);
    ctx.modelCache.set(key, pending);
    pending.catch(() => ctx.modelCache.delete(key));
  }
  return pending;
}

async function liveProbe(
  ctx: AliasContext,
  harness: string,
  model: ModelRef,
): Promise<ModelProbe | undefined> {
  const found = ctx.harnesses.get(harness);
  if (!found?.probe) return undefined;
  const key = `${harness}\u0000${model.id}`;
  let pending = ctx.probeCache.get(key);
  if (!pending) {
    pending = found.probe(model);
    ctx.probeCache.set(key, pending);
    pending.catch(() => ctx.probeCache.delete(key));
  }
  return pending;
}

async function capsOf(
  ctx: AliasContext,
  harness: string,
  model: ModelRef,
): Promise<Caps> {
  const key = `${harness}\u0000${model.id}`;
  const found = ctx.harnesses.get(harness);
  if (!found) throw new Error(`no harness "${harness}" is registered`);
  let pending = ctx.capsCache.get(key);
  if (!pending) {
    pending = found.caps({ id: model.id });
    ctx.capsCache.set(key, pending);
    pending.catch(() => ctx.capsCache.delete(key));
  }
  return pending;
}

/** Resolves `highest`, validates a literal level, and reports every failure. */
async function resolveEffort(
  ctx: AliasContext,
  key: string,
  harness: string,
  model: ModelRef,
  effort: string | undefined,
  liveLevels?: readonly string[],
): Promise<string | undefined> {
  if (!effort) return undefined;
  let levels: readonly string[];
  if (liveLevels !== undefined) {
    levels = liveLevels;
  } else {
    try {
      levels = (await capsOf(ctx, harness, model)).effort;
    } catch (err) {
      add(
        ctx,
        `${key}.effort`,
        `cannot probe model capabilities: ${(err as Error).message}`,
      );
      return undefined;
    }
  }
  if (effort === "highest") {
    const highest = levels.at(-1);
    if (!highest) {
      add(
        ctx,
        `${key}.effort`,
        'effort is "highest" but the model lists no effort levels',
      );
      return undefined;
    }
    return highest;
  }
  if (!levels.includes(effort)) {
    add(
      ctx,
      `${key}.effort`,
      `effort "${effort}" is not supported; model accepts: ${levels.join(", ") || "none"}`,
    );
  }
  return effort;
}

interface CheckedModel {
  /** Live values from the harness; absent means use `caps()`. */
  effort?: readonly string[];
  /** Effort named by the configured model-id suffix. */
  modelEffort?: string;
}

/**
 * Checks one model, preferring the harness's live session probe and falling
 * back to the binary catalog plus static caps for harnesses such as omp.
 */
async function checkedModel(
  ctx: AliasContext,
  key: string,
  harness: string,
  model: string,
  label: "model" | "fallback",
): Promise<CheckedModel | undefined> {
  let live: ModelProbe | undefined;
  try {
    live = await liveProbe(ctx, harness, { id: model });
  } catch (err) {
    add(ctx, `${key}.model`, `cannot probe model: ${(err as Error).message}`);
    return undefined;
  }
  if (live) {
    if (!live.listed) {
      add(
        ctx,
        `${key}.model`,
        `${label} "${model}" is not listed by harness "${harness}"; available models: ${live.available.join(", ") || "none"}`,
      );
      return undefined;
    }
    return { effort: live.effort, modelEffort: live.modelEffort };
  }

  let listed = true;
  try {
    listed = await modelListed(ctx, harness, model);
  } catch (err) {
    add(ctx, `${key}.model`, `cannot list models: ${(err as Error).message}`);
    return undefined;
  }
  if (!listed) {
    add(
      ctx,
      `${key}.model`,
      `${label} "${model}" is not listed by harness "${harness}"`,
    );
    return undefined;
  }
  return {};
}

export async function checkAlias(
  ctx: AliasContext,
  name: string,
  alias: AliasConfig,
  effortOut: Record<string, string | undefined>,
): Promise<void> {
  const key = `aliases.${name}`;
  if (!ctx.harnesses.has(alias.harness)) {
    add(
      ctx,
      `${key}.harness`,
      `harness "${alias.harness}" is not registered (registered: ${[...ctx.harnesses.keys()].join(", ") || "none"})`,
    );
    return;
  }
  if (
    alias.subscription !== undefined &&
    !ctx.subscriptions.has(alias.subscription)
  ) {
    add(
      ctx,
      `${key}.subscription`,
      `subscription "${alias.subscription}" names no limits.concurrency.perSubscription pool`,
    );
  }
  if (ctx.unavailable.has(alias.harness)) return;

  const primary = await checkedModel(
    ctx,
    key,
    alias.harness,
    alias.model,
    "model",
  );
  if (!primary) return;

  effortOut[name] = await resolveEffort(
    ctx,
    key,
    alias.harness,
    { id: alias.model },
    alias.effort ?? primary.modelEffort,
    primary.effort,
  );
  for (const [index, fallback] of (alias.fallbacks ?? []).entries()) {
    const tierKey = `${key}.fallbacks.${index}`;
    const tierHarness = fallback.harness ?? alias.harness;
    if (
      fallback.harness !== undefined &&
      !ctx.harnesses.has(fallback.harness)
    ) {
      add(
        ctx,
        `${tierKey}.harness`,
        `harness "${fallback.harness}" is not registered (registered: ${[...ctx.harnesses.keys()].join(", ") || "none"})`,
      );
      continue;
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
    if (ctx.unavailable.has(tierHarness)) continue;
    const tier = await checkedModel(
      ctx,
      tierKey,
      tierHarness,
      fallback.model,
      "fallback",
    );
    if (!tier) continue;
    // Each tier carries its own effort: explicit, else the alias's, else a
    // suffix declared on that model, resolved against the tier's live values.
    fallback.effort = await resolveEffort(
      ctx,
      tierKey,
      tierHarness,
      { id: fallback.model },
      fallback.effort ?? alias.effort ?? tier.modelEffort,
      tier.effort,
    );
  }
}

export async function checkScouts(
  ctx: AliasContext,
  configs: ConfigBundle,
  architectAliasName: string | undefined,
  effortOut: Record<string, string | undefined>,
): Promise<void> {
  const scouts = configs.run.scouts;
  if (!scouts) return;
  const architect = architectAliasName
    ? configs.run.aliases[architectAliasName]
    : undefined;
  if (
    !architect ||
    !ctx.harnesses.has(architect.harness) ||
    ctx.unavailable.has(architect.harness)
  )
    return;
  const checked = await checkedModel(
    ctx,
    "scouts",
    architect.harness,
    scouts.model,
    "model",
  );
  if (!checked) return;
  effortOut.scouts = await resolveEffort(
    ctx,
    "scouts",
    architect.harness,
    { id: scouts.model },
    scouts.effort ?? checked.modelEffort,
    checked.effort,
  );
}

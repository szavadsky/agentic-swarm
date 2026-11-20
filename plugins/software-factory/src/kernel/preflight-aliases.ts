import { OMP_ID, OMP_THINKING_LEVELS } from "../harness/omp/types.js";
import type { Caps, Harness, ModelProbe, ModelRef } from "../harness/types.js";
import type { Finding } from "./findings.js";
import type {
  AliasConfig,
  ConfigBundle,
  ConfigFiles,
  FallbackModelConfig,
} from "./types.js";

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

/**
 * omp role aliases (`@free`) resolve inside omp's own chain, so the binary
 * catalog never lists them and no model-level effort list exists; omp refuses
 * a bad id itself at runtime.
 */
function isOmpAlias(harness: string, model: string): boolean {
  return harness === OMP_ID && model.startsWith("@");
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

/** Resolves `harness-default`, validates a literal level, and reports every failure. */
async function resolveEffort(
  ctx: AliasContext,
  key: string,
  harness: string,
  model: ModelRef,
  effort: string | undefined,
  liveLevels?: readonly string[],
): Promise<string | undefined> {
  if (!effort) return undefined;
  // The factory's sentinel for "leave the harness default in place"; it is not
  // a level any harness parses, so nothing is passed through.
  if (effort === "harness-default") return undefined;
  if (isOmpAlias(harness, model.id)) {
    // Only omp's CLI enum is knowable for an alias: `highest` is a removed
    // factory sentinel omp does not parse, and passing it through aborts the launch.
    if (!OMP_THINKING_LEVELS.includes(effort)) {
      add(
        ctx,
        `${key}.effort`,
        `effort "${effort}" is not an omp thinking level; alias "${model.id}" accepts: ${OMP_THINKING_LEVELS.join(", ")}`,
      );
    }
    return effort;
  }
  if (effort === "highest") {
    add(ctx, `${key}.effort`, 'effort "highest" is forbidden');
    return undefined;
  }
  // omp's flag parses `auto` for every model, but `models --json` lists only
  // model-specific efforts, so the catalog cannot be the gate for it.
  if (harness === OMP_ID && effort === "auto") return effort;
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
  label: "model" | "fallback" | "rotation",
): Promise<CheckedModel | undefined> {
  if (isOmpAlias(harness, model)) return {};
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

/** The registered-harness finding both alias and tier rows share. */
function registryMessage(ctx: AliasContext, harness: string): string {
  return `harness "${harness}" is not registered (registered: ${[...ctx.harnesses.keys()].join(", ") || "none"})`;
}

/** Validates the alias's own harness and quota pool. */
function checkAliasIdentity(
  ctx: AliasContext,
  key: string,
  alias: AliasConfig,
): boolean {
  if (!ctx.harnesses.has(alias.harness)) {
    add(ctx, `${key}.harness`, registryMessage(ctx, alias.harness));
    return false;
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
  return true;
}

/** Checks the alias's primary model and records its resolved effort. */
async function checkPrimaryModel(
  ctx: AliasContext,
  key: string,
  name: string,
  alias: AliasConfig,
  effortOut: Record<string, string | undefined>,
): Promise<void> {
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
}

/** Checks one rotation entry and stamps its own resolved effort. */
async function checkRotationEntry(
  ctx: AliasContext,
  entryKey: string,
  entry: NonNullable<AliasConfig["rotate"]>[number],
  alias: AliasConfig,
): Promise<void> {
  if (!ctx.harnesses.has(entry.harness)) {
    add(ctx, `${entryKey}.harness`, registryMessage(ctx, entry.harness));
    return;
  }
  if (ctx.unavailable.has(entry.harness)) return;
  const checked = await checkedModel(
    ctx,
    entryKey,
    entry.harness,
    entry.model,
    "rotation",
  );
  if (!checked) return;
  // A rotation entry carries its own effort: explicit, else the alias's,
  // else a suffix declared on that entry's model.
  entry.effort = await resolveEffort(
    ctx,
    entryKey,
    entry.harness,
    { id: entry.model },
    entry.effort ?? alias.effort ?? checked.modelEffort,
    checked.effort,
  );
}

async function checkRotation(
  ctx: AliasContext,
  key: string,
  alias: AliasConfig,
): Promise<void> {
  for (const [index, entry] of (alias.rotate ?? []).entries()) {
    await checkRotationEntry(ctx, `${key}.rotate.${index}`, entry, alias);
  }
}

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

async function checkFallbacks(
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

export async function checkAlias(
  ctx: AliasContext,
  name: string,
  alias: AliasConfig,
  effortOut: Record<string, string | undefined>,
): Promise<void> {
  const key = `aliases.${name}`;
  if (!checkAliasIdentity(ctx, key, alias)) return;
  await checkPrimaryModel(ctx, key, name, alias, effortOut);
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
  effortOut: Record<string, string | undefined>,
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
  effortOut.scouts = await resolveEffort(
    ctx,
    "scouts",
    OMP_ID,
    { id: scouts.model },
    scouts.effort ?? checked.modelEffort,
    checked.effort,
  );
}

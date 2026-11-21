/** Model and rotation checks: registry, catalog probe, effort and quota. */

import { OMP_ID, OMP_THINKING_LEVELS } from "../../harness/omp/types.js";
import type { Caps, ModelProbe, ModelRef } from "../../harness/types.js";
import type { AliasConfig } from "../types.js";
import type { AliasContext } from "./types.js";

export function add(
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
export async function resolveEffort(
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
export async function checkedModel(
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
export function registryMessage(ctx: AliasContext, harness: string): string {
  return `harness "${harness}" is not registered (registered: ${[...ctx.harnesses.keys()].join(", ") || "none"})`;
}

/** Validates the alias's own harness and quota pool. */
export function checkAliasIdentity(
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
export async function checkPrimaryModel(
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

export async function checkRotation(
  ctx: AliasContext,
  key: string,
  alias: AliasConfig,
): Promise<void> {
  for (const [index, entry] of (alias.rotate ?? []).entries()) {
    await checkRotationEntry(ctx, `${key}.rotate.${index}`, entry, alias);
  }
}

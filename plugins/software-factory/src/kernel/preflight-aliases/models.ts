/** Model and rotation checks: registry, catalog probe, effort and quota. */

import type { ModelProbe, ModelRef } from "../../harness/types.js";
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

interface CheckedModel {
  /** The harness-probed effort surface; absent only for a probe-less harness. */
  effort?: readonly string[] | null;
  /** Effort named by the configured model-id suffix. */
  modelEffort?: string;
}

/**
 * Checks one model, preferring the harness's live session probe and falling
 * back to the binary catalog for the model list. Effort is opaque: the kernel
 * compares the configured string only against what the probe reports.
 */
export async function checkedModel(
  ctx: AliasContext,
  key: string,
  harness: string,
  model: string,
  label: "model" | "fallback" | "rotation",
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

/**
 * Validates one configured effort against the harness's probe answer. An
 * absent effort means the harness default and always passes; a configured one
 * is refused before any turn starts when the model offers no effort (the probe
 * reports `null`), when its list does not name it, or when the harness has no
 * probe to report one.
 */
export function checkEffort(
  ctx: AliasContext,
  key: string,
  harness: string,
  model: string,
  effort: string | undefined,
  probed: readonly string[] | null | undefined,
): void {
  if (effort === undefined) return;
  if (probed === undefined) {
    add(
      ctx,
      `${key}.effort`,
      `effort "${effort}" cannot be validated: harness "${harness}" does not report an effort surface for model "${model}"`,
    );
    return;
  }
  if (probed === null) {
    add(
      ctx,
      `${key}.effort`,
      `effort "${effort}" is not supported; model "${model}" on harness "${harness}" offers no effort`,
    );
    return;
  }
  if (!probed.includes(effort)) {
    add(
      ctx,
      `${key}.effort`,
      `effort "${effort}" is not supported; model accepts: ${probed.join(", ") || "none"}`,
    );
  }
}

/** Checks the alias's primary model and its configured effort. */
export async function checkPrimaryModel(
  ctx: AliasContext,
  key: string,
  alias: AliasConfig,
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
  checkEffort(
    ctx,
    key,
    alias.harness,
    alias.model,
    alias.effort ?? primary.modelEffort,
    primary.effort,
  );
}

/** Checks one rotation entry and its configured effort. */
async function checkRotationEntry(
  ctx: AliasContext,
  entryKey: string,
  entry: NonNullable<AliasConfig["rotate"]>[number],
  alias: AliasConfig,
): Promise<void> {
  if (!ctx.harnesses.has(entry.harness)) {
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
  checkEffort(
    ctx,
    entryKey,
    entry.harness,
    entry.model,
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

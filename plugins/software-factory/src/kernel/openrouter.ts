import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModelPrice, PriceTable } from "./pricing.js";

/** Public OpenRouter model list; `pricing` rates are USD-per-token strings. */
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** Price cache lifetime; a stale cache is refreshed, never trusted blindly. */
export const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Override for tests and operators; otherwise the shared local cache. */
export function defaultPriceCachePath(): string {
  const override = process.env.FACTORY_PRICE_CACHE?.trim();
  if (override) return override;
  return path.join(os.homedir(), ".cache", "factory", "openrouter-models.json");
}

const PER_MTOK = 1_000_000;

function perMtok(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n * PER_MTOK;
}

function parsePriceEntry(
  entry: unknown,
): { id: string; price: ModelPrice } | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const { id, pricing } = entry as {
    id?: unknown;
    pricing?: Record<string, unknown> | null;
  };
  if (typeof id !== "string" || !id) return undefined;
  if (typeof pricing !== "object" || pricing === null) return undefined;
  const input = perMtok(pricing.prompt);
  const output = perMtok(pricing.completion);
  if (input === undefined || output === undefined) return undefined;
  return {
    id,
    price: {
      input,
      cachedInput: perMtok(pricing.input_cache_read) ?? input,
      output,
      reasoning: perMtok(pricing.internal_reasoning) ?? output,
    },
  };
}

/**
 * The model list as USD per Mtok, keyed by OpenRouter id. Entries without a
 * prompt and completion rate are skipped: unpriced, never $0. Cache reads
 * without their own rate fall back to the prompt rate (no discount assumed);
 * reasoning without its own rate falls back to the completion rate.
 */
export function parseOpenRouterModels(payload: unknown): PriceTable {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return {};
  const table: PriceTable = {};
  for (const entry of data) {
    const parsed = parsePriceEntry(entry);
    if (parsed) table[parsed.id] = parsed.price;
  }
  return table;
}

export interface PriceCache {
  fetchedAt: string;
  prices: PriceTable;
}

function isModelPrice(value: unknown): value is ModelPrice {
  if (typeof value !== "object" || value === null) return false;
  const price = value as Record<string, unknown>;
  return (
    typeof price.input === "number" &&
    Number.isFinite(price.input) &&
    price.input >= 0 &&
    typeof price.cachedInput === "number" &&
    Number.isFinite(price.cachedInput) &&
    price.cachedInput >= 0 &&
    typeof price.output === "number" &&
    Number.isFinite(price.output) &&
    price.output >= 0 &&
    typeof price.reasoning === "number" &&
    Number.isFinite(price.reasoning) &&
    price.reasoning >= 0
  );
}

/** The last cache, or undefined when missing, corrupt or shapeless. */
export function readPriceCache(cachePath: string): PriceCache | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(cachePath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { fetchedAt, prices } = parsed as {
    fetchedAt?: unknown;
    prices?: unknown;
  };
  if (typeof fetchedAt !== "string") return undefined;
  if (typeof prices !== "object" || prices === null) return undefined;
  const table: PriceTable = {};
  for (const [id, price] of Object.entries(prices)) {
    if (isModelPrice(price)) table[id] = price;
  }
  return { fetchedAt, prices: table };
}

/** Writes the cache atomically; concurrent launches land one valid file. */
export function writePriceCache(
  cachePath: string,
  prices: PriceTable,
  fetchedAt: string = new Date().toISOString(),
): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tmp = `${cachePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ fetchedAt, prices }));
  fs.renameSync(tmp, cachePath);
}

function isFresh(fetchedAt: string): boolean {
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && Date.now() - at < PRICE_CACHE_TTL_MS;
}

/** Returns the parsed model-list payload; tests inject a fake, never network. */
export type ModelListFetcher = () => Promise<unknown>;

export async function fetchOpenRouterModels(): Promise<unknown> {
  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) {
    throw new Error(`OpenRouter models list failed: HTTP ${res.status}`);
  }
  return res.json();
}

/** Where the price table comes from; both fields default to the shared cache. */
export interface PriceSource {
  cachePath?: string;
  fetchModels?: ModelListFetcher;
}

/**
 * The OpenRouter price table: a fresh cache wins, a stale cache is refreshed,
 * and the last cache covers a network failure. No cache and no network means
 * no prices — turns stay unpriced, never $0. Persisting the cache is
 * best-effort: a fetched table is returned even when the disk write fails.
 */
export async function loadPriceTable(
  source: PriceSource = {},
): Promise<PriceTable> {
  const cachePath = source.cachePath ?? defaultPriceCachePath();
  const cached = readPriceCache(cachePath);
  if (cached && isFresh(cached.fetchedAt)) return cached.prices;
  try {
    const table = parseOpenRouterModels(
      await (source.fetchModels ?? fetchOpenRouterModels)(),
    );
    try {
      writePriceCache(cachePath, table);
    } catch {
      // The table is correct in memory; the next load retries the disk.
    }
    return table;
  } catch {
    if (cached) return cached.prices;
    return {};
  }
}

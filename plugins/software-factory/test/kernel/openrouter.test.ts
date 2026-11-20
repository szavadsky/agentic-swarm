import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadPriceTable,
  parseOpenRouterModels,
  PRICE_CACHE_TTL_MS,
  readPriceCache,
  writePriceCache,
} from "../../src/kernel/openrouter.js";
import { priceUsage } from "../../src/kernel/pricing.js";

function payload(models: Array<Record<string, unknown>>): unknown {
  return { data: models };
}

function tmpCache(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-or-prices-"));
  return path.join(dir, "openrouter-models.json");
}

const DEEPSEEK = {
  id: "deepseek/deepseek-v4.1-flash",
  pricing: {
    prompt: "0.0000000507",
    completion: "0.0000002028",
    input_cache_read: "0.000000001014",
  },
};

describe("OpenRouter model-list parsing", () => {
  it("converts per-token strings to per-Mtok rates with cache fallbacks", () => {
    const table = parseOpenRouterModels(
      payload([
        DEEPSEEK,
        {
          id: "paid/no-cache-rates",
          pricing: { prompt: "0.000004", completion: "0.00002" },
        },
        { id: "unpriced/no-prompt", pricing: { completion: "0.00002" } },
        {
          id: "unpriced/bad-number",
          pricing: { prompt: "n/a", completion: "0" },
        },
        { id: "unpriced/negative", pricing: { prompt: "-1", completion: "0" } },
        { pricing: { prompt: "1", completion: "1" } },
      ]),
    );
    const deepseek = table["deepseek/deepseek-v4.1-flash"]!;
    expect(deepseek.input).toBeCloseTo(0.0507, 10);
    expect(deepseek.cachedInput).toBeCloseTo(0.001014, 10);
    expect(deepseek.output).toBeCloseTo(0.2028, 10);
    // No reasoning rate: the completion rate covers reasoning tokens.
    expect(deepseek.reasoning).toBeCloseTo(0.2028, 10);
    expect(table["paid/no-cache-rates"]).toEqual({
      input: 4,
      // No cache-read rate: no discount is assumed.
      cachedInput: 4,
      output: 20,
      reasoning: 20,
    });
    expect(table["unpriced/no-prompt"]).toBeUndefined();
    expect(table["unpriced/bad-number"]).toBeUndefined();
    expect(table["unpriced/negative"]).toBeUndefined();
    expect(Object.keys(table)).toHaveLength(2);
  });

  it("rejects shapeless payloads without throwing", () => {
    expect(parseOpenRouterModels(null)).toEqual({});
    expect(parseOpenRouterModels({})).toEqual({});
    expect(parseOpenRouterModels({ data: "models" })).toEqual({});
  });
});

describe("price cache loading", () => {
  registerPriceCacheLoadingPart1();
  registerPriceCacheLoadingPart2();
  registerPriceCacheLoadingPart3();
  registerPriceCacheLoadingPart4();
});

function registerPriceCacheLoadingPart1(): void {
  it("prices a model absent from config through a fake fetcher", async () => {
    const cachePath = tmpCache();
    try {
      const table = await loadPriceTable({
        cachePath,
        fetchModels: async () => payload([DEEPSEEK]),
      });
      // The harness id carries a provider OpenRouter never lists.
      const cost = priceUsage(
        {
          in: 1_000_000,
          cacheRead: 0,
          cacheWrite5m: 0,
          cacheWrite1h: 0,
          out: 0,
          reasoningOut: 0,
        },
        "opencode-go/deepseek-v4.1-flash",
        table,
      );
      expect(cost).toBeCloseTo(0.0507, 10);
      // The fetch landed in the cache with its fetch date.
      const cached = readPriceCache(cachePath)!;
      expect(Date.parse(cached.fetchedAt)).toBeLessThanOrEqual(Date.now());
      expect(cached.prices["deepseek/deepseek-v4.1-flash"]?.input).toBeCloseTo(
        0.0507,
        10,
      );
    } finally {
      fs.rmSync(path.dirname(cachePath), { recursive: true, force: true });
    }
  });
}

function registerPriceCacheLoadingPart2(): void {
  it("serves a fresh cache with no network", async () => {
    const cachePath = tmpCache();
    try {
      writePriceCache(cachePath, {
        "deepseek/deepseek-v4.1-flash": {
          input: 0.0507,
          cachedInput: 0.001,
          output: 0.2028,
          reasoning: 0.2028,
        },
      });
      const table = await loadPriceTable({
        cachePath,
        fetchModels: async () => {
          throw new Error("network disabled");
        },
      });
      expect(table["deepseek/deepseek-v4.1-flash"]?.input).toBeCloseTo(
        0.0507,
        10,
      );
    } finally {
      fs.rmSync(path.dirname(cachePath), { recursive: true, force: true });
    }
  });
}

function registerPriceCacheLoadingPart3(): void {
  it("refreshes a stale cache and falls back to it without network", async () => {
    const staleAt = new Date(Date.now() - PRICE_CACHE_TTL_MS - 1000);
    const fresh = {
      input: 0.06,
      // The refresh carries no cache-read rate: no discount is assumed.
      cachedInput: 0.06,
      output: 0.21,
      reasoning: 0.21,
    };
    const stale = {
      input: 0.0507,
      cachedInput: 0.001,
      output: 0.2028,
      reasoning: 0.2028,
    };
    const refreshedPath = tmpCache();
    const offlinePath = tmpCache();
    try {
      writePriceCache(
        refreshedPath,
        { "deepseek/deepseek-v4.1-flash": stale },
        staleAt.toISOString(),
      );
      const table = await loadPriceTable({
        cachePath: refreshedPath,
        fetchModels: async () =>
          payload([
            {
              id: "deepseek/deepseek-v4.1-flash",
              pricing: { prompt: "0.00000006", completion: "0.00000021" },
            },
          ]),
      });
      expect(table["deepseek/deepseek-v4.1-flash"]).toEqual(fresh);
      expect(
        Date.parse(readPriceCache(refreshedPath)!.fetchedAt),
      ).toBeGreaterThan(Date.parse(staleAt.toISOString()));

      // No network: the last cache is used, stale or not.
      writePriceCache(
        offlinePath,
        { "deepseek/deepseek-v4.1-flash": stale },
        staleAt.toISOString(),
      );
      const offline = await loadPriceTable({
        cachePath: offlinePath,
        fetchModels: async () => {
          throw new Error("network disabled");
        },
      });
      expect(offline["deepseek/deepseek-v4.1-flash"]).toEqual(stale);
    } finally {
      for (const cachePath of [refreshedPath, offlinePath]) {
        fs.rmSync(path.dirname(cachePath), { recursive: true, force: true });
      }
    }
  });
}

function registerPriceCacheLoadingPart4(): void {
  it("leaves turns unpriced with no cache and no network", async () => {
    const cachePath = tmpCache();
    try {
      const table = await loadPriceTable({
        cachePath,
        fetchModels: async () => {
          throw new Error("network disabled");
        },
      });
      expect(table).toEqual({});
      expect(fs.existsSync(cachePath)).toBe(false);
    } finally {
      fs.rmSync(path.dirname(cachePath), { recursive: true, force: true });
    }
  });

  it("treats a corrupt cache as missing", async () => {
    const cachePath = tmpCache();
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, "{not json", "utf8");
      const offline = await loadPriceTable({
        cachePath,
        fetchModels: async () => {
          throw new Error("network disabled");
        },
      });
      expect(offline).toEqual({});
      const fetched = await loadPriceTable({
        cachePath,
        fetchModels: async () => payload([DEEPSEEK]),
      });
      expect(fetched["deepseek/deepseek-v4.1-flash"]?.input).toBeCloseTo(
        0.0507,
        10,
      );
    } finally {
      fs.rmSync(path.dirname(cachePath), { recursive: true, force: true });
    }
  });
}

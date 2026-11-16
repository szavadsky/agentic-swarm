import path from "node:path";
import type { PriceSource } from "../../src/kernel/openrouter.js";

/**
 * Hermetic prices for tests: the repo's own (usually missing) cache, never
 * the network. A missing cache plus a throwing fetcher prices nothing, which
 * is the same unpriced-not-free default an empty run config used to give.
 */
export function testPriceSource(repoDir: string): PriceSource {
  return {
    cachePath: path.join(path.resolve(repoDir), ".factory", "price-cache.json"),
    fetchModels: async () => {
      throw new Error("price fetch disabled in tests");
    },
  };
}

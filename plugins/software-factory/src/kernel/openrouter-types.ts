/** The price source's cache and fetcher shapes. */

import type { PriceTable } from "./pricing.js";

export interface PriceCache {
  fetchedAt: string;
  prices: PriceTable;
}

/** Returns the parsed model-list payload; tests inject a fake, never network. */
export type ModelListFetcher = () => Promise<unknown>;

/** Where the price table comes from; both fields default to the shared cache. */
export interface PriceSource {
  cachePath?: string;
  fetchModels?: ModelListFetcher;
}

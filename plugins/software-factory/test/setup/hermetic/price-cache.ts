import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeAtFileEnd } from "../tmp-cleanup.js";

export function redirectPriceCache(): void {
  if (process.env.FACTORY_PRICE_CACHE?.trim()) return;
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "factory-hermetic-no-prices-"),
  );
  removeAtFileEnd(() => fs.rmSync(dir, { recursive: true, force: true }));
  process.env.FACTORY_PRICE_CACHE = path.join(dir, "openrouter-models.json");
}

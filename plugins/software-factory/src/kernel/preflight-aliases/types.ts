/** The alias check's public context: the catalog probe and the shared findings state. */

import type { Caps, Harness, ModelProbe } from "../../harness/types.js";
import type { Finding } from "../findings.js";
import type { ConfigFiles } from "../types.js";

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

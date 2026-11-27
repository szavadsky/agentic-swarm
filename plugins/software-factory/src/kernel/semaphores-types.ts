/** The merged semaphore declarations and the cross-layer conflicts pre-flight reports. */

import type { SemaphoreDeclaration } from "../core/semaphores-types.js";

export type ConfigLayer = "repo" | "process" | "run";

/** A later layer declaring a name another layer already declared with another max. */
export interface SemaphoreConflict {
  name: string;
  /** The later declaration's max. */
  max: number;
  /** The max the earlier layer declared. */
  previousMax: number;
  layer: ConfigLayer;
}

/** Every distinct declaration from the three layers, plus conflicts. */
export interface MergedSemaphores {
  declarations: SemaphoreDeclaration[];
  conflicts: SemaphoreConflict[];
}

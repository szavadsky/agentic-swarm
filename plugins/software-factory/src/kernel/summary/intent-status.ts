/** The architect's intent-wise status artifact: written by the iteration summary, read by the dashboard. */

import { z } from "zod";
import type { ArtifactStore } from "../types.js";
import { type IntentStatusEntry, intentStatusEntrySchema } from "../types.js";
import type { IntentStatusArtifact } from "./types.js";

/** File name under the iteration directory. */
export const INTENT_STATUS_FILE = "intent-status.json";

export const intentStatusArtifactSchema = z.object({
  iteration: z.number().int().positive(),
  sections: z.array(intentStatusEntrySchema),
});

function invalidArtifact(rel: string, detail: string): Error {
  return new Error(`${rel} is not a valid intent status artifact: ${detail}`);
}

/** Writes the iteration's artifact; the summary writes it before its own file. */
export async function writeIntentStatus(
  store: ArtifactStore,
  iteration: number,
  sections: readonly IntentStatusEntry[],
): Promise<void> {
  const artifact: IntentStatusArtifact = {
    iteration,
    sections: [...sections],
  };
  await store.iterations.write(
    iteration,
    INTENT_STATUS_FILE,
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
}

/**
 * The newest artifact at or below `iteration`; absent until one is written.
 * A malformed artifact fails loudly: rendering a guessed status would be worse
 * than refusing the refresh.
 */
export async function readLatestIntentStatus(
  store: ArtifactStore,
  iteration: number,
): Promise<IntentStatusArtifact | undefined> {
  for (let n = iteration; n >= 1; n--) {
    const rel = store.iterations.rel(n, INTENT_STATUS_FILE);
    const text = await store.iterations.read(n, INTENT_STATUS_FILE);
    if (text === null) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw invalidArtifact(rel, (err as Error).message);
    }
    const parsed = intentStatusArtifactSchema.safeParse(raw);
    if (!parsed.success) throw invalidArtifact(rel, parsed.error.message);
    return parsed.data;
  }
  return undefined;
}

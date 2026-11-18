/**
 * Test-file-scoped temp cleanup, loaded via the `[test] preload` in
 * bunfig.toml. Helpers that create temp dirs register a remover here; the
 * preload's `afterAll` runs it when the file (isolated workers) or the whole
 * run (single process) ends. A `process.on("exit")` hook cannot do this job:
 * `bun test` never emits `exit` to listeners, so such hooks leaked a dir per
 * test file.
 */
import { afterAll } from "bun:test";

const pending = new Set<() => void>();

/** Runs `remove` when the current file or run ends; the returned fn unregisters it. */
export function removeAtFileEnd(remove: () => void): () => void {
  pending.add(remove);
  return () => {
    pending.delete(remove);
  };
}

afterAll(() => {
  const removers = [...pending];
  pending.clear();
  const failures: unknown[] = [];
  for (const remove of removers) {
    try {
      remove();
    } catch (err) {
      failures.push(err);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "temp cleanup failed");
  }
});

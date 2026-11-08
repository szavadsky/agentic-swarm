import { describe, expect, it } from "bun:test";
import path from "node:path";
import { CompiledSchemaCache } from "../../src/core/records/schema-cache.js";

/**
 * `state.schema.json` is the canonical contract for the materialized
 * `state.yaml` view. It must carry the §18 concern counts and require all four
 * status totals so consumers never read a partially populated view.
 */
const PLUGIN_ROOT = path.resolve(import.meta.dir, "../..");

describe("State schema concern counts", () => {
  it("accepts concern status counts and rejects incomplete ones", () => {
    const validate = new CompiledSchemaCache(
      path.join(PLUGIN_ROOT, "config/schemas")
    ).getValidator("state");

    const base = {
      task: "counts-task",
      status: "active",
      iteration: 1,
      items: {},
      lastUpdated: "2026-01-01T00:00:00.000Z",
    };
    const counts = { open: 2, dismissed: 1, routed: 3, resolved: 4 };

    expect(validate({ ...base, concerns: counts })).toBe(true);
    expect(validate({ ...base, concerns: { open: 2 } })).toBe(false);
    expect(
      validate({ ...base, concerns: { ...counts, pending: 0 } })
    ).toBe(false);
    expect(
      validate({ ...base, concerns: { ...counts, open: "2" } })
    ).toBe(false);
  });
});

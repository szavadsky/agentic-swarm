import { describe, expect, it } from "bun:test";
import {
  type ContextPackInput,
  renderContextData,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { cause, script, task } from "./helpers.js";

/** A park retired by a base continuation, a live park, and the input both renders read. */
function parkedPackInput(): ContextPackInput {
  const parked = [
    task("base"),
    task("base-next", { base: "base" }),
    task("live"),
  ];
  const records = [
    script(1, {
      step: "park",
      slug: "base",
      ok: true,
      cause: cause("round limit"),
    }),
    script(2, { step: "merge", slug: "base-next", ok: true, commit: "abc" }),
    script(3, {
      step: "park",
      slug: "live",
      ok: true,
      cause: cause("gates: unit"),
    }),
  ];
  return {
    goal: "parks",
    iteration: 2,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/parks",
    integrationBranch: "factory/parks",
    headHash: "abcdef1234567890",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    tasks: parked,
    state: derive(parked, records),
    steers: [],
    setup: [],
    gates: [],
    forwarded: [],
    debts: [],
  };
}

/** One section's body, from its heading to the next level-two heading. */
function packSection(pack: string, heading: string): string {
  const start = pack.indexOf(heading);
  const rest = pack.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("pack park section", () => {
  it("keeps a park retired by a base continuation in the markdown and the data", () => {
    const input = parkedPackInput();
    const pack = renderContextPack(input);
    const data = JSON.parse(renderContextData(input));

    expect(
      packSection(
        pack,
        "## Parked by cause (terminal; continue via a new slug)",
      ),
    ).toBe("\n- base: round limit\n- live: gates: unit\n");
    expect(data.parked).toEqual([
      { slug: "base", cause: cause("round limit") },
      { slug: "live", cause: cause("gates: unit") },
    ]);
  });
});

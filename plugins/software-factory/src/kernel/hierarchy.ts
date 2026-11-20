import type { Harness, ModelRef } from "../harness/types.js";

/**
 * How the boundary hands an epic's consult to its subarchitect.
 * `steer`: the subarchitect is a named child of the architect's live session,
 * reached over IRC. `report`: a separate turn that writes its own status.
 */
export type SubarchitectDelivery = "steer" | "report";

/**
 * Selected from the architect alias's caps, because the subarchitect runs on
 * that alias (`subarchitectTarget`). An unreadable cap proves nothing, so it
 * keeps the written report: that path works on every harness.
 */
export async function subarchitectDelivery(target: {
  harness: Harness;
  model: ModelRef;
}): Promise<SubarchitectDelivery> {
  try {
    const caps = await target.harness.caps(target.model);
    return caps.subagents === "steer" ? "steer" : "report";
  } catch {
    return "report";
  }
}

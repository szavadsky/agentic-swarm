import type { Harness, ModelRef } from "../harness/types.js";
import type { SubarchitectDelivery } from "./hierarchy-types.js";

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

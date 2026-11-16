import type { ModelRef } from "../types.js";
import type { AcpxConfig } from "./config.js";

/**
 * Some agents keep effort inside the model id, while acpx's `--model` accepts
 * only the base id its model option lists. A declared suffix moves to the
 * session option; an explicit effort wins.
 */
export function acpxModel(
  config: AcpxConfig,
  model: ModelRef,
): { id: string; effort?: string } {
  let id = model.id;
  let effort = model.effort;
  const bases = config.effort?.modelBases ?? {};
  for (const [base, levels] of Object.entries(bases)) {
    const suffix = id.startsWith(`${base}-`)
      ? id.slice(base.length + 1)
      : undefined;
    if (suffix !== undefined && levels.includes(suffix)) {
      id = base;
      effort = effort ?? suffix;
      break;
    }
  }
  return effort === undefined ? { id } : { id, effort };
}

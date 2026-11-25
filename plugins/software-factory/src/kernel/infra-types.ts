/** The infra turn's report shape: the gates it discovered and their observed status. */

import { z } from "zod";

export const infraGateSchema = z
  .object({
    name: z.string().min(1),
    command: z.string().min(1),
    speed: z.enum(["fast", "slow"]),
    status: z.enum(["green", "yellow", "red"]),
    flaky: z.boolean().optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();

export type InfraGate = z.infer<typeof infraGateSchema>;
export type InfraReport = { gates: InfraGate[] };

/** A pack gate: the runnable command plus the status the infra turn observed. */
export interface PackGate {
  id: string;
  command: string;
  speed?: InfraGate["speed"];
  status?: InfraGate["status"];
  flaky?: boolean;
  notes?: string;
}

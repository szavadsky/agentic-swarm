/** The infra turn's report shape: the gates it discovered, their status and any incident verdict. */

import { z } from "zod";
import type { CheckResult } from "../core/checks/types.js";
import type { InfraCause } from "../harness/types.js";

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

const infraIncidentFixSchema = z
  .object({
    layer: z.enum(["repo", "factory", "run"]),
    path: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

const infraIncidentHandlingSchema = z.enum([
  "retry",
  "ignore",
  "fallback",
  "stop-task-types",
  "stop",
  "escalate",
]);

export const infraIncidentSchema = z
  .object({
    verdict: z.enum(["infra", "red"]),
    fix: infraIncidentFixSchema.optional(),
    handling: infraIncidentHandlingSchema.optional(),
    taskTypes: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .superRefine((incident, ctx) => {
    if (incident.verdict === "infra" && incident.handling === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'incident.handling is required when verdict is "infra"',
        path: ["handling"],
      });
    }
    if (incident.verdict === "red" && incident.handling !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'incident.handling must be absent when verdict is "red"',
        path: ["handling"],
      });
    }
  });

export type InfraGate = z.infer<typeof infraGateSchema>;
type InfraIncident = z.infer<typeof infraIncidentSchema>;
export type InfraReport = {
  gates: InfraGate[];
  incident?: InfraIncident;
};

/** A pack gate: the runnable command plus the status the infra turn observed. */
export interface PackGate {
  id: string;
  command: string;
  speed?: InfraGate["speed"];
  status?: InfraGate["status"];
  flaky?: boolean;
  notes?: string;
}

/** Result of adjudicating persistent gate timeouts or cannot-start checks. */
export interface InfraAdjudicationResult {
  checks: CheckResult[];
  incident?: InfraIncident;
  infra?: { cause: InfraCause; details?: string };
  cancelled?: boolean;
}

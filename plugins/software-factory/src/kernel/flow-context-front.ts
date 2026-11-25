/**
 * The front's classification and packaging: `class.yaml`, the standalone-task
 * ask, and the front's turn target and session record.
 */
import fs from "node:fs";
import yaml from "yaml";
import { z } from "zod";
import { issueText } from "./findings.js";
import { bySeq } from "./flow-context-history.js";
import { boundaryTarget, type TurnTarget } from "./flow-context-targets.js";
import type { KernelRuntime, StepRecord, TaskFile } from "./types.js";

const CLASS_FILE = "class.yaml";

export const classSchema = z
  .object({
    class: z.enum(["trivial", "task", "bigger"]),
    slug: z.string().min(1).optional(),
  })
  .strict();

export type FrontClass = z.infer<typeof classSchema>;

/** A class.yaml the launch refuses; runFront turns it into an infra result. */
export class FrontClassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontClassError";
  }
}

/** The goal's front classification; null when the front has not run yet. */
export function readFrontClass(runtime: KernelRuntime): FrontClass | null {
  const file = runtime.store.pathOf({ area: "goal", rel: CLASS_FILE });
  if (!fs.existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = yaml.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new FrontClassError(
      `class.yaml is not valid YAML: ${(err as Error).message}`,
    );
  }
  const parsed = classSchema.safeParse(raw);
  if (!parsed.success) {
    const findings = parsed.error.issues.map((issue) => issueText(issue));
    throw new FrontClassError(`class.yaml is invalid: ${findings.join("; ")}`);
  }
  if (parsed.data.class !== "bigger" && !parsed.data.slug) {
    throw new FrontClassError(
      `class.yaml class "${parsed.data.class}" needs a task slug`,
    );
  }
  return parsed.data;
}

/** The front's configured boundary target. */
export function frontTarget(runtime: KernelRuntime): TurnTarget {
  return boundaryTarget(runtime, "front");
}

export function lastFrontRecord(records: StepRecord[]): StepRecord | undefined {
  return records
    .filter((r) => r.step === "front" && r.actor === "agent" && r.endedAt)
    .sort(bySeq)
    .at(-1);
}

/** The class.yaml names this task when its class is not bigger and the slug matches. */
export function frontTaskClass(
  runtime: KernelRuntime,
  task: TaskFile,
): "trivial" | "task" | undefined {
  const cls = readFrontClass(runtime);
  if (!cls || cls.class === "bigger" || cls.slug !== task.slug)
    return undefined;
  return cls.class;
}

/** A task the front classified without an architect: class.yaml names its slug. */
export function isStandaloneTask(
  runtime: KernelRuntime,
  task: TaskFile,
): boolean {
  return frontTaskClass(runtime, task) !== undefined;
}

/**
 * The escalation ask for a standalone review, empty for architect-plan tasks.
 * Rendered as the reviewer's `upscope_ask` variable; the reviewer answers it
 * as `upscope: yes|no` alongside its verdict.
 */
export function standaloneUpscopeAsk(
  runtime: KernelRuntime,
  task: TaskFile,
): string {
  if (!isStandaloneTask(runtime, task)) return "";
  return (
    "This is a standalone task: no architect planned it. Is the real scope " +
    "substantially higher than the front's predicted area above, and does the " +
    "result require architecture input? Answer `upscope: yes` to park and " +
    "escalate the goal to bigger, or `upscope: no` to judge normally. Always " +
    "include your verdict; an upscope yes parks regardless of it."
  );
}

/** Rewrites the front class to bigger so the next launch runs the architect. */
export function escalateFrontClassToBigger(runtime: KernelRuntime): void {
  const file = runtime.store.pathOf({ area: "goal", rel: CLASS_FILE });
  fs.writeFileSync(file, yaml.stringify({ class: "bigger" }), "utf8");
}

/**
 * The front's record proves the front ran and names the iteration whose pack is
 * the task's briefing.
 */
export function frontPack(
  runtime: KernelRuntime,
  task: TaskFile,
  records: StepRecord[],
): string | undefined {
  if (!frontTaskClass(runtime, task)) return undefined;
  const front = lastFrontRecord(records);
  if (!front) return undefined;
  return runtime.store.iterations.path(front.iteration, "context-pack.md");
}

/**
 * The canary registry: which `harness+model` combinations have passed a canary
 * run. Rotation skips an unproven combination; a passing canary proves it and
 * a failed one leaves it unproven. The file lives beside the launch
 * directories in the goal's session store, next to `quota-pools.yaml`, so a
 * proof outlives the launch that recorded it and is shared across goals.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import { writeYamlAtomic } from "../core/records/io.js";
import type { GoalPaths } from "./types.js";

const CANARY_FILE = "canary-proven.yaml";

const provenFileSchema = z
  .object({
    proven: z.record(z.string(), z.object({ at: z.string().min(1) }).strict()),
  })
  .strict();

/** A `canary-proven.yaml` the session store cannot read. */
export class CanaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanaryError";
  }
}

/** The proven-combination registry beside the launch directories. */
export function canaryFilePath(paths: Pick<GoalPaths, "sessionsDir">): string {
  return path.join(paths.sessionsDir, CANARY_FILE);
}

/** Registry key for one combination, mirroring the quota pool key. */
export function canaryKey(harness: string, model: string): string {
  return `${harness}+${model}`;
}

/** The rotation entries of one alias that carry a passing canary record. */
export function provenRotation(
  rotate: readonly { harness: string; model: string }[] | undefined,
  proven: ReadonlySet<string>,
): { harness: string; model: string }[] | undefined {
  if (!rotate) return undefined;
  if (proven.size === 0) return rotate.map((entry) => ({ ...entry }));
  const kept = rotate.filter((entry) =>
    isProven(proven, canaryKey(entry.harness, entry.model)),
  );
  return kept.length > 0 ? kept : undefined;
}

/**
 * The proven combinations, keyed `harness+model`. A missing file is an empty
 * registry: the first canary of a combination has no history.
 */
export async function loadCanaryProven(
  paths: Pick<GoalPaths, "sessionsDir">,
): Promise<Set<string>> {
  const file = canaryFilePath(paths);
  let text: string;
  try {
    text = await fs.promises.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw err;
  }
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    throw new CanaryError(
      `${file} is not valid YAML: ${(err as Error).message}`,
    );
  }
  const parsed = provenFileSchema.safeParse(raw);
  if (!parsed.success) {
    const findings = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new CanaryError(`${file} is invalid: ${findings.join("; ")}`);
  }
  const proven = new Set<string>();
  for (const [key, entry] of Object.entries(parsed.data.proven)) {
    if (!Number.isFinite(Date.parse(entry.at))) {
      throw new CanaryError(
        `${file}: combination "${key}" has an unreadable at "${entry.at}"`,
      );
    }
    proven.add(key);
  }
  return proven;
}

/** True when the combination has a passing record; an unknown one is unproven. */
export function isProven(proven: ReadonlySet<string>, key: string): boolean {
  return proven.has(key);
}

/** Records a passing canary, keeping every earlier proof. */
export async function markCombinationProven(opts: {
  paths: Pick<GoalPaths, "sessionsDir">;
  proven: Set<string>;
  key: string;
  at?: string;
}): Promise<void> {
  const file = canaryFilePath(opts.paths);
  opts.proven.add(opts.key);
  const proven: Record<string, { at: string }> = {};
  for (const key of opts.proven) {
    proven[key] = { at: opts.at ?? new Date().toISOString() };
  }
  await writeYamlAtomic(file, { proven });
}

export interface CanaryVerdict {
  pass: boolean;
  /** Why the verdict failed, absent on pass. */
  reason?: string;
}

export type CanaryTurnRunner = (opts: {
  harnessId: string;
  modelId: string;
  effort?: string;
  kind: "trivial" | "task" | "bigger";
  cwd: string;
}) => Promise<CanaryVerdict>;

export interface CanaryRequest {
  harnessId: string;
  modelId: string;
  effort?: string;
  /** Runs the bigger canary goal, for architect legs. */
  bigger?: boolean;
  cwd: string;
}

/**
 * Runs one canary against the named combination through the injected turn
 * runner (the fake harness in tests, a real harness toolkit in production), in
 * an isolated directory that is never a goal checkout, so the run never
 * merges into the goal branch. A passing trivial goal and a standalone task
 * prove the combination for rotation; a failed run leaves it unproven, and
 * only a pass is recorded. Architect legs additionally run the bigger goal.
 */
export async function runCanary(
  request: CanaryRequest,
  runner: CanaryTurnRunner,
  proven: Set<string>,
  paths: Pick<GoalPaths, "sessionsDir">,
): Promise<CanaryVerdict> {
  const key = canaryKey(request.harnessId, request.modelId);
  const kinds: ("trivial" | "task" | "bigger")[] = request.bigger
    ? ["trivial", "task", "bigger"]
    : ["trivial", "task"];
  for (const kind of kinds) {
    const verdict = await runner({
      harnessId: request.harnessId,
      modelId: request.modelId,
      effort: request.effort,
      kind,
      cwd: request.cwd,
    });
    if (!verdict.pass) return verdict;
  }
  await markCombinationProven({ paths, proven, key });
  return { pass: true };
}

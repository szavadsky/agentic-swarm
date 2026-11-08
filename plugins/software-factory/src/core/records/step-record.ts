import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type {
  StepMetaArtifact,
  StepMetaStatus,
  StepUsage,
  ChecksResultArtifact,
} from "../artifacts.js";
import {
  writeTextAtomic,
  writeYamlAtomic,
  readYaml,
} from "./io.js";
import { areFilesCommitted } from "../git/commit.js";

/**
 * Parses directory name into seq, name, attempt.
 */
export function parseStepRecordDirName(
  dirName: string
): { seq: number; name: string; attempt: number } | null {
  const match = dirName.match(/^(\d{3})-([a-zA-Z0-9_.-]+)-a(\d+)$/);
  if (!match) return null;
  return {
    seq: parseInt(match[1]!, 10),
    name: match[2]!,
    attempt: parseInt(match[3]!, 10),
  };
}

export interface StartStepRecordParams {
  recordDir: string;
  meta: Omit<StepMetaArtifact, "status" | "startedAt"> & {
    startedAt?: string;
  };
  inputPrompt: string;
}

/**
 * Starts a step record: creates recordDir, writes input.md and meta.yaml with status: "started".
 * Invariant §6.3.1: input.md + meta(status: started) committed before launch.
 */
export async function startStepRecord(
  params: StartStepRecordParams
): Promise<StepMetaArtifact> {
  const { recordDir, meta, inputPrompt } = params;
  await fs.promises.mkdir(recordDir, { recursive: true });

  const fullMeta: StepMetaArtifact = {
    ...meta,
    status: "started",
    startedAt: meta.startedAt ?? new Date().toISOString(),
  };

  await writeTextAtomic(path.join(recordDir, "input.md"), inputPrompt);
  await writeYamlAtomic(path.join(recordDir, "meta.yaml"), fullMeta);

  return fullMeta;
}

export interface FinishStepRecordParams {
  recordDir: string;
  status: StepMetaStatus;
  endedAt?: string;
  usage?: StepUsage;
  error?: string;
  repairedFrom?: string;
  traceRef?: string;
  outputData?: unknown;
  checksData?: ChecksResultArtifact;
}

/**
 * Finishes a step record: transitions meta.yaml from started to final status,
 * writes output.yaml and checks.yaml atomically.
 * Invariant §6.3.2: A step is done iff output.yaml validates and is committed with final meta.
 */
export async function finishStepRecord(
  params: FinishStepRecordParams
): Promise<StepMetaArtifact> {
  const { recordDir, status, endedAt, usage, error, repairedFrom, traceRef, outputData, checksData } =
    params;

  const metaPath = path.join(recordDir, "meta.yaml");
  let existingMeta: StepMetaArtifact;

  if (fs.existsSync(metaPath)) {
    existingMeta = await readYaml<StepMetaArtifact>(metaPath);
  } else {
    throw new Error(`Cannot finish step record: meta.yaml not found in "${recordDir}"`);
  }

  const updatedMeta: StepMetaArtifact = {
    ...existingMeta,
    status,
    endedAt: endedAt ?? new Date().toISOString(),
    usage: usage ?? existingMeta.usage,
    error: status === "ok" ? undefined : (error ?? existingMeta.error),
    repairedFrom: repairedFrom ?? existingMeta.repairedFrom,
    traceRef: traceRef ?? existingMeta.traceRef,
  };

  // Write output.yaml if outputData is provided
  if (outputData !== undefined) {
    await writeYamlAtomic(path.join(recordDir, "output.yaml"), outputData);
  }

  // Write checks.yaml if checksData is provided
  if (checksData !== undefined) {
    await writeYamlAtomic(path.join(recordDir, "checks.yaml"), checksData);
  }

  // Update meta.yaml with final status
  await writeYamlAtomic(metaPath, updatedMeta);

  return updatedMeta;
}

export interface OkCommittedStepRecord {
  seq: number;
  name: string;
  attempt: number;
  dirName: string;
  recordDir: string;
  meta: StepMetaArtifact;
  output?: unknown;
}

/**
 * Derives done-ness from an ok committed record for that exact step name (§8.4).
 * Reuses its output if present.
 */
export async function findOkCommittedRecord(
  recordsDir: string,
  stepId: string,
  taskWt?: string
): Promise<OkCommittedStepRecord | null> {
  if (!fs.existsSync(recordsDir)) return null;
  try {
    const entries = await fs.promises.readdir(recordsDir);
    const matching = entries
      .map(parseStepRecordDirName)
      .filter((p): p is { seq: number; name: string; attempt: number } => p !== null && p.name === stepId)
      .sort((a, b) => b.seq - a.seq || b.attempt - a.attempt);

    for (const m of matching) {
      const dirName = `${String(m.seq).padStart(3, "0")}-${stepId}-a${m.attempt}`;
      const recDir = path.join(recordsDir, dirName);
      const metaPath = path.join(recDir, "meta.yaml");
      if (!fs.existsSync(metaPath)) continue;

      let meta: StepMetaArtifact | undefined;
      try {
        meta = await readYaml<StepMetaArtifact>(metaPath);
      } catch {}
      if (!meta || meta.status !== "ok") continue;

      const filesToCheck = [metaPath];
      const outputPath = path.join(recDir, "output.yaml");
      if (fs.existsSync(outputPath)) {
        filesToCheck.push(outputPath);
      }

      if (taskWt) {
        const committed = await areFilesCommitted(taskWt, filesToCheck);
        if (!committed) continue;
      }

      let output: unknown = undefined;
      if (fs.existsSync(outputPath)) {
        try {
          output = await readYaml(outputPath);
        } catch {}
      }

      return {
        seq: m.seq,
        name: m.name,
        attempt: m.attempt,
        dirName,
        recordDir: recDir,
        meta,
        output,
      };
    }
  } catch {}
  return null;
}

/**
 * Derives the attempt number for an orchestration step:
 * previous attempts of that step name + 1 (interrupted not counted until maxInterruptions,
 * consistent with item steps).
 */
export function getNextStepAttempt(
  recordsDir: string,
  stepId: string,
  maxInterruptions = 3
): number {
  if (!fs.existsSync(recordsDir)) return 1;
  try {
    const entries = fs.readdirSync(recordsDir);
    const matching = entries
      .map(parseStepRecordDirName)
      .filter((p): p is { seq: number; name: string; attempt: number } => p !== null && p.name === stepId)
      .sort((a, b) => b.seq - a.seq || b.attempt - a.attempt);

    if (matching.length === 0) return 1;
    const latest = matching[0]!;
    const metaPath = path.join(
      recordsDir,
      `${String(latest.seq).padStart(3, "0")}-${stepId}-a${latest.attempt}`,
      "meta.yaml"
    );
    let status: string | undefined;
    if (fs.existsSync(metaPath)) {
      try {
        const content = fs.readFileSync(metaPath, "utf8");
        const meta = yaml.parse(content) as any;
        status = meta?.status;
      } catch {}
    }

    if (status === "interrupted" || status === "started") {
      let interruptions = 0;
      for (const m of matching) {
        const mPath = path.join(
          recordsDir,
          `${String(m.seq).padStart(3, "0")}-${stepId}-a${m.attempt}`,
          "meta.yaml"
        );
        try {
          const content = fs.readFileSync(mPath, "utf8");
          const meta = yaml.parse(content) as any;
          if (meta?.status === "interrupted" || meta?.status === "started") {
            interruptions++;
          }
        } catch {}
      }
      if (interruptions < maxInterruptions) {
        return latest.attempt;
      } else {
        return latest.attempt + 1;
      }
    } else if (status === "error") {
      return latest.attempt;
    } else if (status === "ok") {
      return latest.attempt;
    } else {
      // e.g. "rejected"
      return latest.attempt + 1;
    }
  } catch {
    return 1;
  }
}

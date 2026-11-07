import fs from "node:fs";
import path from "node:path";
import type {
  StepMetaArtifact,
  StepMetaStatus,
  StepUsage,
  ChecksResultArtifact,
} from "../artifacts.js";
import {
  writeTextAtomic,
  writeYamlAtomic,
  readText,
  readYaml,
} from "./io.js";

/**
 * Formats directory name for a step record: `{seq:03}-{name}-a{n}` (e.g. `001-develop-a1`)
 */
export function formatStepRecordDirName(
  seq: number,
  name: string,
  attempt: number
): string {
  const paddedSeq = String(seq).padStart(3, "0");
  return `${paddedSeq}-${name}-a${attempt}`;
}

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
  const { recordDir, status, endedAt, usage, error, outputData, checksData } =
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
    error: error ?? existingMeta.error,
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

export interface StepRecordData {
  meta: StepMetaArtifact;
  input: string;
  output?: unknown;
  checks?: ChecksResultArtifact;
}

/**
 * Reads a committed step record from disk.
 */
export async function readStepRecord(recordDir: string): Promise<StepRecordData> {
  const meta = await readYaml<StepMetaArtifact>(path.join(recordDir, "meta.yaml"));
  const input = await readText(path.join(recordDir, "input.md"));

  let output: unknown;
  const outputPath = path.join(recordDir, "output.yaml");
  if (fs.existsSync(outputPath)) {
    output = await readYaml(outputPath);
  }

  let checks: ChecksResultArtifact | undefined;
  const checksPath = path.join(recordDir, "checks.yaml");
  if (fs.existsSync(checksPath)) {
    checks = await readYaml<ChecksResultArtifact>(checksPath);
  }

  return { meta, input, output, checks };
}

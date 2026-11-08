import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { Harness } from "../harness/types.js";
import type {
  SteerItemArtifact,
  SteerClassificationArtifact,
} from "./artifacts.js";
import type { PromptLibrary } from "./prompts.js";
import { writeYamlAtomic, readYaml } from "./records/io.js";
import { defaultSchemaCache } from "./records/schema-cache.js";

/**
 * Lists pending operator messages from the root task worktree mailbox (§8.8).
 * Reads `steer/fromuserpending/*` and returns ordered pending messages.
 */
export async function listPending(
  rootWt: string,
  taskDir: string
): Promise<{ file: string; text: string }[]> {
  const pendingDir = path.join(rootWt, taskDir, "steer", "fromuserpending");
  if (!fs.existsSync(pendingDir)) {
    return [];
  }

  const entries = await fs.promises.readdir(pendingDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  const results: { file: string; text: string }[] = [];
  for (const file of files) {
    const filePath = path.join(pendingDir, file.name);
    const text = await fs.promises.readFile(filePath, "utf8");
    results.push({ file: file.name, text });
  }

  return results;
}

/**
 * Computes source and destination relative paths for transitioning a pending
 * message to the `fromusertaken` directory (§8.8).
 */
export function takenPaths(
  file: string,
  taskDir: string
): { from: string; to: string } {
  const base = path.basename(file);
  const cleanTaskDir = taskDir ? taskDir.replace(/\\/g, "/") : ".";

  return {
    from: path.posix.join(cleanTaskDir, "steer", "fromuserpending", base),
    to: path.posix.join(cleanTaskDir, "steer", "fromusertaken", base),
  };
}

/**
 * Writes a question to `steer/tousertoreview/{id}.yaml` for operator decision (§8.8).
 * Generates a stable, deterministic ID derived from ref, question, and disposition.
 */
export async function writeQuestion(
  rootWt: string,
  taskDir: string,
  q: Omit<SteerItemArtifact, "id" | "status"> & { id?: string }
): Promise<SteerItemArtifact> {
  const hash = crypto
    .createHash("sha256")
    .update(`${q.ref}:${q.question}:${q.disposition}`)
    .digest("hex")
    .slice(0, 10);

  const cleanRef = q.ref.replace(/[^a-z0-9_-]/gi, "-");
  const id = q.id ?? `q-${cleanRef}-${hash}`;

  const item: SteerItemArtifact = {
    id,
    ref: q.ref,
    disposition: q.disposition,
    question: q.question,
    ...(q.draftDecision ? { draftDecision: q.draftDecision } : {}),
    ...(q.blocks && q.blocks.length > 0 ? { blocks: q.blocks } : {}),
    status: "open",
    createdAt: q.createdAt ?? new Date().toISOString(),
    ...(q.answeredAt ? { answeredAt: q.answeredAt } : {}),
    ...(q.answer ? { answer: q.answer } : {}),
  };

  const outDir = path.isAbsolute(taskDir)
    ? path.join(taskDir, "steer", "tousertoreview")
    : path.join(rootWt, taskDir, "steer", "tousertoreview");
  await fs.promises.mkdir(outDir, { recursive: true });

  const targetPath = path.join(outDir, `${id}.yaml`);
  if (fs.existsSync(targetPath)) {
    // A re-run step raising the same question must not clobber the operator's answer.
    try {
      const existing = yaml.parse(
        await fs.promises.readFile(targetPath, "utf8")
      ) as SteerItemArtifact;
      return existing;
    } catch {
      // ignore parse failure on existing
    }
  }
  await writeYamlAtomic(targetPath, item);

  return item;
}

/**
 * Returns true when an open mailbox question blocks `target` (an item slug or
 * `"task"`) (§8.7). Explicit `blocks` wins; without it a question blocks its
 * own ref. `human-awareness` is digest-only and never blocks.
 */
export function questionBlocks(q: SteerItemArtifact, target: string): boolean {
  if (q.status !== "open" || q.disposition === "human-awareness") return false;
  if (Array.isArray(q.blocks)) return q.blocks.includes(target);
  if (q.ref === target || q.ref.endsWith(`/${target}`)) return true;
  return target === "task" && q.ref === "plan";
}

/**
 * True when an open question in the task mailbox blocks the task itself
 * (§8.7). The plan step checks this after routing ADRs so a blocking decision
 * halts the run (exit 10) instead of running the remaining waves.
 */
export async function hasOpenTaskBlockingQuestion(taskDir: string): Promise<boolean> {
  const dir = path.join(taskDir, "steer", "tousertoreview");
  if (!fs.existsSync(dir)) return false;
  const names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith(".yaml"));
  for (const name of names) {
    const qPath = path.join(dir, name);
    try {
      const q = await readYaml<SteerItemArtifact>(qPath);
      if (q && questionBlocks(q, "task")) return true;
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw new Error(`Corrupt steer question file at ${qPath}: ${err?.message ?? err}`);
      }
    }
  }
  return false;
}

/**
 * Classifies an incoming pending message via `harness.complete` using the
 * `steer-classify` system prompt and `steer-classification` schema (§8.8).
 */
export async function classify(
  harness: Harness,
  pending: { file: string; text: string },
  ctx: {
    openQuestions: SteerItemArtifact[];
    role: string;
    models: string[];
    prompts: PromptLibrary;
  }
): Promise<SteerClassificationArtifact> {
  const system = ctx.prompts.render("system/steer-classify", {});

  let prompt = `Pending operator message file: ${pending.file}\nContent:\n${pending.text}\n`;
  if (ctx.openQuestions && ctx.openQuestions.length > 0) {
    prompt += `\nCurrently Open Questions in steer/tousertoreview/:\n`;
    for (const q of ctx.openQuestions) {
      prompt += `- ID: ${q.id} (Ref: ${q.ref}, Status: ${q.status})\n  Question: ${q.question}\n`;
      if (q.draftDecision) {
        prompt += `  Draft Decision: ${q.draftDecision}\n`;
      }
    }
  }

  const validator = defaultSchemaCache.getValidator("steer-classification");
  const schema = (validator.schema ?? {}) as Record<string, unknown>;

  const raw = await harness.complete({
    role: ctx.role,
    models: ctx.models,
    system,
    prompt,
    schema,
  });

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        parsed = yaml.parse(raw);
      } catch {
        throw new Error(
          `Failed to parse classification output from harness: ${raw}`
        );
      }
    }
  }

  const valid = validator(parsed);
  if (!valid && validator.errors) {
    const errorDetails = validator.errors
      .map((e) => `${e.instancePath || "/"}: ${e.message}`)
      .join(", ");
    throw new Error(
      `Classification result failed schema validation: ${errorDetails}`
    );
  }

  return parsed as SteerClassificationArtifact;
}

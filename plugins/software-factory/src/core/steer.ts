import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { writeYamlAtomic } from "./records/io.js";

/** An operator question persisted under `steer/tousertoreview/`. */
export interface SteerQuestion {
  id: string;
  ref: string;
  disposition: string;
  question: string;
  draftDecision?: string;
  blocks?: string[];
  status: "open" | "answered" | "dismissed";
  createdAt: string;
  answeredAt?: string;
  answer?: string;
}

/**
 * Lists pending operator messages from the task mailbox.
 * Reads `steer/fromuserpending/*` and returns them in filename order.
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

/** Computes the source and destination relative paths for a taken message. */
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
 * Writes a question to `steer/tousertoreview/{id}.yaml` for operator decision.
 * The id is stable for the same ref/question/disposition, and an existing file
 * is never clobbered: a re-run step must not erase the operator's answer.
 */
export async function writeQuestion(
  rootWt: string,
  taskDir: string,
  q: Omit<SteerQuestion, "id" | "status" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
): Promise<SteerQuestion> {
  const hash = crypto
    .createHash("sha256")
    .update(`${q.ref}:${q.question}:${q.disposition}`)
    .digest("hex")
    .slice(0, 10);

  const cleanRef = q.ref.replace(/[^a-z0-9_-]/gi, "-");
  const id = q.id ?? `q-${cleanRef}-${hash}`;

  const item: SteerQuestion = {
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
    try {
      return yaml.parse(
        await fs.promises.readFile(targetPath, "utf8")
      ) as SteerQuestion;
    } catch {
      // Fall through and rewrite a corrupt question below.
    }
  }
  await writeYamlAtomic(targetPath, item);

  return item;
}

/**
 * True when an open mailbox question blocks `target` (an item slug or
 * `"task"`). Explicit `blocks` wins; without it a question blocks its own ref.
 * `human-awareness` is digest-only and never blocks.
 */
export function questionBlocks(q: SteerQuestion, target: string): boolean {
  if (q.status !== "open" || q.disposition === "human-awareness") return false;
  if (Array.isArray(q.blocks)) return q.blocks.includes(target);
  return q.ref === target;
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { Harness, OnModelFallback } from "../harness/types.js";
import type {
  SteerItemArtifact,
  SteerClassificationArtifact,
  PipelineConfig,
} from "./artifacts.js";
import type { PromptLibrary } from "./prompts.js";
import { writeYamlAtomic, readYaml } from "./records/io.js";
import { defaultSchemaCache } from "./records/schema-cache.js";
import { resolveRole } from "./config/roles.js";
import { appendJournal, readJournal } from "./journal.js";
import { git } from "./git/exec.js";
import { KeyedMutex } from "./mutex.js";
import type { Repo } from "./git/repo.js";

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
    onModelFallback?: OnModelFallback;
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
    onModelFallback: ctx.onModelFallback,
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

/**
 * True when an operator answer message reads as a bare acknowledgement
 * ("ack", "ok", "noted", "thanks", ...) rather than substantive guidance.
 * Short messages (< 200 chars) matching ack phrasing reconcile open
 * awareness questions to answered.
 */
export function isAwarenessAck(text: string): boolean {
  const t = (text ?? "").trim().toLowerCase();
  if (!t || t.length > 200) return false;
  return /^(ack(\.|nowledged?)?|ok(ay)?|noted|thanks?(\s+you)?|got\s+it|understood|confirmed?|lgtm|fine|will\s+do)\b[\s.!]*$/i.test(t);
}

const steerMailboxMutexes = new KeyedMutex();

export interface ProcessSteeringOptions {
  taskWt: string;
  taskDir: string;
  harness: Harness;
  pipeline: PipelineConfig;
  prompts: PromptLibrary | any;
  repo: Repo;
  task: string;
}

export interface ProcessSteeringResult {
  stopRequested: boolean;
  processedCount: number;
  /** Messages skipped (classification/IO error, left pending for retry). */
  skippedCount: number;
}

/**
 * Processes steering mailbox single-flight (§8.8, Finding 17).
 * Reads pending messages from steer/fromuserpending/*, classifies via @simpler,
 * and atomically commits to the task worktree under repo.writeLock.
 */
export async function processSteeringMailbox(
  opts: ProcessSteeringOptions
): Promise<ProcessSteeringResult> {
  const { taskWt, taskDir, harness, pipeline, prompts, repo, task } = opts;
  const mutexKey = path.resolve(taskDir);

  return steerMailboxMutexes.runExclusive(mutexKey, async () => {
    const relTaskDir = path.relative(taskWt, taskDir);
    const pending = await listPending(taskWt, relTaskDir);
    if (pending.length === 0) {
      return { stopRequested: false, processedCount: 0, skippedCount: 0 };
    }

    // Load currently open questions for context
    const openQuestions: SteerItemArtifact[] = [];
    const touserDir = path.join(taskDir, "steer", "tousertoreview");
    if (fs.existsSync(touserDir)) {
      const qFiles = await fs.promises.readdir(touserDir);
      for (const qf of qFiles) {
        if (!qf.endsWith(".yaml")) continue;
        const qPath = path.join(touserDir, qf);
        try {
          const q = await readYaml<SteerItemArtifact>(qPath);
          if (q && q.status === "open") openQuestions.push(q);
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            throw new Error(`Corrupt steer question at ${qPath}: ${err?.message ?? err}`);
          }
        }
      }
    }

    const simplerRole = resolveRole("simpler", pipeline.models.roles);
    let stopRequested = false;
    let processedCount = 0;
    let skippedCount = 0;

    for (const item of pending) {
      let classification: SteerClassificationArtifact;
      try {
        classification = await classify(harness, item, {
          openQuestions,
          role: simplerRole.role,
          models: simplerRole.models,
          prompts,
          onModelFallback: async ({ from, to, reason }) => {
            try {
              await appendJournal(taskDir, {
                type: "harness_model_fallback",
                task,
                step: "steer-classify",
                from,
                to,
                reason,
              });
            } catch {}
          },
        });
      } catch (err: any) {
        // Classification failure: journal and skip (message stays pending for
        // retry) rather than aborting the whole poll or failing silently.
        skippedCount++;
        const errMsg = err?.message ?? String(err);
        try {
          await appendJournal(taskDir, {
            type: "steer_poll_error",
            file: item.file,
            error: errMsg,
          });
        } catch {}
        // Steer dead-letter (D3): after 5 consecutive steer_poll_errors on
        // the same file, journal steer_poll_dead so operator deafness is
        // never silent (surfaced in `factory status`).
        try {
          const events = await readJournal(taskDir);
          let consecutive = 0;
          for (let i = events.length - 1; i >= 0; i--) {
            const e = events[i] as { type?: string; file?: string };
            if (e.type === "steer_poll_dead" && e.file === item.file) break;
            if (e.type === "steer_processed" && (e as { file?: string }).file === item.file) break;
            if (e.type === "steer_poll_error" && e.file === item.file) {
              consecutive++;
              continue;
            }
          }
          if (consecutive >= 5) {
            await appendJournal(taskDir, {
              type: "steer_poll_dead",
              file: item.file,
              errors: consecutive,
            });
          }
        } catch {}
        continue;
      }

      const { from, to } = takenPaths(item.file, relTaskDir);
      const absFrom = path.join(taskWt, from);
      const absTo = path.join(taskWt, to);
      await fs.promises.mkdir(path.dirname(absTo), { recursive: true });

      // Atomic commit for mailbox processing (§8.8, Finding 17)
      // Serialized through repo.writeLock to avoid racing item commits
      await repo.writeLock.runExclusive(async () => {
        const env = repo.identityEnv();

        // Stage from first so git mv works even for newly dropped untracked files
        await git(taskWt, ["add", "--", from], { env, allowFail: true });
        const mvRes = await git(taskWt, ["mv", "-f", from, to], { env, allowFail: true });
        if (mvRes.code !== 0 && fs.existsSync(absFrom)) {
          await fs.promises.rename(absFrom, absTo);
        }

        await writeYamlAtomic(`${absTo}.classification.yaml`, classification);

        if (classification.kind === "stop") {
          stopRequested = true;
        } else if (classification.kind === "answer") {
          // Answer matching questions exactly (Finding 16). Awareness
          // dispositions are informational (non-blocking); an ack-style answer
          // reconciles ALL open awareness questions to answered so they do
          // not linger open and re-noise the operator.
          const ackAwareness = isAwarenessAck(item.text);
          if (fs.existsSync(touserDir)) {
            const qFiles = await fs.promises.readdir(touserDir);
            for (const qf of qFiles) {
              if (!qf.endsWith(".yaml")) continue;
              const qPath = path.join(touserDir, qf);
              try {
                const q = await readYaml<SteerItemArtifact>(qPath);
                const matches = classification.refs.some(
                  (r) =>
                    q.ref === r ||
                    q.ref === `${task}/${r}` ||
                    q.id === r ||
                    (q.ref && r.endsWith(`/${q.ref}`))
                );
                if (q && q.status === "open" && (matches || (ackAwareness && q.disposition === "human-awareness"))) {
                  q.status = "answered";
                  q.answer = item.text;
                  q.answeredAt = new Date().toISOString();
                  await writeYamlAtomic(qPath, q);
                }
              } catch (err: any) {
                if (err?.code !== "ENOENT") {
                  throw new Error(`Corrupt steer question at ${qPath}: ${err?.message ?? err}`);
                }
              }
            }
          }
        }

        await git(taskWt, ["add", "-A"], { env, allowFail: true });
        const diffCheck = await git(taskWt, ["diff", "--cached", "--quiet"], {
          allowFail: true,
          env,
        });
        if (diffCheck.code !== 0) {
          await git(taskWt, ["commit", "-m", `factory: process steering message ${item.file}`], { env });
        }
      });

      await appendJournal(taskDir, {
        type: "steer_processed",
        file: item.file,
        classification,
      });

      processedCount++;
    }

    return { stopRequested, processedCount, skippedCount };
  });
}

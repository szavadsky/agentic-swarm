import fs from "node:fs";
import path from "node:path";
import type { ArtifactStore, Outcome } from "./types.js";

export interface Steer {
  id: string;
  /** File name inside mailbox/inbox. */
  file: string;
  /** Goal-relative path, for prompts and the context pack. */
  relPath: string;
  text: string;
}

/** Inbox files are user drops; sorted names keep the prompt deterministic. */
export async function scanInbox(store: ArtifactStore): Promise<Steer[]> {
  const dir = path.join(store.mailboxDir, "inbox");
  if (!fs.existsSync(dir)) return [];
  const names = (await fs.promises.readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
  const steers: Steer[] = [];
  for (const file of names) {
    const text = await fs.promises.readFile(path.join(dir, file), "utf8");
    steers.push({
      id: path.basename(file, path.extname(file)),
      file,
      relPath: `mailbox/inbox/${file}`,
      text,
    });
  }
  return steers;
}

export async function markProcessed(store: ArtifactStore, steer: Steer): Promise<void> {
  const from = path.join(store.mailboxDir, "inbox", steer.file);
  const to = path.join(store.mailboxDir, "processed", steer.file);
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.rename(from, to);
}

export async function writeOutbox(store: ArtifactStore, id: string, text: string): Promise<void> {
  const file = path.join(store.mailboxDir, "outbox", `steer-${id}.md`);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, `${text.trim()}\n`, "utf8");
}

/** `steer <id>: answer` entries in the architect's forward list. */
export function steerResponses(outcome: Outcome): Map<string, string> {
  const responses = new Map<string, string>();
  for (const item of outcome.forward) {
    const match = /^steer\s+([^:]+):\s*([\s\S]+)$/i.exec(item.trim());
    if (match?.[1] && match[2]) responses.set(match[1].trim(), match[2].trim());
  }
  return responses;
}

export function formatSteers(steers: Steer[]): string {
  if (steers.length === 0) return "none";
  return steers
    .map((s) => `- ${s.id} (${s.relPath}): ${s.text.trim().split(/\r?\n/)[0] ?? ""}`)
    .join("\n");
}

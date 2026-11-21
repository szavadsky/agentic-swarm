/** Steer parsing, inbox scanning, posting and archive. */

import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import yaml from "yaml";
import { z } from "zod";
import type { ArtifactStore } from "../types.js";
import type { ScanOptions, Steer } from "./types.js";

const DEFAULT_SETTLE_MS = 50;
export const YAML_HOLD = /\.ya?ml$/i;

/** Hold-file shape the PM writes: `{ slugs: string[], goal: boolean }`, extras ignored. */
export const holdFileSchema = z.object({
  slugs: z.array(z.string()),
  goal: z.boolean(),
});

export function contentHash(text: string): string {
  return createHash("sha1")
    .update(text.replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
}

/** Leading `---` block and the text after it; a file without one is all text. */
const STEER_FRONTMATTER =
  /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

/**
 * A steer is free text; its only script-level metadata is the urgency flag in
 * optional leading frontmatter. Malformed YAML is not metadata: the file is
 * read as plain text so a bad header can never wedge the inbox.
 */
function parseSteerText(raw: string): { urgent: boolean; text: string } {
  const match = STEER_FRONTMATTER.exec(raw);
  if (!match) return { urgent: false, text: raw };
  let meta: unknown;
  try {
    meta = yaml.parse(match[1] ?? "");
  } catch {
    return { urgent: false, text: raw };
  }
  // Frontmatter must carry a recognized key: prose can parse as a YAML mapping
  // (`Note: take your time.`), and stripping it would silently drop the line.
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    return { urgent: false, text: raw };
  }
  const urgent = (meta as { urgent?: unknown }).urgent;
  if (typeof urgent !== "boolean") return { urgent: false, text: raw };
  return { urgent, text: match[2] ?? "" };
}

function hashSuffix(hash: string): string {
  return hash.slice(0, 8);
}

export function archiveName(file: string, hash: string): string {
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  return `${stem}.${hashSuffix(hash)}${ext}`;
}

/**
 * File names already spent. Identity is the file name, not its text: dropping
 * the same text under a new name is a second steer that must be answered.
 */
async function processedNames(store: ArtifactStore): Promise<Set<string>> {
  return new Set(await store.mailbox.files("processed"));
}

/**
 * Files appearing directly in the inbox may belong to a naive writer that is
 * still writing. Nothing on the filesystem marks a write finished, so a size
 * that holds across one settle interval is the reader-side contract. Correct
 * writers (`postSteer`) use tmp + rename and pass at once.
 */
async function stableInboxNames(
  store: ArtifactStore,
  settleMs: number,
): Promise<string[]> {
  const first = await store.mailbox.sizes("inbox");
  if (first.size === 0 || settleMs <= 0) return [...first.keys()];
  await sleep(settleMs);
  const second = await store.mailbox.sizes("inbox");
  return [...first.entries()]
    .filter(([name, size]) => second.get(name) === size)
    .map(([name]) => name);
}

/** Inbox files are user drops; a file still growing is left for the next boundary. */
export async function scanInbox(
  store: ArtifactStore,
  opts: ScanOptions = {},
): Promise<Steer[]> {
  const names = await stableInboxNames(
    store,
    opts.settleMs ?? DEFAULT_SETTLE_MS,
  );
  if (names.length === 0) return [];
  const seen = await processedNames(store);
  const steers: Steer[] = [];
  for (const file of names) {
    const text = await store.mailbox.read("inbox", file);
    if (text === null) continue;
    const hash = contentHash(text);
    const parsed = parseSteerText(text);
    const steer: Steer = {
      id: path.basename(file, path.extname(file)),
      file,
      relPath: store.mailbox.rel("inbox", file),
      text: parsed.text,
      hash,
      urgent: parsed.urgent,
    };
    if (seen.has(file)) {
      // The same file name was already processed: a replay, not a new steer.
      await archiveDuplicate(store, steer);
      continue;
    }
    steers.push(steer);
  }
  return steers;
}

/**
 * Writes a steer into the inbox the way every writer must: a private file on
 * the same filesystem, then rename. Readers never see a partial file.
 */
export async function postSteer(
  store: ArtifactStore,
  id: string,
  text: string,
): Promise<string> {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new Error(`steer id "${id}" must be a safe file name`);
  }
  const content = `${text.trim()}\n`;
  const hash = contentHash(content);
  let name = `${id}.md`;
  const existing = await store.mailbox.read("inbox", name);
  if (existing !== null) {
    if (contentHash(existing) === hash) {
      return store.mailbox.rel("inbox", name);
    }
    name = archiveName(name, hash);
  }
  await store.mailbox.publish(name, content);
  return store.mailbox.rel("inbox", name);
}

async function archiveDuplicate(
  store: ArtifactStore,
  steer: Steer,
): Promise<void> {
  await store.mailbox.move(
    "inbox",
    steer.file,
    "processed",
    archiveName(steer.file, steer.hash),
  );
}

/**
 * Moves a claimed steer to processed. Replaying a crash that already moved it
 * is a no-op; a name collision from a different content keeps both files.
 */
export async function markProcessed(
  store: ArtifactStore,
  steer: Steer,
): Promise<void> {
  const existing = await store.mailbox.read("processed", steer.file);
  if (existing !== null && contentHash(existing) === steer.hash) {
    await store.mailbox.remove("inbox", steer.file);
    return;
  }
  const target =
    existing === null ? steer.file : archiveName(steer.file, steer.hash);
  await store.mailbox.move("inbox", steer.file, "processed", target);
}

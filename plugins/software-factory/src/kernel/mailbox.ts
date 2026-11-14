import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import yaml from "yaml";
import { writeTextAtomic } from "../core/records/io.js";
import type { ArtifactStore, Outcome } from "./types.js";

export interface Steer {
  id: string;
  /** File name inside mailbox/inbox. */
  file: string;
  /** Goal-relative path, for prompts and the context pack. */
  relPath: string;
  text: string;
  /** Content hash: a replayed drop is the same steer, never a second one. */
  hash: string;
}

export interface ScanOptions {
  /** How long a file's size must hold still before it is claimed. */
  settleMs?: number;
}

/** What the PM's steer turn decided one steer blocks. */
export interface Hold {
  steer: string;
  slugs: string[];
  goal: boolean;
}

const DEFAULT_SETTLE_MS = 50;
const TMP_DIR = ".tmp";
const YAML_HOLD = /\.ya?ml$/i;

const holdFileSchema = z.object({
  slugs: z.array(z.string()),
  goal: z.boolean(),
});

function contentHash(text: string): string {
  return createHash("sha1").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function hashSuffix(hash: string): string {
  return hash.slice(0, 8);
}

function archiveName(file: string, hash: string): string {
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  return `${stem}.${hashSuffix(hash)}${ext}`;
}

async function processedHashes(store: ArtifactStore): Promise<Set<string>> {
  const dir = path.join(store.mailboxDir, "processed");
  const hashes = new Set<string>();
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return hashes;
    throw err;
  }
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const file = path.join(dir, name);
    try {
      if (!(await fs.promises.stat(file)).isFile()) continue;
      hashes.add(contentHash(await fs.promises.readFile(file, "utf8")));
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }
  }
  return hashes;
}

/**
 * Files appearing directly in the inbox may belong to a naive writer that is
 * still writing. Nothing on the filesystem marks a write finished, so a size
 * that holds across one settle interval is the reader-side contract. Correct
 * writers (`postSteer`) use tmp + rename and pass at once.
 */
async function stableInboxNames(dir: string, settleMs: number): Promise<string[]> {
  const names = async (): Promise<Map<string, number>> => {
    const out = new Map<string, number>();
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isENOENT(err)) return out;
      throw err;
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      try {
        out.set(entry.name, (await fs.promises.stat(path.join(dir, entry.name))).size);
      } catch (err) {
        if (!isENOENT(err)) throw err;
      }
    }
    return out;
  };

  const first = await names();
  if (first.size === 0 || settleMs <= 0) return [...first.keys()].sort();
  await sleep(settleMs);
  const second = await names();
  return [...first.entries()]
    .filter(([name, size]) => second.get(name) === size)
    .map(([name]) => name)
    .sort();
}

/** Inbox files are user drops; a file still growing is left for the next boundary. */
export async function scanInbox(store: ArtifactStore, opts: ScanOptions = {}): Promise<Steer[]> {
  const inbox = path.join(store.mailboxDir, "inbox");
  const names = await stableInboxNames(inbox, opts.settleMs ?? DEFAULT_SETTLE_MS);
  if (names.length === 0) return [];
  const seen = await processedHashes(store);
  const steers: Steer[] = [];
  for (const file of names) {
    const full = path.join(inbox, file);
    let text: string;
    try {
      text = await fs.promises.readFile(full, "utf8");
    } catch (err) {
      if (isENOENT(err)) continue;
      throw err;
    }
    const hash = contentHash(text);
    const steer: Steer = {
      id: path.basename(file, path.extname(file)),
      file,
      relPath: `mailbox/inbox/${file}`,
      text,
      hash,
    };
    if (seen.has(hash)) {
      // A duplicate content hash is a replay, not a new steer: archive it silently.
      await archiveDuplicate(store, steer);
      continue;
    }
    seen.add(hash);
    steers.push(steer);
  }
  return steers;
}

/**
 * Writes a steer into the inbox the way every writer must: a private file on
 * the same filesystem, then rename. Readers never see a partial file.
 */
export async function postSteer(store: ArtifactStore, id: string, text: string): Promise<string> {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new Error(`steer id "${id}" must be a safe file name`);
  }
  const inbox = path.join(store.mailboxDir, "inbox");
  const tmp = path.join(store.mailboxDir, TMP_DIR);
  await fs.promises.mkdir(inbox, { recursive: true });
  await fs.promises.mkdir(tmp, { recursive: true });
  const temp = path.join(tmp, `${id}.${process.pid}.${Date.now()}.tmp`);
  const content = `${text.trim()}\n`;
  await fs.promises.writeFile(temp, content, "utf8");
  const hash = contentHash(content);
  let target = path.join(inbox, `${id}.md`);
  if (fs.existsSync(target)) {
    try {
      const existing = await fs.promises.readFile(target, "utf8");
      if (contentHash(existing) === hash) {
        await fs.promises.rm(temp, { force: true });
        return path.join("mailbox", "inbox", `${id}.md`);
      }
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }
    target = path.join(inbox, archiveName(`${id}.md`, hash));
  }
  await fs.promises.rename(temp, target);
  return path.join("mailbox", "inbox", path.basename(target));
}

async function archiveDuplicate(store: ArtifactStore, steer: Steer): Promise<void> {
  const dir = path.join(store.mailboxDir, "processed");
  await fs.promises.mkdir(dir, { recursive: true });
  const from = path.join(store.mailboxDir, "inbox", steer.file);
  const target = path.join(dir, archiveName(steer.file, steer.hash));
  try {
    await fs.promises.rename(from, target);
  } catch (err) {
    if (!isENOENT(err)) throw err;
  }
}

/**
 * Moves a claimed steer to processed. Replaying a crash that already moved it
 * is a no-op; a name collision from a different content keeps both files.
 */
export async function markProcessed(store: ArtifactStore, steer: Steer): Promise<void> {
  const dir = path.join(store.mailboxDir, "processed");
  await fs.promises.mkdir(dir, { recursive: true });
  const from = path.join(store.mailboxDir, "inbox", steer.file);
  const preferred = path.join(dir, steer.file);
  let target = preferred;
  if (fs.existsSync(preferred)) {
    try {
      const existing = await fs.promises.readFile(preferred, "utf8");
      if (contentHash(existing) === steer.hash) {
        await fs.promises.rm(from, { force: true });
        return;
      }
      target = path.join(dir, archiveName(steer.file, steer.hash));
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }
  }
  try {
    await fs.promises.rename(from, target);
  } catch (err) {
    if (!isENOENT(err)) throw err;
  }
}

/** Where the PM's steer turn writes one `<steer-id>.yaml` per structured steer. */
export function holdsDir(store: ArtifactStore): string {
  return path.join(store.mailboxDir, "holds");
}

/**
 * Reads the PM's hold decisions. A malformed hold is script input corruption,
 * not a steer: it fails loudly instead of silently letting held work merge.
 * Holds for steers the architect already processed are the caller's to ignore.
 */
export async function readHolds(store: ArtifactStore): Promise<Hold[]> {
  const dir = holdsDir(store);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }
  const holds: Hold[] = [];
  for (const name of names.sort()) {
    if (name.startsWith(".") || !YAML_HOLD.test(name)) continue;
    const file = path.join(dir, name);
    let raw: unknown;
    try {
      raw = yaml.parse(await fs.promises.readFile(file, "utf8"));
    } catch (err) {
      if (isENOENT(err)) continue;
      throw new Error(`hold file "${name}" is not valid YAML: ${(err as Error).message}`);
    }
    const parsed = holdFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`hold file "${name}" must be { slugs: string[], goal: boolean }`);
    }
    holds.push({ steer: path.basename(name, path.extname(name)), ...parsed.data });
  }
  return holds;
}

export async function writeOutbox(store: ArtifactStore, id: string, text: string): Promise<string> {
  const rel = path.join("mailbox", "outbox", `steer-${id}.md`);
  await writeTextAtomic(path.join(store.mailboxDir, "outbox", `steer-${id}.md`), `${text.trim()}\n`);
  return rel;
}

/** `steer <id>: answer` entries in the architect's forward list. */
export function steerResponses(outcome: Outcome): Map<string, string> {
  const responses = new Map<string, string>();
  for (const item of outcome.forward) {
    const match = /^steer\s+([^:\s]+):\s*([\s\S]+)$/i.exec(item.trim());
    if (match?.[1] && match[2]) responses.set(match[1].trim(), match[2].trim());
  }
  return responses;
}

export function formatSteers(steers: Steer[]): string {
  if (steers.length === 0) return "none";
  return steers
    .map((s) => {
      const first = s.text.trim().split(/\r?\n/)[0] ?? "";
      return `- ${s.id} (${s.relPath}): ${first}`;
    })
    .join("\n");
}

/** Full steer text for the PM's steer turn; the architect only needs the first line. */
export function formatSteerTurn(steers: Steer[]): string {
  if (steers.length === 0) return "none";
  return steers
    .map((s) => `- ${s.id} (${s.relPath}):\n${s.text.trim().replace(/^/gm, "  ")}`)
    .join("\n");
}
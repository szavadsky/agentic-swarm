import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import yaml from "yaml";
import { z } from "zod";
import { writeTextAtomic } from "../core/records/io.js";
import { scriptMeta } from "./record.js";
import type {
  ArtifactStore,
  Outcome,
  StepRecord,
  SteerRoute,
} from "./types.js";

export interface Steer {
  id: string;
  /** File name inside mailbox/inbox; the steer's identity. */
  file: string;
  /** Goal-relative path, for prompts and the context pack. */
  relPath: string;
  text: string;
  /** Content hash: archive suffix and settle-change detector, never the identity. */
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
/** Options for reading hold files: explicit iteration and known task slugs. */
export interface ReadHoldsOptions {
  /** Iteration the caller runs in; quarantine records land here, not on the max record. */
  iteration?: number;
  /** Task slugs the caller knows; a hold naming anything else is quarantined. */
  knownSlugs?: ReadonlySet<string> | readonly string[];
}

const DEFAULT_SETTLE_MS = 50;
const TMP_DIR = ".tmp";
const YAML_HOLD = /\.ya?ml$/i;

/** Hold-file shape the PM writes: `{ slugs: string[], goal: boolean }`, extras ignored. */
export const holdFileSchema = z.object({
  slugs: z.array(z.string()),
  goal: z.boolean(),
});

function contentHash(text: string): string {
  return createHash("sha1")
    .update(text.replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
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

/**
 * File names already spent. Identity is the file name, not its text: dropping
 * the same text under a new name is a second steer that must be answered.
 */
async function processedNames(store: ArtifactStore): Promise<Set<string>> {
  const dir = path.join(store.mailboxDir, "processed");
  const names = new Set<string>();
  let entries: string[];
  try {
    entries = await fs.promises.readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return names;
    throw err;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    try {
      if (!(await fs.promises.stat(path.join(dir, name))).isFile()) continue;
      names.add(name);
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }
  }
  return names;
}

/**
 * Files appearing directly in the inbox may belong to a naive writer that is
 * still writing. Nothing on the filesystem marks a write finished, so a size
 * that holds across one settle interval is the reader-side contract. Correct
 * writers (`postSteer`) use tmp + rename and pass at once.
 */
async function stableInboxNames(
  dir: string,
  settleMs: number,
): Promise<string[]> {
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
        out.set(
          entry.name,
          (await fs.promises.stat(path.join(dir, entry.name))).size,
        );
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
export async function scanInbox(
  store: ArtifactStore,
  opts: ScanOptions = {},
): Promise<Steer[]> {
  const inbox = path.join(store.mailboxDir, "inbox");
  const names = await stableInboxNames(
    inbox,
    opts.settleMs ?? DEFAULT_SETTLE_MS,
  );
  if (names.length === 0) return [];
  const seen = await processedNames(store);
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

async function archiveDuplicate(
  store: ArtifactStore,
  steer: Steer,
): Promise<void> {
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
export async function markProcessed(
  store: ArtifactStore,
  steer: Steer,
): Promise<void> {
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

/** Where unreadable hold files are parked so they stop deciding dispatch. */
export function quarantineDir(store: ArtifactStore): string {
  return path.join(store.mailboxDir, "quarantine");
}

/** The iteration the store is in: malformed files are found while it runs. */
async function currentIteration(store: ArtifactStore): Promise<number> {
  const records = await store.listRecords();
  return records.reduce((max, record) => Math.max(max, record.iteration), 1);
}

/**
 * Moves an unreadable hold out of the holds directory and records why. A hold
 * that cannot be read decides nothing; leaving it in place would stop every
 * launch, so the record is the report and dispatch continues.
 */
async function quarantineHold(
  store: ArtifactStore,
  name: string,
  text: string,
  problem: string,
  iteration: number,
): Promise<void> {
  const dir = quarantineDir(store);
  await fs.promises.mkdir(dir, { recursive: true });
  const preferred = path.join(dir, name);
  const target = fs.existsSync(preferred)
    ? path.join(dir, archiveName(name, contentHash(text)))
    : preferred;
  try {
    await fs.promises.rename(path.join(holdsDir(store), name), target);
  } catch (err) {
    if (!isENOENT(err)) throw err;
    return;
  }
  const rel = path.relative(store.goalDir, target);
  await store.appendRecord(scriptMeta(iteration, "hold-quarantine"), {
    ok: false,
    cause: `malformed hold "${name}" moved to ${rel}: ${problem}`,
  });
}

/**
 * Reads the PM's hold decisions. A malformed hold is quarantined with a record
 * instead of wedging every launch, and the valid holds beside it still apply.
 * A hold naming an unknown slug is quarantined the same way when the caller
 * passes its task slugs. Holds for steers the architect already processed are
 * the caller's to ignore.
 */
export async function readHolds(
  store: ArtifactStore,
  opts: ReadHoldsOptions = {},
): Promise<Hold[]> {
  const dir = holdsDir(store);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }
  const iteration = opts.iteration ?? (await currentIteration(store));
  const known =
    opts.knownSlugs === undefined ? undefined : new Set(opts.knownSlugs);
  const holds: Hold[] = [];
  for (const name of names.sort()) {
    if (name.startsWith(".") || !YAML_HOLD.test(name)) continue;
    const file = path.join(dir, name);
    let text: string;
    try {
      text = await fs.promises.readFile(file, "utf8");
    } catch (err) {
      if (isENOENT(err)) continue;
      throw err;
    }
    let parsed: Hold | undefined;
    let problem: string | undefined;
    try {
      const valid = holdFileSchema.safeParse(yaml.parse(text));
      if (valid.success) {
        parsed = {
          steer: path.basename(name, path.extname(name)),
          ...valid.data,
        };
      } else {
        problem = "must be { slugs: string[], goal: boolean }";
      }
    } catch (err) {
      problem = `not valid YAML: ${(err as Error).message}`;
    }
    if (parsed) {
      if (known !== undefined) {
        const unknown = parsed.slugs.filter((slug) => !known.has(slug));
        if (unknown.length > 0) {
          await quarantineHold(
            store,
            name,
            text,
            `unknown slug(s): ${unknown.join(", ")}`,
            iteration,
          );
          continue;
        }
      }
      holds.push(parsed);
      continue;
    }
    await quarantineHold(store, name, text, problem ?? "unreadable", iteration);
  }
  return holds;
}

/**
 * Removes one steer's hold file. A boundary expires the hold of a steer the
 * architect left unanswered, so held work resumes instead of waiting for an
 * answer that may never come.
 */
export async function expireHold(
  store: ArtifactStore,
  steerId: string,
): Promise<void> {
  const dir = holdsDir(store);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return;
    throw err;
  }
  for (const name of names) {
    if (!YAML_HOLD.test(name)) continue;
    if (path.basename(name, path.extname(name)) !== steerId) continue;
    try {
      await fs.promises.rm(path.join(dir, name));
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }
  }
}

export async function writeOutbox(
  store: ArtifactStore,
  id: string,
  text: string,
): Promise<string> {
  const rel = path.join("mailbox", "outbox", `steer-${id}.md`);
  await writeTextAtomic(
    path.join(store.mailboxDir, "outbox", `steer-${id}.md`),
    `${text.trim()}\n`,
  );
  return rel;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `steer <id>: answer` entries in the architect's forward list, matched against
 * the pending steer ids. The id travels as data (the known list), never parsed
 * from text, so an id containing spaces, colons or quotes still answers.
 */
export function steerResponses(
  outcome: Outcome,
  knownIds: Iterable<string>,
): Map<string, string> {
  const ids = [...knownIds].sort((a, b) => b.length - a.length);
  const patterns = ids.map((id) => ({
    id,
    regex: new RegExp(
      `^[Ss][Tt][Ee][Ee][Rr]\\s+${escapeRegExp(id)}\\s*:\\s*([\\s\\S]+)$`,
    ),
  }));
  const responses = new Map<string, string>();
  for (const item of outcome.forward) {
    const trimmed = item.trim();
    for (const { id, regex } of patterns) {
      const match = regex.exec(trimmed);
      if (match?.[1]) {
        responses.set(id, match[1].trim());
        break;
      }
    }
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
    .map(
      (s) => `- ${s.id} (${s.relPath}):\n${s.text.trim().replace(/^/gm, "  ")}`,
    )
    .join("\n");
}

/** A PM-created task's provenance: its `source` frontmatter is `steer: <id>`. */
export function steerProvenance(source: string): string | undefined {
  const match = /^steer:\s*(.+)$/.exec(source.trim());
  const id = match?.[1]?.trim();
  return id ? id : undefined;
}

/** A PM-created stall continuation's provenance: its `source` is `stall: <iteration>`. */
export function stallProvenance(source: string): string | undefined {
  const match = /^stall:\s*(.+)$/.exec(source.trim());
  const id = match?.[1]?.trim();
  return id ? id : undefined;
}

/** Latest committed PM route per steer, from successful steer turns only; last record wins. */
export function collectSteerRoutes(
  records: StepRecord[],
): Map<string, { route: SteerRoute; answer?: string }> {
  const out = new Map<string, { route: SteerRoute; answer?: string }>();
  const sorted = [...records].sort(
    (a, b) => a.seq - b.seq || a.startedAt.localeCompare(b.startedAt),
  );
  for (const record of sorted) {
    if (record.step !== "steer-routes" || record.actor !== "script") continue;
    const routes = record.outcome?.steerRoutes;
    if (!routes) continue;
    for (const entry of routes) {
      const answer = entry.answer?.trim();
      out.set(entry.steer, {
        route: entry.route,
        ...(answer ? { answer } : {}),
      });
    }
  }
  return out;
}

/** One line per PM-routed steer for the architect's pack; sorted by steer id. */
export function formatPmAnswers(
  routes: Map<string, { route: SteerRoute; answer?: string }>,
): string[] {
  return [...routes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([steer, { route, answer }]) =>
      answer ? `- ${steer} [${route}]: ${answer}` : `- ${steer} [${route}]`,
    );
}

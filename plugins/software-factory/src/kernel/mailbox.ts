// biome-ignore-all lint/complexity: split-rest
import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import yaml from "yaml";
import { z } from "zod";
import { makeCause } from "./cause.js";
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
  /** Leading frontmatter `urgent: true`; the steer drains its iteration. */
  urgent: boolean;
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
/** Options for reading hold files. */
export interface ReadHoldsOptions {
  /** Task slugs the caller knows; a hold naming anything else is a finding. */
  knownSlugs?: ReadonlySet<string> | readonly string[];
}

const DEFAULT_SETTLE_MS = 50;
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

/** Where the PM's steer turn writes one `<steer-id>.yaml` per structured steer. */
export function holdsDir(store: ArtifactStore): string {
  return store.mailbox.holds;
}

/** Where unreadable hold files are parked so they stop deciding dispatch. */
export function quarantineDir(store: ArtifactStore): string {
  return store.mailbox.quarantine;
}

/** A hold file that decides nothing; `sweepHolds` parks it, a read only reports it. */
export interface HoldFinding {
  /** Goal-relative path of the hold file. */
  file: string;
  kind: "malformed" | "unknown-slug";
  reason: string;
}

async function listHoldNames(store: ArtifactStore): Promise<string[]> {
  return store.mailbox.files("holds");
}

/**
 * Reads the PM's hold decisions without touching the mailbox. A malformed hold
 * and a hold naming a slug outside `knownSlugs` (when given) decide nothing:
 * each is returned as a finding while the valid holds beside it still apply.
 * Parking those files is `sweepHolds`'s job. Holds for steers the architect
 * already processed are the caller's to ignore.
 */
export async function readHolds(
  store: ArtifactStore,
  opts: ReadHoldsOptions = {},
): Promise<{ holds: Hold[]; findings: HoldFinding[] }> {
  const known =
    opts.knownSlugs === undefined ? undefined : new Set(opts.knownSlugs);
  const holds: Hold[] = [];
  const findings: HoldFinding[] = [];
  for (const name of await listHoldNames(store)) {
    if (name.startsWith(".") || !YAML_HOLD.test(name)) continue;
    const file = store.mailbox.rel("holds", name);
    const text = await store.mailbox.read("holds", name);
    if (text === null) continue;
    let parsed: Hold | undefined;
    try {
      const valid = holdFileSchema.safeParse(yaml.parse(text));
      if (valid.success) {
        parsed = {
          steer: path.basename(name, path.extname(name)),
          ...valid.data,
        };
      } else {
        findings.push({
          file,
          kind: "malformed",
          reason: "must be { slugs: string[], goal: boolean }",
        });
      }
    } catch (err) {
      findings.push({
        file,
        kind: "malformed",
        reason: `not valid YAML: ${(err as Error).message}`,
      });
    }
    if (!parsed) continue;
    const unknown =
      known === undefined
        ? []
        : parsed.slugs.filter((slug) => !known.has(slug));
    if (unknown.length > 0) {
      findings.push({
        file,
        kind: "unknown-slug",
        reason: `unknown slug(s): ${unknown.join(", ")}`,
      });
      continue;
    }
    holds.push(parsed);
  }
  return { holds, findings };
}

/**
 * Moves a hold that decides nothing out of the holds directory and records
 * why. Leaving it in place would re-report it on every read, so the record is
 * the report and the file is kept under `mailbox/quarantine/` for the operator.
 */
async function quarantineHold(
  store: ArtifactStore,
  finding: HoldFinding,
  iteration: number,
): Promise<void> {
  const name = path.basename(finding.file);
  const text = await store.mailbox.read("holds", name);
  if (text === null) return;
  const taken = await store.mailbox.read("quarantine", name);
  const target = taken === null ? name : archiveName(name, contentHash(text));
  const moved = await store.mailbox.move("holds", name, "quarantine", target);
  if (!moved) return;
  const rel = store.mailbox.rel("quarantine", target);
  await store.appendRecord(scriptMeta(iteration, "hold-quarantine"), {
    ok: false,
    cause: makeCause(
      "quarantine",
      `${finding.kind} hold "${name}" moved to ${rel}: ${finding.reason}`,
    ),
  });
}

/**
 * The launch's one hold quarantine, run under the run lock: parks every
 * malformed or unknown-slug hold with a record. A slug whose task file the
 * scan reports as an unconfigured type is not unknown: pre-flight refuses that
 * launch, and the hold stays for when the type is configured. A holds path
 * that is not a directory has nothing to park; dispatch reports it as infra.
 */
export async function sweepHolds(
  store: ArtifactStore,
  iteration: number,
  knownSlugs: ReadonlySet<string> | readonly string[],
): Promise<void> {
  const known = new Set(knownSlugs);
  for (const finding of await store.scanTaskFindings()) {
    if (finding.kind === "unconfigured-type") known.add(finding.slug);
  }
  let findings: HoldFinding[];
  try {
    ({ findings } = await readHolds(store, { knownSlugs: known }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOTDIR") return;
    throw err;
  }
  for (const finding of findings) {
    await quarantineHold(store, finding, iteration);
  }
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
  for (const name of await store.mailbox.files("holds")) {
    if (!YAML_HOLD.test(name)) continue;
    if (path.basename(name, path.extname(name)) !== steerId) continue;
    await store.mailbox.remove("holds", name);
  }
}

export async function writeOutbox(
  store: ArtifactStore,
  id: string,
  text: string,
): Promise<string> {
  const name = `steer-${id}.md`;
  await store.mailbox.write("outbox", name, `${text.trim()}\n`);
  return store.mailbox.rel("outbox", name);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The answers to the pending steers: `steerAnswers` entries by steer id, and,
 * for records from before the field existed, `steer <id>: answer` lines in the
 * architect's forward list. A typed answer wins over a legacy line. Legacy ids
 * travel as data (the known list), never parsed from text, so an id containing
 * spaces, colons or quotes still answers.
 */
export function steerResponses(
  outcome: Outcome,
  knownIds: Iterable<string>,
): Map<string, string> {
  const known = new Set(knownIds);
  const ids = [...known].sort((a, b) => b.length - a.length);
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
  for (const entry of outcome.steerAnswers ?? []) {
    const answer = entry.answer.trim();
    if (answer && known.has(entry.steer)) responses.set(entry.steer, answer);
  }
  return responses;
}

export function formatSteers(steers: Steer[]): string {
  if (steers.length === 0) return "none";
  return steers
    .map((s) => {
      const first = s.text.trim().split(/\r?\n/)[0] ?? "";
      return `- ${s.id} (${s.relPath})${s.urgent ? " [urgent]" : ""}: ${first}`;
    })
    .join("\n");
}

/** Full steer text for the PM's steer turn; the architect only needs the first line. */
export function formatSteerTurn(steers: Steer[]): string {
  if (steers.length === 0) return "none";
  return steers
    .map(
      (s) =>
        `- ${s.id} (${s.relPath})${s.urgent ? " [urgent]" : ""}:\n${s.text.trim().replace(/^/gm, "  ")}`,
    )
    .join("\n");
}

/** A PM-created task's provenance: its `source` frontmatter is `steer: <id>`. */
export function steerProvenance(source: string): string | undefined {
  const match = /^steer:\s*(.+)$/.exec(source.trim());
  const id = match?.[1]?.trim();
  return id ? id : undefined;
}

/**
 * Slugs a steer's hold names that the same steer created (`source: steer:
 * <id>`). A spike steer is answered only when its task ends, so holding that
 * task deadlocks both: the hold waits for the steer and the task waits for the
 * hold. Every such slug is a hold bug, never a legitimate block.
 */
export function selfHeldSlugs(
  steer: string,
  slugs: readonly string[],
  tasks: readonly { slug: string; source: string }[],
): string[] {
  const own = new Set(
    tasks
      .filter((task) => steerProvenance(task.source) === steer)
      .map((task) => task.slug),
  );
  return slugs.filter((slug) => own.has(slug));
}

/** A PM-created stall continuation's provenance: its `source` is `stall: <iteration>`. */
export function stallProvenance(source: string): string | undefined {
  const match = /^stall:\s*(.+)$/.exec(source.trim());
  const id = match?.[1]?.trim();
  return id ? id : undefined;
}

/** A plan-check follow-up's provenance: its `source` is `plan-check: <iteration>`. */
export function planCheckProvenance(source: string): string | undefined {
  const match = /^plan-check:\s*(.+)$/.exec(source.trim());
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

/** True when a route waits for an architect, generic or a named scope. */
export function isArchitectRoute(route: SteerRoute): boolean {
  return route === "architect" || typeof route === "object";
}

/** A route as one token for prompts, records and summaries. */
export function formatSteerRoute(route: SteerRoute): string {
  return typeof route === "object" ? `architect ${route.architect}` : route;
}

/** One line per PM-routed steer for the architect's pack; sorted by steer id. */
export function formatPmAnswers(
  routes: Map<string, { route: SteerRoute; answer?: string }>,
): string[] {
  return [...routes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([steer, { route, answer }]) =>
      answer
        ? `- ${steer} [${formatSteerRoute(route)}]: ${answer}`
        : `- ${steer} [${formatSteerRoute(route)}]`,
    );
}

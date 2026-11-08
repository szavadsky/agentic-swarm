import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type {
  Concern,
  ConcernSeverity,
  ConcernSource,
  RemarkableDecision,
  ReviewSuggestion,
  StoredConcernArtifact,
} from "./artifacts.js";
import type { Repo } from "./git/repo.js";
import { commitAll } from "./git/commit.js";
import { git } from "./git/exec.js";
import { KeyedMutex } from "./mutex.js";
import { readYaml, writeYamlAtomic } from "./records/io.js";

export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affects"> &
  Partial<Pick<Concern, "detail" | "severity">>;
export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }

const CONCERN_KINDS = new Set(["tech-debt", "assumption", "blocker", "risk", "question"]);
const SEVERITY_RANK: Record<ConcernSeverity, number> = { low: 0, medium: 1, high: 2 };

/** Serializes read-modify-write cycles of one task's concern store. */
const concernLocks = new KeyedMutex();

function concernsDir(taskDir: string): string {
  return path.join(taskDir, "concerns");
}

function nowIso(ctx: { now?: () => Date }): string {
  return (ctx.now?.() ?? new Date()).toISOString();
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sortedAffects(affects?: string[]): string[] {
  return [...new Set((affects ?? []).map((a) => a.trim()))].sort();
}

function hash10(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10);
}

/** Stable concern identity: kind, normalized summary, location, sorted affects. */
export function concernFingerprint(concern: ConcernInput): string {
  const location = concern.location
    ? [concern.location.file.trim(), concern.location.line ?? null]
    : [null, null];
  return `c-${hash10([concern.kind, normalizeText(concern.summary), ...location, sortedAffects(concern.affects)])}`;
}

function remarkableFingerprint(decision: RemarkableDecision): string {
  return `rm-${hash10([normalizeText(decision.chosen), sortedAffects(decision.alternatives)])}`;
}

function validateConcerns(concerns: ConcernInput[]): void {
  for (const concern of concerns) {
    if (!CONCERN_KINDS.has(concern.kind)) {
      throw new Error(`Unknown concern kind: ${String(concern.kind)}`);
    }
    if (!concern.summary?.trim()) {
      throw new Error("Concern summary is required");
    }
    if (concern.severity && !(concern.severity in SEVERITY_RANK)) {
      throw new Error(`Unknown concern severity: ${String(concern.severity)}`);
    }
  }
}

async function readExisting<T>(file: string): Promise<T | undefined> {
  try {
    return await readYaml<T>(file);
  } catch (err: any) {
    if (err?.code === "ENOENT") return undefined;
    throw err;
  }
}

function maxSeverity(a: ConcernSeverity, b: ConcernSeverity): ConcernSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function mergeConcern(
  existing: StoredConcernArtifact | undefined,
  input: ConcernInput,
  source: ConcernSource,
  at: string
): StoredConcernArtifact {
  const incomingDetail = (input.detail ?? input.summary).trim();
  const detail =
    incomingDetail.length >= (existing?.detail?.length ?? -1)
      ? incomingDetail
      : existing!.detail;
  const incomingSeverity = input.severity ?? "medium";
  const severity = existing ? maxSeverity(existing.severity, incomingSeverity) : incomingSeverity;
  const escalated =
    Boolean(existing?.source?.escalated) ||
    (existing !== undefined && SEVERITY_RANK[incomingSeverity] > SEVERITY_RANK[existing.severity]);
  const affects = input.affects
    ? sortedAffects(input.affects)
    : existing?.affects
      ? existing.affects
      : undefined;

  return {
    id: concernFingerprint(input),
    kind: existing?.kind ?? input.kind,
    summary: existing?.summary ?? input.summary.trim(),
    detail,
    ...(input.location ?? existing?.location
      ? { location: input.location ?? existing!.location }
      : {}),
    ...(affects ? { affects } : {}),
    severity,
    status: existing?.status ?? "open",
    ...(existing?.disposition ? { disposition: existing.disposition } : {}),
    ...(existing?.dismissReason ? { dismissReason: existing.dismissReason } : {}),
    ...(existing?.pendingResolution ? { pendingResolution: existing.pendingResolution } : {}),
    source: {
      ...existing?.source,
      ...source,
      ...(escalated ? { escalated: true } : {}),
      lastSeen: at,
    },
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  };
}

interface StoredRemarkable extends RemarkableDecision {
  id: string;
  status: "open" | "dismissed";
  source: ConcernSource;
  dismissReason?: string;
  createdAt: string;
  updatedAt: string;
}

function mergeRemarkable(
  existing: StoredRemarkable | undefined,
  input: RemarkableDecision,
  source: ConcernSource,
  at: string
): StoredRemarkable {
  const why =
    input.why.length >= (existing?.why?.length ?? -1) ? input.why : existing!.why;
  return {
    id: remarkableFingerprint(input),
    chosen: existing?.chosen ?? input.chosen,
    alternatives: existing?.alternatives ?? input.alternatives,
    why,
    status: existing?.status ?? "open",
    ...(existing?.dismissReason ? { dismissReason: existing.dismissReason } : {}),
    source: { ...existing?.source, ...source, lastSeen: at },
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  };
}

/**
 * Merges producer concerns (and remarkable decisions) into one taskWt file per
 * fingerprint. Validation runs before any write so a bad payload is atomic.
 */
export async function aggregateConcerns(
  ctx: ConcernStoreContext & { source: ConcernSource },
  concerns: ConcernInput[],
  remarkables: RemarkableDecision[] = []
): Promise<StoredConcernArtifact[]> {
  validateConcerns(concerns);
  for (const decision of remarkables) {
    if (!decision?.chosen?.trim()) throw new Error("Remarkable decision requires chosen");
  }

  const at = nowIso(ctx);
  const dir = concernsDir(ctx.taskDir);
  const stored: StoredConcernArtifact[] = [];
  let changed = false;

  await concernLocks.runExclusive(ctx.taskDir, async () => {
    for (const input of concerns) {
      const id = concernFingerprint(input);
      const file = path.join(dir, `${id}.yaml`);
      const merged = mergeConcern(await readExisting(file), input, ctx.source, at);
      await writeYamlAtomic(file, merged);
      stored.push(merged);
      changed = true;
    }
    for (const decision of remarkables) {
      const id = remarkableFingerprint(decision);
      const file = path.join(dir, `${id}.yaml`);
      const merged = mergeRemarkable(await readExisting(file), decision, ctx.source, at);
      await writeYamlAtomic(file, merged);
      changed = true;
    }
  });

  if (changed) {
    await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
  }
  return stored;
}

/** Returns open concerns ordered by creation time then id. */
export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
  const dir = concernsDir(taskDir);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }

  const open: StoredConcernArtifact[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".yaml")) continue;
    try {
      const record = await readYaml<StoredConcernArtifact>(path.join(dir, name));
      if (record?.status === "open") open.push(record);
    } catch {
      // Corrupt entries stay on disk for operators; they must not break startup.
    }
  }
  return open.sort(
    (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id)
  );
}

/** Applies review triage to pre-existing concerns only; findings are ignored. */
export async function applyConcernTriage(
  ctx: ConcernStoreContext & { suggestions: ReviewSuggestion[]; isTriager: boolean }
): Promise<StoredConcernArtifact[]> {
  if (!ctx.isTriager) return [];
  for (const suggestion of ctx.suggestions) {
    if (suggestion.disposition === "dismiss" && !suggestion.detail?.trim()) {
      throw new Error(`Dismiss triage for ${suggestion.id} requires detail`);
    }
  }

  const at = nowIso(ctx);
  const dir = concernsDir(ctx.taskDir);
  const updated = await concernLocks.runExclusive(ctx.taskDir, async () => {
    const records: StoredConcernArtifact[] = [];
    for (const suggestion of ctx.suggestions) {
      if (suggestion.id !== path.basename(suggestion.id)) continue;
      const file = path.join(dir, `${suggestion.id}.yaml`);
      const existing = await readExisting<Record<string, any>>(file);
      if (!existing) continue;
      const dismissed = suggestion.disposition === "dismiss";
      const next = {
        ...existing,
        status: dismissed ? "dismissed" : "routed",
        disposition: suggestion.disposition,
        ...(dismissed ? { dismissReason: suggestion.detail!.trim() } : {}),
        updatedAt: at,
      };
      await writeYamlAtomic(file, next);
      records.push(next as StoredConcernArtifact);
    }
    return records;
  });

  if (updated.length > 0) {
    await commitAll(ctx.repo, ctx.taskWt, `factory: concerns triaged`);
  }
  return updated;
}

/** Records close-up resolutions as pending; status changes are a later decision. */
export async function applyCloseupResolutions(
  ctx: ConcernStoreContext & { resolutions: ConcernResolution[]; by: string }
): Promise<StoredConcernArtifact[]> {
  const at = nowIso(ctx);
  const dir = concernsDir(ctx.taskDir);
  const updated = await concernLocks.runExclusive(ctx.taskDir, async () => {
    const records: StoredConcernArtifact[] = [];
    for (const resolution of ctx.resolutions) {
      if (resolution.id !== path.basename(resolution.id)) continue;
      const file = path.join(dir, `${resolution.id}.yaml`);
      const existing = await readExisting<Record<string, any>>(file);
      if (!existing) continue;
      const next = {
        ...existing,
        pendingResolution: {
          action: resolution.action,
          ...(resolution.note !== undefined ? { note: resolution.note } : {}),
          by: ctx.by,
          at,
        },
        updatedAt: at,
      };
      await writeYamlAtomic(file, next);
      records.push(next as StoredConcernArtifact);
    }
    return records;
  });

  if (updated.length > 0) {
    await commitAll(ctx.repo, ctx.taskWt, `factory: concerns resolved by ${ctx.by}`);
  }
  return updated;
}

/** Splits review suggestions into concern triage vs ordinary findings by exact id. */
export function partitionSuggestions(
  suggestions: ReviewSuggestion[],
  concernIds: Iterable<string>
): { triage: ReviewSuggestion[]; findings: ReviewSuggestion[] } {
  const ids = new Set(concernIds);
  const triage: ReviewSuggestion[] = [];
  const findings: ReviewSuggestion[] = [];
  for (const suggestion of suggestions) {
    (ids.has(suggestion.id) ? triage : findings).push(suggestion);
  }
  return { triage, findings };
}

interface CommittedRecord {
  name: string;
  item?: string;
  meta: Record<string, any>;
  output: Record<string, any>;
}

async function committedPaths(ctx: ConcernStoreContext): Promise<Set<string>> {
  const res = await git(ctx.taskWt, ["ls-tree", "-r", "--name-only", "HEAD"], {
    allowFail: true,
    env: ctx.repo.identityEnv(),
  });
  return new Set(res.code === 0 ? res.stdout.split("\n").filter(Boolean) : []);
}

async function committedStepRecords(ctx: ConcernStoreContext): Promise<CommittedRecord[]> {
  const committed = await committedPaths(ctx);
  const records: CommittedRecord[] = [];
  const scan = async (dir: string, item?: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const recordDir = path.join(dir, entry.name);
      const metaPath = path.join(recordDir, "meta.yaml");
      const outputPath = path.join(recordDir, "output.yaml");
      if (!fs.existsSync(metaPath) || !fs.existsSync(outputPath)) continue;
      const metaRel = path.relative(ctx.taskWt, metaPath).replace(/\\/g, "/");
      const outputRel = path.relative(ctx.taskWt, outputPath).replace(/\\/g, "/");
      if (!committed.has(metaRel) || !committed.has(outputRel)) continue;
      try {
        const meta = await readYaml<Record<string, any>>(metaPath);
        if (meta?.status !== "ok") continue;
        const output = await readYaml<Record<string, any>>(outputPath);
        records.push({ name: entry.name, ...(item ? { item } : {}), meta, output });
      } catch {
        // A corrupt record is not a usable derivation input.
      }
    }
  };

  const itemsDir = path.join(ctx.taskDir, "items");
  if (fs.existsSync(itemsDir)) {
    const items = await fs.promises.readdir(itemsDir, { withFileTypes: true });
    for (const entry of items.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        await scan(path.join(itemsDir, entry.name, "steps"), entry.name);
      }
    }
  }
  await scan(path.join(ctx.taskDir, "runs"));
  return records;
}

/**
 * Rebuilds missing concern artifacts from committed step records. Step records
 * are only read; aggregation remains idempotent through fingerprint merging.
 */
export async function reconcileConcerns(ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
  const reconciled: StoredConcernArtifact[] = [];
  for (const record of await committedStepRecords(ctx)) {
    const concerns = [...(record.output.concerns ?? []), ...(record.output.newConcerns ?? [])]
      .filter((c: any) => c && typeof c === "object") as ConcernInput[];
    const remarkables = Array.isArray(record.output.remarkable)
      ? (record.output.remarkable as RemarkableDecision[])
      : [];
    if (concerns.length === 0 && remarkables.length === 0) continue;

    const source: ConcernSource = {
      record: record.name,
      agent: String(record.meta.agent ?? "unknown"),
      ...(record.meta.name ? { step: String(record.meta.name) } : {}),
      ...(record.item ? { item: record.item } : {}),
    };
    reconciled.push(...(await aggregateConcerns({ ...ctx, source }, concerns, remarkables)));
  }
  return reconciled;
}

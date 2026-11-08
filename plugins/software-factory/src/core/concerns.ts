import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Concern, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
import type { Repo } from "./git/repo.js";
import { commitAll } from "./git/commit.js";
import { git } from "./git/exec.js";
import { KeyedMutex } from "./mutex.js";
import { readYaml, writeYamlAtomic } from "./records/io.js";

export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affects"> &
  Partial<Pick<Concern, "detail" | "severity">>;
export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }

type Obj = Record<string, any>;
type Patch = (record: Obj, at: string) => Obj;
const KINDS = new Set(["tech-debt", "assumption", "blocker", "risk", "question"]);
const RANK: Record<ConcernSeverity, number> = { low: 0, medium: 1, high: 2 };
/** Serializes read-modify-write cycles of one task's concern store. */
const locks = new KeyedMutex();
const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
const atOf = (ctx: { now?: () => Date }) => (ctx.now?.() ?? new Date()).toISOString();
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))].sort();
const hash = (prefix: string, parts: unknown[]) =>
  `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);

/** Stable concern identity: kind, normalized summary, location, sorted affects. */
export function concernFingerprint(c: ConcernInput): string {
  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
}

async function readExisting<T>(file: string): Promise<T | undefined> {
  try { return await readYaml<T>(file); } catch (err: any) {
    if (err?.code === "ENOENT") return undefined;
    throw err;
  }
}

function mergeConcern(existing: StoredConcernArtifact | undefined, input: ConcernInput, source: ConcernSource, at: string): StoredConcernArtifact {
  const incomingDetail = (input.detail ?? input.summary).trim();
  const incomingSeverity = input.severity ?? "medium";
  const detail = existing?.detail && existing.detail.length > incomingDetail.length ? existing.detail : incomingDetail;
  const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
  const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
  const location = input.location ?? existing?.location;
  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
  return {
    ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
    summary: existing?.summary ?? input.summary.trim(), detail,
    ...(location ? { location } : {}), ...(affects ? { affects } : {}), severity,
    status: existing?.status ?? "open",
    source: { ...(existing?.source ?? {}), ...source, ...(escalated ? { escalated: true } : {}), lastSeen: at },
    createdAt: existing?.createdAt ?? at, updatedAt: at,
  };
}

function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, source: ConcernSource, at: string): Obj {
  return {
    ...(existing ?? {}), id: rmId(input), chosen: input.chosen, alternatives: input.alternatives,
    why: input.why.length >= (existing?.why?.length ?? -1) ? input.why : existing!.why,
    status: existing?.status ?? "open",
    source: { ...(existing?.source ?? {}), ...source, lastSeen: at },
    createdAt: existing?.createdAt ?? at, updatedAt: at,
  };
}

/** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
export async function aggregateConcerns(
  ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = []
): Promise<StoredConcernArtifact[]> {
  for (const c of concerns) {
    if (!KINDS.has(c.kind)) throw new Error(`Unknown concern kind: ${String(c.kind)}`);
    if (!c.summary?.trim()) throw new Error("Concern summary is required");
    if (c.severity && !(c.severity in RANK)) throw new Error(`Unknown concern severity: ${String(c.severity)}`);
  }
  for (const d of remarkables) if (!d?.chosen?.trim()) throw new Error("Remarkable decision requires chosen");

  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
  const stored = await locks.runExclusive(ctx.taskDir, async () => {
    const out: StoredConcernArtifact[] = [];
    for (const input of concerns) {
      const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
      const merged = mergeConcern(await readExisting(file), input, ctx.source, at);
      await writeYamlAtomic(file, merged);
      out.push(merged);
    }
    for (const decision of remarkables) {
      const file = path.join(dir, `${rmId(decision)}.yaml`);
      await writeYamlAtomic(file, mergeRemarkable(await readExisting(file), decision, ctx.source, at));
    }
    return out;
  });
  if (concerns.length || remarkables.length) await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
  return stored;
}

/** Returns open concerns ordered by creation time then id. */
export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
  const dir = dirOf(taskDir);
  let names: string[];
  try { names = await fs.promises.readdir(dir); } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
  const records = await Promise.all(names.filter((n) => n.endsWith(".yaml")).map(async (name) => {
    try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
  }));
  return records
    .filter((r): r is StoredConcernArtifact => r?.status === "open")
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
}

async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
  const at = atOf(ctx), dir = dirOf(ctx.taskDir);
  const updated = await locks.runExclusive(ctx.taskDir, async () => {
    const out: StoredConcernArtifact[] = [];
    for (const [id, patch] of ops) {
      if (id !== path.basename(id)) continue;
      const file = path.join(dir, `${id}.yaml`);
      const existing = await readExisting<Obj>(file);
      if (!existing) continue;
      const next = { ...patch(existing, at), updatedAt: at };
      await writeYamlAtomic(file, next);
      out.push(next as StoredConcernArtifact);
    }
    return out;
  });
  if (updated.length) await commitAll(ctx.repo, ctx.taskWt, message);
  return updated;
}

/** Applies review triage to pre-existing concerns only; ordinary findings are ignored. */
export async function applyConcernTriage(
  ctx: ConcernStoreContext & { suggestions: ReviewSuggestion[]; isTriager: boolean }
): Promise<StoredConcernArtifact[]> {
  if (!ctx.isTriager) return [];
  const ops = ctx.suggestions.map((s): [string, Patch] => {
    if (s.disposition === "dismiss" && !s.detail?.trim()) throw new Error(`Dismiss triage for ${s.id} requires detail`);
    return [s.id, (record) => s.disposition === "dismiss"
      ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
      : { ...record, status: "routed", disposition: s.disposition }];
  });
  return mutate(ctx, ops, "factory: concerns triaged");
}

/** Records close-up resolutions as pending; changing status is a later decision. */
export function applyCloseupResolutions(
  ctx: ConcernStoreContext & { resolutions: ConcernResolution[]; by: string }
): Promise<StoredConcernArtifact[]> {
  const ops = ctx.resolutions.map((r): [string, Patch] => [r.id, (record, at) => ({
    ...record, pendingResolution: { action: r.action, ...(r.note !== undefined ? { note: r.note } : {}), by: ctx.by, at },
  })]);
  return mutate(ctx, ops, `factory: concerns resolved by ${ctx.by}`);
}

/** Splits review suggestions into concern triage vs findings by exact id. */
export function partitionSuggestions(
  suggestions: ReviewSuggestion[], concernIds: Iterable<string>
): { triage: ReviewSuggestion[]; findings: ReviewSuggestion[] } {
  const ids = new Set(concernIds);
  return {
    triage: suggestions.filter((s) => ids.has(s.id)),
    findings: suggestions.filter((s) => !ids.has(s.id)),
  };
}

interface CommittedRecord { name: string; item?: string; meta: Obj; output: Obj }

async function committedStepRecords(ctx: ConcernStoreContext): Promise<CommittedRecord[]> {
  const res = await git(ctx.taskWt, ["ls-tree", "-r", "--name-only", "HEAD"], { allowFail: true, env: ctx.repo.identityEnv() });
  if (res.code !== 0) return [];
  const committed = new Set(res.stdout.split("\n").filter(Boolean));
  const prefix = path.relative(ctx.taskWt, ctx.taskDir).replace(/\\/g, "/");
  const records: CommittedRecord[] = [];
  for (const metaRel of [...committed].sort()) {
    const outputRel = metaRel.replace(/meta\.yaml$/, "output.yaml");
    if (!metaRel.startsWith(`${prefix}/`) || outputRel === metaRel || !committed.has(outputRel)) continue;
    const parts = metaRel.slice(prefix.length + 1).split("/");
    const item = parts[0] === "items" && parts.length === 5 ? parts[1] : undefined;
    if (!item && (parts[0] !== "runs" || parts.length !== 3)) continue;
    try {
      const meta = await readYaml<Obj>(path.join(ctx.taskWt, metaRel));
      if (meta?.status !== "ok") continue;
      records.push({ name: parts[parts.length - 2]!, ...(item ? { item } : {}), meta,
        output: await readYaml<Obj>(path.join(ctx.taskWt, outputRel)) });
    } catch { /* A corrupt record is not a usable derivation input. */ }
  }
  return records;
}

/** Rebuilds concern artifacts from committed step records; merging keeps it idempotent. */
export async function reconcileConcerns(ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
  const reconciled: StoredConcernArtifact[] = [];
  for (const r of await committedStepRecords(ctx)) {
    const concerns = [...(r.output.concerns ?? []), ...(r.output.newConcerns ?? [])]
      .filter((c: any) => c && typeof c === "object");
    const remarkables = Array.isArray(r.output.remarkable) ? r.output.remarkable : [];
    if (!concerns.length && !remarkables.length) continue;
    const source: ConcernSource = { record: r.name, agent: String(r.meta.agent ?? "unknown"),
      ...(r.meta.name ? { step: String(r.meta.name) } : {}), ...(r.item ? { item: r.item } : {}) };
    reconciled.push(...(await aggregateConcerns({ ...ctx, source }, concerns, remarkables)));
  }
  return reconciled;
}

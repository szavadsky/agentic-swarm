import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Concern, ConcernConfirms, ConcernCounts, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
import type { Repo } from "./git/repo.js";
import { commitAll } from "./git/commit.js";
import { git } from "./git/exec.js";
import { KeyedMutex } from "./mutex.js";
import { readYaml, writeYamlAtomic } from "./records/io.js";

export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affects"> &
  Partial<Pick<Concern, "detail" | "severity">>;
export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
/** `repo` is only needed when the aggregation itself commits. */
export type ConcernWriteContext = Omit<ConcernStoreContext, "repo"> & { repo?: Repo };
export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }

type Obj = Record<string, any>;
type Patch = (record: Obj, at: string) => Obj;
const KINDS = new Set(["tech-debt", "assumption", "blocker", "risk", "question"]);
const RANK: Record<ConcernSeverity, number> = { low: 0, medium: 1, high: 2 };

/** True when `severity` reaches the configured minimum threshold. */
export function severityAtLeast(severity: ConcernSeverity, min: ConcernSeverity): boolean {
  return RANK[severity] >= RANK[min];
}

/**
 * Agents whose output schemas can raise concerns; mirrors the shipped
 * `pipeline.default.yaml` allowlist. The key is the raising step's
 * `source.agent`, never its fragment: developer covers develop/poc/
 * test-assumptions/test-first/simple-implement/fix-round, fact-finder covers
 * research, and architect covers architect-*.
 */
export const DEFAULT_RAISE_ALLOWLIST = [
  "developer",
  "fact-finder",
  "architect",
  "qa",
  "reviewer",
  "plan-reviewer",
  "wave-close-up",
  "plan-close-up",
] as const;
/** Serializes read-modify-write cycles of one task's concern store. */
const locks = new KeyedMutex();
const dirOf = (taskDir: string) => path.join(taskDir, "concerns");
const atOf = (ctx: { now?: () => Date }) => (ctx.now?.() ?? new Date()).toISOString();
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))].sort();
const hash = (prefix: string, parts: unknown[]) =>
  `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;

/** Stable concern identity: kind, normalized summary, location. */
export function concernFingerprint(c: ConcernInput): string {
  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
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
  const affects = input.affects
    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
    : existing?.affects;
  return {
    ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
    summary: existing?.summary ?? input.summary.trim(), detail,
    ...(location ? { location } : {}), ...(affects ? { affects } : {}), severity,
    status: existing?.status ?? "open",
    source: { ...(existing?.source ?? {}), ...source, ...(escalated ? { escalated: true } : {}), lastSeen: (existing?.source?.lastSeen ?? "") > at ? existing!.source!.lastSeen! : at },
    createdAt: existing?.createdAt ?? at, updatedAt: at,
  };
}

function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, source: ConcernSource, at: string): Obj {
  return {
    ...(existing ?? {}), id: rmId(input), chosen: input.chosen, alternatives: input.alternatives,
    why: input.why.length >= (existing?.why?.length ?? -1) ? input.why : existing!.why,
    status: existing?.status ?? "open",
    source: { ...(existing?.source ?? {}), ...source, lastSeen: (existing?.source?.lastSeen ?? "") > at ? existing!.source!.lastSeen! : at },
    createdAt: existing?.createdAt ?? at, updatedAt: at,
  };
}

/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
  let names: string[];
  try { names = await fs.promises.readdir(dir); } catch (err: any) {
    if (err?.code === "ENOENT") return undefined;
    throw err;
  }
  const [file, line] = locationOf(input.location);
  for (const name of names.sort()) {
    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
    const candidate = path.join(dir, name);
    try {
      const record = await readYaml<StoredConcernArtifact>(candidate);
      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
      const [rfile, rline] = locationOf(record.location);
      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
      return { file: candidate, record };
    } catch { /* Corrupt entries are not migration candidates. */ }
  }
  return undefined;
}

/** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
export async function aggregateConcerns(
  ctx: ConcernWriteContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
): Promise<StoredConcernArtifact[]> {
  for (const c of concerns) {
    if (!KINDS.has(c.kind)) throw new Error(`Unknown concern kind: ${String(c.kind)}`);
    if (!c.summary?.trim()) throw new Error("Concern summary is required");
    if (c.severity && !(c.severity in RANK)) throw new Error(`Unknown concern severity: ${String(c.severity)}`);
  }
  for (const d of remarkables) if (!d?.chosen?.trim() || !Array.isArray(d?.alternatives) || typeof d?.why !== "string" || !d.why.trim()) throw new Error("Remarkable decision requires chosen/alternatives/why");
  const at = opts.at ?? atOf(ctx), dir = dirOf(ctx.taskDir);
  let dirty = false;
  const stored = await locks.runExclusive(ctx.taskDir, async () => {
    const out: StoredConcernArtifact[] = [];
    for (const input of concerns) {
      const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
      let existing = await readExisting<StoredConcernArtifact>(file);
      let legacyFile: string | undefined;
      if (!existing) {
        const migrated = await legacyConcern(dir, input);
        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
      }
      const merged = mergeConcern(existing, input, ctx.source, at);
      if (legacyFile && input.detail?.trim()) merged.detail = input.detail.trim();
      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
      await writeYamlAtomic(file, merged);
      if (legacyFile) await fs.promises.unlink(legacyFile);
      dirty = true; out.push(merged);
    }
    for (const decision of remarkables) {
      const file = path.join(dir, `${rmId(decision)}.yaml`);
      const existing = await readExisting<Obj>(file);
      const merged = mergeRemarkable(existing, decision, ctx.source, at);
      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) continue;
      await writeYamlAtomic(file, merged);
      dirty = true;
    }
    return out;
  });
  opts.dirty = dirty;
  if (dirty && opts.commit !== false) {
    if (!ctx.repo) throw new Error("aggregateConcerns requires repo when committing");
    await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
  }
  return stored;
}

/** Returns every stored concern artifact, ordered by creation time then id. */
export async function listConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
  const dir = dirOf(taskDir);
  let names: string[];
  try { names = await fs.promises.readdir(dir); } catch (err: any) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
    throw err;
  }
  const records = await Promise.all(names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml")).map(async (name) => {
    try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
  }));
  return records
    .filter((r): r is StoredConcernArtifact => typeof r?.kind === "string")
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
}

/** Returns open concerns ordered by creation time then id. */
export async function listOpenConcerns(taskDir: string): Promise<StoredConcernArtifact[]> {
  return (await listConcerns(taskDir)).filter((r) => r.status === "open");
}

/**
 * Counts stored concerns per status for the hollow state view (§18).
 * A missing directory is zeroes; corrupt entries are skipped with a warning
 * because the materialized view must never fail derivation.
 */
export async function countConcerns(taskDir: string): Promise<ConcernCounts> {
  const counts: ConcernCounts = { open: 0, dismissed: 0, routed: 0, resolved: 0 };
  const dir = dirOf(taskDir);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err: any) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return counts;
    throw err;
  }
  for (const name of names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml"))) {
    try {
      const concern = await readYaml<StoredConcernArtifact>(path.join(dir, name));
      if (typeof concern?.kind === "string" && Object.hasOwn(counts, concern.status)) {
        counts[concern.status as keyof ConcernCounts]++;
      }
    } catch (err: any) {
      console.warn(`[factory] Skipping corrupt concern file ${name}: ${err?.message ?? err}`);
    }
  }
  return counts;
}

/** Returns every stored concern/remarkable id for exact-id triage partitioning. */
export async function listConcernIds(taskDir: string): Promise<string[]> {
  const dir = dirOf(taskDir);
  try {
    return (await fs.promises.readdir(dir))
      .filter((name) => name.endsWith(".yaml"))
      .map((name) => name.slice(0, -".yaml".length));
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
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
      : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }];
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

/**
 * Applies architect confirmations to pending close-up proposals. Accept applies
 * the pending action (resolve closes the concern, carry routes it to the
 * architect); propagate only clears the proposal because the parent copy is a
 * cross-store write. Reject clears the proposal and changes nothing else.
 */
export function applyConcernConfirms(
  ctx: ConcernStoreContext & { confirms: Array<Pick<ConcernConfirms, "id" | "confirm">> }
): Promise<StoredConcernArtifact[]> {
  const ops = ctx.confirms.map((confirm): [string, Patch] => [confirm.id, (record) => {
    const pending = record.pendingResolution as StoredConcernArtifact["pendingResolution"];
    if (!pending) return record;
    if (confirm.confirm === "reject") return { ...record, pendingResolution: undefined };
    if (pending.action === "resolve") {
      return { ...record, status: "resolved", disposition: undefined, pendingResolution: undefined };
    }
    if (pending.action === "carry") {
      return { ...record, status: "routed", disposition: "architect", pendingResolution: undefined };
    }
    return { ...record, pendingResolution: undefined };
  }]);
  return mutate(ctx, ops, "factory: concerns confirmed");
}

/**
 * Applies a decision-level resolution at commit. `resolve` closes the concern
 * immediately so the next derive stops blocking affected items; `carry` leaves
 * a pending carry for the next architect ingest.
 */
export function applyConcernResolution(
  ctx: ConcernStoreContext & { resolution: { id: string; action: "resolve" | "carry"; note?: string }; by: string }
): Promise<StoredConcernArtifact[]> {
  const patch: Patch = (record, at) => ctx.resolution.action === "resolve"
    ? { ...record, status: "resolved", disposition: undefined, pendingResolution: undefined }
    : {
        ...record,
        pendingResolution: {
          action: "carry",
          ...(ctx.resolution.note !== undefined ? { note: ctx.resolution.note } : {}),
          by: ctx.by,
          at,
        },
      };
  return mutate(ctx, [[ctx.resolution.id, patch]], `factory: concerns resolved by ${ctx.by}`);
}

/**
 * Wave close-up fallback for triage-less open concerns. Tech debt becomes
 * optional debt and assumptions/risks/questions route to the architect;
 * blockers stay open for explicit triage. Only concerns that existed before
 * the close-up step are eligible, so its own findings stay open. Never assigns
 * a human-* disposition.
 */
export async function applyWaveCloseupFallback(
  ctx: ConcernStoreContext & { ids?: Iterable<string> }
): Promise<StoredConcernArtifact[]> {
  const eligible = ctx.ids ? new Set(ctx.ids) : undefined;
  const ops: Array<[string, Patch]> = [];
  for (const concern of await listConcerns(ctx.taskDir)) {
    if (eligible && !eligible.has(concern.id)) continue;
    // Epic copies are pushed open for parent awareness by the child close-up;
    // they are not triage-less local findings, so fallback leaves them alone.
    if (concern.source?.epic) continue;
    if (concern.status !== "open" || concern.pendingResolution || concern.disposition) continue;
    if (concern.kind === "blocker") continue;
    const disposition = concern.kind === "tech-debt" ? "optional" : "architect";
    ops.push([concern.id, (record) => ({ ...record, status: "routed", disposition })]);
  }
  return mutate(ctx, ops, "factory: concerns wave close-up fallback");
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

/** Rebuilds concern artifacts from committed step records; merging keeps it idempotent. Startup calls it after repairWorktree, so the worktree matches HEAD and ls-tree enumeration is authoritative. */
export async function reconcileConcerns(ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
  const records = await committedStepRecords(ctx);
  records.sort((a, b) => String(a.meta.endedAt ?? "").localeCompare(String(b.meta.endedAt ?? "")) || (a.meta.seq ?? 0) - (b.meta.seq ?? 0) || a.name.localeCompare(b.name));
  const reconciled: StoredConcernArtifact[] = [];
  let dirty = false;
  for (const r of records) {
    const concerns = [...(r.output.concerns ?? []), ...(r.output.newConcerns ?? [])].filter((c: any) => c && typeof c === "object");
    const remarkables = Array.isArray(r.output.remarkable) ? r.output.remarkable : [];
    if (!concerns.length && !remarkables.length) continue;
    const source: ConcernSource = { record: r.name, agent: String(r.meta.agent ?? "unknown"), ...(r.meta.name ? { step: String(r.meta.name) } : {}), ...(r.item ? { item: r.item } : {}) };
    const at = typeof r.meta.endedAt === "string" && r.meta.endedAt ? r.meta.endedAt : atOf(ctx);
    const o: { at: string; commit: false; dirty?: boolean } = { at, commit: false };
    reconciled.push(...(await aggregateConcerns({ ...ctx, source }, concerns, remarkables, o)));
    dirty = dirty || !!o.dirty;
  }
  if (dirty) await commitAll(ctx.repo, ctx.taskWt, "factory: concerns reconcile");
  return reconciled;
}

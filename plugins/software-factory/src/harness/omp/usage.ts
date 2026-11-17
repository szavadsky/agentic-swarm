import fs from "node:fs";
import path from "node:path";
import type { ServedUsage, Usage } from "../types.js";
import { addUsage, reportsUsage, zeroUsage } from "../usage.js";

/** Raw usage omp reports on an assistant message (`message_end.message.usage`). */
export interface OmpMessageUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoningTokens?: number;
  cost?: { total?: number } | number;
}

export interface OmpTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface OmpStats {
  sessionId?: string;
  sessionFile?: string;
  tokens?: OmpTokens;
  cost?: number;
}

/**
 * omp reports `totalTokens = input + output + cacheRead` and counts reasoning
 * inside `output`. The kernel keeps them disjoint, so subtract reasoning.
 * omp reports one cache-write bucket, so both retention tiers land in `cacheWrite5m`.
 */
export function costOf(cost: OmpMessageUsage["cost"]): number {
  if (typeof cost === "number") return cost;
  return cost?.total ?? 0;
}

export function usageFromMessage(raw: OmpMessageUsage | undefined): Usage {
  const usage = zeroUsage();
  if (!raw) return usage;
  const output = raw.output ?? 0;
  const reasoning = raw.reasoningTokens ?? 0;
  usage.in = raw.input ?? 0;
  usage.cacheRead = raw.cacheRead ?? 0;
  usage.cacheWrite5m = raw.cacheWrite ?? 0;
  usage.reasoningOut = reasoning;
  usage.out = Math.max(0, output - reasoning);
  usage.costUsd = costOf(raw.cost);
  return usage;
}

/** Session-stats counters are cumulative; the turn owns their non-negative delta. */
export function statsDelta(
  before: OmpStats | undefined,
  after: OmpStats | undefined,
): Usage {
  const b = before?.tokens;
  const a = after?.tokens;
  const delta = (x: number | undefined, y: number | undefined) =>
    Math.max(0, (y ?? 0) - (x ?? 0));
  const usage = zeroUsage();
  usage.in = delta(b?.input, a?.input);
  usage.cacheRead = delta(b?.cacheRead, a?.cacheRead);
  usage.cacheWrite5m = delta(b?.cacheWrite, a?.cacheWrite);
  usage.reasoningOut = delta(b?.reasoning, a?.reasoning);
  usage.out = Math.max(0, delta(b?.output, a?.output) - usage.reasoningOut);
  usage.costUsd = Math.max(0, (after?.cost ?? 0) - (before?.cost ?? 0));
  return usage;
}

/** omp assistant content is an array of parts on some frames and a plain string on others. */
export function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part: any) => part?.type === "text" && typeof part.text === "string",
    )
    .map((part: any) => part.text)
    .join("");
}

export interface OmpFrameSummary {
  /** Usage summed from `message_end` frames (fallback when session stats are unavailable). */
  usage: Usage;
  lastAssistantStopReason?: string;
  assistantText?: string;
}

/** Pure summary over the frames an adapter decides to retain. */
export function summarizeOmpFrames(frames: readonly any[]): OmpFrameSummary {
  const summary: OmpFrameSummary = { usage: zeroUsage() };
  for (const frame of frames) {
    if (frame?.type !== "message_end") continue;
    const message = frame.message;
    if (message?.role !== "assistant") continue;
    summary.usage = addUsage(summary.usage, usageFromMessage(message.usage));
    if (typeof message.stopReason === "string") {
      summary.lastAssistantStopReason = message.stopReason;
    }
    // get_last_assistant_text is authoritative, but keep the last message text as a fallback.
    const text = textOfContent(message.content);
    if (text) summary.assistantText = text;
  }
  return summary;
}

function jsonlFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsonlFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

/** Child transcripts live in a directory named after the parent file. */
function childTranscripts(sessionFile: string): string[] {
  return jsonlFiles(sessionFile.replace(/\.jsonl$/, ""));
}

/** Assistant messages one transcript recorded at or after `sinceMs`. */
function assistantMessages(file: string, sinceMs: number): any[] {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: any[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (message?.role !== "assistant") continue;
    const timestamp =
      typeof message.timestamp === "number" ? message.timestamp : 0;
    if (timestamp < sinceMs) continue;
    out.push(message);
  }
  return out;
}

/**
 * omp keeps subagent transcripts in a directory named after the parent session
 * file (without `.jsonl`); the parent's `get_session_stats` excludes them.
 * Sum assistant messages that started at or after `sinceMs`.
 */
export function subagentUsage(
  sessionFile: string | undefined,
  sinceMs: number,
): Usage {
  if (!sessionFile) return zeroUsage();
  let total = zeroUsage();
  for (const file of childTranscripts(sessionFile)) {
    for (const message of assistantMessages(file, sinceMs)) {
      total = addUsage(total, usageFromMessage(message.usage));
    }
  }
  return total;
}

/**
 * The model that served one assistant message as a pricing id: the provider
 * qualifies a bare model id (`opencode-go/beam-free`), while a message that
 * already names its provider keeps the transcript's spelling. `undefined`
 * when the transcript names no model.
 */
function servedModelId(message: any): string | undefined {
  const model = message?.model;
  if (typeof model !== "string" || model.length === 0) return undefined;
  const provider = message?.provider;
  if (typeof provider !== "string" || provider.length === 0) return model;
  const prefix = `${provider}/`;
  return model.toLowerCase().startsWith(prefix.toLowerCase())
    ? model
    : `${prefix}${model}`;
}

/**
 * Split one turn's assistant usage by the model that served it, from the
 * parent transcript plus the child sessions the turn spawned. `undefined`
 * when there is no transcript or when a usage-bearing message names no model:
 * a partial split would silently drop those tokens, so the caller keeps the
 * aggregate usage instead.
 */
export function servedUsage(
  sessionFile: string | undefined,
  sinceMs: number,
): ServedUsage[] | undefined {
  if (!sessionFile) return undefined;
  const byModel = new Map<string, Usage>();
  const files = [sessionFile, ...childTranscripts(sessionFile)];
  for (const file of files) {
    for (const message of assistantMessages(file, sinceMs)) {
      const usage = usageFromMessage(message.usage);
      if (!reportsUsage(usage)) continue;
      const id = servedModelId(message);
      if (!id) return undefined;
      byModel.set(id, addUsage(byModel.get(id) ?? zeroUsage(), usage));
    }
  }
  if (byModel.size === 0) return undefined;
  return [...byModel].map(([id, usage]) => ({ model: { id }, usage }));
}

/** Sum of a served split; the turn's total when the split is authoritative. */
export function servedTotal(served: readonly ServedUsage[]): Usage {
  return served.reduce(
    (total, entry) => addUsage(total, entry.usage),
    zeroUsage(),
  );
}

export interface OmpTurnUsage {
  /** Session stats before the prompt; absent when the RPC query failed. */
  before?: OmpStats;
  /** Session stats after the prompt; absent when the RPC query failed. */
  after?: OmpStats;
  /** Frame-sum usage, used when either stats snapshot is missing. */
  fallback: Usage;
  /** Parent session file; child transcripts live beside it. */
  sessionFile?: string;
  /** Epoch ms at which the prompt was sent; earlier child messages belong to an earlier turn. */
  sinceMs: number;
}

/**
 * Usage for one turn: the parent's stats delta (or the frame-sum fallback),
 * plus the child sessions it spawned. `get_session_stats` excludes children,
 * so without the second term their tokens and cost are recorded nowhere.
 */
export function turnUsage(input: OmpTurnUsage): Usage {
  const parent =
    input.before && input.after
      ? statsDelta(input.before, input.after)
      : input.fallback;
  return addUsage(parent, subagentUsage(input.sessionFile, input.sinceMs));
}

/** True when the session file already carries a compaction entry. */
export function isSessionCompacted(sessionFile: string | undefined): boolean {
  if (!sessionFile) return false;
  try {
    return fs.readFileSync(sessionFile, "utf8").includes('"type":"compaction"');
  } catch {
    return false;
  }
}

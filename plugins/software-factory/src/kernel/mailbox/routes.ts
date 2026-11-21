/** Rendering steers, routes, provenance and PM answers. */

import type { Outcome, SteerRoute, StepRecord } from "../types.js";
import type { Steer } from "./types.js";

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

import { createHash } from "node:crypto";
import yaml from "yaml";
import type { TaskFile, TaskKind } from "./types.js";

export class TaskFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskFileError";
  }
}

/** Slugs are namespaced by epic (`epic.name`), immutable, safe as branch and file name. */
const TASK_SLUG_REGEX = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function isValidTaskSlug(slug: string): boolean {
  return (
    TASK_SLUG_REGEX.test(slug) && !slug.includes("..") && slug.length <= 120
  );
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new TaskFileError(`frontmatter "${field}" must be a list of strings`);
  }
  return value as string[];
}

/**
 * Parses one task file. The file name is authoritative for the slug: a
 * frontmatter slug that disagrees with it is a validation finding, not a
 * silent rename.
 */
export function parseTaskFile(text: string, fileSlug: string): TaskFile {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) {
    throw new TaskFileError(`task "${fileSlug}" has no --- frontmatter ---`);
  }
  let meta: Record<string, unknown>;
  try {
    meta = (yaml.parse(match[1] ?? "") as Record<string, unknown>) ?? {};
  } catch (err) {
    throw new TaskFileError(
      `task "${fileSlug}" frontmatter is not valid YAML: ${(err as Error).message}`,
    );
  }
  const slug = typeof meta.slug === "string" ? meta.slug : fileSlug;
  if (slug !== fileSlug) {
    throw new TaskFileError(
      `task file "${fileSlug}" declares slug "${slug}": slugs are immutable and file names authoritative`,
    );
  }
  const kind: TaskKind = meta.kind === "spike" ? "spike" : "task";
  const title = typeof meta.title === "string" ? meta.title.trim() : "";
  if (!title) throw new TaskFileError(`task "${slug}" has no title`);
  return {
    slug,
    title,
    kind,
    flow:
      typeof meta.flow === "string" && meta.flow
        ? meta.flow
        : "implement-review",
    deps: stringList(meta.deps ?? meta.after, "deps"),
    scope: stringList(meta.scope, "scope"),
    tier: typeof meta.tier === "string" ? meta.tier : undefined,
    base: typeof meta.base === "string" && meta.base ? meta.base : undefined,
    source: typeof meta.source === "string" ? meta.source : "",
    body: (match[2] ?? "").trim(),
  };
}

export function renderTaskFile(task: TaskFile): string {
  const front: Record<string, unknown> = {
    slug: task.slug,
    title: task.title,
    kind: task.kind,
    flow: task.flow,
    deps: task.deps,
    scope: task.scope,
  };
  if (task.tier) front.tier = task.tier;
  if (task.base) front.base = task.base;
  if (task.source) front.source = task.source;
  return `---\n${yaml.stringify(front).trimEnd()}\n---\n\n${task.body.trim()}\n`;
}

/** The observable completion statement from the brief; part of the material hash. */
export function doneWhen(body: string): string {
  const line = body.split(/\r?\n/).find((l) => /^done when:/i.test(l.trim()));
  return line ? line.trim() : "";
}

/**
 * Material hash: frozen-task comparisons must ignore cosmetic edits but catch
 * a changed dependency set, scope, flow, tier, kind, slug or done-when.
 */
export function materialHash(task: TaskFile): string {
  const canonical = JSON.stringify([
    task.slug,
    task.kind,
    task.flow,
    [...task.deps].sort(),
    [...task.scope],
    task.tier ?? "",
    task.base ?? "",
    doneWhen(task.body),
  ]);
  return createHash("sha1").update(canonical, "utf8").digest("hex");
}

/** Script-checkable plan properties; returns human-readable findings, empty when valid. */
export function validateTaskGraph(
  tasks: TaskFile[],
  opts: { parked?: ReadonlySet<string> } = {},
): string[] {
  const findings: string[] = [];
  const bySlug = new Map<string, TaskFile>();
  for (const task of tasks) {
    if (!isValidTaskSlug(task.slug)) {
      findings.push(
        `slug "${task.slug}" is not namespaced kebab-case (example: auth.token-refresh)`,
      );
    }
    if (task.scope.length === 0) {
      findings.push(
        `task "${task.slug}" has no scope: declare the predicted area it works in`,
      );
    }
    if (bySlug.has(task.slug)) {
      findings.push(`slug "${task.slug}" is declared twice`);
    }
    bySlug.set(task.slug, task);
  }
  for (const task of tasks) {
    for (const dep of task.deps) {
      if (!bySlug.has(dep)) {
        findings.push(`task "${task.slug}" depends on missing task "${dep}"`);
      }
      if (dep === task.slug) {
        findings.push(`task "${task.slug}" depends on itself`);
      }
    }
    if (task.base !== undefined) {
      if (!bySlug.has(task.base)) {
        findings.push(
          `task "${task.slug}" continues missing task "${task.base}"`,
        );
      } else if (opts.parked && !opts.parked.has(task.base)) {
        findings.push(
          `task "${task.slug}" continues "${task.base}", which is not parked`,
        );
      }
    }
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const walk = (slug: string, path: string[]): void => {
    if (done.has(slug)) return;
    if (visiting.has(slug)) {
      findings.push(`dependency cycle: ${[...path, slug].join(" -> ")}`);
      return;
    }
    visiting.add(slug);
    for (const dep of bySlug.get(slug)?.deps ?? []) {
      if (bySlug.has(dep)) walk(dep, [...path, slug]);
    }
    visiting.delete(slug);
    done.add(slug);
  };
  for (const slug of [...bySlug.keys()].sort()) walk(slug, []);
  return [...new Set(findings)];
}

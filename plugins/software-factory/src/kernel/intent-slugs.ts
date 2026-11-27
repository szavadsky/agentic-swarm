/**
 * Slug annotations in the goal intent: `[[SliceSlug]]`, or
 * `[[ctxOnly:SliceSlug]]` for context. The parsed set is what the
 * slug-footnote consumes and the slug-triage feeds; the architect's
 * intent status is keyed by slug and validated against it.
 */
import fs from "node:fs";
import path from "node:path";
import type { ArtifactStore, Outcome } from "./types.js";
import type {
  IntentSlug,
  IntentSourceFile,
  ResolvedGoalIntent,
} from "./intent-slugs-types.js";

/** One annotation on one line; brackets never nest or span lines. */
const ANNOTATION = /\[\[([^\[\]\n]*)\]\]/g;

/** A markdown ATX heading opens with one to six hashes. */
const HEADING = /^#{1,6}\s/;

/**
 * Phrases that make a path in the goal note the intent's source rather than a
 * passing file reference. The note is prose, so the pointer is read from the
 * line that names it, never guessed from a bare path.
 */
const SOURCE_MARKER =
  /\b(source of truth|authoritative|binds?|as specified in|specified in|as per)\b/i;

/** A repo-relative path inside the goal checkout, or undefined outside it. */
export function repoRel(checkout: string, abs: string): string | undefined {
  const root = path.resolve(checkout);
  const resolvedAbs = path.resolve(abs);
  const rel = path.relative(root, resolvedAbs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel))
    return undefined;
  return rel.split(path.sep).join("/");
}

/** Backticked candidate tokens on lines that mark an intent source of truth. */
export function sourceReferenceTokens(note: string): string[] {
  const tokens: string[] = [];
  for (const line of note.split("\n")) {
    if (!SOURCE_MARKER.test(line)) continue;
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      if (match[1] !== undefined) tokens.push(match[1]);
    }
  }
  return tokens;
}

/** The regular file inside `checkout` that a backticked token names, or undefined. */
export function checkoutSourceFile(
  checkout: string,
  token: string,
): IntentSourceFile | undefined {
  const root = path.resolve(checkout);
  const raw = token.trim().replace(/^\.\//, "");
  if (raw === "" || path.isAbsolute(raw)) return undefined;
  const abs = path.resolve(root, raw);
  const rel = repoRel(root, abs);
  if (rel === undefined) return undefined;
  try {
    if (!fs.statSync(abs).isFile()) return undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  return { rel, abs };
}

function missingSourceReason(
  checkout: string | undefined,
  ref: string,
): string {
  if (checkout === undefined) return "no checkout directory to resolve it from";
  const root = path.resolve(checkout);
  const trimmed = ref.trim().replace(/^\.\//, "");
  if (path.isAbsolute(trimmed)) return "path escapes the repository checkout";
  const abs = path.resolve(root, trimmed);
  if (repoRel(root, abs) === undefined)
    return "path escapes the repository checkout";
  try {
    return fs.statSync(abs).isFile() ? "unresolvable source" : "not a file";
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return "file does not exist";
    throw err;
  }
}

function resolvePointerReference(
  note: string,
  checkout?: string,
):
  | { kind: "none" }
  | { kind: "resolved"; source: IntentSourceFile }
  | { kind: "missing"; ref: string; reason: string } {
  const tokens = sourceReferenceTokens(note);
  if (tokens.length === 0) return { kind: "none" };
  if (checkout !== undefined) {
    for (const token of tokens) {
      const found = checkoutSourceFile(checkout, token);
      if (found !== undefined) return { kind: "resolved", source: found };
    }
  }
  // Only treat an unresolved token as a file reference when it looks like a
  // path or file name, so backticked identifiers in prose are not misread.
  const ref = tokens.find((token) => /[./\\]/.test(token.trim()))?.trim();
  if (ref === undefined) return { kind: "none" };
  return { kind: "missing", ref, reason: missingSourceReason(checkout, ref) };
}

/** The heading's text: hashes and annotations out, whitespace settled. */
function headingOf(line: string): string {
  const text = line.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "");
  return text
    .replace(/\[\[[^\[\]\n]*\]\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every slug the intent annotates, in order, first occurrence wins. A repeated
 * annotation keeps its first heading and ctxOnly flag; an empty annotation
 * names no slug.
 */
export function parseIntentSlugs(md: string): IntentSlug[] {
  const found: IntentSlug[] = [];
  const seen = new Set<string>();
  let heading = "";
  for (const line of md.split("\n")) {
    if (HEADING.test(line)) heading = headingOf(line);
    for (const match of line.matchAll(ANNOTATION)) {
      const raw = match[1] ?? "";
      const ctxOnly = raw.startsWith("ctxOnly:");
      const slug = (ctxOnly ? raw.slice("ctxOnly:".length) : raw).trim();
      if (slug.length === 0 || seen.has(slug)) continue;
      seen.add(slug);
      found.push({ slug, ctxOnly, heading });
    }
  }
  return found;
}

/**
 * Resolves the goal's intent and its parsed slug annotations. An inline
 * annotated `intent.md` keeps its own content; an unannotated pointer note
 * resolves its named repo source inside `checkout` and fails explicitly when
 * that reference does not resolve.
 */
export async function resolveGoalIntent(
  store: ArtifactStore,
  opts?: { checkout?: string },
): Promise<ResolvedGoalIntent> {
  const md = await store.readFile("intent.md");
  if (md === null) return { kind: "absent" };
  const inlineSlugs = parseIntentSlugs(md);
  if (inlineSlugs.length > 0) {
    return { kind: "inline", path: "intent.md", text: md, slugs: inlineSlugs };
  }
  const pointer = resolvePointerReference(md, opts?.checkout);
  if (pointer.kind === "none") {
    return { kind: "inline", path: "intent.md", text: md, slugs: [] };
  }
  if (pointer.kind === "missing") {
    return {
      kind: "missing-source",
      ref: pointer.ref,
      reason: pointer.reason,
    };
  }
  const text = fs.readFileSync(pointer.source.abs, "utf8");
  return {
    kind: "pointer",
    path: pointer.source.rel,
    text,
    slugs: parseIntentSlugs(text),
  };
}

/**
 * The intent's text with its annotations removed and its whitespace settled:
 * two intents with the same prose differ only in which slugs they annotate.
 * The slug-triage turn must leave this unchanged — it adds annotations in
 * place, never words.
 */
export function intentProse(md: string): string {
  return md
    .split("\n")
    .map((line) =>
      line
        .replace(/\[\[[^\[\]\n]*\]\]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * An intent status keyed by slug, against the intent's parsed set. An absent
 * or empty status carries no claim; a duplicate names one slug twice; an
 * entry with no slug (a pre-slug record) has no key to check and is a finding.
 */
export function intentStatusSlugFindings(
  md: string,
  outcome: Outcome,
  sourcePath = "intent.md",
): string[] {
  const entries = outcome.intentStatus;
  if (!entries || entries.length === 0) return [];
  const known = new Set(parseIntentSlugs(md).map((item) => item.slug));
  const findings: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.slug === undefined) {
      const section = entry.section ? ` for section "${entry.section}"` : "";
      findings.push(
        `intent status entry${section} has no slug: name the [[Slug]] it reports on`,
      );
      continue;
    }
    if (seen.has(entry.slug)) {
      findings.push(
        `intent slug "${entry.slug}" is named twice; one entry per slug`,
      );
      continue;
    }
    seen.add(entry.slug);
    if (!known.has(entry.slug)) {
      findings.push(
        `unknown intent slug "${entry.slug}": no [[${entry.slug}]] annotation in ${sourcePath}`,
      );
    }
  }
  return findings;
}

/**
 * The architect turn's intent-status findings against the goal intent (or the
 * repo file a pointer intent names as its source). No `intent.md` skips the
 * check; a broken pointer reference is a validation finding, never an empty
 * slug set.
 */
export async function architectIntentStatusFindings(
  store: ArtifactStore,
  outcome: Outcome,
  opts?: { checkout?: string },
): Promise<string[]> {
  if (!outcome.intentStatus || outcome.intentStatus.length === 0) return [];
  const resolved = await resolveGoalIntent(store, opts);
  if (resolved.kind === "absent") return [];
  if (resolved.kind === "missing-source") {
    return [
      `referenced intent file "${resolved.ref}" could not be resolved (${resolved.reason})`,
    ];
  }
  return intentStatusSlugFindings(resolved.text, outcome, resolved.path);
}

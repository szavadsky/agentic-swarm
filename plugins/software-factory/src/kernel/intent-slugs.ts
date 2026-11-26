/**
 * Slug annotations in the goal intent: `[[SliceSlug]]`, or
 * `[[ctxOnly:SliceSlug]]` for context. The parsed set is what the
 * slug-footnote consumes and the slug-triage feeds; the architect's
 * intent status is keyed by slug and validated against it.
 */
import type { ArtifactStore } from "./types.js";
import type { IntentSlug } from "./intent-slugs-types.js";
import type { Outcome } from "./types.js";

/** One annotation on one line; brackets never nest or span lines. */
const ANNOTATION = /\[\[([^\[\]\n]*)\]\]/g;

/** A markdown ATX heading opens with one to six hashes. */
const HEADING = /^#{1,6}\s/;

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
 * An intent status keyed by slug, against the intent's parsed set. An absent
 * or empty status carries no claim; a duplicate names one slug twice; an
 * entry with no slug (a pre-slug record) has no key to check and is a finding.
 */
export function intentStatusSlugFindings(
  md: string,
  outcome: Outcome,
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
        `unknown intent slug "${entry.slug}": no [[${entry.slug}]] annotation in intent.md`,
      );
    }
  }
  return findings;
}

/**
 * The architect turn's intent-status findings against the goal intent. No
 * intent file means no parsed set to check against, so the check is skipped.
 */
export async function architectIntentStatusFindings(
  store: ArtifactStore,
  outcome: Outcome,
): Promise<string[]> {
  if (!outcome.intentStatus || outcome.intentStatus.length === 0) return [];
  const md = await store.readFile("intent.md");
  if (md === null) return [];
  return intentStatusSlugFindings(md, outcome);
}

import { formatPatch, OMIT_HEADERS, structuredPatch } from "diff";

/** Context lines each side of an intent diff's changes. */
const DIFF_CONTEXT = 3;

/**
 * A unified diff of two intent texts, three context lines per hunk. The
 * library treats a trailing newline as the terminator of the last line, so the
 * extra one restores the empty final element `split("\n")` yields; the hunk
 * counts then match the lines the intent records have always shown.
 */
export function unifiedDiff(
  before: string,
  after: string,
  rel: string,
): string {
  const patch = structuredPatch(
    rel,
    rel,
    `${before}\n`,
    `${after}\n`,
    undefined,
    undefined,
    { context: DIFF_CONTEXT },
  );
  const out = [`--- ${rel}`, `+++ ${rel}`];
  if (patch.hunks.length > 0)
    out.push(formatPatch(patch, OMIT_HEADERS).slice(0, -1));
  return out.join("\n");
}

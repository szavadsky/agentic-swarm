/** Text matching shared by the debt and QA finders. */

/**
 * A quote matches when it equals the debt text or the two contain each other.
 * A short fragment (<24 chars on the shorter side) never matches, so
 * `debt closed: tests` cannot retire an unrelated paragraph.
 */
export function quotes(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 24) return false;
  return a.includes(b) || b.includes(a);
}

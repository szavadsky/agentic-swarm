/**
 * The provider's stated wait before a pool or model may serve again, in
 * milliseconds. Two recorded forms matter: "Resets in 130h19m23s" (seconds are
 * noise) and "retry-after-ms=38240413", the millisecond figure a 429 carries.
 * Undefined when the text names no positive wait.
 */
const RESET_TEXT =
  /resets?\s+in\s+(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?/i;
const RETRY_AFTER_MS = /retry-after-ms\s*[=:]\s*(\d+(?:\.\d+)?)/i;

export function statedWaitMs(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const retryAfter = RETRY_AFTER_MS.exec(text);
  if (retryAfter) return positiveMs(Number(retryAfter[1]));
  const match = RESET_TEXT.exec(text);
  if (!match) return undefined;
  const hours = match[1] === undefined ? 0 : Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  return positiveMs((hours * 60 + minutes) * 60_000);
}

function positiveMs(ms: number): number | undefined {
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

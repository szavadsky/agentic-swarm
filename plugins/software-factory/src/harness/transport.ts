/**
 * Transport loss: the request never reached a verdict. Harnesses report a dead
 * backend in their error text (`fetch failed` + `ECONNRESET`, `socket closed`,
 * `connect ETIMEDOUT`) rather than as an HTTP status, so every adapter matches
 * the same list and classifies it as transient `infra: network`.
 */
const TRANSPORT =
  /econn(reset|refused|aborted)|etimedout|epipe|enetunreach|eai_again|socket (?:closed|hang ?up)|fetch failed|network (?:error|failure|request failed)|connection (?:reset|closed|refused)|other side closed/i;

export function isTransportFailure(text: string): boolean {
  return TRANSPORT.test(text);
}

/** What the front turn hands the launch: its action and the reason for a stop. */

/** What the launch does after the front turn (or after reading an existing class). */
export type FrontAction = "boundary" | "dispatch" | "blocked" | "infra";

export interface FrontResult {
  action: FrontAction;
  /** Goal-relative front pack, only when this turn prepared one for a bigger goal. */
  packPath?: string;
  /** Why the front ended the launch as blocked or infra. */
  cause?: string;
  /** Which ingestion step the stop came from: a step, or the classifier, or a runner error. */
  step?: string;
}

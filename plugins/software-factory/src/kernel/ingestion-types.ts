/** The goal-start step sequence's result. */

export interface IngestionResult {
  /** A failing step's cause; absent when every step completed. */
  cause?: string;
  /** Which step failed. */
  step?: string;
  /** The step ended blocked on input only the user can supply, not as infra. */
  blocked?: boolean;
}

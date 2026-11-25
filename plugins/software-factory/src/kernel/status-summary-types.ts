/**
 * The one-paragraph status the user reads: the latest summary a PM turn wrote,
 * or the kernel's own account when no PM turn wrote one. The kernel derivation
 * reads only derived task counts, so a goal with records never shows an
 * unknown status.
 */
export interface StatusSummary {
  /** `pm` when a PM turn wrote the paragraph; `mechanical` when the kernel derived it. */
  source: "pm" | "mechanical";
  text: string;
  iteration: number;
  /** `records/<dir>` of the PM turn; absent for the kernel's derivation. */
  record?: string;
}

/** The task counts the mechanical account names. */
export interface StatusTaskCounts {
  landed: number;
  total: number;
  open: number;
  parked: number;
}

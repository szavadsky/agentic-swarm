/** The drain controller's contract for SIGINT/SIGTERM. */

export type DrainSignal = "SIGINT" | "SIGTERM";

export type Terminator = (graceMs?: number) => Promise<void>;

export interface DrainController {
  /** First signal: stop dispatching, let in-flight turns finish. */
  readonly draining: boolean;
  /** Second signal: kill child process groups; harnesses return partial usage. */
  readonly aborted: boolean;
  readonly interruptedBy?: DrainSignal;
  shouldStop(): boolean;
  /** Signal entrypoint, public so the drain contract is testable without OS signals. */
  handleSignal(signal: DrainSignal): void;
  install(): () => void;
}

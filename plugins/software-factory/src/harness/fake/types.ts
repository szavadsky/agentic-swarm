/** The scripted test harness's public shapes, held apart from its behavior. */

import type { Caps, LiveAgents, TurnRequest, TurnResult } from "../types.js";

export interface FakeHarnessOptions {
  id?: string;
  caps?: Partial<Caps>;
  /**
   * When given, the fake answers `probe` with these effort levels for every
   * model; absent keeps the fake probe-less and pre-flight's static checks.
   */
  probe?: { effort: readonly string[] | null };
  /**
   * The live handle the fake offers to a request that asks for `onLive`; tests
   * use it to simulate children, spawns and steers.
   */
  live?: (req: TurnRequest) => LiveAgents | Promise<LiveAgents>;
}

export interface FakeTurnContext {
  /** 1-based turn number within this harness. */
  n: number;
  /** Writes `value` as JSON to `req.outcomePath`; throws when the request has none. */
  writeOutcome(value: unknown): void;
}

export type FakeTurnHandler = (
  req: TurnRequest,
  ctx: FakeTurnContext,
) => TurnResult | Promise<TurnResult>;

export interface FakeScriptOptions {
  /**
   * Binds the handler to the requests it serves. The first queued handler
   * whose `when` matches serves the turn; handlers without `when` match any
   * request, so tests that never bind keep positional FIFO order.
   */
  when?: (req: TurnRequest) => boolean;
  /**
   * A reusable handler that serves every matching request before an unbound
   * scripted turn, but after an explicit bound handler. Mandatory background
   * turns can then use a neutral default without consuming another step's
   * positional script.
   */
  fallback?: boolean;
}

/** A scripted turn's identity, recovered from the request's record path. */
export interface FakeTurnIdentity {
  /**
   * Record directory name, e.g. `00007-i1-beta-implement-r1`. Empty when the
   * request carries no outcomePath.
   */
  record: string;
  /** Task slug, when the record names one. */
  slug?: string;
  /** Step id, when the record names one. */
  step?: string;
}

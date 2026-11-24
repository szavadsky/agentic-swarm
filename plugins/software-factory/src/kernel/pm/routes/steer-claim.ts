/** The steers one PM turn answers, including any injected while it ran. */
import type { LiveAgents } from "../../../harness/types.js";
import type { Steer } from "../../mailbox.js";
import type { LiveSteerSessions } from "../../sessions.js";
import { steerInjectionNote } from "../prompts.js";

/**
 * The batch the mailbox handed this PM turn plus every steer injected while a
 * rung was live. One map feeds the rung prompt, the validation and the commit,
 * so an injected steer is answered by the same turn and no second PM starts.
 */
export class SteerClaim {
  private readonly steers: Map<string, Steer>;
  private release: (() => void) | undefined;

  constructor(steers: readonly Steer[]) {
    this.steers = new Map(steers.map((steer) => [steer.id, steer]));
  }

  all(): Steer[] {
    return [...this.steers.values()];
  }

  byId(): ReadonlyMap<string, Steer> {
    return this.steers;
  }

  /**
   * Offers this rung's live session as the injection target. A harness that
   * exposes no session steer leaves the steer queued for a later turn.
   */
  attach(agents: LiveAgents, sessions: LiveSteerSessions | undefined): void {
    const steerSession = agents.steerSession;
    if (sessions === undefined || steerSession === undefined) return;
    // A repair or fallback call inside the same turn replaces the dead handle.
    this.detach();
    this.release = sessions.register({
      inject: (steer) => this.inject(steerSession, steer),
    });
  }

  /** Detaches when the rung's harness call ends, before the next rung starts. */
  detach(): void {
    this.release?.();
    this.release = undefined;
  }

  /** Claims only a delivered steer: a refused injection stays queued. */
  private async inject(
    steerSession: (message: string) => Promise<void>,
    steer: Steer,
  ): Promise<boolean> {
    if (this.steers.has(steer.id)) return true;
    await steerSession(steerInjectionNote(steer));
    this.steers.set(steer.id, steer);
    return true;
  }
}

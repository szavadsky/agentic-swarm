import fs from "node:fs";
import path from "node:path";
import type {
  Caps,
  Harness,
  ModelRef,
  SessionRef,
  Stop,
  TurnRequest,
  TurnResult,
  Usage,
} from "../types.js";

export const DEFAULT_FAKE_CAPS: Caps = {
  resume: true,
  compact: "local",
  fork: false,
  subagents: "none",
  structuredOutput: "none",
  effort: [],
  usage: { cache: true, cost: true },
};

export interface FakeHarnessOptions {
  id?: string;
  caps?: Partial<Caps>;
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

export function emptyUsage(): Usage {
  return {
    in: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    out: 0,
    reasoningOut: 0,
  };
}

/**
 * Builds a TurnResult for a scripted handler. Missing fields default to a
 * completed turn with zero usage; the harness fills in the session when the
 * handler leaves it out.
 */
export function fakeTurnResult(
  req: TurnRequest,
  patch: Partial<Omit<TurnResult, "usage">> & { usage?: Partial<Usage> } = {},
): TurnResult {
  const model = patch.model ?? req.model;
  const stop = patch.stop ?? { kind: "done" };
  const usage = { ...emptyUsage(), ...patch.usage };
  return {
    stop,
    text: patch.text ?? "",
    usage,
    session: patch.session ?? req.session,
    model,
    attempts: patch.attempts ?? [{ model, stop, usage }],
    transcript: patch.transcript,
  };
}

/**
 * Scripted harness for behavior tests. Each call to `turn` consumes one
 * handler from a queue; the handler may write files under `req.cwd` and the
 * outcome file, and returns the TurnResult the harness reports.
 *
 * Session ids: a resumed request keeps its SessionRef (including id and cwd),
 * a fresh request gets a unique id. Usage numbers and every Stop cause
 * (including each `infra` cause) pass through unchanged.
 */
export class FakeHarness implements Harness {
  public readonly id: string;
  public readonly calls: TurnRequest[] = [];
  public readonly compactions: SessionRef[] = [];
  private readonly capsConfig: Caps;
  private readonly handlers: FakeTurnHandler[] = [];
  private readonly sessions = new Map<string, SessionRef>();
  private sessionCounter = 0;

  constructor(opts: FakeHarnessOptions = {}) {
    this.id = opts.id ?? "fake";
    this.capsConfig = {
      ...DEFAULT_FAKE_CAPS,
      ...opts.caps,
      usage: { ...DEFAULT_FAKE_CAPS.usage, ...opts.caps?.usage },
    };
  }

  /** Queues the next turn's scripted behavior. */
  script(handler: FakeTurnHandler): this {
    this.handlers.push(handler);
    return this;
  }

  /** Queues a turn that only differs from the defaults by `patch`. */
  scriptResult(
    patch: Partial<Omit<TurnResult, "usage">> & { usage?: Partial<Usage> },
  ): this {
    return this.script((req) => fakeTurnResult(req, patch));
  }

  async caps(_model: ModelRef): Promise<Caps> {
    return this.capsConfig;
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    this.calls.push(req);
    const handler = this.handlers.shift();
    if (!handler) {
      throw new Error(
        `FakeHarness: no scripted turn for request ${this.calls.length}`,
      );
    }

    const n = this.calls.length;
    const outcome = await handler(req, {
      n,
      writeOutcome: (value) => {
        if (!req.outcomePath) {
          throw new Error("FakeHarness: request has no outcomePath");
        }
        fs.mkdirSync(path.dirname(req.outcomePath), { recursive: true });
        fs.writeFileSync(
          req.outcomePath,
          `${JSON.stringify(value, null, 2)}\n`,
          "utf8",
        );
      },
    });

    const session = outcome.session ?? req.session ?? this.newSession(req);
    this.sessions.set(session.id, session);

    return {
      ...outcome,
      stop: outcome.stop as Stop,
      usage: { ...emptyUsage(), ...outcome.usage },
      session,
    };
  }

  async compact(ref: SessionRef): Promise<SessionRef> {
    this.compactions.push(ref);
    const compacted = { ...ref, compacted: true };
    this.sessions.set(compacted.id, compacted);
    return compacted;
  }

  /** Sessions the harness has seen, keyed by id. */
  knownSessions(): ReadonlyMap<string, SessionRef> {
    return this.sessions;
  }

  private newSession(req: TurnRequest): SessionRef {
    return {
      harness: this.id,
      id: `fake-session-${++this.sessionCounter}`,
      cwd: req.cwd,
      model: req.model,
      lastRequestStartedAt: new Date().toISOString(),
      retentionTier: "short",
      compacted: false,
    };
  }
}

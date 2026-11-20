import fs from "node:fs";
import path from "node:path";
import type {
  Caps,
  CompactResult,
  Harness,
  LiveAgents,
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
  subagents: "none",
  structuredOutput: "none",
  effort: [],
  usage: { cache: true, cost: true },
};

export interface FakeHarnessOptions {
  id?: string;
  caps?: Partial<Caps>;
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
+   * Binds the handler to the requests it serves. The first queued handler
+   * whose `when` matches serves the turn; handlers without `when` match any
+   * request, so tests that never bind keep positional FIFO order.
+   */
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
+   * Record directory name, e.g. `00007-i1-beta-implement-r1`. Empty when the
+   * request carries no outcomePath.
+   */
  record: string;
  /** Task slug, when the record names one. */
  slug?: string;
  /** Step id, when the record names one. */
  step?: string;
}

/**
+ * Recovers the turn's identity from `req.outcomePath`. Record directories are
+ * `NNNNN-i<iteration>[-<slug>]-<step>-r<round>`; agent steps are single
+ * tokens, so the step is the last segment and the slug is the rest. Script
+ * steps never reach the harness, so their dashed ids never appear here.
+ */
export function fakeTurnIdentity(req: TurnRequest): FakeTurnIdentity {
  if (!req.outcomePath) return { record: "" };
  const record = path.basename(path.dirname(req.outcomePath));
  const middle = record.replace(/^\d{5}-i\d+/, "").replace(/-r\d+$/, "");
  const parts = middle.split("-").filter((part) => part.length > 0);
  if (parts.length === 0) return { record };
  const step = parts[parts.length - 1];
  const slug = parts.length > 1 ? parts.slice(0, -1).join("-") : undefined;
  return { record, slug, step };
}

/** Names the request an unmatched turn carried, for the failure message. */
function describeRequest(req: TurnRequest): string {
  const { record, slug, step } = fakeTurnIdentity(req);
  if (!record) return "";
  const named = [
    slug === undefined ? "no slug" : `slug "${slug}"`,
    step === undefined ? "no step" : `step "${step}"`,
  ].join(", ");
  return ` (${record}: ${named})`;
}

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
    served: patch.served,
    transcript: patch.transcript,
  };
}

/**
 * Scripted harness for behavior tests. Each call to `turn` consumes the first
 * queued handler whose `when` matches (or the head of the queue when nothing
 * is bound); the handler may write files under `req.cwd` and the outcome
 * file, and returns the TurnResult the harness reports.
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
  private readonly handlers: {
    handler: FakeTurnHandler;
    when?: (req: TurnRequest) => boolean;
    fallback: boolean;
  }[] = [];
  private readonly sessions = new Map<string, SessionRef>();
  private readonly live?: (
    req: TurnRequest,
  ) => LiveAgents | Promise<LiveAgents>;
  private sessionCounter = 0;

  constructor(opts: FakeHarnessOptions = {}) {
    this.id = opts.id ?? "fake";
    this.live = opts.live;
    this.capsConfig = {
      ...DEFAULT_FAKE_CAPS,
      ...opts.caps,
      usage: { ...DEFAULT_FAKE_CAPS.usage, ...opts.caps?.usage },
    };
  }

  /**
+   * Queues a turn's scripted behavior. With `when`, the handler serves the
+   * first matching request no matter which turn calls first; without it, the
+   * handler serves the next unmatched request in queue order.
+   */
  script(handler: FakeTurnHandler, opts: FakeScriptOptions = {}): this {
    this.handlers.push({
      handler,
      when: opts.when,
      fallback: opts.fallback ?? false,
    });
    return this;
  }

  /** Queues a turn that only differs from the defaults by `patch`. */
  scriptResult(
    patch: Partial<Omit<TurnResult, "usage">> & { usage?: Partial<Usage> },
    opts: FakeScriptOptions = {},
  ): this {
    return this.script((req) => fakeTurnResult(req, patch), opts);
  }

  async caps(_model: ModelRef): Promise<Caps> {
    return this.capsConfig;
  }

  /** Consumes the handler that serves this request, or throws when none does. */
  private takeHandler(
    req: TurnRequest,
    n: number,
  ): (typeof this.handlers)[number] {
    // The match runs synchronously at call time, so concurrent turns cannot
    // interleave between the scan and the splice. A fallback bound to this
    // request beats an unbound positional script, while an explicit binding
    // still beats the fallback.
    const matches = (entry: { when?: (req: TurnRequest) => boolean }) =>
      !entry.when || entry.when(req);
    let index = this.handlers.findIndex(
      (entry) => entry.fallback && matches(entry),
    );
    if (index >= 0) {
      const explicit = this.handlers.findIndex(
        (entry) =>
          !entry.fallback && entry.when !== undefined && matches(entry),
      );
      if (explicit >= 0) index = explicit;
    } else {
      index = this.handlers.findIndex(matches);
    }
    if (index < 0) {
      throw new Error(
        `FakeHarness: no scripted turn for request ${n}${describeRequest(req)}`,
      );
    }
    const entry = this.handlers[index];
    if (!entry) throw new Error("FakeHarness: handler index out of range");
    if (!entry.fallback) this.handlers.splice(index, 1);
    return entry;
  }

  /** Resolves the session a turn reports, keeping or refreshing its lifetime. */
  private resolveSession(req: TurnRequest, outcome: TurnResult): SessionRef {
    // A resumed request keeps its id, cwd and compacted flag, but the request
    // restarts the cache lifetime, as the real adapters report. Only a
    // handler-set session (a different ref than the request carried) passes
    // through untouched, so tests can stage a cold transcript.
    const overridden =
      outcome.session !== undefined && outcome.session !== req.session;
    const base = overridden
      ? outcome.session!
      : (req.session ?? this.newSession(req));
    const session = overridden
      ? base
      : { ...base, lastRequestStartedAt: new Date().toISOString() };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Writes the handler's outcome JSON to the request's outcome path. */
  private writeOutcome(req: TurnRequest, value: unknown): void {
    if (!req.outcomePath) {
      throw new Error("FakeHarness: request has no outcomePath");
    }
    fs.mkdirSync(path.dirname(req.outcomePath), { recursive: true });
    fs.writeFileSync(
      req.outcomePath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    this.calls.push(req);
    if (req.onLive && this.live) req.onLive(await this.live(req));
    const n = this.calls.length;
    const entry = this.takeHandler(req, n);
    const outcome = await entry.handler(req, {
      n,
      writeOutcome: (value) => this.writeOutcome(req, value),
    });
    const session = this.resolveSession(req, outcome);
    return {
      ...outcome,
      stop: outcome.stop as Stop,
      usage: { ...emptyUsage(), ...outcome.usage },
      session,
    };
  }

  /**
   * A hot compaction: the transcript reread from cache plus the summary
   * write. Fixed synthetic tokens; the kernel prices them like any usage.
   */
  async compact(ref: SessionRef): Promise<CompactResult> {
    this.compactions.push(ref);
    const session = {
      ...ref,
      lastRequestStartedAt: new Date().toISOString(),
      compacted: true,
    };
    this.sessions.set(session.id, session);
    return { session, usage: { ...emptyUsage(), cacheRead: 8000, out: 400 } };
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

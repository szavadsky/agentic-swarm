import type {
  AgentOutcome,
  AgentRun,
  Harness,
  JSONSchema,
} from "../types.js";

export type ScriptedOutcome =
  | AgentOutcome
  | AgentOutcome[]
  | ((run: AgentRun) => Promise<AgentOutcome> | AgentOutcome);

export type ScriptedCompleteHandler = (params: {
  role: string;
  models: string[];
  system: string;
  prompt: string;
  schema: JSONSchema;
}) => Promise<unknown> | unknown;

export type HarnessCall =
  | { type: "run"; run: AgentRun }
  | {
      type: "complete";
      complete: {
        role: string;
        models: string[];
        system: string;
        prompt: string;
        schema: JSONSchema;
      };
    };

export class FakeHarness implements Harness {
  private outcomesByLabel = new Map<string, ScriptedOutcome>();
  private completeHandlers: ScriptedCompleteHandler[] = [];
  public defaultCompleteHandler?: ScriptedCompleteHandler;

  public readonly calls: HarnessCall[] = [];
  public readonly knownSessionIds = new Set<string>();
  private sessionCounter = 0;

  public scriptOutcome(label: string, outcome: ScriptedOutcome): this {
    this.outcomesByLabel.set(label, outcome);
    return this;
  }

  public scriptComplete(handler: ScriptedCompleteHandler): this {
    this.completeHandlers.push(handler);
    return this;
  }

  public invalidateSession(sessionId: string): void {
    this.knownSessionIds.delete(sessionId);
  }

  async run(run: AgentRun): Promise<AgentOutcome> {
    this.calls.push({ type: "run", run });

    // Handle session resume verification
    if (run.session.resume) {
      if (!this.knownSessionIds.has(run.session.resume)) {
        return {
          ok: false,
          error: `Session "${run.session.resume}" not found or expired`,
          sessionLost: true,
        };
      }
    }

    const scripted = this.outcomesByLabel.get(run.label);
    if (!scripted) {
      throw new Error(`FakeHarness: No scripted outcome for label "${run.label}"`);
    }

    let outcome: AgentOutcome;

    if (typeof scripted === "function") {
      outcome = await scripted(run);
    } else if (Array.isArray(scripted)) {
      const next = scripted.shift();
      if (!next) {
        throw new Error(
          `FakeHarness: Out of scripted outcomes for label "${run.label}"`
        );
      }
      outcome = next;
    } else {
      outcome = { ...scripted };
    }

    // Assign / propagate deterministic session IDs
    if (run.session.resume && !outcome.sessionId) {
      outcome.sessionId = run.session.resume;
    } else if (run.session.keep && !outcome.sessionId) {
      const cleanLabel = run.label.replace(/[^a-zA-Z0-9_-]/g, "_");
      const generatedId = `fake-sess-${cleanLabel}-${++this.sessionCounter}`;
      outcome.sessionId = generatedId;
      this.knownSessionIds.add(generatedId);
    } else if (outcome.sessionId) {
      this.knownSessionIds.add(outcome.sessionId);
    }

    return outcome;
  }

  async complete(c: {
    role: string;
    models: string[];
    system: string;
    prompt: string;
    schema: JSONSchema;
  }): Promise<unknown> {
    this.calls.push({ type: "complete", complete: c });

    const handler = this.completeHandlers.shift() ?? this.defaultCompleteHandler;
    if (!handler) {
      throw new Error(`FakeHarness: No scripted handler for complete() call`);
    }

    return handler(c);
  }
}

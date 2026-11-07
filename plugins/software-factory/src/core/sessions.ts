import type {
  AgentOutcome,
  AgentRun,
  Harness,
  JSONSchema,
  Usage,
} from "../harness/types.js";

export interface PersistentAgentOptions {
  harness: Harness;
  labelBase: string;
  agent: string;
  role: string;
  models: string[];
  definition: string;
  tools: string[];
  cwd: string;
  defaultOutputSchema?: JSONSchema;
  sessionId?: string;
}

export interface TurnOptions {
  rehydrate?: () => string | Promise<string>;
  keep?: boolean;
  /** Per-turn label override; falls back to PersistentAgent labelBase. */
  label?: string;
}

/**
 * Engine-side handle for persistent agent sessions (§4, §6.1).
 * Serializes turns per instance (FIFO), threads session resume IDs across turns,
 * handles one-shot rehydration on session loss, and tracks cumulative token usage.
 */
export class PersistentAgent {
  public readonly harness: Harness;
  public readonly labelBase: string;
  public readonly agent: string;
  public readonly role: string;
  public readonly models: string[];
  public readonly definition: string;
  public readonly tools: string[];
  public readonly cwd: string;
  public readonly defaultOutputSchema: JSONSchema;

  public sessionId?: string;
  public readonly totalUsage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };

  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: PersistentAgentOptions) {
    this.harness = options.harness;
    this.labelBase = options.labelBase;
    this.agent = options.agent;
    this.role = options.role;
    this.models = options.models;
    this.definition = options.definition;
    this.tools = options.tools;
    this.cwd = options.cwd;
    this.defaultOutputSchema = options.defaultOutputSchema ?? {};
    this.sessionId = options.sessionId;
  }

  /**
   * Executes a turn for this persistent agent.
   * Concurrent calls are serialized FIFO.
   */
  public turn(
    prompt: string,
    schema?: JSONSchema,
    opts?: TurnOptions
  ): Promise<AgentOutcome> {
    const next = this.queue.then(() => this.executeTurn(prompt, schema, opts));
    // Keep queue advancing even if a turn encounters an error
    this.queue = next.then(
      () => {},
      () => {}
    );
    return next;
  }

  private async executeTurn(
    prompt: string,
    schema?: JSONSchema,
    opts?: TurnOptions
  ): Promise<AgentOutcome> {
    const keep = opts?.keep ?? true;
    const outputSchema = schema ?? this.defaultOutputSchema;
    const label = opts?.label ?? this.labelBase;

    const run: AgentRun = {
      agent: this.agent,
      definition: this.definition,
      prompt,
      role: this.role,
      models: this.models,
      tools: this.tools,
      cwd: this.cwd,
      outputSchema,
      label,
      session: {
        resume: this.sessionId,
        keep,
      },
    };

    const outcome = await this.harness.run(run);
    this.accumulateUsage(outcome.usage);

    if (!outcome.ok && outcome.sessionLost) {
      // Stale session id must never be reused, even without rehydration.
      this.sessionId = undefined;
      if (!opts?.rehydrate) return outcome;
      const prefix = await opts.rehydrate();
      const rehydratedPrompt = prefix ? `${prefix}\n\n${prompt}` : prompt;

      const rehydratedRun: AgentRun = {
        ...run,
        prompt: rehydratedPrompt,
        label: `${label}#rehydrated`,
        session: {
          resume: undefined,
          keep,
        },
      };

      const rehydratedOutcome = await this.harness.run(rehydratedRun);
      this.accumulateUsage(rehydratedOutcome.usage);

      if (rehydratedOutcome.ok && rehydratedOutcome.sessionId) {
        this.sessionId = rehydratedOutcome.sessionId;
      }

      return rehydratedOutcome;
    }

    if (outcome.ok && outcome.sessionId) {
      this.sessionId = outcome.sessionId;
    }

    return outcome;
  }

  private accumulateUsage(usage?: Usage): void {
    if (!usage) return;
    this.totalUsage.inputTokens =
      (this.totalUsage.inputTokens ?? 0) + (usage.inputTokens ?? 0);
    this.totalUsage.outputTokens =
      (this.totalUsage.outputTokens ?? 0) + (usage.outputTokens ?? 0);
    this.totalUsage.costUsd =
      (this.totalUsage.costUsd ?? 0) + (usage.costUsd ?? 0);
  }
}

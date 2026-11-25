/** The architect register's rows and the saga pass order it yields. */

/** One epic as the architect register records it. */
export interface EpicRow {
  epic: string;
  architect: "main" | "subarchitect";
  /** Goal-relative plan path: `plan.md` for main, `epics/<epic>.md` otherwise. */
  plan: string;
  /** One advisory glob for the epic, used for the main pack row and conflict awareness. */
  scope: string;
  opened: number;
  /** Closed rows are history: parsed, validated for grammar, never consulted. */
  closed?: { iteration: number; reason: string };
}

export interface RegisterContext {
  depth: 1 | 2;
  tasks: readonly { slug: string; epic?: string }[];
  exists(rel: string): boolean;
}

export interface ArchitectRegister {
  epics: EpicRow[];
  findings: string[];
}

/** Which pass shape one iteration runs: the top's first turn, a middle iteration, or the goal's last. */
export type SagaIterationKind = "first" | "middle" | "done";

/** One iteration's saga pass order, computed from the register before the top turn. */
export interface SagaPassPlan {
  kind: SagaIterationKind;
  /** Epics the checker pass visits bottom-to-top before the goal check. */
  checkerEpics: EpicRow[];
  /** Epics the bottom-up report pass consults bottom-to-top. */
  reportEpics: EpicRow[];
  /** Whether a top-down direction pass runs after the top turn. */
  direction: boolean;
}

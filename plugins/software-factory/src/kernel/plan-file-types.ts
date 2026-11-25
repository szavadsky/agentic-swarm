/** The plan file's scope, paths and parsed bullets. */

/**
 * One architect's plan scope: the goal's own plan, or one epic's. The register
 * maps every active epic to a plan; this module is the only place a plan path
 * is built, so no consumer hardcodes `plan.md`.
 */
export type PlanScope = { kind: "goal" } | { kind: "epic"; epic: string };

export interface PlanFile {
  scope: PlanScope;
  /** Goal-relative path: `plan.md` for the goal, `epics/<epic>.md` for an epic. */
  rel: string;
  /** Absolute path under the goal directory. */
  path: string;
}

export interface PlanBullet {
  slug: string;
  /** 1-based line of the bullet's first line. */
  line: number;
  /**
   * The bullet's own lines as written: its top-level line plus every indented
   * line that follows it. Prose, headings and the next top-level line end it.
   */
  text: string;
}

/** A plan's text, keyed by its goal-relative path. */
export interface PlanDocument {
  rel: string;
  text: string;
}

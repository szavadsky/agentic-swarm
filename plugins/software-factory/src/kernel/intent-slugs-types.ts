/** One slug annotation parsed from the goal intent. */

export interface IntentSlug {
  /** The annotation's slug, without brackets or the `ctxOnly:` prefix. */
  slug: string;
  /** True for `[[ctxOnly:Slug]]`: context, never a deliverable slice. */
  ctxOnly: boolean;
  /** The nearest preceding section heading, annotations stripped. */
  heading: string;
}

/** A tracked or checkout-relative repo file named as the intent's source of truth. */
export interface IntentSourceFile {
  /** Repo-relative path using forward slashes. */
  rel: string;
  /** Absolute path inside the checkout. */
  abs: string;
}

/** The resolved intent content and slug annotations for one goal. */
export type ResolvedGoalIntent =
  | { kind: "absent" }
  | {
      kind: "inline" | "pointer";
      /** Goal- or checkout-relative intent file name for diagnostics. */
      path: string;
      text: string;
      slugs: IntentSlug[];
    }
  | {
      kind: "missing-source";
      /** Referenced file path from the pointer note that failed to resolve. */
      ref: string;
      reason: string;
    };

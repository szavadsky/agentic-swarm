/** One slug annotation parsed from the goal intent. */

export interface IntentSlug {
  /** The annotation's slug, without brackets or the `ctxOnly:` prefix. */
  slug: string;
  /** True for `[[ctxOnly:Slug]]`: context, never a deliverable slice. */
  ctxOnly: boolean;
  /** The nearest preceding section heading, annotations stripped. */
  heading: string;
}

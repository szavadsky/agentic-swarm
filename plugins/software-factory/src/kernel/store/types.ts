/** The backend persistence hook the folder store hands every settled mutation. */

/**
 * A backend's persistence hook. The store hands it every settled mutation, so
 * artifacts are durable where the backend keeps them before the next write.
 * `prepare` runs before the goal layout is created: it clones or initializes a
 * separate repository and installs that backend's ignore file.
 */
export interface ArtifactWriter {
  prepare(): Promise<void>;
  /** Commits the artifact tree; null when nothing changed. */
  commit(goal: string): Promise<string | null>;
}

/** The artifact LSP files written into the goal folder. */

export interface ArtifactLspFiles {
  /** The canonical config written into the artifact folder. */
  config: string;
  /** Every kernel schema written beside it. */
  schemas: string[];
}

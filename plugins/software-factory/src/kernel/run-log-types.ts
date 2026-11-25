/** The durable run log's paths. */

export interface RunLog {
  /** Goal-relative path the dashboard links. */
  rel: string;
  /** Absolute file the tee appends to. */
  path: string;
}

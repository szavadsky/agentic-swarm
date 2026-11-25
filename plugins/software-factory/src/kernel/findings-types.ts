/** One configuration/pre-flight violation, attributed to a file and key. */

export interface Finding {
  file: string;
  /** Dotted config path; `(root)`, `(file)` and `(yaml)` for non-key failures. */
  key: string;
  message: string;
}

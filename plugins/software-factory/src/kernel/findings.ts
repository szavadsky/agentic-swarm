/** One configuration/pre-flight violation, always attributed to a file and key. */
export interface Finding {
  file: string;
  /** Dotted config path; `(root)`, `(file)` and `(yaml)` for non-key failures. */
  key: string;
  message: string;
}

/** One zod issue as `path: message`; `fallback` names an unrooted issue. */
export function issueText(
  issue: { path: readonly PropertyKey[]; message: string },
  fallback = "(root)",
): string {
  return `${issue.path.join(".") || fallback}: ${issue.message}`;
}

/** Renders every violation as one report, so an operator repairs them in one pass. */
export function formatFindings(
  title: string,
  findings: readonly Finding[],
): string {
  const lines = [title];
  for (const finding of findings) {
    lines.push(`  ${finding.file}: ${finding.key}: ${finding.message}`);
  }
  return lines.join("\n");
}

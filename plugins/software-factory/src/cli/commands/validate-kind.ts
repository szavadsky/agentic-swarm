/** `factory validate`'s file-kind inference: which schema a path selects. */

import path from "node:path";

/** One schema-enforced file kind `factory validate` recognizes, by path. */
export type ValidateKind =
  | "task"
  | "class"
  | "outcome"
  | "hold"
  | "repo"
  | "run"
  | "process"
  | "infra";

export const KNOWN_VALIDATE_KINDS =
  "tasks/*.md, holds/*.yaml, class.yaml, outcome.yaml, repo.yaml, run.yaml, process.yaml, infra.yaml";

const KIND_BY_BASENAME: Record<string, ValidateKind> = {
  "class.yaml": "class",
  "class.yml": "class",
  "outcome.yaml": "outcome",
  "outcome.yml": "outcome",
  "repo.yaml": "repo",
  "repo.yml": "repo",
  "run.yaml": "run",
  "run.yml": "run",
  "process.yaml": "process",
  "process.yml": "process",
  "infra.yaml": "infra",
  "infra.yml": "infra",
};

export function inferValidateKind(absPath: string): ValidateKind | null {
  const base = path.basename(absPath);
  const named = KIND_BY_BASENAME[base];
  if (named) return named;
  const segments = absPath.split(path.sep);
  if (segments.includes("holds") && /\.ya?ml$/i.test(base)) return "hold";
  if (segments.includes("tasks") && base.endsWith(".md")) return "task";
  return null;
}

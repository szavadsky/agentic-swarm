import type { Log, Result } from "sarif";
import AjvDraft04 from "ajv-draft-04";
import sarifSchema from "../../../schemas/sarif-2.1.0.json";
import {
  GateReportError,
  makeFinding,
  type Finding,
  type FindingSeverity,
} from "./findings.js";

const validateSarif = new AjvDraft04({
  allErrors: true,
  strict: false,
  validateFormats: false,
}).compile(sarifSchema);

/** Reads one SARIF 2.1.0 log, rejecting anything the OASIS schema rejects. */
export function parseSarifLog(text: string): Log {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new GateReportError(
      `SARIF report is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!validateSarif(raw)) {
    const detail = validateSarif.errors
      ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new GateReportError(
      `SARIF report is invalid${detail ? `: ${detail}` : ""}`,
    );
  }
  return raw as unknown as Log;
}

function sarifSeverity(level: string | undefined): FindingSeverity {
  switch (level) {
    case "error":
      return "error";
    case "note":
    case "none":
      return "info";
    default:
      return "warning";
  }
}

/** A URI from a SARIF location, with a file scheme removed for the worktree. */
function cleanUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  const withoutScheme = uri.startsWith("file://")
    ? uri.slice("file://".length)
    : uri;
  try {
    return decodeURI(withoutScheme);
  } catch {
    return withoutScheme;
  }
}

function sarifLocation(result: Result): {
  file?: string;
  line?: number;
} {
  const physical = result.locations?.[0]?.physicalLocation;
  const file = cleanUri(physical?.artifactLocation?.uri);
  const line = physical?.region?.startLine;
  return {
    ...(file ? { file } : {}),
    ...(line !== undefined ? { line } : {}),
  };
}

function isResult(result: Result): boolean {
  return result.kind !== "pass" && result.kind !== "notApplicable";
}

function sarifFinding(check: string, tool: string, result: Result): Finding {
  const rule = result.ruleId ?? result.rule?.id;
  return makeFinding({
    check,
    tool,
    ...sarifLocation(result),
    ...(rule ? { rule } : {}),
    severity: sarifSeverity(result.level),
    message:
      result.message.text ?? result.message.markdown ?? rule ?? "SARIF finding",
  });
}

/** The failures one validated SARIF log names, one finding per result. */
export function sarifFindings(check: string, log: Log): Finding[] {
  const findings: Finding[] = [];
  for (const run of log.runs) {
    const tool = run.tool.driver.name || "sarif";
    for (const result of run.results ?? []) {
      if (isResult(result)) findings.push(sarifFinding(check, tool, result));
    }
  }
  return findings;
}

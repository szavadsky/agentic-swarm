import {
  GateReportError,
  makeFinding,
  type Finding,
  type FindingSeverity,
} from "./findings.js";
import type { LogRegex } from "./types.js";

const SEVERITIES: readonly FindingSeverity[] = ["error", "warning", "info"];

function severityFrom(value: string | undefined, fallback: FindingSeverity) {
  return SEVERITIES.find((severity) => severity === value) ?? fallback;
}

function lineFrom(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const line = Number.parseInt(value, 10);
  return Number.isFinite(line) ? line : undefined;
}

function compilePattern(pattern: string, label: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new GateReportError(
      `${label} ${JSON.stringify(pattern)} is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function regexFinding(
  check: string,
  declared: LogRegex,
  match: RegExpExecArray,
): Finding {
  const groups = match.groups ?? {};
  const line = lineFrom(groups.line);
  const rule = groups.rule ?? declared.rule;
  return makeFinding({
    check,
    tool: declared.tool ?? "regex",
    ...(groups.file ? { file: groups.file } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(rule ? { rule } : {}),
    severity: severityFrom(groups.severity, declared.severity ?? "error"),
    message: groups.message ?? match[0].trim(),
  });
}

/** Findings the declared regexes name in a gate's log. */
export function regexFindings(
  check: string,
  log: string,
  regexes: readonly LogRegex[],
): Finding[] {
  const findings: Finding[] = [];
  for (const declared of regexes) {
    const pattern = compilePattern(declared.pattern, "log regex");
    for (const text of log.split("\n")) {
      if (text.trim() === "") continue;
      const match = pattern.exec(text);
      if (match) findings.push(regexFinding(check, declared, match));
    }
  }
  return findings;
}

const LOG_LOCATION = /^(.+?)(?:\((\d+)(?:,\d+)?\)|:(\d+)(?::\d+)?):\s*(.*)$/;

function isNoise(text: string, noise: readonly RegExp[]): boolean {
  return text === "" || noise.some((pattern) => pattern.test(text));
}

/** One finding per meaningful red log line when no report or regex names one. */
export function logFindings(
  check: string,
  log: string,
  exitCode: number | null,
  noisePatterns: readonly string[] = [],
): Finding[] {
  const noise = noisePatterns.map((pattern) =>
    compilePattern(pattern, "log noise regex"),
  );
  if (exitCode === 0) return [];
  const findings: Finding[] = [];
  for (const text of log.split("\n")) {
    const message = text.trim();
    if (isNoise(message, noise)) continue;
    const located = LOG_LOCATION.exec(message);
    const file = located?.[1];
    const line = lineFrom(located?.[2] ?? located?.[3]);
    findings.push(
      makeFinding({
        check,
        tool: "log",
        ...(file ? { file } : {}),
        ...(line !== undefined ? { line } : {}),
        severity: "error",
        message: located?.[4] ?? message,
      }),
    );
  }
  return findings;
}

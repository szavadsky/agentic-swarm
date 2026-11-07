import fs from "node:fs";
import path from "node:path";
import type { Citation } from "../artifacts.js";

export type CitationFailureReason =
  | "file_not_found"
  | "invalid_range"
  | "out_of_range"
  | "missing_anchor";

export interface CitationVerificationFailure {
  citation: Citation;
  reason: CitationFailureReason;
  message: string;
}

export interface VerificationResult {
  valid: Citation[];
  failed: CitationVerificationFailure[];
}

/**
 * Parses line range string like "10-25" or "15" into 1-based [start, end] numbers.
 */
export function parseLineRange(linesStr: string): { start: number; end: number } | null {
  if (!linesStr) return null;
  const parts = linesStr.split("-").map((s) => s.trim());
  if (parts.length === 1 && parts[0]) {
    const num = parseInt(parts[0], 10);
    if (isNaN(num) || num < 1) return null;
    return { start: num, end: num };
  } else if (parts.length === 2 && parts[0] && parts[1]) {
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    if (isNaN(start) || isNaN(end) || start < 1 || start > end) return null;
    return { start, end };
  }
  return null;
}

/**
 * Verifies a single citation against the files in a workspace/worktree (§8.1.2).
 * Returns failure details if invalid, or null if verified.
 */
export function verifyCitation(
  citation: Citation,
  workspaceRoot: string
): CitationVerificationFailure | null {
  const root = path.resolve(workspaceRoot);
  const filePath = path.resolve(root, citation.file);

  // 0. Containment: reject absolute paths and `../` escapes outside the worktree.
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return {
      citation,
      reason: "file_not_found",
      message: `File "${citation.file}" is outside the workspace "${workspaceRoot}".`,
    };
  }

  // 1. File existence (must be a regular file; directories are not citable).
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return {
      citation,
      reason: "file_not_found",
      message: `File "${citation.file}" not found in workspace "${workspaceRoot}".`,
    };
  }
  if (!stat.isFile()) {
    return {
      citation,
      reason: "file_not_found",
      message: `File "${citation.file}" not found in workspace "${workspaceRoot}".`,
    };
  }

  // Read file lines (a single trailing newline is a terminator, not an extra line).
  const content = fs.readFileSync(filePath, "utf8");
  const fileLines = content.split(/\r?\n/);
  if (fileLines.length > 0 && fileLines[fileLines.length - 1] === "") {
    fileLines.pop();
  }
  const totalLines = fileLines.length;

  // 2. Line range validation
  const range = parseLineRange(citation.lines);
  if (!range) {
    return {
      citation,
      reason: "invalid_range",
      message: `Invalid line range format: "${citation.lines}". Expected "start-end" or "line".`,
    };
  }

  if (range.start > totalLines || range.end > totalLines) {
    return {
      citation,
      reason: "out_of_range",
      message: `Line range ${citation.lines} is out of range for file "${citation.file}" (${totalLines} lines).`,
    };
  }

  // 3. Anchor presence in specified line range
  const rangeLines = fileLines.slice(range.start - 1, range.end).join("\n");

  if (citation.anchors && citation.anchors.length > 0) {
    for (const anchor of citation.anchors) {
      if (!rangeLines.includes(anchor)) {
        return {
          citation,
          reason: "missing_anchor",
          message: `Anchor "${anchor}" not found within lines ${citation.lines} of "${citation.file}".`,
        };
      }
    }
  }

  return null;
}

/**
 * Verifies an array of citations, separating valid citations from failed ones.
 */
export function verifyCitations(
  citations: Citation[],
  workspaceRoot: string
): VerificationResult {
  const valid: Citation[] = [];
  const failed: CitationVerificationFailure[] = [];

  for (const citation of citations) {
    const error = verifyCitation(citation, workspaceRoot);
    if (error) {
      failed.push(error);
    } else {
      valid.push(citation);
    }
  }

  return { valid, failed };
}

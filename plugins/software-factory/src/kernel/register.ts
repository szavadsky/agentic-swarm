// biome-ignore-all lint/complexity: split-rest
/**
 * The architect register is the only hierarchy state the main architect writes
 * (plan §2): one bullet per epic under `## Architect register`. This module is
 * the pure parser and validator; the boundary is the only caller, so nothing
 * here reads a goal directory except through the supplied `exists`.
 */
export interface EpicRow {
  epic: string;
  architect: "main" | "subarchitect";
  /** Goal-relative plan path: `plan.md` for main, `epics/<epic>.md` otherwise. */
  plan: string;
  /** One advisory glob for the epic, used for the main pack row and conflict awareness. */
  scope: string;
  opened: number;
  /** Closed rows are history: parsed, validated for grammar, never consulted. */
  closed?: { iteration: number; reason: string };
}

export interface RegisterContext {
  depth: 1 | 2;
  tasks: readonly { slug: string; epic?: string }[];
  exists(rel: string): boolean;
}

export interface ArchitectRegister {
  epics: EpicRow[];
  findings: string[];
}

const REGISTER_HEADING = /^##\s+architect register\s*$/i;
const HEADING = /^(#{1,6})\s/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const BULLET = /^\s*[-*+]\s+/;
const ROW =
  /^\s*[-*+]\s+epic\s+`([^`]*)`\s*\|\s*architect\s+`([^`]*)`\s*\|\s*plan\s+`([^`]*)`\s*\|\s*scope\s+`([^`]*)`\s*\|\s*opened\s+i(\d+)\s*\|\s*(?:active|closed\s+i(\d+)\s*:\s*(.+?))\s*$/i;
const EPIC_NAME = /^[a-z0-9-]+$/;

/**
 * Bullet lines under the register heading; prose, comments and fenced examples
 * are not rows. The section runs until the next level-1/2 heading, so bullets
 * under a nested subheading stay rows instead of disappearing.
 */
function registerRows(plan: string): {
  found: boolean;
  rows: string[];
  unterminatedFence: boolean;
} {
  const rows: string[] = [];
  let found = false;
  let inRegister = false;
  let fence: string | null = null;
  for (const line of plan.split(/\r?\n/)) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1] ?? "";
      if (fence === null) fence = marker[0] ?? null;
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const heading = HEADING.exec(line);
    if (heading !== null) {
      if ((heading[1] ?? "").length <= 2) {
        inRegister = REGISTER_HEADING.test(line);
        found ||= inRegister;
      }
      continue;
    }
    if (inRegister && BULLET.test(line)) rows.push(line.trim());
  }
  return { found, rows, unterminatedFence: fence !== null };
}

function relativePathIssue(path: string): string | null {
  if (path.trim() === "") return "is empty; a goal-relative path is required";
  if (
    path.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.startsWith("\\\\")
  ) {
    return "is absolute; paths are goal-relative";
  }
  if (path.split(/[\\/]/).includes("..")) {
    return 'contains ".." and escapes the goal directory';
  }
  return null;
}

/**
 * Parses the register and returns its rows plus every finding that blocks the
 * iteration. A plan without the heading has no register: no rows and no
 * findings, so `depth: 1` gains no read path. An unterminated fence at EOF is
 * the exception: it hides everything after it, so the heading may exist and be
 * unreadable; that is a finding even when no heading is visible. Grammar
 * findings drop the offending row; cross-row findings (duplicates, missing
 * plans, unknown task epics) keep it so the caller can report what was written.
 */
export function parseArchitectRegister(
  plan: string,
  ctx: RegisterContext,
): ArchitectRegister {
  const located = registerRows(plan);
  const findings: string[] = [];
  if (located.unterminatedFence) {
    findings.push(
      "plan ends inside an unterminated code fence; markdown after it cannot be read, so the architect register is unverifiable",
    );
  }
  if (!located.found) return { epics: [], findings };

  const epics: EpicRow[] = [];

  for (const line of located.rows) {
    const match = ROW.exec(line);
    if (!match) {
      findings.push(
        `register row ${JSON.stringify(line)} cannot be parsed: expected "- epic \`<name>\` | architect \`main|subarchitect\` | plan \`<path>\` | scope \`<glob>\` | opened i<N> | active|closed i<N>: <reason>"`,
      );
      continue;
    }
    const epic = match[1] ?? "";
    const architect = match[2] ?? "";
    const planPath = match[3] ?? "";
    const scope = match[4] ?? "";
    const opened = Number(match[5]);
    const closedIteration =
      match[6] === undefined ? undefined : Number(match[6]);
    const reason = match[7]?.trim() ?? "";

    if (!EPIC_NAME.test(epic)) {
      findings.push(`register epic ${JSON.stringify(epic)} is not [a-z0-9-]+`);
      continue;
    }
    if (architect !== "main" && architect !== "subarchitect") {
      findings.push(
        `register epic "${epic}" names architect ${JSON.stringify(architect)}; expected "main" or "subarchitect"`,
      );
      continue;
    }
    epics.push({
      epic,
      architect,
      plan: planPath,
      scope,
      opened,
      ...(closedIteration === undefined
        ? {}
        : { closed: { iteration: closedIteration, reason } }),
    });
  }

  if (ctx.depth === 1) {
    for (const row of epics) {
      if (row.closed === undefined && row.architect === "subarchitect") {
        findings.push(
          `epic "${row.epic}" names architect "subarchitect" at hierarchy depth 1; subarchitect rows require depth 2`,
        );
      }
    }
    return { epics, findings };
  }

  const rowCounts = new Map<string, number>();
  const activeCounts = new Map<string, number>();
  for (const row of epics) {
    rowCounts.set(row.epic, (rowCounts.get(row.epic) ?? 0) + 1);
    if (row.closed === undefined)
      activeCounts.set(row.epic, (activeCounts.get(row.epic) ?? 0) + 1);
  }
  for (const [epic, count] of rowCounts) {
    if (count === 1) continue;
    if ((activeCounts.get(epic) ?? 0) > 1) {
      findings.push(`duplicate active epic "${epic}" (${count} rows)`);
    } else {
      findings.push(
        `epic "${epic}" appears in ${count} rows; a closed name is never reopened, a new effort is a new epic name`,
      );
    }
  }

  for (const row of epics) {
    const planIssue = relativePathIssue(row.plan);
    if (planIssue !== null)
      findings.push(`epic "${row.epic}" plan "${row.plan}" ${planIssue}`);
    const scopeIssue = relativePathIssue(row.scope);
    if (scopeIssue !== null)
      findings.push(`epic "${row.epic}" scope "${row.scope}" ${scopeIssue}`);
    const epicPlan = `epics/${row.epic}.md`;
    if (
      planIssue === null &&
      row.architect === "subarchitect" &&
      row.plan !== epicPlan
    ) {
      findings.push(
        `epic "${row.epic}" is owned by a subarchitect; its plan must be "${epicPlan}", not "${row.plan}"`,
      );
    }
    if (
      planIssue === null &&
      row.architect === "main" &&
      row.plan !== "plan.md"
    ) {
      findings.push(
        `epic "${row.epic}" is owned by the main architect; its plan must be "plan.md", not "${row.plan}"`,
      );
    }
  }

  for (const row of epics) {
    if (row.closed !== undefined || relativePathIssue(row.plan) !== null)
      continue;
    if (!ctx.exists(row.plan)) {
      findings.push(`epic "${row.epic}" plan "${row.plan}" does not exist`);
    }
  }

  const activeRows = new Map<string, EpicRow>();
  const closedRows = new Map<string, EpicRow>();
  for (const row of epics) {
    const rows = row.closed === undefined ? activeRows : closedRows;
    if (!rows.has(row.epic)) rows.set(row.epic, row);
  }
  for (const task of ctx.tasks) {
    if (task.epic === undefined || activeRows.has(task.epic)) continue;
    const closed = closedRows.get(task.epic)?.closed;
    if (closed === undefined) {
      findings.push(`task "${task.slug}" names unknown epic "${task.epic}"`);
    } else {
      findings.push(
        `task "${task.slug}" names closed epic "${task.epic}" (closed i${closed.iteration})`,
      );
    }
  }

  return { epics, findings };
}

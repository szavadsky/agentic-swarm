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

/** Which pass shape one iteration runs: the top's first turn, a middle iteration, or the goal's last. */
export type SagaIterationKind = "first" | "middle" | "done";

/** One iteration's saga pass order, computed from the register before the top turn. */
export interface SagaPassPlan {
  kind: SagaIterationKind;
  /** Epics the checker pass visits bottom-to-top before the goal check. */
  checkerEpics: EpicRow[];
  /** Epics the bottom-up report pass consults bottom-to-top. */
  reportEpics: EpicRow[];
  /** Whether a top-down direction pass runs after the top turn. */
  direction: boolean;
}

/** Active epics owned by a subarchitect, bottom-to-top (epic order). */
export function subarchitectRows(epics: readonly EpicRow[]): EpicRow[] {
  return epics
    .filter(
      (row) => row.closed === undefined && row.architect === "subarchitect",
    )
    .sort((a, b) => a.epic.localeCompare(b.epic));
}

/**
 * The passes one iteration runs. The first iteration is top-down only: the top
 * turn writes the register and the direction pass consults it. A middle
 * iteration checks and reports bottom-to-top, then lets the top turn choose the
 * direction subset. Once every active epic is done the iteration is the goal's
 * last: checkers plus the bottom-up report, with no direction pass.
 */
export function sagaPassPlan(input: {
  /** The goal has attempted a top architect turn: it has left its first iteration. */
  started: boolean;
  epics: readonly EpicRow[];
  epicDone: (epic: string) => boolean;
}): SagaPassPlan {
  const epics = subarchitectRows(input.epics);
  if (!input.started) {
    return {
      kind: "first",
      checkerEpics: [],
      reportEpics: [],
      direction: true,
    };
  }
  if (epics.length > 0 && epics.every((row) => input.epicDone(row.epic))) {
    return {
      kind: "done",
      checkerEpics: epics,
      reportEpics: epics,
      direction: false,
    };
  }
  return {
    kind: "middle",
    checkerEpics: epics,
    reportEpics: epics.filter((row) => !input.epicDone(row.epic)),
    direction: true,
  };
}

const REGISTER_HEADING = /^##\s+architect register\s*$/i;
const HEADING = /^(#{1,6})\s/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const BULLET = /^\s*[-*+]\s+/;
const ROW =
  /^\s*[-*+]\s+epic\s+`([^`]*)`\s*\|\s*architect\s+`([^`]*)`\s*\|\s*plan\s+`([^`]*)`\s*\|\s*scope\s+`([^`]*)`\s*\|\s*opened\s+i(\d+)\s*\|\s*(?:active|closed\s+i(\d+)\s*:\s*(.+?))\s*$/i;
const EPIC_NAME = /^[a-z0-9-]+$/;

/** A fence delimiter line, or that the line is ordinary text. */
function consumeFence(line: string, state: { marker: string | null }): boolean {
  const match = FENCE.exec(line);
  if (match === null) return false;
  const marker = match[1] ?? "";
  if (state.marker === null) state.marker = marker[0] ?? null;
  else if (marker[0] === state.marker) state.marker = null;
  return true;
}

/**
 * A level-1/2 heading enters or leaves the register; nested headings leave the
 * current section alone. Undefined means the line is not a level-1/2 heading.
 */
function headingRegister(line: string): boolean | undefined {
  const heading = HEADING.exec(line);
  if (heading === null) return undefined;
  if ((heading[1] ?? "").length > 2) return undefined;
  return REGISTER_HEADING.test(line);
}

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
  const fence = { marker: null as string | null };
  for (const line of plan.split(/\r?\n/)) {
    if (consumeFence(line, fence)) continue;
    if (fence.marker !== null) continue;
    const register = headingRegister(line);
    if (register !== undefined) {
      inRegister = register;
      found ||= register;
      continue;
    }
    if (inRegister && BULLET.test(line)) rows.push(line.trim());
  }
  return { found, rows, unterminatedFence: fence.marker !== null };
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

/** One register bullet parsed, or the grammar finding that rejected it. */
function parseRegisterRow(
  line: string,
  findings: string[],
): EpicRow | undefined {
  const match = ROW.exec(line);
  if (!match) {
    findings.push(
      `register row ${JSON.stringify(line)} cannot be parsed: expected "- epic \`<name>\` | architect \`main|subarchitect\` | plan \`<path>\` | scope \`<glob>\` | opened i<N> | active|closed i<N>: <reason>"`,
    );
    return undefined;
  }
  const epic = match[1] ?? "";
  const architect = match[2] ?? "";
  const planPath = match[3] ?? "";
  const scope = match[4] ?? "";
  const opened = Number(match[5]);
  const closedIteration = match[6] === undefined ? undefined : Number(match[6]);
  const reason = match[7]?.trim() ?? "";

  if (!EPIC_NAME.test(epic)) {
    findings.push(`register epic ${JSON.stringify(epic)} is not [a-z0-9-]+`);
    return undefined;
  }
  if (architect !== "main" && architect !== "subarchitect") {
    findings.push(
      `register epic "${epic}" names architect ${JSON.stringify(architect)}; expected "main" or "subarchitect"`,
    );
    return undefined;
  }
  return {
    epic,
    architect,
    plan: planPath,
    scope,
    opened,
    ...(closedIteration === undefined
      ? {}
      : { closed: { iteration: closedIteration, reason } }),
  };
}

/** Depth 1 cannot host subarchitect rows. */
function depthOneFindings(epics: EpicRow[]): string[] {
  return epics
    .filter(
      (row) => row.closed === undefined && row.architect === "subarchitect",
    )
    .map(
      (row) =>
        `epic "${row.epic}" names architect "subarchitect" at hierarchy depth 1; subarchitect rows require depth 2`,
    );
}

/** Duplicate epic names: an active reopen is its own finding. */
function duplicateEpicFindings(epics: EpicRow[]): string[] {
  const rowCounts = new Map<string, number>();
  const activeCounts = new Map<string, number>();
  for (const row of epics) {
    rowCounts.set(row.epic, (rowCounts.get(row.epic) ?? 0) + 1);
    if (row.closed === undefined) {
      activeCounts.set(row.epic, (activeCounts.get(row.epic) ?? 0) + 1);
    }
  }
  const findings: string[] = [];
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
  return findings;
}

/** Plan and scope paths, and the plan each owner is allowed to name. */
function rowPathFindings(epics: EpicRow[]): string[] {
  const findings: string[] = [];
  for (const row of epics) {
    const planIssue = relativePathIssue(row.plan);
    if (planIssue !== null) {
      findings.push(`epic "${row.epic}" plan "${row.plan}" ${planIssue}`);
    }
    const scopeIssue = relativePathIssue(row.scope);
    if (scopeIssue !== null) {
      findings.push(`epic "${row.epic}" scope "${row.scope}" ${scopeIssue}`);
    }
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
  return findings;
}

/** Open rows must name a plan that exists. */
function missingPlanFindings(epics: EpicRow[], ctx: RegisterContext): string[] {
  return epics
    .filter(
      (row) => row.closed === undefined && relativePathIssue(row.plan) === null,
    )
    .filter((row) => !ctx.exists(row.plan))
    .map((row) => `epic "${row.epic}" plan "${row.plan}" does not exist`);
}

/** Active rows by epic, and closed rows by epic. */
function classifyRows(epics: EpicRow[]): {
  active: Map<string, EpicRow>;
  closed: Map<string, EpicRow>;
} {
  const active = new Map<string, EpicRow>();
  const closed = new Map<string, EpicRow>();
  for (const row of epics) {
    const rows = row.closed === undefined ? active : closed;
    if (!rows.has(row.epic)) rows.set(row.epic, row);
  }
  return { active, closed };
}

/** Tasks may only name an active epic. */
function taskEpicFindings(
  tasks: RegisterContext["tasks"],
  active: ReadonlyMap<string, EpicRow>,
  closed: ReadonlyMap<string, EpicRow>,
): string[] {
  const findings: string[] = [];
  for (const task of tasks) {
    if (task.epic === undefined || active.has(task.epic)) continue;
    const closedRow = closed.get(task.epic)?.closed;
    if (closedRow === undefined) {
      findings.push(`task "${task.slug}" names unknown epic "${task.epic}"`);
    } else {
      findings.push(
        `task "${task.slug}" names closed epic "${task.epic}" (closed i${closedRow.iteration})`,
      );
    }
  }
  return findings;
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
    const row = parseRegisterRow(line, findings);
    if (row) epics.push(row);
  }
  if (ctx.depth === 1) {
    findings.push(...depthOneFindings(epics));
    return { epics, findings };
  }

  findings.push(...duplicateEpicFindings(epics), ...rowPathFindings(epics));
  findings.push(...missingPlanFindings(epics, ctx));
  const { active, closed } = classifyRows(epics);
  findings.push(...taskEpicFindings(ctx.tasks, active, closed));
  return { epics, findings };
}

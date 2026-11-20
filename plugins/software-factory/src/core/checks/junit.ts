import { XML } from "bun";

export interface ParsedCase {
  name: string;
  status: "pass" | "fail";
  /** The file the report recorded for this case, when it names one. */
  file?: string;
}

export interface ParsedJunit {
  cases: ParsedCase[];
  /** The report carries a `<failure>` or `<error>` anywhere, cases or not. */
  suiteFailed: boolean;
  /** `cases` is a capped subset of the report; the rest was dropped. */
  truncated: boolean;
}

/** Cases a stored report keeps; failing cases are kept first. */
const CASE_CAP = 100;
/** Characters of case data one stored report keeps. */
const CASE_CHARS = 4000;
/** Characters of one stored case name. */
const NAME_CAP = 300;

function isNode(
  value: string | XML.Node | XML.Comment | XML.ProcessingInstruction,
): value is XML.Node {
  return typeof value === "object" && "name" in value;
}

function isFailure(node: XML.Node): boolean {
  return node.name === "failure" || node.name === "error";
}

function caseStatus(node: XML.Node): ParsedCase["status"] {
  return node.children.some((child) => isNode(child) && isFailure(child))
    ? "fail"
    : "pass";
}

function hasFailure(node: XML.Node): boolean {
  return node.children.some(
    (child) => isNode(child) && (isFailure(child) || hasFailure(child)),
  );
}

/**
 * Walks the document rather than slicing text: a case belongs to the nearest
 * enclosing suite's file, and falls back to its own `file`/`classname`, which
 * is how bun, pytest and jest-junit each name the file.
 */
function collectCases(
  node: XML.Node,
  inheritedFile: string | undefined,
  cases: ParsedCase[],
): void {
  if (node.name === "testcase") {
    const name = node.attributes.name;
    if (!name) return;
    const file =
      node.attributes.file || inheritedFile || node.attributes.classname;
    const status = caseStatus(node);
    cases.push(file ? { name, status, file } : { name, status });
    return;
  }
  const file = node.attributes.file || inheritedFile;
  for (const child of node.children) {
    if (isNode(child)) collectCases(child, file, cases);
  }
}

/**
 * Reads one JUnit report, whatever runner wrote it. Throws a `SyntaxError` on a
 * malformed document: the caller decides whether an unreadable report is red
 * (a gate) or merely unusable for naming failures (a test runner).
 */
export function parseJunit(xml: string): ParsedJunit {
  const root = XML.parse(xml, { compact: false });
  const cases: ParsedCase[] = [];
  collectCases(root, undefined, cases);
  return { cases, suiteFailed: hasFailure(root), truncated: false };
}

/**
 * The report a check record keeps: failing cases first, since they are the
 * failure identity, then passing cases and name prefixes as the caps allow.
 * `truncated` is what the caps dropped, so a stored report never claims to be
 * complete when it is not.
 */
export function capJunit(
  report: ParsedJunit,
  limits: { cases?: number; chars?: number; nameChars?: number } = {},
): ParsedJunit {
  const caseCap = limits.cases ?? CASE_CAP;
  const charCap = limits.chars ?? CASE_CHARS;
  const nameCap = limits.nameChars ?? NAME_CAP;
  const ordered = [
    ...report.cases.filter((c) => c.status === "fail"),
    ...report.cases.filter((c) => c.status === "pass"),
  ];
  const cases: ParsedCase[] = [];
  let used = 0;
  let truncated = report.truncated;
  for (const c of ordered) {
    if (cases.length >= caseCap) {
      truncated = true;
      break;
    }
    const name = c.name.slice(0, nameCap);
    if (name !== c.name) truncated = true;
    const size = name.length + (c.file?.length ?? 0);
    if (used + size > charCap) {
      truncated = true;
      break;
    }
    used += size;
    cases.push(name === c.name ? c : { ...c, name });
  }
  return { cases, suiteFailed: report.suiteFailed, truncated };
}

/** Files whose cases failed, in report order; empty when no report was read. */
export function failedFiles(report: ParsedJunit | undefined): string[] {
  const files = new Set<string>();
  for (const c of report?.cases ?? []) {
    if (c.status === "fail" && c.file) files.add(c.file);
  }
  return [...files];
}

/** `file > test name` per failed case, `test: name` when the file is unknown. */
export function failedTests(report: ParsedJunit | undefined): string[] {
  return (report?.cases ?? [])
    .filter((c) => c.status === "fail")
    .map((c) => (c.file ? `${c.file} > ${c.name}` : `test: ${c.name}`));
}

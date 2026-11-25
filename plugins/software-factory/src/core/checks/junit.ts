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
}

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
 * malformed document: the tests-gate runner reports the red from its own lines
 * instead of using the report to name failures.
 */
export function parseJunit(xml: string): ParsedJunit {
  const root = XML.parse(xml, { compact: false });
  const cases: ParsedCase[] = [];
  collectCases(root, undefined, cases);
  return { cases, suiteFailed: hasFailure(root) };
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

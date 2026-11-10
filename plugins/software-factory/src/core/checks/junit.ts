import type { DeveloperTarget, InfraArtifact } from "../artifacts.js";
import { resolveGateTarget } from "./gate-target.js";

function decodeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function getAttr(tag: string, attrName: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attrName}=["']([^"']*)["']`, "i"));
  return match && match[1] !== undefined ? decodeXml(match[1]) : undefined;
}

export interface ParsedCase {
  id: string;
  status: "pass" | "fail" | "error" | "skip";
}

export interface ParsedJunit {
  collected: boolean;
  errors: string[];
  cases: ParsedCase[];
}

/**
 * Parses JUnit XML output.
 * Distinguishes suite collection errors, assertion failures, execution errors, and passes.
 */
export function parseJunit(xml: string): ParsedJunit {
  if (!xml || !xml.trim()) {
    return {
      collected: false,
      errors: ["Empty JUnit XML output"],
      cases: [],
    };
  }

  const errors: string[] = [];
  let collected = true;

  // Check for suite-level errors outside of <testcase>
  const xmlWithoutTestcases = xml
    .replace(/<testcase[\s\S]*?<\/testcase>/gi, "")
    .replace(/<testcase[^>]*\/>/gi, "");
  const suiteErrorRegex = /<error\b([^>]*)>([\s\S]*?)<\/error>/gi;
  let suiteErrorMatch: RegExpExecArray | null;
  while ((suiteErrorMatch = suiteErrorRegex.exec(xmlWithoutTestcases)) !== null) {
    const attrs = suiteErrorMatch[1] ?? "";
    const msg = getAttr(attrs, "message") || suiteErrorMatch[2]?.trim() || "Suite error";
    errors.push(decodeXml(msg));
    collected = false;
  }

  // Parse all <testcase> elements
  const cases: ParsedCase[] = [];
  const testcaseRegex = /<testcase\b([\s\S]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
  let tcMatch: RegExpExecArray | null;

  while ((tcMatch = testcaseRegex.exec(xml)) !== null) {
    const attrs = tcMatch[1] ?? "";
    const body = tcMatch[2] ?? "";

    const name = getAttr(attrs, "name") ?? "unknown";
    const classname = getAttr(attrs, "classname");
    const attrId = getAttr(attrs, "id");

    let id: string;
    if (attrId) {
      id = attrId;
    } else if (classname && classname.trim()) {
      id = `${classname}.${name}`;
    } else {
      id = name;
    }

    let status: "pass" | "fail" | "error" | "skip" = "pass";

    // Check for failure vs error vs skipped
    if (/<failure\b/i.test(body)) {
      status = "fail";
    } else if (/<error\b/i.test(body)) {
      status = "error";
      const errMatch = body.match(/<error\b([^>]*)>([\s\S]*?)<\/error>/i);
      const errMsg = errMatch
        ? getAttr(errMatch[1] ?? "", "message") || errMatch[2]?.trim() || "Test execution error"
        : "Test execution error";
      errors.push(`${id}: ${decodeXml(errMsg)}`);

      // Detect collection errors (e.g. pytest collection failure case)
      if (
        classname === "pytest" ||
        name === "failure" ||
        /collection failure|import error|syntaxerror/i.test(errMsg)
      ) {
        collected = false;
      }
    } else if (/<skipped\b/i.test(body) || /<skip\b/i.test(body)) {
      status = "skip";
    }

    cases.push({ id, status });
  }

  if (cases.length === 0 && errors.length > 0) {
    collected = false;
  }

  return { collected, errors, cases };
}

/**
 * Structurally validates a testRunner config at infra time. Returns error
 * strings (empty = valid). Catches the PsPost5 launch-5 class: pytest with
 * `selectorArgs: ["-k"]`, which silently selects nothing for node-ids.
 */
export function validateTestRunner(runner: InfraArtifact["testRunner"]): string[] {
  const errors: string[] = [];
  if (!runner || typeof runner.command !== "string" || runner.command.trim() === "") {
    errors.push("testRunner.command must be a non-empty string");
    return errors;
  }
  const cmd = runner.command.toLowerCase();
  const prefix = (runner.selectorArgs ?? []).join(" ");
  const isPytest = /(^|[\s/"'])pytest(\s|$)/.test(cmd) || cmd.includes("pytest");
  const isUnittest = cmd.includes("-m unittest") || /(^|[\s/"'])unittest(\s|$)/.test(cmd);
  if ((isPytest || isUnittest) && (runner.selectorArgs ?? []).length > 0) {
    errors.push(
      `testRunner.selectorArgs must be [] for ${isPytest ? "pytest" : "unittest"} (node-ids are positional; got [${prefix}])`
    );
  }
  return errors;
}

export function shellQuote(arg: string): string {
  if (/^[a-zA-Z0-9_\-\.\/:=]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * True when a selector looks like a test node-id that runners consume
 * positionally: pytest `path/to/test.py::test_fn`, unittest-style dotted ids
 * (`tests.test_mod.TestClass.test_x`), or plain test file paths. Such
 * selectors must never be passed behind a flag prefix like pytest `-k`
 * (keyword expression) or they silently select nothing.
 */
export function isPositionalSelector(sel: string): boolean {
  if (!sel) return false;
  if (sel.includes("::")) return true; // pytest node-id
  if (/^[\w-]+\/[\w\-./]*\.(py|ts|js|mjs|cjs|tsx|jsx|go|rs|java|rb)\b/.test(sel)) return true; // file path
  if (/^[A-Za-z_][\w]*(\.[\w]+){2,}$/.test(sel)) return true; // dotted id (module.Class.test)
  return false;
}

/**
 * Builds a shell-safe target test execution command from infra runner configuration,
 * target selectors, and junit report path.
 *
 * Selectors are positional by default. A `selectorArgs` prefix (e.g. jest `-t`)
 * is honored ONLY when no selector looks like a runner node-id that must be
 * positional (pytest `path::test`, unittest dotted ids, file paths). This
 * guards against infra configs like pytest `selectorArgs: ["-k"]`, where `-k`
 * takes a keyword expression and a node-id would silently select nothing.
 */
export function buildTargetCommand(
  infra: InfraArtifact,
  target: DeveloperTarget,
  junitPath: string
): string {
  if ("customTarget" in target && target.customTarget) {
    return target.command;
  }

  if ("gate" in target && target.gate) {
    const gate = resolveGateTarget(target.gate, infra);
    return gate ? gate.command : target.gate;
  }

  const runner = infra.testRunner;
  const parts: string[] = [runner.command];

  if ("selectors" in target && target.selectors && target.selectors.length > 0) {
    const usePrefix =
      runner.selectorArgs &&
      runner.selectorArgs.length > 0 &&
      !target.selectors.some(isPositionalSelector);
    if (usePrefix) {
      for (const sel of target.selectors) {
        parts.push(...runner.selectorArgs!, shellQuote(sel));
      }
    } else {
      for (const sel of target.selectors) {
        parts.push(shellQuote(sel));
      }
    }
  }

  if (runner.junitArg) {
    let junitPart = runner.junitArg;
    if (junitPart.includes("{path}") || junitPart.includes("{{path}}")) {
      junitPart = junitPart.replace(/\{\{path\}\}|\{path\}/g, shellQuote(junitPath));
      parts.push(junitPart);
    } else if (junitPart.endsWith("=")) {
      parts.push(`${junitPart}${shellQuote(junitPath)}`);
    } else {
      parts.push(junitPart, shellQuote(junitPath));
    }
  }

  return parts.join(" ");
}
/**
 * Sanitizes an architect-supplied corrected target (merge-verify consult,
 * unknown-gate recovery) into a DeveloperTarget, or undefined when the
 * shape is unusable. Accepts exactly one variant: {gate: <non-empty id>},
 * {selectors: <non-empty string array>} (expectRed optional), or
 * {command, customTarget: true}. Never throws; never returns a bare id
 * that would execute as a shell command (the 127 class).
 */
export function sanitizeDeveloperTarget(raw: unknown): DeveloperTarget | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const t = raw as Record<string, unknown>;
  if (typeof t["gate"] === "string" && t["gate"].trim()) {
    return { gate: t["gate"].trim() };
  }
  if (Array.isArray(t["selectors"])) {
    const selectors = t["selectors"].filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
    if (selectors.length === 0) return undefined;
    const expectRed = Array.isArray(t["expectRed"])
      ? t["expectRed"].filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
      : [];
    return { selectors, expectRed };
  }
  if (t["customTarget"] === true && typeof t["command"] === "string" && t["command"].trim()) {
    return { command: t["command"], customTarget: true as const };
  }
  return undefined;
}

/**
 * Augments a gate command with the test runner's JUnit argument pointing to junitPath.
 */
export function buildGateWithJunitCommand(
  gateCommand: string,
  junitArg: string,
  junitPath: string
): string {
  let junitPart = junitArg;
  if (junitPart.includes("{path}") || junitPart.includes("{{path}}")) {
    junitPart = junitPart.replace(/\{\{path\}\}|\{path\}/g, shellQuote(junitPath));
  } else if (junitPart.endsWith("=")) {
    junitPart = `${junitPart}${shellQuote(junitPath)}`;
  } else {
    junitPart = `${junitPart} ${shellQuote(junitPath)}`;
  }
  return `${gateCommand} ${junitPart}`;
}

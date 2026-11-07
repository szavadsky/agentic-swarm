import type { DeveloperTarget, InfraArtifact } from "../artifacts.js";

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

function shellQuote(arg: string): string {
  if (/^[a-zA-Z0-9_\-\.\/:=]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Builds a shell-safe target test execution command from infra runner configuration,
 * target selectors, and junit report path.
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
    const gate = infra.gates.find((g) => g.id === target.gate);
    return gate ? gate.command : target.gate;
  }

  const runner = infra.testRunner;
  const parts: string[] = [runner.command];

  if ("selectors" in target && target.selectors && target.selectors.length > 0) {
    if (runner.selectorArgs && runner.selectorArgs.length > 0) {
      for (const sel of target.selectors) {
        parts.push(...runner.selectorArgs, shellQuote(sel));
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

export interface ParsedCase {
  name: string;
  status: "pass" | "fail";
}

export interface ParsedJunit {
  cases: ParsedCase[];
  suiteFailed: boolean;
  truncated: boolean;
}

export function parseJunit(xml: string): ParsedJunit {
  const cases: ParsedCase[] = [];
  const suiteFailed = xml.includes("<failure") || xml.includes("<error");

  const caseMatches = xml.matchAll(
    /<testcase(?:[^>]*?\s)name="([^"]+)"(?:[^>]*?(?:>([\s\S]*?)<\/testcase>|\/>))/g,
  );
  for (const match of caseMatches) {
    const name = match[1] ?? "";
    const content = match[2] ?? "";
    const status =
      content.includes("<failure") || content.includes("<error")
        ? "fail"
        : "pass";
    cases.push({ name, status });
  }

  return { cases, suiteFailed, truncated: false };
}

export function buildGateWithJunitCommand(
  command: string,
  junitPath: string,
): string {
  return `${command} --junitxml=${junitPath}`;
}

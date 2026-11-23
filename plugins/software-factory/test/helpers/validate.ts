import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { BOUNDARY_STEPS } from "../../src/kernel/types.js";

export function taskFile(slug: string, deps: string[]): string {
  return `---\nslug: ${slug}\ntitle: ${slug}\nkind: task\nflow: implement-review\ndeps: [${deps.join(", ")}]\nscope:\n  - "src/**"\n---\n\nDone when: ${slug} works\n`;
}

export function writeFile(root: string, rel: string, content: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return abs;
}

/**
 * The minimal run config that satisfies `process.yaml`'s defaults: every
 * boundary alias, reviewer and flow alias, no subscription pool needed.
 */
export function validRunConfig(): string {
  const names = new Set<string>([
    ...BOUNDARY_STEPS,
    "plan-reviewer",
    "pack-preparer",
    "plan-checker",
    "implementer",
    "implementer-b",
    "researcher",
    "reviewer",
    "qa",
    "steward",
  ]);
  const lines = [...names].map(
    (name) => `  ${name}: { harness: fake, model: ${name}-model }`,
  );
  return `aliases:\n${lines.join("\n")}\n`;
}

export async function runValidate(
  file: string,
  extraArgs: string[] = [],
): Promise<{
  code: number;
  out: string;
  err: string;
}> {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
  try {
    const code = await dispatch(["validate", ...extraArgs, file]);
    return { code, out: logs.join("\n"), err: errors.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

export function withTmp(
  fn: (root: string) => Promise<void>,
): () => Promise<void> {
  return async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-validate-"));
    try {
      await fn(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

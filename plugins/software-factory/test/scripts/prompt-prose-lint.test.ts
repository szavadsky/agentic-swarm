import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promptProseProblems } from "../../scripts/prompt-prose-lint.js";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "../..");

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-prompt-prose-lint-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

describe("promptProseProblems", () => {
  it("keeps an empty allowlist and finds no prompt prose in package src/", () => {
    const allowlist = JSON.parse(
      fs.readFileSync(
        path.join(PACKAGE_ROOT, "config/prompt-prose-allowlist.json"),
        "utf8",
      ),
    ) as Record<string, string>;
    expect(allowlist).toEqual({});
    expect(promptProseProblems(PACKAGE_ROOT)).toEqual([]);
  });

  it("flags second-person agent prose and inline prompt-sink prose in src/", () => {
    write(
      "src/kernel/bad-pm.ts",
      'export function note() { return "You are the reviewer. Answer approve or changes."; }\n',
    );
    write(
      "src/kernel/bad-inject.ts",
      'export async function inject(steerSession: (m: string) => Promise<void>) { await steerSession("A steer arrived while running. Handle it right now."); }\n',
    );

    const problems = promptProseProblems(root);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("src/kernel/bad-inject.ts:1");
    expect(problems[1]).toContain("src/kernel/bad-pm.ts:1");
  });

  it("flags multi-sentence prose passed to repair or runHarness message", () => {
    write(
      "src/kernel/bad-repair.ts",
      'export const vars = { repair: "Re-read the plan carefully. Fix every broken import before replying." };\n',
    );
    write(
      "src/cli/bad-dispatch.ts",
      'export function run(runHarness: (opts: { message: string }) => void) { runHarness({ message: "Open the assignment file. Follow every instruction until done." }); }\n',
    );

    const problems = promptProseProblems(root);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("src/cli/bad-dispatch.ts:1");
    expect(problems[1]).toContain("src/kernel/bad-repair.ts:1");
  });

  it("scans paths the former skip list exempted", () => {
    write(
      "src/kernel/context-pack/bad.ts",
      'export const NOTE = "This is the last call: make the gates green.";\n',
    );
    write(
      "src/kernel/summary/bad.ts",
      'export const NOTE = "You are the reviewer. Answer approve or changes.";\n',
    );

    const problems = promptProseProblems(root);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("src/kernel/context-pack/bad.ts:1");
    expect(problems[1]).toContain("src/kernel/summary/bad.ts:1");
  });
});

describe("promptProseProblems filtering and allowlist", () => {
  it("ignores errors, causes, console output, schema descriptions, and variable docs", () => {
    write(
      "src/kernel/safe.ts",
      [
        'export function fail() { throw new Error("You are not allowed to run on this branch."); }',
        'export function log() { console.error("Your assignment failed before launch."); }',
        "export const schema = { describe: (s: string) => s };",
        'schema.describe("You are the target alias.");',
      ].join("\n"),
    );
    write(
      "src/kernel/prompt-vars-pages/custom.ts",
      'export default { file: "custom.md", prompt: "custom", variables: { repair: "the validator findings from the previous ask; empty string on the first ask" } };\n',
    );

    expect(promptProseProblems(root)).toEqual([]);
  });

  it("honours allowlist entries and reports stale ones", () => {
    write(
      "config/prompt-prose-allowlist.json",
      JSON.stringify({
        "src/kernel/legacy.ts": "temporary",
        "src/kernel/gone.ts": "removed",
      }),
    );
    write(
      "src/kernel/legacy.ts",
      'export const NOTE = "This is the last call: make the gates green.";\n',
    );

    expect(promptProseProblems(root)).toEqual([
      'prompt prose lint: stale allowlist entry "src/kernel/gone.ts" in config/prompt-prose-allowlist.json',
    ]);
  });
});

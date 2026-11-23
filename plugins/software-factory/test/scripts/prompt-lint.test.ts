import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { duplicateHelperProblems } from "../../scripts/duplicate-helpers.js";
import { promptProblems } from "../../scripts/prompt-lint.js";

const PACKAGE = path.join(import.meta.dir, "..", "..");
const LINT_GATE = path.join(PACKAGE, "scripts", "lint.ts");

let root: string;

function write(relative: string, text: string): string {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function stubBinaries(): void {
  for (const name of ["biome", "knip"]) {
    const file = path.join(root, "node_modules", ".bin", name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "#!/usr/bin/env bash\nexit 0\n");
    fs.chmodSync(file, 0o755);
  }
}

function runLint(): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [LINT_GATE, root], { encoding: "utf8" });
}

const SHARED_PARAGRAPH =
  "All tasks must run the verification gates before requesting review and ensure the working tree remains buildable.";

function reference(...names: string[]): void {
  write(
    "test/refs.test.ts",
    names.map((name) => `library.render("${name}");`).join("\n"),
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-lint-test-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("prompt lint checks", () => {
  it("reports a fragment no template, config, source or test references", () => {
    write("prompts/role.md", "A role prompt with prose of its own.\n");
    write("prompts/orphan.md", "This fragment is never referenced.\n");
    reference("role");

    expect(promptProblems(root)).toEqual([
      'prompt lint: orphan fragment "orphan" is not referenced by any prompt, config, src, or test',
    ]);
  });

  it("counts a fragment referenced only by a test as used", () => {
    write("prompts/role.md", "A role prompt with prose of its own.\n");
    reference("role");

    expect(promptProblems(root)).toEqual([]);
  });

  it("reports the same paragraph copied across two fragments", () => {
    write("prompts/alpha.md", `## Work\n\n${SHARED_PARAGRAPH}\n`);
    write("prompts/beta.md", `## Instructions\n\n${SHARED_PARAGRAPH}\n`);
    reference("alpha", "beta");

    const problems = promptProblems(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("duplicated paragraph across");
    expect(problems[0]).toContain("alpha.md");
    expect(problems[0]).toContain("beta.md");
  });

  it("does not report one fragment repeating its own paragraph", () => {
    write(
      "prompts/alpha.md",
      `## Part 1\n\n${SHARED_PARAGRAPH}\n\n## Part 2\n\n${SHARED_PARAGRAPH}\n`,
    );
    reference("alpha");

    expect(promptProblems(root)).toEqual([]);
  });
});
describe("prompt lint includes", () => {
  it("keeps an include behind a runtime condition alive", () => {
    write(
      "prompts/role.md",
      "{% if last_call == \"true\" %}{% include 'conditional' %}{% endif %}\n",
    );
    write("prompts/conditional.md", "Only the last call reads this.\n");
    reference("role");

    expect(promptProblems(root)).toEqual([]);
  });

  it("keeps the reviewer's computed author partials alive", () => {
    write(
      "prompts/reviewer.md",
      "{% assign author_body = author | append: '-body' %}{% include author_body %}\n",
    );
    write("prompts/implementer-body.md", "The author's body.\n");
    reference("reviewer");

    expect(promptProblems(root)).toEqual([]);
  });
});

describe("prompt lint liveness", () => {
  it("keeps a fragment referenced by a config alive", () => {
    write("config/process.yaml", "prompt: role\n");
    write("prompts/role.md", "A role prompt with prose of its own.\n");

    expect(promptProblems(root)).toEqual([]);
  });

  it("reports an orphan fragment and the helper it alone includes", () => {
    write("prompts/dead.md", "{% include 'helper' %}\n");
    write("prompts/helper.md", "Only the dead fragment reads this.\n");

    expect(promptProblems(root)).toEqual([
      'prompt lint: orphan fragment "dead" is not referenced by any prompt, config, src, or test',
      'prompt lint: orphan fragment "helper" is not referenced by any prompt, config, src, or test',
    ]);
  });
});

describe("prompt lint similarity", () => {
  it("reports paragraphs that differ by a single word as duplicated", () => {
    write(
      "prompts/alpha.md",
      "## Work\n\nAll tasks must run the verification gates before requesting review and ensure the working tree remains buildable.\n",
    );
    write(
      "prompts/beta.md",
      "## Instructions\n\nAll tasks should run the verification gates before requesting review and ensure the working tree remains buildable.\n",
    );
    reference("alpha", "beta");

    const problems = promptProblems(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("duplicated paragraph across");
    expect(problems[0]).toContain("alpha.md");
    expect(problems[0]).toContain("beta.md");
  });
});

describe("duplicate helper check", () => {
  const HELPER = `export function copied(value: number): number {
  const first = value + 1;
  const second = first * 2;
  const third = second + value;
  const fourth = third * 2;
  const fifth = fourth + first;
  return first + second + third + fourth + fifth;
}`;

  it("reports the same helper body in two source files", () => {
    write("src/alpha.ts", `${HELPER}\n`);
    write("src/beta.ts", `${HELPER}\n`);

    const problems = duplicateHelperProblems(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('duplicated helper "copied"');
    expect(problems[0]).toContain("src/alpha.ts");
    expect(problems[0]).toContain("src/beta.ts");
  });

  it("leaves distinct helpers alone", () => {
    write(
      "src/alpha.ts",
      "export function alpha(value: number): number {\n  return value + 1;\n}\n",
    );
    write(
      "src/beta.ts",
      "export function beta(value: number): number {\n  return value * 2;\n}\n",
    );

    expect(duplicateHelperProblems(root)).toEqual([]);
  });
});

describe("lint gate", () => {
  it("fails on an orphan fragment and a duplicated paragraph", () => {
    stubBinaries();
    write("prompts/alpha.md", `## Work\n\n${SHARED_PARAGRAPH}\n`);
    write("prompts/beta.md", `## Instructions\n\n${SHARED_PARAGRAPH}\n`);
    write("prompts/orphan.md", "This fragment is never referenced.\n");
    reference("alpha", "beta");

    const result = runLint();
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain('orphan fragment "orphan"');
    expect(output).toContain("duplicated paragraph across");
    expect(output).toContain("alpha.md");
    expect(output).toContain("beta.md");
  });

  it("passes when the prompt inventory and the source are clean", () => {
    stubBinaries();
    write(
      "prompts/role.md",
      "{% if last_call == \"true\" %}{% include 'conditional' %}{% endif %}\n",
    );
    write("prompts/conditional.md", "Only the last call reads this.\n");
    reference("role");

    const result = runLint();
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toBe("");
  });
});

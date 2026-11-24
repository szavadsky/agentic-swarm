import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";

let root: string;

async function runPrompts(args: string[]): Promise<{
  code: number;
  out: string;
  err: string;
}> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...parts: unknown[]) => {
    logs.push(parts.map(String).join(" "));
  };
  console.error = (...parts: unknown[]) => {
    errors.push(parts.map(String).join(" "));
  };
  try {
    const code = await dispatch(["prompts", ...args]);
    return { code, out: logs.join("\n"), err: errors.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function write(relative: string, text: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function shadowImplementer(): void {
  write(
    ".factory/prompts/implementer.md",
    "shadowed implementer for {{task_path}}\n",
  );
}

const CONFIGURED_PROMPTS = [
  "architect",
  "architect-repair",
  "architect-review-return",
  "architect-subarchitects",
  "delivery-repair",
  "digest",
  "front",
  "implementer",
  "intent",
  "pack-preparer",
  "plan-checker",
  "pm",
  "qa",
  "review-architect",
  "reviewer",
  "rescue-turn",
  "steward",
  "subarchitect",
  "subarchitect-agent",
  "unfinished-turn",
];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-prompts-test-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("factory prompts --dry-run", () => {
  it("renders every configured prompt and honours a repo shadow", async () => {
    shadowImplementer();

    const result = await runPrompts(["--dry-run", "--repo", root]);

    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    for (const name of CONFIGURED_PROMPTS) {
      expect(result.out).toContain(`===== ${name} =====`);
    }
    expect(result.out).toContain("shadowed implementer for ");
    expect(result.out).not.toContain("{%");
    expect(result.out).not.toContain("{{");
  });

  it("writes one file per render under --out", async () => {
    shadowImplementer();
    const out = path.join(root, "renders");

    const result = await runPrompts([
      "--dry-run",
      "--repo",
      root,
      "--out",
      out,
    ]);

    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(fs.readdirSync(out).sort()).toEqual(
      CONFIGURED_PROMPTS.map((name) => `${name}.md`).sort(),
    );
    expect(fs.readFileSync(path.join(out, "implementer.md"), "utf8")).toContain(
      "shadowed implementer for ",
    );
    expect(result.out).toContain(
      `prompts: ${CONFIGURED_PROMPTS.length} render(s)`,
    );
  });

  it("requires --dry-run", async () => {
    const result = await runPrompts(["--repo", root]);

    expect(result.code).toBe(1);
    expect(result.err).toContain("prompts requires --dry-run");
  });
});

describe("factory prompts custom templates", () => {
  it("renders a custom template with a custom value", async () => {
    write(".factory/prompts/implementer.md", "custom {{custom_value}}\n");

    const result = await runPrompts(["--dry-run", "--repo", root]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("custom dry-run custom_value");
  });
});

/** The harness-facing subarchitect prompts, rendered by one dry-run. */
async function dryRunSubarchitects(runConfig: string): Promise<{
  architect: string;
  block: string;
  agent: string;
}> {
  // The launch block exists only at depth 2, so every harness sample states it.
  write(
    ".factory/process.yaml",
    "hierarchy:\n  depth: 2\n  subarchitect: { prompt: subarchitect, repairPrompt: architect-repair, deliverable: epic plan }\n",
  );
  const out = path.join(root, "renders-harness");
  const result = await runPrompts([
    "--dry-run",
    "--repo",
    root,
    "--run-config",
    runConfig,
    "--out",
    out,
  ]);
  expect(result.code).toBe(0);
  const read = (name: string) => fs.readFileSync(path.join(out, name), "utf8");
  return {
    architect: read("architect.md"),
    block: read("architect-subarchitects.md"),
    agent: read("subarchitect-agent.md"),
  };
}

describe("factory prompts harness condition", () => {
  function runConfig(name: string, text: string): string {
    const file = path.join(root, name);
    fs.writeFileSync(file, text);
    return file;
  }

  const ACPX = `aliases:
  architect: { harness: acpx-arch, model: test-model }
harnesses:
  acpx-arch: { acpx: { agent: test-agent } }
`;

  const NATIVE = `aliases:
  architect: { harness: omp, model: test-model }
`;

  it("names no tool in the architect prompt for an acpx harness", async () => {
    const { architect, block, agent } = await dryRunSubarchitects(
      runConfig("acpx.yaml", ACPX),
    );
    for (const text of [architect, block, agent]) {
      expect(text).not.toContain("`task` tool");
      expect(text).not.toContain("agent://");
      expect(text).not.toContain("`bash`");
    }
    expect(architect).toContain("## Architect register");
    expect(architect).not.toContain("## Subarchitects in this session");
    expect(block).toContain("as a subagent");
  });

  it("keeps the omp steering text in the architect prompt", async () => {
    const { architect, block, agent } = await dryRunSubarchitects(
      runConfig("native.yaml", NATIVE),
    );
    expect(architect).toContain("## Subarchitects in this session");
    expect(architect).toContain("`task` tool");
    expect(architect).toContain("`write agent://<name>`");
    expect(architect).toContain("- epic `dry-run`");
    expect(block).toContain("`task` tool");
    expect(block).toContain("`write agent://<name>`");
    expect(agent).toContain(
      "tools: [read, grep, glob, edit, write, task, bash]",
    );
    expect(agent).toContain("run `bash` with a short `sleep`");
  });
});

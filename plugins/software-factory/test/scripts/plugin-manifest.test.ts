import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MANIFEST,
  pluginManifestProblems,
} from "../../scripts/plugin-manifest.js";

const PACKAGE = path.join(import.meta.dir, "..", "..");
const LINT_GATE = path.join(PACKAGE, "scripts", "lint.ts");

const VALID = {
  $schema: "https://example.test/plugin.schema.json",
  name: "demo-plugin",
  version: "0.1.0",
  description: "A demo plugin.",
  skills: "./skills/",
};

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-manifest-test-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeManifest(value: unknown): void {
  write(MANIFEST, JSON.stringify(value, null, 2));
}

function writeSkill(dir = "skills/run-factory"): void {
  write(
    `${dir}/SKILL.md`,
    "---\nname: run-factory\ndescription: Run the factory.\n---\n",
  );
}

describe("plugin manifest shape", () => {
  it("accepts the shipped shape when its skills path holds a SKILL.md", () => {
    writeManifest(VALID);
    writeSkill();

    expect(pluginManifestProblems(root)).toEqual([]);
  });

  it("accepts a list of skill directories", () => {
    writeManifest({ ...VALID, skills: ["./skills/", "./extra/"] });
    writeSkill();
    writeSkill("extra/more");

    expect(pluginManifestProblems(root)).toEqual([]);
  });

  it("fails when the manifest is missing", () => {
    expect(pluginManifestProblems(root)).toEqual([
      `plugin manifest: ${MANIFEST}: missing`,
    ]);
  });

  it("fails a manifest that is not JSON", () => {
    write(MANIFEST, "{ not json");

    const problems = pluginManifestProblems(root);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("not JSON");
  });
});

describe("plugin manifest schema", () => {
  it("fails a manifest with no name", () => {
    const { name: _name, ...unnamed } = VALID;
    writeManifest(unnamed);

    const problems = pluginManifestProblems(root);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("required property 'name'");
  });

  it("rejects a manifest-only part, so the flow stays in SKILL.md", () => {
    writeManifest({ ...VALID, commands: "./commands/" });
    writeSkill();

    const problems = pluginManifestProblems(root);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("additional properties");
  });

  it("fails a name that is not kebab-case", () => {
    writeManifest({ ...VALID, name: "Demo_Plugin" });
    writeSkill();

    const problems = pluginManifestProblems(root);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("/name");
  });
});

describe("plugin manifest skills paths", () => {
  it("fails a skills path that is not relative to the plugin root", () => {
    writeManifest({ ...VALID, skills: "skills/" });

    const problems = pluginManifestProblems(root);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((entry) => entry.includes("/skills"))).toBe(true);
  });

  it("fails a skills path that does not resolve to a directory", () => {
    writeManifest({ ...VALID, skills: "./missing/" });

    const problems = pluginManifestProblems(root);

    expect(problems).toEqual([
      `plugin manifest: ${MANIFEST}: skills path "./missing/" is not a directory`,
    ]);
  });

  it("fails a skills path that escapes the plugin root", () => {
    writeManifest({ ...VALID, skills: "./../outside/" });

    const problems = pluginManifestProblems(root);

    expect(problems).toEqual([
      `plugin manifest: ${MANIFEST}: skills path "./../outside/" escapes the plugin root`,
    ]);
  });

  it("fails a skills directory with no SKILL.md", () => {
    writeManifest(VALID);
    write("skills/run-factory/README.md", "not a skill\n");

    const problems = pluginManifestProblems(root);

    expect(problems).toEqual([
      `plugin manifest: ${MANIFEST}: skills path "./skills/" holds no SKILL.md`,
    ]);
  });
});

/** Exit-0 biome and knip stand-ins, so the run tests only the manifest check. */
function stubTools(): void {
  for (const tool of ["biome", "knip"]) {
    const file = path.join(root, "node_modules", ".bin", tool);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "#!/usr/bin/env bash\nexit 0\n");
    fs.chmodSync(file, 0o755);
  }
}

function lint(): { code: number; output: string } {
  const result = spawnSync(process.execPath, [LINT_GATE, root], {
    encoding: "utf8",
  });
  return {
    code: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

describe("plugin manifest in the lint gate", () => {
  it("passes a sound manifest and fails an off-schema one", () => {
    stubTools();
    writeManifest(VALID);
    writeSkill();

    expect(lint().code).toBe(0);

    writeManifest({ ...VALID, commands: "./commands/" });
    const result = lint();

    expect(result.code).toBe(1);
    expect(result.output).toContain(MANIFEST);
    expect(result.output).toContain("additional properties");
  }, 20_000);
});

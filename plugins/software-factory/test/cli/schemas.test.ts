import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import { dispatch } from "../../src/cli/dispatch.js";
import { loadRunConfig } from "../../src/kernel/config.js";
import { kernelSchemaFiles } from "../helpers/kernel-schema-files.js";
import { findShippedRunConfigsDir } from "../helpers/run-configs.js";

async function runSchemas(args: string[]): Promise<{
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
    const code = await dispatch(["schemas", ...args]);
    return { code, out: logs.join("\n"), err: errors.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

function withTmp(fn: (root: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-schemas-"));
    try {
      await fn(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

interface JsonSchema {
  $schema?: string;
  type?: string;
  properties?: Record<string, { enum?: unknown[] }>;
  required?: string[];
  additionalProperties?: boolean;
}

const SHIPPED_RUN_DIR = findShippedRunConfigsDir();

describe("factory schemas", () => {
  factorySchemasPart1();
  factorySchemasPart2();
});

function expectKernelSchemaContent(out: string) {
  const task = JSON.parse(
    fs.readFileSync(path.join(out, "task.schema.json"), "utf8"),
  ) as JsonSchema;
  expect(task.$schema).toContain("json-schema.org");
  expect(task.type).toBe("object");
  expect(task.required).toContain("slug");
  expect(task.required).toContain("title");
  // Input mode: a field the parser defaults stays optional for editors.
  expect(task.required).not.toContain("kind");
  // The exported schema refuses what the parser refuses.
  expect(task.additionalProperties).toBe(false);
  expect(task.properties?.after).toBeUndefined();

  const outcome = JSON.parse(
    fs.readFileSync(path.join(out, "outcome.schema.json"), "utf8"),
  ) as JsonSchema;
  expect(outcome.properties?.status?.enum).toContain("done");

  const qa = JSON.parse(
    fs.readFileSync(path.join(out, "qa.schema.json"), "utf8"),
  ) as JsonSchema;
  expect(qa.properties?.status?.enum).toContain("done");
  expect(qa.properties?.qa).toBeDefined();

  const hold = JSON.parse(
    fs.readFileSync(path.join(out, "hold.schema.json"), "utf8"),
  ) as JsonSchema;
  expect(hold.required).toEqual(expect.arrayContaining(["slugs", "goal"]));
}

function factorySchemasPart1() {
  it(
    "writes every kernel schema as JSON Schema into a new directory",
    withTmp(async (root) => {
      const out = path.join(root, "editor", "schemas");
      const result = await runSchemas(["--out", out]);
      expect(result.code).toBe(0);
      expect(result.err).toBe("");
      expect(fs.readdirSync(out).sort()).toEqual(kernelSchemaFiles());

      expectKernelSchemaContent(out);
    }),
  );

  it(
    "exports the authored run layer while the loader stays resolved and strict",
    withTmp(async (root) => {
      const out = path.join(root, "schemas");
      expect((await runSchemas(["--out", out])).code).toBe(0);
      expectAuthoredRunLayer(out, root);
    }),
  );

  it("requires an output directory", async () => {
    const result = await runSchemas([]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("schemas requires --out <dir>");
  });
}

type ExportedSchema = Parameters<typeof z.fromJSONSchema>[0];

/** The run schema parsed back from the file `factory schemas` wrote. */
function exportedRunSchema(out: string): ExportedSchema {
  return JSON.parse(
    fs.readFileSync(path.join(out, "run.schema.json"), "utf8"),
  ) as ExportedSchema;
}

/**
 * A run file is one layer: it names its base, may state only what it changes,
 * and deletes an inherited key with `null`. The loader still validates the
 * merged config, so the export never loosens a launch.
 */
function expectAuthoredRunLayer(out: string, root: string): void {
  const validator = z.fromJSONSchema(exportedRunSchema(out));
  const accepts = (value: unknown): boolean =>
    validator.safeParse(value).success;

  expect(accepts({ extends: "base.yaml" })).toBe(true);
  expect(accepts({ aliases: { pm: { model: "m" } } })).toBe(true);
  expect(
    accepts({ aliases: { pm: { harness: "fake", fallbacks: null } } }),
  ).toBe(true);
  expect(accepts({ aliases: { pm: null }, scouts: null })).toBe(true);

  // Strict everywhere: an unknown key is a typo, not an inherited value.
  expect(accepts({ bogus: true })).toBe(false);
  expect(accepts({ aliases: { pm: { bogus: true } } })).toBe(false);
  // `null` removes a key; it is not an array entry.
  expect(accepts({ aliases: { pm: { fallbacks: [null] } } })).toBe(false);
  expect(accepts({ extends: "" })).toBe(false);
  expect(accepts({ extends: 7 })).toBe(false);

  // Without a base the layer above is no config: the loader names the field.
  const partial = path.join(root, "partial.yaml");
  fs.writeFileSync(partial, "aliases:\n  pm: { model: m }\n", "utf8");
  expect(() => loadRunConfig(partial)).toThrow(/aliases\.pm\.harness/);

  // A typo in an overlay still fails the merged config's strict schema.
  fs.writeFileSync(
    path.join(root, "base.yaml"),
    "aliases:\n  pm: { harness: fake, model: base }\n",
    "utf8",
  );
  const unknown = path.join(root, "unknown.yaml");
  fs.writeFileSync(
    unknown,
    [
      "extends: base.yaml",
      "aliases:",
      "  pm: { harness: fake, model: m, bogus: true }",
      "",
    ].join("\n"),
    "utf8",
  );
  expect(() => loadRunConfig(unknown)).toThrow(/Unrecognized key/);
}

interface ShippedRunConfigProbe {
  out: string;
  configs: string[];
  runSchema: ExportedSchema;
}

/** Writes the schemas once and returns the exported run schema and configs. */
async function shippedRunConfigProbe(
  root: string,
): Promise<ShippedRunConfigProbe> {
  const out = path.join(root, "schemas");
  expect((await runSchemas(["--out", out])).code).toBe(0);
  // The written file, not the schema it came from: an editor reads this.
  const runSchema = exportedRunSchema(out);
  const validator = z.fromJSONSchema(runSchema);
  const configs = fs
    .readdirSync(SHIPPED_RUN_DIR!)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  const failures: string[] = [];
  for (const name of configs) {
    const config = yaml.parse(
      fs.readFileSync(path.join(SHIPPED_RUN_DIR!, name), "utf8"),
    );
    const result = validator.safeParse(config);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      failures.push(
        `${name}: ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      );
    }
  }
  return { out, configs, runSchema };
}

/** Every shipped config is a file the exported schema accepts. */
function validatesEveryShippedRunConfig(): void {
  it(
    "validates every shipped run config against the exported run schema",
    withTmp(async (root) => {
      const { configs } = await shippedRunConfigProbe(root);
      // A shipped file the gate never loads is no coverage at all.
      expect(configs.length).toBeGreaterThan(0);
      expect(configs).toContain("self.yaml");
    }),
  );
}

/** Artifact LSP reaches omp through the base config every overlay inherits. */
function carriesInheritedArtifactLsp(): void {
  it(
    "carries artifact LSP in the base config every overlay inherits",
    withTmp(async (root) => {
      const { out } = await shippedRunConfigProbe(root);
      const base = yaml.parse(
        fs.readFileSync(path.join(SHIPPED_RUN_DIR!, "base.yaml"), "utf8"),
      ) as Record<string, unknown>;
      // The overlays state only what they change: `lsp` is inherited, so
      // every shipped config runs omp without `--no-lsp` without restating it.
      expect(base.lsp).toBe(true);
      const configs = fs
        .readdirSync(SHIPPED_RUN_DIR!)
        .filter((name) => name.endsWith(".yaml") && name !== "base.yaml")
        .sort();
      expect(configs.length).toBeGreaterThan(0);
      const off: string[] = [];
      for (const name of configs) {
        if (!loadRunConfig(path.join(SHIPPED_RUN_DIR!, name)).lsp) {
          off.push(name);
        }
      }
      expect(off).toEqual([]);
      // The written schema is what an editor validates the key against.
      const run = JSON.parse(
        fs.readFileSync(path.join(out, "run.schema.json"), "utf8"),
      ) as JsonSchema;
      expect(run.properties?.lsp).toBeDefined();
    }),
  );
}

function factorySchemasPart2() {
  describe.skipIf(!SHIPPED_RUN_DIR)(
    "factory schemas: shipped run configs",
    () => {
      validatesEveryShippedRunConfig();
      carriesInheritedArtifactLsp();
    },
  );
}

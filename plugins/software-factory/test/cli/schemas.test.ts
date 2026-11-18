import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";

const FILES = [
  "class.schema.json",
  "hold.schema.json",
  "outcome.schema.json",
  "process.schema.json",
  "repo.schema.json",
  "run.schema.json",
  "task.schema.json",
];

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

describe("factory schemas", () => {
  it(
    "writes every kernel schema as JSON Schema into a new directory",
    withTmp(async (root) => {
      const out = path.join(root, "editor", "schemas");
      const result = await runSchemas(["--out", out]);
      expect(result.code).toBe(0);
      expect(result.err).toBe("");
      expect(fs.readdirSync(out).sort()).toEqual(FILES);

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

      const hold = JSON.parse(
        fs.readFileSync(path.join(out, "hold.schema.json"), "utf8"),
      ) as JsonSchema;
      expect(hold.required).toEqual(expect.arrayContaining(["slugs", "goal"]));
    }),
  );

  it("requires an output directory", async () => {
    const result = await runSchemas([]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("schemas requires --out <dir>");
  });
});

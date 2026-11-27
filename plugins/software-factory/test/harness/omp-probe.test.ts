import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";

/** A catalogue shaped like `omp models --json`, without a live model call. */
const MODELS = {
  models: [
    {
      provider: "local-host",
      id: "mini",
      selector: "local/mini",
      thinking: ["low", "medium", "high"],
    },
    { provider: "local-host", id: "plain" },
    { provider: "local-host", id: "heavy", thinking: ["max"] },
  ],
};

function fakeModelsBinary(dir: string): string {
  const binary = path.join(dir, "fake-omp");
  fs.writeFileSync(
    binary,
    `#!/usr/bin/env bun\nprocess.stdout.write(${JSON.stringify(JSON.stringify(MODELS))} + "\\n");\n`,
    { mode: 0o755 },
  );
  return binary;
}

async function withProbe(
  fn: (probe: (id: string) => ReturnType<OmpHarness["probe"]>) => Promise<void>,
): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-omp-probe-"));
  try {
    const harness = new OmpHarness({
      binary: fakeModelsBinary(root),
      sessionDir: path.join(root, "sessions"),
      retention: "short",
    });
    await fn((id) => harness.probe({ id }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("omp harness probe", () => {
  it("reports a listed model's thinking levels plus auto", async () => {
    await withProbe(async (probe) => {
      expect(await probe("local-host/mini")).toEqual({
        listed: true,
        available: [],
        effort: ["auto", "high", "low", "medium"],
      });
    });
  });

  it("matches a catalogue entry by selector, provider/id or bare id", async () => {
    await withProbe(async (probe) => {
      for (const id of ["local/mini", "local-host/mini", "mini"]) {
        expect(await probe(id)).toEqual({
          listed: true,
          available: [],
          effort: ["auto", "high", "low", "medium"],
        });
      }
    });
  });

  it("reports no effort surface for a listed model without a thinking list", async () => {
    await withProbe(async (probe) => {
      expect(await probe("local-host/plain")).toEqual({
        listed: true,
        available: [],
        effort: null,
      });
    });
  });

  it("offers an alias the union of every catalogued list plus auto", async () => {
    await withProbe(async (probe) => {
      expect(await probe("@free")).toEqual({
        listed: true,
        available: [],
        effort: ["auto", "high", "low", "max", "medium"],
      });
    });
  });

  it("refuses an unlisted model and names every selectable id", async () => {
    await withProbe(async (probe) => {
      expect(await probe("no-such-model")).toEqual({
        listed: false,
        available: [
          "heavy",
          "local-host/heavy",
          "local-host/mini",
          "local-host/plain",
          "local/mini",
          "mini",
          "plain",
        ],
        effort: null,
      });
    });
  });
});

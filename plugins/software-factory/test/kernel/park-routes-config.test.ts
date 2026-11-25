import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigError, loadConfigs } from "../../src/kernel/config.js";

/** Run one check over a repo whose only file is the given repo-layer YAML. */
function withRepo(yaml: string, run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-park-routes-"));
  fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
  fs.writeFileSync(path.join(root, ".factory/repo.yaml"), yaml);
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** One configured cause with the fields the schema requires. */
function parkRoute(lines: string[]): string {
  return ["parkRoutes:", "  gates:", ...lines, ""].join("\n");
}

describe("repo park routes", () => {
  it("reads per-cause park defaults from the repo layer", () => {
    withRepo(
      [
        "parkRoutes:",
        "  gates:",
        "    action: amend",
        "    reason: fix the named gate on the kept branch",
        "    exception: the gate is already red on base or the repo config",
        "  review-rejected: { action: leave, reason: a rejected premise is the architect's, exception: the rejection names concrete findings }",
        "",
      ].join("\n"),
      (root) => {
        const routes = loadConfigs(root).repo.parkRoutes;
        expect(routes?.gates).toEqual({
          action: "amend",
          reason: "fix the named gate on the kept branch",
          exception: "the gate is already red on base or the repo config",
        });
        expect(routes?.["review-rejected"]?.action).toBe("leave");
      },
    );
  });

  it("reads no park routes from a repo that declares none", () => {
    withRepo("baseBranch: main\n", (root) => {
      expect(loadConfigs(root).repo.parkRoutes).toBeUndefined();
    });
  });
});

describe("repo park routes validation", () => {
  it("refuses a cause the kernel cannot route", () => {
    withRepo(
      parkRoute([
        "    action: amend",
        "    reason: fix the named gate on the kept branch",
        "    exception: the gate is already red on base",
        "  retry-instead: { action: amend, reason: x, exception: y }",
      ]),
      (root) => {
        expect(() => loadConfigs(root)).toThrow(ConfigError);
      },
    );
  });

  it("refuses a route action outside the stall decisions", () => {
    withRepo(
      parkRoute([
        "    action: retry",
        "    reason: fix the named gate on the kept branch",
        "    exception: the gate is already red on base",
      ]),
      (root) => {
        expect(() => loadConfigs(root)).toThrow(ConfigError);
      },
    );
  });

  it("refuses a route without the evidence that overrides it", () => {
    withRepo(
      parkRoute([
        "    action: amend",
        "    reason: fix the named gate on the kept branch",
      ]),
      (root) => {
        expect(() => loadConfigs(root)).toThrow(ConfigError);
      },
    );
  });
});

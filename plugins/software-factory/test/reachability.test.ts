import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const PACKAGE_ROOT = path.join(import.meta.dir, "..");
const ENTRYPOINT = "bin/factory.ts";

/**
 * Source files that are deliberately unreachable from the production
 * entrypoint. One reason per entry; an entry that becomes reachable is stale
 * and this test fails so the file is removed from the graph or from the list.
 */
const ALLOWLIST: Record<string, string> = {
  "src/harness/fake/fake-harness.ts": "test double: imported only by tests, never by production code",
  "src/harness/fake/index.ts": "test double barrel: imported only by tests, never by production code",
  "src/kernel/register.ts": "no production caller until M11 wires the architect register",
};

/** Matches `import … from "x"`, `export … from "x"`, including `import type`. */
const FROM_SPECIFIER = /(?:import|export)\s+(?:type\s+)?[^"']*?from\s*["']([^"']+)["']/g;
/** Matches bare side-effect imports: `import "x"`. */
const SIDE_EFFECT_SPECIFIER = /\bimport\s*["']([^"']+)["']/g;
/** Matches dynamic imports: `import("x")`. */
const DYNAMIC_SPECIFIER = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function relativeSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const regex of [FROM_SPECIFIER, SIDE_EFFECT_SPECIFIER, DYNAMIC_SPECIFIER]) {
    for (const match of source.matchAll(regex)) {
      if (match[1]!.startsWith(".")) found.push(match[1]!);
    }
  }
  return found;
}

/** Resolves a relative TypeScript specifier to a package-relative `.ts` path. */
function resolveSpecifier(fromFile: string, specifier: string): string | undefined {
  const base = path.join(path.dirname(fromFile), specifier);
  const candidates = base.endsWith(".ts")
    ? [base]
    : base.endsWith(".js")
      ? [base.slice(0, -".js".length) + ".ts"]
      : [`${base}.ts`, path.join(base, "index.ts")];
  return candidates.find((candidate) => fs.existsSync(path.join(PACKAGE_ROOT, candidate)));
}

/** Every file reachable from the entrypoint by following relative imports. */
function reachableFrom(entrypoint: string): Set<string> {
  const reachable = new Set<string>();
  const queue = [entrypoint];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (reachable.has(file)) continue;
    reachable.add(file);
    if (!file.endsWith(".ts") || !fs.existsSync(path.join(PACKAGE_ROOT, file))) continue;
    const source = fs.readFileSync(path.join(PACKAGE_ROOT, file), "utf8");
    for (const specifier of relativeSpecifiers(source)) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return reachable;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(PACKAGE_ROOT, dir), { withFileTypes: true })) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".ts")) files.push(child);
    }
  };
  walk("src");
  return files.sort();
}

describe("source reachability from bin/factory.ts", () => {
  const reachable = reachableFrom(ENTRYPOINT);
  const unreachable = sourceFiles().filter((file) => !reachable.has(file));

  it("finds every source file outside the reachable set or an allowlist", () => {
    const unexplained = unreachable.filter((file) => !(file in ALLOWLIST));
    expect(unexplained).toEqual([]);
  });

  it("keeps every allowlist entry unreachable and present", () => {
    for (const [file, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.trim().length, `allowlist entry ${file} has no reason`).toBeGreaterThan(0);
      expect(
        fs.existsSync(path.join(PACKAGE_ROOT, file)),
        `allowlist entry ${file} no longer exists`
      ).toBe(true);
      expect(
        reachable.has(file),
        `stale allowlist entry ${file} is now reachable (${reason}); remove it from the allowlist`
      ).toBe(false);
    }
  });
});

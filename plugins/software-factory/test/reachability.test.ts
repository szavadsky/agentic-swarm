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
  "src/harness/fake/fake-harness.ts":
    "test double: imported only by tests, never by production code",
  "src/harness/fake/index.ts":
    "test double barrel: imported only by tests, never by production code",
  "src/harness/fake/types.ts":
    "test double shapes: imported only by the fake harness, never by production code",
  "src/schema-check.ts":
    "standalone schema-validation entrypoint invoked by bun, not imported by production",
  "src/harness/lsp/frontmatter.ts":
    "standalone LSP entrypoint omp spawns by path, not imported by production",
  "src/harness/lsp/types.ts":
    "LSP protocol shapes: imported only by the frontmatter entrypoint, never by production code",
  "src/cli/commands/promote.ts":
    "bootstrap entrypoint scripts/promote.ts runs from the tree, not imported by production",
  "src/cli/commands/bootstrap-dispatch.ts":
    "bootstrap entrypoint scripts/bootstrap-dispatch.ts runs from the tree, not imported by production",
};

/** Matches `import … from "x"`, `export … from "x"`, including `import type`. */
const FROM_SPECIFIER =
  /(?:import|export)\s+(?:type\s+)?[^"']*?from\s*["']([^"']+)["']/g;
/** Matches bare side-effect imports: `import "x"`. */
const SIDE_EFFECT_SPECIFIER = /\bimport\s*["']([^"']+)["']/g;
/** Matches dynamic imports: `import("x")`. */
const DYNAMIC_SPECIFIER = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function relativeSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const regex of [
    FROM_SPECIFIER,
    SIDE_EFFECT_SPECIFIER,
    DYNAMIC_SPECIFIER,
  ]) {
    for (const match of source.matchAll(regex)) {
      if (match[1]!.startsWith(".")) found.push(match[1]!);
    }
  }
  return found;
}

/** Resolves a relative TypeScript specifier to a package-relative `.ts` path. */
function resolveSpecifier(
  fromFile: string,
  specifier: string,
): string | undefined {
  const base = path.join(path.dirname(fromFile), specifier);
  const candidates = base.endsWith(".ts")
    ? [base]
    : base.endsWith(".js")
      ? [base.slice(0, -".js".length) + ".ts"]
      : [`${base}.ts`, path.join(base, "index.ts")];
  return candidates.find((candidate) =>
    fs.existsSync(path.join(PACKAGE_ROOT, candidate)),
  );
}

/** Every file reachable from the entrypoint by following relative imports. */
function reachableFrom(entrypoint: string): Set<string> {
  const reachable = new Set<string>();
  const queue = [entrypoint];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (reachable.has(file)) continue;
    reachable.add(file);
    if (!file.endsWith(".ts") || !fs.existsSync(path.join(PACKAGE_ROOT, file)))
      continue;
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
    for (const entry of fs.readdirSync(path.join(PACKAGE_ROOT, dir), {
      withFileTypes: true,
    })) {
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
      expect(
        reason.trim().length,
        `allowlist entry ${file} has no reason`,
      ).toBeGreaterThan(0);
      expect(
        fs.existsSync(path.join(PACKAGE_ROOT, file)),
        `allowlist entry ${file} no longer exists`,
      ).toBe(true);
      expect(
        reachable.has(file),
        `stale allowlist entry ${file} is now reachable (${reason}); remove it from the allowlist`,
      ).toBe(false);
    }
  });
});

/**
 * Prompt files that are documentation, not renderable fragments. One reason
 * per entry; an entry that becomes rendered or included is stale and this
 * test fails so the file is renamed to a fragment or removed from the list.
 */
const PROMPT_DOCS: Record<string, string> = {
  "VARIABLES.md": "prompt variable reference for authors, never rendered",
};

/**
 * Kernel-raised prompts whose names are not a config literal: a signal or a
 * kernel turn names them at runtime. Each needs a reason, like an allowlist.
 */
const RUNTIME_PROMPTS: Record<string, string> = {
  "bootstrap-assignment":
    "dispatched directly by CLI bootstrap without LiquidJS or node_modules",
  decider:
    "the kernel decide turn renders it on a signal; no flow step or config key names it",
};

/** Matches Liquid includes: `{% include 'name' %}` (either quote, `-` trims allowed). */
const INCLUDE_SPECIFIER = /\{%\s*include\s*['"]([^'"]+)['"]/g;
/** Matches direct fragment renders in src: `.render("name"` and `.placeholders("name"`. */
const RENDER_SPECIFIER = /\.(?:render|placeholders)\(\s*["']([^"']+)["']/g;
/** Matches prompt and repair fragments named in config/process.yaml. */
const PROMPT_SPECIFIER =
  /(?:prompt|unfinishedPrompt|repairPrompt):\s*([A-Za-z0-9_][A-Za-z0-9_/.-]*)/g;

/** Renderable prompt fragments: every .md under prompts without its extension, minus docs. */
function promptFragments(): string[] {
  const fragments: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(PACKAGE_ROOT, dir), {
      withFileTypes: true,
    })) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".md")) {
        const rel = path.relative("prompts", child);
        if (!(rel in PROMPT_DOCS)) fragments.push(rel.slice(0, -".md".length));
      }
    }
  };
  walk("prompts");
  return fragments.sort();
}

/** Matches the reviewer's dynamic includes: `<author>-body`, `review-<author>` duties and `review-<author>-turn` inputs. */
const AUTHOR_BODY_INCLUDE = /\{%-?\s*include\s+author_body\s*-?%\}/;
const REVIEW_DUTIES_INCLUDE = /\{%-?\s*include\s+review_duties\s*-?%\}/;
const REVIEW_TURN_INCLUDE = /\{%-?\s*include\s+review_turn\s*-?%\}/;

interface IncludeScan {
  included: Set<string>;
  authorBody: boolean;
  reviewDuties: boolean;
  reviewTurn: boolean;
}

/** One prompt file's static includes and the dynamic-include flags it sets. */
function scanPromptFile(child: string, scan: IncludeScan): void {
  if (path.relative("prompts", child) in PROMPT_DOCS) return;
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, child), "utf8");
  if (AUTHOR_BODY_INCLUDE.test(source)) scan.authorBody = true;
  if (REVIEW_DUTIES_INCLUDE.test(source)) scan.reviewDuties = true;
  if (REVIEW_TURN_INCLUDE.test(source)) scan.reviewTurn = true;
  for (const match of source.matchAll(INCLUDE_SPECIFIER)) {
    const name = match[1]!;
    scan.included.add(
      name.endsWith(".md") ? name.slice(0, -".md".length) : name,
    );
  }
}

function walkPromptFiles(dir: string, scan: IncludeScan): void {
  for (const entry of fs.readdirSync(path.join(PACKAGE_ROOT, dir), {
    withFileTypes: true,
  })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPromptFiles(child, scan);
    else if (entry.name.endsWith(".md")) scanPromptFile(child, scan);
  }
}

/** Fragments the dynamic includes can resolve to, for every role they name. */
function dynamicFragments(scan: IncludeScan): string[] {
  return promptFragments().filter(
    (fragment) =>
      (scan.authorBody && fragment.endsWith("-body")) ||
      (scan.reviewDuties && fragment.startsWith("review-")) ||
      (scan.reviewTurn &&
        fragment.startsWith("review-") &&
        fragment.endsWith("-turn")),
  );
}

/** Fragments another template pulls in via `{% include %}` (docs excluded: they quote syntax). */
function includedFragments(): Set<string> {
  const scan: IncludeScan = {
    included: new Set<string>(),
    authorBody: false,
    reviewDuties: false,
    reviewTurn: false,
  };
  walkPromptFiles("prompts", scan);
  // The dynamic includes resolve to any role's body, duties or turn inputs,
  // so every `<role>-body`, `review-<role>` and `review-<role>-turn` fragment is
  // reachable through them.
  for (const fragment of dynamicFragments(scan)) scan.included.add(fragment);
  return scan.included;
}

/** Fragments production renders directly: role prompts plus `.render`/`.placeholders` literals in src. */
function entryFragments(): Set<string> {
  const entries = new Set<string>();
  const config = fs.readFileSync(
    path.join(PACKAGE_ROOT, "config", "process.yaml"),
    "utf8",
  );
  for (const match of config.matchAll(PROMPT_SPECIFIER)) {
    entries.add(match[1]!);
  }
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(PACKAGE_ROOT, dir), {
      withFileTypes: true,
    })) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".ts")) {
        const source = fs.readFileSync(path.join(PACKAGE_ROOT, child), "utf8");
        for (const match of source.matchAll(RENDER_SPECIFIER)) {
          entries.add(match[1]!);
        }
      }
    }
  };
  walk("src");
  return entries;
}

describe("prompt fragment reachability", () => {
  const fragments = promptFragments();
  const used = new Set([
    ...includedFragments(),
    ...entryFragments(),
    ...Object.keys(RUNTIME_PROMPTS),
  ]);
  const dead = fragments.filter((fragment) => !used.has(fragment));

  it("keeps every runtime prompt named and reason-carrying", () => {
    for (const [fragment, reason] of Object.entries(RUNTIME_PROMPTS)) {
      expect(
        reason.trim().length,
        `runtime prompt ${fragment} has no reason`,
      ).toBeGreaterThan(0);
      expect(
        fs.existsSync(path.join(PACKAGE_ROOT, "prompts", `${fragment}.md`)),
        `runtime prompt ${fragment} no longer exists`,
      ).toBe(true);
    }
  });

  it("fails on a prompt fragment no template includes and no entrypoint renders", () => {
    expect(dead).toEqual([]);
  });

  it("keeps every prompt doc unrendered and present", () => {
    for (const [file, reason] of Object.entries(PROMPT_DOCS)) {
      expect(
        reason.trim().length,
        `prompt doc ${file} has no reason`,
      ).toBeGreaterThan(0);
      expect(
        fs.existsSync(path.join(PACKAGE_ROOT, "prompts", file)),
        `prompt doc ${file} no longer exists`,
      ).toBe(true);
      expect(
        used.has(file.slice(0, -".md".length)),
        `stale prompt doc ${file} is now rendered or included (${reason}); remove it from the docs`,
      ).toBe(false);
    }
  });
});

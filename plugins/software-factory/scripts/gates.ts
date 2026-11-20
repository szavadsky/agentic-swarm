#!/usr/bin/env bun
/**
 * Package gates as the promotion gate sees them: copy the package working tree
 * (including the uncommitted merge under test) to a bare temp dir with no
 * bootstrap/ sibling and no worktree parent, then install and run one gate or
 * all of them. Tests reaching outside the package fail here, not only at
 * promote time.
 *
 * Usage: bun scripts/gates.ts [package-dir] [gate]
 *   gate: typecheck | tests | format | lint | schema | schema-validation (default: all)
 * `scripts/gates.sh` is the shell face of this file: one exec, no logic.
 *
 * The schema-validation gate also validates the repo's schema-enforced files.
 * The export carries only the package, so both roots arrive in the
 * environment: FACTORY_REPO_ROOT carries the artifact checkout (tasks, class,
 * outcomes) and FACTORY_TREE_ROOT the git toplevel of the tree under test
 * (repo config, bootstrap/run). A caller may point FACTORY_REPO_ROOT at
 * another checkout carrying the artifact tree (e.g. the ops checkout).
 * Otherwise the invoking directory wins when it carries the artifact tree; a
 * bare checkout (task worktree, merge scratch) falls back to the worktree on
 * the repo's base branch, where the operator runs, and finally to the
 * invoking directory.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Temp dirs of this factory (gate exports, test repos, acpx stubs) older than
 * this many minutes belong to a killed run: an EXIT trap misses SIGKILL and
 * timeouts. Far above the longest gate wall, so a live concurrent run is safe.
 */
const STALE_TMP_MINUTES = 360;

/** Repo-config gate id to package script; `schema` is the short alias. */
const GATE_SCRIPTS = new Map<string, string>([
  ["typecheck", "typecheck"],
  ["tests", "test:gate"],
  ["format", "format"],
  ["lint", "lint"],
  ["schema", "schema-validation"],
  ["schema-validation", "schema-validation"],
]);

/** `all` runs these; the separate schema-validation id would only repeat one. */
const ALL_GATES = ["typecheck", "tests", "format", "lint", "schema"] as const;

const EXPECTED_GATES =
  "typecheck, tests, format, lint, schema, schema-validation or all";

/** The export never carries dependencies or VCS data. */
const EXCLUDED_ENTRIES = new Set(["node_modules", ".git"]);

/** The factory's own scratch dirs, by basename (`find -name` globs). */
const STALE_PREFIX = /^(?:factory-|acpx-stub-)/;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failUnknownGate(gate: string): never {
  console.error(`gates: unknown gate '${gate}' (expected ${EXPECTED_GATES})`);
  process.exit(2);
}

/** The package script for one gate id; an unknown id stops before the export. */
function scriptFor(gate: string): string {
  const script = GATE_SCRIPTS.get(gate);
  if (script === undefined) failUnknownGate(gate);
  return script;
}

/** Package scripts to run for one gate id; `all` expands to every gate. */
function gateScripts(gate: string): string[] {
  if (gate === "all") return ALL_GATES.map(scriptFor);
  return [scriptFor(gate)];
}

function warnStaleTmp(dir: string): void {
  console.error(`gates: could not evict every stale temp dir under ${dir}`);
}

/**
 * Removes `factory-*` and `acpx-stub-*` directories directly under `dir` whose
 * mtime is more than `minutes` old, except `keep`. A failed removal warns and
 * does not fail the gate.
 */
export function evictStaleTmp(dir: string, minutes: number, keep = ""): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // An unwritable or vanished scratch root is a warning, never a gate verdict.
    warnStaleTmp(dir);
    return;
  }
  const now = Date.now();
  let failed = false;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === keep || !STALE_PREFIX.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    // `find -ignore_readdir_race`: an entry a concurrent run removed is not work.
    const stats = fs.lstatSync(full, { throwIfNoEntry: false });
    if (!stats) continue;
    if (now - stats.mtimeMs <= minutes * 60_000) continue;
    try {
      fs.rmSync(full, { recursive: true, force: true });
    } catch {
      failed = true;
    }
  }
  if (failed) warnStaleTmp(dir);
}

/** True for an existing directory; also the shell's `[ -d ]` test. */
function isDirectory(target: string): boolean {
  return fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/** The worktree on `base`, by its exact `branch refs/heads/<base>` line. */
function worktreeForBranch(
  porcelain: string,
  base: string,
): string | undefined {
  const want = `branch refs/heads/${base}`;
  let current: string | undefined;
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) current = line.slice("worktree ".length);
    else if (line === want) return current;
  }
  return undefined;
}

/**
 * The checkout carrying the artifact tree. The kernel spawns gates from a task
 * worktree or merge scratch, where .factory/artifacts is gitignored, so the
 * base-branch worktree is the schema gate's tree.
 */
function artifactCheckout(): string | undefined {
  let config: string;
  try {
    config = fs.readFileSync(".factory/repo.yaml", "utf8");
  } catch {
    // No repo config here: a package-only export or an outside fixture.
    return undefined;
  }
  const base = /^baseBranch:.*$/m
    .exec(config)?.[0]
    .replace(/^baseBranch:[ \t]*/, "")
    .replace(/["'\s]/g, "");
  if (!base) return undefined;
  const listed = spawnSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (listed.status !== 0) return undefined;
  const worktree = worktreeForBranch(listed.stdout, base);
  if (!worktree) return undefined;
  const artifacts = path.join(worktree, ".factory/artifacts");
  return isDirectory(artifacts) ? worktree : undefined;
}

/** The artifact checkout, defaulted when the caller exported no root. */
function repoRoot(): string {
  const configured = process.env.FACTORY_REPO_ROOT;
  if (configured) return configured;
  const cwd = process.cwd();
  if (isDirectory(path.join(cwd, ".factory/artifacts"))) return cwd;
  return artifactCheckout() ?? cwd;
}

/** The git toplevel of the tree under test, or the invoking directory. */
function treeRoot(): string {
  const configured = process.env.FACTORY_TREE_ROOT;
  if (configured) return configured;
  const toplevel = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const found = toplevel.status === 0 ? toplevel.stdout.trim() : "";
  return found || process.cwd();
}

/** Copies the package tree without node_modules/.git, as tar's excludes did. */
function exportPackage(pkg: string, destination: string): void {
  for (const entry of fs.readdirSync(pkg, { withFileTypes: true })) {
    if (EXCLUDED_ENTRIES.has(entry.name)) continue;
    fs.cpSync(path.join(pkg, entry.name), path.join(destination, entry.name), {
      recursive: true,
      filter: (source) => !EXCLUDED_ENTRIES.has(path.basename(source)),
    });
  }
  // tar restored the source dir's old mtime onto the export; a concurrent
  // run's eviction would read that as stale.
  const now = new Date();
  fs.utimesSync(destination, now, now);
}

/** Runs one command in `cwd` with inherited stdio; returns its exit status. */
function run(command: string, args: readonly string[], cwd: string): number {
  const result = spawnSync(command, [...args], { cwd, stdio: "inherit" });
  if (result.error) {
    console.error(`gates: ${command}: ${result.error.message}`);
    return 127;
  }
  return result.status ?? 1;
}

function main(): number {
  const [packageArg, gateArg] = process.argv.slice(2);
  const pkg = path.resolve(packageArg || path.resolve(import.meta.dir, ".."));
  const scripts = gateScripts(gateArg || "all");
  process.env.FACTORY_REPO_ROOT = repoRoot();
  process.env.FACTORY_TREE_ROOT = treeRoot();

  const tmpRoot = (process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "");
  const tmp = fs.mkdtempSync(`${tmpRoot}/factory-gates.`);
  try {
    evictStaleTmp(tmpRoot, STALE_TMP_MINUTES, path.basename(tmp));
    try {
      exportPackage(pkg, tmp);
    } catch (error) {
      console.error(`gates: could not export ${pkg}: ${describeError(error)}`);
      return 1;
    }
    if (!fs.existsSync(path.join(tmp, "package.json"))) {
      console.error("gates: no package.json in export");
      return 1;
    }
    const installed = run(
      "bun",
      ["install", "--frozen-lockfile", "--silent"],
      tmp,
    );
    if (installed !== 0) return installed;
    for (const script of scripts) {
      const code = run("bun", ["run", script], tmp);
      if (code !== 0) return code;
    }
    return 0;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (error) {
      console.error(`gates: could not remove ${tmp}: ${describeError(error)}`);
    }
  }
}

if (import.meta.main) process.exit(main());

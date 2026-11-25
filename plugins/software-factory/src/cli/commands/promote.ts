/**
 * `bootstrap/promote.sh`'s body: gate one commit on a clean export and, when
 * the gate is all-pass, link it as the pins root's `current`. The gate result
 * is written to the pin's `gate.yaml`; only an all-pass pin becomes `current`,
 * and a red pin is still recorded (and kept off `current`) so `pinRefusal`
 * bars a launch from it.
 *
 * The gate is every gate the repo declares: typecheck, the suite, format,
 * lint and schema-validation. They are the package scripts `gates.sh all`
 * runs, so a branch that passes its task gate passes promote.
 *
 * Runtime imports are node builtins only: a promotion whose install failed
 * must still record its red gate, before zod or yaml exist in the pin.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PinGate } from "../../kernel/preflight/types.js";
import type { GateVerdicts, PromoteOptions, RunResult } from "./types.js";

export type { GateVerdicts, PromoteOptions, RunResult } from "./types.js";

/** Tree paths the suite and the schema gate read: the rev's copy, never the operator's. */
export const PROMOTE_TREE_PATHS: readonly string[] = [
  ".factory/repo.yaml",
  "bootstrap/run",
  "bootstrap/promote.sh",
  "bootstrap/dispatch.sh",
  "plugins/self-improve",
];

/** A hard promote failure; the entry maps it to this exit code. */
export class PromoteError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "PromoteError";
  }
}

/** Runs one command; a spawn error is 127 and a kill no code, never a throw. */
export function runSync(
  cmd: string,
  args: readonly string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv },
): RunResult {
  const res = spawnSync(cmd, [...args], {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) return { code: 127, stdout: "", stderr: res.error.message };
  return {
    code: res.status === null ? 1 : res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

/** Runs one gate command; its captured output on failure, else undefined. */
function runGate(
  cmd: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const res = runSync(cmd, args, { cwd, env });
  if (res.code === 0) return undefined;
  if (res.stdout) console.error(res.stdout.trimEnd());
  if (res.stderr) console.error(res.stderr.trimEnd());
  return cmd;
}

/** A failing system tool is a hard failure, as the shell's set -e made it. */
function mustRun(
  cmd: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): RunResult {
  const res = runSync(cmd, args, { cwd, env });
  if (res.code !== 0) {
    if (res.stderr) console.error(res.stderr.trimEnd());
    throw new PromoteError(`${cmd} failed with exit ${res.code}`, res.code);
  }
  return res;
}

/** Builds kept: FACTORY_PINS_KEPT, default 5. */
function keptCount(env: NodeJS.ProcessEnv): number {
  const kept = Number(env.FACTORY_PINS_KEPT ?? "5");
  if (!Number.isInteger(kept) || kept < 0) {
    throw new PromoteError(
      `FACTORY_PINS_KEPT must be a non-negative integer, got "${env.FACTORY_PINS_KEPT}"`,
      2,
    );
  }
  return kept;
}

/**
 * Archives one set of paths from the rev into a scratch dir, failing when
 * the archive or the extraction fails, as the shell's `set -e` pipeline did.
 */
function archiveTo(
  repo: string,
  rev: string,
  paths: readonly string[],
  dest: string,
): void {
  const res = spawnSync("git", ["archive", rev, ...paths], {
    cwd: repo,
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (res.error) throw new PromoteError(res.error.message, 127);
  if (res.status !== 0) {
    const err = res.stderr?.toString().trim();
    if (err) console.error(err);
    throw new PromoteError("archive failed", res.status ?? 1);
  }
  const tar = spawnSync("tar", ["-x", "-C", dest], {
    cwd: repo,
    input: res.stdout,
    encoding: "utf8",
  });
  if (tar.status !== 0) {
    const err = tar.stderr?.toString().trim();
    if (err) console.error(err);
    throw new PromoteError("archive failed", tar.status ?? 1);
  }
}

/** The tree paths that exist at the rev, in PROMOTE_TREE_PATHS order. */
function treePathsAt(
  repo: string,
  rev: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const found: string[] = [];
  for (const treePath of PROMOTE_TREE_PATHS) {
    const res = runSync("git", ["cat-file", "-e", `${rev}:${treePath}`], {
      cwd: repo,
      env,
    });
    if (res.code === 0) found.push(treePath);
  }
  return found;
}

/**
 * The pin package to gate: an existing pin is this rev's clean export
 * already, so it is re-gated in place; otherwise the rev's package is
 * exported into the scratch dir and docs are dropped.
 */
function resolvePkg(
  repo: string,
  rev: string,
  build: string,
  tmp: string,
): { pkg: string; fresh: boolean } {
  if (fs.existsSync(build) && fs.statSync(build).isDirectory()) {
    return { pkg: build, fresh: false };
  }
  archiveTo(repo, rev, ["plugins/software-factory"], tmp);
  const pkg = path.join(tmp, "plugins/software-factory");
  // Run baselines are large and not part of the executable.
  fs.rmSync(path.join(pkg, "docs"), { recursive: true, force: true });
  return { pkg, fresh: true };
}

/** The build `pins/current` points at, or undefined when there is none. */
function currentBuild(pins: string): string | undefined {
  if (!fs.existsSync(path.join(pins, "current"))) return undefined;
  try {
    return fs.realpathSync(path.join(pins, "current"));
  } catch {
    return path.resolve(pins, fs.readlinkSync(path.join(pins, "current")));
  }
}

/** Links the build, replacing an existing `current` link. */
function linkCurrent(build: string, pins: string): void {
  try {
    fs.unlinkSync(path.join(pins, "current"));
  } catch {
    // No previous link; symlinkSync below writes it.
  }
  fs.symlinkSync(build, path.join(pins, "current"), "dir");
}

/** Drops the oldest pin builds beyond the kept count. */
function prunePins(
  pins: string,
  kept: number,
  build: string,
  current: string | undefined,
): void {
  const dirs: Array<{ dir: string; mtimeMs: number }> = [];
  for (const entry of fs.readdirSync(pins)) {
    if (entry === "current" || entry.startsWith(".")) continue;
    const dir = path.join(pins, entry);
    const stat = fs.statSync(dir, { throwIfNoEntry: false });
    if (stat?.isDirectory()) dirs.push({ dir, mtimeMs: stat.mtimeMs });
  }
  dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const { dir } of dirs.slice(kept)) {
    if (dir === build || dir === current) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The repo's declared gates, as the package script each runs. The ids are the
 * pin record's verdict keys; `schemaValidation` is the repo config's
 * `schema-validation` gate. They are listed here rather than read from
 * `.factory/repo.yaml` because promote must keep running on node builtins
 * alone: a failed install still has to record its red gate, before a YAML
 * parser exists.
 */
const GATE_SCRIPTS = [
  { key: "typecheck", script: "typecheck" },
  { key: "tests", script: "test:gate" },
  { key: "format", script: "format" },
  { key: "lint", script: "lint" },
  { key: "schemaValidation", script: "schema-validation" },
] as const satisfies readonly {
  key: Exclude<keyof PinGate, "rev" | "at">;
  script: string;
}[];

/**
 * Writes one pin's `gate.yaml`: the rev plus the verdicts promote measured on
 * the clean export. The record's shape is the kernel's pinGateSchema, imported
 * here as a type; the launch check reads it with that schema. Serialised as
 * JSON, which is YAML.
 */
export function writePinGate(
  dir: string,
  rev: string,
  verdicts: GateVerdicts,
): void {
  for (const { key } of GATE_SCRIPTS) {
    const verdict = verdicts[key];
    if (verdict !== "pass" && verdict !== "fail") {
      throw new Error(`${key} must be pass or fail, got "${verdict}"`);
    }
  }
  const gate: PinGate = { rev, ...verdicts, at: new Date().toISOString() };
  fs.writeFileSync(
    path.join(dir, "gate.yaml"),
    `${JSON.stringify(gate, null, 2)}\n`,
    "utf8",
  );
}

/** Gates one package: install, then every declared gate. */
function gatePkg(pkg: string, env: NodeJS.ProcessEnv): GateVerdicts {
  if (runGate("bun", ["install", "--frozen-lockfile", "--silent"], pkg, env)) {
    console.error(`install failed in ${pkg}; the gate records what it can`);
  }
  const verdicts: GateVerdicts = {
    typecheck: "pass",
    tests: "pass",
    format: "pass",
    lint: "pass",
    schemaValidation: "pass",
  };
  for (const { key, script } of GATE_SCRIPTS) {
    if (runGate("bun", ["run", script], pkg, env)) verdicts[key] = "fail";
  }
  return verdicts;
}

/** Links or reports the build by its gate verdict; true when green. */
function linkByGate(gate: PinGate, pins: string, build: string): boolean {
  const red = GATE_SCRIPTS.filter(({ key }) => gate[key] === "fail");
  if (red.length > 0) {
    const recorded = GATE_SCRIPTS.map(({ key }) => `${key}: ${gate[key]}`).join(
      ", ",
    );
    console.error(
      `pin gate red: ${build} (${recorded}); not linked as current`,
    );
    if (currentBuild(pins) === build) {
      console.error(
        "current still points at this red pin; factory run refuses it until a green promote",
      );
    }
    return false;
  }
  linkCurrent(build, pins);
  return true;
}

/**
 * Gates the clean export of the rev and links it as `current` when the gate is
 * all-pass. Prints the build path and returns 0 on success; on a red gate the
 * pin is still recorded (and left off `current`), the cause goes to stderr,
 * and the result is 1. A failed install or archive is a hard error.
 */
export function promotePin(opts: PromoteOptions): number {
  const env: NodeJS.ProcessEnv = opts.env ?? process.env;
  const repo = path.resolve(opts.repo);
  const rev = mustRun(
    "git",
    ["rev-parse", "--short=12", opts.rev ?? "HEAD"],
    repo,
    env,
  ).stdout.trim();
  const pins = path.resolve(
    env.FACTORY_PIN_ROOT ??
      path.join(os.homedir(), ".local/share/factory/pins"),
  );
  const kept = keptCount(env);
  const build = path.join(pins, rev);
  fs.mkdirSync(pins, { recursive: true });

  // Same filesystem as the pins: the final rename is atomic.
  const tmp = fs.mkdtempSync(path.join(pins, ".tmp."));
  try {
    const gateEnv: NodeJS.ProcessEnv = { ...env };
    delete gateEnv.FACTORY_TREE_ROOT;
    const treePaths = treePathsAt(repo, rev, env);
    if (treePaths.length > 0) {
      archiveTo(repo, rev, treePaths, tmp);
      gateEnv.FACTORY_TREE_ROOT = tmp;
    }
    const { pkg, fresh } = resolvePkg(repo, rev, build, tmp);

    const verdicts = gatePkg(pkg, gateEnv);
    writePinGate(pkg, rev, verdicts);
    if (fresh) fs.renameSync(pkg, build);

    const green = linkByGate(
      { ...verdicts, rev, at: new Date().toISOString() },
      pins,
      build,
    );
    prunePins(pins, kept, build, green ? build : currentBuild(pins));
    if (green) {
      console.log(build);
      return 0;
    }
    return 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Config checks: acpx options, binaries, aliases and tiers. */

import fs from "node:fs";
import path from "node:path";
import { resolveAcpxCommand } from "../../harness/acpx/command.js";
import { acpxOptionProblems } from "../../harness/acpx/options.js";
import { OMP_ID } from "../../harness/omp/types.js";
import { YAML_LSP_BINARY, yamlLspBinary } from "../artifact-lsp.js";
import { resolveBaseCommit } from "../baseline.js";
import { configFilePaths } from "../config.js";
import type { Finding } from "../findings.js";
import { outcomeSchemaFor, outcomeSchemaNames } from "../outcome-schemas.js";
import { checkAlias } from "../preflight-aliases.js";
import type { AliasContext } from "../preflight-aliases.js";
import type {
  AliasConfig,
  ArtifactStore,
  ConfigBundle,
  GoalPaths,
  HarnessConfig,
  ProcessConfig,
} from "../types.js";
import {
  escalationFindings,
  fallbackAliasFindings,
  requiredAliases,
  trivialFollowUpFindings,
} from "./checks.js";
import type { PreflightInput } from "./types.js";

/**
 * The acpx adapter reads `options.args` and `options.env`; every other option
 * key is opaque. The shapes are checked here so a launch refuses a malformed
 * value with the config key, before an adapter is constructed or a child is
 * spawned.
 */
export function acpxOptionFindings(
  harnesses: Record<string, HarnessConfig> | undefined,
  file: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [id, entry] of Object.entries(harnesses ?? {})) {
    if (!entry.acpx) continue;
    for (const problem of acpxOptionProblems(entry.options)) {
      findings.push({
        file,
        key: `harnesses.${id}.options.${problem.key}`,
        message: problem.message,
      });
    }
  }
  return findings;
}

function inside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * resolveAcpxCommand's last-resort executable when acpx is not on PATH
 * (`src/harness/acpx/command.ts`): either the literal `bunx` or the absolute
 * bunx path it resolves. Pre-flight receives only the binary, so this basename
 * identifies the on-demand route.
 */
const ACPX_ON_DEMAND_BINARY = "bunx";

function executable(value: string | undefined): boolean {
  if (!value) return false;
  if (!value.includes(path.sep)) return Bun.which(value) !== null;
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * One harness executable that pre-flight must find; the key is the run-config
 * path the operator sets to point at it.
 */
function binaryFinding(
  findings: Finding[],
  file: string,
  harness: string,
  binary: string | undefined,
  key: string,
  unavailable: Set<string>,
): void {
  if (executable(binary)) return;
  unavailable.add(harness);
  // resolveAcpxCommand reports `bunx` when acpx is absent; naming only the
  // shim would hide the dispatcher and the route the operator must provide.
  const message =
    binary !== undefined && path.basename(binary) === ACPX_ON_DEMAND_BINARY
      ? `acpx is not on PATH and the on-demand \`bunx acpx\` route cannot run: binary "bunx" is not executable or not on PATH`
      : `binary "${binary ?? harness}" is not executable or not on PATH`;
  findings.push({ file, key, message });
}

async function writable(dir: string): Promise<string | undefined> {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const probe = await fs.promises.mkdtemp(path.join(dir, ".preflight-"));
    await fs.promises.rm(probe, { recursive: true, force: true });
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

function rootFinding(
  findings: Finding[],
  file: string,
  key: string,
  dir: string,
  repoRoot: string,
  problem?: string,
): void {
  if (inside(dir, repoRoot)) {
    findings.push({
      file,
      key,
      message: `${key} "${dir}" must be outside the repository (${repoRoot})`,
    });
  } else if (problem) {
    findings.push({
      file,
      key,
      message: `${key} "${dir}" is not writable: ${problem}`,
    });
  }
}

/** Aliases the process config names but the run config lacks. */
function requiredAliasFindings(
  process: ProcessConfig,
  aliases: Record<string, AliasConfig>,
  file: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [alias, ref] of requiredAliases(process)) {
    if (!aliases[alias]) {
      findings.push({
        file,
        key: `aliases.${alias}`,
        message: `required by ${ref} but missing`,
      });
    }
  }
  return findings;
}

/** Task types must name a configured flow and a kernel outcome schema. */
function taskTypeFindings(
  process: ProcessConfig,
  processFile: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [name, definition] of Object.entries(process.taskTypes)) {
    if (!Object.hasOwn(process.flows, definition.flow)) {
      findings.push({
        file: processFile,
        key: `taskTypes.${name}.flow`,
        message: `flow "${definition.flow}" is not configured`,
      });
    }
    if (!outcomeSchemaFor(definition.schema)) {
      findings.push({
        file: processFile,
        key: `taskTypes.${name}.schema`,
        message: `schema "${definition.schema}" is not a kernel outcome schema (${outcomeSchemaNames()})`,
      });
    }
  }
  return findings;
}

/** A task tier names a run-config alias directly. */
async function tierFindings(
  store: ArtifactStore,
  aliases: Record<string, AliasConfig>,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const task of await store.listTasks()) {
    if (!task.tier || task.tier === "default" || aliases[task.tier]) continue;
    findings.push({
      file: store.tasks.path(task.slug),
      key: "tier",
      message: `tier "${task.tier}" names no run-config alias`,
    });
  }
  return findings;
}

/** Every harness some configured alias, rotation or fallback can run. */
export function usedHarnesses(
  aliases: Record<string, AliasConfig>,
): Set<string> {
  const used = new Set<string>();
  for (const alias of Object.values(aliases)) {
    used.add(alias.harness);
    for (const entry of alias.rotate ?? []) used.add(entry.harness);
    for (const fallback of alias.fallbacks ?? []) {
      if ("model" in fallback && fallback.harness) used.add(fallback.harness);
    }
  }
  return used;
}

/** Real-launch executable checks, and the harnesses that could not run. */
export function harnessBinaries(
  configs: ConfigBundle,
  files: ReturnType<typeof configFilePaths>,
  input: PreflightInput,
  used: ReadonlySet<string>,
): { findings: Finding[]; unavailable: Set<string> } {
  const findings: Finding[] = [];
  const unavailable = new Set<string>();
  if (!input.binaries) return { findings, unavailable };
  for (const harness of [...used].sort()) {
    const entry = configs.run.harnesses?.[harness];
    if (entry?.acpx?.raw) {
      // A raw agent is still spawned by acpx, so both executables must run:
      // the dispatcher (config override, else PATH/bunx) and the agent head.
      binaryFinding(
        findings,
        files.run,
        harness,
        resolveAcpxCommand(entry.binary).binary,
        `harnesses.${harness}.binary`,
        unavailable,
      );
      binaryFinding(
        findings,
        files.run,
        harness,
        input.binaries[harness],
        `harnesses.${harness}.acpx.agent`,
        unavailable,
      );
      continue;
    }
    binaryFinding(
      findings,
      files.run,
      harness,
      input.binaries[harness],
      `harnesses.${harness}.binary`,
      unavailable,
    );
  }
  // omp's built-in yamlls entry needs the server binary; it does not ship one.
  // Only a real launch checks executables (`binaries` omitted means an injected
  // harness and no executable surface).
  if (configs.run.lsp && used.has(OMP_ID) && !executable(yamlLspBinary())) {
    findings.push({
      file: files.run,
      key: "lsp",
      message: `lsp is enabled but "${YAML_LSP_BINARY}" is not on PATH: omp does not ship the YAML language server`,
    });
  }
  return { findings, unavailable };
}

export function aliasContext(
  input: PreflightInput,
  files: ReturnType<typeof configFilePaths>,
  findings: Finding[],
  unavailable: ReadonlySet<string>,
): AliasContext {
  return {
    findings,
    files,
    harnesses: input.harnesses,
    catalog: input.catalog,
    unavailable,
    subscriptions: new Set(
      Object.keys(input.configs.run.limits.concurrency.perSubscription),
    ),
    capsCache: new Map(),
    modelCache: new Map(),
    probeCache: new Map(),
  };
}

export async function resolveAliases(
  ctx: AliasContext,
  aliases: Record<string, AliasConfig>,
): Promise<Record<string, string | undefined>> {
  const resolved: Record<string, string | undefined> = {};
  for (const [name, alias] of Object.entries(aliases)) {
    await checkAlias(ctx, name, alias, resolved);
  }
  return resolved;
}

/** Writable-root checks for the scratch worktree root and the sessions dir. */
export async function rootFindings(
  paths: GoalPaths,
  files: ReturnType<typeof configFilePaths>,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const worktreeProblem = inside(paths.worktreeRoot, paths.repoRoot)
    ? undefined
    : await writable(paths.worktreeRoot);
  rootFinding(
    findings,
    files.run,
    "worktreeRoot",
    paths.worktreeRoot,
    paths.repoRoot,
    worktreeProblem,
  );
  const sessionsProblem = inside(paths.sessionsDir, paths.repoRoot)
    ? undefined
    : await writable(paths.sessionsDir);
  rootFinding(
    findings,
    files.run,
    "sessions.dir",
    paths.sessionsDir,
    paths.repoRoot,
    sessionsProblem,
  );
  return findings;
}

export async function baseBranchFindings(
  paths: GoalPaths,
  configs: ConfigBundle,
  files: ReturnType<typeof configFilePaths>,
): Promise<{ findings: Finding[]; baseCommit?: string }> {
  const baseCommit = await resolveBaseCommit(
    paths.repoRoot,
    configs.repo.baseBranch,
  );
  if (baseCommit) return { findings: [], baseCommit };
  return {
    findings: [
      {
        file: files.repo,
        key: "baseBranch",
        message: `branch "${configs.repo.baseBranch}" does not exist`,
      },
    ],
  };
}

export function uniqueFindings(findings: Finding[]): Finding[] {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    unique.set(
      `${finding.file}\u0000${finding.key}\u0000${finding.message}`,
      finding,
    );
  }
  return [...unique.values()];
}

/** Task files whose type the config does not define. */
export async function unconfiguredTaskFindings(
  store: ArtifactStore,
): Promise<Finding[]> {
  const taskFindings = await store.scanTaskFindings();
  return taskFindings
    .filter((finding) => finding.kind === "unconfigured-type")
    .map((finding) => ({
      file: finding.file,
      key: "task",
      message: `${finding.kind}: ${finding.reason}`,
    }));
}

/** The static config findings: aliases, fallbacks, process types, tiers. */
export async function configFindings(
  configs: ConfigBundle,
  files: ReturnType<typeof configFilePaths>,
  store: ArtifactStore,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  findings.push(
    ...requiredAliasFindings(configs.process, configs.run.aliases, files.run),
  );
  findings.push(...escalationFindings(configs.run.aliases, files.run));
  findings.push(...fallbackAliasFindings(configs.run.aliases, files.run));
  findings.push(...acpxOptionFindings(configs.run.harnesses, files.run));

  // A task type owns its flow and output schema. A type naming either one
  // wrongly would quarantine every task of that type or fail mid-turn, after
  // the plan spent, so pre-flight refuses the config instead.
  const processFile = fs.existsSync(files.processOverride)
    ? files.processOverride
    : files.processDefault;
  findings.push(...taskTypeFindings(configs.process, processFile));
  // A trivial task implements in the front's session, so a follow-up declared
  // on a step of that flow would never run: refuse it instead of letting the
  // config claim a mode the turn ignores.
  findings.push(...trivialFollowUpFindings(configs.process, processFile));
  // An escalated task naming a missing alias would fail only mid-turn, after
  // the plan spent.
  findings.push(...(await tierFindings(store, configs.run.aliases)));
  return findings;
}

/** Writes the resolved effort levels back into the in-memory run config. */
export function applyResolvedEfforts(
  configs: ConfigBundle,
  resolved: Record<string, string | undefined>,
): void {
  for (const [name, effort] of Object.entries(resolved)) {
    if (name === "scouts") {
      if (configs.run.scouts) configs.run.scouts.effort = effort;
    } else if (configs.run.aliases[name]) {
      configs.run.aliases[name]!.effort = effort;
    }
  }
}

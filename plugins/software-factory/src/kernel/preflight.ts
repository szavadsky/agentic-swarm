import fs from "node:fs";
import path from "node:path";
import { resolveAcpxCommand } from "../harness/acpx/command.js";
import type { Harness } from "../harness/types.js";
import {
  type BaselineResult,
  checkBase,
  resolveBaseCommit,
} from "./baseline.js";
import { configFilePaths } from "./config.js";
import { type Finding, formatFindings } from "./findings.js";
import {
  type AliasContext,
  checkAlias,
  checkScouts,
  type ModelCatalog,
} from "./preflight-aliases.js";
import type {
  AliasConfig,
  ArtifactStore,
  ConfigBundle,
  GoalPaths,
  ProcessConfig,
} from "./types.js";

export type { ModelCatalog } from "./preflight-aliases.js";

export interface PreflightInput {
  configs: ConfigBundle;
  paths: GoalPaths;
  store: ArtifactStore;
  harnesses: ReadonlyMap<string, Harness>;
  /** Resolved harness executables; omitted skips the binary check. */
  binaries?: Record<string, string | undefined>;
  catalog?: ModelCatalog;
  /** Tests may skip the scratch-worktree gate run. */
  baseGates?: boolean;
}

export interface PreflightResult {
  base?: BaselineResult;
  aliases: Record<string, string | undefined>;
}

export class PreflightError extends Error {
  readonly findings: Finding[];
  readonly report: string;

  constructor(findings: Finding[]) {
    const report = formatFindings(
      `pre-flight refused this launch (${findings.length} violation(s)):`,
      findings,
    );
    super(report);
    this.name = "PreflightError";
    this.findings = findings;
    this.report = report;
  }
}

function roleAlias(process: ProcessConfig, role: string): string | undefined {
  const config = process.roles[role];
  return config ? (config.alias ?? role) : undefined;
}

/**
 * An alias's `escalateTo` must name a configured alias and its chain must end:
 * a missing name or a cycle would only fail mid-turn, after the plan spent.
 */
function escalationFindings(
  aliases: Record<string, AliasConfig>,
  file: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [name, alias] of Object.entries(aliases)) {
    if (!alias.escalateTo) continue;
    if (alias.escalateTo === "default") {
      findings.push({
        file,
        key: `aliases.${name}.escalateTo`,
        message: `escalateTo "default" is reserved for "no tier override"; it would re-run the PM's own alias`,
      });
      continue;
    }
    if (!aliases[alias.escalateTo]) {
      findings.push({
        file,
        key: `aliases.${name}.escalateTo`,
        message: `escalateTo "${alias.escalateTo}" names no run-config alias`,
      });
      continue;
    }
    const seen = new Set<string>([name]);
    let current: string | undefined = alias.escalateTo;
    while (current) {
      if (seen.has(current)) {
        findings.push({
          file,
          key: `aliases.${name}.escalateTo`,
          message: `escalateTo chain forms a cycle: ${[...seen, current].join(" -> ")}`,
        });
        break;
      }
      seen.add(current);
      current = aliases[current]?.escalateTo;
    }
  }
  return findings;
}

/**
 * Roles the kernel calls on every goal generation: architect, PM, steward and
 * both plan roles, plus every configured flow step.
 */
function requiredRoles(process: ProcessConfig): Set<string> {
  const roles = new Set([
    "architect",
    "pm",
    "steward",
    "plan-checker",
    "plan-reviewer",
  ]);
  for (const flow of Object.values(process.flows)) {
    for (const step of flow.steps) {
      if (step.role) roles.add(step.role);
    }
    if (flow.followUp?.mode === "different-model" && flow.followUp.role)
      roles.add(flow.followUp.role);
  }
  return roles;
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

/**
 * Validates configs, aliases, models, effort levels, fallbacks, binaries, the
 * roots and the base branch — collecting every violation into one report. A red
 * base is recorded and warned once; it never aborts.
 */
export async function preflight(
  input: PreflightInput,
): Promise<PreflightResult> {
  const { configs, paths, store, harnesses } = input;
  const files = configs.files ?? configFilePaths(paths.repoRoot);
  const findings: Finding[] = [];

  const required = requiredRoles(configs.process);
  for (const role of required) {
    if (!configs.process.roles[role]) {
      findings.push({
        file: fs.existsSync(files.processOverride)
          ? files.processOverride
          : files.processDefault,
        key: `roles.${role}`,
        message: `required role "${role}" is not configured`,
      });
      continue;
    }
    const aliasName = roleAlias(configs.process, role)!;
    if (!configs.run.aliases[aliasName]) {
      findings.push({
        file: files.run,
        key: `aliases.${aliasName}`,
        message: `required by role "${role}" but missing`,
      });
    }
  }

  findings.push(...escalationFindings(configs.run.aliases, files.run));

  // A task tier names a run-config alias directly; an escalated task that names
  // one the run config lacks would fail only mid-turn, after the plan spent.
  for (const task of await store.listTasks()) {
    if (!task.tier || task.tier === "default" || configs.run.aliases[task.tier])
      continue;
    findings.push({
      file: path.join(store.tasksDir, `${task.slug}.md`),
      key: "tier",
      message: `tier "${task.tier}" names no run-config alias`,
    });
  }

  const usedHarnesses = new Set<string>();
  for (const alias of Object.values(configs.run.aliases)) {
    usedHarnesses.add(alias.harness);
    for (const fallback of alias.fallbacks ?? []) {
      if (fallback.harness) usedHarnesses.add(fallback.harness);
    }
  }
  const unavailable = new Set<string>();
  if (input.binaries) {
    for (const harness of [...usedHarnesses].sort()) {
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
  }

  const ctx: AliasContext = {
    findings,
    files,
    harnesses,
    catalog: input.catalog,
    unavailable,
    subscriptions: new Set(
      Object.keys(configs.run.limits.concurrency.perSubscription),
    ),
    capsCache: new Map(),
    modelCache: new Map(),
    probeCache: new Map(),
  };
  const resolvedAliases: Record<string, string | undefined> = {};
  for (const [name, alias] of Object.entries(configs.run.aliases)) {
    await checkAlias(ctx, name, alias, resolvedAliases);
  }
  await checkScouts(ctx, configs, resolvedAliases);

  const worktreeFile =
    !configs.run.worktreeRoot && configs.repo.worktreeRoot
      ? files.repo
      : files.run;
  const worktreeProblem = inside(paths.worktreeRoot, paths.repoRoot)
    ? undefined
    : await writable(paths.worktreeRoot);
  rootFinding(
    findings,
    worktreeFile,
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

  const baseCommit = await resolveBaseCommit(
    paths.repoRoot,
    configs.repo.baseBranch,
  );
  if (!baseCommit) {
    findings.push({
      file: files.repo,
      key: "baseBranch",
      message: `branch "${configs.repo.baseBranch}" does not exist`,
    });
  }

  const unique = new Map<string, Finding>();
  for (const finding of findings)
    unique.set(
      `${finding.file}\u0000${finding.key}\u0000${finding.message}`,
      finding,
    );
  const all = [...unique.values()];
  if (all.length > 0) throw new PreflightError(all);

  const result: PreflightResult = { aliases: resolvedAliases };
  if (baseCommit && input.baseGates !== false) {
    result.base = await checkBase(
      configs,
      store,
      paths.repoRoot,
      configs.repo.baseBranch,
      baseCommit,
    );
  }
  for (const [name, effort] of Object.entries(resolvedAliases)) {
    if (name === "scouts") {
      if (configs.run.scouts) configs.run.scouts.effort = effort;
    } else if (configs.run.aliases[name]) {
      configs.run.aliases[name]!.effort = effort;
    }
  }
  return result;
}

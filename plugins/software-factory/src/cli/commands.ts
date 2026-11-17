import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import yaml from "yaml";
import { git } from "../core/git/exec.js";
import { writeTextAtomic } from "../core/records/io.js";
import {
  configFilePaths,
  loadConfigs,
  processConfigSchema,
  repoConfigSchema,
  resolveGoalPaths,
  runConfigSchema,
} from "../kernel/config.js";
import { summaryRelPath } from "../kernel/context-pack.js";
import { derive } from "../kernel/derive.js";
import { classSchema } from "../kernel/flow-context.js";
import { holdFileSchema } from "../kernel/mailbox.js";
import {
  expectationForStep,
  parseOutcome,
  validateExpectation,
} from "../kernel/outcome.js";
import { createFolderStore } from "../kernel/store.js";
import {
  parseTaskFile,
  validateTaskFlows,
  validateTaskGraph,
} from "../kernel/tasks.js";
import type { FlowDefinition, State } from "../kernel/types.js";

export interface InitResult {
  goalDir: string;
  repoConfig: string;
  repoConfigCreated: boolean;
  intentPath: string;
  intentCreated: boolean;
}

/** Creates the tracked config when missing, the goal layout and its intent. */
export async function initGoal(opts: {
  repo: string;
  goal: string;
  intent?: string;
}): Promise<InitResult> {
  const repoRoot = path.resolve(opts.repo);
  const repoProbe = await git(repoRoot, ["rev-parse", "--git-dir"], {
    allowFail: true,
  });
  if (repoProbe.code !== 0)
    throw new Error(`not a git repository: ${repoRoot}`);

  const files = configFilePaths(repoRoot);
  const created = !fs.existsSync(files.repo);
  if (created) {
    const head = await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"], {
      allowFail: true,
    });
    const current = head.code === 0 ? head.stdout.trim() : "";
    const baseBranch = current && current !== "HEAD" ? current : "main";
    await writeTextAtomic(
      files.repo,
      yaml.stringify(repoConfigSchema.parse({ baseBranch })),
    );
  }

  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, opts.goal);
  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
  await store.ensureLayout();

  const intentPath = path.join(paths.goalDir, "intent.md");
  let intentCreated = false;
  if (!fs.existsSync(intentPath)) {
    const text = opts.intent
      ? await fs.promises.readFile(path.resolve(opts.intent), "utf8")
      : `# Goal: ${opts.goal}\n\nDescribe the outcome this goal must reach, its acceptance criteria and any constraints.\n`;
    await writeTextAtomic(intentPath, text);
    intentCreated = true;
  } else if (opts.intent) {
    const incoming = await fs.promises.readFile(
      path.resolve(opts.intent),
      "utf8",
    );
    const existing = await fs.promises.readFile(intentPath, "utf8");
    if (incoming !== existing) {
      throw new Error(
        `intent already exists at ${intentPath}; edit it instead of overwriting it`,
      );
    }
  }

  return {
    goalDir: paths.goalDir,
    repoConfig: files.repo,
    repoConfigCreated: created,
    intentPath,
    intentCreated,
  };
}

export interface StatusResult {
  goal: string;
  state: State;
  lastSummary?: string;
  goalDir: string;
}

/** Derived state only: status reads tasks + records and never launches anything. */
export async function statusGoal(
  repo: string,
  goal: string,
): Promise<StatusResult> {
  const repoRoot = path.resolve(repo);
  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, goal);
  if (!fs.existsSync(paths.goalDir))
    throw new Error(`goal "${goal}" has no directory at ${paths.goalDir}`);
  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
  const state = derive(
    await store.listTasks(),
    await store.listRecords(),
    configs.process.flows,
  );

  let lastSummary: string | undefined;
  const iterations = (await store.listDir("iterations"))
    .map((name) => Number(name))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a);
  for (const n of iterations) {
    const rel = summaryRelPath(n);
    if (await store.readFile(rel)) {
      lastSummary = path.join(paths.goalDir, rel);
      break;
    }
  }
  return { goal, state, lastSummary, goalDir: paths.goalDir };
}

export type SteerSource = { text: string; source: string };

export async function readSteerSource(file: string): Promise<SteerSource> {
  const text =
    file === "-"
      ? await Bun.stdin.text()
      : await fs.promises.readFile(path.resolve(file), "utf8");
  if (!text.trim()) throw new Error("steer text is empty");
  return { text, source: file === "-" ? "stdin" : path.resolve(file) };
}

/** Atomic maildir drop: write a hidden temp sibling, then rename into the inbox. */
export async function steerGoal(
  repo: string,
  goal: string,
  source: SteerSource,
): Promise<string> {
  const repoRoot = path.resolve(repo);
  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, goal);
  if (!fs.existsSync(paths.goalDir))
    throw new Error(`goal "${goal}" has no directory at ${paths.goalDir}`);
  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
  await store.ensureLayout();

  const hash = crypto
    .createHash("sha256")
    .update(source.text)
    .digest("hex")
    .slice(0, 8);
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const rel = `mailbox/inbox/${stamp}-${hash}.md`;
  await writeTextAtomic(
    path.join(paths.goalDir, rel),
    source.text.endsWith("\n") ? source.text : `${source.text}\n`,
  );
  return path.join(paths.goalDir, rel);
}

/** One schema-enforced file kind `factory validate` recognizes, by path. */
type ValidateKind =
  | "task"
  | "class"
  | "outcome"
  | "hold"
  | "repo"
  | "run"
  | "process";

const KNOWN_VALIDATE_KINDS =
  "tasks/*.md, holds/*.yaml, class.yaml, outcome.yaml, repo.yaml, run.yaml, process.yaml";

function inferValidateKind(absPath: string): ValidateKind | null {
  const base = path.basename(absPath);
  if (base === "class.yaml" || base === "class.yml") return "class";
  if (base === "outcome.yaml" || base === "outcome.yml") return "outcome";
  if (base === "repo.yaml" || base === "repo.yml") return "repo";
  if (base === "run.yaml" || base === "run.yml") return "run";
  if (base === "process.yaml" || base === "process.yml") return "process";
  const segments = absPath.split(path.sep);
  if (segments.includes("holds") && /\.ya?ml$/i.test(base)) return "hold";
  if (segments.includes("tasks") && base.endsWith(".md")) return "task";
  return null;
}

/** Same report shape as the schema-validation gate: `file: key: message`. */
function zodFindings(
  text: string,
  file: string,
  schema: ZodType<unknown>,
): string[] {
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    return [`${file}: invalid YAML: ${(err as Error).message}`];
  }
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    return result.error.issues.map(
      (issue) =>
        `${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
  }
  return [];
}

/**
 * One hold file with the kernel's exported hold schema: same verdicts and
 * messages as `readHolds` (`must be ...` / `not valid YAML: ...`).
 */
function holdFindings(text: string, file: string): string[] {
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    return [`${file}: not valid YAML: ${(err as Error).message}`];
  }
  const result = holdFileSchema.safeParse(raw);
  return result.success
    ? []
    : [`${file}: must be { slugs: string[], goal: boolean }`];
}

/**
 * Nearest repo root above `fromDir`: a directory with `.factory` config or
 * `.git`. Null when the file lives outside any repo (a scratch dir).
 */
function findRepoRoot(fromDir: string): string | null {
  let dir = path.resolve(fromDir);
  while (true) {
    if (
      fs.existsSync(path.join(dir, ".factory", "repo.yaml")) ||
      fs.existsSync(path.join(dir, ".factory", "process.yaml")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Merged process flows for validation: the repo owning the file wins and the
 * `--repo` fallback covers scratch files. `loadConfigs` merges the package
 * defaults, so the built-in flows still apply; an invalid config throws.
 */
function flowsForValidation(
  startDir: string,
  repoFallback?: string,
): Record<string, FlowDefinition> {
  const root =
    findRepoRoot(startDir) ??
    (repoFallback ? path.resolve(repoFallback) : process.cwd());
  return loadConfigs(root).process.flows;
}

/**
 * The step a record directory's `started.yaml` gives its outcome. Absent when
 * the file is not in a record directory; a broken record is an error, never a
 * silently weaker check.
 */
function startedStep(absPath: string): string | undefined {
  const started = path.join(path.dirname(absPath), "started.yaml");
  if (!fs.existsSync(started)) return undefined;
  let parsed: unknown;
  try {
    parsed = yaml.parse(fs.readFileSync(started, "utf8"));
  } catch (err) {
    throw new Error(`${started}: not valid YAML: ${(err as Error).message}`);
  }
  const step = (parsed as { step?: unknown } | null)?.step;
  if (typeof step !== "string" || !step) {
    throw new Error(`${started}: no step to infer the outcome's contract from`);
  }
  return step;
}

export interface ValidateFileOptions {
  /** Flow step the outcome is given for; overrides started.yaml's step. */
  step?: string;
  /** Repo root fallback when the file lives outside any repo. */
  repo?: string;
}

export interface ValidateResult {
  findings: string[];
  /** No `--step` and no started.yaml: only step-independent checks ran. */
  stepIndependent?: boolean;
}

/**
 * One outcome's findings for the step it was given for: `--step` wins, the
 * record's `started.yaml` supplies it otherwise. Without either, only the
 * schema is enforced and the caller reports the narrower check.
 */
function outcomeResult(
  abs: string,
  text: string,
  opts: ValidateFileOptions,
): ValidateResult {
  try {
    const outcome = parseOutcome(text);
    const step = opts.step ?? startedStep(abs);
    if (!step) return { findings: [], stepIndependent: true };
    const expectation = expectationForStep(
      step,
      flowsForValidation(path.dirname(abs), opts.repo),
    );
    return {
      findings: validateExpectation(outcome, expectation).map(
        (finding) => `${abs}: ${finding}`,
      ),
    };
  } catch (err) {
    return { findings: [`${abs}: ${(err as Error).message}`] };
  }
}

/**
 * One task file plus its directory's graph, as the gate groups them: sibling
 * tasks load together so a missing dependency reads as a finding, not a crash.
 */
async function taskFindings(
  absPath: string,
  opts: ValidateFileOptions = {},
): Promise<string[]> {
  const dir = path.dirname(absPath);
  const names = (await fs.promises.readdir(dir))
    .filter((name) => name.endsWith(".md"))
    .sort();
  const tasks: Parameters<typeof validateTaskGraph>[0] = [];
  const findings: string[] = [];
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      tasks.push(
        parseTaskFile(
          await fs.promises.readFile(file, "utf8"),
          path.basename(name, ".md"),
        ),
      );
    } catch (err) {
      findings.push(`${file}: ${(err as Error).message}`);
    }
  }
  for (const finding of validateTaskGraph(tasks)) {
    findings.push(`${dir}: ${finding}`);
  }
  for (const finding of validateTaskFlows(
    tasks,
    flowsForValidation(dir, opts.repo),
  )) {
    findings.push(`${dir}: ${finding}`);
  }
  return findings;
}

/**
 * Validates one schema-enforced file with the same validators as the
 * schema-validation gate. Findings, empty when valid; unknown kinds and
 * missing files throw.
 */
export async function validateFile(
  file: string,
  opts: ValidateFileOptions = {},
): Promise<ValidateResult> {
  const abs = path.resolve(file);
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat) throw new Error(`no such file: ${file}`);
  if (!stat.isFile()) throw new Error(`not a file: ${file}`);
  const kind = inferValidateKind(abs);
  if (!kind) {
    throw new Error(
      `unknown file kind: ${file} (expected ${KNOWN_VALIDATE_KINDS})`,
    );
  }
  const text = await fs.promises.readFile(abs, "utf8");
  switch (kind) {
    case "task":
      return { findings: await taskFindings(abs, opts) };
    case "class":
      return { findings: zodFindings(text, abs, classSchema) };
    case "outcome":
      return outcomeResult(abs, text, opts);
    case "hold":
      return { findings: holdFindings(text, abs) };
    case "repo":
      return { findings: zodFindings(text, abs, repoConfigSchema) };
    case "run":
      return { findings: zodFindings(text, abs, runConfigSchema) };
    case "process":
      return { findings: zodFindings(text, abs, processConfigSchema) };
  }
}

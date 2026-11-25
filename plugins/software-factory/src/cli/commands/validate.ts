/** `factory validate`: file, task and outcome validation and its repairs. */

import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { ZodType } from "zod";
import { OMP_ID } from "../../harness/omp/types.js";
import {
  ConfigError,
  configFilePaths,
  loadConfigs,
  loadRunConfig,
  processOverrideSchema,
  repoConfigSchema,
  resolveRoots,
} from "../../kernel/config.js";
import { classSchema } from "../../kernel/flow-context.js";
import { infraSchema } from "../../kernel/infra.js";
import { holdFileSchema } from "../../kernel/mailbox.js";
import {
  expectationForStep,
  flowStepFor,
  parseOutcome,
  validateExpectation,
} from "../../kernel/outcome.js";
import { PLAN_CHECK_STEP } from "../../kernel/plan-check.js";
import { nonModelFindings, usedHarnesses } from "../../kernel/preflight.js";
import {
  PLAN_REVIEW_STEP,
  validatePlanReviewDelivery,
} from "../../kernel/plan-review.js";
import { qaOutcomeSchema } from "../../kernel/qa.js";
import {
  isAcceptanceStep,
  isLastReviewCall,
  launchesBefore,
} from "../../kernel/review.js";
import { createFolderStore } from "../../kernel/store.js";
import {
  parseTaskFile,
  validateTaskFlows,
  validateTaskGraph,
} from "../../kernel/tasks.js";
import type {
  ConfigBundle,
  ConfigFiles,
  GoalRoots,
  ProcessConfig,
} from "../../kernel/types.js";
import { outcomeSchema } from "../../kernel/types.js";
import { resolveHarnessBinaries } from "../harnesses.js";
import type { ValidateFileOptions, ValidateResult } from "./types.js";
import {
  inferValidateKind,
  KNOWN_VALIDATE_KINDS,
  type ValidateKind,
} from "./validate-kind.js";
import { planCheckFindings } from "./validate-plan-check.js";
import { flowPromptFindings } from "./validate-prompt-findings.js";

/**
 * A run config through its `extends` chain: its findings already name the
 * file that owns each key, base included.
 */
function runFindings(file: string): string[] {
  try {
    loadRunConfig(file);
    return [];
  } catch (err) {
    if (err instanceof ConfigError) {
      return err.findings.map(
        (finding) => `${finding.file}: ${finding.key}: ${finding.message}`,
      );
    }
    return [`${file}: ${(err as Error).message}`];
  }
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

/** One hold file with the kernel's exported hold schema and its messages. */
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

/** Nearest repo root above `fromDir`; null for a file outside any repo. */
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
 * Merged process config for validation: the repo owning the file, or the
 * `--repo` fallback; an invalid config throws.
 */
function processForValidation(
  startDir: string,
  repoFallback?: string,
): ProcessConfig {
  const root =
    findRepoRoot(startDir) ??
    (repoFallback ? path.resolve(repoFallback) : process.cwd());
  return loadConfigs(root).process;
}

/**
 * The step, sequence, slug and revision a record directory's `started.yaml`
 * gives its outcome. Absent when the file is not in a record directory; a
 * broken record is an error, never a silently weaker check.
 */
function startedMeta(
  absPath: string,
): { step: string; seq: number; slug?: string; revision?: number } | undefined {
  const started = path.join(path.dirname(absPath), "started.yaml");
  if (!fs.existsSync(started)) return undefined;
  let parsed: unknown;
  try {
    parsed = yaml.parse(fs.readFileSync(started, "utf8"));
  } catch (err) {
    throw new Error(`${started}: not valid YAML: ${(err as Error).message}`);
  }
  const meta = parsed as {
    step?: unknown;
    seq?: unknown;
    slug?: unknown;
    revision?: unknown;
  } | null;
  if (typeof meta?.step !== "string" || !meta.step) {
    throw new Error(`${started}: no step to infer the outcome's contract from`);
  }
  if (typeof meta.seq !== "number" || !Number.isInteger(meta.seq)) {
    throw new Error(
      `${started}: no sequence to separate earlier launches from this one`,
    );
  }
  const revision = meta.revision;
  if (
    revision !== undefined &&
    (typeof revision !== "number" ||
      !Number.isInteger(revision) ||
      revision < 0)
  ) {
    throw new Error(`${started}: revision must be a non-negative integer`);
  }
  return {
    step: meta.step,
    seq: meta.seq,
    ...(typeof meta.slug === "string" && meta.slug ? { slug: meta.slug } : {}),
    ...(revision !== undefined ? { revision } : {}),
  };
}

/**
 * The record facts an outcome is judged with: the record beside it, and the
 * acceptance call's own step launch count. Reads the records tree once so
 * `debtClosed` ids and the step's earlier launches share it.
 */
async function recordFacts(
  abs: string,
  started: ReturnType<typeof startedMeta>,
  step: string,
  stepConfig: ReturnType<typeof flowStepFor>,
  hasDebt: boolean,
  process: ProcessConfig,
) {
  const recordsDir = path.dirname(path.dirname(abs));
  const recordId = path.basename(path.dirname(abs));
  const acceptance =
    started?.step === step &&
    stepConfig !== undefined &&
    isAcceptanceStep(stepConfig);
  const needsRecords =
    path.basename(recordsDir) === "records" && (hasDebt || acceptance);
  const records = needsRecords
    ? await createFolderStore(
        path.dirname(recordsDir),
        undefined,
        process.taskTypes ?? {},
      ).listRecords()
    : undefined;
  const lastCall =
    acceptance && started !== undefined && stepConfig !== undefined
      ? isLastReviewCall(
          stepConfig,
          launchesBefore(records ?? [], started).changeRequests,
        )
      : false;
  return { recordId, records, lastCall };
}

/**
 * One outcome's findings for the step it was given for: `--step` wins, the
 * record's `started.yaml` supplies it otherwise. Without either, only the
 * schema is enforced and the caller reports the narrower check.
 */
async function outcomeResult(
  abs: string,
  text: string,
  opts: ValidateFileOptions,
): Promise<ValidateResult> {
  try {
    const started = startedMeta(abs);
    const step = opts.step ?? started?.step;
    if (!step) {
      parseOutcome(text);
      return { findings: [], stepIndependent: true };
    }
    const process = processForValidation(path.dirname(abs), opts.repo);
    const stepConfig = flowStepFor(step, process.flows);
    const outcome = parseOutcome(
      text,
      stepConfig?.qa ? qaOutcomeSchema : outcomeSchema,
    );
    const expectation = expectationForStep(step, process.flows);
    const { recordId, records, lastCall } = await recordFacts(
      abs,
      started,
      step,
      stepConfig,
      Boolean(outcome.debtClosed?.length),
      process,
    );
    const findings = validateExpectation(outcome, expectation, {
      lastCall,
      ...(records ? { records, excludeRecordId: recordId } : {}),
    });
    if (step === PLAN_REVIEW_STEP) {
      findings.push(...validatePlanReviewDelivery(outcome));
    }
    if (step === PLAN_CHECK_STEP) {
      findings.push(...(await planCheckFindings(abs, outcome, process)));
    }
    return { findings: findings.map((finding) => `${abs}: ${finding}`) };
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
  const processConfig = processForValidation(dir, opts.repo);
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      tasks.push(
        parseTaskFile(
          await fs.promises.readFile(file, "utf8"),
          path.basename(name, ".md"),
          processConfig.taskTypes,
        ),
      );
    } catch (err) {
      findings.push(`${file}: ${(err as Error).message}`);
    }
  }
  for (const finding of validateTaskGraph(tasks)) {
    findings.push(`${dir}: ${finding}`);
  }
  for (const finding of validateTaskFlows(tasks, processConfig.flows)) {
    findings.push(`${dir}: ${finding}`);
  }
  return findings;
}

/**
 * Cross-layer consistency for a repo/process/run file, in one pass with the
 * non-model pre-flight checks: required aliases, escalating and fallback
 * chains, quota pools, task types, trivial-flow follow-ups, configured
 * executables and the repository roots. Static only: no harness is built, no
 * model list or pool is called, and findings name the owning file and key.
 */
interface CrossLayerBundle {
  configs: ConfigBundle;
  files: ConfigFiles;
  process: ProcessConfig;
  processFile: string;
  root: string;
  roots?: GoalRoots;
}

function crossLayerBundle(
  abs: string,
  kind: ValidateKind,
  opts: ValidateFileOptions,
): CrossLayerBundle | string[] {
  const dir = path.dirname(abs);
  const fileRepoRoot =
    findRepoRoot(dir) ??
    (path.basename(dir) === ".factory" ? path.dirname(dir) : undefined) ??
    (opts.repo ? path.resolve(opts.repo) : undefined);
  const root = fileRepoRoot ?? process.cwd();
  const files = configFilePaths(root);
  let bundle: ReturnType<typeof loadConfigs>;
  try {
    bundle = loadConfigs(root, {
      runConfigPath: kind === "run" ? abs : opts.runConfig,
    });
  } catch (err) {
    return [`${abs}: ${(err as Error).message}`];
  }
  const bundleFiles = bundle.files ?? files;
  const processFile = fs.existsSync(bundleFiles.processOverride)
    ? bundleFiles.processOverride
    : bundleFiles.processDefault;
  return {
    configs: bundle,
    files: bundleFiles,
    process: bundle.process,
    processFile,
    root,
    ...(fileRepoRoot ? { roots: resolveRoots(bundle, fileRepoRoot) } : {}),
  };
}

/**
 * The harness ids a launch registers from a run config: omp always, plus each
 * declared acpx adapter. A bare alias harness has no entry, so it stays a
 * launch check.
 */
function registeredHarnesses(configs: ConfigBundle): ReadonlySet<string> {
  const ids = new Set([OMP_ID]);
  for (const [id, entry] of Object.entries(configs.run.harnesses ?? {})) {
    if (entry.acpx) ids.add(id);
  }
  return ids;
}

/**
 * The executables a run config names without building a harness: a declared
 * harness entry binds one, and omp resolves through PATH. A bare alias harness
 * has no adapter `validate` can resolve, so its executable stays a launch
 * check; the map's keys scope the shared check to what the config declares.
 */
function configuredBinaries(
  configs: ConfigBundle,
): Record<string, string | undefined> | undefined {
  const declared = registeredHarnesses(configs);
  const used = [...usedHarnesses(configs.run.aliases)].filter((harness) =>
    declared.has(harness),
  );
  if (used.length === 0) return undefined;
  const resolved = resolveHarnessBinaries(configs.run.harnesses);
  return Object.fromEntries(
    used.map((harness) => [harness, resolved[harness]]),
  );
}

async function crossLayerFindings(
  abs: string,
  kind: ValidateKind,
  opts: ValidateFileOptions = {},
): Promise<string[]> {
  if (kind !== "repo" && kind !== "process" && kind !== "run") return [];
  const bundleOrError = crossLayerBundle(abs, kind, opts);
  if (Array.isArray(bundleOrError)) return bundleOrError;
  const bundle = bundleOrError;
  const nonModel = await nonModelFindings({
    configs: bundle.configs,
    files: bundle.files,
    binaries: configuredBinaries(bundle.configs),
    harnesses: registeredHarnesses(bundle.configs),
    ...(bundle.roots ? { roots: bundle.roots } : {}),
  });
  return [
    ...nonModel.findings.map(
      (finding) => `${finding.file}: ${finding.key}: ${finding.message}`,
    ),
    ...flowPromptFindings(bundle.process, bundle.processFile, bundle.root),
  ];
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
  const runConfig = opts.runConfig ? path.resolve(opts.runConfig) : undefined;
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat) throw new Error(`no such file: ${file}`);
  if (!stat.isFile()) throw new Error(`not a file: ${file}`);
  const kind = runConfig === abs ? "run" : inferValidateKind(abs);
  if (!kind) {
    throw new Error(
      `unknown file kind: ${file} (expected ${KNOWN_VALIDATE_KINDS}; use --run-config for run files)`,
    );
  }
  const text = await fs.promises.readFile(abs, "utf8");
  let findings: string[] = [];
  switch (kind) {
    case "task":
      findings = await taskFindings(abs, opts);
      break;
    case "class":
      findings = zodFindings(text, abs, classSchema);
      break;
    case "outcome":
      return await outcomeResult(abs, text, opts);
    case "hold":
      findings = holdFindings(text, abs);
      break;
    case "repo":
      findings = zodFindings(text, abs, repoConfigSchema);
      break;
    case "run":
      findings = runFindings(abs);
      break;
    case "process":
      findings = zodFindings(text, abs, processOverrideSchema);
      break;
    case "infra":
      findings = zodFindings(text, abs, infraSchema);
      break;
  }
  findings.push(
    ...(await crossLayerFindings(abs, kind, { ...opts, runConfig })),
  );
  return { findings };
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { git } from "../core/git/exec.js";
import { writeTextAtomic } from "../core/records/io.js";
import { configFilePaths, loadConfigs, repoConfigSchema, resolveGoalPaths } from "../kernel/config.js";
import { derive } from "../kernel/derive.js";
import { createFolderStore } from "../kernel/store.js";
import type { State } from "../kernel/types.js";

export interface InitResult {
  goalDir: string;
  repoConfig: string;
  repoConfigCreated: boolean;
  intentPath: string;
  intentCreated: boolean;
}

/** Creates the tracked config when missing, the goal layout and its intent. */
export async function initGoal(opts: { repo: string; goal: string; intent?: string }): Promise<InitResult> {
  const repoRoot = path.resolve(opts.repo);
  const repoProbe = await git(repoRoot, ["rev-parse", "--git-dir"], { allowFail: true });
  if (repoProbe.code !== 0) throw new Error(`not a git repository: ${repoRoot}`);

  const files = configFilePaths(repoRoot);
  const created = !fs.existsSync(files.repo);
  if (created) {
    const head = await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
    const current = head.code === 0 ? head.stdout.trim() : "";
    const baseBranch = current && current !== "HEAD" ? current : "main";
    await writeTextAtomic(files.repo, yaml.stringify(repoConfigSchema.parse({ baseBranch })));
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
    const incoming = await fs.promises.readFile(path.resolve(opts.intent), "utf8");
    const existing = await fs.promises.readFile(intentPath, "utf8");
    if (incoming !== existing) {
      throw new Error(`intent already exists at ${intentPath}; edit it instead of overwriting it`);
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
export async function statusGoal(repo: string, goal: string): Promise<StatusResult> {
  const repoRoot = path.resolve(repo);
  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, goal);
  if (!fs.existsSync(paths.goalDir)) throw new Error(`goal "${goal}" has no directory at ${paths.goalDir}`);
  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
  const state = derive(await store.listTasks(), await store.listRecords(), configs.process.flows);

  let lastSummary: string | undefined;
  const iterations = (await store.listDir("iterations"))
    .map((name) => Number(name))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a);
  for (const n of iterations) {
    const rel = `iterations/${n}/summary.md`;
    if (await store.readFile(rel)) {
      lastSummary = path.join(paths.goalDir, rel);
      break;
    }
  }
  return { goal, state, lastSummary, goalDir: paths.goalDir };
}

export type SteerSource = { text: string; source: string };

export async function readSteerSource(file: string): Promise<SteerSource> {
  const text = file === "-" ? await Bun.stdin.text() : await fs.promises.readFile(path.resolve(file), "utf8");
  if (!text.trim()) throw new Error("steer text is empty");
  return { text, source: file === "-" ? "stdin" : path.resolve(file) };
}

/** Atomic maildir drop: write a hidden temp sibling, then rename into the inbox. */
export async function steerGoal(repo: string, goal: string, source: SteerSource): Promise<string> {
  const repoRoot = path.resolve(repo);
  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, goal);
  if (!fs.existsSync(paths.goalDir)) throw new Error(`goal "${goal}" has no directory at ${paths.goalDir}`);
  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
  await store.ensureLayout();

  const hash = crypto.createHash("sha256").update(source.text).digest("hex").slice(0, 8);
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const rel = `mailbox/inbox/${stamp}-${hash}.md`;
  await writeTextAtomic(path.join(paths.goalDir, rel), source.text.endsWith("\n") ? source.text : `${source.text}\n`);
  return path.join(paths.goalDir, rel);
}

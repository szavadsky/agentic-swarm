import fs from "node:fs";
import path from "node:path";
import { git } from "../core/git/exec.js";
import { porcelainStatus } from "../core/git/status.js";
import { KeyedMutex } from "../core/mutex.js";
import { type ArtifactWriter, createFolderStore } from "./store.js";
import type {
  ArtifactLocation,
  ArtifactStore,
  GoalPaths,
  TaskTypeDefinition,
} from "./types.js";

/**
 * Sessions, logs, raw agent I/O and temp files are never artifact history. The
 * rule is enforced at the commit boundary, so a stray file an agent drops in
 * the artifact folder cannot enter a backend's git history.
 */
const PRIVATE_COMPONENTS = new Set(["sessions", "logs", "raw"]);
const PRIVATE_SUFFIX = /\.(jsonl|log|tmp)$/;

const GIT_REPO_IGNORE = [
  "# Factory artifact store: transcripts, logs and raw agent I/O never enter git.",
  "# The committer also filters these paths; this file keeps a stray `git add -A` out.",
  "sessions/",
  "logs/",
  "raw/",
  "*.jsonl",
  "*.log",
  "*.tmp",
  "",
].join("\n");

/** The marker the folder backend writes into its root `.gitignore`. */
const FOLDER_IGNORE_MARKER = "# Factory goal records live here";

const ADD_BATCH = 200;

/**
 * The trailer the store puts in every commit it authors. Containment reads it
 * to tell a store write apart from an operator commit stacked with one.
 */
export const STORE_COMMIT_TRAILER = "Factory-Store-Commit";

/** True for a repo-relative path no backend may commit. */
export function isPrivateArtifact(rel: string): boolean {
  const parts = rel.split("/");
  if (parts.some((part) => PRIVATE_COMPONENTS.has(part))) return true;
  if (parts.some((part) => part.endsWith(".tmp"))) return true;
  return PRIVATE_SUFFIX.test(rel);
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size)
    out.push(values.slice(i, i + size));
  return out;
}

/** One process-wide queue per artifact checkout: two goals share a store repo. */
const checkoutQueues = new KeyedMutex();

/**
 * One git-backed artifact tree. Every store mutation settles into a commit:
 * `same-repo` commits into the checkout that hosts the artifacts, `git-repo`
 * commits in the separate checkout and pushes it to the configured remote.
 * `--only` keeps an operator's unrelated staged work in the hosting checkout
 * out of the artifact commit.
 */
class GitArtifactWriter implements ArtifactWriter {
  constructor(
    private readonly checkout: string,
    /** Repo-relative directory the store owns; `.` for a separate repo. */
    private readonly relRoot: string,
    private readonly remote: string | undefined,
    private readonly prepareCheckout: () => Promise<void>,
  ) {}

  async prepare(): Promise<void> {
    await this.prepareCheckout();
  }

  async commit(goal: string): Promise<string | null> {
    return checkoutQueues.runExclusive(this.checkout, async () => {
      const changed = await this.changedPaths();
      if (changed.length === 0) return null;
      for (const batch of chunks(changed, ADD_BATCH)) {
        await git(this.checkout, ["add", "-A", "--", ...batch]);
      }
      const staged = (
        await git(this.checkout, [
          "diff",
          "--cached",
          "--name-only",
          "-z",
          "--",
          ...changed,
        ])
      ).stdout
        .split("\0")
        .filter(Boolean);
      if (staged.length === 0) return null;
      await git(this.checkout, [
        "commit",
        "-m",
        `factory: ${goal} artifacts\n\n${STORE_COMMIT_TRAILER}: ${goal}`,
        "--only",
        "--",
        ...staged,
      ]);
      const sha = (await git(this.checkout, ["rev-parse", "HEAD"])).stdout;
      if (this.remote) await git(this.checkout, ["push", "origin", "HEAD"]);
      return sha;
    });
  }

  private async changedPaths(): Promise<string[]> {
    const entries = await porcelainStatus(this.checkout, {
      ...(this.relRoot === "." ? {} : { pathspec: this.relRoot }),
    });
    const paths = new Set<string>();
    for (const entry of entries) {
      for (const rel of [entry.path, entry.from]) {
        if (rel && this.owns(rel) && !isPrivateArtifact(rel)) paths.add(rel);
      }
    }
    return [...paths].sort();
  }

  private owns(rel: string): boolean {
    if (this.relRoot === ".") return !rel.startsWith(".git/");
    return rel === this.relRoot || rel.startsWith(`${this.relRoot}/`);
  }
}

/** A git-repo checkout that is absent is cloned; without a remote it is born empty. */
async function openCheckout(
  root: string,
  remote: string | undefined,
): Promise<void> {
  if (fs.existsSync(path.join(root, ".git"))) {
    if (remote) await ensureOrigin(root, remote);
    return;
  }
  if (fs.existsSync(root) && (await fs.promises.readdir(root)).length > 0) {
    throw new Error(
      `artifacts.root "${root}" exists, is not a git repository, and is not empty`,
    );
  }
  await fs.promises.mkdir(path.dirname(root), { recursive: true });
  if (remote) {
    await git(path.dirname(root), ["clone", remote, root]);
    await ensureOrigin(root, remote);
  } else {
    await fs.promises.mkdir(root, { recursive: true });
    await git(root, ["init", "-b", "main"]);
  }
}

async function ensureOrigin(root: string, remote: string): Promise<void> {
  const current = await git(root, ["remote", "get-url", "origin"], {
    allowFail: true,
  });
  if (current.code !== 0) {
    await git(root, ["remote", "add", "origin", remote]);
  } else if (current.stdout !== remote) {
    await git(root, ["remote", "set-url", "origin", remote]);
  }
}

/** A separate artifact repository: clone/init, then keep the private ignore. */
async function prepareGitRepo(location: ArtifactLocation): Promise<void> {
  await openCheckout(location.root, location.remote);
  const ignore = path.join(location.root, ".gitignore");
  if (!fs.existsSync(ignore)) {
    await fs.promises.writeFile(ignore, GIT_REPO_IGNORE, "utf8");
  }
}

/**
 * A same-repo root keeps the factory's own ignore current. The folder backend's
 * `*` marker would keep every artifact out of git, so it is replaced; any other
 * ignore file is left to its owner.
 */
async function prepareSameRepo(root: string): Promise<void> {
  const ignore = path.join(root, ".gitignore");
  let text: string | null = null;
  try {
    text = await fs.promises.readFile(ignore, "utf8");
  } catch (err) {
    if (!isENOENT(err)) throw err;
  }
  if (text === null || text.startsWith(FOLDER_IGNORE_MARKER)) {
    await fs.promises.mkdir(root, { recursive: true });
    await fs.promises.writeFile(ignore, GIT_REPO_IGNORE, "utf8");
  }
}

/**
 * The store for the backend the repo config selected. The folder backend keeps
 * artifacts in an ignored directory; the two git backends settle every write
 * into a commit, so no orchestration artifact is left unmerged on a branch.
 */
export function createArtifactStore(
  paths: GoalPaths,
  taskTypes: Record<string, TaskTypeDefinition>,
): ArtifactStore {
  const location = paths.artifacts;
  if (location.backend === "folder") {
    return createFolderStore(paths.goalDir, location.root, taskTypes);
  }
  if (location.backend === "same-repo") {
    const relRoot = path
      .relative(paths.repoRoot, location.root)
      .split(path.sep)
      .join("/");
    return createFolderStore(
      paths.goalDir,
      undefined,
      taskTypes,
      new GitArtifactWriter(paths.repoRoot, relRoot, undefined, () =>
        prepareSameRepo(location.root),
      ),
    );
  }
  return createFolderStore(
    paths.goalDir,
    undefined,
    taskTypes,
    new GitArtifactWriter(location.root, ".", location.remote, () =>
      prepareGitRepo(location),
    ),
  );
}

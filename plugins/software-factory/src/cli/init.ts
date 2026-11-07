import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface InitOptions {
  repoRoot: string;
  pluginRoot?: string;
  silent?: boolean;
}

/**
 * Initializes `.factory/project.yaml` from template and commits it to git (§11).
 */
export async function runInit(opts: InitOptions): Promise<number> {
  const repoRoot = path.resolve(opts.repoRoot);
  const pluginRoot = opts.pluginRoot
    ? path.resolve(opts.pluginRoot)
    : path.resolve(import.meta.dir ?? __dirname, "../..");

  const targetDir = path.join(repoRoot, ".factory");
  const targetFile = path.join(targetDir, "project.yaml");

  if (fs.existsSync(targetFile)) {
    if (!opts.silent) {
      console.log(`[factory init] .factory/project.yaml already exists in ${repoRoot}`);
    }
    return 0;
  }

  const templatePath = path.join(pluginRoot, "config", "project.template.yaml");
  if (!fs.existsSync(templatePath)) {
    console.error(`[factory init] Project template not found at ${templatePath}`);
    return 1;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(templatePath, targetFile);

  if (!opts.silent) {
    console.log(`[factory init] Created .factory/project.yaml from template`);
  }

  // Attempt git commit if inside a git repository
  try {
    const isGit = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (isGit === "true") {
      execFileSync("git", ["add", ".factory/project.yaml"], {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });

      execFileSync("git", ["commit", "-m", "Initialize factory project.yaml"], {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });

      if (!opts.silent) {
        console.log(`[factory init] Committed .factory/project.yaml to git`);
      }
    }
  } catch {
    // If git commit fails (e.g. empty git repo, no identity, or not git), leave file written
  }

  return 0;
}

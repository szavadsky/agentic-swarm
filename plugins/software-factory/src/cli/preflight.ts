import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadProjectConfig, loadPipelineConfig } from "../core/config/loader.js";
import { resolveRole } from "../core/config/roles.js";
import { loadPromptLibrary, preflightPrompts } from "../core/prompts.js";
import { defaultSchemaCache } from "../core/records/schema-cache.js";
import { generateOmpConfigOverlay, writeOmpConfigOverlay } from "../harness/omp/overlay.js";
 import { isRunLockFree } from "./lock.js";
import { taskBranch, worktreePath } from "../core/git/naming.js";
 import { porcelainStatus, findDirtyEntries } from "../core/git/index.js";
 import { KNOWN_VARS } from "../core/prompt-vars.js";
import { checkDiskSpace, type DiskSpaceProbe } from "../core/disk-space.js";
export interface PreflightOptions {
  repoRoot: string;
  task: string;
  pluginRoot?: string;
  ompBinary?: string;
   silent?: boolean;
  diskSpaceProbe?: DiskSpaceProbe;
 }
export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Warns (does not fail) when common linter configs in the repo root do not mention
 * the orchestration folder (.factory or custom orchestration folder).
 */
export function checkLinterConfigsForOrchestrationFolder(
  repoRoot: string,
  orchestrationFolder: string
): string[] {
  const warnings: string[] = [];
  const orchRoot = orchestrationFolder.split("/")[0] ?? ".factory";

  const mentionsFolder = (content: string): boolean => {
    return content.includes(orchRoot) || content.includes(orchestrationFolder);
  };

  // 1. ruff.toml
  const ruffTomlPath = path.join(repoRoot, "ruff.toml");
  if (fs.existsSync(ruffTomlPath)) {
    try {
      const content = fs.readFileSync(ruffTomlPath, "utf8");
      if (!mentionsFolder(content)) {
        warnings.push(
          `Linter config "ruff.toml" does not mention orchestration folder "${orchestrationFolder}". Linters scanning the orchestration folder may fail on internal artifacts.`
        );
      }
    } catch {}
  }

  // 2. pyproject.toml ([tool.ruff])
  const pyprojectPath = path.join(repoRoot, "pyproject.toml");
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, "utf8");
      if (content.includes("[tool.ruff") || content.includes("tool.ruff")) {
        if (!mentionsFolder(content)) {
          warnings.push(
            `Linter config in "pyproject.toml" ([tool.ruff]) does not mention orchestration folder "${orchestrationFolder}". Linters scanning the orchestration folder may fail on internal artifacts.`
          );
        }
      }
    } catch {}
  }

  // 3. .eslintrc*, rumdl.toml, .markdownlint*, .yamllint*
  try {
    const files = fs.readdirSync(repoRoot);
    for (const f of files) {
      if (f.startsWith(".eslintrc")) {
        try {
          const content = fs.readFileSync(path.join(repoRoot, f), "utf8");
          if (!mentionsFolder(content)) {
            warnings.push(
              `Linter config "${f}" does not mention orchestration folder "${orchestrationFolder}". Linters scanning the orchestration folder may fail on internal artifacts.`
            );
          }
        } catch {}
      } else if (f === "rumdl.toml") {
        try {
          const content = fs.readFileSync(path.join(repoRoot, f), "utf8");
          if (!mentionsFolder(content)) {
            warnings.push(
              `Linter config "rumdl.toml" does not mention orchestration folder "${orchestrationFolder}". Linters scanning the orchestration folder may fail on internal artifacts.`
            );
          }
        } catch {}
      } else if (f.startsWith(".markdownlint")) {
        try {
          const content = fs.readFileSync(path.join(repoRoot, f), "utf8");
          if (!mentionsFolder(content)) {
            warnings.push(
              `Linter config "${f}" does not mention orchestration folder "${orchestrationFolder}". Linters scanning the orchestration folder may fail on internal artifacts.`
            );
          }
        } catch {}
      } else if (f.startsWith(".yamllint")) {
        try {
          const content = fs.readFileSync(path.join(repoRoot, f), "utf8");
          if (!mentionsFolder(content)) {
            warnings.push(
              `Linter config "${f}" does not mention orchestration folder "${orchestrationFolder}". Linters scanning the orchestration folder may fail on internal artifacts.`
            );
          }
        } catch {}
      }
    }
  } catch {}

  return warnings;
}

/**
 * Runs all preflight validations for a task (§11):
 *  1. First-run cleanliness (§7)
 *  2. Configs + layers valid
 *  3. Roles resolve without cycles
 *  4. Prompts preflight (templates render without missing vars)
 *  5. Schemas compile cleanly
 *  6. OMP binary present and generated config overlay is valid
 *  7. Run lock is free
 */
export async function runPreflight(opts: PreflightOptions): Promise<PreflightResult> {
  const repoRoot = path.resolve(opts.repoRoot);
  const task = opts.task;
  const pluginRoot = opts.pluginRoot
    ? path.resolve(opts.pluginRoot)
    : path.resolve(import.meta.dir ?? __dirname, "../..");
  const errors: string[] = [];
  const warnings: string[] = [];

  const log = (msg: string) => {
    if (!opts.silent) console.log(msg);
  };

  // 1. Load project config
  let projectConfig: any;
  const projectYamlPath = path.join(repoRoot, ".factory", "project.yaml");
  try {
    if (!fs.existsSync(projectYamlPath)) {
      errors.push(`Missing project configuration at ${projectYamlPath}. Run "factory init" first.`);
    } else {
      projectConfig = loadProjectConfig(projectYamlPath, { pluginRoot });
    }
  } catch (err: any) {
    errors.push(`Invalid project config: ${err.message}`);
  }

  const orchestrationFolder = projectConfig?.orchestrationFolder ?? ".factory/tasks";

  // Check common linter configs in repo root (warn, not fail)
  const linterWarnings = checkLinterConfigsForOrchestrationFolder(repoRoot, orchestrationFolder);
  warnings.push(...linterWarnings);

  // 2. First-run cleanliness (§7)
  try {
    const branchName = taskBranch(task);
    let branchExists = false;
    try {
      execFileSync("git", ["rev-parse", "--verify", branchName], {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });
      branchExists = true;
    } catch {
      branchExists = false;
    }

    if (!branchExists) {
      // First run for this task: main checkout must be clean except INTENT.md (§7)
      const entries = await porcelainStatus(repoRoot);
      const intentRelative = path.join(orchestrationFolder, task, "INTENT.md");

      const dirty = findDirtyEntries(entries, {
        orchestrationFolder,
        currentIntentPath: intentRelative,
      });

      if (dirty.length > 0) {
        errors.push(
          `First-run cleanliness check failed: repository has uncommitted changes outside INTENT.md:\n` +
            dirty.map((e) => `  ${e.code} ${e.path}`).join("\n")
        );
      }
    }
  } catch {
    // If not a git repo, skip git cleanliness check
  }

   // 3. Load & validate pipeline config
   let pipelineConfig: any;
   try {
    // Check task worktree first (§task layer lives in task worktree after first run)
    const branchName = taskBranch(task);
    const absWtRoot = path.resolve(repoRoot, projectConfig?.worktreeRoot ?? "../repo.factory-wt");
    const wtPath = worktreePath(absWtRoot, branchName);
    const wtTaskYaml = path.join(wtPath, orchestrationFolder, task, "pipeline.yaml");
    const mainTaskYaml = path.join(repoRoot, orchestrationFolder, task, "pipeline.yaml");

    const taskYamlPath = (fs.existsSync(wtPath) && fs.existsSync(wtTaskYaml))
      ? wtTaskYaml
      : (fs.existsSync(mainTaskYaml) ? mainTaskYaml : undefined);

     const loaded = loadPipelineConfig({
       pluginRoot,
       repoRoot,
      taskYamlPath,
     });
     pipelineConfig = loaded.config;

     if (loaded.structural && loaded.structural.errors.length > 0) {
       errors.push(
         ...loaded.structural.errors.map((e) => `Pipeline config error: ${e}`)
       );
     }
   } catch (err: any) {
     errors.push(`Pipeline config loading failed: ${err.message}`);
   }

  // 3b. Disk-space guards (§limits.minFreeDiskMb, default 2048)
  try {
    const minFreeDiskMb =
      (pipelineConfig?.limits?.minFreeDiskMb as number | undefined) ?? 2048;
    const diskCheck = await checkDiskSpace({
      repoRoot,
      worktreeRoot: projectConfig?.worktreeRoot,
      minFreeDiskMb,
      probe: opts.diskSpaceProbe,
    });

    if (!diskCheck.ok) {
      errors.push(
        `Insufficient disk space: free space is below ${minFreeDiskMb} MB threshold:\n` +
          diskCheck.paths
            .map((p) => `  ${p.name} (${p.path}): ${p.freeMb} MB free (threshold: ${minFreeDiskMb} MB)`)
            .join("\n")
      );
    } else if (!opts.silent) {
      log(
        `Disk space check passed (threshold ${minFreeDiskMb} MB):\n` +
          diskCheck.paths.map((p) => `  ${p.name} (${p.path}): ${p.freeMb} MB free`).join("\n")
      );
    }
  } catch (err: any) {
    errors.push(`Disk space check failed: ${err.message}`);
  }
  // 4. Role resolution & cycles
  if (pipelineConfig?.models?.roles) {
    const roles = pipelineConfig.models.roles;
    for (const roleName of Object.keys(roles)) {
      try {
        const resolved = resolveRole(roleName, roles);
        if (resolved.models.length === 0) {
          errors.push(`Role "${roleName}" resolved to 0 concrete models.`);
        }
      } catch (err: any) {
        errors.push(`Role resolution error for "${roleName}": ${err.message}`);
      }
    }

    if (pipelineConfig.agents) {
      for (const [agentName, agentCfg] of Object.entries<any>(pipelineConfig.agents)) {
        if (agentCfg?.role && !roles[agentCfg.role]) {
          errors.push(`Agent "${agentName}" references undeclared role "${agentCfg.role}".`);
        }
      }
    }
  }

  // 5. Prompts preflight
  if (pipelineConfig) {
    try {
      const builtinDir = path.join(pluginRoot, "agents");
      const promptLib = loadPromptLibrary({
        builtinDir,
        overrideDirs: pipelineConfig.prompts?.extraSkillDirs ?? [],
        overrides: pipelineConfig.prompts?.overrides,
      });
      const promptErrors = preflightPrompts(promptLib, pipelineConfig);
      if (promptErrors.length > 0) {
        errors.push(...promptErrors.map((e) => `Prompt preflight: ${e}`));
      }

      // Render check every fragment referenced by the effective pipeline and orchestration (§10, §11)
      const fragmentsToCheck = new Set<string>();
      if (pipelineConfig.flows) {
        if (pipelineConfig.flows.simple?.steps) {
          for (const s of pipelineConfig.flows.simple.steps) {
            fragmentsToCheck.add(s.stepFragment ?? s.id);
          }
        }
        if (pipelineConfig.flows.story) {
          for (const k of Object.values<any>(pipelineConfig.flows.story)) {
            for (const s of k?.steps ?? []) {
              fragmentsToCheck.add(s.stepFragment ?? s.id);
            }
          }
        }
        if (pipelineConfig.flows.spike) {
          for (const k of Object.values<any>(pipelineConfig.flows.spike)) {
            for (const s of k?.steps ?? []) {
              fragmentsToCheck.add(s.stepFragment ?? s.id);
            }
          }
        }
      }
      const standardOrchFragments = [
        "steps/triage", "steps/infra", "steps/architect-plan", "steps/architect-revise",
        "steps/architect-closeup", "steps/plan-review", "steps/pm-edits", "steps/pm-amend",
        "steps/wave-close-up", "steps/architect-wave-report", "steps/fix-round",
        "steps/architect-consult-item", "steps/architect-consult-nonitem",
        "system/steer-classify", "system/repair"
      ];
      for (const frag of standardOrchFragments) {
        fragmentsToCheck.add(frag);
      }

      for (const frag of fragmentsToCheck) {
        try {
          const known = KNOWN_VARS[frag] ?? KNOWN_VARS[`steps/${frag}`] ?? KNOWN_VARS[frag.replace(/^steps\//, "")];
          if (!known) {
            errors.push(`Prompt fragment "${frag}" has no KNOWN_VARS registration`);
            continue;
          }
          const sampleVars: Record<string, string> = {};
          for (const v of known) {
            sampleVars[v] = `test_${v}`;
          }
          promptLib.render(frag, sampleVars);
        } catch (err: any) {
          errors.push(`Prompt render check failed for "${frag}": ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Prompt library initialization failed: ${err.message}`);
    }
  }

  // 6. Schemas compile cleanly
  const schemasDir = path.join(pluginRoot, "config", "schemas");
  if (fs.existsSync(schemasDir)) {
    try {
      const schemaFiles = fs.readdirSync(schemasDir).filter((f) => f.endsWith(".schema.json"));
      for (const file of schemaFiles) {
        try {
          defaultSchemaCache.getValidator(path.join(schemasDir, file));
        } catch (err: any) {
          errors.push(`Schema compile failure in "${file}": ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Failed to read schemas directory: ${err.message}`);
    }
  } else {
    errors.push(`Schemas directory not found at ${schemasDir}`);
  }

  // 7. OMP binary present & generated overlay valid
  const ompBinary =
    opts.ompBinary ??
    process.env.OMP_PATH ??
    Bun.which("omp") ??
    "/home/slava/.bun/bin/omp";

  try {
    execFileSync(ompBinary, ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    if (pipelineConfig) {
      const tempOverlay = path.join(
        os.tmpdir(),
        `preflight-overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.yaml`
      );
      try {
        writeOmpConfigOverlay(pipelineConfig, tempOverlay);
        execFileSync(ompBinary, ["--config", tempOverlay, "--version"], {
          stdio: ["ignore", "pipe", "ignore"],
        });
      } finally {
        try {
          if (fs.existsSync(tempOverlay)) fs.unlinkSync(tempOverlay);
        } catch {}
      }
    }
  } catch (err: any) {
    errors.push(`OMP binary validation failed (${ompBinary}): ${err.message}`);
  }

  // 8. Run lock is free
  const lockStatus = isRunLockFree(repoRoot, task);
  if (!lockStatus.free) {
    errors.push(
      `Run lock for task "${task}" is held by active process PID ${lockStatus.lockInfo?.pid} on host ${lockStatus.lockInfo?.host} (started ${lockStatus.lockInfo?.start})`
    );
  }

  const ok = errors.length === 0;

  if (!opts.silent) {
    if (warnings.length > 0) {
      for (const w of warnings) {
        log(`[factory preflight] Warning: ${w}`);
      }
    }
    if (ok) {
      log(`[factory preflight] All preflight checks passed for task "${task}".`);
    } else {
      console.error(`[factory preflight] Preflight failed with ${errors.length} error(s):`);
      for (const e of errors) {
        console.error(`  - ${e}`);
      }
    }
  }

  return { ok, errors, warnings };
}

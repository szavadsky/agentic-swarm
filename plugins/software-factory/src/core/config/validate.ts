import fs from "node:fs";
import path from "node:path";
import type {
  PipelineConfig,
  ProjectConfig,
  FlowStep,
} from "../artifacts.js";
import { resolveRole } from "./roles.js";

/**
 * Built-in checks the engine runs itself at fixed points (record validation,
 * citation verification, plan-limit enforcement). They have no runCheck case
 * and MUST NOT be attached to steps or hooks.
 */
export const ENGINE_INTERNAL_CHECK_IDS = new Set([
  "schema",
  "citations",
  "plan-limits",
]);

/** Built-in checks that steps and hooks may attach (all have a runCheck case). */
export const ATTACHABLE_BUILTIN_CHECK_IDS = new Set([
  "gates",
  "tests-only",
  "test-first-scope",
  "target-red",
  "target-green",
  "red-test",
  "test-diff",
  "size",
  "poc-scope",
]);

/** All built-in check ids (attachable + engine-internal). */
export const BUILTIN_CHECK_IDS = new Set([
  ...ENGINE_INTERNAL_CHECK_IDS,
  ...ATTACHABLE_BUILTIN_CHECK_IDS,
]);

export const VALID_SEAMS = new Set([
  "ingest.triage",
  "ingest.infra",
  "plan.architect",
  "plan.review",
  "plan.edits",
  "item.start",
  "item.accept",
  "item.merge",
  "wave.start",
  "wave.merge",
  "wave.closeup",
  "iteration.start",
  "iteration.closeup",
  "task.done",
]);

export function isValidSeam(seam: string): boolean {
  if (VALID_SEAMS.has(seam)) return true;
  if (seam.startsWith("item.step.")) {
    const stepId = seam.slice("item.step.".length);
    return stepId.length > 0 && /^[a-zA-Z0-9_-]+$/.test(stepId);
  }
  return false;
}

function isItemSeam(seam: string): boolean {
  return seam.startsWith("item.");
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface ValidateStructuralOptions {
  project?: ProjectConfig;
  repoRoot?: string;
  pluginRoot?: string;
}

/**
 * Validates structural pipeline invariants before execution (preflight check).
 */
export function validateStructural(
  pipeline: PipelineConfig,
  options: ValidateStructuralOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const agents = pipeline.agents ?? {};
  const checks = pipeline.checks ?? {};
  const hooks = pipeline.hooks ?? {};
  const roles = pipeline.models?.roles ?? {};

  /** Requires a role reference to resolve to a configured role (no model-id fallback). */
  function checkRoleRef(context: string, roleName: string, label: string): void {
    if (!roles[roleName]) {
      errors.push(`${context} references unknown ${label} "${roleName}".`);
      return;
    }
    try {
      resolveRole(roleName, roles);
    } catch (err) {
      errors.push(
        `${context} references ${label} "${roleName}" that fails to resolve: ${(err as Error).message}`
      );
    }
  }

  function checkAttachableCheck(
    context: string,
    target: string,
    checkId: string
  ): void {
    if (ATTACHABLE_BUILTIN_CHECK_IDS.has(checkId) || checks[checkId]) return;
    if (ENGINE_INTERNAL_CHECK_IDS.has(checkId)) {
      errors.push(
        `${context} references engine-internal check "${checkId}" (run by the engine; cannot be attached to ${target}).`
      );
    } else {
      errors.push(`${context} references unknown check "${checkId}".`);
    }
  }

  // 1. Validate agents existence & definition / output resolution
  for (const [agentName, agentConfig] of Object.entries(agents)) {
    if (!agentConfig.role) {
      errors.push(`Agent "${agentName}" does not specify a role.`);
    } else {
      checkRoleRef(`Agent "${agentName}"`, agentConfig.role, "role");
    }

    // Extra agent definition validation
    if (agentConfig.definition) {
      const defPath = agentConfig.definition;
      const isPath = defPath.includes("/") || defPath.endsWith(".md");
      if (isPath && (options.repoRoot || options.pluginRoot)) {
        let found = false;
        if (options.repoRoot && fs.existsSync(path.resolve(options.repoRoot, defPath))) {
          found = true;
        } else if (
          options.pluginRoot &&
          fs.existsSync(path.resolve(options.pluginRoot, defPath))
        ) {
          found = true;
        } else if (fs.existsSync(defPath)) {
          found = true;
        }
        if (!found) {
          errors.push(
            `Agent "${agentName}" definition file does not exist: "${defPath}".`
          );
        }
      }
    }

    // Output contract resolution
    if (agentConfig.output) {
      const output = agentConfig.output;
      const isBuiltinOutput = output === "developer" || output === "review";
      if (!isBuiltinOutput) {
        // Must resolve to a schema file or schema identifier
        let foundSchema = false;
        if (options.pluginRoot) {
          const schemaCandidate = path.resolve(
            options.pluginRoot,
            "config/schemas",
            output.endsWith(".json") ? output : `${output}.schema.json`
          );
          if (fs.existsSync(schemaCandidate)) foundSchema = true;
        }
        if (!foundSchema && options.repoRoot) {
          const schemaCandidate = path.resolve(options.repoRoot, output);
          if (fs.existsSync(schemaCandidate)) foundSchema = true;
        }
        if (!foundSchema && fs.existsSync(output)) {
          foundSchema = true;
        }
        if (!foundSchema) {
          errors.push(
            `Agent "${agentName}" output contract "${output}" could not be resolved.`
          );
        }
      }
    }
  }

  // Helper to validate a list of steps
  function validateSteps(flowName: string, steps: FlowStep[]) {
    for (const step of steps) {
      if (!agents[step.agent]) {
        errors.push(
          `Flow "${flowName}" step "${step.id}" references unknown agent "${step.agent}".`
        );
      }
      if (step.role) {
        checkRoleRef(`Flow "${flowName}" step "${step.id}"`, step.role, "role");
      }
      if (step.retryRole) {
        checkRoleRef(
          `Flow "${flowName}" step "${step.id}"`,
          step.retryRole,
          "retryRole"
        );
      }
      if (step.checks) {
        for (const checkId of step.checks) {
          checkAttachableCheck(
            `Flow "${flowName}" step "${step.id}"`,
            "steps",
            checkId
          );
        }
      }
    }
  }

  // fixLoopTo must name a step id of the same kind (else item-machine would
  // silently fall back to index 0).
  function validateFixLoopTo(
    flowName: string,
    steps: FlowStep[],
    fixLoopTo: string | undefined
  ): void {
    if (fixLoopTo === undefined) return;
    if (!steps.some((s) => s.id === fixLoopTo)) {
      errors.push(
        `Flow "${flowName}" fixLoopTo "${fixLoopTo}" does not match any step id in this kind.`
      );
    }
  }

  // 2. Validate all flows
  if (pipeline.flows?.simple?.steps) {
    validateSteps("flows.simple", pipeline.flows.simple.steps);
  }
  if (pipeline.flows?.story) {
    for (const [kind, kindConfig] of Object.entries(pipeline.flows.story)) {
      const flowName = `flows.story.${kind}`;
      validateSteps(flowName, kindConfig.steps);
      validateFixLoopTo(flowName, kindConfig.steps, kindConfig.fixLoopTo);
    }
  }
  if (pipeline.flows?.spike) {
    for (const [kind, kindConfig] of Object.entries(pipeline.flows.spike)) {
      const flowName = `flows.spike.${kind}`;
      validateSteps(flowName, kindConfig.steps);
      validateFixLoopTo(flowName, kindConfig.steps, kindConfig.fixLoopTo);
    }
  }

  // 3. Validate seams and hooks
  let hasNonItemCodeWritingHook = false;
  let nonItemCodeWritingSeam: string | null = null;
  let hasItemCodeWritingHook = false;

  for (const [hookKey, hookEntries] of Object.entries(hooks)) {
    const match = hookKey.match(/^(before|after):([a-zA-Z0-9_.-]+)$/);
    if (!match) {
      errors.push(`Invalid hook format "${hookKey}". Must match "before:<seam>" or "after:<seam>".`);
      continue;
    }

    const seam = match[2]!;
    if (!isValidSeam(seam)) {
      errors.push(`Unknown seam "${seam}" in hook "${hookKey}".`);
      continue;
    }

    const isItem = isItemSeam(seam);

    for (const entry of hookEntries) {
      if (entry.agent) {
        const agentCfg = agents[entry.agent];
        if (!agentCfg) {
          errors.push(`Hook "${hookKey}" references unknown agent "${entry.agent}".`);
        } else if (agentCfg.output === "developer") {
          // Code-writing agent
          if (isItem) {
            hasItemCodeWritingHook = true;
          } else {
            hasNonItemCodeWritingHook = true;
            nonItemCodeWritingSeam = seam;
          }
        }
      }

      if (entry.check) {
        checkAttachableCheck(`Hook "${hookKey}"`, "hooks", entry.check);
      }
    }
  }

  // 4. Code-writing hook rules & self-triggering synthetic hooks
  // §8.10: "Synthetic items never fire hooks; preflight rejects configs where they would be required to."
  // If a code-writing hook exists at a non-item seam (which creates a synthetic item),
  // and there is also a code-writing hook on item seams, that could lead to recursive self-triggering.
  if (hasNonItemCodeWritingHook && hasItemCodeWritingHook) {
    errors.push(
      `Self-triggering synthetic hook rejected: non-item seam "${nonItemCodeWritingSeam}" runs code-writing agent while item seams also run code-writing agents.`
    );
  }

  // 5. Model diversity check (§12.4)
  const diversityMode = pipeline.diversity ?? "warn";
  if (diversityMode !== "off" && pipeline.models?.roles) {
    try {
      const devRole = resolveRole("workhorse", pipeline.models.roles);
      const revRole = resolveRole("task-reviewer", pipeline.models.roles);

      const devModel = devRole.models[0];
      const revModel = revRole.models[0];

      if (devModel && revModel && devModel === revModel) {
        const msg = `Diversity violation: developer role "workhorse" and reviewer role "task-reviewer" share primary model "${devModel}".`;
        if (diversityMode === "error") {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }

      // Check architect vs plan-reviewer
      const archRole = resolveRole("architect", pipeline.models.roles);
      const planRevRole = resolveRole("alt-architect", pipeline.models.roles);

      const archModel = archRole.models[0];
      const planRevModel = planRevRole.models[0];

      if (archModel && planRevModel && archModel === planRevModel) {
        const msg = `Diversity violation: architect role "architect" and plan-reviewer role "alt-architect" share primary model "${archModel}".`;
        if (diversityMode === "error") {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    } catch {
      // Role resolution cycle or error will be caught during role validation
    }
  }

  return { errors, warnings };
}

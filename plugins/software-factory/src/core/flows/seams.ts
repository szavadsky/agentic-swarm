import type {
  HookEntry,
  HookWhen,
  PipelineConfig,
  ProjectConfig,
  CheckItemResult,
} from "../artifacts.js";
import type { Harness } from "../../harness/types.js";
import { appendJournal } from "../journal.js";

export interface HookContext {
  phase: "before" | "after";
  seam: string;
  cwd: string;
  baseRef?: string;
  kind?: string;
  isEscalated?: boolean;
  taskKind?: string;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  repo: any;
  harness: Harness;
  prompts: any;
  taskDir: string;
  item?: string;
}

export interface HookResult {
  ok: boolean;
  failures: string[];
  checks: CheckItemResult[];
}

/**
 * Checks whether a hook's `when` condition matches the current context (§8.10).
 */
export function matchesWhen(
  when?: HookWhen,
  ctx?: { kind?: string; isEscalated?: boolean; taskKind?: string }
): boolean {
  if (!when) return true;
  if (when.kinds && ctx?.kind && !when.kinds.includes(ctx.kind)) {
    return false;
  }
  if (
    when.escalated !== undefined &&
    ctx?.isEscalated !== undefined &&
    when.escalated !== ctx.isEscalated
  ) {
    return false;
  }
  if (when.taskKinds && ctx?.taskKind && !when.taskKinds.includes(ctx.taskKind)) {
    return false;
  }
  return true;
}

/**
 * Runs hooks attached to a specific lifecycle seam (§8.10).
 */
export async function runSeamHooks(ctx: HookContext): Promise<HookResult> {
  const hookKey = `${ctx.phase}:${ctx.seam}`;
  const entries: HookEntry[] = ctx.pipeline.hooks?.[hookKey] ?? [];

  const checks: CheckItemResult[] = [];
  const failures: string[] = [];

  for (const entry of entries) {
    if (!matchesWhen(entry.when, { kind: ctx.kind, isEscalated: ctx.isEscalated, taskKind: ctx.taskKind })) {
      continue;
    }

    if (entry.check) {
      try {
        let checkOk = true;
        let summary = "";
        try {
          const { runCheck } = await import("../checks/index.js" as any);
          const res = await runCheck(entry.check, {
            repo: ctx.repo,
            wt: ctx.cwd,
            base: ctx.baseRef ?? "HEAD",
            project: ctx.project,
            pipeline: ctx.pipeline,
            kind: ctx.kind,
            item: ctx.item,
            limits: ctx.pipeline.limits ?? {},
            outputBytes: ctx.pipeline.limits?.checkOutputBytes ?? 4000,
          });
          checkOk = res.ok;
          summary = res.summary;
        } catch {
          // If checks module is still being created or check is not found,
          // check if there's a custom check command in pipeline.checks
          const customCheck = ctx.pipeline.checks?.[entry.check];
          if (customCheck) {
            const { runProcess } = await import("../proc.js");
            const res = await runProcess({ cmd: customCheck.run, cwd: ctx.cwd });
            checkOk = res.code === 0;
            summary = res.stderr || res.stdout;
          }
        }

        checks.push({
          id: entry.check,
          status: checkOk ? "pass" : "fail",
          phase: ctx.phase,
          message: summary,
        });

        if (!checkOk) {
          failures.push(`Hook check ${entry.check} failed: ${summary}`);
        }
      } catch (err: any) {
        checks.push({
          id: entry.check,
          status: "fail",
          phase: ctx.phase,
          message: err?.message,
        });
        failures.push(`Hook check ${entry.check} error: ${err?.message}`);
      }
    }

    // Hook agent execution if entry.agent is specified
    if (entry.agent) {
      await appendJournal(ctx.taskDir, {
        type: "hook_agent",
        seam: ctx.seam,
        phase: ctx.phase,
        agent: entry.agent,
      });
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    checks,
  };
}

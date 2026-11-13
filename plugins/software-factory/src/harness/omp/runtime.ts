import fs from "node:fs";
import path from "node:path";
import { runProcess } from "../../core/proc.js";
import type { ModelRef } from "../types.js";
import { writeOmpOverlay } from "./overlay.js";
import { OmpRpc } from "./rpc.js";
import { selectorOf, type OmpHarnessOptions, type OmpTurnOpaque } from "./types.js";

export interface OmpDirs {
  base: string;
  sessions: string;
  prompts: string;
}

/** Process/filesystem plumbing shared by `turn` and `compact`. */
export class OmpRuntime {
  readonly binary: string;
  readonly sessionDir: string;
  readonly subagentModel?: string;
  readonly overlayExtra?: Record<string, unknown>;
  readonly readyTimeoutMs: number;
  private modelsCache?: Promise<any[]>;

  constructor(opts: OmpHarnessOptions) {
    this.binary = opts.binary ?? process.env.OMP_PATH ?? Bun.which("omp") ?? "omp";
    this.sessionDir = path.resolve(opts.sessionDir);
    this.subagentModel = selectorOf(opts.subagentModel);
    this.overlayExtra = opts.overlayExtra;
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 30_000;
  }

  models(): Promise<any[]> {
    if (!this.modelsCache) {
      this.modelsCache = (async () => {
        const result = await runProcess({
          cmd: [this.binary, "models", "--json"],
          cwd: process.cwd(),
          timeoutSec: 60,
          maxOutputBytes: 4 * 1024 * 1024,
        });
        if (result.code !== 0) {
          throw new Error(
            `omp models --json failed (exit ${result.code}): ${result.stderr.slice(0, 500)}`
          );
        }
        const parsed = JSON.parse(result.stdout);
        return Array.isArray(parsed.models) ? parsed.models : [];
      })();
      this.modelsCache.catch(() => {
        this.modelsCache = undefined;
      });
    }
    return this.modelsCache;
  }

  dirs(): OmpDirs {
    const base = path.join(this.sessionDir, "omp");
    const sessions = path.join(base, "sessions");
    const prompts = path.join(base, "prompts");
    fs.mkdirSync(sessions, { recursive: true });
    fs.mkdirSync(prompts, { recursive: true });
    return { base, sessions, prompts };
  }

  overlay(opaque?: OmpTurnOpaque): Promise<string> {
    return writeOmpOverlay(
      {
        subagentModel: selectorOf(opaque?.subagentModel) ?? this.subagentModel,
        retention: "short",
        approvalMode: opaque?.approvalMode,
        extra: { ...this.overlayExtra, ...opaque?.overlayExtra },
      },
      this.dirs().base
    );
  }

  async launch(
    model: ModelRef,
    cwd: string,
    overlayPath: string,
    sessionsDir: string,
    resumeId: string | undefined,
    extraArgs: string[]
  ): Promise<OmpRpc> {
    const args = [
      "--mode",
      "rpc",
      "--no-ui",
      "--no-lsp",
      "--model",
      model.id,
      "--cwd",
      cwd,
      "--session-dir",
      sessionsDir,
      "--config",
      overlayPath,
      ...extraArgs,
    ];
    if (model.effort) args.push("--thinking", model.effort);
    if (resumeId) args.push("--resume", resumeId);
    return OmpRpc.launch({ binary: this.binary, args, cwd }, this.readyTimeoutMs);
  }
}

/** Maps a `get_state` payload to the model the session actually ran. */
export function actualModel(state: any, requested: ModelRef): ModelRef {
  const resolved = state?.model;
  if (resolved?.provider && resolved?.id) {
    return {
      id: `${resolved.provider}/${resolved.id}`,
      effort: typeof state?.thinkingLevel === "string" ? state.thinkingLevel : undefined,
    };
  }
  return requested;
}

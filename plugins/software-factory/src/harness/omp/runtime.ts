import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runProcess } from "../../core/proc.js";
import { installLspConfig } from "./lsp.js";
import type { ModelRef } from "../types.js";
import { writeOmpOverlay } from "./overlay.js";
import { OmpRpc } from "./rpc.js";
import {
  type OmpHarnessOptions,
  type OmpTurnOpaque,
  selectorOf,
} from "./types.js";

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
  readonly options?: Record<string, unknown>;
  readonly envAllowlist: readonly string[];
  readonly readyTimeoutMs: number;
  readonly retention: "short" | "long";
  /** Canonical artifact LSP config; when set, every turn cwd gets it and `--no-lsp` is dropped. */
  readonly lspConfig?: string;
  private modelsCache?: Promise<any[]>;
  private steerCache?: Promise<boolean>;

  constructor(opts: OmpHarnessOptions) {
    this.binary = opts.binary ?? Bun.which("omp") ?? "omp";
    this.sessionDir = path.resolve(opts.sessionDir);
    this.subagentModel = selectorOf(opts.subagentModel);
    this.options = opts.options;
    this.envAllowlist = opts.envAllowlist ?? [];
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 30_000;
    this.retention = opts.retention ?? "short";
    this.lspConfig = opts.lspConfig;
  }

  models(): Promise<any[]> {
    if (!this.modelsCache) {
      this.modelsCache = (async () => {
        const result = await runProcess({
          cmd: [this.binary, "models", "--json"],
          cwd: process.cwd(),
          envAllowlist: this.envAllowlist,
          timeoutSec: 60,
          maxOutputBytes: 4 * 1024 * 1024,
        });
        if (result.code !== 0) {
          throw new Error(
            `omp models --json failed (exit ${result.code}): ${result.stderr.slice(0, 500)}`,
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

  /**
   * Whether this binary carries the subagent RPC surface (`get_subagents`,
   * `steer_subagent`). The adapter's only verified firmware is 18.22; an older
   * or unreadable binary under-advertises, so the boundary keeps the written
   * report instead of steering onto a command it may not have.
   */
  supportsSteering(): Promise<boolean> {
    if (!this.steerCache) {
      this.steerCache = (async () => {
        const result = await runProcess({
          cmd: [this.binary, "--version"],
          cwd: process.cwd(),
          envAllowlist: this.envAllowlist,
          timeoutSec: 10,
          maxOutputBytes: 64 * 1024,
        }).catch(() => undefined);
        const version =
          result?.code === 0 ? /(\d+)\.(\d+)\.(\d+)/.exec(result.stdout) : null;
        if (!version) return false;
        const major = Number(version[1]);
        const minor = Number(version[2]);
        return major > 18 || (major === 18 && minor >= 22);
      })();
      this.steerCache.catch(() => {
        this.steerCache = undefined;
      });
    }
    return this.steerCache;
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
        retention: this.retention,
        options: { ...this.options, ...opaque?.overlayExtra },
      },
      this.dirs().base,
    );
  }

  /**
   * One content-addressed extension package holding this launch's transient
   * agent definitions. Reusing the hash keeps a resumed launch's definitions
   * at the same path; the package lives with the sessions, never in a worktree.
   */
  agentsDir(agents: readonly { name: string; markdown: string }[]): string {
    for (const agent of agents) {
      if (!/^[a-zA-Z0-9_-]+$/.test(agent.name)) {
        throw new Error(`invalid omp agent name "${agent.name}"`);
      }
    }
    const hash = createHash("sha1")
      .update(JSON.stringify(agents))
      .digest("hex")
      .slice(0, 12);
    const root = path.join(this.dirs().base, `agents-${hash}`);
    const dir = path.join(root, "agents");
    fs.mkdirSync(dir, { recursive: true });
    for (const agent of agents) {
      fs.writeFileSync(
        path.join(dir, `${agent.name}.md`),
        agent.markdown,
        "utf8",
      );
    }
    return root;
  }

  async launch(
    model: ModelRef,
    cwd: string,
    overlayPath: string,
    sessionsDir: string,
    resumeId: string | undefined,
    extraArgs: string[],
  ): Promise<OmpRpc> {
    if (this.lspConfig) await installLspConfig(cwd, this.lspConfig);
    const args = [
      "--mode",
      "rpc",
      "--no-ui",
      ...(this.lspConfig ? [] : ["--no-lsp"]),
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
    return OmpRpc.launch(
      {
        binary: this.binary,
        args,
        cwd,
        envAllowlist: this.envAllowlist,
      },
      this.readyTimeoutMs,
    );
  }
}

/** Maps a `get_state` payload to the model the session actually ran. */
export function actualModel(state: any, requested: ModelRef): ModelRef {
  const resolved = state?.model;
  if (resolved?.provider && resolved?.id) {
    return {
      id: `${resolved.provider}/${resolved.id}`,
      effort:
        typeof state?.thinkingLevel === "string"
          ? state.thinkingLevel
          : undefined,
    };
  }
  return requested;
}

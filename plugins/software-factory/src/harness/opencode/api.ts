import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runProcess } from "../../core/proc.js";
import {
  registerChildGroup,
  unregisterChildGroup,
} from "../../core/shutdown.js";
import type { OpencodeSessionTokens } from "./usage.js";

export interface OpencodeModelInfo {
  providerID: string;
  modelID: string;
  variants?: string[];
  limit?: { context?: number; output?: number };
}

interface MessageRow {
  type?: string;
  status?: string;
  time?: { created?: number };
}

/** Thin wrapper over `opencode api` / `opencode session export`. */
export class OpencodeApi {
  constructor(readonly binary: string) {}

  async models(cwd: string): Promise<OpencodeModelInfo[]> {
    const result = await this.run(["api", "GET", "/api/model"], cwd, 60);
    const parsed = JSON.parse(result);
    return Array.isArray(parsed.data) ? parsed.data : [];
  }

  /**
   * Lifetime session counters, including cache writes the step stream omits.
   * On a resumed turn the caller reads them before the turn and subtracts that
   * baseline from the post-turn export. A fresh turn owns the whole session, so
   * the export total is already this turn's usage. Only a resumed turn whose
   * baseline read failed, or an export without counters, uses step usage instead.
   */
  async sessionTokens(
    sessionId: string,
    cwd: string,
  ): Promise<OpencodeSessionTokens | undefined> {
    const raw = await this.run(
      ["api", "GET", `/api/session/${sessionId}`],
      cwd,
      30,
    );
    const parsed = JSON.parse(raw);
    return parsed?.data?.tokens;
  }

  /** POST compact, then wait for the completed compaction message (API returns admission only). */
  async compact(
    sessionId: string,
    cwd: string,
    timeoutMs = 120_000,
  ): Promise<void> {
    const startedAt = Date.now();
    await this.run(
      ["api", "POST", `/api/session/${sessionId}/compact`, "-d", "{}"],
      cwd,
      60,
    );
    const deadline = startedAt + timeoutMs;
    while (Date.now() < deadline) {
      const raw = await this.run(
        ["api", "GET", `/api/session/${sessionId}/message`],
        cwd,
        60,
      );
      const parsed = JSON.parse(raw);
      const rows: MessageRow[] = Array.isArray(parsed.data) ? parsed.data : [];
      const done = rows.some(
        (row) =>
          row.type === "compaction" &&
          row.status === "completed" &&
          (row.time?.created ?? 0) >= startedAt,
      );
      if (done) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`opencode compact timed out for session ${sessionId}`);
  }

  /**
   * `opencode session export` straight into the session store; returns the file path.
   * A zero exit proves only that the file was written: it may still be malformed
   * or lack tokens, and the usage reader rejects both before use.
   */
  async export(
    sessionId: string,
    outPath: string,
    cwd: string,
    timeoutMs = 120_000,
  ): Promise<string> {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const temp = `${outPath}.tmp`;
    const fd = fs.openSync(temp, "w");
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(this.binary, ["session", "export", sessionId], {
          cwd,
          detached: true,
          stdio: ["ignore", fd, "pipe"],
          env: process.env,
        });
        if (child.pid && child.pid > 0) registerChildGroup(child.pid);
        let stderr = "";
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr = (stderr + chunk.toString("utf8")).slice(-4_096);
        });
        const timer = setTimeout(() => {
          try {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
          } catch {}
          reject(
            new Error(`opencode session export timed out for ${sessionId}`),
          );
        }, timeoutMs);
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code, signal) => {
          clearTimeout(timer);
          if (child.pid && child.pid > 0) unregisterChildGroup(child.pid);
          if (code === 0) resolve();
          else
            reject(
              new Error(
                `opencode session export failed (code ${code}, signal ${signal}): ${stderr}`,
              ),
            );
        });
      });
      fs.renameSync(temp, outPath);
      return outPath;
    } catch (error) {
      try {
        fs.unlinkSync(temp);
      } catch {}
      throw error;
    } finally {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }

  private async run(
    args: string[],
    cwd: string,
    timeoutSec: number,
  ): Promise<string> {
    const result = await runProcess({
      cmd: [this.binary, ...args],
      cwd,
      timeoutSec,
      maxOutputBytes: 8 * 1024 * 1024,
    });
    if (result.code !== 0) {
      throw new Error(
        `opencode ${args.slice(0, 3).join(" ")} failed (exit ${result.code}): ${result.stderr.slice(0, 500)}`,
      );
    }
    return result.stdout;
  }
}

export function findModel(
  models: OpencodeModelInfo[],
  id: string,
): OpencodeModelInfo | undefined {
  const slash = id.indexOf("/");
  if (slash <= 0) return undefined;
  const providerID = id.slice(0, slash);
  const modelID = id.slice(slash + 1);
  return models.find(
    (entry) => entry.providerID === providerID && entry.modelID === modelID,
  );
}

/**
 * Whether a failed session probe means the record is gone, not that the local
 * API is unavailable. Only the former justifies a de-novo start.
 */
export function isMissingSessionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /session[^\n]*not found|not found[^\n]*session|unknown session|no such session|\b404\b/i.test(
    message,
  );
}

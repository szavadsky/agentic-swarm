import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "bun";
import type { JSONSchema, Harness, AgentRun, AgentOutcome } from "../types.js";
import type { OmpHarnessOptions } from "./types.js";
import { OmpNdjsonParser } from "./ndjson.js";
import { classifyOmpOutcome } from "./classify.js";
import { generateOmpConfigOverlay, writeOmpConfigOverlay } from "./overlay.js";
import { createAjv, formatAjvErrors } from "../../core/config/ajv.js";
import { resolveRuntimeDir } from "../../cli/lock.js";
import { HeadTailBuffer } from "../../core/proc.js";
import { registerChildGroup, unregisterChildGroup } from "../../core/shutdown.js";
const ajv = createAjv();
const MAX_STDERR_BYTES = 64 * 1024; // 64 KB
/**
 * Strips YAML frontmatter from an agent definition body (§10, spike 2).
 */
export function extractAgentBody(definition: string): string {
  return definition.replace(/^---[\s\S]*?---\s*/, "").trim();
}

/**
 * Extracts and parses JSON from text that may contain markdown code fences.
 */
export function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  // 1. Try direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fence parsing
  }

  // 2. Try markdown fenced JSON: ```json ... ``` or ``` ... ```
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {
      // Continue to bracket search
    }
  }

  // 3. Try finding outermost { ... } or [ ... ]
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // ignore
    }
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
    } catch {
      // ignore
    }
  }

  throw new Error(`Failed to extract valid JSON from text: ${trimmed.slice(0, 200)}...`);
}

/**
 * Harness implementation wrapping the Oh-My-Pi (`omp`) CLI (§4, spike 2).
 */
export class OmpHarness implements Harness {
  readonly ompBinary: string;
  readonly defaultTimeoutMs: number;
  private configOverlayPath?: string;
  private runtimeDir?: string;
  private pipeline?: any;

  constructor(opts: OmpHarnessOptions = {}) {
    this.ompBinary = opts.ompBinary ?? process.env.OMP_PATH ?? Bun.which("omp") ?? "/home/slava/.bun/bin/omp";
    this.defaultTimeoutMs = opts.timeoutMs ?? 300_000;
    this.configOverlayPath = opts.configOverlayPath;
    this.runtimeDir = opts.runtimeDir;
    this.pipeline = opts.pipeline;
  }

  /**
   * Updates effective pipeline configuration used for overlay generation.
   */
  public setPipeline(pipeline: any): void {
    this.pipeline = pipeline;
  }

  /**
   * Resolves the runtime directory and ensures its subfolders exist.
   */
  private ensureRuntimeDirs(cwd: string): {
    runtimeDir: string;
    sessionsDir: string;
    promptsDir: string;
    systemPromptsDir: string;
    overlayPath: string;
  } {
    const runtimeDir = this.runtimeDir
      ? path.resolve(this.runtimeDir)
      : resolveRuntimeDir(cwd);

    const sessionsDir = path.join(runtimeDir, "sessions");
    const promptsDir = path.join(runtimeDir, "prompts");
    const systemPromptsDir = path.join(runtimeDir, "system-prompts");

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.mkdirSync(systemPromptsDir, { recursive: true });

    let overlayPath: string;
    if (this.configOverlayPath && fs.existsSync(this.configOverlayPath)) {
      overlayPath = path.resolve(this.configOverlayPath);
    } else {
      overlayPath = path.join(runtimeDir, "omp-overlay.yaml");
      if (this.pipeline) {
        // Regenerate overlay each run from effective pipeline (finding: stale model roles)
        writeOmpConfigOverlay(this.pipeline, overlayPath);
      } else if (!fs.existsSync(overlayPath)) {
        // Fallback minimal overlay
        fs.writeFileSync(
          overlayPath,
          "eval:\n  autoBackground:\n    enabled: false\ntitle:\n  generator: none\ncheckpoint:\n  enabled: false\nadvisor:\n  enabled: false\nbash:\n  gitGuard: false\n  allowCompoundCommands: true\nmnemopi:\n  polyphonicRecall: false\n  enhancedRecall: false\n  proactiveLinking: false\nupdate:\n  auto: false\n",
          "utf8"
        );
      }
    }
    return {
      runtimeDir,
      sessionsDir,
      promptsDir,
      systemPromptsDir,
      overlayPath,
    };
  }

  /**
   * Locates the on-disk session transcript file corresponding to a sessionId.
   */
  private findSessionTrace(sessionsDir: string, sessionId: string, sessionTimestamp?: string): string | undefined {
    try {
      if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir);
        const match = files.find((f) => f.includes(sessionId));
        if (match) {
          return path.join(sessionsDir, match);
        }
      }
    } catch {
      // ignore
    }

    if (sessionTimestamp) {
      return path.join(
        sessionsDir,
        `${sessionTimestamp.replace(/[:.]/g, "-")}_${sessionId}.jsonl`
      );
    }

    return undefined;
  }

  /**
   * Executes one turn of an agent session (§4).
   */
  public async run(run: AgentRun): Promise<AgentOutcome> {
    const { sessionsDir, promptsDir, systemPromptsDir, overlayPath } = this.ensureRuntimeDirs(run.cwd);

    // 1. Prepare system prompt file from definition body
    const agentBody = extractAgentBody(run.definition);
    const sanitizedAgent = run.agent.replace(/[^a-zA-Z0-9_-]/g, "_");
    const systemPromptPath = path.join(
      systemPromptsDir,
      `${sanitizedAgent}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.md`
    );
    fs.writeFileSync(systemPromptPath, agentBody, "utf8");

    // 2. Prepare tools allowlist (ensure yield is present for structured output)
    const tools = [...run.tools];
    if (run.outputSchema && !tools.includes("yield")) {
      tools.push("yield");
    }

    // 3. Prepare prompt file (@file syntax for robust argument passing)
    const promptPath = path.join(
      promptsDir,
      `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`
    );
    fs.writeFileSync(promptPath, run.prompt, "utf8");

    // 4. Build command arguments
    const roleArg = run.role.startsWith("@") ? run.role : `@${run.role}`;
    const args: string[] = [
      this.ompBinary,
      "--cwd", run.cwd,
      "--config", overlayPath,
      "--mode", "json",
      "--model", roleArg,
      "--session-dir", sessionsDir,
    ];

    if (run.session?.resume) {
      args.push("--resume", run.session.resume);
    }

    if (tools.length > 0) {
      args.push(`--tools=${tools.join(",")}`);
    } else {
      args.push("--tools=");
    }

    args.push("--system-prompt", systemPromptPath);
    args.push("-p", `@${promptPath}`);

    // 5. Spawn OMP process
    let timedOut = false;
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(args, {
        cwd: run.cwd,
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
      });
    } catch (err: any) {
      return {
        ok: false,
        error: `Failed to spawn omp: ${err.message}`,
        transient: true,
      };
    }

    if (proc.pid && proc.pid > 0) {
      registerChildGroup(proc.pid);
    }

    const killGroup = (signal: "SIGTERM" | "SIGKILL") => {
      if (proc.pid && proc.pid > 0) {
        try {
          process.kill(-proc.pid, signal);
          return;
        } catch (err: any) {
          if (err?.code === "ESRCH") return;
        }
      }
      try {
        proc.kill(signal);
      } catch {}
    };

    // 6. Setup timeout handler with SIGTERM -> SIGKILL on child's process group
    let killTimer: NodeJS.Timeout | undefined;
    const timeoutMs = run.timeoutSec != null && run.timeoutSec > 0
      ? run.timeoutSec * 1000
      : this.defaultTimeoutMs;
    const termTimer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");

      killTimer = setTimeout(() => {
        killGroup("SIGKILL");
      }, 3000);
    }, timeoutMs);
    // 7. Parse stdout NDJSON
    const parser = new OmpNdjsonParser();
    const decoder = new TextDecoder();
    let stdoutBuffer = "";
    let totalStdoutBytes = 0;

    const readStdout = async () => {
      if (!proc.stdout || typeof proc.stdout === "number") return;
      for await (const chunk of proc.stdout) {
        totalStdoutBytes += chunk.length;
        stdoutBuffer += decoder.decode(chunk, { stream: true });
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          parser.feedLine(line);
        }
      }
      if (stdoutBuffer.trim()) {
        parser.feedLine(stdoutBuffer);
      }
    };

    const readStderr = async () => {
      if (!proc.stderr || typeof proc.stderr === "number") return "";
      const ring = new HeadTailBuffer(MAX_STDERR_BYTES);
      for await (const chunk of proc.stderr) {
        ring.push(Buffer.from(chunk));
      }
      return ring.toString();
    };
    let stderrText = "";
    let exitCode = 0;
    try {
      const results = await Promise.all([
        readStdout(),
        readStderr(),
        proc.exited,
      ]);
      stderrText = results[1];
      exitCode = results[2];
    } finally {
      if (proc?.pid && proc.pid > 0) {
        unregisterChildGroup(proc.pid);
      }
      clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      try {
        if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);
        if (fs.existsSync(systemPromptPath)) fs.unlinkSync(systemPromptPath);
      } catch {}
    }
    const parsed = parser.getResult();
    const sessionId = parsed.sessionId ?? run.session?.resume;
    const traceRef = sessionId ? this.findSessionTrace(sessionsDir, sessionId, parsed.sessionTimestamp) : undefined;
    const transcriptBytes = traceRef && fs.existsSync(traceRef) ? fs.statSync(traceRef).size : undefined;

    // 8. Handle non-zero exit or timeout
    const stopReasonFailure = Boolean(
      parsed.stopReason &&
      (parsed.stopReason === "abort" ||
       parsed.stopReason === "error" ||
       (exitCode === 0 && parsed.stopReason !== "stop" && parsed.stopReason !== "toolUse" && !parsed.yieldData))
    );

    if (timedOut || exitCode !== 0 || stopReasonFailure) {
      const classification = classifyOmpOutcome({
        exitCode: timedOut ? 143 : stopReasonFailure && exitCode === 0 ? 1 : exitCode,
        stderr: stderrText,
        parsed,
        resumeRequested: Boolean(run.session?.resume),
        timedOut,
      });

      return {
        ok: false,
        error: classification.error ?? `Process failed with exit code ${exitCode}`,
        transient: classification.transient,
        sessionLost: classification.sessionLost,
        sessionId,
        traceRef,
        usage: parsed.usage,
        transcriptBytes,
        stdoutBytes: totalStdoutBytes,
      };
    }

    // 9. Extract candidate structured output
    let candidateData: unknown = parsed.yieldData;

    if (candidateData === undefined && parsed.finalAssistantText.trim()) {
      try {
        candidateData = extractJsonFromText(parsed.finalAssistantText);
      } catch {
        candidateData = parsed.finalAssistantText;
      }
    }

    // 10. Schema enforcement
    if (run.outputSchema) {
      let validate;
      try {
        const schemaId = (run.outputSchema as any).$id as string | undefined;
        validate = (schemaId ? ajv.getSchema(schemaId) : undefined) ?? ajv.compile(run.outputSchema);
      } catch (compileErr: any) {
        return {
          ok: false,
          error: `Output schema compilation failed: ${compileErr.message}`,
          data: candidateData ?? parsed.finalAssistantText,
          sessionId,
          traceRef,
          usage: parsed.usage,
          transient: false,
          transcriptBytes,
          stdoutBytes: totalStdoutBytes,
        };
      }

      if (candidateData !== undefined && validate(candidateData)) {
        return {
          ok: true,
          data: candidateData,
          sessionId,
          traceRef,
          usage: parsed.usage,
          transcriptBytes,
          stdoutBytes: totalStdoutBytes,
        };
      }

      const errorsStr = formatAjvErrors(validate.errors);
      return {
        ok: false,
        error: `Agent output failed schema validation:\n${errorsStr}`,
        data: candidateData ?? parsed.finalAssistantText,
        sessionId,
        traceRef,
        usage: parsed.usage,
        transient: false,
        transcriptBytes,
        stdoutBytes: totalStdoutBytes,
      };
    }

    return {
      ok: true,
      data: candidateData ?? parsed.finalAssistantText,
      sessionId,
      traceRef,
      usage: parsed.usage,
      transcriptBytes,
      stdoutBytes: totalStdoutBytes,
    };
  }

  /**
   * Executes a stateless small completion / structural repair (§4, spike 2).
   */
  public async complete(c: {
    role: string;
    models: string[];
    system: string;
    prompt: string;
    schema: JSONSchema;
    timeoutSec?: number;
    timeoutMs?: number;
  }): Promise<unknown> {
    const cwd = process.cwd();
    const { promptsDir, overlayPath } = this.ensureRuntimeDirs(cwd);

    const fullPrompt = `${c.system}\n\n${c.prompt}\n\nPlease output ONLY a valid JSON object matching this schema:\n${JSON.stringify(c.schema, null, 2)}`;
    const promptPath = path.join(
      promptsDir,
      `complete-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`
    );
    fs.writeFileSync(promptPath, fullPrompt, "utf8");

    const roleArg = c.role.startsWith("@") ? c.role : `@${c.role}`;
    const args: string[] = [
      this.ompBinary,
      "-p", `@${promptPath}`,
      "--no-session",
      "--tools=",
      "--config", overlayPath,
      "--mode", "json",
      "--model", roleArg,
    ];

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(args, {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
      });
    } catch (err: any) {
      try { if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath); } catch {}
      throw new Error(`Failed to spawn omp complete: ${err.message}`);
    }

    if (proc.pid && proc.pid > 0) {
      registerChildGroup(proc.pid);
    }

    const killGroup = (signal: "SIGTERM" | "SIGKILL") => {
      if (proc.pid && proc.pid > 0) {
        try {
          process.kill(-proc.pid, signal);
          return;
        } catch (err: any) {
          if (err?.code === "ESRCH") return;
        }
      }
      try {
        proc.kill(signal);
      } catch {}
    };

    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const timeoutMs = c.timeoutMs ?? (c.timeoutSec != null && c.timeoutSec > 0 ? c.timeoutSec * 1000 : this.defaultTimeoutMs);
    const termTimer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");

      killTimer = setTimeout(() => {
        killGroup("SIGKILL");
      }, 3000);
    }, timeoutMs);

    const parser = new OmpNdjsonParser();
    const decoder = new TextDecoder();
    let stdoutBuffer = "";

    const readStdout = async () => {
      if (!proc.stdout || typeof proc.stdout === "number") return;
      for await (const chunk of proc.stdout) {
        stdoutBuffer += decoder.decode(chunk, { stream: true });
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          parser.feedLine(line);
        }
      }
      if (stdoutBuffer.trim()) {
        parser.feedLine(stdoutBuffer);
      }
    };

    const readStderr = async () => {
      if (!proc.stderr || typeof proc.stderr === "number") return "";
      const ring = new HeadTailBuffer(MAX_STDERR_BYTES);
      for await (const chunk of proc.stderr) {
        ring.push(Buffer.from(chunk));
      }
      return ring.toString();
    };
    let stderrText = "";
    let exitCode = 0;
    try {
      const results = await Promise.all([
        readStdout(),
        readStderr(),
        proc.exited,
      ]);
      stderrText = results[1];
      exitCode = results[2];
    } finally {
      if (proc?.pid && proc.pid > 0) {
        unregisterChildGroup(proc.pid);
      }
      clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      try {
        if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);
      } catch {}
    }

    if (timedOut) {
      throw new Error(`OMP complete timed out after ${timeoutMs}ms (process terminated)`);
    }

    if (exitCode !== 0) {
      throw new Error(`OMP complete failed with exit code ${exitCode}: ${stderrText.trim()}`);
    }

    const parsed = parser.getResult();
    if (parsed.stopReason === "abort" || parsed.stopReason === "error") {
      throw new Error(`OMP complete stopped with reason "${parsed.stopReason}": ${parsed.errors.join("; ") || stderrText.trim()}`);
    }

    const parsedData = extractJsonFromText(parsed.finalAssistantText);

    // Validate against requested schema
    const schemaId = (c.schema as any).$id as string | undefined;
    const validate = (schemaId ? ajv.getSchema(schemaId) : undefined) ?? ajv.compile(c.schema);
    if (!validate(parsedData)) {
      const errStr = formatAjvErrors(validate.errors);
      throw new Error(`OMP complete response does not conform to schema: ${errStr}`);
    }

    return parsedData;
  }
}

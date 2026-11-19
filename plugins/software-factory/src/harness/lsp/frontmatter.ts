// biome-ignore-all lint/complexity: split-rest
import fs from "node:fs";
import path from "node:path";
import { parseTaskFile } from "../../kernel/tasks.js";

/**
 * Minimal LSP server for task files: their YAML frontmatter is schema-
 * controlled, but the Markdown body is not YAML, so a YAML language server
 * validates the whole file as two documents and false-reports every body line.
 * This server validates the frontmatter with the kernel parser and speaks just
 * enough LSP for diagnostics on open, change and save.
 */

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspDiagnostic {
  range: { start: LspPosition; end: LspPosition };
  severity: 1;
  source: string;
  message: string;
}

interface FrontmatterBounds {
  /** 0-based line of the first frontmatter line. */
  start: number;
  /** 0-based line of the closing fence (exclusive content end). */
  end: number;
}

function frontmatterBounds(lines: string[]): FrontmatterBounds | undefined {
  if (lines[0]?.trim() !== "---") return undefined;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index]?.trim() === "---") return { start: 1, end: index };
  }
  return undefined;
}

const TASK_KEYS = new Set([
  "slug",
  "title",
  "kind",
  "flow",
  "deps",
  "scope",
  "tier",
  "revision",
  "base",
  "source",
  "repairTurns",
  "turnMinutes",
]);

function lineOf(
  lines: string[],
  bounds: FrontmatterBounds,
  key: string,
): number | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\s*:`);
  for (let index = bounds.start; index < bounds.end; index++) {
    if (pattern.test(lines[index] ?? "")) return index;
  }
  return undefined;
}

/**
 * The line a parser message points at: the first key the message names that
 * is also a frontmatter key, else the first frontmatter line.
 */
function messageLine(
  message: string,
  lines: string[],
  bounds: FrontmatterBounds | undefined,
): number {
  const fallback = bounds?.start ?? 0;
  if (!bounds) return fallback;
  const candidates: string[] = [];
  if (/has kind "/.test(message)) candidates.push("kind");
  if (/declares slug "/.test(message)) candidates.push("slug");
  for (const match of message.matchAll(/"([^"]+)"/g)) {
    if (match[1]) candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    if (!TASK_KEYS.has(candidate)) continue;
    const line = lineOf(lines, bounds, candidate);
    if (line !== undefined) return line;
  }
  return fallback;
}

/**
 * Diagnostics for one task file, keyed by its file name (the authoritative
 * slug). Valid frontmatter yields none.
 */
export function taskFileDiagnostics(
  text: string,
  fileSlug: string,
): LspDiagnostic[] {
  const lines = text.split(/\r?\n/);
  const bounds = frontmatterBounds(lines);
  let failure: string | undefined;
  try {
    parseTaskFile(text, fileSlug);
  } catch (err) {
    failure = (err as Error).message;
  }
  if (!failure) return [];
  const line = messageLine(failure, lines, bounds);
  return [
    {
      range: {
        start: { line, character: 0 },
        end: { line, character: (lines[line] ?? "").length },
      },
      severity: 1,
      source: "factory-task",
      message: failure,
    },
  ];
}

function filePath(uri: string): string | undefined {
  if (!uri.startsWith("file://")) return undefined;
  try {
    return decodeURIComponent(new URL(uri).pathname);
  } catch {
    return undefined;
  }
}

/** The artifact `tasks/` directory from argv, when the config names it. */
const tasksDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;

function isTaskFile(file: string): boolean {
  if (!file.endsWith(".md")) return false;
  if (tasksDir) return path.dirname(path.resolve(file)) === tasksDir;
  return path.dirname(file).split(path.sep).includes("tasks");
}

interface Frame {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

function send(message: Record<string, unknown>): void {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

function publish(uri: string, diagnostics: LspDiagnostic[]): void {
  send({
    method: "textDocument/publishDiagnostics",
    params: { uri, diagnostics },
  });
}

function validateFile(uri: string, text: string): void {
  const file = filePath(uri);
  // An open with no text yet is not an invalid task; wait for content.
  if (!file || !isTaskFile(file) || text.trim() === "") {
    publish(uri, []);
    return;
  }
  try {
    publish(uri, taskFileDiagnostics(text, path.basename(file, ".md")));
  } catch (err) {
    publish(uri, [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        severity: 1,
        source: "factory-task",
        message: `factory-task: ${(err as Error).message}`,
      },
    ]);
  }
}

function handle(frame: Frame): void {
  const method = frame.method;
  if (!method) return;
  if (frame.id !== undefined) {
    if (method === "initialize") {
      send({
        id: frame.id,
        result: {
          capabilities: { textDocumentSync: 1 },
          serverInfo: { name: "factory-task-frontmatter", version: "1" },
        },
      });
    } else {
      send({ id: frame.id, result: null });
    }
    return;
  }
  const params = frame.params ?? {};
  const document = params.textDocument as
    | { uri?: string; text?: string }
    | undefined;
  const uri = document?.uri;
  if (method === "textDocument/didOpen" && uri) {
    validateFile(uri, document?.text ?? "");
  } else if (method === "textDocument/didChange" && uri) {
    const changes = params.contentChanges as { text?: string }[] | undefined;
    validateFile(uri, changes?.at(-1)?.text ?? "");
  } else if (method === "textDocument/didSave" && uri) {
    // omp asks for the save text only when the server advertises
    // includeText; otherwise the saved file on disk is authoritative.
    const saved = typeof params.text === "string" ? params.text : undefined;
    const file = filePath(uri);
    const text =
      saved ??
      (file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
    validateFile(uri, text);
  } else if (method === "textDocument/didClose" && uri) {
    publish(uri, []);
  } else if (method === "exit") {
    process.exit(0);
  }
}

export function startFrontmatterServer(): void {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const length = /Content-Length:\s*(\d+)/i.exec(header)?.[1];
      if (length === undefined) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + Number(length);
      if (buffer.length < bodyEnd) return;
      const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.subarray(bodyEnd);
      let frame: Frame;
      try {
        frame = JSON.parse(body) as Frame;
      } catch {
        continue;
      }
      handle(frame);
    }
  });
  process.stdin.on("end", () => process.exit(0));
  process.stdin.resume();
}

if (import.meta.main) startFrontmatterServer();

// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  startFrontmatterServer,
  taskFileDiagnostics,
} from "../../src/harness/lsp/frontmatter.js";

const VALID = `---
slug: demo
title: Demo task
kind: task
flow: implement-review
---

Why: the body is Markdown, not a second YAML document.
Done: it stays unvalidated.
`;

const INVALID = `---
slug: demo
title: Demo task
kind: banana
flow: implement-review
---

Body.
`;

describe("task file frontmatter diagnostics", () => {
  it("accepts a valid task and ignores the Markdown body", () => {
    expect(taskFileDiagnostics(VALID, "demo")).toEqual([]);
  });

  it("points at the offending frontmatter key", () => {
    const diagnostics = taskFileDiagnostics(INVALID, "demo");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe(1);
    expect(diagnostics[0]!.source).toBe("factory-task");
    expect(diagnostics[0]!.message).toContain("banana");
    // 0-based line 3 is the `kind:` line (the fences are lines 0 and 5).
    expect(diagnostics[0]!.range.start.line).toBe(3);
  });

  it("reports a missing frontmatter block at the first line", () => {
    expect(taskFileDiagnostics("", "demo")).toHaveLength(1);
    const diagnostics = taskFileDiagnostics("# not a task\n", "demo");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("no --- frontmatter ---");
    expect(diagnostics[0]!.range.start.line).toBe(0);
  });

  it("reports a slug that disagrees with the file name", () => {
    const diagnostics = taskFileDiagnostics(VALID, "other");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("slugs are immutable");
    expect(diagnostics[0]!.range.start.line).toBe(1);
  });
});

interface Message {
  id?: number;
  method?: string;
  result?: { capabilities?: { textDocumentSync?: number } };
  params?: {
    uri?: string;
    diagnostics?: {
      message: string;
      range: { start: { line: number } };
    }[];
  };
}

/** Reads Content-Length LSP frames from a stream, one at a time. */
class FrameReader {
  private buffer = Buffer.alloc(0);
  private queued: Message[] = [];
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader =
      stream.getReader() as unknown as ReadableStreamDefaultReader<Uint8Array>;
  }

  async next(): Promise<Message> {
    for (;;) {
      const queued = this.queued.shift();
      if (queued) return queued;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const read = this.reader.read();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("timed out waiting for LSP frame")),
          5_000,
        );
      });
      let result: Awaited<typeof read>;
      try {
        result = await Promise.race([read, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (result.done) throw new Error("LSP server closed the stream");
      this.buffer = Buffer.concat([this.buffer, Buffer.from(result.value)]);
      this.pump();
    }
  }

  private pump(): void {
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer
        .subarray(bodyStart, bodyStart + length)
        .toString("utf8");
      this.buffer = this.buffer.subarray(bodyStart + length);
      this.queued.push(JSON.parse(body) as Message);
    }
  }
}

function send(
  proc: Bun.Subprocess<"pipe", "pipe", "pipe">,
  message: object,
): void {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  proc.stdin.flush();
}

const SCRIPT = path.join(
  import.meta.dir,
  "..",
  "..",
  "src",
  "harness",
  "lsp",
  "frontmatter.ts",
);

describe("task frontmatter LSP protocol", () => {
  it("answers initialize and publishes diagnostics on open and change", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frontmatter-lsp-"));
    const tasksDir = path.join(dir, "tasks");
    const proc = Bun.spawn(["bun", SCRIPT, tasksDir], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const frames = new FrameReader(proc.stdout);
      send(proc, { id: 1, method: "initialize", params: {} });
      const initialized = await frames.next();
      expect(initialized.id).toBe(1);
      expect(initialized.result?.capabilities?.textDocumentSync).toBe(1);

      const taskFile = path.join(dir, "tasks", "demo.md");
      fs.mkdirSync(path.dirname(taskFile), { recursive: true });
      fs.writeFileSync(taskFile, INVALID);
      const uri = pathToFileURL(taskFile).href;
      // An open before the buffer has content reports nothing.
      send(proc, {
        method: "textDocument/didOpen",
        params: { textDocument: { uri, languageId: "markdown", version: 1 } },
      });
      const empty = await frames.next();
      expect(empty.params?.diagnostics).toEqual([]);
      send(proc, {
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri,
            languageId: "markdown",
            version: 1,
            text: INVALID,
          },
        },
      });
      const opened = await frames.next();
      expect(opened.method).toBe("textDocument/publishDiagnostics");
      expect(opened.params?.uri).toBe(uri);
      expect(opened.params?.diagnostics).toHaveLength(1);
      expect(opened.params?.diagnostics?.[0]?.message).toContain("banana");
      expect(opened.params?.diagnostics?.[0]?.range.start.line).toBe(3);

      send(proc, {
        method: "textDocument/didChange",
        params: {
          textDocument: { uri, version: 2 },
          contentChanges: [{ text: VALID }],
        },
      });
      const changed = await frames.next();
      expect(changed.params?.diagnostics).toEqual([]);

      // A save without text validates the file on disk.
      fs.writeFileSync(taskFile, INVALID);
      send(proc, {
        method: "textDocument/didSave",
        params: { textDocument: { uri } },
      });
      const saved = await frames.next();
      expect(saved.params?.diagnostics).toHaveLength(1);
      expect(saved.params?.diagnostics?.[0]?.message).toContain("banana");

      // A Markdown file outside this goal's tasks directory is not a task
      // artifact, even when its parent is named tasks/.
      const other = path.join(dir, "other", "tasks");
      fs.mkdirSync(other, { recursive: true });
      const plan = pathToFileURL(path.join(other, "plan.md")).href;
      send(proc, {
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: plan,
            languageId: "markdown",
            version: 1,
            text: "# plan",
          },
        },
      });
      const ignored = await frames.next();
      expect(ignored.params?.uri).toBe(plan);
      expect(ignored.params?.diagnostics).toEqual([]);

      send(proc, { method: "exit" });
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("starts only when run as a script", () => {
    // The test imports the module; importing must not attach stdin handlers
    // or exit the test process.
    expect(typeof startFrontmatterServer).toBe("function");
  });
});

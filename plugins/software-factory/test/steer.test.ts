import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listPending,
  questionBlocks,
  takenPaths,
  writeQuestion,
} from "../src/core/steer.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "steer-test-"));
}

describe("steer: mailbox primitives", () => {
  it("listPending returns empty when the pending directory does not exist", async () => {
    const dir = tempDir();
    try {
      expect(await listPending(dir, "task-1")).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("listPending reads pending messages in filename order", async () => {
    const dir = tempDir();
    try {
      const pendingDir = path.join(dir, "task-1", "steer", "fromuserpending");
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, "b.md"), "second");
      fs.writeFileSync(path.join(pendingDir, "a.md"), "first");
      fs.writeFileSync(path.join(pendingDir, ".hidden"), "ignored");

      expect(await listPending(dir, "task-1")).toEqual([
        { file: "a.md", text: "first" },
        { file: "b.md", text: "second" },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("computes pending -> taken paths relative to the task dir", () => {
    expect(takenPaths("/abs/message.md", "task-1")).toEqual({
      from: "task-1/steer/fromuserpending/message.md",
      to: "task-1/steer/fromusertaken/message.md",
    });
  });

  it("writes a stable question and never clobbers the operator's answer", async () => {
    const dir = tempDir();
    try {
      const first = await writeQuestion(dir, "task-1", {
        ref: "item-a",
        disposition: "human-async",
        question: "Which API?",
        draftDecision: "keep v1",
        blocks: ["item-a"],
      });
      expect(first.id).toMatch(/^q-item-a-[0-9a-f]{10}$/);
      expect(first.status).toBe("open");

      const file = path.join(dir, "task-1", "steer", "tousertoreview", `${first.id}.yaml`);
      expect(fs.existsSync(file)).toBe(true);

      // Simulate the operator answering, then a re-run raising the same question.
      const answered = { ...first, status: "answered" as const, answer: "v2" };
      fs.writeFileSync(file, JSON.stringify(answered));

      const again = await writeQuestion(dir, "task-1", {
        ref: "item-a",
        disposition: "human-async",
        question: "Which API?",
      });
      expect(again.id).toBe(first.id);
      expect(again.status).toBe("answered");
      expect(again.answer).toBe("v2");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks on explicit blocks or its own ref, never human-awareness", () => {
    const base = {
      id: "q",
      ref: "item-a",
      disposition: "human-stop",
      question: "q",
      status: "open" as const,
      createdAt: new Date().toISOString(),
    };
    expect(questionBlocks(base, "item-a")).toBe(true);
    expect(questionBlocks({ ...base, blocks: ["item-b"] }, "item-b")).toBe(true);
    expect(questionBlocks({ ...base, blocks: ["item-b"] }, "item-a")).toBe(false);
    expect(questionBlocks({ ...base, disposition: "human-awareness" }, "item-a")).toBe(false);
    expect(questionBlocks({ ...base, status: "answered" }, "item-a")).toBe(false);
  });
});

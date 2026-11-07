import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  listPending,
  takenPaths,
  writeQuestion,
  classify,
} from "../src/core/steer.js";
import { loadPromptLibrary } from "../src/core/prompts.js";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import type { SteerClassificationArtifact } from "../src/core/artifacts.js";

describe("steer: mailbox ops & classification", () => {
  const builtinDir = path.resolve("agents");
  const prompts = loadPromptLibrary({ builtinDir });

  it("listPending returns empty array when directory does not exist", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steer-test-"));
    try {
      const pending = await listPending(tempDir, "task-1");
      expect(pending).toEqual([]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("listPending reads pending messages sorted by filename", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steer-test-"));
    try {
      const pendingDir = path.join(tempDir, "task-1", "steer", "fromuserpending");
      fs.mkdirSync(pendingDir, { recursive: true });

      fs.writeFileSync(path.join(pendingDir, "02-second.txt"), "Second directive");
      fs.writeFileSync(path.join(pendingDir, "01-first.txt"), "First directive");
      // Hidden file should be ignored
      fs.writeFileSync(path.join(pendingDir, ".gitkeep"), "");

      const pending = await listPending(tempDir, "task-1");
      expect(pending.length).toBe(2);
      expect(pending[0]!.file).toBe("01-first.txt");
      expect(pending[0]!.text).toBe("First directive");
      expect(pending[1]!.file).toBe("02-second.txt");
      expect(pending[1]!.text).toBe("Second directive");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("takenPaths computes source and destination relative paths", () => {
    const paths = takenPaths("01-operator-msg.txt", ".factory/my-task");
    expect(paths.from).toBe(".factory/my-task/steer/fromuserpending/01-operator-msg.txt");
    expect(paths.to).toBe(".factory/my-task/steer/fromusertaken/01-operator-msg.txt");
  });

  it("writeQuestion produces deterministic ID and writes question artifact", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "steer-test-"));
    try {
      const q = {
        ref: "items/auth-feature",
        disposition: "human-async",
        question: "Should we support OAuth 1.0 legacy clients?",
        draftDecision: "Support only OAuth 2.0 and OpenID Connect",
        blocks: ["auth-feature"],
      };

      const result1 = await writeQuestion(tempDir, "task-1", q);
      const result2 = await writeQuestion(tempDir, "task-1", q);

      // Deterministic ID
      expect(result1.id).toBe(result2.id);
      expect(result1.status).toBe("open");
      expect(result1.ref).toBe("items/auth-feature");

      // Verify file was written
      const filePath = path.join(
        tempDir,
        "task-1",
        "steer",
        "tousertoreview",
        `${result1.id}.yaml`
      );
      expect(fs.existsSync(filePath)).toBe(true);

      const saved = yaml.parse(fs.readFileSync(filePath, "utf8"));
      expect(saved.id).toBe(result1.id);
      expect(saved.question).toBe("Should we support OAuth 1.0 legacy clients?");
      expect(saved.status).toBe("open");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("classify invokes FakeHarness.scriptComplete and validates output schema", async () => {
    const harness = new FakeHarness();

    const expectedClassification: SteerClassificationArtifact = {
      refs: ["auth-feature"],
      kind: "answer",
      urgency: "now",
      summary: "Operator instructs to support only OAuth 2.0",
    };

    harness.scriptComplete((params) => {
      expect(params.role).toBe("simpler");
      expect(params.system).toContain("steering input classification engine");
      expect(params.prompt).toContain("Pending operator message file: 01-directive.txt");
      expect(params.prompt).toContain("We do not need OAuth 1.0");
      expect(params.prompt).toContain("Currently Open Questions");
      expect(params.schema).toBeDefined();

      return expectedClassification;
    });

    const pending = {
      file: "01-directive.txt",
      text: "We do not need OAuth 1.0, OAuth 2.0 only is fine.",
    };

    const openQuestions = [
      {
        id: "q-auth-1234",
        ref: "auth-feature",
        disposition: "human-async",
        question: "Should we support OAuth 1.0?",
        status: "open" as const,
      },
    ];

    const result = await classify(harness, pending, {
      openQuestions,
      role: "simpler",
      models: ["google-antigravity/gemini-3.8-flash"],
      prompts,
    });

    expect(result).toEqual(expectedClassification);
    expect(harness.calls.length).toBe(1);
      expect(harness.calls[0]!.type).toBe("complete");
  });
});

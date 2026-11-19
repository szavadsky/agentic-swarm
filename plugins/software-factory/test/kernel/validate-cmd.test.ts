// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { packageRoot } from "../../src/kernel/config.js";
import {
  loadPromptLibrary,
  loadPrompts,
  validateCmd,
} from "../../src/kernel/prompts.js";
import type { ProcessConfig } from "../../src/kernel/types.js";
import { TEST_BOUNDARY } from "./helpers.js";

// The vars each production render site supplies (boundary, front, pm, digest,
// promptVars): none passes validate_cmd, and none passes the reviewer's author;
// the renderer defaults fill both.
const ROLES: Record<string, Record<string, string>> = {
  architect: {
    turn: "boundary",
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    pack_path: "/goal/iterations/3/context-pack.md",
    digest_path: "/goal/iterations/3/digest.md",
    steers: "- s1 (mailbox/inbox/s1.md): keep the API stable",
    outcome_path: "/goal/records/00042-i3-architect-r1/outcome.yaml",
  },
  front: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    class_path: "/goal/class.yaml",
    pack_path: "/goal/iterations/3/context-pack.md",
    checkout: "/worktrees/demo",
    setup_command: "bun install",
    gate_commands: "- test: bun test",
    outcome_path: "/goal/records/00041-i3-front-r1/outcome.yaml",
  },
  pm: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    repair: '- task "beta" depends on missing task "ghost"',
    steers: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    holds_dir: "/goal/mailbox/holds",
    outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
  },
  implementer: {
    task_path: "/goal/tasks/alpha.md",
    report_path: "",
    front_pack: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo-tasks/alpha",
    setup_command: "bun install",
    gate_commands: "- test: bun test\n- typecheck: bun run typecheck",
    base_gates: "base abc1234def was red before any task (pre-existing)",
    findings: "- src/x.ts:41 needs a null check",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
  },
  reviewer: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
    base_hash: "abc1234",
    head_hash: "def5678",
    round: "1",
    max_rounds: "2",
    base_gates: "base abc1234def was red before any task (pre-existing)",
    prior_findings: "",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
  },
  digest: {
    launch_id: "previous-launch-before-3",
    goal_dir: "/goal",
    records_dir: "/goal/records",
    transcripts_dir: "/sessions/demo/launch-2",
    digest_path: "/goal/iterations/3/digest.md",
    outcome_path: "/goal/records/00044-i3-digest-r1/outcome.yaml",
  },
};

function library() {
  return loadPrompts(
    { flows: {}, boundary: TEST_BOUNDARY, reminders: 1 } as ProcessConfig,
    os.tmpdir(),
    {},
  );
}

/** First backtick-quoted `... bin/factory.ts validate` span, without `<file>`. */
function extractCommand(rendered: string): string {
  const match = rendered.match(
    /`([^`]*?bin\/factory\.ts validate)(?: <file>)?`/,
  );
  if (!match) throw new Error("rendered prompt has no validate command");
  return match[1]!;
}

function renderPrompt(role: string): string {
  const lib = library();
  // Production-like values above; anything the template gained since
  // (e.g. `resume_note`) renders empty so this test tracks only the
  // validate command and the reviewer author default, not every template
  // variable.
  const filled: Record<string, string> = { ...ROLES[role]! };
  for (const name of lib.placeholders(role))
    if (name !== "validate_cmd" && name !== "author") filled[name] ??= "";
  return lib.render(role, filled);
}

const VALID_OUTCOME = "status: done\nsummary: did the thing\n";
const INVALID_OUTCOME = "status: done\n";

describe("validate_cmd", () => {
  it("resolves to the running build's bin/factory.ts, absolute", () => {
    const bin = path.join(packageRoot, "bin", "factory.ts");
    expect(fs.existsSync(bin)).toBe(true);
    expect(validateCmd()).toBe(`bun ${bin} validate`);
    expect(path.isAbsolute(bin)).toBe(true);
  });

  it("quotes a build path with spaces", () => {
    expect(validateCmd("/tmp/with space/bin/factory.ts")).toBe(
      'bun "/tmp/with space/bin/factory.ts" validate',
    );
  });

  it("fills every render as a default; an explicit var wins", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-cmd-"));
    try {
      fs.writeFileSync(
        path.join(dir, "ask.md"),
        "run `{{validate_cmd}} <file>`\n",
      );
      const lib = loadPromptLibrary({
        builtinDir: dir,
        defaults: { validate_cmd: "DEFAULT" },
      });
      expect(lib.render("ask", {})).toContain("`DEFAULT <file>`");
      expect(lib.render("ask", { validate_cmd: "EXPLICIT" })).toContain(
        "`EXPLICIT <file>`",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renders the delivery-repair ask outside promptVars without it", () => {
    const rendered = library().render("delivery-repair", {
      role: "pm",
      deliverable: "task files",
      done_allowed: "true",
      findings: "- outcome is missing",
      outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
    });
    expect(rendered).toContain("task files");
  });

  for (const role of Object.keys(ROLES)) {
    it(`renders ${role} with a runnable validate command`, () => {
      const lib = library();
      const placeholders = lib.placeholders(role);
      expect(placeholders).toContain("validate_cmd");
      const rendered = renderPrompt(role);
      expect(rendered).not.toContain("factory validate");
      expect(rendered).toContain(validateCmd());
      if (role === "reviewer")
        expect(rendered).toContain("You implement one task in one worktree.");

      const worktree = fs.mkdtempSync(
        path.join(os.tmpdir(), "validate-cmd-wt-"),
      );
      try {
        const good = path.join(worktree, "outcome.yaml");
        const badDir = path.join(worktree, "bad");
        fs.mkdirSync(badDir, { recursive: true });
        const bad = path.join(badDir, "outcome.yaml");
        fs.writeFileSync(good, VALID_OUTCOME);
        fs.writeFileSync(bad, INVALID_OUTCOME);

        const cmd = extractCommand(rendered);
        const run = (file: string) =>
          spawnSync("sh", ["-c", `${cmd} "${file}"`], {
            cwd: worktree,
            encoding: "utf8",
          });
        const valid = run(good);
        expect(valid.status).toBe(0);
        expect(valid.stdout).toContain("valid");

        const invalid = run(bad);
        expect(invalid.status).not.toBe(0);
        expect(invalid.stderr).toContain("summary");
      } finally {
        fs.rmSync(worktree, { recursive: true, force: true });
      }
    });
  }

  it("checks a debtClosed id against the record tree beside the outcome", () => {
    const worktree = fs.mkdtempSync(
      path.join(os.tmpdir(), "validate-cmd-debt-"),
    );
    try {
      const records = path.join(worktree, "goal", "records");
      const raise = path.join(records, "00001-i1-alpha-review-r1");
      fs.mkdirSync(raise, { recursive: true });
      fs.writeFileSync(
        path.join(raise, "started.yaml"),
        "seq: 1\niteration: 1\nstep: review\nround: 1\nactor: agent\n",
      );
      fs.writeFileSync(
        path.join(raise, "outcome.yaml"),
        `${VALID_OUTCOME}verdict: approve\nconcerns: [{kind: debt, calibration: architect, text: shim in the writer}]\n`,
      );
      const close = path.join(records, "00002-i1-alpha-architect-r1");
      fs.mkdirSync(close, { recursive: true });
      fs.writeFileSync(
        path.join(close, "started.yaml"),
        "seq: 2\niteration: 1\nstep: architect\nround: 1\nactor: agent\n",
      );
      const outcome = path.join(close, "outcome.yaml");
      const cmd = extractCommand(renderPrompt("architect"));
      const run = () =>
        spawnSync("sh", ["-c", `${cmd} "${outcome}"`], {
          cwd: worktree,
          encoding: "utf8",
        });
      const closeWith = (id: string) =>
        fs.writeFileSync(
          outcome,
          `status: done\nsummary: closed\ndecision: continue\ndebtClosed: [{id: "${id}", reason: "shim removed"}]\n`,
        );

      closeWith("00001-i1-alpha-review-r1#1");
      const known = run();
      expect(known.status).toBe(0);
      expect(known.stdout).toContain("valid");

      closeWith("00001-i1-alpha-review-r1#2");
      const unknown = run();
      expect(unknown.status).not.toBe(0);
      expect(unknown.stderr).toContain("unknown debt id");

      // A debt raised in this very record has no id yet: ingest assigns it
      // when the record seals, so closing it here is unknown, not a no-op.
      fs.writeFileSync(
        outcome,
        [
          "status: done",
          "summary: closed its own debt",
          "decision: continue",
          "concerns: [{kind: debt, calibration: fyi, text: shim in the reader}]",
          'debtClosed: [{id: "00002-i1-alpha-architect-r1#1", reason: "shim removed"}]',
          "",
        ].join("\n"),
      );
      const own = run();
      expect(own.status).not.toBe(0);
      expect(own.stderr).toContain("unknown debt id");
    } finally {
      fs.rmSync(worktree, { recursive: true, force: true });
    }
  });

  it("checks a review record's outcome with the step from started.yaml", () => {
    const worktree = fs.mkdtempSync(
      path.join(os.tmpdir(), "validate-cmd-record-"),
    );
    try {
      const record = path.join(worktree, "records", "00042-i1-alpha-review-r1");
      fs.mkdirSync(record, { recursive: true });
      fs.writeFileSync(
        path.join(record, "started.yaml"),
        "seq: 42\niteration: 1\nstep: review\nround: 1\nactor: agent\n",
      );
      const outcome = path.join(record, "outcome.yaml");
      const cmd = extractCommand(renderPrompt("reviewer"));
      const run = () =>
        spawnSync("sh", ["-c", `${cmd} "${outcome}"`], {
          cwd: worktree,
          encoding: "utf8",
        });

      fs.writeFileSync(outcome, VALID_OUTCOME);
      const missing = run();
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain("verdict is required");

      fs.writeFileSync(outcome, `${VALID_OUTCOME}verdict: approve\n`);
      const valid = run();
      expect(valid.status).toBe(0);
      expect(valid.stdout).toContain("valid");
    } finally {
      fs.rmSync(worktree, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  dispatchAssignment,
  isFreeModel,
  stampNow,
  summarizeLog,
} from "../../src/cli/commands/bootstrap-dispatch.js";
import { treeFile } from "../helpers/run-configs.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "../..");
const DISPATCH_SH = treeFile("bootstrap/dispatch.sh");
const DISPATCH_ENTRY = path.join(PACKAGE_ROOT, "scripts/bootstrap-dispatch.ts");
const DISPATCH_LOGIC = path.join(
  PACKAGE_ROOT,
  "src/cli/commands/bootstrap-dispatch.ts",
);

const OPENCODE_OK = `#!/bin/sh
printf '%s\n' '{"type":"step_start","sessionID":"ses_fake"}'
printf '%s\n' '{"type":"tool_use"}'
printf '%s\n' '{"type":"step_finish"}'
printf '%s\n' '{"type":"text","part":{"text":"done here"}}'
printf '%s\n' '{"type":"step_finish"}'
exit 0
`;

const OPENCODE_RED = `#!/bin/sh
printf '%s\n' '{"type":"step_start","sessionID":"ses_red"}'
printf '%s\n' '{"type":"error","error":"boom one"}'
printf '%s\n' '{"type":"error","error":"boom two"}'
exit 3
`;

/** A fake-OPENCODE bin dir on PATH, so no real agent ever launches. */
function fakeBinDir(script: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-fakebin-"));
  fs.writeFileSync(path.join(dir, "opencode"), script, "utf8");
  fs.chmodSync(path.join(dir, "opencode"), 0o755);
  return dir;
}

function seedRepo(): TmpRepo {
  const repo = createTmpRepo();
  repo.writeFile(
    "plugins/software-factory/package.json",
    `${JSON.stringify({ name: "fake", private: true, type: "module" }, null, 2)}\n`,
  );
  repo.writeFile(
    "plugins/software-factory/scripts/bootstrap-dispatch.ts",
    fs.readFileSync(DISPATCH_ENTRY, "utf8"),
  );
  repo.writeFile(
    "plugins/software-factory/src/cli/commands/bootstrap-dispatch.ts",
    fs.readFileSync(DISPATCH_LOGIC, "utf8"),
  );
  // The dispatch logic shares promote.ts's runSync; a bare fake repo has to
  // carry that module too.
  repo.writeFile(
    "plugins/software-factory/src/cli/commands/promote.ts",
    fs.readFileSync(
      path.join(PACKAGE_ROOT, "src/cli/commands/promote.ts"),
      "utf8",
    ),
  );
  repo.writeFile(
    "bootstrap/dispatch.sh",
    fs.readFileSync(DISPATCH_SH as string, "utf8"),
  );
  repo.commit("seed");
  repo.createBranch("factory-v3");
  return repo;
}

function worktreeOf(repo: TmpRepo, name: string): string {
  return path.join(path.dirname(repo.dir), name.toLowerCase());
}

/** A unique assignment name so a stale worktree can never collide. */
let counter = 0;
function uniqueName(): string {
  counter += 1;
  return `unique${process.pid}${counter.toString(36)}`;
}

interface RunSetup {
  repo: TmpRepo;
  fakeBin: string;
  root: string;
  name: string;
  wt: string;
}

function setup(script: string): RunSetup {
  const repo = seedRepo();
  const fakeBin = fakeBinDir(script);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-dispatch-"));
  const name = uniqueName();
  return { repo, fakeBin, root, name, wt: worktreeOf(repo, name) };
}

function cleanupRun(s: RunSetup): void {
  fs.rmSync(s.wt, { recursive: true, force: true });
  s.repo.cleanup();
  fs.rmSync(s.fakeBin, { recursive: true, force: true });
  fs.rmSync(s.root, { recursive: true, force: true });
}

/** Runs one assignment, capturing the printed summary lines. */
async function runIt(
  s: RunSetup,
  lines: string[],
  opts: { model?: string } = {},
): Promise<number> {
  const log = console.log;
  console.log = (msg: string) => lines.push(msg);
  try {
    return await dispatchAssignment({
      root: s.repo.dir,
      name: s.name,
      ...(opts.model ? { model: opts.model } : {}),
      env: {
        ...process.env,
        PATH: `${s.fakeBin}:${process.env.PATH}`,
        FACTORY_BOOTSTRAP_RUNS: path.join(s.root, "logs"),
        FACTORY_SLOT_DIR: path.join(s.root, "slots"),
        FACTORY_DISPATCH_TIMEOUT: "30s",
      },
    });
  } finally {
    console.log = log;
  }
}

describe("dispatch helpers", () => {
  it("matches the shell's free-model test", () => {
    expect(isFreeModel("opencode/deepseek-v4.1-flash-free#max")).toBe(true);
    expect(isFreeModel("opencode/big-pickle")).toBe(true);
    expect(isFreeModel("opencode/gpt-5.6-sol#max")).toBe(false);
    expect(isFreeModel("anthropic/claude")).toBe(false);
  });

  it("stamps logs in the shell's %Y%m%dT%H%M%S shape", () => {
    expect(stampNow(new Date("2026-11-23T04:05:06"))).toBe("20261123T040506");
  });

  it("summarizes a JSONL log, tolerating a missing file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-log-"));
    try {
      expect(await summarizeLog(path.join(dir, "none.jsonl"))).toEqual({
        session: "",
        steps: 0,
        toolCalls: 0,
        errors: [],
        finalText: "",
      });
      const log = path.join(dir, "x.jsonl");
      fs.writeFileSync(
        log,
        [
          '{"type":"step_start","sessionID":"s1"}',
          '{"type":"tool_use"}',
          '{"type":"text","part":{"text":"first"}}',
          '{"type":"step_finish"}',
          '{"type":"text","part":{"text":"last"}}',
          "not json at all",
          "",
        ].join("\n"),
      );
      expect(await summarizeLog(log)).toEqual({
        session: "s1",
        steps: 1,
        toolCalls: 1,
        errors: [],
        finalText: "last",
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dispatch logic", () => {
  it("creates the worktree, runs opencode and prints the summary", async () => {
    const s = setup(OPENCODE_OK);
    const logs = path.join(s.root, "logs");
    const lines: string[] = [];
    try {
      expect(await runIt(s, lines, { model: "custom/model" })).toBe(0);
      const out = lines.join("\n");
      expect(out).toContain(
        `assignment=${s.name} model=custom/model exit=0 log=`,
      );
      expect(out).toContain("session=ses_fake");
      expect(out).toContain("steps=2 tool_calls=1");
      expect(out).toContain("final text:");
      expect(out).toContain("done here");
      expect(
        fs.existsSync(path.join(s.wt, "plugins/software-factory/package.json")),
      ).toBe(true);
      expect(
        fs
          .readdirSync(logs)
          .some(
            (file) => file.startsWith(`${s.name}-`) && file.endsWith(".jsonl"),
          ),
      ).toBe(true);
    } finally {
      cleanupRun(s);
    }
  }, 60_000);

  it("returns opencode's exit code and prints the last errors", async () => {
    const s = setup(OPENCODE_RED);
    const lines: string[] = [];
    try {
      expect(await runIt(s, lines, { model: "custom/model" })).toBe(3);
      const out = lines.join("\n");
      expect(out).toContain("exit=3");
      expect(out).toContain('"boom one"');
      expect(out).toContain('"boom two"');
    } finally {
      cleanupRun(s);
    }
  }, 60_000);

  it("takes the slot lock for a free model", async () => {
    const s = setup(OPENCODE_OK);
    const slots = path.join(s.root, "slots");
    try {
      expect(await runIt(s, [])).toBe(0);
      expect(fs.existsSync(path.join(slots, "opencode-free.lock"))).toBe(true);
    } finally {
      cleanupRun(s);
    }
  }, 60_000);
});

describe.skipIf(DISPATCH_SH === undefined)(
  "dispatch.sh, the one-line face",
  () => {
    it("runs the logic through the script and passes arguments", () => {
      const s = setup(OPENCODE_OK);
      try {
        const res = spawnSync(
          "bash",
          [
            path.join(s.repo.dir, "bootstrap", "dispatch.sh"),
            s.name,
            "custom/model",
          ],
          {
            cwd: s.repo.dir,
            timeout: 120_000,
            env: {
              ...process.env,
              PATH: `${s.fakeBin}:${process.env.PATH}`,
              FACTORY_BOOTSTRAP_RUNS: path.join(s.root, "logs"),
              FACTORY_SLOT_DIR: path.join(s.root, "slots"),
              FACTORY_DISPATCH_TIMEOUT: "30s",
            },
            encoding: "utf8",
          },
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toContain(
          `assignment=${s.name} model=custom/model exit=0`,
        );
        expect(res.stdout).toContain("session=ses_fake");
        expect(
          fs.existsSync(
            path.join(s.wt, "plugins/software-factory/package.json"),
          ),
        ).toBe(true);
      } finally {
        cleanupRun(s);
      }
    }, 120_000);
  },
);

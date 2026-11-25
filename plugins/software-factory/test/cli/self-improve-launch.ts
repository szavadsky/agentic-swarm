import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { TurnRequest } from "../../src/harness/types.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { scriptKernelRoleFallbacks } from "../kernel/fake-defaults.js";
import { whenTurn } from "../kernel/s2-helpers.js";

/** Which iterations' architect saw an assessment pointer in its pack. */
export interface AssessmentVisibility {
  assessmentInPack: Map<number, boolean>;
}

const PLAN = `# Milestone 1 — alpha

## alpha
Create alpha.txt.
Done when: alpha.txt exists.
`;

const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.

Done when: alpha.txt exists.
`;

function outcome(value: Record<string, unknown> = {}) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

export function writeLaunchRepo(repo: TmpRepo): void {
  fs.writeFileSync(path.join(repo.dir, "README.md"), "# demo\n", "utf8");
  fs.writeFileSync(
    path.join(repo.dir, "INTENT.md"),
    "# Goal\n\nCreate alpha.txt.\n",
    "utf8",
  );
  repo.writeFile(
    ".factory/repo.yaml",
    [
      "baseBranch: main",
      "artifactRoot: .factory/artifacts",
      "setup: []",
      "gates:",
      "  - id: readme",
      '    command: "test -f README.md"',
      "",
    ].join("\n"),
  );
  repo.writeFile(".factory/run.yaml", runYaml(repo));
}

/** The run layer for the fake harness: every alias the shipped flows name. */
function runYaml(repo: TmpRepo): string {
  const base = path.basename(repo.dir);
  return [
    "aliases:",
    "  architect: { harness: fake, model: fake-architect }",
    "  assess: { harness: fake, model: fake-assess }",
    "  pm: { harness: fake, model: fake-pm }",
    "  digest: { harness: fake, model: fake-digest }",
    "  intent: { harness: fake, model: fake-intent }",
    "  implementer: { harness: fake, model: fake-impl }",
    "  implementer-b: { harness: fake, model: fake-impl-b }",
    "  researcher: { harness: fake, model: fake-research }",
    "  reviewer: { harness: fake, model: fake-review }",
    "  qa: { harness: fake, model: fake-qa }",
    "  steward: { harness: fake, model: fake-steward }",
    "  plan-checker: { harness: fake, model: fake-check }",
    "  plan-reviewer: { harness: fake, model: fake-plan-review }",
    "  pack-preparer: { harness: fake, model: fake-pack-prep }",
    "limits: { iterations: 1, concurrency: { overall: 1 } }",
    `worktreeRoot: ../${base}-wt`,
    `sessions: { dir: ../${base}-sessions, keepRuns: 2, retention: short }`,
    "",
  ].join("\n");
}

function iterationOf(req: TurnRequest): number {
  const record = path.basename(path.dirname(req.outcomePath!));
  const match = /^\d+-i(\d+)/.exec(record);
  if (!match) throw new Error(`record directory has no iteration: ${record}`);
  return Number(match[1]);
}

export function packFile(goalDir: string, iteration: number): string {
  return path.join(goalDir, "iterations", String(iteration), "context-pack.md");
}

/** The front's classification and a placeholder pack, as a fresh goal needs. */
function frontTurn(goalDir: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n");
    const pack = packFile(goalDir, 1);
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.writeFileSync(pack, "# FRONT PACK\n\n- alpha only\n");
    ctx.writeOutcome(outcome({ summary: "classified bigger" }));
    return fakeTurnResult(req);
  };
}

/**
 * The assess turn does what its prompt asks: it reads the prompt it is handed,
 * takes the context pack from it, and writes the assessment beside that pack
 * plus the pointer the architect will read. A wrong prompt or a pack-less
 * render fails the turn instead of silently writing to a guessed path.
 */
function assessTurn(): FakeTurnHandler {
  return (req, ctx) => {
    if (!req.prompt.includes("You are the previous-run assessment")) {
      throw new Error("assess turn did not receive the assessment prompt");
    }
    const named = /^- Context pack: `([^`]+)`/m.exec(req.prompt);
    if (!named) throw new Error("assessment prompt names no context pack");
    const pack = named[1]!;
    if (!fs.existsSync(pack)) {
      throw new Error(`assessment prompt names a missing pack: ${pack}`);
    }
    const assessment = path.join(path.dirname(pack), "assessment.md");
    fs.writeFileSync(
      assessment,
      "# Previous-run assessment\n\nFriction: none recorded.\n",
    );
    fs.appendFileSync(
      pack,
      `\n## Previous-run assessment\n\n- assessment: ${assessment} — no friction recorded\n`,
    );
    ctx.writeOutcome(outcome({ summary: "assessed the previous run" }));
    return fakeTurnResult(req);
  };
}

/** The architect reads the pack it was handed; the test checks what it saw. */
function architectTurn(
  goalDir: string,
  seen: { assessmentInPack: Map<number, boolean> },
): FakeTurnHandler {
  return (req, ctx) => {
    const iteration = iterationOf(req);
    const pack = packFile(goalDir, iteration);
    seen.assessmentInPack.set(
      iteration,
      fs.existsSync(pack) &&
        fs.readFileSync(pack, "utf8").includes("## Previous-run assessment"),
    );
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN);
    ctx.writeOutcome(
      outcome({
        summary: `planned iteration ${iteration}`,
        decision: "continue",
      }),
    );
    return fakeTurnResult(req);
  };
}

/** The PM files the one task; a relaunch re-files the same file harmlessly. */
function pmTurn(taskDir: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA);
    ctx.writeOutcome(outcome({ summary: "filed alpha" }));
    return fakeTurnResult(req);
  };
}

function implementTurn(): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n");
    ctx.writeOutcome(outcome({ summary: "alpha added" }));
    return fakeTurnResult(req);
  };
}

function reviewTurn(): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  };
}

/**
 * One launch's fake turns: the front, the assessment and the architect are
 * bound by step, so a launch that skips one cannot consume another's script.
 */
export function launchHarness(
  goalDir: string,
  taskDir: string,
  seen: { assessmentInPack: Map<number, boolean> },
): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(frontTurn(goalDir), { when: whenTurn({ step: "front" }) });
  harness.script(assessTurn(), { when: whenTurn({ step: "assess" }) });
  harness.script(architectTurn(goalDir, seen), {
    when: whenTurn({ step: "architect" }),
  });
  harness.script(pmTurn(taskDir));
  harness.script(implementTurn());
  harness.script(reviewTurn());
  scriptKernelRoleFallbacks(harness);
  return harness;
}

/** The configured step ran on the relaunch, before the architect, with its file. */

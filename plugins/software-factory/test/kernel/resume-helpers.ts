import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { expectDispatch } from "./e2e-helpers.js";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { TurnRequest } from "../../src/harness/types.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

export const PLAN = `# Milestone 1 — files

## alpha
Create alpha.txt.

## beta
Create beta.txt.
`;

export const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.
`;

export const BETA = `---
slug: beta
title: Create beta
kind: task
flow: implement-review
deps: []
scope: [beta.txt]
source: Milestone 1 / beta
---

Create beta.txt.
`;

export function outcome(value: Record<string, unknown>) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

export function setupRepo(): {
  repo: TmpRepo;
  goalDir: string;
  taskDir: string;
} {
  const repo = createTmpRepo();
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  const base = path.basename(repo.dir);
  repo.writeFile(
    ".factory/run.yaml",
    [
      "aliases:",
      "  architect: { harness: fake, model: fake-architect }",
      "  pm: { harness: fake, model: fake-pm }",
      "  digest: { harness: fake, model: fake-digest }",
      "  implementer: { harness: fake, model: fake-impl }",
      "  implementer-b: { harness: fake, model: fake-impl-b }",
      "  researcher: { harness: fake, model: fake-research }",
      "  reviewer: { harness: fake, model: fake-review }",
      "  qa: { harness: fake, model: fake-qa }",
      "  steward: { harness: fake, model: fake-steward }",
      "  plan-checker: { harness: fake, model: fake-check }",
      "  intent: { harness: fake, model: fake-intent }",
      "  plan-reviewer: { harness: fake, model: fake-plan-review }",
      "  pack-preparer: { harness: fake, model: fake-pack-prep }",
      "limits: { iterations: 3, concurrency: { overall: 1 } }",
      `worktreeRoot: ../${base}-wt`,
      `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
      "",
    ].join("\n"),
  );
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(path.join(goalDir, "tasks"), { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nCreate alpha then beta.\n",
    "utf8",
  );
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");
  return { repo, goalDir, taskDir: path.join(goalDir, "tasks") };
}

export function silenceWarn(): () => void {
  const orig = console.warn;
  console.warn = () => {};
  return () => {
    console.warn = orig;
  };
}

/** First line of the steer a resumed launch posts for its digest. */
export const DIGEST_STEER_HEADER = "# Launch digest before iteration";

/** A marker only the digest scout writes, so tests can prove the PM read it. */
export const DIGEST_SCOUT_MARKER = "## Loops\n- digest-scout-marker";

export function isDigestSteerTurn(req: TurnRequest): boolean {
  return req.prompt.includes(DIGEST_STEER_HEADER);
}

export function digestSteerId(req: TurnRequest): string {
  const id = /- (digest-\S+) \(mailbox\/inbox\//.exec(req.prompt)?.[1];
  if (!id) throw new Error("the PM steer turn carries no digest steer id");
  return id;
}

/** Routes the resumed launch's digest steer to the architect (no task writes). */
export function digestSteerTurn(): FakeTurnHandler {
  return (req, ctx) => {
    const id = digestSteerId(req);
    ctx.writeOutcome(
      outcome({
        summary: `digest steer ${id} routed to the architect`,
        steerRoutes: [{ steer: id, route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  };
}

/**
 * Queues the resume's digest steer turn before the FIFO scripts: an unbound
 * handler matches any request, so bound handlers must come first.
 */
export function queueDigestSteer(
  harness: FakeHarness,
  handler: FakeTurnHandler = digestSteerTurn(),
): FakeHarness {
  return harness.script(handler, { when: isDigestSteerTurn });
}

/** Routes the resumed launch's digest steer to a task (no architect route). */
export function digestTaskTurn(taskDir: string, slug: string): FakeTurnHandler {
  return (req, ctx) => {
    const id = digestSteerId(req);
    fs.appendFileSync(
      path.join(taskDir, `${slug}.md`),
      "\nDigest evidence noted; no scope change.\n",
      "utf8",
    );
    ctx.writeOutcome(
      outcome({
        summary: `digest steer ${id} routed to task ${slug}`,
        steerRoutes: [
          {
            steer: id,
            route: "task",
            answer: `Noted for ${slug}; scope unchanged.`,
          },
        ],
      }),
    );
    return fakeTurnResult(req);
  };
}

/** Scripts the digest scout a resumed launch runs before its PM steer turn. */
export function digestScoutTurn(
  goalDir: string,
  iteration: number,
): FakeTurnHandler {
  return (req, ctx) => {
    const digest = path.join(goalDir, `iterations/${iteration}/digest.md`);
    expect(fs.existsSync(digest)).toBe(true);
    fs.appendFileSync(digest, `\n${DIGEST_SCOUT_MARKER}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: "digest scout done" }));
    return fakeTurnResult(req);
  };
}

/** Adds a role alias to the run config, e.g. the digest scout a resume needs. */
export function addAlias(repo: TmpRepo, name: string, model: string): void {
  const file = path.join(repo.dir, ".factory/run.yaml");
  const text = fs.readFileSync(file, "utf8");
  const next = text.replace(
    "  steward: { harness: fake, model: fake-steward }",
    `  steward: { harness: fake, model: fake-steward }\n  ${name}: { harness: fake, model: ${model} }`,
  );
  expect(next).not.toBe(text);
  fs.writeFileSync(file, next, "utf8");
}

export async function drainedAfterAlpha(): Promise<{
  repo: TmpRepo;
  goalDir: string;
  taskDir: string;
}> {
  const s = setupRepo();
  const controller = createDrainController();
  const restoreWarn = silenceWarn();
  try {
    const first = new FakeHarness({ id: "fake" });
    first.script((req, ctx) => {
      fs.writeFileSync(path.join(s.goalDir, "plan.md"), PLAN, "utf8");
      ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
      return fakeTurnResult(req);
    });
    first.script((req, ctx) => {
      fs.writeFileSync(path.join(s.taskDir, "alpha.md"), ALPHA, "utf8");
      fs.writeFileSync(path.join(s.taskDir, "beta.md"), BETA, "utf8");
      ctx.writeOutcome(outcome({ summary: "filed" }));
      return fakeTurnResult(req);
    });
    first.script((req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha added" }));
      return fakeTurnResult(req);
    });
    first.script((req, ctx) => {
      controller.handleSignal("SIGINT");
      ctx.writeOutcome(
        outcome({ summary: "alpha approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    });
    await expectDispatch(130, ["run", "--repo", s.repo.dir, "--goal", "demo"], {
      harnesses: { fake: first },
      signals: controller,
    });
  } finally {
    restoreWarn();
  }
  return s;
}

export function setLimits(repo: TmpRepo, extra: string): void {
  const file = path.join(repo.dir, ".factory/run.yaml");
  const text = fs.readFileSync(file, "utf8");
  const next = text.replace(
    "limits: { iterations: 3, concurrency: { overall: 1 } }",
    `limits: { iterations: 3, concurrency: { overall: 1 }, ${extra} }`,
  );
  expect(next).not.toBe(text);
  fs.writeFileSync(file, next, "utf8");
}

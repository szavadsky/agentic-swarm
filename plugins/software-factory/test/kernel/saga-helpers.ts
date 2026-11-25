/**
 * The depth-2 saga fixture shared by the saga tests: the two-epic register and
 * plans, the task/plan turn shapes, and the prompt readers the assertions use.
 */

import fs from "node:fs";
import path from "node:path";
import {
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { outcome } from "./e2e-helpers.js";

export const SAGA_PROCESS = "hierarchy:\n  depth: 2\n";

export const GOAL_PLAN = `# Milestone 1

## Architect register

- epic \`alpha\` | architect \`subarchitect\` | plan \`epics/alpha.md\` | scope \`alpha.txt\` | opened i1 | active
- epic \`beta\` | architect \`subarchitect\` | plan \`epics/beta.md\` | scope \`beta.txt\` | opened i1 | active
`;

export const ALPHA_PLAN = `# Epic alpha

## Milestone 1

- \`alpha.build\` — create alpha.txt.
  - done: alpha.txt exists.
`;

export const BETA_PLAN = `# Epic beta

## Milestone 1

- \`beta.build\` — create beta.txt.
  - done: beta.txt exists.
`;

export function epicTask(slug: string, epic: string, file: string): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: Create ${file}`,
    "kind: development",
    "flow: implement-review",
    "deps: []",
    `scope: [${file}]`,
    `epic: ${epic}`,
    "source: plan",
    "---",
    "",
    `Create ${file}.`,
    "",
    `Done when: ${file} exists.`,
    "",
  ].join("\n");
}

/** A turn that writes the task's file; `before` posts any steer it must drop. */
export function implementer(
  file: string,
  before?: () => void | Promise<void>,
): FakeTurnHandler {
  return async (req, ctx) => {
    await before?.();
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${file} created` }));
    return fakeTurnResult(req);
  };
}

export function approver(summary: string): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(outcome({ summary, verdict: "approve" }));
    return fakeTurnResult(req);
  };
}

export function stepOf(req: Parameters<FakeTurnHandler>[0]): string {
  return fakeTurnIdentity(req).step ?? "";
}

export function iterationOf(req: Parameters<FakeTurnHandler>[0]): string {
  return fakeTurnIdentity(req).record;
}

/** The saga pass a subarchitect turn runs, from its rendered turn block. */
export function passOf(req: Parameters<FakeTurnHandler>[0]): string {
  const match = /- pass: `([^`]+)`/.exec(req.prompt);
  return match?.[1] ?? "";
}

/** The context pack a rendered turn names. */
export function packOf(prompt: string): string {
  const match = /- context pack: `([^`]+)`/.exec(prompt);
  if (!match?.[1]) throw new Error("turn prompt names no context pack");
  return match[1];
}

/** The pack a turn was pointed at, read from disk. */
export function readPack(req: Parameters<FakeTurnHandler>[0]): string {
  return fs.readFileSync(packOf(req.prompt), "utf8");
}

/** The outcome path a steered consult names. */
export function steeredOutcome(prompt: string): string {
  const match = /- outcome path: `([^`]+)`/.exec(prompt);
  if (!match?.[1]) throw new Error("steered consult names no outcome path");
  return match[1];
}

/** Drops an epic-scoped steer into the inbox as a writer would. */
export function writeEpicSteer(
  goalDir: string,
  id: string,
  epic: string,
  text: string,
): void {
  const inbox = path.join(goalDir, "mailbox/inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(
    path.join(inbox, `${id}.md`),
    `---\nepic: ${epic}\n---\n\n${text}.\n`,
    "utf8",
  );
}

import { describe, expect, it } from "bun:test";
import path from "node:path";
import { packageRoot } from "../../src/kernel/config.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";

/**
 * The steered hierarchy's two harness-facing prompts: the architect's launch
 * block and the transient subarchitect definition. The omp wording is data
 * behind the `subagents` condition; a harness that cannot steer named
 * subagents gets text that names no tool.
 */

const ROWS = "- epic `alpha` — agent `subarchitect`, name `epic-alpha`";

const OMP_BLOCK = `## Subarchitects in this session

The script hands each epic's consult to a named subarchitect. Launch every row below in this same session with the \`task\` tool: \`agent\` is \`subarchitect\`, \`name\` is exactly as given, and the task is one line — "Wait for the script's consult." Do not write an epic plan yourself and never rename a subarchitect; the script reaches it by that name.

On a later launch it was already launched and compacted: first send it \`write agent://<name>\` with "You were already launched; wait for the script's consult." If that reports no such agent, launch it with the task tool instead.

${ROWS}
`;

const OMP_AGENT = `---
name: subarchitect
description: "Subarchitect launched by the top architect; the script sends its consult over IRC."
tools: [read, grep, glob, edit, write, task, bash]
spawns: "scout,task"
---
You are a subarchitect of a software factory, launched as a named agent inside the top architect's session. The script sends your consult over IRC as a message: it names your epic, your plan, the parent plan, the intent, the context pack and the outcome path you must write. Do no planning or editing before it arrives.

Keep the turn alive until the consult arrives: run \`bash\` with a short \`sleep\`, and do not answer or yield early. A steer interrupts that sleep at your next step boundary. When the consult arrives, follow it exactly and edit only the plan it names as yours.

Prefix every scout and task name with the iteration the consult names, for example \`i3-scout-auth\`: a name a prior launch already owns fails with "already owned by another session generation".
`;

/** A backticked harness tool name the generic text must never carry. */
const TOOL_NAME = /`(task|bash|read|grep|glob|edit|write)`|agent:\/\//;

function library() {
  return loadPromptLibrary({ builtinDir: path.join(packageRoot, "prompts") });
}

describe("subarchitect prompts on a steering harness", () => {
  it("renders the omp launch block byte-identically", () => {
    expect(
      library().render("architect-subarchitects", {
        subarchitects: ROWS,
        subagents: "steer",
      }),
    ).toBe(OMP_BLOCK);
  });

  it("renders the omp agent definition byte-identically", () => {
    expect(library().render("subarchitect-agent", { subagents: "steer" })).toBe(
      OMP_AGENT,
    );
  });
});

describe("subarchitect prompts on any other harness", () => {
  for (const subagents of ["none", "spawn"]) {
    it(`names no tool and keeps the role when subagents is ${subagents}`, () => {
      const block = library().render("architect-subarchitects", {
        subarchitects: ROWS,
        subagents,
      });
      expect(block).not.toMatch(TOOL_NAME);
      expect(block).toContain(ROWS);
      expect(block).toContain("never rename a subarchitect");

      const agent = library().render("subarchitect-agent", { subagents });
      expect(agent).not.toMatch(TOOL_NAME);
      expect(agent).toContain(
        "You are a subarchitect of a software factory, launched as a named agent",
      );
      expect(agent).toContain("edit only the plan it names as yours");
    });

    it(`drops the omp-only launch and revive mechanics when subagents is ${subagents}`, () => {
      const block = library().render("architect-subarchitects", {
        subarchitects: ROWS,
        subagents,
      });
      expect(block).not.toContain("On a later launch");
      expect(block).toContain("as a subagent");
    });
  }
});

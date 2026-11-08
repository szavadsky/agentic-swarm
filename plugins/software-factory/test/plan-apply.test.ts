import { describe, expect, it } from "bun:test";
import yaml from "yaml";
import { applyEdits } from "../src/core/plan/apply.js";
import type { PlanArtifact, PlanEditsArtifact, AssignmentArtifact } from "../src/core/artifacts.js";

describe("plan/apply: applyEdits", () => {
  const plan: PlanArtifact = {
    iteration: 1,
    milestones: [
      { id: "m1", title: "Milestone 1" },
      { id: "m2", title: "Milestone 2" },
    ],
    itemOutlines: [
      {
        slug: "data-model",
        kind: "dev",
        title: "Define core data model",
        escalate: false,
      },
      {
        slug: "high-perf-kernel",
        kind: "dev",
        title: "Complex SIMD routine",
        escalate: true, // outline flagged for escalation
      },
    ],
    epics: [
      {
        slug: "auth-epic",
        intent: "# Epic Intent\nBuild OAuth2 and session handling subsystems.",
      },
    ],
  };

  it("produces atomic file set for initial edits (edits-1.yaml, assignments, epic intent)", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      items: [
        {
          slug: "data-model",
          kind: "dev",
          title: "Define core data model",
          assignment: "Implement schemas and migrations",
          outlineRef: "data-model",
          milestone: "m1",
          wave: 1,
          deps: [],
          scenarioRefs: ["Scenario: migrate cleanly"],
          citations: ["src/db/schema.ts:1-50"],
        },
        {
          slug: "high-perf-kernel",
          kind: "dev",
          title: "Complex SIMD routine",
          assignment: "Vectorize loop",
          outlineRef: "high-perf-kernel",
          milestone: "m1",
          wave: 2,
          deps: ["data-model"],
        },
        {
          slug: "auth-epic",
          kind: "epic",
          title: "Authentication subsystem",
          assignment: "Execute child auth epic",
          outlineRef: "auth-epic",
          milestone: "m2",
          wave: 2,
          deps: ["data-model"],
        },
      ],
    };

    const taskDir = ".factory/task-42";
    const result = applyEdits(edits, { taskDir, plan });

    expect(result.items).toEqual(["data-model", "high-perf-kernel", "auth-epic"]);
    expect(result.epics).toEqual(["auth-epic"]);

    // Verify files list
    const filePaths = result.files.map((f) => f.path);
    expect(filePaths).toContain(".factory/task-42/plan/edits-1.yaml");
    expect(filePaths).toContain(".factory/task-42/items/data-model/assignment.yaml");
    expect(filePaths).toContain(".factory/task-42/items/high-perf-kernel/assignment.yaml");
    expect(filePaths).toContain(".factory/task-42/items/auth-epic/assignment.yaml");
    expect(filePaths).toContain(".factory/task-42/auth-epic/INTENT.md");

    // Check edits file content
    const editsFile = result.files.find((f) => f.path === ".factory/task-42/plan/edits-1.yaml");
    expect(editsFile).toBeDefined();
    const parsedEdits = yaml.parse(editsFile!.content) as PlanEditsArtifact;
    expect(parsedEdits.iteration).toBe(1);
    expect(parsedEdits.items.length).toBe(3);

    // Check assignment content and escalate inheritance
    const normalAssignmentFile = result.files.find(
      (f) => f.path === ".factory/task-42/items/data-model/assignment.yaml"
    );
    const normalAssignment = yaml.parse(normalAssignmentFile!.content) as AssignmentArtifact;
    expect(normalAssignment.slug).toBe("data-model");
    expect(normalAssignment.citations).toEqual(["src/db/schema.ts:1-50"]);
    expect(normalAssignment.escalate).toBeUndefined(); // false was not inherited

    const escalatedAssignmentFile = result.files.find(
      (f) => f.path === ".factory/task-42/items/high-perf-kernel/assignment.yaml"
    );
    const escalatedAssignment = yaml.parse(escalatedAssignmentFile!.content) as AssignmentArtifact;
    expect(escalatedAssignment.slug).toBe("high-perf-kernel");
    expect(escalatedAssignment.escalate).toBe(true); // inherited from outline!

    // Check epic INTENT.md
    const epicIntentFile = result.files.find(
      (f) => f.path === ".factory/task-42/auth-epic/INTENT.md"
    );
    expect(epicIntentFile).toBeDefined();
    expect(epicIntentFile!.content).toContain("Build OAuth2 and session handling subsystems.");
  });

  it("produces edits-{N}.{k}.yaml for amended edits", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      amendmentIndex: 2,
      items: [
        {
          slug: "data-model",
          kind: "dev",
          title: "Define core data model",
          assignment: "Amended assignment",
          outlineRef: "data-model",
          milestone: "m1",
          wave: 1,
        },
      ],
    };
    const result = applyEdits(edits, { taskDir: "task-root", plan });
    const filePaths = result.files.map((f) => f.path);
    expect(filePaths).toContain("task-root/plan/edits-1.2.yaml");
  });

  it("emits supersede decisions for removeItemSlugs (amend path)", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      amendmentIndex: 1,
      items: [
        {
          slug: "fresh-1",
          kind: "dev",
          title: "Fresh",
          assignment: "Fresh work",
          outlineRef: "data-model",
          milestone: "m1",
          wave: 2,
        },
      ],
    };

    const result = applyEdits(edits, { taskDir: "task-root", plan, removeItemSlugs: ["stale-1", "stale-2"], nextDecisionSeq: 4 });
    const filePaths = result.files.map((f) => f.path);
    expect(filePaths).toContain("task-root/decisions/004-amend-remove-stale-1.yaml");
    expect(filePaths).toContain("task-root/decisions/005-amend-remove-stale-2.yaml");
    const decision = yaml.parse(result.files.find((f) => f.path.endsWith("amend-remove-stale-1.yaml"))!.content) as any;
    expect(decision.decision).toBe("split");
    expect(decision.item).toBe("stale-1");
    expect(decision.context).toBe("wave");
  });
});

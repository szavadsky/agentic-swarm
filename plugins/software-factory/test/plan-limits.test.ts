import { describe, expect, it } from "bun:test";
import { validatePlan, validateEdits, checkPlanCountLimits } from "../src/core/plan/limits.js";
import { buildPlanLimitsRepairFeedback, formatLimitViolationsVar } from "../src/core/flows/iteration.js";
import type { PlanArtifact, PlanEditsArtifact, PipelineLimits } from "../src/core/artifacts.js";

describe("plan/limits: validatePlan", () => {
  const defaultLimits: PipelineLimits = {
    maxMilestones: 8,
    maxItemsPerPlan: 50,
  };

  const defaultKinds = ["dev", "no-behavior", "test-only", "fact-finder", "poc", "test-assumptions", "simple"];

  it("accepts a well-formed root plan", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [
        {
          id: "m1",
          title: "Foundation",
          scenarios: ["Scenario: setup works"],
          directionalInterfaces: ["API contract"],
        },
      ],
      itemOutlines: [
        {
          slug: "core-schema",
          kind: "dev",
          title: "Implement core schema",
          milestoneId: "m1",
        },
      ],
      epics: [
        {
          slug: "auth-subsystem",
          intent: "Build complete auth subsystem",
        },
      ],
    };

    const errors = validatePlan(plan, {
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: [],
    });

    expect(errors).toEqual([]);
  });

  it("rejects plans exceeding maxMilestones limit", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: Array.from({ length: 9 }, (_, i) => ({
        id: `m${i + 1}`,
        title: `Milestone ${i + 1}`,
      })),
    };

    const errors = validatePlan(plan, {
      limits: { maxMilestones: 8 },
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: [],
    });

    expect(errors.some((e) => e.includes("exceeds maximum milestones limit"))).toBe(true);
  });

  it("rejects plans with duplicate milestone IDs", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [
        { id: "m1", title: "First" },
        { id: "m1", title: "Duplicate" },
      ],
    };

    const errors = validatePlan(plan, {
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: [],
    });

    expect(errors.some((e) => e.includes('Duplicate milestone id: "m1"'))).toBe(true);
  });

  it("rejects plans exceeding maxItemsPerPlan limit", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: Array.from({ length: 5 }, (_, i) => ({
        slug: `item-${i + 1}`,
        kind: "dev",
        title: `Item ${i + 1}`,
        milestoneId: "m1",
      })),
    };

    const errors = validatePlan(plan, {
      limits: { maxItemsPerPlan: 4 },
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: [],
    });

    expect(errors.some((e) => e.includes("exceeds maximum items limit"))).toBe(true);
  });

  it("rejects invalid and reserved slugs", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [
        {
          slug: "simple", // reserved
          kind: "dev",
          title: "Reserved slug",
        },
        {
          slug: "scratch", // reserved
          kind: "dev",
          title: "Reserved scratch slug",
        },
        {
          slug: "bad--slug", // double dash
          kind: "dev",
          title: "Double dash",
        },
        {
          slug: "UPPERCASE", // invalid characters
          kind: "dev",
          title: "Uppercase",
        },
      ],
    };

    const errors = validatePlan(plan, {
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: [],
    });

    expect(errors.some((e) => e.includes('Invalid outline slug "simple"'))).toBe(true);
    expect(errors.some((e) => e.includes('Invalid outline slug "bad--slug"'))).toBe(true);
    expect(errors.some((e) => e.includes('Invalid outline slug "UPPERCASE"'))).toBe(true);
  });

  it("rejects duplicate slugs and collisions with existing history", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [
        { slug: "task-item", kind: "dev", title: "First" },
        { slug: "task-item", kind: "dev", title: "Second duplicate" },
        { slug: "already-done", kind: "dev", title: "Third collision" },
      ],
    };

    const errors = validatePlan(plan, {
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: ["already-done"],
    });

    expect(errors.some((e) => e.includes('Duplicate item outline slug: "task-item"'))).toBe(true);
    expect(errors.some((e) => e.includes('Item slug "already-done" already exists in task history'))).toBe(true);
  });

  it("rejects dependency cycles and self-dependencies in outlines", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [
        { slug: "item-a", kind: "dev", title: "A", deps: ["item-b"] },
        { slug: "item-b", kind: "dev", title: "B", deps: ["item-c"] },
        { slug: "item-c", kind: "dev", title: "C", deps: ["item-a"] },
        { slug: "item-self", kind: "dev", title: "Self", deps: ["item-self"] },
      ],
    };

    const errors = validatePlan(plan, {
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: [],
    });

    expect(errors.some((e) => e.includes("Circular dependency detected"))).toBe(true);
    expect(errors.some((e) => e.includes('cannot depend on itself'))).toBe(true);
  });

  it("rejects epics in non-root tasks", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      epics: [
        {
          slug: "sub-epic",
          intent: "Nested epic not allowed",
        },
      ],
    };

    const errors = validatePlan(plan, {
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: false, // child task / epic
      existingItems: [],
    });

    expect(errors.some((e) => e.includes("Epics are only allowed in root task plans"))).toBe(true);
  });
});

describe("plan/limits: checkPlanCountLimits (§8.4.2a pre-check)", () => {
  const limits: PipelineLimits = { maxMilestones: 8, maxItemsPerPlan: 50 };

  it("passes a compliant plan", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [{ slug: "a", kind: "dev", title: "A", milestoneId: "m1" }],
    };
    expect(checkPlanCountLimits(plan, { limits })).toEqual([]);
  });

  it("flags milestone and item overages with validatePlan-identical messages", () => {
    const plan: PlanArtifact = {
      iteration: 5,
      milestones: Array.from({ length: 9 }, (_, i) => ({ id: `m${i + 1}`, title: `M${i + 1}` })),
      itemOutlines: Array.from({ length: 68 }, (_, i) => ({
        slug: `item-${i + 1}`,
        kind: "dev",
        title: `Item ${i + 1}`,
        milestoneId: "m1",
      })),
    };
    const errors = checkPlanCountLimits(plan, { limits });
    expect(errors.some((e) => e.includes("exceeds maximum milestones limit of 8 (got 9)"))).toBe(true);
    expect(errors.some((e) => e.includes("exceeds maximum items limit of 50 (got 68)"))).toBe(true);
    // Same wording as validatePlan so repair feedback names the live failure.
    const full = validatePlan(plan, { limits, kinds: ["dev"], isRootTask: true, existingItems: [] });
    for (const e of errors) {
      expect(full).toContain(e);
    }
  });

  it("adds existing history to the item total and tolerates empty plans", () => {
    const plan: PlanArtifact = {
      iteration: 2,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [{ slug: "n1", kind: "dev", title: "N1", milestoneId: "m1" }],
    };
    expect(checkPlanCountLimits(plan, { limits: { maxItemsPerPlan: 2 }, existingCount: 2 }).length).toBe(1);
    expect(checkPlanCountLimits(undefined as any, { limits })).toEqual([]);
  });

  it("repair feedback names counts and the remedy; violations var is none-when-clean", () => {
    const violations = ["Plan exceeds maximum items limit of 50 (got 68)"];
    const feedback = buildPlanLimitsRepairFeedback(violations);
    expect(feedback).toContain("got 68");
    expect(feedback).toContain("replanAfter");
    expect(feedback).toContain("do not just renumber");
    expect(formatLimitViolationsVar([])).toBe("none");
    const dirty = formatLimitViolationsVar(violations);
    expect(dirty).toContain("MUST emit a fix-disposition suggestion");
    expect(dirty).toContain("got 68");
  });
});

describe("plan/limits: validateEdits", () => {
  const defaultPlan: PlanArtifact = {
    iteration: 1,
    milestones: [{ id: "m1", title: "M1" }],
    itemOutlines: [
      { slug: "item-a", kind: "dev", title: "Item A" },
      { slug: "item-b", kind: "dev", title: "Item B" },
      { slug: "item-c", kind: "dev", title: "Item C" },
    ],
    epics: [{ slug: "my-epic", intent: "Build epic" }],
  };

  const defaultLimits: PipelineLimits = {
    maxMilestones: 8,
    maxItemsPerPlan: 50,
    maxAmendmentsPerIteration: 3,
  };

  const defaultKinds = ["dev", "no-behavior", "test-only", "fact-finder", "poc", "test-assumptions", "simple", "epic"];

  it("accepts valid edits artifact with sequential wave dependencies", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      items: [
        {
          slug: "item-a",
          kind: "dev",
          title: "Item A",
          assignment: "Implement feature A",
          outlineRef: "item-a",
          milestone: "m1",
          wave: 1,
        },
        {
          slug: "item-b",
          kind: "dev",
          title: "Item B",
          assignment: "Implement feature B depending on A",
          outlineRef: "item-b",
          milestone: "m1",
          wave: 2,
          deps: ["item-a"],
        },
      ],
    };

    const errors = validateEdits(edits, {
      plan: defaultPlan,
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existing: [],
    });

    expect(errors).toEqual([]);
  });

  it("rejects forward dependencies and intra-wave dependencies", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      items: [
        {
          slug: "item-a",
          kind: "dev",
          title: "Item A",
          assignment: "A",
          outlineRef: "item-a",
          milestone: "m1",
          wave: 1,
          deps: ["item-b"], // forward dependency on wave 2
        },
        {
          slug: "item-b",
          kind: "dev",
          title: "Item B",
          assignment: "B",
          outlineRef: "item-b",
          milestone: "m1",
          wave: 2,
        },
        {
          slug: "item-c",
          kind: "dev",
          title: "Item C",
          assignment: "C",
          outlineRef: "item-c",
          milestone: "m1",
          wave: 2,
          deps: ["item-b"], // intra-wave dependency (same wave 2)
        },
      ],
    };

    const errors = validateEdits(edits, {
      plan: defaultPlan,
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existing: [],
    });

    expect(errors.some((e) => e.includes('Dependency "item-b" (wave 2) must be in an earlier wave than item "item-a" (wave 1)'))).toBe(true);
    expect(errors.some((e) => e.includes('Dependency "item-b" (wave 2) must be in an earlier wave than item "item-c" (wave 2)'))).toBe(true);
  });

  it("rejects missing or invalid outlineRef", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      items: [
        {
          slug: "item-a",
          kind: "dev",
          title: "Item A",
          assignment: "A",
          outlineRef: "non-existent-outline",
          milestone: "m1",
          wave: 1,
        },
      ],
    };

    const errors = validateEdits(edits, {
      plan: defaultPlan,
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existing: [],
    });

    expect(errors.some((e) => e.includes('references unknown outlineRef "non-existent-outline"'))).toBe(true);
  });

  it("rejects duplicate slugs and collisions with existing history", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      items: [
        {
          slug: "item-a",
          kind: "dev",
          title: "Item A",
          assignment: "A",
          outlineRef: "item-a",
          milestone: "m1",
          wave: 1,
        },
        {
          slug: "item-a",
          kind: "dev",
          title: "Item A Duplicate",
          assignment: "A dup",
          outlineRef: "item-a",
          milestone: "m1",
          wave: 1,
        },
      ],
    };

    const errors = validateEdits(edits, {
      plan: defaultPlan,
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existing: [{ slug: "item-b", status: "done", wave: 1 }],
    });

    expect(errors.some((e) => e.includes('Duplicate item slug: "item-a"'))).toBe(true);
  });

  it("rejects amendment index exceeding maxAmendmentsPerIteration", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      amendmentIndex: 4, // limit is 3
      items: [
        {
          slug: "item-a",
          kind: "dev",
          title: "Item A",
          assignment: "A",
          outlineRef: "item-a",
          milestone: "m1",
          wave: 1,
        },
      ],
    };

    const errors = validateEdits(edits, {
      plan: defaultPlan,
      limits: { maxAmendmentsPerIteration: 3 },
      kinds: defaultKinds,
      isRootTask: true,
      existing: [],
    });

    expect(errors.some((e) => e.includes("exceeds maximum allowed amendments per iteration"))).toBe(true);
  });

  it("rejects epic items in non-root tasks", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      items: [
        {
          slug: "my-epic",
          kind: "epic",
          title: "Epic in child",
          assignment: "Run child epic",
          outlineRef: "my-epic",
          milestone: "m1",
          wave: 1,
        },
      ],
    };

    const errors = validateEdits(edits, {
      plan: defaultPlan,
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: false,
      existing: [],
    });

    expect(errors.some((e) => e.includes('Epic item "my-epic" is only allowed in root tasks'))).toBe(true);
  });

  it("accepts epic edits whose outlineRef names a plan.epics entry (plan also validates)", () => {
    // The shared fixture must be a plan validatePlan itself accepts:
    // epic slugs must NOT collide with item-outline slugs.
    const planErrors = validatePlan(defaultPlan, {
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: [],
    });
    expect(planErrors).toEqual([]);

    const edits: PlanEditsArtifact = {
      iteration: 1,
      items: [
        {
          slug: "my-epic",
          kind: "epic",
          title: "My Epic",
          assignment: "Run child epic",
          outlineRef: "my-epic",
          milestone: "m1",
          wave: 1,
        },
      ],
    };

    const errors = validateEdits(edits, {
      plan: defaultPlan,
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existing: [],
    });

    expect(errors).toEqual([]);
  });

  it("rejects epic edits whose outlineRef names no plan.epics entry", () => {
    const edits: PlanEditsArtifact = {
      iteration: 1,
      items: [
        {
          slug: "ghost-epic",
          kind: "epic",
          title: "Ghost epic",
          assignment: "Run child epic",
          outlineRef: "item-a", // an item outline, not a plan.epics entry
          milestone: "m1",
          wave: 1,
        },
      ],
    };

    const errors = validateEdits(edits, {
      plan: defaultPlan,
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existing: [],
    });

    expect(errors.some((e) => e.includes('Epic item "ghost-epic" references unknown epic "item-a"'))).toBe(true);
    expect(errors.some((e) => e.includes('has no corresponding epic definition in plan.epics'))).toBe(true);
  });

  it("rejects epic outline slugs colliding with item outlines in validatePlan", () => {
    const plan: PlanArtifact = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [{ slug: "my-epic", kind: "dev", title: "Outline" }],
      epics: [{ slug: "my-epic", intent: "Build epic" }],
    };

    const errors = validatePlan(plan, {
      limits: defaultLimits,
      kinds: defaultKinds,
      isRootTask: true,
      existingItems: [],
    });

    expect(errors.some((e) => e.includes('Duplicate slug "my-epic" (collides with item outline)'))).toBe(true);
  });
});

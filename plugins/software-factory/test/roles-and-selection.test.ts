import { describe, it, expect } from "bun:test";
import { resolveRole, resolveStepRole } from "../src/core/config/roles.js";
import type { RoleDefinition, FlowStep } from "../src/core/artifacts.js";

describe("Role resolution & step role selection (§5, §12.4)", () => {
  const rolesConfig: Record<string, RoleDefinition> = {
    workhorse: {
      model: "vendor/fast-v1",
      fallbacks: ["alt-workhorse", "vendor/cheap-v0"],
    },
    "alt-workhorse": {
      model: "vendor/spark-v2",
      fallbacks: ["workhorse"],
    },
    "task-reviewer": {
      alias: "alt-workhorse",
    },
    "task-escalation": {
      model: "vendor/reasoning-max",
    },
    architect: {
      model: "vendor/smart-v3",
      fallbacks: ["alt-architect"],
    },
    "alt-architect": {
      model: "vendor/spark-v2",
    },
    "cycle-a": { alias: "cycle-b" },
    "cycle-b": { alias: "cycle-c" },
    "cycle-c": { alias: "cycle-a" },
  };

  it("resolves alias chains and expands fallbacks in order with deduplication", () => {
    // task-reviewer -> alias alt-workhorse -> model vendor/spark-v2, fallback workhorse -> vendor/fast-v1, vendor/cheap-v0
    const resolved = resolveRole("task-reviewer", rolesConfig);

    expect(resolved.role).toBe("alt-workhorse");
    expect(resolved.models[0]).toBe("vendor/spark-v2"); // primary first
    expect(resolved.models).toContain("vendor/fast-v1");
    expect(resolved.models).toContain("vendor/cheap-v0");

    // Deduplication check: no duplicate models
    const unique = new Set(resolved.models);
    expect(resolved.models.length).toBe(unique.size);
  });

  it("throws descriptive error when an alias cycle is detected", () => {
    expect(() => resolveRole("cycle-a", rolesConfig)).toThrow(
      /Role alias cycle detected: cycle-a -> cycle-b -> cycle-c -> cycle-a/
    );
  });

  it("selects task-escalation for escalatable steps when task is escalated", () => {
    const escalatableStep: FlowStep = {
      id: "develop",
      agent: "developer",
      role: "workhorse",
      escalatable: true,
    };

    const regularStep: FlowStep = {
      id: "qa",
      agent: "qa",
      role: "task-reviewer",
      escalatable: false,
    };

    // When item is escalated
    const devEscalated = resolveStepRole({
      step: escalatableStep,
      isEscalated: true,
      rolesConfig,
    });
    expect(devEscalated.role).toBe("task-escalation");
    expect(devEscalated.models[0]).toBe("vendor/reasoning-max");

    // When item is NOT escalated
    const devNormal = resolveStepRole({
      step: escalatableStep,
      isEscalated: false,
      rolesConfig,
    });
    expect(devNormal.role).toBe("workhorse");
    expect(devNormal.models[0]).toBe("vendor/fast-v1");

    // Non-escalatable step stays on normal role even if item is escalated
    const qaRole = resolveStepRole({
      step: regularStep,
      isEscalated: true,
      rolesConfig,
    });
    expect(qaRole.role).toBe("alt-workhorse");
  });

  it("performs pair swap on retry (fixRound >= 2)", () => {
    const devStep: FlowStep = {
      id: "develop",
      agent: "developer",
      role: "workhorse",
      retryRole: "alt-workhorse",
    };

    const reviewerStep: FlowStep = {
      id: "review",
      agent: "reviewer",
      role: "task-reviewer", // alias alt-workhorse (same primary as dev's retryRole)
    };

    // Round 1: normal developer and reviewer roles
    const devRound1 = resolveStepRole({
      step: devStep,
      fixRound: 1,
      rolesConfig,
    });
    const revRound1 = resolveStepRole({
      step: reviewerStep,
      fixRound: 1,
      rolesConfig,
    });

    expect(devRound1.models[0]).toBe("vendor/fast-v1"); // workhorse
    expect(revRound1.models[0]).toBe("vendor/spark-v2"); // alt-workhorse (split)

    // Round 2: developer rotates to retryRole (alt-workhorse)
    const devRound2 = resolveStepRole({
      step: devStep,
      fixRound: 2,
      rolesConfig,
    });
    expect(devRound2.role).toBe("alt-workhorse");
    expect(devRound2.models[0]).toBe("vendor/spark-v2");

    // Reviewer shares primary model with developer's rotated role -> swaps to producer base role (workhorse)
    const revRound2 = resolveStepRole({
      step: reviewerStep,
      fixRound: 2,
      baseProducerRole: "workhorse",
      producerRetryRole: "alt-workhorse",
      rolesConfig,
    });
    expect(revRound2.role).toBe("workhorse");
    expect(revRound2.models[0]).toBe("vendor/fast-v1");
  });
});

import { describe, it, expect } from "bun:test";
import {
  validateSlug,
  assertValidSlug,
  taskBranch,
  childBranch,
  worktreePath,
  parseBranch,
} from "../src/core/git/naming.js";

describe("Git branch and worktree naming (§7, §8.6)", () => {
  it("validates slugs: alphanumeric with single hyphens, no double-hyphens or reserved words", () => {
    expect(validateSlug("my-task-1")).toBe(true);
    expect(validateSlug("feat")).toBe(true);

    // Invalid formats
    expect(validateSlug("MyTask")).toBe(false); // uppercase
    expect(validateSlug("task--sub")).toBe(false); // double hyphen
    expect(validateSlug("-leading")).toBe(false);
    expect(validateSlug("trailing-")).toBe(false);
    expect(validateSlug("spaces in slug")).toBe(false);

    // Reserved slugs "simple" and "scratch"
    expect(validateSlug("simple")).toBe(false);
    expect(validateSlug("simple", { allowReserved: true })).toBe(true);
    expect(validateSlug("scratch")).toBe(false);
    expect(validateSlug("scratch", { allowReserved: true })).toBe(true);

    expect(() => assertValidSlug("simple")).toThrow(/reserved/);
    expect(() => assertValidSlug("scratch")).toThrow(/reserved/);
    expect(() => assertValidSlug("Bad_Slug")).toThrow(/invalid/);
  });

  it("builds topic branch for root task", () => {
    expect(taskBranch("user-auth")).toBe("topic/user-auth");
  });

  it("builds child branch with '--' separator and tracks depth", () => {
    const root = taskBranch("auth");
    expect(root).toBe("topic/auth");
    expect(parseBranch(root)?.depth).toBe(0);

    const child = childBranch(root, "login-form");
    expect(child).toBe("topic/auth--login-form");
    expect(parseBranch(child)?.depth).toBe(1);

    const epicItem = childBranch(child, "submit-btn");
    expect(epicItem).toBe("topic/auth--login-form--submit-btn");
    expect(parseBranch(epicItem)?.depth).toBe(2);

    // Reject depth > 2
    expect(() => childBranch(epicItem, "too-deep")).toThrow(
      /max epic depth 2 exceeded/
    );

    // Rejects reserved slugs by default
    expect(() => childBranch(root, "simple")).toThrow(/reserved/);
    expect(() => childBranch(root, "scratch")).toThrow(/reserved/);

    // Accepts reserved slugs when allowReserved is true (scratch branch)
    const scratch = childBranch(root, "scratch", { allowReserved: true });
    expect(scratch).toBe("topic/auth--scratch");
    const simpleScratch = childBranch(root, "simple", { allowReserved: true });
    expect(simpleScratch).toBe("topic/auth--simple");
  });

  it("parses factory branches into task, items, and depth", () => {
    const parsedRoot = parseBranch("topic/core-engine");
    expect(parsedRoot).toEqual({
      task: "core-engine",
      items: [],
      depth: 0,
    });

    const parsedEpicItem = parseBranch("topic/core-engine--epic-1--step-a");
    expect(parsedEpicItem).toEqual({
      task: "core-engine",
      items: ["epic-1", "step-a"],
      depth: 2,
    });

    expect(parseBranch("main")).toBeNull();
    expect(parseBranch("feature/something")).toBeNull();
  });

  it("maps branch names to worktree folder paths replacing '/' with '_'", () => {
    const rootDir = "/tmp/factory-wt";
    expect(worktreePath(rootDir, "topic/user-auth")).toBe(
      "/tmp/factory-wt/topic_user-auth"
    );
    expect(worktreePath(rootDir, "topic/auth--epic-1--item-2")).toBe(
      "/tmp/factory-wt/topic_auth--epic-1--item-2"
    );
  });
});

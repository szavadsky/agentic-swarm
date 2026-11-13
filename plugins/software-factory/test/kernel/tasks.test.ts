import { describe, expect, it } from "bun:test";
import {
  doneWhen,
  isValidTaskSlug,
  materialHash,
  parseTaskFile,
  renderTaskFile,
  validateTaskGraph,
} from "../../src/kernel/tasks.js";
import { task } from "./helpers.js";

const TEXT = `---
slug: auth.token-refresh
title: Refresh tokens
kind: task
flow: implement-review
deps: [auth.session-store]
scope: [src/auth/**]
tier: default
source: Milestone auth / refresh
---

Why: rotate without a re-login.
Done when: refresh rotates the token.
`;

describe("task files", () => {
  it("parses and renders the frontmatter plus brief", () => {
    const parsed = parseTaskFile(TEXT, "auth.token-refresh");
    expect(parsed.slug).toBe("auth.token-refresh");
    expect(parsed.deps).toEqual(["auth.session-store"]);
    expect(parsed.scope).toEqual(["src/auth/**"]);
    expect(doneWhen(parsed.body)).toBe("Done when: refresh rotates the token.");
    const round = parseTaskFile(renderTaskFile(parsed), parsed.slug);
    expect(round).toEqual(parsed);
  });

  it("rejects a file whose declared slug disagrees with its name", () => {
    expect(() => parseTaskFile(TEXT, "other-slug")).toThrow(/slugs are immutable/);
  });

  it("hashes material fields, not cosmetic body prose", () => {
    const base = parseTaskFile(TEXT, "auth.token-refresh");
    const cosmetic = { ...base, body: `${base.body.replace(/\n/g, "  \n")}\n\nmore notes` };
    expect(materialHash(cosmetic)).toBe(materialHash(base));
    expect(materialHash({ ...base, deps: [] })).not.toBe(materialHash(base));
    expect(materialHash({ ...base, body: "Done when: something else" })).not.toBe(materialHash(base));
    expect(materialHash({ ...base, base: "auth.old" })).not.toBe(materialHash(base));
  });

  it("accepts namespaced slugs only", () => {
    expect(isValidTaskSlug("auth.token-refresh")).toBe(true);
    expect(isValidTaskSlug("a.b-c")).toBe(true);
    expect(isValidTaskSlug("Upper")).toBe(false);
    expect(isValidTaskSlug("a..b")).toBe(false);
  });

  it("finds missing deps, self deps, cycles, duplicates and bad bases", () => {
    const findings = validateTaskGraph(
      [
        task("a", { deps: ["b"] }),
        task("b", { deps: ["a"] }),
        task("c", { deps: ["missing"] }),
        task("d", { deps: ["d"] }),
        task("a"),
      ],
      { parked: new Set() }
    );
    expect(findings.some((f) => f.includes("cycle"))).toBe(true);
    expect(findings.some((f) => f.includes("missing task"))).toBe(true);
    expect(findings.some((f) => f.includes("itself"))).toBe(true);
    expect(findings.some((f) => f.includes("declared twice"))).toBe(true);
  });

  it("requires a base to name a parked task when a parked set is supplied", () => {
    const tasks = [task("old"), task("new", { base: "old" })];
    expect(validateTaskGraph(tasks, { parked: new Set() })).toContain(
      'task "new" continues "old", which is not parked'
    );
    expect(validateTaskGraph(tasks, { parked: new Set(["old"]) })).toEqual([]);
  });
});

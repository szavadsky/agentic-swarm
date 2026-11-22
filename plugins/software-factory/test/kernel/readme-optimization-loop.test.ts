import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const README = path.resolve(import.meta.dir, "../../README.md");

describe("README loop-based optimization section", () => {
  it("documents loop-based optimization with existing types, candidate spikes, architect selection, and cleanup tasks", () => {
    const content = fs.readFileSync(README, "utf8");
    const sectionIndex = content.indexOf("## Loop-based optimization");
    expect(sectionIndex).toBeGreaterThan(-1);

    const section = content.slice(sectionIndex);

    // Mentions existing / shipped task types
    expect(section).toMatch(/`spike`/);
    expect(section).toMatch(/`development`/);
    expect(section).toMatch(/`trivial`/);

    // Core concepts required by done-when
    expect(section.toLowerCase()).toContain("candidate spikes");
    expect(section.toLowerCase()).toContain("architect selection");
    expect(section.toLowerCase()).toContain("cleanup tasks");

    // Edges: no new keys or flows
    expect(section.toLowerCase()).toMatch(/no new (?:configuration )?keys/);
  });
});

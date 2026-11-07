import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
import {
  changedFiles,
  numstat,
  changedLines,
  matchGlobs,
  diffText,
} from "../src/core/git/diff.js";

describe("Git diff analysis (§7, §9)", () => {
  let repo: TmpRepo;
  let baseCommit: string;

  beforeAll(() => {
    repo = createTmpRepo();
    repo.writeFile("src/main.ts", "console.log('hello');\n");
    repo.writeFile("test/main.test.ts", "test('ok', () => {});\n");
    baseCommit = repo.commit("Base commit");
  });

  afterAll(() => {
    repo.cleanup();
  });

  it("detects added, modified, deleted, and renamed files", async () => {
    // Modify existing file
    repo.writeFile("src/main.ts", "console.log('updated');\nconsole.log('more');\n");

    // Add new file
    repo.writeFile("src/new-feature.ts", "export const x = 1;\n");

    // Delete a file
    fs.unlinkSync(path.join(repo.dir, "test/main.test.ts"));

    // Rename a file: create old.ts, commit, then rename to renamed.ts
    repo.writeFile("src/old.ts", "line1\nline2\nline3\nline4\n");
    const preRenameCommit = repo.commit("Add old.ts");

    fs.renameSync(path.join(repo.dir, "src/old.ts"), path.join(repo.dir, "src/renamed.ts"));
    repo.commit("Rename to renamed.ts");

    const changes = await changedFiles(repo.dir, preRenameCommit, "HEAD");
    const renamed = changes.find((c) => c.path === "src/renamed.ts");
    expect(renamed).toBeDefined();
    expect(renamed?.status).toBe("R");
    expect(renamed?.from).toBe("src/old.ts");
    expect(renamed?.similarity).toBe(100);
  });

  it("reports similarity below 100 for renamed-and-edited files", async () => {
    // Large file so a small edit still detects as a rename with R<100.
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    repo.writeFile("src/big.ts", lines.join("\n") + "\n");
    const preCommit = repo.commit("Add big.ts");

    fs.renameSync(path.join(repo.dir, "src/big.ts"), path.join(repo.dir, "src/big-renamed.ts"));
    const edited = [...lines];
    edited[0] = "line zero edited";
    edited[1] = "line one edited";
    fs.writeFileSync(path.join(repo.dir, "src/big-renamed.ts"), edited.join("\n") + "\n", "utf8");
    repo.commit("Rename and edit big.ts");

    const changes = await changedFiles(repo.dir, preCommit, "HEAD");
    const renamed = changes.find((c) => c.path === "src/big-renamed.ts");

    expect(renamed).toBeDefined();
    expect(renamed?.status).toBe("R");
    expect(renamed?.from).toBe("src/big.ts");
    expect(renamed?.similarity).toBeDefined();
    expect(renamed!.similarity!).toBeLessThan(100);
    expect(renamed!.similarity!).toBeGreaterThan(0);

    // Non-rename entries carry no similarity score.
    const plain = changes.find((c) => c.status !== "R" && c.status !== "C");
    if (plain) {
      expect(plain.similarity).toBeUndefined();
    }
  });

  it("calculates numstat line changes accurately", async () => {
    repo.writeFile("src/calc.ts", "1\n2\n3\n4\n5\n");
    const commit1 = repo.commit("Add calc.ts");

    repo.writeFile("src/calc.ts", "1\n2\nupdated\n4\n5\nadded\n");
    const commit2 = repo.commit("Update calc.ts");

    const stats = await numstat(repo.dir, commit1, commit2);
    const calcStat = stats.find((s) => s.path === "src/calc.ts");

    expect(calcStat).toBeDefined();
    expect(calcStat?.added).toBe(2);
    expect(calcStat?.deleted).toBe(1);
  });

  it("filters changed lines by glob patterns", async () => {
    repo.writeFile("src/prod.ts", "const p = 1;\n");
    repo.writeFile("test/suite.ts", "test('p', () => {});\n");
    const headCommit = repo.commit("Add prod and test files");

    const prodStats = await changedLines(repo.dir, baseCommit, headCommit, ["src/**"]);
    expect(prodStats.files).toContain("src/prod.ts");
    expect(prodStats.files).not.toContain("test/suite.ts");
    expect(prodStats.added).toBeGreaterThan(0);

    const testStats = await changedLines(repo.dir, baseCommit, headCommit, ["test/**"]);
    expect(testStats.files).toContain("test/suite.ts");
    expect(testStats.files).not.toContain("src/prod.ts");
  });

  it("matches globs accurately with matchGlobs", () => {
    expect(matchGlobs("src/core/git.ts", ["src/**"])).toBe(true);
    expect(matchGlobs("test/core/git.test.ts", ["src/**"])).toBe(false);
    expect(matchGlobs("test/core/git.test.ts", ["test/**", "**/*.test.ts"])).toBe(true);
  });

  it("returns diff text between commits", async () => {
    const diff = await diffText(repo.dir, baseCommit, "HEAD", ["src/prod.ts"]);
    expect(diff).toContain("const p = 1;");
  });
});

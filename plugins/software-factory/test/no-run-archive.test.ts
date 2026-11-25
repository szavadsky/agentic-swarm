import { expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const PACKAGE_ROOT = path.join(import.meta.dir, "..");

it("keeps no committed run archive under docs", () => {
  // The archive was raw agent I/O; any fixture a test reads lives in test/fixtures.
  expect(fs.existsSync(path.join(PACKAGE_ROOT, "docs/runs"))).toBe(false);
});

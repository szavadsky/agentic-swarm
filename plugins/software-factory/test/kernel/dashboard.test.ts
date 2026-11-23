import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { renderDashboard } from "../../src/kernel/dashboard.js";
import type { StatusDocument } from "../../src/kernel/status.js";

const FIXTURE = path.join(
  import.meta.dir,
  "..",
  "fixtures",
  "dashboard",
  "status.json",
);

function fixture(): StatusDocument {
  return JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as StatusDocument;
}

function emptySnapshot(): StatusDocument {
  return {
    goal: "blank",
    status: "active",
    iteration: 0,
    iterations: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    tasks: {
      open: [],
      merged: [],
      finished: [],
      parked: [],
      superseded: [],
      cancelled: [],
    },
    distance: { pending: [], parks: [], openDebt: [] },
    concerns: [],
    cost: {
      totalUsd: null,
      unpricedTurns: 0,
      perMergedTask: null,
      byRole: {},
      byModel: {},
    },
    work: {
      turns: 0,
      edits: 0,
      addedLines: 0,
      removedLines: 0,
      testRuns: 0,
      byRole: {},
      byModel: {},
    },
  };
}

describe("dashboard content", () => {
  it("renders a status.json fixture into the mechanical dashboard", () => {
    const html = renderDashboard(fixture());

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>demo-goal · Software Factory</title>");
    expect(html).toContain("badge goal-active");
    expect(html).toContain("iteration 2");
    expect(html).toContain("2026-02-03T04:05:06.000Z");
    expect(html).toContain("50%");
    expect(html).toContain("2 of 4 live tasks merged or finished");
    expect(html).toContain("1 cancelled");

    expect(html).toContain("Pending &lt;one&gt;");
    expect(html).toContain("Merge &amp; one");
    expect(html).toContain("badge badge-merged");
    expect(html).toContain("badge badge-parked");
    expect(html).toContain("abc123de");
    expect(html).toContain("core");
    expect(html).toContain("tools · 1 task");
    expect(html).toContain(
      "review-rejected: missing &#34;test&#34; &lt;coverage&gt;",
    );
    expect(html).toContain("Cache invalidation needs &lt;follow-up&gt;");

    expect(html).toContain("$0.60");
    expect(html).toContain("$0.60 per merged task");
    expect(html).toContain("1,350 tokens");
    expect(html).toContain("$0.10");
    expect(html).toContain("$0.50");
    expect(html).toContain("architect");
    expect(html).toContain("implementer");
  });
});

describe("dashboard escaping", () => {
  it("escapes an untrusted commit hash", () => {
    const doc = fixture();
    const merged = doc.tasks.merged[0];
    if (!merged) throw new Error("fixture has no merged task");
    merged.commit = '"><img src=x onerror=alert(1)>';

    const html = renderDashboard(doc);

    expect(html).toContain("&#34;&gt;&lt;img s");
    expect(html).not.toContain("<img");
  });
});

describe("dashboard links and empty states", () => {
  it("links every record and escapes agent text", () => {
    const html = renderDashboard(fixture());

    expect(html).toContain('href="records/00002-i1-merged1-implement-r1/"');
    expect(html).toContain('href="records/00003-i1-parked1-review-r2/"');
    expect(html).toContain('href="records/00001-i1-architect-r1/"');
    expect(html).toContain(
      "&lt;script&gt;alert(&#34;plan&#34;)&lt;/script&gt; &amp; owner must confirm",
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain('alert("plan")');
  });

  it("carries no external asset or network reference", () => {
    const html = renderDashboard(fixture());

    expect(html).not.toMatch(/\b(?:src|href)="(?:https?:)?\/\//);
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<script");
    expect(renderDashboard(fixture())).toBe(html);
  });

  it("renders an empty snapshot without unrendered placeholders", () => {
    const html = renderDashboard(emptySnapshot());

    expect(html).toContain("No tasks recorded yet.");
    expect(html).toContain("No task is waiting to start.");
    expect(html).toContain("No parked task.");
    expect(html).toContain("No open debt.");
    expect(html).toContain("No concerns recorded.");
    expect(html).toContain("n/a");
    expect(html).toContain("0%");
    expect(html).not.toContain("{{");
    expect(html).not.toContain("{%");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
  });
});

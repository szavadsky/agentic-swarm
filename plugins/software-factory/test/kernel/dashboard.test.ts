import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  DASHBOARD_ASSETS,
  renderDashboard,
} from "../../src/kernel/dashboard.js";
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
    summary: {
      source: "mechanical",
      text: "Goal active, iteration 0; no task recorded yet.",
      iteration: 0,
    },
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
    openConcerns: [],
    steers: [],
    cost: {
      harnessCostUsd: null,
      listCostUsd: null,
      unpricedTurns: 0,
      harnessCostPerMergedTask: null,
      listCostPerMergedTask: null,
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

/** The intent panel's markup, so a task count elsewhere cannot satisfy its assertions. */
function intentSection(html: string): string {
  const start = html.indexOf('id="intent"');
  const end = html.indexOf('id="tasks"');
  if (start < 0 || end < 0) throw new Error("intent or tasks section missing");
  return html.slice(start, end);
}

function chartData(html: string): unknown {
  const match = html.match(
    /<script id="intent-chart-data" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("intent chart data missing");
  return JSON.parse(match[1]!);
}

describe("dashboard content", () => {
  it("renders a status.json fixture into the mechanical dashboard", () => {
    const html = renderDashboard(fixture());

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>demo-goal · Software Factory</title>");
    expect(html).toContain("badge goal-active");
    expect(html).toContain("iteration 2");
    expect(html).toContain("2026-02-03T04:05:06.000Z");
    expect(html).toContain("1 cancelled");
    expect(html).toContain(
      "Iteration 2 wrote the remaining task files and parked one task for its reviewer.",
    );
    expect(html).toContain("PM summary, iteration 2");
    expect(html).toContain('href="records/00006-i2-pm-r1/"');

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

    expect(html).toContain(
      "<span>Harness-reported total</span><strong>$0.60</strong>",
    );
    expect(html).toContain(
      "<span>List-price estimate total</span><strong>$1.35</strong>",
    );
    expect(html).toContain(
      "<span>Harness-reported per merged task</span><strong>$0.60</strong>",
    );
    expect(html).toContain(
      "<span>List-price estimate per merged task</span><strong>$1.35</strong>",
    );
    expect(html).toContain("<strong>$0.60</strong> harness-reported");
    expect(html).toContain("<strong>$1.35</strong> list-price estimate");
    expect(html).toContain("1,350 tokens");
    expect(html).toContain("$0.10");
    expect(html).toContain("$0.50");
    expect(html).toContain("$1.20");
    expect(html).toContain("architect");
    expect(html).toContain("implementer");
  });
});

describe("dashboard intent artifact", () => {
  it("renders the architect's intent status per section, not a task ratio", () => {
    const html = renderDashboard(fixture());
    const intent = intentSection(html);

    expect(html).not.toContain("Intent completion");
    expect(intent).toContain("the architect's iteration 2 summary");
    expect(intent).toContain("Status reporting &lt;and&gt; dashboard");
    expect(intent).toContain("badge intent-works");
    expect(intent).toContain("badge intent-not-built");
    expect(intent).toContain("badge intent-friction");
    expect(intent).toContain("Sandbox");
    expect(intent).toContain("Steering");
    expect(intent).toContain("Debounce &lt;tuning&gt; still open");
    expect(intent).not.toContain("%");
    expect(intent).not.toContain("live tasks");
    expect(chartData(html)).toEqual({
      labels: ["Works", "Not built", "Friction"],
      counts: [1, 1, 1],
    });
  });
});

describe("dashboard intent status", () => {
  it("says the architect has not reported it instead of an unknown status", () => {
    const doc = fixture();
    delete doc.intentStatus;

    const html = renderDashboard(doc);
    const intent = intentSection(html);

    expect(intent).toContain("not reported");
    expect(intent).toContain("names its source");
    expect(intent).toContain("never falls back to task counts");
    expect(intent).not.toContain("unknown");
    expect(intent).not.toContain("%");
    expect(intent).not.toContain("Sandbox");
    expect(html).not.toContain("unknown");
    expect(html).not.toContain("intent-chart-data");
    expect(html).not.toContain("vendor/chart.umd.min.js");
  });

  it("says an architect artifact with no sections is not reported", () => {
    const doc = fixture();
    doc.intentStatus = { iteration: 2, sections: [] };

    const html = renderDashboard(doc);
    const intent = intentSection(html);

    expect(intent).toContain("not reported");
    expect(intent).toContain("iteration 2 summary lists no intent sections");
    expect(html).not.toContain("unknown");
    expect(html).not.toContain("intent-chart-data");
  });
});

describe("dashboard status summary", () => {
  it("shows the PM's summary with its record", () => {
    const html = renderDashboard(fixture());

    expect(html).toContain(
      '<p class="lead">Iteration 2 wrote the remaining task files and parked one task for its reviewer.</p>',
    );
    expect(html).toContain("PM summary, iteration 2");
    expect(html).toContain('href="records/00006-i2-pm-r1/"');
  });

  it("shows the kernel's mechanical account when no PM summary exists", () => {
    const doc = fixture();
    doc.summary = {
      source: "mechanical",
      text: "Goal active, iteration 2; 2 of 6 tasks landed, 1 open, 1 parked.",
      iteration: 2,
    };

    const html = renderDashboard(doc);

    expect(html).toContain(
      '<p class="lead">Goal active, iteration 2; 2 of 6 tasks landed, 1 open, 1 parked.</p>',
    );
    expect(html).toContain("kernel-derived mechanical status");
    expect(html).not.toContain("unknown");
  });

  it("escapes the PM's summary", () => {
    const doc = fixture();
    doc.summary = {
      source: "pm",
      text: '<img src=x onerror=alert(1)> wrote "tasks"',
      iteration: 2,
      record: "records/00006-i2-pm-r1",
    };

    const html = renderDashboard(doc);

    expect(html).toContain(
      "&lt;img src=x onerror=alert(1)&gt; wrote &#34;tasks&#34;",
    );
    expect(html).not.toContain("<img");
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

  it("escapes an intent section name and note", () => {
    const doc = fixture();
    doc.intentStatus = {
      iteration: 3,
      sections: [
        {
          section: '<script>alert("section")</script>',
          status: "friction",
          note: "<img src=x onerror=alert(1)>",
        },
      ],
    };

    const html = renderDashboard(doc);
    const intent = intentSection(html);

    expect(intent).toContain(
      "&lt;script&gt;alert(&#34;section&#34;)&lt;/script&gt;",
    );
    expect(intent).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(intent).not.toContain('<script>alert("section")');
    expect(intent).not.toContain("<img");
  });
});

describe("dashboard assets", () => {
  it("links only the local vendored assets", () => {
    const html = renderDashboard(fixture());
    const refs = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map(
      (match) => match[1]!,
    );

    expect(html).toContain(
      '<link rel="stylesheet" href="vendor/pico.min.css">',
    );
    expect(html).toContain('<script src="vendor/chart.umd.min.js"></script>');
    for (const ref of refs) {
      expect(ref).not.toMatch(/^(?:[a-z][a-z0-9+.-]*:)?\/\//i);
      expect(ref.startsWith("/")).toBe(false);
    }
    expect(refs).toEqual(
      expect.arrayContaining(DASHBOARD_ASSETS.map((asset) => asset.rel)),
    );
  });
});

describe("dashboard cost split", () => {
  it("renders n/a for a missing harness total and keeps the list estimate", () => {
    const doc = fixture();
    doc.cost.harnessCostUsd = null;

    const html = renderDashboard(doc);

    expect(html).toContain("<strong>n/a</strong> harness-reported");
    expect(html).toContain("<strong>$1.35</strong> list-price estimate");
  });

  it("renders n/a for a missing list total and keeps the harness total", () => {
    const doc = fixture();
    doc.cost.listCostUsd = null;

    const html = renderDashboard(doc);

    expect(html).toContain("<strong>$0.60</strong> harness-reported");
    expect(html).toContain("<strong>n/a</strong> list-price estimate");
  });

  it("renders n/a for a role row with no harness figure and shows its list figure", () => {
    const doc = fixture();
    const implementer = doc.cost.byRole.implementer;
    if (!implementer) throw new Error("fixture has no implementer cost");
    implementer.harnessCostUsd = null;

    const html = renderDashboard(doc);

    expect(html).toContain(
      '<tr><td>implementer</td><td class="num">1</td><td class="num">1,200</td><td class="num">n/a</td><td class="num">$1.20</td><td class="num">0</td></tr>',
    );
    expect(html).toContain(
      '<th scope="col" class="num">Harness-reported</th><th scope="col" class="num">List-price estimate</th>',
    );
    expect(html).not.toContain("exact");
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
    expect(html).not.toContain('<script>alert("plan")');
    expect(html).not.toContain("alert(1)");
  });

  it("is deterministic", () => {
    const html = renderDashboard(fixture());

    expect(renderDashboard(fixture())).toBe(html);
  });

  it("renders an empty snapshot without unrendered placeholders", () => {
    const html = renderDashboard(emptySnapshot());

    expect(html).toContain("no task recorded yet");
    expect(html).toContain("not reported");
    expect(html).not.toContain("unknown");
    expect(html).toContain("No tasks recorded yet.");
    expect(html).toContain("No task is waiting to start.");
    expect(html).toContain("No parked task.");
    expect(html).toContain("No open debt.");
    expect(html).toContain("No open concerns.");
    expect(html).toContain("No steer in the mailbox.");
    expect(html).toContain("n/a");
    expect(html).not.toContain("Latest launch log");
    expect(html).not.toContain("{{");
    expect(html).not.toContain("{%");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
  });
});

// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { derive } from "../../src/kernel/derive.js";
import { statusForIteration } from "../../src/kernel/launch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { rec, script, task, cause } from "./helpers.js";

describe("iteration summary", () => {
  it("is derived from records: decision, debt, parked root causes, owner attention, metrics", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-summary-"));
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      await postSteer(store, "s9", "Do we still support node 18?");

      const tasks = [
        task("merged1"),
        task("parked1"),
        task("pending1", { deps: ["parked1"] }),
      ];
      const records = [
        rec(1, {
          step: "architect",
          outcome: {
            status: "done",
            summary: "the goal is met",
            concerns: [
              {
                kind: "choice",
                calibration: "architect",
                text: "kept the old storage format",
              },
              {
                kind: "uncertainty",
                calibration: "owner",
                text: "confirm the public API is now frozen",
              },
            ],
            forward: [
              "debt closed: removed the compatibility shim",
              "debt closed: cache invalidation needs a follow-up",
              "steer s9: yes, drop it",
            ],
            decision: "done",
          },
        }),
        script(2, { slug: "merged1", step: "merge", ok: true }),
        script(3, {
          slug: "parked1",
          step: "park",
          ok: true,
          cause: cause("review rejected: missing test"),
        }),
        rec(4, {
          slug: "merged1",
          step: "review",
          outcome: {
            status: "done",
            summary: "approved with a debt note",
            concerns: [
              {
                kind: "debt",
                calibration: "architect",
                text: "cache invalidation needs a follow-up",
              },
            ],
            forward: [],
            verdict: "approve",
          },
        }),
      ];
      const state = derive(tasks, records);
      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        decision: "done",
      });
      expect(rel).toBe("iterations/1/summary.md");
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      const outbox = fs.readFileSync(
        path.join(store.goalDir, "mailbox/outbox/iteration-1-summary.md"),
        "utf8",
      );
      expect(outbox).toBe(`${rel}\n`);

      expect(text).toContain("status: goal-met");
      expect(text).toContain("decision: done");
      expect(text).toContain("architect: the goal is met");
      expect(text).toContain("kept the old storage format");
      expect(text).toContain("## Parked by root cause");
      expect(text).toContain("- review-rejected\n  - parked1: missing test");
      expect(text).toContain("parked1");
      expect(text).toContain("- pending: pending1");
      expect(text).toContain("cache invalidation needs a follow-up");
      expect(text).toContain("## Debt closed");
      expect(text).toContain("removed the compatibility shim");
      expect(text).toContain("confirm the public API is now frozen");
      expect(text).toContain("steer s9 is still in mailbox/inbox/s9.md");
      expect(text).toContain("## Metrics");
      expect(text).toContain("turns:");
      expect(text).toContain("merged: 1; parked: 1; pending: 1");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("counts the architect's plan-review marks", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-summary-marks-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const records = [
        rec(1, {
          step: "architect",
          outcome: {
            status: "done",
            summary: "returned on the findings",
            concerns: [],
            forward: [],
            planReviewMarks: [
              { finding: 1, mark: "helpful" },
              { finding: 2, mark: "helpful" },
              { finding: 3, mark: "unhelpful" },
            ],
          },
        }),
      ];
      const state = derive([], records);
      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        decision: "continue",
      });
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(text).toContain("- plan-review marks: 2 helpful, 1 unhelpful");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("names a quarantined task file in the outcome and remarkable", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-summary-quarantine-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const tasks = [task("alpha")];
      const records = [
        script(1, {
          iteration: 1,
          slug: "broken",
          step: "task-quarantine",
          ok: false,
          cause: cause(
            'task file "broken.md" quarantined at tasks/quarantine/broken.md: no frontmatter',
          ),
        }),
      ];
      const state = derive(tasks, records);
      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        decision: "continue",
      });
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(text).toContain("- quarantined: broken");
      expect(text).toContain(
        'task-quarantine: quarantine: task file "broken.md" quarantined at',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("opens with the distance: pending, parks, open debt", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-summary-distance-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const tasks = [task("parked1"), task("pending1")];
      const records = [
        script(1, {
          slug: "parked1",
          step: "park",
          ok: true,
          cause: cause("review rejected: missing test"),
        }),
        rec(2, {
          slug: "pending1",
          step: "review",
          outcome: {
            status: "done",
            summary: "approved with debt",
            concerns: [
              {
                kind: "debt",
                calibration: "architect",
                text: "cache invalidation needs a follow-up task",
              },
            ],
            forward: [],
            verdict: "approve",
          },
        }),
      ];
      const state = derive(tasks, records);
      await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const text = fs.readFileSync(
        path.join(store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      const distanceAt = text.indexOf("## Distance");
      const architectAt = text.indexOf("## Architect");
      expect(distanceAt).toBeGreaterThan(-1);
      expect(distanceAt).toBeLessThan(architectAt);
      expect(text).toContain("- pending (1): pending1");
      expect(text).toContain("- parks (1): parked1");
      expect(text).toContain("- open debt (1):");
      expect(text).toContain("cache invalidation needs a follow-up task");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("keeps the distance on open material debt only and records an id closure", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-summary-debt-closed-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const tasks = [task("open1")];
      const records = [
        rec(1, {
          slug: "open1",
          step: "review",
          outcome: {
            status: "done",
            summary: "approved with debt",
            concerns: [
              {
                kind: "debt",
                calibration: "architect",
                text: "retry window drops head names",
                id: "00001#1",
              },
              {
                kind: "debt",
                calibration: "fyi",
                text: "nit: rename the helper",
                id: "00001#2",
              },
            ],
            forward: [],
            verdict: "approve",
          },
        }),
        rec(2, {
          slug: undefined,
          step: "architect",
          outcome: {
            status: "done",
            summary: "closed the retry debt",
            concerns: [],
            forward: [],
            debtClosed: [
              { id: "00001#1", reason: "head names reconciled at the writer" },
            ],
            decision: "continue",
          },
        }),
      ];
      const state = derive(tasks, records);
      await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const text = fs.readFileSync(
        path.join(store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      // The material debt is closed; the open fyi note is not distance.
      const distance = text.slice(
        text.indexOf("## Distance"),
        text.indexOf("## Architect"),
      );
      expect(distance).toContain("- open debt (0): none");
      expect(distance).not.toContain("retry window drops head names");
      expect(distance).not.toContain("nit: rename the helper");
      expect(text).toContain(
        "## Debt closed\n- 00001#1: head names reconciled at the writer",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("lists parks of its own iteration while the distance keeps the total", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-summary-parks-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const tasks = [task("old-park"), task("new-park")];
      const records = [
        script(1, {
          iteration: 1,
          slug: "old-park",
          step: "park",
          ok: true,
          cause: cause("round limit reached"),
        }),
        script(2, {
          iteration: 2,
          slug: "new-park",
          step: "park",
          ok: true,
          cause: cause("review rejected: missing test"),
        }),
      ];
      const state = derive(tasks, records);
      await writeIterationSummary(store, {
        iteration: 2,
        state,
        records,
        status: "in-progress",
      });
      const text = fs.readFileSync(
        path.join(store.goalDir, "iterations/2/summary.md"),
        "utf8",
      );
      const parkedSection = text.slice(text.indexOf("## Parked by root cause"));
      expect(parkedSection).toContain("new-park");
      expect(parkedSection).not.toContain("old-park");
      expect(text).toContain("- parks (2): new-park, old-park");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("derives the status from the launch result, not the decision", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-summary-status-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const tasks = [task("a")];
      const state = derive(tasks, []);
      await writeIterationSummary(store, {
        iteration: 1,
        state,
        records: [],
        decision: "done",
        status: "in-progress",
      });
      const refused = fs.readFileSync(
        path.join(store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(refused).toContain("status: in-progress");
      expect(refused).toContain("decision: done");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("maps a refused done to in-progress and infra to stopped-with-debt", () => {
    expect(
      statusForIteration({
        decision: "done",
        ended: undefined,
        stopped: false,
        signalsStopped: false,
        goal: "active",
      }),
    ).toBe("in-progress");
    expect(
      statusForIteration({
        decision: "done",
        ended: undefined,
        stopped: false,
        signalsStopped: false,
        goal: "done",
      }),
    ).toBe("goal-met");
    expect(
      statusForIteration({
        decision: "continue",
        ended: "infra",
        stopped: true,
        signalsStopped: false,
        goal: "active",
      }),
    ).toBe("stopped-with-debt");
    expect(
      statusForIteration({
        decision: "continue",
        ended: undefined,
        stopped: false,
        signalsStopped: false,
        goal: "blocked",
      }),
    ).toBe("stopped-with-debt");
  });
});

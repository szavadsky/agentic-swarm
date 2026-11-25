import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  existingPlans,
  formatPlanDiff,
  formatPlanList,
  goalPlan,
  isPlanPath,
  registeredPlans,
  resolvePlan,
} from "../../src/kernel/plan-file.js";

const REGISTER = [
  "# Goal plan",
  "",
  "## Architect register",
  "",
  "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i2 | active",
  "- epic `billing` | architect `main` | plan `plan.md` | scope `src/billing/**` | opened i3 | active",
  "- epic `search` | architect `subarchitect` | plan `epics/search.md` | scope `src/search/**` | opened i1 | closed i4: folded into `auth`",
  "",
  "## Work",
  "",
  "- goal.docs — Document the goal.",
  "",
].join("\n");

function goalDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "plan-file-"));
}

describe("plan resolver", () => {
  it("maps the goal and an epic to their plan files", () => {
    const dir = goalDir();
    try {
      expect(resolvePlan(dir, { kind: "goal" })).toEqual({
        scope: { kind: "goal" },
        rel: "plan.md",
        path: path.join(dir, "plan.md"),
      });
      expect(resolvePlan(dir, { kind: "epic", epic: "auth" })).toEqual({
        scope: { kind: "epic", epic: "auth" },
        rel: "epics/auth.md",
        path: path.join(dir, "epics/auth.md"),
      });
      expect(goalPlan(dir).rel).toBe("plan.md");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("registered plans", () => {
  it("lists the goal plan and every active subarchitect plan once", () => {
    const dir = goalDir();
    try {
      fs.writeFileSync(path.join(dir, "plan.md"), REGISTER, "utf8");
      const plans = registeredPlans(dir);
      expect(plans.map((plan) => plan.rel)).toEqual([
        "plan.md",
        "epics/auth.md",
      ]);
      // A main-owned epic plans in `plan.md`; a closed epic is history.
      expect(plans.some((plan) => plan.rel === "epics/billing.md")).toBe(false);
      expect(plans.some((plan) => plan.rel === "epics/search.md")).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("has one plan when the goal plan is absent or carries no register", () => {
    const dir = goalDir();
    try {
      expect(registeredPlans(dir).map((plan) => plan.rel)).toEqual(["plan.md"]);
      fs.writeFileSync(path.join(dir, "plan.md"), "# Plan\n\n- a — A.\n");
      expect(registeredPlans(dir).map((plan) => plan.rel)).toEqual(["plan.md"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("canonicalizes an epic plan path from its epic id", () => {
    const dir = goalDir();
    try {
      fs.writeFileSync(
        path.join(dir, "plan.md"),
        "# Plan\n\n## Architect register\n\n- epic `auth` | architect `subarchitect` | plan `elsewhere/auth.md` | scope `src/auth/**` | opened i1 | active\n",
      );
      expect(registeredPlans(dir).map((plan) => plan.rel)).toEqual([
        "plan.md",
        "epics/auth.md",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("plan list", () => {
  it("filters plans by existence and formats them for a prompt", () => {
    const dir = goalDir();
    try {
      const plans = [
        resolvePlan(dir, { kind: "goal" }),
        resolvePlan(dir, { kind: "epic", epic: "auth" }),
      ];
      fs.mkdirSync(path.join(dir, "epics"));
      fs.writeFileSync(plans[0]!.path, "# Plan\n");
      expect(existingPlans(plans).map((plan) => plan.rel)).toEqual(["plan.md"]);
      expect(formatPlanList(plans)).toBe(
        `- goal: ${plans[0]!.path}\n  - epic \`auth\`: ${plans[1]!.path}`,
      );
      expect(formatPlanList([])).toBe("- none");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recognizes goal and epic plan paths, not a lookalike", () => {
    expect(isPlanPath("plan.md")).toBe(true);
    expect(isPlanPath("epics/auth.md")).toBe(true);
    expect(isPlanPath("epics/auth/plan.md")).toBe(false);
    expect(isPlanPath("tasks/plan.md")).toBe(false);
  });
});

describe("plan diff", () => {
  it("carries none on the first derived plan and states an unchanged plan", () => {
    const plan = {
      rel: "plan.md",
      text: "# Plan\n\n- alpha — Create alpha.\n",
    };
    expect(formatPlanDiff([plan], null)).toBe("none");
    expect(formatPlanDiff([plan], [plan])).toBe("empty (unchanged)");
  });

  it("keys added, changed and cancelled bullets by task slug", () => {
    const previous = {
      rel: "plan.md",
      text: "# Plan\n\n- alpha — Alpha v1.\n- gamma — Gamma.\n",
    };
    const current = {
      rel: "plan.md",
      text: "# Plan\n\n- alpha — Alpha v2.\n- beta — Beta new.\ncancelled: gamma — obsolete\n",
    };
    const diff = formatPlanDiff([current], [previous]);
    expect(diff).toContain("added:\n  - beta — Beta new.");
    expect(diff).toContain("changed:\n  - alpha — Alpha v2.");
    expect(diff).toContain("cancelled:\n  - gamma — obsolete");
  });

  it("reports a bullet removed without a cancellation line as cancelled", () => {
    const diff = formatPlanDiff(
      [{ rel: "plan.md", text: "# Plan\n\n- alpha — Alpha.\n" }],
      [
        {
          rel: "plan.md",
          text: "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
        },
      ],
    );
    expect(diff).toContain("cancelled:\n  - beta — removed");
  });

  it("reports a bullet without a slug by its heading, not dropped", () => {
    const previous = {
      rel: "plan.md",
      text: "# Plan\n\n## Section One\n- alpha — Alpha.\n",
    };
    const current = {
      rel: "plan.md",
      text: "# Plan\n\n## Section One\n- alpha — Alpha.\n- Do something without a slug.\n",
    };
    const diff = formatPlanDiff([current], [previous]);
    expect(diff).toContain(
      'added:\n  - heading "Section One": - Do something without a slug.',
    );
  });
});

describe("plan diff across plans", () => {
  it("keys one slug across plans and reports a plan's removed bullet", () => {
    const previous = [
      { rel: "plan.md", text: "# Plan\n\n- alpha — Alpha.\n" },
      { rel: "epics/auth.md", text: "# Auth\n\n- beta — Beta.\n" },
    ];
    const current = [
      { rel: "plan.md", text: "# Plan\n" },
      {
        rel: "epics/auth.md",
        text: "# Auth\n\n- alpha — Alpha moved here.\n",
      },
    ];
    const diff = formatPlanDiff(current, previous);
    expect(diff).toContain("changed:\n  - alpha — Alpha moved here.");
    expect(diff).toContain("cancelled:\n  - beta — removed");
  });
});

import { describe, expect, it } from "bun:test";
import {
  parseArchitectRegister,
  type RegisterContext,
} from "../../src/kernel/register.js";

const EXAMPLE = `# Plan

## Architect register

<!-- one bullet per epic; append and close, never delete or rename -->

- epic \`auth\` | architect \`subarchitect\` | plan \`epics/auth.md\` | scope \`src/auth/**\` | opened i7 | active
- epic \`billing\` | architect \`main\` | plan \`plan.md\` | scope \`src/billing/**\` | opened i8 | active
- epic \`search\` | architect \`subarchitect\` | plan \`epics/search.md\` | scope \`src/search/**\` | opened i4 | closed i6: folded into \`auth\`

## Milestones
`;

function register(...rows: string[]): string {
  return [
    "# Plan",
    "",
    "## Architect register",
    "",
    ...rows,
    "",
    "## Next",
    "",
  ].join("\n");
}

function ctx(patch: Partial<RegisterContext> = {}): RegisterContext {
  return { depth: 2, tasks: [], exists: () => true, ...patch };
}

describe("architect register", () => {
  it("parses §2's example to three rows", () => {
    const parsed = parseArchitectRegister(EXAMPLE, ctx());
    expect(parsed.findings).toEqual([]);
    expect(parsed.epics).toEqual([
      {
        epic: "auth",
        architect: "subarchitect",
        plan: "epics/auth.md",
        scope: "src/auth/**",
        opened: 7,
      },
      {
        epic: "billing",
        architect: "main",
        plan: "plan.md",
        scope: "src/billing/**",
        opened: 8,
      },
      {
        epic: "search",
        architect: "subarchitect",
        plan: "epics/search.md",
        scope: "src/search/**",
        opened: 4,
        closed: { iteration: 6, reason: "folded into `auth`" },
      },
    ]);
  });

  it("returns no rows and no findings when the plan has no register heading", () => {
    const parsed = parseArchitectRegister(
      "# Plan\n\n## Milestones\n\n- a task\n- another\n",
      ctx({ tasks: [{ slug: "auth.login", epic: "auth" }] }),
    );
    expect(parsed).toEqual({ epics: [], findings: [] });
  });

  it("keeps closed rows as history", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `old` | architect `main` | plan `plan.md` | scope `src/old/**` | opened i1 | closed i3: served its purpose",
      ),
      ctx({ exists: () => false }),
    );
    expect(parsed.findings).toEqual([]);
    expect(parsed.epics[0]?.closed).toEqual({
      iteration: 3,
      reason: "served its purpose",
    });
  });

  it("finds an active subarchitect row at depth 1", () => {
    const parsed = parseArchitectRegister(EXAMPLE, ctx({ depth: 1 }));
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatch(/subarchitect/);
    expect(parsed.findings[0]).toMatch(/depth 2/);
  });

  it("tolerates main rows and closed subarchitect rows at depth 1", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `billing` | architect `main` | plan `plan.md` | scope `src/billing/**` | opened i8 | active",
        "- epic `search` | architect `subarchitect` | plan `epics/search.md` | scope `src/search/**` | opened i4 | closed i6: folded into `auth`",
      ),
      ctx({ depth: 1, exists: () => false }),
    );
    expect(parsed.findings).toEqual([]);
  });

  it("reports an unparsable row without discarding the rest", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active",
        "- epic auth, architect subarchitect, plan epics/auth.md",
        "- epic `billing` | architect `main` | plan `plan.md` | scope `src/billing/**` | opened i8 | active",
      ),
      ctx(),
    );
    expect(parsed.epics.map((row) => row.epic)).toEqual(["auth", "billing"]);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatch(/cannot be parsed/);
  });

  it("requires the grammar's architect, plan and close reason", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `auth` | architect `boss` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active",
        "- epic `auth` | architect `subarchitect` | plan `plan.md` | scope `src/auth/**` | opened i7 | active",
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | closed i6:",
      ),
      ctx(),
    );
    expect(parsed.epics.map((row) => row.plan)).toEqual(["plan.md"]);
    expect(parsed.findings.join("\n")).toMatch(/architect "boss"/);
    expect(parsed.findings.join("\n")).toMatch(
      /must be "epics\/auth\.md", not "plan.md"/,
    );
    expect(parsed.findings.join("\n")).toMatch(/cannot be parsed/);
  });

  it("requires exactly epics/<epic>.md for a subarchitect row", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `auth` | architect `subarchitect` | plan `epics/other.md` | scope `src/auth/**` | opened i7 | active",
        "- epic `billing` | architect `subarchitect` | plan `src/billing/billing.ts` | scope `src/billing/**` | opened i8 | active",
      ),
      ctx(),
    );
    expect(parsed.epics).toHaveLength(2);
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings.join("\n")).toMatch(
      /epic "auth" is owned by a subarchitect; its plan must be "epics\/auth\.md", not "epics\/other\.md"/,
    );
    expect(parsed.findings.join("\n")).toMatch(
      /epic "billing" is owned by a subarchitect; its plan must be "epics\/billing\.md", not "src\/billing\/billing\.ts"/,
    );
  });

  it("requires exactly plan.md for a main row", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `billing` | architect `main` | plan `epics/billing.md` | scope `src/billing/**` | opened i8 | active",
        "- epic `search` | architect `main` | plan `src/search/search.ts` | scope `src/search/**` | opened i9 | active",
      ),
      ctx(),
    );
    expect(parsed.epics).toHaveLength(2);
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings.join("\n")).toMatch(
      /epic "billing" is owned by the main architect; its plan must be "plan\.md", not "epics\/billing\.md"/,
    );
    expect(parsed.findings.join("\n")).toMatch(
      /epic "search" is owned by the main architect; its plan must be "plan\.md", not "src\/search\/search\.ts"/,
    );
  });

  it("reports an active plan that does not exist, not a closed one", () => {
    const seen: string[] = [];
    const parsed = parseArchitectRegister(EXAMPLE, {
      depth: 2,
      tasks: [],
      exists: (rel) => {
        seen.push(rel);
        return rel !== "epics/auth.md";
      },
    });
    expect(seen).toContain("plan.md");
    expect(seen).not.toContain("epics/search.md");
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatch(/epics\/auth\.md/);
    expect(parsed.findings[0]).toMatch(/does not exist/);
  });

  it("rejects absolute and parent-escaping plans without touching the disk", () => {
    const seen: string[] = [];
    const parsed = parseArchitectRegister(
      register(
        "- epic `auth` | architect `subarchitect` | plan `/srv/plans/auth.md` | scope `src/auth/**` | opened i7 | active",
        "- epic `billing` | architect `main` | plan `../billing.md` | scope `src/billing/**` | opened i8 | active",
        "- epic `search` | architect `subarchitect` | plan `epics/search.md` | scope `src/search/**` | opened i4 | active",
      ),
      {
        depth: 2,
        tasks: [],
        exists: (rel) => {
          seen.push(rel);
          return true;
        },
      },
    );
    expect(seen).toEqual(["epics/search.md"]);
    expect(parsed.findings.join("\n")).toMatch(/absolute/);
    expect(parsed.findings.join("\n")).toMatch(/escapes the goal directory/);
  });

  it("requires a relative scope glob", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `/src/auth/**` | opened i7 | active",
        "- epic `billing` | architect `main` | plan `plan.md` | scope `../billing/**` | opened i8 | active",
      ),
      ctx(),
    );
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings.join("\n")).toMatch(/scope/);
  });

  it("reports duplicate active epics", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active",
        "- epic `auth` | architect `main` | plan `plan.md` | scope `src/auth/**` | opened i8 | active",
      ),
      ctx(),
    );
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatch(/duplicate active epic "auth"/);
  });

  it("reports a closed name that is reopened by an active row", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i2 | closed i4: served its purpose",
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active",
      ),
      ctx(),
    );
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatch(/appears in 2 rows/);
    expect(parsed.findings[0]).toMatch(/a closed name is never reopened/);
  });

  it("reports two closed rows with the same name", () => {
    const parsed = parseArchitectRegister(
      register(
        "- epic `auth` | architect `main` | plan `plan.md` | scope `src/auth/**` | opened i2 | closed i4: served its purpose",
        "- epic `auth` | architect `main` | plan `plan.md` | scope `src/auth/**` | opened i5 | closed i6: again",
      ),
      ctx(),
    );
    expect(parsed.epics).toHaveLength(2);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatch(/a closed name is never reopened/);
  });

  it("resolves a task against the active row regardless of row order", () => {
    const active =
      "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active";
    const closed =
      "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i2 | closed i4: served its purpose";
    for (const rows of [
      [active, closed],
      [closed, active],
    ]) {
      const parsed = parseArchitectRegister(
        register(...rows),
        ctx({ tasks: [{ slug: "auth.login", epic: "auth" }] }),
      );
      expect(parsed.findings).toHaveLength(1);
      expect(parsed.findings[0]).toMatch(/a closed name is never reopened/);
    }
  });

  it("reports tasks naming an unknown or closed epic", () => {
    const parsed = parseArchitectRegister(
      EXAMPLE,
      ctx({
        tasks: [
          { slug: "auth.login", epic: "auth" },
          { slug: "billing.invoice", epic: "billing" },
          { slug: "ghost.haunt", epic: "ghost" },
          { slug: "search.reindex", epic: "search" },
          { slug: "goal-only" },
        ],
      }),
    );
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings.join("\n")).toMatch(
      /task "ghost.haunt" names unknown epic "ghost"/,
    );
    expect(parsed.findings.join("\n")).toMatch(
      /task "search.reindex" names closed epic "search"/,
    );
  });

  it("ignores prose and comments under the heading", () => {
    const parsed = parseArchitectRegister(
      [
        "## Architect register",
        "",
        "The architect appends rows; it never deletes them.",
        "<!-- a comment -->",
        "",
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active",
        "",
      ].join("\n"),
      ctx(),
    );
    expect(parsed.findings).toEqual([]);
    expect(parsed.epics).toHaveLength(1);
  });

  it("ignores rows inside a fenced example", () => {
    const parsed = parseArchitectRegister(
      [
        "## Architect register",
        "",
        "```markdown",
        "- epic `ghost` | architect `main` | plan `plan.md` | scope `src/ghost/**` | opened i1 | active",
        "```",
        "",
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active",
        "",
        "## Next",
        "",
      ].join("\n"),
      ctx(),
    );
    expect(parsed.epics.map((row) => row.epic)).toEqual(["auth"]);
    expect(parsed.findings).toEqual([]);
  });

  it("reports an unterminated fence at EOF, unlike a plan with no register", () => {
    const unclosed = parseArchitectRegister(
      [
        "# Plan",
        "",
        "```markdown",
        "## Architect register",
        "",
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active",
        "",
      ].join("\n"),
      ctx(),
    );
    const absent = parseArchitectRegister(
      "# Plan\n\n## Milestones\n\n- a task\n",
      ctx(),
    );
    expect(absent).toEqual({ epics: [], findings: [] });
    expect(unclosed.epics).toEqual([]);
    expect(unclosed.findings).toHaveLength(1);
    expect(unclosed.findings[0]).toMatch(/unterminated code fence/);
  });

  it("reports an unterminated fence that starts after the register rows", () => {
    const parsed = parseArchitectRegister(
      [
        "## Architect register",
        "",
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i7 | active",
        "",
        "```markdown",
        "no closing fence",
      ].join("\n"),
      ctx(),
    );
    expect(parsed.epics.map((row) => row.epic)).toEqual(["auth"]);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatch(/unterminated code fence/);
  });

  it("keeps rows under a nested heading inside the register", () => {
    const parsed = parseArchitectRegister(
      [
        "## Architect register",
        "",
        "- epic `auth` | architect `main` | plan `plan.md` | scope `src/auth/**` | opened i7 | active",
        "",
        "### Closed",
        "",
        "- epic `old` | architect `main` | plan `plan.md` | scope `src/old/**` | opened i2 | closed i4: served its purpose",
        "",
        "## Next",
        "",
      ].join("\n"),
      ctx({ exists: () => false }),
    );
    expect(parsed.epics.map((row) => row.epic)).toEqual(["auth", "old"]);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatch(
      /epic "auth" plan "plan.md" does not exist/,
    );
  });

  it("parses CRLF plans", () => {
    const parsed = parseArchitectRegister(
      EXAMPLE.replace(/\n/g, "\r\n"),
      ctx(),
    );
    expect(parsed.findings).toEqual([]);
    expect(parsed.epics).toHaveLength(3);
  });
});

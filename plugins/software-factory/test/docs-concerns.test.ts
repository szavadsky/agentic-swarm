import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Docs closure for the concerns funnel (m2-docs-gates).
 *
 * Every assertion below is a base-failing sentinel: the needle names content
 * added by docs-finish-v5 and is absent from the base tree (Decision 022).
 * The test therefore proves the docs/config edits landed, not that the base
 * already contained generic words such as "concerns", "dismiss" or "digest".
 */

const pluginRoot = path.resolve(import.meta.dir, "..");
const read = (relative: string) => fs.readFileSync(path.join(pluginRoot, relative), "utf8");

/**
 * Returns the body between `heading` and the next heading of the same or
 * higher level. Headings inside fenced code blocks (e.g. YAML comments) are
 * ignored.
 */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect({ heading, found: start >= 0 }).toEqual({ heading, found: true });
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  const boundary = new RegExp(`^#{1,${level}} `);
  const rest = text.slice(start + heading.length);
  let inFence = false;
  let offset = 0;
  for (const line of rest.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
    } else if (!inFence && boundary.test(line)) {
      return rest.slice(0, offset);
    }
    offset += line.length + 1;
  }
  return rest;
}

/** Returns one `# ====` delimited commentary block from the default pipeline YAML. */
function yamlBlock(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect({ heading, found: start >= 0 }).toEqual({ heading, found: true });
  const separator = "\n# ==============================================================================";
  const bannerEnd = text.indexOf(separator, start + heading.length);
  const next =
    bannerEnd >= 0 ? text.indexOf(separator, bannerEnd + separator.length) : -1;
  return next >= 0 ? text.slice(start, next) : text.slice(start);
}

function expectContains(body: string, needles: string[], context: string): void {
  for (const needle of needles) {
    expect({ context, needle, present: body.includes(needle) }).toEqual({
      context,
      needle,
      present: true,
    });
  }
}

const pipelineYaml = read("config/pipeline.default.yaml");

/**
 * Red-test guard: QA's red-test restores `paths.prod` (config included) to the
 * test-first commit but leaves docs/README (outside paths.prod) at the item
 * tip. Asserting the shipped config commentary in every test keeps each test
 * genuinely red under that restoration, not only on the pristine base tree.
 */
function expectConfigClosure(context: string): void {
  const review = yamlBlock(pipelineYaml, "# Review Policy & Dispositions");
  expectContains(review, ["dismiss", "auto-appended", "triager"], `${context}: reviewPolicy commentary`);
  const concerns = yamlBlock(pipelineYaml, "# Human Involvement & Concerns");
  expectContains(
    concerns,
    [
      "source.agent",
      "developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round",
    ],
    `${context}: concerns commentary`
  );
}

describe("docs: concerns funnel finish (m2-docs-gates)", () => {
  const architecture = read("docs/ARCHITECTURE.md");

  it("§1 row 18 records item 18 implemented with five deviations", () => {
    expectConfigClosure("docs closure");
    const row = architecture.split("\n").find((line) => line.startsWith("| 18 "));
    expect(row).toBeDefined();
    expect(row).not.toContain("Deliberately not hand-built");
    expectContains(
      row!,
      [
        "**Implemented**",
        "epic-config root-only",
        "close-up-dismiss via resolutions",
        "saga open-only",
        "immediate halt",
        "triage-coverage",
        "adr-epic-config-root-only",
        "adr-closeup-no-suggestions-triage",
        "adr-epic-push-condensed",
        "adr-autonomous-immediate-halt",
        "adr-funnel-triage-coverage",
      ],
      "§1 row 18"
    );
  });

  it("§8.11 documents store layout fingerprint dedup remarkable aggregation and triage contract", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "### 8.11 Concerns funnel");
    expectContains(
      body,
      [
        "engine-owned",
        "concerns/{id}.yaml",
        "c-{fingerprint}.yaml",
        "rm-{fingerprint}.yaml",
        "sha256",
        "kind + normalized summary + location",
        "longest detail wins",
        "highest severity wins",
        "affects union",
        "legacy",
        "open | dismissed | routed | resolved",
        "reconcileConcerns",
        "remarkable decisions",
        "threshold-exempt",
        "exact-id",
        "ordinary findings",
        "dismiss requires a non-empty `detail`",
        "isTriagerAgent",
        "routeHumanDisposition",
        "q-concern-{id}",
        "q-escalated-{id}",
        "blocker affecting a dependent item",
        "next architect turn",
        "plan tech-debt list",
      ],
      "§8.11 store/triage/routing"
    );
  });

  it("§8.11 documents close-up propose-confirm epic condensing ADR modes counts and byte caps", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "### 8.11 Concerns funnel");
    expectContains(
      body,
      [
        "applyCloseupResolutions",
        "pendingResolution",
        "applyConcernConfirms",
        "applyWaveCloseupFallback",
        "non-triagers",
        "propagateEpicConcerns",
        "[epic]",
        "q-epic-",
        "condensed",
        "canonical ADR markdown",
        "## Blocking",
        "historical notes",
        "humanInvolvement",
        "autonomous",
        "principal",
        "detailed",
        "countConcerns",
        "c-*",
        "no retention",
        "code constants",
        "2000",
        "500",
        "8000",
        "120",
      ],
      "§8.11 closeup/epic/adr/counts/caps"
    );
  });

  it("§8.11 records immediate-halt triage-coverage epic-config close-up-dismiss and saga deviations", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "### 8.11 Concerns funnel");
    expectContains(
      body,
      [
        "immediate halt",
        "adr-autonomous-immediate-halt",
        "awareness-plan-2-autonomous-halt-deviation",
        "plan-reviewer-triaged",
        "consult/wave-report/close-up",
        "hydration + wave close-up fallback",
        "simple-task concerns stay open",
        "adr-funnel-triage-coverage",
        "awareness-plan-4-funnel-triage-coverage-awareness",
        "epic children do not inherit the parent task layer",
        "adr-epic-config-root-only",
        "dismiss via resolutions",
        "adr-closeup-no-suggestions-triage",
        "open-only",
        "forwarded `q-epic-*` questions",
        "adr-epic-push-condensed",
      ],
      "§8.11 deviations"
    );
  });

  it("§3 module layout lists the concerns funnel modules", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "## 3. Module layout");
    expectContains(
      body,
      ["concerns.ts", "triage.ts", "review-policy.ts", "epic-propagation.ts", "adrs.ts"],
      "§3"
    );
  });

  it("§5 configuration sample includes concern modes and documents epic layering", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "## 5. Configuration");
    // Epic children resolve the parent task layer: pipelineFor falls back to
    // the root task pipeline.yaml for child dirs (run.ts effectivePath).
    expect(body).toContain("epics inherit parent task layer");
    expectContains(
      body,
      [
        "humanInvolvement: autonomous",
        "concerns:",
        "raiseAllowlist:",
        "minDigestSeverity: medium",
        "minBlockingSeverity: high",
        "dismiss auto-appended",
      ],
      "§5"
    );
  });

  it("§6.2 task folder shows the engine-owned concern store", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "### 6.2 Task folder");
    expectContains(body, ["concerns/", "c-*.yaml", "rm-*.yaml", "engine-owned"], "§6.2");
  });

  it("§8.7 adds the triager-only dismiss row", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "### 8.7 Review dispositions");
    expectContains(
      body,
      ["| `dismiss` |", "triager", "requires a reason", "`dismissed`", "kept on disk", "auto-appended"],
      "§8.7"
    );
  });

  it("§10 documents concern fragment vars outputs and byte budgets", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "## 10. Agents & prompts");
    expectContains(
      body,
      [
        "remarkable[]",
        "concernsYaml",
        "humanInvolvementCriteria",
        "reviewer/plan-reviewer triage",
        "2000",
        "500",
        "8000",
      ],
      "§10"
    );
  });

  it("§11 status prints concern counts and split blocking/digest questions", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "## 11. CLI");
    expectContains(
      body,
      ["Concerns: open", "dismissed", "routed", "resolved", "Blocking Questions", "Digest Questions", "c-*"],
      "§11"
    );
  });

  it("§13 lists the concerns funnel regression suites", () => {
    expectConfigClosure("docs closure");
    const body = section(architecture, "## 13. Testing & fire test");
    expectContains(
      body,
      [
        "concerns funnel",
        "fingerprint/dedup",
        "triage",
        "hydration byte caps",
        "epic propagation condensing",
        "ADR blocking table",
        "allowlist agreement",
      ],
      "§13"
    );
  });

  it("README documents concerns and human involvement with per-task examples and status output", () => {
    expectConfigClosure("docs closure");
    const readme = read("README.md");
    const body = section(readme, "## 5. Concerns & human involvement");
    expectContains(
      body,
      [
        "concerns/",
        "humanInvolvement",
        "principal",
        "detailed",
        "pipeline.yaml",
        "factory status",
        "Concerns: open",
        "Digest Questions",
        "§8.11",
      ],
      "README concerns section"
    );
  });

  it("README documentation section points at the concerns funnel", () => {
    expectConfigClosure("docs closure");
    const readme = read("README.md");
    const body = section(readme, "## 6. Documentation & Architecture");
    expectContains(body, ["§0–§14", "§8.11"], "README documentation section");
  });

  it("pipeline default commentary documents dismiss auto-append and fragment-to-agent mapping", () => {
    expectConfigClosure("docs closure");
    const config = read("config/pipeline.default.yaml");
    const review = yamlBlock(config, "# Review Policy & Dispositions");
    expectContains(review, ["dismiss", "auto-appended", "triager"], "reviewPolicy commentary");
    const concerns = yamlBlock(config, "# Human Involvement & Concerns");
    expectContains(
      concerns,
      [
        "source.agent",
        "fragment",
        "developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round",
        "fact-finder covers research",
        "architect covers architect-*",
      ],
      "concerns commentary"
    );
  });
});

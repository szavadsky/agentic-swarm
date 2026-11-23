import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./config.js";
import {
  type PromptVariable,
  PROMPT_VARIABLES,
  pageVariables,
} from "./prompt-vars-pages.js";

/**
 * The prompt-variable reference: one typed descriptor per prompt template and
 * the renderer that writes `prompts/VARIABLES.md`. Adding a variable is one
 * descriptor line plus a regenerated file; the prompt tests fail when this
 * descriptor and the templates' placeholders disagree.
 */

/** A prompt and the partials it composes, in the reference's order. */
export interface PromptComposition {
  prompt: string;
  partials: readonly string[];
}

/** The template-syntax paragraph every page sits under. */
export const TEMPLATE_SYNTAX =
  "Template syntax: [LiquidJS](https://liquidjs.com), strict mode (unknown variable = render error; unknown filter = render error). `{{ name }}` interpolates one value; `{% include 'partial-name' %}` inlines `prompts/partial-name.md`. Every prompt is stable text up to its final `## This turn` block; turn variables live there so providers can cache the prefix, except the implementer's spike opening sentence, which names `report_path` before the body so the commit-first instruction is read first. Renderer defaults also appear above the block, so the prefix is stable only within one checkout and launch.";

/** Prompts and the partials they compose. */
export const PROMPT_COMPOSITIONS: readonly PromptComposition[] = [
  {
    prompt: "architect",
    partials: [
      "`architect-assignment` (`architect-bounds`)",
      "`architect-goal`",
      "`architect-body` (`architect-turn`, `plan-standard` (`task-size`), `architect-scope` (`plan-rules`, `calibration`))",
      "`outcome`",
      "`plan-review-marks`",
      "`verdict`",
    ],
  },
  {
    prompt: "subarchitect",
    partials: [
      "`architect-bounds`",
      "`architect-epic`",
      "`architect-body` (`architect-turn`, `plan-standard` (`task-size`), `architect-scope` (`plan-rules`, `calibration`))",
      "`outcome`",
    ],
  },
  {
    prompt: "front",
    partials: [
      "`task-size`",
      "`plan-read-only`",
      "`calibration`",
      "`outcome`",
      "`task-frontmatter`",
    ],
  },
  {
    prompt: "intent",
    partials: ["`calibration`", "`outcome`"],
  },
  {
    prompt: "pm",
    partials: [
      "`task-size`",
      "`plan-read-only`",
      "`spike-report-general`",
      "`calibration`",
      "`outcome`",
      "`task-frontmatter`",
    ],
  },
  {
    prompt: "implementer",
    partials: [
      "`cleanliness-revision`",
      "`implementer-body`",
      "`clean-code`",
      "`scope` (`plan-read-only`)",
      "`calibration`",
      "`outcome`",
    ],
  },
  {
    prompt: "qa",
    partials: ["`implementer-body`", "`finding-standards`", "`outcome`"],
  },
  {
    prompt: "reviewer",
    partials: [
      "`<author>-body` (`implementer-body` by default)",
      "`review-<author>` duties",
      "`review-<author>-turn` inputs",
      "`verdict`",
    ],
  },
  {
    prompt: "review-architect",
    partials: [
      "`architect-assignment` (`architect-bounds`)",
      "`architect-body` (`architect-turn`, `plan-standard` (`task-size`), `architect-scope` (`plan-rules`, `calibration`))",
      "`finding-standards`",
      "`outcome`",
    ],
  },
  {
    prompt: "architect-review-return",
    partials: [
      "`architect-assignment`",
      "`plan-review-marks`",
      "`calibration`",
      "`outcome`",
    ],
  },
  {
    prompt: "digest",
    partials: ["`calibration`", "`outcome`"],
  },
  {
    prompt: "steward",
    partials: ["`clean-code`", "`calibration`", "`outcome`"],
  },
  {
    prompt: "plan-checker",
    partials: ["`calibration`", "`outcome`"],
  },
  {
    prompt: "pack-preparer",
    partials: ["`calibration`", "`outcome`"],
  },
];

/** The shared fragments every prompt composes instead of restating. */
export const SHARED_DEFINITIONS =
  "The shared definitions exist once as partials: `scope` (the predicted-area rule: out-of-area judgement, upscope condition; includes `plan-read-only`), `plan-read-only` (the plan, intent, other task files and records are read-only), `task-size` (what one task is: one implementer session, one seam, one reviewable diff, one done-when, and the split/merge criteria; included by `front`, `plan-standard` and `pm`), `calibration` (concerns and calibration, with `remarkable` inside it), `outcome` (the outcome contract, shape rendered from the kernel outcome schema), `task-frontmatter` (the task-file frontmatter shape rendered from the kernel task schema, plus the configured task types and tiers; included by the authoring roles), `clean-code` (the code standard; the repo layer's `codingRules` file replaces its content per repo while the fragment name stays fixed, so implementer, QA, steward and adjudicator prompts render the same rule text through their shared bodies), `remarkable` (the remarkable definition), `finding-standards` (the no-praise, no-restating, no-taste rule shared by both reviews), `plan-review-marks` (the plan-review mark meaning, shared by the architect's turn and return), `spike-report-general` (what a spike's done-when says; included by `pm` and `architect-body`), `verdict` (which step each of `verdict` and `decision` belongs to, for review and architect steps) and the role bodies `implementer-body` and `architect-body` (everything before the role's turn block; a reviewer includes its author's body by role name, so the plan review reuses the reviewer template over `architect-body`).";

/** How the architect's body is split into fragments other roles reuse. */
export const ARCHITECT_BODY_FRAGMENTS =
  "The architect's body is assembled from fragments so a reviewer and a subarchitect share the whole body: `architect-bounds` (the bounds), `architect-turn` (the consult's turn order, completeness check, stop decision and plan edit), `plan-standard` (what the plan carries and its granularity, with `task-size`), `plan-rules` (debt, parked work and ADRs) and `architect-scope` (tiers and calibration, with `plan-rules` inside). `architect-body` is that shared body plus `outcome`; `architect-assignment` adds the top architect's role line before the bounds. `architect-goal` adds the top's scope (the whole goal, the register at depth 2, steers), and `architect-epic` adds the subarchitect's epic scope and upward brief. The plan reviewer includes `architect-assignment` and the whole `architect-body`; the architect's return includes `architect-assignment`.";

/** The calibration partial's config-replacement rule. */
export const CALIBRATION_PARTIAL =
  "`calibration` is the default calibration partial. The process config may replace its content per repo; the prompt template does not change.";

/** Renderer defaults: supplied by the library, never passed by turn code. */
export const RENDERER_DEFAULTS =
  "Renderer defaults live outside any `This turn` block and the renderer supplies them, so turn code does not pass them: `validate_cmd` (the running build's absolute `bun <build>/bin/factory.ts validate`, stable only within one checkout), `outcome_schema` (the outcome YAML skeleton rendered from the task type's kernel output schema, or the QA step's own schema, in the `outcome` partial), `task_frontmatter` (the frontmatter YAML skeleton rendered from the kernel task schema, in the `task-frontmatter` partial), `task_types` (configured task type names in config order with the flow, kind and output schema each supplies, from the process config), `tiers` (run-config alias names in config order; `default` is kernel vocabulary for no tier override and stays literal), `depth` (`1` until the hierarchy config names `2`), `author` (the reviewer's author role; it selects the `<role>-body` and `review-<role>` fragments) and `checks_result`/`checks_tree`/`checks_log` (the latest checks record's result, tree and log; a render with no checks record gets `no checks run`, `unknown` and `unknown`), and `base_gates` (the base tree's recorded gate result; a render with no base record gets `not recorded`, never a clean base). `author` defaults to `implementer`; the plan-review turn overrides it with `architect`. `class_types` is a turn-supplied variable above the block: the front turn renders its class-to-task-type mapping from the same kernel mapping the validator enforces. The delivery-repair ask also supplies its own narrowed `outcome_schema`; it has no role prompt, so its shape must match the turn it repairs.";

function variableLine(variable: PromptVariable): string {
  return `- \`${variable.name}\` — ${variable.meaning}`;
}

/** Renders `prompts/VARIABLES.md`: one unpadded line per variable. */
export function renderPromptVariables(): string {
  const sections: string[] = [
    "# Prompt variables",
    TEMPLATE_SYNTAX,
    "## Prompts and their partials",
    PROMPT_COMPOSITIONS.map(
      (composition) =>
        `- \`${composition.prompt}\` — ${composition.partials.join(", ")}`,
    ).join("\n"),
    SHARED_DEFINITIONS,
    ARCHITECT_BODY_FRAGMENTS,
    CALIBRATION_PARTIAL,
    RENDERER_DEFAULTS,
  ];
  for (const page of PROMPT_VARIABLES) {
    const pageSections = [`## ${page.file}`];
    if (page.intro) pageSections.push(page.intro);
    const variables = pageVariables(page);
    if (variables.length > 0)
      pageSections.push(variables.map(variableLine).join("\n"));
    if (page.note) pageSections.push(page.note);
    sections.push(pageSections.join("\n\n"));
  }
  return `${sections.join("\n\n")}\n`;
}

/** The reference file the tests compare against the render. */
export function variablesDocPath(): string {
  return path.join(packageRoot, "prompts", "VARIABLES.md");
}

/** Writes the rendered reference and returns its absolute path. */
export function writePromptVariables(file: string): string {
  const target = path.resolve(file);
  fs.writeFileSync(target, renderPromptVariables());
  return target;
}

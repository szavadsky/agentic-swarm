/**
 * Deterministic architect brief + cheap-model relevance pass (§8.4.2).
 *
 * Replaces the old full-history hydration dump with a small skeleton (one
 * line per entry: stable id, section, headline, file path) plus a @simpler
 * judge (`system/brief-select` + `brief-select.schema.json`) that selects the
 * entries relevant to the current step goal. Judge failure fails open: the
 * full skeleton is injected (headlines are small) and a `brief_select_fallback`
 * event is journaled.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { Harness } from "../harness/types.js";
import type {
  DecisionArtifact,
  PipelineConfig,
  PlanArtifact,
  PlanCloseupArtifact,
  PlanEditsArtifact,
  StateArtifact,
  SteerClassificationArtifact,
  SteerItemArtifact,
  WaveCloseupArtifact,
} from "./artifacts.js";
import type { PromptLibrary } from "./prompts.js";
import { resolveRole } from "./config/roles.js";
import { defaultSchemaCache } from "./records/schema-cache.js";
import { readYaml } from "./records/io.js";
import { appendJournal } from "./journal.js";
import { deriveItemState } from "./derive/item.js";

/** One skeleton line: stable id, section, one-line headline, task-relative file path. */
export interface BriefEntry {
  id: string;
  section: string;
  headline: string;
  path: string;
}

/** Deterministic skeleton: header (always kept) + entries in stable order. */
export interface BriefSkeleton {
  task: string;
  iteration: number;
  entries: BriefEntry[];
}

export interface BriefSkeletonOpts {
  taskDir: string;
  task: string;
  taskWt: string;
  parentBranch: string;
  pipeline: PipelineConfig;
  iteration: number;
  rootTaskDir?: string;
}

export interface ArchitectBriefOpts extends BriefSkeletonOpts {
  /** Step id + purpose, e.g. `architect-plan-2: draft the iteration plan`. */
  goal: string;
  harness: Harness;
  prompts: PromptLibrary;
}

const HEAD_MAX = 140;

/** Collapse to a single-line head for one-line skeleton entries. */
function head(value: unknown, max = HEAD_MAX): string {
  const s = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function readDirSafe(dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) return [];
  return (await fs.promises.readdir(dir)).sort();
}

async function readYamlSafe<T>(filePath: string): Promise<T | undefined> {
  try {
    return await readYaml<T>(filePath);
  } catch {
    return undefined;
  }
}

/** Builds the deterministic brief skeleton: one line per entry with file path. */
export async function buildArchitectBriefSkeleton(
  opts: BriefSkeletonOpts
): Promise<BriefSkeleton> {
  const { taskDir, task, taskWt, parentBranch, pipeline, iteration } = opts;
  const rel = (p: string) => path.relative(taskDir, p);
  // Mailbox entries outside the task dir (root mailbox for epic children)
  // escape as `../` paths. Mark them `[root]` and render them root-relative
  // so every path resolves from a known base.
  const taskRoot = path.resolve(taskDir);
  const renderPath = (fp: string): string => {
    const abs = path.resolve(fp);
    if (abs === taskRoot || abs.startsWith(taskRoot + path.sep)) return rel(fp);
    const base = opts.rootTaskDir ? path.resolve(opts.rootTaskDir) : taskRoot;
    return `[root] ${path.relative(base, abs)}`;
  };
  const entries: BriefEntry[] = [];

  // Items table (slug, kind, wave, status, branch) from committed assignments.
  for (const name of await readDirSafe(path.join(taskDir, "items"))) {
    const assignmentPath = path.join(taskDir, "items", name, "assignment.yaml");
    if (!fs.existsSync(assignmentPath)) continue;
    try {
      const st = await deriveItemState({
        taskDir,
        itemSlug: name,
        parentBranch,
        taskWt,
        pipeline,
        rootTaskDir: opts.rootTaskDir,
      });
      entries.push({
        id: `item:${st.slug}`,
        section: "items",
        headline: `${st.kind} wave=${st.wave} status=${st.status} branch=${st.branch} — ${head(st.title, 100)}`,
        path: rel(assignmentPath),
      });
    } catch {
      entries.push({
        id: `item:${name}`,
        section: "items",
        headline: "(state unreadable)",
        path: rel(assignmentPath),
      });
    }
  }

  // Plan files (name + milestone headlines) + edits artifacts (scheduled items).
  for (const f of await readDirSafe(path.join(taskDir, "plan"))) {
    if (!f.endsWith(".yaml")) continue;
    const fp = path.join(taskDir, "plan", f);
    if (f.startsWith("plan-")) {
      const plan = await readYamlSafe<PlanArtifact>(fp);
      const milestones = Array.isArray(plan?.milestones)
        ? plan!.milestones.map((m) => `${m.id}: ${m.title}`).join("; ")
        : "(unreadable)";
      entries.push({
        id: `plan:${f}`,
        section: "plan",
        headline: `milestones [${head(milestones, 110)}]`,
        path: rel(fp),
      });
    } else if (f.startsWith("edits-")) {
      const edits = await readYamlSafe<PlanEditsArtifact>(fp);
      const items = Array.isArray(edits?.items)
        ? edits!.items.map((it) => `${it.slug}(${it.kind})`).join(", ")
        : "(unreadable)";
      entries.push({
        id: `plan:${f}`,
        section: "plan",
        headline: `scheduled [${head(items, 110)}]`,
        path: rel(fp),
      });
    }
  }

  // Close-up files + one-line summary each.
  for (const f of await readDirSafe(taskDir)) {
    if (!f.startsWith("closeup-") || !f.endsWith(".yaml")) continue;
    const fp = path.join(taskDir, f);
    const closeup = await readYamlSafe<PlanCloseupArtifact>(fp);
    entries.push({
      id: `closeup:${f}`,
      section: "closeup",
      headline: closeup
        ? `${closeup.status} — ${head(closeup.summary)}`
        : "(unreadable)",
      path: rel(fp),
    });
  }

  // Decisions (file + decision + text head).
  for (const f of await readDirSafe(path.join(taskDir, "decisions"))) {
    if (!f.endsWith(".yaml")) continue;
    const fp = path.join(taskDir, "decisions", f);
    const d = await readYamlSafe<DecisionArtifact>(fp);
    entries.push({
      id: `decision:${f}`,
      section: "decisions",
      headline: d
        ? `${d.decision}: ${head(d.text ?? d.rationale ?? d.reason ?? d.question ?? "")}`
        : "(unreadable)",
      path: rel(fp),
    });
  }

  // Open steer questions, task mailbox first, then the root mailbox (epic
  // children read the root mailbox, §8.8). Entries outside the task dir are
  // marked `[root]` and rendered root-relative so paths always resolve.
  const steerDirs = [path.join(taskDir, "steer", "tousertoreview")];
  if (opts.rootTaskDir && path.resolve(opts.rootTaskDir) !== path.resolve(taskDir)) {
    steerDirs.push(path.join(opts.rootTaskDir, "steer", "tousertoreview"));
  }
  for (const dir of steerDirs) {
    for (const f of await readDirSafe(dir)) {
      if (!f.endsWith(".yaml")) continue;
      const fp = path.join(dir, f);
      const q = await readYamlSafe<SteerItemArtifact>(fp);
      if (!q || q.status !== "open") continue;
      entries.push({
        id: `steer:${q.id}`,
        section: "steer",
        headline: `[${q.disposition}] ref=${q.ref}: ${head(q.question)}${q.answer ? ` answered: ${head(q.answer, 60)}` : ""}`,
        path: renderPath(fp),
      });
    }
  }

  // Taken steering directives (steer/fromusertaken): committed operator text +
  // its classification sidecar. Next-architect-call directives must reach the
  // architect even after the answered question that consumed them is closed.
  const takenDirs = [path.join(taskDir, "steer", "fromusertaken")];
  if (opts.rootTaskDir && path.resolve(opts.rootTaskDir) !== path.resolve(taskDir)) {
    takenDirs.push(path.join(opts.rootTaskDir, "steer", "fromusertaken"));
  }
  for (const dir of takenDirs) {
    for (const f of await readDirSafe(dir)) {
      if (f.endsWith(".yaml")) continue;
      const fp = path.join(dir, f);
      if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) continue;
      const cls = await readYamlSafe<SteerClassificationArtifact>(`${fp}.classification.yaml`);
      const kind = cls?.kind ?? "directive";
      const urgency = cls?.urgency ?? "next-architect-call";
      let textHead = "";
      try {
        textHead = head(await fs.promises.readFile(fp, "utf8"), 100);
      } catch {
        textHead = "(unreadable)";
      }
      entries.push({
        id: `taken:${f}`,
        section: "taken",
        headline: `[${kind}/${urgency}] refs=${(cls?.refs ?? []).join(",") || "(none)"}: ${cls?.summary ? `${head(cls.summary, 80)} — ` : ""}${textHead}`,
        path: renderPath(fp),
      });
    }
  }

  // Concerns (spec-18 forward-compat): only when the dir exists.
  for (const f of await readDirSafe(path.join(taskDir, "concerns"))) {
    if (!f.endsWith(".yaml")) continue;
    const fp = path.join(taskDir, "concerns", f);
    const c = await readYamlSafe<{ kind?: string; severity?: string; summary?: string }>(fp);
    entries.push({
      id: `concern:${f}`,
      section: "concerns",
      headline: c
        ? `${c.kind ?? "?"} / ${c.severity ?? "?"}: ${head(c.summary ?? "")}`
        : "(unreadable)",
      path: rel(fp),
    });
  }

  // Debt headlines: plan tech-debt entries + state.yaml debt list.
  for (const f of await readDirSafe(path.join(taskDir, "plan"))) {
    if (!f.startsWith("plan-") || !f.endsWith(".yaml")) continue;
    const fp = path.join(taskDir, "plan", f);
    const plan = await readYamlSafe<PlanArtifact>(fp);
    for (const td of plan?.techDebt ?? []) {
      entries.push({
        id: `debt:${f}:${td.id}`,
        section: "debt",
        headline: `[${td.category}] ${head(td.description)}`,
        path: rel(fp),
      });
    }
  }
  const state = await readYamlSafe<StateArtifact>(path.join(taskDir, "state.yaml"));
  const stateDebt = state && Array.isArray(state.debt) ? state.debt : [];
  stateDebt.forEach((d, i) => {
    entries.push({
      id: `debt:state.yaml:${i}`,
      section: "debt",
      headline: head(d),
      path: "state.yaml",
    });
  });

  // Wave files.
  for (const f of await readDirSafe(path.join(taskDir, "waves"))) {
    if (!f.endsWith(".yaml")) continue;
    const fp = path.join(taskDir, "waves", f);
    const w = await readYamlSafe<WaveCloseupArtifact>(fp);
    const list = (slugs?: string[]) =>
      !slugs || slugs.length === 0
        ? "(none)"
        : slugs.length > 12
          ? `${slugs.slice(0, 12).join(", ")} +${slugs.length - 12} more`
          : slugs.join(", ");
    entries.push({
      id: `wave:${f}`,
      section: "waves",
      headline: w
        ? `${w.status} merged=[${list(w.mergedItems)}] failed=[${list(w.failedItems)}] blocked=[${list(w.blockedItems)}] — ${head(w.summary)}`
        : "(unreadable)",
      path: rel(fp),
    });
  }

  return { task, iteration, entries };
}

/**
 * Renders a skeleton (or a relevance-ordered subset) for injection.
 * The header is always kept; `include` selects entry ids in relevance order.
 */
export function renderBriefSkeleton(skeleton: BriefSkeleton, include?: string[]): string {
  const lines = [
    `# Architect brief — task: ${skeleton.task} iteration: ${skeleton.iteration}`,
    "Read full detail from file paths under the task dir; entries are relevance-ordered for this step.",
  ];
  const byId = new Map(skeleton.entries.map((e) => [e.id, e]));
  const ids = include ?? skeleton.entries.map((e) => e.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = byId.get(id);
    if (!e) continue;
    lines.push(`- [${e.id}] ${e.section}: ${e.headline} | ${e.path}`);
  }
  return lines.join("\n");
}

/**
 * Builds the injected architect brief for a step goal: deterministic skeleton
 * plus a cheap-model relevance pass. An empty skeleton (header only) skips the
 * judge and injects directly. Judge failure (throw, unparseable,
 * schema-invalid, or empty include) fails open to the full skeleton and
 * journals `brief_select_fallback`.
 */
export async function buildArchitectBrief(opts: ArchitectBriefOpts): Promise<string> {
  const skeleton = await buildArchitectBriefSkeleton(opts);
  const full = renderBriefSkeleton(skeleton);

  // Empty skeleton (fresh iteration: header only): nothing to select from.
  // Inject the header without paying for a judge call or journaling noise.
  if (skeleton.entries.length === 0) return full;

  const failOpen = async (reason: string): Promise<string> => {
    try {
      await appendJournal(opts.taskDir, {
        type: "brief_select_fallback",
        goal: opts.goal,
        iteration: opts.iteration,
        reason,
      });
    } catch {
      // Journaling must never break the architect call.
    }
    return full;
  };

  try {
    const simpler = resolveRole("simpler", opts.pipeline.models.roles);
    const system = opts.prompts.render("system/brief-select", {});
    const prompt = [
      `Step goal: ${opts.goal}`,
      "",
      "Brief skeleton — one line per entry (id, section, headline, file path):",
      full,
      "",
      'Return {"include": [...]} with the entry ids the architect needs for this step goal, in relevance order.',
    ].join("\n");

    const validator = defaultSchemaCache.getValidator("brief-select");
    const schema = (validator.schema ?? {}) as Record<string, unknown>;
    const raw = await opts.harness.complete({
      role: simpler.role,
      models: simpler.models,
      system,
      prompt,
      schema,
    });

    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        try {
          parsed = yaml.parse(raw);
        } catch {
          return failOpen("judge_unparseable");
        }
      }
    }

    const valid = validator(parsed);
    if (!valid) {
      const details = (validator.errors ?? [])
        .map((e) => `${e.instancePath || "/"}: ${e.message}`)
        .join(", ");
      return failOpen(`judge_schema_invalid: ${details}`);
    }
    const include = (parsed as { include?: unknown }).include;
    if (!Array.isArray(include) || include.length === 0) {
      return failOpen("judge_empty_include");
    }
    const known = new Set(skeleton.entries.map((e) => e.id));
    const ordered = include.filter(
      (id): id is string => typeof id === "string" && known.has(id)
    );
    if (ordered.length === 0) {
      return failOpen("judge_empty_include");
    }
    return renderBriefSkeleton(skeleton, ordered);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return failOpen(`judge_error: ${msg}`);
  }
}

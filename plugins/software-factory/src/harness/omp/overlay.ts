import { createHash } from "node:crypto";
import path from "node:path";
import { writeYamlAtomic } from "../../core/records/io.js";

/** Agents omp ships with; their bundled frontmatter would otherwise inherit the parent model. */
const BUNDLED_SUBAGENTS = [
  "task",
  "scout",
  "reviewer",
  "sonic",
  "security-reviewer",
];

export interface OmpOverlayOptions {
  /** Cheap model every spawned subagent must run on. */
  subagentModel?: string;
  /** Provider cache lifetime; kernel-0 pins short (advice:290). */
  retention?: "short" | "long";
  approvalMode?: "always-ask" | "always-ask-cached" | "write" | "yolo";
  /** Test-only top-level overrides (for example a forced compaction threshold). */
  extra?: Record<string, unknown>;
}

export function ompOverlay(
  opts: OmpOverlayOptions = {},
): Record<string, unknown> {
  const overlay: Record<string, unknown> = {
    providers: { cacheRetention: opts.retention ?? "short" },
    memory: { backend: "off" },
    autolearn: { enabled: false },
    skills: { enabled: false },
    defaultThinkingLevel: "low",
    features: { unexpectedStopDetection: false },
    tools: { approvalMode: opts.approvalMode ?? "yolo", xdev: false },
    compaction: { experimentalContextManagement: false },
    disabledProviders: [
      "native",
      "claude",
      "codex",
      "gemini",
      "opencode",
      "cursor",
      "agents-md",
    ],
    // The adapter owns retries and fallbacks so every hop stays visible.
    retry: { enabled: false, modelFallback: false },
    ...opts.extra,
  };

  if (opts.subagentModel) {
    overlay.task = {
      agentModelOverrides: Object.fromEntries(
        BUNDLED_SUBAGENTS.map((name) => [name, opts.subagentModel]),
      ),
    };
    overlay.modelRoles = { task: opts.subagentModel };
  }

  return overlay;
}

/** Writes the overlay under `dir`, keyed by content so concurrent turns never share one. */
export async function writeOmpOverlay(
  opts: OmpOverlayOptions,
  dir: string,
): Promise<string> {
  const content = ompOverlay(opts);
  const hash = createHash("sha1")
    .update(JSON.stringify(content))
    .digest("hex")
    .slice(0, 12);
  const target = path.join(dir, `overlay-${hash}.yaml`);
  await writeYamlAtomic(target, content);
  return target;
}

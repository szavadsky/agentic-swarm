/** Variable pages for kernel and CLI runtime prompt fragments. */

import type { PromptVariablesPage } from "./types.js";

export const FRAGMENT_PROMPT_VARIABLES: readonly PromptVariablesPage[] = [
  {
    file: "bootstrap-assignment.md",
    prompt: "bootstrap-assignment",
    intro:
      "The dispatch message passed to a bootstrapped agent slot by `bootstrap-dispatch`. Read directly from the repo override or package `prompts/` directory without LiquidJS because an operator checkout may have no `node_modules`.",
    variables: {
      name: "assignment file basename under `bootstrap/assignments/<name>.md`",
      worktree: "absolute path to the slot's git worktree",
    },
  },
  {
    file: "digest-steer.md",
    prompt: "digest-steer",
    intro:
      "The synthetic steer body posted to PM on resume when an interrupted iteration leaves a launch digest.",
    variables: {
      iteration: "1-based iteration number being resumed",
      digest: "trimmed markdown content of `digest.md`",
      digest_rel: "goal-relative path to `digest.md`",
    },
  },
  {
    file: "gate-last-call.md",
    prompt: "gate-last-call",
    intro:
      "The final-round ask prepended to `findings` when a checks fix turn reaches its last call.",
    variables: {},
  },
  {
    file: "merge-conflict.md",
    prompt: "merge-conflict",
    intro:
      "The merge-conflict resolution ask prepended to `findings` before an integration resolve turn.",
    variables: {
      integration_head: "short commit hash of the current integration head",
      conflicts:
        "comma-separated conflicted paths, or fallback message when none",
    },
  },
  {
    file: "pm-ladder.md",
    prompt: "pm-ladder",
    intro:
      "The escalation/retry restatement rendered into `repair` on round 2+ of a PM, PM steer, PM stall, PM concerns, or PM plan-check turn.",
    variables: {
      mode: "`plan`, `steer`, `stall`, `concerns`, or `plan-check`",
      escalated:
        '`"true"` when the rung holds an escalated mandate, else empty',
      retry: '`"true"` when the rung is a fresh rolled-back retry, else empty',
      alias: "target alias running this rung",
      model: "model ID behind `alias`",
      findings:
        "formatted `- <reason>` rejection lines from the prior round, or empty",
    },
  },
  {
    file: "pm-steer-inject.md",
    prompt: "pm-steer-inject",
    intro:
      "The mid-turn message injected into a live PM steer turn when another steer arrives for the same scope.",
    variables: {
      steer: "formatted steer block for the newly arrived steer",
    },
  },
  {
    file: "resume.md",
    prompt: "resume",
    variables: {
      branch: "task branch the relaunch continues; empty when none",
      reason:
        "`relaunch` after an interruption, `fallback` for a tier that continues edited work, `trivial` in the front's session",
      session_cwd:
        "directory the resumed session's tools run in; trivial turns only",
      worktree: "absolute worktree a trivial turn must use; trivial turns only",
    },
  },
  {
    file: "saga-reminder.md",
    prompt: "saga-reminder",
    intro:
      "The optional architect reminder rendered into `saga_reminder` when open task count exceeds `process.sagaTaskCount`.",
    variables: {
      task_count: "number of open and ready tasks in the goal",
      threshold: "configured `process.sagaTaskCount` limit",
    },
  },
  {
    file: "standalone-upscope.md",
    prompt: "standalone-upscope",
    intro:
      "The standalone-task scope question rendered into `upscope_ask` for delivery acceptance when no architect planned the task.",
    variables: {},
  },
];

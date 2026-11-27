import type { PromptVariablesPage } from "./types.js";

/** Prompt variable pages for the implementer reviewer composition. */
export const REVIEWER_PROMPT_PAGES: readonly PromptVariablesPage[] = [
  {
    file: "reviewer.md",
    prompt: "reviewer",
    intro:
      "`reviewer.md` is the shared reviewer composition for task reviews: an author-neutral intro, the author's body, the duties partial named by `author`, the verdict sentence, and the turn block common to every review. The task reviewer renders it with `author: implementer`, which selects `implementer-body`, `review-implementer` and `review-implementer-turn`. All turn variables stay in the final `## This turn` block.",
    variables: {
      worktree:
        "task worktree for a task review; goal checkout for a plan review",
      author:
        "role whose body the reviewer includes (`implementer` by default); renderer default",
      checks_result:
        "latest checks record's failing-check text, or `pass` when green; `no checks run` when the render has no checks record (renderer default)",
      checks_tree:
        "the checked tree's hash; `unknown` without a checks record (renderer default)",
      checks_log:
        "the checks record's directory; `unknown` without a checks record (renderer default)",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
    },
  },
  {
    file: "review-implementer.md",
    prompt: "reviewer",
    author: "implementer",
    intro:
      "The diff-review duties, included by `reviewer.md` when `author: implementer`. It selects its decision block with `last_call`.",
    variables: {
      last_call:
        "`true` when this review is the step's last call; selects `review-implementer-last-call`",
    },
  },
  {
    file: "review-implementer-last-call.md",
    intro:
      "The ship-or-park decision, included by `review-implementer.md` on the last call. It contains no turn variables.",
    variables: {},
  },
  {
    file: "review-implementer-turn.md",
    prompt: "reviewer",
    author: "implementer",
    variables: {
      task_path: "path to the task file the diff is judged against",
      base_hash:
        "commit hash before this task's first turn; the range spans every round",
      head_hash: "commit hash after the latest implementer turn",
      round: "1-based review round of this step's own change-request budget",
      max_rounds:
        "this review step's total review calls: its change-request bound plus the last call",
      base_gates:
        "the base tree's recorded gate result, and the only evidence a red gate predates the task: commit plus `green`, the pre-existing failing checks, or `not recorded`; a claimed pre-existing failure is a finding unless this record lists it",
      prior_findings:
        "previous round's numbered summary and concerns, plus any legacy forward lines (summary first); empty string in round 1",
      prior_concerns:
        "undismissed concerns raised by implementer and QA turns on this task; empty string when none",
      upscope_ask:
        "escalation ask for a standalone task review, answered as `upscope: yes|no` with the verdict; empty string when this task is part of an architect plan",
      fix_dispositions:
        "the current fix round's summary plus one numbered reply per prior finding; round 1 carries the cleanliness revision turn's summary/replies and is otherwise empty; renderer default",
    },
  },
];

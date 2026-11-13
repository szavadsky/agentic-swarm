#!/usr/bin/env python3
"""Apply the 2026-11-13 review to manifesto.md. Additive only: inserts inlines under
anchored lines and appends the Fable proposal section. Never changes an existing line.

usage: build.py <manifesto.md> <fable.md> <out.md>
"""
import re
import sys

# (line, fragment that must occur in that line, kind, text, proposal id)
INLINES = [
    (11, "For a task it defines the scope", "unclear",
     "\u201cScope\u201d means two things in the build: the class the front gives a goal, and the file globs of a planned task (`src/kernel/tasks.ts:60`). The second is nowhere in the Intent, yet it caused 5 of the 8 parks through iteration 12. The front also does choose between task and bigger (`src/kernel/front.ts:29-33`).", "P2"),
    (12, "Trivial: the same agent implements", "incorrect",
     "Cannot work as written. The front runs in the goal checkout, the implementer in a task worktree, and a session resumes only in its own directory (`src/kernel/flow-context.ts:160-171`). Task `front-handoff` (iteration 13) built \u201csame model alias, fresh session\u201d. The line is also silent on gates and review; as built, gates run and review does not.", "P12"),
    (13, "Task review auto-escalates", "unclear",
     "Not built, and the mechanism is not named. The reviewer has no such verdict (`prompts/reviewer.md:16-21`); an implementer that reports `upscope` only parks the task (`src/kernel/flow.ts:94-96`). It is open who escalates and what happens to the work already done. Task `review-upscope` is pending.", "P12"),
    (17, "An iteration is one architect engagement", "contradiction",
     "\u201cEach architect consult starts a new iteration\u201d, yet the bullet two below allows a consult inside an iteration (R06). One has to yield. As built, one launch is one architect turn and one iteration. With subarchitects (Saga and hierarchy: \u201chis iteration\u201d) it is undefined whose iterations a launch limit counts.", "P5"),
    (18, "Every consult begins with a completeness check", "practice differs",
     "__R_L18__", "P4"),
    (19, "dependents idle until the boundary", "practice differs",
     "The code does the opposite for dependents that are already planned: a finished spike satisfies their dependencies at once and they start in the same iteration (`src/kernel/derive.ts:13-18`). The sentence fits only work the architect has yet to plan.", "P5"),
    (22, "single markdown plan", "contradiction",
     "\u201cA single plan\u201d conflicts with Saga and hierarchy and the Glossary, where each subarchitect owns an epic and its summary: one plan per goal, or one per architect? \u201cNo verbose documents\u201d is not what happened either: the plan gains a strategy line and a debt register every iteration.", "P8"),
    (24, "40\u201380x", "practice differs",
     "Two ratios in one bullet (40\u201380x, then ~50x). In the run the binding constraint was quota, not price: 432 quota rejections, 145 of 172 turns retried, 136 finished on the paid fallback model. The ratio cannot be measured from the records: 162 of 172 store a cost of $0.", "P9"),
    (25, "the architect calls it", "practice differs",
     "For the PM the script now owns escalation (owner steer of 2026-11-13, `src/kernel/pm.ts:171-360`). For implementers \u201con review\u201d cannot work: a review keeps the reviewer's alias (`src/kernel/flow-context.ts:117`), task `tier-escalation` has been parked since iteration 7, and the `escalation` alias has not run one turn.", "P3"),
    (30, "a graph records which way a session can move", "incorrect",
     "No graph exists: a session is portable only to the same harness (`portable()` tests `from === to`). Resuming also failed in practice: a stale omp session crashed the architect in iterations 2, 3 and 4 (records 00006, 00009, 00012). What a resumed session saves over a fresh one with a digest was never measured.", "P4"),
    (32, "tasks and lines", "unclear",
     "\u201cLines\u201d and \u201csemantic diff\u201d are undefined; as built the PM re-derives task files and the script matches them by plan mention and a content hash (`src/kernel/pm.ts:74-90`). \u201cPaper-pusher\u201d undersells the role: PM turns without a usable outcome ended iterations 6 and 10 with nothing dispatched, after the architect had been paid.", "P4"),
    (36, "Hierarchy depth is bounded by config", "unclear",
     "__R_L36__", "P8"),
    (37, "task-level consults", "contradiction",
     "The Escalation ladder says a task never reaches the architect. \u201cConsult\u201d is used for three things: the architect's turn at an iteration boundary (Iteration, Model economics), an escalated item (here), and a steer (Steering and autonomy). Two readers will route escalations differently.", "P5"),
    (39, "One orchestration script owns everything", "practice differs",
     "Scouts run as subagents inside the architect's omp session: no record, no cost line, no limit, no crash recovery (`Caps.subagents` is unused). In iteration 8 the architect's turn ended while it waited for its scouts, with no plan edit (record 00226). Harness access layer proposes subarchitects the same way.", "P4"),
    (45, "wave review", "practice differs",
     "The price of this rule: any integration or scope problem waits a full iteration. Seven of the eight parks through iteration 12 held finished or correctly diagnosed work. Five were merged later by a separate task whose only content is the kept branch (`turn-land`, `prune-checks-land`, `front-land`, `sweep-land`, `pm-infra-stop`), each after a consult.", "P2"),
    (46, "Not spam", "practice differs",
     "Iteration summaries are 18 to 34 KB. The park section is cumulative and reprints parks that were landed iterations earlier, and the status line stays `in-progress` after the iteration has ended. The calibration words in code are `fyi`, `architect`, `owner` (`prompts/_calibration.md:6-8`), not the three named here.", "P10"),
    (54, "The architect is incentivized to stop", "unclear",
     "The incentive is prompt text only. Thirteen iterations ended `in-progress`; pending tasks stood at 10, 10, 3, 2, 16, 16, 10, 13, 11 from iteration 5 on, and the reviews of iterations 11 and 12 each opened a new milestone. Nothing measures the distance to done, and nothing stops a goal that is not getting closer.", "P1"),
    (55, "no slop introduced", "infeasible",
     "__R_L55__", "P1"),
    (57, "removal by the end of the same goal", "practice differs",
     "Not enforced: `done` does not look at open debt (`src/kernel/derive.ts:43-45`).", "P1"),
    (58, "subscription use", "infeasible",
     "__R_L58__", "P9"),
    (63, "In-flight tasks finish and park unmerged", "unclear",
     "All in-flight tasks, or only those the steer blocks? The code parks only the held task (`src/kernel/dispatch.ts:256-273`). Cases the line does not cover: a steer to a goal the architect has blocked, two steers with the same text, a steer the architect does not answer, a PM that misreads the steer.", "P13"),
    (79, "discard (parked until architect feedback)", "contradiction",
     "__R_L79__", "P2"),
    (80, "limits per harness", "incorrect",
     "Quotas and rate limits are per provider and model, not per harness; the code keys `perHarness` (`src/kernel/config.ts:119`) and the kernel has no throttle for the free tier. What actually limited concurrency was scope overlap: iteration 11 ran one task at a time for 309 of its 369 minutes.", "P9"),
    (84, "Supported and tested during bootstrapping", "practice differs",
     "Not met. Through iteration 12 opencode ran 159 turns, omp 9, pi and codex none. Rotation is unbuilt, one run config served all 13 iterations, and `self-acpx.yaml` was never used. \u201cOpaque config passed at launch\u201d has no path either: no run-config field reaches the harness.", "P8"),
    (85, "LSP configured for YAML/JSON", "incorrect",
     "Stated as fact; there is no LSP configuration anywhere in the repository. pi as \u201cthe recommended task-flow implementer\u201d rests on no run: it has not executed a turn.", "P11"),
    (86, "never a bespoke CLI wrapper", "contradiction",
     "The opencode adapter is exactly that, kept as a logged exception (`bootstrap/LOG.md:26`), and it carried 159 of the 168 live turns. Harness access layer pulls the other way (a direct layer where native beats ACP). Two readers build different adapter sets.", "P11"),
    (89, "documented, not enforced", "incorrect",
     "It is documented nowhere (`plan.md:368`), and for a factory that edits itself it is not enough: package tests and the live run shared temp state twice, an operator commit during iteration 13 parked a task (records 00559, 00560), and a PM turn tried `git checkout` on a task file in the live worktree (record 00290).", "P7"),
    (95, "concern store", "stale",
     "The concern store was deleted on purpose (`plan.md:51`); only the fingerprint function remains. The human-involvement presets in the next paragraph exist nowhere in code, prompts or config. The keep-list and the prune decision have to agree.", "P11"),
    (100, "Nested retry budgets compound", "practice differs",
     "The new build nests again: provider attempts, fallback hops, outcome repair, gate-fix turn, review rounds, PM rungs. 145 of 172 turns were retried, and 12 turns show 8 attempts because the ladder restarts at the exhausted free tier. Only content turns count against the item budget (`itemTurns: 8`).", "P3"),
    (104, "Architect-role launches were the biggest single cost", "practice differs",
     "Still true, and more so. v2: $5.22 of $11.01 over 81 launches. Now: $14.30 of $19.05 over 12 turns, $1.19 per launch whatever it produced. The cheap roles run on free or nearly free models, which inflates the share but not the fixed price of a launch.", "P4"),
    (107, "Strict schema (tool/yield)", "practice differs",
     "The weak point was the outcome file, not the schema: 21 repair turns, and two valid outcomes were thrown away because the session then stopped on infra (records 00090, 00222; still so at `b4a2d9f`). opencode produced 1.9% invalid outcomes, omp 22%.", "P3"),
    (128, "Code changes may sit on an unmerged branch", "unclear",
     "Who lands a goal's integration branch on the base, and when? As built nobody in the factory does: the operator merged `factory/self` into `factory-v3` by hand seven times, once resolving conflicts in three files.", "P6"),
    (131, "This factory is built by running itself", "practice differs",
     "The digest is meant to report interventions, but they are recorded only in `bootstrap/LOG.md`, outside the factory's artifacts. The `humanInterventions` metric counts processed steers: it reports 1 where the journal shows 52 operator acts through iteration 12.", "P6"),
    (133, "Always execute from a pinned last-good version", "unclear",
     "The passive voice hides the actor: `factory run` neither checks nor pins; promotion is a bootstrap script by decision D9, run by hand before every launch, with no rollback. \u201cOne fixed benchmark goal re-run each time\u201d has not happened once. `costPerMergedTask` is null in the metrics.", "P6"),
    (141, "Leverage OpenCode with the free models", "practice differs",
     "The free tier did not carry sustained work. It was exhausted on the first evening, and in the self-run 136 of 172 turns finished on the paid fallback after quota rejections. beam-free as PM failed twice and cost two iterations. Free models fit single cheap steps, not 50-turn iterations.", "P9"),
    (163, "Resilience and fallbacks", "stale",
     "This says the decision landed in Harness agnosticism and Model economics. Neither section mentions resilience or fallbacks; the words appear nowhere else in this file. The build has both: same-tier `fallbacks` for infra failures and `escalateTo` for content failures.", "P11"),
    (170, "Architect and advice add value", "stale",
     "This decision and the next one (practical knowledge: libraries, patterns, anti-patterns) did not reach the Intent text. Their wording appears only here.", "P11"),
    (182, "N6: agreed as recommended", "unclear",
     "A binding rule (park, report by root cause, autonomous continues) is recorded with \u201cno new text\u201d, so it exists only in the advisory `manifesto.advice.md`. An implementer who treats that file as advisory will not build it.", "P11"),
    (206, "All items decided", "stale",
     "Not all: N15 is \u201cunanswered\u201d, and seven `*Confirm:*` readings remain in the two decision lists above, where their introduction counts three. An implementer cannot tell whether an unconfirmed reading binds.", "P11"),
    (218, "Context pack", "undefined term",
     "Terms used as rules and defined nowhere: scope, consult, boundary, park, land, drain, gate, pin, promote, digest, front agent, slop, lines (Context economy), ingestion (Config-driven flows), top architect (Funnel), sub-epic (Iteration). Milestone has a definition and no mechanism.", "P11"),
]

# Texts that depend on swarm facts; filled from facts.py when present.
LATE = {
    "__R_L18__": "This turn is where the money goes: $15.79 of $21.25 over 13 iterations, one turn per launch whatever the launch produced. A turn is 15 to 45 requests, each re-sending the whole session at the cache-read price (0.7 to 3.2 million tokens). Through iteration 12, $6.28 went to iterations that merged one task or none.",
    "__R_L36__": "No such config key exists, and the count is ambiguous: is the main architect level 1? The level is unbuilt (six `epic-*` tasks pending) and the run shows no need yet: none of 560 records has a context-overflow stop, with one architect on a 430-line plan.",
    "__R_L55__": "\u201cSlop\u201d is undefined, and the conjunction is strict: the last review round may merge with recorded debt (R22), so a goal ends clean only if every item is removed. Reviews opened 121 distinct items in 13 iterations; 103 are closed, 18 are open, 8 of those with no task to remove them.",
    "__R_L58__": "Subscription use has no source in any harness; quota shows up only as a failed attempt. Time is unbounded by default: iteration 7 was killed by hand and iteration 11 ran 6.2 hours. Two gaps are reproduced by test: after a first interrupt the dispatcher keeps starting queued tasks, and a step that times out is retried on every relaunch.",
    "__R_L79__": "\u201cDiscard\u201d and \u201cparked\u201d are opposites. As built the branch is kept, and kept branches were merged later five times. A reader of this line may delete the branch.",
}


def render(lines):
    """Return (new_lines, report). lines are without trailing newlines."""
    out = list(lines)
    report = []
    seen = set()
    numbered = []
    for i, (ln, frag, kind, text, p) in enumerate(sorted(INLINES), 1):
        numbered.append((ln, frag, kind, LATE.get(text, text), p, f"R{i:02d}"))
    for ln, frag, kind, text, p, rid in sorted(numbered, reverse=True):
        assert ln not in seen, f"two inlines on line {ln}"
        seen.add(ln)
        src = lines[ln - 1]
        assert frag in src, f"{rid}: line {ln} does not contain {frag!r}: {src[:80]!r}"
        assert not text.startswith("__"), f"{rid}: unfilled text"
        words = len(text.split())
        body = f"**[AI Review {rid} \u00b7 {kind}]** {text} \u2192 {p}"
        m = re.match(r"^(\s*)[-*] ", src)
        if m:
            ins = [f"{m.group(1)}  - {body}"]
            at = ln
        else:
            end = ln
            while end < len(lines) and lines[end].strip() and not lines[end].startswith("#"):
                end += 1
            ins = ["", f"> {body}"]
            if end < len(lines) and lines[end].strip():
                ins.append("")
            at = end
        out[at:at] = ins
        report.append((rid, ln, kind, words, p))
    return out, sorted(report)


def main():
    src_path, fable_path, out_path = sys.argv[1:4]
    raw = open(src_path, encoding="utf-8").read()
    assert raw.endswith("\n"), "manifesto must end with a newline"
    lines = raw.split("\n")[:-1]
    new, report = render(lines)
    fable = open(fable_path, encoding="utf-8").read().strip("\n").split("\n")
    while new and not new[-1].strip():
        new.pop()
    result = "\n".join(new) + "\n\n" + "\n".join(fable) + "\n"
    open(out_path, "w", encoding="utf-8").write(result)
    for rid, ln, kind, words, p in report:
        print(f"{rid} l.{ln:<4} {kind:<17} {words:>3}w {p}")
    print(f"inlines: {len(report)}; lines {len(lines)} -> {len(result.splitlines())}")


if __name__ == "__main__":
    main()

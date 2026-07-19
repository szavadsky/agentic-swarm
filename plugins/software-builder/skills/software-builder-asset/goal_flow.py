"""USAGE: Caller sets F (str, goal file folder) and N (int, max iterations), then:
    exec(read("skill://software-builder-asset/goal_flow.py:raw"))
All logic.  Mechanical orchestration; technical work delegated
to subagents. Yields final status string via print().

DO NOT READ SCRIPT BODY UNLESS YOUR TASK IS TO DEVELOP IT




































































































"""  # end of use-barrier header (100 blank lines above)

import shutil
from pathlib import Path

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["plan_created", "goal_complete"]},
        "plan_path": {"type": "string"},
        "summary": {"type": "string"},
    },
    "required": ["status", "plan_path", "summary"],
}
IMPL_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["implemented", "partial", "failed", "blocked"]},
        "report": {"type": "string", "metadata": {"description": "Full markdown content of the execution summary; the caller writes this to disk"}},
        "committed": {"type": "boolean"},
    },
    "required": ["status", "report", "committed"],
}
CHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["complete", "concerns"]},
        "concerns": {"type": "string"},
        "summary": {"type": "string"},
        "evidenceInspected": {
            "type": "array",
            "description": "REQUIRED and non-empty for status=complete. Each entry = one plan/DoD clause INDEPENDENTLY verified against the ACTUAL artifact (the render, the generated file, the run output) — not a summary, not a verifier exit code, not a rubric checkbox. {clause, artifact, method, result}. status=complete with empty evidenceInspected is a fabrication.",
            "items": {
                "type": "object",
                "properties": {
                    "clause": {"type": "string"},
                    "artifact": {"type": "string"},
                    "method": {"type": "string"},
                    "result": {"type": "string"},
                },
                "required": ["clause", "artifact", "method", "result"],
            },
        },
    },
    "required": ["status", "concerns", "summary", "evidenceInspected"],
}
MAX_FOLLOWUPS = 2

def call_agent(plan_path, agent_name, schema, extra=None, retries=2):
    """Call a subagent with structured output; retry on glitch (exception or bad output)."""
    prompt = "Exactly follow your system prompt re: " + plan_path + ("\n\n" + extra if extra else "")
    for attempt in range(1, retries + 2):
        try:
            log(f"call_agent: {agent_name} attempt {attempt}/{retries + 1}")
            res = agent(prompt, agent=agent_name, schema=schema)
            if not isinstance(res, dict) or res.get("status") not in schema["properties"]["status"]["enum"]:
                raise ValueError(f"bad structured output: {res!r}")
            log(f"call_agent: {agent_name} → {res['status']}")
            return res
        except Exception as e:
            log(f"call_agent: {agent_name} glitch on attempt {attempt}: {e}")
    raise RuntimeError(f"{agent_name} failed after {retries + 1} attempts")

goal_file = Path(f"{F}/goal.md")
if not goal_file.is_file():
    raise ValueError(f"goal file not found: {F}/goal.md")

def iter_state(k):
    """Classify iteration k by file presence: 'done' (summary exists), 'partial' (plan only), 'empty'."""
    has_plan = Path(f"{F}/plan{k}.md").is_file()
    has_summary = Path(f"{F}/summary{k}.md").is_file()
    if has_summary:
        return "done"
    if has_plan:
        return "partial"
    return "empty"

# Resume scan: find the first iteration without a completed summary.
# 'done' iterations are skipped; the first 'partial' (plan exists, summary missing)
# resumes mid-orchestration (glitch recovery — skip re-planning); the first 'empty'
# starts fresh (plan → orchestrate). Everything from there on is fresh.
start_pIt = 1
skip_plan = False
for k in range(1, N + 1):
    st = iter_state(k)
    if st == "done":
        start_pIt = k + 1
        continue
    if st == "partial":
        skip_plan = True
    break

final = "incomplete"
for pIt in range(start_pIt, N + 1):
    plan_path = f"{F}/plan{pIt}.md"
    summary_path = f"{F}/summary{pIt}.md"

    # Back up before overwrite (RCA-F).
    for p in (plan_path, summary_path):
        if Path(p).is_file():
            shutil.copy2(p, p + ".bak")

    # Plan (skip on glitch recovery) or terminate early if goal is complete.
    extra = None
    if skip_plan:
        extra = "It is relaunch of execution after glitch. Use fact-finder first to find out what is already done and what is left, then execute only remaining subtasks."
        skip_plan = False
    else:
        plan_result = call_agent(plan_path, "plan-goal-execution", PLAN_SCHEMA)
        if plan_result["status"] == "goal_complete":
            final = f"goal complete after {pIt} planning pass(es)"
            break

    # Orchestrate + follow-up loop (single call site per subagent).
    # extra is set by: skip (glitch recovery), checker feedback (follow-up), or None (fresh).
    for followup_count in range(MAX_FOLLOWUPS + 1):
        impl_result = call_agent(plan_path, "orchestrate-goal-execution", IMPL_SCHEMA, extra=(extra or "")+"\n Remember: you are ORCHESTRATOR and need to strongly follow your system prompt. You focus is tasks and their split, not the implementation. `subtask-dev-process` will strictly follow proper software development process to implement")
        # The orchestrator returns the summary markdown in `report`; the eval persists it.
        Path(summary_path).write_text(impl_result.get("report", ""))
        extra = None  # consumed

        if impl_result["status"] in {"failed", "blocked"}:
            final = f"halted at iteration {pIt}: {impl_result['status']}"
            break

        check_result = call_agent(plan_path, "plan-completeness-checker", CHECK_SCHEMA)
        if check_result["status"] == "complete":
            break
        if followup_count == MAX_FOLLOWUPS:
            with open(summary_path, "a") as f:
                f.write("\n\n## Extra concerns from plan completeness checker\n\n" + check_result["concerns"])
            break
        extra = "Follow-up launch — plan completeness checker had these concerns:\n" + check_result["concerns"]

    if impl_result["status"] in {"failed", "blocked"}:
        break

    if pIt == N:
        final = f"max iterations ({N}) reached; last summary: {summary_path}"
        break

print(final)
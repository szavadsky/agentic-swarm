"""
USAGE: Caller sets TASK_FILE (str, path to task spec file), then:
    exec(read("skill://software-builder-asset/subtask_dev_process.py:raw"))

DO NOT READ SCRIPT BODY UNLESS YOUR TASK IS TO DEVELOP IT




































































































"""  # end of use-barrier header (100 blank lines above)

MAX_ITERATIONS = 3


CONCERN_ITEM = {
    "type": "object",
    "properties": {
        "slug": {"type": "string"},
        "resolution": {"type": "string"},
    },
    "required": ["slug", "resolution"],
}
CONCERN_ARRAY = {"type": "array", "items": CONCERN_ITEM}
IMPL_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["implemented", "partial", "failed", "blocked"]},
        "summary": {"type": "string"},
        "planConcerns": CONCERN_ARRAY,
        "responseToReviewer": {"type": "string"},
    },
    "required": ["status", "summary", "planConcerns", "responseToReviewer"],
}
CHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["implemented", "partial", "failed", "blocked"]},
        "committed": {"type": "boolean"},
        "implementationConcerns": CONCERN_ARRAY,
        "extraPlanConcerns": CONCERN_ARRAY,
        "planConcernNotes": {"type": "string"},
    },
    "required": ["status", "committed", "implementationConcerns", "extraPlanConcerns", "planConcernNotes"],
}


def concerns_text(concerns):
    if not concerns:
        return "(none)"
    return "\n".join(f"- [{c['slug']}]: {c['resolution']}" for c in concerns)


def merge_concerns(acc, new_concerns):
    for c in new_concerns or []:
        acc[c["slug"]] = c


def log(msg):
    print(f"[subtask-dev-process] {msg}")


def log_prompt(label, prompt):
    """Log prompt: label, first 50 chars (verbatim), total size."""
    preview = prompt[:50].replace("\n", "\\n")
    log(f'{label} prompt [{len(prompt)} chars]: "{preview}{"..." if len(prompt) > 50 else ""}"')


def log_response(label, result):
    """Log structured response: status + key fields."""
    status = result.get("status", "?")
    extras = []
    for k in ("planConcerns", "implementationConcerns", "extraPlanConcerns", "committed"):
        if k in result:
            v = result[k]
            extras.append(f"{k}={len(v) if isinstance(v, list) else v}")
    log(f"{label} response: status={status}, {', '.join(extras)}")

exec(read("skill://software-builder-asset/task_spec.py:raw"))

try:
    c = build_task_content(TASK_FILE)
except ValueError as e:
    log(f"invalid task spec: {e}")
    result = {"status": "failed", "concerns": [], "committed": False}
    log(f"final: failed, committed: False, total concerns: 0")
    getattr(tool, "yield")({"result": {"data": result}})
    raise SystemExit(0)
TASK_PROMPT = (
    "Develop this task.\n\n"
    + (f"Prerequisites (plan lines):\n{c['pre']}\n\n" if c["pre"] else "")
    + f"Task (plan lines):\n{c['task']}\n"
    + (f"\n\nExtra context (learned during execution, not in plan):\n{c['extra']}" if c["extra"] else "")
)

CHECK_PROMPT = (
    "Check: is this fully done? Verify the implementation against the task below.\n\n"
    + (f"Prerequisites (plan lines):\n{c['pre']}\n\n" if c["pre"] else "")
    + f"Task (plan lines):\n{c['task']}\n"
    + (f"\n\nExtra context:\n{c['extra']}" if c["extra"] else "")
    + "\n\nImplementer summary: "
)

all_plan_concerns = {}
all_plan_notes = []
final_status = "failed"
final_committed = False
prev_impl_concerns = []
last_impl_concerns = []

for iteration in range(1, MAX_ITERATIONS + 1):
    is_last = iteration == MAX_ITERATIONS
    log(f"iteration {iteration}/{MAX_ITERATIONS}{' (FINAL)' if is_last else ''}")

    # --- implement-subtask ---
    impl_prompt = ""
    if iteration > 1:
        impl_prompt += (
            "\n\nReviewer raised concerns on previous iteration:\n"
            + concerns_text(prev_impl_concerns)
            + "\nAddress these. Your task was\n -----\n"
        )
    impl_prompt += TASK_PROMPT
    log_prompt(f"iter {iteration} implement-subtask", impl_prompt)

    try:
        impl_result = agent(impl_prompt, agent="implement-subtask", schema=IMPL_SCHEMA)
    except Exception as e:
        log(f"implement-subtask failed: {e}")
        impl_result = {"status": "failed", "summary": "", "planConcerns": [], "responseToReviewer": ""}

    log_response(f"iter {iteration} implement-subtask", impl_result)
    merge_concerns(all_plan_concerns, impl_result.get("planConcerns", []))

    if impl_result["status"] in ("blocked", "failed"):
        final_status = impl_result["status"]
        break

    # --- check-and-commit-subtask ---
    check_prompt = CHECK_PROMPT + impl_result.get("summary", "")

    impl_plan_concerns = impl_result.get("planConcerns", [])
    if impl_plan_concerns:
        check_prompt += "\n\nImplementer had the following plan concerns. Check adversarially:\n" + concerns_text(
            impl_plan_concerns
        )

    if iteration > 1:
        response = impl_result.get("responseToReviewer", "")
        if response:
            check_prompt += "\n\nImplementer response to your previous concerns:\n" + response + "\nCheck adversarially."

    if is_last:
        check_prompt += "\n\nFINAL CALL. Commit with follow up concerns or clean up if it does more harm than good."

    log_prompt(f"iter {iteration} check-and-commit", check_prompt)

    try:
        check_result = agent(check_prompt, agent="check-and-commit-subtask", schema=CHECK_SCHEMA)
    except Exception as e:
        log(f"check-and-commit-subtask failed: {e}")
        check_result = {
            "status": "failed",
            "committed": False,
            "implementationConcerns": [],
            "extraPlanConcerns": [],
            "planConcernNotes": "",
        }

    log_response(f"iter {iteration} check-and-commit", check_result)
    merge_concerns(all_plan_concerns, check_result.get("extraPlanConcerns", []))
    notes = check_result.get("planConcernNotes", "")
    if notes:
        all_plan_notes.append(notes)
        log(f"  planConcernNotes: {notes[:80]}{'...' if len(notes) > 80 else ''}")

    final_committed = check_result.get("committed", False)
    final_status = check_result["status"]
    last_impl_concerns = check_result.get("implementationConcerns", [])

    if check_result["status"] != "partial":
        break

    prev_impl_concerns = last_impl_concerns

# Final concerns: accumulated plan concerns + last iteration implementation concerns
final_concerns = list(all_plan_concerns.values()) + last_impl_concerns

result = {
    "status": final_status,
    "concerns": final_concerns,
    "committed": final_committed,
}
log(f"final: {final_status}, committed: {final_committed}, total concerns: {len(final_concerns)}")
getattr(tool, "yield")({"result": {"data": result}})
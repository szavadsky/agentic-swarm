"""
Shared task-spec schema, loader, line extractor, and validator.

Used by:
  - orchestrate-goal-execution: validates a wave's YAML task specs via eval (one shot)
    before spawning dev agents. Minimal output: "N files OK" or telegraphic problems.
  - subtask_dev_process.py: loads a YAML task spec, extracts the actual plan line
    ranges, and builds implementer/checker prompts with the EXTRACTED content.
    No plan name or plan path is passed downstream ("here is your task to
    develop" / "here is your task to validate").

Load via:
    exec(read("skill://software-builder-asset/task_spec.py:raw"))

Then available: TASK_SPEC_FIELDS, extract_lines, load_task_spec,
validate_task_spec, validate_task_specs, build_task_content.

Task spec YAML schema:
    plan: /abs/path/to/planN.md   # REQUIRED. Absolute path to plan file.
    lns:  ["25-35", "40"]         # REQUIRED. Line ranges in plan for the ACTUAL task.
    pre:  ["10-12"]               # OPTIONAL. Line ranges in plan for prerequisites.
    extra: |                      # OPTIONAL. Prose. ONLY if something NOT in the plan
      ...                        #   was learned during execution (fact-finder/oracle/relaunch).

Line ranges are 1-based inclusive: "25" = line 25; "25-35" = lines 25..35.
"""
# end of header


import yaml
from pathlib import Path


TASK_SPEC_FIELDS = {
    "plan":  "required string — absolute path to plan file",
    "lns":   "required non-empty array of line-range strings (e.g. ['25-35', '40']) — the actual task lines in the plan",
    "pre":   "optional array of line-range strings — prerequisite lines in the plan",
    "extra": "optional string — prose; only if something not in the plan was learned during execution",
}


def _resolve_spec(path):
    """Resolve a task-spec YAML path: absolute first, else cwd-relative. Raise if not found."""
    p = Path(path)
    if p.is_absolute() and p.is_file():
        return p
    p2 = Path.cwd() / path
    if p2.is_file():
        return p2
    raise FileNotFoundError(f"task spec not found (absolute or cwd-relative): {path}")


def _parse_range(r):
    """Parse '25-35' or '25' -> (start, end) inclusive, 1-based."""
    r = str(r).strip()
    if "-" in r:
        a, b = r.split("-", 1)
        return int(a), int(b)
    n = int(r)
    return n, n


def extract_lines(plan_path, ranges):
    """Read plan file; extract the given line ranges; return numbered text (1-based, inclusive)."""
    lines = Path(plan_path).read_text().splitlines()
    out = []
    for r in (ranges or []):
        a, b = _parse_range(r)
        for i in range(a, min(b, len(lines)) + 1):
            out.append(f"{i}: {lines[i-1]}")
    return "\n".join(out)


def load_task_spec(path):
    """Resolve + parse YAML. Does NOT validate. Use validate_task_spec / build_task_content for that."""
    return yaml.safe_load(_resolve_spec(path).read_text())


def validate_task_spec(path):
    """Return (ok, problems). Checks schema + that line ranges fit inside the plan file."""
    problems = []
    try:
        p = _resolve_spec(path)
    except FileNotFoundError as e:
        return False, [str(e)]
    try:
        data = yaml.safe_load(p.read_text())
    except Exception as e:
        return False, [f"YAML parse error: {e}"]
    if not isinstance(data, dict):
        return False, ["top-level must be a mapping"]

    plan = data.get("plan")
    nlines = None
    if not isinstance(plan, str) or not plan:
        problems.append("plan: required string (absolute path to plan file)")
    else:
        pp = Path(plan)
        if not pp.is_absolute():
            problems.append(f"plan: must be absolute path, got '{plan}'")
        if not pp.is_file():
            problems.append(f"plan: file not found: {plan}")
        elif pp.is_absolute():
            nlines = len(pp.read_text().splitlines())

    def _check_ranges(field, ranges):
        if ranges is None:
            return
        if not isinstance(ranges, list):
            problems.append(f"{field}: must be array of line-range strings")
            return
        for r in ranges:
            try:
                a, b = _parse_range(r)
            except Exception:
                problems.append(f"{field}: unparseable range {r!r}")
                continue
            if a < 1 or b < a:
                problems.append(f"{field}: bad range '{r}'")
            elif nlines is not None and b > nlines:
                problems.append(f"{field}: range '{r}' exceeds plan lines ({nlines})")

    lns = data.get("lns")
    if not isinstance(lns, list) or not lns:
        problems.append("lns: required non-empty array of line-range strings")
    else:
        _check_ranges("lns", lns)

    _check_ranges("pre", data.get("pre"))

    extra = data.get("extra")
    if extra is not None and not isinstance(extra, str):
        problems.append("extra: must be string (prose)")

    return (len(problems) == 0), problems


def validate_task_specs(paths):
    """Batch validate. Minimal output: 'N files OK' or telegraphic problem list.
    Empty `paths` is a misuse (no dev subtasks → don't call validation)."""
    if not paths:
        return "PROBLEM: empty spec list — nothing to validate (no dev subtasks this wave? then skip validation)"
    n_ok = 0
    bad = []
    for path in paths:
        ok, problems = validate_task_spec(path)
        if ok:
            n_ok += 1
        else:
            bad.append(f"{Path(path).name}: " + "; ".join(problems))
    if not bad:
        return f"{n_ok} files OK"
    return "PROBLEMS:\n" + "\n".join(bad)

def validate_task_specs_in(folder, names):
    """Batch validate task specs in a folder. `names` = list of task spec filenames
    (basenames, not paths). Resolves each against `folder` (absolute-first, then
    folder-relative). Minimal output: 'N files OK' or telegraphic problem list."""
    folder = Path(folder)
    paths = []
    for n in names:
        p = Path(n)
        if not p.is_absolute():
            p = folder / n
        paths.append(p)
    return validate_task_specs(paths)


def build_task_content(path):
    """Load + validate + extract. Returns dict {task, pre, extra} for prompt construction.
    Raises ValueError on invalid spec."""
    ok, problems = validate_task_spec(path)
    if not ok:
        raise ValueError(f"invalid task spec {path}:\n" + "\n".join(problems))
    data = load_task_spec(path)
    task = extract_lines(data["plan"], data.get("lns", []))
    pre = extract_lines(data["plan"], data.get("pre", [])) if data.get("pre") else ""
    extra = (data.get("extra") or "").strip()
    return {"task": task, "pre": pre, "extra": extra}
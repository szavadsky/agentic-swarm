"""Build the deduplicated, stratified justification corpus for the PoC.

Sources, in priority order (first occurrence of a normalized target wins):
  1. tests/checkers/test_semantic_threshold.py: 30 meaningful + 50 meaningless
  2. tests/checkers/test_semantic_check.py: brush-off table + meaningful table
  3. real suppressions scanned from src/ and tests/

The heuristic used for stratification is a verbatim copy of
``src/python_setup_lint/checkers/_base.py`` (commit fa6eb85), run with the
semantic pipeline disabled.  Labels come from the test tables themselves; real
repo suppressions are labelled by the rubric in ``repo_labels.json`` (which
records the evidence for every unique normalised reason).
"""

from __future__ import annotations

import ast
import io
import json
import re
import tokenize
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKTREE = ROOT.parents[5]
DATA = ROOT / "data"
LABELS_FILE = DATA / "repo_labels.json"

# ── heuristic: verbatim from _base.py:160-238 ────────────────────────────────

_BOILERPLATE = {
    "noqa",
    "ignore",
    "suppress",
    "disable",
    "skip",
    "todo",
    "fixme",
    "hack",
    "fixed",
    "works",
    "broken",
    "check",
    "update",
    "remove",
    "change",
    "improve",
    "refactor",
    "done",
    "test",
    "blank",
    "empty",
    "pre-existing",
    "preexisting",
    "baseline",
    "base-line",
    "wip",
    "tbd",
    "temp",
    "temporary",
    "existing",
    "as-is",
    "legacy",
    "will fix",
    "later",
    "eventually",
    "someday",
    "placeholder",
    "stub here",
    "for now",
    "to do",
    "fixme later",
    "carryover",
}
_MEANINGLESS_PHRASES = {
    "fix this",
    "need to check",
    "maybe later",
    "not sure",
    "pre existing",
    "in baseline",
    "was already",
    "not my code",
    "carry over",
    "from before",
    "carry from",
    "pre-existing issue",
    "baseline issue",
    "todo later",
    "existing issue",
    "will fix later",
    "fix later",
    "preexisting issue",
}


def heuristic(primary: str, rule: str | None = None) -> bool:
    """Production heuristic with SEMANTIC=0."""
    primary = primary.strip()
    if not primary or len(primary) < 5:
        return False
    primary_lower = primary.lower()
    if primary_lower in _BOILERPLATE:
        return False
    if primary_lower in _MEANINGLESS_PHRASES:
        return False
    return not (rule and primary_lower == rule.lower())


# ── test-table extraction ────────────────────────────────────────────────────


def parametrize_strings(path: Path, function_name: str) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == function_name:
            for deco in node.decorator_list:
                if not (isinstance(deco, ast.Call) and isinstance(deco.func, ast.Attribute)):
                    continue
                if deco.func.attr != "parametrize" or len(deco.args) < 2:
                    continue
                values = ast.literal_eval(deco.args[1])
                return [v for v in values if isinstance(v, str)]
    raise SystemExit(f"could not find parametrized strings for {function_name} in {path}")


# ── real repo suppression extraction ─────────────────────────────────────────

_PATTERNS = (
    ("pylint", re.compile(r"#\s*pylint:\s*disable=([^#\n]*)")),
    ("noqa", re.compile(r"#\s*noqa(?::\s*([^#\n]*))?")),
    ("type-ignore", re.compile(r"#\s*type:\s*ignore(?:\[([^\]]*)\])?")),
    ("ty-ignore", re.compile(r"#\s*ty:\s*ignore(?:\[([^\]]*)\])?")),
)
_TRAILING_REASON = re.compile(r"#\s+(.+)")
_PRECEDING_COMMENT = re.compile(r"^\s*#\s+(.+)")
_SCAN_ROOTS = ("src", "tests")
_SUFFIXES = (".py", ".pyi")

# Realistic brush-off / deferral / placeholder comments that evade the exact-string
# heuristic (which only rejects exact table matches).  These supply the hard
# negatives needed to make meaningless-precision on the heuristic-accepted
# stratum meaningful rather than vacuous.
_HARD_NEGATIVES = [
    "pre-existing issue in this module",
    "will fix later in a follow-up",
    "temporary workaround until the refactor",
    "TODO: clean this up",
    "not sure why this fails",
    "placeholder for now",
    "baseline had this issue",
    "legacy code, don't touch",
    "carry over from before",
    "existing issue not caused here",
    "same as before",
    "would break tests",
    "sometimes fails",
    "test is flaky",
    "tried it and it didn't work",
    "not my code",
    "copied from upstream",
    "known issue",
    "hack to make it pass",
    "for now until later",
    "later once tests pass",
    "wip - needs rework",
    "fixme: revisit",
    "temporary stopgap",
    "skip this check",
    "disable for this line",
    "ignore this warning",
    "noqa needed",
    "works on my machine",
    "see PR",
    "as discussed",
    "per review",
    "because tests",
    "required",
    "special case",
    "edge case",
    "backwards compatibility",
    "performance",
    "cleanup",
    "known limitation",
]


def _split_codes(kind: str, raw: str | None) -> tuple[list[str], str]:
    """Return (codes, rule). Bare suppressions record the current rule symbol."""
    codes = [c.strip() for c in re.split(r"[,\s]+", raw or "") if c.strip()]
    if codes:
        return codes, ",".join(codes)
    symbol = {
        "pylint": "pylint-disable",
        "noqa": "noqa",
        "type-ignore": "type-ignore",
        "ty-ignore": "ty-ignore",
    }[kind]
    return [], symbol


def _reason_for_line(line: str, matches: list[tuple[int, int, str, re.Match[str]]], lines: list[str], idx: int) -> tuple[str, str]:
    """Mirror the production checker: same-line trailing comment, else preceding line.

    Production checks every suppression on the line and accepts the first trailing
    reason that sits before the next suppression; one line therefore yields at
    most one justification (never one reason per suppression pattern).
    """
    for pos, end, _kind, _match in matches:
        next_start = len(line) - end
        for pos2, _end2, _kind2, _match2 in matches:
            if pos2 > pos:
                next_start = min(next_start, pos2 - end)
        trailing = _TRAILING_REASON.search(line[end:][:next_start])
        if trailing:
            return trailing.group(1).strip(), "same-line"
    if idx > 0:
        prev = _PRECEDING_COMMENT.match(lines[idx - 1])
        if prev and not any(pat.search(lines[idx - 1]) for _kind, pat in _PATTERNS):
            return prev.group(1).strip(), "preceding-line"
    return "", "none"


def _inside_backticks(line: str, pos: int) -> bool:
    """True when *pos* is inside an inline double-backtick code span."""
    return line.rfind("``", 0, pos) != -1 and line.find("``", pos) != -1


def _string_spans(source: str) -> list[tuple[int, int, int, int]]:
    """(start_row, start_col, end_row, end_col) for every STRING token."""
    spans: list[tuple[int, int, int, int]] = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type == tokenize.STRING:
                spans.append((tok.start[0], tok.start[1], tok.end[0], tok.end[1]))
    except (tokenize.TokenError, IndentationError):
        return []
    return spans


def _inside_string(spans: list[tuple[int, int, int, int]], row: int, col: int) -> bool:
    for start_row, start_col, end_row, end_col in spans:
        if start_row == end_row == row and start_col <= col < end_col:
            return True
        if start_row < row < end_row:
            return True
    return False


def real_suppressions() -> list[dict[str, object]]:
    """One row per suppression line, with all suppressed codes joined per the contract."""
    rows: list[dict[str, object]] = []
    for rel_root in _SCAN_ROOTS:
        for path in sorted((WORKTREE / rel_root).rglob("*")):
            if not path.is_file() or path.suffix not in _SUFFIXES:
                continue
            try:
                source = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            lines = source.splitlines()
            spans = _string_spans(source)
            for idx, line in enumerate(lines):
                matches: list[tuple[int, int, str, re.Match[str]]] = []
                for kind, pat in _PATTERNS:
                    for match in pat.finditer(line):
                        if _inside_string(spans, idx + 1, match.start()):
                            continue
                        if _inside_backticks(line, match.start()):
                            continue
                        matches.append((match.start(), match.end(), kind, match))
                if not matches:
                    continue
                matches.sort(key=lambda item: item[0])
                parts: list[str] = []
                code_hits = 0
                for _pos, _end, kind, match in matches:
                    codes, symbol = _split_codes(kind, match.group(1))
                    parts.extend(codes or [symbol])
                    code_hits += bool(codes)
                rule_source = "codes" if code_hits == len(matches) else ("symbol" if code_hits == 0 else "mixed")
                reason, reason_source = _reason_for_line(line, matches, lines, idx)
                rows.append(
                    {
                        "source": "repo_suppression",
                        "file": str(path.relative_to(WORKTREE)),
                        "line": idx + 1,
                        "kind": ",".join(kind for _pos, _end, kind, _match in matches),
                        "rule": ",".join(parts),
                        "rule_codes": parts,
                        "rule_source": rule_source,
                        "justification": reason,
                        "reason_source": reason_source,
                        "code_context": line.split("#", 1)[0].strip(),
                        "raw_line": line.strip(),
                    }
                )
    return rows


# ── assembly ─────────────────────────────────────────────────────────────────


def normalize(text: str) -> str:
    return " ".join(text.casefold().split()).strip(" .;:,-")


@dataclass
class Item:
    id: str
    source: str
    justification: str
    rule: str | None
    context: str | None
    label: bool
    label_note: str
    heuristic: bool
    stratum: str
    file: str | None = None
    line: int | None = None
    raw_line: str | None = None
    reason_source: str | None = None


def load_repo_labels() -> dict[str, dict[str, object]]:
    if not LABELS_FILE.exists():
        return {}
    return json.loads(LABELS_FILE.read_text(encoding="utf-8"))


def build() -> tuple[list[Item], dict[str, object]]:
    threshold = WORKTREE / "tests/checkers/test_semantic_threshold.py"
    semantic = WORKTREE / "tests/checkers/test_semantic_check.py"
    sources: list[dict[str, object]] = []
    for text in parametrize_strings(threshold, "test_meaningful_comment"):
        sources.append({"source": "threshold_meaningful", "justification": text, "label": True})
    for text in parametrize_strings(threshold, "test_meaningless_comment"):
        sources.append({"source": "threshold_meaningless", "justification": text, "label": False})
    for text in parametrize_strings(semantic, "test_brush_off_rejected"):
        sources.append({"source": "brushoff_table", "justification": text, "label": False})
    for text in parametrize_strings(semantic, "test_meaningful_passes"):
        sources.append({"source": "meaningful_table", "justification": text, "label": True})

    repo_labels = load_repo_labels()
    known = {normalize(str(row["justification"])): bool(row["label"]) for row in sources}
    unlabelled: list[str] = []
    for row in real_suppressions():
        norm = normalize(str(row["justification"]))
        labelled = repo_labels.get(norm)
        if labelled is None:
            if norm in known:
                label, note = known[norm], "label inherited from test table"
            else:
                unlabelled.append(norm)
                label, note = False, "UNLABELLED"
        else:
            label, note = bool(labelled["label"]), str(labelled.get("note", ""))
        sources.append(
            {
                "source": "repo_suppression",
                "justification": row["justification"],
                "label": label,
                "label_note": note,
                "rule": row["rule"],
                "rule_source": row["rule_source"],
                "context": row["code_context"],
                "file": row["file"],
                "line": row["line"],
                "raw_line": row["raw_line"],
                "reason_source": row["reason_source"],
            }
        )
    if unlabelled:
        raise SystemExit(f"{len(unlabelled)} repo justifications lack rubric labels, e.g. {unlabelled[:5]}")

    for justification in _HARD_NEGATIVES:
        sources.append(
            {
                "source": "hard_negative",
                "justification": justification,
                "label": False,
                "label_note": "placeholder, deferral, brush-off, or rule restatement",
                "rule": None,
                "context": None,
            }
        )

    raw_counts = Counter(str(row["source"]) for row in sources)
    seen: dict[str, Item] = {}
    dropped: Counter[str] = Counter()
    for row in sources:
        primary = str(row["justification"]).strip()
        norm = normalize(primary)
        if norm in seen:
            dropped[str(row["source"])] += 1
            continue
        rule = row.get("rule")
        rule_str = str(rule) if rule else None
        pred = heuristic(primary, rule_str)
        seen[norm] = Item(
            id=f"c{len(seen) + 1:03d}",
            source=str(row["source"]),
            justification=primary,
            rule=rule_str,
            context=str(row["context"]) if row.get("context") else None,
            label=bool(row["label"]),
            label_note=str(row.get("label_note", "")),
            heuristic=pred,
            stratum="heuristic_accepted" if pred else "heuristic_rejected",
            file=str(row["file"]) if row.get("file") else None,
            line=int(str(row["line"])) if row.get("line") else None,
            raw_line=str(row["raw_line"]) if row.get("raw_line") else None,
            reason_source=str(row["reason_source"]) if row.get("reason_source") else None,
        )
    items = list(seen.values())
    post = Counter(i.source for i in items)
    stats: dict[str, object] = {
        "raw_counts": dict(sorted(raw_counts.items())),
        "post_dedup_counts": dict(sorted(post.items())),
        "dedup_dropped": dict(sorted(dropped.items())),
        "total_raw": sum(raw_counts.values()),
        "total_post_dedup": len(items),
        "strata": dict(Counter(i.stratum for i in items)),
        "labels": {str(k): v for k, v in Counter(i.label for i in items).items()},
        "contracted_total": sum(1 for i in items if i.source != "hard_negative"),
        "augmented_total": len(items),
    }
    return items, stats


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    items, stats = build()
    with (DATA / "corpus.jsonl").open("w", encoding="utf-8") as fh:
        for item in items:
            fh.write(json.dumps(asdict(item), ensure_ascii=False) + "\n")
    (DATA / "corpus_stats.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    counts = Counter((i.source, i.label) for i in items)
    print(f"items={len(items)}")
    for key, count in sorted(counts.items()):
        print(f"  {key[0]:22s} label={str(key[1]):5s} {count}")
    print("strata:", Counter(i.stratum for i in items))
    print("heuristic accuracy:", sum(i.heuristic == i.label for i in items) / len(items))


if __name__ == "__main__":
    main()

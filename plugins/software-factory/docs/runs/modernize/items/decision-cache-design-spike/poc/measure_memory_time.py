"""Measure the three pylint loads under the runner's 2048 MB RLIMIT_AS.

Also records the ML runtime availability and the sibling model-eval PoC stats
that inform the ONNX-vs-torch note.  Writes ``out/memory_time.json``.
"""

from __future__ import annotations

import importlib.util
import json
import re
import resource
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

POC = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parents[6]
TMP = POC / "tmp" / "memory_time"
OUT = POC / "out"
PROJECT = TMP / "project"
MODEL_EVAL_OUT = POC.parents[1] / "model-eval-poc" / "poc" / "out"
RLIMIT_AS_MB = 2048
TIMEOUT_SECONDS = 120

_ELAPSED_RE = re.compile(r"Elapsed \(wall clock\) time \(h:mm:ss or m:ss\): (?P<value>\S+)")
_RSS_RE = re.compile(r"Maximum resident set size \(kbytes\): (?P<value>\d+)")


def _limit() -> None:
    if RLIMIT_AS_MB > 0:
        limit = RLIMIT_AS_MB * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))


def _parse_elapsed(text: str) -> float | None:
    match = _ELAPSED_RE.search(text)
    if match is None:
        return None
    parts = match.group("value").split(":")
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part)
    return seconds


def setup_project() -> None:
    """Create a minimal project covering the three pylint scopes."""
    shutil.rmtree(PROJECT, ignore_errors=True)
    (PROJECT / "src").mkdir(parents=True)
    (PROJECT / "tests").mkdir(parents=True)
    (PROJECT / "src" / "app.py").write_text(
        "from beartype import beartype\n\n\n"
        "@beartype\ndef load() -> int:\n    return 1\n\n\nVALUE = load()\n",
        encoding="utf-8",
    )
    (PROJECT / "src" / "app.pyi").write_text(
        "from beartype import beartype\n\n\n"
        "@beartype\ndef load() -> int: ...\n",
        encoding="utf-8",
    )
    (PROJECT / "tests" / "test_app.py").write_text(
        '"""Fixture test module."""\n\n\ndef test_value() -> None:\n    """Check a trivial assertion."""\n    value = 2\n    assert value == 2\n',
        encoding="utf-8",
    )


def package_present(name: str) -> bool:
    """Return whether *name* is importable without importing it."""
    return importlib.util.find_spec(name) is not None


def measure_load(name: str, rcfile: Path, target: str) -> dict[str, object]:
    """Run one pylint invocation under RLIMIT_AS and parse time/RSS."""
    command = [sys.executable, "-m", "pylint", f"--rcfile={rcfile}", target]
    wrapped = ["/usr/bin/time", "-v", *command]
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            wrapped,
            cwd=PROJECT,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            check=False,
            preexec_fn=_limit,
        )
        timed_out = False
        exit_code = completed.returncode
        stdout, stderr = completed.stdout, completed.stderr
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        exit_code = -1
        stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")
    elapsed = time.perf_counter() - started
    combined = stdout + stderr
    return {
        "name": name,
        "command": command,
        "rcfile": str(rcfile),
        "target": target,
        "exit_code": exit_code,
        "timed_out": timed_out,
        "elapsed_seconds": round(elapsed, 3),
        "time_reported_seconds": _parse_elapsed(stderr),
        "peak_rss_mb": round(int(match.group("value")) / 1024, 2) if (match := _RSS_RE.search(stderr)) else None,
        "memory_error": "MemoryError" in combined,
        "stdout_tail": stdout.strip().splitlines()[-2:],
        "stderr_tail": stderr.strip().splitlines()[-2:],
    }


def model_eval_stats() -> dict[str, dict[str, Any]]:
    """Read the sibling model-eval PoC's per-model resource stats."""
    stats: dict[str, dict[str, Any]] = {}
    if not MODEL_EVAL_OUT.is_dir():
        return stats
    for path in sorted(MODEL_EVAL_OUT.glob("meta__*.json")):
        if "__canonical" not in path.name and "__current" not in path.name:
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        stats[str(raw.get("model", path.stem))] = {
            "params": raw.get("params"),
            "weights_bytes": raw.get("weights_bytes"),
            "load_seconds": raw.get("load_seconds"),
            "total_seconds": raw.get("total_seconds"),
            "peak_rss_mb": raw.get("peak_rss_mb"),
            "torch": raw.get("torch"),
            "sentence_transformers": raw.get("sentence_transformers"),
        }
    return stats


def main() -> int:
    """Run measurements and write the JSON report."""
    OUT.mkdir(parents=True, exist_ok=True)
    setup_project()
    rcfiles = {
        "pylint": REPO_ROOT / "config" / ".pylintrc",
        "pylint-pyi": REPO_ROOT / "config" / ".pylintrc-pyi",
        "pylint tests": REPO_ROOT / "config" / ".pylintrc-tests",
    }
    targets = {"pylint": "src/app.py", "pylint-pyi": "src/app.pyi", "pylint tests": "tests/test_app.py"}
    loads = [measure_load(name, rcfiles[name], targets[name]) for name in ("pylint", "pylint-pyi", "pylint tests")]
    stats = model_eval_stats()
    over_cap = {
        name: data["peak_rss_mb"]
        for name, data in stats.items()
        if isinstance(data.get("peak_rss_mb"), (int, float)) and data["peak_rss_mb"] > RLIMIT_AS_MB
    }
    report = {
        "rlimit_as_mb": RLIMIT_AS_MB,
        "loads": loads,
        "total_elapsed_seconds": round(sum(float(str(load["elapsed_seconds"])) for load in loads), 3),
        "all_loads_under_rlimit": all(not load["memory_error"] and load["exit_code"] == 0 for load in loads),
        "ml_runtime": {
            name: "present" if package_present(name) else "absent"
            for name in ("torch", "onnxruntime", "sentence_transformers", "transformers")
        },
        "model_eval_stats": stats,
        "model_eval_over_2048mb": over_cap,
        "onnx_vs_torch_note": (
            "torch/onnxruntime are absent from this dev environment. The sibling model-eval PoC "
            "(torch 2.10 CPU + sentence-transformers) measured peak RSS 556-2846 MB: minilm 556 MB, "
            "bekko-17m 624 MB, ettin-150m 991 MB, decider-nano 1464 MB, GLiDE 2846 MB. GLiDE exceeds "
            "the runner's 2048 MB RLIMIT_AS; decider-nano is close. The model-eval research also notes "
            "bekko's upstream ONNX browser model is ~29 MB versus 67 MB safetensors, so an ONNX path "
            "is plausible; however ONNX Runtime is expected to avoid torch's import/framework overhead "
            "and lower peak RSS only as an unverified hypothesis. I5 must benchmark the chosen model "
            "under RLIMIT_AS=2048 in the pylint subprocess and prefer ONNX only if it fits without "
            "raising the runner cap."
        ),
        "three_load_note": (
            "The runner invokes pylint, pylint-pyi and pylint tests as three sequential subprocesses. "
            "A model backend is loaded lazily per process, so up to three model loads per lint run "
            "unless every suppression is a cache hit. Cache hits avoid model load entirely; refresh "
            "should populate the tracked cache before normal lint in CI."
        ),
    }
    (OUT / "memory_time.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for load in loads:
        print(
            f"{load['name']:14} exit={load['exit_code']} wall={load['elapsed_seconds']}s "
            f"peak={load['peak_rss_mb']}MB memory_error={load['memory_error']}"
        )
    print(f"all under RLIMIT_AS={RLIMIT_AS_MB}MB: {report['all_loads_under_rlimit']}")
    print(f"over cap (model-eval): {over_cap or 'none'}")
    print(f"report: {OUT / 'memory_time.json'}")
    return 0 if report["all_loads_under_rlimit"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

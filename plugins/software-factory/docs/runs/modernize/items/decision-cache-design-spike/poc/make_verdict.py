"""Assemble the machine-readable spike verdict from the proof outputs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

POC = Path(__file__).resolve().parent
OUT = POC / "out"


def load(name: str) -> dict[str, Any]:
    """Load one proof output."""
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def main() -> int:
    """Write ``out/verdict.json``."""
    proofs = load("proofs.json")
    memory = load("memory_time.json")
    required = ["proof_1_heuristic_rejected_without_backend", "proof_2_accepted_hit_equals_persisted", "proof_3_accepted_miss_absent_heuristic_true", "proof_4_normal_lint_zero_writes_by_hash"]
    all_ok = proofs.get("verdict") == "feasible" and all(proofs.get(name, {}).get("ok") is True for name in required)
    verdict = {
        "verdict": "feasible" if all_ok else "blocked",
        "contract": {
            "project_root": {
                "value": "config.cwd",
                "guard": "resolved cache path must stay within cwd; symlink, parent and absolute escapes rejected",
                "evidence": ["contract_root_guard", "contract_checker_root_hint"],
            },
            "schema": {
                "top_level": "JSON array",
                "entry_fields": ["decision", "files", "justification", "key", "last_seen", "model", "prompt_hash", "rule", "version"],
                "sort_key": ["rule", "justification", "model"],
                "indent": 2,
                "sort_keys": True,
                "trailing_newline": True,
                "evidence": "contract_schema_sort",
            },
            "encoding": {
                "scheme": "dk1 + dot-separated lowercase base32 groups of 8 over the full SHA-256 digest",
                "bare_hex": "no contiguous run >= 20; groups cap at 8",
                "detect_secrets": "clean against .secrets.baseline; full-hex negative control flagged",
                "collision_safe": "full 256-bit digest; 25000-key probe had zero collisions",
                "evidence": ["contract_encoding_collision", "contract_detect_secrets"],
            },
            "prune": {
                "automatic_on_refresh": True,
                "missing_files": True,
                "stale_model": True,
                "stale_prompt_hash": True,
                "no_prune_flag": True,
                "evidence": "contract_prune",
            },
            "refresh": {
                "invocation": "lint --refresh-decisions [--path ...]",
                "writer": "checker call path in refresh mode only",
                "lock": "fcntl.flock on .python-setup-decisions.lock",
                "atomic_replace": True,
                "merge": "load + union files + prune + atomic replace",
                "evidence": ["contract_determinism", "contract_atomic_failure", "contract_refresh_mode_env"],
            },
            "ci_fail": {
                "variables": ["CI", "GITHUB_ACTIONS"],
                "exit_code": 2,
                "writes_nothing": True,
                "evidence": "contract_ci_fail",
            },
            "decisions_path": {
                "variable": "PYTHON_SETUP_LINT_DECISIONS_PATH",
                "honored_only_under": "PYTEST_CURRENT_TEST",
                "production": "ignored; root is config.cwd",
                "evidence": "contract_decisions_path_test_only",
            },
            "files": {
                "format": "sorted unique POSIX relative paths",
                "merge": "union on refresh",
                "cardinality": "one entry per (justification, rule, model) key",
                "evidence": "contract_files_union_posix",
            },
            "path_scoping": {
                "behavior": "scoped sweep and prune; entries for unscanned files retained; missing unscanned files retained",
                "stale_mixed_entry": "retained while it has an unscanned share; full refresh prunes it",
                "evidence": ["contract_path_scoping", "contract_scoped_stale_mixed"],
            },
            "jobs": {
                "required": 1,
                "guard": "explicit --jobs and every resolved rcfile; jobs=0 auto-detect and jobs>1 fail loudly",
                "head_rcfiles": "no explicit jobs override",
                "evidence": "contract_jobs_guard",
            },
            "placement": {
                "module": "python_setup_lint/decisions/_decision_cache.py (+ .pyi)",
                "edges": ["checkers -> decisions", "runner -> decisions"],
                "decisions_depends_on": [],
                "tach": "legal placement exit 0; decisions -> checkers negative control exit 1",
                "evidence": "contract_tach_placement",
            },
            "memory_time": {
                "rlimit_as_mb": memory["rlimit_as_mb"],
                "three_pylint_loads": memory["loads"],
                "model_eval_over_2048mb": memory["model_eval_over_2048mb"],
                "ml_runtime": memory["ml_runtime"],
                "note": memory["onnx_vs_torch_note"],
                "three_load_note": memory["three_load_note"],
            },
        },
        "required_proofs": {name: proofs.get(name) for name in required},
        "writer_verdict": proofs.get("contract_writer_verdict"),
        "evidence_files": {
            "proofs": "out/proofs.json",
            "memory_time": "out/memory_time.json",
            "report": "README.md",
        },
        "recommendations": [
            "Implement the cache in the new decisions module with the ADR-018 tach edges; keep _decision_backend.py in checkers.",
            "Thread RunnerConfig.refresh_decisions and the --refresh-decisions flag; fail before writes under CI/GITHUB_ACTIONS and when effective pylint jobs != 1.",
            "Use the checker call path as the refresh writer, gated by an internal refresh env flag; normal lint must only read the tracked cache.",
            "Serialize with dotted base32, full SHA-256, sort_keys/indent=2, and a runtime no-bare-hex guard; redact long hex runs in justifications and fail loudly on hex file paths.",
            "Rewrite tests/assumptions/test_pylint_cache_semantics.py deliberately for the tracked schema; add tmp round-trip, zero-write hash, double-run determinism, prune, scoping, CI/jobs/isolation and secrets tests.",
            "Add .python-setup-decisions.lock to ignore rules or document it; provide a non-POSIX lock fallback.",
            "In I5, benchmark the chosen model under RLIMIT_AS=2048 in the pylint subprocess (ONNX vs torch) before shipping a backend; GLiDE's 2846 MB torch peak exceeds the runner cap.",
        ],
    }
    (OUT / "verdict.json").write_text(json.dumps(verdict, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"verdict: {verdict['verdict']} -> {OUT / 'verdict.json'}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

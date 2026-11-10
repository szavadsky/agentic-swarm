"""Execute the decision-cache PoC proofs and contract checks on tmp copies.

Run with::

    uv run python .factory/tasks/modernize/items/decision-cache-design-spike/poc/run_proofs.py

Every fixture lives under ``poc/tmp/`` and is recreated from scratch.  The
script writes ``poc/out/proofs.json`` and exits non-zero if any check fails.
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from detect_secrets.core.scan import scan_file
from detect_secrets.settings import transient_settings

from decision_cache import (
    CACHE_FILENAME,
    DECISION_THRESHOLD,
    LOCK_FILENAME,
    ENV_DECISIONS_PATH,
    ENV_PYTEST,
    SCHEMA_VERSION,
    CacheEntry,
    CachePathError,
    RefreshLockError,
    build_model_id,
    checker_cache_path,
    derive_key,
    dump_entries,
    encode_digest,
    load_entries,
    merge_refresh,
    paths_in_scope,
    prompt_hash,
    refresh,
    resolve_cache_path,
    sanitize_tracked_text,
    source_relpath,
)
from decision_pipeline import FakeBackend, NoBackend, decide, heuristic_accepts
from refresh_cli import (
    RefreshError,
    ci_guard,
    is_refresh_mode,
    jobs_guard,
    parse_jobs_overrides,
    run_normal_lint,
    run_refresh,
)

POC = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parents[6]
TMP = POC / "tmp" / "proofs"
OUT = POC / "out"
BASELINE = REPO_ROOT / ".secrets.baseline"
MODEL_A = build_model_id("fake-backend", "test")
MODEL_B = build_model_id("fake-backend", "other")
PROMPT_HASH = prompt_hash()
NOW = "2026-11-08"

Results = dict[str, Any]


class ProofFailure(AssertionError):
    """A proof expectation failed."""


def expect(condition: object, message: str) -> None:
    """Raise :class:`ProofFailure` when *condition* is falsy."""
    if not condition:
        raise ProofFailure(message)


def run_check(results: Results, name: str, function: Callable[[], dict[str, Any]]) -> None:
    """Run one check and record pass/failure."""
    started = time.perf_counter()
    try:
        detail = function()
        results[name] = {"ok": True, "seconds": round(time.perf_counter() - started, 4), **detail}
    except Exception as exc:  # noqa: BLE001 - proof harness records failures
        results[name] = {
            "ok": False,
            "seconds": round(time.perf_counter() - started, 4),
            "error": f"{type(exc).__name__}: {exc}",
        }


def fixture_file(root: Path, relative: str, justification: str, *, rule: str = "W9704", kind: str = "pylint") -> Path:
    """Write a Python fixture with a recognizable suppression.

    Args:
        root: Fixture project root.
        relative: POSIX relative file path.
        justification: Preceding ``# justification:`` text.
        rule: Suppression code.
        kind: ``pylint``, ``noqa`` or ``mypy``.

    Returns:
        The written path.
    """
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    directive = {
        "pylint": f"# pylint: disable={rule}",
        "noqa": f"# noqa: {rule}",
        "mypy": f"# type: ignore[{rule}]",
    }[kind]
    path.write_text(f"# justification: {justification}\nvalue = load()  {directive}\n", encoding="utf-8")
    return path


def make_project(name: str, files: dict[str, tuple[str, str]]) -> Path:
    """Create a fixture project.

    Args:
        name: Directory name under ``poc/tmp/proofs``.
        files: Map relative path to ``(justification, kind)``.

    Returns:
        Project root.
    """
    root = TMP / name
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    for relative, (justification, kind) in files.items():
        fixture_file(root, relative, justification, kind=kind)
    return root


def _sha(path: Path) -> str:
    return __import__("hashlib").sha256(path.read_bytes()).hexdigest()


def _mtime(path: Path) -> int:
    return path.stat().st_mtime_ns


def _entry(justification: str, rule: str, model: str, decision: bool, files: tuple[str, ...]) -> CacheEntry:
    return CacheEntry(
        key=derive_key(justification, rule, model),
        justification=sanitize_tracked_text(justification),
        rule=rule,
        model=model,
        decision=decision,
        files=files,
        version=SCHEMA_VERSION,
        prompt_hash=PROMPT_HASH,
        last_seen=NOW,
    )


# --------------------------------------------------------------------------- #
# Required four proofs
# --------------------------------------------------------------------------- #
def proof_1_heuristic_rejected_without_backend() -> dict[str, Any]:
    """Heuristic-rejected justification is False with no backend/cache contact."""
    root = make_project("proof1", {"src/app.py": ("fix this", "pylint")})
    backend = FakeBackend(score=1.0)
    entries: list[CacheEntry] = []
    result = decide(
        "fix this",
        rule="W9704",
        code_context="value = load()",
        file="src/app.py",
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        entries=entries,
        backend=backend,
        refresh_mode=True,
    )
    expect(result.decision is False, "heuristic-rejected justification must be False")
    expect(result.source == "heuristic-reject", f"unexpected source: {result.source}")
    expect(result.backend_called is False, "backend must not be called")
    expect(result.observation is None, "refreshed heuristic reject must not be recorded")
    expect(backend.calls == [], "FakeBackend must stay untouched")
    expect(not heuristic_accepts("fix this", rule="W9704"), "fixture must be heuristic-rejected")

    no_backend = decide(
        "fix this",
        rule="W9704",
        code_context="value = load()",
        file="src/app.py",
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        entries=[],
        backend=None,
        refresh_mode=True,
    )
    expect(no_backend.decision is False, "heuristic-rejected must be False with no backend")
    expect(no_backend.backend_called is False, "no-backend reject must not call a model")

    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    expect(load_entries(cache_path, strict=True) == [], "rejected justification must not create an entry")
    return {
        "decision": result.decision,
        "no_backend_decision": no_backend.decision,
        "source": result.source,
        "backend_calls": 0,
        "cache_entries": 0,
    }


def proof_2_accepted_hit_equals_persisted() -> dict[str, Any]:
    """A cache hit returns the persisted verdict even when the backend disagrees."""
    root = make_project("proof2", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=0.0),
        environ={},
    )
    entries = load_entries(cache_path, strict=True)
    expect(len(entries) == 1, f"expected one persisted entry, got {len(entries)}")
    persisted = entries[0]
    expect(persisted.decision is False, "backend score 0.0 must persist False")
    expect(heuristic_accepts(persisted.justification, rule="W9704"), "fixture must be heuristic-accepted")

    backend = FakeBackend(score=1.0)
    result = decide(
        persisted.justification,
        rule="W9704",
        code_context="value = load()",
        file="src/app.py",
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        entries=entries,
        backend=backend,
        refresh_mode=False,
    )
    expect(result.source == "cache-hit", f"expected cache-hit, got {result.source}")
    expect(result.decision is persisted.decision, "hit must equal the persisted verdict")
    expect(result.backend_called is False, "hit must not call the backend")
    expect(backend.calls == [], "backend must stay untouched on a hit")

    no_backend = decide(
        persisted.justification,
        rule="W9704",
        code_context="value = load()",
        file="src/app.py",
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        entries=entries,
        backend=NoBackend(),
        refresh_mode=False,
    )
    expect(no_backend.decision is False, "hit must return persisted False even with no model")
    return {
        "persisted": persisted.decision,
        "hit_decision": result.decision,
        "backend_called": result.backend_called,
        "source": result.source,
    }


def proof_3_accepted_miss_absent_heuristic_true() -> dict[str, Any]:
    """Heuristic-accepted + cache miss + absent backend yields heuristic True."""
    root = make_project("proof3", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
    cache_path = resolve_cache_path(root)
    expect(not cache_path.exists(), "cache must start absent")
    result = decide(
        "retry loop must not swallow keyboard interrupt",
        rule="W9704",
        code_context="value = load()",
        file="src/app.py",
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        entries=[],
        backend=None,
        refresh_mode=False,
    )
    expect(result.decision is True, "heuristic-accepted miss with no model must be True")
    expect(result.source == "heuristic-accept", f"unexpected source: {result.source}")
    expect(result.backend_called is False, "no backend means no model call")

    normal_results = run_normal_lint(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        backend=None,
        environ={},
    )
    expect(len(normal_results) == 1, "one suppression expected")
    expect(normal_results[0].decision is True, "normal lint must return heuristic True")
    expect(not cache_path.exists(), "normal lint must not create the cache file")
    return {"decision": result.decision, "source": result.source, "cache_absent": True}


def proof_4_normal_lint_zero_writes_by_hash() -> dict[str, Any]:
    """Normal lint never mutates the tracked cache (hash + mtime + file set)."""
    root = make_project(
        "proof4",
        {
            "src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint"),
            "src/other.py": ("fix this", "pylint"),
        },
    )
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    before_hash, before_mtime = _sha(cache_path), _mtime(cache_path)
    before_files = sorted(path.name for path in root.iterdir())

    # Include a cache miss that calls the backend: no-write must hold even then.
    backend = FakeBackend(score=0.0)
    results = run_normal_lint(
        cwd=root,
        path=None,
        model=MODEL_B,  # different model -> every entry is a miss
        current_prompt_hash=PROMPT_HASH,
        backend=backend,
        environ={},
    )
    expect(len(results) == 2, f"expected two lint results, got {len(results)}")
    expect(any(call for call in backend.calls), "backend must be called on misses")
    expect(_sha(cache_path) == before_hash, "cache bytes changed during normal lint")
    expect(_mtime(cache_path) == before_mtime, "cache mtime changed during normal lint")
    expect(sorted(path.name for path in root.iterdir()) == before_files, "normal lint created an artifact")

    # Absent cache must stay absent even when the backend computes a verdict.
    absent_root = make_project("proof4_absent", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
    absent_path = resolve_cache_path(absent_root)
    run_normal_lint(
        cwd=absent_root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        backend=FakeBackend(score=1.0),
        environ={},
    )
    expect(not absent_path.exists(), "normal lint created a cache file on an absent cache")
    return {
        "sha256": before_hash,
        "mtime_ns": before_mtime,
        "files_before": before_files,
        "backend_calls": len(backend.calls),
        "absent_cache_still_absent": True,
    }


# --------------------------------------------------------------------------- #
# ADR-017 contract checks
# --------------------------------------------------------------------------- #
def check_root_guard() -> dict[str, Any]:
    """Project root = cwd, with parent/symlink escape rejected."""
    root = TMP / "root_guard"
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    normal = resolve_cache_path(root)
    expect(normal == (root / CACHE_FILENAME).resolve(), "cache must live at the project root")
    expect(normal.parent == root.resolve(), "cache parent must be config.cwd")

    outside = TMP / "root_guard_outside"
    shutil.rmtree(outside, ignore_errors=True)
    outside.mkdir(parents=True)
    (root / CACHE_FILENAME).symlink_to(outside / "escaped.json")
    try:
        resolve_cache_path(root)
    except CachePathError:
        symlink_blocked = True
    else:
        raise ProofFailure("symlink escape was not rejected")
    (root / CACHE_FILENAME).unlink()

    try:
        paths_in_scope(root, "../outside")
    except CachePathError:
        scope_blocked = True
    else:
        raise ProofFailure("--path parent escape was not rejected")
    try:
        source_relpath(root, outside / "x.py")
    except CachePathError:
        file_blocked = True
    else:
        raise ProofFailure("outside linted file was not rejected")
    try:
        paths_in_scope(root, "does-not-exist")
    except CachePathError:
        missing_blocked = True
    else:
        raise ProofFailure("missing --path was not rejected")
    return {
        "cache": str(normal),
        "symlink_blocked": symlink_blocked,
        "scope_blocked": scope_blocked,
        "file_blocked": file_blocked,
        "missing_blocked": missing_blocked,
    }


def check_checker_root_hint() -> dict[str, Any]:
    """A mismatched root hint cannot redirect the checker's cache path."""
    root = TMP / "root_hint"
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    matching = checker_cache_path(cwd=root, environ={"PYTHON_SETUP_LINT_DECISIONS_ROOT": str(root)})
    expect(matching == (root / CACHE_FILENAME).resolve(), "matching root hint changed the path")
    try:
        checker_cache_path(cwd=root, environ={"PYTHON_SETUP_LINT_DECISIONS_ROOT": str(TMP / "elsewhere")})
    except CachePathError:
        blocked = True
    else:
        blocked = False
    expect(blocked, "mismatched root hint was accepted")
    return {"matching": True, "mismatched_blocked": True}


def check_decisions_path_test_only() -> dict[str, Any]:
    """DECISIONS_PATH is ignored outside pytest and honored under pytest."""
    root = TMP / "isolation"
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    override = TMP / "isolation_override" / "cache.json"
    shutil.rmtree(override.parent, ignore_errors=True)
    production_env = {ENV_DECISIONS_PATH: str(override)}
    test_env = {ENV_DECISIONS_PATH: str(override), ENV_PYTEST: "tests/test_x.py::test_y"}

    production_path = resolve_cache_path(root, environ=production_env)
    expect(production_path == (root / CACHE_FILENAME).resolve(), "production must ignore DECISIONS_PATH")
    test_path = resolve_cache_path(root, environ=test_env)
    expect(test_path == override.resolve(), "pytest must honor DECISIONS_PATH")

    backend = FakeBackend(score=1.0)
    fixture_file(root, "src/app.py", "retry loop must not swallow keyboard interrupt")
    written = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=backend,
        environ=test_env,
    )
    expect(written == override.resolve(), "refresh must write the test-only override")
    expect(not (root / CACHE_FILENAME).exists(), "cwd cache must remain absent under test override")
    return {"production_ignored": True, "pytest_honored": True, "written": str(written)}


def check_schema_sort() -> dict[str, Any]:
    """Array sorted by (rule, justification, model), indent=2, sort_keys, round-trip."""
    entries = [
        _entry("z justification", "W9704", MODEL_B, True, ("src/z.py",)),
        _entry("b justification", "C0111", MODEL_A, False, ("src/b.py",)),
        _entry("a justification", "C0111", MODEL_A, True, ("src/a.py",)),
    ]
    rendered = dump_entries(entries)
    parsed = json.loads(rendered)
    expect(isinstance(parsed, list), "tracked cache must be a JSON array")
    order = [(item["rule"], item["justification"], item["model"]) for item in parsed]
    expect(order == sorted(order), f"entries not sorted by (rule, justification, model): {order}")
    expect(rendered.startswith('[\n  {\n    "decision"'), "indent=2 object rendering expected")
    expect('"decision"' in rendered and rendered.index('"decision"') < rendered.index('"files"'), "sort_keys not applied")
    expect(rendered.endswith("\n"), "trailing newline expected")
    path = TMP / "schema" / CACHE_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered, encoding="utf-8")
    expect(load_entries(path, strict=True) == sorted(entries, key=lambda e: (e.rule, e.justification, e.model)), "round-trip mismatch")
    first_object = rendered.split("}")[0]
    keys = re.findall(r'^    "([a-z_]+)":', first_object, flags=re.MULTILINE)
    expect(keys == sorted(keys), f"object keys must be sorted, got {keys}")
    return {"entry_count": len(parsed), "order": order, "keys": keys}


def check_encoding_collision() -> dict[str, Any]:
    """Key encoding is non-hex, full-SHA-256, collision-safe and secrets-clean."""
    digest = __import__("hashlib").sha256(b"key material").digest()
    encoded = encode_digest(digest)
    payload = "".join(encoded.split(".")[1:]).upper()
    decoded = base64.b32decode(payload + "=" * (-len(payload) % 8))
    expect(decoded == digest, "encoding must preserve all 256 bits")
    expect(not re.search(r"[0-9a-fA-F]{20,}", encoded), "key contains a bare hex run >= 20")
    expect(not re.fullmatch(r"[0-9a-fA-F]+", encoded), "key must not be hex")

    keys = {derive_key(f"justification {index}", "W9704", MODEL_A) for index in range(25_000)}
    expect(len(keys) == 25_000, "key collision detected in 25k-symbol probe")

    pathological = "see commit " + "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" + " for the retry rationale"
    sanitized = sanitize_tracked_text(pathological)
    expect("<hex:40>" in sanitized, "long hex justification was not redacted")
    entry = _entry(pathological, "W9704", MODEL_A, True, ("src/app.py",))
    rendered = dump_entries([entry])
    expect(not re.search(r"(?<![0-9a-fA-F])[0-9a-fA-F]{20,}(?![0-9a-fA-F])", rendered), "serialized cache has bare hex")
    expect(entry.key == derive_key(pathological, "W9704", MODEL_A), "key must derive from unredacted text")
    return {"encoded_length": len(encoded), "unique_keys": len(keys), "redacted": sanitized}


def check_detect_secrets() -> dict[str, Any]:
    """The generated cache passes the repository's own detect-secrets config."""
    root = TMP / "secrets"
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    fixture_file(root, "src/app.py", "retry loop must not swallow keyboard interrupt")
    fixture_file(root, "src/other.py", "see commit " + "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" + " for rationale")
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    bad_copy = cache_path.with_name("negative_control.json")
    bad_entries = json.loads(cache_path.read_text(encoding="utf-8"))
    bad_entries[0]["prompt_hash"] = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
    bad_copy.write_text(json.dumps(bad_entries, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    real_model = build_model_id("jina-reranker-v2-base-multilingual", "b886a1f9b91f4e8368d7830080d52d955e2c8dfa")
    real_path = cache_path.with_name("real_model.json")
    real_entry = _entry("retry loop must not swallow keyboard interrupt", "W9704", real_model, True, ("src/app.py",))
    real_path.write_text(dump_entries([real_entry]), encoding="utf-8")
    with transient_settings(baseline):
        findings = [{"type": secret.type, "value": secret.secret_value} for secret in scan_file(str(cache_path))]
        control = [secret.type for secret in scan_file(str(bad_copy))]
        real_findings = [secret.type for secret in scan_file(str(real_path))]
    expect(control, "negative control was not flagged; the scan path may be excluded")
    expect(findings == [], f"detect-secrets findings: {findings}")
    expect(real_findings == [], f"real-model cache flagged: {real_findings}")
    rendered = cache_path.read_text(encoding="utf-8")
    expect(not re.search(r"(?<![0-9a-fA-F])[0-9a-fA-F]{20,}(?![0-9a-fA-F])", rendered), "cache has bare hex >= 20")
    return {
        "cache": str(cache_path),
        "findings": 0,
        "negative_control": control,
        "real_model_findings": real_findings,
        "sha256": _sha(cache_path),
    }


def check_prune() -> dict[str, Any]:
    """Refresh prunes missing files and stale model/prompt entries automatically."""
    root = TMP / "prune"
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    for name in ("a", "b", "gone"):
        fixture_file(root, f"src/{name}.py", f"{name} specific technical reason")
    seeded = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    expect(len(load_entries(seeded, strict=True)) == 3, "seed must create three entries")
    (root / "src/gone.py").unlink()

    after_missing = merge_refresh(
        load_entries(seeded, strict=True),
        [],
        cwd=root,
        current_model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
    )
    files = {entry.files for entry in after_missing}
    expect(len(after_missing) == 2, f"missing-file entry not pruned: {len(after_missing)}")
    expect(("src/gone.py",) not in files, "deleted file entry survived")

    stale = merge_refresh(
        after_missing,
        [],
        cwd=root,
        current_model=MODEL_B,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
    )
    expect(stale == [], f"stale model entries not pruned: {stale}")

    prompt_stale = merge_refresh(
        after_missing,
        [],
        cwd=root,
        current_model=MODEL_A,
        current_prompt_hash=prompt_hash("different prompt"),
        last_seen=NOW,
    )
    expect(prompt_stale == [], f"stale prompt entries not pruned: {prompt_stale}")
    return {"after_missing": [list(entry.files) for entry in after_missing], "after_stale": 0}


def check_files_union_posix() -> dict[str, Any]:
    """One logical key observed in several files unions sorted POSIX paths."""
    root = make_project(
        "union",
        {
            "src/a.py": ("retry loop must not swallow keyboard interrupt", "pylint"),
            "src/b.py": ("retry loop must not swallow keyboard interrupt", "pylint"),
            "src/c.py": ("retry loop must not swallow keyboard interrupt", "pylint"),
        },
    )
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    entries = load_entries(cache_path, strict=True)
    expect(len(entries) == 1, f"expected one deduplicated entry, got {len(entries)}")
    expect(entries[0].files == ("src/a.py", "src/b.py", "src/c.py"), f"union mismatch: {entries[0].files}")
    expect(all("\\" not in file for file in entries[0].files), "files must be POSIX")
    return {"files": list(entries[0].files)}


def check_path_scoping() -> dict[str, Any]:
    """--path scopes the sweep and retains entries for unscanned files."""
    root = make_project(
        "scoping",
        {
            "src/a.py": ("a specific technical reason for retrying", "pylint"),
            "src/b.py": ("b specific technical reason for retrying", "pylint"),
        },
    )
    (root / "tests").mkdir(exist_ok=True)
    (root / "tests" / "test_scope.py").write_text("VALUE = 1\n", encoding="utf-8")
    expect(paths_in_scope(root, "src") == {"src/a.py", "src/b.py"}, "directory --path must select only its subtree")
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen="2026-11-01",
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    before = {(entry.rule, entry.justification): entry for entry in load_entries(cache_path, strict=True)}
    (root / "src/b.py").unlink()

    run_refresh(
        cwd=root,
        path="src/a.py",
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen="2026-11-08",
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    scoped = load_entries(cache_path, strict=True)
    by_justification = {entry.justification: entry for entry in scoped}
    expect(len(scoped) == 2, f"scoped refresh must retain unscanned entry, got {len(scoped)}")
    expect(by_justification["b specific technical reason for retrying"].last_seen == "2026-11-01", "unscanned entry changed")
    expect(by_justification["b specific technical reason for retrying"].files == ("src/b.py",), "unscanned files changed")
    expect(by_justification["a specific technical reason for retrying"].last_seen == "2026-11-08", "scanned entry not updated")

    run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen="2026-11-08",
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    full = load_entries(cache_path, strict=True)
    expect(len(full) == 1, f"full refresh must prune the missing unscanned entry, got {len(full)}")
    return {"scoped_entries": len(scoped), "full_entries": len(full), "before": len(before)}


def check_scoped_stale_mixed() -> dict[str, Any]:
    """A scoped model change retains the unscanned share and prunes it on full refresh."""
    root = make_project(
        "scoped_stale",
        {
            "src/a.py": ("shared specific technical reason for retrying", "pylint"),
            "src/b.py": ("shared specific technical reason for retrying", "pylint"),
        },
    )
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen="2026-11-01",
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    seeded = load_entries(cache_path, strict=True)
    expect(len(seeded) == 1 and seeded[0].files == ("src/a.py", "src/b.py"), f"seed mismatch: {seeded}")

    run_refresh(
        cwd=root,
        path="src/a.py",
        model=MODEL_B,
        current_prompt_hash=PROMPT_HASH,
        last_seen="2026-11-08",
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    scoped = load_entries(cache_path, strict=True)
    expect(len(scoped) == 2, f"stale mixed entry must be retained, got {len(scoped)}")
    old = next(entry for entry in scoped if entry.model == MODEL_A)
    expect(old.files == ("src/a.py", "src/b.py"), f"unscanned share lost: {old.files}")
    expect(old.last_seen == "2026-11-01", "unscanned entry was touched")

    run_refresh(
        cwd=root,
        path=None,
        model=MODEL_B,
        current_prompt_hash=PROMPT_HASH,
        last_seen="2026-11-08",
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    full = load_entries(cache_path, strict=True)
    expect(len(full) == 1, f"full refresh must prune the stale model entry, got {len(full)}")
    expect(full[0].model == MODEL_B, "full refresh kept the stale model")
    expect(full[0].files == ("src/a.py", "src/b.py"), f"full refresh did not union files: {full[0].files}")
    return {"scoped_entries": len(scoped), "full_entries": len(full), "files": list(full[0].files)}


def check_ci_fail() -> dict[str, Any]:
    """Refresh exits non-zero under CI/GITHUB_ACTIONS and writes nothing."""
    root = make_project("ci", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    before = _sha(cache_path)
    outcomes: dict[str, int] = {}
    for variable in ("CI", "GITHUB_ACTIONS"):
        env = {**os.environ, variable: "1"}
        completed = subprocess.run(
            [sys.executable, str(POC / "refresh_cli.py"), "--refresh-decisions", "--cwd", str(root)],
            cwd=POC,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        outcomes[variable] = completed.returncode
        expect(completed.returncode != 0, f"refresh under {variable} must fail")
        expect(_sha(cache_path) == before, f"refresh under {variable} changed the cache")
    return {"exit_codes": outcomes, "cache_unchanged": True}


def check_jobs_guard() -> dict[str, Any]:
    """Refresh requires jobs==1 and fails loudly on rcfile or flag overrides."""
    rcfile = TMP / "jobs" / ".pylintrc"
    shutil.rmtree(rcfile.parent, ignore_errors=True)
    rcfile.parent.mkdir(parents=True)
    rcfile.write_text("[MAIN]\njobs=2\n", encoding="utf-8")
    try:
        jobs_guard(jobs_flag=1, rcfiles=[rcfile])
    except RefreshError:
        rcfile_blocked = True
    else:
        raise ProofFailure("rcfile jobs=2 was not rejected")
    try:
        jobs_guard(jobs_flag=2, rcfiles=[])
    except RefreshError:
        flag_blocked = True
    else:
        raise ProofFailure("--jobs=2 was not rejected")
    try:
        jobs_guard(jobs_flag=0, rcfiles=[])
    except RefreshError:
        auto_blocked = True
    else:
        raise ProofFailure("--jobs=0 auto-detect was not rejected")

    repo_rcfiles = [REPO_ROOT / "config" / f".pylintrc{suffix}" for suffix in ("", "-pyi", "-tests")]
    repo_overrides = {path.name: parse_jobs_overrides(path) for path in repo_rcfiles}
    expect(all(not values for values in repo_overrides.values()), f"HEAD rcfiles set jobs: {repo_overrides}")
    checks = jobs_guard(jobs_flag=1, rcfiles=repo_rcfiles)

    root = make_project("jobs", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
    cache_path = resolve_cache_path(root)
    completed = subprocess.run(
        [
            sys.executable,
            str(POC / "refresh_cli.py"),
            "--refresh-decisions",
            "--cwd",
            str(root),
            "--jobs",
            "2",
        ],
        cwd=POC,
        env={**os.environ, "PYTHON_SETUP_LINT_DECISIONS_PATH": str(TMP / "jobs" / "cache.json")},
        capture_output=True,
        text=True,
        check=False,
    )
    expect(completed.returncode != 0, "--jobs=2 CLI must fail")
    expect(not cache_path.exists(), "failed jobs guard must not write the cache")
    return {
        "rcfile_blocked": rcfile_blocked,
        "flag_blocked": flag_blocked,
        "auto_blocked": auto_blocked,
        "repo_overrides": repo_overrides,
        "checks": checks,
    }


def check_ci_guard_function() -> dict[str, Any]:
    """The CI guard matches the golden UPDATE_ENV shape."""
    ci_guard({})
    for variable in ("CI", "GITHUB_ACTIONS"):
        try:
            ci_guard({variable: "1"})
        except RefreshError:
            continue
        raise ProofFailure(f"{variable} did not trip the guard")
    return {"guard": "CI/GITHUB_ACTIONS"}


def check_determinism() -> dict[str, Any]:
    """Double refresh with fixed inputs is byte-identical."""
    root = make_project(
        "determinism",
        {
            "src/b.py": ("b specific technical reason for retrying", "pylint"),
            "src/a.py": ("a specific technical reason for retrying", "pylint"),
            "tests/test_a.py": ("test specific technical reason for retrying", "noqa"),
        },
    )
    kwargs = {
        "cwd": root,
        "path": None,
        "model": MODEL_A,
        "current_prompt_hash": PROMPT_HASH,
        "last_seen": NOW,
        "jobs_flag": 1,
        "rcfiles": [],
        "backend": FakeBackend(score=1.0),
        "environ": {},
    }
    first = run_refresh(**kwargs)
    first_bytes = first.read_bytes()
    second = run_refresh(**kwargs)
    second_bytes = second.read_bytes()
    expect(first_bytes == second_bytes, "double refresh is not byte-identical")
    expect(not list(first.parent.glob("*.tmp")), "atomic temp files leaked")
    return {"sha256": _sha(first), "bytes": len(first_bytes), "byte_identical": True}


def check_atomic_failure() -> dict[str, Any]:
    """A failed serialization leaves the previous cache untouched."""
    root = make_project("atomic", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    before = _sha(cache_path)
    hex_file = "src/" + "a1b2c3d4e5f60718293a4b5c6d7e8f90" + ".py"
    (root / hex_file).parent.mkdir(parents=True, exist_ok=True)
    fixture_file(root, hex_file, "hex path specific technical reason")
    try:
        run_refresh(
            cwd=root,
            path=None,
            model=MODEL_A,
            current_prompt_hash=PROMPT_HASH,
            last_seen=NOW,
            jobs_flag=1,
            rcfiles=[],
            backend=FakeBackend(score=1.0),
            environ={},
        )
    except Exception:  # noqa: BLE001 - expected failure path
        failed = True
    else:
        failed = False
    expect(failed, "bare-hex file path should fail the no-bare-hex contract")
    expect(_sha(cache_path) == before, "failed refresh clobbered the previous cache")
    return {"failed_loudly": True, "cache_unchanged": True}


def check_lock_contention() -> dict[str, Any]:
    """A second refresh fails loudly on the lock and does not write."""
    import fcntl

    root = make_project("lock", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
    cache_path = run_refresh(
        cwd=root,
        path=None,
        model=MODEL_A,
        current_prompt_hash=PROMPT_HASH,
        last_seen=NOW,
        jobs_flag=1,
        rcfiles=[],
        backend=FakeBackend(score=1.0),
        environ={},
    )
    before = _sha(cache_path)
    lock_path = cache_path.with_name(LOCK_FILENAME)
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            refresh(
                cwd=root,
                observed=[],
                current_model=MODEL_A,
                current_prompt_hash=PROMPT_HASH,
                last_seen=NOW,
                environ={},
            )
        except RefreshLockError:
            blocked = True
        else:
            blocked = False
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)
    expect(blocked, "second refresh did not fail on the held lock")
    expect(_sha(cache_path) == before, "blocked refresh changed the cache")
    return {"lock_blocked": blocked, "cache_unchanged": True}


def check_corrupt_cache() -> dict[str, Any]:
    """Normal lint tolerates corruption; refresh fails without clobbering."""
    root = TMP / "corrupt"
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    cache_path = resolve_cache_path(root)
    cache_path.write_text("{not json", encoding="utf-8")
    expect(load_entries(cache_path) == [], "normal lint must tolerate corrupt cache")
    try:
        refresh(
            cwd=root,
            observed=[],
            current_model=MODEL_A,
            current_prompt_hash=PROMPT_HASH,
            last_seen=NOW,
            environ={},
        )
    except Exception:  # noqa: BLE001 - expected
        failed = True
    else:
        failed = False
    expect(failed, "refresh must fail loudly on corrupt cache")
    expect(cache_path.read_text(encoding="utf-8") == "{not json", "refresh clobbered corrupt cache")
    return {"normal_tolerant": True, "refresh_failed_loudly": True}


def check_model_string() -> dict[str, Any]:
    """Model string follows ``<id> rev <short12> prompt-vN``."""
    model = build_model_id("fake-backend", "test")
    expect(model == "fake-backend rev test prompt-v1", f"unexpected fake model: {model}")
    real = build_model_id("jina-reranker-v2-base-multilingual", "b886a1f9b91f4e8368d7830080d52d955e2c8dfa")
    expect(real == "jina-reranker-v2-base-multilingual rev b886a1f9b91f prompt-v1", f"unexpected model: {real}")
    revision = real.split(" rev ", 1)[1].split(" ", 1)[0]
    expect(len(revision) == 12, "revision must be short12")
    expect(not re.search(r"[0-9a-fA-F]{20,}", real), "model string contains bare hex >= 20")
    return {"fake": model, "real": real, "short12": revision}


def check_writer_verdict() -> dict[str, Any]:
    """Consume the writer-first verdict from the assumption test."""
    source = (REPO_ROOT / "tests/assumptions/test_pylint_cache_semantics.py").read_text(encoding="utf-8")
    required = ("Writer identity", "Timing", "scoping", "Sweep implication", "Concurrency", "Crash safety")
    missing = [marker for marker in required if marker not in source]
    expect(not missing, f"writer verdict markers missing: {missing}")
    expect("jobs" in source and "ProcessPoolExecutor" in source, "concurrency verdict not present")
    return {
        "path": "tests/assumptions/test_pylint_cache_semantics.py",
        "sha256": __import__("hashlib").sha256(source.encode()).hexdigest(),
        "markers": list(required),
        "consumed": "path-free key -> per-entry files; jobs==1 single writer; non-atomic write -> refresh-only atomic replace",
    }


def check_production_untouched() -> dict[str, Any]:
    """Production and test paths stay byte-identical (zero production changes)."""
    status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    diff = subprocess.run(
        ["git", "diff", "--stat", "--", ".", ":(exclude).factory", ":(exclude).omp"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=False)
    production_lines = [line for line in status.stdout.splitlines() if ".factory/" not in line and ".omp/" not in line]
    expect(not production_lines, f"production paths modified: {production_lines}")
    expect(diff.stdout.strip() == "", f"production diff present: {diff.stdout}")
    return {"status": status.stdout, "production_lines": production_lines, "diff": diff.stdout, "head": head.stdout.strip()}


def check_tach_placement() -> dict[str, Any]:
    """ADR-018 placement passes tach; an illegal decisions->checkers edge fails."""
    root = TMP / "tach"
    shutil.rmtree(root, ignore_errors=True)
    (root / "src/python_setup_lint/decisions").mkdir(parents=True)
    (root / "src/python_setup_lint/checkers").mkdir(parents=True)
    (root / "src/python_setup_lint/runner").mkdir(parents=True)
    for package in ("python_setup_lint", "python_setup_lint/decisions", "python_setup_lint/checkers", "python_setup_lint/runner"):
        (root / "src" / package / "__init__.py").write_text("", encoding="utf-8")
    (root / "src/python_setup_lint/decisions/_decision_cache.py").write_text(
        "def load() -> bool:\n    return True\n", encoding="utf-8"
    )
    (root / "src/python_setup_lint/decisions/_decision_cache.pyi").write_text(
        "def load() -> bool: ...\n", encoding="utf-8"
    )
    (root / "src/python_setup_lint/checkers/mod.py").write_text(
        "from python_setup_lint.decisions._decision_cache import load\n\nVALUE = load()\n", encoding="utf-8"
    )
    (root / "src/python_setup_lint/runner/mod.py").write_text(
        "from python_setup_lint.decisions._decision_cache import load\n\nVALUE = load()\n", encoding="utf-8"
    )
    config = """interfaces = []
exclude = ["**/__pycache__"]
source_roots = ["src"]

[[modules]]
path = "python_setup_lint.decisions"
depends_on = []

[[modules]]
path = "python_setup_lint.checkers"
depends_on = ["python_setup_lint.decisions"]

[[modules]]
path = "python_setup_lint.runner"
depends_on = ["python_setup_lint.decisions"]
"""
    (root / "tach.toml").write_text(config, encoding="utf-8")
    positive = subprocess.run(
        ["uv", "run", "tach", "check"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    expect(positive.returncode == 0, f"legal ADR-018 placement failed tach: {positive.stdout}{positive.stderr}")

    (root / "src/python_setup_lint/decisions/bad.py").write_text(
        "from python_setup_lint.checkers.mod import VALUE\n", encoding="utf-8"
    )
    negative = subprocess.run(
        ["uv", "run", "tach", "check"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    expect(negative.returncode != 0, "illegal decisions->checkers edge was not rejected")
    (root / "src/python_setup_lint/decisions/bad.py").unlink()
    return {
        "positive_exit": positive.returncode,
        "negative_exit": negative.returncode,
        "negative_output": negative.stdout.strip().splitlines()[-3:],
    }


def check_refresh_mode_env() -> dict[str, Any]:
    """The refresh env flag is the only switch that enables writer mode."""
    expect(is_refresh_mode({}) is False, "normal lint must not be refresh mode")
    expect(is_refresh_mode({"PYTHON_SETUP_LINT_DECISIONS_REFRESH": "1"}) is True, "refresh env flag not honored")
    expect(DECISION_THRESHOLD == 0.5, "threshold pinned at 0.5")
    expect(SCHEMA_VERSION == 1, "schema version pinned")
    return {"threshold": DECISION_THRESHOLD, "schema_version": SCHEMA_VERSION}


def main() -> int:
    """Run every proof/check and write ``out/proofs.json``."""
    shutil.rmtree(TMP, ignore_errors=True)
    TMP.mkdir(parents=True)
    OUT.mkdir(parents=True, exist_ok=True)
    results: Results = {"generated_at_unix": int(time.time()), "model_a": MODEL_A, "prompt_hash": PROMPT_HASH}
    checks: list[tuple[str, Callable[[], dict[str, Any]]]] = [
        ("proof_1_heuristic_rejected_without_backend", proof_1_heuristic_rejected_without_backend),
        ("proof_2_accepted_hit_equals_persisted", proof_2_accepted_hit_equals_persisted),
        ("proof_3_accepted_miss_absent_heuristic_true", proof_3_accepted_miss_absent_heuristic_true),
        ("proof_4_normal_lint_zero_writes_by_hash", proof_4_normal_lint_zero_writes_by_hash),
        ("contract_root_guard", check_root_guard),
        ("contract_checker_root_hint", check_checker_root_hint),
        ("contract_decisions_path_test_only", check_decisions_path_test_only),
        ("contract_schema_sort", check_schema_sort),
        ("contract_encoding_collision", check_encoding_collision),
        ("contract_detect_secrets", check_detect_secrets),
        ("contract_prune", check_prune),
        ("contract_files_union_posix", check_files_union_posix),
        ("contract_path_scoping", check_path_scoping),
        ("contract_scoped_stale_mixed", check_scoped_stale_mixed),
        ("contract_ci_fail", check_ci_fail),
        ("contract_ci_guard_function", check_ci_guard_function),
        ("contract_jobs_guard", check_jobs_guard),
        ("contract_determinism", check_determinism),
        ("contract_atomic_failure", check_atomic_failure),
        ("contract_lock_contention", check_lock_contention),
        ("contract_corrupt_cache", check_corrupt_cache),
        ("contract_model_string", check_model_string),
        ("contract_writer_verdict", check_writer_verdict),
        ("contract_refresh_mode_env", check_refresh_mode_env),
        ("contract_tach_placement", check_tach_placement),
        ("contract_production_untouched", check_production_untouched),
    ]
    for name, function in checks:
        run_check(results, name, function)
        state = "PASS" if results[name]["ok"] else "FAIL"
        print(f"[{state}] {name} ({results[name]['seconds']}s)")
        if not results[name]["ok"]:
            print(f"       {results[name]['error']}")

    required = [
        "proof_1_heuristic_rejected_without_backend",
        "proof_2_accepted_hit_equals_persisted",
        "proof_3_accepted_miss_absent_heuristic_true",
        "proof_4_normal_lint_zero_writes_by_hash",
    ]
    failed = [name for name, result in results.items() if isinstance(result, dict) and result.get("ok") is False]
    verdict = "feasible" if not failed else "blocked"
    results["verdict"] = verdict
    results["required_proofs"] = {name: results[name]["ok"] for name in required}
    results["failed_checks"] = failed
    (OUT / "proofs.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"\nverdict: {verdict}; failed: {failed or 'none'}")
    print(f"results: {OUT / 'proofs.json'}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())

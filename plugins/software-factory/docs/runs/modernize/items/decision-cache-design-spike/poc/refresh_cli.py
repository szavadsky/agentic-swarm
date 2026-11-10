"""Prototype of ``lint --refresh-decisions [--path ...]`` (PoC only).

The prototype threads the ADR-017 refresh contract without modifying the
production runner:

* CI/GITHUB_ACTIONS -> exit non-zero before any write;
* effective pylint ``jobs`` must be 1 (explicit flag + every resolved rcfile);
* ``--path`` narrows both the sweep and the prune scope;
* each of the three pylint passes (``pylint``, ``pylint-pyi``,
  ``pylint tests``) merges sequentially through the same lock/atomic writer;
* ``PYTHON_SETUP_LINT_DECISIONS_PATH`` is honored only under
  ``PYTEST_CURRENT_TEST`` (handled by :func:`decision_cache.resolve_cache_path`).
"""

from __future__ import annotations

import argparse
import configparser
import hashlib
import os
import re
import sys
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path

from decision_cache import (
    ENV_DECISIONS_PATH,
    ENV_REFRESH,
    ENV_ROOT,
    CacheEntry,
    Observation,
    build_model_id,
    load_entries,
    normalize_rule,
    paths_in_scope,
    prompt_hash,
    refresh,
    resolve_cache_path,
    utc_today,
)
from decision_pipeline import DecisionBackend, DecisionResult, FakeBackend, decide

CI_ENV_VARS = ("CI", "GITHUB_ACTIONS")

_JUSTIFICATION_RE = re.compile(r"^\s*#\s*justification:\s*(?P<text>.+?)\s*$")
_SUPPRESSION_RE = re.compile(
    r"#\s*(?:pylint:\s*disable=(?P<pylint>[A-Za-z0-9_,\s]+)|noqa(?::\s*(?P<noqa>[A-Za-z0-9_,\s]+))?|type:\s*ignore\[(?P<mypy>[A-Za-z0-9_,\s]+)\])"
)


class RefreshError(RuntimeError):
    """Refresh guard failed before any cache write."""


def ci_guard(environ: Mapping[str, str]) -> None:
    """Refuse refresh under CI, mirroring the golden UPDATE_ENV guard.

    Args:
        environ: Process environment.

    Raises:
        RefreshError: A CI variable is set.
    """
    hit = next((name for name in CI_ENV_VARS if environ.get(name)), None)
    if hit is not None:
        raise RefreshError(f"refusing to refresh decisions under CI ({hit} is set)")


def parse_jobs_overrides(rcfile: Path) -> list[tuple[str, int]]:
    """Read explicit ``jobs`` overrides from a pylint rcfile.

    Args:
        rcfile: Candidate rcfile.

    Returns:
        ``(section, jobs)`` pairs for every explicit override.
    """
    parser = configparser.ConfigParser()
    try:
        parser.read(rcfile, encoding="utf-8")
    except (OSError, configparser.Error):
        return []
    overrides: list[tuple[str, int]] = []
    for section in parser.sections():
        if parser.has_option(section, "jobs"):
            try:
                overrides.append((section, parser.getint(section, "jobs")))
            except ValueError:
                overrides.append((section, -1))
    return overrides


def jobs_guard(*, jobs_flag: int, rcfiles: Iterable[Path]) -> list[str]:
    """Require effective pylint jobs == 1.

    Args:
        jobs_flag: Explicit ``--jobs`` value used by the refresh invocation.
        rcfiles: Every rcfile that can affect the three pylint passes.

    Returns:
        Human-readable checks that passed.

    Raises:
        RefreshError: Any override or explicit flag is not exactly 1.
    """
    if jobs_flag != 1:
        raise RefreshError(f"refresh requires pylint jobs==1, got --jobs={jobs_flag}")
    checked: list[str] = []
    for rcfile in rcfiles:
        overrides = parse_jobs_overrides(rcfile)
        bad = [(section, value) for section, value in overrides if value != 1]
        if bad:
            raise RefreshError(f"refresh requires pylint jobs==1; {rcfile} sets {bad}")
        checked.append(f"{rcfile}: jobs=1" if not overrides else f"{rcfile}: explicit jobs=1")
    return checked


def checker_environment(*, cwd: Path, decisions_path: Path | None = None) -> dict[str, str]:
    """Build the env the runner passes to each pylint subprocess during refresh.

    Args:
        cwd: Linted project root.
        decisions_path: Test-only override, when applicable.

    Returns:
        Environment additions for the checker call path.
    """
    env = {ENV_REFRESH: "1", ENV_ROOT: str(Path(cwd).resolve())}
    if decisions_path is not None:
        env[ENV_DECISIONS_PATH] = str(decisions_path)
    return env


def is_refresh_mode(environ: Mapping[str, str]) -> bool:
    """Return whether the checker call path is running under refresh.

    Args:
        environ: Environment passed to the checker subprocess.

    Returns:
        True when the runner asked this lint pass to write decisions.
    """
    return environ.get(ENV_REFRESH) == "1"


def _suppressions(path: Path) -> list[tuple[str, str]]:
    """Extract ``(rule, justification)`` pairs from a fixture file.

    The production checker's astroid-based comment extraction is not the
    subject of this spike; fixtures use an explicit preceding
    ``# justification:`` line so the cache/refresh contract is isolated.

    Args:
        path: Python fixture file.

    Returns:
        Pairs in source order.
    """
    pairs: list[tuple[str, str]] = []
    pending: str | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        justification_match = _JUSTIFICATION_RE.match(line)
        if justification_match:
            pending = justification_match.group("text")
            continue
        suppression_match = _SUPPRESSION_RE.search(line)
        if suppression_match and pending is not None:
            raw_rule = (
                suppression_match.group("pylint")
                or suppression_match.group("noqa")
                or suppression_match.group("mypy")
                or ""
            )
            pairs.append((normalize_rule(raw_rule or "unknown"), pending))
            pending = None
    return pairs


def collect_observations(
    cwd: Path,
    files: Iterable[str],
    *,
    model: str,
    current_prompt_hash: str,
    backend: DecisionBackend | None,
    entries: list[CacheEntry],
) -> list[Observation]:
    """Run the prototype decision path over every scoped suppression.

    Args:
        cwd: Project root.
        files: POSIX relative files selected by this pass.
        model: Current model string.
        current_prompt_hash: Current prompt fingerprint.
        backend: Backend or ``None``.
        entries: Current cache entries (hits are not re-observed).

    Returns:
        Observations for cache misses in refresh mode.
    """
    observations: list[Observation] = []
    for file in files:
        full_path = cwd / file
        for rule, justification in _suppressions(full_path):
            result = decide(
                justification,
                rule=rule,
                code_context=justification,
                file=file,
                model=model,
                current_prompt_hash=current_prompt_hash,
                entries=entries,
                backend=backend,
                refresh_mode=True,
            )
            if result.observation is not None:
                observations.append(result.observation)
    return observations


def _pass_files(all_files: set[str], pass_name: str) -> set[str]:
    src_py = {file for file in all_files if file.startswith("src/") and file.endswith(".py") and not file.endswith(".pyi")}
    pyi = {file for file in all_files if file.endswith(".pyi")}
    tests_py = {file for file in all_files if file.startswith("tests/") and file.endswith(".py")}
    return {"pylint": src_py, "pylint-pyi": pyi, "pylint tests": tests_py}[pass_name]


def run_refresh(
    *,
    cwd: Path,
    path: str | None,
    model: str,
    current_prompt_hash: str,
    last_seen: str,
    jobs_flag: int,
    rcfiles: Sequence[Path],
    backend: DecisionBackend | None,
    environ: Mapping[str, str] | None = None,
) -> Path:
    """Execute one explicit refresh over the three sequential pylint passes.

    Args:
        cwd: Linted project root.
        path: Optional ``--path`` scope.
        model: Current model string.
        current_prompt_hash: Current prompt fingerprint.
        last_seen: Deterministic date stamp.
        jobs_flag: Explicit jobs value for the refresh invocation.
        rcfiles: Resolved pylint rcfiles.
        backend: Backend used for cache misses.
        environ: Environment override for tests.

    Returns:
        Cache path written by the refresh.

    Raises:
        RefreshError: CI or jobs guard failed.
    """
    env = dict(os.environ if environ is None else environ)
    ci_guard(env)
    jobs_guard(jobs_flag=jobs_flag, rcfiles=rcfiles)
    root = Path(cwd).resolve()
    all_files = paths_in_scope(root, path)
    cache_path = resolve_cache_path(root, environ=env)
    for pass_name in ("pylint", "pylint-pyi", "pylint tests"):
        entries = load_entries(cache_path, strict=True)
        observations = collect_observations(
            root,
            sorted(_pass_files(all_files, pass_name)),
            model=model,
            current_prompt_hash=current_prompt_hash,
            backend=backend,
            entries=entries,
        )
        refresh(
            cwd=root,
            observed=observations,
            current_model=model,
            current_prompt_hash=current_prompt_hash,
            last_seen=last_seen,
            path=path,
            environ=env,
        )
    return cache_path


def run_normal_lint(
    *,
    cwd: Path,
    path: str | None,
    model: str,
    current_prompt_hash: str,
    backend: DecisionBackend | None,
    environ: Mapping[str, str] | None = None,
) -> list[DecisionResult]:
    """Simulate the read-only normal lint path (never writes the cache).

    Args:
        cwd: Project root.
        path: Optional ``--path`` scope.
        model: Current model string.
        current_prompt_hash: Current prompt fingerprint.
        backend: Backend or ``None``.
        environ: Environment override for tests.

    Returns:
        Decision results in source order.
    """
    env = dict(os.environ if environ is None else environ)
    root = Path(cwd).resolve()
    entries = load_entries(resolve_cache_path(root, environ=env))
    results: list[DecisionResult] = []
    for file in sorted(paths_in_scope(root, path)):
        for rule, justification in _suppressions(root / file):
            results.append(
                decide(
                    justification,
                    rule=rule,
                    code_context=justification,
                    file=file,
                    model=model,
                    current_prompt_hash=current_prompt_hash,
                    entries=entries,
                    backend=backend,
                    refresh_mode=False,
                )
            )
    return results


def _default_rcfiles(cwd: Path) -> list[Path]:
    candidates = [cwd / "config" / f".pylintrc{suffix}" for suffix in ("", "-pyi", "-tests")]
    return [candidate for candidate in candidates if candidate.is_file()]


def build_parser() -> argparse.ArgumentParser:
    """Build the prototype CLI parser.

    Returns:
        Parser with the pinned refresh flags.
    """
    parser = argparse.ArgumentParser(description="Prototype lint --refresh-decisions")
    parser.add_argument("--refresh-decisions", action="store_true")
    parser.add_argument("--path")
    parser.add_argument("--cwd", default=".")
    parser.add_argument("--model-id", default="fake-backend")
    parser.add_argument("--revision", default="test")
    parser.add_argument("--now", default=utc_today())
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--score", type=float, default=1.0)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the prototype CLI.

    Args:
        argv: Argument list (tests may pass one).

    Returns:
        Exit code.
    """
    args = build_parser().parse_args(argv)
    if not args.refresh_decisions:
        print("prototype: normal lint path is read-only; nothing written", file=sys.stderr)
        return 0

    cwd = Path(args.cwd).resolve()
    model = build_model_id(args.model_id, args.revision)
    try:
        cache_path = run_refresh(
            cwd=cwd,
            path=args.path,
            model=model,
            current_prompt_hash=prompt_hash(),
            last_seen=args.now,
            jobs_flag=args.jobs,
            rcfiles=_default_rcfiles(cwd),
            backend=FakeBackend(score=args.score),
        )
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        print(f"refresh-decisions failed: {exc}", file=sys.stderr)
        return 2
    digest = hashlib.sha256(cache_path.read_bytes()).hexdigest()[:16]
    print(f"refreshed {cache_path} sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

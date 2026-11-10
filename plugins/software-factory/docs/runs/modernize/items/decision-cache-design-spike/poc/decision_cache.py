"""Prototype of the ADR-017/018 tracked decision cache (PoC only).

This module is a confined feasibility prototype: it is never imported by the
production package.  It pins the contract that `decision-cache-impl` must
implement:

* root = ``config.cwd`` with a traversal guard; test-only
  ``PYTHON_SETUP_LINT_DECISIONS_PATH`` is honored only under
  ``PYTEST_CURRENT_TEST``;
* a tracked JSON array sorted by ``(rule, justification, model)``, rendered with
  ``indent=2`` and ``sort_keys=True``;
* a full-SHA-256 logical key encoded with a non-hex, dotted base32 alphabet
  (no bare hex run >= 20, detect-secrets clean, collision-safe);
* ``files`` = sorted unique POSIX relative paths, union-merged on refresh;
* automatic prune of missing files and stale model / prompt entries, with
  ``--path`` scoping that retains entries for unscanned files;
* read-only normal lint: only :func:`refresh` writes, via lock + atomic
  replace; and
* ``jobs == 1`` is a caller precondition (enforced by the refresh CLI).

The writer-first verdict in
``tests/assumptions/test_pylint_cache_semantics.py`` is consumed here: the
current cache identity is path-free, so a tracked schema needs per-entry
``files``; the single-writer claim holds only while pylint jobs == 1; and the
current non-atomic write becomes a refresh-only atomic replace.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import json
import os
import re
import tempfile
from collections.abc import Generator, Iterable, Mapping
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None  # type: ignore[assignment]

CACHE_FILENAME: Final = ".python-setup-decisions.json"
LOCK_FILENAME: Final = ".python-setup-decisions.lock"
SCHEMA_VERSION: Final = 1
PROMPT_VERSION: Final = "prompt-v1"
PROMPT_TEMPLATE: Final = "Rate whether the suppression justification is a specific technical reason."
DECISION_THRESHOLD: Final = 0.5

ENV_DECISIONS_PATH: Final = "PYTHON_SETUP_LINT_DECISIONS_PATH"
ENV_REFRESH: Final = "PYTHON_SETUP_LINT_DECISIONS_REFRESH"
ENV_ROOT: Final = "PYTHON_SETUP_LINT_DECISIONS_ROOT"
ENV_PYTEST: Final = "PYTEST_CURRENT_TEST"

_KEY_RE: Final = re.compile(r"^dk1(?:\.[a-z2-7]{1,8})+$")
_BARE_HEX_RE: Final = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{20,}(?![0-9a-fA-F])")
_HEX_RUN_RE: Final = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{20,}(?![0-9a-fA-F])")
_ALLOWED_FILE_SUFFIXES: Final = frozenset({".py", ".pyi"})
_EXCLUDED_DIRS: Final = frozenset(
    {
        ".git",
        ".venv",
        ".factory",
        ".omp",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        "__pycache__",
        "build",
        "dist",
        "node_modules",
    }
)


class DecisionCacheError(RuntimeError):
    """Base class for tracked-cache failures."""


class CachePathError(DecisionCacheError):
    """The resolved cache path escaped the project root."""


class CacheCorruptError(DecisionCacheError):
    """The tracked cache is unreadable or violates the schema."""


class RefreshLockError(DecisionCacheError):
    """Another refresh already holds the cache lock."""


@dataclass(frozen=True, slots=True)
class CacheEntry:
    """One tracked decision record."""

    key: str
    justification: str
    rule: str
    model: str
    decision: bool
    files: tuple[str, ...]
    version: int
    prompt_hash: str
    last_seen: str

    def to_json(self) -> dict[str, object]:
        """Return the exact JSON object written to disk.

        Returns:
            A sortable mapping; ``json.dumps(sort_keys=True)`` orders keys.
        """
        return {
            "decision": self.decision,
            "files": list(self.files),
            "justification": self.justification,
            "key": self.key,
            "last_seen": self.last_seen,
            "model": self.model,
            "prompt_hash": self.prompt_hash,
            "rule": self.rule,
            "version": self.version,
        }


@dataclass(frozen=True, slots=True)
class Observation:
    """A verdict produced by the checker call path during refresh."""

    justification: str
    rule: str
    model: str
    decision: bool
    file: str


def normalize_justification(text: str) -> str:
    """Normalize a suppression justification for cache identity.

    Args:
        text: Raw comment/text after the checker's ``comment or text`` choice.

    Returns:
        Whitespace-collapsed, stripped text.  The contract stores normalized
        justification text, so this is the single normalization used by both
        key derivation and persistence.
    """
    return " ".join(text.split())


def sanitize_tracked_text(text: str) -> str:
    """Redact bare hex runs of length >= 20 from committed text.

    ADR-010 forbids the tracked cache from containing bare hex strings of
    length >= 20.  User-authored justifications can contain commit hashes, so
    the prototype redacts them before persistence.  The cache key is derived
    from the *unredacted* text, so two distinct redacted justifications never
    collapse to one key.

    Args:
        text: Normalized text destined for the tracked file.

    Returns:
        Text with long hex runs replaced by ``<hex:N>``.
    """
    return _HEX_RUN_RE.sub(lambda match: f"<hex:{len(match.group(0))}>", text)


def normalize_rule(rule: str | Iterable[str]) -> str:
    """Normalize suppression codes exactly as ADR-014 pins.

    Args:
        rule: A raw ``disable=...`` payload or an iterable of symbols.

    Returns:
        Comma-joined, ASCII-sorted, de-duplicated symbols with no spaces.
    """
    parts = rule.split(",") if isinstance(rule, str) else list(rule)
    return ",".join(sorted({part.strip() for part in parts if part.strip()}))


def build_model_id(model_id: str, revision: str, prompt_version: str = PROMPT_VERSION) -> str:
    """Build the pinned ``<id> rev <short12> prompt-vN`` model string.

    Args:
        model_id: Backend/model identifier, e.g. ``fake-backend``.
        revision: Model revision or opaque test tag; truncated to 12 chars.
        prompt_version: Prompt version tag.

    Returns:
        The model string stored per entry.
    """
    return f"{model_id} rev {revision[:12]} {prompt_version}"


def prompt_hash(prompt: str = PROMPT_TEMPLATE) -> str:
    """Return the non-hex prompt fingerprint stored per entry.

    Args:
        prompt: Prompt template text.

    Returns:
        Dotted-base32 SHA-256 digest.
    """
    return encode_digest(hashlib.sha256(prompt.encode("utf-8")).digest())


def encode_digest(digest: bytes) -> str:
    """Encode a full digest without bare hex.

    The encoding keeps all 256 bits (no truncation) and uses ``.`` separators
    so neither detect-secrets' hex nor base64 quoted-string matcher can match
    the value as one token.  Group size 8 also guarantees no contiguous hex
    run >= 20 even if the digest happened to contain only hex characters.

    Args:
        digest: Raw digest bytes.

    Returns:
        ``dk1.`` followed by dot-separated lowercase base32 groups.
    """
    encoded = base64.b32encode(digest).decode("ascii").rstrip("=").lower()
    return "dk1." + ".".join(encoded[index : index + 8] for index in range(0, len(encoded), 8))


def derive_key(justification: str, rule: str, model: str) -> str:
    """Derive the collision-safe logical cache key.

    Args:
        justification: Unredacted normalized justification.
        rule: Normalized joined rule symbols.
        model: Model string.

    Returns:
        Full-SHA-256 digest encoded by :func:`encode_digest`.
    """
    material = "\x00".join((justification, rule, model)).encode("utf-8")
    return encode_digest(hashlib.sha256(material).digest())


def utc_today() -> str:
    """Return the UTC ``last_seen`` date.

    Returns:
        ``YYYY-MM-DD`` in UTC.
    """
    return datetime.now(UTC).date().isoformat()


def resolve_cache_path(cwd: Path | str, *, environ: Mapping[str, str] | None = None) -> Path:
    """Resolve the tracked cache path under the ADR-017 root guard.

    Production root is ``cwd`` (the runner launches pylint with
    ``cwd=config.cwd``).  ``PYTHON_SETUP_LINT_DECISIONS_PATH`` is test-only and
    honored only when ``PYTEST_CURRENT_TEST`` is present.

    Args:
        cwd: Linted project root.
        environ: Environment mapping (tests inject a dict).

    Returns:
        Absolute, symlink-resolved cache path.

    Raises:
        CachePathError: The production path escapes ``cwd`` (parent traversal,
            absolute outside, or a symlink pointing outside).
    """
    env = os.environ if environ is None else environ
    root = Path(cwd).expanduser().resolve()
    override = env.get(ENV_DECISIONS_PATH)
    if override and env.get(ENV_PYTEST):
        candidate = Path(override).expanduser()
        return (candidate if candidate.is_absolute() else root / candidate).resolve()

    candidate = root / CACHE_FILENAME
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise CachePathError(f"decision cache path escapes project root: {resolved} not under {root}") from exc
    if resolved == root:
        raise CachePathError(f"decision cache path resolves to the project root: {resolved}")
    return resolved


def checker_cache_path(*, cwd: Path | str | None = None, environ: Mapping[str, str] | None = None) -> Path:
    """Resolve the cache path from the checker subprocess.

    The runner launches pylint with ``cwd=config.cwd``; an optional
    ``PYTHON_SETUP_LINT_DECISIONS_ROOT`` hint is accepted only when it resolves
    to that same cwd, so it cannot redirect the tracked artifact.

    Args:
        cwd: Checker working directory; defaults to ``Path.cwd()``.
        environ: Environment mapping (tests inject a dict).

    Returns:
        The guarded cache path.

    Raises:
        CachePathError: The root hint disagrees with the checker cwd, or the
            resolved path escapes cwd.
    """
    env = os.environ if environ is None else environ
    actual_root = Path(cwd if cwd is not None else Path.cwd()).expanduser().resolve()
    hint = env.get(ENV_ROOT)
    if hint and Path(hint).expanduser().resolve() != actual_root:
        raise CachePathError(f"decision root hint {hint!r} does not match checker cwd {actual_root}")
    return resolve_cache_path(actual_root, environ=env)


def _python_files_under(base: Path, root: Path) -> set[str]:
    files: set[str] = set()
    for candidate in base.rglob("*"):
        if candidate.suffix not in _ALLOWED_FILE_SUFFIXES:
            continue
        try:
            relative = candidate.relative_to(root)
        except ValueError:  # symlinked directory outside the project root
            continue
        if any(part in _EXCLUDED_DIRS for part in relative.parts):
            continue
        files.add(relative.as_posix())
    return files


def paths_in_scope(cwd: Path | str, path: str | None = None) -> set[str]:
    """Return sorted POSIX project-relative Python paths selected by ``--path``.

    Args:
        cwd: Linted project root.
        path: File or directory under the root; ``None`` means a full sweep.

    Returns:
        Set of POSIX relative paths.

    Raises:
        CachePathError: ``--path`` escapes the project root.
    """
    root = Path(cwd).expanduser().resolve()
    if path is None:
        return _python_files_under(root, root)
    target = Path(path).expanduser()
    target = (target if target.is_absolute() else root / target).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise CachePathError(f"--path escapes project root: {target} not under {root}") from exc
    if not target.exists():
        raise CachePathError(f"--path does not exist: {target}")
    if target.is_file():
        return {target.relative_to(root).as_posix()}
    if not target.is_dir():
        return set()
    return _python_files_under(target, root)


def source_relpath(cwd: Path | str, file: Path | str) -> str:
    """Convert a linted file path to a POSIX project-relative path.

    Args:
        cwd: Linted project root.
        file: File path reported by pylint/astroid.

    Returns:
        POSIX relative path.

    Raises:
        CachePathError: The file is outside the project root.
    """
    root = Path(cwd).expanduser().resolve()
    candidate = Path(file).expanduser()
    candidate = (candidate if candidate.is_absolute() else root / candidate).resolve()
    try:
        return candidate.relative_to(root).as_posix()
    except ValueError as exc:
        raise CachePathError(f"linted file escapes project root: {candidate} not under {root}") from exc


def _as_str(raw: Any, field: str) -> str:
    if not isinstance(raw, str):
        raise CacheCorruptError(f"entry field {field!r} is not a string")
    return raw


def _as_version(raw: Any) -> int:
    if not isinstance(raw, int) or isinstance(raw, bool):
        raise CacheCorruptError("entry field 'version' is not an integer")
    return raw


def _as_files(raw: Any) -> tuple[str, ...]:
    if not isinstance(raw, list) or not all(isinstance(item, str) for item in raw):
        raise CacheCorruptError("entry field 'files' is not a list of strings")
    return tuple(raw)


def _as_decision(raw: Any) -> bool:
    if not isinstance(raw, bool):
        raise CacheCorruptError("entry field 'decision' is not a boolean")
    return raw


def _entry_from_json(raw: object) -> CacheEntry:
    if not isinstance(raw, dict):
        raise CacheCorruptError("cache entry is not an object")
    entry = CacheEntry(
        key=_as_str(raw.get("key"), "key"),
        justification=_as_str(raw.get("justification"), "justification"),
        rule=_as_str(raw.get("rule"), "rule"),
        model=_as_str(raw.get("model"), "model"),
        decision=_as_decision(raw.get("decision")),
        files=_as_files(raw.get("files")),
        version=_as_version(raw.get("version")),
        prompt_hash=_as_str(raw.get("prompt_hash"), "prompt_hash"),
        last_seen=_as_str(raw.get("last_seen"), "last_seen"),
    )
    _validate_entry(entry)
    return entry


def _validate_encoded(value: str, field: str) -> None:
    if not _KEY_RE.match(value):
        raise CacheCorruptError(f"malformed {field}: {value!r}")
    payload = "".join(value.split(".")[1:])
    if len(payload) != 52:
        raise CacheCorruptError(f"{field} does not encode a full 256-bit digest")
    try:
        base64.b32decode(payload.upper() + "====")
    except ValueError as exc:
        raise CacheCorruptError(f"{field} is not valid base32: {exc}") from exc


def _validate_entry(entry: CacheEntry) -> None:
    _validate_encoded(entry.key, "cache key")
    _validate_encoded(entry.prompt_hash, "prompt_hash")
    if entry.version != SCHEMA_VERSION:
        raise CacheCorruptError(f"unsupported cache entry version: {entry.version}")
    if not entry.justification or not entry.model:
        raise CacheCorruptError("empty justification or model")
    if not entry.files:
        raise CacheCorruptError("entry has no files")
    if tuple(sorted(set(entry.files))) != entry.files:
        raise CacheCorruptError(f"files must be sorted unique: {entry.files!r}")
    for file in entry.files:
        if Path(file).is_absolute() or ".." in Path(file).parts or "\\" in file:
            raise CacheCorruptError(f"file must be a POSIX relative path: {file!r}")
    if _BARE_HEX_RE.search(entry.justification):
        raise CacheCorruptError("justification contains a bare hex run >= 20")
    try:
        datetime.strptime(entry.last_seen, "%Y-%m-%d")
    except ValueError as exc:
        raise CacheCorruptError(f"last_seen must be YYYY-MM-DD: {entry.last_seen!r}") from exc


def load_entries(path: Path, *, strict: bool = False) -> list[CacheEntry]:
    """Load and validate the tracked array.

    Args:
        path: Cache path.
        strict: Raise on corrupt content (refresh) instead of returning an
            empty list (normal lint must never break on a bad cache).

    Returns:
        Validated entries.

    Raises:
        CacheCorruptError: ``strict`` and the file is unreadable/schema-invalid.
    """
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as exc:
        if strict:
            raise CacheCorruptError(f"cannot load decision cache {path}: {exc}") from exc
        return []
    if not isinstance(raw, list):
        if strict:
            raise CacheCorruptError(f"decision cache {path} must be a JSON array")
        return []
    entries: list[CacheEntry] = []
    for item in raw:
        try:
            entries.append(_entry_from_json(item))
        except (CacheCorruptError, TypeError, ValueError) as exc:
            if strict:
                raise CacheCorruptError(f"invalid decision cache entry: {exc}") from exc
    return entries


def dump_entries(entries: Iterable[CacheEntry]) -> str:
    """Serialize entries deterministically.

    Deduplicates by logical key (unioning files), sorts by
    ``(rule, justification, model)``, and enforces the no-bare-hex contract.

    Args:
        entries: Entries to serialize.

    Returns:
        ``indent=2``, ``sort_keys=True`` JSON array with a trailing newline.

    Raises:
        CacheCorruptError: Duplicate key with conflicting decisions or bare hex
            survived sanitization.
    """
    merged: dict[str, CacheEntry] = {}
    for entry in entries:
        existing = merged.get(entry.key)
        if existing is None:
            merged[entry.key] = entry
            continue
        if existing.decision != entry.decision:
            raise CacheCorruptError(f"conflicting decisions for key {entry.key}")
        merged[entry.key] = replace(
            existing,
            files=tuple(sorted(set(existing.files) | set(entry.files))),
            last_seen=max(existing.last_seen, entry.last_seen),
        )
    ordered = sorted(merged.values(), key=lambda entry: (entry.rule, entry.justification, entry.model, entry.key))
    rendered = json.dumps([entry.to_json() for entry in ordered], indent=2, sort_keys=True) + "\n"
    if _BARE_HEX_RE.search(rendered):
        raise CacheCorruptError("serialized cache contains a bare hex run >= 20")
    return rendered


def _target_mode(path: Path) -> int:
    if path.exists():
        return path.stat().st_mode & 0o777
    current_umask = os.umask(0)
    os.umask(current_umask)
    return 0o666 & ~current_umask


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    temporary_path = Path(temporary)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_path, _target_mode(path))
        os.replace(temporary_path, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except BaseException:
        with contextlib.suppress(OSError):
            temporary_path.unlink()
        raise


@contextlib.contextmanager
def refresh_lock(cache_path: Path) -> Generator[None]:
    """Hold an exclusive, crash-safe refresh lock beside the cache.

    Args:
        cache_path: Tracked cache path.

    Yields:
        ``None`` while the lock is held.

    Raises:
        RefreshLockError: Another refresh holds the lock.
    """
    lock_path = cache_path.with_name(LOCK_FILENAME)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        if fcntl is not None:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                raise RefreshLockError(f"another refresh holds {lock_path}") from exc
        yield
    finally:
        if fcntl is not None:
            with contextlib.suppress(OSError):
                fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def _prune_files(
    entry: CacheEntry,
    *,
    root: Path,
    scope: set[str] | None,
) -> tuple[str, ...] | None:
    kept: list[str] = []
    for file in entry.files:
        if scope is not None and file not in scope:
            kept.append(file)
        elif (root / file).is_file():
            kept.append(file)
    return tuple(sorted(kept)) or None


def merge_refresh(
    existing: Iterable[CacheEntry],
    observed: Iterable[Observation],
    *,
    cwd: Path | str,
    current_model: str,
    current_prompt_hash: str,
    last_seen: str,
    scope: set[str] | None = None,
) -> list[CacheEntry]:
    """Merge observed verdicts, union files, and prune missing/stale entries.

    Args:
        existing: Entries loaded from the tracked cache.
        observed: Verdicts produced during this refresh sweep.
        cwd: Project root used for existence checks.
        current_model: Current model string.
        current_prompt_hash: Current prompt fingerprint.
        last_seen: Deterministic ``YYYY-MM-DD`` stamp for observed entries.
        scope: Files selected by ``--path``; ``None`` means full sweep.

    Returns:
        Merged entries ready for :func:`dump_entries`.
    """
    root = Path(cwd).expanduser().resolve()
    merged: dict[str, CacheEntry] = {entry.key: entry for entry in existing}
    for observation in observed:
        key = derive_key(observation.justification, observation.rule, observation.model)
        stored_justification = sanitize_tracked_text(observation.justification)
        files = {observation.file}
        existing_entry = merged.get(key)
        if existing_entry is not None:
            files |= set(existing_entry.files)
        merged[key] = CacheEntry(
            key=key,
            justification=stored_justification,
            rule=observation.rule,
            model=observation.model,
            decision=observation.decision,
            files=tuple(sorted(files)),
            version=SCHEMA_VERSION,
            prompt_hash=current_prompt_hash,
            last_seen=last_seen,
        )

    result: list[CacheEntry] = []
    for entry in merged.values():
        if scope is not None and not set(entry.files) & scope:
            # Nothing about this entry was swept: ADR-017 retains unscanned files.
            result.append(entry)
            continue
        stale = entry.model != current_model or entry.prompt_hash != current_prompt_hash
        # A scoped refresh cannot judge the out-of-scope share of an entry, so a
        # stale mixed entry is retained (its old-model key is unreachable under
        # the new model and a later full refresh prunes it).
        fully_scanned = scope is None or set(entry.files) <= scope
        if stale and fully_scanned:
            continue
        files = _prune_files(entry, root=root, scope=scope)
        if files is None:
            continue
        result.append(replace(entry, files=files))
    return result


def refresh(
    *,
    cwd: Path | str,
    observed: Iterable[Observation],
    current_model: str,
    current_prompt_hash: str,
    last_seen: str,
    path: str | None = None,
    environ: Mapping[str, str] | None = None,
) -> Path:
    """Explicit refresh entry point: lock, load, merge, atomic replace.

    Args:
        cwd: Linted project root (runner ``config.cwd``).
        observed: Verdicts collected by the refresh sweep.
        current_model: Current model string.
        current_prompt_hash: Current prompt fingerprint.
        last_seen: Deterministic date stamp.
        path: Optional ``--path`` scope.
        environ: Environment mapping (tests inject a dict).

    Returns:
        The written cache path.
    """
    cache_path = resolve_cache_path(cwd, environ=environ)
    scope = paths_in_scope(cwd, path) if path is not None else None
    with refresh_lock(cache_path):
        existing = load_entries(cache_path, strict=True)
        merged = merge_refresh(
            existing,
            observed,
            cwd=cwd,
            current_model=current_model,
            current_prompt_hash=current_prompt_hash,
            last_seen=last_seen,
            scope=scope,
        )
        _atomic_write(cache_path, dump_entries(merged))
    return cache_path


def find_entry(
    entries: Iterable[CacheEntry],
    *,
    justification: str,
    rule: str,
    model: str,
    current_prompt_hash: str,
) -> CacheEntry | None:
    """Read-path lookup used by normal lint (never writes).

    Args:
        entries: Loaded tracked entries.
        justification: Unredacted normalized justification.
        rule: Normalized rule string.
        model: Current model string.
        current_prompt_hash: Current prompt fingerprint.

    Returns:
        Matching entry for the current model/prompt, else ``None``.
    """
    key = derive_key(justification, rule, model)
    for entry in entries:
        if entry.key == key and entry.prompt_hash == current_prompt_hash:
            return entry
    return None

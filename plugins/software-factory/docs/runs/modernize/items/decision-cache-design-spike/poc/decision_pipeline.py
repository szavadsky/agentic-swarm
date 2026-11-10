"""Prototype of the heuristic-first veto pipeline over the tracked cache.

Mirrors the ADR-014/017 decision shape without touching production code:

1. heuristic rejects -> ``False`` immediately, no backend and no cache contact;
2. cache hit (current model + prompt) -> persisted verdict wins;
3. cache miss with no backend -> heuristic verdict stands (``True`` for an
   accepted justification);
4. cache miss with a backend -> ``score >= DECISION_THRESHOLD``;
5. only refresh mode records an observation for the explicit refresh writer.

Normal lint never calls :func:`decision_cache.refresh`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from decision_cache import (
    DECISION_THRESHOLD,
    CacheEntry,
    Observation,
    derive_key,
    find_entry,
    normalize_justification,
    normalize_rule,
)

_BOILERPLATE = frozenset(
    {
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
)
_MEANINGLESS_PHRASES = frozenset(
    {
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
)


class DecisionBackend(Protocol):
    """ADR-014 backend protocol."""

    def decide(self, justification: str, rule: str, context: str) -> float:
        """Return a probability in ``[0.0, 1.0]``."""
        ...


@dataclass
class FakeBackend:
    """Deterministic stand-in for a model."""

    score: float
    calls: list[tuple[str, str, str]] = field(default_factory=list)

    def decide(self, justification: str, rule: str, context: str) -> float:
        """Record the call and return the configured score."""
        self.calls.append((justification, rule, context))
        return self.score


@dataclass
class NoBackend:
    """Explicit no-model backend (ADR-016 I4 posture)."""

    calls: int = 0

    def decide(self, justification: str, rule: str, context: str) -> float:  # pragma: no cover - never called
        """Fail loudly if a caller reaches the model with no model configured."""
        self.calls += 1
        raise AssertionError("NoBackend must not be called; heuristic stands")


def heuristic_accepts(text: str, *, rule: str | None = None) -> bool:
    """Mirror the production heuristic gate from ``checkers/_base.py``.

    Args:
        text: Justification text (after ``comment or text`` selection).
        rule: Suppression rule symbol.

    Returns:
        True when the justification is specific enough to be model-eligible.
    """
    primary = text.strip()
    if not primary or len(primary) < 5:
        return False
    primary_lower = primary.lower()
    if primary_lower in _BOILERPLATE or primary_lower in _MEANINGLESS_PHRASES:
        return False
    return not (rule and primary_lower == rule.lower())


@dataclass
class DecisionResult:
    """Outcome of one prototype decision."""

    decision: bool
    source: str
    backend_called: bool
    observation: Observation | None


def decide(
    text: str,
    *,
    rule: str,
    code_context: str,
    file: str,
    model: str,
    current_prompt_hash: str,
    entries: list[CacheEntry],
    backend: DecisionBackend | None,
    refresh_mode: bool,
    comment: str | None = None,
) -> DecisionResult:
    """Apply the heuristic-first veto pipeline.

    Args:
        text: Raw justification text.
        rule: Joined rule symbols.
        code_context: Source context for the backend.
        file: POSIX project-relative linted file.
        model: Current model string.
        current_prompt_hash: Current prompt fingerprint.
        entries: Loaded tracked entries (read-only here).
        backend: Model backend, or ``None`` when no model is configured.
        refresh_mode: When true, return an observation for the refresh writer.
        comment: Checker ``comment`` argument when it differs from ``text``.

    Returns:
        Decision plus provenance used by the four proofs.
    """
    raw = (comment or text).strip()
    normalized = normalize_justification(raw)
    if not heuristic_accepts(raw, rule=rule):
        return DecisionResult(decision=False, source="heuristic-reject", backend_called=False, observation=None)

    joined_rule = normalize_rule(rule)
    hit = find_entry(
        entries,
        justification=normalized,
        rule=joined_rule,
        model=model,
        current_prompt_hash=current_prompt_hash,
    )
    if hit is not None:
        observation = (
            Observation(
                justification=normalized,
                rule=joined_rule,
                model=model,
                decision=hit.decision,
                file=file,
            )
            if refresh_mode
            else None
        )
        return DecisionResult(
            decision=hit.decision,
            source="cache-hit",
            backend_called=False,
            observation=observation,
        )

    if backend is None:
        return DecisionResult(decision=True, source="heuristic-accept", backend_called=False, observation=None)

    score = backend.decide(normalized, joined_rule, code_context)
    decision = score >= DECISION_THRESHOLD
    observation = (
        Observation(
            justification=normalized,
            rule=joined_rule,
            model=model,
            decision=decision,
            file=file,
        )
        if refresh_mode
        else None
    )
    return DecisionResult(decision=decision, source="backend", backend_called=True, observation=observation)


def environment() -> dict[str, str]:
    """Return the process environment as a plain mapping."""
    return dict(os.environ)


def posix_file(cwd: Path | str, file: str) -> str:
    """Normalize a file argument to a POSIX project-relative path."""
    from decision_cache import source_relpath

    return source_relpath(cwd, file)


def key_for(justification: str, rule: str, model: str) -> str:
    """Expose key derivation for proof assertions."""
    return derive_key(normalize_justification(justification), normalize_rule(rule), model)

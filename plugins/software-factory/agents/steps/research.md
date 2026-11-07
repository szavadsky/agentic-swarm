# Step: Research

## Goal
Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.

## Rules
- Investigative discipline: Form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
- Concrete references: Ground every finding with repository paths, exact line ranges, or documentation URLs.
- Deliverable: Yield structured output matching `fact-finder-output.schema.json`: `{status: "ok" | "inconclusive", summary, findings, sources?, recommendations?}`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
- Read-only on repository: Do NOT edit or write code files.

## Assignment
{{assignment}}

## Task Intent
{{intent}}

## Context & Citations
{{citations}}

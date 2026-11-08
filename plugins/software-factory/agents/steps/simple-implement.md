# Step: Simple Implement

## Goal
Implement a small, isolated change directly on the item branch as a continuation of the triage session.

## Rules
- Direct implementation: execute required code edits and minimal test updates (update imports, call sites, and test assertions as needed so everything compiles — renames without call-site updates are broken changes).
- Sizing budget: keep production changes within the `simpleMaxProdLines` sizing reference. Over budget (or red gates) converts the work to a `no-behavior` item for the normal flow — never a rejection, just a reroute.
- Gate verification: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings) matching `developer-output.schema.json`.

## Intent
{{intent}}

## Context & Citations
{{citations}}

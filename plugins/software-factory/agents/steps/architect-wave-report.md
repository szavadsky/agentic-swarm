# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`{{contextPack}}`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Provide structured plan delta for PM edits.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- Amendment discipline: stay within the configured amendment budget. Do not alter already merged wave history.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.

## Current Plan
{{plan}}

## Wave Report
{{waveReport}}

## Tech Debt
{{debt}}

## Steering Directives
{{steering}}

## Context Pack
{{contextPack}}

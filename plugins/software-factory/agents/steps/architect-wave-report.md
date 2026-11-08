# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
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

## Human involvement
{{humanInvolvementCriteria}}

## Open Concerns
{{concernsYaml}}

- Raise concerns with evidence; triage pre-existing ids with the allowed dispositions and condense or dismiss stale ones.

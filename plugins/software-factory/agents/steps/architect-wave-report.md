# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Outcome options:
  - `continue`: Wave succeeded; proceed to the next scheduled wave.
  - `amend`: Revise remaining plan items based on wave learnings or spike results. Provide structured plan delta for PM edits.
  - `end-iteration`: Halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- Amendment discipline: Total amendments must not exceed `maxAmendmentsPerIteration` (default 3). Do not alter already merged wave history.
- Integrate spike findings: Use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.

## Current Plan
{{plan}}

## Wave Report
{{waveReport}}

## Tech Debt
{{debt}}

## Steering Directives
{{steering}}

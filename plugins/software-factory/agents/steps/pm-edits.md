# Step: PM Edits

## Goal
Deconstruct the approved architectural plan into scheduled, executable item specifications (`edits` artifact).

## Rules
- Item fields: for each planned item, specify `slug`, `kind`, `title`, `assignment`, `outlineRef`, `milestone`, `wave`, `deps`, `scenarioRefs`, and `citations`.
- Kinds selection: assign item kinds using the guides below (`dev`, `no-behavior`, `test-only`, `fact-finder`, `poc`, `test-assumptions`, `simple`, `epic` where allowed).
- Wave scheduling:
  - Items in wave W may ONLY depend on items scheduled in waves < W. Intra-wave dependencies are strictly invalid.
  - Concurrency: schedule at most `maxParallelItems` items per wave (see `{{limits}}` for the value).
  - Total items: stay within `maxItemsPerPlan` (see `{{limits}}`).
- Citation scoping: include only the specific subset of codebase citations required for each item's assignment. Never attach irrelevant task citations.
- Outline linkage: map each item to its plan outline via `outlineRef`. Inherit `escalate` flags from outlines.
- Output: yield structured output matching `plan-edits.schema.json`.

## Plan
{{plan}}

## Story Kinds Guide
{{kinds}}

## Story Kinds Criteria
{{storyKindsCriteria}}

## Context & Citations
{{citations}}

## Limits
{{limits}}

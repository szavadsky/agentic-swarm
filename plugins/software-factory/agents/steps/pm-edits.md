# Step: PM Edits

## Goal
Deconstruct the approved architectural plan into scheduled, executable item specifications (`edits` artifact).

## Rules
- Item fields: For each planned item, specify `slug`, `kind`, `title`, `assignment`, `outlineRef`, `milestone`, `wave`, `deps`, `scenarioRefs`, and `citations`.
- Kinds selection: Assign item kinds using `kinds` guide (`dev`, `no-behavior`, `test-only`, `fact-finder`, `poc`, `test-assumptions`, `simple`).
- Wave scheduling:
  - Items in wave $W$ may ONLY depend on items scheduled in waves $< W$. Intra-wave dependencies are strictly invalid.
  - Concurrency: Max `maxParallel` items scheduled per wave.
  - Total items: Max `maxItemsPerPlan` across all waves.
- Citation scoping: Include only the specific subset of codebase citations required for each item's assignment. Never attach irrelevant task citations.
- Outline linkage: Map each item to its plan outline via `outlineRef`. Inherit `escalate` flags from outlines.

## Plan
{{plan}}

## Story Kinds Guide
{{kinds}}

## Context & Citations
{{citations}}

## Limits
{{limits}}

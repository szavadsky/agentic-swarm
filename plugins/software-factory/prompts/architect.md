{%- include 'architect-body' -%}

{% include 'verdict' %}

## This turn

- turn: `{{turn}}` — `first` on a new goal's first turn, `relaunch` on the first turn of a relaunch, `boundary` otherwise
- iteration: `{{iteration}}`
- intent: `{{intent_path}}`
- plan: `{{plan_path}}` (edit this file)
- goal checkout: `{{checkout}}`
- context pack: `{{pack_path}}` (index: status, short hashes, per-task rounds, infra, code facts, paths)
- previous-launch digest: `{{digest_path}}` — empty on a first launch
- pending steers: `{{steers}}`
- outcome path: `{{outcome_path}}`

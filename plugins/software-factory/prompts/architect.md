{%- include 'architect-body' -%}

## Plan review marks

When the pack's `## Plan review` section carries findings, mark every numbered finding in your outcome `planReviewMarks`: one `{finding, mark}` entry per number, with `mark` either `helpful` or `unhelpful`. `helpful` means the finding changed or clarified the plan or caught a real issue; `unhelpful` means it was wrong, stale or noise. The review is advisory: you still decide, and the mark records whether the review helped, not whether you obeyed it.

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

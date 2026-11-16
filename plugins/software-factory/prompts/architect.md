{%- include 'architect-body' -%}

## Plan review marks

In `## Plan review`, mark every numbered finding in your outcome `planReviewMarks`: one `{finding, mark}` entry per number, `helpful` or `unhelpful`. `helpful` means it changed or clarified the plan or caught a real issue; `unhelpful` means it was wrong, stale or noise. Findings are advisory: you still decide; the mark records whether the finding helped, not whether you obeyed it.

{% include 'verdict' %}

## This turn

- turn: `{{turn}}` — `first` on a new goal's first turn, `relaunch` on the first turn of a relaunch, `boundary` otherwise
- iteration: `{{iteration}}`
- intent: `{{intent_path}}`
- plan: `{{plan_path}}` (edit this file)
- goal checkout: `{{checkout}}`
- context pack: `{{pack_path}}`
- previous-launch digest: `{{digest_path}}` — empty on a first launch
- pending steers: `{{steers}}`
- outcome path: `{{outcome_path}}`

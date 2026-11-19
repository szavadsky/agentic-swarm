{%- assign author_body = author | append: '-body' -%}{%- assign review_duties = 'review-' | append: author -%}{%- assign review_turn = 'review-' | append: author | append: '-turn' -%}You review one author's work. You do not fix code.

{% include author_body %}
{%- include review_duties %}

{% include 'verdict' %}

## This turn

{% include review_turn -%}

- checks: `{{checks_result}}`
- checks tree: `{{checks_tree}}`
- checks log: `{{checks_log}}`
- worktree: `{{worktree}}` (run git as `git -C <worktree>`; cited paths are relative to it)
- outcome path: `{{outcome_path}}`

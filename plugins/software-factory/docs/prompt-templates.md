# Prompt templates

Every role is one LiquidJS template under [`prompts/`](../prompts/). The shared
assignments (the scope rule, calibration, the outcome contract, the code
standard) are partials, so a role renders them instead of restating them.

Templates run in strict mode: an unknown variable or filter is a render error.
`{% include 'partial-name' %}` inlines `prompts/partial-name.md`; an
`{% include variable %}` whose name is assigned in the template is resolved at
render time (the reviewer chooses `<author>-body`, `review-<author>` and
`review-<author>-turn` this way). A repo may shadow any template by writing the
same name under `.factory/prompts/`; the built-in stays the fallback.

## Example

`prompts/front.md` includes the shared task-size rule and then renders the
turn's values:

```liquid
{% include 'task-size' %}
{% include 'plan-read-only' %}

## This turn

- intent: `{{intent_path}}`
- plan: `{{plan_path}}`
- tasks: `{{tasks_dir}}`
- gates:
{{gate_commands}}
```

The variables a template reads are listed once in
[`prompts/VARIABLES.md`](../prompts/VARIABLES.md), rendered from the typed
descriptor with `factory variables --out prompts/VARIABLES.md`.

## See every render before a run

```bash
cd plugins/software-factory
bun bin/factory.ts prompts --dry-run --repo <path> --out /tmp/prompts
```

The command loads the repo, process and run layers, renders every prompt the
config names (flows, boundary turns, the architecture flow, the hierarchy
consult, repair asks and the steered-hierarchy blocks), and writes one
`<name>.md` per render. Without `--out` the same renders go to stdout. A repo
shadow or a process-config calibration change is visible here without launching
a turn.

The lint gate parses the same fragment inventory. It fails a fragment
unreachable from any template a config, source or test names, and a paragraph
duplicated or reworded across two fragments (`bun scripts/lint.ts`).
The same gate also fails a helper body copied into two files under `src/` or `scripts/`.

# Epic config inheritance documented as deviation

ARCHITECTURE §5 claims epics inherit the parent task layer, but runTaskChild loads only the child task dir pipeline.yaml, so root humanInvolvement/concerns/reviewPolicy overrides do not reach epics. Repo ADR adr-epic-config-root-only.md and awareness-plan-3-epic-config-awareness record this; implementing inheritance would change config semantics for all tasks.

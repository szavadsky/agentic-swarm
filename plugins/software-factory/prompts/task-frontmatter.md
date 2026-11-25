Every task file is `---` frontmatter plus a brief body:

{{task_frontmatter}}

Every new task file names a `type`; `kind` and `flow` are legacy fields an old file may still carry. Configured task types: {{task_types}}. A `nogit: true` type delivers its product outside git: it finishes without a committed report and never merges. A `promote: true` type is an operator barrier: it runs no flow, its readiness drains the launch and stops it so the operator promotes the build, and the work that must run on the promoted build depends on it. Configured tiers: {{tiers}}.

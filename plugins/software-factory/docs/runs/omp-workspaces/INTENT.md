# omp-workspaces

Implement spec items 19 and 20 of `docs/factory.v2.md` in `plugins/software-factory`
(read both in full; they are the acceptance definition):
- workspace isolation via omp's configurable isolation backend by default; engine-managed git worktrees kept
  as `isolation: engine` option; start with a fact-finder spike on omp isolation mechanics
  (prior research: `plugins/software-factory/docs/spikes/`);
- preflight: omp version/config compatibility, isolation round-trip, models/roles resolvable, repo state;
- idempotent status/cleanup/gc launcher commands (dry-run gc by default, refuse while a run holds the lock);
- commit content from agents' structured output (engine never invents content);
- wave-end merge: conflict-free → deterministic CI gates → merged; conflicts/red → workhorse wave-end merger
  agent → unresolvable → architect escalation with status + worktree/branch pointers;
- saga: each epic an independent factory launch in its own workspace (parallel epics), merge escalation to the
  epic architect inside an epic and to the saga architect at saga wave end; concerns propagate upward;
- architect context economy: compaction before an uncached resume, cache warm on standby where it pays,
  cost-measured configurable defaults, re-evaluate schema-free telegraphic architect output with PM structuring;
- docs per use case (single task, story waves, epic, saga with parallel epics, conflict/escalation paths,
  status/cleanup/gc);
- "no models" end-to-end tests through the real omp harness with a scripted mock model provider.
Expected to be split into epics by the architect where complexity warrants; behavior tests only; terse prompts.

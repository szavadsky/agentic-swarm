# Step: PM Amend

## Goal
Yield ONLY the NEW items for this plan amendment (`edits-{N}.{k}.yaml` delta). The engine merges your delta into active execution.

## Rules
- Delta ONLY: yield NEW items and nothing else. NEVER re-emit existing items — re-emitted slugs are dropped deterministically and an empty delta discards the amendment.
- Yield only: you have NO file tools. Everything you need is below (`{
  "iteration": 1,
  "milestones": [
    {
      "id": "m1-omp-de-risk",
      "title": "Omp mechanics de-risked (spikes + decision records)",
      "scenarios": [
        "Given a throwaway git repo and throwaway omp profile, when the isolation probe matrix runs (backend values, omp-managed worktree add/cwd turn, failing/aborted turn, overlay acceptance), then the decision record states the omp↔engine mapping, retention guarantees, and the cheapest preflight probe.",
        "Given the installed omp binary, when the mock-provider spike probes extension registration and model catalog listing, then the report names the scripted-provider seam and a turn-by-turn scenario format (or rules extension out with evidence).",
        "Given two identical architect prompts, when the cache-key spike compares transport bytes/argv and runs live resume probes, then the report states whether omp caches by content or path and which compaction/warming knobs apply to factory sessions.",
        "Given a fixture repo with sentinel rules, when the repo-rules spike probes root-process context injection with and without --system-prompt, then the report lists rule sources, precedence, and whether factory hydration would double-inject."
      ],
      "directionalInterfaces": [
        "spike reports: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md (findings + probe logs + recommendations)",
        "decision records: {taskDir}/decisions/NNN-<topic>.yaml {status, decision, evidence, followUps} consumed by iteration-2 epic intents",
        "proposed config surface (draft, iteration 2 ratifies): isolation: omp|engine, overlay keys for isolation/worktree/compaction/cache, preflight probe command"
      ]
    },
    {
      "id": "m2-measure-stabilize",
      "title": "Cache measurement plumbing + transport stability characterized",
      "scenarios": [
        "Given an omp NDJSON turn carrying usage.cacheRead/cacheWrite and cost sub-fields, when the harness parses it, then the step meta record stores cacheReadTokens, cacheWriteTokens, totalTokens and cost breakdown, and budget/status aggregates include them.",
        "Given historical step records without cache fields, when derive/budget runs, then missing fields are treated as zero and old records remain valid (no migration).",
        "Given the same agent prompt rendered twice, when the transport characterization tests run, then they assert byte-equality of system-prompt content and overlay bytes and pin the unstable argv parts (prompt filename) as documented behavior."
      ],
      "directionalInterfaces": [
        "Usage/StepUsage: {inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, totalTokens?, costUsd?, cost?: {input?, output?, cacheRead?, cacheWrite?}} (all new fields optional)",
        "parser: NDJSON usage events -> Usage (tolerates absent cache keys); budget: sums with zero-defaults; derive: exposes cache columns to status",
        "tests: test/harness/transport-stability.test.ts (characterization, no prod change)"
      ]
    },
    {
      "id": "m3-workspace-backend",
      "title": "Workspace abstraction with omp default + engine option",
      "replanAfter": true,
      "scenarios": [
        "Given default config, when a task/item workspace is created, then it is created through the omp isolation backend and survives failing/aborted turns per the M1 retention decision.",
        "Given isolation: engine, when the same flows run, then behavior matches current engine worktrees (idempotent create/reuse, stale pruning, branch kept on remove).",
        "Given the same pipeline config twice, when the omp overlay is generated, then isolation/worktree/compaction/cache keys are byte-stable."
      ],
      "directionalInterfaces": [
        "PipelineConfig.isolation: {backend: omp|engine, ...spike-decided options}; schema + default YAML + loader validation",
        "workspace module: ensureWorkspace/releaseWorkspace {branch, path, backend} used by engine.ts and item setup; worktrees.ts becomes the engine backend",
        "overlay: writeOmpConfigOverlay emits spike-approved isolation/worktree keys"
      ]
    },
    {
      "id": "m4-lifecycle",
      "title": "Preflight hardening + whole-tree status/cleanup/gc",
      "replanAfter": true,
      "scenarios": [
        "Given an incompatible omp version or unusable isolation backend, when preflight runs, then it fails fast naming the cause (version, overlay/probe, model/role, repo-vs-records mismatch).",
        "Given a saga with epics/tasks/items, when factory status runs, then it prints the whole tree with workspace+branch per active agent and open questions, derived from records+git.",
        "Given finished and orphaned workspaces, when cleanup/gc run, then cleanup removes finished workspaces, gc dry-runs by default listing orphans (worktrees/branches/runtime/stale locks), and both refuse while any run lock is held."
      ],
      "directionalInterfaces": [
        "CLI: factory status [--tree], factory cleanup [--apply], factory gc [--apply] (exits 0 ok / 10 refused / 1 error); output sections stable for tests",
        "preflight checks: versionRange, isolationRoundTrip, modelRoleResolvability, repoRecordsConsistency (each independently testable)",
        "index: deriveWholeTree({orchRoot, git}) -> {tasks, links, workspaces, locks} (on demand, no registry)"
      ]
    },
    {
      "id": "m5-commits-merge",
      "title": "Agent-authored commits + wave-end merger + escalation pointers",
      "replanAfter": true,
      "scenarios": [
        "Given review/developer output with commitMessage/scope, when the engine commits step/merge records, then message and path scope come from the agent output and the engine adds only mechanical prefixes.",
        "Given a wave-end parent→child conflict, when the merge path runs, then a workhorse-class wave-end merger agent resolves trivial conflicts and deterministic gates re-run before merging to parent.",
        "Given an unresolvable conflict or red gates after bounded attempts, when escalation fires, then the architect consult carries a one-command status pointer plus the item worktree path and branch."
      ],
      "directionalInterfaces": [
        "schemas: review/developer-output += {commitMessage?, commitScope?}; prompts require them; step-runner/merge-path thread them to commitAll",
        "agents/wave-merger.md + steps/wave-merge.md (trivial-conflicts-only contract, yields {resolved, strategy} | {unresolvable, reason})",
        "consult payload: {statusPointer, worktree, branch, attempts, gateEvidence}"
      ]
    },
    {
      "id": "m6-saga",
      "title": "Saga independent launches + parallel epics + escalation split",
      "replanAfter": true,
      "scenarios": [
        "Given a saga plan with parallel epics, when the saga runs, then each epic executes as an independent factory launch in its own workspace with its own lock, and exit codes (0/10/1) roll up to the saga.",
        "Given a merge conflict inside an epic, when escalation fires, then it routes to the epic architect; given a saga wave-end epic-merge conflict, then it routes to the saga architect.",
        "Given child concerns/remarkables/blocking questions, when an epic wave ends, then they propagate upward (q-epic-* funnel) and appear in saga status."
      ],
      "directionalInterfaces": [
        "saga launcher: factory run --saga <task> / internal spawnChildFactory({epic, intentPath, workspace, branch}) with supervision + journal fan-in",
        "links: parent/saga identity records {sagaTask, epicSlug, childBranch, workspace} readable by status/gc/escalation routing",
        "locks: per-workspace run locks + saga coordination lock for merge/status writes; dead-PID takeover preserved"
      ]
    },
    {
      "id": "m7-cache-policy",
      "title": "Compaction/warming policy + measured defaults + plan-format review",
      "replanAfter": true,
      "scenarios": [
        "Given an architect resume that will miss the provider cache (TTL expired/model switched), when the turn starts, then the session compacts first (or starts fresh with the deterministic brief) and records the handoff + cost delta.",
        "Given standby between architect turns, when warming is cheaper than expected uncached resume, then the cache stays warm via omp mechanics; otherwise warming is explicitly off by config.",
        "Given measured plan-repair turns and cache-read costs, when the plan-format review runs, then it ratifies schema-bound plans or telegraphic+PM-structuring with cost evidence, and 20d optimizations stay off unless measured wins."
      ],
      "directionalInterfaces": [
        "config: architect.cache {compaction: {mode, triggers}, warming: {mode|off}, defaultsFrom: measurements}; overlay emits omp compaction/providers.cache* keys",
        "handoff record: brief + {reason: cache-miss|model-switch, priorSession, costDelta} in runs/ + journal event",
        "plan contract decision: docs/decisions/plan-format.md (+ schema/prompt changes if flipped)"
      ]
    },
    {
      "id": "m8-e2e-docs",
      "title": "No-model e2e + repo-rules hydration + use-case docs",
      "replanAfter": true,
      "scenarios": [
        "Given the scripted mock provider and the real omp binary, when the no-model e2e suite runs, then isolation, merge/conflict/escalation, saga/epic launch, restart, and gc scenarios pass with zero paid-model calls.",
        "Given a fixture repo with sentinel rules, when architect/developer/qa/reviewer turns run, then each role prompt contains the hydrated rules and probe agents quote the sentinel.",
        "Given each use case (single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc), when docs are read, then a dedicated page exists and sentinel tests pin the required sections."
      ],
      "directionalInterfaces": [
        "mock provider: test/e2e/mock-provider/* (extension or local endpoint per M1 seam) + scenario scripts {turns: [{yield|toolCalls|text}]}; runner: bun test test/e2e/** with FACTORY_E2E_OMP=1 (real binary, scripted models)",
        "hydration: prompt var {{repoRules}} + resolver resolveRepoRules(repoRoot) {sources, precedence}; preflight renders per role",
        "docs: docs/usage/{single-task,story-waves,epic,saga,merging-escalation,lifecycle}.md + test/docs-usage.test.ts sentinels"
      ]
    }
  ],
  "uncertainties": [
    {
      "id": "u-isolation-backend",
      "description": "Allowed isolation.backend values; whether omp-managed worktrees (worktree add + --cwd) retain commits on failure/abort like engine worktrees; which omp mechanism maps to factory root-process workspaces; merge-back ownership; cheapest validating preflight probe; model/role resolvability without paid turns.",
      "spikeOutlines": [
        "spike-omp-isolation (fact-finder, iteration 1, M1): throwaway profile+repos probe matrix + decision record; blocks M3/M4/M6 design"
      ]
    },
    {
      "id": "u-mock-provider-seam",
      "description": "How to register a scripted provider for real omp (extension API vs local endpoint), catalog listing with --config/-e, streaming NDJSON contract, scenario format.",
      "spikeOutlines": [
        "spike-mock-provider (fact-finder, iteration 1, M1): seam probe + scenario-format proposal; poc + runner deferred to M8"
      ]
    },
    {
      "id": "u-cache-keying",
      "description": "Whether omp prompt cache keys on content or transport path (prompt filename, overlay regen); which compaction/warming knobs affect one-process-per-turn factory sessions; cold-resume detection signals.",
      "spikeOutlines": [
        "spike-cache-key (fact-finder, iteration 1, M1): byte-diff + live resume probes; transport stabilization deferred to M7"
      ]
    },
    {
      "id": "u-repo-rules",
      "description": "Rule file sources/precedence; whether omp injects context files into root --system-prompt processes (double-injection risk); per-role hydration seams.",
      "spikeOutlines": [
        "spike-repo-rules (fact-finder, iteration 1, M1): sentinel-fixture probes; hydration implementation deferred to M8"
      ]
    },
    {
      "id": "u-saga-orchestration",
      "description": "Child launch supervision, epic INTENT resolution, parallel-epic lock/merge coordination, architect routing map — designable after M1+M3; may need a launcher poc in iteration 2.",
      "spikeOutlines": [
        "poc saga launcher (iteration 2, after M3): spawn/supervise two stub children, lock + journal fan-in; proposal only, not scheduled now"
      ]
    },
    {
      "id": "u-plan-format",
      "description": "Whether schema-free telegraphic plans + PM structuring beat schema-bound plans on repair-turn cost — needs measured repair data from records.",
      "spikeOutlines": [
        "fact-finder plan-repair cost analysis (iteration 2, after M2): count repair turns + cache costs from records; feeds M7 decision"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "spike-omp-isolation",
      "kind": "fact-finder",
      "title": "Spike: omp isolation mechanics + backend decision",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Probe installed omp (throwaway --profile, temp repos): enumerate isolation.backend values; compare isolated-task vs omp worktree add + --cwd retention on failing/aborted turns; determine the root-process workspace mapping; evaluate task.isolation apply/merge/commits vs engine merges; define the cheapest validating preflight probe (real turn, since --version/config-get are no-ops); test model/role resolvability without paid turns. Yield decision record + docs/spikes/omp-3-isolation.md. No prod code."
    },
    {
      "slug": "spike-mock-provider",
      "kind": "fact-finder",
      "title": "Spike: scripted mock provider seam for real omp",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Probe the omp extension API + model listing (-e/--config) and any custom-provider/endpoint registration; capture the streaming NDJSON contract; propose a canned scenario format (turn-by-turn text/tool-calls/yield) and prove a minimal real-omp turn against a scripted provider with zero paid calls (or rule the seam out with evidence). Report + proposal only; poc/runner deferred to M8."
    },
    {
      "slug": "spike-cache-key",
      "kind": "fact-finder",
      "title": "Spike: prompt-cache keying + compaction/warming audit",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Diff transport bytes/argv across identical renders (system prompt, overlay, prompt path); run live resume probes (same vs changed prompt path, model switch, TTL) with cache-miss markers; audit which compaction.* / providers.cache* knobs affect one-process-per-turn factory sessions; recommend cold-resume detection plus the compaction-vs-fresh-brief mechanism and warming viability. No prod changes (M2 characterizes, M7 implements)."
    },
    {
      "slug": "spike-repo-rules",
      "kind": "fact-finder",
      "title": "Spike: repo-rules sources + omp injection audit",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Enumerate rule sources (AGENTS.md/CLAUDE.md/.cursorrules/.omp/rules, root+subdirs) and precedence; probe whether root omp processes with --system-prompt already receive context files (contextFiles.extra/--no-context-files) using sentinel fixtures; map per-role hydration seams (architect/developer/qa/reviewer) and the verification plan. Report only; hydration deferred to M8."
    },
    {
      "slug": "usage-cache-tokens",
      "kind": "dev",
      "title": "Cache-token usage plumbing end to end",
      "milestoneId": "m2-measure-stabilize",
      "prodBudgetHint": 180,
      "description": "Extend Usage/StepUsage with optional cacheReadTokens/cacheWriteTokens/totalTokens + cost breakdown; parse them in NdjsonParser (tolerate absence); persist in step meta records; aggregate in budget/derive; surface cache columns in status. Behavior tests: fixture NDJSON with cache fields, old-record backward compat (missing→0), budget sums, status output. Tests-first per dev kind."
    },
    {
      "slug": "transport-byte-stability",
      "kind": "test-only",
      "title": "Transport byte-stability characterization tests",
      "milestoneId": "m2-measure-stabilize",
      "prodBudgetHint": 0,
      "description": "Add tests rendering identical prompts twice and asserting byte-equality of system-prompt content and generated overlay, while pinning unstable argv parts (timestamped prompt filename) as current documented behavior. No prod changes; stabilization decision deferred to M7 after spike-cache-key."
    },
    {
      "description": "In mergeItem (plugins/software-factory/src/core/flows/merge-path.ts), execute infra.setup commands in childWt BEFORE the verify-checks phase (before gates snapshot/run), using the same runInfraSetup semantics as the temp-worktree paths (gates.ts:332-335, runner.ts:796-810). Requirements: no-op when setup is empty; setup runs before snapshotWorktree so setup-created untracked files (node_modules) are not flagged as gate mutations; failure of setup fails the merge with the setup command + output as evidence (same evidence shape as gate failures). Behavior tests (tests-first, tmp-repo, no network): (1) merge where infra.setup writes a marker file asserts gates observe it; (2) empty setup behaves exactly as today; (3) failing setup fails merge with actionable evidence. Note: fix takes effect on engine restart, not mid-run.",
      "kind": "dev",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 80,
      "slug": "merge-setup-fix",
      "title": "Run infra.setup in merge child worktree before gates"
    },
    {
      "description": "Salvage approved wave-1 spike research stranded on failed item branches (all research steps ok, reviews approved; only wave-end merges failed environmentally). Read-only via `git show <branch>:<path>` (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths): topic/omp-workspaces--spike-omp-isolation items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review), topic/omp-workspaces--spike-mock-provider steps/001-research-r1-a1/output.yaml (+002 review), topic/omp-workspaces--spike-cache-key steps/001-research-r1-a1/output.yaml (+002 review), topic/omp-workspaces--spike-repo-rules steps/001-research-r1-a1/output.yaml (+002 review), plus parent-branch decisions/001 + 002 rulings. Write the four spike draft docs to plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md from the embedded drafts (applying each review's optional polish notes where they correct evidence, e.g. probe-26/18 softening, spec-path fix), and items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario to evidence + followUps for iteration-2 planning. Docs only, zero prod lines. Verify: all five files present with probe-evidence sections; parent branch only.",
      "kind": "no-behavior",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "slug": "spike-findings-recovery",
      "title": "Recover wave-1 spike findings onto parent branch"
    },
    {
      "description": "Docs-only salvage retry. Copy the 4 approved spike docs (plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md) plus items/spike-findings-recovery/RECOVERY.md from branch topic/omp-workspaces--spike-findings-recovery onto this item's branch via read-only `git show <branch>:<path>` (NEVER checkout/switch branches). Fix the `oMP` capitalization typo in omp-6-repo-rules.md. Verify all 5 files present with probe-evidence sections. CRITICAL: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red baseline); omit target or use a single passing selector target. Zero prod lines; no-behavior kind.",
      "kind": "no-behavior",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "slug": "spike-findings-recovery-v2",
      "title": "Recover wave-1 spike findings onto parent branch (v2)"
    },
    {
      "description": "Fix checkTargetGreen gate-target branch (plugins/software-factory/src/core/checks/runner.ts:644-676) to apply the same baseline ratchet runGates uses: when the gate command fails, compare failing tests against gates-baseline.yaml and pass when failures are a subset of baseline (plus JUnit re-derivation parity where applicable). Behavior tests-first with tmp-repo fixtures: (1) gate target failing ONLY on baseline-listed tests passes; (2) gate target with a NEW failing test still fails with actionable evidence; (3) gate target fully green still passes. Keep prod diff small (~60 lines hint). Record selector targets (not gate targets) so this item itself merges cleanly.",
      "kind": "dev",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 60,
      "slug": "target-green-ratchet-fix",
      "title": "Apply baseline ratchet to target-green gate targets"
    }
  ],
  "assumptions": [
    {
      "assumption": "Iteration 1 schedules spikes + measurement only; child epics (proposed: workspaces-lifecycle, commits-merge, saga-launches, cache-policy, e2e-docs-hydration) are defined in iteration 2 with spike-informed intents.",
      "why": "All major subsystems build on spike decisions; epic children launched now could not see later-merged findings. Progressive planning defers epic definition to the next architect turn via replanAfter milestones."
    },
    {
      "assumption": "Installed omp 18.18.5 is representative; spikes probe it directly and preflight will pin a minimum version.",
      "why": "Context-pack probes already ran against this binary; findings must be validated against the real harness, not docs."
    },
    {
      "assumption": "Current engine worktree behavior is preserved behind isolation: engine without regression.",
      "why": "Spec keeps engine worktrees as a config option; M3 must not change engine semantics until the omp backend is proven."
    },
    {
      "assumption": "The single red baseline test (disk-space threshold, env-sensitive) is accepted as-is; iteration gates pass if no NEW failures appear.",
      "why": "Clean-checkout rule forbids investigating env-sensitive baseline reds; ratchet on new failures instead."
    },
    {
      "assumption": "All new tests assume cwd=plugins/software-factory and resolve fixtures repo-relatively.",
      "why": "Infra notes: running from the repo root breaks fixture resolution; spike/e2e tests must follow the same convention."
    },
    {
      "assumption": "Spikes may run bounded real-omp turns (throwaway profile/repos) using configured roles; token cost is research cost.",
      "why": "Cache/retention/resolvability questions are only answerable through the real binary; M8's no-model constraint applies to the committed e2e suite, not to spike probes."
    }
  ],
  "techDebt": [
    {
      "id": "td-baseline-disk",
      "description": "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2 (env-sensitive duplicate low-space paths).",
      "category": "adjacent",
      "resolution": "Accepted as-is; iteration gates ratchet on new failures only."
    },
    {
      "id": "td-hardcoded-omp",
      "description": "Preflight hard-codes omp fallback path /home/slava/.bun/bin/omp.",
      "category": "adjacent",
      "resolution": "Remove during M4 preflight hardening (resolve via PATH/config only)."
    },
    {
      "id": "td-no-lint",
      "description": "No lint/format gate configured.",
      "category": "adjacent",
      "resolution": "Out of scope; if added later, exclude the orchestration folder .factory/**."
    },
    {
      "id": "td-usage-cache",
      "description": "Usage parser drops cacheRead/cacheWrite/totalTokens + cost subfields; StepUsage/budget/derive aggregate only input/output/cost.",
      "category": "impacting",
      "resolution": "Resolved this iteration by usage-cache-tokens (M2); M7 defaults depend on it."
    },
    {
      "id": "td-prompt-path",
      "description": "Per-turn prompt transport path embeds timestamp+randomness; overlay regenerated per turn; no byte-stability tests.",
      "category": "impacting",
      "resolution": "Characterize this iteration via transport-byte-stability (M2, tests only); stabilize in M7 after spike-cache-key decides content-vs-path keying."
    },
    {
      "id": "td-runtime-growth",
      "description": "Runtime dirs sessions/prompts/system-prompts grow without cleanup (only tmp/ purged); omp-owned orphans unclassified.",
      "category": "impacting",
      "resolution": "M4 gc semantics cover runtime files + omp-owned orphans; M8 e2e asserts bounded growth across restart/gc scenarios."
    }
  ],
  "adrs": [
    {
      "id": "adr-iter1-spikes-first",
      "title": "Iteration 1 runs spikes + measurement only; epics deferred to iteration 2",
      "context": "Items 19/20 hinge on unvalidated omp mechanics (isolation backend, provider seam, cache keying, context injection); intent mandates starting with a fact-finder spike; epic child worktrees branch from the parent tip at launch and cannot see spike findings merged later.",
      "decision": "Iteration 1 schedules four fact-finder spikes (M1) plus two spike-independent foundation items (M2). No child epics are defined; the iteration-2 architect turn defines epics with spike-informed intents against replanAfter milestones M3-M8."
    },
    {
      "id": "adr-whole-tree-index",
      "title": "Whole-tree status/cleanup/gc derive on demand from records + git; no persistent registry",
      "context": "19.3 requires idempotent tracking derived from records+git; a registry file risks drift from worktree/branch reality; parseWorktreeList plus INTENT/journal/task dirs already provide the sources.",
      "decision": "M4 implements deriveWholeTree over orchestration dirs, journals, and git worktree/branch state on every invocation; cleanup/gc compute candidate sets from the same derivation and refuse while any run lock is live."
    },
    {
      "id": "adr-cache-fields-additive",
      "title": "Cache-token usage fields are additive and optional end to end",
      "context": "M2 must capture cacheRead/cacheWrite/totalTokens plus cost breakdown without invalidating historical records or forcing a migration.",
      "decision": "All new Usage/StepUsage/record/budget fields are optional with zero-default aggregation; the parser tolerates absent keys; schemas gain optional properties only."
    },
    {
      "id": "adr-real-binary-e2e",
      "title": "No-model e2e drives the real omp binary with a scripted provider; FakeHarness retained for engine tests",
      "context": "19.8 requires end-to-end through the real omp harness with a scripted mock provider and zero paid calls; existing engine coverage relies on FakeHarness-by-label and mock-binary harness tests, neither of which exercises real omp.",
      "decision": "M8 builds a scripted provider behind the M1-chosen seam plus a scenario runner over the real omp binary (opt-in env flag, skips cleanly without omp); FakeHarness remains the default for fast engine behavior tests."
    }
  ]
}`, `iteration: 1
amendments: 2
items:
  - spike-omp-isolation kind=fact-finder wave=1 status=failed outlineRef=spike-omp-isolation
  - spike-mock-provider kind=fact-finder wave=1 status=failed outlineRef=spike-mock-provider
  - spike-cache-key kind=fact-finder wave=1 status=failed outlineRef=spike-cache-key
  - spike-repo-rules kind=fact-finder wave=1 status=failed outlineRef=spike-repo-rules
  - usage-cache-tokens kind=dev wave=2 status=merged outlineRef=usage-cache-tokens
  - transport-byte-stability kind=test-only wave=2 status=merged outlineRef=transport-byte-stability
  - merge-setup-fix kind=dev wave=2 status=merged outlineRef=merge-setup-fix
  - spike-findings-recovery kind=no-behavior wave=2 status=failed outlineRef=spike-findings-recovery
waves: 1, 2
merged: usage-cache-tokens, transport-byte-stability, merge-setup-fix
blocked: (none)
failed: spike-omp-isolation, spike-mock-provider, spike-cache-key, spike-repo-rules, spike-findings-recovery
open steer questions:
  - q-adr-cache-fields-additive-87bb471f5e ref=adr-cache-fields-additive disposition=human-awareness: Remarkable architectural decision adr-cache-fields-additive (Cache-token usage fields are additive and optional end to end) recorded for awareness.
  - q-adr-iter1-spikes-first-402887ef39 ref=adr-iter1-spikes-first disposition=human-awareness: Remarkable architectural decision adr-iter1-spikes-first (Iteration 1 runs spikes + measurement only; epics deferred to iteration 2) recorded for awareness.
  - q-adr-real-binary-e2e-4938cae2f4 ref=adr-real-binary-e2e disposition=human-awareness: Remarkable architectural decision adr-real-binary-e2e (No-model e2e drives the real omp binary with a scripted provider; FakeHarness retained for engine tests) recorded for awareness.
  - q-adr-whole-tree-index-45f9d196da ref=adr-whole-tree-index disposition=human-awareness: Remarkable architectural decision adr-whole-tree-index (Whole-tree status/cleanup/gc derive on demand from records + git; no persistent registry) recorded for awareness.`, `Wave 2 merged 3/4 (M2 measurement items + merge-setup-fix); the only gap is M1 spike evidence still stranded on the failed recovery branch plus the newly discovered target-green ratchet gap (c-2bec98be29). Schedule the two new outlines together in wave 3 (both independent, no deps): spike-findings-recovery-v2 first-priority (unblocks iteration-2 epic planning with M1 evidence on parent), target-green-ratchet-fix in parallel. No removals: no pending items exist; failed items are terminal and stay as evidence.`, `Wave 2 completed. Merged items: usage-cache-tokens, transport-byte-stability, merge-setup-fix`). NEVER reference files you cannot see.
- Structure ONLY architect-provided outlines: every item's `outlineRef` MUST name an outline slug from `{
  "iteration": 1,
  "milestones": [
    {
      "id": "m1-omp-de-risk",
      "title": "Omp mechanics de-risked (spikes + decision records)",
      "scenarios": [
        "Given a throwaway git repo and throwaway omp profile, when the isolation probe matrix runs (backend values, omp-managed worktree add/cwd turn, failing/aborted turn, overlay acceptance), then the decision record states the omp↔engine mapping, retention guarantees, and the cheapest preflight probe.",
        "Given the installed omp binary, when the mock-provider spike probes extension registration and model catalog listing, then the report names the scripted-provider seam and a turn-by-turn scenario format (or rules extension out with evidence).",
        "Given two identical architect prompts, when the cache-key spike compares transport bytes/argv and runs live resume probes, then the report states whether omp caches by content or path and which compaction/warming knobs apply to factory sessions.",
        "Given a fixture repo with sentinel rules, when the repo-rules spike probes root-process context injection with and without --system-prompt, then the report lists rule sources, precedence, and whether factory hydration would double-inject."
      ],
      "directionalInterfaces": [
        "spike reports: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md (findings + probe logs + recommendations)",
        "decision records: {taskDir}/decisions/NNN-<topic>.yaml {status, decision, evidence, followUps} consumed by iteration-2 epic intents",
        "proposed config surface (draft, iteration 2 ratifies): isolation: omp|engine, overlay keys for isolation/worktree/compaction/cache, preflight probe command"
      ]
    },
    {
      "id": "m2-measure-stabilize",
      "title": "Cache measurement plumbing + transport stability characterized",
      "scenarios": [
        "Given an omp NDJSON turn carrying usage.cacheRead/cacheWrite and cost sub-fields, when the harness parses it, then the step meta record stores cacheReadTokens, cacheWriteTokens, totalTokens and cost breakdown, and budget/status aggregates include them.",
        "Given historical step records without cache fields, when derive/budget runs, then missing fields are treated as zero and old records remain valid (no migration).",
        "Given the same agent prompt rendered twice, when the transport characterization tests run, then they assert byte-equality of system-prompt content and overlay bytes and pin the unstable argv parts (prompt filename) as documented behavior."
      ],
      "directionalInterfaces": [
        "Usage/StepUsage: {inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, totalTokens?, costUsd?, cost?: {input?, output?, cacheRead?, cacheWrite?}} (all new fields optional)",
        "parser: NDJSON usage events -> Usage (tolerates absent cache keys); budget: sums with zero-defaults; derive: exposes cache columns to status",
        "tests: test/harness/transport-stability.test.ts (characterization, no prod change)"
      ]
    },
    {
      "id": "m3-workspace-backend",
      "title": "Workspace abstraction with omp default + engine option",
      "replanAfter": true,
      "scenarios": [
        "Given default config, when a task/item workspace is created, then it is created through the omp isolation backend and survives failing/aborted turns per the M1 retention decision.",
        "Given isolation: engine, when the same flows run, then behavior matches current engine worktrees (idempotent create/reuse, stale pruning, branch kept on remove).",
        "Given the same pipeline config twice, when the omp overlay is generated, then isolation/worktree/compaction/cache keys are byte-stable."
      ],
      "directionalInterfaces": [
        "PipelineConfig.isolation: {backend: omp|engine, ...spike-decided options}; schema + default YAML + loader validation",
        "workspace module: ensureWorkspace/releaseWorkspace {branch, path, backend} used by engine.ts and item setup; worktrees.ts becomes the engine backend",
        "overlay: writeOmpConfigOverlay emits spike-approved isolation/worktree keys"
      ]
    },
    {
      "id": "m4-lifecycle",
      "title": "Preflight hardening + whole-tree status/cleanup/gc",
      "replanAfter": true,
      "scenarios": [
        "Given an incompatible omp version or unusable isolation backend, when preflight runs, then it fails fast naming the cause (version, overlay/probe, model/role, repo-vs-records mismatch).",
        "Given a saga with epics/tasks/items, when factory status runs, then it prints the whole tree with workspace+branch per active agent and open questions, derived from records+git.",
        "Given finished and orphaned workspaces, when cleanup/gc run, then cleanup removes finished workspaces, gc dry-runs by default listing orphans (worktrees/branches/runtime/stale locks), and both refuse while any run lock is held."
      ],
      "directionalInterfaces": [
        "CLI: factory status [--tree], factory cleanup [--apply], factory gc [--apply] (exits 0 ok / 10 refused / 1 error); output sections stable for tests",
        "preflight checks: versionRange, isolationRoundTrip, modelRoleResolvability, repoRecordsConsistency (each independently testable)",
        "index: deriveWholeTree({orchRoot, git}) -> {tasks, links, workspaces, locks} (on demand, no registry)"
      ]
    },
    {
      "id": "m5-commits-merge",
      "title": "Agent-authored commits + wave-end merger + escalation pointers",
      "replanAfter": true,
      "scenarios": [
        "Given review/developer output with commitMessage/scope, when the engine commits step/merge records, then message and path scope come from the agent output and the engine adds only mechanical prefixes.",
        "Given a wave-end parent→child conflict, when the merge path runs, then a workhorse-class wave-end merger agent resolves trivial conflicts and deterministic gates re-run before merging to parent.",
        "Given an unresolvable conflict or red gates after bounded attempts, when escalation fires, then the architect consult carries a one-command status pointer plus the item worktree path and branch."
      ],
      "directionalInterfaces": [
        "schemas: review/developer-output += {commitMessage?, commitScope?}; prompts require them; step-runner/merge-path thread them to commitAll",
        "agents/wave-merger.md + steps/wave-merge.md (trivial-conflicts-only contract, yields {resolved, strategy} | {unresolvable, reason})",
        "consult payload: {statusPointer, worktree, branch, attempts, gateEvidence}"
      ]
    },
    {
      "id": "m6-saga",
      "title": "Saga independent launches + parallel epics + escalation split",
      "replanAfter": true,
      "scenarios": [
        "Given a saga plan with parallel epics, when the saga runs, then each epic executes as an independent factory launch in its own workspace with its own lock, and exit codes (0/10/1) roll up to the saga.",
        "Given a merge conflict inside an epic, when escalation fires, then it routes to the epic architect; given a saga wave-end epic-merge conflict, then it routes to the saga architect.",
        "Given child concerns/remarkables/blocking questions, when an epic wave ends, then they propagate upward (q-epic-* funnel) and appear in saga status."
      ],
      "directionalInterfaces": [
        "saga launcher: factory run --saga <task> / internal spawnChildFactory({epic, intentPath, workspace, branch}) with supervision + journal fan-in",
        "links: parent/saga identity records {sagaTask, epicSlug, childBranch, workspace} readable by status/gc/escalation routing",
        "locks: per-workspace run locks + saga coordination lock for merge/status writes; dead-PID takeover preserved"
      ]
    },
    {
      "id": "m7-cache-policy",
      "title": "Compaction/warming policy + measured defaults + plan-format review",
      "replanAfter": true,
      "scenarios": [
        "Given an architect resume that will miss the provider cache (TTL expired/model switched), when the turn starts, then the session compacts first (or starts fresh with the deterministic brief) and records the handoff + cost delta.",
        "Given standby between architect turns, when warming is cheaper than expected uncached resume, then the cache stays warm via omp mechanics; otherwise warming is explicitly off by config.",
        "Given measured plan-repair turns and cache-read costs, when the plan-format review runs, then it ratifies schema-bound plans or telegraphic+PM-structuring with cost evidence, and 20d optimizations stay off unless measured wins."
      ],
      "directionalInterfaces": [
        "config: architect.cache {compaction: {mode, triggers}, warming: {mode|off}, defaultsFrom: measurements}; overlay emits omp compaction/providers.cache* keys",
        "handoff record: brief + {reason: cache-miss|model-switch, priorSession, costDelta} in runs/ + journal event",
        "plan contract decision: docs/decisions/plan-format.md (+ schema/prompt changes if flipped)"
      ]
    },
    {
      "id": "m8-e2e-docs",
      "title": "No-model e2e + repo-rules hydration + use-case docs",
      "replanAfter": true,
      "scenarios": [
        "Given the scripted mock provider and the real omp binary, when the no-model e2e suite runs, then isolation, merge/conflict/escalation, saga/epic launch, restart, and gc scenarios pass with zero paid-model calls.",
        "Given a fixture repo with sentinel rules, when architect/developer/qa/reviewer turns run, then each role prompt contains the hydrated rules and probe agents quote the sentinel.",
        "Given each use case (single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc), when docs are read, then a dedicated page exists and sentinel tests pin the required sections."
      ],
      "directionalInterfaces": [
        "mock provider: test/e2e/mock-provider/* (extension or local endpoint per M1 seam) + scenario scripts {turns: [{yield|toolCalls|text}]}; runner: bun test test/e2e/** with FACTORY_E2E_OMP=1 (real binary, scripted models)",
        "hydration: prompt var {{repoRules}} + resolver resolveRepoRules(repoRoot) {sources, precedence}; preflight renders per role",
        "docs: docs/usage/{single-task,story-waves,epic,saga,merging-escalation,lifecycle}.md + test/docs-usage.test.ts sentinels"
      ]
    }
  ],
  "uncertainties": [
    {
      "id": "u-isolation-backend",
      "description": "Allowed isolation.backend values; whether omp-managed worktrees (worktree add + --cwd) retain commits on failure/abort like engine worktrees; which omp mechanism maps to factory root-process workspaces; merge-back ownership; cheapest validating preflight probe; model/role resolvability without paid turns.",
      "spikeOutlines": [
        "spike-omp-isolation (fact-finder, iteration 1, M1): throwaway profile+repos probe matrix + decision record; blocks M3/M4/M6 design"
      ]
    },
    {
      "id": "u-mock-provider-seam",
      "description": "How to register a scripted provider for real omp (extension API vs local endpoint), catalog listing with --config/-e, streaming NDJSON contract, scenario format.",
      "spikeOutlines": [
        "spike-mock-provider (fact-finder, iteration 1, M1): seam probe + scenario-format proposal; poc + runner deferred to M8"
      ]
    },
    {
      "id": "u-cache-keying",
      "description": "Whether omp prompt cache keys on content or transport path (prompt filename, overlay regen); which compaction/warming knobs affect one-process-per-turn factory sessions; cold-resume detection signals.",
      "spikeOutlines": [
        "spike-cache-key (fact-finder, iteration 1, M1): byte-diff + live resume probes; transport stabilization deferred to M7"
      ]
    },
    {
      "id": "u-repo-rules",
      "description": "Rule file sources/precedence; whether omp injects context files into root --system-prompt processes (double-injection risk); per-role hydration seams.",
      "spikeOutlines": [
        "spike-repo-rules (fact-finder, iteration 1, M1): sentinel-fixture probes; hydration implementation deferred to M8"
      ]
    },
    {
      "id": "u-saga-orchestration",
      "description": "Child launch supervision, epic INTENT resolution, parallel-epic lock/merge coordination, architect routing map — designable after M1+M3; may need a launcher poc in iteration 2.",
      "spikeOutlines": [
        "poc saga launcher (iteration 2, after M3): spawn/supervise two stub children, lock + journal fan-in; proposal only, not scheduled now"
      ]
    },
    {
      "id": "u-plan-format",
      "description": "Whether schema-free telegraphic plans + PM structuring beat schema-bound plans on repair-turn cost — needs measured repair data from records.",
      "spikeOutlines": [
        "fact-finder plan-repair cost analysis (iteration 2, after M2): count repair turns + cache costs from records; feeds M7 decision"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "spike-omp-isolation",
      "kind": "fact-finder",
      "title": "Spike: omp isolation mechanics + backend decision",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Probe installed omp (throwaway --profile, temp repos): enumerate isolation.backend values; compare isolated-task vs omp worktree add + --cwd retention on failing/aborted turns; determine the root-process workspace mapping; evaluate task.isolation apply/merge/commits vs engine merges; define the cheapest validating preflight probe (real turn, since --version/config-get are no-ops); test model/role resolvability without paid turns. Yield decision record + docs/spikes/omp-3-isolation.md. No prod code."
    },
    {
      "slug": "spike-mock-provider",
      "kind": "fact-finder",
      "title": "Spike: scripted mock provider seam for real omp",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Probe the omp extension API + model listing (-e/--config) and any custom-provider/endpoint registration; capture the streaming NDJSON contract; propose a canned scenario format (turn-by-turn text/tool-calls/yield) and prove a minimal real-omp turn against a scripted provider with zero paid calls (or rule the seam out with evidence). Report + proposal only; poc/runner deferred to M8."
    },
    {
      "slug": "spike-cache-key",
      "kind": "fact-finder",
      "title": "Spike: prompt-cache keying + compaction/warming audit",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Diff transport bytes/argv across identical renders (system prompt, overlay, prompt path); run live resume probes (same vs changed prompt path, model switch, TTL) with cache-miss markers; audit which compaction.* / providers.cache* knobs affect one-process-per-turn factory sessions; recommend cold-resume detection plus the compaction-vs-fresh-brief mechanism and warming viability. No prod changes (M2 characterizes, M7 implements)."
    },
    {
      "slug": "spike-repo-rules",
      "kind": "fact-finder",
      "title": "Spike: repo-rules sources + omp injection audit",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Enumerate rule sources (AGENTS.md/CLAUDE.md/.cursorrules/.omp/rules, root+subdirs) and precedence; probe whether root omp processes with --system-prompt already receive context files (contextFiles.extra/--no-context-files) using sentinel fixtures; map per-role hydration seams (architect/developer/qa/reviewer) and the verification plan. Report only; hydration deferred to M8."
    },
    {
      "slug": "usage-cache-tokens",
      "kind": "dev",
      "title": "Cache-token usage plumbing end to end",
      "milestoneId": "m2-measure-stabilize",
      "prodBudgetHint": 180,
      "description": "Extend Usage/StepUsage with optional cacheReadTokens/cacheWriteTokens/totalTokens + cost breakdown; parse them in NdjsonParser (tolerate absence); persist in step meta records; aggregate in budget/derive; surface cache columns in status. Behavior tests: fixture NDJSON with cache fields, old-record backward compat (missing→0), budget sums, status output. Tests-first per dev kind."
    },
    {
      "slug": "transport-byte-stability",
      "kind": "test-only",
      "title": "Transport byte-stability characterization tests",
      "milestoneId": "m2-measure-stabilize",
      "prodBudgetHint": 0,
      "description": "Add tests rendering identical prompts twice and asserting byte-equality of system-prompt content and generated overlay, while pinning unstable argv parts (timestamped prompt filename) as current documented behavior. No prod changes; stabilization decision deferred to M7 after spike-cache-key."
    },
    {
      "description": "In mergeItem (plugins/software-factory/src/core/flows/merge-path.ts), execute infra.setup commands in childWt BEFORE the verify-checks phase (before gates snapshot/run), using the same runInfraSetup semantics as the temp-worktree paths (gates.ts:332-335, runner.ts:796-810). Requirements: no-op when setup is empty; setup runs before snapshotWorktree so setup-created untracked files (node_modules) are not flagged as gate mutations; failure of setup fails the merge with the setup command + output as evidence (same evidence shape as gate failures). Behavior tests (tests-first, tmp-repo, no network): (1) merge where infra.setup writes a marker file asserts gates observe it; (2) empty setup behaves exactly as today; (3) failing setup fails merge with actionable evidence. Note: fix takes effect on engine restart, not mid-run.",
      "kind": "dev",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 80,
      "slug": "merge-setup-fix",
      "title": "Run infra.setup in merge child worktree before gates"
    },
    {
      "description": "Salvage approved wave-1 spike research stranded on failed item branches (all research steps ok, reviews approved; only wave-end merges failed environmentally). Read-only via `git show <branch>:<path>` (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths): topic/omp-workspaces--spike-omp-isolation items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review), topic/omp-workspaces--spike-mock-provider steps/001-research-r1-a1/output.yaml (+002 review), topic/omp-workspaces--spike-cache-key steps/001-research-r1-a1/output.yaml (+002 review), topic/omp-workspaces--spike-repo-rules steps/001-research-r1-a1/output.yaml (+002 review), plus parent-branch decisions/001 + 002 rulings. Write the four spike draft docs to plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md from the embedded drafts (applying each review's optional polish notes where they correct evidence, e.g. probe-26/18 softening, spec-path fix), and items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario to evidence + followUps for iteration-2 planning. Docs only, zero prod lines. Verify: all five files present with probe-evidence sections; parent branch only.",
      "kind": "no-behavior",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "slug": "spike-findings-recovery",
      "title": "Recover wave-1 spike findings onto parent branch"
    },
    {
      "description": "Docs-only salvage retry. Copy the 4 approved spike docs (plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md) plus items/spike-findings-recovery/RECOVERY.md from branch topic/omp-workspaces--spike-findings-recovery onto this item's branch via read-only `git show <branch>:<path>` (NEVER checkout/switch branches). Fix the `oMP` capitalization typo in omp-6-repo-rules.md. Verify all 5 files present with probe-evidence sections. CRITICAL: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red baseline); omit target or use a single passing selector target. Zero prod lines; no-behavior kind.",
      "kind": "no-behavior",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "slug": "spike-findings-recovery-v2",
      "title": "Recover wave-1 spike findings onto parent branch (v2)"
    },
    {
      "description": "Fix checkTargetGreen gate-target branch (plugins/software-factory/src/core/checks/runner.ts:644-676) to apply the same baseline ratchet runGates uses: when the gate command fails, compare failing tests against gates-baseline.yaml and pass when failures are a subset of baseline (plus JUnit re-derivation parity where applicable). Behavior tests-first with tmp-repo fixtures: (1) gate target failing ONLY on baseline-listed tests passes; (2) gate target with a NEW failing test still fails with actionable evidence; (3) gate target fully green still passes. Keep prod diff small (~60 lines hint). Record selector targets (not gate targets) so this item itself merges cleanly.",
      "kind": "dev",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 60,
      "slug": "target-green-ratchet-fix",
      "title": "Apply baseline ratchet to target-green gate targets"
    }
  ],
  "assumptions": [
    {
      "assumption": "Iteration 1 schedules spikes + measurement only; child epics (proposed: workspaces-lifecycle, commits-merge, saga-launches, cache-policy, e2e-docs-hydration) are defined in iteration 2 with spike-informed intents.",
      "why": "All major subsystems build on spike decisions; epic children launched now could not see later-merged findings. Progressive planning defers epic definition to the next architect turn via replanAfter milestones."
    },
    {
      "assumption": "Installed omp 18.18.5 is representative; spikes probe it directly and preflight will pin a minimum version.",
      "why": "Context-pack probes already ran against this binary; findings must be validated against the real harness, not docs."
    },
    {
      "assumption": "Current engine worktree behavior is preserved behind isolation: engine without regression.",
      "why": "Spec keeps engine worktrees as a config option; M3 must not change engine semantics until the omp backend is proven."
    },
    {
      "assumption": "The single red baseline test (disk-space threshold, env-sensitive) is accepted as-is; iteration gates pass if no NEW failures appear.",
      "why": "Clean-checkout rule forbids investigating env-sensitive baseline reds; ratchet on new failures instead."
    },
    {
      "assumption": "All new tests assume cwd=plugins/software-factory and resolve fixtures repo-relatively.",
      "why": "Infra notes: running from the repo root breaks fixture resolution; spike/e2e tests must follow the same convention."
    },
    {
      "assumption": "Spikes may run bounded real-omp turns (throwaway profile/repos) using configured roles; token cost is research cost.",
      "why": "Cache/retention/resolvability questions are only answerable through the real binary; M8's no-model constraint applies to the committed e2e suite, not to spike probes."
    }
  ],
  "techDebt": [
    {
      "id": "td-baseline-disk",
      "description": "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2 (env-sensitive duplicate low-space paths).",
      "category": "adjacent",
      "resolution": "Accepted as-is; iteration gates ratchet on new failures only."
    },
    {
      "id": "td-hardcoded-omp",
      "description": "Preflight hard-codes omp fallback path /home/slava/.bun/bin/omp.",
      "category": "adjacent",
      "resolution": "Remove during M4 preflight hardening (resolve via PATH/config only)."
    },
    {
      "id": "td-no-lint",
      "description": "No lint/format gate configured.",
      "category": "adjacent",
      "resolution": "Out of scope; if added later, exclude the orchestration folder .factory/**."
    },
    {
      "id": "td-usage-cache",
      "description": "Usage parser drops cacheRead/cacheWrite/totalTokens + cost subfields; StepUsage/budget/derive aggregate only input/output/cost.",
      "category": "impacting",
      "resolution": "Resolved this iteration by usage-cache-tokens (M2); M7 defaults depend on it."
    },
    {
      "id": "td-prompt-path",
      "description": "Per-turn prompt transport path embeds timestamp+randomness; overlay regenerated per turn; no byte-stability tests.",
      "category": "impacting",
      "resolution": "Characterize this iteration via transport-byte-stability (M2, tests only); stabilize in M7 after spike-cache-key decides content-vs-path keying."
    },
    {
      "id": "td-runtime-growth",
      "description": "Runtime dirs sessions/prompts/system-prompts grow without cleanup (only tmp/ purged); omp-owned orphans unclassified.",
      "category": "impacting",
      "resolution": "M4 gc semantics cover runtime files + omp-owned orphans; M8 e2e asserts bounded growth across restart/gc scenarios."
    }
  ],
  "adrs": [
    {
      "id": "adr-iter1-spikes-first",
      "title": "Iteration 1 runs spikes + measurement only; epics deferred to iteration 2",
      "context": "Items 19/20 hinge on unvalidated omp mechanics (isolation backend, provider seam, cache keying, context injection); intent mandates starting with a fact-finder spike; epic child worktrees branch from the parent tip at launch and cannot see spike findings merged later.",
      "decision": "Iteration 1 schedules four fact-finder spikes (M1) plus two spike-independent foundation items (M2). No child epics are defined; the iteration-2 architect turn defines epics with spike-informed intents against replanAfter milestones M3-M8."
    },
    {
      "id": "adr-whole-tree-index",
      "title": "Whole-tree status/cleanup/gc derive on demand from records + git; no persistent registry",
      "context": "19.3 requires idempotent tracking derived from records+git; a registry file risks drift from worktree/branch reality; parseWorktreeList plus INTENT/journal/task dirs already provide the sources.",
      "decision": "M4 implements deriveWholeTree over orchestration dirs, journals, and git worktree/branch state on every invocation; cleanup/gc compute candidate sets from the same derivation and refuse while any run lock is live."
    },
    {
      "id": "adr-cache-fields-additive",
      "title": "Cache-token usage fields are additive and optional end to end",
      "context": "M2 must capture cacheRead/cacheWrite/totalTokens plus cost breakdown without invalidating historical records or forcing a migration.",
      "decision": "All new Usage/StepUsage/record/budget fields are optional with zero-default aggregation; the parser tolerates absent keys; schemas gain optional properties only."
    },
    {
      "id": "adr-real-binary-e2e",
      "title": "No-model e2e drives the real omp binary with a scripted provider; FakeHarness retained for engine tests",
      "context": "19.8 requires end-to-end through the real omp harness with a scripted mock provider and zero paid calls; existing engine coverage relies on FakeHarness-by-label and mock-binary harness tests, neither of which exercises real omp.",
      "decision": "M8 builds a scripted provider behind the M1-chosen seam plus a scenario runner over the real omp binary (opt-in env flag, skips cleanly without omp); FakeHarness remains the default for fast engine behavior tests."
    }
  ]
}` (which already includes the amendment's new outlines). NEVER invent outlineRefs — an unknown `outlineRef` fails validation.
- Protect history: DO NOT alter, reschedule, or remove items in waves that have already executed or merged. Removal of pending items is handled by the engine via the architect's `removeItemSlugs`, not by your output.
- Dependency integrity: ensure all new dependencies reference either completed items from earlier waves or earlier items in the amended plan. Wave ordering stays strict (deps only on earlier waves).
- Output: yield the delta edits artifact matching `plan-edits.schema.json`.

## Current Plan
{
  "iteration": 1,
  "milestones": [
    {
      "id": "m1-omp-de-risk",
      "title": "Omp mechanics de-risked (spikes + decision records)",
      "scenarios": [
        "Given a throwaway git repo and throwaway omp profile, when the isolation probe matrix runs (backend values, omp-managed worktree add/cwd turn, failing/aborted turn, overlay acceptance), then the decision record states the omp↔engine mapping, retention guarantees, and the cheapest preflight probe.",
        "Given the installed omp binary, when the mock-provider spike probes extension registration and model catalog listing, then the report names the scripted-provider seam and a turn-by-turn scenario format (or rules extension out with evidence).",
        "Given two identical architect prompts, when the cache-key spike compares transport bytes/argv and runs live resume probes, then the report states whether omp caches by content or path and which compaction/warming knobs apply to factory sessions.",
        "Given a fixture repo with sentinel rules, when the repo-rules spike probes root-process context injection with and without --system-prompt, then the report lists rule sources, precedence, and whether factory hydration would double-inject."
      ],
      "directionalInterfaces": [
        "spike reports: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md (findings + probe logs + recommendations)",
        "decision records: {taskDir}/decisions/NNN-<topic>.yaml {status, decision, evidence, followUps} consumed by iteration-2 epic intents",
        "proposed config surface (draft, iteration 2 ratifies): isolation: omp|engine, overlay keys for isolation/worktree/compaction/cache, preflight probe command"
      ]
    },
    {
      "id": "m2-measure-stabilize",
      "title": "Cache measurement plumbing + transport stability characterized",
      "scenarios": [
        "Given an omp NDJSON turn carrying usage.cacheRead/cacheWrite and cost sub-fields, when the harness parses it, then the step meta record stores cacheReadTokens, cacheWriteTokens, totalTokens and cost breakdown, and budget/status aggregates include them.",
        "Given historical step records without cache fields, when derive/budget runs, then missing fields are treated as zero and old records remain valid (no migration).",
        "Given the same agent prompt rendered twice, when the transport characterization tests run, then they assert byte-equality of system-prompt content and overlay bytes and pin the unstable argv parts (prompt filename) as documented behavior."
      ],
      "directionalInterfaces": [
        "Usage/StepUsage: {inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, totalTokens?, costUsd?, cost?: {input?, output?, cacheRead?, cacheWrite?}} (all new fields optional)",
        "parser: NDJSON usage events -> Usage (tolerates absent cache keys); budget: sums with zero-defaults; derive: exposes cache columns to status",
        "tests: test/harness/transport-stability.test.ts (characterization, no prod change)"
      ]
    },
    {
      "id": "m3-workspace-backend",
      "title": "Workspace abstraction with omp default + engine option",
      "replanAfter": true,
      "scenarios": [
        "Given default config, when a task/item workspace is created, then it is created through the omp isolation backend and survives failing/aborted turns per the M1 retention decision.",
        "Given isolation: engine, when the same flows run, then behavior matches current engine worktrees (idempotent create/reuse, stale pruning, branch kept on remove).",
        "Given the same pipeline config twice, when the omp overlay is generated, then isolation/worktree/compaction/cache keys are byte-stable."
      ],
      "directionalInterfaces": [
        "PipelineConfig.isolation: {backend: omp|engine, ...spike-decided options}; schema + default YAML + loader validation",
        "workspace module: ensureWorkspace/releaseWorkspace {branch, path, backend} used by engine.ts and item setup; worktrees.ts becomes the engine backend",
        "overlay: writeOmpConfigOverlay emits spike-approved isolation/worktree keys"
      ]
    },
    {
      "id": "m4-lifecycle",
      "title": "Preflight hardening + whole-tree status/cleanup/gc",
      "replanAfter": true,
      "scenarios": [
        "Given an incompatible omp version or unusable isolation backend, when preflight runs, then it fails fast naming the cause (version, overlay/probe, model/role, repo-vs-records mismatch).",
        "Given a saga with epics/tasks/items, when factory status runs, then it prints the whole tree with workspace+branch per active agent and open questions, derived from records+git.",
        "Given finished and orphaned workspaces, when cleanup/gc run, then cleanup removes finished workspaces, gc dry-runs by default listing orphans (worktrees/branches/runtime/stale locks), and both refuse while any run lock is held."
      ],
      "directionalInterfaces": [
        "CLI: factory status [--tree], factory cleanup [--apply], factory gc [--apply] (exits 0 ok / 10 refused / 1 error); output sections stable for tests",
        "preflight checks: versionRange, isolationRoundTrip, modelRoleResolvability, repoRecordsConsistency (each independently testable)",
        "index: deriveWholeTree({orchRoot, git}) -> {tasks, links, workspaces, locks} (on demand, no registry)"
      ]
    },
    {
      "id": "m5-commits-merge",
      "title": "Agent-authored commits + wave-end merger + escalation pointers",
      "replanAfter": true,
      "scenarios": [
        "Given review/developer output with commitMessage/scope, when the engine commits step/merge records, then message and path scope come from the agent output and the engine adds only mechanical prefixes.",
        "Given a wave-end parent→child conflict, when the merge path runs, then a workhorse-class wave-end merger agent resolves trivial conflicts and deterministic gates re-run before merging to parent.",
        "Given an unresolvable conflict or red gates after bounded attempts, when escalation fires, then the architect consult carries a one-command status pointer plus the item worktree path and branch."
      ],
      "directionalInterfaces": [
        "schemas: review/developer-output += {commitMessage?, commitScope?}; prompts require them; step-runner/merge-path thread them to commitAll",
        "agents/wave-merger.md + steps/wave-merge.md (trivial-conflicts-only contract, yields {resolved, strategy} | {unresolvable, reason})",
        "consult payload: {statusPointer, worktree, branch, attempts, gateEvidence}"
      ]
    },
    {
      "id": "m6-saga",
      "title": "Saga independent launches + parallel epics + escalation split",
      "replanAfter": true,
      "scenarios": [
        "Given a saga plan with parallel epics, when the saga runs, then each epic executes as an independent factory launch in its own workspace with its own lock, and exit codes (0/10/1) roll up to the saga.",
        "Given a merge conflict inside an epic, when escalation fires, then it routes to the epic architect; given a saga wave-end epic-merge conflict, then it routes to the saga architect.",
        "Given child concerns/remarkables/blocking questions, when an epic wave ends, then they propagate upward (q-epic-* funnel) and appear in saga status."
      ],
      "directionalInterfaces": [
        "saga launcher: factory run --saga <task> / internal spawnChildFactory({epic, intentPath, workspace, branch}) with supervision + journal fan-in",
        "links: parent/saga identity records {sagaTask, epicSlug, childBranch, workspace} readable by status/gc/escalation routing",
        "locks: per-workspace run locks + saga coordination lock for merge/status writes; dead-PID takeover preserved"
      ]
    },
    {
      "id": "m7-cache-policy",
      "title": "Compaction/warming policy + measured defaults + plan-format review",
      "replanAfter": true,
      "scenarios": [
        "Given an architect resume that will miss the provider cache (TTL expired/model switched), when the turn starts, then the session compacts first (or starts fresh with the deterministic brief) and records the handoff + cost delta.",
        "Given standby between architect turns, when warming is cheaper than expected uncached resume, then the cache stays warm via omp mechanics; otherwise warming is explicitly off by config.",
        "Given measured plan-repair turns and cache-read costs, when the plan-format review runs, then it ratifies schema-bound plans or telegraphic+PM-structuring with cost evidence, and 20d optimizations stay off unless measured wins."
      ],
      "directionalInterfaces": [
        "config: architect.cache {compaction: {mode, triggers}, warming: {mode|off}, defaultsFrom: measurements}; overlay emits omp compaction/providers.cache* keys",
        "handoff record: brief + {reason: cache-miss|model-switch, priorSession, costDelta} in runs/ + journal event",
        "plan contract decision: docs/decisions/plan-format.md (+ schema/prompt changes if flipped)"
      ]
    },
    {
      "id": "m8-e2e-docs",
      "title": "No-model e2e + repo-rules hydration + use-case docs",
      "replanAfter": true,
      "scenarios": [
        "Given the scripted mock provider and the real omp binary, when the no-model e2e suite runs, then isolation, merge/conflict/escalation, saga/epic launch, restart, and gc scenarios pass with zero paid-model calls.",
        "Given a fixture repo with sentinel rules, when architect/developer/qa/reviewer turns run, then each role prompt contains the hydrated rules and probe agents quote the sentinel.",
        "Given each use case (single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc), when docs are read, then a dedicated page exists and sentinel tests pin the required sections."
      ],
      "directionalInterfaces": [
        "mock provider: test/e2e/mock-provider/* (extension or local endpoint per M1 seam) + scenario scripts {turns: [{yield|toolCalls|text}]}; runner: bun test test/e2e/** with FACTORY_E2E_OMP=1 (real binary, scripted models)",
        "hydration: prompt var {{repoRules}} + resolver resolveRepoRules(repoRoot) {sources, precedence}; preflight renders per role",
        "docs: docs/usage/{single-task,story-waves,epic,saga,merging-escalation,lifecycle}.md + test/docs-usage.test.ts sentinels"
      ]
    }
  ],
  "uncertainties": [
    {
      "id": "u-isolation-backend",
      "description": "Allowed isolation.backend values; whether omp-managed worktrees (worktree add + --cwd) retain commits on failure/abort like engine worktrees; which omp mechanism maps to factory root-process workspaces; merge-back ownership; cheapest validating preflight probe; model/role resolvability without paid turns.",
      "spikeOutlines": [
        "spike-omp-isolation (fact-finder, iteration 1, M1): throwaway profile+repos probe matrix + decision record; blocks M3/M4/M6 design"
      ]
    },
    {
      "id": "u-mock-provider-seam",
      "description": "How to register a scripted provider for real omp (extension API vs local endpoint), catalog listing with --config/-e, streaming NDJSON contract, scenario format.",
      "spikeOutlines": [
        "spike-mock-provider (fact-finder, iteration 1, M1): seam probe + scenario-format proposal; poc + runner deferred to M8"
      ]
    },
    {
      "id": "u-cache-keying",
      "description": "Whether omp prompt cache keys on content or transport path (prompt filename, overlay regen); which compaction/warming knobs affect one-process-per-turn factory sessions; cold-resume detection signals.",
      "spikeOutlines": [
        "spike-cache-key (fact-finder, iteration 1, M1): byte-diff + live resume probes; transport stabilization deferred to M7"
      ]
    },
    {
      "id": "u-repo-rules",
      "description": "Rule file sources/precedence; whether omp injects context files into root --system-prompt processes (double-injection risk); per-role hydration seams.",
      "spikeOutlines": [
        "spike-repo-rules (fact-finder, iteration 1, M1): sentinel-fixture probes; hydration implementation deferred to M8"
      ]
    },
    {
      "id": "u-saga-orchestration",
      "description": "Child launch supervision, epic INTENT resolution, parallel-epic lock/merge coordination, architect routing map — designable after M1+M3; may need a launcher poc in iteration 2.",
      "spikeOutlines": [
        "poc saga launcher (iteration 2, after M3): spawn/supervise two stub children, lock + journal fan-in; proposal only, not scheduled now"
      ]
    },
    {
      "id": "u-plan-format",
      "description": "Whether schema-free telegraphic plans + PM structuring beat schema-bound plans on repair-turn cost — needs measured repair data from records.",
      "spikeOutlines": [
        "fact-finder plan-repair cost analysis (iteration 2, after M2): count repair turns + cache costs from records; feeds M7 decision"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "spike-omp-isolation",
      "kind": "fact-finder",
      "title": "Spike: omp isolation mechanics + backend decision",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Probe installed omp (throwaway --profile, temp repos): enumerate isolation.backend values; compare isolated-task vs omp worktree add + --cwd retention on failing/aborted turns; determine the root-process workspace mapping; evaluate task.isolation apply/merge/commits vs engine merges; define the cheapest validating preflight probe (real turn, since --version/config-get are no-ops); test model/role resolvability without paid turns. Yield decision record + docs/spikes/omp-3-isolation.md. No prod code."
    },
    {
      "slug": "spike-mock-provider",
      "kind": "fact-finder",
      "title": "Spike: scripted mock provider seam for real omp",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Probe the omp extension API + model listing (-e/--config) and any custom-provider/endpoint registration; capture the streaming NDJSON contract; propose a canned scenario format (turn-by-turn text/tool-calls/yield) and prove a minimal real-omp turn against a scripted provider with zero paid calls (or rule the seam out with evidence). Report + proposal only; poc/runner deferred to M8."
    },
    {
      "slug": "spike-cache-key",
      "kind": "fact-finder",
      "title": "Spike: prompt-cache keying + compaction/warming audit",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Diff transport bytes/argv across identical renders (system prompt, overlay, prompt path); run live resume probes (same vs changed prompt path, model switch, TTL) with cache-miss markers; audit which compaction.* / providers.cache* knobs affect one-process-per-turn factory sessions; recommend cold-resume detection plus the compaction-vs-fresh-brief mechanism and warming viability. No prod changes (M2 characterizes, M7 implements)."
    },
    {
      "slug": "spike-repo-rules",
      "kind": "fact-finder",
      "title": "Spike: repo-rules sources + omp injection audit",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Enumerate rule sources (AGENTS.md/CLAUDE.md/.cursorrules/.omp/rules, root+subdirs) and precedence; probe whether root omp processes with --system-prompt already receive context files (contextFiles.extra/--no-context-files) using sentinel fixtures; map per-role hydration seams (architect/developer/qa/reviewer) and the verification plan. Report only; hydration deferred to M8."
    },
    {
      "slug": "usage-cache-tokens",
      "kind": "dev",
      "title": "Cache-token usage plumbing end to end",
      "milestoneId": "m2-measure-stabilize",
      "prodBudgetHint": 180,
      "description": "Extend Usage/StepUsage with optional cacheReadTokens/cacheWriteTokens/totalTokens + cost breakdown; parse them in NdjsonParser (tolerate absence); persist in step meta records; aggregate in budget/derive; surface cache columns in status. Behavior tests: fixture NDJSON with cache fields, old-record backward compat (missing→0), budget sums, status output. Tests-first per dev kind."
    },
    {
      "slug": "transport-byte-stability",
      "kind": "test-only",
      "title": "Transport byte-stability characterization tests",
      "milestoneId": "m2-measure-stabilize",
      "prodBudgetHint": 0,
      "description": "Add tests rendering identical prompts twice and asserting byte-equality of system-prompt content and generated overlay, while pinning unstable argv parts (timestamped prompt filename) as current documented behavior. No prod changes; stabilization decision deferred to M7 after spike-cache-key."
    },
    {
      "description": "In mergeItem (plugins/software-factory/src/core/flows/merge-path.ts), execute infra.setup commands in childWt BEFORE the verify-checks phase (before gates snapshot/run), using the same runInfraSetup semantics as the temp-worktree paths (gates.ts:332-335, runner.ts:796-810). Requirements: no-op when setup is empty; setup runs before snapshotWorktree so setup-created untracked files (node_modules) are not flagged as gate mutations; failure of setup fails the merge with the setup command + output as evidence (same evidence shape as gate failures). Behavior tests (tests-first, tmp-repo, no network): (1) merge where infra.setup writes a marker file asserts gates observe it; (2) empty setup behaves exactly as today; (3) failing setup fails merge with actionable evidence. Note: fix takes effect on engine restart, not mid-run.",
      "kind": "dev",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 80,
      "slug": "merge-setup-fix",
      "title": "Run infra.setup in merge child worktree before gates"
    },
    {
      "description": "Salvage approved wave-1 spike research stranded on failed item branches (all research steps ok, reviews approved; only wave-end merges failed environmentally). Read-only via `git show <branch>:<path>` (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths): topic/omp-workspaces--spike-omp-isolation items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review), topic/omp-workspaces--spike-mock-provider steps/001-research-r1-a1/output.yaml (+002 review), topic/omp-workspaces--spike-cache-key steps/001-research-r1-a1/output.yaml (+002 review), topic/omp-workspaces--spike-repo-rules steps/001-research-r1-a1/output.yaml (+002 review), plus parent-branch decisions/001 + 002 rulings. Write the four spike draft docs to plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md from the embedded drafts (applying each review's optional polish notes where they correct evidence, e.g. probe-26/18 softening, spec-path fix), and items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario to evidence + followUps for iteration-2 planning. Docs only, zero prod lines. Verify: all five files present with probe-evidence sections; parent branch only.",
      "kind": "no-behavior",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "slug": "spike-findings-recovery",
      "title": "Recover wave-1 spike findings onto parent branch"
    },
    {
      "description": "Docs-only salvage retry. Copy the 4 approved spike docs (plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md) plus items/spike-findings-recovery/RECOVERY.md from branch topic/omp-workspaces--spike-findings-recovery onto this item's branch via read-only `git show <branch>:<path>` (NEVER checkout/switch branches). Fix the `oMP` capitalization typo in omp-6-repo-rules.md. Verify all 5 files present with probe-evidence sections. CRITICAL: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red baseline); omit target or use a single passing selector target. Zero prod lines; no-behavior kind.",
      "kind": "no-behavior",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "slug": "spike-findings-recovery-v2",
      "title": "Recover wave-1 spike findings onto parent branch (v2)"
    },
    {
      "description": "Fix checkTargetGreen gate-target branch (plugins/software-factory/src/core/checks/runner.ts:644-676) to apply the same baseline ratchet runGates uses: when the gate command fails, compare failing tests against gates-baseline.yaml and pass when failures are a subset of baseline (plus JUnit re-derivation parity where applicable). Behavior tests-first with tmp-repo fixtures: (1) gate target failing ONLY on baseline-listed tests passes; (2) gate target with a NEW failing test still fails with actionable evidence; (3) gate target fully green still passes. Keep prod diff small (~60 lines hint). Record selector targets (not gate targets) so this item itself merges cleanly.",
      "kind": "dev",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 60,
      "slug": "target-green-ratchet-fix",
      "title": "Apply baseline ratchet to target-green gate targets"
    }
  ],
  "assumptions": [
    {
      "assumption": "Iteration 1 schedules spikes + measurement only; child epics (proposed: workspaces-lifecycle, commits-merge, saga-launches, cache-policy, e2e-docs-hydration) are defined in iteration 2 with spike-informed intents.",
      "why": "All major subsystems build on spike decisions; epic children launched now could not see later-merged findings. Progressive planning defers epic definition to the next architect turn via replanAfter milestones."
    },
    {
      "assumption": "Installed omp 18.18.5 is representative; spikes probe it directly and preflight will pin a minimum version.",
      "why": "Context-pack probes already ran against this binary; findings must be validated against the real harness, not docs."
    },
    {
      "assumption": "Current engine worktree behavior is preserved behind isolation: engine without regression.",
      "why": "Spec keeps engine worktrees as a config option; M3 must not change engine semantics until the omp backend is proven."
    },
    {
      "assumption": "The single red baseline test (disk-space threshold, env-sensitive) is accepted as-is; iteration gates pass if no NEW failures appear.",
      "why": "Clean-checkout rule forbids investigating env-sensitive baseline reds; ratchet on new failures instead."
    },
    {
      "assumption": "All new tests assume cwd=plugins/software-factory and resolve fixtures repo-relatively.",
      "why": "Infra notes: running from the repo root breaks fixture resolution; spike/e2e tests must follow the same convention."
    },
    {
      "assumption": "Spikes may run bounded real-omp turns (throwaway profile/repos) using configured roles; token cost is research cost.",
      "why": "Cache/retention/resolvability questions are only answerable through the real binary; M8's no-model constraint applies to the committed e2e suite, not to spike probes."
    }
  ],
  "techDebt": [
    {
      "id": "td-baseline-disk",
      "description": "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2 (env-sensitive duplicate low-space paths).",
      "category": "adjacent",
      "resolution": "Accepted as-is; iteration gates ratchet on new failures only."
    },
    {
      "id": "td-hardcoded-omp",
      "description": "Preflight hard-codes omp fallback path /home/slava/.bun/bin/omp.",
      "category": "adjacent",
      "resolution": "Remove during M4 preflight hardening (resolve via PATH/config only)."
    },
    {
      "id": "td-no-lint",
      "description": "No lint/format gate configured.",
      "category": "adjacent",
      "resolution": "Out of scope; if added later, exclude the orchestration folder .factory/**."
    },
    {
      "id": "td-usage-cache",
      "description": "Usage parser drops cacheRead/cacheWrite/totalTokens + cost subfields; StepUsage/budget/derive aggregate only input/output/cost.",
      "category": "impacting",
      "resolution": "Resolved this iteration by usage-cache-tokens (M2); M7 defaults depend on it."
    },
    {
      "id": "td-prompt-path",
      "description": "Per-turn prompt transport path embeds timestamp+randomness; overlay regenerated per turn; no byte-stability tests.",
      "category": "impacting",
      "resolution": "Characterize this iteration via transport-byte-stability (M2, tests only); stabilize in M7 after spike-cache-key decides content-vs-path keying."
    },
    {
      "id": "td-runtime-growth",
      "description": "Runtime dirs sessions/prompts/system-prompts grow without cleanup (only tmp/ purged); omp-owned orphans unclassified.",
      "category": "impacting",
      "resolution": "M4 gc semantics cover runtime files + omp-owned orphans; M8 e2e asserts bounded growth across restart/gc scenarios."
    }
  ],
  "adrs": [
    {
      "id": "adr-iter1-spikes-first",
      "title": "Iteration 1 runs spikes + measurement only; epics deferred to iteration 2",
      "context": "Items 19/20 hinge on unvalidated omp mechanics (isolation backend, provider seam, cache keying, context injection); intent mandates starting with a fact-finder spike; epic child worktrees branch from the parent tip at launch and cannot see spike findings merged later.",
      "decision": "Iteration 1 schedules four fact-finder spikes (M1) plus two spike-independent foundation items (M2). No child epics are defined; the iteration-2 architect turn defines epics with spike-informed intents against replanAfter milestones M3-M8."
    },
    {
      "id": "adr-whole-tree-index",
      "title": "Whole-tree status/cleanup/gc derive on demand from records + git; no persistent registry",
      "context": "19.3 requires idempotent tracking derived from records+git; a registry file risks drift from worktree/branch reality; parseWorktreeList plus INTENT/journal/task dirs already provide the sources.",
      "decision": "M4 implements deriveWholeTree over orchestration dirs, journals, and git worktree/branch state on every invocation; cleanup/gc compute candidate sets from the same derivation and refuse while any run lock is live."
    },
    {
      "id": "adr-cache-fields-additive",
      "title": "Cache-token usage fields are additive and optional end to end",
      "context": "M2 must capture cacheRead/cacheWrite/totalTokens plus cost breakdown without invalidating historical records or forcing a migration.",
      "decision": "All new Usage/StepUsage/record/budget fields are optional with zero-default aggregation; the parser tolerates absent keys; schemas gain optional properties only."
    },
    {
      "id": "adr-real-binary-e2e",
      "title": "No-model e2e drives the real omp binary with a scripted provider; FakeHarness retained for engine tests",
      "context": "19.8 requires end-to-end through the real omp harness with a scripted mock provider and zero paid calls; existing engine coverage relies on FakeHarness-by-label and mock-binary harness tests, neither of which exercises real omp.",
      "decision": "M8 builds a scripted provider behind the M1-chosen seam plus a scenario runner over the real omp binary (opt-in env flag, skips cleanly without omp); FakeHarness remains the default for fast engine behavior tests."
    }
  ]
}

## Task Status
iteration: 1
amendments: 2
items:
  - spike-omp-isolation kind=fact-finder wave=1 status=failed outlineRef=spike-omp-isolation
  - spike-mock-provider kind=fact-finder wave=1 status=failed outlineRef=spike-mock-provider
  - spike-cache-key kind=fact-finder wave=1 status=failed outlineRef=spike-cache-key
  - spike-repo-rules kind=fact-finder wave=1 status=failed outlineRef=spike-repo-rules
  - usage-cache-tokens kind=dev wave=2 status=merged outlineRef=usage-cache-tokens
  - transport-byte-stability kind=test-only wave=2 status=merged outlineRef=transport-byte-stability
  - merge-setup-fix kind=dev wave=2 status=merged outlineRef=merge-setup-fix
  - spike-findings-recovery kind=no-behavior wave=2 status=failed outlineRef=spike-findings-recovery
waves: 1, 2
merged: usage-cache-tokens, transport-byte-stability, merge-setup-fix
blocked: (none)
failed: spike-omp-isolation, spike-mock-provider, spike-cache-key, spike-repo-rules, spike-findings-recovery
open steer questions:
  - q-adr-cache-fields-additive-87bb471f5e ref=adr-cache-fields-additive disposition=human-awareness: Remarkable architectural decision adr-cache-fields-additive (Cache-token usage fields are additive and optional end to end) recorded for awareness.
  - q-adr-iter1-spikes-first-402887ef39 ref=adr-iter1-spikes-first disposition=human-awareness: Remarkable architectural decision adr-iter1-spikes-first (Iteration 1 runs spikes + measurement only; epics deferred to iteration 2) recorded for awareness.
  - q-adr-real-binary-e2e-4938cae2f4 ref=adr-real-binary-e2e disposition=human-awareness: Remarkable architectural decision adr-real-binary-e2e (No-model e2e drives the real omp binary with a scripted provider; FakeHarness retained for engine tests) recorded for awareness.
  - q-adr-whole-tree-index-45f9d196da ref=adr-whole-tree-index disposition=human-awareness: Remarkable architectural decision adr-whole-tree-index (Whole-tree status/cleanup/gc derive on demand from records + git; no persistent registry) recorded for awareness.

## Architect Amendment Directives
Wave 2 merged 3/4 (M2 measurement items + merge-setup-fix); the only gap is M1 spike evidence still stranded on the failed recovery branch plus the newly discovered target-green ratchet gap (c-2bec98be29). Schedule the two new outlines together in wave 3 (both independent, no deps): spike-findings-recovery-v2 first-priority (unblocks iteration-2 epic planning with M1 evidence on parent), target-green-ratchet-fix in parallel. No removals: no pending items exist; failed items are terminal and stay as evidence.

## Completed Wave Reports
Wave 2 completed. Merged items: usage-cache-tokens, transport-byte-stability, merge-setup-fix

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1)
- amendmentIndex (integer, optional, min: 0)
- items (array of object, required)
  - slug (string, required)
  - kind (string, required)
  - title (string, required)
  - assignment (string, required)
  - outlineRef (string, optional)
  - milestone (string, required)
  - wave (integer, required, min: 1)
  - deps (array of string, optional)
  - scenarioRefs (array of string, optional)
  - citations (array of string, optional)
  - escalate (boolean, optional)

# Run inspection: modernize + omp-workspaces

Finished fire-test runs, archived in-repo. All paths relative to `plugins/software-factory/docs/`.

## Entry points

| Artefact | modernize (python-setup, exit=1 stall) | omp-workspaces (self-host, exit=1 failed) |
|---|---|---|
| Journal (full event trace) | [journal.ndjson](runs/modernize/journal.ndjson) (2378 events, Nov 7→10) | [journal.ndjson](runs/omp-workspaces/journal.ndjson) (383 events) |
| End state | [state.yaml](runs/modernize/state.yaml) (50 items: 32 merged / 6 failed / 5 blocked) | [state.yaml](runs/omp-workspaces/state.yaml) (10 items: 5 merged / 5 failed) |
| Close-ups | [closeup-1](runs/modernize/closeup-1.yaml) [2](runs/modernize/closeup-2.yaml) [3](runs/modernize/closeup-3.yaml) [4](runs/modernize/closeup-4.yaml) | [closeup-1.yaml](runs/omp-workspaces/closeup-1.yaml) |
| Per-step records | [runs/](runs/modernize/runs/) (158: `input.md`+`output.yaml`+`meta.yaml` each) | [runs/](runs/omp-workspaces/runs/) (25) |
| Items | [items/](runs/modernize/items/) (50; `model-eval-poc/poc/cache/` excluded: 1.8G model weights, [README](runs/modernize/items/model-eval-poc/poc/cache/README.md)) | [items/](runs/omp-workspaces/items/) (10) |
| Plans | [plan/](runs/modernize/plan/) (`plan-4.yaml` gating edges, `plan-5.3.yaml` latest) | [plan/](runs/omp-workspaces/plan/) |
| Consult decisions | [decisions/](runs/modernize/decisions/) | [decisions/](runs/omp-workspaces/decisions/) incl [012 (recovery abandon rationale)](runs/omp-workspaces/decisions/012-item-spike-findings-recovery-1.yaml) |

Per-LLM-step assembled prompts/outputs (all 25 step kinds, clickable): [records/](records/) via [IMPLEMENTATION.md](IMPLEMENTATION.md) audit rows A–Y.

## Trace findings → fixes (post-fix state)

### modernize (launch 13: iter-5 stall, 3 non-terminal after 5 re-drives)

1. `golden-regen-hatch`: merge passed literal `uv run pytest tests -q` as gate target → **fixed** by command→gate mapping ([gate-target.ts](../src/core/checks/gate-target.ts), [tests](../test/checks/gate-target-resolution.test.ts)).
2. `cache-design-spike`: genuine `production_untouched` failure (17/18) — target-repo reality, no harness fix.
3. `consolidate-integration-helpers-v3`: integrate finished ok with conflict markers in tree → **fixed** by post-integrate + pre-merge marker scans ([merge.ts](../src/core/git/merge.ts) `scanConflictMarkers`, [tests](../test/engine/merge-conflict-markers.test.ts)).
4. 5× `$0`-blocked items: all **genuinely gated** behind real failures (legacy-cleanup deps `plan-4.yaml:549`; v2 chain via failed v2) — no scheduler bug.
5. `pm_amend_validation_failed` ×4 (52 items > 50 cap + unknown deps) → **fixed** by PM cap/dep awareness ([pm-amend.md](../agents/steps/pm-amend.md), [limits.ts](../src/core/plan/limits.ts), [tests](../test/engine/pm-amend-limits.test.ts)).
6. 6× `plan_closeup_refused` on `ready` stragglers: logic correct (ready = unmerged; closing strands branches) → **diagnostics fixed** (stall journal now carries per-item status + last failure evidence, [tests](../test/engine/iteration-stall-reason.test.ts)).

### omp-workspaces (iter-2 death, 5 failed / 5 merged)

All 5 failed items' reviews were `approved` — [failed-spike-reviews/](runs/omp-workspaces/failed-spike-reviews/) (5/5 `status: approved`). Failures were environmental + gate-logic:

7. 4 wave-1 spikes died at merge: fresh worktrees lack `node_modules` → `TS2688: Cannot find type definition file for 'bun'` → **fixed** by `infra.setup` run before merge-path gates ([setup.ts](../src/core/checks/setup.ts), [tests](../test/engine/merge-path-setup.test.ts)).
8. `spike-findings-recovery`: approved docs-only item unmergeable — `target:{gate:test}` needs full-suite exit 0 on a red baseline → **fixed** by baseline ratchet in target-green ([runner.ts](../src/core/checks/runner.ts) `targetGreenGate`, [tests](../test/checks/target-green-ratchet.test.ts)).
9. `@simpler` credential failure (`No API key for google-antigravity`) caused noisy multi-hop fallback chains in both runs → **fixed** by provider-family skip + role-primary dedupe ([harness.ts](../src/harness/omp/harness.ts), [tests](../test/engine/model-fallback.test.ts)).

Termination verdicts: modernize stall-exit correct given the trio; omp-workspaces iter-2 death correct (nothing recoverable, M3–M8 deferred by design).

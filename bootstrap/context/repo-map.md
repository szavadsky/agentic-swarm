# repo-map — agentic-swarm @ 9de772c (surveyed 2026-11-12)

Read-only survey. Intent read first: `manifesto.md:6-89`. Authority: `manifesto.md:3-5` rejects the v2 design as "restrictive, loop-prone, noisy, not token-economical"; named reuse/reject list at `manifesto.md:93-96`. `[V]` = observed by read/run; `[I]` = judgment/classification. No code changed; no old factory launched.

## 1. Top-level layout (2 levels)

| Path | Purpose |
|---|---|
| `manifesto.md` (216 L) | Authoritative Intent + implementation notes; supersedes v2. `manifesto.advice.md` (397 L) is advisory. |
| `docs/adr/` (22 files) | v2 ADRs; `manifesto.md:94` calls them "agentic spam ... bind nothing". |
| `docs/factory.v2.md` (164 L) | Old v2 design spec, superseded (`manifesto.md:5`). |
| `docs/dev-process.md`, `docs/dev-process-diagram.svg` | v1 multi-agent swarm narrative/design. |
| `plugins/software-factory/` | v2 orchestrator: Bun/TS, 90 src files, 26,059 LOC; docs/runs/test. |
| `plugins/software-builder/` | v1 omp plugin: 11 agent prompts, 1 command, 3 Python scripts (772 LOC). |
| `agents/skills/factory-selfhost/SKILL.md` (35 L) | Self-host runbook (launch overlap, branch merge, trace analysis). |
| `.factory/project.yaml` + `.factory/tasks/{concerns-funnel,omp-workspaces}/INTENT.md` | Self-host project config + two v2 task intents. |
| `.omp/lsp.json` | yamlls mapping of 21 schemas to `.factory` YAML globs (editor-only). |
| `LICENSE`, `.gitignore`, `.git/` | Repo metadata. |

Inside `plugins/software-factory/` (second level): `bin/` (1), `src/{cli,core,harness}/` (90), `test/{engine,git,harness,checks,cli,helpers}/` (107), `agents/{steps,_shared,criteria,system}/` (48 md), `config/{schemas}/` (23 files, 21 schemas), `docs/{runs,records,spikes}/`, `skills/factory-run-target/`, ignored `.factory-runtime/`. No sibling `/home/slava/aiexp/agentic-swarm.factory-wt` (`[V]` `ls` absent).

## 2. `plugins/software-factory` — runtime, entry points, modules

Bun ESM package, private, `bin["factory"] = ./bin/factory.ts` (`package.json:2-11`). Deps: `ajv`, `ajv-formats`, `yaml`; dev `@types/bun`, `typescript` (`package.json:13-21`); `bun.lock`, 67 MB `node_modules`. Commands `factory init|preflight|run|status|steer` (`src/cli/dispatch.ts:12-35`), invoked as `bun run --cwd plugins/software-factory factory <cmd>` (`README.md:40-105`). No root Bun project.
Skills/entry points: `skills/factory-run-target/SKILL.md` (operator runbook) and `agents/skills/factory-selfhost/SKILL.md`; no omp plugin manifest — factory is an external CLI (contrast `plugins/software-builder/.claude-plugin/plugin.json`).

| Module(s) | LOC | Responsibility | Verdict vs Intent |
|---|---:|---|---|
| `bin/factory.ts` | 5 | shebang + `dispatch(argv)` | REUSABLE-AS-IS |
| `src/cli/{dispatch 177,init 75,preflight 423,run 179,status 169,steer 60,lock 264,index 7}.ts` | 1,354 | commands, preflight, lock, runtime dir | REUSABLE-WITH-CHANGES |
| `src/core/engine.ts` | 835 | top run loop, startup repair | COUPLED |
| `core/flows/iteration.ts` | 4,092 | one iteration: triage→plan→review→waves→close-ups | COUPLED |
| `core/flows/step-runner.ts` | 1,437 | render prompt, run turn, records, validate/repair | REUSABLE-WITH-CHANGES |
| `core/flows/item-machine.ts` | 1,119 | item lifecycle, fix loops, consults, merge | COUPLED |
| `core/flows/ingest.ts` | 710 | triage/infra/context-pack/simple path | COUPLED |
| `core/flows/consults.ts` 513 + `consult-context.ts` 96 | 609 | architect consults + grounded failure context | COUPLED |
| `core/flows/merge-path.ts` | 535 | item merge ledger, gates, conflict→integrate | REUSABLE-WITH-CHANGES |
| `core/flows/{epic-propagation,adrs,seams,index}.ts` | 185+72+141+26 | epic concern push, ADR routing, hooks | COUPLED |
| `core/checks/{runner 1404,gates 719,gate-target 128,junit 262,setup 78,types 53,index 14}.ts` | 2,658 | deterministic gates/checks, JUnit, setup | REUSABLE-WITH-CHANGES |
| `core/config/{ajv 27,loader 150,merge 82,roles 193,validate 345,index 19}.ts` (816) + `config/schemas/*` (1,554 JSON L) | 2,370 | layered YAML + Ajv; 21 schemas | config WITH-CHANGES; schemas COUPLED (explicit reject) |
| `core/plan/{apply 154,limits 538,scheduler 188,index 9}.ts` | 889 | plan schema, caps, DAG, PM edits | COUPLED (schema plan) |
| `core/derive/{item 591,task 690,wave 178,index 8}.ts` | 1,467 | derive status from committed records | REUSABLE-WITH-CHANGES |
| `core/records/{step-record 275,repair 236,citations 144,review-schema 104,schema-cache 67,schema-format 123,io 39,index 47}.ts` | 1,035 | record IO/meta, citations, schema rendering, repair | REUSABLE-WITH-CHANGES |
| `core/git/{worktrees 224,merge 273,diff 222,exec 135,naming 111,repair 93,commit 92,guard 76,status 75,cleanliness 68,index 61,repo 46,untracked-lines 34}.ts` | 1,510 | worktrees, commits, merge, diff, head guard, cleanliness | REUSABLE-AS-IS (explicit keep) |
| `harness/omp/{harness 953,ndjson 184,classify 141,overlay 100,types 61,index 15}.ts` | 1,454 | omp subprocess, NDJSON, model overlay/fallback | REUSABLE-WITH-CHANGES |
| `harness/fake/{fake-harness 131,index 6}.ts` + `harness/types.ts` 82 | 219 | scripted test harness; harness interface | REUSABLE-AS-IS |
| `core/artifacts.ts` | 623 | hand-written TS mirrors of all 21 schemas | COUPLED (delete; schema maintenance) |
| `core/prompts.ts` 636 + `prompt-vars.ts` 187 | 823 | fragment includes `{{> x}}`, `{{var}}`, output-schema append | REUSABLE-WITH-CHANGES |
| `core/sessions.ts` | 156 | FIFO turns, session id, rehydrate on loss | REUSABLE-WITH-CHANGES |
| `core/concerns.ts` 416 + `fingerprint.ts` 50 | 466 | concern store, dedup/fingerprinting | REUSABLE-WITH-CHANGES (explicit keep) |
| `core/triage.ts` 349 + `review-policy.ts` 48 | 397 | human router, review dispositions | REUSABLE-WITH-CHANGES |
| `core/steer.ts` | 407 | operator mailbox poll/classify/route | REUSABLE-WITH-CHANGES (mailbox keep) |
| `core/brief.ts` | 420 | deterministic architect brief + cheap relevance pass | COUPLED |
| `core/budget.ts` | 349 | spend scan + caps | REUSABLE-WITH-CHANGES |
| `core/{proc,shutdown,mutex,disk-space,clock,runtime-tmp,journal}.ts` | 1,072 | process groups, signals, locks, disk, timers, TMPDIR, journal | REUSABLE-AS-IS |
| `core/loops.ts` | 183 | no-progress fingerprints/bounds | COUPLED |
| `agents/**/*.md` (48 files) | 1,448 | role + step + shared + criteria + system prompts | COUPLED; prose selectively reusable |
| `config/pipeline.default.yaml` | 575 | roles, agents, story kinds, loop caps | COUPLED |
| `test/**` (107 `*.test.ts` + helpers) | 36,641 | fake harness + temp repos, behavior tests | helpers AS-IS; engine suites COUPLED |

## 3. How v2 drives agents

Harness binary: `OMP_PATH` or `Bun.which("omp")` or `/home/slava/.bun/bin/omp` (`src/harness/omp/harness.ts:203-204`); installed `omp/18.20.0` `[V]`. One subprocess per agent turn, not per iteration.

Fresh turn (`harness.ts:463-483`):
```
omp --cwd <worktree> --config <runtime>/omp-overlay.yaml --mode json \
    --model @<role> --session-dir <runtime>/sessions [--resume <id>] \
    --tools=<a,b,yield> --system-prompt <runtime>/system-prompts/<agent>-<key>.md \
    -p @<runtime>/prompts/prompt-<ts>.txt
```
Stateless one-shot/repair (`harness.ts:813-821`): `omp -p @file --no-session --tools= --config … --mode json --model @role`. Overlay is regenerated from effective pipeline roles on each run (`harness.ts:278-280`; `harness/omp/overlay.ts`).

Prompt rendering: fragment `agents/steps/<id>.md` + criteria + vars; includes `{{> _shared/name}}` (`core/prompts.ts:199-271`), `{{var}}` substitution (`prompts.ts:402-433`), `## Output` schema block appended (`prompts.ts:435-445`). Render call at `core/flows/step-runner.ts:501-548`. Agent definition body (frontmatter stripped, `harness.ts:119-120`) becomes `--system-prompt` (`harness.ts:337-348`). Prompt files are written under runtime and unlinked after the turn (`harness.ts:359-364,410`).

Structured output: `yield` tool appended when a schema exists (`harness.ts:350-357`); NDJSON parser captures `yieldData` from `turn_end`/`agent_end`/`tool_execution_*` (`harness/omp/ndjson.ts:58-140`); fallback parses JSON from assistant text (`harness.ts:656-665`); Ajv validates (`harness.ts:667-716`); invalid output → repair via `simpler.complete()` (`step-runner.ts:1227-1318`, call at `1272`; `harness.ts:802-850`).

Records: `input.md` + `meta.yaml(status: started)` committed before launch (`core/records/step-record.ts:71-95`). Task-level: `.factory/tasks/<task>/runs/NNN-<step>-aA/{input.md,output.yaml,meta.yaml}` (`iteration.ts:1317`); item-level: `.factory/tasks/<task>/items/<slug>/steps/…` (`item-machine.ts:927`). Archived example: `docs/runs/modernize/runs/016-architect-wave-report-1-1-a1/meta.yaml`.

Sessions: id persisted to `meta.yaml` at turn start (`step-runner.ts:685-695`); restart reuses it (`step-runner.ts:581-619`); resume via `--resume`; `sessionLost` retries fresh with rehydrate prefix (`core/sessions.ts:113-137`). Raw transcript JSONL: `{worktreeRoot}/.factory-runtime/sessions/<ts>_<id>.jsonl` (`harness.ts:264,302-322,616-617`). Example `traceRef` points to `/home/slava/aiexp/python-setup.factory-wt/...` (absent) `[V]`.

Compaction: **none**. `grep -r compact src` finds only "compact status" comments; `docs/ARCHITECTURE.md:40` explicitly admits "no cache/compaction management"; sessions are never trimmed. This violates `manifesto.md:28-34`.

## 4. Test infra, checks, repo state

- Tests: `cd plugins/software-factory && bun test` (`package.json:10`, `README.md:144-147`); 107 `*.test.ts`, 36,641 LOC, fake harness (`src/harness/fake/fake-harness.ts`) + temp git repos (`test/helpers/tmp-repo.ts:1-60`). Live smoke is opt-in: `FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts` (`README.md:149-152`).
- Full suite did **not finish** in 130 s (killed at 2m10; no summary; `[V]`). Small subset `bun test test/harness/ndjson.test.ts test/git-naming.test.ts` = 14 pass/0 fail, 24 ms. Full-suite pass status UNVERIFIED.
- Typecheck: `bun run typecheck` = `tsc --noEmit` (`package.json:11`, `tsconfig.json`); PASS in 3.0 s `[V]`. No lint config/command found. No CI: no `.github/` `[V]`.
- Git: origin `git@github.com:szavadsky/agentic-swarm.git`; `main` at 9de772c; 49 local branches (mostly `topic/*`); worktrees = main + two prunable `/tmp` detached; no `../agentic-swarm.factory-wt` `[V]`.

## 5. Other directories that matter

- `plugins/software-builder/`: v1 omp plugin, 18 tracked files, 11 agent md + `commands/goal-flow.md` + 3 Python scripts. `goal-flow.md:20-33` runs `exec(read("skill://software-builder-asset/goal_flow.py:raw"))` from an eval cell; `task_spec.py:1-30` is a YAML task-spec + markdown-plan line-range extractor. Design is the rejected predecessor (`manifesto.md:5`); line-range plans are explicitly rejected (`manifesto.md:94`). Treat as archive, not source.
- `agents/skills/factory-selfhost/SKILL.md`: operational self-host loop (≤5 launches, merge topic branch, trace analysis); useful practice, no reusable code.
- `docs/`: `factory.v2.md` (old spec), `dev-process.md` (v1 narrative), 22 ADRs (spam per `manifesto.md:94`), diagram. Historical only.
- `.factory/`: `project.yaml` sets `worktreeRoot: ../agentic-swarm.factory-wt` (line 16, absent) and self-host `scripts` setup/typecheck/test (lines 22-25); two task `INTENT.md`s are v2 self-host goals.
- `.omp/lsp.json`: editor yamlls config; no runtime role.
- `plugins/software-factory/docs/`: `ARCHITECTURE.md` 467 L, `IMPLEMENTATION.md` 1,347 L, `OMP_ADAPTER.md`, `inspection.md` 38 L, `FIRE_TEST.md` 56 L, `records/` 42 files, `runs/` 1,561 files/67 MB, `spikes/` 2 reports. `.factory-runtime/omp-overlay.yaml` is ignored self-host model-role config (`.gitignore:1-3`).

## 6. Top-10 observed failure modes of v2

1. **Ceremony/size**: 26,059 src LOC; `iteration.ts` 4,092 L; 21 schemas/1,554 L; 48 prompt files/1,448 L; 25 documented step kinds (`docs/IMPLEMENTATION.md` A–Y); rejected as restrictive/not token-economical (`manifesto.md:5`).
2. **Prompt/token blowup**: 158 modernize step records consumed 36.3 MB of `input.md`; median 91 KB, mean 230 KB, p90 867 KB, max 1.14 MB (`docs/runs/modernize/runs/*/input.md`, `[V]`); a fix-round live input was 4,753 lines/228,331 B (`IMPLEMENTATION.md:844`).
3. **Architect cost**: 81 architect launches, 21.7 M input tokens, $5.22 of $11.01 in the last run (`manifesto.md:103`); sample 20 s wave-report turn = 141,337 input tokens (`runs/016-architect-wave-report-1-1-a1/meta.yaml`).
4. **Noise**: modernize journal has 228 `steer_poll_error`, 175 `step_transcript_size_warning`, 69 `step_tool_call_warning`, 269 `step_timeout_armed` (`docs/runs/modernize/journal.ndjson`; logic `step-runner.ts:915-945`).
5. **Loops/retries**: 303 `step_started` vs 289 `step_finished`, 24 `step_timeout`, 15 `turn_timeout_nudge`, 20 `item_stranded`, 6 `plan_closeup_refused` (same journal). Nested retry budgets compound and last-fingerprint-only detection allows alternation loops (`manifesto.md:99-100`); 10 bound rows, several detectors marked empty/unused/unenforced (`ARCHITECTURE.md:430-443`).
6. **Review does not predict failure**: 5/5 failed items in `omp-workspaces` had `status: approved` reviews (`docs/inspection.md:30-32`).
7. **Environment/gate fragility**: fresh worktrees lacked `node_modules` → `TS2688`, killing 4 wave-1 spikes; literal command used as gate target; conflict markers survived integrate; red baseline blocked a docs-only merge (`docs/inspection.md:23,25,34,35`).
8. **Hard caps cause formal rejects**: 52 items > `maxItemsPerPlan: 50` produced 4× `pm_amend_validation_failed` (`inspection.md:27`; `config/pipeline.default.yaml:361`); amendment/iteration caps at lines 352-353.
9. **No compaction**: no code path, `ARCHITECTURE.md:40` admits it; all sessions are raw JSONL, rehydration only on session loss (`sessions.ts:113`), contrary to `manifesto.md:28-34`.
10. **omp lock-in + noisy fallbacks**: 1,454-line omp-specific adapter with exact CLI flags (`harness.ts:463-483`), 16 `harness_model_fallback` events, bad `@simpler` credential caused multi-hop chains (`inspection.md:36`); no generic ACP harness layer, only omp + fake (`src/harness/`; `manifesto.md:83-86`).

## 7. Candidate kernel location/language (facts + inference)

- Available: Bun 1.4.4, TypeScript 5.8, `bun test`, `tsc --noEmit`; Python 3.14.4; git 2.53; omp 18.20.0 `[V]`.
- No root Bun project (`package.json`/`bun.lock` absent at repo root); only private ESM package is `plugins/software-factory` (`package.json:2-4`).
- Candidate `[I]`: new `factory/` (or `plugins/factory-kernel/`) Bun+TS ESM package with `src/`, `test/`, one `bin/` entry; no YAML state, no JSON schemas, markdown plan only. Bun gives runner+typecheck with zero new toolchain.
- Reuse by adaptation `[I]`: `core/git/*`, `core/{proc,shutdown,mutex,clock,disk-space,runtime-tmp,journal}.ts`, `harness/omp/*`, `core/checks/runner.ts`, `core/records/{io,repair}.ts`, `core/prompts.ts` partials.
- Avoid `[I]`: `artifacts.ts`, all 21 schemas, `plan/*`, `derive/*`, `flows/*`, `concerns/triage` machinery, ADR routing. Target ~1–2 k LOC kernel vs 26 k src / 36 k test LOC now.

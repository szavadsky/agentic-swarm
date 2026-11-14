# Benchmark goal — v2 baselines, re-run recipe

Read 2026-11-12. `RUNS=plugins/software-factory/docs/runs` (67 MB: modernize 60, omp-workspaces 6.9). Targets' git read directly. VERIFIED unless tagged INFERRED. Only two archived runs exist.

## 1. Inventory

| | modernize | omp-workspaces |
|---|---|---|
| Target repo | `/home/slava/aiexp/python-setup` = `git@github.com:szavadsky/python-setup.git`; present (main `a7caf811`) | `/home/slava/aiexp/agentic-swarm` = `git@github.com:szavadsky/agentic-swarm.git`; present (main `9de772c`) |
| Start commit | item branches fork `40800422` (origin/main) + INTENT = local `a9a4f0d2`; lint excludes landed mid-run (`a7caf811`, topic `85b2625a`), gates baseline recorded after them | `572a6e0` (origin/main); INTENT commit `432cb81` (tree `1379b0f`) |
| Intent | `$RUNS/modernize/INTENT.md`, 618 B, 10 lines | `$RUNS/omp-workspaces/INTENT.md`, 1689 B, 20 lines |
| Dates (UTC) | 11-07 15:43 → 11-10 03:41 | 11-09 22:57 → 11-10 06:32 |
| Wall | 59 h 58 m | 7 h 35 m |
| Outcome | 50 items across 5 iterations (final plan-5.3: 28 outlines): 33 merged, 7 failed, 5 blocked, 2 superseded, 2 ready, 1 running; status active, exit=1 stall at iteration 5 | 10 items (plan-1.2: 10 outlines), 3 waves: 5 merged, 5 failed at merge; status failed (iteration 2 died) |
| Launches | 261 = 158 top + 103 item-step; architect 81 | 45 = 25 top + 20 item-step; architect 13 (41 launches after iteration-1 start) |
| Tokens in/out | 37.60 M / 6.40 M meta; 42.72 M / 8.46 M state | 4.74 M / 0.93 M meta; 7.23 M / 1.91 M state |
| Cost | $11.01 meta; $13.21 state `budgetSpentUsd` | $1.06 meta; $2.08 state |
| Architect share | 39.5% state ($5.22/$13.21); 47.4% meta | 14.3% state ($0.30/$2.08); 28.1% meta |
| Cost/merged | $0.400 state; $0.334 meta (33 merged) | $0.417 state; $0.213 meta (5 merged) |
| Loop incidents | NEVER a metric; journal: 13 process starts, 4 lock takeovers, 24 step timeouts, 15 timeout nudges, 16 model fallbacks, 20 stranded items, 14 merge failures, 12 empty-wave streaks | NEVER a metric; journal: 2 process starts, 1 lock takeover, 1 step interrupt, 32 model fallbacks, 10 merge failures (5 terminal), 8 gate failures, 2 empty-wave streaks |
| Human interventions | NEVER a metric; proxies: 3 steer messages (`$RUNS/modernize/steer/fromusertaken/*.md`), 12 relaunches (13 `task_started`), 1 operator `pipeline.yaml` model override, 1 mid-run manual commit (`a7caf811`) | NEVER a metric; proxies: 0 steer messages, 1 operator restart (`task_started` 2, `lock_takeover` 1) |

Sources: meta = `$RUNS/<run>/{runs,items/*/steps}/**/meta.yaml`; state = `$RUNS/<run>/state.yaml`; journal = `$RUNS/<run>/journal.ndjson`; gates = `$RUNS/<run>/{infra,gates-baseline}.yaml`.

Accounting: `meta` = all `**/meta.yaml` records (`usage.inputTokens|outputTokens|costUsd`). Item-step records exist only for merged items (103 of 33 merged / 20 of 5), so meta cost/tokens are a floor; `state.yaml` `budgetSpentUsd` + `spendByRole` are authoritative (modernize: workhorse 6.174, alt-workhorse 1.692, architect 5.220, alt-architect 0.127; omp: 1.363 / 0.416 / 0.299 / 0.006). Modernize's `topic/modernize` is an unrelated-root history (root `d6d240ef`) merged into item branches; an executable reset is `a7caf811` + INTENT, not that branch (VERIFIED: empty merge-base).

Aggregation commands (all read-only):
```bash
cd plugins/software-factory/docs/runs
python3 - <<'EOF'
import glob,yaml,collections
for r in ('modernize','omp-workspaces'):
    m=[yaml.safe_load(open(p)) for p in glob.glob(r+'/**/meta.yaml',recursive=True)]
    u=[d.get('usage') or {} for d in m]; a=[d for d in m if d.get('agent')=='architect']
    print(r,len(m),len(a),sum(x.get('inputTokens',0) for x in u)/1e6,
          sum(x.get('outputTokens',0) for x in u)/1e6,sum(x.get('costUsd',0) for x in u))
    s=yaml.safe_load(open(r+'/state.yaml')); print(s['budgetSpentUsd'],s['spendByRole'],
          collections.Counter(v['status'] for v in s['items'].values()))
EOF
jq -r .type modernize/journal.ndjson | sort | uniq -c   # loop/intervention proxies; same for omp
```

## 2. Can each be re-run today as a fixed benchmark?

- **modernize: NO.** 50 items / 60 h / $13 (paid) is not a per-iteration benchmark; final plan still 28 outlines. Gates are red on the clean base (VERIFIED: `uv run pytest -q` 6 failed/1300 passed/22.6 s; `ruff check` 1 error at `src/python_setup_lint/checkers/stub/coverage.py:196`; `pylint` W9704 etc. per `$RUNS/modernize/gates-baseline.yaml`); the semantic epic needs HuggingFace model downloads (archived weights excluded, 1.8 GB not in repo → not offline, INFERRED). Reset is possible (`git archive a7caf811` + INTENT) but the start state is ambiguous (start `40800422`, excludes added mid-run `a7caf811`), and the goal is an open-ended repo-wide modernization (intent self-contained at 10 lines, but scope not fixed: 50 items, final plan 28 outlines).
- **omp-workspaces: YES, with iteration limit 1.** Target present at `572a6e0`; intent is 20 lines and self-contained (`docs/factory.v2.md` items 19–20 and `plugins/software-factory/docs/spikes` exist at the base). Gates run offline on this machine (VERIFIED at the archive tree): `bun install --offline` 15 ms (bun cache 5.9 GB), `bun run typecheck` pass, full `bun test` 664 pass / 2 skip / 0 fail / 160 s (`test/disk-space.test.ts`, the archived run's sole red, passes here; archive was 663P/1F). Expected size 8–12 tasks (INFERRED; v2: 10, 3 waves; wave-2/3 fixes follow wave-1 failures; all 10 items reviewed, 5 merges, 5 approved-but-failed merges). Do **not** create branch `topic/omp-workspaces` in a worktree of `$SRC` — the archived branch collides; use the archive recipe below.

## 3. Recommendation

**Goal: `omp-workspaces` verbatim** — `$RUNS/omp-workspaces/INTENT.md` (1689 B, sha256 `f575dc19…2f5c2`), target `agentic-swarm@572a6e0` (+ intent commit tree `1379b0f`), one iteration per launch (P1 protocol), target reset before every iteration. This is the only archived run that fits: 10 tasks, dependencies, review+merge, green offline gates, $2.08 and 7.6 h on paid models; free-model quota cost is $0 (INFERRED, D8 zero marginal cost). v2 baseline (iteration 1; the run died in iteration 2, so no completion baseline):

| Metric | v2 baseline | Recorded by v2? |
|---|---|---|
| Architect launches | 13 of 45 (41 in iteration 1) | per-step `meta.yaml` only, never aggregated |
| Architect share of cost | 14.3% state ($0.299/$2.084); 31.7% on meta floor ($0.299/$0.944 iter-1) | NO — derived from `state.yaml:spendByRole` |
| Cost per merged task | $0.417 state ($2.084/5); $0.189 on iter-1 meta floor ($0.944/5) | NO — derived |
| Loop incidents | 1 step interrupt, 32 model fallbacks, 10 merge failures (5 terminal), 8 gate failures, 2 empty-wave streaks, 1 lock takeover | **NEVER** — raw journal events only |
| Human interventions | 1 operator restart, 0 steer messages | **NEVER** — only `task_started`/`lock_takeover`/steer files |

Comparability lost: v2 never finished the goal (5/10 tasks failed at merge for environmental reasons fixed after the run); the benchmark measures **iteration 1 only**, and the target is the v2 factory itself, so benchmark work is not v3 product work. No cut-down is needed; if 7 h is too long, the smallest honest slice is M1's 4 spike items, but that drops review/merge and is not recommended. For v3, define loop incidents before the first launch (same event classes above) and enforce gates as target-green: baseline is green here, so a red gate is a regression.

## 4. Reset recipe (verified 2026-11-12 in /tmp, then removed)

```bash
SRC=/home/slava/aiexp/agentic-swarm
RUNS=/home/slava/aiexp/agentic-swarm.wt/v3/plugins/software-factory/docs/runs
DEST=/tmp/bench-omp
rm -rf "$DEST" /tmp/agentic-swarm.factory-wt && mkdir -p "$DEST"
git -C "$SRC" archive 572a6e0 | tar -x -C "$DEST"          # exact source tree; no .git
cd "$DEST" && git init -q -b topic/omp-workspaces
mkdir -p .factory/tasks/omp-workspaces
cp "$RUNS/omp-workspaces/INTENT.md" .factory/tasks/omp-workspaces/INTENT.md
git add -A && git -c user.name='Software Factory' -c user.email='factory@local' \
  commit -q -m 'factory: task intent'                      # tree must be 1379b0f
cd plugins/software-factory
bun install --offline --frozen-lockfile && bun run typecheck && bun test
```

Verified: HEAD tree `1379b0fd46fc07fcf2f26a80c67d7a47dc84cae4` (= archived `432cb81` tree), intent hash above, `git status` clean, install 15 ms, typecheck pass, `test/disk-space.test.ts` 7/7; full suite 664 pass/2 skip/0 fail/160 s on the same tree. `/tmp` dirs and worktrees removed after the check. Runtime dirs created by the factory land in `/tmp/agentic-swarm.factory-wt` (per `.factory/project.yaml` `worktreeRoot`), so the `rm -rf` above is part of the reset and runs must be serial.

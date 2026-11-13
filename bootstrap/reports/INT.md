# INT — S2 integrated onto the merged base

## Files / LOC
- Merge `--no-ff` c4577e4: 32 files, +2780/−400 (S2). Branch vs factory-v3: 47 files, +3192/−497; post-merge commits b0cd004, 667064b, 778791a, 46bd5c5.
- Post-merge: launch +47/−65, integration-e2e +297, scenario4 +35, digest +16/−12, metrics +12/−3, dispatch +7/−2, ten others ≤9 lines each.
- Shared files: types.ts (StepRecord/RecordEnd carry transcript+tree+attempts), config.ts (S2 flow/drain/keepRuns schema inside S4's strict findings loader; a follow-up role is a finding), derive.ts (old inline reducer deleted), tasks.ts (slug regex internal). bootstrap/drafts already absent.
- Seams closed: launch runs runDispatch; all derive calls get configured flows; every harness attempt persisted; metrics and digest share rolesByStep; different-model roles pre-flighted; infra is LaunchStop infra (summary, exit 1); digest reads YAML.

## Conflicts (settled)
- types.ts ×2: S3 `transcript` vs S2 `tree`/`attempts` — unions; one record carries both.
- config.ts ×3: S2 step regex/followUp/drain/keepRuns kept inside S4's strict schemas and ConfigError findings; loadConfigs still reports every violation at once.
- derive.ts: S2's derive-task reducer supersedes S3's inline reducer; the old one is deleted and S3's cancel branch moved into terminalFromRecords.
- scenario2's summary assertion retargeted to S3's "Parked by root cause" format; no test dropped.

## Verified
- `bun run typecheck` green (1.6 s).
- `bun test`: 327 tests / 73 files — 323 pass, 4 live skips, 0 fail, 5 snapshots, 1542 expect(), 35.2 s.
- Scenarios 1–9 (`test/kernel/`): 1 `scenario1:200`; 2 `scenario2:18`; 3 `scenario3:211`; 4 `scenario4:11`; 5 `scenario5:17`; 6 `scenario6:9`; 7 `scenario7:128`; 8 `scenario8:17`; 9 `scenario9:16`.
- Cross-slice `integration-e2e:104`: init → run (alpha merged, beta last-round reject+park, gamma pending) → CLI steer → run (digest, steer answered+outbox, beta2 `base`=beta tip, PM re-points gamma, both merge) → run done; state/outbox/summaries/metrics (turns 8/7/2) after each.
- Launch infra: `scenario4:54` asserts exit 1, one summary, turns 0, no second iteration.
- `rg "TODO|FIXME|as unknown as" src`: only store.ts:165, the same pre-existing hit as factory-v3:159; nothing new.
- `FACTORY_PIN_ROOT=/tmp/pin-check bootstrap/promote.sh` green at HEAD; temporary pin removed.

## Kernel LOC (5511 total)
- config 305, types 309, derive-task 252, launch 249, metrics 249, mailbox 237, context-pack 225, boundary 221, pm 220, flow 219, integrate 208, summary 207.
- preflight 199, agent 199, dispatch 188, store 186, worktree 179, flow-context 177, preflight-aliases 163, digest 159, tasks 157, merge-attempt 139, baseline 119, record 105, outcome 97, derive/next 88, signals 76, sessions 58, gates 57, recovery/architect-session 48, prompts 33, progress 31, findings 16.

## Gaps vs KERNEL0 §2 (left column)
- Goal `journal.ndjson` is never written though §4 lists it and the digest prompt names it. Smallest next: append one NDJSON line per settled record in FolderStore.
- Session-end compaction covers the architect and resumed fix sessions; implementer/reviewer sessions end uncompacted. Smallest next: compact every step when caps.compact != none, or declare task sessions disposable.
- A pending task edited after an infra/earlier dispatch reuses its old branch/worktree. Smallest next: compare the dispatch-time taskHash/material hash and reset from the integration head when it changed.

## Next / surprises
- Next: run `bootstrap/run/shakedown.yaml` (free models), watch digest/PM outcome misses, then promote; merge this branch upstream.
- Surprise: scenario7 exposed a real dispatch race — records were read before the running set was snapshotted, pairing a stale state with an idle slug and re-dispatching a review; snapshotting running first fixed it.
- Reversible choices: digest stays optional without an alias; infra maps to exit 1; unanswered steers stay in the inbox and are named in owner attention.

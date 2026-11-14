# E5 repro — inherited base-red is matched by gate NAME only

**claim**: Inherited base-red is matched by gate NAME and cached per base commit (baseline.ts:41-43,127-128; integrate.ts:197-202); with the self repo's single coarse gate `package` (.factory/repo.yaml:5-7), a base red for any reason makes that whole gate non-blocking, so a task breaking something else still merges.

**reproduced**: yes

**test file path**: `/tmp/review-swarm/ReproE5/plugins/software-factory/test/kernel/e5-repro.test.ts` (scratch clone HEAD 518cca5 = b4a2d9f + one bootstrap/LOG.md-only commit; `git diff --stat b4a2d9f HEAD` shows only bootstrap/LOG.md)

**command**: `cd /tmp/review-swarm/ReproE5/plugins/software-factory && bun test test/kernel/e5-repro.test.ts`

**key output** (6 of 6 non-blank lines):
```
BASE gate: exit=1 out="reason X: base-broken.txt"
DISPATCH reason=boundary
TASK status=merged mergeChecks=[{"ok":true,"checks":[{"name":"package","ok":false,"summary":"exit 1","output":"reason Y: task-broken.txt","fingerprint":"fb9aed7f..."}]}]
MERGE [{"ok":true,"checks":[{"name":"package","ok":false,"summary":"exit 1","output":"reason Y: task-broken.txt","fingerprint":"fb9aed7f..."}]}]
MERGED gate: exit=1 out="reason Y: task-broken.txt"
 1 pass, 0 fail, 19 expect() calls
```

**what exactly was observed**:
- One gate, id `package`, one bash command that fails for `base-broken.txt` (reason X) and for `task-broken.txt` (reason Y). Base commit carries X; gate on base checkout exits 1 with "reason X".
- A baseline record {base: head, ok:false, checks:[{name:"package", ok:false, output:"reason X"}]} was appended exactly as pre-flight's `checkBase` would (checkBase caches one record per base commit, baseline.ts:127-128).
- Task writes `task-broken.txt` (Y). No fix round: 1 implement record, 0 park records, 2 harness calls.
- Merge-result gate run exits 1 "reason Y" — a failure absent on base — but the merge-checks record is `ok:true` with `checks[0] = {name:"package", ok:false}`; the merge record is `ok:true` with the same red check; derived task state is `merged`. Merged branch `factory/demo` contains `task-broken.txt`.
- Mechanism: `preexistingRed` builds a `Set<string>` of failing check NAMES only (baseline.ts:41-43); `newGateFailures` drops any failing check whose name is in that set (gates.ts:67); integrate.ts:197-202 uses that filtered list to decide merge. The new failure's output/fingerprint is never compared with the base one.
- No records store the preexisting set; `appendChecks` only uses it to compute the `ok` signal (record.ts:31).

**what scenario5 asserts today**:
- test/kernel/scenario5.test.ts:44-86 "records a red base once and does not tax the task or block its merge": fabricates a baseline record with one gate `always-red` red; asserts task status `merged`, exactly one `merge-checks` record whose `ok:true` while `checks[0].ok:false`, exactly one `merge` record `ok:true`, and 2 harness calls. It asserts only one red reason (the base's own); it does not have the task introduce a second, distinct failure under the same gate name.
- test/kernel/scenario5.test.ts:88-156 "does not merge, runs one fix round, then parks when the merged result is red again": no baseline record at all, so the gate `poison-gate` failure is the task's own; asserts two failed merges (`cause` starts `gates:`), 2 `merge-checks` both `ok:false`, task `parked`, round 1, 2 implement records.

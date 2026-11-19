# Compaction probe (agy 1.5.12 / claude 2.1.327 via acpx 0.22.0)

Tags: `[V]` ran/read locally; `[D]` help/docs/source only. Probe date 2026-11-19.
Route: the production `AcpxHarness.compact` path — `/compact` as the whole prompt
on a named session, no `--model` — each harness in a fresh `mkdtemp` cwd. `acpx`
was never installed globally, so every command below runs `bunx acpx` (0.22.0).
Session spend is read from `~/.acpx/sessions/<record>.json`; acpx prints neither
usage nor cost in any format (acpx probe §4).

## 0. Verdict

| harness (adapter) | `/compact` over ACP | evidence | run config |
|---|---|---|---|
| `claude-code` (`@agentclientprotocol/claude-agent-acp@0.95.0`) | **honoured** — a `Compact conversation` tool call, history 16512 → 3492 tokens | §1 | `compact: true` |
| `agy` (`agy acp`, 1.5.12) | **not an adapter command** — the text is submitted to the model as a prompt and nothing is compacted | §2 | `compact: false` |

What the flag gates: `AcpxHarness.caps` reports `compact: "server"` only for a
harness whose config says `compact: true`, and `AcpxHarness.compact` classifies
the command as a success on `stopReason === "end_turn"` with exit 0. agy meets
both while compacting nothing (§2), so a `true` there would claim a capability
the agent does not have. claude-code meets both with a real compaction (§1).

## 1. claude-code: honoured, spend not surfaced

Two warm-up turns (`opus`, effort `high`), then `/compact`: [V]

| step | request id | tokens | cost (USD) |
|---|---|---|---|
| turn 1 `Write the word pong…` | `ae1cf074…` | in 2 / cacheRead 8965 / cacheWrite 5703 / out 4 | 0.0476296 (turn cost) |
| turn 2 `Write the word ping…` | `0fd31c18…` | in 2 / cacheRead 11199 / cacheWrite 5307 / out 4 | 0.0924134 (cumulative) |
| `/compact` | `4879cbcc…` | **0 / 0 / 0 / 0** | **0.0924134 — unchanged** |

- The command exits 0 with `stopReason: "end_turn"` and empty agent text, and the
  record gains the compaction as a tool call, `is_error: false`: [V]
  ```json
  {"name":"Compact conversation","input":{},
   "content":{"Text":"{\"trigger\":\"manual\",\"preTokens\":16512,\"postTokens\":3492,\"durationMs\":9402}"}}
  ```
- Cost of the compaction itself: **$0.00 harness-reported**. The summarization is
  internal to `claude-agent-acp` (9.4 s, 16512 → 3492 tokens) and reaches ACP as
  no `usage_update`; acpx writes a zero-token `request_token_usage` entry for the
  command's prompt id and leaves `cumulative_cost` untouched. [V] A real summary
  therefore costs tokens the factory cannot meter: `AcpxHarness.compact` returns
  `{session}` with no `usage`. [V]
- acpx resets `cumulative_token_usage` to 0 on this compaction (16512 → 0) while
  `cumulative_cost` stays cumulative. A harness that reads totals through a
  usage command must re-baseline after a compaction; claude-code has no usage
  command, so nothing reads these totals today. [V]
- Messages 4 → 6: later turns resume the same record and see only the summary.

## 2. agy: `/compact` is a model prompt, not a command

`gemini-3.8-flash` was quota-blocked on this machine: both warm-up turns stopped
`infra/quota` with `⚠ Individual quota reached. Please upgrade your subscription
to increase your limits. Resets in 134h52m31s.` (retry: `134h52m0s`, i.e. around
2026-11-25) and 0 tokens. `/compact` on that empty session returned exit 0 and
`stopReason: "end_turn"`, and the record gained a `User` message with text
`/compact` plus an `Agent` message carrying the same quota notice — the text was
forwarded to the model, not consumed by a command handler. [V]

Re-run on `gpt-oss-120b-medium` (same subscription, not blocked) to remove the
quota as the explanation. Warm-up `Write a 400-word story about the sea` succeeded
(in 3864 / cacheRead 3520 / out 661). Then: [V]

| command | exit | stopReason | agent text | command usage | record |
|---|---|---|---|---|---|
| `/compact` | 0 | `end_turn` | empty | in 1502 / cacheRead 7360 / out 461 | gained only `User{"/compact"}`; cumulative 8045 → 9323 |
| `/compress` | 0 | `end_turn` | prose: "You can use the **`/compact`** slash command to summarize or compress the current conversation context…" | in 800 / cacheRead 7360 / out 141 | same shape |

- No compaction happened either time: the transcript is not replaced or
  summarized, no summary message appears, the token counters only grow. The
  `/compress` reply is the model answering the literal prompt, so the adapter has
  no client-side slash command for either spelling. [V]
- Cost of a `/compact` attempt: one model turn — 1502 in / 7360 cache read / 461
  out — billed at **no reported cost** (`cumulative_cost: null`; agy sends no
  cost field, acpx probe §12). A `compact: true` on agy would therefore pay that
  turn at every session end, then record `compacted: true` on a no-op. [V]

## 3. Re-run

```bash
D=$(mktemp -d)
# claude-code (positional agent subcommand)
bunx acpx --format json --cwd "$D" --approve-all claude sessions new --name cc-probe
bunx acpx --format json --cwd "$D" --approve-all claude -s cc-probe "Write the word pong and nothing else."
bunx acpx --format json --cwd "$D" --approve-all claude -s cc-probe "/compact"
# agy (raw --agent escape hatch; the prompt verb follows the selection)
bunx acpx --format json --cwd "$D" --approve-all --agent "agy acp" sessions new --name agy-probe
bunx acpx --format json --cwd "$D" --approve-all --agent "agy acp" prompt -s agy-probe "Write the word pong and nothing else."
bunx acpx --format json --cwd "$D" --approve-all --agent "agy acp" prompt -s agy-probe "/compact"
# the compaction's own spend, from the record this printed at session creation
jq -c '{cumulative_token_usage,cumulative_cost,messages:(.messages|length)}' ~/.acpx/sessions/<acpxRecordId>.json
jq -c '.messages[-2:]' ~/.acpx/sessions/<acpxRecordId>.json
```

`claude-code`: a `Compact conversation` tool call with `postTokens < preTokens`.
`agy`: a `User` message whose text is the slash command and an `Agent` reply from
the model. Re-probe agy after the gemini quota resets; if a later `agy` release
grows a real command, it shows up as a record message that replaces the history,
not as another prompt.

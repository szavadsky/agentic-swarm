# acpx probe (acpx 0.22.0; pi 1.5.2 / codex-cli 0.167.0 / opencode 2.2.7)

Tags: `[V]` ran/read locally; `[D]` help/docs/source only. Probe date 2026-11-13. Scratch dirs `/tmp/acpx-pi-1`, `/tmp/acpx-codex-1`, `/tmp/acpx-oc-1`, `/tmp/acpx-{pi,codex,oc}-{out,deny}`, `/tmp/acpx-pi-compact`.

`acpx` was never installed globally. `bunx acpx --version` and `npx -y acpx --version` both return `0.22.0`; the package and its per-harness adapters are fetched on demand into the bun/npm caches. No global pi/codex/opencode config or auth was changed; `~/.acpx/` is created by acpx. Model calls: `opencode-go/beam-free` (pi), `opencode/beam-free` (opencode); codex used the machine's pre-existing `~/.codex/config.toml` provider `opencode-go` / `deepseek-v4.1-flash`, which is not a free model and reports no cost.

## 0. Binary and install routes

- `bunx acpx --help` is a harness dispatcher: global options first, then an agent subcommand (`pi`, `codex`, `opencode`, `claude`, `gemini`, … 30 in total), then `prompt|exec|cancel|set-mode|set|status|sessions`. [V]
- Global flags **must precede** the agent name: `acpx pi --format json …` -> `error: unknown option '--format'`, exit 2. Correct: `acpx --format json --model M --cwd D pi …`. [V]
- `bunx acpx --version` = `0.22.0`, fetched by bunx/npx; no global install was performed. `acpx config show` reports `defaultAgent: codex`, `defaultPermissions: approve-reads`, `nonInteractivePermissions: deny`, `ttl: 300`. [V]
- Adapters are launched through `npx` on first use (observed with `--verbose` and in `~/.acpx/sessions/<record>.json.agent_command`): [V]
  - pi: `npx --package=pi-acp@^0.0.33 -- pi-acp`; local `pi` 1.5.2 required. Fetched adapter reports `pi-acp 0.0.33`. Works.
  - codex: `npx -y --package=@agentclientprotocol/codex-acp@^1.1.5 -- codex-acp`; local `codex` 0.167.0 required. Fetched adapter reports `@agentclientprotocol/codex-acp 1.13.1`. Works.
  - opencode: **built-in** `acpx opencode` runs `npx -y --package=opencode-ai -- opencode acp`, which resolves **opencode 1.19.5**, not the installed 2.2.7. Against this machine's 2.2.7 data dir it fails before initialize: `Error: Unexpected error Database is not empty and has no session table`, exit 1. [V]
  - opencode workaround that works: `acpx --agent "opencode acp" …`, which uses the installed `opencode` 2.2.7; initialize reports `agentInfo: {name:"OpenCode", version:"2.2.7"}`. [V]

## 1. CLI contract: a session is a prerequisite

A prompt in a cwd with no acpx record fails before spawning: [V]

```json
{"jsonrpc":"2.0","id":null,"error":{"code":-32002,"message":"⚠ No acpx session found (searched up to /tmp/acpx-pi-1).\nCreate one: acpx pi sessions new","data":{"acpxCode":"NO_SESSION","origin":"cli","sessionId":"unknown"}}}
```
exit **4**.

Create one:

```bash
bunx acpx --cwd D pi sessions new
# {"action":"session_ensured","created":true,"acpxRecordId":"c2742b63-…","acpxSessionId":"01a1d37f-04ec-…"}
```

- `sessions new` creates the acpx record and the harness session; the record's `acp_session_id` is what later turns resume. Observed variation: codex's first prompt still sent `session/new` and rebound the record (the `sessions new` session id was replaced), pi's first prompt sent `session/load` for the created id, and opencode's first prompt sent only `session/prompt` because the just-started queue owner still held it. [V]
- `acpx <agent> exec "…"` is the no-record route: it sends `session/new` and prompts in one process. Verified on pi and opencode; exit 0, normal result. [V] pi `exec` also emits a startup banner as an `agent_message_chunk` (`pi v1.5.2 ... ## Skills ...`) before model text, so take the last agent text, not the first. [V]
- Local state: `~/.acpx/sessions/<acpxRecordId>.json` (`schema: acpx.session.v1`: `acp_session_id`, `agent_command`, `cwd`, `pid`, `messages`, `cumulative_token_usage`, `request_token_usage`, `cumulative_cost`, `acpx.{current_model_id,config_options}`) plus `<id>.stream.ndjson` (`acpx.session.journal.v1` `turn_result` lines). `sessions show` prints metadata but **not** usage/cost. [V]
- A queue-owner process owns the agent between CLI invocations (`status`: `pid`, `status: running`, `model`, `mode`, `uptime`; default TTL 300 s). `acpx <agent> cancel` targets it. [V]

## 2. Sessions: create and resume across processes

Verified with a secret-word recall, each turn in a separate CLI process and the owner process killed between turns: [V]

| harness | first turn (process 1) | kill owner, second turn (process 2) | resume frame | recalled |
|---|---|---|---|---|
| pi | `Remember … ALPHA` -> `STORED` | `What was the secret word?` -> `ALPHA` | `session/load` | yes |
| codex | `Remember … BETA` -> `STORED` | -> `BETA` (streamed `B`+`ETA`) | `session/resume` | yes |
| opencode | `Remember … GAMMA` -> `STORED` | -> `GAMMA` | `session/resume` | yes |

Resume key is the cwd by default (`acpx -s <name>` selects a named session; `sessions ensure|list|close|export|import` exist). [V/D] Because each ACP harness keeps its own session store (pi `~/.pi/agent/sessions/…jsonl`, codex `~/.codex/sessions/…jsonl`, opencode SQLite `opencode.db`), killing the acpx owner does not lose history. [V]

## 3. Model and effort

| harness | model flag | effort flag | observed |
|---|---|---|---|
| pi | `--model opencode-go/beam-free` -> `session/set_config_option {configId:"model"}` | `acpx pi set thought_level high` | config option `thought_level` values `off,minimal,low,medium,high,xhigh`; default `medium`; `status` then shows `mode: high`. `--model opencode-go/beam-free:high` is **rejected** (`did not advertise that model`). |
| codex | `--model deepseek-v4.1-flash` -> config option `model` | `acpx codex set reasoning_effort high` | values `low,medium,high,xhigh,max`; default from `~/.codex/config.toml` (`max`); `/status` then shows `deepseek-v4.1-flash[high]`. `--model 'deepseek-v4.1-flash[high]'` is **rejected** even though `session/new` advertises `[low]…[xhigh]` ids; acpx matches the base `model` config option list. |
| opencode | `--model opencode/beam-free` -> config option `model` | `acpx --agent "opencode acp" set effort high` | values `low,medium,high,xhigh,max,default`. Default model is paid `opencode/gemini-4-hydrogen`; prompting without `--model` failed `provider.quota` / "Insufficient balance". |

All three expose model selection as ACP `session/set_config_option`; effort is a separate config option, not a `--model` suffix and not part of the prompt. With `--agent "opencode acp"` the `opencode` subcommand name disappears, but global `--model` still applies and `set effort` still works. [V]

## 4. Usage, cache and cost

Shapes differ per harness; codex and opencode send ACP `usage_update`, but only opencode's carries `cost`.

- **pi** — prompt result is only `{"stopReason":"end_turn"}`; no `usage`, no `usage_update`. acpx record `cumulative_token_usage` stays `{}` and `cumulative_cost` is absent. Usage/cost must be requested as a slash command: [V]
  ```bash
  D=/tmp/acpx-pi-1                                       # the session's cwd
  bunx acpx --format json --cwd "$D" pi "/session"
  # agent_message_chunk text:
  # Session: 01a1d37f-1c1e-…
  # Session file: /home/slava/.pi/agent/sessions/--tmp-acpx-pi-1--/…jsonl
  # Messages: 7
  # Cost: 0
  # Tokens: in 2403, out 87, cache read 1216, cache write 0, total 3706
  ```
  It is human text, not JSON. Cache read and cache write are both present; cost is pi's catalog-priced number (`0` for `beam-free`). [V]
- **codex** — prompt result carries machine usage: [V]
  ```json
  {"stopReason":"end_turn",
   "usage":{"totalTokens":5927,"inputTokens":5923,"cachedReadTokens":0,"outputTokens":4,"thoughtTokens":0},
   "_meta":{"quota":{"token_count":{"totalTokens":5927,"inputTokens":5923,"cachedInputTokens":0,"outputTokens":4,"reasoningOutputTokens":0},"model_usage":[…]}}}
  ```
  acpx normalises it into record `cumulative_token_usage` / `request_token_usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `thought_tokens`, `total_tokens`). No cost field (`cumulative_cost: null`). Codex also sends ACP `usage_update` on ordinary turns, compaction and after an effort change — `{"sessionUpdate":"usage_update","used":5927,"size":950000}`, with no `cost`; `used`/`size` is the context-window gauge. `/status` gives token totals and context-window percent as text. [V]
- **opencode** — prompt result has the same `usage` shape **and** a separate update: [V]
  ```json
  {"sessionUpdate":"usage_update","used":7163,"size":1048576,"cost":{"amount":0,"currency":"USD"}}
  ```
  acpx records both `cumulative_token_usage` and `cumulative_cost: {amount:0,currency:"USD"}`. No cache-write field (only `cachedReadTokens`); `used/size` is the context-window gauge. [V]
- acpx itself prints no cost or cumulative usage in any format (`sessions show` omits both). A harness must read `~/.acpx/sessions/<record>.json` or, for pi, issue `/session`. The record id is available from `acpx <agent> status` (`session: <id>`) and `acpx <agent> sessions show` (`id: <id>`); those are the stable sources. `sessions new`'s `session_ensured` output and the stderr banner also carry it, but the banner is secondary. [V]

## 5. Compaction

- **pi**: `/compact` is an adapter command, not a model prompt. Short session -> `{"code":-32603,"message":"Internal error","data":{"details":"pi compact failed: Nothing to compact (session too small)"}}`, exit 1. After history exceeded `keepRecentTokens` (default 20000; a splittable earlier message is also required [INFERENCE]) it succeeded: `Compaction completed. / Tokens before: 55832` followed by a summary, `stopReason:"end_turn"`, exit 0. `/autocompact on|off|toggle` also exists. [V]
- **codex**: `/compact` returns an `Agent` message containing a `Compact conversation` tool call with `is_error:false` plus `Warning: Heads up: Long threads and multiple compactions can cause the model to be less accurate…`, `stopReason:"end_turn"`, exit 0. [V]
- **opencode**: `/compact` produces two `session_info_update` frames with `_meta.opencode/compaction = {status:"started"|"completed", messageId, reason:"manual"}`, no agent text, `stopReason:"end_turn"`, exit 0. [V]
- No harness exposes compaction as an ACP method; the slash command is the only route through acpx, and it must be the whole prompt (a leading `/` with no image). [V/D source]

## 6. Cancellation

`acpx <agent> cancel` (from another process) returns `{"action":"cancel_result","acpxRecordId":"…","cancelled":true}`, exit 0, and the in-flight prompt's ACP result becomes `{"stopReason":"cancelled"}`. **The prompt CLI process still exits 0**; cancellation is only visible in `stopReason` (and in the journal `turn_result.status:"cancelled"`). Verified on pi, codex and opencode. [V]

## 7. Outcome file delivery

acpx has no outcome-file or schema flag: delivery means the harness's own write/shell tool writes the file, and it works on all three. [V]

- pi: wrote `outcome.yaml` (relative) and `/tmp/acpx-pi-out/outcome.yaml` (absolute) with exact contents; ACP `tool_call` kind `edit`/`execute` shows the diff/terminal output. [V]
- codex: wrote `outcome.yaml` via a shell `printf … > outcome.yaml` tool call; exit 0. [V]
- opencode: wrote `outcome.yaml`; exit 0. [V]
- Permissions: **zero ACP `session/request_permission` frames** in all runs, and all three wrote the file under `--deny-all`: pi `denied2.txt`, codex `denied2.txt`, opencode `denied3.txt`. Codex and opencode also wrote with default permissions; only codex and pi were additionally checked with `--approve-all`. The acpx permission flags did not gate anything observed. [V]
- A harness must therefore check the file's existence/content itself; the model can return `[done] end_turn` without writing anything. [INFERENCE]

## 8. Errors, stderr and output formats

- `--format json`: stdout is a **raw ACP JSON-RPC transcript**, one object per line, including acpx's own outgoing requests (`initialize`, `session/load|new`, `set_config_option`, `prompt`) and agent responses/updates. There is no acpx envelope. Final turn status is the response frame matching the `session/prompt` id: `.result.stopReason` (`end_turn|cancelled`) or `.error`. Usage is `.result.usage` when the adapter sends it. [V]
- `--format text`: stdout = `[thinking] …` blocks (pi, opencode), model text, `[done] <stopReason>`; no usage/cost. stderr = `[acpx] session … agent connected/starting` banner and progress. Errors still print as one JSON-RPC error object on stdout. [V]
- `--format quiet` exists. `--json-strict` requires `--format json` and suppresses all non-JSON stderr (observed: empty stderr); it does not add an envelope. [V/D]
- Error classes observed: [V]
  - no record: code `-32002`, `data.acpxCode:"NO_SESSION"`, exit 4.
  - bad model: code `-32603`, message includes the rejected id and the full available-model list, exit 1.
  - unknown flag after the agent subcommand: Commander `error: unknown option`, exit 2.
  - provider quota (opencode paid default): code `-32603`, `data:{service:"session",errorName:"provider.quota"}`, message `Insufficient balance…`, exit 1; no acpx wrapper.
  - adapter-level failure (pi compact too small): code `-32603`, `data.details:"pi compact failed: …"`, exit 1.
- A mid-prompt SIGKILL of the agent process was not tested; owner-kill between turns is covered above and shows acpx re-spawns the agent with `session/load|resume`. [V]

## 9. Per-harness summary

| capability | pi | codex | opencode |
|---|---|---|---|
| acpx route | `acpx pi` (pi-acp 0.0.33, npx) | `acpx codex` (codex-acp 1.13.1, npx) | built-in broken; `--agent "opencode acp"` (2.2.7) |
| session create | `pi sessions new` | `codex sessions new` | `sessions new` with `--agent` |
| resume across processes | yes, `session/load` | yes, `session/resume` | yes, `session/resume` |
| model | `--model provider/id` | `--model base-id` | `--model provider/id` |
| effort | `set thought_level` | `set reasoning_effort` | `set effort` |
| usage | only `/session` text | prompt `usage` + `_meta.quota` + `usage_update` (used/size, no cost) | prompt `usage` + `usage_update` |
| cache fields | `/session` cache read/write | `cachedReadTokens`/`cachedInputTokens` | `cachedReadTokens` |
| cost | `/session` (`Cost: 0`) | none (`null`) | `usage_update.cost` (USD) |
| compaction | `/compact` (needs >20k history) | `/compact` (tool success) | `/compact` (`_meta.opencode/compaction`) |
| cancellation | `stopReason:"cancelled"`, exit 0 | same | same |
| outcome file write | yes (default and `--deny-all`) | yes (default and `--deny-all`) | yes (default and `--deny-all`) |
| ACP permission frames | none | none | none |

## 10. Verified minimal script (shell; ran this exact shape)

```bash
D=/tmp/acpx-min-$$; mkdir -p "$D"
bunx acpx --format json --cwd "$D" pi sessions new       # -> {"action":"session_ensured",…}
bunx acpx --format json --model opencode-go/beam-free \
  --cwd "$D" pi "Remember ALPHA. Reply exactly STORED"
# each stdout line is JSON-RPC; model text is the concatenation of
# .params.update.content.text where .params.update.sessionUpdate=="agent_message_chunk";
# turn status is .result.stopReason on the frame whose id answered session/prompt.
bunx acpx --format json --cwd "$D" pi "/session"         # Cost/Tokens text for pi
bunx acpx --cwd "$D" pi set thought_level high           # effort (persistent session)
# cross-process resume: kill the queue owner, then prompt again in a new CLI process
kill "$(bunx acpx --cwd "$D" pi status | awk -F': ' '/^pid:/ {print $2}')"
bunx acpx --format json --cwd "$D" pi \
  "What was the secret word? Reply with the word only"   # -> ALPHA
# in-flight cancel from a second process
bunx acpx --format json --cwd "$D" pi \
  "Write a 500-word story about the sea." > "$D/slow.jsonl" &
sleep 3
bunx acpx --format json --cwd "$D" pi cancel             # -> {"action":"cancel_result",…,"cancelled":true}
wait; grep -o '"stopReason":"[a-z]*"' "$D/slow.jsonl" | tail -1   # -> "stopReason":"cancelled"
```

Observed: turn 1 replied `STORED`; after the owner was killed, the second CLI process answered `ALPHA`; `set thought_level high` left `status` showing `mode: high`; `cancel` returned `{"action":"cancel_result","acpxRecordId":"…","cancelled":true}` while the background prompt exited 0 with `stopReason:"cancelled"`. [V]

## 11. Implications for the harness layer

- The cheapest uniform route is `acpx <agent> sessions new` + `acpx --format json … <agent> "prompt"` with cwd-keyed sessions. It is harness-agnostic except for model/effort/usage details. [V]
- `--format json` is a protocol transcript, not an event API. Do not feed it to a generic JSONL event consumer that expects acpx-shaped events; pair prompt requests with their response ids and filter client→agent frames. [V]
- Do not infer success from exit code: cancellation exits 0, and a completed turn can have empty output. Read `stopReason`, then verify the outcome file. [V]
- Usage/cost is not uniform: pi needs the `/session` text command; codex reports tokens with no cost (its `usage_update` is a context gauge only); opencode's `usage_update` is the only one carrying `cost`. If the harness needs a single accounting table, it must normalise three sources. [V]
- The built-in `acpx opencode` subcommand cannot be used against this machine's existing opencode 2.2.7 database; either use `--agent "opencode acpx"` or pin/upgrade the `opencode-ai` package the adapter fetches. [V]
- Treat acpx permission flags as advisory for pi/codex/opencode: no permission frames were emitted and all three wrote files under `--deny-all`. Sandboxing must come from the harness or a container, not from acpx flags. [V]

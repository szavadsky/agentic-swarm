# opencode CLI v2.2.7 probe

Tags: `[V]` = ran/read locally in this probe; `[D]` = help/docs only. No global config/auth changed. Scratch: `/tmp/oc-probe-1794528316` (own git repo). Report date 2026-11-12.

## 0. Binary / global state
- `OC=/home/slava/.bun/bin/opencode` -> `@opencode/cli`; `$OC --version` = `2.2.7`. [V]
- Background service is **2.2.6** (`$OC api GET /api/info`), while CLI/private `serve` is 2.2.7. Restart service to align. [V]
- Global config: `~/.config/opencode/opencode.jsonc` contains only `{"$schema":"https://opencode.ai/config.json"}`; `package.json` pins `@opencode-ai/plugin@1.19.5`; `service.json` has a password (not copied here). [V]
- Data: `~/.local/share/opencode/opencode.db` (SQLite; 23 MB), `log/opencode.log`, `repos/`, `shell/`; `~/.cache/opencode` empty `bin/`. No `auth.json`. [V]

## 1. Non-interactive `run`
- Help: `$OC run --help`. [V] Flags verified: `-m/--model provider/model#variant`, `--agent`, `--format default|json`, `-s/--session ID`, `-c/--continue`, `--fork`, `-f/--file`, `--title`, `--archived`, `--thinking`, `--auto`, `-w/--worktree[=name]`. [V/D]
- There is **no `--cwd`**; run happens in process cwd. Use `(cd DIR && $OC run ...)`. Top-level `opencode <directory>` is interactive only. [V]
- Basic call:
  ```bash
  $OC run --auto --archived --format json -m opencode/minimax-m3.1-flash-free "Say PONG"
  ```
  JSONL events: `step_start`, `text`, `tool_use`, `step_finish`, `error`. Tool name is `shell` (not `bash`); also `read/write/edit/glob/grep/execute/subagent`. [V]
- `--format default` prints only the final assistant text (no banner; banner on stderr). `--format json` prints events; final text = last `text` event. [V]
- Error handling: bad model -> one `{"type":"error","error":{"type":"provider.no-route"...}}`, exit 1. Tool failure -> `tool_use.state.status="error"`, run still exits 0. Permission refusal -> exit 0. Inspect events, not just exit code. [V]
- `--auto` auto-approves `ask` permissions. Without `--auto`, an `ask` is auto-rejected in non-interactive mode (`stderr: "permission requested: shell (pwd); auto-rejecting"`), tool completes as error, exit 0. `deny` is not overridable by `--auto`. [V]
- Default model when `-m` omitted is paid `opencode/gemini-4-hydrogen`; with zero Console balance the run fails `provider.quota` HTTP 402. **Always pass `-m`.** [V]
- Variants: `-m opencode/minimax-m3.1-flash-free#high` works; minimax/beam have `low,medium,high,xhigh,max`. [V]
- File attach: `-f note.txt` delivered exact file content. [V]
- `--archived` hides script sessions from `session list`; otherwise sessions are top-level and listed. `--title` sets title. [V]

## 2. Auth / models
- `$OC auth list`: OpenCode Go (stored), OpenCode Console (stored), Alibaba Token Plan (environment), Alibaba Token Plan (China) (environment). No secrets printed. **Do not run `auth export`** (prints secrets). [V]
- `$OC models` = flat 116-line list across 4 providers (`opencode` 46, `opencode-go` 32, Alibaba plans 19 each); no cost/context metadata. [V]
- Metadata for scripts:
  ```bash
  $OC api GET /api/model | jq -r '.data[] | select(.cost[0].input==0 and .cost[0].output==0)
    | [.providerID,.modelID,.limit.context,.limit.output,.capabilities.tools] | @tsv'
  $OC api GET /api/provider | jq -r '.data[] | [.id,.activation] | @tsv'
  ```
  - Providers: `opencode`=enabled, `opencode-go`=enabled, both Alibaba plans=`auto`. No OpenRouter/other provider configured, so no `:free` OpenRouter models are available here. [V]
  - Alibaba plans also report **zero per-token cost** for 19 IDs each (plan quota, not free tier): `deepseek-v4-flash-0731`, `deepseek-v4-pro`, `deepseek-v4-pro-0813`, `deepseek-v4.1-flash`, `deepseek-v4.1-flash-1017`, `glm-5`, `glm-5.1`, `glm-5.2`, `glm-5.3`, `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`, `MiniMax-M2.5`, `qwen3.6-flash`, `qwen3.6-plus`, `qwen3.7-max`, `qwen3.7-plus`, `qwen3.8-flash`, `qwen3.8-max`; ctx 196,608-1,000,000. PONG tested OK on `deepseek-v4.1-flash` and `qwen3.8-flash`; no full coding smoke. [V]
- `opencode-go/*-free` still requires the Go subscription; Console `opencode/*-free` are the free tier usable with zero balance. `big-pickle` is also zero-cost despite no `-free` name. Alibaba models show zero per-token cost because the account is on a token plan; quota is plan-level. [V/INFERRED]

### Zero-cost models (from `/api/model`)
| model id | ctx | max out | smoke test (free tier) | wall |
|---|---:|---:|---|---:|
| `opencode/minimax-m3.1-flash-free` | 1,000,000 | 512,000 | PASS: 30 pytest cases, DP word-break + README | 79.0 s |
| `opencode/longcat-2.5-free` | 1,000,000 | 262,144 | PASS: 5 unittest + 2000 random vs brute force | 70.8 s |
| `opencode/beam-free` | 1,048,576 | 131,072 | PASS: 10 tests + random property checks | 15.2 s |
| `opencode/big-pickle` | 200,000 | 32,000 | PASS: 14 tests + doctests | 30.3 s |
| `opencode/deepseek-v4.1-flash-free` | 200,000 | 32,000 | not tested | - |
| `opencode/glm-5.3-flash-free` | 200,000 | 32,000 | not tested | - |
| `opencode/mimo-v2.6-flash-free` | 200,000 | 32,000 | not tested | - |
| `opencode/iceman-free` | 262,144 | 131,072 | not tested | - |
| `opencode/flint-40b-free` | 262,144 | 65,536 | not tested | - |
| `opencode/nemotron-3.5-lightning-free` | 262,144 | 262,144 | not tested | - |
| `opencode/inkling-2-small-free` | 1,048,576 | 131,072 | not tested | - |
| `opencode/nemotron-3.5-super-vl-free` | 1,048,576 | 131,072 | not tested | - |
| `opencode-go/beam-free` | 1,048,576 | 131,072 | PONG + subagent child OK | ~2 s |
| `opencode-go/longcat-2.5-free` | 1,000,000 | 262,144 | not tested | - |
| `opencode-go/iceman-contributor-free` | 262,144 | 131,072 | not tested | - |

- Full smoke prompt: `create a small python module with a non-trivial function plus a unit test, run the test, fix until green, reply DONE with a summary`; each ran 300 s cap, `--auto --archived --format json`. All four final pytest runs green (30/5/10/14 tests); all reported `cost:0`; all tool calls completed; no malformed tool calls. [V]
- Token totals (in/out/reasoning, summed from `step_finish`): minimax 21,678/5,292/6,108; longcat 11,649/1,453/2,382; beam 22,699/1,610/516; big-pickle 10,854/2,053/968. [V]
- Free-tier quota is **not reliably unlimited**: one run and two subagent children returned `provider.free-limit` (HTTP 429, "Free usage limit reached", `retryAfterMs:85810000` ~23.8 h); immediate/next-minute direct calls to the same model succeeded. Treat as retryable + provider fallback. [V]
- Concurrency: 3 concurrent real `minimax-m3.1-flash-free` sessions all succeeded, wall 211 s / 56 s / 39 s; no 429 in those. 5 concurrent PONGs all succeeded (~2.5-3.8 s). One of three full sessions slowed 2.7x vs solo (agent variability/contention). [V]

## 3. Sessions / transcripts
- Storage is **SQLite only** at `$OC debug paths db` = `/home/slava/.local/share/opencode/opencode.db`; no per-session JSON files. Tables: `session_v2`, `session_message` (full message JSON in `data`), `session_part` (0 rows in probe), `project`, `permission`, `event` (0 rows). [V]
- Inspect: `sqlite3 "$($OC debug paths db)" 'select id,title,model,directory from session_v2 order by time_updated desc limit 5;'` [V]
- Export JSON shape: `{info:{id,model,cost,tokens,outcome,time,title,location},messages:[...]}`. Assistant `content[]` parts are `text`, `reasoning`, `tool`; tool state has `input/output/metadata/status`. [V]
  ```bash
  $OC session export ses_ID > s.json          # --sanitize redacts transcript/file data
  $OC session import s.json --directory DIR   # re-import; existing ID => "Session already exists" exit 0
  ```
- Resume / fork / continue (verified end-to-end with a secret-word recall):
  ```bash
  $OC run --auto -s ses_ID -m MODEL "follow-up"        # same session id, history kept
  $OC run --auto -s ses_ID --fork -m MODEL "question"  # new session id, history copied
  $OC run --auto -c -m MODEL "follow-up"               # last non-archived session in this project
  $OC run --auto -s ses_new_123 -m MODEL "hi"          # creates that id if absent
  ```
- Sessions are project-scoped (cwd/git root); `session list -n N --format json` only shows current project and omits archived. [V]
- Manual compaction (non-interactive):
  ```bash
  $OC api POST /api/session/ses_ID/compact -d '{}'
  ```
  Returns admission; later export shows `type:"compaction", status:"completed", reason:"manual", summary:"## Objective..."`. Automatic compaction default on; config `{"compaction":{"auto":true,"keep":{"tokens":15000}}}`. [V/D]
- Auto-compaction event namespace is `session.compaction.*` (docs); manual API does not wait for summary. [D]

## 4. Agents / tool restriction / subagents
- Discovery verified: `.opencode/agents/<name>.md` (V2) **and** legacy `.opencode/agent/<name>.md` both load; `~/.config/opencode/agents/*.md` is global. JSON keys `agents` (V2) and `agent` (legacy) both load; `default_agent` works. `$OC debug agents` lists IDs/mode/permissions/system/model. [V]
- Markdown frontmatter fields verified: `description`, `mode: primary|subagent|all`, `model: provider/model#variant`, `permissions` list; body becomes `system`. Newly written agent files can be invisible to the running service for a moment (`Agent not found` on first run); retry or `$OC reload` picks them up. [V]
  ```md
  ---
  description: read-only reviewer
  mode: subagent
  model: opencode/longcat-2.5-free
  permissions:
    - {action: edit, resource: "*", effect: deny}
    - {action: shell, resource: "*", effect: deny}
  ---
  Review changes; report findings only.
  ```
- Tool restriction works: `edit`/`shell` deny removes those tools from the agent (model saw `Unknown tool 'write'/'shell'`); `--auto` cannot override deny. Permission actions include `shell`, `edit`, `read`, `glob`, `grep`, `webfetch`, `websearch`, `subagent`, `skill`, `question`; last matching rule wins. [V/D]
- Custom system prompt verified: agent body `The secret code is 7734...` answered `7734`. Agent-configured model was honored (no `-m`, paid default avoided). [V]
- `--agent <id>` selects agent; unknown id -> `{"type":"error","error":{"type":"unknown","message":"Agent not found: \"...\""}}`, exit 1. [V]
- Subagents: built-in `general`/`explore`; custom `mode: subagent`; parent calls `subagent` tool; parent `permissions` action `subagent` controls allow/deny; child has fresh context/own model. Verified `boss2 -> echoer2` returned `GOC_OK` with `opencode-go/beam-free`; same child on a Console free model failed with 429. [V]
- `$OC debug config` lists merged config sources; `$OC debug paths` lists data/config/cache/state/db. [V]

## 5. Machine-readable final output (most reliable)
1. Simplest: `$OC run --auto --archived -m MODEL "prompt"` -> stdout is **only final assistant text**. [V]
2. Need session id/events: `--format json`, then:
   ```bash
   $OC run --auto --archived --format json -m MODEL "prompt" > ev.jsonl
   sid=$(jq -r 'select(.type=="step_start")|.sessionID' ev.jsonl | head -1)
   jq -r 'select(.type=="text")|.part.text' ev.jsonl | tail -1        # final text
   jq -sr '[.[]|select(.type=="text")]|group_by(.part.messageID)|last|map(.part.text)|join("\n")' ev.jsonl
   ```
3. Full transcript: `$OC session export "$sid" | jq -r '[.messages[]|select(.type=="assistant")]|last|.content|map(select(.type=="text")|.text)|join("\n")'`. Reasoning parts are separate; filter `type=="text"`. [V]
4. API: `POST /api/session/{id}/prompt` with `{"text":"..."}`; poll `GET /api/session/{id}` (`outcome/time.idle`) or `POST /api/experimental/session/{id}/wait` (204 when idle; 0.65 s observed). `GET /api/session/{id}/message` returns messages; select assistant `content[].type=="text"`. [V]
- **No JSON-schema structured output in 2.2.7**: CLI has no schema flag; prompt API body has only `text/files/agents/skills/metadata/delivery/resume`. `@opencode-ai/sdk/v2` docs advertise `format:{type:"json_schema"}` on `session.prompt`, but server 2.2.7 has no `POST /api/session/{id}/message` (404) and `structured` was never returned. Parse JSON from the final text instead. [V; SDK claim D]

## 6. Serve / ACP / SDK
- Private server:
  ```bash
  $OC serve --hostname 127.0.0.1 --port 4097       # prints "server password ..."
  OPENCODE_PASSWORD=<pw> $OC --server http://127.0.0.1:4097 api GET /api/info
  curl -u "opencode:<pw>" http://127.0.0.1:4097/openapi.json   # full 445 KB OpenAPI 3.1 spec
  ```
  Basic auth user is `opencode`, password printed at startup. Verified routes: `/api/info`, `/api/model`, `/api/provider`, `/api/session`, `/api/session/{id}/prompt`, `/api/session/{id}/message` (GET only), `/api/event` SSE, `/api/experimental/session/{id}/wait`. [V]
- `$OC api` talks to the shared background service and accepts path+method or operation IDs (`$OC api session.prompt ...`); it handles service auth. [V]
- `$OC acp`: newline-delimited JSON-RPC over stdio; initialize response: protocolVersion 1, loadSession, prompt embeddedContext/image, session close/delete/fork/list/resume, steering; starts a private server and no network port. Keep stdin open (closing it exits immediately). [V]
- SDK: installed `@opencode-ai/sdk@1.19.5` exports `/v2`, but its health call got 404/text-html and session.create got 400 against 2.2.7. Do not build the orchestrator on this SDK version; use `opencode api`, direct HTTP, or ACP. [V]

## 7. Ranked recommendations (all free tier, cost 0)
1. **Cheap implementer:** #1 `opencode/longcat-2.5-free` (1M ctx, 71 s, rigorous randomized verification); #2 `opencode/minimax-m3.1-flash-free` (harder tasks, more thorough, 79 s); #3 `opencode/beam-free` (15 s; best for tiny/mechanical changes). [V smoke; ranking INFERRED]
2. **Cheap reviewer:** #1 `opencode/beam-free` (1M ctx, fastest, read-only review); #2 `opencode/longcat-2.5-free` (stronger verification behavior); #3 `opencode/big-pickle` (200k ctx, 30 s). Use a different model than the implementer. [V smoke; ranking INFERRED]
3. **Strongest free planner:** `opencode/minimax-m3.1-flash-free#high` (1M ctx, 512k output, 5 reasoning variants, most thorough smoke); fallback `opencode/longcat-2.5-free`, then `opencode/beam-free#high`. [V smoke; ranking INFERRED]
- Reliability caveat: free tier intermittently returns 429 `provider.free-limit` (~23.8 h retryAfter) even when later calls work. Add retry/backoff and fall back to `opencode-go/*` (Go subscription) or `alibaba-token-plan/*` (plan quota) for production orchestration. [V]

# omp CLI probe (v18.20.0)

Tags: `[V]` ran/read locally; `[D]` help/docs only. Scratch repo `/tmp/omp-probe-20261112-191037`. All calls used free `opencode-go/beam-free`; no global config/auth changed (isolation test used `PI_CODING_AGENT_DIR` + `omp auth export|import` copy).

## 0. Binary
- `/home/slava/.bun/bin/omp`, `omp/18.20.0`. `omp --help` (269 lines), `omp models --json`, `omp://` internal docs (`rpc.md`, `session.md`, `compaction.md`, `settings.md`, `approval-mode.md`, `sdk.md`, `session-operations-...md`). [V]

## 1. Non-interactive modes
Print/one-shot:
```bash
omp -p --mode text|json --model opencode-go/beam-free --cwd DIR \
    --session-dir DIR/sessions --config overlay.yml --tools=read,bash --no-lsp "PROMPT"
```
- `--mode text`: stdout = final assistant text only; banner `Working...` on stderr. [V]
- `--mode json`: NDJSON event stream, one object/line: `session` (header: id,cwd), `thinking_level_changed`, `agent_start`, `turn_start`, `message_start|message_update|message_end`, `tool_execution_start|end`, `turn_end`, `agent_end`. No aggregate result line. Final text + usage = last `message_end` with `message.role=="assistant"`; `yield` data = `tool_execution_end.result.details.data`. [V]
- Exit: 0 ok; 1 provider/model error (429 observed) or `--max-time` deadline (stderr `Deadline exceeded`, no stdout); 137 SIGKILL; 3 `--max-cost` [D]. [V]

RPC (`--no-ui` is legal only with rpc):
```bash
omp --mode rpc --model M --cwd D --session-dir D/sessions --tools= --no-lsp --config overlay.yml
```
- JSONL stdin/stdout, not JSON-RPC 2.0. Ready frame:
  `{"type":"ready","protocolVersion":1,"supportedProtocolVersions":[1,2],"maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864,"supportsBashExcludeFromContext":true}` [V]
- Commands carry optional `id`; responses echo it. Prompt:
  `{"id":"p1","type":"prompt","message":"..."}` -> ack `{"id":"p1","type":"response","command":"prompt","success":true}`
  completion (separate frame): `{"type":"prompt_result","id":"p1","agentInvoked":true,"status":"completed","sessionSettled":true}`
  `status` = `completed|aborted|error`; error adds `{message,provider,model,httpStatus,retryable,code}` (`code:"cost_cap"`). [V]
- Quiescence: `{"type":"session_settled"}` after prompt_result when background work exists; `prompt_result.sessionSettled:false` says one is still coming. [V/D]
- Final text: `{"id":"t","type":"get_last_assistant_text"}` -> `{"data":{"text":"ONE"}}` (`data:{}` if none). [V]
- Abort: `{"id":"a","type":"abort"}` -> `{"success":true}`; that prompt's `prompt_result` becomes `status:"aborted"`; assistant `stopReason:"aborted"`,`errorMessage:"Interrupted by user"`; `agent_end` `{isTerminal:true,yielded:true}`. [V]
- Other verified commands: `get_state`, `get_messages` (`data.messages[]`), `get_session_stats`, `compact`, `fork`, `new_session`, `open_session`, `set_model`, `set_thinking_level`, `bash`. [V/D]
- MUST keep stdin open until `prompt_result`; closing stdin drains accepted commands, disposes the session, exits 0 (turn dropped). [V]

## 2. Sessions
- Default: `~/.omp/agent/sessions/<encoded-cwd>/<timestamp>_<sessionId>.jsonl` (observed `-tmp-omp-probe-.../2026-11-13T00-15-34-116Z_01a1d242-....jsonl`). Encoding: `-<rel>` under home, `-tmp-<rel>` under tmp, `--<abs>--` else. [V/D]
- Pin dir `--session-dir DIR`; exact file `--session PATH` (hidden flag; appended, not forked) [V]; ephemeral `--no-session`.
- Resume id or path: `--resume <sessionId|prefix>` / `--resume /abs/x.jsonl` [V]; `--continue` newest [D]; `--fork <id|path>` creates a new session (rejected with `--no-session`) [V].
- 2-turn resume verified: same sessionId, turn 2 answered `ALPHA`, cacheRead=1728. [V]
- Format: 256-byte `title` slot line, then `{"type":"session","version":3,"id","timestamp","cwd"}`, then entries. Observed entry types: `message` (role camelCase), `model_change`, `thinking_level_change`, `model_usage`, `compaction`, `custom` (`session_exit`, `date-cwd-reminder`, `system-prompt-digest`), `title`. [V]
- RPC fork: `{"id":"f","type":"fork"}` -> `data:{"cancelled":false}`; `get_state` then shows new `sessionFile`/`sessionId`; header `parentSession` = old id. `fork` with `entryId` truncates root->entry. [V/D]
- RPC `open_session {"sessionDir":D}` -> `{"cancelled":false,"resumed":false,"sessionId","sessionFile"}` (adopt thread; resumed:true if existing); `new_session` -> `{"cancelled":false}` + new id. [V]
- Compact programmatically (no CLI flag): `{"id":"c","type":"compact","customInstructions"?}` -> `data:{summary,shortSummary,firstKeptEntryId,tokensBefore,details{readFiles,modifiedFiles}}`; events `manual_compaction_start`/`manual_compaction_end`; session entry `{"type":"compaction",summary,firstKeptEntryId,tokensBefore,tokensAfter,method}` (`tokensAfter` only in the entry). [V]
- Small sessions fail `success:false,error:"Nothing to compact (session too small)"` until history > `compaction.keepRecentTokens`; force in tests with overlay `compaction:{keepRecentTokens:1,reserveTokens:1,methodOrder:[soft]}`. [V]
- Auto-compaction did NOT fire under RPC after 4 attempts with lowered `thresholdTokens`/`thresholdPercent`; use RPC `compact` (or `/compact` prompt). One writer per session file (lease moves a contested session to a sibling). [V-negative/D]

## 3. Model selection
- List: `omp models [--json] [find SUBSTR|PROVIDER] [--kind all]`. JSON: `{"models":[{provider,id,selector,name,contextWindow,maxTokens,reasoning,thinking:[efforts],input,cost{input,output,cacheRead,cacheWrite},pricingStatus}]}`. [V]
- Select: `--model provider/model-id[:effort]` (exact with provider; fuzzy without); `--thinking off|minimal|low|medium|high|xhigh|max|auto`; `--model @role` reads `modelRoles` incl. `--config` overlay (verified `@probe` -> beam-free:high). [V]
- Effort suffix verified `:high` (get_state.thinkingLevel=high); `:max` only on models whose `thinking` lists it. [V/D]
- Opus-class ids (list only): `anthropic/claude-opus-4-5`, `-4-6`, `-4-7`, `-4-8`, `claude-opus-5`, `claude-opus-5-5` ($4-5/$20-25 per M); `claude-fable-5*`, `claude-mythos-5*` ($8-10/$40-50). Sonnet-class: `anthropic/claude-sonnet-4-5`, `-4-6`, `claude-sonnet-5`, `claude-sonnet-5-5` ($2-3/$10-15). Cheap Claude: `claude-haiku-4-5` ($1/$5), `claude-haiku-5-5` ($0.1/$0.5). [V]
- OpenCode Go (`opencode-go/`): `deepseek-v4.1-flash` ($0.15/$0.6), `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `deepseek-v4-pro` ($0.66/$1.98), `muse-spark-1.3-contributor` ($0.1/$0.2), `beam-free` ($0); other free ids: `longcat-2.5-free`, `minimax-m3.1-flash-free`, `space-bunny-free`, `step-5-preview-free`, `ox-alpha-free`. [V]
- OpenCode free models ARE reachable through omp (`opencode-zen/*-free`, `opencode-go/*-free`) but share an account free quota: `opencode-zen/glm-5.3-flash-free` -> 429 FreeUsageLimitError, retry-after ~24h; `opencode-go/beam-free` worked. [V]

## 4. Usage accounting
- Per assistant message (RPC `message_end.message` / `turn_end.message`, print NDJSON, JSONL `message` entries):
  `usage:{input,output,cacheRead,cacheWrite,totalTokens,reasoningTokens?,cost:{input,output,cacheRead,cacheWrite,total}}` [V: cacheRead=1728; cacheWrite present, 0 observed]
- Aggregate RPC `get_session_stats.data`:
  `{sessionId,sessionFile,userMessages,assistantMessages,toolCalls,toolResults,totalMessages,tokens:{input,output,reasoning,cacheRead,cacheWrite,total},cost:<USD number>,premiumRequests,contextUsage:{tokens,contextWindow,percent}}` [V]
- Context size only via `get_state.contextUsage` (`{tokens,contextWindow,percent}`). [V]
- Hidden auxiliary calls persist as session entries `{"type":"model_usage",purpose,role,provider,model,usage,stopReason}`; observed `auto-thinking` + `unexpected-stop` on free judge `opencode-zen/jev-1.13-free`. Suppressed with `defaultThinkingLevel: low` + `features.unexpectedStopDetection: off` (0 entries in test). [V]
- `cost` is catalog-priced; beam-free = 0. Print `--mode json` has no aggregate; sum `message_end.usage`. [V]

## 5. Structured output
- Native tool `yield`, hidden/opt-in: `--tools=yield`. Model calls `{data:<object>}`; script reads `tool_execution_end.result.details.data` (`status:"success"|"error"`); turn ends after yield, no final text. CLI has NO schema flag; tool schema says "(no schema specified)" so validation is prompt-side only. [V]
- Reliability on beam-free: 4/4 single `yield` with exact requested JSON (`{verdict,score}`). [V]
- Real enforcement is SDK/task only: `outputSchema`, `outputSchemaMode: permissive|strict`, `requireYieldTool` (SDK); task child `{schema,schemaMode}`. [D/binary strings]
- Script fallback: require JSON-only text and parse last assistant text; no Ajv in harness. [V]

## 6. Tool / permission / prompt control
- Built-in allowlist: `--tools=read,bash` mounts only those; `--tools=` none; `--no-tools` none. Extension/MCP tools ignore this: MCP tools mounted even with `--no-tools`. `--no-lsp` disables LSP. [V]
- Ambient discovery off per launch via `--config` overlay `disabledProviders: [native,claude,codex,gemini,opencode,cursor,agents-md]` -> MCP/context/skills gone; global plugins still load (`antigravity_acp_permission` observed; plugin name in `disabledExtensions` did not remove it). [V]
- Approval: `--approval-mode always-ask|always-ask-cached|write|yolo`, `--auto-approve` (=yolo); headless prompt-required calls fail closed. `tools.approval.<tool>: allow|deny|prompt`. [V/D]
- Workdir `--cwd DIR`; extra roots `--add-dir DIR`. [V]
- System prompt: `--system-prompt <text-or-file>` (single-line value read as file when it exists; replaces default instruction block), `--system-prompt-template <path>` (Handlebars), `--append-system-prompt <text-or-file>` (adds to default). File tokens echoed by model. Project `<cwd>/.omp/SYSTEM.md` / `APPEND_SYSTEM.md` discovered. [V/D]
- Memory/auto-learn off: overlay `memory:{backend:off}`, `autolearn:{enabled:false}`, `skills:{enabled:false}`, `tools:{xdev:false}`, `compaction:{experimentalContextManagement:false}` -> tool set exactly the `--tools` list, no `learn`/`recall`. `learn` appeared without this. [V]
- Profile isolation: `PI_CODING_AGENT_DIR=/tmp/x` + `omp auth export|import` (creds are profile-local; import required) gives own config/sessions; global plugin tools still load (`antigravity_acp_permission` observed). [V]

## 7. Prompt-cache TTL
- Setting `providers.cacheRetention`: enum `auto|short|long|none`, default `auto` (Anthropic OAuth 1h / API key 5m provider defaults). [V binary schema]
- Per launch: env `PI_CACHE_RETENTION=long` (read in code) or `--config` overlay `providers:{cacheRetention:long}`; no CLI flag. [V/D]
- `--prompt-cache-key <key>` pins provider cache identity; `--provider-session-id` pins routing/session headers; `--fork` inherits the cache key unless explicit `--model/--thinking/--tools/--system-prompt/...` overrides. [D]

## 8. Fallback, timeouts, failure detection
- `retry.{enabled,maxRetries,baseDelayMs,maxDelayMs,modelFallback,fallbackOn:any|usage-limit|except-usage-limit,fallbackChains,fallbackRevertPolicy}`; chain keys role | `provider/model` | `provider/*`; set per launch via `--config`. [V keys; D semantics]
- Verified fallback: `opencode-zen/glm-5.3-flash-free` 429 -> `{"type":"retry_fallback_applied","from":"opencode-zen/glm-5.3-flash-free:low","to":"opencode-go/beam-free","role":"opencode-zen/glm-5.3-flash-free","reason":"Request failed: 429 ..."}` then `{"type":"retry_fallback_succeeded","model":"opencode-go/beam-free:high",...}`; prompt completed. [V]
- Timeouts: `--max-time 10m` -> print exit 1 + stderr `Deadline exceeded`; RPC aborts the turn (`prompt_result.status="aborted"`) but keeps serving. `--max-cost USD` -> stop sending; print exit 3, RPC `prompt_result.error.code="cost_cap"` [D]. Provider stream timeouts: `providers.streamIdleTimeoutSeconds`, `providers.streamFirstEventTimeoutSeconds` (default -1). [V/D]
- Detect bad runs: RPC wait `prompt_result` (status completed|aborted|error); process death = stdout EOF before it + exit code (SIGKILL 137). Print: exit code + presence of terminal `agent_end` (`stopReason:"error"|"aborted"`). Session file: last `custom` `session_exit` `{reason,kind:normal|signal|fatal|process_exit,pendingToolCalls?}`; none after last message = unclean exit. `--restore` replays an interrupted turn (interactive only). [V/D]

## 9. ACP
- `acpx` NOT on PATH; `bunx acpx --version` = 0.22.0 (fetched on demand); raw agent via `--agent "<command>"`. [V]
- `omp acp` = ACP server over stdio; `opencode acp` = ACP server too (opencode 2.2.7). [V]

## Verified minimal script (Bun/TS; ran this exact block, `bun snippet.ts`)
```ts
const D=`/tmp/omp-ts-${Date.now()}`, SESS=`${D}/sessions`; await Bun.$`mkdir -p ${SESS}`;
await Bun.write(`${D}/o.yml`,`memory: {backend: off}
autolearn: {enabled: false}
skills: {enabled: false}
defaultThinkingLevel: low
features: {unexpectedStopDetection: off}
tools: {approvalMode: yolo, xdev: false}
compaction: {experimentalContextManagement: false, keepRecentTokens: 1, reserveTokens: 1, methodOrder: [soft]}
disabledProviders: [native, claude, codex, gemini, opencode, cursor, agents-md]
`);
async function run(extra:string[], steps:any[]){
 const p=Bun.spawn(["omp","--mode","rpc","--model","opencode-go/beam-free","--no-ui","--no-lsp",
  "--session-dir",SESS,"--config",`${D}/o.yml`,"--tools=",...extra],{cwd:D,stdin:"pipe",stdout:"pipe",stderr:"pipe"});
 const pend=new Map<string,any[]>(), out:any={}; let buf="";
 const rd=(async()=>{const r=p.stdout.getReader(),d=new TextDecoder();
  for(;;){const {value,done}=await r.read(); if(done)break; buf+=d.decode(value,{stream:true});
   let i; while((i=buf.indexOf("\n"))>=0){const l=buf.slice(0,i).trim(); buf=buf.slice(i+1); if(!l)continue;
    const m=JSON.parse(l); if(m.id&&(m.type==="response"||m.type==="prompt_result")) pend.set(m.id,[...(pend.get(m.id)??[]),m]);}}})();
 const wait=async(id:string,pr:boolean)=>{for(const end=Date.now()+180e3;Date.now()<end;await Bun.sleep(25))
   for(const m of pend.get(id)??[]) if(pr?m.type==="prompt_result":m.type==="response"&&m.command!=="prompt") return m;
   return {error:"timeout"};};
 for(const s of steps){p.stdin.write(JSON.stringify(s)+"\n"); await p.stdin.flush(); out[s.id]=await wait(s.id,s.type==="prompt");}
 p.stdin.end(); out.exit=await p.exited; await rd; return out;
}
const r1=await run([], [
  {id:"p1",type:"prompt",message:"Remember the secret word ALPHA. Reply with exactly: ONE"},
  {id:"t1",type:"get_last_assistant_text"}, {id:"u1",type:"get_session_stats"}]);
const sid=r1.u1.data.sessionId;
console.log("turn1",r1.p1.status,r1.t1.data.text,r1.u1.data.tokens,"cost",r1.u1.data.cost);
const r2=await run(["--resume",sid], [
  {id:"p2",type:"prompt",message:"What was the secret word? Reply with the word only."},
  {id:"t2",type:"get_last_assistant_text"}, {id:"c1",type:"compact"}, {id:"u2",type:"get_session_stats"}]);
console.log("turn2",r2.p2.status,r2.t2.data.text,"compact",r2.c1.success,r2.c1.data?.tokensBefore,"exits",r1.exit,r2.exit);
```
Observed (this exact snippet): `turn1 completed ONE {input:45,output:28,reasoning:20,cacheRead:1728,cacheWrite:0,total:1801} cost 0` / `turn2 completed ALPHA compact true (tokensBefore 1869) exits 0 0`. A Python twin was also verified end-to-end.

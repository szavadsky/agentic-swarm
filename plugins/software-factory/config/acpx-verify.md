# Acpx harness behaviour, verified by probe

Adapter details the acpx layer depends on, recorded once and kept out of
source comments so the code carries no real harness names. Probe date
2026-11-13; see `bootstrap/context/acpx-probe.md` §4–§5 and
`bootstrap/context/compaction-probe.md` §0.

- Usage totals: pi's prompt result carries no usage, so its configured
  `/session` slash command is the only source. The reply is human text
  (`Tokens: in 2403, out 87, cache read 1216, cache write 0, total 3706`),
  session-cumulative; output already includes reasoning, so it stays in
  `out` and `reasoningOut` stays zero. The command reuses the session and
  never spends a model turn.
- Compaction: `/compact` is an adapter command, not a model prompt,
  verified on pi, codex, opencode and claude-code. agy forwards the text
  to the model and compacts nothing, so `compact: true` is refused there.
  A small pi session answers `{"code":-32603,"message":"Internal error",
  "data":{"details":"pi compact failed: Nothing to compact …"}}`, exit 1;
  a larger one succeeds with `stopReason: "end_turn"`.
- Thought counting: codex and agy count thought inside output; opencode
  counts it on top and reports `totalTokens` = input + output + reasoning
  + cache read/write. That total is the only field separating the two
  shapes; without it the codex/agy shape is assumed, so misreading moves
  tokens between `out` and `reasoningOut`.
- Cost: ACP `usage_update.cost` is the session-cumulative USD figure
  (opencode reads it from `session.get().cost`), not the turn's spend.
  Only `USD` entries are dollar amounts.

Each new harness joins this list by probing behaviour, never by name
matching in code; the run config declares `compact`, `usage.command`,
`usage.fields` and effort splits per entry.

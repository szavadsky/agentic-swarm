changes

# DOC1R — review of `docs/ideology.md`

## Findings, by damage

**F1 · ideology.md:23 — invented mechanism, presented as sourced.** "A mid-iteration consult repeats that context for one decision (manifesto.md:19)". `manifesto.md:19` says only that a mid-iteration consult is "the exception: measured, and optimized during bootstrapping" and that a landed spike does not end the iteration; it says nothing about repeating context. The cost claim is invented. *Satisfies:* drop the clause, or restate the cost on what is documented (`manifesto.advice.md:294` — the compaction topic is "worth about half a dollar per architect consult") and cite `manifesto.md:26` for the batching rule.

**F2 · ideology.md:21 — overstates Intent into a contradiction.** "the architect is consulted at its boundary, not during it (manifesto.md:17)". Intent names the mid-iteration consult as a measured exception still being optimized (`manifesto.md:19`); `:26` batches consults to the boundary but does not forbid mid-iteration consults. The cited `:17` says neither. *Satisfies:* write "consults are batched to the iteration boundary; a mid-iteration consult is the measured exception", cite `:19` and `:26`, and stop treating "not during it" as flat prohibition (it recurs as a Forbid at `:27`).

**F3 · ideology.md:121 — mechanism Intent does not name, cited to lines that lack it.** "branches on capabilities rather than harness names (manifesto.md:84; manifesto.md:116)". `:84` is ACP-compatible harnesses with opaque launch config; `:116` is acpx plus preferring native structured output. Neither states the capability rule. *Satisfies:* cite `manifesto.advice.md:145` ("Flows branch on `Caps`, never on harness id"), `bootstrap/KERNEL0.md:74`, or `manifesto.md:39` ("It does not drive every harness directly and uniformly").

**F4 · ideology.md:15 — cited line names the status, not the mechanism.** "A review that finds scope growth returns `upscope` (bootstrap/KERNEL0.md:52)". `KERNEL0.md:52` is the status union `'done' | 'blocked' | 'failed' | 'upscope'`; it does not say a review returns it. *Satisfies:* cite `manifesto.md:13` (review auto-escalates) and `manifesto.advice.md:195` ("upscope (task path only: scope exceeds the defined task)").

**F5 · ideology.md:13 — the incident does not show the failure it is attached to.** "The failure is silent under-scoping: in v2 a fixed plan cap turned ordinary size into formal rejection … (repo-map.md:109)". `repo-map.md:109` records v2's hard-cap formal reject — a fixed cap rejecting ordinary work, the opposite of under-scoping. It supports the Forbids line at `:17`, not the claim above it. *Satisfies:* move the incident to `:17`, or name the failure it actually shows.

**F6 · ideology.md:41 — third clause not in the cited line.** "every handoff has to rebuild what the previous one knew (manifesto.md:29)". `:29` is "Same context: same agent. Different context: different agent." *Satisfies:* cite `:30` ("Not portable → de novo, with the context pack and links to artifacts") for the rebuild cost, or drop the clause.

**F7 · ideology.md:61 — the kernel's formulation presented as Intent.** "Execution state is a pure function of task files and append-only records … (manifesto.md:33)". `:33` asks for status aggregated idempotently from structured outputs / YAML artifacts; "pure function of task files and append-only records" is the kernel's wording (`KERNEL0.md:104`, `manifesto.advice.md:188`). The document draws that distinction itself at `:65`, so the Principle line contradicts its own "In the system" line. *Satisfies:* cite `KERNEL0.md:104` there, or reword to "aggregated idempotently from artifacts".

**F8 · ideology.md:71 — the forwarding criterion is at `:44`, not in 42-43.** "each stage forwards only what is different from or additive to the plan (manifesto.md:42-43)". *Satisfies:* cite `manifesto.md:42-44`.

**F9 · ideology.md:65 — "a summary, not the state" is not in `:38`.** `:38` says the subarchitect owns the status summary of his iteration; the contrast with the state is `:33`. *Satisfies:* cite both.

**F10 · ideology.md:143 — attribution of v2's behaviour.** "so v2's budgets bounded the nests rather than the item (manifesto.md:99)". `:99` states the rule ("Budget the whole item, not each nest"), not what v2 did. *Satisfies:* cite `manifesto.advice.md:325` ("v2's six counters of ~3") or `repo-map.md:106` ("10 bound rows, several detectors marked empty/unused/unenforced").

**F11 · ideology.md:51 — paraphrase narrows Intent.** "one markdown plan written for a human or reviewer". `manifesto.md:22` says the plan is "written for architect/reviewer friendliness and efficiency"; the architect is not a human. *Satisfies:* "written for the architect and reviewer".

**F12 · ideology.md — citation targets outside DOC1's set.** Three references point at `bootstrap/KERNEL0.md` (`:52`, `:65`, `:104`); DOC1's style rule allows only `manifesto.md`, `manifesto.advice.md` and `bootstrap/context/*.md`. Not damaging — KERNEL0 is where the named kernel mechanisms live — but the exception should be stated rather than assumed. *Satisfies:* keep them and say so, or move the facts into `bootstrap/context/`.

## Reference table

Checked **117** reference occurrences on 48 lines of `docs/ideology.md`; every cited line was opened and read against the claim it carries. **ok 107 · failed 10** (all "does not say that" for the claim as written; every reference resolves to an existing line — none points past the end of a file).

| doc line | reference | verdict | correct line / missing source |
|---|---|---|---|
| 15 | `bootstrap/KERNEL0.md:52` | does not say that | `manifesto.md:13`; `manifesto.advice.md:195` |
| 21 | `manifesto.md:17` | does not say that (2nd clause) | `manifesto.md:19`, `:26` |
| 23 | `manifesto.md:19` | does not say that | `manifesto.md:26`; `manifesto.advice.md:294` |
| 41 | `manifesto.md:29` | does not say that (3rd clause) | `manifesto.md:30` |
| 51 | `manifesto.md:22` | does not say that (paraphrase) | `manifesto.md:22` "architect/reviewer" |
| 61 | `manifesto.md:33` | does not say that (1st clause) | `bootstrap/KERNEL0.md:104`; `manifesto.advice.md:188` |
| 65 | `manifesto.md:38` | does not say that (2nd clause) | `manifesto.md:33` |
| 71 | `manifesto.md:42-43` | does not say that (2nd clause) | `manifesto.md:44` |
| 121 | `manifesto.md:84` + `:116` (joint citation, counted once) | does not say that (3rd clause) | `manifesto.advice.md:145`; `bootstrap/KERNEL0.md:74`; `manifesto.md:39` |
| 143 | `manifesto.md:99` | does not say that (attribution) | `manifesto.advice.md:325`; `bootstrap/context/repo-map.md:106` |

No "wrong line" case was found: every reference resolves, and the failures are claims the cited line does not carry.

## Coverage

All 13 topics DOC1 lists are present, one section each: ladder `:9`, iteration `:19`, economics `:29`, same context `:39`, plan/PM `:49`, derived state `:59`, funnel `:69`, uncertainty and spikes `:79`, stopping and debt `:89`, steering `:99`, flows as data `:109`, harness `:119`, clean code `:129`. All 13 sections carry all four parts (counted per heading: 13 × Principle/Why/In the system/Forbids). Length 149 lines (DOC1: 120–180). `rg -n "TODO|TBD" docs/ideology.md` → no output. The closing section has one evidence line for each of the five v2 traits DOC1 names. The glossary links `../manifesto.md#n19-glossary--decided`; the anchor matches `manifesto.md:206` (`### N19 Glossary — decided`) under GitHub's em-dash slug. No coverage gap found.

## Reader test

Three places where I would still not know what the factory will do:

1. **The merge path (absent).** Nothing says work is merged through a queue, that checks run on the merged result, or that a red gate parks the task. Every "In the system" paragraph stops at review, so the step between "approved" and "done" is invisible.
2. **Who resumes parked work (`:105`, `:115`).** Parking appears twice but its owner is never named — not the architect, not the next iteration, not the user.
3. **The operator's surface (`:115`).** The three config layers are described by role only; no file name, path, goal directory or command appears, so there is no way to start a launch, read the iteration summary or find the outbox.

Three sentences deletable without loss:

- `:53` "The economics reinforce it: one $2.86 Opus plan call cost more than the entire developer bill (manifesto.advice.md:20), so plan turns must produce readable direction, not file-format upkeep." — the $2.86 / $2.31 fact is already given at `:33`.
- `:73` "The filter is also a cost control: about 34 v2 wave reports consumed roughly 8.7M input tokens (manifesto.advice.md:21)." — the same census as `:23` and `:141`.
- `:97` "a budget hit treated as permission for one more dispatch" — restates `:95` "on a per-iteration budget hit the run drains — no new dispatch".

## Scope, method, next

- **Files changed:** `bootstrap/reports/DOC1R.md` (new, this report). Nothing else — DOC1R permits no other change. No shared file touched, so no merge coordination is needed.
- **Verified by:** reading `manifesto.md`, `manifesto.advice.md`, `bootstrap/KERNEL0.md` and `bootstrap/context/repo-map.md` whole; extracting every `file:line` reference mechanically (117 occurrences, 48 lines) and printing each cited line; counting the four labelled parts per section; `wc -l`; `rg -n "TODO|TBD"`. No code changed and nothing under `plugins/` was touched, so typecheck/tests were not run.
- **Deviations:** DOC1R caps this report at 80 lines, RULES.md caps reports at 40; the assignment-specific cap is used and nothing was dropped to fit it. DOC1's acceptance "nothing contradicts Intent" does not hold (F1, F2), hence `changes` rather than `approve`.
- **Next:** DOC1 owns `docs/ideology.md`; F1–F12 are one-line edits there, ten of them reference-only. Re-check with the same extraction — the pass criterion is 0 failed of 117.
- **Surprises:** the DOC1 report states every reference "says what is claimed"; 10 of 117 do not, and they fail in one pattern — the cited line carries the mechanism's vocabulary while the surrounding sentence carries the assertion. The largest omission is not a reference failure at all: the merge/gate path, which is where a new operator's first question begins.

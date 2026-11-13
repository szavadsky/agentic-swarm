# Ideology of the agentic software factory

The factory is an orchestration layer above coding harnesses, not another harness.
A harness gives one agent one context and the mechanics of turns; the factory decides which agent gets which context, when expensive attention is spent, what crosses a stage boundary, and when the goal is finished.
It adds planning, dispatch, review, steering and stopping around the harness.
It refuses to be a workflow engine with a schema for every step, or an ACK protocol that makes the user the bottleneck.
It refuses to be a process that mistakes ceremony for progress.

## The ladder decides size in two places

**Principle.** A cheap but capable agent classifies a goal as trivial, task or bigger and scopes a task, while only the architect decides how far above task "bigger" reaches (manifesto.md:11-13).

**Why.** The classifier is explicitly not smart enough to decide how big "bigger" is (manifesto.md:11), and a task review that finds the real scope larger auto-escalates rather than letting the mistake stand (manifesto.md:13). The failure is silent under-scoping: in v2 a fixed plan cap turned ordinary size into formal rejection when 52 items exceeded `maxItemsPerPlan: 50`, producing four `pm_amend_validation_failed` events (bootstrap/context/repo-map.md:109).

**In the system.** Trivial work is implemented by the same classifying agent, a task goes through implement and review without the architect, and bigger work reaches the architect (manifesto.md:11-13). A review that finds scope growth returns `upscope` (bootstrap/KERNEL0.md:52), and the same agent prepares the context pack for task or bigger work (manifesto.md:14).

**Forbids.** Letting a fixed size cap or the classifier decide architecture, and approving a task whose real scope has outgrown the definition it was reviewed against.

## The iteration bounds architect attention

**Principle.** An iteration is one architect engagement plus all the orchestration it launches; the architect is consulted at its boundary, not during it (manifesto.md:17).

**Why.** Architect attention was the largest single cost in the last v2 run: 81 launches, 21.7M input tokens and $5.22 of $11.01 (manifesto.md:103). The census showed most of it was ceremony — about 34 wave reports, 10 revisions and 4 close-ups against 5 plans (manifesto.advice.md:21) — and a sample 20-second wave report took 141,337 input tokens (bootstrap/context/repo-map.md:104). A mid-iteration consult repeats that context for one decision (manifesto.md:19).

**In the system.** Every consult starts with a completeness check — truly blocked or worth continuing, what is incomplete or must be redone — and sub-epics get their own (manifesto.md:18). Consults are batched until non-blocked tasks are exhausted (manifesto.md:26); the script dispatches until the DAG is exhausted or blocked, then derives status and builds the next brief (manifesto.advice.md:44). A landed spike does not end the iteration; dependents idle until the boundary (manifesto.md:19).

**Forbids.** Wave reports, close-ups, revision turns and plan-review cycles as separate architect launches (manifesto.md:103; manifesto.advice.md:21); ending an iteration because a spike landed; and reopening the architect for every small decision.

## Expensive models are rationed by the price ratio

**Principle.** Architect-tier models do only architect work, and every use is weighed against a price ratio of roughly 50x the cheap capable tier (manifesto.md:24).

**Why.** Architect-tier cost or subscription use is ~40–80x the cheap capable tier today, versus 2–3x for human architects, so the target is overall cost at ~50x rather than quota preservation (manifesto.md:24). The ratio changes the arithmetic: one $2.86 Opus plan call in the last run cost more than the entire developer bill of $2.31 (manifesto.advice.md:20).

**In the system.** The architect converts intent into plans, directional interfaces, key-algorithm direction and above-task tradeoffs, and writes no code beyond key interfaces (manifesto.md:22). A weaker model may review the plan as advisory input, not a veto; the architect may ignore, clarify or change the plan (manifesto.md:23). An expensive implementer tier is called by the architect only when a task fails or needs a non-trivial class or PoC (manifesto.md:25), and consults are batched to the iteration boundary (manifesto.md:26).

**Forbids.** Architect code writing beyond key interfaces, verbose documents, schema maintenance (manifesto.md:22), and routine use of expensive implementers.

## Same context, same agent

**Principle.** A job stays with one agent while its context is unchanged; a different context calls for a different agent, and every handoff has to rebuild what the previous one knew (manifesto.md:29).

**Why.** Every handoff re-establishes context, and v2's context volume was large: the modernize run generated 36.3 MB of step input, median 91 KB and maximum 1.14 MB per step (bootstrap/context/repo-map.md:103). v2 split triage, context-pack and infra into separate steps; Intent collapses them into the same agent because the context is the same (manifesto.md:14; manifesto.md:94).

**In the system.** Sessions are reused within a harness; across harnesses portability is a directional graph, and a non-portable session restarts de novo with the context pack and artifact links (manifesto.md:30). Compaction happens at the end of a session and never at the start of a resumed one (manifesto.md:31; manifesto.md:118); the compacted session is reloaded for a consult, review or the next iteration, and compaction is transcript trimming, not a handoff summary (manifesto.md:31). The context pack is an index of derived status, infra commands and code facts with paths (manifesto.md:216).

**Forbids.** Separate triage, context-pack and infra steps for the same context (manifesto.md:14); handing a job to a new agent without a changed context; compacting at the start of a resumed session (manifesto.md:118); and calling a handoff summary compaction.

## The plan is markdown and the PM is a paper-pusher

**Principle.** The architect owns one markdown plan written for a human or reviewer; a cheap PM turns it into task files, the DAG and dispatch sets, and has no authority to disagree with it (manifesto.md:22; manifesto.md:32).

**Why.** Schema maintenance is not architect work (manifesto.md:22), and v2's plan-review/PM bounce re-issued whole plans — a named loop cause (manifesto.md:101). The PM's job is to interpret bullet-point intent into formal shape, splitting and merging tasks as formalization requires, not to negotiate the intent (manifesto.md:32). The economics reinforce it: one $2.86 Opus plan call cost more than the entire developer bill (manifesto.advice.md:20), so plan turns must produce readable direction, not file-format upkeep.

**In the system.** The architect edits `plan.md` in place and never in flight; tasks get short immutable slugs, and the orchestrator reconciles execution state from a semantic diff (manifesto.md:32). The PM derives task files, owns the DAG and dispatch sets, and resolves what cannot be derived deterministically — missing branches, misplaced artifacts (manifesto.md:32). Reconcile freezes done tasks, makes rework a new slug and re-reads pending tasks at dispatch (manifesto.md:111).

**Forbids.** Architect-maintained schema-consistent task files or hand-edited status; PM edits to the plan or overrides of architect intent; whole-plan re-issue through a strict schema (manifesto.md:32); and editing a plan while work is in flight.

## State is derived, never stored

**Principle.** Execution state is a pure function of task files and append-only records; the script recomputes it rather than keeping a mutable status store (manifesto.md:33).

**Why.** Intent requires status to be aggregated idempotently from structured artifacts, with the context pack built from it (manifesto.md:33). A stored status would be a second truth needing repair after interruption: the v2 journal recorded 303 step starts against 289 finishes and 20 stranded items (bootstrap/context/repo-map.md:106). Recovery from any such break is then a recomputation, not a repair.

**In the system.** Intent asks for idempotent aggregation from artifacts (manifesto.md:33); the kernel makes the stronger choice that state is never stored, deleting everything but `tasks/` and `records/` loses nothing, and `derive` reads nothing else (bootstrap/KERNEL0.md:104). Task status is a closed set from pending to cancelled (bootstrap/KERNEL0.md:65), and context packs are built from derived status (manifesto.md:33). A subarchitect's status summary is a summary, not the state (manifesto.md:38).

**Forbids.** A mutable status file as the source of truth; deriving status from agent prose or memory; hand-repairing state after a crash; and letting a status summary compete with the records.

## Only the remarkable travels up

**Principle.** Work moves implementer → reviewer → architect → top architect → human, and each stage forwards only what is different from or additive to the plan (manifesto.md:42-43).

**Why.** Implementers over-report trivia, so the reviewer decides what deserves architecture attention; even a same-model reviewer with a different focus adds a lot (manifesto.md:44). The perspective gap is deliberate: the implementer sees one task, the reviewer its diff, the architect the epic's interactions, layers and sequence, and the gap holds between same-class models (manifesto.md:43). The filter is also a cost control: about 34 v2 wave reports consumed roughly 8.7M input tokens (manifesto.advice.md:21).

**In the system.** Concerns carry a calibration — FYI, blocked-by-architect, blocked-by-user — and remarkables propagate up the chain (manifesto.md:46). Reviewer pairing is per task-type flow; there is no separate integration wave review, because the next iteration's completeness check is the integration point (manifesto.md:45). The reviewer's prompt and context are tailored to the review focus, not the implementation context — not the implementer's edits or reasoning (manifesto.md:45). Files stay on disk, and the architect scouts or reads paths rather than receiving pasted content (manifesto.md:47).

**Forbids.** A separate wave review; one agent both implementing and reviewing to save a step; raw transcripts or pasted files travelling up; and treating every implementer note as architecture input.

## Uncertainty is bought down before detail

**Principle.** Risk, uncertainty and complexity come first; a milestone may defer detail until a spike lands while already-unblocked implementation proceeds in parallel (manifesto.md:50).

**Why.** The alternative is detailed planning around a known unknown, then replanning when it resolves. The architect issues what it can direct now plus the spikes — X clear, Y needs a spike, Z depends on Y — and plans dependents after the finding (manifesto.md:51). v2's execution plan said "keep going until complete" without spike-deferred milestones, a named loop cause (manifesto.md:102).

**In the system.** A spike is a task whose product is knowledge — a finding, optionally a PoC — and it is not merged by default (manifesto.md:212). The iteration still runs to exhaustion when a spike lands; dependents idle until the boundary (manifesto.md:19). The architect issues known tasks and spikes together, then decides the dependent work (manifesto.md:51).

**Forbids.** Guessing through a known unknown to keep a plan looking complete; planning dependents before a spike reports; treating a spike as a mergeable feature by default; and stopping an iteration because an uncertainty is being researched.

## Stopping is designed and debt is bounded

**Principle.** The architect is incentivized to stop when the goal is met or no meaningful work is possible without the owner, and the goal may create no new technical debt (manifesto.md:54-56).

**Why.** A process told to keep going until complete has no brake; v2's plan did exactly that and is recorded as a loop cause (manifesto.md:102). The stop criteria are prompt text: goal met, or no meaningful development without owner feedback, with no new debt, no slop and clean-code principles met (manifesto.md:55). Existing debt may be addressed to enable the goal, but the goal itself may not add to it (manifesto.md:56).

**In the system.** The architect may authorize temporary debt with removal by the end of the same goal (manifesto.md:57). A launch bounds iterations, review cycles and optionally dollars, subscription use or time; on a per-iteration budget hit the run drains — no new dispatch, in-flight work finishes within its own bound (manifesto.md:58). Relaunching a goal starts with a debt and gap review before planning (manifesto.md:56).

**Forbids.** Unbounded continuation; new debt left at goal completion; a budget hit treated as permission for one more dispatch; and relaunching straight into new planning without the debt review.

## Steer by mailbox, decide by reversible assumption

**Principle.** The user steers by dropping files into a mailbox; the architect continues on reversible assumptions and surfaces remarkable decisions instead of blocking on every question (manifesto.md:61-62).

**Why.** An ACK protocol makes the user the bottleneck and turns every reversible choice into a round trip. Under the current calibration the architect records the assumption, marks it remarkable and continues, and the user overrides (manifesto.md:61). The iteration summary is the guaranteed remarkable, so the user sees at least one signal per iteration and no spam (manifesto.md:62). v2's polling was noisy: one journal holds 228 `steer_poll_error` entries (bootstrap/context/repo-map.md:105).

**In the system.** The script monitors the mailbox at startup and during a run; a cheap PM converts each steer into structured artifacts and decides which task or gate it blocks (manifesto.md:63). In-flight tasks finish and park unmerged, pending ones hold, and the architect consult waits until the unblocked remainder of the DAG is exhausted (manifesto.md:63). Every steer reaches the architect, is marked processed there, and the response goes to the outbox (manifesto.md:63).

**Forbids.** An ACK handshake for every decision; halting independent work while the user answers; the PM or script disposing of a steer without the architect; and steering by editing work in flight.

## Flows are data, not code paths

**Principle.** Flows, agents, schemas and calibration live in configuration; adding or changing a flow is a config edit while the agent-facing script schema stays fixed (manifesto.md:75-76).

**Why.** v2 encoded its process as ceremony: 21 schemas and 1,554 lines of schema code, 48 prompt files and 25 documented step kinds (bootstrap/context/repo-map.md:102), the restrictive and loop-prone shape the manifesto rejects (manifesto.md:5). Flows as data let one script run "just implement", "implement/review" or TDD without new orchestrator branches (manifesto.md:76).

**In the system.** Three config layers separate repo locations and gates, factory process settings, and transient run settings (manifesto.md:75). Prompts are templated, not copy-pasted (manifesto.md:77). Review retries are configurable with follow-up options — same agent on compacted context, a different model, or de novo (manifesto.md:78) — and task review defaults to two rounds, with the last round deciding park or merge-with-debt (manifesto.md:79). Concurrency has an absolute limit plus per-harness limits, and config is schema-validated at pre-flight (manifesto.md:80-81).

**Forbids.** A new orchestrator branch per flow; copy-pasted prompts; task-review rounds or concurrency changed in code; and unvalidated configuration reaching a run.

## Harnesses are interchangeable, capabilities are not

**Principle.** The factory runs through any ACP-compatible harness with opaque launch config, prefers native interfaces where they are more capable, and branches on capabilities rather than harness names (manifesto.md:84; manifesto.md:116).

**Why.** v2 grew a 1,454-line omp-specific adapter with exact CLI flags, while a bad credential caused multi-hop fallback chains (bootstrap/context/repo-map.md:111). omp is a special case that simplifies things, not a dependency (manifesto.md:84). The script owns everything down to task level through an abstraction that knows each harness's capabilities (manifesto.md:39).

**In the system.** omp's RPC — compact, tree navigation with summary, fork, subagent steering — is special-cased; everything else goes through ACP, with acpx as the generic client and native structured output preferred where it is better (manifesto.md:115-116). Sessions cross harnesses only along the directional portability graph, otherwise the factory restarts de novo with the context pack and artifact links (manifesto.md:117). Model fallbacks within omp are used; cross-harness fallback is nice to have (manifesto.md:85).

**Forbids.** Branching flows on harness identity; a factory that only works with omp; assuming transcripts are portable in both directions; and driving every harness uniformly through the lowest common interface.

## Clean code is a result, not a stage

**Principle.** Test real behavior, build bottom-up in vertical slices, and meet the clean-code rules as an outcome; the build order is chosen case by case rather than prescribed as ceremony (manifesto.md:66-67).

**Why.** A review approval is not evidence that code works: all five failed items in the v2 `omp-workspaces` batch carried `status: approved` reviews (bootstrap/context/repo-map.md:107). The rules therefore specify the result — test real behavior, edge cases, security, failure propagation, observability and performance from day one (manifesto.md:66-68) — while the approach stays separate (manifesto.md:67). v2's 26,059 source lines and 4,092-line `iteration.ts` are the size side of the ledger the manifesto rejects (bootstrap/context/repo-map.md:102).

**In the system.** Priorities are uncertainties, then layers handling edge cases, then tested slices of user-visible functionality, with exact ordering decided case by case (manifesto.md:67). Comments explain why only for non-trivial code, self-documenting code beats docs, and public interfaces live apart from implementation (manifesto.md:69-70). A target repo's own conventions win; an ADR is reserved for a long-term decision shaping the project or a whole layer (manifesto.md:71-72).

**Forbids.** A separate cleanup or documentation phase; comments that restate code; interface docs unreadable by agents; ADRs for routine decisions; and importing factory defaults into a repo with better conventions.

## What was rejected and why

- **Ceremony launches.** Architect-role launches were the biggest single cost — 81 launches, 21.7M input tokens, $5.22 of $11.01 — mostly wave reports and consults (manifesto.md:103; manifesto.advice.md:20), so the iteration boundary replaced them.
- **Schema sprawl.** v2 carried 21 schemas and 1,554 lines of schema code, turning process into file maintenance (bootstrap/context/repo-map.md:102); the plan is now markdown and strict schema is kept for small, simple outputs (manifesto.md:106).
- **Nested retries.** Step attempts × fix rounds × consults × plan reviews × amendments compound, so v2's budgets bounded the nests rather than the item (manifesto.md:99); the factory has a single budget per item.
- **ADR spam.** The ADRs v2 produced are "agentic spam", one reason v2 is unacceptable, and they bind nothing (manifesto.md:94); an ADR now needs a long-term decision shaping the project or a layer (manifesto.md:72).
- **Strict-schema plan re-issue.** Plan review and PM bounce re-issued whole plans, a named loop cause (manifesto.md:101); the plan is edited in place and reconciled by semantic diff (manifesto.md:32).

## Glossary

All terms — goal, launch, iteration, task, epic, saga, spike, wave, concern, remarkable, context pack — are used as defined in the [manifesto glossary](../manifesto.md#n19-glossary--decided); this document does not restate them.

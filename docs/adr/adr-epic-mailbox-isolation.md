# Epic mailbox isolation accepted as deviation

runChildTask accepts rootTaskDir but never reads it; only root runTask polls the root mailbox, while epic children write human-* to their own task dir mailbox ({childWt}/{orch}/{parent}/{epic}). Blocked child questions are forwarded as q-epic-* (epic-propagation.ts:97-129), but epic-local digests stay in the epic mailbox and parent answers are not copied back down. Wiring child-to-root mailbox routing now is a late-stage behavior change with config-semantics blast radius.

## Decision

Accept epic mailbox isolation as a documented deviation: epic children keep task-local mailboxes, poll the root mailbox for answers, and only blocked child questions reach the parent as forwarded q-epic-*; epic-local digests are not routed back up and parent answers are not copied back down (§8.8, §8.11).

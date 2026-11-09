# Worker-remarkable digest requires triager confirmation

Worker remarkable[] becomes an open rm-* record hydrated to every consumer, but a mailbox digest is written only when a triager emits a suggestion matching the rm-* id with a human-* disposition (triage.ts:98,334-346); architect ADRs route automatically instead. Spec :98 says remarkable items are reported in a digest, never waiting.

## Decision

Keep the worker-remarkable digest behind triager confirmation: remarkable[] records hydrate to every consumer, but a mailbox digest is written only when a triager emits a matching suggestion with a human-* disposition; architect ADRs continue to route automatically.

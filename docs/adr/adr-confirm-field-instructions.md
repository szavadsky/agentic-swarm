# Architect fragments instruct concernConfirms

The engine settles close-up proposals only via architect concernConfirms (step-runner.ts:303-316, concerns.ts:282-306), but agents/steps/architect-closeup.md instructs concernResolutions (the proposal field, verified last line) and architect-wave-report.md instructs neither (verified). A proposal the architect never confirms keeps pendingResolution forever, and applyWaveCloseupFallback skips pending concerns (concerns.ts:347), so spec :94 resolve/carry silently stalls in production while engine tests pass.

## Decision

Instruct concernConfirms (accept/reject) in the architect close-up and wave-report fragments; rejecting a noteless dismiss is a plain reject that clears the proposal unchanged, matching applyConcernConfirms and its step-runner pre-flight. concernResolutions stays the close-up proposal field; only the architect settles proposals.

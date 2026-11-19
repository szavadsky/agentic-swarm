# Goal: delta — everything in INTENT.md not yet done

## Scope
Build every requirement of `INTENT.md` (repo root; source of truth) that is
not yet done. Phase requirements: `Phase1.md`. Nothing is out of scope
except what is already built, evidenced, and stable.

## The work
1. Assess the live repo — code, tests, records, metrics, prior goal
   artifacts — against `INTENT.md`. The delta (not built, or built but
   unevidenced/unstable) is the work. The assessment is the architect's
   own first act; no pre-supplied list is authoritative.
2. Build the entire delta: tested, documented, evidenced, same quality
   bars as before (gates green, records, per-iteration summaries).
3. Housekeeping (park pile-up, retired slugs, stale branches) is in scope
   where it blocks or confuses the delta.

## Done
Declare the goal complete only when `INTENT.md` holds in full against the
live repo, with evidence pointers (files, records, gate runs) for every
requirement. A 0-merge iteration with a "nothing remains" rationale is the
success signal; a 0-merge iteration caused by failures or conflicts is not
done — recover and continue.

## Standing principle (owner-ordered): statistics start investigations, never end them
It is the factory's job to agentically inspect to the bottom of things:
when metrics, counts, or aggregates surface anything surprising — or
whenever a turn, task, or gate fails without an obvious cause — inspect
transcripts, prompts, detector logic, and timing. Sample individual
cases; verify detection against reality; never close a friction item on
a number alone.

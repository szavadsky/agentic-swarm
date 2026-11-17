### Decision

This is the last call: no further change request is honored. `changes` is not an accepted outcome — outcome validation refuses it.

- `approve`: ship. Record every unmet done-when, unresolved finding and known risk as a concern; the kernel records them as debt.
- `reject`: park, keeping the branch; the work must not merge. Use it only for negative value — code to throw away, a failing check you ran, a security defect, or a broken dependent interface.
- Do not manufacture findings; an approve on the last call is normal when the work is net positive.

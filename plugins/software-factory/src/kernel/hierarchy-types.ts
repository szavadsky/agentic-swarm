/**
 * How the boundary hands an epic's consult to its subarchitect.
 * `steer`: the subarchitect is a named child of the architect's live session,
 * reached over IRC. `report`: a separate turn that writes its own status.
 */
export type SubarchitectDelivery = "steer" | "report";

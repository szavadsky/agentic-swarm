/** The waste fields a role/alias row carries. */

import { type WasteCounts } from "./waste.js";

/** The waste fields a role/alias row carries; GroupMetrics satisfies this. */
export interface WasteGroupRow {
  name: string;
  waste: WasteCounts;
  rebuttedReviews: number;
}

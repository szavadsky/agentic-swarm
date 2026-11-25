/** What one preparer turn delivered, or why the boundary must render whole. */

import type { PackBrief } from "./context-pack/types.js";

export type PackPreparerReport = { briefs: PackBrief[] } | { failure: string };

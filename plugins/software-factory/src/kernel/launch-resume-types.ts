/** The relaunch resume decision. */

import { type Hold } from "./mailbox.js";

export interface ResumeGate {
  holds: Hold[];
  refusal?: string;
}

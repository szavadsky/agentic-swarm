/** Steer, hold and scan shapes shared with the kernel. */

export interface Steer {
  id: string;
  /** File name inside mailbox/inbox; the steer's identity. */
  file: string;
  /** Goal-relative path, for prompts and the context pack. */
  relPath: string;
  text: string;
  /** Content hash: archive suffix and settle-change detector, never the identity. */
  hash: string;
  /** Leading frontmatter `urgent: true`; the steer drains its iteration. */
  urgent: boolean;
}

export interface ScanOptions {
  /** How long a file's size must hold still before it is claimed. */
  settleMs?: number;
}

/** What the PM's steer turn decided one steer blocks. */
export interface Hold {
  steer: string;
  slugs: string[];
  goal: boolean;
}
/** Options for reading hold files. */
export interface ReadHoldsOptions {
  /** Task slugs the caller knows; a hold naming anything else is a finding. */
  knownSlugs?: ReadonlySet<string> | readonly string[];
}

/** A hold file that decides nothing; `sweepHolds` parks it, a read only reports it. */
export interface HoldFinding {
  /** Goal-relative path of the hold file. */
  file: string;
  kind: "malformed" | "unknown-slug";
  reason: string;
}

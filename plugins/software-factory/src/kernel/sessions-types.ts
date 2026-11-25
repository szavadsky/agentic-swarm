/** The launch's session shapes. */

import type { Steer } from "./mailbox.js";

export interface LaunchSessions {
  launchId: string;
  dir: string;
}

/** A live PM turn that can take a steer mid-flight. */
export interface LiveSteerSink {
  /** Delivers and claims one steer; false leaves it queued for a later turn. */
  inject(steer: Steer): Promise<boolean>;
}

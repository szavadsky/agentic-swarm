/** The named-semaphore shapes shared by the kernel and its config layers. */

/** A declared limit: at most `max` holders of `name` at any one time. */
export interface SemaphoreDeclaration {
  name: string;
  max: number;
}

/** Returns one holder's counts; a second call is a no-op. */
export type Release = () => void;

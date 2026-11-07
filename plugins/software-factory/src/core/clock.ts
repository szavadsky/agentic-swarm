/**
 * Clock abstraction and active monotonic timer for suspend awareness.
 */

export interface Clock {
  /** Wall-clock time in milliseconds (e.g. Date.now()). */
  now(): number;
  /** Monotonic time in milliseconds (e.g. performance.now()). */
  monotonic(): number;
}

export const defaultClock: Clock = {
  now: () => Date.now(),
  monotonic: () => performance.now(),
};

let activeClock: Clock = defaultClock;

export function getClock(): Clock {
  return activeClock;
}

export function setClock(clock: Clock): void {
  activeClock = clock;
}

export function resetClock(): void {
  activeClock = defaultClock;
}

/** Default gap between wall-clock delta and monotonic delta indicating system suspend (30s). */
export const DEFAULT_SUSPEND_THRESHOLD_MS = 30_000;

/**
 * Detects whether a system suspend occurred between start and now.
 * A suspend causes wall-clock time to advance by the sleep duration,
 * while monotonic time (performance.now) halts or advances only for active time.
 */
export function detectSuspend(
  startWall: number,
  startMono: number,
  clock: Clock = getClock(),
  thresholdMs: number = DEFAULT_SUSPEND_THRESHOLD_MS
): { suspendDetected: boolean; gapMs: number } {
  const wallDelta = clock.now() - startWall;
  const monoDelta = clock.monotonic() - startMono;
  const gapMs = Math.max(0, wallDelta - monoDelta);
  return {
    suspendDetected: gapMs > thresholdMs,
    gapMs,
  };
}

/**
 * Creates an active timer that measures elapsed monotonic time.
 * If the system is suspended, waking up does not burn the active timeout:
 * the timer recalculates remaining active time and reschedules.
 */
export function createActiveTimer(
  timeoutMs: number,
  onTimeout: () => void,
  clock: Clock = getClock()
): { cancel: () => void } {
  const startMono = clock.monotonic();
  let timer: any = undefined;
  let cancelled = false;

  const schedule = (remainingMs: number) => {
    timer = setTimeout(() => {
      if (cancelled) return;
      const elapsedActive = clock.monotonic() - startMono;
      if (elapsedActive >= timeoutMs) {
        onTimeout();
      } else {
        // Suspend or early wake: reschedule for remaining active time
        schedule(timeoutMs - elapsedActive);
      }
    }, Math.max(0, remainingMs));
  };

  schedule(timeoutMs);

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

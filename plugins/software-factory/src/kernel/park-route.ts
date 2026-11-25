import type { Cause, ParkRouteConfig, ParkRoutes } from "./types.js";

/**
 * The route for a cause the repo names no default for: the PM decides parks,
 * and a cause with no advice is the architect's until its records say more.
 */
const ARCHITECT_DEFAULT: ParkRouteConfig = {
  action: "leave",
  reason: "an unclassified park is the architect's",
  exception: "the records name a fixable cause; amend",
};

/**
 * The default decision for one park's cause: the repo's route for that kind,
 * else the architect's. The kind is the closed cause vocabulary, so rewording
 * a cause's detail never changes its route. These are defaults, not rules: the
 * PM reads the park's records and branch and may choose any decision the
 * evidence supports.
 */
export function defaultParkRoute(
  cause: Cause,
  routes: ParkRoutes | undefined,
): ParkRouteConfig {
  return routes?.[cause.kind] ?? ARCHITECT_DEFAULT;
}

/** One brief line: the default and the evidence that overrides it. */
export function formatParkDefault(
  cause: Cause,
  routes: ParkRoutes | undefined,
): string {
  const route = defaultParkRoute(cause, routes);
  return `${route.action} — ${route.reason}; ${route.exception}`;
}

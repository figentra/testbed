/**
 * Stackra file contract:
 * Purpose: `isTestbedClaimStale(pid, isAlive)`, whether a Mac-side claim no longer holds: it names no pid or its
 *          process is gone.
 * Boundary: pure.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/**
 * Whether a claim whose pid file held `pid` is stale.
 *
 * @param pid - the pid read from the claim, or `undefined` when unreadable.
 * @param isAlive - whether a process is alive.
 * @example
 * isTestbedClaimStale(undefined, () => true); // true
 */
export function isTestbedClaimStale(
  pid: number | undefined,
  isAlive: (pid: number) => boolean,
): boolean {
  return pid === undefined || !Number.isInteger(pid) || pid <= 0 || !isAlive(pid);
}

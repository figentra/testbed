/**
 * Testbed file contract:
 * Purpose: `TESTBED_REATTACH_MS`, the wait before each reattach to a detached job after a dropped connection.
 * Boundary: data only.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); STA-2042.
 */

/** Ten seconds between attempts: long enough for SSM to accept a new session. */
export const TESTBED_REATTACH_MS = 10_000;

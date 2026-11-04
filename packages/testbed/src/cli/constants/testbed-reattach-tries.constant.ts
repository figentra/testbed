/**
 * Testbed file contract:
 * Purpose: `TESTBED_REATTACH_TRIES`, how often `testbed run` reattaches to a detached job after its
 *          SSH-over-SSM connection drops.
 * Boundary: data only.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); STA-2042.
 */

/** Reattach attempts after a dropped connection before the box counts as lost (exit 255). */
export const TESTBED_REATTACH_TRIES = 3;

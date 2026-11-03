/**
 * Stackra file contract:
 * Purpose: `TESTBED_POLL_MS`, the wait between two looks for a free slot.
 * Boundary: data only.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/** Twenty seconds, as ci-box polled. */
export const TESTBED_POLL_MS = 20_000;

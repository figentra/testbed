/**
 * Stackra file contract:
 * Purpose: `TESTBED_EXIT`, the `testbed-agent` exit codes the Mac side acts on.
 * Boundary: data only; the box agent contract owns the values.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/** 73: the slot is busy (retry the claim); 75: the box is unhealthy (pick another box). */
export const TESTBED_EXIT = {
  /** The slot is busy. */
  busy: 73,
  /** The box is unhealthy. */
  unhealthy: 75,
} as const;

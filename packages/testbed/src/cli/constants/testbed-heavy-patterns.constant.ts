/**
 * Stackra file contract:
 * Purpose: `TESTBED_HEAVY_PATTERNS`, the words that put a command in the heavy slot (ci-box's list).
 * Boundary: data only.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/** A command containing one of these takes the heavy slot; every other takes the light one. */
export const TESTBED_HEAVY_PATTERNS: readonly string[] = [
  "encore test",
  "playwright",
  "e2e",
  "act ",
  "build",
];

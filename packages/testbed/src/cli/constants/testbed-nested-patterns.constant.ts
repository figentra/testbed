/**
 * Stackra file contract:
 * Purpose: `TESTBED_NESTED_PATTERNS`, the words that make a command a nested call to refuse.
 * Boundary: data only.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/** A command containing one of these is refused: a nested call waits forever on the box holding its lock. */
export const TESTBED_NESTED_PATTERNS: readonly string[] = ["ci-box", "stackra testbed"];

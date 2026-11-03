/**
 * Stackra file contract:
 * Purpose: `refusesTestbedCommand(command)`, whether a command calls the testbed itself (`ci-box` or
 *          `stackra testbed`), which would wait forever on the box while holding its lock.
 * Boundary: pure.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import { TESTBED_NESTED_PATTERNS } from "#node/constants/testbed-nested-patterns.constant";

/**
 * Whether `command` must be refused as a nested call.
 *
 * @param command - the command line to run on the box.
 * @example
 * refusesTestbedCommand("ci-box status"); // true
 */
export function refusesTestbedCommand(command: string): boolean {
  return TESTBED_NESTED_PATTERNS.some((pattern) => command.includes(pattern));
}

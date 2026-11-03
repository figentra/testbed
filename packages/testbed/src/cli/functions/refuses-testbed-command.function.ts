/**
 * Testbed file contract:
 * Purpose: `refusesTestbedCommand(command)`, whether a command calls the testbed itself (`testbed`, `ci-box` or
 *          `stackra testbed` with a verb), which would wait forever on the box while holding its lock.
 * Boundary: pure; matches the command word (`TESTBED_NESTED_CALL`), so a package filter naming `testbed` passes.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */
import { TESTBED_NESTED_CALL } from "#cli/constants/testbed-nested-call.constant";

/**
 * Whether `command` must be refused as a nested call.
 *
 * @param command - the command line to run on the box.
 * @example
 * refusesTestbedCommand("ci-box status"); // true
 * refusesTestbedCommand("pnpm --filter @figentra/testbed test"); // false
 */
export function refusesTestbedCommand(command: string): boolean {
  return TESTBED_NESTED_CALL.test(command);
}

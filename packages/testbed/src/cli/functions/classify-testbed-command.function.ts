/**
 * Stackra file contract:
 * Purpose: `classifyTestbedCommand(command)`, the slot a command takes: `heavy` for encore test, playwright, e2e, act
 *          and build, otherwise `light`.
 * Boundary: pure; substring match, as ci-box did.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import { TESTBED_HEAVY_PATTERNS } from "#node/constants/testbed-heavy-patterns.constant";

/**
 * The slot kind `command` takes.
 *
 * @param command - the command line to run on the box.
 * @example
 * classifyTestbedCommand("pnpm exec playwright test"); // "heavy"
 */
export function classifyTestbedCommand(command: string): "heavy" | "light" {
  return TESTBED_HEAVY_PATTERNS.some((pattern) => command.includes(pattern)) ? "heavy" : "light";
}

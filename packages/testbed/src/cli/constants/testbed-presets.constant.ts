/**
 * Testbed file contract:
 * Purpose: `TESTBED_PRESETS`, the presets the GitHub fallback workflow accepts.
 * Boundary: data only; a preset names work, never a command.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */

/** The `preset` input of `testbed-fallback.yml`. */
export const TESTBED_PRESETS: readonly string[] = ["verify", "e2e", "integration"];

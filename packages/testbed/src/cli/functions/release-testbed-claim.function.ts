/**
 * Stackra file contract:
 * Purpose: `releaseTestbedClaim(root, name)`, drops the Mac-side claim `<root>/<name>`.
 * Boundary: touches only the claim folder.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import { rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Drops the claim `name`.
 *
 * @param root - the claim folder.
 * @param name - `<instance>-<slot>`.
 * @example
 * releaseTestbedClaim("/tmp/ci-claim", "i-1-heavy");
 */
export function releaseTestbedClaim(root: string, name: string): void {
  rmSync(join(root, name), { recursive: true, force: true });
}

/**
 * Stackra file contract:
 * Purpose: `claimTestbedSlot(root, name, pid, isAlive)`, the Mac-side claim `<root>/<instance>-<slot>`: a directory
 *          made atomically that holds the claimer's pid, so parallel callers never pick the same free slot while the
 *          first still syncs. A claim whose pid is dead is stale and taken over.
 * Boundary: touches only the claim folder.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isTestbedClaimStale } from "#node/functions/is-testbed-claim-stale.function";

/**
 * Takes the claim `name`; false when a live process holds it.
 *
 * @param root - the claim folder (`/tmp/ci-claim`).
 * @param name - `<instance>-<slot>`.
 * @param pid - the claimer's pid.
 * @param isAlive - whether a process is alive.
 * @example
 * claimTestbedSlot("/tmp/ci-claim", "i-1-heavy", process.pid, isAlive);
 */
export function claimTestbedSlot(
  root: string,
  name: string,
  pid: number,
  isAlive: (pid: number) => boolean,
): boolean {
  mkdirSync(root, { recursive: true });
  const folder = join(root, name);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(folder);
      writeFileSync(join(folder, "pid"), String(pid));
      return true;
    } catch {
      let held: number | undefined;
      try {
        held = Number(readFileSync(join(folder, "pid"), "utf8").trim()) || undefined;
      } catch {
        held = undefined;
      }
      if (!isTestbedClaimStale(held, isAlive)) return false;
      rmSync(folder, { recursive: true, force: true });
    }
  }
  return false;
}

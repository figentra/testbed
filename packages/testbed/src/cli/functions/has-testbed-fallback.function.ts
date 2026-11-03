/**
 * Testbed file contract:
 * Purpose: `hasTestbedFallback(directory)`, whether the repository holding `directory` has the fallback workflow
 *          (`.github/workflows/testbed-fallback.yml`), so `gh workflow run` there can find it.
 * Boundary: reads file existence only, from `directory` up to the repository root (the first `.git`) or the filesystem
 *           root; never runs git or gh.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { TESTBED_FALLBACK_WORKFLOW } from "#cli/constants/testbed-fallback-workflow.constant";

/**
 * Whether a fallback dispatch from `directory` has a workflow to run.
 *
 * @param directory - an absolute path inside the caller's repository.
 * @example
 * hasTestbedFallback("/Users/me/core"); // true where the repository keeps the workflow
 */
export function hasTestbedFallback(directory: string): boolean {
  for (let at = directory; ; at = dirname(at)) {
    if (existsSync(join(at, ".github", "workflows", TESTBED_FALLBACK_WORKFLOW))) return true;
    if (existsSync(join(at, ".git")) || dirname(at) === at) return false;
  }
}

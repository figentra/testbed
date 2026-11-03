/**
 * Testbed file contract:
 * Purpose: `TESTBED_FALLBACK_WORKFLOW`, the GitHub workflow file a run dispatches in the caller's repository when no
 *          box is healthy and a preset was given.
 * Boundary: data only; a repository without `.github/workflows/<this>` gets no dispatch (`hasTestbedFallback`).
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */

/** The fallback workflow's file name, as `gh workflow run` takes it. */
export const TESTBED_FALLBACK_WORKFLOW = "testbed-fallback.yml";

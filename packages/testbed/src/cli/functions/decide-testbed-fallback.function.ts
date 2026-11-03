/**
 * Stackra file contract:
 * Purpose: `decideTestbedFallback(state)`, what a run does when no slot is free: `dispatch` the GitHub fallback
 *          workflow (no healthy box and a preset given), otherwise `wait`. The Mac is never the fallback.
 * Boundary: pure.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/**
 * `dispatch` or `wait`.
 *
 * @param state - how many boxes are healthy and the preset the caller named, if any.
 * @example
 * decideTestbedFallback({ healthyCount: 0, preset: "verify" }); // "dispatch"
 */
export function decideTestbedFallback(state: {
  readonly healthyCount: number;
  readonly preset: string | undefined;
}): "dispatch" | "wait" {
  return state.healthyCount === 0 && state.preset !== undefined ? "dispatch" : "wait";
}

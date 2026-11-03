/**
 * Stackra file contract:
 * Purpose: `shouldScaleTestbed(state)`, whether a group grows by one: every slot of its kind has been busy two minutes
 *          and the group is below its maximum.
 * Boundary: pure.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import { TESTBED_SCALE_AFTER_MS } from "#node/constants/testbed-scale-after-ms.constant";

/**
 * Whether to raise the group's desired count.
 *
 * @param state - when the wait began (`undefined` before it did), the clock, and the group's desired and max counts.
 * @example
 * shouldScaleTestbed({ busySince: 0, now: 130_000, desired: 1, max: 3 }); // true
 */
export function shouldScaleTestbed(state: {
  readonly busySince: number | undefined;
  readonly now: number;
  readonly desired: number;
  readonly max: number;
}): boolean {
  return (
    state.busySince !== undefined &&
    state.now - state.busySince >= TESTBED_SCALE_AFTER_MS &&
    state.desired < state.max
  );
}

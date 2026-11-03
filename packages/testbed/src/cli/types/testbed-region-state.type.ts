/**
 * Stackra file contract:
 * Purpose: `TestbedRegionState`, what one look at an enabled region found: whether it answered, its boxes and its
 *          groups' counts.
 * Boundary: type only; `runTestbed` builds it, `pickTestbedSlot` and `summarizeTestbedRegion` read it.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); the testbed regions contract (STA-2042).
 */
import type { TestbedBoxState } from "#node/types/testbed-box-state.type";
import type { TestbedGroupCounts } from "#node/types/testbed-group-counts.type";

/** One enabled region as seen now. */
export type TestbedRegionState = {
  /** The AWS region. */
  readonly region: string;

  /** False when the region's `aws` calls failed; such a region is skipped. */
  readonly reachable: boolean;

  /** Its running boxes, oldest first. */
  readonly boxes: readonly TestbedBoxState[];

  /** Its groups by kind (`heavy`, `light`); a kind is absent when the group could not be read. */
  readonly groups: Readonly<Record<string, TestbedGroupCounts | undefined>>;
};

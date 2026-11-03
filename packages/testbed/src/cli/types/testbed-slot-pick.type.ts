/**
 * Testbed file contract:
 * Purpose: `TestbedSlotPick`, what `pickTestbedSlot` decides: run on a box, raise a group in a region, or wait.
 * Boundary: type only.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); the testbed regions contract (STA-2042).
 */
import type { TestbedBoxState } from "#cli/types/testbed-box-state.type";

/** The next step of a run that needs a slot. */
export type TestbedSlotPick =
  | { readonly action: "run"; readonly region: string; readonly box: TestbedBoxState }
  | {
      readonly action: "scale";
      readonly region: string;
      /** The count to set the group to. */
      readonly desired: number;
    }
  | { readonly action: "wait" };

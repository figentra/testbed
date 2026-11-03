/**
 * Stackra file contract:
 * Purpose: `pickTestbedSlot(regions, state)`, where a job of one slot kind goes next: a free slot on a healthy box in
 *          region order; else the first region whose group of that kind may be raised (a group at 0 at once, a group
 *          with a healthy box only after every slot stayed busy two minutes, below its maximum); else wait. A heavy
 *          job never uses a light box. A region that did not answer is skipped.
 * Boundary: pure; it reads the state it is given and calls nothing, so a region outside the list can never be reached.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); the testbed regions contract (STA-2042 FR-005, FR-006).
 */
import { orderTestbedBoxes } from "#node/functions/order-testbed-boxes.function";
import { shouldScaleTestbed } from "#node/functions/should-scale-testbed.function";
import type { TestbedRegionState } from "#node/types/testbed-region-state.type";
import type { TestbedSlotPick } from "#node/types/testbed-slot-pick.type";

/**
 * The next step for a job.
 *
 * @param regions - the enabled regions in the order to try them, as last seen.
 * @param state - the job's slot kind, when every slot began to stay busy (`undefined` before it did) and the clock.
 * @example
 * pickTestbedSlot(regions, { slot: "light", busySince: undefined, now: 0 }); // { action: "run", region, box }
 */
export function pickTestbedSlot(
  regions: readonly TestbedRegionState[],
  state: { readonly slot: string; readonly busySince: number | undefined; readonly now: number },
): TestbedSlotPick {
  const open = regions.filter((region) => region.reachable);
  for (const { region, boxes } of open) {
    const box = orderTestbedBoxes(boxes, state.slot, new Set()).find(
      (candidate) => candidate.healthy && candidate.slots[state.slot] === "free",
    );
    if (box !== undefined) return { action: "run", region, box };
  }
  for (const { region, boxes, groups } of open) {
    const group = groups[state.slot];
    if (group === undefined) continue;
    // A group at 0 has no box to wait for: start one at once.
    if (group.desired === 0 && group.max > 0) return { action: "scale", region, desired: 1 };
    const hasHealthyBox = boxes.some((box) => box.group === state.slot && box.healthy);
    if (hasHealthyBox && shouldScaleTestbed({ ...state, desired: group.desired, max: group.max })) {
      return { action: "scale", region, desired: group.desired + 1 };
    }
  }
  return { action: "wait" };
}

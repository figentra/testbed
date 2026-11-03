/**
 * Stackra file contract:
 * Purpose: `orderTestbedBoxes(boxes, slot, skip)`, the boxes a job may try, in order, without the boxes already
 *          refused (exit 75). A heavy job runs only on `heavy`-group boxes (heavy never lands on spot); a light job
 *          tries `light` boxes first, then the light slot of `heavy` boxes. Each group is by launch time.
 * Boundary: pure.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import type { TestbedBox } from "#node/types/testbed-box.type";

/**
 * The candidate boxes for a job.
 *
 * @param boxes - the running boxes, oldest first.
 * @param slot - `heavy` or `light`.
 * @param skip - instance ids to leave out.
 * @example
 * orderTestbedBoxes(boxes, "heavy", new Set(["i-1"]));
 */
export function orderTestbedBoxes<Box extends TestbedBox>(
  boxes: readonly Box[],
  slot: string,
  skip: ReadonlySet<string>,
): readonly Box[] {
  const open = boxes.filter((box) => !skip.has(box.id));
  const heavy = open.filter((box) => box.group === "heavy");
  if (slot === "heavy") return heavy;
  return [...open.filter((box) => box.group === "light"), ...heavy];
}

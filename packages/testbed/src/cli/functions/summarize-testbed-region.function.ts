/**
 * Stackra file contract:
 * Purpose: `summarizeTestbedRegion(state)`, one enabled region as the `stackra testbed status --json` entry: whether it
 *          answered, the free, total and startable heavy and light slots, and its boxes. Startable counts the slots of
 *          the boxes a group may still start: a heavy box brings a heavy and a light slot, a light box a light slot.
 * Boundary: pure.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); the testbed regions contract (STA-2042 FR-007, FR-012).
 */
import type { TestbedRegionState } from "#node/types/testbed-region-state.type";

/** Free, total and startable slots of one kind. */
type SlotCounts = { readonly free: number; readonly total: number; readonly startable: number };

/**
 * The status entry of `state`.
 *
 * @param state - one region as last seen.
 * @example
 * summarizeTestbedRegion(state).heavy; // { free: 1, total: 1, startable: 0 }
 */
export function summarizeTestbedRegion(state: TestbedRegionState): {
  readonly region: string;
  readonly reachable: boolean;
  readonly heavy: SlotCounts;
  readonly light: SlotCounts;
  readonly boxes: readonly {
    readonly id: string;
    readonly kind: string;
    readonly healthy: boolean;
    readonly slots: Readonly<Record<string, "free" | "busy" | undefined>>;
  }[];
} {
  // How many more boxes of a group may start; an unreadable group counts 0.
  const room = (kind: string): number => {
    const group = state.groups[kind];
    if (group === undefined) return 0;
    return Math.max(0, group.max - state.boxes.filter((box) => box.group === kind).length);
  };
  const counts = (kind: string, startable: number): SlotCounts => {
    const hosts = state.boxes.filter((box) => box.group === "heavy" || box.group === kind);
    const free = hosts.filter((box) => box.healthy && box.slots[kind] === "free").length;
    return { free, total: hosts.length, startable };
  };
  return {
    region: state.region,
    reachable: state.reachable,
    heavy: counts("heavy", room("heavy")),
    light: counts("light", room("light") + room("heavy")),
    boxes: state.boxes.map((box) => ({
      id: box.id,
      kind: box.group,
      healthy: box.healthy,
      slots: box.slots,
    })),
  };
}

/**
 * Stackra file contract:
 * Purpose: unit tests of `pickTestbedSlot` and `summarizeTestbedRegion` over fixtures: a free slot in region order, the
 *          next region when the first is full, a group raised where there is room (at once at 0, after two busy
 *          minutes with a box), waiting when nothing can be raised, a heavy job never on a light box, an unreachable
 *          region skipped, and the free, total and startable slots of a region.
 * Boundary: test only.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484; the testbed regions contract (STA-2042).
 */
import { describe, expect, it } from "@stackra/testing";

import { pickTestbedSlot } from "#node/functions/pick-testbed-slot.function";
import { summarizeTestbedRegion } from "#node/functions/summarize-testbed-region.function";
import type { TestbedBoxState } from "#node/types/testbed-box-state.type";
import type { TestbedGroupCounts } from "#node/types/testbed-group-counts.type";
import type { TestbedRegionState } from "#node/types/testbed-region-state.type";

// @covers sta-2042:FR-005 sta-2042:FR-006 sta-2042:FR-012 sta-2042:P-005 sta-2042:P-012 sta-2042:AC-001 sta-2042:AC-005

const box = (
  id: string,
  region: string,
  group: string,
  slots: TestbedBoxState["slots"],
  healthy = true,
): TestbedBoxState => ({ id, region, group, ip: `ip-${id}`, launchedAt: 0, healthy, slots });

const group = (desired: number, max = 1): TestbedGroupCounts => ({ desired, max, min: 0 });

const region = (
  name: string,
  boxes: readonly TestbedBoxState[],
  groups: TestbedRegionState["groups"] = {},
  reachable = true,
): TestbedRegionState => ({ region: name, reachable, boxes, groups });

const NOW = 1_000_000;
const light = { slot: "light", busySince: undefined, now: NOW } as const;

describe("pickTestbedSlot", () => {
  it("takes a free slot in the first region that has one", () => {
    const regions = [
      region("a", [box("i-a", "a", "light", { light: "busy" })]),
      region("b", [box("i-b", "b", "light", { light: "free" })]),
      region("c", [box("i-c", "c", "light", { light: "free" })]),
    ];
    expect(pickTestbedSlot(regions, light)).toMatchObject({ action: "run", region: "b" });
  });

  it("prefers a light box, then the light slot of a heavy box, inside a region", () => {
    const regions = [
      region("a", [
        box("i-h", "a", "heavy", { heavy: "free", light: "free" }),
        box("i-l", "a", "light", { light: "free" }),
      ]),
    ];
    const pick = pickTestbedSlot(regions, light);
    expect(pick.action === "run" && pick.box.id).toBe("i-l");
  });

  it("takes a free slot elsewhere before raising a group", () => {
    const regions = [
      region("a", [box("i-a", "a", "light", { light: "busy" })], { light: group(0) }),
      region("b", [box("i-b", "b", "light", { light: "free" })]),
    ];
    expect(pickTestbedSlot(regions, light)).toMatchObject({ action: "run", region: "b" });
  });

  it("never gives a heavy job a light box or an unhealthy one", () => {
    const regions = [
      region("a", [
        box("i-l", "a", "light", { light: "free" }),
        box("i-h", "a", "heavy", { heavy: "free" }, false),
      ]),
    ];
    expect(pickTestbedSlot(regions, { ...light, slot: "heavy" })).toEqual({ action: "wait" });
  });

  it("skips a region that did not answer, even one with a free slot", () => {
    const regions = [
      region("a", [box("i-a", "a", "light", { light: "free" })], {}, false),
      region("b", [], { light: group(0) }),
    ];
    expect(pickTestbedSlot(regions, light)).toEqual({ action: "scale", region: "b", desired: 1 });
  });

  it("raises a group at 0 at once, in the first region that has one", () => {
    const regions = [
      region("a", [box("i-a", "a", "light", { light: "busy" })], { light: group(1) }),
      region("b", [], { light: group(0) }),
      region("c", [], { light: group(0) }),
    ];
    expect(pickTestbedSlot(regions, light)).toEqual({ action: "scale", region: "b", desired: 1 });
  });

  it("raises a group that has a healthy box only after two busy minutes, below its maximum", () => {
    const regions = [
      region("a", [box("i-a", "a", "light", { light: "busy" })], { light: group(1, 2) }),
    ];
    expect(pickTestbedSlot(regions, { ...light, busySince: NOW - 119_000 })).toEqual({
      action: "wait",
    });
    expect(pickTestbedSlot(regions, { ...light, busySince: NOW - 120_000 })).toEqual({
      action: "scale",
      region: "a",
      desired: 2,
    });
    expect(pickTestbedSlot(regions, light)).toEqual({ action: "wait" });
  });

  it("waits when every group is at its maximum, one is starting, or none could be read", () => {
    const regions = [
      region("a", [box("i-a", "a", "light", { light: "busy" })], { light: group(1) }),
      region("b", [], { light: group(1) }),
      region("c", [], {}),
    ];
    expect(pickTestbedSlot(regions, { ...light, busySince: 0 })).toEqual({ action: "wait" });
    expect(pickTestbedSlot([], light)).toEqual({ action: "wait" });
  });
});

describe("summarizeTestbedRegion", () => {
  it("counts free and total slots on the boxes that host them, and what may still start", () => {
    const state = region("a", [box("i-h", "a", "heavy", { heavy: "busy", light: "free" })], {
      heavy: group(1),
      light: group(0),
    });
    expect(summarizeTestbedRegion(state)).toEqual({
      region: "a",
      reachable: true,
      heavy: { free: 0, total: 1, startable: 0 },
      light: { free: 1, total: 1, startable: 1 },
      boxes: [{ id: "i-h", kind: "heavy", healthy: true, slots: { heavy: "busy", light: "free" } }],
    });
  });

  it("counts a startable heavy box as a heavy and a light slot, and an unreadable group as none", () => {
    const state = region("a", [], { heavy: group(0) });
    expect(summarizeTestbedRegion(state)).toMatchObject({
      heavy: { free: 0, total: 0, startable: 1 },
      light: { free: 0, total: 0, startable: 1 },
    });
  });

  it("never counts an unhealthy box's slots as free", () => {
    const state = region("a", [box("i-l", "a", "light", {}, false)], { light: group(1) });
    expect(summarizeTestbedRegion(state).light).toEqual({ free: 0, total: 1, startable: 0 });
  });

  it("reports an unreachable region with nothing in it", () => {
    expect(summarizeTestbedRegion(region("a", [], {}, false))).toMatchObject({
      reachable: false,
      heavy: { free: 0, total: 0, startable: 0 },
    });
  });
});

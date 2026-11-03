/**
 * Testbed file contract:
 * Purpose: unit tests of `parseTestbedBoxes` and `orderTestbedBoxes`: launch order, bad input, and which boxes a heavy
 *          and a light job may try.
 * Boundary: test only.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484.
 */
import { describe, expect, it } from "vitest";

import { orderTestbedBoxes } from "#cli/functions/order-testbed-boxes.function";
import { parseTestbedBoxes } from "#cli/functions/parse-testbed-boxes.function";

const rows = JSON.stringify([
  { id: "i-b", ip: "2.2.2.2", group: "light", launch: "2026-10-30T02:00:00Z" },
  { id: "i-a", ip: "1.1.1.1", group: "heavy", launch: "2026-10-30T01:00:00Z" },
  { id: "i-c", ip: null, group: "heavy", launch: "2026-10-30T00:00:00Z" },
]);

describe("parseTestbedBoxes", () => {
  it("sorts by launch time and drops a box without an address", () => {
    expect(parseTestbedBoxes(rows, "eu-west-1").map((box) => box.id)).toEqual(["i-a", "i-b"]);
  });

  it("tags every box with the region it was read in", () => {
    expect(parseTestbedBoxes(rows, "eu-west-2").map((box) => box.region)).toEqual([
      "eu-west-2",
      "eu-west-2",
    ]);
  });

  it("returns no box for unparsable output", () => {
    expect(parseTestbedBoxes("not json", "eu-west-1")).toEqual([]);
    expect(parseTestbedBoxes("{}", "eu-west-1")).toEqual([]);
  });
});

describe("orderTestbedBoxes", () => {
  const boxes = parseTestbedBoxes(rows, "eu-west-1");

  it("gives a heavy job only heavy boxes", () => {
    expect(orderTestbedBoxes(boxes, "heavy", new Set()).map((box) => box.id)).toEqual(["i-a"]);
  });

  it("gives a light job light boxes first, then heavy ones, without skipped boxes", () => {
    expect(orderTestbedBoxes(boxes, "light", new Set()).map((box) => box.id)).toEqual([
      "i-b",
      "i-a",
    ]);
    expect(orderTestbedBoxes(boxes, "light", new Set(["i-b"])).map((box) => box.id)).toEqual([
      "i-a",
    ]);
  });
});

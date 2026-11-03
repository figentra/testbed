/**
 * Stackra file contract:
 * Purpose: unit tests of `claimTestbedSlot`, `releaseTestbedClaim` and `isTestbedClaimStale`: a free claim, a held
 *          one, a stale one and release.
 * Boundary: test only; writes a throwaway folder in the OS temp directory.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@stackra/testing";

import { claimTestbedSlot } from "#node/functions/claim-testbed-slot.function";
import { isTestbedClaimStale } from "#node/functions/is-testbed-claim-stale.function";
import { releaseTestbedClaim } from "#node/functions/release-testbed-claim.function";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "stackra-claim-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("claimTestbedSlot", () => {
  it("refuses a claim held by a live pid and takes it back from a dead one", () => {
    expect(claimTestbedSlot(root, "i-1-heavy", 10, () => true)).toBe(true);
    expect(claimTestbedSlot(root, "i-1-heavy", 11, () => true)).toBe(false);
    expect(claimTestbedSlot(root, "i-1-heavy", 11, () => false)).toBe(true);
  });

  it("frees a claim on release", () => {
    claimTestbedSlot(root, "i-1-light", 10, () => true);
    releaseTestbedClaim(root, "i-1-light");
    expect(claimTestbedSlot(root, "i-1-light", 11, () => true)).toBe(true);
  });
});

describe("isTestbedClaimStale", () => {
  it("is stale without a pid or with a dead one", () => {
    expect(isTestbedClaimStale(undefined, () => true)).toBe(true);
    expect(isTestbedClaimStale(5, () => false)).toBe(true);
    expect(isTestbedClaimStale(5, () => true)).toBe(false);
  });
});

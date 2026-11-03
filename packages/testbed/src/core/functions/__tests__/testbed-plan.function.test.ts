/**
 * Testbed file contract:
 * Purpose: unit tests of `testbedPlan`: two disks with the 200 GB XFS volume at `/data`, both deleted with the
 *          instance; `heavy` on-demand and spot only on `light`; one region; the owner's counts and instance types;
 *          the region's vCPU quotas and the refusal of a plan above them (ADR 0516); the guard, idle and image numbers; grants only when a project id is given and no secret value anywhere;
 *          bad input refused; the toolchain pins equal core's `mise.toml` and catalogue.
 * Boundary: test only; calls no cloud. The pin test reads `mise.toml` and `pnpm-workspace.yaml` from a checkout of
 *           figentra/stackra named by `CORE_CHECKOUT` (the daily testbed-image job sets it) and is skipped without it.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484 (Enforcement); ADR 0173.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TOOLCHAIN_PINS } from "#core/constants/toolchain-pins.constant";
import { testbedPlan } from "#core/functions/testbed-plan.function";

/** A checkout of figentra/stackra, whose `mise.toml` and catalogue the pins must equal. */
const CORE = process.env.CORE_CHECKOUT;

function coreFile(name: string): string {
  return readFileSync(join(CORE ?? "", name), "utf8");
}

describe("testbedPlan", () => {
  const plan = testbedPlan({ identityId: "id-1", ciGateProjectId: "proj-1" });

  it("has two disks, the data volume XFS at /data, both deleted with the instance", () => {
    expect(plan.disks.root).toMatchObject({ sizeGb: 40, type: "gp3" });
    expect(plan.disks.data).toMatchObject({
      sizeGb: 200,
      type: "gp3",
      mount: "/data",
      filesystem: "xfs",
    });
    expect(plan.disks.deleteOnTermination).toBe(true);
  });

  it("keeps heavy on-demand and puts spot only on light", () => {
    expect(plan.groups.heavy).toMatchObject({
      purchase: "on-demand",
      instanceTypes: ["c7i.2xlarge"],
      min: 0,
      max: 1,
    });
    expect(plan.groups.light).toMatchObject({
      purchase: "spot",
      instanceTypes: ["c7i.2xlarge", "c6i.2xlarge", "m7i.2xlarge"],
      min: 0,
      max: 1,
    });
    expect(plan.groups.heavy.name).toBe("stackra-testbed-heavy");
    expect(plan.groups.light.name).toBe("stackra-testbed-light");
  });

  it("plans one of the four regions, eu-west-1 by default and the only home (STA-2042)", () => {
    expect(plan.region).toBe("eu-west-1");
    expect(plan.home).toBe(true);
    for (const region of ["eu-west-2", "eu-central-1", "us-east-1"]) {
      expect(testbedPlan({ region })).toMatchObject({ region, home: false });
    }
    expect(() => testbedPlan({ region: "ap-south-1" })).toThrow();
  });

  it("carries the guard, idle and image numbers", () => {
    expect(plan.guard).toMatchObject({
      cleanupPercent: 70,
      drainPercent: 85,
      rootMinFreeGb: 10,
      turboCacheGb: 20,
      seedMaxAgeDays: 7,
    });
    expect(plan.idleMinutes).toBe(60);
    expect(plan.image).not.toHaveProperty("schedule");
    expect(plan.image.amiParameter).toBe("/imagebuilder/stackra-testbed/ami");
  });

  it("fits the region's vCPU quotas, 8 on-demand and 8 spot by default (ADR 0516)", () => {
    expect(plan.quota).toEqual({ onDemandVcpus: 8, spotVcpus: 8 });
    expect(
      testbedPlan({ quota: { onDemandVcpus: 32, spotVcpus: 16 }, heavy: { max: 3 } }).quota,
    ).toEqual({ onDemandVcpus: 32, spotVcpus: 16 });
  });

  it("refuses a plan above the on-demand or the spot vCPU quota (ADR 0516)", () => {
    expect(() => testbedPlan({ heavy: { max: 2 } })).toThrow(/on-demand vCPU quota/);
    expect(() => testbedPlan({ light: { max: 2 } })).toThrow(/spot vCPU quota/);
    expect(() => testbedPlan({ quota: { onDemandVcpus: 4, spotVcpus: 8 } })).toThrow(
      /on-demand vCPU quota/,
    );
  });

  it("keeps room for the manual image build beside the heavy minimum (ADR 0516)", () => {
    expect(() => testbedPlan({ heavy: { min: 1, max: 1 } })).toThrow(/image build/);
    expect(() =>
      testbedPlan({ quota: { onDemandVcpus: 16, spotVcpus: 8 }, heavy: { min: 1, max: 1 } }),
    ).not.toThrow();
    // Only the home region builds, so a member region may keep its heavy box up.
    expect(() => testbedPlan({ region: "eu-west-2", heavy: { min: 1, max: 1 } })).not.toThrow();
  });

  it("grants figentra-ci paths to the core project, ids only", () => {
    expect(plan.secretGrants.projects.core).toEqual([
      { projectId: "proj-1", environment: "prod", path: "/ci" },
      { projectId: "proj-1", environment: "prod", path: "/ci/turbo" },
    ]);
    expect(
      testbedPlan({ identityId: "id-1", ciGateProjectId: "proj-1", turboProjectId: "proj-2" })
        .secretGrants.projects.core?.[1],
    ).toEqual({ projectId: "proj-2", environment: "prod", path: "/ci/turbo" });
    expect(plan.secretGrants.identityName).toBe("gate");
    expect(testbedPlan().secretGrants.projects).toEqual({});
  });

  it("refuses spot for heavy, a minimum above the maximum and a bad region", () => {
    expect(() => testbedPlan({ heavy: { min: 2, max: 1 } })).toThrow();
    expect(() => testbedPlan({ region: "mars" })).toThrow();
    expect(() => testbedPlan({ spot: true } as never)).toThrow();
  });

  it.skipIf(CORE === undefined)("pins the toolchain to core's mise.toml and catalogue", () => {
    const mise = coreFile("mise.toml");
    expect(mise).toContain(`node = "${TOOLCHAIN_PINS.node}"`);
    expect(mise).toContain(`pnpm = "${TOOLCHAIN_PINS.pnpm}"`);
    expect(mise).toContain(`"github:Infisical/cli" = "${TOOLCHAIN_PINS.infisical}"`);
    expect(mise).toContain(`shfmt = "${TOOLCHAIN_PINS.shfmt}"`);
    expect(coreFile("pnpm-workspace.yaml")).toContain(
      `"@playwright/test": ${TOOLCHAIN_PINS.playwright}`,
    );
    expect(plan.toolchain.node).toBe(TOOLCHAIN_PINS.node);
  });
});

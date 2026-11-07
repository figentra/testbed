/**
 * Testbed file contract:
 * Purpose: `testbedPlan(input?)`, the testbed as plain data for one of the four regions, `home` when it is eu-west-1
 *          (the home also builds the image, STA-2042): a `heavy` on-demand group (c7i.2xlarge, 0 to 1) and a
 *          `light` spot group (c7i, c6i and m7i 2xlarge, 0 to 1), sized to the region's vCPU quotas (8 on-demand,
 *          8 spot), a 40 GB root and a 200 GB XFS `/data` disk deleted with the instance, the guard
 *          thresholds, the 60 minute idle stop, the image parameters (built by hand, no schedule), the toolchain pins
 *          and the secret grants (core's CI build scopes of figentra/secrets, and the registry read scope for every
 *          project, `*`). The result is validated by zod, which refuses a plan above the quotas.
 * Boundary: pure; no Pulumi, no Node, no cloud. A grant holds scope names, never a value (ADR 0173, ADR 0525); what a
 *           box may really read is figentra/infra's grant to the instance role.
 * Runtime: isomorphic
 * Governing contract: ADR 0484 (decisions 2 to 9); ADR 0516 (quotas); ADR 0173; the owner's answers of 2026-10-30
 *                     and 2026-11-02 (option A: each group 0 to 1); 2026-11-03 (a pool in each of the four
 *                     regions, STA-2042).
 */
import { TESTBED_DEFAULTS as D } from "#core/constants/testbed-defaults.constant";
import { TESTBED_PLAN_INPUT_SCHEMA } from "#core/constants/testbed-plan-input-schema.constant";
import { TESTBED_PLAN_SCHEMA } from "#core/constants/testbed-plan-schema.constant";
import { TOOLCHAIN_PINS } from "#core/constants/toolchain-pins.constant";
import type { TestbedPlan } from "#core/types/testbed-plan.type";
import type { TestbedPlanInput } from "#core/types/testbed-plan-input.type";

/**
 * Plans the testbed.
 *
 * @param input - optional region, group counts and the region's vCPU quotas.
 * @throws ZodError when the input or the resulting plan breaks a rule.
 * @example
 * const plan = testbedPlan({ region: config.get("region") });
 */
export function testbedPlan(input: TestbedPlanInput = {}): TestbedPlan {
  const given = TESTBED_PLAN_INPUT_SCHEMA.parse(input);
  const grants = {
    // The scopes CI's build reads: the licence tokens in ci/build, the remote cache in ci/build/turbo.
    core: ["ci/build", "ci/build/turbo"],
    // Every project, core included: the registry read token, so a repository that installs @figentra/* (every
    // product) can install on a box (owner-todo item 7). The agent merges `*` into each project's scopes.
    "*": ["ci/build/registry"],
  };

  return TESTBED_PLAN_SCHEMA.parse({
    region: given.region ?? D.region,
    home: (given.region ?? D.region) === D.homeRegion,
    groups: {
      heavy: {
        name: `${D.groupPrefix}-heavy`,
        purchase: "on-demand",
        instanceTypes: ["c7i.2xlarge"],
        min: given.heavy?.min ?? 0,
        max: given.heavy?.max ?? 1,
        slots: ["heavy", "light"],
      },
      light: {
        name: `${D.groupPrefix}-light`,
        purchase: "spot",
        instanceTypes: ["c7i.2xlarge", "c6i.2xlarge", "m7i.2xlarge"],
        min: given.light?.min ?? 0,
        max: given.light?.max ?? 1,
        slots: ["light"],
      },
    },
    quota: given.quota ?? { ...D.quota },
    disks: {
      root: { sizeGb: 40, type: "gp3", deviceName: "/dev/sda1" },
      data: {
        sizeGb: 200,
        type: "gp3",
        deviceName: "/dev/sdf",
        mount: D.dataMount,
        filesystem: "xfs",
      },
      deleteOnTermination: true,
    },
    guard: { ...D.guard },
    idleMinutes: D.idleMinutes,
    jobTimeoutHours: D.jobTimeoutHours,
    image: {
      amiParameter: D.amiParameter,
      baseImageParameter: D.baseImageParameter,
    },
    toolchain: { ...TOOLCHAIN_PINS },
    secretGrants: { workloadIdentityProvider: D.googleProvider, projects: grants },
    tags: { groupKey: D.groupTagKey, environment: D.environmentTag, service: D.serviceTag },
  });
}

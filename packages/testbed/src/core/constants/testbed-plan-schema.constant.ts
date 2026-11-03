/**
 * Testbed file contract:
 * Purpose: `TESTBED_PLAN_SCHEMA`, the zod schema of the testbed plan. It holds the rules ADR 0484 states: a heavy group is on-demand
 *          and a light group is spot (a heavy job never lands on spot), a group's minimum never exceeds its maximum,
 *          the data volume is mounted at `/data`, both disks are deleted with the instance, and the drain threshold
 *          sits above the cleanup threshold. It also holds ADR 0516: every instance type has a known vCPU count, each
 *          group's maximum fits its purchase option's quota, and the manual image build (a heavy-type on-demand
 *          instance) fits beside the heavy group's minimum in the home region, the only one that builds. The region
 *          is one of the four, and `home` says whether it is the home region (STA-2042).
 * Boundary: schemas only; pure and Pulumi-free. A secret grant holds ids, environments and paths, never a value.
 * Runtime: isomorphic
 * Governing contract: ADR 0484 (decisions 3, 4, 8, 9); ADR 0516 (decisions 2 and 4); ADR 0173 (names and paths only).
 */
import { z } from "zod";

import { INSTANCE_VCPUS } from "#core/constants/instance-vcpus.constant";
import { TESTBED_DEFAULTS } from "#core/constants/testbed-defaults.constant";

const COUNT = z.number().int().min(0).max(50);

/** The most vCPUs one instance of the group's types can have; a type with no known count is refused before this runs. */
const vcpusOf = (types: readonly string[]): number =>
  Math.max(...types.map((type) => INSTANCE_VCPUS[type] ?? 0));

const GROUP = z
  .object({
    name: z.string().min(1),
    purchase: z.enum(["on-demand", "spot"]),
    instanceTypes: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9]+\.[a-z0-9]+$/)
          .refine(
            (type) => INSTANCE_VCPUS[type] !== undefined,
            "an instance type with no known vCPU count",
          ),
      )
      .min(1),
    min: COUNT,
    max: COUNT.min(1),
    slots: z.array(z.enum(["heavy", "light"])).min(1),
  })
  .strict()
  .refine((group) => group.min <= group.max, "min must not exceed max");

const DISK = z.object({
  sizeGb: z.number().int().positive(),
  type: z.literal("gp3"),
  deviceName: z.string().startsWith("/dev/"),
});

const GRANT = z
  .object({
    projectId: z.string().min(1),
    environment: z.string().min(1),
    path: z.string().startsWith("/"),
  })
  .strict();

/** The plan: plain data the program declares and the tests assert. */
export const TESTBED_PLAN_SCHEMA = z
  .object({
    /** One of the four regions (STA-2042); the home region also holds the global resources and the image pipeline. */
    region: z.enum(TESTBED_DEFAULTS.regions),
    home: z.boolean(),
    groups: z
      .object({
        heavy: GROUP.refine((group) => group.purchase === "on-demand", "heavy is on-demand"),
        light: GROUP.refine((group) => group.purchase === "spot", "light is spot"),
      })
      .strict(),
    disks: z
      .object({
        root: DISK,
        data: DISK.extend({ mount: z.literal("/data"), filesystem: z.literal("xfs") }),
        deleteOnTermination: z.literal(true),
      })
      .strict(),
    guard: z
      .object({
        cleanupPercent: z.number().int().min(1).max(99),
        drainPercent: z.number().int().min(1).max(99),
        rootMinFreeGb: z.number().int().positive(),
        turboCacheGb: z.number().int().positive(),
        seedMaxAgeDays: z.number().int().positive(),
        intervalMinutes: z.number().int().positive(),
      })
      .strict()
      .refine((guard) => guard.cleanupPercent < guard.drainPercent, "drain sits above cleanup"),
    idleMinutes: z.number().int().positive(),
    jobTimeoutHours: z.number().int().positive(),
    /** The region's vCPU quotas the plan was sized to (ADR 0516). */
    quota: z
      .object({
        onDemandVcpus: z.number().int().positive(),
        spotVcpus: z.number().int().positive(),
      })
      .strict(),
    /** No schedule: the image is built by hand, only while the heavy group is at its minimum (ADR 0516). */
    image: z
      .object({
        amiParameter: z.string().startsWith("/"),
        baseImageParameter: z.string().startsWith("/"),
      })
      .strict(),
    toolchain: z.record(z.string(), z.string().min(1)),
    secretGrants: z
      .object({
        /** The Infisical machine identity name; its id is a Pulumi config input, an id and not a secret. */
        identityName: z.string().min(1),
        identityId: z.string().min(1).optional(),
        /** Project name (as `testbed run` names it) to the paths a job of it may read. */
        projects: z.record(z.string(), z.array(GRANT)),
      })
      .strict(),
    tags: z
      .object({
        groupKey: z.string().min(1),
        environment: z.string().min(1),
        service: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .refine(
    ({ groups, quota }) =>
      groups.heavy.max * vcpusOf(groups.heavy.instanceTypes) <= quota.onDemandVcpus,
    "the heavy group's maximum exceeds the on-demand vCPU quota (ADR 0516)",
  )
  .refine(
    ({ groups, quota }) =>
      groups.light.max * vcpusOf(groups.light.instanceTypes) <= quota.spotVcpus,
    "the light group's maximum exceeds the spot vCPU quota (ADR 0516)",
  )
  .refine(
    ({ home, groups, quota }) =>
      !home || (groups.heavy.min + 1) * vcpusOf(groups.heavy.instanceTypes) <= quota.onDemandVcpus,
    "the image build needs room beside the heavy group's minimum in the on-demand vCPU quota (ADR 0516)",
  );

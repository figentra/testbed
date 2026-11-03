/**
 * Stackra file contract:
 * Purpose: `TESTBED_PLAN_INPUT_SCHEMA`, the zod schema of the few inputs `testbedPlan` takes: region, group counts,
 *          the region's vCPU quotas and the two Infisical ids. Every field is optional; the plan fills the owner's answers of 2026-10-30.
 * Boundary: a schema only; pure and Pulumi-free. The ids are ids, never secrets.
 * Runtime: isomorphic
 * Governing contract: ADR 0484 (decisions 8 and 9); ADR 0516 (quotas); ADR 0173.
 */
import { z } from "zod";

const COUNT = z.number().int().min(0).max(50);

/** What a caller may set; every field defaults to the owner's answers of 2026-10-30. */
export const TESTBED_PLAN_INPUT_SCHEMA = z
  .object({
    region: z.string().optional(),
    heavy: z
      .object({ min: COUNT.optional(), max: COUNT.min(1).optional() })
      .strict()
      .optional(),
    light: z
      .object({ min: COUNT.optional(), max: COUNT.min(1).optional() })
      .strict()
      .optional(),
    /** The region's vCPU quotas the plan must fit, read with `aws service-quotas` (ADR 0516); default the 2026-11-02 read. */
    quota: z
      .object({ onDemandVcpus: COUNT.min(1), spotVcpus: COUNT.min(1) })
      .strict()
      .optional(),
    /** Infisical machine identity id: the shared gate identity (CI's INFISICAL_GATE_IDENTITY_ID), from Pulumi config. */
    identityId: z.string().min(1).optional(),
    /** Infisical project id of `ci-build`, from Pulumi config; without it no project has a grant. */
    ciGateProjectId: z.string().min(1).optional(),
    /** Infisical project id holding `/ci/turbo` when it is not `ciGateProjectId` (CI's INFISICAL_TURBO_PROJECT_ID). */
    turboProjectId: z.string().min(1).optional(),
    /** The Infisical environment slug the grants read. */
    infisicalEnvironment: z.string().min(1).optional(),
  })
  .strict();

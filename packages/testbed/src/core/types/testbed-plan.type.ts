/**
 * Stackra file contract:
 * Purpose: `TestbedPlan`, the plain-data plan `testbedPlan` returns and `awsTestbed` declares.
 * Boundary: a type only, inferred from the zod schema so the two cannot drift.
 * Runtime: isomorphic
 * Governing contract: ADR 0484.
 */
import type { z } from "zod";

import type { TESTBED_PLAN_SCHEMA } from "#core/constants/testbed-plan-schema.constant";

/** The complete testbed plan that `testbedPlan` returns, with every default filled in. */
export type TestbedPlan = z.infer<typeof TESTBED_PLAN_SCHEMA>;

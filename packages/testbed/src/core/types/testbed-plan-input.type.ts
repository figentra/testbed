/**
 * Stackra file contract:
 * Purpose: `TestbedPlanInput`, the optional inputs of `testbedPlan`.
 * Boundary: a type only, inferred from the zod schema.
 * Runtime: isomorphic
 * Governing contract: ADR 0484.
 */
import type { z } from "zod";

import type { TESTBED_PLAN_INPUT_SCHEMA } from "#core/constants/testbed-plan-input-schema.constant";

/** What `testbedPlan` accepts: every field optional, defaults filled in by the schema. */
export type TestbedPlanInput = z.input<typeof TESTBED_PLAN_INPUT_SCHEMA>;

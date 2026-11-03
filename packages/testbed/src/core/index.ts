/**
 * Testbed file contract:
 * Purpose: the `.` entry of @figentra/testbed: `testbedPlan`, the testbed as zod-validated plain data, the defaults
 *          the `testbed` CLI and the box agent share (`TESTBED_DEFAULTS`), the one set of toolchain pins
 *          (`TOOLCHAIN_PINS`), the boot script (`testbedUserData`), and the plan schema and types.
 * Boundary: names each re-export and declares nothing. Pure and Pulumi-free; the Pulumi program is `./node`'s.
 * Runtime: isomorphic
 * Governing contract: ADR 0484.
 */
export { INSTANCE_VCPUS } from "#core/constants/instance-vcpus.constant";
export { TESTBED_DEFAULTS } from "#core/constants/testbed-defaults.constant";
export { TESTBED_PLAN_INPUT_SCHEMA } from "#core/constants/testbed-plan-input-schema.constant";
export { TESTBED_PLAN_SCHEMA } from "#core/constants/testbed-plan-schema.constant";
export { TOOLCHAIN_PINS } from "#core/constants/toolchain-pins.constant";
export { testbedPlan } from "#core/functions/testbed-plan.function";
export { testbedUserData } from "#core/functions/testbed-user-data.function";
export type { TestbedPlan } from "#core/types/testbed-plan.type";
export type { TestbedPlanInput } from "#core/types/testbed-plan-input.type";

/**
 * Testbed file contract:
 * Purpose: `INSTANCE_VCPUS`, the vCPU count of every instance type the testbed plan may name, so the plan can be held to
 *          the region's vCPU quotas (ADR 0516); a type missing here is refused by the plan schema.
 * Boundary: data only; pure and Pulumi-free. Add a type here before a plan names it.
 * Runtime: isomorphic
 * Governing contract: ADR 0516 (decision 4); ADR 0484 (decision 8).
 */

/** Instance type to its vCPUs. */
export const INSTANCE_VCPUS: Readonly<Record<string, number>> = {
  "c7i.2xlarge": 8,
  "c6i.2xlarge": 8,
  "m7i.2xlarge": 8,
};

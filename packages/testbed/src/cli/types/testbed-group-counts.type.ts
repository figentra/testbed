/**
 * Testbed file contract:
 * Purpose: `TestbedGroupCounts`, the desired, maximum and minimum size of one Auto Scaling group.
 * Boundary: type only; `runTestbed` reads it from `aws autoscaling describe-auto-scaling-groups`.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */

/** A group's desired, maximum and minimum counts. */
export type TestbedGroupCounts = {
  /** The desired count. */
  readonly desired: number;

  /** The largest count the group may reach. */
  readonly max: number;

  /** The smallest count the group keeps. */
  readonly min: number;
};

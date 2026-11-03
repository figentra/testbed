/**
 * Stackra file contract:
 * Purpose: `TESTBED_CLI_DEFAULTS`, the defaults of `stackra testbed`: AWS profile, enabled regions, key file, user, security group,
 *          the SSM parameter of the image, the group name prefix, the instance tag and the fallback workflow.
 * Boundary: data only; every default is overridable by `STACKRA_TESTBED_*` or a flag, none is a secret.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/** Defaults of `stackra testbed` (the agent contract names them). */
export const TESTBED_CLI_DEFAULTS = {
  /** The AWS CLI profile that reaches the testbed account. */
  profile: "academorix",
  /**
   * The enabled regions in the order a run tries them. A region joins by a one-line change here once its old pair is
   * stopped; the full order is eu-west-1, eu-west-2, eu-central-1, us-east-1 (STA-2042).
   */
  regions: ["eu-west-1"],
  /** The SSH private key, relative to the home folder. */
  key: ".ssh/academorix-ci.pem",
  /** The SSH user on every box. */
  user: "ubuntu",
  /** The security group whose port 22 rule the CLI swaps to this machine. */
  securityGroup: "stackra-testbed",
  /** The SSM parameter holding the newest AMI id. */
  imageParameter: "/imagebuilder/stackra-testbed/ami",
  /** The Auto Scaling group name before the slot kind (`heavy`, `light`). */
  groupPrefix: "stackra-testbed-",
  /** The instance tag whose value names the box group. */
  tag: "stackra:testbed",
  /** The GitHub workflow dispatched when no box is healthy. */
  fallbackWorkflow: "testbed-fallback.yml",
} as const;

/**
 * Testbed file contract:
 * Purpose: `AwsTestbedOptions`, what `awsTestbed` takes besides the plan: the SSH allowlist, the core lockfile the
 *          image warms its pnpm store from, an optional VPC and subnets (the default VPC otherwise), extra tags, and
 *          `groups: false` for the first apply (image pipeline only, before the first AMI exists).
 * Boundary: a type only.
 * Runtime: node
 * Governing contract: ADR 0484 (decisions 2, 3, 8, 9).
 */
/** The account-specific inputs of `awsTestbed` that the plan does not carry. */
export type AwsTestbedOptions = {
  /**
   * CIDRs allowed to reach port 22, only for the CLI's `--ssh-direct` fallback; absent or empty, no inbound rule exists
   * and boxes are reached through SSM Session Manager (STA-1953). The CLI swaps its own entry at run time, so changes
   * to the live rules are ignored after creation.
   */
  readonly allowedCidrs?: readonly string[];
  /** The core `pnpm-lock.yaml` the image's pnpm store is warmed from. */
  readonly lockfilePath: string;
  /** The VPC to use; the default VPC when absent. */
  readonly vpcId?: string;
  /** The subnets the groups spread over, the first one also for the image build; every subnet of the VPC when absent. */
  readonly subnetIds?: readonly string[];
  /** Extra tags added to every resource, beside the plan's environment and service tags. */
  readonly tags?: Readonly<Record<string, string>>;
  /** `false` declares everything except the Auto Scaling groups: the launch template needs an AMI to exist. Default `true`. */
  readonly groups?: boolean;
  /**
   * The ARN of the permissions boundary set on every role the program creates (the box's and Image Builder's). The
   * deploy role may create a role only with it (ADR 0484; the day-1 least-privilege bar), so it cannot mint an admin.
   * Absent, the roles have none.
   */
  readonly permissionsBoundary?: string;
};

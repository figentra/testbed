/**
 * Stackra file contract:
 * Purpose: `AwsTestbed`, what `awsTestbed` returns: the ids a stack exports and the owner copies (the instance role
 *          ARN goes into the Infisical machine identity's AWS auth, the AMI parameter and the pipeline ARN into the
 *          image runbook).
 * Boundary: a type only; every value is an id or a name, never a secret.
 * Runtime: node
 * Governing contract: ADR 0484; ADR 0173.
 */
import type * as pulumi from "@pulumi/pulumi";

/** What `awsTestbed` declared: the ids and names the owner and the CLI read from the stack outputs. */
export type AwsTestbed = {
  /** The AWS region of this stack's pool. */
  readonly region: string;
  /** Whether this is the home region, whose stack also holds the global roles and the image pipeline (STA-2042). */
  readonly home: boolean;
  /** The id of the security group that allows SSH from the allowlist only. */
  readonly securityGroupId: pulumi.Output<string>;
  /** The ARN of the box instance role, the principal the Infisical AWS Auth trusts; home only. */
  readonly instanceRoleArn?: pulumi.Output<string>;
  /** The id of the launch template both groups start boxes from; absent, like `groups`, before the first image. */
  readonly launchTemplateId?: pulumi.Output<string>;
  /** The name of the bucket holding the image build inputs; home only. */
  readonly buildBucket?: pulumi.Output<string>;
  /** The ARN of the image pipeline, which `apply-testbed.yml` starts by hand; home only. */
  readonly imagePipelineArn?: pulumi.Output<string>;
  /** The Image Builder version derived from the build inputs; home only. */
  readonly imageVersion?: string;
  /** The SSM parameter the pipeline writes the newest AMI id to. */
  readonly amiParameter: string;
  /** Auto Scaling group names; absent when the program ran with `groups: false`. */
  readonly groups?: { readonly heavy: string; readonly light: string };
};

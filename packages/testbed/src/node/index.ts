/**
 * Testbed file contract:
 * Purpose: the `./node` entry of @figentra/testbed: `awsTestbed`, which declares the testbed (security group, role,
 *          launch template, the `heavy` and `light` Auto Scaling groups and the Image Builder pipeline) inside a Pulumi
 *          program, with its option and result types.
 * Boundary: names each re-export and declares nothing. Node only: it reads this package's image files and loads
 *           Pulumi. Imports `.` internals one way; exports none of `.`'s symbols.
 * Runtime: node
 * Governing contract: ADR 0484.
 */
export { awsTestbed } from "#node/functions/aws-testbed.function";
export type { AwsTestbed } from "#node/types/aws-testbed.type";
export type { AwsTestbedOptions } from "#node/types/aws-testbed-options.type";

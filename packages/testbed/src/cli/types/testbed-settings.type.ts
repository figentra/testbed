/**
 * Stackra file contract:
 * Purpose: `TestbedSettings`, where and as whom `stackra testbed` reaches the boxes: AWS profile and region, SSH key and user.
 * Boundary: type only; `resolveTestbedSettings` builds it.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/** The connection settings of one `stackra testbed` run. */
export type TestbedSettings = {
  /** The AWS CLI profile. */
  readonly profile: string;

  /** The region of single-region verbs (`image`): the first enabled region. */
  readonly region: string;

  /** The enabled regions in the order a run tries them; no call is ever made in a region outside this list. */
  readonly regions: readonly string[];

  /** The SSH private key file; a path, never its content. */
  readonly key: string;

  /** The SSH user on the box. */
  readonly user: string;

  /**
   * `--ssh-direct` or `STACKRA_TESTBED_SSH_DIRECT=1`: reach a box at its public IP, swapping this machine's address into
   * the security group, instead of through SSM Session Manager (the default, no inbound port 22).
   */
  readonly sshDirect?: boolean;
};

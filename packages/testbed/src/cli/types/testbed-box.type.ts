/**
 * Stackra file contract:
 * Purpose: `TestbedBox`, one running testbed instance as `stackra testbed` sees it.
 * Boundary: type only; `parseTestbedBoxes` builds it.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/** One running testbed instance. */
export type TestbedBox = {
  /** The EC2 instance id. */
  readonly id: string;

  /** The AWS region it runs in; its SSM proxy and every `aws` call for it use this region. */
  readonly region: string;

  /** Its public IPv4 address. */
  readonly ip: string;

  /** Its group, the value of the `stackra:testbed` tag: `heavy` or `light`. */
  readonly group: string;

  /** Its launch time, milliseconds since the epoch. */
  readonly launchedAt: number;
};

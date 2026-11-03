/**
 * Stackra file contract:
 * Purpose: `TestbedComponentSource`, one Image Builder component: its name and its document with placeholders.
 * Boundary: a type only.
 * Runtime: node
 * Governing contract: ADR 0484 (decision 2).
 */

/** One Image Builder component of the host image, before its placeholders are filled. */
export type TestbedComponentSource = {
  /** The component name, for example `testbed-base`. */
  readonly name: string;
  /** The component's YAML document from `images/host/components`. */
  readonly document: string;
};

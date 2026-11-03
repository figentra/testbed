/**
 * Stackra file contract:
 * Purpose: `TestbedRequest`, one parsed `stackra testbed` command line: the verb, its arguments, the flags and the
 *          connection settings.
 * Boundary: type only; the command builds it and `runTestbed` runs it.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import type { TestbedSettings } from "#node/types/testbed-settings.type";

/** One `stackra testbed <verb>` call. */
export type TestbedRequest = {
  /** `run`, `status`, `unlock`, `ip`, `ssh`, `sync`, `scale` or `image`. */
  readonly verb: string;

  /** The arguments after the verb. */
  readonly args: readonly string[];

  /** The directory a relative `<dir>` is read from. */
  readonly cwd: string;

  /** `--box`: a number (by launch time, from 1) or an instance id. */
  readonly box: string | undefined;

  /** `--slot`: `heavy` or `light`. */
  readonly slot: string | undefined;

  /** `--preset`: the fallback workflow preset. */
  readonly preset: string | undefined;

  /** `--ref`: the git ref the fallback workflow runs. */
  readonly ref: string | undefined;

  /** `--no-wait`: with no healthy box, exit 75 instead of waiting. */
  readonly noWait: boolean;

  /** `--on-demand`: run in the heavy (on-demand) slot whatever the command, so spot never interrupts it. */
  readonly onDemand: boolean;

  /** `--json`: `run` streams the job to stderr and prints one result line on stdout; `status` prints JSON. */
  readonly json: boolean;

  /** Where and as whom the boxes are reached. */
  readonly settings: TestbedSettings;
};

/**
 * Stackra file contract:
 * Purpose: `TestbedDeps`, everything `runTestbed` takes from outside: the processes it starts, the clock, the claim folder and this Mac's public IP, so tests fake all of it.
 * Boundary: type only; the command builds the real one, a test builds a fake.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import type { ToolOutput } from "#node/types/tool-output.type";

/** The outside world of one `stackra testbed` run. */
export type TestbedDeps = {
  /** Runs a program without a shell and captures its output; `undefined` when it cannot start. */
  readonly exec: (command: string, args: readonly string[]) => Promise<ToolOutput | undefined>;

  /** Runs a program without a shell with its output on the command's io; resolves with its exit code. */
  readonly stream: (command: string, args: readonly string[]) => Promise<number>;

  /** Waits the given number of milliseconds. */
  readonly sleep: (milliseconds: number) => Promise<void>;

  /** Milliseconds since the epoch. */
  readonly now: () => number;

  /** This process's id, written into a claim. */
  readonly pid: number;

  /** Whether a process is alive. */
  readonly isAlive: (pid: number) => boolean;

  /** This Mac's public IPv4 address, or `undefined` when it cannot be read. */
  readonly publicIp: () => Promise<string | undefined>;

  /** The folder of the Mac-side claims. */
  readonly claimRoot: string;
};

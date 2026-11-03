/**
 * Testbed file contract:
 * Purpose: `CliUsageError`, a `testbed` command line that cannot run as written (no verb, an unknown verb or slot, a
 *          missing argument): `runTestbedCli` prints its message and the usage and exits with 2.
 * Boundary: a plain `Error`; a failed tool or job is an exit code, not this error.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI); POSIX exit status 2 for a usage error.
 */

/**
 * A command line that cannot run as written.
 *
 * @example
 * throw new CliUsageError("unknown slot: medium (expected heavy or light)");
 */
export class CliUsageError extends Error {
  /**
   * @param message - what is wrong with the command line.
   */
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

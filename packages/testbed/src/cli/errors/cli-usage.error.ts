/**
 * Testbed file contract:
 * Purpose: `CliUsageError`, a `testbed` command line that cannot run as written (an unknown preset, `--preset` without
 *          `--ref`, a wrong number of arguments): a @stackra/console `UsageError`, so the console prints it on stderr,
 *          leaves stdout empty and exits with 2.
 * Boundary: a `UsageError`; a failed tool or job is an exit code, not this error.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI); ADR 0506 (the console); POSIX exit status 2 for a usage error.
 */
import { UsageError } from "@stackra/console";

/**
 * A command line that cannot run as written.
 *
 * @example
 * throw new CliUsageError("unknown preset: lint (verify|e2e|integration)");
 */
export class CliUsageError extends UsageError {
  /**
   * @param message - what is wrong with the command line.
   */
  constructor(message: string) {
    super(message, "Run it with --help to see its usage");
    this.name = "CliUsageError";
  }
}

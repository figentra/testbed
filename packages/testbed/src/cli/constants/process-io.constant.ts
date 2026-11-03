/**
 * Testbed file contract:
 * Purpose: `PROCESS_IO`, the io of the `testbed` bin: this process's standard output and error, with started tools
 *          inheriting the terminal so `ssh` and a streamed job behave as if run directly.
 * Boundary: writes to this process's streams only.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI).
 */
import type { CliIo } from "#cli/types/cli-io.type";

/** The bin's own streams. */
export const PROCESS_IO: CliIo = {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
  inherit: true,
};

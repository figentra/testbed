/**
 * Testbed file contract:
 * Purpose: `CliIo`, where `testbed` writes: its normal output, its errors, and whether a tool it starts may take over
 *          this process's terminal.
 * Boundary: type only. `TestbedCommand` passes the console run's stdout and stderr; a test passes an io that collects
 *           the text. Streamed tools share the streams through the console's `io.process`, not through this io.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI).
 */

/** The output streams of one command run. */
export type CliIo = {
  /** Writes normal output. */
  readonly out: (text: string) => void;

  /** Writes errors and diagnostics. */
  readonly err: (text: string) => void;

  /** True when a started tool inherits this process's stdio (a terminal); false when its output is piped here. */
  readonly inherit: boolean;
};

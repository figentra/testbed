/**
 * Testbed file contract:
 * Purpose: `ToolOutput`, what one captured tool run left behind: its exit code and its standard output and error, kept
 *          apart so a JSON answer on stdout parses.
 * Boundary: type only; `runCaptured` builds it, or returns `undefined` when the tool cannot start.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI).
 */

/** The captured result of one tool process. */
export type ToolOutput = {
  /** The exit code. */
  readonly code: number;

  /** Everything the tool wrote to standard output. */
  readonly stdout: string;

  /** Everything the tool wrote to standard error. */
  readonly stderr: string;
};

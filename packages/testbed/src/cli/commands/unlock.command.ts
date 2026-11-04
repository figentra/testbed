/**
 * Testbed file contract:
 * Purpose: `UnlockCommand`, `unlock`: stops the job that holds a box's slot (`--box`, `--slot`, heavy by default).
 * Boundary: no arguments; the flags and the run are `TestbedCommand`'s, the behaviour `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console).
 */
import { TestbedCommand } from "#cli/bases/testbed-command.base";

/** `testbed unlock`. */
export class UnlockCommand extends TestbedCommand({
  name: "unlock",
  description: "Stop the job holding a box's slot (the heavy slot unless --slot light)",
}) {}

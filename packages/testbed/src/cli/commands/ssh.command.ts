/**
 * Testbed file contract:
 * Purpose: `SshCommand`, `testbed ssh [command...]`: a shell on a box, or one command there, sharing this process's
 *          streams (`testbed --box 2 ssh` and `testbed ssh --box 2` both pick box 2).
 * Boundary: the words of the command are joined with spaces for the box's shell; the flags and the run are
 *           `TestbedCommand`'s, the behaviour `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console).
 */
import { Argument } from "@stackra/console";
import { List } from "@stackra/validation";

import { TestbedCommand } from "#cli/bases/testbed-command.base";

/** `testbed ssh`. */
export class SshCommand extends TestbedCommand({
  name: "ssh",
  description: "Open a shell on a box, or run one command there",
  examples: ["testbed ssh --box 2", "testbed ssh -- df -h /data"],
}) {
  /** The command to run; none opens a shell. */
  @Argument({ description: "The command to run on the box; none opens a shell" })
  @List
  command?: string[];

  /** The command's words. */
  override args(): readonly string[] {
    return this.command ?? [];
  }
}

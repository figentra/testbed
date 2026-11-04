/**
 * Testbed file contract:
 * Purpose: `RunCommand`, `testbed run "<session> <what>" <directory> "<command>"`: syncs the directory to a free box
 *          and runs the command there under the slot's lock. `--json` prints one line on stdout,
 *          `{region, box, slot, waitSeconds, runSeconds, exitCode}`, with the job's own output on stderr; the exit is
 *          the job's (124 for its timeout), 73 for every slot busy and 75 for no healthy box under `--no-wait`, and 2 for
 *          a usage error or a refused nested call.
 * Boundary: three arguments; the flags and the run are `TestbedCommand`'s, the behaviour `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console).
 */
import { Argument } from "@stackra/console";

import { TestbedCommand } from "#cli/bases/testbed-command.base";

/** `testbed run`. */
export class RunCommand extends TestbedCommand({
  name: "run",
  description: "Run a command on a free box under its slot's lock",
  examples: [
    'testbed run "me lint" . "pnpm lint"',
    'testbed run "me verify" . "pnpm verify" --json --preset verify --ref main',
  ],
}) {
  /** Who runs it and what, shown on the box. */
  @Argument({ description: 'Who runs it and what, as "<session> <what>"' })
  session!: string;

  /** The directory synced to the box. */
  @Argument({ description: "The directory to sync to the box" })
  directory!: string;

  /** The command run on the box, as one string. */
  @Argument({ description: "The command to run on the box, as one string" })
  command!: string;

  /** The three arguments, in `runTestbed`'s order. */
  override args(): readonly string[] {
    return [this.session, this.directory, this.command];
  }
}

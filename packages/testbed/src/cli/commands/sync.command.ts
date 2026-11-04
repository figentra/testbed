/**
 * Testbed file contract:
 * Purpose: `SyncCommand`, `testbed sync <directory>`: prepares a job directory on a box, syncs the directory into it
 *          and prints its path there.
 * Boundary: one argument; the flags and the run are `TestbedCommand`'s, the behaviour `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console).
 */
import { Argument } from "@stackra/console";

import { TestbedCommand } from "#cli/bases/testbed-command.base";

/** `testbed sync`. */
export class SyncCommand extends TestbedCommand({
  name: "sync",
  description: "Sync a directory to a box and print its path there",
}) {
  /** The directory synced to the box. */
  @Argument({ description: "The directory to sync to the box" })
  directory!: string;

  /** The one argument. */
  override args(): readonly string[] {
    return [this.directory];
  }
}

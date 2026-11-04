/**
 * Testbed file contract:
 * Purpose: `ScaleCommand`, `scale`: shows both groups' desired capacity, or raises the `--slot` group by one, in the region of `--box` or the first enabled one.
 * Boundary: no arguments; the flags and the run are `TestbedCommand`'s, the behaviour `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console).
 */
import { TestbedCommand } from "#cli/bases/testbed-command.base";

/** `testbed scale`. */
export class ScaleCommand extends TestbedCommand({
  name: "scale",
  description: "Show both groups' desired capacity, or raise one slot's group by one with --slot",
}) {}

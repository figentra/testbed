/**
 * Testbed file contract:
 * Purpose: `ImageCommand`, `image`: the AMI the testbed launches from and its age in days.
 * Boundary: no arguments; the flags and the run are `TestbedCommand`'s, the behaviour `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console).
 */
import { TestbedCommand } from "#cli/bases/testbed-command.base";

/** `testbed image`. */
export class ImageCommand extends TestbedCommand({
  name: "image",
  description: "Show the current testbed AMI and its age",
}) {}

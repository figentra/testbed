/**
 * Testbed file contract:
 * Purpose: `StatusCommand`, `status`: every enabled region's slots and boxes; `--json` prints `{regions:[...]}` alone on stdout.
 * Boundary: no arguments; the flags and the run are `TestbedCommand`'s, the behaviour `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console).
 */
import { TestbedCommand } from "#cli/bases/testbed-command.base";

/** `testbed status`. */
export class StatusCommand extends TestbedCommand({
  name: "status",
  description:
    "Show every enabled region's free, total and startable slots and each box (--json: the regions as JSON)",
}) {}

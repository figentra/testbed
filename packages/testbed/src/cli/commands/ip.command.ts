/**
 * Testbed file contract:
 * Purpose: `IpCommand`, `ip`: prints the public IP of a box (`--box`, the first by default).
 * Boundary: no arguments; the flags and the run are `TestbedCommand`'s, the behaviour `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console).
 */
import { TestbedCommand } from "#cli/bases/testbed-command.base";

/** `testbed ip`. */
export class IpCommand extends TestbedCommand({
  name: "ip",
  description: "Print a box's public IP",
}) {}

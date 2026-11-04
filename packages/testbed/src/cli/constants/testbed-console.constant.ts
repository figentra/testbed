/**
 * Testbed file contract:
 * Purpose: `TESTBED_CONSOLE`, the `testbed` console: its eight verbs, the bare `--json` (the data alone on one line,
 *          stdout empty on an error, everything else on stderr) and `requireCommand` (no verb exits 2), so the frozen
 *          interface of ADR 0522 decision 5 holds on @stackra/console.
 * Boundary: data only; the bin runs it with `nodePorts()`, the tests with `runCommandForTest`.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI, decision 5); ADR 0506 (the console, amendment 2026-11-03).
 */
import type { ConsoleConfig } from "@stackra/console";

import { ImageCommand } from "#cli/commands/image.command";
import { IpCommand } from "#cli/commands/ip.command";
import { RunCommand } from "#cli/commands/run.command";
import { ScaleCommand } from "#cli/commands/scale.command";
import { SshCommand } from "#cli/commands/ssh.command";
import { StatusCommand } from "#cli/commands/status.command";
import { SyncCommand } from "#cli/commands/sync.command";
import { UnlockCommand } from "#cli/commands/unlock.command";

import manifest from "../../../package.json" with { type: "json" };

/** The `testbed` console. */
export const TESTBED_CONSOLE: ConsoleConfig = {
  name: "testbed",
  version: manifest.version,
  json: "bare",
  requireCommand: true,
  commands: [
    RunCommand,
    StatusCommand,
    UnlockCommand,
    IpCommand,
    SshCommand,
    SyncCommand,
    ScaleCommand,
    ImageCommand,
  ],
};

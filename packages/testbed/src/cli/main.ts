#!/usr/bin/env node
/**
 * Testbed file contract:
 * Purpose: the `testbed` bin (`dist/cli/main.mjs`): runs this process's command line through `runTestbedCli` and sets
 *          the exit code it returns. `ci-box` is a thin shim that calls it.
 * Boundary: the only file that reads `process.argv` and sets `process.exitCode`; all behaviour is `runTestbedCli`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI); ADR 0484 (the testbed).
 */
import { PROCESS_IO } from "#cli/constants/process-io.constant";
import { runTestbedCli } from "#cli/functions/run-testbed-cli.function";

process.exitCode = await runTestbedCli(process.argv.slice(2), PROCESS_IO);

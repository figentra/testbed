#!/usr/bin/env node
/**
 * Testbed file contract:
 * Purpose: the `testbed` bin (`dist/cli/main.mjs`): runs this process's command line through the `testbed` console
 *          (`TESTBED_CONSOLE` on @stackra/console) and sets the exit code it returns. `ci-box` is a thin shim that
 *          calls it.
 * Boundary: the only file that reads `process.argv` and sets `process.exitCode`; all behaviour is the console's and
 *           `runTestbed`'s.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI); ADR 0484 (the testbed); ADR 0506 (the console).
 */
import { createConsole } from "@stackra/console";
import { nodePorts } from "@stackra/console/node";

import { TESTBED_CONSOLE } from "#cli/constants/testbed-console.constant";

process.exitCode = await createConsole(TESTBED_CONSOLE).run(process.argv.slice(2), nodePorts());

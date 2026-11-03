/**
 * Testbed file contract:
 * Purpose: `runTestbedCli(args, io, cwd?)`, the `testbed` command line: `--help`, the options parsed with `node:util`
 *          `parseArgs` (strict; everything after `--` passed on untouched), the verb, then `runTestbed`, and the outcome
 *          as an exit code: the job's or verb's own code, 1 for a failure, 2 for a usage error. `run "<session> <what>"
 *          <dir> "<cmd>"` runs a command on a free box under its lock; `status`, `unlock`, `ip`, `ssh`, `sync`, `scale`
 *          and `image` manage the boxes. The boxes live in the enabled regions (`--regions a,b`, `--region r`,
 *          `STACKRA_TESTBED_REGIONS`); `--json` makes `run` print one result line on stdout (the job's output goes to
 *          stderr) and `status` print JSON. The verbs, flags, `--json` lines and exit codes are the frozen interface.
 * Boundary: never exits the process and never throws; every error is printed to `io.err` and becomes an exit code.
 *           Starts processes only through `runTestbed`'s deps.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI); POSIX exit status 2 for usage.
 */
import { homedir } from "node:os";
import { parseArgs } from "node:util";

import { CliUsageError } from "#cli/errors/cli-usage.error";
import { createTestbedDeps } from "#cli/functions/create-testbed-deps.function";
import { resolveTestbedSettings } from "#cli/functions/resolve-testbed-settings.function";
import { runTestbed } from "#cli/functions/run-testbed.function";
import type { CliIo } from "#cli/types/cli-io.type";

const SUMMARY =
  "Run heavy work on the shared test boxes (run, status, unlock, ip, ssh, sync, scale, image)";

const USAGE =
  'testbed run "<session> <what>" <dir> "<cmd>" [--preset verify|e2e|integration --ref <ref>] [--json] [--regions a,b] [--region r] [--no-wait] [--on-demand] [--ssh-direct] | status [--json] | unlock [--box N|id] [--region r] [--slot heavy|light] | ip [--box] | ssh [--box] [cmd] | sync [--box] <dir> | scale [--box N|id] [--region r] [--slot heavy|light] | image';

const flag = (value: string | boolean | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Runs one `testbed` command line and resolves with its exit code.
 *
 * @param args - the command line without the program name.
 * @param io - where the command writes.
 * @param cwd - the directory a relative `<dir>` is read from (default: the working directory).
 * @example
 * process.exitCode = await runTestbedCli(process.argv.slice(2), PROCESS_IO);
 */
export async function runTestbedCli(
  args: readonly string[],
  io: CliIo,
  cwd: string = process.cwd(),
): Promise<number> {
  const split = args.indexOf("--");
  const own = split === -1 ? args : args.slice(0, split);
  const rest = split === -1 ? [] : args.slice(split + 1);
  try {
    const { values, positionals } = parseArgs({
      args: [...own],
      options: {
        box: { type: "string" },
        slot: { type: "string" },
        preset: { type: "string" },
        ref: { type: "string" },
        "no-wait": { type: "boolean" },
        "on-demand": { type: "boolean" },
        "ssh-direct": { type: "boolean" },
        profile: { type: "string" },
        region: { type: "string" },
        regions: { type: "string" },
        json: { type: "boolean" },
        key: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
      strict: true,
    });
    if (values.help === true) {
      io.out(`${SUMMARY}\n\nUsage: ${USAGE}\n`);
      return 0;
    }
    const json = values.json === true;
    const [verb, ...verbArgs] = positionals;
    if (verb === undefined) throw new CliUsageError("name a verb");
    const slot = flag(values.slot);
    if (slot !== undefined && slot !== "heavy" && slot !== "light") {
      throw new CliUsageError(`unknown slot: ${slot} (expected heavy or light)`);
    }
    return await runTestbed(
      {
        verb,
        args: [...verbArgs, ...rest],
        cwd,
        box: flag(values.box),
        slot,
        preset: flag(values.preset),
        ref: flag(values.ref),
        noWait: values["no-wait"] === true,
        onDemand: values["on-demand"] === true,
        json,
        settings: resolveTestbedSettings(values, process.env, homedir()),
      },
      // Under --json the job's output must not reach stdout, which carries the one result line.
      createTestbedDeps(cwd, json ? { out: io.err, err: io.err, inherit: false } : io),
      io,
    );
  } catch (error) {
    // parseArgs refuses an unknown option or a missing option value with an ERR_PARSE_ARGS_* TypeError.
    const code = (error as { code?: unknown }).code;
    if (
      error instanceof CliUsageError ||
      (typeof code === "string" && code.startsWith("ERR_PARSE_ARGS"))
    ) {
      io.err(`testbed: ${(error as Error).message}\nUsage: ${USAGE}\n`);
      return 2;
    }
    io.err(`testbed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

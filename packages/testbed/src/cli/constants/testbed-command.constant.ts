/**
 * Stackra file contract:
 * Purpose: `TESTBED_COMMAND`, `stackra testbed <verb>`: the shared EC2 test boxes. `run "<session> <what>" <dir> "<cmd>"`
 *          runs a command on a free box under its lock; `status`, `unlock`, `ip`, `ssh`, `sync`, `scale` and `image`
 *          manage them. The boxes live in the enabled regions (`--regions a,b`, `--region r`, `STACKRA_TESTBED_REGIONS`);
 *          `--json` makes `run` print one result line on stdout (the job's output goes to stderr) and `status` print
 *          JSON. It replaces the Mac script `ci-box`.
 * Boundary: starts `aws`, `ssh`, `rsync` and `gh` without a shell and never prints or passes a secret value; a job
 *           never runs on the Mac. The work is `runTestbed`.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import { homedir } from "node:os";

import { CliUsageError } from "#node/errors/cli-usage.error";
import { createTestbedDeps } from "#node/functions/create-testbed-deps.function";
import { resolveTestbedSettings } from "#node/functions/resolve-testbed-settings.function";
import { runTestbed } from "#node/functions/run-testbed.function";
import type { CliCommand } from "#node/types/cli-command.type";

const flag = (value: string | boolean | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

/** The `stackra testbed` command: runs work on the test boxes and manages them. */
export const TESTBED_COMMAND: CliCommand = {
  name: "testbed",
  summary:
    "Run heavy work on the shared test boxes (run, status, unlock, ip, ssh, sync, scale, image)",
  usage:
    'stackra testbed run "<session> <what>" <dir> "<cmd>" [--preset verify|e2e|integration --ref <ref>] [--json] [--regions a,b] [--region r] [--no-wait] [--on-demand] [--ssh-direct] | status [--json] | unlock [--box N|id] [--region r] [--slot heavy|light] | ip [--box] | ssh [--box] [cmd] | sync [--box] <dir> | scale [--box N|id] [--region r] [--slot heavy|light] | image',
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
  },
  positionals: true,
  async run({ cwd, io, values, positionals, rest }) {
    const json = values["json"] === true;
    const [verb, ...args] = positionals;
    if (verb === undefined) throw new CliUsageError("name a verb");
    const slot = flag(values["slot"]);
    if (slot !== undefined && slot !== "heavy" && slot !== "light") {
      throw new CliUsageError(`unknown slot: ${slot} (expected heavy or light)`);
    }
    return runTestbed(
      {
        verb,
        args: [...args, ...rest],
        cwd,
        box: flag(values["box"]),
        slot,
        preset: flag(values["preset"]),
        ref: flag(values["ref"]),
        noWait: values["no-wait"] === true,
        onDemand: values["on-demand"] === true,
        json,
        settings: resolveTestbedSettings(values, process.env, homedir()),
      },
      // Under --json the job's output must not reach stdout, which carries the one result line.
      createTestbedDeps(cwd, json ? { out: io.err, err: io.err, inherit: false } : io),
      io,
    );
  },
};

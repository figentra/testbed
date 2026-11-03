/**
 * Stackra file contract:
 * Purpose: `resolveTestbedSettings(values, env, home)`, the AWS profile, the enabled regions, SSH key file and
 *          user: flag, then `STACKRA_TESTBED_*`, then the default. The regions are `--region r` (narrows to one), then
 *          `--regions a,b`, then `STACKRA_TESTBED_REGIONS`, then `STACKRA_TESTBED_REGION`, then the default list.
 * Boundary: pure; names a key file, never reads or prints one.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import { join } from "node:path";

import { TESTBED_CLI_DEFAULTS } from "#node/constants/testbed-cli-defaults.constant";
import type { TestbedSettings } from "#node/types/testbed-settings.type";

const text = (value: string | boolean | undefined): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** A comma-separated list as its non-empty entries, or `undefined` when there are none. */
const list = (value: string | boolean | undefined): readonly string[] | undefined => {
  const entries = (text(value) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : undefined;
};

/**
 * The settings of one run.
 *
 * @param values - the parsed options (`profile`, `region`, `regions`, `key`).
 * @param env - the environment (`STACKRA_TESTBED_AWS_PROFILE`, `STACKRA_TESTBED_REGIONS`, `STACKRA_TESTBED_REGION`,
 *              `STACKRA_TESTBED_SSH_KEY`).
 * @param home - the home directory the default key file lives under.
 * @example
 * resolveTestbedSettings({}, {}, "/Users/me").regions; // ["eu-west-1"]
 */
export function resolveTestbedSettings(
  values: Readonly<Record<string, string | boolean | undefined>>,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): TestbedSettings {
  const only = text(values["region"]);
  const single = text(env["STACKRA_TESTBED_REGION"]);
  const regions =
    (only === undefined ? undefined : [only]) ??
    list(values["regions"]) ??
    list(env["STACKRA_TESTBED_REGIONS"]) ??
    (single === undefined ? undefined : [single]) ??
    TESTBED_CLI_DEFAULTS.regions;
  return {
    profile:
      text(values["profile"]) ??
      text(env["STACKRA_TESTBED_AWS_PROFILE"]) ??
      TESTBED_CLI_DEFAULTS.profile,
    region: regions[0] ?? "",
    regions,
    key:
      text(values["key"]) ??
      text(env["STACKRA_TESTBED_SSH_KEY"]) ??
      join(home, TESTBED_CLI_DEFAULTS.key),
    user: TESTBED_CLI_DEFAULTS.user,
    sshDirect: values["ssh-direct"] === true || env["STACKRA_TESTBED_SSH_DIRECT"] === "1",
  };
}

/**
 * Testbed file contract:
 * Purpose: `resolveTestbedSettings(values, env, home)`, the AWS profile, the enabled regions, SSH key file and
 *          user: flag, then `STACKRA_TESTBED_*`, then the default. The regions are `--region r` (narrows to one), then
 *          `--regions a,b`, then `STACKRA_TESTBED_REGIONS`, then `STACKRA_TESTBED_REGION`, then
 *          `TESTBED_DEFAULTS.enabledRegions`. The `STACKRA_TESTBED_*` names are the frozen interface callers already set.
 * Boundary: pure; names a key file, never reads or prints one.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */
import { join } from "node:path";

import type { TestbedSettings } from "#cli/types/testbed-settings.type";
import { TESTBED_DEFAULTS } from "#core/constants/testbed-defaults.constant";

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
    TESTBED_DEFAULTS.enabledRegions;
  return {
    profile:
      text(values["profile"]) ??
      text(env["STACKRA_TESTBED_AWS_PROFILE"]) ??
      TESTBED_DEFAULTS.awsProfile,
    region: regions[0] ?? "",
    regions,
    key:
      text(values["key"]) ??
      text(env["STACKRA_TESTBED_SSH_KEY"]) ??
      join(home, TESTBED_DEFAULTS.keyFile.replace(/^~\//, "")),
    user: TESTBED_DEFAULTS.sshUser,
    sshDirect: values["ssh-direct"] === true || env["STACKRA_TESTBED_SSH_DIRECT"] === "1",
  };
}

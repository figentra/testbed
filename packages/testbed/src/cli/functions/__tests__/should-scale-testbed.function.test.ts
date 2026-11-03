/**
 * Testbed file contract:
 * Purpose: unit tests of `shouldScaleTestbed`, `decideTestbedFallback` and `resolveTestbedSettings`: the scale
 *          decision, the fallback decision and the settings order, the enabled regions included.
 * Boundary: test only.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484.
 */
import { describe, expect, it } from "vitest";

import { decideTestbedFallback } from "#cli/functions/decide-testbed-fallback.function";
import { resolveTestbedSettings } from "#cli/functions/resolve-testbed-settings.function";
import { shouldScaleTestbed } from "#cli/functions/should-scale-testbed.function";

describe("shouldScaleTestbed", () => {
  it("grows the group after two busy minutes while below the maximum", () => {
    expect(shouldScaleTestbed({ busySince: 0, now: 119_000, desired: 1, max: 3 })).toBe(false);
    expect(shouldScaleTestbed({ busySince: 0, now: 120_000, desired: 1, max: 3 })).toBe(true);
    expect(shouldScaleTestbed({ busySince: 0, now: 120_000, desired: 3, max: 3 })).toBe(false);
    expect(shouldScaleTestbed({ busySince: undefined, now: 999_999, desired: 1, max: 3 })).toBe(
      false,
    );
  });
});

describe("decideTestbedFallback", () => {
  it("dispatches only with no healthy box and a preset", () => {
    expect(decideTestbedFallback({ healthyCount: 0, preset: "verify" })).toBe("dispatch");
    expect(decideTestbedFallback({ healthyCount: 0, preset: undefined })).toBe("wait");
    expect(decideTestbedFallback({ healthyCount: 2, preset: "verify" })).toBe("wait");
  });
});

describe("resolveTestbedSettings", () => {
  it("takes the flag, then the environment, then the default", () => {
    const env = { STACKRA_TESTBED_REGION: "eu-west-2" };
    expect(resolveTestbedSettings({ region: "us-east-1" }, env, "/h").region).toBe("us-east-1");
    expect(resolveTestbedSettings({}, env, "/h").region).toBe("eu-west-2");
    expect(resolveTestbedSettings({}, {}, "/h")).toEqual({
      profile: "academorix",
      region: "eu-west-1",
      regions: ["eu-west-1"],
      key: "/h/.ssh/academorix-ci.pem",
      user: "ubuntu",
      sshDirect: false,
    });
  });

  // @covers sta-2042:FR-006 sta-2042:P-006 sta-2042:AC-005
  it("takes the enabled regions from --regions, then STACKRA_TESTBED_REGIONS, then the default", () => {
    const env = { STACKRA_TESTBED_REGIONS: "eu-west-2, eu-central-1" };
    expect(resolveTestbedSettings({ regions: "us-east-1,eu-west-1" }, env, "/h").regions).toEqual([
      "us-east-1",
      "eu-west-1",
    ]);
    const fromEnv = resolveTestbedSettings({}, env, "/h");
    expect(fromEnv.regions).toEqual(["eu-west-2", "eu-central-1"]);
    expect(fromEnv.region).toBe("eu-west-2");
    expect(resolveTestbedSettings({ regions: "," }, {}, "/h").regions).toEqual(["eu-west-1"]);
  });

  // @covers sta-2042:FR-006 sta-2042:AC-005
  it("narrows to one region with --region, over the list and the environment", () => {
    const env = { STACKRA_TESTBED_REGIONS: "eu-west-1,eu-west-2", STACKRA_TESTBED_REGION: "x" };
    const settings = resolveTestbedSettings({ region: "us-east-1", regions: "a,b" }, env, "/h");
    expect(settings.regions).toEqual(["us-east-1"]);
    expect(settings.region).toBe("us-east-1");
  });

  it("reaches boxes through SSM unless --ssh-direct or STACKRA_TESTBED_SSH_DIRECT=1 asks for the public IP", () => {
    expect(resolveTestbedSettings({ "ssh-direct": true }, {}, "/h").sshDirect).toBe(true);
    expect(resolveTestbedSettings({}, { STACKRA_TESTBED_SSH_DIRECT: "1" }, "/h").sshDirect).toBe(
      true,
    );
    expect(resolveTestbedSettings({}, { STACKRA_TESTBED_SSH_DIRECT: "0" }, "/h").sshDirect).toBe(
      false,
    );
  });
});

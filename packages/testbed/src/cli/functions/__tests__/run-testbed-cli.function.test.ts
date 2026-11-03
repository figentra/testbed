/**
 * Testbed file contract:
 * Purpose: unit tests of `runTestbedCli`, the `testbed` command line: `--help`, exit 2 with the usage for no verb, an
 *          unknown verb, option or slot and a short `run`, and a refused nested call under `--json` still printing its
 *          one result line.
 * Boundary: test only; every case ends before a process starts (a usage error or the nested-call refusal).
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0522 (the `testbed` CLI).
 */
import { describe, expect, it } from "vitest";

import { runTestbedCli } from "#cli/functions/run-testbed-cli.function";

/** Runs one command line with stdout and stderr kept apart. */
const cli = async (...args: string[]): Promise<{ code: number; out: string; err: string }> => {
  let out = "";
  let err = "";
  const io = {
    out: (text: string) => {
      out += text;
    },
    err: (text: string) => {
      err += text;
    },
    inherit: false,
  };
  const code = await runTestbedCli(args, io, "/tmp");
  return { code, out, err };
};

describe("runTestbedCli", () => {
  it("prints the usage on --help and exits 0", async () => {
    const { code, out } = await cli("--help");
    expect(code).toBe(0);
    expect(out).toContain('Usage: testbed run "<session> <what>" <dir> "<cmd>"');
  });

  it("exits 2 with the usage on stderr for a command line that cannot run", async () => {
    for (const [args, message] of [
      [[], "name a verb"],
      [["frobnicate"], "unknown verb: frobnicate"],
      [["status", "--bogus"], "bogus"],
      [["unlock", "--slot", "medium"], "unknown slot: medium"],
      [["run", "me work", "."], "run takes"],
    ] as const) {
      const { code, out, err } = await cli(...args);
      expect(code, args.join(" ")).toBe(2);
      expect(out).toBe("");
      expect(err).toContain(message);
      expect(err).toContain("Usage: testbed ");
    }
  });

  it("refuses a nested call with exit 2 and still prints the one --json line", async () => {
    const { code, out, err } = await cli("run", "--json", "me work", ".", "ci-box status");
    expect(code).toBe(2);
    expect(JSON.parse(out)).toEqual({
      region: null,
      box: null,
      slot: null,
      waitSeconds: 0,
      runSeconds: 0,
      exitCode: 2,
    });
    expect(err).toContain("must not call testbed or ci-box");
  });
});

/**
 * Testbed file contract:
 * Purpose: the frozen interface of the `testbed` CLI (ADR 0522 decision 5) on @stackra/console, through
 *          `runCommandForTest` and the real `TESTBED_CONSOLE` (bare `--json`, `requireCommand`): the eight verbs and the
 *          flags every verb takes, no passthrough command; the exact bytes of the `run --json` line (job exit 124, 73,
 *          75, a refused nested call with exit 2) and of `status --json`, with the job's own output on stderr; usage
 *          errors (no verb included) exiting 2 with stdout empty; `--box 2 ssh` in every spelling; a tool that cannot
 *          start.
 * Boundary: test only; `aws` and the box agent are fake captured calls, streamed tools a recording process runner;
 *           nothing starts a process or reaches the network, and the claim folder is a throwaway directory.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0522 (the `testbed` CLI); ADR 0506 (the console).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readCommand } from "@stackra/console";
import type { ConsoleContainer } from "@stackra/console";
import type { ProcessResult } from "@stackra/console/contracts";
import {
  MemoryProcessRunnerDriver,
  passthroughCommands,
  runCommandForTest,
} from "@stackra/console/testing";
import type { TestRunResult } from "@stackra/console/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TESTBED_CONSOLE } from "#cli/constants/testbed-console.constant";
import type { TestbedDeps } from "#cli/types/testbed-deps.type";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "testbed-cli-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The describe-instances rows of light boxes, launched in the order given (box 1 first). */
const boxes = (...ids: string[]): string =>
  JSON.stringify(
    ids.map((id, index) => ({
      id,
      ip: `ip-${id}`,
      group: "light",
      launch: `2026-10-30T00:0${index}:00Z`,
    })),
  );

/** Fake captured calls: the boxes, each group at 1 of 1, a healthy agent whose slots answer `slot`. */
const deps = (rows: string, slot: "free" | "busy" = "free"): Partial<TestbedDeps> => ({
  exec: async (command, args) => {
    const remote = String(args.at(-1));
    if (command === "aws" && args.includes("describe-instances"))
      return { code: 0, stdout: rows, stderr: "" };
    if (command === "aws" && args.includes("describe-auto-scaling-groups"))
      return { code: 0, stdout: "1\t1\t0\n", stderr: "" };
    if (command === "ssh" && remote.includes("job prepare"))
      return { code: 0, stdout: "/data/jobs/x/app\n", stderr: "" };
    if (command === "ssh" && remote.includes("testbed-agent slot"))
      return { code: 0, stdout: slot, stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  },
  sleep: async () => undefined,
  now: () => 1_000_000,
  pid: 42,
  isAlive: () => true,
  publicIp: async () => undefined,
  claimRoot: root,
});

/** A process runner that records each streamed tool and answers it with `answer`. */
const runner = (
  answer: (line: string) => ProcessResult = () => ({ code: 0, output: "" }),
): MemoryProcessRunnerDriver => {
  const driver = new MemoryProcessRunnerDriver();
  driver.run = async (command, args, options) => {
    const line = [command, ...args].join(" ");
    driver.calls.push({ ...options, line });
    return answer(line);
  };
  return driver;
};

/** A job that exits `code`, every other streamed tool 0. */
const job = (code: number): MemoryProcessRunnerDriver =>
  runner((line) => ({ code: line.includes("testbed-agent job run") ? code : 0, output: "" }));

/** Runs `argv` through the real console with the fakes; commands get `fakes` through the container. */
const cli = (
  argv: readonly string[],
  fakes: Partial<TestbedDeps> = deps("[]"),
  runs: MemoryProcessRunnerDriver = runner(),
): Promise<TestRunResult> => {
  const container = (): ConsoleContainer => ({
    get: <T extends object>(type: abstract new (...args: never[]) => T): T =>
      Reflect.construct(type as unknown as new (...args: unknown[]) => T, [fakes]),
    close: async () => undefined,
  });
  return runCommandForTest(TESTBED_CONSOLE, argv, { cwd: root, container, process: runs });
};

/** The `run --json` line for a run that got no box. */
const unplaced = (slot: string | null, exitCode: number): string =>
  `{"region":null,"box":null,"slot":${slot === null ? "null" : `"${slot}"`},"waitSeconds":0,"runSeconds":0,"exitCode":${exitCode}}\n`;

describe("the testbed console", () => {
  it("has the eight verbs, each taking every flag, and no passthrough command", () => {
    const structures = TESTBED_CONSOLE.commands.map((type) => readCommand(type));
    expect(structures.map((structure) => structure.name).toSorted()).toEqual(
      ["image", "ip", "run", "scale", "ssh", "status", "sync", "unlock"].toSorted(),
    );
    for (const structure of structures)
      expect(
        structure.options.map((option) => option.flag),
        structure.name,
      ).toEqual([
        "box",
        "slot",
        "preset",
        "ref",
        "wait",
        "on-demand",
        "ssh-direct",
        "profile",
        "region",
        "regions",
        "key",
      ]);
    expect(passthroughCommands(TESTBED_CONSOLE.commands)).toEqual([]);
  });

  it("is bare JSON and needs a verb", () => {
    expect(TESTBED_CONSOLE.json).toBe("bare");
    expect(TESTBED_CONSOLE.requireCommand).toBe(true);
  });
});

describe("testbed run --json", () => {
  it("prints the one result line, byte for byte, with the job's exit 124 and its output on stderr", async () => {
    const runs = job(124);
    const result = await cli(
      ["run", "--json", "--region", "r", "me work", ".", "pnpm lint"],
      deps(boxes("i-1")),
      runs,
    );
    expect(result.exitCode).toBe(124);
    expect(result.stdout).toBe(
      '{"region":"r","box":"i-1","slot":"light","waitSeconds":0,"runSeconds":0,"exitCode":124}\n',
    );
    expect(result.stderr).toContain("testbed: box 1 (r)");
    const run = runs.calls.find((call) => call.line.includes("testbed-agent job run"));
    // Under --json a streamed tool ignores stdin and writes to stderr, so stdout keeps the one line.
    expect(run?.inherit).toBe("stderr");
    expect(runs.calls.every((call) => call.inherit === "stderr")).toBe(true);
  });

  it("prints the line with exit 73 when every slot is busy and 75 when no box is healthy, under --no-wait", async () => {
    const busy = await cli(
      ["run", "--json", "--no-wait", "--region", "r", "me work", ".", "pnpm lint"],
      deps(boxes("i-1"), "busy"),
    );
    expect(busy.exitCode).toBe(73);
    expect(busy.stdout).toBe(unplaced("light", 73));
    const none = await cli([
      "run",
      "--json",
      "--no-wait",
      "--region",
      "r",
      "me work",
      ".",
      "pnpm lint",
    ]);
    expect(none.exitCode).toBe(75);
    expect(none.stdout).toBe(unplaced("light", 75));
  });

  it("refuses a nested call with exit 2 and still prints the line", async () => {
    const result = await cli(["run", "--json", "me work", ".", "ci-box status"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe(unplaced(null, 2));
    expect(result.stderr).toContain("must not call testbed or ci-box");
  });

  it("prints nothing on stdout without --json, and the job shares the terminal", async () => {
    const runs = job(0);
    const result = await cli(
      ["run", "--region", "r", "me work", ".", "pnpm lint"],
      deps(boxes("i-1")),
      runs,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(runs.calls.every((call) => call.inherit === true)).toBe(true);
  });
});

describe("testbed status --json", () => {
  it("prints the regions alone on one line", async () => {
    const result = await cli(["status", "--json", "--region", "r"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      '{"regions":[{"region":"r","reachable":true,"heavy":{"free":0,"total":0,"startable":1},"light":{"free":0,"total":0,"startable":2},"boxes":[]}]}\n',
    );
  });
});

describe("testbed usage errors", () => {
  it("exit 2 with the reason on stderr and stdout empty, no verb included", async () => {
    for (const argv of [
      [],
      ["--json"],
      ["frobnicate"],
      ["--json", "frobnicate"],
      ["status", "--bogus"],
      ["unlock", "--slot", "medium"],
      ["run", "me work", "."],
      ["run", "--json", "me work", "."],
      ["run", "me work", ".", "pnpm lint", "extra"],
      ["run", "--json", "--preset", "lint", "--ref", "main", "me work", ".", "pnpm lint"],
      ["run", "--preset", "verify", "me work", ".", "pnpm lint"],
      ["sync"],
    ]) {
      const result = await cli(argv);
      expect(result.exitCode, argv.join(" ")).toBe(2);
      expect(result.stdout, argv.join(" ")).toBe("");
      expect(result.stderr, argv.join(" ")).not.toBe("");
    }
  });

  it("exits 0 with the help on --help, alone or after a verb", async () => {
    for (const argv of [["--help"], ["run", "--help"], ["--box", "2", "ssh", "--help"]]) {
      expect((await cli(argv)).exitCode, argv.join(" ")).toBe(0);
    }
  });
});

describe("testbed ssh", () => {
  it("picks box 2 for --box 2 before or after the verb, and shares the terminal", async () => {
    for (const argv of [
      ["--box", "2", "ssh"],
      ["--box=2", "ssh"],
      ["ssh", "--box", "2"],
    ]) {
      const runs = runner();
      const result = await cli([...argv, "--region", "r"], deps(boxes("i-1", "i-2")), runs);
      expect(result.exitCode, argv.join(" ")).toBe(0);
      expect(runs.calls).toHaveLength(1);
      expect(runs.calls[0]?.line, argv.join(" ")).toMatch(/ ubuntu@i-2$/);
      expect(runs.calls[0]?.inherit).toBe(true);
    }
  });

  it("passes the words after the verb as one remote command", async () => {
    const runs = runner();
    await cli(["ssh", "--region", "r", "--", "df", "-h", "/data"], deps(boxes("i-1")), runs);
    expect(runs.calls[0]?.line).toMatch(/ ubuntu@i-1 df -h \/data$/);
  });

  it("names a tool that cannot start and exits 127", async () => {
    const runs = runner(() => ({ code: 127, output: "ssh: spawn ssh ENOENT\n" }));
    const result = await cli(["ssh", "--region", "r"], deps(boxes("i-1")), runs);
    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain("testbed: cannot start ssh: spawn ssh ENOENT");
  });
});

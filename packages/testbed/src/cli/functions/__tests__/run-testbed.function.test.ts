/**
 * Stackra file contract:
 * Purpose: unit tests of `runTestbed` with fake processes: the nested-call refusal, a light job on a free box,
 *          another box on exit 75, a light job retried once after a lost box, `--on-demand`, `--no-wait`, the fallback dispatch, and
 *          that the fallback input is the preset and the ref only; SSM access by instance id by default, and the
 *          public IP with the allowlist swap only under `--ssh-direct`; and across regions: the next region when the
 *          first is full, a group raised where there is room, no call outside the enabled list, each box's own region
 *          in its calls, `run --json` (one stdout line, the reserved exit codes), `status` and `status --json`, and
 *          `scale` and `unlock` in the right region.
 * Boundary: test only; nothing starts a process or reaches the network, the claim folder is a throwaway directory.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@stackra/testing";

import { captureIo } from "#node/functions/capture-io.function";
import { runTestbed } from "#node/functions/run-testbed.function";
import type { TestbedDeps } from "#node/types/testbed-deps.type";
import type { TestbedRequest } from "#node/types/testbed-request.type";

let claimRoot: string;

beforeEach(() => {
  claimRoot = mkdtempSync(join(tmpdir(), "stackra-testbed-"));
});

afterEach(() => {
  rmSync(claimRoot, { recursive: true, force: true });
});

// @covers sta-2042:FR-005 sta-2042:FR-006 sta-2042:FR-007 sta-2042:FR-009 sta-2042:FR-010 sta-2042:FR-011
// @covers sta-2042:FR-012 sta-2042:P-005 sta-2042:P-006 sta-2042:P-007 sta-2042:P-009 sta-2042:P-010
// @covers sta-2042:P-011 sta-2042:P-012 sta-2042:AC-001 sta-2042:AC-005 sta-2042:AC-006

const instances = (...rows: [string, string, string][]) =>
  JSON.stringify(rows.map(([id, group, launch]) => ({ id, ip: `ip-${id}`, group, launch })));

type Fake = {
  readonly deps: TestbedDeps;
  readonly calls: string[];
  readonly streams: string[];
};

/** The region an aws call names. */
const regionOf = (args: readonly string[]): string => String(args[args.indexOf("--region") + 1]);

/** `agent` answers the remote command of one ssh call; `jobRun` answers the streamed `job run`, in order. */
function fake(options: {
  /** The describe-instances rows: one answer for every region, or one per region (`undefined` fails the call). */
  readonly boxes: string | Readonly<Record<string, string | undefined>>;
  readonly agent?: (box: string, command: string) => { code: number; stdout: string };
  readonly jobRun?: number[];
  readonly ip?: string;
  /** The `DesiredCapacity MaxSize MinSize` row describe-auto-scaling-groups prints, for every region or per region. */
  readonly group?: string | Readonly<Record<string, string>>;
  /** The clock; each call advances it by this many milliseconds. */
  readonly tick?: number;
}): Fake {
  const calls: string[] = [];
  const streams: string[] = [];
  const jobRun = [...(options.jobRun ?? [0])];
  let clock = 1_000_000;
  const deps: TestbedDeps = {
    exec: async (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "aws" && args.includes("describe-instances")) {
        const rows =
          typeof options.boxes === "string" ? options.boxes : options.boxes[regionOf(args)];
        return rows === undefined
          ? { code: 255, stdout: "", stderr: "unreachable" }
          : { code: 0, stdout: rows, stderr: "" };
      }
      if (command === "aws" && args.includes("describe-auto-scaling-groups") && options.group) {
        const row =
          typeof options.group === "string" ? options.group : options.group[regionOf(args)];
        if (row !== undefined) return { code: 0, stdout: row, stderr: "" };
      }
      if (command === "aws" && args.includes("describe-security-groups")) {
        return { code: 0, stdout: "203.0.113.7/32\n", stderr: "" };
      }
      if (command === "ssh") {
        const box = String(args.at(-2)).split("@")[1] ?? "";
        const remote = String(args.at(-1));
        const answer = options.agent?.(box, remote) ?? defaultAgent(remote);
        return { ...answer, stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
    stream: async (command, args) => {
      streams.push(`${command} ${args.join(" ")}`);
      if (command === "ssh" && String(args.at(-1)).includes("job run")) return jobRun.shift() ?? 0;
      return 0;
    },
    sleep: async () => undefined,
    now: () => {
      clock += options.tick ?? 0;
      return clock;
    },
    pid: 42,
    isAlive: () => true,
    publicIp: async () => options.ip,
    claimRoot,
  };
  return { deps, calls, streams };
}

const defaultAgent = (remote: string) =>
  remote.includes("job prepare")
    ? { code: 0, stdout: "/data/jobs/x/app\n" }
    : remote.includes("health")
      ? { code: 0, stdout: "healthy" }
      : { code: 0, stdout: "free" };

const request = (overrides: Partial<TestbedRequest>): TestbedRequest => ({
  verb: "run",
  args: ["me work", "/tmp/app", "pnpm lint"],
  cwd: "/tmp",
  box: undefined,
  slot: undefined,
  preset: undefined,
  ref: undefined,
  noWait: false,
  onDemand: false,
  json: false,
  settings: { profile: "p", region: "r", regions: ["r"], key: "/k", user: "ubuntu" },
  ...overrides,
});

/** One `aws ec2` call of the SSH allowlist swap, as the fake records it. */
const rule = (verb: string, cidr: string): string =>
  `aws --profile p --region r ec2 ${verb}-security-group-ingress --group-name stackra-testbed --protocol tcp --port 22 --cidr ${cidr}`;

describe("runTestbed run", () => {
  it("refuses a command that calls ci-box or stackra testbed with exit 2", async () => {
    const { deps, streams } = fake({ boxes: "[]" });
    const { io, output } = captureIo();
    const code = await runTestbed(request({ args: ["w", "/tmp/app", "ci-box status"] }), deps, io);
    expect(code).toBe(2);
    expect(output()).toContain("must not call");
    expect(streams).toEqual([]);
  });

  it("prepares, rsyncs into the returned path and runs the job on a free box", async () => {
    const { deps, streams } = fake({ boxes: instances(["i-1", "light", "2026-10-30T00:00:00Z"]) });
    const { io } = captureIo();
    expect(await runTestbed(request({}), deps, io)).toBe(0);
    expect(streams[0]).toContain("rsync -az --delete");
    expect(streams[0]).toContain("ubuntu@i-1:/data/jobs/x/app/");
    expect(streams[0]).toContain(
      "-o 'ProxyCommand=aws ssm start-session --target %h --document-name AWS-StartSSHSession",
    );
    expect(streams[0]).toContain("--exclude node_modules");
    expect(streams[1]).toContain("testbed-agent job run");
    expect(streams[1]).toContain(" light 'me work' 'app' -- 'pnpm lint'");
  });

  it("runs a light command in the heavy (on-demand) slot with --on-demand", async () => {
    const { deps, streams } = fake({ boxes: instances(["i-1", "heavy", "2026-10-30T00:00:00Z"]) });
    expect(await runTestbed(request({ onDemand: true }), deps, captureIo().io)).toBe(0);
    expect(streams[1]).toContain(" heavy 'me work' 'app' -- 'pnpm lint'");
  });

  it("reaches a box through SSM by its instance id and touches no security group by default", async () => {
    const { deps, calls, streams } = fake({
      boxes: instances(["i-1", "light", "2026-10-30T00:00:00Z"]),
      ip: "198.51.100.9",
    });
    expect(await runTestbed(request({}), deps, captureIo().io)).toBe(0);
    expect(calls.some((call) => call.includes("security-group"))).toBe(false);
    const ssh = calls.find((call) => call.startsWith("ssh "));
    expect(ssh).toContain(
      "-o ProxyCommand=aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p --profile p --region r",
    );
    expect(ssh).toContain("ubuntu@i-1");
    expect(streams[1]).toContain("ubuntu@i-1");
  });

  it("with --ssh-direct, reaches the public IP and swaps the SSH allowlist to this machine's IP", async () => {
    const { deps, calls, streams } = fake({
      boxes: instances(["i-1", "light", "2026-10-30T00:00:00Z"]),
      ip: "198.51.100.9",
    });
    const direct = request({});
    const settings = { ...direct.settings, sshDirect: true };
    expect(await runTestbed({ ...direct, settings }, deps, captureIo().io)).toBe(0);
    expect(calls).toContain(rule("authorize", "198.51.100.9/32"));
    expect(calls).toContain(rule("revoke", "203.0.113.7/32"));
    expect(streams[0]).toContain("ubuntu@ip-i-1:/data/jobs/x/app/");
    expect(streams.join("\n")).not.toContain("ProxyCommand");
  });

  it("picks another box when the first answers 75", async () => {
    const { deps, streams } = fake({
      boxes: instances(
        ["i-1", "light", "2026-10-30T00:00:00Z"],
        ["i-2", "light", "2026-10-30T01:00:00Z"],
      ),
      jobRun: [75, 0],
    });
    const { io } = captureIo();
    expect(await runTestbed(request({}), deps, io)).toBe(0);
    const runs = streams.filter((line) => line.includes("job run"));
    expect(runs[0]).toContain("ubuntu@i-1");
    expect(runs[1]).toContain("ubuntu@i-2");
  });

  it("retries a light job once after the connection drops, and a heavy job never", async () => {
    const boxes = instances(
      ["i-1", "heavy", "2026-10-30T00:00:00Z"],
      ["i-2", "heavy", "2026-10-30T01:00:00Z"],
    );
    const light = fake({ boxes, jobRun: [255, 0] });
    expect(await runTestbed(request({}), light.deps, captureIo().io)).toBe(0);
    const heavy = fake({ boxes, jobRun: [255, 0] });
    expect(
      await runTestbed(
        request({ args: ["w", "/tmp/app", "pnpm build"] }),
        heavy.deps,
        captureIo().io,
      ),
    ).toBe(255);
  });

  it("exits 75 with --no-wait when no box is healthy", async () => {
    const { deps } = fake({
      boxes: instances(["i-1", "light", "2026-10-30T00:00:00Z"]),
      agent: (_box, command) =>
        command.includes("health")
          ? { code: 1, stdout: "unhealthy: disk" }
          : { code: 0, stdout: "busy x" },
    });
    expect(await runTestbed(request({ noWait: true }), deps, captureIo().io)).toBe(75);
  });

  it("raises a group at 0 to one box when none is running, then exits 75 with --no-wait", async () => {
    const { deps, calls } = fake({ boxes: "[]", group: "0\t1\t0\n" });
    const { io, output } = captureIo();
    expect(await runTestbed(request({ noWait: true }), deps, io)).toBe(75);
    expect(calls.filter((call) => call.includes("set-desired-capacity"))).toEqual([
      "aws --profile p --region r autoscaling set-desired-capacity --auto-scaling-group-name stackra-testbed-light --desired-capacity 1",
    ]);
    expect(output()).toContain("raised the light group to 1");
  });

  it("leaves a group alone when it already has a box on the way", async () => {
    const { deps, calls } = fake({ boxes: "[]", group: "1\t1\t0\n" });
    expect(await runTestbed(request({ noWait: true }), deps, captureIo().io)).toBe(75);
    expect(calls.some((call) => call.includes("set-desired-capacity"))).toBe(false);
  });

  it("dispatches the fallback workflow with the preset and the ref only", async () => {
    const { deps, streams } = fake({ boxes: "[]" });
    const code = await runTestbed(
      request({ preset: "verify", ref: "feat/x" }),
      deps,
      captureIo().io,
    );
    expect(code).toBe(0);
    expect(streams).toEqual(["gh workflow run testbed-fallback.yml --ref feat/x -f preset=verify"]);
  });
});

/** The settings of a run over `regions`. */
const over = (...regions: string[]): TestbedRequest["settings"] => ({
  ...request({}).settings,
  region: regions[0] ?? "",
  regions,
});

/** An agent whose slots answer `free` only on the boxes in `free`. */
const freeOn =
  (...free: string[]) =>
  (box: string, command: string) =>
    command.includes("testbed-agent slot")
      ? { code: 0, stdout: free.includes(box) ? "free" : "busy x" }
      : defaultAgent(command);

/** The regions named by `--region` in every aws call and every SSM proxy the fake saw. */
const regionsCalled = (calls: readonly string[]): Set<string> =>
  new Set(
    calls.flatMap((call) =>
      [...call.matchAll(/--region ([^\s']+)/g)].map((match) => match[1] ?? ""),
    ),
  );

/** An io that keeps stdout and stderr apart. */
const splitIo = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      out: (text: string) => out.push(text),
      err: (text: string) => err.push(text),
      inherit: false,
    },
    out,
    err,
  };
};

const lightBox: [string, string, string] = ["i-l", "light", "2026-10-30T00:00:00Z"];
const heavyBox: [string, string, string] = ["i-h", "heavy", "2026-10-30T00:00:00Z"];

describe("runTestbed run across regions", () => {
  it("runs in the first region with a free slot, through that region's SSM proxy", async () => {
    const { deps, streams } = fake({
      boxes: { a: instances(["i-a", "light", "2026-10-30T00:00:00Z"]), b: instances(lightBox) },
      agent: freeOn("i-a", "i-l"),
    });
    expect(await runTestbed(request({ settings: over("a", "b") }), deps, captureIo().io)).toBe(0);
    expect(streams[0]).toContain("ubuntu@i-a:/data/jobs/x/app/");
    expect(streams[0]).toContain("--region a'");
    expect(streams[1]).toContain("ubuntu@i-a");
  });

  it("lands in the next region when every slot of the first is busy", async () => {
    const { deps, streams, calls } = fake({
      boxes: { a: instances(["i-a", "light", "2026-10-30T00:00:00Z"]), b: instances(lightBox) },
      agent: freeOn("i-l"),
    });
    expect(await runTestbed(request({ settings: over("a", "b") }), deps, captureIo().io)).toBe(0);
    expect(streams[0]).toContain("ubuntu@i-l:/data/jobs/x/app/");
    expect(streams[0]).toContain("--region b'");
    const ssh = calls.filter((call) => call.startsWith("ssh ") && call.includes("ubuntu@i-l"));
    expect(ssh.every((call) => call.includes("--region b"))).toBe(true);
  });

  it("raises the group in the first region with room when every slot is busy, then exits 73 with --no-wait", async () => {
    const { deps, calls, streams } = fake({
      boxes: { a: instances(["i-a", "light", "2026-10-30T00:00:00Z"]), b: "[]" },
      agent: freeOn(),
      group: { a: "1\t1\t0\n", b: "0\t1\t0\n" },
    });
    const { io, output } = captureIo();
    expect(await runTestbed(request({ noWait: true, settings: over("a", "b") }), deps, io)).toBe(
      73,
    );
    expect(calls.filter((call) => call.includes("set-desired-capacity"))).toEqual([
      "aws --profile p --region b autoscaling set-desired-capacity --auto-scaling-group-name stackra-testbed-light --desired-capacity 1",
    ]);
    expect(output()).toContain("raised the light group to 1 in b");
    expect(streams).toEqual([]);
  });

  it("never lets a heavy job use a light box: it raises the heavy group instead", async () => {
    const { deps, calls, streams } = fake({
      boxes: { a: instances(lightBox) },
      agent: freeOn("i-l"),
      group: "0\t1\t0\n",
    });
    const heavy = request({ args: ["w", "/tmp/app", "pnpm build"], noWait: true });
    expect(await runTestbed({ ...heavy, settings: over("a") }, deps, captureIo().io)).toBe(75);
    expect(streams).toEqual([]);
    expect(calls.filter((call) => call.includes("set-desired-capacity"))).toEqual([
      "aws --profile p --region a autoscaling set-desired-capacity --auto-scaling-group-name stackra-testbed-heavy --desired-capacity 1",
    ]);
  });

  it("skips a region that cannot be reached", async () => {
    const { deps, streams } = fake({
      boxes: { a: undefined, b: instances(lightBox) },
      agent: freeOn("i-l"),
    });
    expect(await runTestbed(request({ settings: over("a", "b") }), deps, captureIo().io)).toBe(0);
    expect(streams[1]).toContain("ubuntu@i-l");
  });

  it("makes no call in a region outside the enabled list, whatever the verb", async () => {
    const boxes = {
      a: instances(["i-a", "light", "2026-10-30T00:00:00Z"]),
      z: instances(lightBox),
    };
    for (const verb of ["run", "status", "scale", "ip", "unlock", "image"]) {
      const { deps, calls, streams } = fake({ boxes, agent: freeOn("i-a"), group: "1\t1\t0\n" });
      await runTestbed(
        request({ verb, ...(verb === "run" ? {} : { args: [] }), settings: over("a") }),
        deps,
        captureIo().io,
      );
      expect([...regionsCalled([...calls, ...streams])]).toEqual(["a"]);
    }
  });

  it("exits 73 with --no-wait when a healthy box has no free slot, and 75 when none is healthy", async () => {
    const busy = fake({ boxes: instances(lightBox), agent: freeOn() });
    expect(await runTestbed(request({ noWait: true }), busy.deps, captureIo().io)).toBe(73);
    const down = fake({
      boxes: instances(lightBox),
      agent: (_box, command) =>
        command.includes("health") ? { code: 1, stdout: "unhealthy" } : { code: 0, stdout: "free" },
    });
    expect(await runTestbed(request({ noWait: true }), down.deps, captureIo().io)).toBe(75);
  });
});

describe("runTestbed run --json", () => {
  it("prints exactly one JSON line on stdout and leaves the rest on stderr", async () => {
    const { deps } = fake({ boxes: { b: instances(lightBox) }, jobRun: [0], tick: 1000 });
    const { io, out, err } = splitIo();
    const code = await runTestbed(request({ json: true, settings: over("b") }), deps, io);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]?.endsWith("\n")).toBe(true);
    const result = JSON.parse(out[0] ?? "") as Record<string, unknown>;
    expect(Object.keys(result)).toEqual([
      "region",
      "box",
      "slot",
      "waitSeconds",
      "runSeconds",
      "exitCode",
    ]);
    expect(result).toMatchObject({ region: "b", box: "i-l", slot: "light", exitCode: 0 });
    expect(Number.isInteger(result["waitSeconds"])).toBe(true);
    expect(Number.isInteger(result["runSeconds"])).toBe(true);
    expect(err.join("")).toContain("stackra testbed: box 1 (b)");
  });

  it("exits with the job's own status, 124 included, and reports it", async () => {
    for (const status of [7, 124]) {
      const { deps } = fake({ boxes: instances(lightBox), jobRun: [status] });
      const { io, out } = splitIo();
      expect(await runTestbed(request({ json: true }), deps, io)).toBe(status);
      expect(JSON.parse(out[0] ?? "")).toMatchObject({ exitCode: status });
    }
  });

  it("still prints one line when no slot is free (73) or no box is healthy (75), with no region or box", async () => {
    const busy = fake({ boxes: instances(lightBox), agent: freeOn() });
    const first = splitIo();
    expect(await runTestbed(request({ json: true, noWait: true }), busy.deps, first.io)).toBe(73);
    expect(first.out).toHaveLength(1);
    expect(JSON.parse(first.out[0] ?? "")).toMatchObject({
      region: null,
      box: null,
      slot: "light",
      exitCode: 73,
    });
    const none = fake({ boxes: "[]" });
    const second = splitIo();
    expect(await runTestbed(request({ json: true, noWait: true }), none.deps, second.io)).toBe(75);
    expect(JSON.parse(second.out[0] ?? "")).toMatchObject({ exitCode: 75 });
  });

  it("prints nothing on stdout for a usage error, which exits 2 by throwing", async () => {
    const { deps } = fake({ boxes: "[]" });
    const { io, out } = splitIo();
    await expect(runTestbed(request({ json: true, args: ["only one"] }), deps, io)).rejects.toThrow(
      "run takes",
    );
    expect(out).toEqual([]);
    const nested = splitIo();
    expect(
      await runTestbed(
        request({ json: true, args: ["w", "/tmp/app", "ci-box status"] }),
        deps,
        nested.io,
      ),
    ).toBe(2);
    expect(JSON.parse(nested.out[0] ?? "")).toMatchObject({ exitCode: 2 });
  });

  it("prints no JSON without --json", async () => {
    const { deps } = fake({ boxes: instances(lightBox) });
    const { io, out } = splitIo();
    expect(await runTestbed(request({}), deps, io)).toBe(0);
    expect(out).toEqual([]);
  });
});

/** A heavy box whose heavy slot is free and light slot busy. */
const agent = (box: string, command: string) =>
  command.includes("slot light")
    ? { code: 0, stdout: "busy x" }
    : command.includes("slot heavy")
      ? { code: 0, stdout: "free" }
      : command.includes("testbed-agent status")
        ? { code: 0, stdout: `status of ${box}` }
        : defaultAgent(command);

describe("runTestbed status", () => {
  const boxes = { a: instances(heavyBox), b: undefined };

  it("--json lists every enabled region with free, total and startable slots and marks an unreachable one", async () => {
    const { deps } = fake({ boxes, agent, group: { a: "1\t1\t0\n", b: "0\t1\t0\n" } });
    const { io, out } = splitIo();
    const status = request({ verb: "status", args: [], json: true, settings: over("a", "b") });
    expect(await runTestbed(status, deps, io)).toBe(0);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0] ?? "")).toEqual({
      regions: [
        {
          region: "a",
          reachable: true,
          heavy: { free: 1, total: 1, startable: 0 },
          light: { free: 0, total: 1, startable: 1 },
          boxes: [
            { id: "i-h", kind: "heavy", healthy: true, slots: { heavy: "free", light: "busy" } },
          ],
        },
        {
          region: "b",
          reachable: false,
          heavy: { free: 0, total: 0, startable: 0 },
          light: { free: 0, total: 0, startable: 0 },
          boxes: [],
        },
      ],
    });
  });

  it("lists each box with its region, and the unreachable region, in plain text", async () => {
    const { deps } = fake({ boxes, agent, group: "1\t1\t0\n" });
    const { io, out } = splitIo();
    await runTestbed(request({ verb: "status", args: [], settings: over("a", "b") }), deps, io);
    const text = out.join("");
    expect(text).toContain("a: heavy 1/1 free (+0 startable), light 0/1 free (+1 startable)");
    expect(text).toContain("box 1 i-h heavy (a): status of i-h");
    expect(text).toContain("b: unreachable");
  });
});

describe("runTestbed scale and unlock", () => {
  const boxes = { a: "[]", b: instances(lightBox) };

  it("scales in the region of the box it names", async () => {
    const { deps, calls } = fake({ boxes, group: "0\t1\t0\n" });
    const named = request({
      verb: "scale",
      args: [],
      box: "i-l",
      slot: "light",
      settings: over("a", "b"),
    });
    expect(await runTestbed(named, deps, captureIo().io)).toBe(0);
    expect(calls.filter((call) => call.includes("set-desired-capacity"))).toEqual([
      "aws --profile p --region b autoscaling set-desired-capacity --auto-scaling-group-name stackra-testbed-light --desired-capacity 1",
    ]);
  });

  it("scales in the first enabled region when it names no box", async () => {
    const { deps, calls } = fake({ boxes, group: "0\t1\t0\n" });
    const first = request({ verb: "scale", args: [], slot: "heavy", settings: over("a", "b") });
    expect(await runTestbed(first, deps, captureIo().io)).toBe(0);
    expect(calls.filter((call) => call.includes("set-desired-capacity"))).toEqual([
      "aws --profile p --region a autoscaling set-desired-capacity --auto-scaling-group-name stackra-testbed-heavy --desired-capacity 1",
    ]);
  });

  it("unlocks the box it names through that box's own region", async () => {
    const { deps, streams } = fake({ boxes });
    const named = request({
      verb: "unlock",
      args: [],
      box: "i-l",
      slot: "light",
      settings: over("a", "b"),
    });
    expect(await runTestbed(named, deps, captureIo().io)).toBe(0);
    expect(streams).toHaveLength(1);
    expect(streams[0]).toContain("--region b");
    expect(streams[0]).toContain("ubuntu@i-l");
    expect(streams[0]).toContain("testbed-agent job stop light");
  });
});

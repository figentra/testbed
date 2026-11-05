/**
 * Testbed file contract:
 * Purpose: `runTestbed(request, deps, io)`, every `testbed` verb: `run` (look at every enabled region, pick a
 *          free slot or a group to raise with `pickTestbedSlot`, claim it, prepare the job directory, rsync into it,
 *          run the command detached under the box's lock and follow its log (reattaching after a dropped connection),
 *          retry on exit 75, 73 and a lost light box, dispatch the GitHub
 *          fallback when the caller's repository has its workflow; `--json` prints one result line), `status`
 *          (every region, also `--json`), `unlock`, `ip`, `ssh`, `sync`, `scale` and `image`. It replaces the Mac
 *          script `ci-box`. A box is reached by SSH through SSM
 *          Session Manager (`ProxyCommand`, `AWS-StartSSHSession`, the instance id), so the security group needs no
 *          inbound rule; `--ssh-direct` reaches the public IP and swaps this machine's address into the allowlist.
 *          Every box carries its region, and the SSM proxy and each `aws` call for it use that region. Without the
 *          Session Manager plugin SSM reaches no box, so a verb that needs one says why and `run` exits 75 at once
 *          instead of waiting on boxes that are healthy; `status` shows why a box did not answer. When no enabled
 *          region answers (this machine's AWS access), `run` exits 75 at once with AWS's reason.
 * Boundary: starts only `aws`, `ssh`, `rsync` and `gh`, through `deps`, without a shell; every caller word a box shell
 *           sees is single-quoted. It calls `aws` only in an enabled region (`settings.regions`). It never reads,
 *           prints or passes a secret value (the key is a file path), and it never runs a job on the Mac. The job's
 *           own output goes wherever `deps.stream` writes (the command points it at stderr under `--json`).
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); the agent contract in the testbed spec; ADR 0522 (the `testbed` CLI);
 *                     STA-1953 (SSM access); the testbed regions contract (STA-2042).
 */
import { resolve } from "node:path";

import { TESTBED_FALLBACK_WORKFLOW } from "#cli/constants/testbed-fallback-workflow.constant";
import { TESTBED_POLL_MS } from "#cli/constants/testbed-poll-ms.constant";
import { TESTBED_PRESETS } from "#cli/constants/testbed-presets.constant";
import { TESTBED_REATTACH_MS } from "#cli/constants/testbed-reattach-ms.constant";
import { TESTBED_REATTACH_TRIES } from "#cli/constants/testbed-reattach-tries.constant";
import { CliUsageError } from "#cli/errors/cli-usage.error";
import { claimTestbedSlot } from "#cli/functions/claim-testbed-slot.function";
import { classifyTestbedCommand } from "#cli/functions/classify-testbed-command.function";
import { decideTestbedFallback } from "#cli/functions/decide-testbed-fallback.function";
import { hasTestbedFallback } from "#cli/functions/has-testbed-fallback.function";
import { orderTestbedBoxes } from "#cli/functions/order-testbed-boxes.function";
import { parseTestbedBoxes } from "#cli/functions/parse-testbed-boxes.function";
import { pickTestbedSlot } from "#cli/functions/pick-testbed-slot.function";
import { refusesTestbedCommand } from "#cli/functions/refuses-testbed-command.function";
import { releaseTestbedClaim } from "#cli/functions/release-testbed-claim.function";
import { summarizeTestbedRegion } from "#cli/functions/summarize-testbed-region.function";
import { testbedProject } from "#cli/functions/testbed-project.function";
import type { CliIo } from "#cli/types/cli-io.type";
import type { TestbedBox } from "#cli/types/testbed-box.type";
import type { TestbedBoxState } from "#cli/types/testbed-box-state.type";
import type { TestbedDeps } from "#cli/types/testbed-deps.type";
import type { TestbedGroupCounts } from "#cli/types/testbed-group-counts.type";
import type { TestbedRegionState } from "#cli/types/testbed-region-state.type";
import type { TestbedRequest } from "#cli/types/testbed-request.type";
import type { TestbedSlotPick } from "#cli/types/testbed-slot-pick.type";
import type { ToolOutput } from "#cli/types/tool-output.type";
import { TESTBED_DEFAULTS } from "#core/constants/testbed-defaults.constant";

const { exitCodes: EXIT } = TESTBED_DEFAULTS;

const NOT_STARTED: ToolOutput = { code: 127, stdout: "", stderr: "cannot start" };

/** `value` as one single-quoted word for the box's shell. */
const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

/** The result of one `run`: the exit code, and where and how long when a job ran. */
type RunResult = {
  readonly code: number;
  readonly region?: string;
  readonly box?: string;
  readonly slot?: string;
  readonly waitSeconds: number;
  readonly runSeconds: number;
};

/** Whether a box of group `group` has a slot of kind `kind` (a heavy box has both, a light box only light). */
const hostsSlot = (group: string, kind: string): boolean => group === "heavy" || group === kind;

/** Whole seconds in `milliseconds`. */
const seconds = (milliseconds: number): number => Math.floor(milliseconds / 1000);

/**
 * Runs one `testbed` call and resolves with its exit code.
 *
 * @param request - the parsed command line.
 * @param deps - the processes, clock and claim folder.
 * @param io - where the command writes.
 * @example
 * const code = await runTestbed(request, deps, io);
 */
export async function runTestbed(
  request: TestbedRequest,
  deps: TestbedDeps,
  io: CliIo,
): Promise<number> {
  const { settings } = request;
  const say = (text: string): void => io.err(`testbed: ${text}\n`);

  // Every call names its region: an enabled one (`settings.regions`) or the region of a box found there.
  const aws = async (region: string, args: readonly string[]): Promise<ToolOutput> =>
    (await deps.exec("aws", ["--profile", settings.profile, "--region", region, ...args])) ??
    NOT_STARTED;

  // One region's running boxes, or `undefined` when its call failed (the region is unreachable; `awsError` says why).
  let awsError = "";
  const describe = async (region: string): Promise<readonly TestbedBox[] | undefined> => {
    const out = await aws(region, [
      "ec2",
      "describe-instances",
      "--filters",
      `Name=tag-key,Values=${TESTBED_DEFAULTS.groupTagKey}`,
      "Name=instance-state-name,Values=running",
      "--query",
      `Reservations[].Instances[].{id:InstanceId,ip:PublicIpAddress,group:Tags[?Key==\`${TESTBED_DEFAULTS.groupTagKey}\`]|[0].Value,launch:LaunchTime}`,
      "--output",
      "json",
    ]);
    if (out.code === 0) return parseTestbedBoxes(out.stdout, region);
    awsError = out.stderr.trim().split("\n").pop()?.trim() ?? "";
    return undefined;
  };

  // The running boxes of the enabled regions in region order, each region's oldest first; a region that does not
  // answer has none.
  const listBoxes = async (): Promise<readonly TestbedBox[]> =>
    (await Promise.all(settings.regions.map(describe))).flatMap((boxes) => boxes ?? []);

  // A box is reached through SSM Session Manager by its instance id, so no inbound port 22 and no allowlist; a Mac
  // behind WARP has no stable public IP (STA-1953). `--ssh-direct` keeps the public-IP path and its allowlist.
  const direct = settings.sshDirect === true;

  // The SSH allowlist is this Mac's public IP; when it changes, swap the rule (once per region per run). The promise
  // is kept so boxes looked at in parallel all wait for the swap.
  const allowlisted = new Map<string, Promise<void>>();
  const swapAllowlist = async (region: string): Promise<void> => {
    const ip = await deps.publicIp();
    if (ip === undefined) return;
    const me = `${ip}/32`;
    const current = await aws(region, [
      "ec2",
      "describe-security-groups",
      "--group-names",
      TESTBED_DEFAULTS.securityGroup,
      "--query",
      "SecurityGroups[0].IpPermissions[?FromPort==`22`].IpRanges[].CidrIp",
      "--output",
      "text",
    ]);
    const ranges = current.stdout.split(/\s+/).filter(Boolean);
    if (ranges.includes(me)) return;
    const rule = (verb: string, cidr: string): Promise<ToolOutput> =>
      aws(region, [
        "ec2",
        `${verb}-security-group-ingress`,
        "--group-name",
        TESTBED_DEFAULTS.securityGroup,
        "--protocol",
        "tcp",
        "--port",
        "22",
        "--cidr",
        cidr,
      ]);
    await rule("authorize", me);
    for (const range of ranges) await rule("revoke", range);
    say(`SSH allowlist now ${me} (${region})`);
  };
  const allowMe = (region: string): Promise<void> => {
    if (!direct) return Promise.resolve();
    const done = allowlisted.get(region) ?? swapAllowlist(region);
    allowlisted.set(region, done);
    return done;
  };

  // The SSM proxy of a box runs in the box's own region.
  const proxy = (box: TestbedBox): string =>
    `aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p --profile ${settings.profile} --region ${box.region}`;
  const sshArgs = (box: TestbedBox): readonly string[] => [
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=15",
    // A dead SSM session is noticed in two minutes instead of hanging until the job's timeout.
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=4",
    ...(direct ? [] : ["-o", `ProxyCommand=${proxy(box)}`]),
    "-i",
    settings.key,
  ];
  // Without the plugin every SSM ssh fails as if each box were down: on 2026-11-04 every run waited on "no healthy
  // testbed box" while both boxes were healthy, because the plugin was on PATH only in a mise-activated shell.
  let plugin: Promise<string | undefined> | undefined;
  const ssmMissing = (): Promise<string | undefined> =>
    direct ? Promise.resolve(undefined) : (plugin ??= deps.ssmPlugin());
  const needSsm = async (): Promise<boolean> => {
    const missing = await ssmMissing();
    if (missing !== undefined) say(missing);
    return missing === undefined;
  };

  const target = (box: TestbedBox): string => `${settings.user}@${direct ? box.ip : box.id}`;
  const remote = async (box: TestbedBox, command: string): Promise<ToolOutput> => {
    await allowMe(box.region);
    return (await deps.exec("ssh", [...sshArgs(box), target(box), command])) ?? NOT_STARTED;
  };
  const remoteStream = async (box: TestbedBox, command?: string): Promise<number> => {
    await allowMe(box.region);
    return deps.stream("ssh", [
      ...sshArgs(box),
      target(box),
      ...(command === undefined ? [] : [command]),
    ]);
  };

  // The job runs detached on the box (its own session, HUP ignored), writing its log and exit code to files, and the
  // Mac follows the log. A long job's SSH-over-SSM stream can break ("Bad packet length ... Connection corrupted",
  // 2026-11-04, after 23 minutes): the job keeps running, the Mac reattaches up to TESTBED_REATTACH_TRIES times, and
  // the exit code comes from the file. Exit 255 still means the box was lost: the job never started or never answered.
  const runDetached = async (
    box: TestbedBox,
    id: string,
    slot: string,
    agent: string,
  ): Promise<number> => {
    const f = `/tmp/testbed-${id}`;
    const start =
      `f=${f}; : >>"$f.log"; setsid nohup sh -c '"$@" >>"$0.log" 2>&1; echo $? >"$0.rc"' "$f" ${agent}` +
      ` </dev/null >/dev/null 2>&1 & echo $! >"$f.pid"`;
    // Waits for the job's pid (30 s, then 255: it never started), follows the log until the job exits, then exits with
    // its code; no code file means the job was killed on the box.
    const follow = (lines: string): string =>
      `f=${f}; n=0; until [ -s "$f.pid" ]; do n=$((n+1)); [ $n -le 30 ] || exit 255; sleep 1; done; p=$(cat "$f.pid");` +
      ` tail -n ${lines} -f --pid="$p" "$f.log"; while kill -0 "$p" 2>/dev/null; do sleep 1; done;` +
      ` [ -s "$f.rc" ] || { echo "testbed job ended without an exit code" >&2; exit 1; };` +
      ` rc=$(cat "$f.rc"); rm -f "$f.log" "$f.rc" "$f.pid"; exit "$rc"`;
    // Ctrl-C or a caller's SIGTERM stops the job on the box, as closing the old attached session did.
    const stop: { done?: Promise<ToolOutput> } = {};
    const off = deps.onInterrupt(() => {
      stop.done ??= remote(box, `f=${f}; [ -e "$f.rc" ] || testbed-agent job stop ${slot}`);
    });
    try {
      let code = await remoteStream(box, `${start}; ${follow("+1")}`);
      for (
        let tries = 0;
        code === 255 && stop.done === undefined && tries < TESTBED_REATTACH_TRIES;
        tries += 1
      ) {
        say(
          `lost the connection to ${box.id} (${box.region}); the job keeps running there, reattaching`,
        );
        await deps.sleep(TESTBED_REATTACH_MS);
        code = await remoteStream(box, follow("50"));
      }
      if (stop.done === undefined) return code;
      await stop.done;
      return 130;
    } finally {
      off();
    }
  };

  const pickBox = async (): Promise<TestbedBox | undefined> => {
    const boxes = await listBoxes();
    const flag = request.box;
    const box =
      flag === undefined
        ? boxes[0]
        : /^\d+$/.test(flag)
          ? boxes[Number(flag) - 1]
          : boxes.find((candidate) => candidate.id === flag);
    if (box === undefined) say("no such running testbed box");
    return box;
  };

  const counts = async (region: string, slot: string): Promise<TestbedGroupCounts | undefined> => {
    const out = await aws(region, [
      "autoscaling",
      "describe-auto-scaling-groups",
      "--auto-scaling-group-names",
      `${TESTBED_DEFAULTS.groupPrefix}-${slot}`,
      "--query",
      "AutoScalingGroups[0].[DesiredCapacity,MaxSize,MinSize]",
      "--output",
      "text",
    ]);
    const [desired, max, min] = out.stdout.trim().split(/\s+/).map(Number);
    if (out.code !== 0 || desired === undefined || max === undefined || min === undefined) {
      return undefined;
    }
    if ([desired, max, min].some(Number.isNaN)) return undefined;
    return { desired, max, min };
  };

  const setDesired = (region: string, slot: string, desired: number): Promise<ToolOutput> =>
    aws(region, [
      "autoscaling",
      "set-desired-capacity",
      "--auto-scaling-group-name",
      `${TESTBED_DEFAULTS.groupPrefix}-${slot}`,
      "--desired-capacity",
      String(desired),
    ]);

  // One look at every enabled region, in parallel: its boxes with their health and the state of the `kinds` slots
  // they host, and the counts of the `kinds` groups. A region whose boxes cannot be listed is unreachable.
  const survey = (kinds: readonly string[]): Promise<readonly TestbedRegionState[]> =>
    Promise.all(
      settings.regions.map(async (region): Promise<TestbedRegionState> => {
        const listed = await describe(region);
        if (listed === undefined) return { region, reachable: false, boxes: [], groups: {} };
        const look = async (box: TestbedBox): Promise<TestbedBoxState> => {
          const hosted = kinds.filter((kind) => hostsSlot(box.group, kind));
          const [health, slots] = await Promise.all([
            remote(box, "testbed-agent health"),
            Promise.all(hosted.map((kind) => remote(box, `testbed-agent slot ${kind}`))),
          ]);
          const healthy = health.code === 0;
          const state = (index: number): "free" | "busy" =>
            slots[index]?.stdout.trim() === "free" ? "free" : "busy";
          return {
            ...box,
            healthy,
            slots: healthy ? Object.fromEntries(hosted.map((kind, i) => [kind, state(i)])) : {},
          };
        };
        const [boxes, groups] = await Promise.all([
          Promise.all(listed.map(look)),
          Promise.all(kinds.map((kind) => counts(region, kind))),
        ]);
        return {
          region,
          reachable: true,
          boxes,
          groups: Object.fromEntries(kinds.map((kind, i) => [kind, groups[i]])),
        };
      }),
    );

  // The fallback runs a preset on GitHub; the workflow takes the preset and the ref, never a command. A repository
  // without the workflow gets a hint and exit 75 instead of a dispatch that cannot find it.
  const dispatch = async (preset: string): Promise<number> => {
    if (!hasTestbedFallback(request.cwd)) {
      say(
        `no healthy box, and this repository has no .github/workflows/${TESTBED_FALLBACK_WORKFLOW}: start a box with \`testbed scale --slot heavy\` or run from a repository that has it`,
      );
      return EXIT.unhealthy;
    }
    const code = await deps.stream("gh", [
      "workflow",
      "run",
      TESTBED_FALLBACK_WORKFLOW,
      "--ref",
      request.ref ?? "",
      "-f",
      `preset=${preset}`,
    ]);
    if (code === 0) say(`no healthy box: dispatched ${TESTBED_FALLBACK_WORKFLOW} (${preset})`);
    return code;
  };

  // Wait for a slot (never pile onto a busy one): look at every enabled region, let `pickTestbedSlot` choose, and raise
  // a group when it says so. The Mac-side claim stops parallel callers picking the same free slot while the first one
  // is still syncing.
  const acquire = async (
    slot: string,
    skip: Set<string>,
  ): Promise<{ box: TestbedBox; number: number } | { exit: number }> => {
    let said = false;
    let busySince: number | undefined;
    for (;;) {
      const seen = await survey([slot]);
      const numbered = seen.flatMap((state) => state.boxes);
      // A slot another caller holds, or that answered busy once claimed, is busy for the rest of this look.
      const taken = new Set<string>();
      let view: readonly TestbedRegionState[];
      let step: TestbedSlotPick;
      for (;;) {
        view = seen.map((state) => ({
          ...state,
          boxes: state.boxes.map((box) => ({
            ...box,
            healthy: box.healthy && !skip.has(box.id),
            slots: taken.has(`${box.id}-${slot}`) ? { ...box.slots, [slot]: "busy" } : box.slots,
          })),
        }));
        step = pickTestbedSlot(view, { slot, busySince, now: deps.now() });
        if (step.action !== "run") break;
        const name = `${step.box.id}-${slot}`;
        if (claimTestbedSlot(deps.claimRoot, name, deps.pid, deps.isAlive)) {
          const out = await remote(step.box, `testbed-agent slot ${slot}`);
          if (out.stdout.trim() === "free") {
            const { box } = step;
            return { box, number: numbered.findIndex((other) => other.id === box.id) + 1 };
          }
          releaseTestbedClaim(deps.claimRoot, name);
        }
        taken.add(name);
      }
      const healthy = view
        .filter((state) => state.reachable)
        .flatMap((state) => orderTestbedBoxes(state.boxes, slot, new Set()))
        .filter((box) => box.healthy).length;
      const preset = request.preset;
      if (
        preset !== undefined &&
        decideTestbedFallback({ healthyCount: healthy, preset }) === "dispatch"
      ) {
        return { exit: await dispatch(preset) };
      }
      // No region answering is this machine's AWS access (a bad or expired profile), not a busy fleet: waiting cannot
      // fix it, so exit 75 now and say why, instead of waiting until the caller's own timeout. The fallback above
      // needs no AWS, so it still goes first.
      if (seen.every((state) => !state.reachable)) {
        say(
          `no enabled region answers (${awsError || "no reason given"}); check the AWS profile ${settings.profile}`,
        );
        return { exit: EXIT.unhealthy };
      }
      if (healthy > 0) busySince ??= deps.now();
      if (step.action === "scale") {
        // A group at 0 (its minimum since ADR 0516) has no box to answer: start one instead of waiting for none.
        const raised = await setDesired(step.region, slot, step.desired);
        say(
          raised.code === 0
            ? `${step.desired === 1 ? `no ${slot} box running` : `every ${slot} slot busy`}: raised the ${slot} group to ${step.desired} in ${step.region}`
            : `cannot raise the ${slot} group in ${step.region}`,
        );
        if (healthy > 0) busySince = deps.now();
      }
      if (request.noWait) {
        say(healthy === 0 ? "no healthy testbed box" : "every testbed slot busy");
        return { exit: healthy === 0 ? EXIT.unhealthy : EXIT.slotBusy };
      }
      if (!said) say(healthy === 0 ? "no healthy testbed box, waiting" : "every box busy, waiting");
      said = true;
      skip.clear();
      await deps.sleep(TESTBED_POLL_MS);
    }
  };

  // `job prepare`, then rsync into the path it returns.
  const prepareAndSync = async (
    box: TestbedBox,
    id: string,
    project: string,
    directory: string,
  ): Promise<{ code: number; path?: string }> => {
    const prepared = await remote(box, `testbed-agent job prepare ${quote(id)} ${quote(project)}`);
    const path = prepared.stdout.trim().split("\n").pop() ?? "";
    if (prepared.code !== 0 || path === "") return { code: prepared.code || 1 };
    const code = await deps.stream("rsync", [
      "-az",
      "--delete",
      "-e",
      `ssh -o StrictHostKeyChecking=accept-new${direct ? "" : ` -o 'ProxyCommand=${proxy(box)}'`} -i ${settings.key}`,
      ...TESTBED_DEFAULTS.rsyncExcludes.flatMap((pattern) => ["--exclude", pattern]),
      `${directory}/`,
      `${target(box)}:${path}/`,
    ]);
    return { code, path };
  };

  const jobId = (attempt: number): string =>
    `j${deps.now().toString(36)}${deps.pid.toString(36)}${attempt}`;

  const run = async (): Promise<RunResult> => {
    const [who, dir, command] = request.args;
    if (
      who === undefined ||
      dir === undefined ||
      command === undefined ||
      request.args.length > 3
    ) {
      throw new CliUsageError('run takes "<session> <what>", a directory and one command string');
    }
    if (request.preset !== undefined) {
      if (!TESTBED_PRESETS.includes(request.preset)) {
        throw new CliUsageError(`unknown preset: ${request.preset} (${TESTBED_PRESETS.join("|")})`);
      }
      if (request.ref === undefined) throw new CliUsageError("--preset needs --ref <ref>");
    }
    // testbed and ci-box exist only on the Mac: a nested call waits forever on the box holding its lock.
    if (refusesTestbedCommand(command)) {
      say("the command must not call testbed or ci-box; run it from the Mac instead");
      return { code: 2, waitSeconds: 0, runSeconds: 0 };
    }
    const slot = request.onDemand ? "heavy" : classifyTestbedCommand(command);
    if (!(await needSsm())) return { code: EXIT.unhealthy, slot, waitSeconds: 0, runSeconds: 0 };
    const directory = resolve(request.cwd, dir);
    const project = testbedProject(directory);
    const skip = new Set<string>();
    const startedAt = deps.now();
    let retried = false;
    for (let attempt = 1; ; attempt += 1) {
      const got = await acquire(slot, skip);
      if ("exit" in got) {
        return {
          code: got.exit,
          slot,
          waitSeconds: seconds(deps.now() - startedAt),
          runSeconds: 0,
        };
      }
      const { box } = got;
      const acquiredAt = deps.now();
      const done = (code: number): RunResult => ({
        code,
        region: box.region,
        box: box.id,
        slot,
        waitSeconds: seconds(acquiredAt - startedAt),
        runSeconds: seconds(deps.now() - acquiredAt),
      });
      try {
        say(`box ${got.number} (${box.region})${slot === "light" ? " (light slot)" : ""}`);
        const id = jobId(attempt);
        const synced = await prepareAndSync(box, id, project, directory);
        if (synced.code === EXIT.unhealthy) {
          skip.add(box.id);
          continue;
        }
        if (synced.code !== 0) return done(synced.code);
        const code = await runDetached(
          box,
          id,
          slot,
          `testbed-agent job run ${quote(id)} ${slot} ${quote(who)} ${quote(project)}${request.postgres ? " --postgres" : ""} -- ${quote(command)}`,
        );
        if (code === EXIT.unhealthy) {
          skip.add(box.id);
          continue;
        }
        if (code === EXIT.slotBusy) {
          await deps.sleep(1000);
          continue;
        }
        // A spot reclaim drops ssh (255): a light job is safe to run again once on another box, a heavy one never is.
        if (code === 255 && slot === "light" && !retried) {
          retried = true;
          skip.add(box.id);
          say("lost the box (spot reclaim?); retrying once on another box");
          continue;
        }
        return done(code);
      } finally {
        releaseTestbedClaim(deps.claimRoot, `${box.id}-${slot}`);
      }
    }
  };

  switch (request.verb) {
    case "run": {
      const result = await run();
      if (request.json) {
        // The one machine-readable line; the job's own output went to stderr.
        io.out(
          `${JSON.stringify({
            region: result.region ?? null,
            box: result.box ?? null,
            slot: result.slot ?? null,
            waitSeconds: result.waitSeconds,
            runSeconds: result.runSeconds,
            exitCode: result.code,
          })}\n`,
        );
      }
      return result.code;
    }
    case "status": {
      await needSsm();
      const states = await survey(["heavy", "light"]);
      if (request.json) {
        io.out(
          `${JSON.stringify({ regions: states.map((state) => summarizeTestbedRegion(state)) })}\n`,
        );
        return 0;
      }
      if (states.every((state) => state.boxes.length === 0)) io.out("no running testbed box\n");
      let number = 0;
      for (const state of states) {
        if (!state.reachable) {
          io.out(`${state.region}: unreachable\n`);
          continue;
        }
        const summary = summarizeTestbedRegion(state);
        const slots = (kind: "heavy" | "light"): string =>
          `${kind} ${summary[kind].free}/${summary[kind].total} free (+${summary[kind].startable} startable)`;
        const desired = (kind: string): string =>
          `${kind} ${state.groups[kind]?.desired ?? "?"}/${state.groups[kind]?.max ?? "?"}`;
        io.out(
          `${state.region}: ${slots("heavy")}, ${slots("light")}; desired ${desired("heavy")}, ${desired("light")}\n`,
        );
        for (const box of state.boxes) {
          number += 1;
          const out = await remote(box, "testbed-agent status");
          const why = out.stderr.trim().split("\n").pop()?.trim();
          io.out(
            `box ${number} ${box.id} ${box.group} (${box.region}): ${out.code === 0 ? out.stdout.trim() : `unreachable${why ? ` (${why})` : ""}`}\n`,
          );
        }
      }
      return 0;
    }
    case "unlock": {
      if (!(await needSsm())) return EXIT.unhealthy;
      const box = await pickBox();
      if (box === undefined) return 1;
      return remoteStream(box, `testbed-agent job stop ${request.slot ?? "heavy"}`);
    }
    case "ip": {
      const box = await pickBox();
      if (box === undefined) return 1;
      io.out(`${box.ip}\n`);
      return 0;
    }
    case "ssh": {
      if (!(await needSsm())) return EXIT.unhealthy;
      const box = await pickBox();
      if (box === undefined) return 1;
      return remoteStream(box, request.args.length > 0 ? request.args.join(" ") : undefined);
    }
    case "sync": {
      const [dir, ...extra] = request.args;
      if (dir === undefined || extra.length > 0)
        throw new CliUsageError("sync takes one directory");
      if (!(await needSsm())) return EXIT.unhealthy;
      const box = await pickBox();
      if (box === undefined) return 1;
      const directory = resolve(request.cwd, dir);
      const project = testbedProject(directory);
      const synced = await prepareAndSync(
        box,
        `sync-${project.replaceAll(/[^A-Za-z0-9_.-]/g, "-")}`,
        project,
        directory,
      );
      if (synced.code === 0) io.out(`${synced.path}\n`);
      return synced.code;
    }
    case "scale": {
      // The region of the box `--box` names, else the first enabled one (`--region` narrowed the list to one).
      const named = request.box === undefined ? undefined : await pickBox();
      if (request.box !== undefined && named === undefined) return 1;
      const region = named?.region ?? settings.regions[0] ?? settings.region;
      const slots = request.slot === undefined ? ["heavy", "light"] : [request.slot];
      let code = 0;
      for (const slot of slots) {
        const group = await counts(region, slot);
        if (group === undefined) {
          say(`cannot read the ${slot} group in ${region}`);
          code = 1;
          continue;
        }
        if (request.slot !== undefined) {
          if (group.desired >= group.max) {
            say(`the ${slot} group is at its maximum (${group.max}) in ${region}`);
            return 1;
          }
          const raised = await setDesired(region, slot, group.desired + 1);
          if (raised.code !== 0) return raised.code;
          io.out(
            `${slot}: desired ${group.desired + 1} (min ${group.min}, max ${group.max}) in ${region}\n`,
          );
          continue;
        }
        io.out(
          `${slot}: desired ${group.desired} (min ${group.min}, max ${group.max}) in ${region}\n`,
        );
      }
      return code;
    }
    case "image": {
      const out = await aws(settings.region, [
        "ssm",
        "get-parameter",
        "--name",
        TESTBED_DEFAULTS.amiParameter,
        "--query",
        "Parameter.[Value,LastModifiedDate]",
        "--output",
        "text",
      ]);
      const [image, modified] = out.stdout.trim().split(/\s+/);
      if (out.code !== 0 || image === undefined) {
        say(`cannot read ${TESTBED_DEFAULTS.amiParameter}`);
        return 1;
      }
      const at =
        modified === undefined
          ? Number.NaN
          : /^[\d.]+$/.test(modified)
            ? Number(modified) * 1000
            : Date.parse(modified);
      io.out(
        `${image} ${Number.isNaN(at) ? "age unknown" : `${Math.floor((deps.now() - at) / 86_400_000)}d`}\n`,
      );
      return 0;
    }
    default: {
      throw new CliUsageError(`unknown verb: ${request.verb}`);
    }
  }
}

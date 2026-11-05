/**
 * Testbed file contract:
 * Purpose: `createTestbedDeps(cwd, io)`, the real `TestbedDeps`: processes through `runCaptured` and `runProcess` (no
 *          shell), this Mac's public IP from checkip.amazonaws.com, the claim folder `/tmp/ci-claim`, SIGINT/SIGTERM,
 *          and the Session Manager plugin: on `PATH`, else the mise-installed copy (`mise which`, then mise's install
 *          folder), whose folder then goes first on this process's `PATH` so `aws ssm start-session` finds it.
 * Boundary: the only place `testbed` touches the clock, the network, process liveness and `PATH`.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";

import { runCaptured } from "#cli/functions/run-captured.function";
import { runProcess } from "#cli/functions/run-process.function";
import type { CliIo } from "#cli/types/cli-io.type";
import type { TestbedDeps } from "#cli/types/testbed-deps.type";

const PLUGIN = "session-manager-plugin";

/** Where mise keeps the plugin pinned in figentra/testbed's and figentra/stackra's `mise.toml`. */
const misePluginFolder = (): string =>
  join(
    process.env["MISE_DATA_DIR"] ?? join(homedir(), ".local", "share", "mise"),
    "installs",
    "aqua-aws-session-manager-plugin",
    "latest",
    "sessionmanager-bundle",
    "bin",
  );

/**
 * The real dependencies of one `testbed` run.
 *
 * @param cwd - the directory started processes run in.
 * @param io - where streamed processes write.
 * @example
 * const deps = createTestbedDeps(process.cwd(), PROCESS_IO);
 */
export function createTestbedDeps(cwd: string, io: CliIo): TestbedDeps {
  return {
    exec: (command, args) => runCaptured(command, args, cwd),
    stream: (command, args) => runProcess({ command, args, cwd }, io),
    sleep: (milliseconds) =>
      new Promise((done) => {
        setTimeout(done, milliseconds);
      }),
    now: () => Date.now(),
    pid: process.pid,
    isAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        // EPERM means the process exists but is not ours.
        return (error as NodeJS.ErrnoException).code === "EPERM";
      }
    },
    publicIp: async () => {
      try {
        const response = await fetch("https://checkip.amazonaws.com", {
          signal: AbortSignal.timeout(5000),
        });
        const ip = (await response.text()).trim();
        return /^[\d.]+$/.test(ip) ? ip : undefined;
      } catch {
        return undefined;
      }
    },
    claimRoot: "/tmp/ci-claim",
    onInterrupt: (handler) => {
      const on = (): void => handler();
      process.once("SIGINT", on);
      process.once("SIGTERM", on);
      return () => {
        process.off("SIGINT", on);
        process.off("SIGTERM", on);
      };
    },
    ssmPlugin: async () => {
      const works = async (): Promise<boolean> =>
        (await runCaptured(PLUGIN, ["--version"], cwd))?.code === 0;
      if (await works()) return undefined;
      // mise installs the plugin but puts it on PATH only in an activated shell inside a repository that pins it.
      const which = await runCaptured("mise", ["which", PLUGIN], cwd);
      const found = which?.code === 0 ? which.stdout.trim().split("\n").pop() : undefined;
      for (const folder of [found === undefined ? undefined : dirname(found), misePluginFolder()]) {
        if (folder === undefined || !existsSync(join(folder, PLUGIN))) continue;
        process.env["PATH"] = [folder, process.env["PATH"] ?? ""].join(delimiter);
        if (await works()) return undefined;
      }
      return (
        "the aws CLI's Session Manager plugin is not on PATH, so no box can be reached through SSM: run " +
        "`mise install` in figentra/testbed (it pins aqua:aws/session-manager-plugin), or install the plugin, " +
        "or use --ssh-direct"
      );
    },
  };
}

/**
 * Testbed file contract:
 * Purpose: `createTestbedDeps(cwd, io)`, the real `TestbedDeps`: processes through `runCaptured` and `runProcess` (no
 *          shell), this Mac's public IP from checkip.amazonaws.com, the claim folder `/tmp/ci-claim` and SIGINT/SIGTERM.
 * Boundary: the only place `testbed` touches the clock, the network and process liveness.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI).
 */
import { runCaptured } from "#cli/functions/run-captured.function";
import { runProcess } from "#cli/functions/run-process.function";
import type { CliIo } from "#cli/types/cli-io.type";
import type { TestbedDeps } from "#cli/types/testbed-deps.type";

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
  };
}

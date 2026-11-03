/**
 * Stackra file contract:
 * Purpose: `createTestbedDeps(cwd, io)`, the real `TestbedDeps`: processes through `runCaptured` and `runProcess` (no
 *          shell), this Mac's public IP from checkip.amazonaws.com, and the claim folder `/tmp/ci-claim`.
 * Boundary: the only place `stackra testbed` touches the clock, the network and process liveness.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */
import { runCaptured } from "#node/functions/run-captured.function";
import { runProcess } from "#node/functions/run-process.function";
import type { CliIo } from "#node/types/cli-io.type";
import type { TestbedDeps } from "#node/types/testbed-deps.type";

/**
 * The real dependencies of one `stackra testbed` run.
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
  };
}

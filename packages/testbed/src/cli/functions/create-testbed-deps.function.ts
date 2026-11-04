/**
 * Testbed file contract:
 * Purpose: `createTestbedDeps(io)`, the real `TestbedDeps` of one command run: captured tools through `runCaptured`
 *          (stdout and stderr apart, so `aws` JSON parses), streamed tools through the console's `io.process` sharing
 *          the standard streams (`inherit`: live, never refused for want of a terminal; under `--json` stdin is ignored
 *          and both outputs go to stderr), this Mac's public IP from checkip.amazonaws.com, and the claim folder
 *          `/tmp/ci-claim`. Every tool runs in `io.cwd`, without a shell.
 * Boundary: the only place `testbed` touches the clock, the network and process liveness.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0522 (the `testbed` CLI); ADR 0506 (the console, `inherit`).
 */
import type { CommandIo } from "@stackra/console";

import { runCaptured } from "#cli/functions/run-captured.function";
import type { TestbedDeps } from "#cli/types/testbed-deps.type";

/**
 * The real dependencies of one `testbed` run.
 *
 * @param io - the command run: its directory, its standard error and its child processes.
 * @example
 * const deps = createTestbedDeps(io);
 */
export function createTestbedDeps(io: CommandIo): TestbedDeps {
  return {
    exec: (command, args) => runCaptured(command, args, io.cwd),
    stream: async (command, args) => {
      const { code, output } = await io.process.run(command, args, { inherit: true, check: false });
      // A shared child's output is not captured, so `output` holds only why it could not start (exit 127).
      if (output !== "") io.stderr.write(`testbed: cannot start ${output}`);
      return code;
    },
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

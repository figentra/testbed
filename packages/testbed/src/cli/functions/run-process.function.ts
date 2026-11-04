/**
 * Testbed file contract:
 * Purpose: `runProcess(run, io)`, starts one tool process (`aws`, `ssh`, `rsync`, `gh`) and resolves with its exit
 *          code: with the terminal when `io.inherit`, otherwise with its output piped into `io`.
 * Boundary: never uses a shell, so no argument is parsed as shell syntax; never reads or prints a secret. A tool that
 *           cannot start resolves 127 with the reason written to `io.err`.
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI); POSIX exit status 127 for a command that cannot run.
 */
import { spawn } from "node:child_process";

import type { CliIo } from "#cli/types/cli-io.type";

/**
 * Runs `run` and resolves with its exit code.
 *
 * @param run - the program (found on `PATH`), its arguments and its directory.
 * @param io - where its output goes, unless it inherits the terminal.
 * @example
 * const code = await runProcess({ command: "gh", args: ["auth", "status"], cwd }, { out, err, inherit: false });
 */
export function runProcess(
  run: { readonly command: string; readonly args: readonly string[]; readonly cwd: string },
  io: CliIo,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(run.command, [...run.args], {
      cwd: run.cwd,
      stdio: io.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    child.stdout?.setEncoding("utf8").on("data", io.out);
    child.stderr?.setEncoding("utf8").on("data", io.err);
    let settled = false;
    // A spawn failure (no such program) emits `error` and then `close`; the first settle wins.
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      io.err(`testbed: cannot start ${run.command}: ${error.message}\n`);
      resolve(127);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      resolve(code ?? 1);
    });
  });
}

/**
 * Testbed file contract:
 * Purpose: `runCaptured(command, args, cwd)`, runs one tool with its output captured (stdout and stderr apart), or
 *          resolves `undefined` when the tool cannot start.
 * Boundary: starts one process through `runProcess` (no shell).
 * Runtime: node
 * Governing contract: ADR 0522 (the `testbed` CLI); POSIX exit status 127 for a command that cannot run.
 */
import { runProcess } from "#cli/functions/run-process.function";
import type { ToolOutput } from "#cli/types/tool-output.type";

/**
 * The output of `command args` run in `cwd`, or `undefined` when `command` cannot start.
 *
 * @param command - the program, found on `PATH`.
 * @param args - its arguments.
 * @param cwd - the absolute directory it runs in.
 * @example
 * const result = await runCaptured("aws", ["sts", "get-caller-identity"], cwd);
 */
export async function runCaptured(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<ToolOutput | undefined> {
  let stdout = "";
  let stderr = "";
  const code = await runProcess(
    { command, args, cwd },
    {
      out: (text) => {
        stdout += text;
      },
      err: (text) => {
        stderr += text;
      },
      inherit: false,
    },
  );
  if (code === 127 && stderr.startsWith(`testbed: cannot start ${command}:`)) return undefined;
  return { code, stdout, stderr };
}

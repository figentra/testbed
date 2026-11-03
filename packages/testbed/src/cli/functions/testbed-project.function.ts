/**
 * Stackra file contract:
 * Purpose: `testbedProject(directory)`, the project name a testbed job runs under: the repository's folder name,
 *          also for a git worktree (`core/.claude/worktrees/x` is `core`), so worktrees share one seed on the box and
 *          match the box's secret grants. Falls back to the directory's own name outside git.
 * Boundary: reads `.git` entries only; never runs git.
 * Runtime: node
 * Governing contract: ADR 0484 (decisions 5 and 7); STA-1626.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * The project name for `directory`.
 *
 * @param directory - an absolute path inside the project.
 * @example
 * testbedProject("/Users/me/core/.claude/worktrees/eager"); // "core"
 */
export function testbedProject(directory: string): string {
  for (let at = directory; ; at = dirname(at)) {
    const git = join(at, ".git");
    if (existsSync(git)) {
      if (statSync(git).isDirectory()) return basename(at);
      // A worktree's `.git` file reads `gitdir: <repo>/.git/worktrees/<name>`.
      const target = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(git, "utf8"))?.[1];
      const repo = target?.split("/.git/")[0];
      return repo ? basename(repo) : basename(at);
    }
    if (dirname(at) === at) return basename(directory);
  }
}

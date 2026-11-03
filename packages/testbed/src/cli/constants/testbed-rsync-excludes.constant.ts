/**
 * Stackra file contract:
 * Purpose: `TESTBED_RSYNC_EXCLUDES`, what a testbed job never uploads (ci-box's list, kept in one place).
 * Boundary: data only.
 * Runtime: node
 * Governing contract: ADR 0484 (the testbed); ADR 0282 (decision 3).
 */

/** The rsync `--exclude` patterns of a job upload. */
export const TESTBED_RSYNC_EXCLUDES: readonly string[] = [
  "node_modules",
  ".git",
  ".claude/worktrees",
  ".env*",
  "*.secrets.local.cue",
  ".mcp.json",
  ".turbo",
  "dist",
  ".next",
];

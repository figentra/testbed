/**
 * Stackra file contract:
 * Purpose: unit tests of `testbedProject`: a plain checkout, a subfolder of it, a git worktree, and no git at all.
 * Boundary: test only; writes a throwaway folder in the OS temp directory.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@stackra/testing";

import { testbedProject } from "#node/functions/testbed-project.function";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "stackra-project-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("testbedProject", () => {
  it("names a checkout and its subfolders after the repository folder", () => {
    mkdirSync(join(root, "core", ".git"), { recursive: true });
    mkdirSync(join(root, "core", "packages", "cli"), { recursive: true });
    expect(testbedProject(join(root, "core"))).toBe("core");
    expect(testbedProject(join(root, "core", "packages", "cli"))).toBe("core");
  });

  it("names a worktree after the repository it belongs to", () => {
    const worktree = join(root, "core", ".claude", "worktrees", "eager");
    mkdirSync(worktree, { recursive: true });
    writeFileSync(
      join(worktree, ".git"),
      `gitdir: ${join(root, "core", ".git", "worktrees", "eager")}\n`,
    );
    expect(testbedProject(worktree)).toBe("core");
  });

  it("falls back to the folder's own name outside git", () => {
    mkdirSync(join(root, "loose"));
    expect(testbedProject(join(root, "loose"))).toBe("loose");
  });
});

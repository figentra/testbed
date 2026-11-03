/**
 * Testbed file contract:
 * Purpose: unit tests of `classifyTestbedCommand` and `refusesTestbedCommand`: heavy and light, and the nested-call
 *          refusal by command word, which lets `pnpm --filter @figentra/testbed test` through.
 * Boundary: test only.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484.
 */
import { describe, expect, it } from "vitest";

import { classifyTestbedCommand } from "#cli/functions/classify-testbed-command.function";
import { refusesTestbedCommand } from "#cli/functions/refuses-testbed-command.function";

describe("classifyTestbedCommand", () => {
  it("sends encore test, playwright, e2e, act and build to the heavy slot", () => {
    for (const command of [
      "encore test ./...",
      "pnpm playwright test",
      "pnpm test:e2e",
      "act push",
      "pnpm build",
    ]) {
      expect(classifyTestbedCommand(command)).toBe("heavy");
    }
  });

  it("sends everything else to the light slot", () => {
    expect(classifyTestbedCommand("pnpm lint && pnpm typecheck")).toBe("light");
    expect(classifyTestbedCommand("react-act")).toBe("light");
  });
});

describe("refusesTestbedCommand", () => {
  it("refuses a command that calls testbed, ci-box or stackra testbed with a verb", () => {
    for (const command of [
      "ci-box status",
      "sh -c 'stackra testbed ip'",
      "testbed run 'me x' . 'pnpm test'",
      "  testbed status --json",
      "pnpm lint && testbed unlock --slot light",
      "pnpm exec testbed scale",
      'bash -lc "ci-box sync ."',
      "echo $(testbed ip)",
      "ci-box -b 2 ssh",
      "testbed --json run 'me x' . 'pnpm test'",
    ]) {
      expect(refusesTestbedCommand(command), command).toBe(true);
    }
  });

  it("allows the package's own test run and other commands that only mention testbed", () => {
    for (const command of [
      "pnpm test",
      "pnpm --filter @figentra/testbed test",
      "pnpm --filter testbed run test",
      "testbed-agent status",
      "vitest run src/cli/testbed",
    ]) {
      expect(refusesTestbedCommand(command), command).toBe(false);
    }
  });
});

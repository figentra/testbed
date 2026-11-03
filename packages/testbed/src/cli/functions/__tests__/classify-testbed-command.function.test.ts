/**
 * Stackra file contract:
 * Purpose: unit tests of `classifyTestbedCommand` and `refusesTestbedCommand`: heavy and light, and the nested-call
 *          refusal.
 * Boundary: test only.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484.
 */
import { describe, expect, it } from "@stackra/testing";

import { classifyTestbedCommand } from "#node/functions/classify-testbed-command.function";
import { refusesTestbedCommand } from "#node/functions/refuses-testbed-command.function";

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
  it("refuses a command that calls ci-box or stackra testbed", () => {
    expect(refusesTestbedCommand("ci-box status")).toBe(true);
    expect(refusesTestbedCommand("sh -c 'stackra testbed ip'")).toBe(true);
    expect(refusesTestbedCommand("pnpm test")).toBe(false);
  });
});

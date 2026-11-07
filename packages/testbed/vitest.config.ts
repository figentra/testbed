/**
 * Testbed file contract:
 * Purpose: test config of @figentra/testbed: the base preset of @stackra/vitest-config plus its shared coverage gate.
 *          `test` runs the unit tier (`<subject>.test.ts` in `__tests__/`): the plan, the Pulumi program under
 *          Pulumi's mocks, the CLI and the POSIX `testbed-agent` against stubbed docker, aws, gcloud, sops, pnpm and df;
 *          the infixed tiers (`.int`, `.contract`, `.e2e`, `.load`) are excluded.
 * Boundary: test configuration only. The agent test shells out to `sh`, `jq`, `rsync`, `flock` and GNU coreutils, so
 *           it runs on a Linux box, never on the Mac.
 * Runtime: node
 * Governing contract: ADR 0182 (test tiers and coverage); ADR 0022 (test placement).
 */
import { withCoverage } from "@stackra/vitest-config/coverage";
import { stackraVitest } from "@stackra/vitest-config/preset";
import { mergeConfig } from "vitest/config";

export default mergeConfig(
  stackraVitest,
  // No defineConfig: its `UserConfig` as withCoverage's `T` against the preset's copy of vitest's types can blow the
  // stack (TS2321); inferred from the literal, `T` stays shallow.
  withCoverage({
    root: import.meta.dirname,
    test: {
      include: ["src/**/__tests__/**/*.test.ts"],
      exclude: ["**/*.{int,contract,e2e,load}.test.ts"],
    },
  }),
);

/**
 * Testbed file contract:
 * Purpose: build config of @figentra/testbed: one tsdown entry per package.json code export (core `.` is `index`,
 *          `./node` is `node`) plus the `testbed` bin (`cli/main`, built to `dist/cli/main.mjs`). The Pulumi packages
 *          stay external (dependencies and peers), so a program loads one `@pulumi/pulumi`.
 * Boundary: build configuration only; the `library` preset of @stackra/tsdown-config with this package's entries.
 * Runtime: node
 * Governing contract: ADR 0025 (build output).
 */
import { library } from "@stackra/tsdown-config";

export default library({
  index: "src/core/index.ts",
  node: "src/node/index.ts",
  "cli/main": "src/cli/main.ts",
});

/**
 * Stackra file contract:
 * Purpose: `testbedPackageRoot()`, the folder of this package: the first parent holding its package.json (the same from `src/` and from `dist/`).
 * Boundary: reads package.json files upward from this module; no cloud is called.
 * Runtime: node
 * Governing contract: ADR 0484 (decision 2); ADR 0171 (the program only declares).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The folder of this package: the first parent holding its package.json (the same from `src/` and from `dist/`). */
export function testbedPackageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const manifest = join(current, "package.json");
    if (
      existsSync(manifest) &&
      (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name ===
        "@stackra/infra-testbed"
    )
      return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("@stackra/infra-testbed package root not found");
    current = parent;
  }
}

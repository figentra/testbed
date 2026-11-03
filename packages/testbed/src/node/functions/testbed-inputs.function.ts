/**
 * Testbed file contract:
 * Purpose: `testbedInputs(lockfilePath, pins)`, the Image Builder inputs of the testbed: the files uploaded to the build bucket (the job Dockerfile, the box agent, the data-volume script, the systemd units, the core lockfile and its pnpm-workspace.yaml), the three component documents with their placeholders, and one hash over all of it. The hash names the component and recipe versions, so a change to any input is a new recipe version.
 * Boundary: reads files from this package and the given lockfile; no cloud is called. Holds no secret.
 * Runtime: node
 * Governing contract: ADR 0484 (decision 2); ADR 0171 (the program only declares).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { testbedPackageRoot } from "#node/functions/testbed-package-root.function";
import type { TestbedInputFile } from "#node/types/testbed-input-file.type";
import type { TestbedInputs } from "#node/types/testbed-inputs.type";

const COMPONENTS = [
  { name: "testbed-base", file: "01-base.yml" },
  { name: "testbed-images", file: "02-images.yml" },
  { name: "testbed-agent", file: "03-agent.yml" },
] as const;

/**
 * Lists the image build inputs (the files uploaded to the build bucket and the component documents) and derives the
 * image version from their hash.
 *
 * @param lockfilePath - the core `pnpm-lock.yaml`.
 * @param pins - the toolchain pins, part of the hash.
 * @returns the files, the components and the version.
 */
export function testbedInputs(
  lockfilePath: string,
  pins: Readonly<Record<string, string>>,
): TestbedInputs {
  const root = testbedPackageRoot();
  const hostFiles = join(root, "images/host/files");
  const hostNames = readdirSync(hostFiles);
  hostNames.sort();
  const files: TestbedInputFile[] = [
    { key: "build/Dockerfile", path: join(root, "images/job/Dockerfile") },
    { key: "build/testbed-agent.sh", path: join(root, "src/agent/testbed-agent.sh") },
    ...hostNames.map((name) => ({ key: `build/${name}`, path: join(hostFiles, name) })),
    { key: "build/pnpm-lock.yaml", path: lockfilePath },
    // `pnpm fetch` checks the lockfile against the workspace's catalogs and the pnpmfile's checksum, and resolves the
    // `@figentra-oss` scope from .npmrc (a registry name, no token), so the store is warmed from all four.
    { key: "build/pnpm-workspace.yaml", path: join(dirname(lockfilePath), "pnpm-workspace.yaml") },
    { key: "build/.pnpmfile.mjs", path: join(dirname(lockfilePath), ".pnpmfile.mjs") },
    { key: "build/.npmrc", path: join(dirname(lockfilePath), ".npmrc") },
  ];
  const components = COMPONENTS.map(({ name, file }) => ({
    name,
    document: readFileSync(join(root, "images/host/components", file), "utf8"),
  }));

  const hash = createHash("sha256");
  for (const file of files) hash.update(file.key).update(readFileSync(file.path));
  for (const component of components) hash.update(component.name).update(component.document);
  const pinEntries = Object.entries(pins);
  pinEntries.sort();
  hash.update(JSON.stringify(pinEntries));
  return {
    files,
    components,
    version: `1.${Number.parseInt(hash.digest("hex").slice(0, 7), 16)}.0`,
  };
}

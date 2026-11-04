/**
 * Testbed file contract:
 * Purpose: the Pulumi program of the testbed (STA-1626): the plan from this stack's config and every resource it holds,
 *          with the ids the owner copies (instance role ARN, pipeline ARN, group names) exported as stack outputs.
 * Boundary: config keys `region` (one of the four, default eu-west-1; one stack per region, STA-2042),
 *           `identityId`, `ciGateProjectId`, `lockfilePath` (required: core's `pnpm-lock.yaml` in the workflow's
 *           sparse checkout of figentra/stackra, with `pnpm-workspace.yaml`, `.pnpmfile.mjs` and `.npmrc` beside it;
 *           absolute, or relative to this folder), `sshCidrs` (optional: the `--ssh-direct` fallback's port-22
 *           allowlist; absent, no inbound rule and SSM only), `groups` (false for the first apply, before the first AMI
 *           exists), `heavyMin`, `lightMin` and `permissionsBoundary` (optional: the boundary ARN set on the roles it
 *           creates).
 *           Imports the built package by its own name, so the package must be built first.
 * Runtime: node (Pulumi CLI)
 * Governing contract: ADR 0484; ADR 0171 (decisions 4 and 6).
 */
import { resolve } from "node:path";

import * as pulumi from "@pulumi/pulumi";
import { testbedPlan } from "@figentra/testbed";
import { awsTestbed } from "@figentra/testbed/node";

const config = new pulumi.Config();
const min = (key) => (config.getNumber(key) === undefined ? {} : { min: config.getNumber(key) });

const plan = testbedPlan({
  region: config.get("region"),
  identityId: config.require("identityId"),
  ciGateProjectId: config.require("ciGateProjectId"),
  turboProjectId: config.get("turboProjectId"),
  heavy: min("heavyMin"),
  light: min("lightMin"),
});

export const testbed = awsTestbed(plan, {
  allowedCidrs: config.getObject("sshCidrs") ?? [],
  // No fallback: the image hash covers these bytes, so a guessed path would build a different image.
  lockfilePath: resolve(config.require("lockfilePath")),
  groups: config.getBoolean("groups") ?? true,
  permissionsBoundary: config.get("permissionsBoundary"),
});

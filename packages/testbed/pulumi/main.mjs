/**
 * Stackra file contract:
 * Purpose: the Pulumi program of the testbed (STA-1626): the plan from this stack's config and every resource it holds,
 *          with the ids the owner copies (instance role ARN, pipeline ARN, group names) exported as stack outputs.
 * Boundary: config keys `region` (one of the four, default eu-west-1; one stack per region, STA-2042),
 *           `identityId`, `ciGateProjectId`, `sshCidrs` (optional: the `--ssh-direct` fallback's port-22 allowlist;
 *           absent, no inbound rule and SSM only), `groups` (false for the first apply, before the first AMI exists),
 *           `heavyMin` and `lightMin`.
 *           Imports the built package by its own name, so the package must be built first.
 * Runtime: node (Pulumi CLI)
 * Governing contract: ADR 0484; ADR 0171 (decisions 4 and 6).
 */
import { fileURLToPath } from "node:url";

import * as pulumi from "@pulumi/pulumi";
import { testbedPlan } from "@stackra/infra-testbed";
import { awsTestbed } from "@stackra/infra-testbed/node";

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
  lockfilePath: fileURLToPath(new URL("../../../../pnpm-lock.yaml", import.meta.url)),
  groups: config.getBoolean("groups") ?? true,
});

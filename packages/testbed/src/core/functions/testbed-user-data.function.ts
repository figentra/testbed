/**
 * Stackra file contract:
 * Purpose: `testbedUserData(plan)`, the boot script of every testbed box: it writes `/etc/testbed/region`,
 *          `/etc/testbed/identity` (the Infisical machine identity id) and `/etc/testbed/grants.json` (project name to
 *          the Infisical project ids, environments and paths its jobs may read), and nothing else. Everything else a
 *          box needs is baked into the AMI.
 * Boundary: pure. The result holds ids and paths only, never a secret value (ADR 0173); a test scans it. The group
 *           of a box is its `stackra:testbed` tag, so the shared launch template names none.
 * Runtime: isomorphic
 * Governing contract: ADR 0484 (decisions 2, 7); ADR 0173; the box agent contract of STA-1626.
 */
import type { TestbedPlan } from "#core/types/testbed-plan.type";

/**
 * Writes the box user data: the region, the identity id and the grants, ids only and no secret.
 *
 * @param plan - the testbed plan.
 * @returns the user data shell script.
 */
export function testbedUserData(plan: TestbedPlan): string {
  const { identityId, projects } = plan.secretGrants;
  return [
    "#!/bin/sh",
    "set -eu",
    "mkdir -p /etc/testbed",
    `printf '%s\\n' '${plan.region}' > /etc/testbed/region`,
    `printf '%s\\n' '${identityId ?? ""}' > /etc/testbed/identity`,
    "cat > /etc/testbed/grants.json <<'GRANTS'",
    JSON.stringify(projects),
    "GRANTS",
    "chmod 0644 /etc/testbed/region /etc/testbed/identity /etc/testbed/grants.json",
    "",
  ].join("\n");
}

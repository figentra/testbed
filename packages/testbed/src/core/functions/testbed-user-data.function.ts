/**
 * Testbed file contract:
 * Purpose: `testbedUserData(plan)`, the boot script of every testbed box: it writes `/etc/testbed/region`,
 *          `/etc/testbed/grants.json` (project name to the figentra/secrets scopes its jobs may read) and
 *          `/etc/testbed/google-credentials.json` (the external-account file that signs the box in to Google as its
 *          instance role, through the plan's Workload Identity provider), and nothing else. Everything else a box
 *          needs is baked into the AMI.
 * Boundary: pure. The result holds names, URLs and scopes only, never a secret value (ADR 0173): the credentials
 *           file says where to exchange the box's own AWS credentials, read from IMDSv2 at use; a test scans it. The
 *           group of a box is its `stackra:testbed` tag, so the shared launch template names none.
 * Runtime: isomorphic
 * Governing contract: ADR 0484 (decisions 2, 7); ADR 0525; ADR 0173; the box agent contract of STA-1626.
 */
import type { TestbedPlan } from "#core/types/testbed-plan.type";

/** The IMDS endpoint the external-account file reads the instance role's credentials from (IMDSv2 required). */
const IMDS = "http://169.254.169.254/latest";

/**
 * Writes the box user data: the region, the grants and the Google credentials file, no secret.
 *
 * @param plan - the testbed plan.
 * @returns the user data shell script.
 */
export function testbedUserData(plan: TestbedPlan): string {
  const { workloadIdentityProvider, projects } = plan.secretGrants;
  // What `gcloud iam workload-identity-pools create-cred-config <provider> --aws --enable-imdsv2` writes.
  const credentials = {
    universe_domain: "googleapis.com",
    type: "external_account",
    audience: `//iam.googleapis.com/${workloadIdentityProvider}`,
    subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    token_url: "https://sts.googleapis.com/v1/token",
    credential_source: {
      environment_id: "aws1",
      region_url: `${IMDS}/meta-data/placement/availability-zone`,
      url: `${IMDS}/meta-data/iam/security-credentials`,
      regional_cred_verification_url:
        "https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15",
      imdsv2_session_token_url: `${IMDS}/api/token`,
    },
  };
  return [
    "#!/bin/sh",
    "set -eu",
    "mkdir -p /etc/testbed",
    `printf '%s\\n' '${plan.region}' > /etc/testbed/region`,
    "cat > /etc/testbed/grants.json <<'GRANTS'",
    JSON.stringify(projects),
    "GRANTS",
    "cat > /etc/testbed/google-credentials.json <<'GOOGLE'",
    JSON.stringify(credentials),
    "GOOGLE",
    "chmod 0644 /etc/testbed/region /etc/testbed/grants.json /etc/testbed/google-credentials.json",
    "",
  ].join("\n");
}

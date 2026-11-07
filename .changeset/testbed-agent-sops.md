---
"@figentra/testbed": minor
---

The boxes read job secrets from figentra/secrets (sops and Cloud KMS, ADR 0525) instead of Infisical. The box agent signs
in to Google as the instance role through Workload Identity, copies each granted scope's ciphertext from the mirror,
decrypts it in memory with sops and passes each value to the container by name. `secretGrants` maps a project to sops
scopes (core: `ci/build`, `ci/build/turbo`; every project: `ci/build/registry`), user data writes the Google
credentials file, and `testbedPlan` no longer takes `identityId`, `ciGateProjectId`, `turboProjectId` or
`infisicalEnvironment`. The host image gains sops and the Google Cloud CLI; both images drop the Infisical CLI. The
`health` reason `infisical` is now `google`, and a job whose secrets cannot be loaded exits 75 with
`unhealthy: secrets`.

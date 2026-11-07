# State of figentra/testbed

Dated 2026-11-07. A snapshot written from the repository, its CI runs, releases and pull requests. It is not a policy
document: where it and another file disagree on a fact, check the evidence named here.

## 1. What this repo is

The testbed: disposable, image-built EC2 boxes that run heavy checks (install, build, typecheck, tests, e2e) so a
workstation never does. The repository holds the Pulumi program, the EC2 Image Builder pipeline, the job and host
image steps, the box agent and the `testbed` CLI (`@figentra/testbed`). It was copied from figentra/stackra at
`beaafa27` (STA-2073). AI agent lanes change the code; only the owner dispatches AWS writes (`Apply testbed` `up` or
`build-image`), each approved in the `testbed` environment.

## 2. Current

| Item           | Value                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Package        | `@figentra/testbed` 0.1.1 (`packages/testbed/package.json`), binary `testbed`                             |
| Default branch | `main` at `829700466f925db8fb5f2f81787611c84038d6fc` (2026-11-06, #16)                                    |
| Toolchain      | Node 24.22.0, pnpm 12.16.1, Pulumi 3.268.0, shfmt 3.14.1, oxfmt 0.71.0, oxlint 1.86.0 (`mise.toml`)       |
| Catalogs       | TypeScript 7.0.2, tsdown 0.23.1, vitest 5.0.5, `@pulumi/aws` 7.50.0, zod 4.6.7, `@stackra/*-config` 0.8.0 |
| Flow pin       | `@figentra-oss/flow` 0.2.3 (catalog); the current Flow release is 0.6.5                                   |
| Registry       | `https://npm.stackra.figentra.com/`; the `@figentra` scope needs a licence token to read                  |

## 3. Proven by a real run

- **Main CI green at head.** CI run 42157053882 on `8297004` (job `Quality Gate`) succeeded.
- **Published release.** GitHub release and tag `@figentra/testbed@0.1.1` (2026-11-06T03:11Z). Release run
  42154356413 published it: its `Version PR / publish` step succeeded; the run failed only at the SBOM job's
  `Checksums (sha256sums.txt)` step, so the release carries no SBOM or checksum assets.
- **Image proof job.** The advisory `Testbed image` workflow succeeded on schedule (run 42215760932, 2026-11-06) and
  on dispatch (run 41789136398): it builds the job image and runs the image component's validate commands. It does
  not build an AMI.

## 4. Not proven

- **Any AWS apply from this repository.** `Apply testbed` (`apply-testbed.yml`) has 0 runs here. The live fleet was
  deployed from figentra/stackra before the copy; that it matches this repository's Pulumi program is not shown by a
  run here.
- **The AMI build from this repository.** `build-image` has never run here (same workflow, 0 runs).
- **The box agent and CLI on a real box from this package.** No run in this repository exercises `testbed run`
  end to end; callers (Flow's gate, `ci-box`) record that in their own repositories.
- **STA-2042 (multi-region).** `.agents/specs/sta-2042-testbed-multi-region/tasks.md` holds open region tasks; us-east-1
  was added to the enabled regions in code (#12), not proven by an apply here.
- **SBOM and checksums on a release.** No release has them (see above).

## 5. Map

| Path                         | What                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/testbed/src/core`  | the pure plan (`testbedPlan`), `TESTBED_DEFAULTS` and `TOOLCHAIN_PINS`                   |
| `packages/testbed/src/node`  | the Pulumi resources (`awsTestbed`)                                                      |
| `packages/testbed/src/cli`   | the `testbed` CLI                                                                        |
| `packages/testbed/src/agent` | the box agent (POSIX sh), `testbed-agent` on each box                                    |
| `packages/testbed/images`    | the job image (`job/Dockerfile`) and the host image components (hashed: frozen inputs)   |
| `packages/testbed/pulumi`    | the Pulumi project the apply workflow runs, one stack per region                         |
| `scripts/ci-box-shim.sh`     | installs as `ci-box` and maps old `ci-box` calls onto `testbed`                          |
| `.agents/specs`              | STA-1626 (the testbed, with the agent contract) and STA-2042 (regions), copied from core |
| `.agents/skills/test-infra`  | the agent skill for running work on a box                                                |
| `.github/workflows`          | `ci.yml`, `release.yml`, `apply-testbed.yml`, `testbed-image.yml`                        |

Authoritative docs: root `AGENTS.md` (repo rules), `packages/testbed/AGENTS.md` (package rules), `docs/runbook.md`
(operations), `.agents/specs/sta-1626-testbed/agent-contract.md` (the CLI and agent interface callers depend on).
`.agents/specs/README.md` explains that the specs still name core's old paths.

## 6. Open risks

- **Main CI:** green at `8297004` (run 42157053882).
- **Release at head:** Release run 42157054471 failed: "The deployment was rejected or didn't satisfy other
  protection rules" (the `release` environment). No pending changeset exists, so nothing is waiting to publish.
- **Open pull requests:** 0 besides this one (#17).
- **Branches:** 8 besides `main` and this PR's branch, none with an open pull request (all from 2026-11-04 or later).
- **Infisical references:** `git grep -i -c infisical` totals 124 lines in 32 files: the box agent, the plan schema,
  the Pulumi grants, the job image, `mise.toml` (the Infisical CLI), the runbook and the specs. Several sit in hashed
  image inputs, so changing them forces an image rebuild.
- **Flow pinned behind:** the catalog pins `@figentra-oss/flow` 0.2.3.
- **Live names:** the AWS resources are named `stackra-testbed-*` on purpose; renaming one replaces it or orphans its
  state (`AGENTS.md`).

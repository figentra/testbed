# AGENTS — @figentra/testbed

<!--
Testbed file contract:
Purpose: the agent rules of @figentra/testbed: where code and images go, the contract between the `testbed` CLI and
         the box agent, secrets, what an agent may run.
Boundary: documentation only; the code, ADR 0484 (as amended by ADR 0522) and the box agent contract win on any
          difference.
Runtime: none
Governing contract: ADR 0484; ADR 0171; ADR 0173; ADR 0167.
-->

The testbed (ADR 0484): the Pulumi program part, the box agent, the images and the `testbed` CLI. Member at
`packages/testbed`. Entries `.` (the pure plan), `./node` (`awsTestbed`) and the `testbed` bin (`src/cli/main.ts`).

## Where code goes

| You are writing…                          | It goes in…                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| A plan rule (pure, no Pulumi, no Node)    | `src/core/functions/<name>.function.ts`                                 |
| A default shared with the CLI and the box | `TESTBED_DEFAULTS` in `src/core/constants/` (and the contract file)     |
| A tool version                            | `TOOLCHAIN_PINS`, and nowhere else                                      |
| Pulumi resources or a file reader         | `src/node/functions/<name>.function.ts`                                 |
| A CLI verb, flag or helper                | `src/cli/` (it imports `TESTBED_DEFAULTS`; no copy of a default)        |
| The box agent                             | `src/agent/testbed-agent.sh`, tests in `src/agent/__tests__/`           |
| The job image                             | `images/job/Dockerfile`                                                 |
| Host image steps and systemd files        | `images/host/components/*.yml`, `images/host/files/`                    |
| A test                                    | `__tests__/<name>.test.ts` beside it; fixtures in `__tests__/fixtures/` |

## Rules

- **Hashed image inputs are frozen.** `images/**`, `src/agent/testbed-agent.sh`,
  `src/core/constants/toolchain-pins.constant.ts` and core's four install files (`pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `.pnpmfile.mjs`, `.npmrc`) set the image version (`testbedInputs`). Any byte change, a
  comment included, is a new recipe version and an image rebuild; make one only in a change meant to rebuild.
- The contract is `.agents/specs/sta-1626-testbed/agent-contract.md`: the verbs, exit codes (73 busy, 75 unhealthy,
  124 timeout), the `run --json` line, `status --json`, paths, tags, group names `stackra-testbed-heavy` and
  `stackra-testbed-light`. A change to the agent, the CLI or `TESTBED_DEFAULTS` changes the contract file in the same
  change.
- The AWS names (`stackra-testbed-*`, the tag `stackra:testbed`, the AMI parameter, the Pulumi project
  `stackra-testbed`, the state bucket) are live resources: renaming one replaces it or orphans its state.
- The Pulumi program takes core's lockfile from the `lockfilePath` config (the workflow's sparse checkout of
  figentra/stackra); there is no fallback path.
- `.` never imports `@pulumi/*` or `node:*`.
- No secret value anywhere: not in user data, not in a component, not on a command line, not in a log (ADR 0173). The
  Infisical token is a shell variable in the agent and reaches the container by `-e INFISICAL_TOKEN`.
- Heavy is on-demand; spot is for `light` only. Both disks are deleted with the instance. IMDS stays one hop and
  IMDSv2 required, so a job container cannot read the instance role.
- Widening the instance policy needs a security review. Workflow or promotion changes need the owner.
- Add a placeholder to a component only together with its value in `aws-testbed.function.ts`; `fillComponent` throws on
  an unfilled one.
- Never run `pulumi up`, `pulumi destroy`, an image build or `docker build` on a workstation; agents run
  `pulumi preview` only. The Mac runs only oxfmt and oxlint.
- Test Pulumi code under `pulumi.runtime.setMocks` only. The agent tests run on a Linux box. The toolchain pin test
  reads core's `mise.toml` and catalogue from `CORE_CHECKOUT` and is skipped without it.

## PII

None. A box holds checkouts for the duration of a job and deletes them; no tenant data reaches a box.

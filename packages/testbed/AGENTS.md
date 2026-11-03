# AGENTS — @stackra/infra-testbed

<!--
Stackra file contract:
Purpose: the agent rules of @stackra/infra-testbed: where code and images go, the contract with `stackra testbed`,
         secrets, what an agent may run.
Boundary: documentation only; the code, ADR 0484 and the box agent contract win on any difference.
Runtime: none
Governing contract: ADR 0484; ADR 0171; ADR 0173; ADR 0167.
-->

The testbed (ADR 0484) as a Pulumi program part. Member at `packages/infrastructure/infra-testbed` (`tier:lib`).
Entries `.` (the pure plan) and `./node` (`awsTestbed`).

## Where code goes

| You are writing…                          | It goes in…                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| A plan rule (pure, no Pulumi, no Node)    | `src/core/functions/<name>.function.ts`                             |
| A default shared with the CLI and the box | `TESTBED_DEFAULTS` in `src/core/constants/` (and the contract file) |
| A tool version                            | `TOOLCHAIN_PINS`, and nowhere else                                  |
| Pulumi resources or a file reader         | `src/node/functions/<name>.function.ts`                             |
| The box agent                             | `src/agent/testbed-agent.sh`, tests in `src/agent/__tests__/`       |
| The job image                             | `images/job/Dockerfile`                                             |
| Host image steps and systemd files        | `images/host/components/*.yml`, `images/host/files/`                |
| A test                                    | `__tests__/<name>.test.ts` beside it                                |

## Rules

- The contract is `.agents/specs/sta-1626-testbed/agent-contract.md`: the verbs, exit codes (73 busy, 75 unhealthy,
  124 timeout), paths, tags, group names `stackra-testbed-heavy` and `stackra-testbed-light`. `stackra testbed` in
  `@stackra/cli` is written against it: a change to the agent or to `TESTBED_DEFAULTS` changes the contract file and
  the CLI in the same change.
- `.` never imports `@pulumi/*` or `node:*`.
- No secret value anywhere: not in user data, not in a component, not on a command line, not in a log (ADR 0173). The
  Infisical token is a shell variable in the agent and reaches the container by `-e INFISICAL_TOKEN`.
- Heavy is on-demand; spot is for `light` only. Both disks are deleted with the instance. IMDS stays one hop and
  IMDSv2 required, so a job container cannot read the instance role.
- Widening the instance policy needs `security-tenancy-reviewer` (R3). Workflow or promotion changes need
  `release-operations`.
- Add a placeholder to a component only together with its value in `aws-testbed.function.ts`; `fillComponent` throws on
  an unfilled one.
- Never run `pulumi up`, `pulumi destroy`, an image build or `docker build` on a workstation; agents run
  `pulumi preview` against a non-production stack. The Mac runs only oxfmt and oxlint.
- Test Pulumi code under `pulumi.runtime.setMocks` only. The agent tests run on a Linux box.

## PII

None. A box holds checkouts for the duration of a job and deletes them; no tenant data reaches a box.

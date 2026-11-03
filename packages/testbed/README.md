# @stackra/infra-testbed

The testbed (ADR 0484): the disposable, image-built EC2 boxes that run every agent's heavy checks (install, build,
typecheck, e2e, integration tests), as a Pulumi program part. One golden image, built from code by hand; boxes are
replaced, never repaired.

- `.` (pure): `testbedPlan(input?)` returns zod-validated plain data (region, the two groups, disks, guard thresholds,
  idle time, image schedule, toolchain pins, secret grants, tag keys); `TESTBED_DEFAULTS` and `TOOLCHAIN_PINS` hold the
  numbers `stackra testbed` and the box agent share; `testbedUserData(plan)` is the boot script.
- `./node`: `awsTestbed(plan, options)` declares the security group `stackra-testbed`, the instance role and profile,
  one launch template, the `heavy` and `light` Auto Scaling groups and the EC2 Image Builder pipeline.
- `src/agent/testbed-agent.sh`: the box agent (POSIX sh), installed at `/usr/local/bin/testbed-agent`. Its verbs, exit
  codes, paths and tags are the contract in `.agents/specs/sta-1626-testbed/agent-contract.md`.
- `images/job/Dockerfile`: the job image. `images/host/`: the Image Builder components and the systemd files the
  AMI carries.

## The shape (owner answers of 2026-10-30 and 2026-11-02)

| Part    | Value                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region  | `eu-west-1`, one                                                                                                                                         |
| `heavy` | on-demand `c7i.2xlarge`, min 0, max 1, slots heavy and light (8 vCPU on-demand quota, ADR 0516)                                                          |
| `light` | spot across `c7i`, `c6i`, `m7i` `.2xlarge` with capacity rebalancing, min 0, max 1, slot light (8 vCPU spot quota)                                       |
| Disks   | 40 GB gp3 root; 200 GB gp3 XFS (reflink) at `/data`; both deleted with the instance                                                                      |
| Guard   | every 5 min: clean at 70%, drain at 85% or under 10 GB free on `/`; turbo cache 20 GB; seeds 7 days                                                      |
| Idle    | a box with no job for 60 minutes terminates itself and lowers desired; `stackra testbed run` raises a group at 0                                         |
| Image   | by hand, only while `heavy` is at 0 (no schedule); AMI id published to SSM `/imagebuilder/stackra-testbed/ami`                                           |
| Secrets | the shared gate identity (`INFISICAL_GATE_IDENTITY_ID`), AWS Auth added beside its GitHub OIDC; grants map a project to project id, environment and path |

## Using it

```ts
// figentra/infra, testbed/index.ts
const config = new pulumi.Config();
const plan = testbedPlan({
  identityId: config.require("identityId"),
  ciGateProjectId: config.require("ciGateProjectId"),
});
export const testbed = awsTestbed(plan, {
  allowedCidrs: config.getObject<string[]>("sshCidrs") ?? [],
  lockfilePath: "../stackra/pnpm-lock.yaml",
});
```

The first apply is two steps, because the launch template resolves the AMI from the SSM parameter at launch and the
parameter exists only after the first image build: apply with `groups: false`, start the pipeline
(`aws imagebuilder start-image-pipeline-execution`), then apply again without it. A new AMI reaches running boxes by an
instance refresh (`aws autoscaling start-instance-refresh`), which waits for boxes that hold scale-in protection.

## Rules

- Nothing here holds a secret value (ADR 0173): the plan and the user data carry ids and paths; the box obtains a
  short-lived Infisical token for the paths its project is granted, and the container receives it by environment.
- AWS quotas are fixed inputs (ADR 0516): the plan fits the region's on-demand and spot vCPU quotas (8 each today),
  counting the image build. No agent requests or suggests a quota increase without the owner's explicit
  confirmation; reading a quota is fine.
- Agents run `pulumi preview` against a non-production stack only. `pulumi up`, the image build and the Infisical
  change are the owner's.
- Tool versions live in `TOOLCHAIN_PINS`; a test keeps them equal to `mise.toml`, the Playwright catalogue entry and
  the Dockerfile's `ARG` defaults.

## Tests

`pnpm --filter @stackra/infra-testbed test` runs the plan tests, the program under Pulumi's mocks and the agent
against stubbed docker, aws, infisical, pnpm and df. The agent tests need `sh`, `jq`, `rsync`, `flock` and GNU
coreutils, so they run on a Linux box.

## Pinned inputs

| Input                 | Pin                                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| Base image            | `ubuntu:24.04` (tag; pin a digest after the first build)                 |
| Node, pnpm, Infisical | `mise.toml` values, through `TOOLCHAIN_PINS`                             |
| Playwright            | `pnpm-workspace.yaml` catalogue value: Chromium, Firefox and WebKit      |
| mise                  | `TOOLCHAIN_PINS.mise` (confirm against the mise releases on first build) |
| Encore CLI            | the installer's current release (not pinned yet)                         |
| Postgres              | `postgres:17.6-alpine`                                                   |

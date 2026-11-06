# @figentra/testbed

The testbed (ADR 0484): the disposable, image-built EC2 boxes that run every agent's heavy checks (install, build,
typecheck, e2e, integration tests), as a Pulumi program part and the `testbed` CLI. One golden image, built from code by
hand; boxes are replaced, never repaired.

- `.` (pure): `testbedPlan(input?)` returns zod-validated plain data (region, the two groups, disks, guard thresholds,
  idle time, image schedule, toolchain pins, secret grants, tag keys); `TESTBED_DEFAULTS` and `TOOLCHAIN_PINS` hold the
  numbers the CLI and the box agent share; `testbedUserData(plan)` is the boot script.
- `./node`: `awsTestbed(plan, options)` declares the security group, the instance role and profile, one launch
  template, the `heavy` and `light` Auto Scaling groups and the EC2 Image Builder pipeline.
- `testbed` (bin): runs a command on a free box and manages the boxes (`run`, `status`, `unlock`, `ip`, `ssh`, `sync`,
  `scale`, `image`). `docs/runbook.md` at the repository root is the operator guide.
- `src/agent/testbed-agent.sh`: the box agent (POSIX sh), installed at `/usr/local/bin/testbed-agent`. Its verbs, exit
  codes, paths and tags are the contract in `.agents/specs/sta-1626-testbed/agent-contract.md`.
- `images/job/Dockerfile`: the job image. `images/host/`: the Image Builder components and the systemd files the
  AMI carries.

```sh
pnpm add -g @figentra/testbed     # from the Figentra registry: @figentra:registry in .npmrc
testbed run "<session> <what>" <dir> "<command>" [--json]
testbed status [--json]
```

## The shape (owner answers of 2026-10-30 and 2026-11-02)

| Part    | Value                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region  | eu-west-1, eu-west-2, eu-central-1, us-east-1, in that order (`TESTBED_DEFAULTS.enabledRegions`); one stack per region (STA-2042)                        |
| `heavy` | on-demand `c7i.2xlarge`, min 0, max 1, slots heavy and light (8 vCPU on-demand quota, ADR 0516)                                                          |
| `light` | spot across `c7i`, `c6i`, `m7i` `.2xlarge` with capacity rebalancing, min 0, max 1, slot light (8 vCPU spot quota)                                       |
| Disks   | 40 GB gp3 root; 200 GB gp3 XFS (reflink) at `/data`; both deleted with the instance                                                                      |
| Guard   | every 5 min: clean at 70%, drain at 85% or under 10 GB free on `/`; turbo cache 20 GB; seeds 7 days                                                      |
| Idle    | a box with no job for 60 minutes terminates itself and lowers desired; `testbed run` raises a group at 0                                                 |
| Image   | by hand, only while `heavy` is at 0 (no schedule); AMI id published to SSM `/imagebuilder/stackra-testbed/ami`                                           |
| Secrets | the shared gate identity (`INFISICAL_GATE_IDENTITY_ID`), AWS Auth added beside its GitHub OIDC; grants map a project to project id, environment and path |

The AWS names (`stackra-testbed-*`, the tag `stackra:testbed`, the AMI parameter, the Pulumi project `stackra-testbed`)
are live resources and keep their names.

## Using it

`pulumi/main.mjs` is the program; `.github/workflows/apply-testbed.yml` applies it with core's lockfile from a sparse
checkout of figentra/stackra:

```js
const config = new pulumi.Config();
const plan = testbedPlan({
  identityId: config.require("identityId"),
  ciGateProjectId: config.require("ciGateProjectId"),
});
export const testbed = awsTestbed(plan, {
  allowedCidrs: config.getObject("sshCidrs") ?? [],
  lockfilePath: resolve(config.require("lockfilePath")),
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
- Agents run `pulumi preview` only. `pulumi up`, the image build and the Infisical change are the owner's.
- Tool versions live in `TOOLCHAIN_PINS`; tests keep them equal to the Dockerfile's `ARG` defaults and, with
  `CORE_CHECKOUT` set, to core's `mise.toml` and Playwright catalogue entry.

## Tests

`pnpm --filter @figentra/testbed test` runs the plan tests, the program under Pulumi's mocks (with a fixture lockfile),
the CLI and the agent against stubbed docker, aws, infisical, pnpm and df. The agent tests need `sh`, `jq`, `rsync`,
`flock` and GNU coreutils, so they run on a Linux box. Set `CORE_CHECKOUT` to a checkout of figentra/stackra to run the
pin test.

## Pinned inputs

| Input                 | Pin                                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| Base image            | `ubuntu:24.04`, pinned by digest `sha256:fe815609…` (2026-11-04)         |
| Node, pnpm, Infisical | core's `mise.toml` values, through `TOOLCHAIN_PINS`                      |
| Playwright            | core's `pnpm-workspace.yaml` catalogue value: Chromium, Firefox, WebKit  |
| mise                  | `TOOLCHAIN_PINS.mise` (confirm against the mise releases on first build) |
| Encore CLI            | the installer's current release (not pinned yet)                         |
| Postgres              | `postgres:17.6-alpine`                                                   |

## Licence

Proprietary; see `LICENSE`.

# Implementation Plan: The testbed in four regions

**Spec**: `.agents/specs/sta-2042-testbed-multi-region/spec.md` · **Linear**: STA-2042 · **Date**: 2026-11-02

**Input**: Feature specification from `.agents/specs/sta-2042-testbed-multi-region/spec.md`, approved by the owner
2026-11-03. The design choices were accepted by the leader the same day. Research in `research.md`, entities in
`data-model.md`, the CLI and workflow contract in `contracts/testbed-regions.md`, the checks in `quickstart.md`.

## Summary

One Pulumi program and one stack per region (`testbed-<region>`). The eu-west-1 stack is the **home**. It owns
everything global or built once: the IAM roles and instance profiles, the build bucket and the Image Builder pipeline.
The pipeline's distribution copies each new AMI to all four regions and writes each region's
`/imagebuilder/stackra-testbed/ami` parameter. Every stack, home included, owns its region's pool: the security group,
the launch template (which already resolves the AMI from that region's parameter) and the heavy and light groups.

The apply workflow takes a `region` input. `stackra testbed` reads an ordered list of enabled regions, finds boxes in
all of them, and picks a slot or a region to scale. `run --json` and `status --json` give `fflow gate` its interface.

## Technical Context

- **Language**: TypeScript (ESM), Node 24 (`mise.toml`); POSIX sh for the agent; GitHub Actions YAML
- **Members**:
  - `packages/infrastructure/infra-testbed` (`tier:lib`, category `infrastructure`)
  - `packages/developer/cli` (`tier:lib`, category `developer`)
  - `.github/workflows/apply-testbed.yml`
  - `apps/docs` (runbook)
- **Testing**: vitest in `src/**/__tests__/` (ADR 0022) against the Pulumi mocks the package already uses; the CLI's
  testbed functions against stubbed `aws`/`ssh` deps; all on ci-box, never the Mac
- **Storage**: Pulumi state, one stack per region in the existing `stackra-pulumi-state-591473336656` bucket
- **Runtime target**: a Pulumi program applied by CI only (ADR 0171), and a Node CLI

## Constitution Check

| Law                                   | Result | Note                                                                                                                                                                                           |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boundaries (tier direction, ADR 0003) | PASS   | both packages stay `tier:lib`; the CLI does not import infra-testbed (the contract numbers are copied, tested)                                                                                 |
| Secrets (ADR 0009)                    | PASS   | no new secret; boxes reach Infisical by the one global instance role; CI uses OIDC as today                                                                                                    |
| Security                              | PASS   | each region's security group has no inbound rule (SSM only); the instance role's autoscaling scope widens from one region to the four named regions, still only the `stackra-testbed-*` groups |
| HTTP and events                       | N/A    | no action, query, endpoint or event                                                                                                                                                            |
| Tenancy                               | N/A    | no tenant data                                                                                                                                                                                 |
| Delegation                            | PASS   | the delegation plan below names each PR and its order                                                                                                                                          |
| Not built yet (ADR 0011)              | PASS   | no rejected technology; within ADR 0516's quotas, with no increase                                                                                                                             |
| Test placement (ADR 0022)             | PASS   | tests in `__tests__/` beside each subject                                                                                                                                                      |
| Versions and catalogs                 | PASS   | no new dependency                                                                                                                                                                              |
| Deploy modes (ADR 0076)               | N/A    | internal test infrastructure, never shipped                                                                                                                                                    |
| Licence tier (ADR 0077)               | PASS   | free, MIT, this repository                                                                                                                                                                     |
| Docs and ADRs                         | PASS   | ADR 0484 d8 amended in this spec's PR; the runbook and `test-infra` skill updated (Docs below)                                                                                                 |

## Deploy modes

| Mode       | Behaviour                                                    |
| ---------- | ------------------------------------------------------------ |
| SaaS       | not shipped: internal test infrastructure in our AWS account |
| On-prem    | not shipped: internal test infrastructure in our AWS account |
| Air-gapped | not shipped: internal test infrastructure in our AWS account |

## Correctness properties

- **P-001**: For each of the four regions, the program declares exactly one security group, one launch template, and one heavy and one light group, with max 1 each, in that region — Validates: FR-001
- **P-002**: `testbedPlan` refuses a region outside the four, and any pool whose maximum (plus the image build, in the home region) exceeds that region's quotas — Validates: FR-002
- **P-003**: A member stack declares no IAM role, bucket or Image Builder resource, and the home stack declares no other region's pool, so an apply touches one region's pool plus, for the home, the global resources — Validates: FR-003
- **P-004**: The distribution lists all four regions, each writing that region's AMI parameter, and every launch template resolves its AMI from its own region's parameter — Validates: FR-004
- **P-005**: The picker is a pure function of the enabled-region order and each region's boxes and groups: a free slot first, then the first region with room, then wait or 73 — Validates: FR-005
- **P-006**: No discovery, launch, scale or SSM call is made in a region outside the enabled list — Validates: FR-006
- **P-007**: `status` lists each enabled region's boxes with region, kind, slots, health and desired counts, and marks a region whose call failed as unreachable — Validates: FR-007
- **P-008**: The user data and the instance role are the same in every region; no stack declares an inbound rule unless `sshCidrs` is set — Validates: FR-008
- **P-009**: `scale` and `unlock` act in the named region, defaulting to the region of the box they name — Validates: FR-009
- **P-010**: `run` exits with the job's code, or exactly 2, 73, 75 or 124 for the reserved cases — Validates: FR-010
- **P-011**: `run --json` writes exactly one JSON object to stdout, after the job, with the six fields; the job's output goes only to stderr — Validates: FR-011
- **P-012**: `status --json` reports, per enabled region, free and total heavy and light slots, counting boxes that may still start — Validates: FR-012

## Architecture overview

```text
apply-testbed.yml (region input) ──▶ stack testbed-<region> ──▶ awsTestbed(plan{region, home?})
                                                   │
          home (eu-west-1) ────────────────────────┼── IAM roles + profiles (global)
                                                   ├── build bucket, components, recipe, infrastructure
                                                   ├── distribution ──▶ AMI copy + /imagebuilder/stackra-testbed/ami
                                                   │                    in eu-west-1, eu-west-2, eu-central-1, us-east-1
                                                   └── pipeline (no schedule; build-image only here)
          every region (home included) ──────────── security group · launch template (resolve:ssm AMI) · heavy · light

stackra testbed run ──▶ discover boxes + groups in each enabled region (parallel, read-only)
                    ──▶ pick: free slot (region order) → else scale first region with room → else wait / 73
                    ──▶ SSM SSH to the box in its region ──▶ agent job prepare/run ──▶ exit code (+ --json result)
```

## Components and responsibilities

- **`TESTBED_DEFAULTS.regions` and `homeRegion`** (infra-testbed, core): the four regions in picker order, and
  `eu-west-1`.
- **`testbedPlan(input)`** (core): takes `region` (default `eu-west-1`) and derives `home`. It refuses an unknown region
  (P-002), and applies the image-build quota refine only when `home`.
- **`awsTestbed(plan, options)`** (node), split by role:
  - Home only: IAM, bucket, Image Builder, and the distribution over `TESTBED_DEFAULTS.regions`.
  - Every region: the pool.
  - Member stacks reference the instance profile by its fixed name `stackra-testbed-instance`, with no lookup at
    preview time.
  - The instance role's autoscaling ARN pattern covers the four regions.
  - Outputs: the home exports the pipeline ARN and role ARN as today; every stack exports its region and group names.
- **`pulumi/main.mjs`**: reads config `region` and passes it to the plan.
- **`apply-testbed.yml`**:
  - a `region` choice (the four, default `eu-west-1`);
  - `STACK=testbed-${region}` and concurrency `apply-testbed-${region}`;
  - a one-time `pulumi stack rename testbed testbed-eu-west-1` when the old stack exists;
  - `build-image` refused unless the region is the home;
  - `heavy_min` stays `0` only.
- **CLI settings** (`resolve-testbed-settings`): `regions` comes from `--regions`, then `STACKRA_TESTBED_REGIONS`, then
  `TESTBED_CLI_DEFAULTS.regions`, the enabled list, committed and changed by a PR when a region joins. It starts as
  `["eu-west-1"]`. `--region` stays, as a one-region override.
- **CLI discovery and picker**: a new pure `pickTestbedSlot(regions, state)` (P-005). The run, status, scale and unlock
  paths carry each box's region into the SSM proxy and the `aws` calls.
- **CLI output**: `run --json` and `status --json` (P-011, P-012).
- **Runbook and skill**: per-region apply steps, enabling a region, the gate interface.

## Files and folders

- **infra-testbed** (`packages/infrastructure/infra-testbed`):
  - `src/core/constants/testbed-defaults.constant.ts`
  - `src/core/constants/testbed-plan-input-schema.constant.ts`
  - `src/core/constants/testbed-plan-schema.constant.ts`
  - `src/core/functions/testbed-plan.function.ts`
  - `src/node/functions/aws-testbed.function.ts`
  - `src/node/types/aws-testbed.type.ts`
  - `pulumi/main.mjs`
  - tests in `src/**/__tests__/`
  - a changeset
- **The workflow:** `.github/workflows/apply-testbed.yml`
- **CLI** (`packages/developer/cli/src/node`):
  - `constants/testbed-cli-defaults.constant.ts`
  - `types/testbed-settings.type.ts`
  - `functions/resolve-testbed-settings.function.ts`
  - `functions/run-testbed.function.ts`
  - `functions/parse-testbed-boxes.function.ts`
  - `functions/should-scale-testbed.function.ts`
  - new `functions/pick-testbed-slot.function.ts`
  - `constants/testbed-command.constant.ts` (the `--regions` and `--json` options)
  - tests
  - a changeset
- **Docs:**
  - `apps/docs/src/docs/runbooks/test-infrastructure.mdx`
  - `.agents/skills/test-infra/SKILL.md`

## Data models and migrations

None. The plan input gains `region`, and the CLI settings gain `regions` (`data-model.md`).

## Contracts

`contracts/testbed-regions.md`:

- the workflow inputs;
- the stack names;
- the CLI flags and environment;
- the exit codes;
- the `run --json` and `status --json` shapes.

No action, query or event.

## Error handling

- **Plan refusals:** an unknown region, or a pool over quota, refuses before any resource (P-002).
- **Member stack before the home:** the launch template names a missing instance profile and the apply fails clearly.
  The runbook orders the home first.
- **A region's discovery fails:** `status` marks it unreachable, and `run` skips it (EC-05).
- **Spot unavailable:** a light group that cannot launch counts as having no room, and `run` tries the next region
  (EC-02).
- **`build-image` outside the home:** the workflow refuses it before any AWS call.

## Security and tenancy

- **Identity:** no tenant data and no new identity.
- **Instance role:** one global role, trusted only by EC2, used in every region. Its autoscaling permissions are
  limited to the `stackra-testbed-*` groups carrying the group tag, in the four regions.
- **Network:** every region's security group has no inbound rule unless `sshCidrs` is set (SSM only).
- **Secret names:** `TESTBED_DEPLOY_ROLE_ARN` and the `INFISICAL_GATE_*` ids, unchanged.

## Testing strategy

| Proves                                      | Tier                                                          |
| ------------------------------------------- | ------------------------------------------------------------- |
| P-001, P-003, P-004, P-008 (AC-002, AC-003) | unit: `awsTestbed` under Pulumi mocks, home and member stacks |
| P-002 (AC-004)                              | unit: `testbedPlan` refusals                                  |
| P-005, P-006 (AC-001, AC-005)               | unit: `pickTestbedSlot` over fixtures; run with stubbed deps  |
| P-007, P-009, P-012                         | unit: status, scale, unlock with stubbed deps per region      |
| P-010, P-011 (AC-006)                       | unit: run's exit codes and `--json` with stubbed deps         |
| SC-001, SC-002, SC-004                      | manual: the region adds and the switch-day load run           |

## Rollout

1. **PR A, infra-testbed:** regions, the home/member split, distribution to four regions.
2. **PR B, the workflow:** the `region` input and stack per region, merged with or right after A.
3. **The owner's eu-west-1 `up`:** it renames the stack to `testbed-eu-west-1` and updates the distribution.
4. **`build-image`:** it now copies the AMI to all four regions. One build.
5. **The eu-west-1 groups and canary,** as in PLAN.md.
6. **PR C, the CLI:** region list, picker and `--json`. Released; enabled regions at first `eu-west-1`.
7. **Per region** (eu-west-2, eu-central-1, then us-east-1 once box 5 stops): the owner applies `up` for that region
   (groups on, 0/0), then a one-line PR adds it to `TESTBED_CLI_DEFAULTS.regions` and the CLI is released.
8. **PR D, the runbook and skill,** alongside A to C.

## Delegation and risk plan

- **Claude-only, this session:** PR A and PR B. They touch the IAM scope and the shared state, so they're reviewed
  together.
- **Delegable:** PR C (CLI, pure functions with stubbed deps) and PR D (docs) can run in parallel worktrees once this
  plan is approved.
- **Risk:** R2.
  - A wrong distribution or IAM scope fails at `up` or build time, and only in CI with the owner's approval.
  - The rename is one-time and guarded.
  - Nothing destroys the existing eu-west-1 pool: the rename keeps its state.
- **Budget:** 4 PRs, about 10 tasks.

## ADRs

Relies on 0484 (as amended 2026-11-03 by this spec), 0516, 0171, 0173. Opens none.

## Docs

`apps/docs/src/docs/runbooks/test-infrastructure.mdx`, `.agents/skills/test-infra/SKILL.md`, and ADR 0484's
amendment (in this spec's PR).

## Complexity tracking

None.

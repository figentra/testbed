# Feature Specification: the testbed (disposable, image-built test boxes)

**Feature Branch**: `figentra/sta-1626-testbed`

**Created**: 2026-10-30

**Status**: Implementing <!-- owner approved ADR 0484 and the proposed answers, 2026-10-30; no apply -->

**Linear**: STA-1626

**Clarifications status**: complete

**Input**: The owner's brief: turn the eight shared EC2 test boxes behind `~/.local/bin/ci-box` into disposable,
identical infrastructure in Stackra core, image-based, with a sandbox per job, so testing is never interrupted.

## Impact

- **Apps touched**: `apps/docs` (ADR 0484, runbook `runbooks/test-infrastructure.mdx`)
- **Services touched**: none
- **Packages touched**: new `packages/infrastructure/infra-testbed`; `packages/developer/cli` (`stackra testbed`)
- **Workflows touched**: new `.github/workflows/testbed-fallback.yml` (fallback presets on GitHub-hosted runners)
- **Agent files**: new skill `.agents/skills/test-infra/`
- **Cross-service events**: none
- **Tenancy and data**: none (no tenant data on a box)
- **Secrets**: the shared gate identity (`INFISICAL_GATE_IDENTITY_ID`) with AWS IAM auth added, reading the project `figentra-ci` `/ci`; no
  value in git, on a disk, or on a command line. `~/.ci-env` retired.
- **ADR needed**: yes, 0484 (Proposed); amends 0166 CI2
- **New dependencies**: none in the CLI (it runs `aws`, `ssh`, `rsync`); `infra-testbed` uses `@pulumi/aws` and
  `@pulumi/pulumi` from `catalog:infra`, as the other `infra-*` packages do
- **Deploy modes**: internal infrastructure only; not shipped to tenants
- **Licence tier**: free (internal tooling, MIT like every `@stackra/*` package)
- **Docs to update**: ADR 0484, `runbooks/test-infrastructure.mdx`, the CLI and infra-testbed READMEs and AGENTS.md, `.github/workflows/README.md`, `.agents/skills/README.md`
- **Lane**: full
- **Change risk**: R3 (cloud resources, a credential path, the tool every builder depends on)

## What agents rely on today (kept)

Read from `~/.local/bin/ci-box` on 2026-10-30. Each row is a requirement on `stackra testbed`.

| Today                                                                               | Kept as                                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ci-box run "<session> <what>" <dir> "<cmd>"`                                       | `stackra testbed run "<session> <what>" <dir> "<cmd>"`, same arguments   |
| Heavy (`encore test`, `playwright`, `e2e`, `act `, `build`) one per box; light slot | same classification, one heavy and one light slot per box                |
| Mac-side claim `/tmp/ci-claim/<box>-<slot>`, stale when its pid is gone             | same claim, keyed by instance id                                         |
| "every box busy, waiting", polling every 20 s                                       | same message; also raises the group's desired count after 2 min (ADR d9) |
| Refuses a command that calls `ci-box`                                               | refuses `ci-box` and `stackra testbed`                                   |
| Seeds a new copy from `~/academorix` so the Mac uploads only the diff               | reflink clone from `/data/seed/<project>`, refreshed after each job      |
| rsync excludes (`node_modules`, `.claude/worktrees`, `.agents`, `.env*`, …)         | same list, in one constant                                               |
| Blanks the Encore app id in `services/encore.app` so `encore test` runs offline     | same, inside the job's workspace                                         |
| `pnpm install --frozen-lockfile` when `node_modules` is missing; `timeout 3h`       | offline install against the read-only store; same 3 h timeout            |
| `status`: each box's heavy and light state, lock holder, load                       | same, plus disk %, health and AMI age                                    |
| `unlock [-b N]`: kill the stuck lock holder's tree                                  | `unlock <box>`: stop the job's container (and its labelled children)     |
| `ip`, `ssh [cmd]`, `sync <dir>` on one box                                          | same verbs, box chosen by index or instance id                           |
| SSH allowlist follows the Mac's public IP, one swap per region per run              | same, one region, one security group                                     |
| Boxes stop after 60 idle minutes; `ci-box` starts them                              | boxes above the minimum terminate after 60 idle minutes (ADR d9)         |
| `put-env`: owner copies a token to every `~/.ci-env`                                | removed; tokens come from Infisical per job (ADR d7)                     |
| Serves Academorix, Retail OS, Legal OS and Figentra checkouts                       | same: a project is any directory; its secret paths are testbed config    |

## Requirements

- **FR-001** `@stackra/infra-testbed` `.` entry: `testbedPlan(input)` returns plain data (region, groups, sizes,
  disks, guard thresholds, image schedule, secret grants) validated by zod; pure and tested without a cloud.
- **FR-002** `./node` entry: `awsTestbed(plan)` declares the VPC subnets lookup, security group, instance role and
  profile, launch template (40 GB root, 200 GB `/data`), the `heavy` and `light` Auto Scaling groups, the Image
  Builder pipeline (recipe, components, weekly schedule, distribution to the SSM parameter) and the S3 bucket for
  the build inputs. Nothing holds a secret value.
- **FR-003** `images/job/Dockerfile`: the job image (Ubuntu 24.04, mise, Node 24.22.0, pnpm 12, Encore CLI,
  Playwright browsers and deps, the Infisical CLI). Tool versions come from one file the plan reads, checked against
  `mise.toml` by a test.
- **FR-004** `images/host/`: the Image Builder components that install Docker, preload the job and `postgres`
  images, install `testbed-agent` and its systemd units, and warm the pnpm store from the core lockfile.
- **FR-005** `testbed-agent` (POSIX sh on the box, tested in the image build with bats-free shell tests):
  `job start|end|status`, `health`, `guard` (70% clean, 85% refuse and drain), `idle` (60 min terminate above the
  minimum), scale-in protection on while a job runs, `secrets` (Infisical AWS IAM login, token TTL = job timeout).
- **FR-006** `stackra testbed run|status|unlock|ip|ssh|sync|scale|image` in `@stackra/cli`, through `CliIo`, with
  unit tests for parsing, classification, the nested-call refusal, box choice, claim and the fallback decision.
- **FR-007** Fallback: when no healthy box exists, `run --preset verify|e2e|integration --ref <ref>` dispatches
  `testbed-fallback.yml` (inputs are a preset name and a ref, never a command); otherwise it waits.
- **FR-008** Runbook `apps/docs/src/docs/runbooks/test-infrastructure.mdx`: the shape, every command, the disk guard,
  replacing a box, rebuilding the image, rotating the identity, the fallback, cost, and the migration.
- **FR-009** Skill `.agents/skills/test-infra/SKILL.md`: how an agent runs heavy work, reads `status`, what to do on
  "every box busy", on a refusal and on a fallback; never `put-env`, never patch a box.

## Non-functional

- No job ever loses its box to scale-in, an instance refresh, or the guard (scale-in protection; the guard drains).
- A box from a new AMI is in service within 5 minutes of launch (warm image, no install at boot).
- No secret value on disk, in logs, in user data, in a process argument, or in `stackra testbed` output.
- Cost at the proposed minimums is at most about $1,100 a month (ADR 0484 Consequences).

## Owner answers (2026-10-30: "Approve, build", each as proposed)

- **Q1 Region.** eu-west-1 (cheapest EU region checked, boxes 1 and 2 already there) or another?
- **Q2 Counts.** `heavy` on-demand min 2, max 6; `light` spot min 1, max 4. Accept, or other numbers?
- **Q3 Infisical.** (Amended 2026-10-30: the owner chose the shared gate identity, with AWS Auth added, instead of a new
  identity.) Originally: the fourth machine identity `figentra-ci-boxes` with AWS IAM auth, read-only on
  `figentra-ci` (and the other products' CI projects when they join)? You make the Infisical change.
- **Q4 AWS account.** The boxes live in the `academorix` profile's account. Keep the testbed there?
- **Q5 Connection.** Keep SSH with the IP allowlist (no change for agents), or move to SSM Session Manager (no open
  port, no key file; the Mac needs the session-manager plugin)? Proposed: keep SSH for the migration, SSM later.
- **Q6 Size of the 16 GiB box.** Keep `c7i.2xlarge`, or `m7i.2xlarge` (32 GiB, +17%) for `heavy` if the e2e suite
  shows memory pressure? Proposed: keep, measure with the agent's memory check for two weeks.

## Not built here

- Phase 2, ephemeral self-hosted GitHub Actions runners from the same AMI (own ADR; amends 0166 CI1).
- Any `pulumi up`, image build, Infisical change or instance change: each waits for the owner.

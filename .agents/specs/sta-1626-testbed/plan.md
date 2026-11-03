# Implementation Plan: the testbed

**Spec**: `spec.md` · **ADR**: 0484 · **Linear**: STA-1626 · **Branch**: `figentra/sta-1626-testbed`

Nothing below changes a cloud resource until step 6, and step 6 waits for the owner. Builds, tests and the Pulumi
preview run on the boxes through stackra-f4; this Mac runs only oxfmt and oxlint.

## Build order

| Step | What                                                                                                                       | Output                                   | Gate                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------- |
| 1    | ADR 0484, spec, plan                                                                                                       | this folder, the ADR                     | **owner approval**         |
| 2    | `infra-testbed` package: plan (`.`), program (`./node`), tests; `pnpm new package infra-testbed --category infrastructure` | package scaffold + plan + program        | unit tests on a box        |
| 3    | Image: `images/job/Dockerfile`, `images/host/` Image Builder components, `testbed-agent` and its shell tests               | image sources                            | `docker build` on a box    |
| 4    | `stackra testbed` in `@stackra/cli` (commands, functions, tests); `ci-box` shim script                                     | command + tests                          | unit tests on a box        |
| 5    | Runbook, `test-infra` skill, `testbed-fallback.yml`, changesets                                                            | docs + skill + workflow                  | `pnpm verify` via f4       |
| 6    | `pulumi preview` of the program in the chosen region                                                                       | the preview output, attached to STA-1626 | **owner: apply? cost OK?** |
| 7    | Migration (below)                                                                                                          | new pool in service, old boxes retired   | **owner per phase**        |

Commits go to stackra-f4 to land on core main; this session never pushes.

## Design notes

- **Box discovery.** Boxes are found by tag (`stackra:testbed=<group>`) and state, not a fixed list. Box numbers in
  `status` are stable per run (sorted by launch time), and every verb also takes an instance id.
- **Job flow.** Mac: claim slot → `rsync` the directory to `/data/jobs/<id>` (after the agent clones the seed) →
  `ssh box testbed-agent job start <id> <slot> <who> <project> -- <cmd>` → stream output → exit code. Box: health,
  protect, `pnpm fetch` into the store (single writer), token, `docker run --rm` with the workspace rw and the store
  ro, `infisical run` inside, then `job end`: remove containers and network by label, refresh the seed from the
  workspace (without `node_modules`), delete `/data/jobs/<id>`, drop protection.
- **Store mount.** Read-only store plus a workspace on the same XFS volume. Hard links cannot cross the two mounts, so
  pnpm imports by reflink clone (`package-import-method=clone-or-copy`). Spike S1 in step 3 confirms reflink clone
  across the two bind mounts on the AMI's kernel; if it does not hold, the job mounts `/data` once and the store path
  is made read-only by a read-only bind inside the container, at the same cost.
- **Postgres.** A `postgres` container per job on the job's network, data on tmpfs, started only when the job asks
  (`--postgres`), so Encore's own test database and Testcontainers keep working through the Docker socket.
- **Docker socket.** Jobs reach the host Docker to start their own test containers (Encore, Testcontainers). Every
  such container gets the job label from the agent's wrapper and is removed at `job end`. Jobs are our own code; the
  socket is not a tenant boundary.
- **Secrets.** `infisical login --method=aws-iam-auth --machine-identity-id=<id>` on the host gives a token; the
  container receives it as `INFISICAL_TOKEN` and runs `infisical run --projectId <p> --env <e> --path <path> -- cmd`.
  The project and paths a job may name come from the plan's `secretGrants`; the identity's Infisical permissions are
  the real limit.
- **Image cadence.** Image Builder schedule weekly (Sunday 03:00 UTC) and a `testbed image build` verb; the program
  hashes the Dockerfile, the components and the toolchain pins into the recipe version, so a change makes a new
  recipe. A new AMI rolls out by instance refresh with `ScaleInProtectedInstances: Wait`.

## Migration from the eight boxes (zero interruption)

The tester keeps using the old boxes until the new pool has passed the same work. Each phase is a separate owner yes.

1. **Now (stackra-f4).** Box 1's disk freed and `put-env` hardened (already in `ci-box`: free-space check, build
   beside, keep every name). Nothing in this plan touches the old boxes before phase 5.
2. **Infisical (owner).** Add AWS IAM auth to the shared gate identity, bound to the testbed instance role ARN; it
   already reads the project `figentra-ci` (formerly `figentra-ci-gate`) `/ci`. No old box changes.
3. **Stand up beside (owner apply).** `pulumi up` in the chosen region: image pipeline, first AMI, `heavy` min 1,
   `light` min 0. Cost from this point: about +$300 a month while both run.
4. **Canary (tester).** `stackra testbed run` on the new pool for one day with the same jobs the tester runs on the
   old boxes (core `pnpm verify`, the playground e2e, one integration suite, one Academorix job). Compare results and
   wall time; fix and rebuild the image until equal.
5. **Switch (tester, owner informed).** `ci-box` becomes the shim: `run` goes to the new pool first and to the old
   boxes only when the new pool is full. Raise the new minimums to the agreed counts (Q2).
6. **Drain (owner per region).** Remove one old region's boxes from the shim's fallback list, wait until both of their
   slots are free (`status`), stop them. One region a day: us-east-1, eu-west-2, eu-central-1, then eu-west-1.
7. **Retire (owner).** After a week stopped with no fallback use, terminate the old instances and volumes, delete the
   `academorix-ci` security groups in the three emptied regions, remove the shim's fallback, and remove every
   `~/.ci-env` with its box. `put-env` is deleted from the shim.

Rollback at any phase before 7: the shim's fallback list still names the old boxes; starting them is `aws ec2
start-instances`.

## Risks

- **Image build breaks** on an upstream change: the last good AMI stays in the SSM parameter; the build alerts in
  Linear through the tester.
- **Reflink across mounts** (S1): fallback described above.
- **Spot capacity** for `light`: three instance types and capacity rebalancing; a light job retries once.
- **Infisical free plan**: the boxes use the shared gate identity, so no identity slot is spent.

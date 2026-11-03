# @stackra/infra-testbed

## 0.8.0

### Patch Changes

- @stackra/contracts@0.8.0

## 0.7.1

### Patch Changes

- @stackra/contracts@0.7.1

## 0.7.0

### Minor Changes

- 214bf6a: The testbed runs a pool in each of four regions, one stack per region (STA-2042). `testbedPlan` takes a `region`
  (eu-west-1, eu-west-2, eu-central-1 or us-east-1) and derives `home`. Only the home stack (eu-west-1) declares the
  global instance and image-builder roles, the build bucket and the image pipeline. Its distribution copies each AMI to
  all four regions and writes each region's AMI parameter. Every stack declares its region's security group, launch
  template and groups. The instance role may act on the testbed groups of all four regions. `AwsTestbed` gains `home`,
  and its home-only outputs become optional.

### Patch Changes

- 829b5e2: The image's pnpm store is warmed with `.pnpmfile.mjs` and `.npmrc` beside the lockfile and `pnpm-workspace.yaml`
  (`pnpm fetch` checks the pnpmfile's checksum and resolves the `@figentra-oss` scope from `.npmrc`; the build failed
  without them). The validate phase now runs an offline `pnpm fetch`
  against the store, so an incomplete store fails the build.
- @stackra/contracts@0.7.0

## 0.6.1

### Patch Changes

- dd1304c: The job image pins `shfmt` (from `mise.toml`, which `pnpm format:check` runs) and the Encore CLI at the products'
  `1.58.8` through mise, instead of the Encore installer's latest release. The image's validate step checks every tool a
  job calls at its pin and launches headless Chromium, and the host's checks the SSM agent.
  
  A job and the seed refresh now upload `.agents`: `pnpm validate` reads its specs, hooks, rules and skills, so a
  `pnpm verify` on the testbed failed without it. A test keeps the agent's list equal to the contract's.
  
  The image's pnpm store is warmed from the lockfile and `pnpm-workspace.yaml` together (`pnpm fetch` refused the
  lockfile alone over its catalogs, so the first build shipped an empty store), and a failed warm-up now fails the build.
  
  `.git` is no longer uploaded; the agent makes a fresh one-commit snapshot of the synced tree before each job, as
  `ci-box` did, so `git ls-files`, oxfmt and knip work from a worktree whose `.git` points at the Mac.
- @stackra/contracts@0.6.1

## 0.6.0

### Minor Changes

- e047d03: The testbed fits the region's EC2 vCPU quotas (ADR 0516): `heavy` and `light` are each 0 to 1 box by default, the plan
  carries `quota` (input, default 8 on-demand and 8 spot vCPUs), and `TESTBED_PLAN_SCHEMA` refuses a plan whose group
  maximum exceeds its purchase option's quota, an instance type with no known vCPU count (`INSTANCE_VCPUS`), or a heavy
  minimum that leaves no room for the image build. The Image Builder pipeline has no schedule: the owner builds by hand
  while `heavy` is at 0. `TESTBED_DEFAULTS.imageSchedule` is gone and `TESTBED_DEFAULTS.quota` is new.

### Patch Changes

- c92bef9: The testbed's Image Builder components and recipe are kept in AWS when new inputs replace them (`retainOnDelete`). The
  provider replaces a fixed-name resource delete-first, and AWS refuses to delete a version an image was built from, so
  `pulumi up` failed with ResourceDependencyException once the inputs changed.
- 0c31740: The testbed's job image installs `zip`: figentra/brand's hub check (`engine/_hub/build.mjs`) zips each kit's bundles.
- 2993840: `stackra testbed` reaches the boxes by SSH through SSM Session Manager: `ssh` and `rsync` connect to
  `ubuntu@<instance-id>` with an `AWS-StartSSHSession` `ProxyCommand`, so the security group needs no inbound rule and
  a changing public IP (Cloudflare WARP) no longer breaks access. `--ssh-direct` (or `STACKRA_TESTBED_SSH_DIRECT=1`)
  keeps the public-IP path with the port-22 allowlist swap. `awsTestbed`'s `allowedCidrs` is optional: absent or empty
  means no ingress. The Session Manager plugin is pinned in `mise.toml`.
- @stackra/contracts@0.6.0

## 0.5.1

### Patch Changes

- @stackra/contracts@0.5.1

## 0.5.0

### Patch Changes

- @stackra/contracts@0.5.0

## 0.4.0

### Patch Changes

- 0c16187: Fix the testbed's first apply. The launch template is now declared only with the groups, because EC2 refuses a template whose AMI parameter does not exist yet. The AMI parameter moves to `/imagebuilder/stackra-testbed/ami`, the only prefix Image Builder's service-linked role may write. Boxes get the `academorix-ci` key pair that `stackra testbed` connects with. The image steps and the box agent now find the host's mise tools in `/opt/mise`. `stackra testbed` now swaps its SSH allowlist entry with `aws ec2 …-security-group-ingress` (the `ec2` was missing, so a changed IP was never allowed).
- Updated dependencies [9c8d108]
- Updated dependencies [f8fe5a5]
- Updated dependencies [1856ee0]
  - @stackra/contracts@0.4.0

## 0.3.0

### Minor Changes

- 47a1f56: Add `@stackra/infra-testbed` (STA-1626, ADR 0484): the testbed, the disposable image-built EC2 test boxes. `testbedPlan`
  returns the zod-validated plan (eu-west-1, `heavy` on-demand c7i.2xlarge 2 to 6, `light` spot 1 to 4, a 40 GB root and a
  200 GB XFS `/data`, the 70/85 disk guard, the 60 minute idle stop, the weekly image schedule, the toolchain pins and the
  Infisical secret grants); `awsTestbed` declares the security group, instance role, launch template, the two Auto Scaling
  groups and the EC2 Image Builder pipeline. The package carries the job image Dockerfile, the host image components and
  `testbed-agent`, the POSIX box agent (slots, health, job run with a container per job, guard, idle), with its tests.

### Patch Changes

- Updated dependencies [d22a5eb]
- Updated dependencies [23e556c]
  - @stackra/contracts@0.3.0

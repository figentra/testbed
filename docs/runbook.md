# Test infrastructure (the testbed)

<!--
Testbed file contract:
Purpose: the operator runbook of the testbed: how jobs run, the disk guard, replacing a box, rebuilding the image,
         secrets, the fallback, cost, and the migration from the old ci-box fleet.
Boundary: documentation only; the code, ADR 0484 (as amended by ADR 0522) and the box agent contract
          (`.agents/specs/sta-1626-testbed/agent-contract.md`) win on any difference.
Origin: `apps/docs/src/docs/runbooks/test-infrastructure.mdx` in figentra/stackra, moved here at beaafa27 (STA-2073).
-->

The shared test boxes every builder session uses: how jobs run, the disk guard, replacing a box, rebuilding the image,
secrets, the fallback, cost, and the migration from the old ci-box fleet.

> [!NOTE]
> The design is [ADR 0484][adr-0484]; ADR 0522 (reserved in figentra/stackra, STA-2073) moves the code to this
> repository and the CLI to `testbed`. The code is `@figentra/testbed` (`packages/testbed`) and its `testbed` command.
> `stackra testbed` in `@stackra/cli` keeps working for one release, then goes. Nothing is applied until the owner
> says so. Until the migration below finishes, `ci-box` and the eight old boxes stay in service.

> [!WARNING]
> AWS quotas are fixed inputs ([ADR 0516][adr-0516]): each region allows 8 on-demand and 8 spot vCPUs, one `2xlarge`
> of each, and AWS Support refuses increases. The groups below fit that: each is 0 to 1 box, and the plan refuses
> more. Never request or suggest a quota increase without the owner's explicit confirmation; reading a quota is fine.

Builder sessions never run heavy checks on the Mac. Only oxfmt and oxlint run there. Install, build, gen, typecheck,
tests, e2e and integration tests all run on the testbed: identical EC2 boxes, built from one image, in four regions
(eu-west-1, eu-west-2, eu-central-1 and us-east-1, tried in that order).

## Live names

The AWS resources and their names stay as they were created; renaming one replaces it or orphans its state. They are:
the state bucket `stackra-pulumi-state-591473336656`, the Pulumi project `stackra-testbed` and its stacks
`testbed-<region>`, every `stackra-testbed-*` resource (the groups `stackra-testbed-heavy` and `stackra-testbed-light`,
the image pipeline `stackra-testbed`, the roles `stackra-testbed-instance` and `stackra-testbed-deploy`), the tag
`stackra:testbed`, the AMI parameter `/imagebuilder/stackra-testbed/ami`, the key pair `academorix-ci` and the AWS
profile `figentra`.

## The shape

| Part      | What it is                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regions   | One pool in each of eu-west-1 (the home), eu-west-2, eu-central-1 and us-east-1, one Pulumi stack each (`testbed-<region>`); the CLI uses only the regions in its enabled list, in that order (STA-2042)                  |
| Image     | One Dockerfile for the job toolchain (mise, Node, pnpm, Encore, Playwright) and one EC2 Image Builder AMI (adding sops and the Google Cloud CLI on the host), built in the home region and copied to every region         |
| Groups    | `heavy`: on-demand `c7i.2xlarge`, 0 to 1 box. `light`: spot `c7i`/`c6i`/`m7i.2xlarge`, 0 to 1 box (the region's 8 + 8 vCPU quotas, ADR 0516)                                                                              |
| Disks     | 40 GB root (OS and images); 200 GB XFS data volume at `/data` (jobs, seeds, pnpm store, turbo cache, Docker)                                                                                                              |
| Slots     | One heavy and one light job per box. Heavy: `encore test`, `playwright`, `e2e`, `act `, `build`, or `--on-demand`. Everything else: light. A light box with a spot reclaim or rebalance notice refuses new jobs (exit 75) |
| Jobs      | A fresh container per job, workspace `/data/jobs/<id>`, read-only pnpm store, optional Postgres; all deleted after                                                                                                        |
| Secrets   | Decrypted per job from figentra/secrets (sops, Cloud KMS) by the instance role through Google Workload Identity. There is no token file                                                                                   |
| Box agent | `testbed-agent` on every box: health, slots, the disk guard and the idle check                                                                                                                                            |

## Running work

```bash
testbed run "<session> <what>" <project-dir> "<command>"
```

The command looks at every enabled region and takes a free slot of the right kind, in region order. When there is none,
it starts a box in the first region with room, and otherwise waits. It syncs the directory; only the diff is uploaded,
because the box clones its last copy of the project first. Then it runs the command in a fresh container and returns
its exit code. The job runs detached on the box and the CLI follows its log: when the SSH-over-SSM connection drops
(seen once as "Bad packet length ... Connection corrupted" after 23 minutes), the job keeps running, the CLI reattaches
up to three times, 10 s apart, and exits with the job's code. Ctrl-C stops the job on the box.

The enabled regions are `TESTBED_DEFAULTS.enabledRegions` in
`packages/testbed/src/core/constants/testbed-defaults.constant.ts`: eu-west-1, eu-west-2, eu-central-1 and us-east-1
(a region whose groups do not exist yet is skipped).
`--regions a,b` or `STACKRA_TESTBED_REGIONS` overrides it for one machine, and `--region r` narrows it to one region.
The other verbs:

| Verb                         | Does                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `testbed status`             | each enabled region and its boxes: heavy and light slot, disk use, health, image age, load |
| `testbed unlock --box N`     | stops a stuck job on one box (its container and the containers it started)                 |
| `testbed ip\|ssh\|sync`      | one box, by number from `status` or by instance id                                         |
| `testbed scale [--region r]` | shows each group's desired count and raises it by one                                      |
| `testbed image`              | the current AMI and its age                                                                |

For callers such as `fflow gate` (this interface is frozen by ADR 0522):

- **`run … --json`** streams the job's output to stderr and prints one line on stdout:
  `{"region","box","slot","waitSeconds","runSeconds","exitCode"}`.
- **The exit code** is the job's own, or 2 (usage), 73 (no free slot, with `--no-wait`), 75 (no healthy box, or no
  enabled region answers: this machine's AWS access, said at once) or 124 (the 3-hour limit). Ctrl-C or SIGTERM
  stops the job on the box and exits 130.
- **`status --json`** gives each region's free, total and startable heavy and light slots, so the caller sizes its
  parallel jobs.
- **The old name.** `stackra testbed run` (`@stackra/cli`) takes the same arguments and flags, prints the same JSON
  line and uses the same codes, so a caller switches by changing the command word: Flow's `runner.run` in
  `flow.config.json` becomes `["testbed", "run", "{label}", "{dir}", "{command}", "{flags}"]` once `@figentra/testbed`
  is released and installed where the caller runs.

What each failure looks like to a caller. Each row was probed on eu-west-1 on 2026-11-05, except the last two, which
are read from the code:

| Situation                                   | Exit    | What happens                                                  |
| ------------------------------------------- | ------- | ------------------------------------------------------------- |
| the job fails                               | its own | passed through; the JSON line carries it                      |
| every slot of the kind busy, `--no-wait`    | 73      | without `--no-wait` it waits, and raises a group with room    |
| no healthy box, `--no-wait`                 | 75      | without `--no-wait` it raises a group at 0 and waits          |
| no enabled region answers AWS (bad profile) | 75      | at once, with AWS's reason                                    |
| Session Manager plugin missing              | 75      | at once, with where it looked                                 |
| the job's 3-hour limit                      | 124     | container stopped, workspace and protection cleaned up        |
| Ctrl-C or SIGTERM on the caller             | 130     | the job is stopped on the box and cleaned up (see below)      |
| SSH-over-SSM drops mid-job                  | its own | the job keeps running; the CLI reattaches up to 3 times       |
| a light box lost (spot reclaim, exit 255)   | its own | the job is run once more on another box; a heavy job never is |

Until the image built after figentra/stackra#475, a stopped job can leave its `/data/jobs/<id>` and the box's scale-in
protection behind; the next job on that box clears the protection, and the disk guard removes the folder once `/data`
is 70% full.

Also:

- **"every box busy, waiting"** means every slot of that kind is taken. After two minutes the command adds a box (up
  to the group's maximum) and keeps waiting. Do not start a second copy of the job.
- A command that calls `ci-box`, `testbed` or `stackra testbed` is refused. Run it from the Mac instead.
- A job runs for at most 3 hours.

### How the Mac reaches a box

By SSH through **SSM Session Manager**: `ssh`, `rsync` and every verb connect to `ubuntu@<instance-id>` with an
`AWS-StartSSHSession` `ProxyCommand`. The security group has no inbound rule, so a changing public IP (Cloudflare WARP)
does not matter. Needs on the Mac: the `aws` CLI with the `figentra` profile, the SSH key, and the Session Manager
plugin, pinned in the calling repository's `mise.toml` (figentra/stackra's does; `mise install`). The box side is already there:
the instance role has `AmazonSSMManagedInstanceCore`, the Ubuntu image runs the SSM agent, and egress is open.

`testbed --ssh-direct` (or `STACKRA_TESTBED_SSH_DIRECT=1`) is the fallback: it connects to the public IP and swaps this
machine's address into the port-22 allowlist, which exists only when `TESTBED_SSH_CIDRS` was set at apply.

The `figentra` profile runs as the account root today, so it needs no policy. A non-root caller needs this much:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ec2:eu-west-1:591473336656:instance/*",
      "Condition": { "StringLike": { "ssm:resourceTag/stackra:testbed": ["heavy", "light"] } }
    },
    {
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ssm:eu-west-1::document/AWS-StartSSHSession"
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:TerminateSession", "ssm:ResumeSession"],
      "Resource": "arn:aws:ssm:*:*:session/${aws:userid}-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "autoscaling:DescribeAutoScalingGroups",
        "autoscaling:SetDesiredCapacity"
      ],
      "Resource": "*"
    }
  ]
}
```

## The disk guard

`testbed-agent guard` runs every five minutes and before every job.

| `/data` use                           | What happens                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| under 70%                             | normal                                                                                                            |
| 70% or more                           | cleanup: finished job folders, stopped containers, dangling images, seeds unused for 7 days, turbo cache to 20 GB |
| 85% or more (or `/` under 10 GB free) | the box refuses new jobs and reports unhealthy. Once its jobs finish, the group replaces it                       |

Nobody frees disk by hand. A box that keeps filling up points to a job that writes outside its workspace: find it
in `status` and fix the job.

## Replacing a box

Replace, don't repair. A box that is unhealthy or acting oddly:

1. Run `testbed status` and note the box's instance id.
2. Wait until its slots are free. A running job holds scale-in protection.
3. The owner, or the tester with the owner's yes, marks it unhealthy:

   ```bash
   aws autoscaling set-instance-health --instance-id <id> --health-status Unhealthy --profile figentra --region eu-west-1
   ```

The group starts a new box from the current image within about five minutes. Never SSH in to patch packages, edit
configs or install tools: the next box would not have the change. Change the image instead.

## Who may dispatch what

- **The owner only** dispatches `apply-testbed.yml` with `up` or `build-image`, a stack rename, an instance refresh and
  the canary. The `testbed` environment (main only, the owner as required reviewer) approves every apply run.
- **Agents** run `preview` only, and never `pulumi up`, `pulumi destroy`, an image build or `docker build` on a
  workstation. They may start an apply run for the owner to approve, never approve one.
- `testbed-image.yml` (the image check on a pull request, a dispatch and the daily run) needs no approval: it builds
  nothing in AWS.

## Rebuilding the image

There is no schedule, and only the home region (eu-west-1) builds. Its distribution copies each new AMI to all four
regions and writes each region's `/imagebuilder/stackra-testbed/ami`, so no other region ever builds. The build
instance is a second on-demand `c7i.2xlarge`, and the home region's on-demand quota fits one ([ADR 0516][adr-0516]).
So after a recipe change, the owner starts a build by hand, only while eu-west-1's `heavy` group is at 0. The recipe
gets a new version when any hashed input changes:

- the Dockerfile (`packages/testbed/images/job/Dockerfile`);
- the host components and files (`packages/testbed/images/host/`);
- the box agent (`packages/testbed/src/agent/testbed-agent.sh`);
- the toolchain pins (`packages/testbed/src/core/constants/toolchain-pins.constant.ts`);
- core's four install files: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.pnpmfile.mjs` and `.npmrc` of
  figentra/stackra ("core" below).

Core's install files are the image's only install source, and they warm the box's pnpm store: the warm store is core's
alone. The workflows take them from a sparse checkout of figentra/stackra (those four files and `mise.toml`) at the
input `core_ref`, default `main`, and pass the lockfile path to Pulumi. Because a core lockfile change moves the hash,
core keeps a small advisory warm-store check on its own pull requests, and `testbed-image.yml` here runs daily against
core `main`, with the test that the toolchain pins match core's `mise.toml` and `pnpm-workspace.yaml`.

The usual way is `apply-testbed.yml` with `action=build-image` and `region=eu-west-1`; by hand:

```bash
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names stackra-testbed-heavy --query 'AutoScalingGroups[0].DesiredCapacity' --profile figentra --region eu-west-1
aws imagebuilder start-image-pipeline-execution --image-pipeline-arn <arn of stackra-testbed> --profile figentra --region eu-west-1
```

A failed build keeps the last good AMI.

To roll out a new image, the owner starts an instance refresh. Boxes running a job wait, because the refresh skips
protected boxes until they are free:

```bash
aws autoscaling start-instance-refresh --auto-scaling-group-name stackra-testbed-heavy --profile figentra --region eu-west-1
```

Repeat with `stackra-testbed-light`, and in each region that runs boxes (`--region` of that region).

## Secrets

- Secrets live in figentra/secrets as sops files, one per name, keyed by Cloud KMS (ADR 0525). Each box signs in to
  Google as its instance role, `stackra-testbed-instance`, through the Workload Identity provider `testbed` that
  figentra/infra's `stacks/secrets` declares. The file that says how, `/etc/testbed/google-credentials.json`, is
  written by user data and holds no secret: the box's AWS credentials are read from IMDSv2 at each use.
- At job start the agent copies each granted scope's `<NAME>.enc.yaml` from `gs://figentra-secrets-ciphertext/`
  (prefix: the scope with `/` as `.`) into a private folder on `/run`, decrypts each in memory with sops, removes the
  folder, and passes each value to the container by name (`-e NAME`). No value touches a disk, a log or a command
  line. `testbed-agent health` reports `unhealthy: google` when Google issues the role no token.
- Which scopes a job may read is `secretGrants` in `@figentra/testbed`, reviewed like code. figentra/infra's grant to
  the role is the real limit (object read on those three prefixes, decrypt with the `ci-build` key). Core gets
  `ci/build` and `ci/build/turbo`; every project, through the `*` key, gets `ci/build/registry`, the registry read
  token, so a product's install of `@figentra/*` works.
- pnpm 12 expands no variable in a repository's `.npmrc`, so the agent hands the token to pnpm under both names
  (`FIGENTRA_REGISTRY_TOKEN`, and `STACKRA_REGISTRY_TOKEN` until the registry move retires it) and points
  `PNPM_CONFIG_NPMRC_AUTH_FILE` at the repository's own `.npmrc`. The token stays in the job's environment.
- `ci-box put-env` and `~/.ci-env` are retired. A missing token is added to figentra/secrets (`pnpm secrets:put` in
  figentra/stackra), by the owner; its mirror sync makes it reach the next job. See [Token rotation][token-rotation]
  in figentra/stackra.

## When no box is healthy

`testbed run --preset <verify|e2e|integration> --ref <ref>` dispatches `testbed-fallback.yml` in the caller's
repository (figentra/stackra has it). It runs that preset for a pushed ref on a GitHub-hosted runner. In a repository
without that workflow (this one, figentra/flow) the CLI dispatches nothing and prints a hint, and the run exits 75. A
plain command, or work in an unpushed worktree, waits for a box instead. Nothing falls back to the Mac.

## Cost

Prices read on 2026-10-30 for eu-west-1:

- on-demand `c7i.2xlarge`: $0.383 an hour (about $280 a month always on);
- spot: about $0.215 an hour;
- gp3: $0.088 per GB-month (about $21 a month for one box's two disks).

Both minimums are 0, so an idle testbed costs only its stopped state: nothing runs. A busy day runs at most one heavy
and one light box per region, about $0.60 an hour a region; with all four regions busy around the clock that is at
most about $1,760 a month with disks, and a normal day is a small part of that. Each region also stores its copy of
the image, about $12 a month. Every box ends itself after 60 idle minutes, and `testbed run` starts one when its group
is at 0. The old fleet ran about $1,900 a month.

## Answering fleet questions from live state

Read-only, with the `figentra` profile; each answer comes from AWS, never from this file.

- **Capacity:** `testbed status --json` (every enabled region's free, total and startable slots); one region outside
  the enabled list: `testbed status --json --regions <region>`.
- **Image age, every region:** `testbed image` for the home region; for all four,
  `aws ssm get-parameter --name /imagebuilder/stackra-testbed/ami --region <r>`, then
  `aws ec2 describe-images --image-ids <ami> --region <r> --query 'Images[0].[Name,CreationDate]'`. The name carries
  the build time, and it must be the same in every region. Whether the image is current: the pipeline's
  `imageRecipeArn` (`aws imagebuilder list-image-pipelines --region eu-west-1`) ends in the same version as the AMI's
  `Ec2ImageBuilderArn` tag; when it doesn't, a `build-image` is due.
- **Failures:** box launches and stops per group and region,
  `aws autoscaling describe-scaling-activities --auto-scaling-group-name stackra-testbed-<heavy|light> --region <r>`
  (a spot `UnfulfillableCapacity` or `InsufficientInstanceCapacity` there is retried by the group); a stuck box,
  `testbed status` (health, disk, lock holder, image age); a box left protected with no job,
  `aws autoscaling describe-auto-scaling-instances --instance-ids <id>` (`ProtectedFromScaleIn`).
- **Cost:** the `service` cost-allocation tag,
  `aws ce get-cost-and-usage --region us-east-1 --time-period Start=<d>,End=<d> --granularity DAILY --metrics UnblendedCost --filter '{"Tags":{"Key":"service","Values":["testbed"]}}'`.
  Cost Explorer lags about a day, and each call costs $0.01.

## Migration from the old fleet

> [!NOTE]
> Done on 2026-11-06 (owner): box 1, the last old box, is terminated, as are the old ci-box and testbed AMIs, their
> snapshots and the four `academorix-ci` security groups. `ci-box` is the shim with no legacy fallback. The key pair
> `academorix-ci` stays: the testbed boxes use it. The steps below are the record.

The tester keeps using the eight old boxes until the new pool has passed the same work. Every step is a separate owner
yes ([plan](../.agents/specs/sta-1626-testbed/plan.md)).

1. **Secrets.** The owner adds AWS Auth to the shared gate identity, bound to the testbed instance role (since
   STA-2146: figentra/infra's Google `testbed` provider instead, see Step 1 below).
2. **Stand up beside.** The `apply-testbed.yml` workflow in eu-west-1 (Step 2 below): the image pipeline, the first
   AMI, both groups 0 to 1. The old eu-west-1 boxes 1 and 2 must be **stopped** first: they hold the region's whole
   on-demand and spot quota while running, and stopped instances count against neither. `ci-box` skips them since
   2026-11-02, so they stop themselves after 60 idle minutes.
3. **Canary.** The tester runs the same jobs on both fleets for a day (core verify, playground e2e, an integration
   suite, one Academorix job) and compares the results.
4. **Switch.** `ci-box` becomes the shim (`scripts/ci-box-shim.sh`, installed as `~/.local/bin/ci-box`): new boxes
   first, old boxes only when the new pool has no healthy box. The groups stay 0 to 1: the quota allows no more
   (ADR 0516).
5. **Drain.** One old region a day (us-east-1, eu-west-2, eu-central-1, eu-west-1): remove it from the shim's
   fallback, wait for free slots, stop the boxes.
6. **Retire.** After a week stopped and unused, terminate the old boxes and their disks, delete the emptied
   `academorix-ci` security groups, and delete the shim's fallback with every `~/.ci-env`.

Rollback before the last step: the shim still names the old boxes, and `aws ec2 start-instances` brings them back.

## Step 1 in detail: the Google side (STA-2146)

Until STA-2146 the boxes used AWS Auth on the Infisical gate identity. Now figentra/infra's `stacks/secrets` declares
it, applied by the owner there: the Workload Identity provider `testbed` (AWS type, this account, only the
`stackra-testbed-instance` role), object read on the mirror prefixes `ci.build`, `ci.build.turbo` and
`ci.build.registry` for that role's principal set, and decrypt with the `ci-build` key. Nothing is set here: the
provider's name is `TESTBED_DEFAULTS.googleProvider`, and user data writes the credentials file from it.

The change lands in this order, with no job in between: infra's apply, then this repository's `up` (new components and
user data), then `build-image`, then an instance refresh. A box from the old AMI with the new user data, or the other
way round, refuses every job with exit 75.

## Step 2 in detail: the first deploy

Nothing is applied from the Mac. The testbed is applied by the manual workflow `apply-testbed.yml` (Actions, "Apply
testbed", Run workflow), on `main` only, in the GitHub environment `testbed`, whose required reviewer (the owner)
approves every run. It signs in to AWS by GitHub OIDC, so no AWS key is stored anywhere, and keeps Pulumi's state in the
private, versioned bucket `stackra-pulumi-state-591473336656` (eu-west-1), which its first run creates. Pulumi's S3
backend locks with objects in that bucket, so there is no lock table. The stack holds ids and CIDRs only, so its
passphrase is empty by design.

The workflow selects the region's stack and never creates one: a missing stack fails the run instead of starting an
empty one. Only the explicit new-region path (2c) may create a stack. Apply runs from one repository at a time: core's
"Apply testbed" is disabled before this repository's first preview, and both previews at one recorded core SHA must
show the same diff.

### 2a. One-time bootstrap (owner, with the `academorix` AWS profile; done 2026-10-30)

The workflow cannot create the role it signs in with, so the owner creates it once. GitHub's OIDC provider, if the
account has none yet:

```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --profile figentra
```

The deploy role, trusted only by the `testbed` environment of the repository that applies. The organization's tokens
use the immutable subject form (`repo:figentra@314302700/<repo>@<repo-id>:…`), so both forms are listed. It was
created on 2026-10-30 for figentra/stackra:

```bash
aws iam create-role --role-name stackra-testbed-deploy --profile figentra --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"arn:aws:iam::591473336656:oidc-provider/token.actions.githubusercontent.com"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com","token.actions.githubusercontent.com:sub":["repo:figentra/stackra:environment:testbed","repo:figentra@314302700/stackra@1425140001:environment:testbed"]}}}]}'
```

For this repository the owner adds the figentra/testbed subjects to that trust policy
(`repo:figentra/testbed:environment:testbed` and `repo:figentra@314302700/testbed@<repo-id>:environment:testbed`,
`<repo-id>` being this repository's numeric id), with `aws iam update-assume-role-policy`, and removes the two
figentra/stackra subjects once the first `up` from here has run. Until then core can still assume the role.

Its rights: everything but IAM (`PowerUserAccess`), plus IAM only for the testbed's own roles and instance profiles,
and never for itself (the deny keeps it from granting its own role more):

```bash
aws iam attach-role-policy --role-name stackra-testbed-deploy --policy-arn arn:aws:iam::aws:policy/PowerUserAccess --profile figentra
```

```bash
aws iam put-role-policy --role-name stackra-testbed-deploy --policy-name testbed-iam --profile figentra --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["iam:*Role","iam:*Roles","iam:*RolePolicy","iam:*RolePolicies","iam:*InstanceProfile","iam:*InstanceProfiles","iam:*RoleFromInstanceProfile","iam:*RoleToInstanceProfile","iam:TagRole","iam:UntagRole","iam:TagInstanceProfile","iam:PassRole"],"Resource":["arn:aws:iam::591473336656:role/stackra-testbed-*","arn:aws:iam::591473336656:instance-profile/stackra-testbed-*"]},{"Effect":"Allow","Action":"iam:CreateServiceLinkedRole","Resource":"*"},{"Sid":"NeverItsOwnRole","Effect":"Deny","Action":"iam:*","Resource":"arn:aws:iam::591473336656:role/stackra-testbed-deploy"}]}'
```

Then in GitHub, figentra/testbed, Settings, Environments, New environment `testbed`: deployment branches **main**
only, required reviewer the owner, and two environment variables (neither is secret):

- `TESTBED_DEPLOY_ROLE_ARN` = `arn:aws:iam::591473336656:role/stackra-testbed-deploy`
- `TESTBED_SSH_CIDRS` (optional) = a port-22 allowlist as `x.x.x.x/32`, comma-separated, for `--ssh-direct` only.
  Leave it unset: the CLI reaches the boxes through SSM. A rule already applied stays until the owner revokes it.

### 2b. The two passes

Each run below is Actions, "Apply testbed", Run workflow on `main`, then the owner approves it in the `testbed`
environment.

1. **action** `preview`, **groups** unticked, heavy `0`, light `0`. Read the plan: a security group, two roles with
   their profiles and policies, a launch template, the build bucket and its object, the Image Builder components,
   recipe, infrastructure, distribution and pipeline, and no Auto Scaling group.
2. **action** `up`, same inputs. Creates the state bucket on the first run, then the pipeline. No instance runs yet.
3. **action** `build-image`. Starts the pipeline once: 30 to 60 minutes on one build instance that stops when done. Its
   log is in the Image Builder console under `stackra-testbed`. When it succeeds, the SSM parameter
   `/imagebuilder/stackra-testbed/ami` holds the AMI id. The build instance is a `c7i.2xlarge` that needs the region's
   whole on-demand quota (8 vCPUs), so no heavy box, and no old on-demand box in eu-west-1, may be running.
4. **action** `preview`, **groups** ticked, heavy `0`, light `0`: the two Auto Scaling groups appear.
5. **action** `up`, same inputs. No box starts. The first `testbed run` raises the heavy group from 0 to 1, and
   `testbed status` should list that box healthy within about five minutes.

Both minimums stay at 0 ([ADR 0516][adr-0516]): with 8 on-demand and 8 spot vCPUs the pool is at most one heavy and
one light box, each started on demand. The plan refuses a heavy minimum above 0, because the image build must always
fit beside it.

Every run takes a `region` (default eu-west-1) and applies that region's stack, `testbed-<region>`. The old
single-region stack `testbed` was renamed `testbed-eu-west-1` by its first `up` from core; the owner confirms that
rename before the first run here. `build-image` runs in eu-west-1 only.

### 2c. Adding a region

1. **Stop the old boxes:** any old box in the region must be stopped first, because it uses the same quota.
2. **Check the image is there:** the region must already hold the image, so that
   `aws ssm get-parameter --name /imagebuilder/stackra-testbed/ami --region <region> --profile figentra` returns an
   AMI. A build after the four-region distribution put it there.
3. **Apply the region:** **action** `up`, **region** `<region>`, **groups** ticked, heavy `0`, light `0`, through the
   new-region path that may create the region's stack. That declares the security group, the launch template and the
   two groups. No box starts.
4. **Enable it in the CLI:** a one-line pull request here adds the region to `TESTBED_DEFAULTS.enabledRegions`, and `@figentra/testbed`
   is released. The region is used once sessions run that version. Until then, one job can try it with
   `--regions <region>`.

[adr-0484]: https://github.com/figentra/stackra/blob/main/apps/docs/src/docs/adr/0484-the-testbed-disposable-image-built-test-boxes-a-container-per-job-and-secrets-from-infisical.mdx
[adr-0516]: https://github.com/figentra/stackra/blob/main/apps/docs/src/docs/adr/0516-aws-quotas-are-fixed-inputs.mdx
[token-rotation]: https://github.com/figentra/stackra/blob/main/apps/docs/src/docs/runbooks/token-rotation.mdx

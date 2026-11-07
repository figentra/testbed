# @figentra/testbed

## 0.1.2

### Patch Changes

- 02346be: The default AWS profile is `figentra`, which replaces the old `academorix` profile name for the same account.
  The key pair and key file keep their live names. `STACKRA_TESTBED_AWS_PROFILE` still overrides it.

## 0.1.1

### Patch Changes

- 70420c3: The box agent reads pnpm flags from a repository's `.testbed/install-args` and keeps Uniwind Pro's verified tarball in
  the box's pnpm cache (`UNIWIND_CACHE_DIR`), byte for byte as figentra/stackra #417 and #425.
- d02802b: As figentra/stackra: `testbed run` runs the job detached on the box and follows its log, reattaching after a dropped
  SSH-over-SSM connection (Ctrl-C stops the job), with SSH keepalives, and `--postgres` reaches the agent; the enabled regions are eu-west-1, eu-west-2 and
  eu-central-1. The program keeps only subnets in zones offering the heavy type, sets an optional permissions boundary
  on its roles, gives both groups a one-day max lifetime and in-service metrics, and pins the job image's base by
  digest. The agent's mise shims path is overridable, so its tests' stubs win inside the job container.
- 2118903: `testbed run` no longer uploads a worktree's `.cache` (its pnpm store, about 7.5 GB); the box agent's seed refresh
  leaves it out too, byte for byte as figentra/stackra.
- a6d820d: `testbed run` exits 75 at once, with AWS's reason, when no enabled region answers (a bad or expired AWS profile),
  instead of printing "no healthy testbed box, waiting" until the caller's own timeout. The GitHub fallback still goes
  first. The docs name exit 130 (stopped by Ctrl-C or SIGTERM).
- 1286c53: Every project's box job can read the registry: the plan grants `prod` `/ci/registry` of the CI project to every
  project (the `*` key of `grants.json`, which the agent adds to each project's own paths), and the agent gives pnpm the
  token under both names (`FIGENTRA_REGISTRY_TOKEN` first, `STACKRA_REGISTRY_TOKEN` second) with the repository's own
  `.npmrc` as its auth file, since pnpm 12 ignores `${...}` in a project `.npmrc`. Changes a hashed image input: the image
  is rebuilt, and each region's launch template changes with its next `up`.
- e4b03f9: As figentra/stackra: `testbed` finds the aws CLI's Session Manager plugin itself (on `PATH`, else the mise-installed
  copy, whose folder it puts first on `PATH` for the `aws` and `ssh` it starts). Without the plugin, `run` exits 75 at
  once and says why instead of waiting on "no healthy testbed box" while the boxes are healthy, and `status` names the
  reason a box did not answer.
- f58992e: testbed-agent: a job stopped while it cleans up (Ctrl-C, SIGTERM, `job stop`) still removes its workspace and drops
  the box's scale-in protection. Seen live on 2026-11-05: a cancelled job left both. Changes a hashed image input, so it
  reaches boxes with the next image build.
- 4bfdbfb: us-east-1 joins the enabled regions, last, now that box 1 is stopped for good and its stack is up (runbook steps 15
  and 30): `testbed run` and `status` use eu-west-1, eu-west-2, eu-central-1 and us-east-1, in that order.

Earlier history: the `@stackra/infra-testbed` changelog in figentra/stackra, up to 0.8.0 (copied here at beaafa27).

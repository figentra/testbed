# testbed

Disposable, image-built EC2 boxes that run heavy checks (install, build, typecheck, tests, e2e and integration tests)
so a workstation never does. One golden image, built from code by hand; boxes are replaced, never repaired.

This repository holds all of it: the Pulumi program that declares the boxes, the EC2 Image Builder pipeline and the
grants; the job image and the host image steps; the box agent; and the `testbed` CLI that runs work on a box.

> The source is public for reading only. See [LICENSE](LICENSE).

## The `testbed` CLI

`@figentra/testbed` ships the `testbed` binary.

| Verb                                   | What it does                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `run "<session> <what>" <dir> "<cmd>"` | syncs `<dir>` to a free box, runs `<cmd>` there under the box's lock, streams output |
| `status`                               | every box: region, slot, lock holder, health                                         |
| `unlock [--box N\|id] [--slot s]`      | releases a stale lock                                                                |
| `ip [--box]`, `ssh [--box] [cmd]`      | a box's address, or a shell on it (SSH through SSM)                                  |
| `sync [--box] <dir>`                   | copies a directory to a box without running anything                                 |
| `scale [--box N\|id] [--slot s]`       | shows each group's desired, min and max; with `--slot`, raises that group by one     |
| `image`                                | the AMI the boxes boot from, and its age                                             |

`run` takes `--preset verify|e2e|integration --ref <ref>`, `--regions a,b`, `--region r`, `--no-wait` and
`--on-demand`. With `--json`, `run` prints one result line on stdout,
`{region, box, slot, waitSeconds, runSeconds, exitCode}`, and the job's output goes to stderr; `status --json` prints
JSON. Exit codes: `73` every box is busy, `75` no healthy box, `124` the job timed out; otherwise the job's own code.

`scripts/ci-box-shim.sh` installs as `ci-box` and maps the old `ci-box` calls onto `testbed`.

## Layout

| Path                         | What                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/testbed/src/core`  | the pure plan (`testbedPlan`), `TESTBED_DEFAULTS` and `TOOLCHAIN_PINS`                           |
| `packages/testbed/src/node`  | the Pulumi resources (`awsTestbed`)                                                              |
| `packages/testbed/src/cli`   | the `testbed` CLI                                                                                |
| `packages/testbed/src/agent` | the box agent (POSIX sh), installed on each box as `testbed-agent`                               |
| `packages/testbed/images`    | the job image (`job/Dockerfile`) and the host image components and files                         |
| `packages/testbed/pulumi`    | the Pulumi project the apply workflow runs, one stack per region                                 |
| `.github/workflows`          | `apply-testbed.yml` (preview, up, build-image; the owner approves each run), `testbed-image.yml` |
| `docs/runbook.md`            | the operator runbook                                                                             |
| `.agents`                    | the agent skill and the specs                                                                    |

## Operating it

The runbook is [docs/runbook.md](docs/runbook.md): how jobs run, the disk guard, replacing a box, rebuilding the
image, secrets, the fallback and cost. Changes to AWS run only from the `Apply testbed` workflow, with the owner's
approval on every run.

## Development

```sh
mise install                            # node, pnpm, shfmt, oxfmt, oxlint, gitleaks, lefthook, pulumi
mise exec lefthook -- lefthook install  # the git hooks, with no pnpm install
testbed run "<session> verify" . "pnpm install --frozen-lockfile && pnpm verify"   # on a box, never the Mac
```

The hooks (`lefthook.yml`) run only the mise-pinned oxfmt, oxlint, shfmt and gitleaks, never pnpm; commitlint runs
only where a workspace install already exists (a box), so a Mac skips it. Typecheck and tests run only on a box.

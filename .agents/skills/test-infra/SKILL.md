---
name: test-infra
description: Run heavy work on the shared testbed instead of the Mac - testbed run, status and unlock, the --json result line, exit codes 2, 73, 75 and 124, the fallback for a pushed ref and its hint, and what an agent must never do to a box. Use in any repository whose install, build, gen, typecheck, test, e2e or integration run goes to the testbed, or when a box looks stuck, full or unhealthy.
---

# The testbed

The Mac runs only oxfmt and oxlint. Everything else runs on the testbed: install, build, gen, typecheck, unit tests,
the e2e and the integration tests. The job image has Playwright's Chromium, Firefox and WebKit, `xvfb-run` for a
desktop (Electron) test that needs a display, and ffmpeg. iOS simulators and Android emulators stay on the Mac. This
holds in every repository that runs work on the testbed. The design is ADR 0484 (as amended by ADR 0522); the code
and the runbook live in figentra/testbed (`docs/runbook.md`). While the migration runs, `ci-box` is a shim with the
same verbs.

The command is `testbed`, from `@figentra/testbed`. `stackra testbed` (in `@stackra/cli`) still works, with the same
verbs, flags and exits, for one release, then goes: write `testbed` in anything new. If `testbed` is not on the PATH,
tell the leader; installing it needs a registry token only the owner sets, so never touch `~/.npmrc`.

## Run a job

```bash
testbed run "<session> <what>" <project-dir> "<command>"
```

- Name the session and what runs (`"commerce-frontend typecheck"`). `status` shows that string as the holder.
- `<project-dir>` is your worktree. Only the diff is uploaded.
- The command runs in a fresh container with a clean workspace. Nothing you leave there survives the job.
- Heavy jobs (`encore test`, `playwright`, `e2e`, `act `, `build`, or `--on-demand`) take the heavy slot. Everything
  else takes the light slot. A light job may land on a spot box. If that box is taken back, the job is retried once on
  another box.
- The exit code is the command's own: 0 is green, anything else is a real failure. Read the output.
- The testbed spans several regions. The CLI tries its enabled regions in order and starts a box where there is room,
  so you never pick a region or a box. `--regions a,b`, `--region r` or `STACKRA_TESTBED_REGIONS` overrides the list
  only for a deliberate test of one region.
- `--no-wait` returns 73 instead of waiting for a free slot.
- A tool that runs jobs (`fflow gate`) adds `--json`. The job's output then goes to stderr, and stdout gets one line:
  `{"region","box","slot","waitSeconds","runSeconds","exitCode"}`. `testbed status --json` gives each region's free,
  total and startable heavy and light slots. These lines, the verbs, the flags and the exit codes are frozen.

## Exit codes and messages

| You see                              | Means                                 | Do                                                                       |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------ |
| `every box busy, waiting`            | every slot of that kind is taken      | wait. The command adds a box after 2 minutes. Never start a second copy  |
| exit 2, "must not call ci-box"       | your command calls the testbed itself | run the inner command directly                                           |
| exit 2, a usage message              | a wrong verb or flag                  | fix the call                                                             |
| `unhealthy: disk` (the CLI moves on) | that box is draining                  | nothing. The CLI picks another box                                       |
| exit 73 (with `--no-wait`)           | no free slot right now                | retry later, or run without `--no-wait` to wait                          |
| exit 75                              | no healthy box could be reached       | a pushed ref: use the fallback below. Otherwise wait and tell the leader |
| exit 124                             | the job hit its 3-hour timeout        | split the job, or find the hang                                          |

A command that calls `ci-box`, `testbed` or `stackra testbed` is refused, because it would wait forever on the box
that holds its slot.

## Look and unstick

```bash
testbed status
testbed unlock --box N --slot heavy
testbed ip --box N
testbed ssh --box N
testbed sync --box N <dir>
testbed image
```

Only unlock a job you own, or one that `status` shows has held its slot for hours with no output. Unlocking stops its
container and the containers it started. `ssh` is for looking, never for changing a box.

## Fallback

If no box is healthy and your work is on a pushed ref:

```bash
testbed run --preset verify --ref <ref>
```

The presets are `verify`, `e2e` and `integration`. The CLI dispatches `testbed-fallback.yml` in the repository you run
it from, on a GitHub-hosted runner. A repository without that workflow has no fallback: the CLI dispatches nothing,
prints a hint saying so, and exits 75; wait for a box and tell the leader. Arbitrary commands and unpushed worktrees
have no fallback either, and nothing ever falls back to the Mac.

## Never

- Never install, patch or reconfigure anything on a box. Boxes are replaced, not repaired. A missing tool belongs in
  the image (figentra/testbed, `packages/testbed/images`), which only the owner rebuilds.
- Never free disk by hand. The guard cleans at 70% and drains the box at 85%.
- Never copy a token to a box, and never use `put-env`: it is retired. Jobs get tokens from Infisical. A missing token
  is the owner's to add.
- Never `pulumi up`, dispatch `Apply testbed` with `up` or `build-image`, mark a box unhealthy, start an instance
  refresh or change a group's size beyond `testbed scale`: those are the owner's. An agent may dispatch `preview`.
- Never request or suggest an AWS quota increase without the owner's explicit confirmation.

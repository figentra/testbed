# The box agent contract (shared by infra-testbed and `stackra testbed`)

`testbed-agent` is a POSIX sh script installed on every box at `/usr/local/bin/testbed-agent` by the AMI. The Mac
side (`stackra testbed`) only ever calls these verbs over SSH as `ubuntu`. Output is one line unless stated.

| Verb                                                                              | Prints / does                                                                                                                                                                                                                                                                                                                                                                                                         | Exit          |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `testbed-agent slot <heavy\|light>`                                               | `free`, or `busy <who>`                                                                                                                                                                                                                                                                                                                                                                                               | 0             |
| `testbed-agent health`                                                            | `healthy`, or `unhealthy: <reason>` (disk, memory, docker, postgres, google, draining, reclaim, rebalance)                                                                                                                                                                                                                                                                                                            | 0 / 1         |
| `testbed-agent status`                                                            | `heavy <free\|busy who>, light <free\|busy who> \| disk <data%>/<root%> \| <healthy\|unhealthy: r> \| ami <id> <age>d \| load <1m>`                                                                                                                                                                                                                                                                                   | 0             |
| `testbed-agent job prepare <id> <project>`                                        | creates `/data/jobs/<id>/<project>` (reflink clone of `/data/seed/<project>` when present), prints that path                                                                                                                                                                                                                                                                                                          | 0             |
| `testbed-agent job run <id> <heavy\|light> <who> <project> [--postgres] -- <cmd>` | health check (refuses with exit 75 and `unhealthy: …`), takes the slot lock (exit 73 `busy <who>`), scale-in protection on, granted secrets (`unhealthy: secrets`, exit 75), `pnpm fetch` into the shared store (one writer), fresh container, streams output, then always cleans up (containers and network by label `stackra.testbed.job=<id>`, seed refresh, `rm -rf /data/jobs/<id>`, protection off, lock freed) | the command's |
| `testbed-agent job stop <heavy\|light>`                                           | stops the slot's running job (container and labelled children); the job's cleanup then runs to the end, signals ignored; prints `stopped <who>` or `free`                                                                                                                                                                                                                                                             | 0             |
| `testbed-agent guard`                                                             | the disk guard pass (timer, every 5 min): clean at 70%, drain at 85%                                                                                                                                                                                                                                                                                                                                                  | 0             |
| `testbed-agent idle`                                                              | the idle pass (timer): terminate self and decrement desired when idle 60 min and the group is above its minimum                                                                                                                                                                                                                                                                                                       | 0             |

Exit codes reserved: 73 slot busy, 75 box unhealthy (caller picks another box), 124 job timeout (3 h). The CLI's
`run` also exits 75 at once when no enabled region answers its AWS calls (this machine's AWS access), saying why.

- The workspace is `/data/jobs/<id>/<project>`; the Mac rsyncs into it after `job prepare`.
- Secrets (ADR 0525): `/etc/testbed/grants.json` (written from the plan at boot, no value) maps a project name to a
  list of figentra/secrets scopes (core: `ci/build`, `ci/build/turbo`); the key `*` adds its scopes to every project
  (`ci/build/registry`, the registry read token), and a project with no scope runs with no value and no Google call.
  At job start the agent signs in to Google as the instance role through `/etc/testbed/google-credentials.json` (an
  external-account file for the Workload Identity provider `testbed`, no secret; `GOOGLE_APPLICATION_CREDENTIALS`),
  copies each scope's `<NAME>.enc.yaml` from `gs://figentra-secrets-ciphertext/<scope with "/" as ".">/` into a
  private folder under `/run/testbed`, decrypts each with `sops decrypt --extract '["<NAME>"]'` into its memory,
  removes the folder, and passes each value to the container as `-e <NAME>` (the name on the command line, the value
  only in the agent's environment). A name that is not SCREAMING_SNAKE or is already set refuses the job (exit 75,
  `unhealthy: secrets`). A job that gets `FIGENTRA_REGISTRY_TOKEN` (or the old `STACKRA_REGISTRY_TOKEN`) has both
  names set, and pnpm reads its repository's `.npmrc` as the auth file (`PNPM_CONFIG_NPMRC_AUTH_FILE`), so that
  file's `_authToken=${...}` line works.
- Instance tags: `stackra:testbed` = `heavy` | `light`; `Name` = `stackra-testbed-<group>`.
- Defaults the CLI also knows: AWS profile `figentra`, region `eu-west-1`, SSH user `ubuntu`, security group
  `stackra-testbed`, key file `~/.ssh/academorix-ci.pem` (key pair `academorix-ci` imported into eu-west-1).
- Command argument: `job run ... -- <cmd>` receives the command as ONE string after `--`; the agent runs it inside the
  container with `sh -c '<cmd>'`, its granted values already in the container's environment.
- Auto Scaling group names: `stackra-testbed-heavy` and `stackra-testbed-light` (the `Name` tag of an instance is
  `stackra-testbed-<group>`, the same string).

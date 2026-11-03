# Contract: testbed regions, the apply workflow and the CLI

**Spec**: `.agents/specs/sta-2042-testbed-multi-region/spec.md` · **Linear**: STA-2042

## `apply-testbed.yml` inputs

| Input       | Values                                                | Default     |
| ----------- | ----------------------------------------------------- | ----------- |
| `action`    | `preview`, `up`, `build-image` (home region only)     | `preview`   |
| `region`    | `eu-west-1`, `eu-west-2`, `eu-central-1`, `us-east-1` | `eu-west-1` |
| `groups`    | boolean                                               | `true`      |
| `heavy_min` | `0`                                                   | `0`         |
| `light_min` | `0`, `1`                                              | `0`         |

The stack is `testbed-<region>`, and the concurrency group is `apply-testbed-<region>`.

## `stackra testbed`

- **`run "<session> <what>" <dir> "<cmd>" [--json] [--no-wait] [--regions a,b] [--region r]`**
  - **Exit codes:** the job's own status, or 2 (usage), 73 (no free slot with `--no-wait`), 75 (no healthy box
    reachable), 124 (3-hour limit).
  - **Output:** with `--json`, the job's output goes to stderr unchanged, and stdout gets exactly one line:
    `{"region":"eu-west-1","box":"i-…","slot":"heavy","waitSeconds":12,"runSeconds":431,"exitCode":0}`
- **`status [--json]`**. With `--json`:
  `{"regions":[{"region":"eu-west-1","reachable":true,"heavy":{"free":1,"total":1,"startable":0},"light":{"free":2,"total":2,"startable":1},"boxes":[{"id":"i-…","kind":"heavy","healthy":true,"slots":{"heavy":"free","light":"busy"}}]}]}`
- **`scale [--region r] [--slot heavy|light]`** and **`unlock [--box id] [--region r] [--slot …]`**: the region
  defaults to the named box's region, otherwise the first enabled one.
- **Environment:** `STACKRA_TESTBED_REGIONS` (comma-separated, ordered).

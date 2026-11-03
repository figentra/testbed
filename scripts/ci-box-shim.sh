#!/bin/sh
# Stackra file contract:
# Purpose: install as `~/.local/bin/ci-box`: maps the old `ci-box run|status|unlock|ip|ssh|sync` calls to
#          `stackra testbed ...` so every session keeps working during the migration (plan.md phases 5 and 6). `run`
#          passes `--no-wait`; when it exits 75 (no healthy testbed box) the call goes to the old script, kept as
#          `~/.local/bin/ci-box.legacy`. `put-env` is retired: tokens come from Infisical.
# Boundary: POSIX sh; starts only `stackra` and the legacy script; reads and prints no secret. Deleted with the legacy
#           script at phase 7.
# Runtime: sh
# Governing contract: ADR 0484 (the testbed); STA-1626.
set -u
LEGACY="${CI_BOX_LEGACY:-$HOME/.local/bin/ci-box.legacy}"
box=
if [ "${1:-}" = -b ]; then
  box=${2:?ci-box: -b needs a box number}
  shift 2
fi
verb=${1:-}
[ $# -gt 0 ] && shift
case "$verb" in
  run)
    stackra testbed run --no-wait "$@"
    code=$?
    # shortcut: a job command that itself exits 75 also falls back; accepted until the shim is deleted at phase 7.
    if [ "$code" -eq 75 ] && [ -x "$LEGACY" ]; then
      echo "ci-box: no healthy testbed box, using the legacy boxes" >&2
      exec "$LEGACY" run "$@"
    fi
    exit "$code"
    ;;
  status) exec stackra testbed status ;;
  unlock | ip | sync)
    if [ -n "$box" ]; then exec stackra testbed "$verb" --box "$box" "$@"; fi
    exec stackra testbed "$verb" "$@"
    ;;
  ssh)
    if [ -n "$box" ]; then set -- --box "$box" -- "$@"; elif [ $# -gt 0 ]; then set -- -- "$@"; fi
    exec stackra testbed ssh "$@"
    ;;
  put-env)
    echo "ci-box: put-env is retired; testbed jobs get their tokens from Infisical (ADR 0484)" >&2
    exit 2
    ;;
  *)
    echo 'usage: ci-box run "<session> <what>" <dir> "<cmd>" | status | [-b N] unlock|ip|ssh [cmd]|sync <dir>' >&2
    exit 1
    ;;
esac

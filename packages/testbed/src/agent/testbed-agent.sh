#!/bin/sh
# Stackra file contract:
# Purpose: testbed-agent, the box agent of the testbed: `slot`, `health`, `status`, `job prepare|run|stop`, `guard` and
#          `idle` (the verbs, exit codes, paths and tags of .agents/specs/sta-1626-testbed/agent-contract.md). A job
#          runs in a fresh container from the job image, in /data/jobs/<id>/<project>, under scale-in protection, with
#          a short-lived Infisical token for the paths its project is granted (plus the `*` grants every project gets,
#          the registry read token) and nothing else; cleanup always runs.
# Boundary: POSIX sh plus jq, rsync, flock and GNU coreutils; installed by the AMI at /usr/local/bin/testbed-agent. It
#           reads /etc/testbed/grants.json (ids and paths) and /etc/testbed/identity (an id). The Infisical token lives
#           in one shell variable and reaches the container by `-e INFISICAL_TOKEN` (the name, never the value on a
#           command line); no value is written to a disk or printed. Every path and tool is overridable by
#           TESTBED_* variables so the unit tests can run it against stubs.
# Runtime: box (Ubuntu 24.04 AMI built by infra-testbed)
# Governing contract: ADR 0484 (decisions 4 to 7, 9, 10); ADR 0173; the box agent contract of STA-1626.
set -u

DATA=${TESTBED_DATA_DIR:-/data}
ROOT=${TESTBED_ROOT_DIR:-/}
STATE=${TESTBED_STATE_DIR:-/run/testbed}
ETC=${TESTBED_ETC_DIR:-/etc/testbed}
IMAGE=${TESTBED_IMAGE:-stackra-testbed-job:current}
# The Infisical CLI defaults to the US cloud; ours is Infisical Cloud EU (.infisical.yaml).
INFISICAL_DOMAIN=${INFISICAL_DOMAIN:-https://eu.infisical.com}
export INFISICAL_DOMAIN
PG_IMAGE=${TESTBED_POSTGRES_IMAGE:-postgres:17.6-alpine}
STORE=${TESTBED_STORE:-$DATA/pnpm-store}
# pnpm's metadata cache: the release-age check reads it even for a lockfile install (the image warms it beside the store).
PNPM_CACHE=${TESTBED_PNPM_CACHE:-$DATA/pnpm-cache}
CLEAN_PCT=${TESTBED_CLEAN_PCT:-70}
DRAIN_PCT=${TESTBED_DRAIN_PCT:-85}
ROOT_MIN_GB=${TESTBED_ROOT_MIN_FREE_GB:-10}
SEED_DAYS=${TESTBED_SEED_DAYS:-7}
TURBO_GB=${TESTBED_TURBO_LIMIT_GB:-20}
IDLE_MIN=${TESTBED_IDLE_MINUTES:-60}
TIMEOUT=${TESTBED_TIMEOUT:-10800}
MIN_MEM_MB=${TESTBED_MIN_MEM_MB:-1024}
MEMINFO=${TESTBED_MEMINFO:-/proc/meminfo}
LABEL=stackra.testbed.job
# What the Mac's rsync leaves out; the seed refresh leaves out the same.
EXCLUDES='node_modules .git .claude/worktrees .env* *.secrets.local.cue .mcp.json .turbo dist .next .cache'
# The registry read token (FIGENTRA_REGISTRY_TOKEN; STACKRA_REGISTRY_TOKEN until the registry move retires it) under
# both names, and the repository's own .npmrc as pnpm's auth file: pnpm 12 expands no variable in a project .npmrc,
# so its `_authToken=${...}` line is ignored otherwise. The token stays in the environment, never in a file; every
# project a box runs is ours (ADR 0484). Run in the directory whose .npmrc names the registry.
REGISTRY_AUTH='t=${FIGENTRA_REGISTRY_TOKEN:-${STACKRA_REGISTRY_TOKEN:-}}; if [ -n "$t" ] && [ -f "$PWD/.npmrc" ]; then FIGENTRA_REGISTRY_TOKEN=$t STACKRA_REGISTRY_TOKEN=$t PNPM_CONFIG_NPMRC_AUTH_FILE=$PWD/.npmrc; export FIGENTRA_REGISTRY_TOKEN STACKRA_REGISTRY_TOKEN PNPM_CONFIG_NPMRC_AUTH_FILE; fi; unset t'
# The host's mise lives in /opt/mise (01-base.yml); its shims find the tools only through these two variables.
MISE_DATA_DIR=${MISE_DATA_DIR:-/opt/mise}
MISE_GLOBAL_CONFIG_FILE=${MISE_GLOBAL_CONFIG_FILE:-/opt/mise/config.toml}
export MISE_DATA_DIR MISE_GLOBAL_CONFIG_FILE
# Overridable so the unit tests' stubs win inside the job container, whose own /opt/mise holds the real tools.
PATH=${TESTBED_MISE_SHIMS:-/opt/mise/shims}:$PATH
TAB=$(printf '\t')
NL=$(printf '\n_')
NL=${NL%_}

say() { printf '%s\n' "$*"; }
usage() {
  say "usage: testbed-agent slot <heavy|light> | health | status | guard | idle | job prepare <id> <project> | job run <id> <heavy|light> <who> <project> [--postgres] -- <cmd> | job stop <heavy|light>" >&2
  exit 2
}

# A name that reaches a path or a command word: letters, digits, dot, dash, underscore.
safe_name() { case $1 in '' | *[!A-Za-z0-9._-]*) return 1 ;; esac }
# Single-quote a string for sh.
sq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

pct() { df -P "$1" | awk 'NR==2 { gsub("%", "", $5); print $5 }'; }
free_gb() { df -Pk "$1" | awk 'NR==2 { print int($4 / 1048576) }'; }

imds() {
  token=$(curl -sS -m 2 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token) || return 1
  curl -fsS -m 2 -H "X-aws-ec2-metadata-token: $token" "http://169.254.169.254/latest/meta-data/$1"
}
# A spot box AWS is about to reclaim (interruption notice) or recommends replacing (rebalance) takes no new job, so the
# caller gets exit 75 and picks another box. Both paths answer 404 on an on-demand box.
reclaim_notice() {
  if imds spot/instance-action >/dev/null 2>&1; then
    say reclaim
  elif imds events/recommendations/rebalance >/dev/null 2>&1; then
    say rebalance
  else
    return 1
  fi
}
instance_id() { if [ -n "${TESTBED_INSTANCE_ID:-}" ]; then say "$TESTBED_INSTANCE_ID"; else imds instance-id; fi; }
region() {
  if [ -n "${TESTBED_REGION:-}" ]; then
    say "$TESTBED_REGION"
  elif [ -r "$ETC/region" ]; then
    cat "$ETC/region"
  else
    say eu-west-1
  fi
}
awsc() { aws --region "$(region)" "$@"; }
asg_name() {
  awsc autoscaling describe-auto-scaling-instances --instance-ids "$(instance_id)" \
    --query 'AutoScalingInstances[0].AutoScalingGroupName' --output text
}

# ---- slots -----------------------------------------------------------------------------------------------------

slot_dir() { say "$STATE/slot-$1"; }
# Prints who holds the slot and returns 0 when its holder is alive; clears a stale slot and returns 1 otherwise.
slot_holder() {
  d=$(slot_dir "$1")
  [ -d "$d" ] || return 1
  holder=$(cat "$d/pid" 2>/dev/null || true)
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    cat "$d/who" 2>/dev/null || say unknown
    return 0
  fi
  rm -rf "$d"
  return 1
}
slot_state() {
  if holder=$(slot_holder "$1"); then say "busy $holder"; else say free; fi
}
any_busy() { slot_holder heavy >/dev/null || slot_holder light >/dev/null; }
active_jobs() {
  for d in "$STATE"/slot-*; do
    [ -f "$d/job" ] && printf '%s ' "$(cat "$d/job")"
  done
  return 0
}
# shortcut: pid is written just after mkdir, so a reader in that instant treats the slot as stale; the Mac claim
# serialises callers per slot, so it does not happen in practice.
take_slot() {
  mkdir -p "$STATE"
  d=$(slot_dir "$1")
  if ! mkdir "$d" 2>/dev/null; then
    if holder=$(slot_holder "$1"); then
      say "busy $holder"
      return 1
    fi
    mkdir "$d" 2>/dev/null || {
      say "busy unknown"
      return 1
    }
  fi
  printf '%s\n' "$$" >"$d/pid"
  printf '%s\n' "$2" >"$d/who"
  printf '%s\n' "$3" >"$d/job"
}

protect() {
  group=$(asg_name 2>/dev/null) || return 1
  [ -n "$group" ] && [ "$group" != None ] || return 1
  if [ "$1" = on ]; then flag=--protected-from-scale-in; else flag=--no-protected-from-scale-in; fi
  awsc autoscaling set-instance-protection --instance-ids "$(instance_id)" \
    --auto-scaling-group-name "$group" "$flag" >/dev/null 2>&1
}

# ---- health ----------------------------------------------------------------------------------------------------

grants_for() {
  [ -s "$ETC/grants.json" ] || return 0
  jq -r --arg p "$1" '(.[$p] // []) + (.["*"] // []) | .[] | [.projectId, .environment, .path] | @tsv' "$ETC/grants.json"
}
has_grants() { [ -s "$ETC/grants.json" ] && jq -e 'map(length) | add > 0' "$ETC/grants.json" >/dev/null 2>&1; }
infisical_token() {
  infisical login --method=aws-iam --machine-identity-id="$(cat "$ETC/identity")" --silent --plain
}

# Prints the first failing reason and returns 1. $1=1 also checks that an Infisical token is issued.
health_check() {
  if [ -e "$STATE/draining" ]; then
    say draining
    return 1
  fi
  if reclaim_notice; then return 1; fi
  data=$(pct "$DATA")
  rootfree=$(free_gb "$ROOT")
  if [ "${data:-100}" -ge "$DRAIN_PCT" ] || [ "${rootfree:-0}" -lt "$ROOT_MIN_GB" ]; then
    say disk
    return 1
  fi
  mem=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' "$MEMINFO")
  if [ "${mem:-0}" -lt "$MIN_MEM_MB" ]; then
    say memory
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    say docker
    return 1
  fi
  if [ "${1:-0}" = 1 ]; then
    if ! docker run --rm --entrypoint pg_isready "$PG_IMAGE" --version >/dev/null 2>&1; then
      say postgres
      return 1
    fi
    if has_grants && [ -s "$ETC/identity" ] && [ -z "$(infisical_token 2>/dev/null)" ]; then
      say infisical
      return 1
    fi
  fi
  return 0
}

cmd_health() {
  if reason=$(health_check 1); then
    say healthy
  else
    say "unhealthy: $reason"
    exit 1
  fi
}

ami_line() {
  id=${TESTBED_AMI_ID:-$(imds ami-id 2>/dev/null || true)}
  [ -n "$id" ] || {
    say "ami unknown"
    return 0
  }
  created=$(awsc ec2 describe-images --image-ids "$id" --query 'Images[0].CreationDate' --output text 2>/dev/null || true)
  case $created in
    20*) say "ami $id $((($(date +%s) - $(date -d "$created" +%s)) / 86400))d" ;;
    *) say "ami $id ?d" ;;
  esac
}

cmd_status() {
  if reason=$(health_check 0); then health=healthy; else health="unhealthy: $reason"; fi
  load=$(awk '{ print $1 }' "${TESTBED_LOADAVG:-/proc/loadavg}" 2>/dev/null || true)
  say "heavy $(slot_state heavy), light $(slot_state light) | disk $(pct "$DATA")/$(pct "$ROOT") | $health | $(ami_line) | load ${load:-?}"
}

# ---- guard and idle --------------------------------------------------------------------------------------------

turbo_trim() {
  dir=$DATA/turbo-cache
  [ -d "$dir" ] || return 0
  limit=$((TURBO_GB * 1048576))
  while [ "$(du -sk "$dir" | cut -f1)" -gt "$limit" ]; do
    oldest=$(find "$dir" -type f -printf '%T@ %p\n' | sort -n | head -n 200 | cut -d' ' -f2-)
    [ -n "$oldest" ] || break
    printf '%s\n' "$oldest" | while IFS= read -r file; do rm -f "$file"; done
  done
}

clean_up() {
  active=" $(active_jobs)"
  for dir in "$DATA"/jobs/*; do
    [ -d "$dir" ] || continue
    case $active in *" ${dir##*/} "*) continue ;; esac
    rm -rf "$dir"
  done
  docker container prune -f >/dev/null 2>&1 || true
  docker network prune -f >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  if [ -d "$DATA/seed" ]; then
    find "$DATA/seed" -mindepth 2 -maxdepth 2 -name .testbed-used -mtime "+$SEED_DAYS" | while IFS= read -r marker; do
      rm -rf "$(dirname "$marker")"
    done
  fi
  turbo_trim
}

disk_bad() {
  data=$(pct "$DATA")
  rootfree=$(free_gb "$ROOT")
  [ "${data:-100}" -ge "$DRAIN_PCT" ] || [ "${rootfree:-0}" -lt "$ROOT_MIN_GB" ]
}

cmd_guard() {
  mkdir -p "$STATE"
  data=$(pct "$DATA")
  rootfree=$(free_gb "$ROOT")
  if [ "${data:-100}" -ge "$CLEAN_PCT" ] || [ "${rootfree:-0}" -lt "$ROOT_MIN_GB" ]; then
    clean_up
  fi
  if disk_bad; then
    : >"$STATE/draining"
  elif [ "$(pct "$DATA")" -lt "$CLEAN_PCT" ]; then
    rm -f "$STATE/draining"
  fi
  # A draining box that has no job left asks its group to replace it; a running job is never touched.
  if [ -e "$STATE/draining" ] && ! any_busy; then
    awsc autoscaling set-instance-health --instance-id "$(instance_id)" --health-status Unhealthy >/dev/null 2>&1 || true
  fi
  return 0
}

cmd_idle() {
  mkdir -p "$STATE"
  if any_busy; then
    touch "$STATE/last-job"
    return 0
  fi
  if [ ! -e "$STATE/last-job" ]; then
    touch "$STATE/last-job"
    return 0
  fi
  idle=$((($(date +%s) - $(stat -c %Y "$STATE/last-job")) / 60))
  [ "$idle" -ge "$IDLE_MIN" ] || return 0
  group=$(asg_name 2>/dev/null) || return 0
  [ -n "$group" ] && [ "$group" != None ] || return 0
  # shellcheck disable=SC2046
  set -- $(awsc autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$group" \
    --query 'AutoScalingGroups[0].[MinSize,DesiredCapacity]' --output text)
  [ "${2:-0}" -gt "${1:-0}" ] || return 0
  awsc autoscaling terminate-instance-in-auto-scaling-group --instance-id "$(instance_id)" \
    --should-decrement-desired-capacity >/dev/null
}

# ---- jobs ------------------------------------------------------------------------------------------------------

cmd_job_prepare() {
  [ $# -eq 2 ] || usage
  safe_name "$1" && safe_name "$2" || usage
  ws=$DATA/jobs/$1/$2
  mkdir -p "$ws"
  seed=$DATA/seed/$2
  if [ -d "$seed" ]; then
    cp -a --reflink=auto "$seed/." "$ws/"
    rm -f "$ws/.testbed-used"
    touch "$seed/.testbed-used"
  fi
  say "$ws"
}

refresh_seed() {
  project=$1
  ws=$2
  seed=$DATA/seed/$project
  mkdir -p "$seed"
  set -f
  set --
  for pattern in $EXCLUDES .testbed-used; do set -- "$@" --exclude "$pattern"; done
  set +f
  flock "$STATE/seed-$project.lock" rsync -a --delete "$@" "$ws/" "$seed/" >/dev/null 2>&1 || true
  touch "$seed/.testbed-used"
}

finish() {
  rc=$1
  if [ "$JOB_DONE" = 1 ]; then exit "$rc"; fi
  JOB_DONE=1
  # `job stop` signals the agent right after it removes the container, so cleanup usually starts first: a signal now
  # must not cut it short and leave the workspace and the scale-in protection behind (seen live, 2026-11-05).
  trap - EXIT
  trap '' TERM INT HUP
  ids=$(docker ps -aq --filter "label=$LABEL=$JOB_ID" 2>/dev/null || true)
  # shellcheck disable=SC2086
  [ -z "$ids" ] || docker rm -f $ids >/dev/null 2>&1 || true
  docker network rm "tb-$JOB_ID" >/dev/null 2>&1 || true
  if [ "$JOB_RAN" = 1 ]; then refresh_seed "$JOB_PROJECT" "$JOB_WS"; fi
  rm -rf "${DATA:?}/jobs/$JOB_ID"
  if [ "$HAVE_SLOT" = 1 ]; then
    rm -rf "$(slot_dir "$JOB_KIND")"
    touch "$STATE/last-job"
  fi
  if [ "$PROTECTED" = 1 ] && ! any_busy; then protect off || true; fi
  cmd_guard >/dev/null 2>&1 || true
  exit "$rc"
}

cmd_job_run() {
  [ $# -ge 6 ] || usage
  JOB_ID=$1 JOB_KIND=$2 who=$3 JOB_PROJECT=$4
  shift 4
  safe_name "$JOB_ID" && safe_name "$JOB_PROJECT" || usage
  case $JOB_KIND in heavy | light) ;; *) usage ;; esac
  postgres=0
  if [ "${1:-}" = --postgres ]; then
    postgres=1
    shift
  fi
  [ "${1:-}" = -- ] || usage
  shift
  command_text=$*
  JOB_WS=$DATA/jobs/$JOB_ID/$JOB_PROJECT JOB_DONE=0 JOB_RAN=0 HAVE_SLOT=0 PROTECTED=0
  trap 'finish "$?"' EXIT
  trap 'exit 143' TERM INT HUP

  if ! reason=$(health_check 0); then
    say "unhealthy: $reason"
    exit 75
  fi
  if ! taken=$(take_slot "$JOB_KIND" "$who" "$JOB_ID"); then
    say "$taken"
    exit 73
  fi
  HAVE_SLOT=1
  PROTECTED=1
  if ! protect on; then
    say "unhealthy: protection"
    exit 75
  fi

  # The token: one shell variable, handed to the container by name. No grant, no token.
  grants=$(grants_for "$JOB_PROJECT")
  if [ -n "$grants" ]; then
    if [ ! -s "$ETC/identity" ] || ! INFISICAL_TOKEN=$(infisical_token) || [ -z "$INFISICAL_TOKEN" ]; then
      say "unhealthy: infisical"
      exit 75
    fi
    export INFISICAL_TOKEN
  fi
  wrap() {
    wrapped=$1
    while IFS="$TAB" read -r project_id environment path; do
      [ -n "$project_id" ] || continue
      case "$project_id$environment$path" in *[!A-Za-z0-9/_.:@-]*) return 1 ;; esac
      wrapped="infisical run --silent --projectId $project_id --env $environment --path $path -- $wrapped"
    done <<EOF
$grants
EOF
  }

  # A fresh one-commit snapshot of the synced tree, as ci-box made: `.git` is never uploaded (a worktree's is a file
  # pointing at the Mac), and git-based steps (`git ls-files` in format:check, oxfmt, knip) need a real repository.
  (cd "$JOB_WS" && rm -rf .git && git init -q && git add -A >/dev/null 2>&1 \
    && git -c user.name=testbed -c user.email=testbed@localhost commit -qm snapshot >/dev/null 2>&1) || true

  [ ! -f "$JOB_WS/services/encore.app" ] \
    || sed -i -E 's/"id":[[:space:]]*"[^"]*"/"id": ""/' "$JOB_WS/services/encore.app" || true

  # The fetch fills the shared store before the job, from a copy of the files it reads: run in the workspace it would
  # leave a node_modules that makes the container skip its install, and load the job's mise.toml on the host. No
  # scripts: the container's install runs them.
  mkdir -p "$STORE" "$PNPM_CACHE" "$DATA/turbo-cache"
  export PNPM_CONFIG_CACHE_DIR="$PNPM_CACHE"
  if [ -f "$JOB_WS/pnpm-lock.yaml" ]; then
    wrap "sh -c $(sq "$REGISTRY_AUTH; exec pnpm fetch --ignore-scripts --store-dir $(sq "$STORE")")" || {
      say "unhealthy: grants"
      exit 75
    }
    fetch_dir=$DATA/jobs/$JOB_ID/.fetch
    mkdir -p "$fetch_dir"
    for f in pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.mjs .pnpmfile.cjs .npmrc; do
      [ ! -f "$JOB_WS/$f" ] || cp "$JOB_WS/$f" "$fetch_dir/"
    done
    (cd "$fetch_dir" && flock "$STATE/store.lock" sh -c "$wrapped") || say "testbed-agent: pnpm fetch failed, the job installs what it can" >&2
    rm -rf "$fetch_dir"
  fi

  docker network create --label "$LABEL=$JOB_ID" "tb-$JOB_ID" >/dev/null || exit 75
  if [ "$postgres" = 1 ]; then
    docker run -d --rm --name "tb-$JOB_ID-pg" --label "$LABEL=$JOB_ID" --network "tb-$JOB_ID" \
      --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust "$PG_IMAGE" >/dev/null || exit 75
    tries=0
    until docker exec "tb-$JOB_ID-pg" pg_isready -q 2>/dev/null; do
      tries=$((tries + 1))
      [ "$tries" -lt 30 ] || {
        say "unhealthy: postgres"
        exit 75
      }
      sleep 1
    done
  fi

  # Uniwind Pro (ADR 0310 d11) downloads its licensed build in its postinstall, against a monthly CI quota; it reuses
  # a checksum-verified tarball from UNIWIND_CACHE_DIR, kept in the box's pnpm cache so one download serves every job.
  # Prefer offline, not offline only: a package or metadata entry the store lacks is fetched instead of failing the job.
  # The store is mounted writable for that (pnpm's store is made for concurrent installs); testbed-image.yml reports
  # whether a read-only mount could serve an install at all. Integrity checks stay on, so a file one job left changed
  # in the shared store fails the next job's install against the lockfile's hashes.
  # A repository can narrow the install with pnpm flags in .testbed/install-args (core leaves out the two Uniwind Pro
  # members, whose licensed download has a monthly quota); the words are the repository's own, like its command.
  inner="cd /work && { $REGISTRY_AUTH; } && { [ -d node_modules ] || pnpm install --prefer-offline --frozen-lockfile --store-dir /pnpm-store --package-import-method clone-or-copy \$(cat .testbed/install-args 2>/dev/null); } && {$NL$command_text$NL}"
  wrap "sh -c $(sq "$inner")" || {
    say "unhealthy: grants"
    exit 75
  }
  set -- --rm --init --name "tb-$JOB_ID" --label "$LABEL=$JOB_ID" --network "tb-$JOB_ID" \
    -v "$JOB_WS:/work" -v "$STORE:/pnpm-store" -v "$PNPM_CACHE:/pnpm-cache" -v "$DATA/turbo-cache:/turbo-cache" \
    -v /var/run/docker.sock:/var/run/docker.sock --group-add "$(stat -c %g /var/run/docker.sock 2>/dev/null || echo 0)" \
    -e TURBO_CACHE_DIR=/turbo-cache -e PNPM_CONFIG_CACHE_DIR=/pnpm-cache -e PNPM_CONFIG_VERIFY_STORE_INTEGRITY=true \
    -e UNIWIND_CACHE_DIR=/pnpm-cache/uniwind \
    -e CI=true -e "TESTBED_JOB=$JOB_ID"
  [ "$postgres" = 0 ] || set -- "$@" -e "TESTBED_POSTGRES_HOST=tb-$JOB_ID-pg"
  [ -z "${INFISICAL_TOKEN:-}" ] || set -- "$@" -e INFISICAL_TOKEN -e INFISICAL_DOMAIN
  JOB_RAN=1
  timeout "$TIMEOUT" docker run "$@" "$IMAGE" sh -c "$wrapped"
  finish "$?"
}

cmd_job_stop() {
  case ${1:-} in heavy | light) ;; *) usage ;; esac
  if holder=$(slot_holder "$1"); then
    d=$(slot_dir "$1")
    id=$(cat "$d/job" 2>/dev/null || true)
    pid=$(cat "$d/pid" 2>/dev/null || true)
    ids=$(docker ps -aq --filter "label=$LABEL=$id" 2>/dev/null || true)
    # shellcheck disable=SC2086
    [ -z "$ids" ] || docker rm -f $ids >/dev/null 2>&1 || true
    [ -z "$pid" ] || { pkill -TERM -P "$pid" 2>/dev/null || true; }
    [ -z "$pid" ] || kill -TERM "$pid" 2>/dev/null || true
    say "stopped $holder"
  else
    say free
  fi
}

case ${1:-} in
  slot)
    case ${2:-} in heavy | light) slot_state "$2" ;; *) usage ;; esac
    ;;
  health) cmd_health ;;
  status) cmd_status ;;
  guard) cmd_guard ;;
  idle) cmd_idle ;;
  job)
    verb=${2:-}
    [ $# -ge 2 ] || usage
    shift 2
    case $verb in
      prepare) cmd_job_prepare "$@" ;;
      run) cmd_job_run "$@" ;;
      stop) cmd_job_stop "$@" ;;
      *) usage ;;
    esac
    ;;
  *) usage ;;
esac

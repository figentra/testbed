/**
 * Testbed file contract:
 * Purpose: unit tests of `testbed-agent.sh` against stubbed docker, aws, gcloud, sops, pnpm and df on PATH: the 70%
 *          cleanup (finished job folders, stale seeds, dangling images), the 85% refusal (exit 75, `unhealthy: disk`)
 *          and the drain (an unhealthy mark only with no job running), a busy slot (exit 73), cleanup and scale-in
 *          protection released after a failing job, each granted scope's values reaching the container by name and
 *          never by a command line, the ciphertext folder removed, a name that would shadow a variable refused, a
 *          project without grants getting no value, the Google health check, seed clone and seed refresh, and the
 *          idle stop above the group's minimum only; a spot reclaim or rebalance notice refusing new jobs (exit 75).
 * Boundary: test only; every path is a temp folder and every tool a stub, so no cloud, container or secret is
 *           touched. The agent needs `sh`, `jq`, `rsync`, `flock`, GNU `find`, `stat`, `cp` and `timeout`, so this runs
 *           on a Linux box (the AMI build and the tester's box), never on the Mac.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484 (Enforcement: the agent tests); ADR 0173.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TESTBED_DEFAULTS } from "#core/constants/testbed-defaults.constant";

const AGENT = fileURLToPath(new URL("../testbed-agent.sh", import.meta.url));
const TOKEN = "s3cr3t-token-value";

let root: string;
let log: string;

const dir = (name: string): string => join(root, name);

function stub(name: string, body: string): void {
  mkdirSync(dir("bin"), { recursive: true });
  writeFileSync(join(dir("bin"), name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(dir("bin"), name), 0o755);
}

// A box job runs these tests with core's granted values in its environment: the agent under test must never inherit
// one, or a failing assertion prints it.
const inherited = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !/TOKEN|SECRET|PASSWORD|_KEY$/.test(name)),
) as Record<string, string>;

function env(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...inherited,
    PATH: `${dir("bin")}:${process.env.PATH ?? ""}`,
    TESTBED_DATA_DIR: dir("data"),
    TESTBED_ROOT_DIR: dir("rootfs"),
    TESTBED_STATE_DIR: dir("state"),
    TESTBED_ETC_DIR: dir("etc"),
    TESTBED_MEMINFO: dir("meminfo"),
    TESTBED_LOADAVG: dir("loadavg"),
    TESTBED_INSTANCE_ID: "i-test",
    TESTBED_AMI_ID: "ami-test",
    TESTBED_REGION: "eu-west-1",
    // The job container has the real pnpm under /opt/mise/shims; the stubs must win there too.
    TESTBED_MISE_SHIMS: dir("bin"),
    FAKE_LOG: log,
    FAKE_DF_DATA: "10",
    FAKE_DF_ROOT: "20",
    ...extra,
  };
}

function agent(args: string[], extra: Record<string, string> = {}) {
  const run = spawnSync("sh", [AGENT, ...args], { env: env(extra), encoding: "utf8" });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

function logged(): string {
  return existsSync(log) ? readFileSync(log, "utf8") : "";
}

/** The agent's private folders (ciphertext, gcloud state) left in its state directory. */
function leftovers(): string[] {
  return readdirSync(dir("state")).filter((name) => /^(secrets|gcloud)\./.test(name));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "testbed-agent-"));
  log = dir("calls.log");
  for (const name of ["data", "rootfs", "state", "etc"]) mkdirSync(dir(name), { recursive: true });
  writeFileSync(dir("meminfo"), "MemAvailable:   8000000 kB\n");
  writeFileSync(dir("loadavg"), "0.50 0.40 0.30 1/100 1\n");
  writeFileSync(dir("etc/grants.json"), JSON.stringify({ core: ["ci/build/turbo"] }));
  stub(
    "df",
    `for a; do d=$a; done
if [ "$d" = "$TESTBED_DATA_DIR" ]; then pct=$FAKE_DF_DATA; kb=100000000; else pct=$FAKE_DF_ROOT; kb=50000000; fi
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "x 1 1 $kb \${pct}% $d"`,
  );
  stub(
    "docker",
    `echo "docker $*" >> "$FAKE_LOG"
case "$1" in
  run) case "$*" in *stackra-testbed-job*) echo "TURBO_TOKEN=\${TURBO_TOKEN:-} FIGENTRA_REGISTRY_TOKEN=\${FIGENTRA_REGISTRY_TOKEN:-}" >> "$FAKE_LOG.env"; echo "job output"; exit "\${FAKE_RUN_RC:-0}" ;; esac ;;
esac
exit 0`,
  );
  stub(
    "aws",
    `echo "aws $*" >> "$FAKE_LOG"
case "$*" in
  *describe-auto-scaling-instances*) echo stackra-testbed-heavy ;;
  *describe-auto-scaling-groups*) printf '%s\\n' "\${FAKE_ASG_COUNTS:-1 3}" ;;
esac
exit 0`,
  );
  // gcloud: a token on stdout (unless Google is down), and one fake ciphertext file per scope's names.
  stub(
    "gcloud",
    `echo "gcloud $* (config $CLOUDSDK_CONFIG, credentials $CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE)" >> "$FAKE_LOG"
case "$1 $2" in
  "auth print-access-token") [ -z "\${FAKE_GOOGLE_DOWN:-}" ] || exit 1; echo ${TOKEN} ;;
  "storage cp")
    prefix=\${3#gs://*/}
    case \${prefix%%/*} in
      ci.build.turbo) names=TURBO_TOKEN ;;
      ci.build.registry) names=FIGENTRA_REGISTRY_TOKEN ;;
      *) names=\${FAKE_NAMES:-UNIWIND_AUTH_TOKEN} ;;
    esac
    for n in $names; do echo ciphertext > "$4$n.enc.yaml"; done ;;
esac`,
  );
  // sops: the file must be there; its value is the token followed by the file's name.
  stub(
    "sops",
    `echo "sops $* (credentials $GOOGLE_APPLICATION_CREDENTIALS)" >> "$FAKE_LOG"
for f; do :; done
[ -f "$f" ] || exit 1
name=\${f##*/}
echo "${TOKEN}-\${name%.enc.yaml}"`,
  );
  stub("pnpm", `echo "pnpm $* (in $PWD)" >> "$FAKE_LOG"`);
  // IMDS: a token always; the spot notices only when the test sets them (404, so curl -f fails, otherwise).
  stub(
    "curl",
    `case "$*" in
  *api/token*) echo imds-token ;;
  *spot/instance-action*) [ -n "\${FAKE_SPOT:-}" ] || exit 22; echo '{"action":"stop"}' ;;
  *recommendations/rebalance*) [ -n "\${FAKE_REBALANCE:-}" ] || exit 22; echo '{"noticeTime":"now"}' ;;
  *) exit 22 ;;
esac`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("testbed-agent excludes", () => {
  it("leaves out the contract's rsync excludes, and keeps the repository's own folders", () => {
    const excludes = /^EXCLUDES='([^']*)'/m.exec(readFileSync(AGENT, "utf8"))?.[1]?.split(" ");
    expect(excludes).toEqual([...TESTBED_DEFAULTS.rsyncExcludes]);
    // `pnpm validate` reads .agents (specs, hooks, rules, skills); a job without it fails.
    for (const kept of [".agents", ".github", ".flow"]) {
      expect(TESTBED_DEFAULTS.rsyncExcludes).not.toContain(kept);
    }
  });

  it("reads the contract's ciphertext bucket", () => {
    expect(readFileSync(AGENT, "utf8")).toContain(
      `SECRETS_BUCKET=\${TESTBED_SECRETS_BUCKET:-${TESTBED_DEFAULTS.secretsBucket}}`,
    );
  });
});

describe("testbed-agent guard", () => {
  it("cleans up at 70%: finished job folders, stale seeds, dangling images", () => {
    mkdirSync(dir("data/jobs/finished/p"), { recursive: true });
    mkdirSync(dir("data/seed/old"), { recursive: true });
    mkdirSync(dir("data/seed/fresh"), { recursive: true });
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400 * 1000);
    writeFileSync(dir("data/seed/old/.testbed-used"), "");
    utimesSync(dir("data/seed/old/.testbed-used"), tenDaysAgo, tenDaysAgo);
    writeFileSync(dir("data/seed/fresh/.testbed-used"), "");

    const run = agent(["guard"], { FAKE_DF_DATA: "72" });

    expect(run.code).toBe(0);
    expect(existsSync(dir("data/jobs/finished"))).toBe(false);
    expect(existsSync(dir("data/seed/old"))).toBe(false);
    expect(existsSync(dir("data/seed/fresh"))).toBe(true);
    expect(logged()).toContain("docker container prune");
    expect(logged()).toContain("docker image prune");
    expect(logged()).not.toContain("set-instance-health");
  });

  it("does nothing under 70%", () => {
    mkdirSync(dir("data/jobs/finished/p"), { recursive: true });
    agent(["guard"], { FAKE_DF_DATA: "40" });
    expect(existsSync(dir("data/jobs/finished"))).toBe(true);
    expect(logged()).not.toContain("prune");
  });

  it("drains at 85%: marks itself unhealthy once no job is running, and refuses jobs", () => {
    const run = agent(["guard"], { FAKE_DF_DATA: "90" });
    expect(run.code).toBe(0);
    expect(existsSync(dir("state/draining"))).toBe(true);
    expect(logged()).toMatch(/set-instance-health --instance-id i-test --health-status Unhealthy/);

    const job = agent(["job", "run", "j1", "light", "me", "core", "--", "true"], {
      FAKE_DF_DATA: "90",
    });
    expect(job.code).toBe(75);
    expect(job.out).toContain("unhealthy:");
  });

  it("waits for a running job before marking itself unhealthy", () => {
    const holder = spawn("sleep", ["30"]);
    try {
      mkdirSync(dir("state/slot-heavy"), { recursive: true });
      writeFileSync(dir("state/slot-heavy/pid"), `${holder.pid}\n`);
      writeFileSync(dir("state/slot-heavy/who"), "someone\n");
      writeFileSync(dir("state/slot-heavy/job"), "running-job\n");
      mkdirSync(dir("data/jobs/running-job/p"), { recursive: true });

      agent(["guard"], { FAKE_DF_DATA: "90" });

      expect(existsSync(dir("state/draining"))).toBe(true);
      expect(logged()).not.toContain("set-instance-health");
      expect(existsSync(dir("data/jobs/running-job"))).toBe(true);
    } finally {
      holder.kill();
    }
  });
});

describe("testbed-agent health", () => {
  it("refuses at 85% with the reason disk, and under 10 GB free on the root", () => {
    const full = agent(["health"], { FAKE_DF_DATA: "86" });
    expect(full.code).toBe(1);
    expect(full.out.trim()).toBe("unhealthy: disk");

    const job = agent(["job", "run", "j1", "light", "me", "core", "--", "true"], {
      FAKE_DF_DATA: "86",
    });
    expect(job.code).toBe(75);
    expect(job.out).toContain("unhealthy: disk");
    expect(logged()).not.toContain("docker run");
  });

  it("refuses new jobs on a spot reclaim or rebalance notice, with exit 75", () => {
    expect(agent(["health"], { FAKE_SPOT: "1" }).out.trim()).toBe("unhealthy: reclaim");
    expect(agent(["health"], { FAKE_REBALANCE: "1" }).out.trim()).toBe("unhealthy: rebalance");
    const job = agent(["job", "run", "j1", "light", "me", "core", "--", "true"], {
      FAKE_SPOT: "1",
    });
    expect(job.code).toBe(75);
    expect(job.out).toContain("unhealthy: reclaim");
    expect(logged()).not.toContain("docker run");
  });

  it("checks that Google issues the instance role a token, and never prints it", () => {
    const down = agent(["health"], { FAKE_GOOGLE_DOWN: "1" });
    expect(down.code).toBe(1);
    expect(down.out.trim()).toBe("unhealthy: google");

    const up = agent(["health"]);
    expect(up.out + up.err).not.toContain(TOKEN);
    expect(logged()).toMatch(
      /gcloud auth print-access-token \(config \S+\/state\/gcloud\.\S+, credentials \S+\/etc\/google-credentials\.json\)/,
    );
    expect(leftovers()).toEqual([]);
  });

  it("asks Google nothing on a box without grants", () => {
    rmSync(dir("etc/grants.json"));
    expect(agent(["health"], { FAKE_GOOGLE_DOWN: "1" }).out.trim()).toBe("healthy");
    expect(logged()).not.toContain("gcloud");
  });

  it("reports healthy and one status line", () => {
    expect(agent(["health"]).out.trim()).toBe("healthy");
    const status = agent(["status"]).out.trim();
    expect(status).toMatch(
      /^heavy free, light free \| disk 10\/20 \| healthy \| ami ami-test .+ \| load 0\.50$/,
    );
  });
});

describe("testbed-agent job run", () => {
  it("answers 73 with the holder when the slot is busy", () => {
    const holder = spawn("sleep", ["30"]);
    try {
      mkdirSync(dir("state/slot-heavy"), { recursive: true });
      writeFileSync(dir("state/slot-heavy/pid"), `${holder.pid}\n`);
      writeFileSync(dir("state/slot-heavy/who"), "sess other\n");

      const run = agent(["job", "run", "j2", "heavy", "me", "core", "--", "true"]);

      expect(run.code).toBe(73);
      expect(run.out.trim()).toBe("busy sess other");
      expect(agent(["slot", "heavy"]).out.trim()).toBe("busy sess other");
      expect(agent(["slot", "light"]).out.trim()).toBe("free");
    } finally {
      holder.kill();
    }
  });

  it("always cleans up after a failing job: workspace, containers, network, slot, protection", () => {
    expect(agent(["job", "prepare", "j3", "core"]).out.trim()).toBe(dir("data/jobs/j3/core"));
    expect(existsSync(dir("data/jobs/j3/core"))).toBe(true);

    const run = agent(["job", "run", "j3", "light", "me", "core", "--", "exit 7"], {
      FAKE_RUN_RC: "7",
    });

    expect(run.code).toBe(7);
    expect(run.out).toContain("job output");
    expect(existsSync(dir("data/jobs/j3"))).toBe(false);
    expect(agent(["slot", "light"]).out.trim()).toBe("free");
    const calls = logged();
    expect(calls).toContain("docker network rm tb-j3");
    expect(calls).toContain("--protected-from-scale-in");
    expect(calls).toContain("--no-protected-from-scale-in");
    expect(calls.indexOf("--no-protected-from-scale-in")).toBeGreaterThan(
      calls.indexOf(" --protected-from-scale-in"),
    );
  });

  it("finishes its cleanup when `job stop` arrives during it: workspace, slot, protection", async () => {
    // The cleanup's network removal marks that cleanup has begun, then takes a moment, as a real one can.
    stub(
      "docker",
      `echo "docker $*" >> "$FAKE_LOG"
case "$1 $2" in "network rm") : > "$FAKE_LOG.cleanup"; sleep 2 ;; esac
exit 0`,
    );
    agent(["job", "prepare", "j9", "core"]);
    const job = spawn("sh", [AGENT, "job", "run", "j9", "light", "me", "core", "--", "true"], {
      env: env(),
    });
    const exited = new Promise<number | null>((done) => {
      job.on("exit", (code) => done(code));
    });
    while (!existsSync(`${log}.cleanup`)) {
      await new Promise((wait) => {
        setTimeout(wait, 50);
      });
    }

    agent(["job", "stop", "light"]);
    await exited;

    expect(existsSync(dir("data/jobs/j9"))).toBe(false);
    expect(existsSync(dir("state/slot-light"))).toBe(false);
    expect(logged()).toContain("--no-protected-from-scale-in");
  });

  it("hands each granted value to the container by name, never on a command line", () => {
    agent(["job", "prepare", "j4", "core"]);
    writeFileSync(dir("data/jobs/j4/core/pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const run = agent(["job", "run", "j4", "light", "me", "core", "--", "echo hi"]);

    expect(run.code).toBe(0);
    // The fetch only fills the store, without scripts, from a copy outside the workspace: run there it would leave a
    // node_modules that makes the container skip its install.
    expect(logged()).toMatch(
      /pnpm fetch --ignore-scripts --store-dir \S+ \(in \S+\/data\/jobs\/j4\/\.fetch\)/,
    );
    expect(existsSync(dir("data/jobs/j4/.fetch"))).toBe(false);
    expect(logged()).toMatch(/-e CI=true /);
    // The container reads the metadata cache the fetch filled; a lockfile install needs it for the release-age check.
    expect(logged()).toMatch(/-v \S+\/data\/pnpm-cache:\/pnpm-cache /);
    expect(logged()).toContain("-e PNPM_CONFIG_CACHE_DIR=/pnpm-cache");
    expect(logged()).toContain("pnpm install --prefer-offline --frozen-lockfile");
    // A repository narrows the install from its own .testbed/install-args, read inside the container.
    expect(logged()).toContain("$(cat .testbed/install-args 2>/dev/null)");
    // Writable, so a package the store lacks can be added during the install, with integrity checks forced on.
    expect(logged()).toMatch(/-v \S+\/pnpm-store:\/pnpm-store /);
    expect(logged()).toContain("-e PNPM_CONFIG_VERIFY_STORE_INTEGRITY=true");
    // Uniwind Pro's verified tarball stays in the box's pnpm cache, so its CI download quota is spent once per box.
    expect(logged()).toContain("-e UNIWIND_CACHE_DIR=/pnpm-cache/uniwind");
    expect(logged()).not.toContain(TOKEN);
    expect(run.out + run.err).not.toContain(TOKEN);
    // The scope's ciphertext from its flat prefix, decrypted by name, as the instance role.
    expect(logged()).toMatch(
      /gcloud storage cp gs:\/\/figentra-secrets-ciphertext\/ci\.build\.turbo\/\*\.enc\.yaml \S+\/state\/secrets\.\S+\/ci\.build\.turbo\/ \(config \S+, credentials \S+\/etc\/google-credentials\.json\)/,
    );
    expect(logged()).toMatch(
      /sops decrypt --extract \["TURBO_TOKEN"\] \S+\/TURBO_TOKEN\.enc\.yaml \(credentials \S+\/etc\/google-credentials\.json\)/,
    );
    expect(readFileSync(`${log}.env`, "utf8")).toContain(`TURBO_TOKEN=${TOKEN}-TURBO_TOKEN `);
    expect(logged()).toMatch(/-e TURBO_TOKEN( |$)/m);
    expect(leftovers()).toEqual([]);
    expect(logged()).toContain("echo hi");
  });

  it("gives every project the `*` grants, and pnpm the registry token through the repository's .npmrc", () => {
    writeFileSync(
      dir("etc/grants.json"),
      JSON.stringify({ core: ["ci/build/turbo"], "*": ["ci/build/registry"] }),
    );
    const run = agent(["job", "run", "j7", "light", "me", "pay", "--", "echo hi"]);

    expect(run.code).toBe(0);
    expect(readFileSync(`${log}.env`, "utf8")).toContain(
      `FIGENTRA_REGISTRY_TOKEN=${TOKEN}-FIGENTRA_REGISTRY_TOKEN`,
    );
    expect(logged()).toMatch(/-e FIGENTRA_REGISTRY_TOKEN( |$)/m);
    expect(logged()).toContain("/ci.build.registry/");
    expect(logged()).not.toContain("ci.build.turbo");
    // Both token names, read from either, and the repository's .npmrc as pnpm's auth file; no value on a line.
    expect(logged()).toContain("PNPM_CONFIG_NPMRC_AUTH_FILE=$PWD/.npmrc");
    expect(logged()).toContain("${FIGENTRA_REGISTRY_TOKEN:-${STACKRA_REGISTRY_TOKEN:-}}");
    expect(logged()).not.toContain(TOKEN);
  });

  it("gives a project without grants no value", () => {
    const run = agent(["job", "run", "j5", "light", "me", "other", "--", "true"]);

    expect(run.code).toBe(0);
    expect(readFileSync(`${log}.env`, "utf8").trim()).toBe("TURBO_TOKEN= FIGENTRA_REGISTRY_TOKEN=");
    expect(logged()).not.toContain("gcloud");
    expect(logged()).not.toContain("sops");
    expect(logged()).not.toContain("-e TURBO_TOKEN");
  });

  it("refuses a secret whose name would replace a variable (exit 75), and removes the ciphertext", () => {
    writeFileSync(dir("etc/grants.json"), JSON.stringify({ core: ["ci/build"] }));
    const run = agent(["job", "run", "j8", "light", "me", "core", "--", "true"], {
      FAKE_NAMES: "PATH",
    });

    expect(run.code).toBe(75);
    expect(run.out).toContain("unhealthy: secrets");
    expect(logged()).not.toContain("stackra-testbed-job");
    expect(logged()).not.toContain("sops");
    expect(leftovers()).toEqual([]);
    expect(agent(["slot", "light"]).out.trim()).toBe("free");
  });

  it("clones the seed, then refreshes it from the workspace without node_modules or env files", () => {
    mkdirSync(dir("data/seed/core/node_modules"), { recursive: true });
    writeFileSync(dir("data/seed/core/a.txt"), "a");
    writeFileSync(dir("data/seed/core/stale.txt"), "x");
    const prepared = agent(["job", "prepare", "j6", "core"]).out.trim();
    expect(readFileSync(join(prepared, "a.txt"), "utf8")).toBe("a");
    expect(existsSync(join(prepared, ".testbed-used"))).toBe(false);

    rmSync(join(prepared, "stale.txt"));
    writeFileSync(join(prepared, "new.txt"), "n");
    writeFileSync(join(prepared, ".env.local"), "NOT_A_SECRET_VALUE");
    mkdirSync(join(prepared, "node_modules"), { recursive: true });
    writeFileSync(join(prepared, "node_modules/big.js"), "x");

    expect(agent(["job", "run", "j6", "light", "me", "core", "--", "true"]).code).toBe(0);

    expect(existsSync(dir("data/jobs/j6"))).toBe(false);
    expect(readFileSync(dir("data/seed/core/new.txt"), "utf8")).toBe("n");
    // The job's git snapshot stays in the job: the seed never takes a `.git`.
    expect(existsSync(dir("data/seed/core/.git"))).toBe(false);
    expect(existsSync(dir("data/seed/core/stale.txt"))).toBe(false);
    expect(existsSync(dir("data/seed/core/.env.local"))).toBe(false);
    expect(existsSync(dir("data/seed/core/node_modules/big.js"))).toBe(false);
    expect(existsSync(dir("data/seed/core/.testbed-used"))).toBe(true);
  });
});

function idleSince(minutes: number): void {
  writeFileSync(dir("state/last-job"), "");
  const then = new Date(Date.now() - minutes * 60 * 1000);
  utimesSync(dir("state/last-job"), then, then);
}

describe("testbed-agent idle", () => {
  it("terminates itself and lowers the desired count after 60 idle minutes above the minimum", () => {
    idleSince(90);
    agent(["idle"], { FAKE_ASG_COUNTS: "1 3" });
    expect(logged()).toMatch(
      /terminate-instance-in-auto-scaling-group --instance-id i-test --should-decrement-desired-capacity/,
    );
  });

  it("stays at the minimum, or when idle for less than 60 minutes", () => {
    idleSince(90);
    agent(["idle"], { FAKE_ASG_COUNTS: "2 2" });
    idleSince(10);
    agent(["idle"], { FAKE_ASG_COUNTS: "1 3" });
    expect(logged()).not.toContain("terminate-instance");
  });
});

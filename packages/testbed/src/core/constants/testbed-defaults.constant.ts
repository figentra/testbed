/**
 * Testbed file contract:
 * Purpose: `TESTBED_DEFAULTS`, every default of the testbed that the `testbed` CLI and `testbed-agent` also know: the
 *          region, AWS profile, SSH user, security group and key names, the group names, the AMI parameter, the tag
 *          keys, the region's vCPU quotas, the disk, guard and idle numbers, the job label, the rsync excludes, and the reserved exit codes. It
 *          is the TypeScript form of `.agents/specs/sta-1626-testbed/agent-contract.md`.
 * Boundary: data only; pure and Pulumi-free. A change here is a change to the contract, so the CLI follows it.
 * Runtime: isomorphic
 * Governing contract: ADR 0484 (decisions 3, 4, 6, 8, 9); ADR 0516 (quotas); the box agent contract of STA-1626.
 */
/** The fixed names, paths and numbers of the testbed that the plan, the program and the box agent share. */
export const TESTBED_DEFAULTS = {
  region: "eu-west-1",
  /**
   * The regions a pool may run in, in the order `testbed run` tries them: the four of the old ci-boxes, each
   * inside its own quotas (ADR 0484 decision 8 as amended 2026-11-03, ADR 0516; STA-2042).
   */
  regions: ["eu-west-1", "eu-west-2", "eu-central-1", "us-east-1"],
  /**
   * The regions the CLI uses today, in `regions` order; `regions` stays the full list the plan accepts (STA-2042). A
   * region whose groups do not exist yet has no box and no group to raise, so it is skipped until its `up` has run.
   * us-east-1 joins once box 1 stops (runbook step 30): until then its on-demand quota is box 1's.
   */
  enabledRegions: ["eu-west-1", "eu-west-2", "eu-central-1"],
  /** The home region's stack owns the global IAM roles, the build bucket and the image pipeline. */
  homeRegion: "eu-west-1",
  /** The instance role and profile every region's boxes use; the home stack declares both (IAM is global). */
  instanceProfile: "stackra-testbed-instance",
  awsProfile: "academorix",
  sshUser: "ubuntu",
  securityGroup: "stackra-testbed",
  keyPair: "academorix-ci",
  keyFile: "~/.ssh/academorix-ci.pem",
  /**
   * The SSM parameter the Image Builder distribution writes the newest AMI id to. Image Builder's service-linked role
   * may write only parameters under `/imagebuilder/`, so the name keeps that prefix.
   */
  amiParameter: "/imagebuilder/stackra-testbed/ami",
  /** Canonical's public parameter for the Ubuntu 24.04 amd64 AMI the recipe starts from. */
  baseImageParameter:
    "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id",
  /**
   * The region's EC2 vCPU quotas as read on 2026-11-02 (`L-1216C47A` on-demand, `L-34B43A08` spot): fixed inputs the
   * plan fits, never raised without the owner (ADR 0516).
   */
  quota: { onDemandVcpus: 8, spotVcpus: 8 },
  groupPrefix: "stackra-testbed",
  /** The instance tag that names the group (`heavy` or `light`); the IAM condition and discovery read it. */
  groupTagKey: "stackra:testbed",
  environmentTag: "ci",
  serviceTag: "testbed",
  jobLabel: "stackra.testbed.job",
  dataMount: "/data",
  idleMinutes: 60,
  jobTimeoutHours: 3,
  /** Raise the desired count after every slot of a kind has been busy for this long (the CLI reads it). */
  scaleUpAfterMinutes: 2,
  guard: {
    cleanupPercent: 70,
    drainPercent: 85,
    rootMinFreeGb: 10,
    turboCacheGb: 20,
    seedMaxAgeDays: 7,
    intervalMinutes: 5,
  },
  exitCodes: { slotBusy: 73, unhealthy: 75, timeout: 124 },
  /** What the Mac's rsync leaves out of a project; the agent's seed refresh leaves out the same. */
  rsyncExcludes: [
    "node_modules",
    ".git",
    ".claude/worktrees",
    ".env*",
    "*.secrets.local.cue",
    ".mcp.json",
    ".turbo",
    "dist",
    ".next",
    // A worktree's pnpm store (about 7.5 GB), which every run would otherwise resend over SSM; the box has its own.
    ".cache",
  ],
} as const;

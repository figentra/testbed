/**
 * Testbed file contract:
 * Purpose: unit tests of `awsTestbed` under Pulumi's mocks: the provider is pinned to eu-west-1; the default subnets
 *          are only those in zones that offer the heavy type; the security group
 *          allows SSH only from the allowlist; the launch template resolves the AMI from the SSM parameter, requires
 *          IMDSv2, has a 40 GB root and a 200 GB data volume deleted with the instance, and its user data holds the
 *          scopes and the Google external-account file and no secret; `heavy` is on-demand and `light` is mixed-instances spot with capacity rebalance; both
 *          groups use EC2 health checks and an instance refresh that waits for protected instances at 100% healthy;
 *          the instance policy limits Auto Scaling calls to groups by tag; the Image Builder recipe version is derived
 *          from the inputs, no component keeps a placeholder, the distribution writes the AMI parameter and the
 *          pipeline is weekly; the job Dockerfile's defaults equal the pins; a given VPC and subnets are used and
 *          `groups: false` declares no Auto Scaling group and no launch template.
 * Boundary: test only; no cloud is called and no state is written (`pulumi.runtime.setMocks`). The lockfile input is
 *           the small fixture in `fixtures/` (a lockfile with its pnpm-workspace.yaml, .pnpmfile.mjs and .npmrc), not
 *           core's.
 * Runtime: node (vitest)
 * Governing contract: ADR 0022 (test placement); ADR 0484 (Enforcement); ADR 0173.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as pulumi from "@pulumi/pulumi";
import { beforeAll, describe, expect, it } from "vitest";

import { TOOLCHAIN_PINS } from "#core/constants/toolchain-pins.constant";
import { testbedPlan } from "#core/functions/testbed-plan.function";
import { testbedUserData } from "#core/functions/testbed-user-data.function";
import { awsTestbed } from "#node/functions/aws-testbed.function";
import { testbedPackageRoot } from "#node/functions/testbed-package-root.function";
import type { AwsTestbed } from "#node/types/aws-testbed.type";

type Registered = {
  readonly type: string;
  readonly name: string;
  readonly inputs: Record<string, unknown>;
};

const registered: Registered[] = [];
const LOCKFILE = fileURLToPath(new URL("fixtures/pnpm-lock.yaml", import.meta.url));
const PLAN = testbedPlan();

let stack: AwsTestbed;
// The inputs of the getSubnets call, as the mocks saw them.
let subnetQuery: Record<string, unknown> | undefined;

function resource(kind: string, name: string): Registered {
  const found = registered.find((entry) => entry.type.endsWith(`:${kind}`) && entry.name === name);
  if (found === undefined) throw new Error(`No ${kind} named ${name} was registered`);
  return found;
}

async function settle(): Promise<void> {
  let count = -1;
  while (count !== registered.length) {
    count = registered.length;
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
}

beforeAll(async () => {
  await pulumi.runtime.setMocks(
    {
      newResource: (args) => {
        const inputs = args.inputs as Record<string, unknown>;
        registered.push({ type: args.type, name: args.name, inputs });
        return {
          id: `${args.name}-id`,
          state: {
            ...inputs,
            arn: `arn:mock:${args.name}`,
            latestVersion: 3,
            bucket: "mock-bucket",
          },
        };
      },
      call: (args) => {
        if (args.token === "aws:index/getCallerIdentity:getCallerIdentity")
          return { accountId: "111122223333", arn: "arn:mock", userId: "mock", id: "mock" };
        if (args.token === "aws:ec2/getVpc:getVpc") return { id: "vpc-1" };
        if (args.token === "aws:ec2/getInstanceTypeOfferings:getInstanceTypeOfferings")
          return {
            locations: ["eu-west-1a", "eu-west-1b"],
            instanceTypes: [],
            locationTypes: [],
            id: "x",
          };
        if (args.token === "aws:ec2/getSubnets:getSubnets") {
          subnetQuery = args.inputs as Record<string, unknown>;
          return { ids: ["subnet-a", "subnet-b"] };
        }
        return args.inputs as Record<string, unknown>;
      },
    },
    "testbed",
    "test",
    false,
  );
  stack = awsTestbed(PLAN, {
    allowedCidrs: ["203.0.113.7/32"],
    lockfilePath: LOCKFILE,
    tags: { owner: "platform" },
  });
  await new Promise((resolve) => {
    stack.securityGroupId.apply(resolve);
  });
  await settle();
});

describe("awsTestbed", () => {
  it("takes only the subnets in zones that offer the heavy instance type", () => {
    expect(subnetQuery?.["filters"]).toEqual([
      { name: "vpc-id", values: ["vpc-1"] },
      { name: "availability-zone", values: ["eu-west-1a", "eu-west-1b"] },
    ]);
  });

  it("pins the provider to the plan's region", () => {
    expect(resource("providers:aws", "testbed").inputs.region).toBe("eu-west-1");
    expect(stack.region).toBe("eu-west-1");
    expect(stack.home).toBe(true);
  });

  it("opens SSH only to the allowlist and allows all egress", () => {
    const group = resource("ec2/securityGroup:SecurityGroup", "testbed").inputs;
    expect(group.name).toBe("stackra-testbed");
    expect(group.ingress).toEqual([
      expect.objectContaining({ fromPort: 22, toPort: 22, cidrBlocks: ["203.0.113.7/32"] }),
    ]);
    expect(group.egress).toEqual([expect.objectContaining({ protocol: "-1" })]);
  });

  it("launches from the SSM parameter with IMDSv2, two gp3 disks deleted with the instance", () => {
    const template = resource("ec2/launchTemplate:LaunchTemplate", "testbed").inputs;
    expect(template.imageId).toBe("resolve:ssm:/imagebuilder/stackra-testbed/ami");
    expect(template.keyName).toBe("academorix-ci");
    expect(template.metadataOptions).toMatchObject({ httpTokens: "required" });
    expect(template.blockDeviceMappings).toEqual([
      expect.objectContaining({
        deviceName: "/dev/sda1",
        ebs: expect.objectContaining({
          volumeSize: 40,
          volumeType: "gp3",
          deleteOnTermination: "true",
        }),
      }),
      expect.objectContaining({
        deviceName: "/dev/sdf",
        ebs: expect.objectContaining({
          volumeSize: 200,
          volumeType: "gp3",
          deleteOnTermination: "true",
        }),
      }),
    ]);
  });

  it("writes scopes and the Google credentials file to user data, and no secret", () => {
    const template = resource("ec2/launchTemplate:LaunchTemplate", "testbed").inputs;
    const userData = Buffer.from(String(template.userData), "base64").toString("utf8");
    expect(userData).toBe(testbedUserData(PLAN));
    expect(userData).toContain('{"core":["ci/build","ci/build/turbo"],"*":["ci/build/registry"]}');
    // The credentials file names token URLs; it holds no credential of its own, only where to read the box's.
    const [head = "", rest = ""] = userData.split(
      "/etc/testbed/google-credentials.json <<'GOOGLE'\n",
    );
    const [file = "", tail = ""] = rest.split("\nGOOGLE\n");
    expect(head + tail).not.toMatch(/token|secret|password|key/i);
    expect(file).not.toMatch(/secret|password|private_key|impersonation/i);
    expect(JSON.parse(file)).toMatchObject({
      type: "external_account",
      audience:
        "//iam.googleapis.com/projects/330719355948/locations/global/workloadIdentityPools/github/providers/testbed",
      credential_source: {
        environment_id: "aws1",
        imdsv2_session_token_url: "http://169.254.169.254/latest/api/token",
      },
    });
    expect(tail).toContain("chmod 0644");
  });

  it("keeps heavy on-demand and runs only light on spot", () => {
    const heavy = resource("autoscaling/group:Group", "heavy").inputs;
    expect(heavy.name).toBe("stackra-testbed-heavy");
    expect(heavy).toMatchObject({ minSize: 0, maxSize: 1 });
    expect(heavy.mixedInstancesPolicy).toBeUndefined();

    const light = resource("autoscaling/group:Group", "light").inputs;
    expect(light.name).toBe("stackra-testbed-light");
    expect(light).toMatchObject({ minSize: 0, maxSize: 1, capacityRebalance: true });
    expect(light.mixedInstancesPolicy).toMatchObject({
      instancesDistribution: { onDemandBaseCapacity: 0, onDemandPercentageAboveBaseCapacity: 0 },
    });
    const policy = light.mixedInstancesPolicy as {
      launchTemplate: { overrides: { instanceType: string }[] };
    };
    expect(policy.launchTemplate.overrides.map((entry) => entry.instanceType)).toEqual([
      "c7i.2xlarge",
      "c6i.2xlarge",
      "m7i.2xlarge",
    ]);
  });

  it("checks health by EC2 and refreshes without ending a protected job", () => {
    for (const name of ["heavy", "light"]) {
      const group = resource("autoscaling/group:Group", name).inputs;
      expect(group.healthCheckType).toBe("EC2");
      // The cost backstop: no box lives past a day, and the in-service count feeds the owner's alarm.
      expect(group.maxInstanceLifetime).toBe(86_400);
      expect(group.enabledMetrics).toEqual(["GroupInServiceInstances", "GroupDesiredCapacity"]);
      expect(group.instanceRefresh).toMatchObject({
        strategy: "Rolling",
        preferences: { minHealthyPercentage: 100, scaleInProtectedInstances: "Wait" },
      });
      expect(group.tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "stackra:testbed", value: name, propagateAtLaunch: true }),
          expect.objectContaining({ key: "Name", value: `stackra-testbed-${name}` }),
        ]),
      );
    }
  });

  it("limits the instance's Auto Scaling calls to testbed groups by tag", () => {
    const policy = JSON.parse(
      String(resource("iam/rolePolicy:RolePolicy", "testbed-instance-agent").inputs.policy),
    ) as { Statement: { Sid: string; Action: string[]; Condition?: unknown; Resource: string }[] };
    const own = policy.Statement.find((statement) => statement.Sid === "OwnGroupsOnly");
    expect(own?.Action).toEqual(
      expect.arrayContaining([
        "autoscaling:SetInstanceProtection",
        "autoscaling:SetInstanceHealth",
        "autoscaling:TerminateInstanceInAutoScalingGroup",
      ]),
    );
    expect(own?.Condition).toEqual({
      StringEquals: { "autoscaling:ResourceTag/stackra:testbed": ["heavy", "light"] },
    });
    // One role for every region's boxes (STA-2042): the four regions' testbed groups, and no other.
    expect(own?.Resource).toEqual(
      ["eu-west-1", "eu-west-2", "eu-central-1", "us-east-1"].map(
        (region) =>
          `arn:aws:autoscaling:${region}:111122223333:autoScalingGroup:*:autoScalingGroupName/stackra-testbed-*`,
      ),
    );
  });

  it("builds the image weekly into the SSM parameter, versioned by its inputs", () => {
    expect(stack.imageVersion).toMatch(/^1\.\d+\.0$/);
    expect(resource("imagebuilder/imageRecipe:ImageRecipe", "testbed").inputs.version).toBe(
      stack.imageVersion,
    );
    for (const name of ["testbed-base", "testbed-images", "testbed-agent"]) {
      const data = String(resource("imagebuilder/component:Component", name).inputs.data);
      expect(data).not.toContain("@@");
    }
    // `pnpm fetch` refuses a lockfile without the catalogs and the pnpmfile it was written with, and needs the
    // `@figentra-oss` scope from .npmrc.
    const uploaded = registered
      .filter((entry) => entry.type.endsWith(":BucketObjectv2"))
      .map((entry) => entry.inputs.key);
    expect(uploaded).toEqual(
      expect.arrayContaining([
        "build/pnpm-lock.yaml",
        "build/pnpm-workspace.yaml",
        "build/.pnpmfile.mjs",
        "build/.npmrc",
      ]),
    );
    // Only the base component downloads the build inputs; the others use the files it fetched.
    expect(
      String(resource("imagebuilder/component:Component", "testbed-base").inputs.data),
    ).toContain("s3://mock-bucket/build/");
    const distribution = resource(
      "imagebuilder/distributionConfiguration:DistributionConfiguration",
      "testbed",
    );
    // One build, copied to every region, each writing its own AMI parameter (STA-2042).
    const targets = distribution.inputs.distributions as {
      region: string;
      ssmParameterConfigurations: { parameterName: string }[];
    }[];
    expect(targets.map((target) => target.region)).toEqual([
      "eu-west-1",
      "eu-west-2",
      "eu-central-1",
      "us-east-1",
    ]);
    for (const target of targets) {
      expect(target.ssmParameterConfigurations).toEqual([
        expect.objectContaining({ parameterName: "/imagebuilder/stackra-testbed/ami" }),
      ]);
    }
    // No schedule: the image is built by hand while heavy is at 0 (ADR 0516).
    expect(
      resource("imagebuilder/imagePipeline:ImagePipeline", "testbed").inputs.schedule,
    ).toBeUndefined();
  });

  it("keeps the job Dockerfile's argument defaults equal to the pins", () => {
    const dockerfile = readFileSync(`${testbedPackageRoot()}/images/job/Dockerfile`, "utf8");
    expect(dockerfile).toContain(`ARG MISE_VERSION=${TOOLCHAIN_PINS.mise}`);
    expect(dockerfile).toContain(`ARG NODE_VERSION=${TOOLCHAIN_PINS.node}`);
    expect(dockerfile).toContain(`ARG PNPM_VERSION=${TOOLCHAIN_PINS.pnpm}`);
    // Jobs get values by name from the agent: the job image carries no secrets CLI.
    expect(dockerfile).not.toMatch(/infisical|sops/i);
    expect(dockerfile).toContain(`ARG SHFMT_VERSION=${TOOLCHAIN_PINS.shfmt}`);
    expect(dockerfile).toContain(`ARG ENCORE_VERSION=${TOOLCHAIN_PINS.encore}`);
    expect(dockerfile).toContain(`ARG PLAYWRIGHT_VERSION=${TOOLCHAIN_PINS.playwright}`);
    // Every browser the playground's projects may name, a display for Electron, and ffmpeg for renders.
    expect(dockerfile).toContain("install --with-deps chromium firefox webkit");
    expect(dockerfile).toMatch(/ffmpeg xauth xvfb/);
  });

  it("warms and checks the store without lifecycle scripts", () => {
    // The build instance has no job tokens, so a licence-gated postinstall fails the build (image 1.236066669.0).
    const agent = readFileSync(
      `${testbedPackageRoot()}/images/host/components/03-agent.yml`,
      "utf8",
    );
    const fetches = agent.match(/pnpm fetch [^\n]*/g) ?? [];
    expect(fetches).toHaveLength(2);
    for (const fetch of fetches) expect(fetch).toContain("--ignore-scripts");
    // The metadata cache lives on /data, which Clean keeps: an offline install needs it (image 1.224117217.0).
    expect(agent.match(/PNPM_CONFIG_CACHE_DIR=\/data\/pnpm-cache/g)).toHaveLength(2);
  });
});

describe("awsTestbed with a given network and no groups", () => {
  let start = 0;
  let bare: AwsTestbed;

  beforeAll(async () => {
    start = registered.length;
    bare = awsTestbed(PLAN, {
      lockfilePath: LOCKFILE,
      vpcId: "vpc-9",
      subnetIds: ["subnet-9", "subnet-10"],
      groups: false,
      permissionsBoundary: "arn:aws:iam::111122223333:policy/stackra-testbed-boundary",
    });
    await new Promise((resolve) => {
      bare.securityGroupId.apply(resolve);
    });
    await settle();
  });

  const later = (kind: string): Registered[] =>
    registered.slice(start).filter((entry) => entry.type.endsWith(`:${kind}`));

  it("sets the given permissions boundary on every role it creates, and none without it", () => {
    const roles = later("iam/role:Role");
    expect(roles.map((role) => role.inputs.permissionsBoundary)).toEqual([
      "arn:aws:iam::111122223333:policy/stackra-testbed-boundary",
      "arn:aws:iam::111122223333:policy/stackra-testbed-boundary",
    ]);
    const first = registered
      .slice(0, start)
      .filter((entry) => entry.type.endsWith(":iam/role:Role"));
    expect(first.length).toBe(2);
    for (const role of first) expect(role.inputs.permissionsBoundary).toBeUndefined();
  });

  it("uses the given VPC and first subnet, and declares no Auto Scaling group", () => {
    expect(later("ec2/securityGroup:SecurityGroup")[0]?.inputs.vpcId).toBe("vpc-9");
    // No allowlist given: no inbound rule at all; the CLI reaches the boxes through SSM (STA-1953).
    expect(later("ec2/securityGroup:SecurityGroup")[0]?.inputs.ingress).toEqual([]);
    expect(
      later("imagebuilder/infrastructureConfiguration:InfrastructureConfiguration")[0]?.inputs,
    ).toMatchObject({ subnetId: "subnet-9" });
    expect(later("autoscaling/group:Group")).toEqual([]);
    expect(bare.groups).toBeUndefined();
    // EC2 refuses a launch template whose AMI parameter does not exist yet (before the first image build).
    expect(later("ec2/launchTemplate:LaunchTemplate")).toEqual([]);
    expect(bare.launchTemplateId).toBeUndefined();
  });
});

describe("awsTestbed for a member region (STA-2042)", () => {
  let start = 0;
  let member: AwsTestbed;

  beforeAll(async () => {
    start = registered.length;
    member = awsTestbed(testbedPlan({ region: "eu-west-2" }), { lockfilePath: LOCKFILE });
    await new Promise((resolve) => {
      member.securityGroupId.apply(resolve);
    });
    await settle();
  });

  const later = (kind: string): Registered[] =>
    registered.slice(start).filter((entry) => entry.type.endsWith(`:${kind}`));

  it("declares only the region's pool: no role, bucket or image pipeline", () => {
    expect(later("providers:aws")[0]?.inputs.region).toBe("eu-west-2");
    expect(member).toMatchObject({ region: "eu-west-2", home: false });
    expect(member.imagePipelineArn).toBeUndefined();
    expect(member.instanceRoleArn).toBeUndefined();
    const types = registered.slice(start).map((entry) => entry.type);
    expect(types.filter((type) => /aws:(iam|s3|imagebuilder)\//.test(type))).toEqual([]);
    expect(later("ec2/securityGroup:SecurityGroup")[0]?.inputs.ingress).toEqual([]);
    expect(later("autoscaling/group:Group").map((group) => group.inputs.name)).toEqual([
      "stackra-testbed-heavy",
      "stackra-testbed-light",
    ]);
  });

  it("launches from its own region's AMI parameter with the global instance profile", () => {
    const template = later("ec2/launchTemplate:LaunchTemplate")[0]?.inputs;
    expect(template?.imageId).toBe("resolve:ssm:/imagebuilder/stackra-testbed/ami");
    expect(template?.iamInstanceProfile).toEqual({ name: "stackra-testbed-instance" });
  });
});

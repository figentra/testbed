/**
 * Stackra file contract:
 * Purpose: `awsTestbed(plan, options)`, the Pulumi program part that declares one region of the testbed (one stack per
 *          region, STA-2042): an AWS provider pinned to the plan's region; the `stackra-testbed` security group (SSH
 *          only from an optional allowlist, all egress); in the home region only, the global instance role and
 *          profile (SSM core, plus Auto Scaling calls limited to the four regions' groups carrying the
 *          `stackra:testbed` tag) and the image pipeline, whose distribution copies each AMI to every region;
 *          one launch template (AMI from the SSM parameter, a 40 GB root and a 200 GB `/data` volume, IMDSv2
 *          required, user data that writes ids only); the `heavy` on-demand and `light` spot Auto Scaling groups with
 *          EC2 health checks and instance refresh that waits for protected instances; and the EC2 Image Builder
 *          pipeline (build bucket with the inputs as assets, three components, a recipe versioned by the hash of its
 *          inputs, an infrastructure configuration, a distribution that writes the AMI id to each region's SSM parameter, and
 *          no schedule: the owner starts a build by hand, only while the heavy group is at 0, since the build
 *          instance and a heavy box do not both fit the region's on-demand vCPU quota (ADR 0516)).
 * Boundary: declares resources only, inside the Pulumi program that calls it; agents only preview, the owner applies.
 *           No secret value is created or read: the box reaches Infisical through its instance role (AWS IAM auth) and
 *           the plan holds ids and paths. The first apply uses `groups: false`, builds the first image, then applies
 *           again with the groups and their launch template: EC2 refuses a template whose AMI parameter is missing.
 * Runtime: node
 * Governing contract: ADR 0484 (decisions 2 to 10); ADR 0516 (quotas); ADR 0171 (decisions 2, 3 and 5); ADR 0172
 *                     (cost tags); ADR 0173 (no secret values); ADR 0167 (OIDC, no long-lived keys).
 */
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { TESTBED_DEFAULTS as D } from "#core/constants/testbed-defaults.constant";
import { testbedUserData } from "#core/functions/testbed-user-data.function";
import type { TestbedPlan } from "#core/types/testbed-plan.type";
import { fillComponent } from "#node/functions/fill-component.function";
import { testbedInputs } from "#node/functions/testbed-inputs.function";
import type { AwsTestbed } from "#node/types/aws-testbed.type";
import type { AwsTestbedOptions } from "#node/types/aws-testbed-options.type";

const BUILDER_PROFILE_POLICIES = [
  "arn:aws:iam::aws:policy/EC2InstanceProfileForImageBuilder",
  "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
];

/** A trust document that lets the AWS service `service` assume the role. */
function assumedBy(service: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: service }, Action: "sts:AssumeRole" }],
  });
}

/**
 * Declares the testbed and returns its ids.
 *
 * @param plan - from `testbedPlan`.
 * @param options - the optional SSH allowlist, the core lockfile and optional network and tags.
 * @example
 * // figentra/infra, testbed/index.ts
 * const config = new pulumi.Config();
 * export const testbed = awsTestbed(
 *   testbedPlan({ identityId: config.require("identityId"), ciGateProjectId: config.require("ciGateProjectId") }),
 *   { allowedCidrs: config.getObject<string[]>("sshCidrs") ?? [], lockfilePath: "../stackra/pnpm-lock.yaml" },
 * );
 */
export function awsTestbed(plan: TestbedPlan, options: AwsTestbedOptions): AwsTestbed {
  const provider = new aws.Provider("testbed", { region: plan.region as aws.Region });
  const opts: pulumi.CustomResourceOptions = { provider };
  const tags = {
    environment: plan.tags.environment,
    service: plan.tags.service,
    ...options.tags,
  };
  const account = aws.getCallerIdentityOutput({}, { provider });

  // ---- network -----------------------------------------------------------------------------------------------
  const vpcId =
    options.vpcId === undefined
      ? aws.ec2.getVpcOutput({ default: true }, { provider }).id
      : pulumi.output(options.vpcId);
  const subnetIds: pulumi.Input<string[]> =
    options.subnetIds === undefined
      ? aws.ec2.getSubnetsOutput({ filters: [{ name: "vpc-id", values: [vpcId] }] }, { provider })
          .ids
      : [...options.subnetIds];

  // No ingress by default: the CLI reaches a box through SSM Session Manager. With `--ssh-direct` it authorises and
  // revokes its own /32 at run time, so the live ingress is not Pulumi's after creation. The description stays as it
  // was: EC2 cannot change it in place, and a new one would replace the group.
  const securityGroup = new aws.ec2.SecurityGroup(
    "testbed",
    {
      name: D.securityGroup,
      description: "Testbed boxes: SSH from the allowlist, all egress",
      vpcId,
      ingress: (options.allowedCidrs ?? []).map((cidr) => ({
        protocol: "tcp",
        fromPort: 22,
        toPort: 22,
        cidrBlocks: [cidr],
        description: "SSH allowlist",
      })),
      egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
      tags: { ...tags, Name: D.securityGroup },
    },
    { ...opts, ignoreChanges: ["ingress"] },
  );

  // ---- the home region only: the global roles and profiles, the build inputs and the image pipeline (STA-2042) ----
  const home = plan.home
    ? awsTestbedHome(plan, options, {
        opts,
        tags,
        accountId: account.accountId,
        securityGroupId: securityGroup.id,
      })
    : undefined;

  // ---- the launch template and the two groups ---------------------------------------------------------------
  const groupTags = (group: "heavy" | "light") =>
    [
      { key: "Name", value: plan.groups[group].name },
      { key: plan.tags.groupKey, value: group },
      { key: "environment", value: plan.tags.environment },
      { key: "service", value: plan.tags.service },
      ...Object.entries(options.tags ?? {}).map(([key, value]) => ({ key, value })),
    ].map((tag) => ({ ...tag, propagateAtLaunch: true }));
  // A new launch template version is a new instance refresh; protected instances finish their job first.
  const refresh = {
    strategy: "Rolling",
    preferences: {
      minHealthyPercentage: 100,
      maxHealthyPercentage: 200,
      scaleInProtectedInstances: "Wait",
    },
  };
  const common = {
    vpcZoneIdentifiers: subnetIds,
    healthCheckType: "EC2",
    healthCheckGracePeriod: 300,
    newInstancesProtectedFromScaleIn: false,
    instanceRefresh: refresh,
  };
  // The CLI and the idle pass move the desired count, so Pulumi owns the bounds and not the count.
  const groupOpts = { ...opts, ignoreChanges: ["desiredCapacity"] };

  let groups: AwsTestbed["groups"];
  let launchTemplateId: pulumi.Output<string> | undefined;
  // EC2 refuses a launch template whose `resolve:ssm:` parameter does not exist yet, so the template comes with the
  // groups, after the first image build has written the parameter.
  if (options.groups !== false) {
    const { heavy, light } = plan.groups;
    const launchTemplate = new aws.ec2.LaunchTemplate(
      "testbed",
      {
        name: "stackra-testbed",
        imageId: `resolve:ssm:${plan.image.amiParameter}`,
        instanceType: plan.groups.heavy.instanceTypes[0] ?? "c7i.2xlarge",
        // `stackra testbed` connects with this pair's key file (TESTBED_DEFAULTS.keyFile).
        keyName: D.keyPair,
        // The home stack owns the profile; a member region names it, since IAM is global (STA-2042).
        iamInstanceProfile: { name: home?.instanceProfile.name ?? D.instanceProfile },
        metadataOptions: {
          httpEndpoint: "enabled",
          httpTokens: "required",
          // One hop: the host reads its role, a job container cannot.
          httpPutResponseHopLimit: 1,
        },
        blockDeviceMappings: [
          {
            deviceName: plan.disks.root.deviceName,
            ebs: {
              volumeSize: plan.disks.root.sizeGb,
              volumeType: "gp3",
              deleteOnTermination: String(plan.disks.deleteOnTermination),
              encrypted: "true",
            },
          },
          {
            deviceName: plan.disks.data.deviceName,
            ebs: {
              volumeSize: plan.disks.data.sizeGb,
              volumeType: "gp3",
              deleteOnTermination: String(plan.disks.deleteOnTermination),
              encrypted: "true",
            },
          },
        ],
        networkInterfaces: [
          {
            associatePublicIpAddress: "true",
            deleteOnTermination: "true",
            securityGroups: [securityGroup.id],
          },
        ],
        userData: Buffer.from(testbedUserData(plan)).toString("base64"),
        tagSpecifications: ["instance", "volume"].map((resourceType) => ({ resourceType, tags })),
        updateDefaultVersion: true,
        tags,
      },
      opts,
    );
    const version = launchTemplate.latestVersion.apply(String);
    launchTemplateId = launchTemplate.id;
    // oxlint-disable-next-line no-new -- reason: Pulumi registers a resource when it is constructed
    new aws.autoscaling.Group(
      "heavy",
      {
        ...common,
        name: heavy.name,
        minSize: heavy.min,
        maxSize: heavy.max,
        desiredCapacity: heavy.min,
        launchTemplate: { id: launchTemplate.id, version },
        tags: groupTags("heavy"),
      },
      groupOpts,
    );
    // oxlint-disable-next-line no-new -- reason: Pulumi registers a resource when it is constructed
    new aws.autoscaling.Group(
      "light",
      {
        ...common,
        name: light.name,
        minSize: light.min,
        maxSize: light.max,
        desiredCapacity: light.min,
        capacityRebalance: true,
        mixedInstancesPolicy: {
          launchTemplate: {
            launchTemplateSpecification: { launchTemplateId: launchTemplate.id, version },
            overrides: light.instanceTypes.map((instanceType) => ({ instanceType })),
          },
          instancesDistribution: {
            onDemandBaseCapacity: 0,
            onDemandPercentageAboveBaseCapacity: 0,
            spotAllocationStrategy: "price-capacity-optimized",
          },
        },
        tags: groupTags("light"),
      },
      groupOpts,
    );
    groups = { heavy: heavy.name, light: light.name };
  }

  return {
    region: plan.region,
    home: plan.home,
    securityGroupId: securityGroup.id,
    ...(home === undefined
      ? {}
      : {
          instanceRoleArn: home.instanceRole.arn,
          buildBucket: home.bucket.bucket,
          imagePipelineArn: home.pipeline.arn,
          imageVersion: home.version,
        }),
    amiParameter: plan.image.amiParameter,
    ...(groups === undefined ? {} : { groups }),
    ...(launchTemplateId === undefined ? {} : { launchTemplateId }),
  };
}

/** What the home stack declares once for every region. */
type HomeResources = {
  readonly instanceRole: aws.iam.Role;
  readonly instanceProfile: aws.iam.InstanceProfile;
  readonly bucket: aws.s3.BucketV2;
  readonly pipeline: aws.imagebuilder.ImagePipeline;
  readonly version: string;
};

/**
 * The home region's part: the global instance and image-builder roles, the build bucket and its inputs, and the image
 * pipeline, whose distribution copies each new AMI to every region and writes that region's AMI parameter.
 */
function awsTestbedHome(
  plan: TestbedPlan,
  options: AwsTestbedOptions,
  shared: {
    readonly opts: pulumi.CustomResourceOptions;
    readonly tags: Record<string, string>;
    readonly accountId: pulumi.Output<string>;
    readonly securityGroupId: pulumi.Output<string>;
  },
): HomeResources {
  const { opts, tags } = shared;
  // ---- the box's role: SSM, Auto Scaling on its own groups, and the AWS identity Infisical checks ------------------
  const instanceRole = new aws.iam.Role(
    "testbed-instance",
    { name: D.instanceProfile, assumeRolePolicy: assumedBy("ec2.amazonaws.com"), tags },
    opts,
  );
  // oxlint-disable-next-line no-new -- reason: Pulumi registers a resource when it is constructed
  new aws.iam.RolePolicyAttachment(
    "testbed-instance-ssm",
    { role: instanceRole.name, policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore" },
    opts,
  );
  // One role serves every region's boxes, so it may act on the testbed groups of the four regions (STA-2042).
  const groupArns = D.regions.map(
    (region) =>
      pulumi.interpolate`arn:aws:autoscaling:${region}:${shared.accountId}:autoScalingGroup:*:autoScalingGroupName/${D.groupPrefix}-*`,
  );
  // oxlint-disable-next-line no-new -- reason: Pulumi registers a resource when it is constructed
  new aws.iam.RolePolicy(
    "testbed-instance-agent",
    {
      role: instanceRole.id,
      policy: pulumi.jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "OwnGroupsOnly",
            Effect: "Allow",
            Action: [
              "autoscaling:SetInstanceProtection",
              "autoscaling:SetInstanceHealth",
              "autoscaling:TerminateInstanceInAutoScalingGroup",
            ],
            Resource: groupArns,
            Condition: {
              StringEquals: {
                [`autoscaling:ResourceTag/${plan.tags.groupKey}`]: ["heavy", "light"],
              },
            },
          },
          {
            Sid: "Read",
            Effect: "Allow",
            Action: [
              "autoscaling:DescribeAutoScalingInstances",
              "autoscaling:DescribeAutoScalingGroups",
              "ec2:DescribeTags",
              "ec2:DescribeImages",
            ],
            Resource: "*",
          },
          // Infisical's AWS auth verifies this identity; the call needs no grant, and naming it keeps the intent in review.
          { Sid: "Identity", Effect: "Allow", Action: "sts:GetCallerIdentity", Resource: "*" },
        ],
      }),
    },
    opts,
  );
  const instanceProfile = new aws.iam.InstanceProfile(
    "testbed-instance",
    { name: D.instanceProfile, role: instanceRole.name, tags },
    opts,
  );

  // ---- the image: inputs bucket, components, recipe, infrastructure, distribution, pipeline --------------------
  const inputs = testbedInputs(options.lockfilePath, plan.toolchain);
  const bucket = new aws.s3.BucketV2("testbed-build", { forceDestroy: true, tags }, opts);
  // oxlint-disable-next-line no-new -- reason: Pulumi registers a resource when it is constructed
  new aws.s3.BucketPublicAccessBlock(
    "testbed-build",
    {
      bucket: bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    },
    opts,
  );
  const uploaded = inputs.files.map(
    (file) =>
      new aws.s3.BucketObjectv2(
        `testbed-build-${file.key.replaceAll(/[^A-Za-z0-9]/g, "-")}`,
        { bucket: bucket.id, key: file.key, source: new pulumi.asset.FileAsset(file.path) },
        opts,
      ),
  );

  const builderRole = new aws.iam.Role(
    "testbed-image-builder",
    {
      name: "stackra-testbed-image-builder",
      assumeRolePolicy: assumedBy("ec2.amazonaws.com"),
      tags,
    },
    opts,
  );
  for (const [index, policyArn] of BUILDER_PROFILE_POLICIES.entries()) {
    // oxlint-disable-next-line no-new -- reason: Pulumi registers a resource when it is constructed
    new aws.iam.RolePolicyAttachment(
      `testbed-image-builder-${index}`,
      { role: builderRole.name, policyArn },
      opts,
    );
  }
  // oxlint-disable-next-line no-new -- reason: Pulumi registers a resource when it is constructed
  new aws.iam.RolePolicy(
    "testbed-image-builder-inputs",
    {
      role: builderRole.id,
      policy: pulumi.jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:ListBucket"],
            Resource: [bucket.arn, pulumi.interpolate`${bucket.arn}/build/*`],
          },
        ],
      }),
    },
    opts,
  );
  const builderProfile = new aws.iam.InstanceProfile(
    "testbed-image-builder",
    { name: "stackra-testbed-image-builder", role: builderRole.name, tags },
    opts,
  );

  const pins = plan.toolchain;
  const values = {
    MISE: pins.mise ?? "",
    NODE: pins.node ?? "",
    PNPM: pins.pnpm ?? "",
    INFISICAL: pins.infisical ?? "",
    SHFMT: pins.shfmt ?? "",
    ENCORE: pins.encore ?? "",
    PLAYWRIGHT: pins.playwright ?? "",
    POSTGRES: pins.postgresImage ?? "",
  };
  // A component or recipe is a version: new inputs replace it, and because its `name` stays the same the provider
  // replaces it delete-first. AWS refuses to delete a version an image was built from, so the old versions are kept
  // in AWS and only leave the state (STA-1953). They cost nothing and old images keep their provenance.
  const versioned: pulumi.CustomResourceOptions = { ...opts, retainOnDelete: true };
  const components = inputs.components.map(
    (source) =>
      new aws.imagebuilder.Component(
        source.name,
        {
          name: source.name,
          platform: "Linux",
          version: inputs.version,
          description: `${source.name}, built from ${inputs.version} of the testbed inputs`,
          data: bucket.bucket.apply((name) =>
            fillComponent(source.document, { ...values, BUCKET: name }),
          ),
          tags,
        },
        { ...versioned, dependsOn: uploaded },
      ),
  );
  const recipe = new aws.imagebuilder.ImageRecipe(
    "testbed",
    {
      name: "stackra-testbed",
      version: inputs.version,
      parentImage: `ssm:${plan.image.baseImageParameter}`,
      components: components.map((component) => ({ componentArn: component.arn })),
      // The data volume is in the image: the preloaded images and the warm store live on it.
      blockDeviceMappings: [
        {
          deviceName: plan.disks.root.deviceName,
          ebs: {
            volumeSize: plan.disks.root.sizeGb,
            volumeType: "gp3",
            deleteOnTermination: "true",
          },
        },
        {
          deviceName: plan.disks.data.deviceName,
          ebs: {
            volumeSize: plan.disks.data.sizeGb,
            volumeType: "gp3",
            deleteOnTermination: "true",
          },
        },
      ],
      tags,
    },
    versioned,
  );
  const infrastructure = new aws.imagebuilder.InfrastructureConfiguration(
    "testbed",
    {
      name: "stackra-testbed",
      instanceProfileName: builderProfile.name,
      instanceTypes: [plan.groups.heavy.instanceTypes[0] ?? "c7i.2xlarge"],
      terminateInstanceOnFailure: true,
      ...(options.subnetIds === undefined
        ? {}
        : { subnetId: options.subnetIds[0], securityGroupIds: [shared.securityGroupId] }),
      instanceMetadataOptions: { httpTokens: "required", httpPutResponseHopLimit: 2 },
      tags,
    },
    opts,
  );
  const distribution = new aws.imagebuilder.DistributionConfiguration(
    "testbed",
    {
      name: "stackra-testbed",
      // One build, copied to every region (STA-2042): each region's newest AMI id lands in its own parameter, which
      // that region's launch template resolves at launch.
      distributions: D.regions.map((region) => ({
        region,
        amiDistributionConfiguration: {
          name: "stackra-testbed-{{ imagebuilder:buildDate }}",
          amiTags: { ...tags, Name: "stackra-testbed" },
        },
        ssmParameterConfigurations: [
          { parameterName: plan.image.amiParameter, dataType: "aws:ec2:image" },
        ],
      })),
      tags,
    },
    opts,
  );
  const pipeline = new aws.imagebuilder.ImagePipeline(
    "testbed",
    {
      name: "stackra-testbed",
      imageRecipeArn: recipe.arn,
      infrastructureConfigurationArn: infrastructure.arn,
      distributionConfigurationArn: distribution.arn,
      // No schedule (ADR 0516): `aws imagebuilder start-image-pipeline-execution`, by hand, while heavy is at 0.
      status: "ENABLED",
      tags,
    },
    opts,
  );

  return { instanceRole, instanceProfile, bucket, pipeline, version: inputs.version };
}

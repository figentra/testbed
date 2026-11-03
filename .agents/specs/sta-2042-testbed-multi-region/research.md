# Research: The testbed in four regions

**Spec**: `.agents/specs/sta-2042-testbed-multi-region/spec.md` · **Linear**: STA-2042 · **Date**: 2026-11-02

## R1. One stack per region, not one program over all regions

- **Decision**: one stack per region from the same program, with the region in the stack's config.
- **Rationale**: each region is applied and approved on its own (FR-003), so a failure or a quota refusal in one never
  blocks another. Adding a region is one approved run. The Pulumi state bucket already holds any number of stacks.
- **Alternative**: one program with four providers. Every apply would touch every region, and one region's error would
  stop all of them.

## R2. One image build, distributed

- **Decision**: the home pipeline's distribution configuration lists the four regions. Each entry copies the AMI and
  writes that region's `/imagebuilder/stackra-testbed/ami` (`ssmParameterConfigurations`).
- **Rationale**:
  - The launch template already resolves `resolve:ssm:/imagebuilder/stackra-testbed/ami` in its own region, so a member
    region needs nothing else.
  - The build needs the on-demand quota of the home region only.
  - The image is identical everywhere.
  - A copy costs snapshot storage only (a 40 GB root plus a 200 GB data snapshot per region, about $12 a month a
    region at $0.05/GB-month).
- **Alternative**: a pipeline per region. Four builds, each needing that region's 8 on-demand vCPUs while its heavy box
  is at 0.

## R3. What is global, what is regional

- **Global (home stack only)**: the IAM roles `stackra-testbed-instance` and `stackra-testbed-image-builder` and their
  instance profiles (IAM is account-wide). Also the build bucket and the Image Builder resources (regional, needed once).
- **Regional (every stack)**: the security group, the launch template and the two Auto Scaling groups, in the region's
  default VPC.
- **Instance role scope**: the autoscaling statement's resource becomes
  `arn:aws:autoscaling:{eu-west-1,eu-west-2,eu-central-1,us-east-1}:<account>:autoScalingGroup:*:autoScalingGroupName/stackra-testbed-*`
  (four ARNs). It keeps the group-tag condition.
- **Infisical**: the gate identity's AWS Auth names the role ARN, which is the same in every region. Nothing changes
  (done 2026-11-02).

## R4. The existing `testbed` stack

- **Decision**: the workflow renames it to `testbed-eu-west-1` once (`pulumi stack rename`) when it exists and the new
  name doesn't. The resources and their URNs keep their logical names, so nothing is replaced.
- **Alternative**: keep `testbed` as eu-west-1's name. That's inconsistent, and every runbook line would need an
  exception.

## R5. The CLI's region list

- **Decision**: the enabled regions are committed in `TESTBED_CLI_DEFAULTS.regions`, ordered for the picker. Order:
  eu-west-1, eu-west-2, eu-central-1, us-east-1, by price and distance from the Gulf. Each region joins through a
  one-line PR after the owner's apply. `STACKRA_TESTBED_REGIONS` overrides it per machine.
- **Rationale**: "enabled" is reviewable and the same for every session, and a region is never used before its pool
  exists (FR-006).
- **Discovery**: one `describe-instances` and one `describe-auto-scaling-groups` per enabled region, in parallel,
  read-only. That's about 1 s with four regions.

## R6. The picker

- A **pure function** of the region order and each region's state:
  1. a free slot of the needed kind on a healthy box, in region order;
  2. otherwise the first region whose group of that kind is below its max (raise desired, then wait for the box);
  3. otherwise wait, or exit 73 with `--no-wait`.
- **A heavy job may take a light slot only on a heavy box**, as today.
- The existing two-minute busy rule (`scaleUpAfterMinutes`) still applies before raising a group in a region that
  already has a running box. It doesn't apply when a region is at 0, which starts at once.

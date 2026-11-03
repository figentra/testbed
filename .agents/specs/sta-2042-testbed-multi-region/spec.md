# Feature Specification: The testbed in four regions

**Feature Branch**: `figentra/sta-2042-testbed-multi-region`

**Created**: 2026-11-03

**Status**: Tasked

**Tier**: big

**Approver**: owner

<!-- Specs are public on GitHub: no secrets, customer data or details of an unfixed vulnerability (ADR 0120 D17). -->

**Linear**: STA-2042

**Linear project**: none

**Clarifications status**: complete

**Analyze**: —

**Input**: User description: "The testbed runs the same scale-from-zero pool (heavy 0–1 on-demand, light 0–1 spot) in
each of the four regions the old ci-boxes use (eu-west-1, eu-west-2, eu-central-1, us-east-1), each inside its own
8 + 8 vCPUs (ADR 0516), replacing all old boxes (about 12 slots). Owner decision 2026-11-03: 'Multi-region testbed'.
Amends ADR 0484 decision 8 (one region)."

## Impact _(mandatory, answer every line before /flow-clarify completes)_

- **Apps touched**: none
- **Services touched**: none
- **Packages touched**: packages/infrastructure/infra-testbed (a region in the plan, the image copied to every region);
  packages/developer/cli (`stackra testbed run`, `status`, `scale` and `unlock` across regions)
- **Public contract change**: additive: a region in the testbed plan and the CLI settings; `stackra testbed status`
  shows a region column. Existing single-region use keeps working with eu-west-1.
- **Cross-service events**: none
- **Tenancy and data**: none
- **Security and privacy**: the same instance role and Infisical identity serve every region (IAM is global); each
  region gets its own security group with no inbound rule (SSM only); no new personal data
- **Secrets**: none new (the boxes reach Infisical through the instance role, as today)
- **ADR needed**: yes: an amendment of ADR 0484 decision 8 ("one region") to the four regions, within ADR 0516's quotas
- **New dependencies**: none
- **Deploy modes**: same in all three (internal test infrastructure, never shipped)
- **Licence tier**: free (MIT, this repo)
- **UI surfaces**: none (CLI output only)
- **Docs to update**: apps/docs/src/docs/runbooks/test-infrastructure.mdx; the `test-infra` skill; ADR 0484 (amendment
  note) and its index row
- **Lane**: full
- **Change risk**: R2 (cloud resources in three new regions; the old fleet is replaced)

## Clarifications

### Session 2026-11-03

- Q: How many regions, and which? → A: The four the old boxes use, each with heavy 0–1 and light 0–1, scale-from-zero
  (owner: "Multi-region testbed").
- Q: How is the design split (stacks, image, state, CLI)? → A: The leader accepted the plan's proposals: a stack per
  region, the image built once in eu-west-1 and distributed, the global roles and one state bucket, an ordered region
  list in `stackra testbed run`, and a region joining only once its old pair is stopped (2026-11-03). How each is
  built goes in the plan.
- Q: What does `fflow gate` need from `stackra testbed run`? → A: Stable exit codes, a JSON result and a capacity read
  (FR-010 to FR-012, "The gate interface"). The leader passes it to the FLOW session.

## Glossary _(full lane)_

- **Region pool**: the testbed in one AWS region: one heavy group (on-demand, 0–1 box) and one light group (spot, 0–1
  box), each box started on demand.
- **Old pair**: the two hand-built ci-boxes in a region (one on-demand, one spot `c7i.2xlarge`), which between them
  fill that region's 8 + 8 vCPU quotas.
- **Slot**: room for one job; a heavy box has a heavy and a light slot, a light box has a light slot.
- **Enabled region**: a region whose old pair is stopped and whose pool `stackra testbed run` may use.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A session runs a check and gets a free box somewhere (Priority: P1)

A session runs `stackra testbed run` while other sessions are busy. It gets a free slot in the nearest enabled region,
or a box is started in the first enabled region with room, without the session choosing a region.

**Why this priority**: the owner's goal is that the testbed replaces all eight old boxes; one region holds only three
slots.

**Independent Test**: with the eu-west-1 slots busy, a new run lands in the next enabled region and passes.

**Acceptance Scenarios**:

1. **Given** a free slot in eu-west-1, **When** a session runs a job, **Then** it runs in eu-west-1.
2. **Given** every eu-west-1 slot busy and eu-west-2 enabled with room, **When** a session runs a job, **Then** it runs
   in eu-west-2, starting a box there if none is up.
3. **Given** every enabled region full, **When** a session runs a job, **Then** it waits for a slot, or exits with the
   busy code when told not to wait.

---

### User Story 2 - The owner adds a region in one step (Priority: P1)

The owner stops a region's old pair and applies that region's pool with one approved run. The region's boxes boot from
the same image as every other region, with no build there.

**Why this priority**: regions are added one a day, and each must not cost a 30 to 60 minute image build.

**Independent Test**: apply eu-west-2's pool; its first box boots from the current image and passes one job.

**Acceptance Scenarios**:

1. **Given** a built image and eu-west-2's old pair stopped, **When** the owner applies eu-west-2, **Then** its groups
   exist at 0 and its first box boots the same image version as eu-west-1.
2. **Given** a new image build, **When** it finishes, **Then** every region has that image within the build's run.

---

### User Story 3 - The owner sees the whole fleet (Priority: P2)

`stackra testbed status` lists every region's boxes, slots, health and desired counts in one view.

**Why this priority**: the owner drains the old fleet region by region and needs to see the new one.

**Independent Test**: with boxes in two regions, `status` shows both with their region.

**Acceptance Scenarios**:

1. **Given** boxes in two regions, **When** `status` runs, **Then** each box is listed with its region, kind, slots and
   health.

### Edge Cases

- **EC-01**: A region not yet enabled (its old pair still runs) is never used, even when every enabled slot is busy.
- **EC-02**: A region's spot capacity is not available: the light group stays at 0 there, and the run tries the next
  enabled region.
- **EC-03**: An image build is due while the home region's heavy box runs: the build waits; it never starts beside a
  heavy box (it would not fit the on-demand quota).
- **EC-04**: One region's apply fails: the other regions keep working and their applies are unaffected.
- **EC-05**: A region cannot be reached (an AWS outage there): `status` marks it unreachable and `run` skips it.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: THE testbed SHALL run a region pool in each of eu-west-1, eu-west-2, eu-central-1 and us-east-1, each
  with a heavy group of 0 to 1 on-demand box and a light group of 0 to 1 spot box.
- **FR-002**: THE plan SHALL refuse any region pool whose largest simultaneous use, image build included where it
  runs, exceeds that region's on-demand or spot vCPU quota (ADR 0516).
- **FR-003**: WHEN the owner applies one region THE apply SHALL change only that region's resources and the shared ones
  it needs, and a failure SHALL leave the other regions as they were.
- **FR-004**: WHEN an image build finishes THE same image SHALL be available in every region, each region's boxes
  SHALL boot from it, and no region other than the build's SHALL need a build of its own.
- **FR-005**: WHEN `stackra testbed run` needs a slot THE CLI SHALL use a free slot of the needed kind in the first
  enabled region of an ordered list, else raise the group in the first enabled region with room, else wait or exit
  with the busy code.
- **FR-006**: THE CLI SHALL use only enabled regions; a region is enabled by configuration once its old pair is stopped.
- **FR-007**: WHEN `stackra testbed status` runs THE CLI SHALL list every enabled region's boxes with region, kind,
  slots, health and desired counts, and mark an unreachable region.
- **FR-008**: THE boxes in every region SHALL reach Infisical through the one instance role, and SHALL accept no
  inbound connection (SSM only), as in eu-west-1.
- **FR-009**: THE `scale` and `unlock` commands SHALL take a region, defaulting to the region of the box they name.
- **FR-010**: THE exit status of `stackra testbed run` SHALL be the job's own exit status, except for the reserved codes:
  2 (usage), 73 (no free slot with `--no-wait`), 75 (no healthy box could be reached; retry), 124 (the job hit its
  3-hour limit). These codes are a stable contract for callers such as `fflow gate`.
- **FR-011**: WHEN `stackra testbed run` is given `--json` THE CLI SHALL stream the job's output unchanged to stderr and
  print one JSON result on stdout at the end: region, box, slot kind, queue wait, run time and exit status.
- **FR-012**: WHEN `stackra testbed status --json` runs THE CLI SHALL print, per enabled region, the boxes and the free
  and total heavy and light slots, counting the boxes that may still be started, so a caller can size its fan-out.

### The gate interface (for `fflow gate`, Flow A-1 FR-15)

What the gate can rely on, from the requirements above:

- **One job, one call.** The gate starts one `stackra testbed run "<session> <what>" <dir> "<cmd>" --json` per job. Each
  call picks its own region and slot (FR-005), so jobs started in parallel spread across regions with no coordination
  in the gate.
- **How many at once.** Up to the sum of slots in the enabled regions: three per region (one heavy, two light), so 12
  with all four regions enabled (4 heavy, 8 light). The gate reads `stackra testbed status --json` (FR-012) and caps
  its parallel jobs at the free slots, plus the boxes that may still start. A job over the cap waits in `run`.
- **Which slot.** A command is heavy when it runs `encore test`, Playwright, e2e, `act` or a build; otherwise light.
  The gate does not choose.
- **Exit codes** (FR-010): the job's own status passes through. 73 means no free slot (with `--no-wait`), so retry
  later. 75 means no healthy box was reachable, so retry or report the infrastructure. 124 means the 3-hour limit was
  hit. 2 means a usage error.
- **Output** (FR-011): the job's output is streamed to stderr unchanged. One JSON line on stdout gives `region`, `box`,
  `slot`, `waitSeconds`, `runSeconds` and `exitCode`, for the gate's report.
- **Not given:** the gate never names a region or a box, and the testbed never queues jobs across calls. The gate owns
  its own ordering.

### Key Entities _(include if feature involves data)_

- **Region pool**: region, heavy and light groups with min, max and desired counts, the security group, the image in that
  region.
- **Region list**: the ordered enabled regions the CLI reads.

## Acceptance criteria _(mandatory for a tiered spec, ADR 0502)_

- **AC-001**: WHEN every eu-west-1 slot is busy THE next run SHALL land in the next enabled region.
- **AC-002**: WHEN a region is applied THE other regions' resources SHALL be unchanged.
- **AC-003**: WHEN an image build finishes THE same image SHALL be bootable in all four regions.
- **AC-004**: IF a region's plan would exceed its quotas THEN THE plan SHALL refuse it before any resource changes.
- **AC-005**: WHILE a region is not enabled THE CLI SHALL never start or use a box there.
- **AC-006**: WHEN `run --json` finishes THE CLI SHALL print exactly one JSON result on stdout, and its exit status SHALL
  follow FR-010.

## Success Criteria _(mandatory)_

- **SC-001**: With all four regions enabled, 12 jobs can run at the same time (4 heavy and 8 light) — verified by:
  manual (the switch-day load run)
- **SC-002**: Adding a region takes one approved apply and no image build — verified by: manual (each region's add)
- **SC-003**: No run ever lands in a region that is not enabled — verified by: unit (the picker over fixtures)
- **SC-004**: Zero quota errors from the testbed over its first two weeks — verified by: manual (the apply and scaling
  logs)
- **SC-005**: Every old box is terminated after the last region is added, and the old fleet's bill goes to zero —
  verified by: manual (the billing page)

## Out of scope

- Any quota increase (ADR 0516: never without the owner).
- Regions other than the four the old boxes use.
- Draining and terminating the old boxes (the owner's steps in the testbed finish plan).
- Flow's gate fan-out itself (coordinated with the FLOW session; this spec only gives it a region-agnostic `run`).

## Assumptions

- Every one of the four regions has a default VPC with a subnet in at least one zone that offers `c7i.2xlarge`.
- The quotas stay 8 on-demand and 8 spot vCPUs per region (read 2026-11-03).
- The ordered list puts the cheaper and nearer regions first: eu-west-1, eu-west-2, eu-central-1, us-east-1.
- eu-west-1 stays the home region: it holds the state bucket, the image pipeline and the global IAM roles.

## Amendments

None.

## Status history

- 2026-11-03 · — → Draft · claude (TESTBED session) · created from the owner's "Multi-region testbed" decision
- 2026-11-03 · Draft → Clarified · claude (TESTBED session) · design accepted by the leader; the gate interface added (FR-010 to FR-012) — Approved by owner 2026-11-03 (question tool: "Approve")
- 2026-11-02 · Clarified → Planned · claude (TESTBED session) · plan, research, data model, contract and quickstart; four PRs (infra-testbed, workflow, CLI, docs) — Approved by owner 2026-11-02 (question tool: "Approve")
- 2026-11-02 · Planned → Tasked · claude (TESTBED session) · 14 tasks in four PRs (A infra-testbed, B workflow, C CLI, D docs)

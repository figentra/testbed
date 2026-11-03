---
description: "Tasks for STA-2042: the testbed in four regions"
---

# Tasks: The testbed in four regions

**Input**: Design documents from `.agents/specs/sta-2042-testbed-multi-region/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/testbed-regions.md

The pull requests are:

- **PR A** (infra-testbed): T001–T005
- **PR B** (workflow): T006
- **PR C** (CLI): T007–T012
- **PR D** (docs): T013–T014

A and B merge before the post-#322 `build-image`.

## Phase 1: Foundational

- [ ] T001 Add `regions` (eu-west-1, eu-west-2, eu-central-1, us-east-1, in picker order) and `homeRegion` (`eu-west-1`) to `packages/infrastructure/infra-testbed/src/core/constants/testbed-defaults.constant.ts`; `testbedPlan` takes `region` (default `eu-west-1`), refuses one outside the four, derives `home`, and applies the image-build quota refine only when `home`, in `packages/infrastructure/infra-testbed/src/core/functions/testbed-plan.function.ts` and `packages/infrastructure/infra-testbed/src/core/constants/testbed-plan-schema.constant.ts`, with tests in `packages/infrastructure/infra-testbed/src/core/functions/__tests__/testbed-plan.function.test.ts` — covers: FR-001, FR-002, P-002, AC-004 — route: infra

## Phase 2: User Story 2 - The owner adds a region in one step (Priority: P1)

**Goal**: one approved apply per region; one image build reaches every region.

**Independent Test**: under Pulumi mocks, a home stack declares the global resources plus the eu-west-1 pool and a
four-region distribution, and a member stack declares only its pool.

- [ ] T002 [US2] Split `awsTestbed` by role: IAM roles and profiles, bucket and Image Builder only when `plan.home`; the security group, launch template and groups in every stack, with the launch template naming the profile `stackra-testbed-instance` by name in `packages/infrastructure/infra-testbed/src/node/functions/aws-testbed.function.ts` — covers: FR-003, P-003, AC-002 — route: infra — deps: T001
- [ ] T003 [US2] Distribution over `TESTBED_DEFAULTS.regions`, each entry writing `/imagebuilder/stackra-testbed/ami` in its region, and the instance role's autoscaling resource as four region ARNs keeping the group-tag condition in `packages/infrastructure/infra-testbed/src/node/functions/aws-testbed.function.ts` — covers: FR-004, FR-008, P-004, P-008, AC-003 — route: iam — deps: T002
- [ ] T004 [US2] Tests: home versus member resource sets, four distributions, region-scoped launch template AMI, no inbound rule by default, outputs per stack in `packages/infrastructure/infra-testbed/src/node/functions/__tests__/aws-testbed.function.test.ts` — covers: FR-001, FR-003, FR-004, FR-008, P-001, P-003, P-004, P-008, AC-002, AC-003 — route: tests — deps: T003
- [ ] T005 [US2] Read config `region` and pass it to the plan; export the region and group names from every stack in `packages/infrastructure/infra-testbed/pulumi/main.mjs`, plus a changeset in `.changeset/testbed-regions.md` — covers: FR-001, FR-003, AC-002 — route: infra — deps: T002
- [ ] T006 [US2] Add the `region` choice input (the four, default `eu-west-1`), `STACK=testbed-${region}`, concurrency `apply-testbed-${region}`, `pulumi config set region`, a one-time `pulumi stack rename testbed testbed-eu-west-1` when the old stack exists and the new does not, and `build-image` refused outside the home region, in `.github/workflows/apply-testbed.yml` — covers: FR-003, FR-004, AC-002, AC-003 — route: ci-permissions — deps: T005

## Phase 3: User Story 1 - A session runs a check and gets a free box somewhere (Priority: P1)

**Goal**: `stackra testbed run` finds a slot or room across the enabled regions, with a stable exit and JSON contract.

**Independent Test**: with stubbed deps, the eu-west-1 slots busy and eu-west-2 enabled with room, `run` raises
eu-west-2 and runs there; a region not in the list is never called.

- [ ] T007 [P] [US1] `regions` in `packages/developer/cli/src/node/constants/testbed-cli-defaults.constant.ts` (starting `["eu-west-1"]`), `packages/developer/cli/src/node/types/testbed-settings.type.ts` and `packages/developer/cli/src/node/functions/resolve-testbed-settings.function.ts` (`--regions`, then `STACKRA_TESTBED_REGIONS`, then the default; `--region` narrows to one) with tests — covers: FR-006, P-006, AC-005 — route: package
- [ ] T008 [P] [US1] Pure `pickTestbedSlot(regions, state)`: a free slot of the kind in region order, else the first region with room, else wait or busy, in `packages/developer/cli/src/node/functions/pick-testbed-slot.function.ts` with tests in `packages/developer/cli/src/node/functions/__tests__/pick-testbed-slot.function.test.ts` — covers: FR-005, P-005, AC-001 — route: package
- [ ] T009 [US1] Discovery per enabled region in parallel, each box carrying `region`, the SSM proxy and `aws` calls using the box's region, and the picker wired in, in `packages/developer/cli/src/node/functions/run-testbed.function.ts` and `packages/developer/cli/src/node/functions/parse-testbed-boxes.function.ts` — covers: FR-005, FR-006, P-005, P-006, AC-001, AC-005 — route: package — deps: T007, T008
- [ ] T010 [US1] `run --json`: the job's output to stderr, one result line on stdout (`region`, `box`, `slot`, `waitSeconds`, `runSeconds`, `exitCode`), exit codes per FR-010, with tests, in `packages/developer/cli/src/node/functions/run-testbed.function.ts` and `packages/developer/cli/src/node/constants/testbed-command.constant.ts` — covers: FR-010, FR-011, P-010, P-011, AC-006 — route: package — deps: T009

## Phase 4: User Story 3 - The owner sees the whole fleet (Priority: P2)

**Goal**: one view across regions; `scale` and `unlock` act in the right region.

**Independent Test**: with boxes stubbed in two regions, `status --json` lists both with free and total slots; a
failing region is marked unreachable.

- [ ] T011 [US3] `status` and `status --json` across enabled regions (free, total and startable slots per kind; `reachable`) with tests in `packages/developer/cli/src/node/functions/run-testbed.function.ts` — covers: FR-007, FR-012, P-007, P-012, AC-001 — route: package — deps: T009
- [ ] T012 [US3] `scale` and `unlock` take `--region`, defaulting to the named box's region, with tests and a changeset in `.changeset/cli-testbed-regions.md` — covers: FR-009, P-009, AC-005 — route: package — deps: T011

## Phase 5: Polish

- [ ] T013 [P] The runbook: per-region apply, home first, enabling a region, `build-image` home-only, the gate interface, in `apps/docs/src/docs/runbooks/test-infrastructure.mdx` — covers: SC-002, FR-003, AC-002 — route: steward-docs — deps: T006
- [ ] T014 [P] The `test-infra` skill: regions, `--json`, `status --json` and the exit codes in `.agents/skills/test-infra/SKILL.md` — covers: SC-003, FR-010, AC-006 — route: steward-docs — deps: T010

## Dependencies

T001 → T002 → T003 → T004 · T002 → T005 → T006 → T013 · T007, T008 → T009 → T010 → T014 · T009 → T011 → T012.
PR A and PR B gate the next image build. PR C gates the second region joining. PR D follows each.

## Implementation strategy

- **MVP:** US2 (T001–T006). One build reaches every region, and each region applies on its own.
- **Then:** US1 and US3 (T007–T012), so sessions spread across regions.
- **Then:** the docs.

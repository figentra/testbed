<!-- Testbed file contract. Purpose: the index of this repository's GitHub workflows and their rules. Boundary: one row per workflow file in this folder; the files are the source. Runtime: documentation. Governing contract: ADR 0019, ADR 0484, ADR 0522 (figentra/stackra). -->

# `.github/workflows/`

| Workflow            | Runs on                                                                               | Does                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`            | pull requests, pushes to `main`                                                       | **Quality Gate**, the required check: workflow lint (actionlint, zizmor with `.github/zizmor.yml`), install, format check, lint, typecheck, build. Tests run on the box, not on GitHub (STA-2064)                                                                                                                                                                                                    |
| `release.yml`       | pushes to `main`, manual (with dry run)                                               | Calls figentra/stackra's `runway-npm.yml` at a pinned SHA: changesets opens or updates the "version packages" PR; on its merge `@figentra/testbed` is published to `https://registry.figentra.com/` with provenance, one OIDC-exchanged token per package (no stored token), in the `release` environment. Skipped with a notice until the bot App secrets are set                                   |
| `testbed-image.yml` | pull requests touching the images, the toolchain pins or this workflow; daily; manual | Builds the job image, runs the `testbed-images` component's validate commands against it, warms a pnpm store from core's four install files with no environment, empties the home cache as the image's Clean does, fetches offline, and runs a job's install in the job image against that store. No token; advisory, never a required check                                                         |
| `apply-testbed.yml` | manual only, `main`, `testbed` environment (owner approves each run)                  | Builds `@figentra/testbed`, checks out figentra/stackra's install files at `core_ref` (default `main`), signs in to AWS by GitHub OIDC (`TESTBED_DEPLOY_ROLE_ARN`), then `pulumi preview`, `pulumi up` or one image build of the region's `testbed-<region>` stack. Creates a stack only when the owner ticks `new_stack` for a member region ([runbook](../../docs/runbook.md), ADR 0484, ADR 0522) |

## Rules

- Least privilege (ADR 0019 D2): `permissions` at the workflow is empty, and a job asks only for what it needs.
- No token is a repository secret except the release bot App's id and key, which the owner sets. AWS access is GitHub
  OIDC into the deploy role, in the `testbed` environment only.
- Every `uses:` is pinned to a full commit SHA, with the version in a comment; every checkout has
  `persist-credentials: false`.
- The toolchain comes from `mise.toml`, so CI runs the same versions as a contributor.
- `apply-testbed.yml` and `build-image` are dispatched by the owner only; an agent runs `preview` at most.

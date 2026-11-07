# testbed: agent guide

One pnpm workspace, one package: `packages/testbed` (`@figentra/testbed`, binary `testbed`). Published to the Figentra
registry from `.github/workflows/release.yml`. The package's own rules are `packages/testbed/AGENTS.md`; the operator
runbook is `docs/runbook.md`; the box agent's contract is `.agents/specs/sta-1626-testbed/agent-contract.md`.

## Rules

- **AWS changes are the owner's.** `Apply testbed` with `up` or `build-image` is dispatched by the owner only, and the
  `testbed` environment asks the owner to approve every run. An agent may dispatch `preview` and read its output.
  Never run `pulumi up`, `pulumi destroy`, an image build, `docker build` or any AWS write from a workstation.
- **Hashed image inputs are frozen.** Their bytes set the image version, so any change, even a comment, forces an image
  rebuild: `packages/testbed/images/**`, `packages/testbed/src/agent/testbed-agent.sh` and
  `packages/testbed/src/core/constants/toolchain-pins.constant.ts`. Change them only in a change meant to rebuild the
  image. oxfmt and shfmt skip them.
- **Live names stay.** The AWS names (`stackra-testbed-*`, the tag `stackra:testbed`, the AMI parameter
  `/imagebuilder/stackra-testbed/ami`, the Pulumi project `stackra-testbed`, the state bucket) are live resources;
  renaming one replaces it or orphans its state.
- **The interface is frozen.** The verbs and flags, the `run --json` line, `status --json` and the exits 73, 75 and
  124 are what callers (Flow's gate, `ci-box`) depend on; a change updates the agent contract in the same change.
- Tests sit in `__tests__/` beside their subject (`src/**/__tests__/<name>.test.ts`). Typecheck and tests run on a box
  (`testbed run`); the Mac runs only oxfmt and oxlint. Pulumi code is tested under `pulumi.runtime.setMocks` only.
- **Hooks never install or test on a Mac.** Install them with `mise exec lefthook -- lefthook install` (lefthook is
  pinned in `mise.toml`), never through `pnpm install`. `lefthook.yml` runs only mise-pinned tools (oxfmt, oxlint,
  shfmt, gitleaks), never pnpm, since pnpm 12's exec installs the workspace; commitlint runs only where
  `node_modules` already exists, so a Mac skips it. There is no pre-push hook.
- Versions come only from the `pnpm-workspace.yaml` catalogs (`catalog:<name>`), exact, `catalogMode: strict`; the
  toolchain is pinned in `mise.toml`.
- Secrets: names only. Never read, print, log or commit a value; a box decrypts only its job's granted figentra/secrets scopes, in memory.
- Never request or suggest an AWS quota increase without the owner's explicit confirmation.
- Done = `pnpm verify` green. Conventional commits; a `feat`, `fix`, `refactor` or `perf` commit carries
  `Refs: STA-n`. A changeset for every package change.

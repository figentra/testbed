/**
 * Stackra file contract:
 * Purpose: `TOOLCHAIN_PINS`, the one place the testbed's tool versions are written: the job image's Dockerfile
 *          build arguments, the host components and the recipe version all read it. A test checks `node`, `pnpm`,
 *          `sops` and `shfmt` against the repository's `mise.toml`, and `playwright` against the catalogue, so a
 *          bump there that forgets this file fails.
 * Boundary: data only; pure and Pulumi-free.
 * Runtime: isomorphic
 * Governing contract: ADR 0484 (decision 2); ADR 0019 (exact pins); ADR 0174 (supply chain).
 */
/** The tool versions the image installs, kept equal to `mise.toml` and the catalogue. */
export const TOOLCHAIN_PINS = {
  /** `mise.toml` `node`. */
  node: "24.22.0",
  /** `mise.toml` `pnpm`, equal to the root `packageManager`. */
  pnpm: "12.16.1",
  /** `mise.toml` `aqua:getsops/sops` (core's too): the agent decrypts a job's figentra/secrets scopes on the host. */
  sops: "3.10.2",
  /** The Google Cloud CLI on the host: Workload Identity sign-in and `gcloud storage cp` of the ciphertext. */
  gcloud: "592.0.0",
  /** `mise.toml` `shfmt`: `pnpm format:check` (and so `pnpm verify`) runs it over the shell scripts. */
  shfmt: "3.14.1",
  /** `aqua:encoredev/encore` in every product's `mise.toml`; core pins no Encore CLI of its own. */
  encore: "1.58.8",
  /** The `@playwright/test` catalogue entry in `pnpm-workspace.yaml`. */
  playwright: "1.64.1",
  // shortcut: not verified against the mise releases from this workstation; confirm on the first image build.
  /** The mise release the image installs the other tools with. */
  mise: "v2026.10.0",
  /** Postgres for the per-job container and the health check; the tools stack's pinned tag. */
  postgresImage: "postgres:17.6-alpine",
} as const;
